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

test('editor fields match the actual GAS allowlist and exported batches round-trip without losing values', () => {
  assert.deepEqual(plain(editor.fields), plain(context.BandReview.fields))
  const sample = readFileSync(new URL('../examples/追加バンド.json', import.meta.url), 'utf8')
  const imported = editor.parseImport(sample)
  const text = editor.output(imported)
  assert.deepEqual(plain(editor.parseImport(text)), plain(imported))
  for (const band of JSON.parse(text)) {
    const entries = editor.fields.map(title => ({ title, value: band[title] || '' }))
    assert.equal(context.BandReview.snapshot(entries)['活動名'], band['活動名'])
  }
  const custom = editor.parseImport('[{"活動名":"<script>test</script>","活動形態１":"未知の形態","活動プラットフォーム":"音源/動画のみ","コメント":"改行\\n内容"}]')
  assert.equal(editor.parseImport(editor.output(custom))[0]['活動プラットフォーム'], '音源/動画のみ')
  assert.equal(editor.parseImport(editor.output(custom))[0]['活動形態１'], '未知の形態')
})

test('editor rejects unsupported keys, invalid types, videos, image URLs and batch limits', () => {
  for (const data of [[], {}, Array(21).fill({活動名:'x'}), [{活動名:'x',_registrationSource:'admin'}], [{活動名:5}], [{活動名:'x',属性:['a']}]]) {
    assert.throws(() => editor.parseImport(JSON.stringify(data)))
  }
  for (const band of [{活動名:''}, {活動名:'x',YouTube動画URL:'https://example.com/video'}, {活動名:'x',ロゴ:'javascript:alert(1)'}, {活動名:'x',コメント:'a'.repeat(4001)}]) {
    assert.throws(() => editor.output([{...editor.blank(),...band}]))
  }
  assert.throws(() => editor.output(Array.from({length:20},()=>({...editor.blank(),活動名:'バンド',コメント:'あ'.repeat(3000)}))))
  assert.equal(JSON.parse(editor.output(Array.from({length:20},()=>({...editor.blank(),活動名:'バンド'})))).length,20)
})

test('choice settings preserve official compound names and allow controlled custom settings', () => {
  assert.ok(editor.defaults['活動プラットフォーム'].includes('音源/動画のみ'))
  assert.ok(editor.defaults['ロゴ配置位置'].includes('アー写に重ねる 左上'))
  assert.deepEqual(plain(editor.validateOptions({属性:['新しい属性']})['属性']),['新しい属性'])
  for (const settings of [{不明:['x']},{属性:['a','a']},{属性:['']},{属性:[3]},{属性:['a,b']}]) assert.throws(()=>editor.validateOptions(settings))
})

test('both HTML scripts parse as JavaScript', () => {
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1])
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
  const imported = editor.parseImport(editor.output([band]))
  assert.deepEqual(plain(editor.memberRows(imported[0]['バンドメンバー'])), rows)
})

test('repeatable tag entries export comma-separated values and reopen as individual entries', () => {
  const band = {...editor.blank(), 活動名:'タグテスト', メインジャンル:editor.tagText(['ロック','ジャズ／フュージョン','独自ジャンル']), サブジャンル:editor.tagText(['ポストロック','シティポップ']), 属性:editor.tagText(['インスト','独自属性']), 募集パート:editor.tagText(['ベース','サックス']), 活動プラットフォーム:editor.tagText(['VRChat','音源/動画のみ'])}
  const imported = editor.parseImport(editor.output([band]))[0]
  for (const key of ['メインジャンル','サブジャンル','属性','募集パート','活動プラットフォーム']) {
    assert.equal(imported[key],band[key])
    assert.deepEqual(plain(editor.tagItems(imported[key],key)), plain(editor.tagItems(band[key],key)))
  }
  assert.equal(editor.tagText([' ベース ','','ベース','サックス']),'ベース, サックス')
  assert.deepEqual(plain(editor.tagItems('音源/動画のみ','活動プラットフォーム')),['音源/動画のみ'])
  assert.deepEqual(plain(editor.tagItems('ジャズ／フュージョン','メインジャンル')),['ジャズ／フュージョン'])
  assert.deepEqual(plain(editor.tagItems('ポストロック、シティポップ','サブジャンル')),['ポストロック','シティポップ'])
})
