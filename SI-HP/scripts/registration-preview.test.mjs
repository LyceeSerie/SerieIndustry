import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'

const source = readFileSync(new URL('./registration-preview.js', import.meta.url), 'utf8')
function context(hostname = '127.0.0.1', store = new Map()) {
  return { window: {}, location: { hostname,search:'' }, URL,URLSearchParams,document: { documentElement: {}, addEventListener() {} }, localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }, crypto: { randomUUID }, structuredClone }
}
test('preview saves only locally and reloads saved edits', async () => {
  const store = new Map(), ctx = context('localhost', store)
  runInNewContext(source, ctx)
  const api = ctx.window.VBD_PREVIEW_API
  await api('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  const first = (await api('/api/me')).records[0]
  const saved = await api('/api/save', { registrationId: first.id, revision: first.revision, band: { '活動名': '変更テスト' } })
  assert.equal(saved.revision, 2)
  await assert.rejects(api('/api/save', { registrationId: first.id, revision: 1, band: {} }))
  const next = context('localhost', store)
  runInNewContext(source, next)
  assert.equal((await next.window.VBD_PREVIEW_API('/api/me')).records[0].band['活動名'], '変更テスト')
})
test('preview cannot bypass authentication on a public host', () => {
  const ctx = context('serieindustry.com')
  assert.throws(() => runInNewContext(source, ctx), /Local preview only/)
  assert.equal(ctx.window.VBD_PREVIEW_API, undefined)
})
test('local preview requires explicit consent and remembers it on reload',async()=>{
  const store=new Map(),ctx=context('localhost',store);runInNewContext(source,ctx)
  const api=ctx.window.VBD_PREVIEW_API
  assert.equal((await api('/api/me')).consentRequired,true)
  await assert.rejects(api('/api/save',{band:{}}))
  await assert.rejects(api('/api/consent',{accepted:false,version:'2026-11-21-v1'}))
  await api('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  const next=context('localhost',store);runInNewContext(source,next)
  assert.equal((await next.window.VBD_PREVIEW_API('/api/me')).consentRequired,false)
})
test('test role switch exposes all bands only in admin mode',async()=>{
  const normal=context();runInNewContext(source,normal);
  await normal.window.VBD_PREVIEW_API('/api/consent',{accepted:true,version:'2026-11-21-v1'});
  assert.equal((await normal.window.VBD_PREVIEW_API('/api/me')).records.length,1);
  await assert.rejects(normal.window.VBD_PREVIEW_API('/api/save',{registrationId:'00000000-0000-4000-8000-000000000002',revision:1,band:{}}));
  const admin=context();admin.location.search='?role=admin';runInNewContext(source,admin);
  await admin.window.VBD_PREVIEW_API('/api/consent',{accepted:true,version:'2026-11-21-v1'});
  const data=await admin.window.VBD_PREVIEW_API('/api/me');assert.equal(data.role,'admin');assert.equal(data.records.length,2);
  const saved=await admin.window.VBD_PREVIEW_API('/api/save',{registrationId:data.records[1].id,revision:1,band:{'活動名':'管理用編集'}});
  assert.equal(saved.source,'admin');
})
test('local delete is admin-only and persists a soft deletion across reloads',async()=>{
  const store=new Map(),admin=context('localhost',store);admin.location.search='?role=admin';runInNewContext(source,admin)
  const api=admin.window.VBD_PREVIEW_API;await api('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  const record=(await api('/api/me')).records[1],body={registrationId:record.id,revision:record.revision}
  const normal=context('localhost',store);runInNewContext(source,normal);await assert.rejects(normal.window.VBD_PREVIEW_API('/api/delete',body))
  await assert.rejects(api('/api/delete',{...body,revision:0}))
  await api('/api/delete',body);await api('/api/delete',body)
  const next=context('localhost',store);next.location.search='?role=admin';runInNewContext(source,next)
  assert.equal((await next.window.VBD_PREVIEW_API('/api/me')).records.some(item=>item.id===record.id),false)
  assert.ok([...store.values()].some(value=>value.includes('"status":"deleted"')))
})
test('admin personal mode lists only owned bands and saves new bands as user registrations',async()=>{
  const ctx=context();ctx.location.search='?role=admin';runInNewContext(source,ctx);const api=ctx.window.VBD_PREVIEW_API
  await api('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  const me=await api('/api/me?mode=user');assert.equal(me.canManage,true);assert.equal(me.role,'user');assert.equal(me.records.length,1)
  const saved=await api('/api/save',{mode:'user',band:{活動名:'個人として追加'}});assert.equal(saved.source,'user');assert.equal(saved.owner,'self')
  await assert.rejects(api('/api/delete',{mode:'user',registrationId:saved.id,revision:1}))
  const managed=await api('/api/me?mode=admin');assert.equal(managed.records.length,3)
  const normal=context();runInNewContext(source,normal);await normal.window.VBD_PREVIEW_API('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  assert.equal((await normal.window.VBD_PREVIEW_API('/api/me?mode=admin')).canManage,false)
})
test('local ownership transfer exposes unassigned admin bands to the target and preserves history on edits',async()=>{
  const ctx=context();ctx.location.search='?role=admin';runInNewContext(source,ctx);const api=ctx.window.VBD_PREVIEW_API
  await api('/api/consent',{accepted:true,version:'2026-11-21-v1'})
  const managed=await api('/api/me?mode=admin'),record=managed.records[1];assert.equal(record.ownerUserIds.length,0)
  const input={mode:'admin',registrationId:record.id,revision:record.revision,ownershipVersion:0,ownerId:managed.userId,requestId:randomUUID()}
  await assert.rejects(api('/api/assign-owner',{...input,mode:'user'}))
  const result=await api('/api/assign-owner',input);assert.equal(result.ownershipVersion,1);assert.equal(result.ownershipAudit.length,1)
  assert.equal((await api('/api/assign-owner',input)).ownershipAudit.length,1)
  assert.equal((await api('/api/me?mode=user')).records.length,2)
  await api('/api/save',{mode:'user',registrationId:record.id,revision:1,band:{活動名:'本人編集'}})
  const updated=(await api('/api/me?mode=admin')).records.find(item=>item.id===record.id)
  assert.equal(updated.source,'user');assert.equal(updated.ownershipVersion,1);assert.equal(updated.ownershipAudit.length,1)
})
