import test from 'node:test'
import assert from 'node:assert/strict'
import { clampMusicPosition, clampMusicSize, musicState, musicCandidates, createMusicQueue } from '../src/band-music.mjs'
const bands=[{id:'a',name:'A',youtubeVideoId:'M7lc1UVf-VE'},{id:'b',name:'B',youtubeVideoId:'aqz-KE-bpKQ'},{id:'c',name:'C',youtubeVideoId:'jNQXAC9IVRw'}]

test('duplicate queue entries have independent IDs and can be moved, selected and removed individually',()=>{
  const state=musicState(),queue=createMusicQueue(state,()=>0)
  assert.equal(queue.add({id:'none',name:'none'}),'noVideo')
  queue.add(bands[0]);queue.add({...bands[0],id:'alias'});queue.add(bands[1])
  assert.equal(new Set(state.pending.map(item=>item.id)).size,3)
  const first=state.pending[0].id,alias=state.pending[1].id
  queue.move(alias,-1)
  assert.deepEqual(state.pending.map(item=>item.bandId),['alias','a','b'])
  queue.remove(first)
  assert.deepEqual(state.pending.map(item=>item.bandId),['alias','b'])
  queue.playQueued(alias)
  assert.equal(state.current.bandId,'alias');assert.equal(state.pending.length,1)
  assert.equal(queue.add(bands[0]),'added')
  assert.equal(queue.next(bands).bandId,'b');assert.equal(queue.next(bands).bandId,'a')
})

test('random completes a unique round and avoids repeats at the round boundary',()=>{
  const state=musicState(),queue=createMusicQueue(state,()=>0)
  const ids=[queue.startRandom(bands).videoId,queue.next(bands).videoId,queue.next(bands).videoId]
  assert.equal(new Set(ids).size,3)
  assert.notEqual(queue.next(bands).videoId,ids.at(-1))
  assert.equal(musicCandidates([...bands,{...bands[0],id:'duplicate'},{id:'bad',name:'bad',youtubeVideoId:'bad'}]).length,3)
})

test('zero/one candidates and all failures stop; manual retry is explicit and close preserves the pending queue',()=>{
  const state=musicState(),queue=createMusicQueue(state,()=>0)
  assert.equal(queue.startRandom([]),null)
  assert.equal(queue.startRandom([bands[0]]).bandId,'a')
  assert.equal(queue.next([bands[0]]),null)
  assert.equal(queue.startRandom([bands[0]]).bandId,'a')
  queue.fail(bands);queue.fail(bands);assert.equal(queue.fail(bands),null)
  assert.equal(queue.next(bands),null)
  queue.add(bands[0]);assert.equal(queue.next(bands).bandId,'a')
  queue.add(bands[1]);queue.close()
  assert.equal(state.current,null);assert.equal(state.randomEnabled,false)
  assert.equal(state.pending.length,1)
})

test('direct play preserves waiting copies; exhausting a manual queue stops without random playback',()=>{
  const state=musicState(),queue=createMusicQueue(state)
  queue.add(bands[0]);queue.add(bands[1])
  queue.play(bands[1])
  assert.equal(state.current.bandId,'b');assert.equal(state.pending.length,2)
  assert.equal(queue.next(bands).bandId,'a');assert.equal(queue.next(bands).bandId,'b');assert.equal(queue.next(bands),null)
})

test('bulk queue keeps result order and duplicate/current videos, skips only invalid videos, and never interrupts playback',()=>{
  const state=musicState(),queue=createMusicQueue(state)
  queue.play(bands[0])
  assert.deepEqual(queue.addAll([bands[0],bands[1],{...bands[1],id:'alias'},bands[2],{id:'none',name:'None'}]),{added:4,skipped:1})
  assert.equal(state.current.bandId,'a')
  assert.deepEqual(state.pending.map(row=>row.bandId),['a','b','alias','c'])
})
test('player sizing stays within viewport and reserves the minimum visible video dimensions',()=>{
  assert.deepEqual(clampMusicSize(9999,9999,1280,900,140),{width:1248,videoHeight:728})
  assert.deepEqual(clampMusicSize(10,10,390,844,140),{width:264,videoHeight:200})
  assert.deepEqual(clampMusicSize(480,250,320,640,140),{width:288,videoHeight:250})
})

test('window movement clamps to screen edges and keeps the title accessible in a short viewport',()=>{
  assert.deepEqual(clampMusicPosition(-100,-100,480,300,1200,800),{right:8,bottom:8})
  assert.deepEqual(clampMusicPosition(9999,9999,480,300,1200,800),{right:712,bottom:492})
  assert.deepEqual(clampMusicPosition(16,12,280,500,320,400),{right:16,bottom:-108})
})
