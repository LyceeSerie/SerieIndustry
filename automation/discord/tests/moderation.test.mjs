import test from 'node:test'
import assert from 'node:assert/strict'
import { gasHarness } from './gas-harness.mjs'
import { signEnvelope } from '../worker/src/index.mjs'
import { registerCommands } from '../local/commands.mjs'
import { tick } from '../local/notifier.mjs'

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
  async function editor(field) {
    const start = (await admin('admin_edit_start')).result
    const [, , registrationId, revision, expires, signature] = start.components[0].components[0].custom_id.split(':')
    const fieldIndex = h.context.BandReview.fields.indexOf(field)
    const selected = (await admin('admin_edit_field', { registrationId, revision: Number(revision), expires: Number(expires), confirmation: signature, fieldIndex })).result
    if (!selected.components?.length) return { start, selected }
    const [, , reg, rev, index, exp, sig] = selected.components[0].components[0].custom_id.split(':')
    assert.ok(selected.components[0].components[0].custom_id.length <= 100)
    return { start, selected, ticket: { registrationId: reg, revision: Number(rev), fieldIndex: Number(index), expires: Number(exp), confirmation: sig } }
  }
  return { h, call, vote, admin, actor, confirmation, editor }
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
  assert.deepEqual(requests.map(item => item.options.method), ['GET', 'POST', 'POST', 'POST', 'POST', 'POST'])
  assert.deepEqual(requests.slice(1).map(item => JSON.parse(item.options.body).name), ['band-info', 'band-delete', 'band-restore', 'band-edit', 'band-add'])
  assert.deepEqual(JSON.parse(requests[1].options.body).options.map(option => [option.name, option.required]), [['id', false], ['name', false], ['page', false]])
  assert.equal(JSON.parse(requests[2].options.body).options[0].required, true)
  assert.equal(JSON.parse(requests[3].options.body).options[0].required, true)
  assert.equal(JSON.parse(requests[4].options.body).options[0].required, true)
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

test('fresh double clicks on approved/rejected decisions and on unchanged votes report success without extra dispatch', async () => {
  const { h, call, vote } = fixture()
  await vote(1)
  const repeat = (await vote(1)).result
  assert.match(repeat.message, /すでに投票済み/)
  assert.equal(h.records()[0].votes.length, 1)
  assert.equal(h.books.review.getSheetByName('ReviewVotes').getLastRow(), 2)
  const record = h.records()[0]
  const decision = { action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId }
  await call(decision); await call({ kind: 'flush' })
  const clicks = h.records()[0].votes.length
  const duplicate = (await call(decision)).result
  assert.equal(duplicate.ok, true); assert.equal(duplicate.flush, false); assert.match(duplicate.message, /すでに承認済み/)
  assert.equal((await call({ ...decision, action: 'reject' })).result.ok, true)
  assert.equal(h.records()[0].status, 'approved'); assert.equal(h.records()[0].votes.length, clicks)
  assert.equal(h.state.requests.filter(item => item.url.includes('api.github.com')).length, 1)
})

test('repeated deletion confirmation with a new interaction ID is a no-op, and old deletion cannot remove a restored record', async () => {
  const { h, admin, call, confirmation } = fixture()
  const deletion = confirmation((await admin('admin_preview')).result)
  await admin('admin_delete', deletion); await call({ kind: 'flush' })
  const revision = h.records()[0].revision
  const duplicate = (await admin('admin_delete', deletion)).result
  assert.equal(duplicate.ok, true); assert.equal(duplicate.flush, false); assert.match(duplicate.message, /すでに掲載削除済み/)
  assert.equal(h.records()[0].revision, revision)
  const restore = confirmation((await admin('admin_restore_preview')).result)
  assert.equal((await admin('admin_restore', restore)).result.ok, true)
  assert.equal((await admin('admin_delete', deletion)).result.ok, false)
  assert.equal(h.records()[0].status, 'pending')
})

