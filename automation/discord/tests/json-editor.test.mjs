import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const html = readFileSync(new URL('../tools/band-json-editor.html', import.meta.url), 'utf8')
const context = vm.createContext({ TextEncoder, URL })
vm.runInContext(html.match(/<script id="editor-core">([\s\S]*?)<\/script>/)[1], context)
vm.runInContext(readFileSync(new URL('../gas/Core.gs', import.meta.url), 'utf8'), context)
const editor = context.BandEditor
const plain = value => JSON.parse(JSON.stringify(value))
const requiredValues = {'活動名':'テスト','活動形態１':'バンド','活動形態２':'オリジナル','活動形態３':'活動中','活動プラットフォーム':'VRChat','メインジャンル':'ロック','アイコン':'https://example.com/icon.png','アー写':'https://example.com/photo.png','SNSリンク（X/Twitter）':'@test_band','コメント':'コメント','活動時間帯':'金曜夜'}
const validBand = overrides => ({...editor.blank(),...requiredValues,...overrides})
const complete = band => ({...band,...Object.fromEntries(Object.entries(requiredValues).map(([key,value])=>[key,band[key]||value]))})

test('editor fields match the actual GAS allowlist and exported batches round-trip without losing values', () => {
  assert.deepEqual(plain(editor.fields), plain(context.BandReview.fields))
  const sample = readFileSync(new URL('../examples/追加バンド.json', import.meta.url), 'utf8')
  const imported = editor.parseImport(sample).map(complete)
  const text = editor.output(imported)
  assert.deepEqual(plain(editor.parseImport(text)), plain(imported))
  for (const band of JSON.parse(text)) {
    const entries = editor.fields.map(title => ({ title, value: band[title] || '' }))
    assert.equal(context.BandReview.snapshot(entries)['活動名'], band['活動名'])
  }
  const custom = editor.parseImport('[{"活動名":"<script>test</script>","活動形態１":"未知の形態","活動プラットフォーム":"音源/動画のみ","コメント":"改行\\n内容"}]')
  assert.equal(editor.parseImport(editor.output(custom.map(complete)))[0]['活動プラットフォーム'], '音源/動画')
  assert.equal(editor.parseImport(editor.output(custom.map(complete)))[0]['活動形態１'], '未知の形態')
})

test('editor rejects unsupported keys, invalid types, videos, image URLs and batch limits', () => {
  for (const data of [[], {}, Array(21).fill({活動名:'x'}), [{活動名:'x',_registrationSource:'admin'}], [{活動名:5}], [{活動名:'x',属性:['a']}]]) {
    assert.throws(() => editor.parseImport(JSON.stringify(data)))
  }
  for (const band of [{活動名:''}, {活動名:'x',YouTube動画URL:'https://example.com/video'}, {活動名:'x',ロゴ:'javascript:alert(1)'}, {活動名:'x',コメント:'a'.repeat(4001)}]) {
    assert.throws(() => editor.output([validBand(band)]))
  }
  assert.throws(() => editor.output(Array.from({length:20},()=>validBand({活動名:'バンド',コメント:'あ'.repeat(3000)}))))
  assert.equal(JSON.parse(editor.output(Array.from({length:20},()=>validBand({活動名:'バンド'})))).length,20)
})

test('choice settings preserve official compound names and allow controlled custom settings', () => {
  assert.ok(editor.defaults['活動プラットフォーム'].includes('音源/動画'))
  assert.ok(editor.defaults['ロゴ配置位置'].includes('アー写に重ねる 左上'))
  assert.deepEqual(plain(editor.validateOptions({属性:['新しい属性']})['属性']),['新しい属性'])
  for (const settings of [{不明:['x']},{属性:['a','a']},{属性:['']},{属性:[3]},{属性:['a,b']}]) assert.throws(()=>editor.validateOptions(settings))
})

test('HTML scripts parse according to JavaScript or JSON type', () => {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if(match[1].includes('application/json'))JSON.parse(match[2]);else new vm.Script(match[2])
  }
})

