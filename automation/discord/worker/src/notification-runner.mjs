import { signEnvelope } from './index.mjs'

export async function drainNotifications(env, fetchImpl=fetch) {
  if(env.NOTIFICATION_RUNNER_ENABLED!=='true')return {sent:0,disabled:true}
  if(!env.DISCORD_BOT_TOKEN||!env.LOCAL_NOTIFY_SECRET) return {sent:0,code:'NOTIFICATION_NOT_CONFIGURED'}
  let sent=0
  async function gas(input) {
    const envelope=await signEnvelope({...input,guildId:env.DISCORD_GUILD_ID,channelId:env.DISCORD_CHANNEL_ID},env.LOCAL_NOTIFY_SECRET)
    const response=await fetchImpl(env.GAS_WEBAPP_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),redirect:'follow',signal:AbortSignal.timeout(30000)})
    const body=await response.json();if(!response.ok||!body.ok)throw Error('NOTIFICATION_GAS_REJECTED');return body
  }
  try {
    for(let index=0;index<2;index++) {
      const {job}=await gas({kind:'local_claim'})
      if(!job)return {sent}
      if(!/^[a-f0-9-]{36}$/i.test(job.id||'')||job.channelId!==env.DISCORD_CHANNEL_ID||job.applicationId!==env.DISCORD_APPLICATION_ID||(job.messageId&&!/^\d{10,25}$/.test(job.messageId))||!job.payload)throw Error('INVALID_NOTIFICATION_JOB')
      const payload={...job.payload}
      if(!job.messageId) {
        payload.nonce=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(job.id)))].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,24)
        payload.enforce_nonce=true
      }
      const response=await fetchImpl('https://discord.com/api/v10/channels/'+env.DISCORD_CHANNEL_ID+'/messages'+(job.messageId?'/'+job.messageId:''),{method:job.messageId?'PATCH':'POST',headers:{'Content-Type':'application/json',Authorization:'Bot '+env.DISCORD_BOT_TOKEN},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(15000)})
      const message=await response.json()
      if(!response.ok)throw Error('DISCORD_HTTP_'+response.status+(Number.isSafeInteger(message.code)?'_CODE_'+message.code:''))
      if(!/^\d{10,25}$/.test(message.id||'')||message.author?.id!==env.DISCORD_APPLICATION_ID)throw Error('INVALID_DISCORD_MESSAGE')
      await gas({kind:'local_ack',jobId:job.id,registrationId:job.registrationId,messageId:message.id})
      sent++
    }
    return {sent}
  }catch(error) {
    const code=/^(?:DISCORD_HTTP_\d{3}(?:_CODE_\d+)?|NOTIFICATION_GAS_REJECTED|INVALID_NOTIFICATION_JOB|INVALID_DISCORD_MESSAGE)$/.test(error.message)?error.message:'NOTIFICATION_NETWORK_FAILED'
    console.warn(JSON.stringify({event:'worker_notification_failed',code}))
    return {sent,code}
  }
}