test('restore republishes only the old approved snapshot while edited data returns to pending', async () => {
  const { h, call, admin, confirmation } = fixture()
  const first = h.records()[0]
  await call({ action: 'approve', registrationId: first.id, revision: first.revision, messageId: first.messageId }); await call({ kind: 'flush' })
  await admin('admin_delete', confirmation((await admin('admin_preview')).result)); await call({ kind: 'flush' })
  h.setResponse('response1', '未承認の変更')
  const restore = confirmation((await admin('admin_restore_preview')).result)
  assert.equal((await admin('admin_restore', restore)).result.ok, true)
  const record = h.records()[0]
  assert.equal(record.status, 'pending'); assert.equal(record.snapshot['活動名'], '未承認の変更')
  assert.equal(record.approvedSnapshot['活動名'], '審査バンド'); assert.equal(record.votes.length, 0)
  await call({ kind: 'flush' })
  const sheet = h.books.public.getSheetById(0)
  const header = sheet.getRange(1, 1, 1, sheet.data[0].length).getValues()[0]
  assert.equal(sheet.getRange(2, header.indexOf('活動名') + 1, 1, 1).getValues()[0][0], '審査バンド')
  const revision = h.records()[0].revision
  const duplicate = (await admin('admin_restore', restore)).result
  assert.equal(duplicate.ok, true); assert.match(duplicate.message, /すでに復元済み/)
  assert.equal(h.records()[0].revision, revision)
})

test('legacy deleted registrations recover approved data from Audit; unapproved registrations stay pending', async () => {
  const { h, admin, call, confirmation } = fixture()
  const record = h.records()[0]
  await call({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId })
  await admin('admin_delete', confirmation((await admin('admin_preview')).result))
  const store = h.context.repository_(h.properties); const legacy = store.all()[0]
  delete legacy.restoreBackup; store.save(legacy)
  assert.equal((await admin('admin_restore', confirmation((await admin('admin_restore_preview')).result))).result.ok, true)
  assert.equal(h.records()[0].status, 'approved')
  assert.equal(h.records()[0].approvedSnapshot['活動名'], '審査バンド')
  const other = fixture()
  await other.admin('admin_delete', other.confirmation((await other.admin('admin_preview')).result))
  assert.equal((await other.admin('admin_restore', other.confirmation((await other.admin('admin_restore_preview')).result))).result.ok, true)
  assert.equal(other.h.records()[0].status, 'pending'); assert.equal(other.h.records()[0].approvedSnapshot, null)
  await other.vote(2)
  const audit = other.h.books.review.getSheetByName('Audit')
  assert.equal(audit.getRange(audit.getLastRow(), 5, 1, 1).getValues()[0][0], other.actor(2))
})

test('restore confirmations are role-, actor-, operation- and revision-bound', async () => {
  const { h, admin, confirmation, actor } = fixture()
  const deletion = confirmation((await admin('admin_preview')).result)
  await admin('admin_delete', deletion)
  const restore = confirmation((await admin('admin_restore_preview')).result)
  assert.equal((await admin('admin_restore', restore, { role: 'moderator' })).result.ok, false)
  assert.equal((await admin('admin_restore', restore, { user: actor(2) })).result.ok, false)
  assert.equal((await admin('admin_restore', deletion)).result.ok, false)
  assert.equal((await admin('admin_restore', { ...restore, expires: restore.expires - 1000 })).result.ok, false)
  assert.equal(h.records()[0].status, 'deleted')
})

test('GAS lock contention has a retryable response and never fabricates a completed vote', async () => {
  const { h, vote } = fixture(); h.state.busy = true
  const result = (await vote(1)).result
  assert.equal(result.ok, false); assert.equal(result.retryable, true); assert.equal(result.code, 'BUSY_RETRY')
  assert.equal(h.records()[0].votes.length, 0)
})

