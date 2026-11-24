import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import ts from 'typescript'
import * as Vue from 'vue'
import * as events from '../src/band-events.mjs'
import * as messages from '../src/i18n/ui-text.mjs'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')

test('operation log remains visible outside either tab and band save still submits the correct form', () => {
  const source = read('../src/views/BandRegistrationPage.vue')
  const tree = parseTemplate(parse(source).descriptor.template.content)
  const logs = []
  function walk(node, ancestors = []) {
    if (node.type === 1) {
      if (node.props.some(prop => prop.type === 6 && prop.name === 'class' && prop.value?.content === 'save-notice')) logs.push({ node, ancestors })
      for (const child of node.children) walk(child, [...ancestors, node])
    } else for (const child of node.children || []) walk(child, ancestors)
  }
  walk(tree)
  assert.equal(logs.length, 1)
  assert.equal(logs[0].ancestors.some(node => node.tag === 'form' || node.props.some(prop => prop.type === 7 && prop.name === 'show')), false)
  assert.match(source, /form="band-registration-form"/)
  assert.match(source, /<form id="band-registration-form"/)
  assert.match(source, /@notice="message\(\$event.text,\$event.error\)"/)
})

test('live editor forwards load, save validation and delete errors to the shared log', async () => {
  const descriptor = parse(read('../src/components/LiveEventEditor.vue')).descriptor
  const script = compileScript(descriptor, { id: 'event-log-test', genDefaultAs: 'Component' }).content
  const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports = {
    vue: { ...Vue, onMounted() {}, onUnmounted() {} },
    '../band-events.mjs': events,
    '../i18n/ui-text.mjs': messages,
    '../use-event-clock': { useEventClock: () => Vue.ref(Date.now()) },
    './LiveEventList.vue': {},
  }
  const component = new Function('require', 'exports', code + '\nreturn Component')(name => {
    assert.ok(Object.hasOwn(imports, name), name)
    return imports[name]
  }, {})
  const notices = [], scope = Vue.effectScope(), previous = globalThis.confirm
  globalThis.confirm = () => true
  try {
    const editor = scope.run(() => component.setup({ bandId: 'id', bandName: 'name', admin: false, localPreview: false, request: async () => { throw Error('保存先に接続できません') } }, { expose() {}, emit: (_event, value) => notices.push(value) }))
    await editor.refresh()
    assert.deepEqual(notices.at(-1), { text: '保存先に接続できません', error: true })
    await editor.save()
    assert.equal(notices.at(-1).error, true)
    editor.title.value = 'テスト'
    await editor.save()
    assert.deepEqual(notices.at(-1), { text: '保存先に接続できません', error: true })
    await editor.remove({ id: 'event', revision: 1, title: 'event' })
    assert.deepEqual(notices.at(-1), { text: '保存先に接続できません', error: true })
  } finally { scope.stop(); globalThis.confirm = previous }
})