test('member controls serialize multiple people and reopen existing member strings', () => {
  const rows = [{ part: 'ボーカル / ギター', name: '芹井', account: 'zerry_furai' }, { part: '', name: '名前のみ', account: '' }]
  assert.deepEqual(plain(editor.memberRows(editor.memberText(rows))), rows)
  assert.equal(editor.memberRows('ギター｜名前｜https://x.com/example')[0].account, 'https://x.com/example')
  assert.equal(editor.memberText([{part:'',name:'',account:''}]), '')
  assert.throws(() => editor.memberText([{part:'ギター',name:'',account:''}]))
  assert.throws(() => editor.memberText([{part:'ギター',name:'名前|別名',account:''}]))
  assert.throws(() => editor.parseImport('[{"活動名":"x","バンドメンバー":"壊れたデータ"}]'))
  const band = {...editor.blank(), 活動名:'メンバーテスト', バンドメンバー:editor.memberText(rows)}
  const imported = editor.parseImport(editor.output([complete(band)]))
  assert.deepEqual(plain(editor.memberRows(imported[0]['バンドメンバー'])), rows)
})

test('repeatable tag entries export comma-separated values and reopen as individual entries', () => {
  const band = {...editor.blank(), 活動名:'タグテスト', メインジャンル:editor.tagText(['ロック','ジャズ／フュージョン','独自ジャンル']), サブジャンル:editor.tagText(['ポストロック','シティポップ']), 属性:editor.tagText(['インスト','独自属性']), 募集パート:editor.tagText(['ベース','サックス']), 活動プラットフォーム:editor.tagText(['VRChat','音源/動画'])}
  const imported = editor.parseImport(editor.output([complete(band)]))[0]
  for (const key of ['メインジャンル','サブジャンル','属性','募集パート','活動プラットフォーム']) {
    assert.equal(imported[key],band[key])
    assert.deepEqual(plain(editor.tagItems(imported[key],key)), plain(editor.tagItems(band[key],key)))
  }
  assert.equal(editor.tagText([' ベース ','','ベース','サックス']),'ベース, サックス')
  assert.deepEqual(plain(editor.tagItems('音源/動画のみ','活動プラットフォーム')),['音源/動画'])
  assert.deepEqual(plain(editor.tagItems('ジャズ／フュージョン','メインジャンル')),['ジャズ／フュージョン'])
  assert.deepEqual(plain(editor.tagItems('ポストロック、シティポップ','サブジャンル')),['ポストロック','シティポップ'])
})


test('PDF choices remain supported and required fields reflect optional registration images', () => {
  assert.deepEqual(plain(editor.defaults['活動形態１']), ['バンド','ユニット','弾き語り','歌','楽器ソロ'])
  assert.deepEqual(plain(editor.defaults['活動形態３']), ['活動中','解散/活動停止中（休止）'])
  assert.equal(editor.defaults['メインジャンル'].length,13)
  assert.equal(editor.defaults['メインジャンル'].includes('その他'),false)
  assert.deepEqual(plain(editor.otherAllowed), ['属性','募集パート'])
  assert.equal(editor.fields.some(key=>key.includes('同意')),false)
  assert.equal(editor.required.length,9)
  for (const key of editor.required) {
    assert.throws(()=>editor.output([validBand({[key]:''})]),/必須/)
  }
  assert.doesNotThrow(()=>editor.output([validBand({})]))
})


test('all three image fields are optional while supplied image URLs remain validated',()=>{
 for(const field of ['ロゴ','アイコン','アー写'])assert.equal(editor.required.includes(field),false)
 const result=JSON.parse(editor.output([validBand({'ロゴ':'','アイコン':'','アー写':''})]))[0]
 for(const field of ['ロゴ','アイコン','アー写'])assert.equal(result[field]||'','')
 assert.throws(()=>editor.output([validBand({'アイコン':'javascript:alert(1)'})]),/URL/)
})