test('emergency editor offers public columns, preserves form answers and persists through maintenance', async () => {
  const { h, editor, admin } = fixture()
  const { start, selected, ticket } = await editor('コメント')
  const options = start.components.flatMap(row => row.components[0].options)
  assert.equal(options.length, 26)
  assert.deepEqual(options.map(option => option.label), Array.from(h.context.BandReview.fields))
  assert.equal(options.some(option => /メール|registrationId/.test(option.label)), false)
  assert.equal(selected.embeds[0].footer.text, 'empty-value')
  assert.equal((await admin('admin_edit_save', { ...ticket, value: '応急のコメント' })).result.ok, true)
  assert.equal(h.records()[0].snapshot['コメント'], '応急のコメント')
  assert.equal(h.records()[0].approvedSnapshot, null)
  assert.equal(h.context.readResponse_(h.form.getResponse('response1'))['コメント'], '')
  const revision = h.records()[0].revision
  h.context.runMaintenance()
  assert.equal(h.records()[0].snapshot['コメント'], '応急のコメント'); assert.equal(h.records()[0].revision, revision)
  assert.equal(h.books.review.getSheetByName('AdminEdits').getLastRow(), 2)
})

test('emergency edit updates only one approved field and keeps other pending changes out of public data', async () => {
  const { h, editor, admin, call, vote } = fixture()
  const first = h.records()[0]
  await call({ action: 'approve', registrationId: first.id, revision: first.revision, messageId: first.messageId }); await call({ kind: 'flush' })
  h.setResponse('response1', '未承認の名前'); h.context.runMaintenance(); await vote(1)
  const { ticket } = await editor('コメント')
  await admin('admin_edit_save', { ...ticket, value: '修正済みコメント' })
  const record = h.records()[0]
  assert.equal(record.status, 'pending'); assert.equal(record.votes.length, 0)
  assert.equal(record.snapshot['活動名'], '未承認の名前')
  assert.equal(record.approvedSnapshot['活動名'], '審査バンド'); assert.equal(record.approvedSnapshot['コメント'], '修正済みコメント')
  await call({ kind: 'flush' })
  assert.equal(h.records()[0].publishStatus, 'dispatched')
})

test('a form change to another field retains the override; a corrected field releases it even when effective content is unchanged', async () => {
  const { h, editor, admin } = fixture()
  await admin('admin_edit_save', { ...(await editor('コメント')).ticket, value: '補正' })
  h.setResponse('response1', '別項目だけ変更'); h.context.runMaintenance()
  assert.equal(h.records()[0].snapshot['コメント'], '補正')
  h.setResponse('response1', '別項目だけ変更', [{ title: 'コメント', value: '補正' }]); h.context.runMaintenance()
  assert.equal(h.records()[0].adminOverrides['コメント'], undefined)
  h.setResponse('response1', '別項目だけ変更'); h.context.runMaintenance()
  assert.equal(h.records()[0].snapshot['コメント'], '')
})

test('emergency editor rejects stale field selections and tickets, and repeated modal submissions are no-ops', async () => {
  const { h, editor, admin } = fixture()
  const { ticket } = await editor('コメント')
  const save = { ...ticket, value: 'one save' }
  assert.equal((await admin('admin_edit_save', save)).result.ok, true)
  const revision = h.records()[0].revision
  assert.match((await admin('admin_edit_save', save)).result.message, /すでに保存済み/)
  assert.equal(h.records()[0].revision, revision); assert.equal(h.books.review.getSheetByName('AdminEdits').getLastRow(), 2)
  assert.equal((await admin('admin_edit_save', { ...save, value: 'old modal changed' })).result.ok, false)
  const next = (await editor('属性')).ticket
  h.setResponse('response1', 'フォームで変更'); h.context.runMaintenance()
  assert.equal((await admin('admin_edit_save', { ...next, value: '別の属性' })).result.ok, false)
})

