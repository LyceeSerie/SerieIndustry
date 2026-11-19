const enc = new TextEncoder()
const MAX_BODY = 65536
const snowflake = value => typeof value === 'string' && /^\d{10,25}$/.test(value)
const response = (data, status = 200) => Response.json(data, { status })
const ephemeral = message => response({ type: 4, data: { content: message, flags: 64, allowed_mentions: { parse: [] } } })
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
function unhex(value, length) {
  if (typeof value !== 'string' || value.length !== length * 2 || !/^[a-f0-9]+$/i.test(value)) throw new Error('Invalid hex')
  return Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16))
}
export async function signEnvelope(payload, secret, now = Date.now()) {
  const timestamp = Math.floor(now / 1000)
  const nonce = crypto.randomUUID()
  const data = JSON.stringify(payload)
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}\n${nonce}\n${data}`)))
  return { timestamp, nonce, payload: data, signature }
}
export async function verifyDiscord(request, body, publicKey, now = Date.now(), onFailure = () => {}) {
  const stamp = request.headers.get('X-Signature-Timestamp') || ''
  if (!/^\d{10,12}$/.test(stamp)) { onFailure('missing_or_invalid_timestamp'); return false }
  if (Math.abs(now / 1000 - Number(stamp)) > 300) { onFailure('expired_timestamp'); return false }
  try {
    const key = await crypto.subtle.importKey('raw', unhex(publicKey, 32), 'Ed25519', false, ['verify'])
    const signature = unhex(request.headers.get('X-Signature-Ed25519'), 64)
    const valid = await crypto.subtle.verify('Ed25519', key, signature, enc.encode(stamp + body))
    if (!valid) onFailure('signature_mismatch_check_public_key')
    return valid
  } catch { onFailure('invalid_signature_or_public_key'); return false }
}
export function parseButton(data) {
  const match = /^band:(approve|reject):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9]\d{0,8})$/i.exec(data?.custom_id || '')
  return match && data.component_type === 2 ? { action: match[1], registrationId: match[2], revision: Number(match[3]) } : null
}
function configured(env) {
  const adminRoles = (env.ADMIN_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  const moderatorRoles = (env.MODERATOR_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  return snowflake(env.DISCORD_APPLICATION_ID) && snowflake(env.DISCORD_GUILD_ID) && snowflake(env.DISCORD_CHANNEL_ID)
    && snowflake(env.DISCORD_COMMAND_CHANNEL_ID || env.DISCORD_CHANNEL_ID)
    && adminRoles.length && adminRoles.every(snowflake) && moderatorRoles.length && moderatorRoles.every(snowflake)
    && /^[a-f0-9]{64}$/i.test(env.DISCORD_PUBLIC_KEY || '')
    && (env.GAS_HMAC_SECRET || '').length >= 32 && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.GAS_WEBAPP_URL || '')
}
async function finish(interaction, command, env, fetchImpl) {
  let message = '処理を確認できませんでした。運営の審査管理シートを確認してください。'
  let accepted = false
  let replyComponents = []
  try {
    // A new nonce is used on each transport retry; the interaction ID is stable.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const envelope = await signEnvelope(command, env.GAS_HMAC_SECRET)
        const result = await fetchImpl(env.GAS_WEBAPP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(8000), redirect: 'follow' })
        if (!result.ok) throw new Error('GAS transport')
        const data = await result.json()
        accepted = data.ok === true && data.flush !== false
        message = data.ok ? data.message : '操作は確定できませんでした。最新版・権限・審査状態を確認してください。'
        if (data.ok && command.kind === 'admin_preview' && Array.isArray(data.components)) replyComponents = data.components
        break
      } catch { /* Never log URLs, tokens, payloads or external error bodies. */ }
    }
  } finally {
    try {
      await fetchImpl(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, components: replyComponents, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(3000),
      })
    } catch { /* GAS owns durable review and retry state even if this reply fails. */ }
  }
  if (accepted) {
    try {
      const envelope = await signEnvelope({ kind: 'flush', guildId: command.guildId, channelId: env.DISCORD_CHANNEL_ID }, env.GAS_HMAC_SECRET)
      await fetchImpl(env.GAS_WEBAPP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(8000), redirect: 'follow' })
    } catch { /* Periodic GAS maintenance retries the durable outbox. */ }
  }
}
export async function handleRequest(request, env, ctx, fetchImpl = fetch) {
  const rejected = (reason, status) => {
    // No request body, headers, tokens, user IDs or secret values in diagnostics.
    console.warn(JSON.stringify({ event: 'discord_endpoint_rejected', reason, status }))
    return new Response(status === 503 ? 'Configuration required' : 'Unauthorized', { status })
  }
  if (new URL(request.url).pathname !== '/interactions') return new Response('Not found', { status: 404 })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!configured(env)) return rejected('configuration_incomplete', 503)
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return new Response('Too large', { status: 413 })
  const body = await request.text()
  if (enc.encode(body).length > MAX_BODY) return new Response('Too large', { status: 413 })
  let signatureFailure = 'signature_failed'
  if (!await verifyDiscord(request, body, env.DISCORD_PUBLIC_KEY, Date.now(), reason => { signatureFailure = reason })) return rejected(signatureFailure, 401)
  let interaction
  try { interaction = JSON.parse(body) } catch { return new Response('Bad request', { status: 400 }) }
  if (!interaction || typeof interaction !== 'object') return new Response('Bad request', { status: 400 })
  // The application-specific public key already authenticates a validation PING.
  // Accept a minimal signed PING; if an application ID is supplied, it must match.
  if (interaction.type === 1) {
    if (interaction.application_id && interaction.application_id !== env.DISCORD_APPLICATION_ID) return rejected('wrong_application_id', 401)
    console.log(JSON.stringify({ event: 'discord_endpoint_ping_ok' }))
    return response({ type: 1 })
  }
  if (interaction.application_id !== env.DISCORD_APPLICATION_ID) return rejected('wrong_application_id', 401)
  if (![2, 3].includes(interaction.type)) return ephemeral('この操作には対応していません。')
  if (interaction.guild_id !== env.DISCORD_GUILD_ID || !Array.isArray(interaction.member?.roles) || interaction.member?.user?.bot
    || !snowflake(interaction.id) || !snowflake(interaction.member?.user?.id) || typeof interaction.token !== 'string' || !interaction.token) return ephemeral('このサーバーの運営ロールが必要です。')
  const hasRole = value => (value || '').split(',').map(s => s.trim()).some(role => interaction.member.roles.includes(role))
  const actorRole = hasRole(env.ADMIN_ROLE_IDS) ? 'admin' : hasRole(env.MODERATOR_ROLE_IDS) ? 'moderator' : null
  if (!actorRole) return ephemeral('運営ロールが必要です。')
  const commandChannel = env.DISCORD_COMMAND_CHANNEL_ID || env.DISCORD_CHANNEL_ID
  let action
  if (interaction.type === 2) {
    if (actorRole !== 'admin' || interaction.channel_id !== commandChannel) return ephemeral('このコマンドは専用チャンネルの管理人だけが実行できます。')
    if (interaction.data?.type !== 1 || !['band-info', 'band-delete'].includes(interaction.data?.name)) return ephemeral('未対応のコマンドです。')
    const options = interaction.data.options
    if (!Array.isArray(options) || options.length !== 1 || options[0].name !== 'id' || options[0].type !== 3 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options[0].value || '')) return ephemeral('通知に表示された登録IDを指定してください。')
    action = { kind: interaction.data.name === 'band-info' ? 'admin_info' : 'admin_preview', registrationId: options[0].value }
  } else {
    if (!snowflake(interaction.message?.id) || interaction.message?.author?.id !== env.DISCORD_APPLICATION_ID) return ephemeral('無効なボタンです。')
    const deletion = /^band:delete:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9]\d{0,8}):(\d{10}):([a-f0-9]{24})$/i.exec(interaction.data?.custom_id || '')
    if (deletion && interaction.data.component_type === 2) {
      if (actorRole !== 'admin' || interaction.channel_id !== commandChannel) return ephemeral('掲載削除は専用チャンネルの管理人だけが確定できます。')
      action = { kind: 'admin_delete', registrationId: deletion[1], revision: Number(deletion[2]), expires: Number(deletion[3]), confirmation: deletion[4] }
    } else {
      action = parseButton(interaction.data)
      if (!action || interaction.channel_id !== env.DISCORD_CHANNEL_ID) return ephemeral('無効な審査ボタンまたはチャンネルです。')
    }
  }
  const command = { ...action, actorRole, interactionId: interaction.id, actorId: interaction.member.user.id, guildId: interaction.guild_id, channelId: interaction.channel_id, messageId: interaction.message?.id }
  ctx.waitUntil(finish(interaction, command, env, fetchImpl))
  return command.kind === 'admin_delete' ? response({ type: 6 }) : response({ type: 5, data: { flags: 64 } })
}
export default { fetch: handleRequest }
