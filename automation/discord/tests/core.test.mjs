import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const context = vm.createContext({})
vm.runInContext(readFileSync(new URL('../gas/Core.gs', import.meta.url), 'utf8'), context)
const core = context.BandReview
const plain = value => JSON.parse(JSON.stringify(value))
const snap = (name = 'テスト') => core.snapshot([
  { title: '活動名', value: name }, { title: '活動形態１', value: 'バンド' }, { title: 'メインジャンル', value: ['ロック', 'ポップ'] },
])
function harness() {
  const data = new Map()
  const state = { sends: [], patches: [], rows: null, dispatches: 0, failPublish: false, failDispatch: false, failSend: false }
  const store = { all: () => [...data.values()].map(plain), save: record => data.set(record.id, plain(record)) }
  const service = core.service(store, {
    uuid: randomUUID, hash: value => createHash('sha256').update(value).digest('hex'),
    send(payload, key) { if (state.failSend) throw Error('network'); state.sends.push({ payload: plain(payload), key }); return '123456789012345678'; },
    patch(id, payload) { state.patches.push({ id, payload: plain(payload) }); },
    publish(rows) { if (state.failPublish) throw Error('network'); state.rows = plain(rows); },
    dispatch() { if (state.failDispatch) throw Error('network'); state.dispatches++; },
  })
  const submit = (responseId = 'response1', content = snap()) => { const r = service.ingest(responseId, content, '2026-11-18'); service.notify(); return store.all().find(x => x.id === r.id); }
  const command = (record, action = 'approve') => ({ action, registrationId: record.id, revision: record.revision, messageId: record.messageId, interactionId: '222222222222222222', actorId: '333333333333333333', guildId: '444444444444444444', channelId: '555555555555555555' })
  return { store, service, state, submit, command }
}
test('canonical public allowlist keeps reading, multi-selects and upload IDs but drops private columns', () => {
  const result = core.snapshot([
    { title: '活動名', value: 'バンド' }, { title: '活動形態１', value: 'バンド' }, { title: 'メインジャンル', value: ['ロック', 'ポップ'] },
    { title: '活動名（英語）\n説明', value: 'Test' }, { title: '活動名（よみがな）※ひらがなで入力', value: 'ばんど' },
    { title: 'アイコン（256x256）', value: ['file-id'], fileUpload: true }, { title: 'メールアドレス', value: 'private@example.com' },
    { title: '未知の列', value: 'private' },
  ])
  assert.equal(result['活動名'], 'バンド')
  assert.equal(result['活動名（英語）'], 'Test')
  assert.equal(result['活動名（よみがな）※ひらがなで入力'], 'ばんど')
  assert.equal(result['メインジャンル'], 'ロック, ポップ')
  assert.match(result['アイコン'], /file\/d\/file-id\/view$/)
  assert.equal(JSON.stringify(result).includes('private'), false)
  assert.throws(() => core.snapshot([{ title: '活動名', value: 'a' }]), /MISSING_FORM_FIELD/)
  assert.throws(() => snap('a'.repeat(13000)), /ANSWER_TOO_LONG/)
})
test('new responses are durable pending records, never public; duplicate events send once', () => {
  const h = harness(); const record = h.submit()
  h.submit()
  assert.equal(h.store.all().length, 1)
  assert.equal(h.state.sends.length, 1)
  assert.equal(record.status, 'pending')
  assert.equal(h.service.publish(), false)
  assert.equal(core.publicRows(h.store.all()).length, 1)
  assert.equal(h.state.dispatches, 0)
  assert.deepEqual(h.state.sends[0].payload.allowed_mentions, { parse: [] })
  assert.ok(h.state.sends[0].payload.components[0].components.every(x => !x.disabled))
})
test('approval publishes a stable UUID snapshot before dispatch; duplicate interaction is idempotent', () => {
  const h = harness(); const r = h.submit(); const c = h.command(r)
  h.service.decide(c, 'now'); h.service.decide(c, 'now'); h.service.publish(); h.service.notify(); h.service.publish()
  assert.equal(h.state.dispatches, 1)
  assert.equal(h.state.rows[1][0], r.id)
  assert.equal(h.state.rows[1][2], 'approved')
  assert.equal(h.store.all()[0].publishStatus, 'dispatched')
  assert.ok(h.state.patches.at(-1).payload.components[0].components.every(x => x.disabled))
})
test('rejecting a new submission does not publish or dispatch', () => {
  const h = harness(); const r = h.submit()
  h.service.decide(h.command(r, 'reject'), 'now'); h.service.publish()
  assert.equal(core.publicRows(h.store.all()).length, 1)
  assert.equal(h.state.dispatches, 0)
})
test('answer edits create a new review, keep last approved snapshot, invalidate old buttons', () => {
  const h = harness(); const r = h.submit(); h.service.decide(h.command(r), 'now'); h.service.publish()
  const changed = h.submit('response1', snap('未審査の変更'))
  assert.equal(changed.id, r.id); assert.equal(changed.revision, 2); assert.equal(changed.status, 'pending')
  const columns = plain(core.publicRows(h.store.all()))
  assert.equal(columns[1][columns[0].indexOf('活動名')], 'テスト')
  assert.throws(() => h.service.decide(h.command(r), 'now'), /STALE_REVIEW/)
  const reject = { ...h.command(changed, 'reject'), interactionId: '666666666666666666' }
  h.service.decide(reject, 'now')
  assert.equal(core.publicRows(h.store.all())[1][columns[0].indexOf('活動名')], 'テスト')
  assert.equal(h.state.patches[0].payload.components[0].components[0].disabled, true)
})
test('a conflicting second moderator cannot override a completed decision', () => {
  const h = harness(); const r = h.submit(); h.service.decide(h.command(r), 'now')
  assert.throws(() => h.service.decide({ ...h.command(r, 'reject'), interactionId: '777777777777777777' }, 'now'), /ALREADY_REVIEWED/)
  assert.equal(h.store.all()[0].status, 'approved')
})
test('notification and publish failures retain retry state and do not duplicate approved rows', () => {
  const h = harness(); h.state.failSend = true; const r = h.submit()
  assert.equal(h.store.all()[0].noticeDirty, true)
  h.state.failSend = false; h.service.notify()
  h.service.decide(h.command(h.store.all()[0]), 'now')
  h.state.failPublish = true; assert.equal(h.service.publish(), false); assert.equal(h.state.dispatches, 0)
  h.state.failPublish = false; h.state.failDispatch = true; assert.equal(h.service.publish(), false)
  assert.equal(h.store.all()[0].publishStatus, 'failed')
  h.state.failDispatch = false; assert.equal(h.service.publish(), true)
  assert.equal(h.state.rows.length, 2)
  assert.equal(h.store.all()[0].id, r.id)
})