test('edit tickets are admin-, actor-, field- and expiry-bound; metadata and deleted records cannot be edited', async () => {
  const { h, editor, admin, actor, confirmation } = fixture()
  const { ticket } = await editor('コメント')
  const save = { ...ticket, value: 'unauthorized' }
  assert.equal((await admin('admin_edit_save', save, { role: 'moderator' })).result.ok, false)
  assert.equal((await admin('admin_edit_save', save, { user: actor(2) })).result.ok, false)
  assert.equal((await admin('admin_edit_save', { ...save, fieldIndex: 24 })).result.ok, false)
  assert.equal((await admin('admin_edit_save', { ...save, fieldIndex: 26 })).result.ok, false)
  assert.equal((await admin('admin_edit_save', { ...save, expires: ticket.expires - 1000 })).result.ok, false)
  await admin('admin_delete', confirmation((await admin('admin_preview')).result))
  assert.equal((await admin('admin_edit_save', save)).result.ok, false)
  assert.equal((await admin('admin_edit_start')).result.ok, false)
  assert.equal(h.records()[0].status, 'deleted')
})

test('blank values clear optional fields, but empty names and overlong modal values do not mutate data', async () => {
  const { h, editor, admin } = fixture()
  const nameTicket = (await editor('活動名')).ticket
  const revision = h.records()[0].revision
  assert.equal((await admin('admin_edit_save', { ...nameTicket, value: ' ' })).result.ok, false)
  assert.equal((await admin('admin_edit_save', { ...nameTicket, value: 'x'.repeat(4001) })).result.ok, false)
  assert.equal(h.records()[0].revision, revision)
  await admin('admin_edit_save', { ...(await editor('コメント')).ticket, value: 'comment' })
  assert.equal((await admin('admin_edit_save', { ...(await editor('コメント')).ticket, value: '' })).result.ok, true)
  assert.equal(h.records()[0].snapshot['コメント'], '')
  h.setResponse('response1', '審査バンド', [{ title: 'コメント', value: 'x'.repeat(4001) }]); h.context.runMaintenance()
  const long = await editor('コメント')
  assert.match(long.selected.message, /4000文字を超える/)
  assert.equal(long.ticket, undefined)
})

test('unapproved delete/restore rejects old buttons with revision details, then current local notification can be approved', async () => {
  for (const moderators of [false, true]) {
    const { h, admin, call, confirmation, vote } = fixture()
    h.properties.NOTIFICATION_TRANSPORT = 'local'; h.properties.LOCAL_NOTIFY_SECRET = 'a'.repeat(64)
    const old = h.records()[0]
    await admin('admin_delete', confirmation((await admin('admin_preview')).result))
    await admin('admin_restore', confirmation((await admin('admin_restore_preview')).result))
    const stale = (await call({ action: 'approve', registrationId: old.id, revision: old.revision, messageId: old.messageId })).result
    assert.equal(stale.code, 'STALE_REVIEW'); assert.equal(stale.details.requestedRevision, 1); assert.equal(stale.details.currentRevision, 3)
    assert.equal(stale.details.notificationPending, true)
    const config = { gasUrl: 'https://script.google.com/macros/s/test/exec', guildId: h.properties.DISCORD_GUILD_ID, channelId: h.properties.DISCORD_CHANNEL_ID, applicationId: h.properties.DISCORD_APPLICATION_ID, token: 'fixture-token', secret: h.properties.LOCAL_NOTIFY_SECRET }
    let receipt = null; let sent
    const state = { read: async () => receipt, save: async value => { receipt = value }, clear: async () => { receipt = null } }
    const fetchImpl = async (url, options) => {
      if (url === config.gasUrl) return Response.json(JSON.parse(h.context.doPost({ postData: { contents: options.body } }).text))
      sent = JSON.parse(options.body); return Response.json({ id: old.messageId, author: { id: config.applicationId } })
    }
    await tick(config, state, fetchImpl); await tick(config, state, fetchImpl)
    assert.equal(sent.components[0].components[0].custom_id, 'band:approve:' + old.id + ':3')
    if (moderators) { await vote(1); await vote(2); assert.equal((await vote(3)).result.ok, true) }
    else assert.equal((await call({ action: 'approve', registrationId: old.id, revision: 3, messageId: old.messageId })).result.ok, true)
    assert.equal(h.records()[0].status, 'approved')
  }
})

