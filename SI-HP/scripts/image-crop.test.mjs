import test from 'node:test'
import assert from 'node:assert/strict'
import {fitImage,cropFromPoints,moveCrop,encodeWithinLimit} from '../src/image-crop.ts'

test('resizing fits all upload dimensions without enlarging small sources or losing a boundary pixel',()=>{
 assert.deepEqual(fitImage(1700,1700,256,256),{width:256,height:256})
 assert.deepEqual(fitImage(8000,4000,3840,2160),{width:3840,height:1920})
 assert.deepEqual(fitImage(200,100,1024,512),{width:200,height:100})
 assert.deepEqual(fitImage(100,1000,256,256),{width:25,height:256})
 assert.deepEqual(fitImage(.01,60000,256,256),{width:1,height:256})
})
test('crop selection handles reverse drags, out-of-image points and fixed aspect ratios',()=>{
 assert.deepEqual(cropFromPoints({x:90,y:80},{x:-10,y:-20},100,100),{x:0,y:0,width:90,height:80})
 assert.deepEqual(cropFromPoints({x:10,y:20},{x:150,y:200},100,100,1),{x:10,y:20,width:80,height:80})
 const crop=cropFromPoints({x:200,y:100},{x:0,y:0},200,100,16/9)
 assert.ok(Math.abs(crop.width/crop.height-16/9)<1e-10)
 assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=200&&crop.y+crop.height<=100)
})
test('PNG capacity fallback shrinks dimensions until bytes fit and propagates encoder errors',async()=>{
 const attempts=[]
 const result=await encodeWithinLimit(256,128,10000,async(w,h)=>{attempts.push([w,h]);return new Blob([new Uint8Array(w*h*4)])})
 assert.ok(attempts.length>1);assert.ok(result.blob.size<=10000)
 assert.ok(result.width<=256&&result.height<=128)
 assert.ok(Math.abs(result.width/result.height-2)<.1)
 await assert.rejects(encodeWithinLimit(1,1,1,async()=>new Blob(['too large'])),/容量上限/)
 await assert.rejects(encodeWithinLimit(10,10,100,async()=>{throw Error('encode failed')}),/encode failed/)
})


test('moving a crop preserves its size and stops at every image boundary',()=>{
 const crop={x:40,y:30,width:50,height:50}
 assert.deepEqual(moveCrop(crop,10,-10,200,100),{x:50,y:20,width:50,height:50})
 assert.deepEqual(moveCrop(crop,999,999,200,100),{x:150,y:50,width:50,height:50})
 assert.deepEqual(moveCrop(crop,-999,-999,200,100),{x:0,y:0,width:50,height:50})
 assert.deepEqual(crop,{x:40,y:30,width:50,height:50})
})

test('fixed square crop stays inside image when drag ends far outside any edge',()=>{
 for(const end of [{x:-9999,y:-9999},{x:9999,y:9999},{x:-9999,y:9999},{x:9999,y:-9999}]){
  const crop=cropFromPoints({x:150,y:100},end,300,200,1)
  assert.equal(crop.width,crop.height)
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=300&&crop.y+crop.height<=200)
 }
})
