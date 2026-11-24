import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, nextTick, ref } from 'vue'
import { useLiveEvents } from '../src/use-live-events.ts'

const renderer = createRenderer({
  patchProp() {}, insert() {}, remove() {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
})
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

test('event source ignores stale responses, refreshes on notification and removes listeners on unmount', async () => {
  const previous = globalThis.window
  globalThis.window = new EventTarget()
  const requests = [], enabled = ref(true)
  let state
  const app = renderer.createApp({ setup() {
    state = useLiveEvents(() => ({ localPreview: false, enabled: enabled.value }), () => {
      const request = deferred(); requests.push(request); return request.promise
    })
    return () => null
  } })
  try {
    app.mount({})
    assert.equal(requests.length, 1)
    const newer = state.refresh()
    requests[1].resolve([{ id: 'newer' }]); await newer
    requests[0].reject(Error('stale error')); await nextTick()
    assert.deepEqual(state.events.value, [{ id: 'newer' }])
    assert.equal(state.error.value, '')
    assert.equal(state.loading.value, false)
    window.dispatchEvent(new Event('vbd-events-changed'))
    assert.equal(requests.length, 3)
    enabled.value = false; await nextTick()
    requests[2].resolve([{ id: 'disabled' }]); await nextTick()
    assert.deepEqual(state.events.value, [])
    assert.equal(state.loading.value, false)
    app.unmount()
    window.dispatchEvent(new Event('storage'))
    assert.equal(requests.length, 3)
  } finally {
    app.unmount()
    globalThis.window = previous
  }
})
