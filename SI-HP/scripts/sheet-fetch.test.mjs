import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchBandCsv } from './fetch-band-sheet.mjs'
import { sourceConfig } from './band-source.mjs'

test('both sources fetch public CSV without credentials', async () => {
  for (const testMode of [false, true]) {
    const config = sourceConfig(testMode)
    const csv = await fetchBandCsv(config, { fetchImpl: async (url, options) => {
      assert.equal(url, config.url)
      assert.equal(options.headers, undefined)
      assert.ok(options.signal)
      return new Response('活動名,活動形態１,メインジャンル\nテスト,バンド,ロック')
    } })
    assert.match(csv, /テスト/)
  }
})
test('permission errors and network failures stop the import', async () => {
  await assert.rejects(fetchBandCsv(sourceConfig(), { fetchImpl: async () => new Response('', { status: 403 }) }), /403/)
  await assert.rejects(fetchBandCsv(sourceConfig(), { fetchImpl: async () => { throw new Error('offline') } }), /接続できません/)
})
test('login pages are rejected rather than treated as CSV', async () => {
  await assert.rejects(fetchBandCsv(sourceConfig(), { fetchImpl: async () => new Response('<!doctype html><html>ログイン</html>') }), /HTML/)
})
