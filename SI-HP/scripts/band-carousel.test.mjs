import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import * as Vue from 'vue'

test('carousel loops automatically then uses bounded manual scrolling and suppresses drag clicks', async () => {
  const originals = Object.fromEntries(['window','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
  const animations = []; let disconnected=false
  globalThis.window = {matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})}
  globalThis.ResizeObserver = class { observe(){} disconnect(){disconnected=true} }
  let app
  try {
    const {descriptor}=parse(readFileSync(new URL('../src/components/BandCarousel.vue',import.meta.url),'utf8'))
    const compiled=compileScript(descriptor,{id:'carousel-test',inlineTemplate:true})
    const code=transformSync(compiled.content,{loader:'ts',format:'cjs'}).code
    const module={exports:{}}
    new Function('require','module','exports',code)(name=>name==='vue'?Vue:null,module,module.exports)
    const node=(type,text='')=>({type,text,props:{},children:[],parent:null,scrollLeft:0,clientWidth:900,getBoundingClientRect(){return {width:2960}},setPointerCapture(){},animate(keyframes,options){const animation={keyframes,options,currentTime:0,cancelled:false,cancel(){this.cancelled=true}};animations.push(animation);return animation}})
    const renderer=Vue.createRenderer({
      createElement:type=>node(type),createText:text=>node('text',text),createComment:text=>node('comment',text),
      setText:(el,text)=>{el.text=text},setElementText:(el,text)=>{el.text=text;el.children=[]},patchProp:(el,key,prev,next)=>{el.props[key]=next},parentNode:el=>el.parent,
      nextSibling:el=>el.parent?.children[el.parent.children.indexOf(el)+1]||null,
      insert(el,parent,anchor){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);const index=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(index<0?parent.children.length:index,0,el);el.parent=parent},
      remove(el){el.parent?.children.splice(el.parent.children.indexOf(el),1);el.parent=null},
    })
    const root=node('root')
    app=renderer.createApp(module.exports.default,{items:Array.from({length:10},(_,id)=>({id:String(id)}))})
    app.mount(root)
    await new Promise(setImmediate)
    const find=(el,predicate)=>predicate(el)?el:el.children.map(child=>find(child,predicate)).find(Boolean)
    const view=find(root,el=>String(el.props.class).split(' ').includes('viewport'))
    const control=label=>find(root,el=>el.props['aria-label']===label)
    assert.equal(animations.length,1)
    assert.equal(animations[0].options.easing,'linear')
    assert.equal(animations[0].options.iterations,Infinity)
    assert.equal(animations[0].options.duration,2960/22*1000)
    assert.equal(view.props.onPointerenter,undefined)
    animations[0].currentTime=1234
    assert.equal(view.scrollLeft,0)
    view.props.onPointerdown({pointerType:'touch'})
    await Vue.nextTick()
    assert.equal(control('自動スクロールを再開'),undefined)
    assert.equal(animations[0].cancelled,true)
    const stopped=view.scrollLeft
    assert.ok(Math.abs(stopped-1234*0.022)<0.001)
    animations[0].currentTime=2500;assert.equal(view.scrollLeft,stopped)
    const beforeDrag=view.scrollLeft
    view.props.onPointerdown({pointerType:'mouse',button:0,pointerId:7,clientX:100})
    let prevented=false
    view.props.onPointermove({pointerId:7,clientX:40,preventDefault(){prevented=true}})
    assert.equal(prevented,true);assert.equal(view.scrollLeft,beforeDrag+60)
    view.props.onPointerup()
    let suppressed=false
    view.props.onClickCapture({preventDefault(){},stopPropagation(){suppressed=true}})
    assert.equal(suppressed,true)
    await Vue.nextTick()
    assert.equal(control('自動スクロールを再開'),undefined)
    const beforeArrow=view.scrollLeft
    view.props.onKeydown({key:'ArrowLeft',preventDefault(){}})
    await Vue.nextTick()
    assert.equal(view.scrollLeft,Math.max(0,beforeArrow-296))
    view.props.onPointerdown({pointerType:'mouse',button:0,pointerId:8,clientX:100})
    view.props.onPointermove({pointerId:8,clientX:-10000,preventDefault(){}})
    assert.equal(view.scrollLeft,2960-900)
    assert.equal(view.scrollLeft,2960-900)
    view.props.onPointermove({pointerId:8,clientX:10000,preventDefault(){}})
    assert.equal(view.scrollLeft,0)
    view.props.onPointerup()
    app.unmount();app=null
    assert.ok(animations.every(animation=>animation.cancelled));assert.equal(disconnected,true)
    const staticRoot=node('root')
    app=renderer.createApp(module.exports.default,{items:[{id:'1'},{id:'2'},{id:'3'}],animated:false})
    app.mount(staticRoot)
    await new Promise(setImmediate)
    assert.equal(animations.length,1, 'fixed mode must not start an animation')
    const fixedViewport=find(staticRoot,el=>el.props.class==='viewport')
    assert.ok(fixedViewport)
    assert.equal(fixedViewport.props.tabindex == null,true)
    fixedViewport.props.onPointerdown({pointerType:'mouse',button:0,pointerId:9,clientX:100})
    fixedViewport.props.onPointermove({pointerId:9,clientX:0,preventDefault(){}})
    assert.equal(fixedViewport.scrollLeft,0)
    app.unmount();app=null
  } finally {
    app?.unmount()
    for(const [key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  }
})
