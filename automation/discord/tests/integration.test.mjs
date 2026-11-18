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
    DISCORD_CHANNEL_ID: h.properties.DISCORD_CHANNEL_ID, ALLOWED_ROLE_IDS: '444444444444444444',
    GAS_WEBAPP_URL: 'https://script.google.com/macros/s/test/exec', GAS_HMAC_SECRET: h.properties.GAS_HMAC_SECRET,
  }
  const data = {
    type: 3, id: '555555555555555555', application_id: env.DISCORD_APPLICATION_ID, token: 'test-interaction-token',
    guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_CHANNEL_ID,
    member: { user: { id: '666666666666666666' }, roles: [env.ALLOWED_ROLE_IDS] },
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
