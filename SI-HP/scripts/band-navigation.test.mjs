import test from 'node:test'
import assert from 'node:assert/strict'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createBandNavigation, readBandNavigation } from '../src/band-navigation.mjs'

async function setup(start = '/VRCBandDB', settings = {}) {
  const component = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/outside', component }, { path: '/VRCBandDB', name: 'VRCBandDB', component }] })
  await router.push('/outside')
  await router.push(start)
  return { router, navigation: createBandNavigation(router, settings), state: () => readBandNavigation(router.currentRoute.value.query, settings) }
}
function traverse(router, delta) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(Error('navigation timed out')) }, 1500)
    const stop = router.afterEach(() => { clearTimeout(timer); stop(); resolve() })
    router.go(delta)
  })
}

test('landing → list → band A → band B supports back and forward within the SPA', async () => {
  const {router,navigation,state} = await setup()
  await navigation.browse(); await navigation.select('band-A'); await navigation.select('band-B')
  await traverse(router,-1); assert.equal(state().bandId,'band-A')
  await traverse(router,-1); assert.deepEqual(state(),{bandId:'',browsing:true})
  await traverse(router,-1); assert.deepEqual(state(),{bandId:'',browsing:false})
  await traverse(router,1); assert.equal(state().browsing,true)
  await traverse(router,1); assert.equal(state().bandId,'band-A')
})

test('featured card returns directly to landing and duplicate clicks do not add history', async () => {
  const {router,navigation,state} = await setup()
  await navigation.select('band-A'); await navigation.select('band-A')
  await traverse(router,-1); assert.equal(state().browsing,false)
  await traverse(router,1); assert.equal(state().bandId,'band-A')
  await navigation.home(); assert.equal(state().browsing,false)
  await traverse(router,-1); assert.equal(state().bandId,'band-A')
})

test('direct list/detail URLs survive initialization, preserve other query keys and allow leaving the site', async () => {
  const {router,navigation,state} = await setup('/VRCBandDB?band=band-A&test=1')
  assert.equal(state().bandId,'band-A')
  await navigation.browse(); assert.equal(router.currentRoute.value.query.test,'1')
  assert.deepEqual(state(),{bandId:'',browsing:true})
  await traverse(router,-1); assert.equal(state().bandId,'band-A')
  await traverse(router,-1); assert.equal(router.currentRoute.value.path,'/outside')
  assert.deepEqual(readBandNavigation({band:['a','b']}),{bandId:'',browsing:false})
})


test('disabled Discovery starts at list, preserves detail links and returns to list on back/home', async () => {
  const settings = {discoveryEnabled:false}
  const {router,navigation,state} = await setup('/VRCBandDB',settings)
  assert.deepEqual(state(),{bandId:'',browsing:true})
  await navigation.select('band-A')
  await traverse(router,-1); assert.deepEqual(state(),{bandId:'',browsing:true})
  await traverse(router,1); assert.equal(state().bandId,'band-A')
  await navigation.home(); assert.equal(router.currentRoute.value.query.view,'list')
  assert.deepEqual(state(),{bandId:'',browsing:true})
  const direct=await setup('/VRCBandDB?band=band-A',settings)
  assert.equal(direct.state().bandId,'band-A')
  assert.deepEqual(readBandNavigation({}, {discoveryEnabled:true}),{bandId:'',browsing:false})
})
