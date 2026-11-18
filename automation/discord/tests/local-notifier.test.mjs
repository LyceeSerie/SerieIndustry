import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gasHarness } from './gas-harness.mjs'
import { signEnvelope } from '../worker/src/index.mjs'
import { tick, deliver, validateConfig, fileState } from '../local/notifier.mjs'

function setup() {
  const h = gasHarness()
  h.properties.NOTIFICATION_TRANSPORT = 'local'; h.properties.LOCAL_NOTIFY_SECRET = 'a'.repeat(64)
  h.context.initializeIntegration(); h.setResponse('response1'); h.context.runMaintenance()
  const config = { gasUrl: 'https://script.google.com/macros/s/test/exec', guildId: h.properties.DISCORD_GUILD_ID, channelId: h.properties.DISCORD_CHANNEL_ID, applicationId: h.properties.DISCORD_APPLICATION_ID, token: 'test-token', secret: h.properties.LOCAL_NOTIFY_SECRET }
  let saved = null
  const state = { read: async () => saved, save: async value => { saved = value }, clear: async () => { saved = null } }
  async function call(data, secret = config.secret) {
    const payload = { guildId: config.guildId, channelId: config.channelId, ...data }
    const envelope = await signEnvelope(payload, secret)
    return JSON.parse(h.context.doPost({ postData: { contents: JSON.stringify(envelope) } }).text)
  }
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    if (url === config.gasUrl) return Response.json(JSON.parse(h.context.doPost({ postData: { contents: options.body } }).text))
    return Response.json({ id: '888888888888888888', author: { id: config.applicationId } })
  }
  return { h, config, state, call, requests, fetchImpl }
}
test('local queue survives PC downtime, delivers, durably acknowledges and never calls Discord from GAS', async () => {
  const { h, config, state, fetchImpl, requests } = setup()
  assert.equal(h.state.requests.length, 0)
  assert.equal(h.records()[0].noticeDirty, true)
  assert.equal(await tick(config, state, fetchImpl), 'sent')
  assert.equal(h.records()[0].messageId, '')
  assert.equal(await tick(config, state, fetchImpl), 'acknowledged')
  assert.equal(h.records()[0].messageId, '888888888888888888')
  assert.equal(h.records()[0].noticeDirty, false)
  assert.equal(await tick(config, state, fetchImpl), 'idle')
  assert.equal(requests.filter(item => item.url.includes('discord.com')).length, 1)
  assert.equal(h.state.requests.length, 0)
})
test('leases exclude a second claim and expired lease returns identical job and nonce', async () => {
  const { h, call } = setup()
  const first = await call({ kind: 'local_claim' })
  assert.equal((await call({ kind: 'local_claim' })).job, null)
  const store = h.context.repository_(h.properties); const record = store.all()[0]
  record.localDelivery.until = 0; store.save(record)
  const retry = await call({ kind: 'local_claim' })
  assert.deepEqual(retry.job, first.job)
})
test('separate local key cannot approve, worker key cannot claim, bad signature never writes', async () => {
  const { h, call } = setup(); const writes = h.state.sheetWrites
  assert.equal((await call({ kind: 'local_claim' }, h.properties.GAS_HMAC_SECRET)).ok, false)
  assert.equal((await call({ action: 'approve' })).ok, false)
  assert.equal(h.state.sheetWrites, writes)
})
test('edit during delivery retires obsolete posted message before sending new revision', async () => {
  const { h, call } = setup()
  const { job } = await call({ kind: 'local_claim' })
  h.setResponse('response1', 'Updated name'); h.context.runMaintenance()
  const ack = { kind: 'local_ack', registrationId: job.registrationId, jobId: job.id, messageId: '888888888888888888' }
  assert.equal((await call(ack)).ok, true)
  assert.equal((await call(ack)).ok, true)
  assert.equal(h.records()[0].messageId, '')
  const retired = (await call({ kind: 'local_claim' })).job
  assert.equal(retired.kind, 'retired'); assert.equal(retired.messageId, ack.messageId)
  assert.equal(retired.payload.components[0].components.every(item => item.disabled), true)
})
test('saved receipt retries ACK after restart without another Discord request', async () => {
  const { config, state, fetchImpl, requests } = setup()
  await tick(config, state, fetchImpl)
  await assert.rejects(tick(config, state, async () => { throw new Error('private data') }), /GAS_NETWORK_ERROR/)
  assert.ok(await state.read())
  await tick(config, state, fetchImpl)
  assert.equal(requests.filter(item => item.url.includes('discord.com')).length, 1)
})

test('local-delivered message still supports signed approval, site dispatch and button refresh', async () => {
  const { h, config, state, fetchImpl, call } = setup()
  await tick(config, state, fetchImpl); await tick(config, state, fetchImpl)
  const record = h.records()[0]
  const decision = { action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId, actorId: '444444444444444444', interactionId: '555555555555555555' }
  assert.equal((await call(decision, h.properties.GAS_HMAC_SECRET)).ok, true)
  assert.equal((await call({ kind: 'flush' }, h.properties.GAS_HMAC_SECRET)).ok, true)
  assert.equal(h.records()[0].publishStatus, 'dispatched')
  assert.equal(h.state.requests.some(item => item.url.includes('discord.com')), false)
  const refresh = (await call({ kind: 'local_claim' })).job
  assert.equal(refresh.messageId, record.messageId)
  assert.equal(refresh.payload.components[0].components.every(item => item.disabled), true)
})
test('local ACK validates job and message, and an approval while updating keeps display queued', async () => {
  const { h, call } = setup()
  const { job } = await call({ kind: 'local_claim' })
  const ack = { kind: 'local_ack', registrationId: job.registrationId, jobId: job.id, messageId: '888888888888888888' }
  assert.equal((await call({ ...ack, jobId: 'b'.repeat(36) })).ok, false)
  await call(ack)
  const store = h.context.repository_(h.properties); const record = store.all()[0]
  record.noticeDirty = true; store.save(record)
  const updating = (await call({ kind: 'local_claim' })).job
  record.status = 'approved'; store.save(record)
  await call({ ...ack, jobId: updating.id })
  assert.equal(h.records()[0].noticeDirty, true)
})
test('Discord rate limit is sanitized and malicious jobs cannot redirect token or channel', async () => {
  const { config, call } = setup(); const { job } = await call({ kind: 'local_claim' })
  let requests = 0
  await assert.rejects(deliver(config, { ...job, channelId: '999999999999999999' }, () => { requests++ }), /INVALID_NOTIFICATION_JOB/)
  assert.equal(requests, 0)
  await assert.rejects(deliver(config, job, async () => Response.json({ code: 40333, message: 'PRIVATE' }, { status: 403 })), error => error.message === 'DISCORD_HTTP_403_CODE_40333')
  await assert.rejects(deliver(config, job, async () => Response.json({ retry_after: 120, message: 'PRIVATE' }, { status: 429 })), error => error.retryMs === 120000 && !error.message.includes('PRIVATE'))
  assert.throws(() => validateConfig({ ...config, gasUrl: 'https://example.com' }), /INVALID_LOCAL_SETTINGS/)
})
test('durable receipt file can be read by a fresh state instance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'band-notifier-test-'))
  try {
    const state = await fileState(directory)
    const receipt = { registrationId: crypto.randomUUID(), jobId: crypto.randomUUID(), messageId: '888888888888888888' }
    await state.save(receipt)
    const restarted = await fileState(directory)
    assert.deepEqual(await restarted.read(), receipt)
    await restarted.clear(); assert.equal(await state.read(), null)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
