import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import editor from '../shared/band-editor.mjs'
import { embeddedEditorCore } from '../tools/sync-editor-core.mjs'

test('standalone offline editor embeds the canonical shared module without drift', async () => {
  const html = await readFile(new URL('../tools/band-json-editor.html', import.meta.url), 'utf8')
  assert.equal(html.match(/<script id="editor-core">([\s\S]*?)<\/script>/)[1], await embeddedEditorCore())
})

test('shared editor preserves member, genre and named platform values during admin import/export', () => {
  const input = [{ '活動名': '変換テスト', 'バンドメンバー': 'ドラム | 芹井 | @zerry_furai', 'メインジャンル': 'ロック, ポップ', '活動プラットフォーム': 'VRChat, 音源/動画のみ' }]
  const [band] = editor.parseImport(editor.output(input, { admin: true }))
  assert.deepEqual(editor.memberRows(band['バンドメンバー']), [{ part: 'ドラム', name: '芹井', account: '@zerry_furai' }])
  assert.deepEqual(editor.tagItems(band['メインジャンル'], 'メインジャンル'), ['ロック', 'ポップ'])
  assert.deepEqual(editor.tagItems(band['活動プラットフォーム'], '活動プラットフォーム'), ['VRChat', '音源/動画'])
})
