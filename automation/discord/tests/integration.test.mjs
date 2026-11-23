import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { gasHarness } from './gas-harness.mjs'
import { handleRequest } from '../worker/src/index.mjs'
import { parseBands } from '../../../SI-HP/scripts/band-data.mjs'

test('signed Discord action crosses the real Worker and GAS code and yields approved-only site JSON', async () => {
  const h = gasHarness(); h.context.initializeIntegration()
  const answer = h.setResponse('test-response', '連携テスト', [{ title: '属性', value: ['男性ボーカル', 'インスト'] }])
  h.context.onBandFormSubmit({ source: h.form, response: answer })
  const record = h.records()[0]
  const keys = generateKeyPairSync('ed25519')
  const env = {
    DISCORD_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
    DISCORD_APPLICATION_ID: h.properties.DISCORD_APPLICATION_ID, DISCORD_GUILD_ID: h.properties.DISCORD_GUILD_ID,
    DISCORD_CHANNEL_ID: h.properties.DISCORD_CHANNEL_ID, ADMIN_ROLE_IDS: '444444444444444444', MODERATOR_ROLE_IDS: '888888888888888888', DISCORD_COMMAND_CHANNEL_ID: '999999999999999999',
    GAS_WEBAPP_URL: 'https://script.google.com/macros/s/test/exec', GAS_HMAC_SECRET: h.properties.GAS_HMAC_SECRET,
  }
  const data = {
    type: 3, id: '555555555555555555', application_id: env.DISCORD_APPLICATION_ID, token: 'test-interaction-token',
    guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_CHANNEL_ID,
    member: { user: { id: '666666666666666666' }, roles: [env.ADMIN_ROLE_IDS] },
    message: { id: record.messageId, author: { id: env.DISCORD_APPLICATION_ID } },
    data: { component_type: 2, custom_id: `band:approve:${record.id}:1` },
  }
  const body = JSON.stringify(data); const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex')
  const request = new Request('https://worker.example/interactions', { method: 'POST', body, headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': signature } })
  const tasks = []
  const response = await handleRequest(request, env, { waitUntil: promise => tasks.push(promise) }, async (url, options) => {
    if (url === env.GAS_WEBAPP_URL) return new Response(h.context.doPost({ postData: { contents: options.body } }).text, { headers: { 'Content-Type': 'application/json' } })
    assert.match(url, /^https:\/\/discord\.com\/api\/v10\/webhooks\//)
    return Response.json({})
  })
  assert.equal((await response.json()).type, 5)
  await Promise.all(tasks)
  const rows = h.books.public.getSheetById(0).data
  const csv = rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n')
  const bands = parseBands(csv, { approvedOnly: true })
  assert.equal(bands.length, 1)
  assert.equal(bands[0].id, record.id)
  assert.equal(bands[0].name, '連携テスト')
  assert.deepEqual(bands[0].attributes, ['男性ボーカル', 'インスト'])
  assert.equal(h.records()[0].publishStatus, 'dispatched')
  assert.equal(h.state.requests.filter(call => call.url.includes('api.github.com')).length, 1)
})

test('signed edit command, field selection, immediate modal and submit cross the real Worker/GAS implementations', async () => {
  const h = gasHarness(); h.properties.DISCORD_COMMAND_CHANNEL_ID = '999999999999999999'; h.context.initializeIntegration()
  h.context.onBandFormSubmit({ source: h.form, response: h.setResponse('edit-response', '応急編集テスト', [{ title: 'コメント', value: '元コメント' }]) })
  const keys = generateKeyPairSync('ed25519')
  const env = { DISCORD_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'), DISCORD_APPLICATION_ID: h.properties.DISCORD_APPLICATION_ID,
    DISCORD_GUILD_ID: h.properties.DISCORD_GUILD_ID, DISCORD_CHANNEL_ID: h.properties.DISCORD_CHANNEL_ID, DISCORD_COMMAND_CHANNEL_ID: h.properties.DISCORD_COMMAND_CHANNEL_ID,
    ADMIN_ROLE_IDS: '444444444444444444', MODERATOR_ROLE_IDS: '888888888888888888', GAS_WEBAPP_URL: 'https://script.google.com/macros/s/test/exec', GAS_HMAC_SECRET: h.properties.GAS_HMAC_SECRET }
  let sequence = 600000000000000000n
  async function invoke(type, data, message) {
    const interaction = { type, id: String(++sequence), application_id: env.DISCORD_APPLICATION_ID, token: 'test-only-token', guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_COMMAND_CHANNEL_ID,
      member: { roles: [env.ADMIN_ROLE_IDS], user: { id: '666666666666666666' } }, data, ...(message ? { message } : {}) }
    const body = JSON.stringify(interaction); const timestamp = String(Math.floor(Date.now() / 1000))
    const request = new Request('https://worker.example/interactions', { method: 'POST', headers: { 'X-Signature-Timestamp': timestamp, 'X-Signature-Ed25519': sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex') }, body })
    const tasks = []; const replies = []
    const result = await handleRequest(request, env, { waitUntil: promise => tasks.push(promise) }, async (url, options) => {
      if (url === env.GAS_WEBAPP_URL) return Response.json(JSON.parse(h.context.doPost({ postData: { contents: options.body } }).text))
      assert.match(url, /^https:\/\/discord\.com\/api\/v10\/webhooks\//)
      replies.push(JSON.parse(options.body)); return Response.json({})
    })
    await Promise.all(tasks)
    return { result: await result.json(), replies }
  }
  const first = await invoke(2, { type: 1, name: 'band-edit', options: [{ type: 3, name: 'id', value: h.records()[0].id }] })
  const menu = first.replies[0].components[0].components[0]
  const sourceMessage = { id: '777777777777777777', author: { id: env.DISCORD_APPLICATION_ID } }
  const selected = await invoke(3, { component_type: 3, custom_id: menu.custom_id, values: [menu.options.find(option => option.label === 'コメント').value] }, sourceMessage)
  const preview = selected.replies[0]
  assert.equal(preview.embeds[0].description, '元コメント')
  const opened = await invoke(3, { component_type: 2, custom_id: preview.components[0].components[0].custom_id }, { ...sourceMessage, embeds: preview.embeds })
  assert.equal(opened.result.type, 9); assert.equal(opened.replies.length, 0)
  assert.equal(opened.result.data.components[0].component.value, '元コメント')
  const saved = await invoke(5, { custom_id: opened.result.data.custom_id, components: [{ type: 18, component: { type: 4, custom_id: 'value', value: '修正版' } }] })
  assert.match(saved.replies[0].content, /応急編集を保存/)
  h.context.runMaintenance()
  assert.equal(h.records()[0].snapshot['コメント'], '修正版')
  assert.equal(h.records()[0].approvedSnapshot, null)
  assert.equal(h.context.readResponse_(h.form.getResponse('edit-response'))['コメント'], '元コメント')
})
