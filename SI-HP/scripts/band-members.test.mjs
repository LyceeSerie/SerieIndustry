import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { renderToString } from '@vue/server-renderer'
import Papa from 'papaparse'
import { parseMembers, xId } from './band-members.mjs'
import { parseBands } from './band-data.mjs'
import { fixtureValues } from './test-band-fixtures.mjs'
import { matchesBand } from '../src/band-filter.mjs'

function template(name) {
  const { descriptor } = parse(readFileSync(new URL('../src/components/' + name + '.vue', import.meta.url), 'utf8'))
  return new Function('Vue', compile(descriptor.template.content, { mode: 'function' }).code)(Vue)
}
const Avatar = Vue.defineComponent({ props: ['twitterId'], data: () => ({ failed: false }), methods: { loaded() {}, unavailable() {} }, render: template('XAvatar') })
const Members = Vue.defineComponent({ props: ['members'], data: () => ({ available: { 0: true, 1: true } }), components: { XAvatar: Avatar }, render: template('BandMembers') })

test('member lines preserve part/name spaces and slashes, normalize X handles and URLs, and reject unsafe links', () => {
  const members = parseMembers('ボーカル / ギター | 芹井 太郎 | @zerry_furai\r\nベース｜花 子｜https://twitter.com/example_bass\nドラム | 名前だけ\n不正な行\nギター|安全|https://x.com.attacker.example/user')
  assert.equal(members.length, 4)
  assert.deepEqual(members[0], { part: 'ボーカル / ギター', name: '芹井 太郎', twitterId: 'zerry_furai' })
  assert.equal(members[1].twitterId, 'example_bass'); assert.equal(members[2].twitterId, ''); assert.equal(members[3].twitterId, '')
  for (const bad of ['javascript:alert(1)', 'https://x.com/name/status/123', 'https://x.com/home', 'a'.repeat(16)]) assert.equal(xId(bad), '')
})

test('members render after comments and before tags with clickable X pills, and empty data has no section', async () => {
  const bands = parseBands(Papa.unparse(fixtureValues))
  const band = bands.find(item => item.name.startsWith('TC01'))
  const html = await renderToString(Vue.h(Members, { members: band.members }))
  assert.ok(html.includes('https://x.com/example_vocal'))
  assert.ok(html.includes('https://unavatar.io/x/example_vocal?fallback=false'))
  assert.ok(html.indexOf('member-avatar') < html.indexOf('member-part'))
  assert.ok(html.indexOf('member-part') < html.indexOf('member-name'))
  assert.equal(matchesBand(band, { query: 'テスト太郎' }), false)
  assert.equal((await renderToString(Vue.h(Members, { members: [] }))).includes('band-members'), false)
  const page = readFileSync(new URL('../src/views/VRCBandDBPage.vue', import.meta.url), 'utf8')
  assert.ok(page.indexOf('<BandMembers') > page.indexOf('<h2>コメント</h2>'))
  assert.ok(page.indexOf('<BandMembers') < page.indexOf("t('labels.tags')"))
})

test('missing account or failed image uses person placeholder and keeps member text readable', async () => {
  const noAccount = await renderToString(Vue.h(Members, { members: parseMembers('ドラム|リンクなし') }))
  assert.equal(noAccount.includes('href='), false); assert.ok(noAccount.includes('<svg'))
  const FailedAvatar = Vue.defineComponent({ props: ['twitterId'], data: () => ({ failed: true }), render: template('XAvatar') })
  const failed = await renderToString(Vue.h(FailedAvatar, { twitterId: 'example_vocal' }))
  assert.ok(failed.includes('<svg')); assert.equal(failed.includes('<img'), false)
})


test('actual avatar events enable the link on load and remove it on failure without reloading the failed image', async () => {
  function component(name) {
    const { descriptor } = parse(readFileSync(new URL('../src/components/' + name + '.vue', import.meta.url), 'utf8'))
    const compiled = compileScript(descriptor, { id: name, inlineTemplate: true })
    const code = transformSync(compiled.content, { loader: 'ts', format: 'cjs' }).code
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)(key => key === 'vue' ? Vue : key === './XAvatar.vue' ? { default: component('XAvatar'), __esModule: true } : null, mod, mod.exports)
    return mod.exports.default
  }
  const node = (type, text = '') => ({ type, text, props: {}, children: [], parent: null })
  const renderer = Vue.createRenderer({
    createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
    setText: (el, text) => { el.text = text }, setElementText: (el, text) => { el.text = text; el.children = [] },
    patchProp: (el, key, prev, next) => { el.props[key] = next }, parentNode: el => el.parent,
    nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] || null,
    insert(el, parent, anchor) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); const i = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(i < 0 ? parent.children.length : i, 0, el); el.parent = parent },
    remove(el) { el.parent?.children.splice(el.parent.children.indexOf(el), 1); el.parent = null },
  })
  const root = node('root')
  const app = renderer.createApp(component('BandMembers'), { members: parseMembers('ボーカル|名前|example_vocal') })
  app.mount(root)
  const find = (el, type) => el.type === type ? el : el.children.map(child => find(child, type)).find(Boolean)
  const image = find(root, 'img'); const anchor = find(root, 'a')
  assert.ok(image); assert.equal(Boolean(anchor.props.href), false)
  image.props.onLoad(); await Vue.nextTick()
  assert.equal(anchor.props.href, 'https://x.com/example_vocal')
  image.props.onError(); await Vue.nextTick()
  assert.equal(Boolean(anchor.props.href), false)
  assert.equal(Boolean(anchor.props.target), false)
  assert.equal(find(root, 'img'), undefined)
  assert.ok(find(root, 'svg'))
  app.unmount()
})
