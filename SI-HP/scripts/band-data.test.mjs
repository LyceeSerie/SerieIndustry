import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBands, splitTags, otherLink, webUrl, activityStatus, logoLayout } from './band-data.mjs'

test('logo placement follows the five form options and defaults to separate', () => {
  assert.equal(logoLayout('アー写に重ねない'), 'separate')
  assert.equal(logoLayout(''), 'separate')
  assert.equal(logoLayout('未知'), 'separate')
  for (const [label, result] of [['左上', 'top-left'], ['左下', 'bottom-left'], ['右上', 'top-right'], ['右下', 'bottom-right']]) assert.equal(logoLayout(`アー写に重ねる ${label}`), result)
})

test('activity status distinguishes inactive and missing answers', () => {
  assert.equal(activityStatus('活動中'), 'active')
  assert.equal(activityStatus('解散/活動停止中（休止含む）'), 'inactive')
  assert.equal(activityStatus('休止中'), 'inactive')
  assert.equal(activityStatus(''), 'unknown')
})

test('multiple main genres become separate tags without splitting compound genre names', () => {
  const bands = parseBands('活動名,活動形態１,メインジャンル\nテスト,バンド,"ポップ, ロック, ジャズ／フュージョン, ヒップホップ／ラップ, ロック"\n')
  assert.deepEqual(bands[0].genres, ['ポップ', 'ロック', 'ジャズ／フュージョン', 'ヒップホップ／ラップ'])
  assert.equal(bands[0].genres.includes('ロック'), true)
})

test('subgenres accept the delimiters described by the form', () => {
  assert.deepEqual(splitTags('ロック、ポップ,ジャズ フォーク/メタル\nロック'), ['ロック', 'ポップ', 'ジャズ', 'フォーク', 'メタル'])
})
test('named links preserve URL colons and handle bare URLs and contact mail', () => {
  assert.deepEqual(otherLink('HP：https://example.com/a', 1), { label: 'HP', url: 'https://example.com/a' })
  assert.equal(otherLink('https://example.com', 5).label, 'その他リンク5')
  assert.equal(otherLink('mail:contact@example.com', 1).url, 'mailto:contact@example.com')
  assert.equal(otherLink('HP:javascript:alert(1)', 1), null)
  assert.equal(webUrl('data:text/html,test'), '')
})
test('CSV handles multiline headers, ignores private columns and normalizes social handles', () => {
  const csv = 'タイムスタンプ,メールアドレス,活動名,活動形態１,メインジャンル,"サブジャンル\n説明","SNSリンク（Youtube）\n説明",ロゴ（1024x512px程度）\n2026/10/22,private@example.com,テスト,バンド,ロック,"ポストロック、ポップ",@test,https://drive.google.com/open?id=abc123\n'
  const bands = parseBands(csv)
  assert.equal(bands.length, 1)
  assert.deepEqual(bands[0].subgenres, ['ポストロック', 'ポップ'])
  assert.equal(bands[0].links[0].url, 'https://www.youtube.com/@test')
  assert.match(bands[0].logo.url, /thumbnail\?id=abc123/)
  assert.equal(JSON.stringify(bands).includes('private@example.com'), false)
  assert.equal(JSON.stringify(bands).includes('2026/10/22'), false)
})
test('invalid source pages fail instead of silently erasing the directory', () => {
  assert.throws(() => parseBands('<html>Sign in</html>'), /必要な列/)
  assert.throws(() => parseBands('活動名,活動形態１,メインジャンル\n"broken'), /CSV/)
  assert.deepEqual(parseBands('活動名,活動形態１,メインジャンル\n,,\n'), [])
})

 test('recruitment and attributes preserve checkbox labels and support old sheets', () => {
  const [band] = parseBands('活動名,活動形態１,メインジャンル,募集パート（未選択でなし）,属性\nテスト,バンド,ロック,"ボーカル（男性）, ベース, ベース","男性ボーカル, インスト"');
  assert.deepEqual(band.recruitingParts, ['ボーカル（男性）', 'ベース']);
  assert.deepEqual(band.attributes, ['男性ボーカル', 'インスト']);
  const [old] = parseBands('活動名,活動形態１,メインジャンル\n旧登録,バンド,ロック');
  assert.deepEqual(old.recruitingParts, []);
  assert.deepEqual(old.attributes, []);
});

test('attributes with the form description share free-text tag delimiters', () => {
  const [band] = parseBands('活動名,活動形態１,メインジャンル,"属性\n※その他に複数入力する場合はカンマ/句読点/空白/スラッシュのどれかで区切ってください"\nテスト,バンド,ロック,"女性ボーカル,男女混声、ツインボーカル。コーラスあり 打ち込み併用/生演奏／インスト　女性ボーカル"');
  assert.deepEqual(band.attributes, ['女性ボーカル', '男女混声', 'ツインボーカル', 'コーラスあり', '打ち込み併用', '生演奏', 'インスト']);
});

test('both Other fields strip prefixes before shared splitting and deduplication', () => {
  const [band] = parseBands('活動名,活動形態１,メインジャンル,"募集パート（未選択でなし）\n※その他は区切って入力",属性\nテスト,バンド,ロック,"ベース, その他: ピアノ/サックス　ベース。フルート","男性ボーカル, その他： コーラス/混声、男性ボーカル"');
  assert.deepEqual(band.recruitingParts, ['ベース', 'ピアノ', 'サックス', 'フルート']);
  assert.deepEqual(band.attributes, ['男性ボーカル', 'コーラス', '混声']);
  const [empty] = parseBands('活動名,活動形態１,メインジャンル,募集パート,属性\n空,バンド,ロック,その他：,その他:');
  assert.deepEqual(empty.recruitingParts, []);
  assert.deepEqual(empty.attributes, []);
  const [plain] = parseBands('活動名,活動形態１,メインジャンル,募集パート,属性\n通常,バンド,ロック,その他,名前その他:保持');
  assert.deepEqual(plain.recruitingParts, ['その他']);
  assert.deepEqual(plain.attributes, ['名前その他:保持']);
});

test('shared tag parser removes Other prefixes for all free-text tag fields', () => {
  assert.deepEqual(splitTags('その他： ギター/ベース, その他: ドラム、ギター'), ['ギター', 'ベース', 'ドラム']);
  const [band] = parseBands('活動名,活動形態１,メインジャンル,サブジャンル\nテスト,バンド,ロック,"その他： ポストロック/シューゲイザー"');
  assert.deepEqual(band.subgenres, ['ポストロック', 'シューゲイザー']);
});

test('platforms preserve slashes inside option names', () => {
  const [band] = parseBands('活動名,活動形態１,メインジャンル,活動プラットフォーム\nテスト,バンド,ロック,"VRChat, 音源/動画のみ, Cluster, 音源/動画のみ"');
  assert.deepEqual(band.platforms, ['VRChat', '音源/動画のみ', 'Cluster']);
  assert.deepEqual(splitTags('音源/動画のみ'), ['音源', '動画のみ']);
});
