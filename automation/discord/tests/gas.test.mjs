import test from 'node:test'
import assert from 'node:assert/strict'
import { gasHarness } from './gas-harness.mjs'
import { signEnvelope } from '../worker/src/index.mjs'

const post = (h, envelope) => JSON.parse(h.context.doPost({ postData: { contents: JSON.stringify(envelope) } }).text)
const input = (h, record) => ({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId, guildId: h.properties.DISCORD_GUILD_ID, channelId: h.properties.DISCORD_CHANNEL_ID, actorId: '444444444444444444', interactionId: '555555555555555555' })

test('maintenance logs Discord HTTP failure and pending counts without response content or credentials', () => {
  const h = gasHarness(); h.context.initializeIntegration()
  h.setResponse('response1', 'PRIVATE_BAND_NAME')
  h.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403, getContentText: () => 'PRIVATE_RESPONSE_BODY' })
  h.context.runMaintenance()
  const logs = h.state.logs.join('\n')
  assert.match(logs, /EXTERNAL_HTTP_403/)
  assert.match(logs, /通知待ち：1、通知失敗：1/)
  assert.equal(h.records()[0].lastError, 'DISCORD_NOTIFY_FAILED')
  for (const value of ['PRIVATE_BAND_NAME', 'PRIVATE_RESPONSE_BODY', h.properties.DISCORD_BOT_TOKEN]) assert.equal(logs.includes(value), false)
})
test('read-only diagnostics isolate a bad form and still check both sheets without exposing secrets', () => {
  const h = gasHarness(); h.properties.FORM_ID = 'incorrect-form'; h.properties.ENABLED = 'false'
  const results = h.context.diagnoseIntegration()
  assert.equal(results[0].ok, false); assert.equal(results[1].ok, true); assert.equal(results[2].ok, true)
  assert.equal(h.state.sheetWrites, 0)
  assert.equal(h.state.requests.length, 0)
  for (const key of ['DISCORD_BOT_TOKEN', 'GAS_HMAC_SECRET', 'GITHUB_TOKEN']) assert.equal(h.state.logs.join('\n').includes(h.properties[key]), false)
  const secret = h.properties.GITHUB_TOKEN
  assert.equal(h.context.safeDiagnosticError_(new Error('remote error ' + secret)).includes(secret), false)
})
test('initialization identifies the exact failing step and validates pasted Google IDs', () => {
  const h = gasHarness(); h.properties.FORM_ID = 'incorrect-form'
  assert.throws(() => h.context.initializeIntegration(), /\[失敗\] フォームを開く（FORM_ID）/)
  assert.equal(h.state.sheetWrites, 0)
  for (const value of ['"form"', 'https://docs.google.com/forms/d/id/edit', ' form ']) assert.throws(() => h.context.googleId_('FORM_ID', value), /IDだけ/)
  assert.throws(() => h.context.googleId_('FORM_ID', '1FAIp-response-id'), /回答用ID/)
})
test('GAS initialization is guarded, uses separate sheets and trigger install is idempotent', () => {
  const h = gasHarness(); h.properties.ENABLED = 'false'
  assert.throws(() => h.context.initializeIntegration(), /DISABLED/)
  h.properties.ENABLED = 'true'; h.context.initializeIntegration(); h.context.installIntegrationTriggers(); h.context.installIntegrationTriggers()
  assert.deepEqual(h.state.triggers, ['onBandFormSubmit', 'runMaintenance'])
  assert.equal(h.books.public.getSheetById(0).getRange(1, 1, 1, 1).getValues()[0][0], '_registrationId')
})
test('GAS rejects bad HMAC before touching sheets, and rejects reused nonces', async () => {
  const h = gasHarness()
  const envelope = await signEnvelope({ kind: 'flush', guildId: h.properties.DISCORD_GUILD_ID, channelId: h.properties.DISCORD_CHANNEL_ID }, h.properties.GAS_HMAC_SECRET)
  assert.equal(post(h, { ...envelope, signature: '00'.repeat(32) }).ok, false)
  assert.equal(h.state.sheetWrites, 0)
  h.context.initializeIntegration()
  assert.equal(post(h, envelope).ok, true)
  assert.equal(post(h, envelope).ok, false)
  const expired = await signEnvelope({}, h.properties.GAS_HMAC_SECRET, Date.now() - 600000)
  assert.equal(post(h, expired).ok, false)
})
test('GAS form → Discord → signed approval → public snapshot → dispatch works with fake external services', async () => {
  const h = gasHarness(); h.context.initializeIntegration()
  const response = h.setResponse('response1', 'テスト', [{ title: 'メールアドレス', value: 'private@example.com' }])
  h.context.onBandFormSubmit({ source: h.form, response })
  const record = h.records()[0]
  assert.equal(record.status, 'pending'); assert.ok(record.messageId)
  const envelope = await signEnvelope(input(h, record), h.properties.GAS_HMAC_SECRET)
  assert.equal(post(h, envelope).ok, true)
  assert.equal(h.books.public.getSheetById(0).getLastRow(), 1)
  const flush = await signEnvelope({ kind: 'flush', guildId: h.properties.DISCORD_GUILD_ID, channelId: h.properties.DISCORD_CHANNEL_ID }, h.properties.GAS_HMAC_SECRET)
  assert.equal(post(h, flush).ok, true)
  const values = h.books.public.getSheetById(0).data
  assert.equal(values[1][0], record.id); assert.equal(values[1][2], 'approved')
  assert.equal(JSON.stringify(values).includes('private'), false)
  assert.equal(h.records()[0].publishStatus, 'dispatched')
  assert.equal(h.state.requests.filter(x => x.url.includes('api.github.com')).length, 1)
})
test('GAS reads the live form before approval, preventing edited snapshots from bypassing review', async () => {
  const h = gasHarness(); h.context.initializeIntegration()
  const response = h.setResponse('r'); h.context.onBandFormSubmit({ source: h.form, response }); const old = h.records()[0]
  h.setResponse('r', 'changed before approval')
  const signed = await signEnvelope(input(h, old), h.properties.GAS_HMAC_SECRET)
  assert.equal(post(h, signed).ok, false)
  assert.equal(h.records()[0].revision, 2)
  assert.equal(h.records()[0].status, 'pending')
  assert.equal(h.books.public.getSheetById(0).getLastRow(), 1)
})
test('periodic GAS retry recovers failed dispatch without publishing pending edits', async () => {
  const h = gasHarness(); h.context.initializeIntegration()
  const response = h.setResponse('r', '=FORMULA'); h.context.onBandFormSubmit({ source: h.form, response })
  assert.equal(post(h, await signEnvelope(input(h, h.records()[0]), h.properties.GAS_HMAC_SECRET)).ok, true)
  h.state.dispatchFail = true
  h.context.runMaintenance(); assert.equal(h.records()[0].publishStatus, 'failed')
  h.setResponse('r', 'unreviewed edit'); h.state.dispatchFail = false; h.context.runMaintenance()
  const values = h.books.public.getSheetById(0).data
  assert.equal(values[1][values[0].indexOf('活動名')], '=FORMULA')
  assert.equal(h.records()[0].status, 'pending'); assert.equal(h.records()[0].publishStatus, 'dispatched')
  assert.equal(h.context.safeCell_('=FORMULA'), "'=FORMULA")
})
test('sheet save locates UUID across blank rows; wrong destination and busy locks cannot decide', async () => {
  const h = gasHarness(); h.context.initializeIntegration()
  const response = h.setResponse('r'); h.context.onBandFormSubmit({ source: h.form, response })
  const sheet = h.books.review.getSheetByName('Registrations'); sheet.data.splice(1, 0, ['', '', ''])
  const record = h.records()[0]
  assert.equal(post(h, await signEnvelope({ ...input(h, record), channelId: '999999999999999999' }, h.properties.GAS_HMAC_SECRET)).ok, false)
  h.state.busy = true
  assert.equal(post(h, await signEnvelope(input(h, record), h.properties.GAS_HMAC_SECRET)).ok, false)
  h.state.busy = false
  assert.equal(post(h, await signEnvelope(input(h, record), h.properties.GAS_HMAC_SECRET)).ok, true)
  assert.equal(sheet.data[1][0], '')
  assert.equal(h.records().length, 1); assert.equal(h.records()[0].status, 'approved')
})
