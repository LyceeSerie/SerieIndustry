import { boundedBody, gasFailure, forwardUpload } from './gas-transport.mjs'
export { boundedBody, forwardUpload } from './gas-transport.mjs'
import { signEnvelope } from './index.mjs'

const enc = new TextEncoder()
const validId = value => typeof value === 'string' && /^\d{10,25}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
import { IMAGE_LIMITS } from './image-limits.mjs'
export { IMAGE_LIMITS } from './image-limits.mjs'
const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob: https:; frame-src https://www.youtube-nocookie.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}
const json = (value,status=200) => Response.json(value,{status,headers})
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
const unb64 = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
async function key(secret) { return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']) }
export async function seal(value,secret,purpose) {
  const iv=crypto.getRandomValues(new Uint8Array(12))
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(purpose)},await key(secret),enc.encode(JSON.stringify(value)))
  return b64(iv)+'.'+b64(new Uint8Array(cipher))
}
export async function open(value,secret,purpose) {
  if(!value||value.length>4096)throw Error('LOGIN_REQUIRED')
  try {
    const parts=value.split('.');if(parts.length!==2)throw Error()
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(parts[0]),additionalData:enc.encode(purpose)},await key(secret),unb64(parts[1]))
    const result=JSON.parse(new TextDecoder().decode(data))
    if(!Number.isSafeInteger(result.exp)||result.exp<=Date.now()||result.exp>Date.now()+9*3600000)throw Error()
    return result
  }catch{throw Error('LOGIN_REQUIRED')}
}
function cookies(request) { return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(v=>v.trim().split(/=(.*)/s)).filter(parts=>parts.length>=2).map(([name,value])=>[name,value])) }
function cookie(name,value,age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}` }
function redirect(url,cookieValues=[]) { const h=new Headers(headers);h.set('Location',url);cookieValues.forEach(value=>h.append('Set-Cookie',value));return new Response(null,{status:302,headers:h}) }
const pendingLoginCookie = '__Host-vbd_login'
const loginResumePath = '/auth/complete'
const maxAutomaticLoginRounds = 3

async function pendingLogin(request,env) {
  const pending=await open(cookies(request)[pendingLoginCookie],env.PORTAL_SESSION_SECRET,'login')
  const value=pending.value
  if(!value||!validId(value.uid)||!uuid(value.sid)||!uuid(value.csrf)||typeof value.accessToken!=='string'
    ||!Number.isSafeInteger(value.exp)||value.exp<=Date.now()||value.exp>Date.now()+8*3600000
    ||!Number.isSafeInteger(pending.round)||pending.round<0)throw Error('LOGIN_REQUIRED')
  return pending
}

function loginWaitingPage(automatic,cookieValue) {
  const h=new Headers(headers)
  h.set('Content-Type','text/html;charset=utf-8')
  h.set('Retry-After','2')
  h.append('Set-Cookie',cookieValue)
  const message=automatic
    ? 'サーバーが別の処理を実行しています。この画面のままお待ちください。自動的に再試行します。'
    : 'サーバーの混雑が続いています。少し待ってから「再試行」を押してください。Discordの認証をやり直す必要はありません。'
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ログイン処理を待っています｜VRC Band DB</title><style>body{margin:0;padding:24px;background:#f5f6f3;color:#222;font:16px/1.8 system-ui,sans-serif}main{max-width:560px;margin:12vh auto;padding:24px;background:white;border:1px solid #ccd3c9;border-radius:12px}h1{font-size:20px}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:#21533e}</style><main><h1>ログイン処理を待っています</h1><p role="status">${message}</p><nav><a href="${loginResumePath}">再試行</a><a href="/auth/login">ログインからやり直す</a></nav></main>${automatic?`<script>setTimeout(()=>location.replace('${loginResumePath}'),2000)</script>`:''}</html>`,{status:503,headers:h})
}
async function session(request,env) {
  const value=await open(cookies(request)['__Host-vbd_session'],env.PORTAL_SESSION_SECRET,'session')
  if(!validId(value.uid)||!uuid(value.sid)||!uuid(value.csrf))throw Error('LOGIN_REQUIRED')
  return value
}
async function bodyJson(request,maximum=65536) {
  const bytes=await boundedBody(request,maximum)
  return JSON.parse(await new Response(bytes).text())
}
export async function portalGas(env,input,fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  // BUSY_RETRY means GAS did not acquire the lock: these reads/session upserts
  // can retry with the same identity and a fresh signed nonce. Never retry writes.
  const retries=['portal_list','portal_event_list','portal_session'].includes(input.kind)?2:0
  for(let attempt=0;attempt<=retries;attempt++){
    const envelope=await signEnvelope({...input,guildId:env.DISCORD_GUILD_ID,channelId:env.DISCORD_CHANNEL_ID},env.GAS_HMAC_SECRET)
    const result=await fetchImpl(env.GAS_WEBAPP_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),redirect:'follow',signal:AbortSignal.timeout(30000)})
    if(!result.ok)throw Error('GAS_CONNECTION_FAILED')
    const data=await result.json()
    if(!data.ok){
      if(data.code==='BUSY_RETRY'&&data.retryable===true&&attempt<retries){await wait((attempt+1)*1000);continue}
      throw gasFailure(data)
    }
    return data
  }
}
async function discordResult(result,label) {
  const data=await result.json()
  if(result.status===429){const error=Error(label+'_HTTP_429');const seconds=Number(result.headers.get('Retry-After')||data.retry_after);if(Number.isFinite(seconds)&&seconds>0)error.retryAfter=Math.min(86400,Math.ceil(seconds));console.warn(JSON.stringify({event:'discord_rate_limited',operation:label,scope:['user','global','shared'].includes(result.headers.get('X-RateLimit-Scope'))?result.headers.get('X-RateLimit-Scope'):'unknown',retryAfter:error.retryAfter||null,discordCode:Number.isSafeInteger(data.code)?data.code:null}));throw error}
  if(!result.ok)throw Error(label+'_HTTP_'+result.status+(Number.isSafeInteger(data.code)?'_CODE_'+data.code:''))
  return data
}
export async function portalRole(user,env,fetchImpl=fetch) {
  if(!user.accessToken)return 'user'; // Older sessions never gain management access.
  const response=await fetchImpl(`https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,{headers:{Authorization:'Bearer '+user.accessToken},redirect:'manual',signal:AbortSignal.timeout(15000)})
  if(response.status===404)return 'user';
  const member=await discordResult(response,'DISCORD_IDENTITY')
  if(!Array.isArray(member.roles))throw Error('DISCORD_IDENTITY_INVALID')
  const admins=(env.ADMIN_ROLE_IDS||'').split(',').map(value=>value.trim()).filter(validId)
  return member.roles.some(role=>admins.includes(role))?'admin':'user'
}
export async function handlePortal(request,env,ctx,editorHtml,fetchImpl=fetch,onSaved=()=>{}) {
  const url=new URL(request.url)
  if(env.PORTAL_ENABLED!=='true')return json({ok:false,code:'PORTAL_DISABLED'},503)
  if(!env.DISCORD_CLIENT_SECRET||!(env.PORTAL_SESSION_SECRET?.length>=32)||!env.GAS_HMAC_SECRET)return json({ok:false,code:'PORTAL_NOT_CONFIGURED'},503)
  const callback=url.origin+'/auth/callback'
  try {
    if(url.pathname==='/auth/logged-out'&&request.method==='GET')return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><title>ログアウト</title><h1>ログアウトしました</h1><a href="/auth/login">Discordでログイン</a></html>',{headers:{...headers,'Content-Type':'text/html;charset=utf-8'}});
    if(url.pathname==='/auth/login'&&request.method==='GET') {
      const state=crypto.randomUUID(),verifier=b64(crypto.getRandomValues(new Uint8Array(32)))
      const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier))))
      const target=new URL('https://discord.com/oauth2/authorize')
      target.search=new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID,redirect_uri:callback,response_type:'code',scope:'identify guilds.members.read',state,code_challenge:challenge,code_challenge_method:'S256'}).toString()
      return redirect(target.href,[cookie('__Host-vbd_oauth',await seal({state,verifier,exp:Date.now()+600000},env.PORTAL_SESSION_SECRET,'oauth'),600)])
    }
    if(url.pathname==='/auth/callback'&&request.method==='GET') {
      // A refreshed callback must not exchange a single-use Discord code again.
      if(!cookies(request)['__Host-vbd_oauth']) {
        try{await pendingLogin(request,env);return redirect(loginResumePath)}catch{}
        try{await session(request,env);return redirect('/VRCBandDB/register')}catch{}
      }
      const auth=await open(cookies(request)['__Host-vbd_oauth'],env.PORTAL_SESSION_SECRET,'oauth')
      if(auth.state!==url.searchParams.get('state')||!url.searchParams.get('code')||url.searchParams.has('error'))throw Error('OAUTH_STATE_MISMATCH')
      const token=await discordResult(await fetchImpl('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_APPLICATION_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:auth.verifier}).toString(),signal:AbortSignal.timeout(15000)}),'DISCORD_OAUTH')
      if(typeof token.access_token!=='string')throw Error('DISCORD_OAUTH_INVALID')
      const user=await discordResult(await fetchImpl('https://discord.com/api/users/@me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)}),'DISCORD_IDENTITY')
      if(!validId(user.id)||user.bot)throw Error('DISCORD_IDENTITY_INVALID')
      const value={uid:user.id,sid:crypto.randomUUID(),csrf:crypto.randomUUID(),accessToken:token.access_token,exp:Date.now()+Math.min(8*3600,Number(token.expires_in)||3600)*1000}
      // Commit a resumable encrypted identity before the contended GAS request.
      // OAuth tokens remain in HttpOnly cookies and never enter HTML or URLs.
      const pending={value,username:user.username,displayName:user.global_name||user.username,round:0,exp:Date.now()+600000}
      return redirect(loginResumePath,[cookie('__Host-vbd_oauth','',0),cookie(pendingLoginCookie,await seal(pending,env.PORTAL_SESSION_SECRET,'login'),600)])
    }
    if(url.pathname===loginResumePath&&request.method==='GET') {
      let pending
      try{pending=await pendingLogin(request,env)}catch{
        try{await session(request,env);return redirect('/VRCBandDB/register')}catch{}
        return redirect('/auth/login',[cookie(pendingLoginCookie,'',0)])
      }
      const value=pending.value
      try{
        await portalGas(env,{kind:'portal_session',actorRole:'user',actorId:value.uid,sessionId:value.sid,expires:value.exp,username:pending.username,displayName:pending.displayName},fetchImpl)
      }catch(error){
        if(error.message!=='BUSY_RETRY')throw error
        pending.round++
        console.warn(JSON.stringify({event:'portal_login_busy',round:pending.round}))
        return loginWaitingPage(pending.round<maxAutomaticLoginRounds,cookie(pendingLoginCookie,await seal(pending,env.PORTAL_SESSION_SECRET,'login'),Math.max(0,Math.floor((pending.exp-Date.now())/1000))))
      }
      return redirect('/VRCBandDB/register',[cookie(pendingLoginCookie,'',0),cookie('__Host-vbd_session',await seal(value,env.PORTAL_SESSION_SECRET,'session'),Math.max(0,Math.floor((value.exp-Date.now())/1000)))])
    }
    if(url.pathname==='/register'&&request.method==='GET')return redirect('/VRCBandDB/register'+url.search)
    if(['/VRCBandDB/register','/VRCBandDB/register/'].includes(url.pathname)&&request.method==='GET') {
      try{await session(request,env)}catch{
        try{await pendingLogin(request,env);return redirect(loginResumePath)}catch{}
        return redirect('/auth/login')
      }
      const page=editorHtml.replaceAll('運営登録JSONエディター','バンド登録・編集').replace('<script id="editor-core">','<script>window.VBD_PORTAL=true;</script><script id="editor-core">')
      return new Response(page,{headers:{...headers,'Content-Type':'text/html;charset=utf-8'}})
    }
    const user=await session(request,env)
    if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('X-CSRF-Token')!==user.csrf))throw Error('CSRF_REJECTED')
    const base={actorRole:'user',actorId:user.uid,sessionId:user.sid}
    if(url.pathname==='/api/me'&&request.method==='GET') {
      const personal=url.searchParams.get('mode')==='user'
      const role=personal?'user':await portalRole(user,env,fetchImpl)
      const managed=role==='admin'
      const canManage=personal?user.canManage===true:managed
      const data=await portalGas(env,{...base,portalAdmin:managed,kind:'portal_list'},fetchImpl)
      const response=json({ok:true,userId:user.uid,role:managed?'admin':'user',canManage,csrf:user.csrf,records:data.records,eventsEnabled:data.eventsEnabled===true,...(managed?{users:data.users||[]}:{}),consentRequired:data.consentRequired===true,termsVersion:data.termsVersion,limits:IMAGE_LIMITS})
      if(!personal)response.headers.append('Set-Cookie',cookie('__Host-vbd_session',await seal({...user,canManage},env.PORTAL_SESSION_SECRET,'session'),Math.max(0,Math.floor((user.exp-Date.now())/1000))))
      return response
    }
    if(url.pathname==='/api/events'&&request.method==='GET'){
      const role=url.searchParams.get('mode')==='user'?'user':await portalRole(user,env,fetchImpl)
      return json(await portalGas(env,{...base,portalAdmin:role==='admin',kind:'portal_event_list'},fetchImpl))
    }
    if(['/api/events/save','/api/events/delete'].includes(url.pathname)&&request.method==='POST'){
      const body=await bodyJson(request),role=body.mode==='user'?'user':await portalRole(user,env,fetchImpl)
      const saving=url.pathname==='/api/events/save'
      return json(await portalGas(env,{...base,portalAdmin:role==='admin',kind:saving?'portal_event_save':'portal_event_delete',event:saving?body.event:undefined,eventId:saving?undefined:body.eventId,revision:body.revision,requestId:body.requestId},fetchImpl))
    }
    if(url.pathname==='/api/logout'&&request.method==='POST') {
      await portalGas(env,{...base,kind:'portal_logout'},fetchImpl)
      const h=new Headers(headers);h.set('Content-Type','application/json');h.append('Set-Cookie',cookie('__Host-vbd_session','',0));h.append('Set-Cookie',cookie(pendingLoginCookie,'',0));return new Response('{"ok":true}',{headers:h})
    }
    if(url.pathname==='/api/consent'&&request.method==='POST') {
      const body=await bodyJson(request,4096)
      return json(await portalGas(env,{...base,kind:'portal_consent',accepted:body.accepted===true,version:body.version},fetchImpl))
    }
    if(url.pathname==='/api/save'&&request.method==='POST') {
      const body=await bodyJson(request)
      const role=body.mode==='user'?'user':await portalRole(user,env,fetchImpl)
      const data=await portalGas(env,{...base,portalAdmin:role==='admin'&&body.mode!=='user',kind:'portal_save',registrationId:body.registrationId||'',revision:body.revision,submissionId:body.submissionId,band:body.band},fetchImpl)
      ctx.waitUntil(Promise.resolve(onSaved(env)).catch(()=>{}))
      return json(data)
    }
    if(url.pathname==='/api/delete'&&request.method==='POST') {
      const body=await bodyJson(request,4096)
      if(body.mode==='user'||await portalRole(user,env,fetchImpl)!=='admin')throw Error('PORTAL_FORBIDDEN')
      const data=await portalGas(env,{...base,portalAdmin:true,kind:'portal_delete',registrationId:body.registrationId,revision:body.revision,requestId:body.requestId},fetchImpl)
      ctx.waitUntil(Promise.resolve(onSaved(env)).catch(()=>{}))
      return json(data)
    }
    if(url.pathname==='/api/assign-owner'&&request.method==='POST'){
      const body=await bodyJson(request,4096)
      if(body.mode==='user'||await portalRole(user,env,fetchImpl)!=='admin')throw Error('PORTAL_FORBIDDEN')
      const data=await portalGas(env,{...base,portalAdmin:true,kind:'portal_assign_owner',registrationId:body.registrationId,revision:body.revision,ownershipVersion:body.ownershipVersion,ownerId:body.ownerId,requestId:body.requestId},fetchImpl)
      ctx.waitUntil(Promise.resolve(onSaved(env)).catch(()=>{}));return json(data)
    }
    if(url.pathname==='/api/upload-ticket'&&request.method==='POST') {
      const body=await bodyJson(request,4096),limit=IMAGE_LIMITS[body.field]
      if(!limit||!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>limit.bytes||!/^[a-f0-9]{64}$/.test(body.sha256||'')||!uuid(body.uploadId))throw Error('INVALID_IMAGE')
      const diagnosticAdmin=body.mode==='admin'&&await portalRole(user,env,fetchImpl)==='admin'
      const ticket=await signEnvelope({...base,kind:'portal_upload',diagnosticAdmin,field:body.field,bytes:body.bytes,sha256:body.sha256,uploadId:body.uploadId,guildId:env.DISCORD_GUILD_ID,channelId:env.DISCORD_CHANNEL_ID},env.GAS_HMAC_SECRET)
      return json({ok:true,ticket})
    }
    if(url.pathname==='/api/upload'&&request.method==='POST') {
      // Forward the bounded stream without decoding or hashing the large image on Workers Free.
      return json(await forwardUpload(request,env,fetchImpl))
    }
    return json({ok:false,code:'NOT_FOUND'},404)
  }catch(error) {
    const safe=/^(?:PORTAL_[A-Z_]+|LOGIN_REQUIRED|CSRF_REJECTED|OAUTH_STATE_MISMATCH|DISCORD_(?:OAUTH|IDENTITY)(?:_HTTP_\d{3}(?:_CODE_\d+)?|_INVALID)|GAS_CONNECTION_FAILED|GAS_REJECTED|OPERATION_REJECTED|BUSY_RETRY|INTEGRATION_DISABLED|REPLAY|WRONG_DESTINATION|STALE_EVENT|EVENT_[A-Z_]+|STALE_EDIT|STALE_OWNERSHIP|STALE_DELETE|NOT_FOUND|INVALID_[A-Z_]+|BODY_TOO_LARGE|UPLOAD_[A-Z_]+|UPLOAD_GAS_HTTP_\d{3}|REGISTRATION_DELETED|MISSING_BAND_NAME|ANSWER_TOO_LONG)$/.test(error.message)?error.message:error.name==='SyntaxError'?'PORTAL_RESPONSE_INVALID_JSON':['AbortError','TimeoutError'].includes(error.name)?'PORTAL_UPSTREAM_TIMEOUT':error.name==='TypeError'?'PORTAL_TRANSPORT_FAILED':'PORTAL_REQUEST_FAILED'
    const requestId=crypto.randomUUID(),operation=['/api/upload','/api/upload-ticket','/api/save','/api/me','/api/delete','/auth/callback'].includes(url.pathname)?url.pathname:'portal'
    console.warn(JSON.stringify({event:'portal_request_failed',code:safe,requestId,operation}))
    const response=json({ok:false,code:safe,requestId,operation,...(error.retryAfter?{retryAfter:error.retryAfter}:{}),...(error.diagnostic?{diagnostic:error.diagnostic}:{})},safe==='LOGIN_REQUIRED'?401:/_HTTP_429$/.test(safe)?429:400)
    if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter))
    return response
  }
}
