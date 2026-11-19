import test from 'node:test'
import assert from 'node:assert/strict'
import { gasHarness } from './gas-harness.mjs'
import { signEnvelope } from '../worker/src/index.mjs'
import { registerCommands } from '../local/commands.mjs'

function fixture() {
  const h = gasHarness()
  h.properties.DISCORD_COMMAND_CHANNEL_ID = '999999999999999999'
  h.context.initializeIntegration()
  h.context.onBandFormSubmit({ source: h.form, response: h.setResponse('response1', '審査バンド') })
  let sequence = 600000000000000000n
  const actor = index => String(700000000000000000n + BigInt(index))
  async function call(data, { role = 'admin', user = actor(1), channel = h.properties.DISCORD_CHANNEL_ID, secret = h.properties.GAS_HMAC_SECRET } = {}) {
    const input = { actorRole: role, actorId: user, interactionId: String(++sequence), guildId: h.properties.DISCORD_GUILD_ID, channelId: channel, ...data }
    const envelope = await signEnvelope(input, secret)
    const result = JSON.parse(h.context.doPost({ postData: { contents: JSON.stringify(envelope) } }).text)
    return { input, result }
  }
  async function vote(index, action = 'approve', extra = {}) {
    const record = h.records()[0]
    return call({ action, registrationId: record.id, revision: record.revision, messageId: record.messageId, ...extra }, { role: 'moderator', user: actor(index) })
  }
  async function admin(kind, extra = {}, options = {}) {
    return call({ kind, registrationId: h.records()[0].id, ...extra }, { channel: h.properties.DISCORD_COMMAND_CHANNEL_ID, ...options })
  }
  function confirmation(result) {
    const id = result.components[0].components[0].custom_id
    assert.ok(id.length <= 100)
    const [, , registrationId, revision, expires, signature] = id.split(':')
    return { registrationId, revision: Number(revision), expires: Number(expires), confirmation: signature }
  }
  return { h, call, vote, admin, actor, confirmation }
}

test('only the third distinct moderator approval can queue public data and dispatch Actions', async () => {
  const { h, vote, call } = fixture()
  for (const user of [1, 2]) {
    const { result } = await vote(user)
    assert.equal(result.ok, true); assert.equal(result.flush, false)
    assert.equal(h.records()[0].status, 'pending')
    await call({ kind: 'flush' })
    assert.equal(h.state.requests.some(item => item.url.includes('api.github.com')), false)
  }
  const { result } = await vote(3)
  assert.equal(result.flush, true); assert.equal(h.records()[0].status, 'approved')
  await call({ kind: 'flush' })
  assert.equal(h.state.requests.filter(item => item.url.includes('api.github.com')).length, 1)
  assert.equal(h.records()[0].approvedSnapshot['活動名'], '審査バンド')
  assert.equal(h.books.review.getSheetByName('ReviewVotes').getLastRow(), 4)
})

test('duplicate votes do not count twice; votes can change before quorum and old retries cannot revert them', async () => {
  const { h, vote, call } = fixture()
  const first = await vote(1)
  assert.equal((await call(first.input)).result.ok, true)
  await vote(1)
  assert.equal(h.records()[0].votes.length, 1)
  await vote(1, 'reject')
  const last = h.records()[0].votes[0]
  assert.equal(last.action, 'reject')
  assert.equal((await call(first.input)).result.ok, false)
  assert.equal(h.records()[0].votes[0].action, 'reject')
  await vote(2, 'reject'); await vote(3, 'reject')
  assert.equal(h.records()[0].status, 'rejected')
  assert.equal(h.records()[0].approvedSnapshot, null)
})

