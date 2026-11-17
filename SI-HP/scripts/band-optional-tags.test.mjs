import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import { renderToString } from '@vue/server-renderer'
import Papa from 'papaparse'
import { fixtureValues } from './test-band-fixtures.mjs'
import { parseBands } from './band-data.mjs'

// Render the production component's actual template, not a duplicated condition.
const source = readFileSync(new URL('../src/components/BandOptionalTags.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const render = new Function('Vue', compile(descriptor.template.content, { mode: 'function' }).code)(Vue)
const Component = Vue.defineComponent({ props: ['title', 'tags', 'showHeading'], render })
const bands = parseBands(Papa.unparse(fixtureValues))

for (const [code, hasAttributes, hasParts] of [
  ['TC01', true, true], ['TC06', true, false],
  ['TC11', false, true], ['TC20', false, false],
  ['TC09', false, false], // Other prefix with no actual answer.
]) {
  test(`${code}: detail headings and tags follow the actual optional answers`, async () => {
    const band = bands.find(band => band.name.startsWith(code))
    for (const [title, tags, visible] of [
      ['属性', band.attributes, hasAttributes], ['募集パート', band.recruitingParts, hasParts],
    ]) {
      const html = await renderToString(Vue.h(Component, { title, tags, showHeading: title !== '属性' }))
      assert.equal(html.includes(`<h2>${title}</h2>`), visible && title !== '属性')
      assert.equal(html.includes('class="chips"'), visible)
      for (const tag of tags) assert.ok(html.includes(`<span>${tag}</span>`))
      assert.equal(html.includes('募集なし'), false)
    }
  })
}
