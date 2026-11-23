import test from 'node:test'
import assert from 'node:assert/strict'
import {gasHarness} from './gas-harness.mjs'
import {drain,deliverActionJob,smokeTest} from '../actions/notifier.mjs'

function fixture(){
 const h=gasHarness();h.properties.NOTIFICATION_TRANSPORT='local';h.properties.LOCAL_NOTIFY_SECRET='a'.repeat(64)
 h.context.initializeIntegration();h.setResponse('response1');h.context.runMaintenance()
 const config={gasUrl:'https://script.google.com/macros/s/test/exec',guildId:h.properties.DISCORD_GUILD_ID,channelId:h.properties.DISCORD_CHANNEL_ID,applicationId:h.properties.DISCORD_APPLICATION_ID,token:'fixture-secret-token',secret:h.properties.LOCAL_NOTIFY_SECRET}
 const messages=new Map(),requests=[],logs=[];let failAck=false,posts=0
 const fetchImpl=async(url,options)=>{
  requests.push({url,options})
  if(url===config.gasUrl){
   const input=JSON.parse(JSON.parse(options.body).payload)
   if(input.kind==='local_ack'&&failAck)throw Error('private network details')
   return Response.json(JSON.parse(h.context.doPost({postData:{contents:options.body}}).text))
  }
  const path=new URL(url).pathname
  if(options.method==='GET')return Response.json(url.includes('?')?[...messages.values()].reverse():messages.get(path.split('/').at(-1)))
  const payload=JSON.parse(options.body),id=options.method==='POST'?String(888888888888888000n+BigInt(++posts)):path.split('/').at(-1)
  const message={...payload,id,author:{id:config.applicationId}};messages.set(id,message);return Response.json(message)
 }
 return {h,config,messages,requests,logs,fetchImpl,options:{fetchImpl,wait:async()=>{},log:line=>logs.push(line)},failAck:value=>{failAck=value},posts:()=>posts}
}
test('Actions drains and acknowledges GAS outbox without a local file or public payload logs',async()=>{
 const f=fixture();const result=await drain(f.config,f.options)
 assert.deepEqual(result,{processed:1,idle:true});assert.equal(f.posts(),1)
 assert.equal(f.h.records()[0].noticeDirty,false);assert.ok(f.h.records()[0].messageId)
 assert.equal(f.h.state.requests.length,0)
 assert.equal(f.logs.join('').includes('fixture-secret'),false)
 assert.deepEqual((await drain(f.config,f.options)).processed,0)
})
test('lost acknowledgement across runners recovers message by durable notification marker instead of reposting',async()=>{
 const f=fixture();f.failAck(true)
 await assert.rejects(drain(f.config,f.options),/GAS_NETWORK_ERROR/);assert.equal(f.posts(),1)
 const store=f.h.context.repository_(f.h.properties),record=store.all()[0];record.localDelivery.until=0;store.save(record)
 f.failAck(false);await drain(f.config,f.options)
 assert.equal(f.posts(),1);assert.equal(f.h.records()[0].noticeDirty,false)
 assert.ok(f.logs.some(line=>line.startsWith('Recovered')))
})
test('existing notices are patched with disabled mentions, never replaced by a new message',async()=>{
 const f=fixture();await drain(f.config,f.options)
 const store=f.h.context.repository_(f.h.properties),record=store.all()[0];record.noticeDirty=true;store.save(record)
 await drain(f.config,f.options);assert.equal(f.posts(),1)
 const update=f.requests.find(request=>request.options.method==='PATCH')
 assert.ok(update);assert.deepEqual(JSON.parse(update.options.body).allowed_mentions,{parse:[]})
})
test('notification test posts then reads back one labeled message and never touches GAS registrations',async()=>{
 const f=fixture();const before=JSON.stringify(f.h.records())
 const sent=await smokeTest(f.config,'12345',f.fetchImpl)
 assert.ok(sent.messageId);assert.equal(f.posts(),1)
 assert.equal((await smokeTest(f.config,'12345',f.fetchImpl)).messageId,sent.messageId);assert.equal(f.posts(),1)
 assert.equal(JSON.stringify(f.h.records()),before)
 assert.equal(f.requests.some(request=>request.url===f.config.gasUrl),false)
 assert.match(f.messages.get(sent.messageId).content,/GitHub Actions 通知テスト/)
})
test('delivery validates queue destination and stops on Discord errors without acknowledging',async()=>{
 const f=fixture();let touched=false
 const record=f.h.records()[0]
 const job={id:record.id,registrationId:record.id,revision:1,kind:'current',channelId:'999999999999999999',applicationId:f.config.applicationId,payload:{embeds:[{title:'Test'}]}}
 await assert.rejects(deliverActionJob(f.config,job,async()=>{touched=true}),/INVALID_NOTIFICATION_JOB/);assert.equal(touched,false)
 await assert.rejects(drain(f.config,{...f.options,fetchImpl:async(url,options)=>url===f.config.gasUrl?f.fetchImpl(url,options):Response.json({code:40333,message:'private external details'},{status:403})}),/DISCORD_HTTP_403_CODE_40333/)
 assert.equal(f.h.records()[0].messageId,'')
 assert.equal(f.requests.some(request=>request.options.body?.includes('local_ack')),false)
})
