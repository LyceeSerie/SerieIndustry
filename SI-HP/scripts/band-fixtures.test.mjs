import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import { parseBands } from './band-data.mjs'
import { sourceConfig } from './band-source.mjs'
import { fixtureValues } from './test-band-fixtures.mjs'
import { matchesBand, getSubgenreOptions } from '../src/band-filter.mjs'

const bands = parseBands(Papa.unparse(fixtureValues))
const row = code => bands.find(b => b.name.startsWith(code))
const search = filters => bands.filter(b => matchesBand(b, filters))
test('AND limits subgenre candidates by main genre; OR and no main genre show all', () => {
  const all = getSubgenreOptions(bands)
  assert.equal(all.includes('ジャズ'), true)
  assert.deepEqual(getSubgenreOptions(bands, 'その他'), ['ポストロック'])
  assert.deepEqual(getSubgenreOptions(bands, 'その他', 'OR'), all)
  assert.deepEqual(getSubgenreOptions(bands, '', 'AND'), all)
  assert.deepEqual(getSubgenreOptions(bands, '存在しないジャンル'), [])
})
test('genre AND/OR combines only specified genre conditions and preserves other filters', () => {
  assert.equal(search({ genre: 'その他', sub: 'ジャズ' }).length, 0)
  assert.deepEqual(search({ genre: 'その他', sub: 'ジャズ', genreMode: 'OR' }).map(b => b.name), [row('TC10').name, row('TC18').name])
  assert.equal(search({ genre: 'その他', sub: 'ジャズ', genreMode: 'OR', status: 'active' })[0].name, row('TC10').name)
  assert.equal(search({ genreMode: 'OR' }).length, 20)
  assert.equal(search({ genre: 'その他', genreMode: 'OR' }).length, 1)
  assert.equal(search({ sub: 'ジャズ', genreMode: 'OR' }).length, 1)
  assert.equal(search({ genre: 'その他', sub: 'ポストロック' }).length, 1)
})
test('actual page search matches names, reading, English and width/case variants', () => {
  assert.equal(search({}).length, 20)
  for (const query of ['てすとばんど', 'test alpha', 'ＴＥＳＴ ＡＬＰＨＡ']) assert.equal(search({ query })[0].name, row('TC01').name)
  assert.equal(search({ query: 'fullwidth' })[0].name, row('TC17').name)
  assert.equal(search({ query: '該当しない検索' }).length, 0)
})
test('activity filter includes only active answers, not inactive or unknown', () => {
  assert.equal(search({ status: 'active' }).length, 15)
  assert.equal(search({ status: 'active' }).some(b => b.activityStatus !== 'active'), false)
  assert.equal(search({}).length, 20)
})
test('search combines fields with AND and platform selections with OR', () => {
  assert.equal(search({ platforms: ['Cluster'] }).length, 2)
  assert.equal(search({ platforms: ['VRChat', 'Cluster'] }).length, 19)
  assert.equal(search({ platforms: ['Cluster'], status: 'active', genre: 'ジャズ／フュージョン', style: 'カバー', type: '楽器ソロ', sub: 'ジャズ' })[0].name, row('TC10').name)
  assert.equal(search({ genre: 'ジャズ' }).length, 0)
  assert.equal(search({ style: 'カバー' }).length, 2)
  assert.equal(search({ query: 'TC07', status: 'active' }).length, 0)
})
test('production and test never share a sheet or output directory', () => {
  assert.notEqual(sourceConfig().url, sourceConfig(true).url)
  assert.notEqual(sourceConfig().directory, sourceConfig(true).directory)
  assert.equal(sourceConfig().environment, 'production')
  assert.match(sourceConfig(true).url, /1DzdgqNtbOWJ6PAF1QusKWaeD-vmw7pfLBOJr-8WUiXI/)
})
test('21 spreadsheet cases produce 20 public bands and never publish private fields', () => {
  assert.equal(bands.length, 20)
  assert.equal(JSON.stringify(bands).includes('private-'), false)
  assert.equal(JSON.stringify(bands).includes('タイムスタンプ'), false)
  assert.equal(JSON.stringify(bands).includes('テストケース'), false)
})
test('all five logo layouts and missing/unknown values', () => {
  for (const [code, layout] of [['TC01', 'separate'], ['TC02', 'top-left'], ['TC03', 'bottom-left'], ['TC04', 'top-right'], ['TC05', 'bottom-right'], ['TC06', 'separate'], ['TC09', 'separate'], ['TC18', 'separate']]) assert.equal(row(code).logoLayout, layout)
})
test('activity states distinguish active, dissolved, paused and missing', () => {
  assert.equal(row('TC01').activityStatus, 'active')
  assert.equal(row('TC07').activityStatus, 'inactive')
  assert.equal(row('TC08').activityStatus, 'inactive')
  assert.equal(row('TC09').activityStatus, 'unknown')
  assert.equal(row('TC18').activityStatus, 'unknown')
})
test('multiple categories and delimiters preserve compound genre names', () => {
  assert.deepEqual(row('TC10').platforms, ['VRChat', 'Cluster'])
  assert.deepEqual(row('TC10').genres, ['ポップ', 'ロック', 'ジャズ／フュージョン', 'ヒップホップ／ラップ'])
  assert.deepEqual(row('TC10').styles, ['オリジナル', 'カバー'])
  assert.equal(row('TC10').subgenres.filter(x => x === 'ジャズ').length, 1)
})
test('missing images, malformed links, line breaks and HTML-like comments', () => {
  assert.equal(row('TC11').photo, null)
  assert.equal(row('TC12').logo, null)
  assert.equal(row('TC13').icon, null)
  assert.equal(row('TC14').photo, null)
  assert.deepEqual(row('TC16').links, [])
  assert.match(row('TC01').comment, /\n/)
  assert.match(row('TC17').comment, /<script>/)
  assert.equal(row('TC17').links.length, 0)
  assert.equal(row('TC01').links.length, 8)
  assert.match(row('TC19').logo.url, /id=test_logo_id/)
})

