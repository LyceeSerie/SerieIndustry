import test from 'node:test'
import assert from 'node:assert/strict'
import { pickBands, loopPosition } from '../src/band-discovery.mjs'

test('discovery samples at most ten unique bands without changing the original', () => {
  for (const count of [0, 1, 2, 3, 10, 25]) {
    const bands = Array.from({ length: count }, (_, id) => ({ id }))
    const original = [...bands]
    const sample = pickBands(bands, () => 0)
    assert.equal(sample.length, Math.min(10, count))
    assert.equal(new Set(sample).size, sample.length)
    assert.deepEqual(bands, original)
  }
  assert.notDeepEqual(pickBands([1, 2, 3, 4], () => 0), pickBands([1, 2, 3, 4], () => 0.99))
})


test('loop positions wrap in either direction without changing the visible item offset', () => {
  for (const position of [-3010, -10, 0, 1000, 1999, 2000, 5010]) {
    const wrapped = loopPosition(position, 1000)
    assert.ok(wrapped >= 1000 && wrapped < 2000)
    assert.equal(((position % 1000)+1000)%1000, wrapped % 1000)
  }
  assert.equal(loopPosition(10,0),0)
})


test('fixed Discovery mode samples at most three bands while carousel mode samples ten', () => {
  const bands=Array.from({length:15},(_,id)=>({id}))
  assert.equal(pickBands(bands,()=>0,3).length,3)
  assert.equal(pickBands(bands,()=>0,10).length,10)
  assert.equal(pickBands(bands.slice(0,2),()=>0,3).length,2)
})
