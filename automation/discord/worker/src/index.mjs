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
function editTicket(value) {
  const pick = /^band:editpick[1-5]?:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9]\d{0,8}):(\d{10}):([a-f0-9]{24})$/i.exec(value || '')
  if (pick) return { stage: 'pick', registrationId: pick[1], revision: Number(pick[2]), expires: Number(pick[3]), confirmation: pick[4] }
  const field = /^band:(editopen|editsave):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9]\d{0,8}):(\d{1,2}):(\d{10}):([a-f0-9]{24})$/i.exec(value || '')
  return field && Number(field[4]) < 100 ? { stage: field[1].toLowerCase() === 'editopen' ? 'open' : 'save', registrationId: field[2], revision: Number(field[3]), fieldIndex: Number(field[4]), expires: Number(field[5]), confirmation: field[6] } : null
}
async function validEditTicket(ticket, interaction, env) {
  if (ticket.expires < Date.now() / 1000 || ticket.expires > Date.now() / 1000 + 300) return false
  const purpose = ticket.stage === 'pick' ? 'editpick' : 'edit:' + ticket.fieldIndex
  const text = [purpose, ticket.registrationId, ticket.revision, interaction.member.user.id, interaction.guild_id, interaction.channel_id, ticket.expires].join('\n')
  const key = await crypto.subtle.importKey('raw', enc.encode(env.GAS_HMAC_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(text))).slice(0, 24)
  let different = 0
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ ticket.confirmation.charCodeAt(i)
  return different === 0
}
export async function readBandAttachment(attachment, fetchImpl = fetch) {
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.discordapp.com' || !/^\/attachments\/\d+\/\d+\/[^/]+$/.test(url.pathname) || url.port || url.username || url.password || url.hash) throw new Error('INVALID_IMPORT');
  const result = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!result.ok || Number(result.headers.get('content-length')) > 65536 || !result.body) throw new Error('INVALID_IMPORT');
  const reader = result.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > 65536) throw new Error('INVALID_IMPORT'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const bands = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''));
  if (!Array.isArray(bands) || !bands.length || bands.length > 20) throw new Error('INVALID_IMPORT');
  return bands;
}
async function finish(interaction, command, env, fetchImpl) {
  let message = '[GAS_CONNECTION_FAILED]\nGASへの接続結果を確認できませんでした。\n手順：管理人がWebアプリURL・公開設定・GASとWorker両方の配置結果を確認し、GAS実行履歴で操作が保存済みか確認してから再操作してください。'
  let accepted = false
  let replyComponents = []
  let replyEmbeds = []
  const errors = {
    INVALID_YOUTUBE_URL: 'YouTube動画URLを確認してください。httpsの動画・共有・Shorts・ライブURLが使用できます。チャンネルURLやiframeコードは使用できません。',
    INVALID_IMPORT: 'JSONの形式を確認してください。最上位は配列、1〜20件、項目名は公開項目の正式名、値は文字列です。活動名は必須です。ファイルは64KiB以内にしてください。',
    BUSY_RETRY: '別の操作を処理中です。完了後に通知の状態を確認してください。変わらない場合は少し待って再操作してください。',
    STALE_REVIEW: '復元・編集などで版が変わり、押したボタンが古くなっています。\n手順：ローカル通知プログラムが起動中か確認し、通知が更新されてから、現在の版の「承認／却下」を押してください。',
    NOTIFICATION_PENDING: '通知の送信済み記録がまだ確定していません。\n手順：PC側でsentの後にacknowledgedが出るまで待ち、更新後の通知で再操作してください。止まっている場合はPCのエラーログを確認してください。',
    WRONG_REVIEW_MESSAGE: 'このメッセージは現在の審査対象ではありません。\n手順：同じ登録IDの最新の通知から操作してください。',
    REGISTRATION_DELETED: 'この登録は掲載削除済みです。\n手順：管理人が /band-restore id:登録ID を実行し、復元後に通知が更新されてから承認してください。',
    NOT_FOUND: '登録IDが見つかりません。\n手順：管理人が /band-info name:活動名 で登録IDを確認してください。',
    FORM_RESPONSE_READ_FAILED: '元フォームの回答を読み取れません。\n手順：管理人が元回答の存在、FORM_ID、GAS実行アカウントの編集権限を確認してください。GASのdiagnoseIntegrationでアクセスを確認できます。',
    STALE_VOTE: '以前の投票リクエストです。\n手順：最新の通知で現在の投票先を確認し、変更したい場合だけ再操作してください。',
    STALE_DELETE: '確認後に登録が更新されています。\n手順：band-infoで状態を確認し、削除する場合はband-deleteから確認画面を開き直してください。',
    STALE_RESTORE: '確認後に登録が更新されています。\n手順：band-infoで削除状態を確認し、復元する場合はband-restoreから確認画面を開き直してください。',
    INVALID_DELETE_CONFIRMATION: '削除・復元の確認が期限切れ、または無効です。\n手順：操作した本人が、対応するコマンドから5分以内の新しい確認画面で確定してください。',
    ROLE_REQUIRED: '運営ロールが必要です。\n手順：管理人またはモデレーターロールを付与されているか確認してください。',
    ADMIN_REQUIRED: '管理人専用の操作です。\n手順：管理人に専用チャンネルでの実行を依頼してください。',
    WRONG_DESTINATION: '操作チャンネルが設定と一致しません。\n手順：審査は通知チャンネル、コマンドは管理人用チャンネルで操作し、GASとWorkerの設定も確認してください。',
    INTEGRATION_DISABLED: 'GAS連携が停止しています。\n手順：管理人がGASのスクリプトプロパティENABLED=trueを確認してください。',
    INVALID_SIGNATURE: 'GASが署名を検証できませんでした。\n手順：管理人がGASとWorkerのGAS_HMAC_SECRETが同じ値か確認してください。LOCAL_NOTIFY_SECRETとは別の鍵です。秘密値はチャットに貼らないでください。',
    INVALID_ENVELOPE: 'リクエストの形式または有効期限が無効です。\n手順：GASとWorkerの両方が最新の配置か確認し、Discordからもう一度操作してください。',
    REPLAY: '同じリクエストを再受信したため処理しませんでした。\n手順：通知で現在の状態を確認し、必要な場合だけDiscordから再操作してください。',
    STALE_EDIT: '最新状態が変わったため保存していません。band-editから開き直してください。', INVALID_EDIT_TICKET: '編集画面の期限が切れたか無効です。band-editから開き直してください。', EDIT_UNAVAILABLE: 'この登録は編集できません。登録IDと削除状態を確認してください。', MISSING_BAND_NAME: '活動名は空欄にできません。', INVALID_EDIT: '編集内容の文字数・項目を確認してください。', ANSWER_TOO_LONG: '登録全体の文字数上限を超えるため保存していません。',
  }
  try {
    if (command.kind === 'admin_add') {
      try { command.bands = await readBandAttachment(command.attachment, fetchImpl); delete command.attachment }
      catch { message = '[INVALID_IMPORT]\nJSONを読み込めませんでした。Discord添付の.json（64KiB以内・1〜20件の配列）を確認し、再度実行してください。'; return }
    }
    // A new nonce is used on each transport retry; the interaction ID is stable.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const envelope = await signEnvelope(command, env.GAS_HMAC_SECRET)
        const result = await fetchImpl(env.GAS_WEBAPP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(8000), redirect: 'follow' })
        if (!result.ok) {
          message = '[GAS_HTTP_' + result.status + ']\nGASの接続先からエラーが返りました。\n手順：管理人がWebアプリの/exec URL、公開設定、デプロイの状態を確認してください。'
          throw new Error('GAS transport')
        }
        const data = await result.json()
        if (data?.retryable === true && data.code === 'BUSY_RETRY' && attempt === 0) continue
        accepted = data.ok === true && data.flush !== false
        if (data.ok) message = data.message
        else {
          const known = Object.hasOwn(errors, data.code)
          message = '[' + (known ? data.code : 'OPERATION_REJECTED') + ']\n' + (known ? errors[data.code] : '操作を確認できませんでした。\n手順：管理人がband-infoで状態を確認し、GASの実行履歴とPC側ログを確認してください。このエラーコードを添えて共有してください。')
          if (['STALE_REVIEW', 'NOTIFICATION_PENDING', 'WRONG_REVIEW_MESSAGE', 'REGISTRATION_DELETED'].includes(data.code)) {
            const detail = data.details || {}
            if (Number.isSafeInteger(detail.requestedRevision) && Number.isSafeInteger(detail.currentRevision)) message += '\n押したボタンの版：' + detail.requestedRevision + '／現在の版：' + detail.currentRevision
            if (detail.notificationPending === true) message += '\n通知の更新が保留中です。PC側のacknowledgedを確認してください。'
            if (snowflake(detail.currentMessageId)) message += '\n現在の通知：https://discord.com/channels/' + env.DISCORD_GUILD_ID + '/' + env.DISCORD_CHANNEL_ID + '/' + detail.currentMessageId
          }
        }
        if (data.ok && ['admin_preview', 'admin_restore_preview', 'admin_edit_start', 'admin_edit_field'].includes(command.kind) && Array.isArray(data.components)) replyComponents = data.components
        if (data.ok && command.kind === 'admin_edit_field' && Array.isArray(data.embeds)) replyEmbeds = data.embeds
        break
      } catch { /* Never log URLs, tokens, payloads or external error bodies. */ }
    }
  } finally {
    try {
      await fetchImpl(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: message, components: replyComponents, embeds: replyEmbeds, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(3000),
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
  if (![2, 3, 5].includes(interaction.type)) return ephemeral('この操作には対応していません。')
  if (interaction.guild_id !== env.DISCORD_GUILD_ID || !Array.isArray(interaction.member?.roles) || interaction.member?.user?.bot
    || !snowflake(interaction.id) || !snowflake(interaction.member?.user?.id) || typeof interaction.token !== 'string' || !interaction.token) return ephemeral('このサーバーの運営ロールが必要です。')
  const hasRole = value => (value || '').split(',').map(s => s.trim()).some(role => interaction.member.roles.includes(role))
  const actorRole = hasRole(env.ADMIN_ROLE_IDS) ? 'admin' : hasRole(env.MODERATOR_ROLE_IDS) ? 'moderator' : null
  if (!actorRole) return ephemeral('運営ロールが必要です。')
  const commandChannel = env.DISCORD_COMMAND_CHANNEL_ID || env.DISCORD_CHANNEL_ID
  let action
  if (interaction.type === 2) {
    if (actorRole !== 'admin' || interaction.channel_id !== commandChannel) return ephemeral('このコマンドは専用チャンネルの管理人だけが実行できます。')
    if (interaction.data?.type !== 1 || !['band-info', 'band-delete', 'band-restore', 'band-edit', 'band-add'].includes(interaction.data?.name)) return ephemeral('未対応のコマンドです。')
    if (interaction.data.name === 'band-add') {
      const options = interaction.data.options;
      const option = options?.[0];
      const attachment = interaction.data.resolved?.attachments?.[option?.value];
      if (!Array.isArray(options) || options.length !== 1 || option.name !== 'file' || option.type !== 11 || !attachment || attachment.id !== option.value || typeof attachment.url !== 'string' || !/\.json$/i.test(attachment.filename || '') || !Number.isSafeInteger(attachment.size) || attachment.size < 1 || attachment.size > 65536) return ephemeral('64KiB以内のJSONファイルを添付してください。');
      action = { kind: 'admin_add', attachment: { url: attachment.url } };
    } else {
    const options = interaction.data.options
    if (!Array.isArray(options) || options.length < 1 || options.length > 2) return ephemeral('idまたはnameのどちらか一方を指定してください。')
    const args = {}
    for (const option of options) {
      if (!['id', 'name', 'page'].includes(option.name) || Object.hasOwn(args, option.name) || option.type !== (option.name === 'page' ? 4 : 3)) return ephemeral('検索条件を確認してください。')
      args[option.name] = option.value
    }
    const hasId = Object.hasOwn(args, 'id'); const hasName = Object.hasOwn(args, 'name')
    if (hasId === hasName || (hasId && (typeof args.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.id)))
      || (hasName && (typeof args.name !== 'string' || !args.name.trim() || args.name.trim().length > 100))
      || (Object.hasOwn(args, 'page') && (!hasName || !Number.isSafeInteger(args.page) || args.page < 1 || args.page > 1000000))) return ephemeral('idまたはnameを指定してください。pageは名前検索でのみ使えます。')
    if (interaction.data.name !== 'band-info' && (!hasId || options.length !== 1)) return ephemeral('この操作には検索結果の登録IDを指定してください。')
    action = { kind: interaction.data.name === 'band-info' ? 'admin_info' : interaction.data.name === 'band-restore' ? 'admin_restore_preview' : interaction.data.name === 'band-edit' ? 'admin_edit_start' : 'admin_preview', ...(hasId ? { registrationId: args.id.toLowerCase() } : { name: args.name.trim(), page: args.page || 1 }) }
    }
  } else {
    const edit = editTicket(interaction.data?.custom_id)
    if (edit) {
      if (actorRole !== 'admin' || interaction.channel_id !== commandChannel || !await validEditTicket(edit, interaction, env)) return ephemeral('編集画面の権限または有効期限を確認してください。')
      if (interaction.type === 3 && (!snowflake(interaction.message?.id) || interaction.message?.author?.id !== env.DISCORD_APPLICATION_ID)) return ephemeral('無効な編集画面です。')
      if (edit.stage === 'open' && interaction.type === 3 && interaction.data.component_type === 2) {
        const embed = interaction.message.embeds?.[0]
        if (!embed || typeof embed.title !== 'string' || typeof embed.description !== 'string' || embed.description.length > 4000 || !['current-value', 'empty-value'].includes(embed.footer?.text)) return ephemeral('編集画面をコマンドから開き直してください。')
        return response({ type: 9, data: { title: ('編集：' + embed.title).slice(0, 45), custom_id: interaction.data.custom_id.replace(':editopen:', ':editsave:'), components: [
          { type: 18, label: '新しい内容（空欄でクリア）', description: '送信すると応急編集を保存します。フォームの元回答は変わりません。', component: { type: 4, custom_id: 'value', style: 2, required: false, max_length: 4000, value: embed.footer.text === 'empty-value' ? '' : embed.description } },
        ] } })
      }
      if (edit.stage === 'pick' && interaction.type === 3 && interaction.data.component_type === 3 && Array.isArray(interaction.data.values) && interaction.data.values.length === 1 && /^(?:[0-9]|[1-9][0-9])$/.test(interaction.data.values[0])) {
        action = { ...edit, kind: 'admin_edit_field', fieldIndex: Number(interaction.data.values[0]) }
      } else if (edit.stage === 'save' && interaction.type === 5 && interaction.data.components?.length === 1) {
        const field = interaction.data.components[0].component
        if (field?.type !== 4 || field.custom_id !== 'value' || typeof field.value !== 'string' || field.value.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(field.value)) return ephemeral('編集内容を確認してください。')
        action = { ...edit, kind: 'admin_edit_save', value: field.value }
      } else return ephemeral('無効な編集操作です。')
    } else {
      if (interaction.type !== 3) return ephemeral('無効な入力画面です。')
      if (!snowflake(interaction.message?.id) || interaction.message?.author?.id !== env.DISCORD_APPLICATION_ID) return ephemeral('無効なボタンです。')
      const deletion = /^band:(delete|restore):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9]\d{0,8}):(\d{10}):([a-f0-9]{24})$/i.exec(interaction.data?.custom_id || '')
      if (deletion && interaction.data.component_type === 2) {
        if (actorRole !== 'admin' || interaction.channel_id !== commandChannel) return ephemeral('掲載削除・復元は専用チャンネルの管理人だけが確定できます。')
        action = { kind: 'admin_' + deletion[1].toLowerCase(), registrationId: deletion[2], revision: Number(deletion[3]), expires: Number(deletion[4]), confirmation: deletion[5] }
      } else {
        action = parseButton(interaction.data)
        if (!action || interaction.channel_id !== env.DISCORD_CHANNEL_ID) return ephemeral('無効な審査ボタンまたはチャンネルです。')
      }
    }
  }
  const command = { ...action, actorRole, interactionId: interaction.id, actorId: interaction.member.user.id, guildId: interaction.guild_id, channelId: interaction.channel_id, messageId: interaction.message?.id }
  ctx.waitUntil(finish(interaction, command, env, fetchImpl))
  return ['admin_delete', 'admin_restore'].includes(command.kind) ? response({ type: 6 }) : response({ type: 5, data: { flags: 64 } })
}
export default { fetch: handleRequest }
