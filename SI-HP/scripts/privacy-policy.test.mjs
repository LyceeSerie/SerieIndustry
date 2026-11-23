import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as Vue from 'vue'
import {compile} from '@vue/compiler-dom'
import {parse} from '@vue/compiler-sfc'
import {renderToString} from '@vue/server-renderer'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const policy=JSON.parse(read('../src/data/privacy-policy.json'))
const source=read('../src/views/PrivacyPage.vue')
const render=new Function('Vue',compile(parse(source).descriptor.template.content,{mode:'function'}).code)(Vue)
const Component=Vue.defineComponent({setup:()=>({policy,documentSection(){}}),render})
test('privacy notice is readable without authentication or third-party embedded content',async()=>{
 const html=await renderToString(Vue.h(Component))
 for(const section of policy.sections)assert.ok(html.includes(section.title))
 for(const service of policy.externalServices){for(const key of ['name','when','recipient','information','sitePurpose','providerPurpose'])assert.ok(service[key]);assert.ok(html.includes(service.name))}
 assert.match(html,/mailto:LyceeSerie@gmail.com/)
 assert.doesNotMatch(html,/<(?:iframe|img|script)\b/)
 assert.match(read('../src/router/index.ts'),/path: '\/privacy', name: 'Privacy'/)
 assert.match(read('../src/App.vue'),/route.name === 'Privacy'/)
})
test('team modal, site menu and registration screen provide explicit privacy links without changing consent terms',()=>{
 assert.match(read('../src/components/BandTeamModal.vue'),/href="\/#\/privacy"/)
 assert.match(read('../src/components/Menu.vue'),/to="\/privacy"/)
 assert.match(read('../src/views/BandRegistrationPage.vue'),/https:\/\/serieindustry.com\/#\/privacy/)
 const strings=JSON.stringify(policy)
 for(const term of ['DiscordユーザーID','操作履歴','最大8時間','10分','sessionStorage','不特定多数','開示','削除'])assert.ok(strings.includes(term))
 assert.ok(policy.externalServices.some(s=>s.name==='unavatar.io'))
 assert.ok(policy.externalServices.some(s=>s.name==='Xの投稿埋め込み'))
})
