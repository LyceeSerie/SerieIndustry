import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import {compile} from '@vue/compiler-dom'
import {parse} from '@vue/compiler-sfc'
import {renderToString} from '@vue/server-renderer'
import ts from 'typescript'
import Papa from 'papaparse'
import {fixtureValues} from './test-band-fixtures.mjs'
import {parseBands} from './band-data.mjs'
const notice=readFileSync(new URL('../src/components/BandRegistrationNotice.vue',import.meta.url),'utf8')
const {descriptor}=parse(notice)
const render=new Function('Vue',compile(descriptor.template.content,{mode:'function'}).code)(Vue)
const Component=Vue.defineComponent({props:['source'],emits:['contact'],render})
const bands=parseBands(Papa.unparse(fixtureValues))
test('rights contact is rendered only for admin-owned fixture bands and does not replace the original badge',async()=>{
 const admin=bands.find(b=>b.name.startsWith('TC20'))
 assert.equal(admin.registrationSource,'admin');assert.equal(admin.icon,null)
 assert.match(admin.comment,/権利者/)
 const html=await renderToString(Vue.h(Component,{source:admin.registrationSource}))
 assert.doesNotMatch(html,/運営登録/);assert.match(html,/掲載内容の修正・削除について/)
 for(const source of ['user','form',undefined])assert.doesNotMatch(await renderToString(Vue.h(Component,{source})),/掲載内容の修正・削除について/)
 const events=[];const ctx={source:'admin',$emit:event=>events.push(event)}
 const vnode=render.call(ctx,ctx,[])
 vnode.children.find(child=>child.type==='button').props.onClick()
 assert.deepEqual(events,['contact'])
})
test('actual modal opens before scrolling to the policy, focuses the heading and reuses an open dialog',async()=>{
 const source=readFileSync(new URL('../src/components/BandTeamModal.vue',import.meta.url),'utf8')
 const script=parse(source).descriptor.scriptSetup.content.replace(/^import .*$/gm,'')
 const context=vm.createContext({ref:value=>({value}),nextTick:async()=>{calls.push('tick')},members:[],defineExpose(){}})
 const calls=[]
 vm.runInContext(ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.api={dialog,listingPolicySection,listingPolicyHeading,openListingPolicy};',context)
 const api=context.api
 api.dialog.value={open:false,scrollTop:60,showModal(){calls.push('open');this.open=true},getBoundingClientRect:()=>({top:100}),scrollTo(options){calls.push(['scroll',options.top])}}
 api.listingPolicySection.value={getBoundingClientRect:()=>({top:400})}
 api.listingPolicyHeading.value={focus(options){assert.equal(options.preventScroll,true);calls.push('focus')}}
 await api.openListingPolicy()
 assert.deepEqual(calls,['open','tick','focus',['scroll',336]])
 calls.length=0;await api.openListingPolicy();assert.deepEqual(calls,['tick','focus',['scroll',336]])
 const page=readFileSync(new URL('../src/views/VRCBandDBPage.vue',import.meta.url),'utf8')
 assert.match(page, /class="registration-avatar profile-avatar"[\s\S]*?class="registration-source">運営登録<\/span><\/span>/)
 assert.match(page, /class="profile-name-row"><h1>{{ selected.name }}<\/h1><BandRegistrationNotice/)
 assert.match(page,/@contact="teamModal\?\.openListingPolicy\(\)"/)
})