test('approval after visible local delivery but before ACK reports pending, then succeeds after ACK', async () => {
  const { h, call } = fixture()
  const store = h.context.repository_(h.properties); const record = store.all()[0]
  record.messageId = ''; record.noticeDirty = true; store.save(record)
  h.properties.NOTIFICATION_TRANSPORT = 'local'; h.properties.LOCAL_NOTIFY_SECRET = 'b'.repeat(64)
  const { job } = (await call({ kind: 'local_claim' }, { secret: h.properties.LOCAL_NOTIFY_SECRET })).result
  const action = { action: 'approve', registrationId: record.id, revision: record.revision, messageId: '888888888888888888' }
  const pending = (await call(action)).result
  assert.equal(pending.code, 'NOTIFICATION_PENDING'); assert.equal(h.records()[0].status, 'pending')
  await call({ kind: 'local_ack', registrationId: record.id, jobId: job.id, messageId: action.messageId }, { secret: h.properties.LOCAL_NOTIFY_SECRET })
  assert.equal((await call(action)).result.ok, true)
})

test('unreadable original response has an actionable code without logging external secrets', async () => {
  const { h, vote } = fixture()
  h.form.getResponse = () => { throw new Error('PRIVATE_REMOTE_SECRET') }
  const failed = (await vote(1)).result
  assert.equal(failed.code, 'FORM_RESPONSE_READ_FAILED')
  assert.match(failed.message, /元フォーム/)
  assert.equal(h.state.logs.join('\n').includes('PRIVATE_REMOTE_SECRET'), false)
})

test('member column migrates old public headers and records without resetting existing approval', async () => {
  const { h, call } = fixture()
  const record = h.records()[0]
  await call({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId })
  const store = h.context.repository_(h.properties); const legacy = store.all()[0]
  delete legacy.snapshot['バンドメンバー']; delete legacy.approvedSnapshot['バンドメンバー']
  legacy.hash = h.context.hash_(JSON.stringify(legacy.snapshot)); store.save(legacy)
  const publicSheet = h.books.public.getSheetById(0)
  publicSheet.data[0] = publicSheet.data[0].slice(0, -3); publicSheet.columns = publicSheet.data[0].length
  h.context.runMaintenance()
  assert.equal(h.records()[0].revision, record.revision); assert.equal(h.records()[0].status, 'approved')
  assert.equal(publicSheet.data[0].at(-3), 'バンドメンバー'); assert.equal(publicSheet.data[0].at(-2), '_registrationSource')
  assert.equal(h.records()[0].publishStatus, 'dispatched')
})

test('new members require review, are published after approval, and are available in the second editor menu', async () => {
  const { h, call, admin } = fixture()
  h.setResponse('response1', '審査バンド', [{ title: 'バンドメンバー', value: 'ボーカル|芹井|zerry_furai' }]); h.context.runMaintenance()
  assert.equal(h.records()[0].status, 'pending'); assert.equal(h.records()[0].approvedSnapshot, null)
  const start = (await admin('admin_edit_start')).result
  assert.equal(start.components.length, 2)
  const select = start.components[1].components[0]
  assert.equal(select.options[0].label, 'バンドメンバー'); assert.equal(select.options[0].value, '25')
  const [, , registrationId, revision, expires, signature] = select.custom_id.split(':')
  const chosen = (await admin('admin_edit_field', { registrationId, revision: Number(revision), expires: Number(expires), confirmation: signature, fieldIndex: 25 })).result
  assert.equal(chosen.embeds[0].title, 'バンドメンバー')
  const current = h.records()[0]
  await call({ action: 'approve', registrationId: current.id, revision: current.revision, messageId: current.messageId }); await call({ kind: 'flush' })
  assert.equal(h.books.public.getSheetById(0).data[1].at(-3), 'ボーカル|芹井|zerry_furai')
})

test('member header migration refuses unrelated or conflicting headers without changing sheet data', () => {
  const { h } = fixture(); const sheet = h.books.public.getSheetById(0)
  sheet.data[0][0] = 'unrelated-header'
  const before = JSON.stringify(sheet.data)
  assert.throws(() => h.context.publicSchema_(sheet), /PUBLIC_SCHEMA_MISMATCH/)
  assert.equal(JSON.stringify(sheet.data), before)
})


