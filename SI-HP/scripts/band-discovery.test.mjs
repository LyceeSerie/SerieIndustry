import test from 'node:test'
import assert from 'node:assert/strict'
import { pickBands } from '../src/band-discovery.mjs'

test('discovery samples at most three unique bands without changing the original', () => {
  for (const count of [0, 1, 2, 3, 10]) {
    const bands = Array.from({ length: count }, (_, id) => ({ id }))
    const original = [...bands]
    const sample = pickBands(bands, () => 0)
    assert.equal(sample.length, Math.min(3, count))
    assert.equal(new Set(sample).size, sample.length)
    assert.deepEqual(bands, original)
  }
  assert.notDeepEqual(pickBands([1, 2, 3, 4], () => 0), pickBands([1, 2, 3, 4], () => 0.99))
})
