import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { bandImage, logoLayout, validReading, validEnglish, splitNamedLink, joinNamedLink } from '../src/band-media.mjs'
import { registrationPage } from './build-registration.mjs'

test('reading validation allows hiragana and long vowels, rejects katakana, numbers and Latin',()=>{
  for(const value of ['', 'せりい', 'ゔぃーあーる ばんど', 'か\u3099'])assert.equal(validReading(value),true)
  for(const value of ['セリイ','abc','ばんど1','芹井'])assert.equal(validReading(value),false)
})
test('English warnings allow Latin names, numbers and symbols, and flag Japanese names',()=>{
  for(const value of ['', 'VRC Band 123', 'Rock & Roll', 'Café'])assert.equal(validEnglish(value),true)
  for(const value of ['ばんど','バンド','Band 芹井'])assert.equal(validEnglish(value),false)
})
test('shared image normalization supports Drive and bounded local PNG URLs, rejects unsafe links',()=>{
  assert.equal(bandImage('https://drive.google.com/file/d/abc_123/view').url,'https://drive.google.com/thumbnail?id=abc_123&sz=w1600')
  assert.equal(bandImage('javascript:alert(1)'),null)
  assert.equal(bandImage('https://user:secret@example.com/test.png'),null)
  assert.equal(bandImage('data:image/png;base64,YQ=='),null)
  assert.equal(bandImage('data:image/png;base64,YQ==',{localPreview:true}).url,'data:image/png;base64,YQ==')
})
test('separate title and URL fields round-trip existing storage format',()=>{
  for(const value of ['公式:https://example.com/a?b=1','https://example.com/','メール:band@example.com']){
    const parts=splitNamedLink(value);assert.equal(joinNamedLink(parts.title,parts.url),value)
  }
  assert.deepEqual(splitNamedLink('公式：https://example.com'),{title:'公式',url:'https://example.com'})
})
test('DB and registration share all logo positions and the visual component',async()=>{
  const source=await readFile(new URL('../src/components/BandVisual.vue',import.meta.url),'utf8')
  const template=/<template>([\s\S]*?)<\/template>/.exec(source)[1]
  const render=new Function('Vue',compile(template,{mode:'function',prefixIdentifiers:true}).code)(Vue)
  const image={url:'https://example.com/photo.png',source:'https://example.com/photo.png'}
  for(const position of ['左上','左下','右上','右下']){
    const layout=logoLayout('アー写に重ねる '+position)
    const html=await renderToString(Vue.createSSRApp({render,data:()=>({logo:image,photo:image,layout}),components:{BandImage:{template:'<div></div>'}}}))
    assert.match(html,new RegExp('overlay-logo '+layout));assert.doesNotMatch(html,/class="separate-logo"/)
  }
  const separate=await renderToString(Vue.createSSRApp({render,data:()=>({logo:image,photo:image,layout:'separate'}),components:{BandImage:{template:'<div></div>'}}}))
  assert.match(separate,/separate-logo/);assert.doesNotMatch(separate,/overlay-logo/)
})
test('Vue registration compiles as standalone HTML; production contains no test bypass',async()=>{
  const production=await registrationPage(false),preview=await registrationPage(true)
  assert.match(production,/registration-app/)
  assert.doesNotMatch(production,/vbd-registration-preview-v2/)
  assert.match(preview,/vbd-registration-preview-v2/)
  for(const html of [production,preview]){
    const script=/<script>([\s\S]*)<\/script>/.exec(html)[1];new Script(script)
    assert.doesNotMatch(script,/process\.env\.NODE_ENV/)
  }
})