test('recruitment and attributes use OR within each field and AND between fields', () => {
  const band = { ...row('TC01'), recruitingParts: ['ベース', 'ドラム'], attributes: ['男性ボーカル'] };
  assert.equal(matchesBand(band, { recruitingParts: ['ギター', 'ベース'], attributes: ['男性ボーカル'] }), true);
  assert.equal(matchesBand(band, { recruitingParts: ['ベース'], attributes: ['インスト'] }), false);
  assert.equal(matchesBand(band, { recruitingParts: ['__none__'] }), false);
  assert.equal(matchesBand({ ...band, recruitingParts: [] }, { recruitingParts: ['__none__'] }), true);
  assert.equal(matchesBand(row('TC20'), { recruitingParts: ['__none__'] }), true);
  assert.equal(matchesBand(row('TC01'), { attributes: ['インスト'] }), false);
});

test('sheet fixtures cover recruitment selection, attributes OR and combined filters', () => {
  assert.deepEqual(search({ recruitingParts: ['ベース'] }).map(b => b.name.slice(0,4)), ['TC01', 'TC02', 'TC05']);
  assert.equal(search({ recruitingParts: ['__none__'] }).length, 11);
  assert.deepEqual(search({ attributes: ['男性ボーカル', 'インスト'] }).map(b => b.name.slice(0,4)), ['TC01', 'TC03', 'TC04', 'TC06', 'TC07']);
  assert.deepEqual(search({ recruitingParts: ['ベース'], attributes: ['女性ボーカル'] }).map(b => b.name.slice(0,4)), ['TC02', 'TC05']);
  assert.deepEqual(row('TC04').recruitingParts, ['ピアノ', 'サックス']);
  assert.deepEqual(row('TC05').recruitingParts, ['ベース', 'シンセ', 'フルート']);
  assert.deepEqual(row('TC09').attributes, []);
});