test('common threshold is inherited; approve and reject overrides can be set independently', async () => {
  const { h, vote } = fixture()
  h.properties.MODERATOR_VOTE_THRESHOLD = '5'
  await vote(1)
  assert.equal(h.records()[0].approveThreshold, 5); assert.equal(h.records()[0].rejectThreshold, 5)
  h.properties.MODERATOR_APPROVE_THRESHOLD = '2'
  await vote(2)
  assert.equal(h.records()[0].status, 'approved'); assert.equal(h.records()[0].rejectThreshold, 5)
  const other = fixture()
  other.h.properties.MODERATOR_VOTE_THRESHOLD = '5'; other.h.properties.MODERATOR_REJECT_THRESHOLD = '1'
  await other.vote(1, 'reject')
  assert.equal(other.h.records()[0].status, 'rejected')
  other.h.properties.MODERATOR_VOTE_THRESHOLD = '0'
  assert.throws(() => other.h.context.settings_(), /INVALID_VOTE_THRESHOLD/)
})

test('admin resolves in one vote; an answer edit resets votes and does not erase last approved content', async () => {
  const { h, vote, call } = fixture()
  await vote(1)
  const record = h.records()[0]
  await call({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId })
  assert.equal(h.records()[0].status, 'approved')
  h.setResponse('response1', '変更後'); h.context.runMaintenance()
  assert.equal(h.records()[0].votes.length, 0)
  assert.equal(h.records()[0].status, 'pending')
  assert.equal(h.records()[0].approvedSnapshot['活動名'], '審査バンド')
  await vote(1, 'reject'); await vote(2, 'reject'); await vote(3, 'reject')
  assert.equal(h.records()[0].status, 'rejected')
  assert.equal(h.records()[0].approvedSnapshot['活動名'], '審査バンド')
})

test('admin deletion requires bound, current, unexpired confirmation; removes listing and never restores via form edits', async () => {
  const { h, admin, call, confirmation, actor } = fixture()
  let record = h.records()[0]
  await call({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId })
  await call({ kind: 'flush' })
  const preview = (await admin('admin_preview')).result
  assert.equal(preview.ok, true); assert.equal(preview.flush, false)
  const confirm = confirmation(preview)
  assert.equal((await admin('admin_delete', confirm, { role: 'moderator' })).result.ok, false)
  assert.equal((await admin('admin_delete', confirm, { user: actor(2) })).result.ok, false)
  assert.equal((await admin('admin_delete', { ...confirm, expires: confirm.expires - 1000 })).result.ok, false)
  assert.equal(h.records()[0].status, 'approved')
  const removed = await admin('admin_delete', confirm)
  assert.equal(removed.result.ok, true)
  assert.equal((await call(removed.input)).result.ok, true) // transport retry, no duplicate removal
  await call({ kind: 'flush' })
  record = h.records()[0]
  assert.equal(record.status, 'deleted'); assert.equal(record.approvedSnapshot, null)
  assert.equal(h.books.public.getSheetById(0).getRange(2, 1, 1, 1).getValues()[0][0], '')
  h.setResponse('response1', '編集しても復活しない'); h.context.runMaintenance()
  assert.equal(h.records()[0].status, 'deleted')
  assert.equal(h.form.getResponses().length, 1)
  assert.equal((await admin('admin_info')).result.ok, true)
  assert.equal((await admin('admin_info', {}, { role: 'moderator' })).result.ok, false)
  assert.equal((await admin('admin_preview', {}, { channel: h.properties.DISCORD_CHANNEL_ID })).result.ok, false)
})

test('form edits invalidate a deletion preview and local-notifier key cannot delete', async () => {
  const { h, admin, confirmation } = fixture()
  h.properties.LOCAL_NOTIFY_SECRET = 'a'.repeat(64)
  const confirm = confirmation((await admin('admin_preview')).result)
  assert.equal((await admin('admin_delete', confirm, { secret: h.properties.LOCAL_NOTIFY_SECRET })).result.ok, false)
  h.setResponse('response1', '確認後に編集')
  assert.equal((await admin('admin_delete', confirm)).result.ok, false)
  assert.equal(h.records()[0].status, 'pending')
})

