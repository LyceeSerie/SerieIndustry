import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

async function bundledModule(path) {
  const result = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: fileURLToPath(new URL(path, import.meta.url)), formats: ['es'] },
  } })
  const chunk = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk')
  return import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'))
}
const drafts = await bundledModule('../src/registration/drafts.ts')
const { sections, editor } = await bundledModule('../src/registration/schema.ts')

test('explicit form groups cover all fields exactly once including the adjacent logo placement control', () => {
  const fields = [...sections.flatMap(section => section.fields), 'ロゴ配置位置']
  assert.equal(new Set(fields).size, fields.length)
  assert.deepEqual([...fields].sort(), [...editor.fields].sort())
  assert.deepEqual(sections.find(section => section.id === 'members').fields, ['バンドメンバー', '募集パート'])
})

test('editable draft rows round-trip to the original storage format without changing ownership or server metadata', () => {
  const original = { 活動名: '登録テスト', メインジャンル: 'ロック, ポップ', 属性: 'VTuber, 自由属性', バンドメンバー: 'ドラム | 名前 | @account', その他SNSリンク1: '公式:https://example.com' }
  const draft = drafts.makeDraft(original, { id: 'id', revision: 2, ownerUserIds: ['owner'] })
  const band = drafts.outputDraft(draft, true)
  for (const [key, value] of Object.entries(original)) assert.equal(band[key], value)
  assert.equal(band['ロゴ配置位置'], 'アー写に重ねない')
  assert.deepEqual(draft.ownerUserIds, ['owner'])
  assert.equal(draft.revision, 2)
  assert.equal(band.id, undefined)
  assert.throws(() => drafts.outputDraft(draft, false), /必須/)
  draft.links['その他SNSリンク1'] = { title: '公式', url: '' }
  assert.throws(() => drafts.serializeDraft(draft), /リンクを入力/)
})

test('management draft guard recognizes saved duplicates but ignores unsaved drafts and deleted records',()=>{
  const saved=drafts.makeDraft({活動名:' Ｔｅｓｔ　Band '},{id:'saved'})
  assert.equal(drafts.hasDuplicateSavedBand('test band',[saved]),true)
  assert.equal(drafts.hasDuplicateSavedBand('different',[saved]),false)
  assert.equal(drafts.hasDuplicateSavedBand('test band',[{...saved,id:undefined}]),false)
  assert.equal(drafts.hasDuplicateSavedBand('test band',[{...saved,status:'deleted'}]),false)
})

const { bandAvatar } = await bundledModule('../src/band-avatar.ts')
test('band avatar fills missing images in priority order without checking availability', () => {
  const image = name => ({url:`https://example.com/${name}.png`,source:name})
  const band = {icon:image('icon'),logo:image('logo'),photo:image('photo'),links:[{url:'https://x.com/band_name'}],members:[{twitterId:''},{twitterId:'member_one'},{twitterId:'member_two'}]}
  assert.equal(bandAvatar(band),band.icon)
  band.icon=null
  assert.equal(bandAvatar(band),band.logo)
  band.logo=null
  assert.equal(bandAvatar(band),band.photo)
  band.photo=null
  assert.match(bandAvatar(band).url,/x\/band_name\?fallback=false$/)
  band.links=[{url:'https://x.com.evil.example/fake'},{url:'https://x.com/intent'},{url:'invalid'}]
  assert.match(bandAvatar(band).url,/x\/member_one\?fallback=false$/)
  band.members=[]
  assert.equal(bandAvatar(band),null)
})
