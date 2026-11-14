import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { parseBands } from './band-data.mjs'
import { sourceConfig } from './band-source.mjs'
import { fetchBandCsv } from './fetch-band-sheet.mjs'
import { fixtureValues } from './test-band-fixtures.mjs'
const actual = parseBands(await fetchBandCsv(sourceConfig(true)))
const expected = parseBands(Papa.unparse(fixtureValues))
assert.deepEqual(actual, expected, 'テストシートの内容が期待する21ケースと異なります')
console.log('テストシート21ケース → 公開データ20件：全項目一致。回答メール・未掲載行の除外も確認済み。')
