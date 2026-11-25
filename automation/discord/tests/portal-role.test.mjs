import test from 'node:test'
import assert from 'node:assert/strict'
import { createRoleChecker } from '../worker/src/portal-role.mjs'

const user={uid:'user',sid:'session',accessToken:'token'}
const env={DISCORD_APPLICATION_ID:'app',DISCORD_GUILD_ID:'guild',ADMIN_ROLE_IDS:'admin'}
const cached={allowCache:true}

test('only reads reuse a bounded role result; writes recheck and a revoked grant replaces the cached role',async()=>{
  let time=1000,calls=0,role='admin'
  const check=createRoleChecker(async()=>{calls++;return role},{now:()=>time})
  assert.equal(await check(user,env,null,cached),'admin')
  time+=29999
  assert.equal(await check(user,env,null,cached),'admin');assert.equal(calls,1)
  time++
  await check(user,env,null,cached);assert.equal(calls,2)
  role='user'
  assert.equal(await check({...user,canManage:true,role:'admin'},env,null),'user');assert.equal(calls,3)
  assert.equal(await check(user,env,null,cached),'user');assert.equal(calls,3)
  assert.equal(await check({canManage:true},env,null,cached),'user');assert.equal(calls,3)
})

test('parallel reads share one check while concurrent writes never use a cached/in-flight grant',async()=>{
  let calls=0,resolve,firstStarted,writeStarted
  const started=new Promise(done=>{firstStarted=done})
  const writing=new Promise(done=>{writeStarted=done})
  const gate=new Promise(done=>{resolve=done})
  const check=createRoleChecker(async()=>{calls++;if(calls===1)firstStarted();else writeStarted();await gate;return 'admin'})
  const first=check(user,env,null,cached),second=check(user,env,null,cached)
  await started;assert.equal(calls,1)
  const write=check(user,env,null)
  await writing;assert.equal(calls,2)
  resolve()
  assert.deepEqual(await Promise.all([first,second,write]),['admin','admin','admin'])
})

test('tokens, sessions, users, guilds and role configuration never share cached grants; cache size is bounded',async()=>{
  let calls=0
  const check=createRoleChecker(async()=>{calls++;return 'admin'},{maxEntries:2})
  await check(user,env,null,cached)
  for(const [otherUser,otherEnv] of [
    [{...user,accessToken:'other'},env], [{...user,sid:'other'},env], [{...user,uid:'other'},env],
    [user,{...env,DISCORD_GUILD_ID:'other'}], [user,{...env,ADMIN_ROLE_IDS:'other'}],
  ]) await check(otherUser,otherEnv,null,cached)
  assert.equal(calls,6)
  await check(user,env,null,cached);assert.equal(calls,7)
})

test('a failed fresh check discards old privileges; 429 respects Retry-After without calling Discord again',async()=>{
  let time=1000,calls=0,failure='',role='admin'
  const check=createRoleChecker(async()=>{
    calls++
    if(failure){const error=Error(failure);error.retryAfter=20;throw error}
    return role
  },{now:()=>time})
  await check(user,env,null,cached)
  failure='DISCORD_IDENTITY_HTTP_429'
  await assert.rejects(check(user,env,null),/429/)
  for(const options of [cached,{}])await assert.rejects(check(user,env,null,options),error=>error.retryAfter===20)
  assert.equal(calls,2)
  time+=20000;failure='';role='user'
  assert.equal(await check(user,env,null,cached),'user');assert.equal(calls,3)
  failure='DISCORD_IDENTITY_HTTP_403'
  await assert.rejects(check(user,env,null),/403/)
  await assert.rejects(check(user,env,null,cached),/403/);assert.equal(calls,5)
})
