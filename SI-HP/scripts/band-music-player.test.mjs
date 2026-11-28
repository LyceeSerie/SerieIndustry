import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript} from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'
import * as music from '../src/band-music.mjs'
import * as text from '../src/i18n/ui-text.mjs'

const bands=[{id:'a',name:'A',youtubeVideoId:'M7lc1UVf-VE'},{id:'b',name:'B',youtubeVideoId:'aqz-KE-bpKQ'}]
const source=readFileSync(new URL('../src/components/BandMusicPlayer.vue',import.meta.url),'utf8')
const script=compileScript(parse(source).descriptor,{id:'music-test',genDefaultAs:'Component'}).content
const code=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const flush=async()=>{await Vue.nextTick();await new Promise(setImmediate);await Vue.nextTick()}

test('one player survives band navigation, queue addition never starts playback, hidden tab pauses and close stops',async()=>{
  const previous=globalThis.document,previousLocation=globalThis.location,previousWindow=globalThis.window
  globalThis.window={removeEventListener(){}}
  globalThis.location={origin:'http://127.0.0.1:5174'}
  globalThis.document={hidden:false,documentElement:{clientWidth:1200,clientHeight:1000},removeEventListener(){}}
  const lifecycle=[],players=[]
  class Player {
    constructor(_element,options){this.options=options;this.loads=[];this.pauses=0;this.stops=0;players.push(this);queueMicrotask(()=>options.events.onReady({target:this}))}
    loadVideoById(id){this.id=id;this.loads.push(id);this.playVideo()}
    playVideo(){this.options.events.onStateChange({target:this,data:1})}
    pauseVideo(){this.pauses++;this.options.events.onStateChange({target:this,data:2})}
    stopVideo(){this.stops++}
    destroy(){this.destroyed=true}
    getVideoUrl(){return 'https://www.youtube.com/watch?v='+this.id}
  }
  const imports={vue:{...Vue,onMounted(){},onUnmounted(fn){lifecycle.push(fn)}},'../band-music.mjs':music,'../youtube-player':{loadYouTubeAPI:async()=>({Player})},'../i18n/ui-text.mjs':text,'./UiIcon.vue':{}}
  const Component=new Function('require','exports',code+'\nreturn Component')(name=>{assert.ok(Object.hasOwn(imports,name),name);return imports[name]}, {})
  const scope=Vue.effectScope(),props=Vue.reactive({bands})
  try{
    const view=scope.run(()=>Component.setup(props,{expose(){},emit(){}}))
    view.host.value={};view.frame.value={getBoundingClientRect:()=>({width:320,height:200,left:0,top:0,right:320,bottom:200})}
    view.enqueue(bands[0]);await flush();assert.equal(players.length,0)
    view.resume();await flush();assert.equal(players.length,1);assert.equal(view.phase.value,'playing')
    const player=players[0]
    props.bands=[...bands];await flush();assert.equal(player.loads.length,1)
    view.enqueue(bands[1]);await flush();assert.equal(player.loads.length,1)
    document.hidden=true;view.visibilityChanged();assert.equal(view.phase.value,'paused');assert.equal(player.pauses,1)
    document.hidden=false;await view.resume();assert.equal(view.phase.value,'playing')
    player.options.events.onStateChange({target:player,data:0});await flush()
    assert.equal(players.length,1);assert.deepEqual(player.loads,['M7lc1UVf-VE','aqz-KE-bpKQ'])
    player.options.events.onAutoplayBlocked();assert.equal(view.phase.value,'paused')
    assert.equal(view.state.failed.length,0)
    player.options.events.onError({target:player,data:100});await flush()
    assert.equal(view.phase.value,'error');assert.ok(view.state.failed.includes(bands[1].youtubeVideoId))
    view.enqueue(bands[0]);await view.resume();await flush()
    assert.equal(view.state.current.bandId,'a');assert.equal(players.length,1)
    player.options.events.onError({target:player,data:153});await flush()
    assert.equal(view.state.current.bandId,'a');assert.equal(view.state.failed.includes(bands[0].youtubeVideoId),false)
    await view.resume();await flush();assert.equal(view.phase.value,'playing')
    view.advance();assert.equal(view.phase.value,'ended');assert.ok(player.stops>0)
    view.play({...bands[0],id:'alias',name:'Alias'});await flush();assert.equal(view.displayItem.value.name,'Alias')
    view.play(bands[0]);await flush();assert.equal(view.displayItem.value.name,'A');assert.equal(players.length,1)
    view.panel.value={getBoundingClientRect:()=>({width:480,height:300})}
    let captured=false,released=false
    const grip={setPointerCapture(){captured=true},hasPointerCapture(){return captured},releasePointerCapture(){captured=false;released=true}}
    const titleEvent={button:0,pointerId:2,clientX:500,clientY:500,target:{closest:()=>null},currentTarget:grip,preventDefault(){}}
    view.position.right=16;view.position.bottom=12
    view.startMove(titleEvent)
    view.moveWindow({...titleEvent,clientX:400,clientY:300})
    assert.deepEqual({...view.position},{right:116,bottom:212})
    view.endMove({...titleEvent,type:'pointerup'})
    let prevented=false
    view.moveClick({preventDefault(){prevented=true},stopPropagation(){}})
    assert.equal(prevented,true);assert.equal(view.visible.value,true)
    view.moveWindow({...titleEvent,clientX:0,clientY:0})
    assert.equal(view.position.right,116)
    view.startMove({...titleEvent,target:{closest:()=>({})}})
    view.moveWindow({...titleEvent,clientX:0,clientY:0})
    assert.equal(view.position.right,116)
    view.startResize({button:0,pointerId:1,clientX:500,clientY:500,currentTarget:grip,preventDefault(){}})
    view.moveResize({pointerId:1,clientX:-10000,clientY:-10000})
    assert.equal(view.size.width,1168);assert.equal(view.size.videoHeight,868)
    view.endResize({pointerId:1,currentTarget:grip})
    assert.equal(released,true);assert.equal(view.visible.value,true)
    view.moveResize({pointerId:1,clientX:0,clientY:0});assert.equal(view.size.width,1168)
    view.enqueue(bands[1]);view.close();assert.equal(view.state.pending.length,1);assert.equal(view.visible.value,false)
    view.enqueueAll([{id:'none',name:'No video'},...bands]);await flush()
    assert.equal(view.state.current.bandId,'a');assert.equal(view.phase.value,'playing')
    assert.equal(view.state.pending.length,2)
    assert.equal(view.visible.value,true)
    const loads=player.loads.length
    view.enqueueAll([{id:'none',name:'No video'}]);await flush()
    assert.equal(view.state.current.bandId,'a');assert.equal(player.loads.length,loads)
    for(const dispose of lifecycle)dispose()
    assert.equal(player.destroyed,true)
  }finally{scope.stop();globalThis.document=previous;globalThis.location=previousLocation;globalThis.window=previousWindow}
})
