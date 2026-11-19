import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, createHmac } from 'node:crypto'
import { handleRequest, signEnvelope } from '../worker/src/index.mjs'

const keys = generateKeyPairSync('ed25519')
const env = {
  DISCORD_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
  DISCORD_APPLICATION_ID: '111111111111111111', DISCORD_GUILD_ID: '222222222222222222', DISCORD_CHANNEL_ID: '333333333333333333', ADMIN_ROLE_IDS: '444444444444444444', MODERATOR_ROLE_IDS: '888888888888888888', DISCORD_COMMAND_CHANNEL_ID: '999999999999999999',
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/test-deployment/exec', GAS_HMAC_SECRET: 'unit-test-only-'.repeat(4),
}
const id = '12345678-1234-4234-8234-123456789abc'
const interaction = () => ({ type: 3, id: '555555555555555555', application_id: env.DISCORD_APPLICATION_ID, token: 'test-only-token', guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_CHANNEL_ID,
  member: { roles: [env.ADMIN_ROLE_IDS], user: { id: '666666666666666666' } }, message: { id: '777777777777777777', author: { id: env.DISCORD_APPLICATION_ID } }, data: { component_type: 2, custom_id: `band:approve:${id}:1` } })
function request(data, stamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(data)
  const signature = sign(null, Buffer.from(stamp + body), keys.privateKey).toString('hex')
  return new Request('https://worker.example/interactions', { method: 'POST', headers: { 'X-Signature-Timestamp': stamp, 'X-Signature-Ed25519': signature }, body })
}
const noIO = () => { throw new Error('Unexpected external I/O') }
test('valid Discord PING succeeds; unsigned, expired and malformed signatures do nothing', async () => {
  assert.deepEqual(await (await handleRequest(request({ type: 1 }), env, {}, noIO)).json(), { type: 1 })
  assert.deepEqual(await (await handleRequest(request({ type: 1, application_id: env.DISCORD_APPLICATION_ID }), env, {}, noIO)).json(), { type: 1 })
  assert.equal((await handleRequest(request({ type: 1, application_id: '999999999999999999' }), env, {}, noIO)).status, 401)
  assert.equal((await handleRequest(new Request('https://worker.example/interactions', { method: 'POST', body: '{}' }), env, {}, noIO)).status, 401)
  assert.equal((await handleRequest(request(interaction(), '1000000000'), env, {}, noIO)).status, 401)
  const tampered = request(interaction()); tampered.headers.set('X-Signature-Ed25519', '00'.repeat(64))
  assert.equal((await handleRequest(tampered, env, {}, noIO)).status, 401)
})
test('wrong guild, channel, role, app, message author and invalid buttons cannot invoke GAS', async () => {
  for (const mutate of [d => d.guild_id = '999999999999999999', d => d.channel_id = '999999999999999999', d => d.member.roles = [], d => d.member.user.bot = true, d => d.application_id = '999999999999999999', d => d.message.author.id = '999999999999999999', d => d.data.custom_id = `band:delete:${id}:1`, d => d.data.custom_id = `band:approve:${id}:0`]) {
    const data = interaction(); mutate(data)
    const result = await handleRequest(request(data), env, { waitUntil: noIO }, noIO)
    assert.ok(result.status === 401 || (await result.json()).type === 4)
  }
})
test('a valid button defers immediately; authenticated GAS review and flush are background work', async () => {
  const tasks = []; const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({ ok: true, message: 'queued' })
  }
  const result = await handleRequest(request(interaction()), env, { waitUntil: promise => tasks.push(promise) }, fakeFetch)
  assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } })
  await Promise.all(tasks)
  assert.equal(calls.length, 3)
  const signed = JSON.parse(calls[0].body)
  assert.equal(signed.signature, createHmac('sha256', env.GAS_HMAC_SECRET).update(`${signed.timestamp}\n${signed.nonce}\n${signed.payload}`).digest('hex'))
  assert.equal(JSON.parse(signed.payload).registrationId, id)
  assert.equal(JSON.parse(calls[1].body).content, 'queued')
  assert.equal(JSON.parse(JSON.parse(calls[2].body).payload).kind, 'flush')
})
test('GAS transport errors are retried but never echo tokens or raw error data', async () => {
  const tasks = []; const calls = []
  await handleRequest(request(interaction()), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
    calls.push({ url, ...options })
    if (url === env.GAS_WEBAPP_URL) throw Error('PRIVATE_TOKEN_PRIVATE_PAYLOAD')
    return Response.json({})
  })
  await Promise.all(tasks)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].body.includes('PRIVATE'), false)
  assert.notEqual(JSON.parse(calls[0].body).nonce, JSON.parse(calls[1].body).nonce)
})
test('HMAC signs UTF-8 payloads without cross-runtime normalization', async () => {
  const envelope = await signEnvelope({ text: '承認／却下\nテスト' }, env.GAS_HMAC_SECRET)
  assert.equal(envelope.signature, createHmac('sha256', env.GAS_HMAC_SECRET).update(`${envelope.timestamp}\n${envelope.nonce}\n${envelope.payload}`).digest('hex'))
})

