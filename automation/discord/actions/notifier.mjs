import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {validateConfig,validateJob,gasCall} from '../local/notifier.mjs'

const id=value=>typeof value==='string'&&/^\d{10,25}$/.test(value)
const nonce=value=>createHash('sha256').update(value).digest('hex').slice(0,24)
const marker=jobId=>'VRC Band DB notification: '+jobId
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))

async function discord(config,path,{method='GET',body}={},fetchImpl=fetch){
 let result
 try{result=await fetchImpl('https://discord.com/api/v10/channels/'+config.channelId+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bot '+config.token,'Content-Type':'application/json','User-Agent':'DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)'},...(body?{body:JSON.stringify(body)}:{})})}catch{throw Error('DISCORD_NETWORK_ERROR')}
 let data;try{data=await result.json()}catch{throw Error('DISCORD_INVALID_RESPONSE')}
 if(!result.ok)throw Error('DISCORD_HTTP_'+result.status+(Number.isSafeInteger(data?.code)?'_CODE_'+data.code:''))
 return data
}
function validMessage(message,config){return id(message?.id)&&message.author?.id===config.applicationId}
export async function findDelivered(config,jobId,fetchImpl=fetch){
 const messages=await discord(config,'/messages?limit=100',{},fetchImpl)
 if(!Array.isArray(messages))throw Error('INVALID_DISCORD_HISTORY')
 return messages.find(message=>validMessage(message,config)&&(message.nonce===nonce(jobId)||message.embeds?.some(embed=>embed.footer?.text===marker(jobId))))
}
export async function deliverActionJob(config,job,fetchImpl=fetch){
 validateJob(job,config)
 if(!job.messageId){const delivered=await findDelivered(config,job.id,fetchImpl);if(delivered)return {messageId:delivered.id,recovered:true}}
 const payload=structuredClone(job.payload)
 payload.allowed_mentions={parse:[]}
 if(!Array.isArray(payload.embeds)||!payload.embeds.length)throw Error('INVALID_NOTIFICATION_EMBEDS')
 payload.embeds[0].footer={text:marker(job.id)}
 if(!job.messageId){payload.nonce=nonce(job.id);payload.enforce_nonce=true}
 const message=await discord(config,'/messages'+(job.messageId?'/'+job.messageId:''),{method:job.messageId?'PATCH':'POST',body:payload},fetchImpl)
 if(!validMessage(message,config)||(job.messageId&&job.messageId!==message.id))throw Error('INVALID_DISCORD_MESSAGE')
 return {messageId:message.id,recovered:false}
}
export async function drain(config,{fetchImpl=fetch,wait=pause,maxJobs=20,log=console.log}={}){
 validateConfig(config)
 async function call(input){
  for(let attempt=0;attempt<3;attempt++){
   try{return await gasCall(config,input,fetchImpl)}catch(error){
    if(attempt===2||!['GAS_NETWORK_ERROR','GAS_BUSY_RETRY'].includes(error.message))throw error
    await wait((attempt+1)*1000)
   }
  }
 }
 let count=0
 for(;count<maxJobs;count++){
  const {job}=await call({kind:'local_claim'})
  if(!job){log('No pending notifications.');return {processed:count,idle:true}}
  const sent=await deliverActionJob(config,job,fetchImpl)
  // Retry the same acknowledgement; never claim another job after an uncertain acknowledgement.
  let acknowledged=false
  for(let attempt=0;attempt<3;attempt++){
   try{await call({kind:'local_ack',registrationId:job.registrationId,jobId:job.id,messageId:sent.messageId});acknowledged=true;break}catch(error){if(attempt===2)throw error;await wait((attempt+1)*1000)}
  }
  if(!acknowledged)throw Error('GAS_ACK_FAILED')
  log(sent.recovered?'Recovered an existing Discord notification and acknowledged it.':job.messageId?'Updated and acknowledged a Discord notification.':'Sent and acknowledged a Discord notification.')
 }
 return {processed:count,idle:false}
}
export async function smokeTest(config,runId,fetchImpl=fetch){
 validateConfig(config)
 if(!/^\d{1,25}$/.test(runId))throw Error('INVALID_TEST_RUN_ID')
 const jobId='actions-test-'+runId
 let message=await findDelivered(config,jobId,fetchImpl)
 if(!message)message=await discord(config,'/messages',{method:'POST',body:{content:'VRC Band DB｜GitHub Actions 通知テスト\nローカルPCを使わず、GitHub Actionsから送信しています。登録・審査状態は変更しません。',allowed_mentions:{parse:[]},nonce:nonce(jobId),enforce_nonce:true,embeds:[{title:'Actions通知の接続確認',description:'このメッセージは動作確認用です。バンド登録の通知ではありません。',footer:{text:marker(jobId)}}]}},fetchImpl)
 if(!validMessage(message,config))throw Error('INVALID_DISCORD_MESSAGE')
 const verified=await discord(config,'/messages/'+message.id,{},fetchImpl)
 if(!validMessage(verified,config)||!verified.embeds?.some(embed=>embed.footer?.text===marker(jobId)))throw Error('DISCORD_TEST_VERIFICATION_FAILED')
 return {messageId:verified.id}
}
export async function run(){
 const config=validateConfig({...JSON.parse(await readFile(new URL('../local/config.json',import.meta.url),'utf8')),token:process.env.DISCORD_NOTIFIER_BOT_TOKEN,secret:process.env.DISCORD_NOTIFIER_HMAC_SECRET})
 if(process.env.NOTIFIER_TEST==='true'){
  const {messageId}=await smokeTest(config,process.env.GITHUB_RUN_ID)
  console.log('Verified GitHub Actions test notification: '+messageId)
 }else{
  const result=await drain(config)
  console.log('Notification run complete. Processed: '+result.processed)
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await run()}catch(error){console.error(/^(GAS_|DISCORD_|INVALID_)[A-Z0-9_]+$/.test(error.message||'')?error.message:'NOTIFICATION_RUN_FAILED');process.exitCode=1}
}