test('guild command registration verifies bot identity, upserts only named commands and preserves unrelated commands', async () => {
  const requests = []; const logs = []
  const config = { applicationId: '111111111111111111', guildId: '222222222222222222', token: 'fixture-token' }
  await registerCommands(config, async (url, options) => {
    requests.push({ url, options })
    return options.method === 'GET' ? Response.json({ id: config.applicationId, bot: true }) : Response.json({ id: '333333333333333333', name: JSON.parse(options.body).name })
  }, line => logs.push(line))
  assert.deepEqual(requests.map(item => item.options.method), ['GET', 'POST', 'POST'])
  assert.deepEqual(requests.slice(1).map(item => JSON.parse(item.options.body).name), ['band-info', 'band-delete'])
  assert.deepEqual(JSON.parse(requests[1].options.body).options.map(option => [option.name, option.required]), [['id', false], ['name', false], ['page', false]])
  assert.equal(JSON.parse(requests[2].options.body).options[0].required, true)
  assert.equal(logs.join('\n').includes(config.token), false)
  const bad = []
  await assert.rejects(registerCommands(config, async (url, options) => { bad.push(options.method); return Response.json({ id: '999999999999999999', bot: true }) }), /INVALID_COMMAND_BOT/)
  assert.deepEqual(bad, ['GET'])
})

test('name search returns every duplicate with its own ID across pages, then the selected ID can be deleted', async () => {
  const { h, admin, confirmation } = fixture()
  for (let i = 0; i < 7; i++) h.context.onBandFormSubmit({ source: h.form, response: h.setResponse('duplicate' + i, '同名バンド') })
  const ids = h.records().filter(record => record.snapshot['活動名'] === '同名バンド').map(record => record.id)
  const first = (await admin('admin_info', { registrationId: undefined, name: '同名', page: 1 })).result
  const second = (await admin('admin_info', { registrationId: undefined, name: '同名', page: 2 })).result
  assert.match(first.message, /検索結果：7件（1\/2ページ）/)
  assert.equal((first.message.match(/登録ID：/g) || []).length, 5)
  assert.equal((second.message.match(/登録ID：/g) || []).length, 2)
  for (const id of ids) assert.ok((first.message + second.message).includes(id))
  assert.ok(first.message.length <= 2000); assert.ok(second.message.length <= 2000)
  assert.equal(first.flush, false)
  const preview = (await admin('admin_preview', { registrationId: ids[6] })).result
  assert.equal((await admin('admin_delete', confirmation(preview))).result.ok, true)
  assert.equal(h.records().filter(record => record.status === 'deleted').length, 1)
  assert.equal(h.records().find(record => record.id === ids[6]).status, 'deleted')
})

test('name search normalizes full width and case, preserves role checks, handles no results and rejects ambiguous input', async () => {
  const { h, admin } = fixture()
  for (const [index, name] of ['ＡＢＣ Band', 'abc band'].entries()) h.context.onBandFormSubmit({ source: h.form, response: h.setResponse('normalized' + index, name) })
  const query = { registrationId: undefined, name: 'ABC' }
  assert.match((await admin('admin_info', query)).result.message, /検索結果：2件/)
  assert.match((await admin('admin_info', { registrationId: undefined, name: 'missing' })).result.message, /該当する登録はありません/)
  assert.match((await admin('admin_info', { ...query, page: 100 })).result.message, /ページ範囲外/)
  assert.equal((await admin('admin_info', query, { role: 'moderator' })).result.ok, false)
  for (const extra of [{ name: 'ABC' }, { registrationId: undefined, name: ' ' }, { ...query, page: 0 }, { ...query, page: 1.5 }]) assert.equal((await admin('admin_info', extra)).result.ok, false)
  const record = h.records()[0]
  assert.match((await admin('admin_info', { registrationId: record.id.toUpperCase() })).result.message, new RegExp(record.id))
  assert.equal(h.state.requests.some(item => item.url.includes('api.github.com')), false)
})