test('admin JSON batch stays pending, retries safely, publishes source and supports existing edit/delete/restore', async () => {
  const { h, admin, call, confirmation } = fixture()
  const bands = [{ 活動名: '運営バンドA', メインジャンル: 'ロック' }, { 活動名: '運営バンドB', コメント: '追加' }]
  const request = { registrationId: undefined, bands, interactionId: '811111111111111111' }
  const added = await admin('admin_add', request)
  assert.equal(added.result.ok, true)
  assert.equal((await admin('admin_add', request)).result.ok, true)
  let records = h.records().filter(r => r.source === 'admin')
  assert.equal(records.length, 2); assert.ok(records.every(r => r.status === 'pending' && !r.approvedSnapshot))
  h.context.runMaintenance()
  const record = h.records().find(r => r.source === 'admin')
  assert.equal((await call({ action: 'approve', registrationId: record.id, revision: record.revision, messageId: record.messageId })).result.ok, true)
  h.context.runMaintenance()
  const sheet = h.books.public.getSheetById(0)
  assert.equal(sheet.data.find(row => row[0] === record.id).at(-2), 'admin')
  const start = (await admin('admin_edit_start', { registrationId: record.id })).result
  assert.equal(start.ok, true)
  const [, , registrationId, revision, expires, signature] = start.components[0].components[0].custom_id.split(':')
  const fieldIndex = h.context.BandReview.fields.indexOf('コメント')
  const selected = (await admin('admin_edit_field', { registrationId, revision: +revision, expires: +expires, confirmation: signature, fieldIndex })).result
  const [, , reg, rev, index, exp, sig] = selected.components[0].components[0].custom_id.split(':')
  assert.equal((await admin('admin_edit_save', { registrationId: reg, revision: +rev, fieldIndex: +index, expires: +exp, confirmation: sig, value: '運営編集' })).result.ok, true)
  assert.equal(h.records().find(r => r.id === reg).approvedSnapshot['コメント'], '運営編集')
  const preview = (await admin('admin_preview', { registrationId: reg })).result
  assert.equal((await admin('admin_delete', confirmation(preview))).result.ok, true)
  const restore = (await admin('admin_restore_preview', { registrationId: reg })).result
  assert.equal((await admin('admin_restore', confirmation(restore))).result.ok, true)
  assert.equal(h.records().find(r => r.id === reg).source, 'admin')
})

test('batch validates all entries before writes and enforces admin/channel/input limits', async () => {
  const { h, admin } = fixture(); const before = h.records().length
  for (const bands of [[], Array(21).fill({活動名:'x'}), [{活動名:'ok'}, {活動名:''}], [{活動名:'x', _registrationSource:'form'}], [{活動名:['x']}]]) {
    assert.equal((await admin('admin_add', { bands })).result.ok, false)
    assert.equal(h.records().length, before)
  }
  assert.equal((await admin('admin_add', { bands: [{活動名:'x'}] }, {role:'moderator'})).result.ok, false)
  assert.equal((await admin('admin_add', { bands: [{活動名:'x'}] }, {channel:h.properties.DISCORD_CHANNEL_ID})).result.ok, false)
})


test('public metadata retains approved update time while a new form revision is pending', async () => {
  const { h, call } = fixture(); let record = h.records()[0]
  await call({action:'approve', registrationId:record.id, revision:record.revision, messageId:record.messageId})
  h.context.runMaintenance(); record = h.records()[0]
  assert.ok(record.approvedUpdatedAt)
  let rows = h.context.BandReview.publicRows(h.records())
  assert.equal(rows[0].at(-1), '_updatedAt'); assert.equal(rows[1].at(-1), record.approvedUpdatedAt)
  h.context.onBandFormSubmit({source:h.form,response:h.setResponse('response1','新しい未承認名')})
  rows = h.context.BandReview.publicRows(h.records())
  assert.equal(rows[1].at(-1), record.approvedUpdatedAt)
})
