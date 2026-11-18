import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { sourceConfig } from './band-source.mjs'
import { parseBands } from './band-data.mjs'

const url = 'https://docs.google.com/spreadsheets/d/approved-test-id/export?format=csv&gid=0'
const id = '12345678-1234-4234-8234-123456789abc'
const headers = ['_registrationId', '_approvedRevision', '_reviewStatus', '活動名', '活動形態１', 'メインジャンル']
const csv = rows => Papa.unparse([headers, ...rows])
test('moderated source is explicit, validated and never silently falls back', () => {
  assert.throws(() => sourceConfig(false, { VRC_BAND_DB_REQUIRE_APPROVED: 'true' }), /未設定/)
  const config = sourceConfig(false, { VRC_BAND_DB_APPROVED_SHEET_URL: url })
  assert.equal(config.approvedOnly, true); assert.equal(config.url, url)
  for (const bad of ['http://docs.google.com/a', 'https://example.com/a', `${url}&token=secret`, url.replace('https://', 'https://user:password@')]) assert.throws(() => sourceConfig(false, { VRC_BAND_DB_APPROVED_SHEET_URL: bad }))
  assert.equal(sourceConfig(true, { VRC_BAND_DB_APPROVED_SHEET_URL: url }).approvedOnly, false)
})
test('only approved snapshots enter JSON; fixed IDs survive row reordering', () => {
  const approved = [id, '2', 'approved', '承認済み', 'バンド', 'ロック']
  const pending = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1', 'pending', '未承認', 'バンド', 'ポップ']
  const rejected = ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '1', 'rejected', '却下', 'バンド', 'ポップ']
  const a = parseBands(csv([approved, pending, rejected]), { approvedOnly: true })
  const b = parseBands(csv([rejected, pending, approved]), { approvedOnly: true })
  assert.deepEqual(a, b); assert.equal(a.length, 1); assert.equal(a[0].id, id)
  assert.equal(JSON.stringify(a).includes('_reviewStatus'), false)
})
test('missing approval schema, invalid revision and duplicate UUID stop the import', () => {
  assert.throws(() => parseBands('活動名,活動形態１,メインジャンル\na,b,c', { approvedOnly: true }), /承認用/)
  for (const row of [[id, '0', 'approved', 'a', 'b', 'c'], ['row-1', '1', 'approved', 'a', 'b', 'c']]) assert.throws(() => parseBands(csv([row]), { approvedOnly: true }), /不正/)
  const row = [id, '1', 'approved', 'a', 'b', 'c']
  assert.throws(() => parseBands(csv([row, row]), { approvedOnly: true }), /重複/)
  assert.deepEqual(parseBands(csv([]), { approvedOnly: true }), [])
})
