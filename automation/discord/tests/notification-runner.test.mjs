import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { drainNotifications } from '../worker/src/notification-runner.mjs'
const env={NOTIFICATION_RUNNER_ENABLED:'true',DISCORD_BOT_TOKEN:'test-token',LOCAL_NOTIFY_SECRET:'test-secret-'.repeat(6),DISCORD_GUILD_ID:'222222222222222222',DISCORD_CHANNEL_ID:'333333333333333333',DISCORD_APPLICATION_ID:'111111111111111111',GAS_WEBAPP_URL:'https://script.google.com/macros/s/test/exec'}
const job={id:'11111111-1111-4111-8111-111111111111',registrationId:'22222222-2222-4222-8222-222222222222',revision:1,channelId:env.DISCORD_CHANNEL_ID,applicationId:env.DISCORD_APPLICATION_ID,messageId:'',payload:{content:'notice',allowed_mentions:{parse:[]}}}
test('cloud notifier claims and acknowledges only successful Discord posts using the same nonce as local notifier',async()=>{
  const inputs=[];let claims=0
  const result=await drainNotifications(env,async(url,options)=>{
    if(url===env.GAS_WEBAPP_URL){const input=JSON.parse(JSON.parse(options.body).payload);inputs.push(input);return Response.json(input.kind==='local_claim'?{ok:true,job:claims++?null:job}:{ok:true})}
    const body=JSON.parse(options.body);assert.equal(body.nonce,createHash('sha256').update(job.id).digest('hex').slice(0,24));assert.equal(body.enforce_nonce,true);assert.equal(options.redirect,'manual')
    return Response.json({id:'777777777777777777',author:{id:env.DISCORD_APPLICATION_ID}})
  })
  assert.equal(result.sent,1);assert.ok(inputs.some(input=>input.kind==='local_ack'))
})
test('Discord rejection leaves the durable job unacknowledged; feature flag does not make calls',async()=>{
  const inputs=[]
  const result=await drainNotifications(env,async(url,options)=>{
    if(url===env.GAS_WEBAPP_URL){const input=JSON.parse(JSON.parse(options.body).payload);inputs.push(input);return Response.json({ok:true,job})}
    return Response.json({code:40333,message:'private remote details'},{status:403})
  })
  assert.equal(result.code,'DISCORD_HTTP_403_CODE_40333');assert.equal(inputs.some(input=>input.kind==='local_ack'),false)
  assert.equal((await drainNotifications({...env,NOTIFICATION_RUNNER_ENABLED:'false'},()=>{throw Error('must not call')})).disabled,true)
})