test('moderators are signed as moderators; admin role takes priority and an uncompleted vote never flushes', async () => {
  for (const [roles, expectedRole] of [[[env.MODERATOR_ROLE_IDS], 'moderator'], [[env.MODERATOR_ROLE_IDS, env.ADMIN_ROLE_IDS], 'admin']]) {
    const data = interaction(); data.member.roles = roles
    const tasks = []; const calls = []
    const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
      calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'vote recorded' })
    })
    assert.equal((await result.json()).type, 5); await Promise.all(tasks)
    assert.equal(calls.length, 2)
    assert.equal(JSON.parse(JSON.parse(calls[0].options.body).payload).actorRole, expectedRole)
  }
})

test('slash commands and delete confirmation reject moderators, wrong channels and other bots without GAS calls', async () => {
  const slash = () => ({ ...interaction(), type: 2, channel_id: env.DISCORD_COMMAND_CHANNEL_ID, data: { type: 1, name: 'band-delete', options: [{ type: 3, name: 'id', value: id }] } })
  for (const mutate of [d => d.member.roles = [env.MODERATOR_ROLE_IDS], d => d.channel_id = env.DISCORD_CHANNEL_ID, d => d.guild_id = '999999999999999998', d => d.data.options[0].value = 'invalid', d => d.data.name = 'band-restore']) {
    const data = slash(); mutate(data)
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
  for (const mutate of [d => d.member.roles = [env.MODERATOR_ROLE_IDS], d => d.channel_id = env.DISCORD_CHANNEL_ID, d => d.message.author.id = '999999999999999998']) {
    const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
    data.data.custom_id = `band:delete:${id}:1:${Math.floor(Date.now() / 1000) + 300}:${'a'.repeat(24)}`
    mutate(data)
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
})

test('admin deletion preview returns only an ephemeral confirmation and does not flush', async () => {
  const data = interaction(); data.type = 2; data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { type: 1, name: 'band-delete', options: [{ type: 3, name: 'id', value: id }] }
  const tasks = []; const calls = []
  const components = [{ type: 1, components: [{ type: 2, style: 4, custom_id: 'confirmation', label: 'delete' }] }]
  const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
    calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'confirm?', components })
  })
  assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } }); await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_preview'); assert.equal(command.actorRole, 'admin')
  assert.equal(calls.length, 2)
  assert.deepEqual(JSON.parse(calls[1].options.body).components, components)
})

test('confirmed admin delete flushes in notification channel rather than command channel', async () => {
  const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data.custom_id = `band:delete:${id}:1:${Math.floor(Date.now() / 1000) + 300}:${'a'.repeat(24)}`
  const tasks = []; const calls = []
  await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, message: 'removed', flush: true }) })
  await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_delete'); assert.equal(command.channelId, env.DISCORD_COMMAND_CHANNEL_ID)
  const flush = JSON.parse(JSON.parse(calls[2].options.body).payload)
  assert.equal(flush.kind, 'flush'); assert.equal(flush.channelId, env.DISCORD_CHANNEL_ID)
})
