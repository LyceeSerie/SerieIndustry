import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHmac, createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { handlePortal, seal, open, boundedBody, portalRole, forwardUpload, portalGas } from '../worker/src/portal.mjs'
import { signEnvelope } from '../worker/src/index.mjs'
import { gasHarness } from './gas-harness.mjs'

const uid='666666666666666666'
const env={PORTAL_ENABLED:'true',DISCORD_CLIENT_SECRET:'oauth-test-secret',PORTAL_SESSION_SECRET:'test-session-secret-'.repeat(3),GAS_HMAC_SECRET:'test-gas-secret-'.repeat(3),DISCORD_APPLICATION_ID:'111111111111111111',DISCORD_GUILD_ID:'222222222222222222',DISCORD_CHANNEL_ID:'333333333333333333',GAS_WEBAPP_URL:'https://script.google.com/macros/s/test/exec'}
async function login() { const value={uid,sid:randomUUID(),csrf:randomUUID(),exp:Date.now()+3600000};return {...value,cookie:'__Host-vbd_session='+await seal(value,env.PORTAL_SESSION_SECRET,'session')} }
function request(path,user,body,extra={}) { return new Request('https://portal.test'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:user?.cookie||'',...(body===undefined?{}:{Origin:'https://portal.test','X-CSRF-Token':user.csrf,'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)}) }
const noIO=()=>{throw Error('unexpected I/O')}
test('image stream is sent once and Google result redirects are fetched as GET without a body',async()=>{
  const calls=[],request=new Request('https://portal.test/api/upload',{method:'POST',body:'image-json'})
  const data=await forwardUpload(request,env,async(url,options)=>{
    calls.push({url,options})
    assert.equal(options.redirect,'manual')
    if(calls.length===1){assert.equal(await new Response(options.body).text(),'image-json');return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?result=one-time'}})}
    assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.headers,undefined)
    return Response.json({ok:true,url:'https://drive.google.com/file/d/test/view'})
  })
  assert.equal(data.ok,true);assert.equal(calls.length,2)
  for(const location of ['https://evil.test/','https://script.googleusercontent.com.evil.test/','https://user:secret@script.googleusercontent.com/']){
    let count=0;await assert.rejects(forwardUpload(new Request('https://portal.test',{method:'POST',body:'x'}),env,async()=>{count++;return new Response(null,{status:302,headers:{Location:location}})}),/UPLOAD_GAS_REDIRECT_INVALID/);assert.equal(count,1)
  }
  await assert.rejects(forwardUpload(new Request('https://portal.test',{method:'POST',body:'x'}),env,async()=>new Response('<html>error</html>')),/UPLOAD_GAS_RESPONSE_INVALID/)
})
test('portal retains safe GAS failure codes and gives failures a non-sensitive diagnostic ID',async()=>{
  const user=await login()
  const response=await handlePortal(request('/api/upload',user,{uploadTicket:{},dataBase64:'AA=='}),env,{},'',async()=>Response.json({ok:false,code:'OPERATION_REJECTED'}))
  const data=await response.json();assert.equal(data.code,'OPERATION_REJECTED');assert.equal(data.operation,'/api/upload');assert.match(data.requestId,/^[a-f0-9-]{36}$/)
  const failed=await handlePortal(request('/api/upload',user,{uploadTicket:{},dataBase64:'AA=='}),env,{},'',async()=>{throw new TypeError('private payload must not be logged or returned')})
  const text=await failed.text();assert.match(text,/PORTAL_TRANSPORT_FAILED/);assert.doesNotMatch(text,/private payload/)
})
test('GAS save diagnostics expose only a fixed stage, error type and source location',async()=>{
  const {h,call,session}=backend();await session()
  h.context.runtime_=()=>({userSubmit(){throw new ReferenceError('private source data must not appear')}})
  const data=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'診断'}})
  assert.equal(data.code,'OPERATION_REJECTED');assert.equal(data.diagnostic.stage,'SAVE_BAND');assert.equal(data.diagnostic.type,'ReferenceError');assert.doesNotMatch(JSON.stringify(data),/private source/)
  const user=await login()
  const result=await (await handlePortal(request('/api/save',user,{band:{}}),env,{},'',async()=>Response.json({ok:false,code:'OPERATION_REJECTED',diagnostic:{type:'ReferenceError',stage:'SAVE_BAND',locations:['Core:245:7','private payload']}}))).json()
  assert.deepEqual(result.diagnostic.locations,['Core:245:7'])
})

test('Discord role check grants only configured admins and fails closed on API errors',async()=>{
  const config={...env,ADMIN_ROLE_IDS:'1572585514404413511'},user={accessToken:'private-token'}
  const check=roles=>portalRole(user,config,async(url,options)=>{assert.match(url,/users\/@me\/guilds\/.+\/member$/);assert.equal(options.headers.Authorization,'Bearer private-token');return Response.json({roles})})
  assert.equal(await check(['1572585514404413511']),'admin')
  assert.equal(await check(['1572821971165646938']),'user')
  assert.equal(await check([]),'user')
  assert.equal(await portalRole(user,config,async()=>Response.json({code:10007},{status:404})),'user')
  await assert.rejects(portalRole(user,config,async()=>Response.json({code:0},{status:403})))
  assert.equal(await portalRole({},config,noIO),'user')
})

test('save ignores client role and refreshes real admin role for each write',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
  for(const roles of [['1572585514404413511'],[]]){
    let signed;
    const result=await handlePortal(request('/api/save',user,{portalAdmin:true,actorRole:'admin',submissionId:randomUUID(),band:{活動名:'test'}}),{...env,ADMIN_ROLE_IDS:'1572585514404413511'},{waitUntil(){}},'',async(url,options)=>{
      if(url.includes('/member'))return Response.json({roles});
      signed=JSON.parse(JSON.parse(options.body).payload);return Response.json({ok:true});
    });
    assert.equal(result.status,200);assert.equal(signed.portalAdmin,roles.length>0);assert.equal(signed.actorRole,'user');
  }
})
test('admins can choose personal mode without granting that choice any extra privileges',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
  const config={...env,ADMIN_ROLE_IDS:'1572585514404413511'}
  for(const roles of [['1572585514404413511'],[]]){
    const inputs=[];const fetcher=async(url,options)=>{if(url.endsWith('/member'))return Response.json({roles});inputs.push(JSON.parse(JSON.parse(options.body).payload));return Response.json({ok:true,records:[]})}
    const me=await (await handlePortal(request('/api/me?mode=user',user),config,{},'',fetcher)).json()
    assert.equal(me.role,'user');assert.equal(me.canManage,false);assert.equal(inputs[0].portalAdmin,false)
    await handlePortal(request('/api/save',user,{mode:'user',portalAdmin:true,submissionId:randomUUID(),band:{活動名:'個人'}}),config,{waitUntil(){}},'',fetcher)
    assert.equal(inputs[1].portalAdmin,false)
    const elevated=await (await handlePortal(request('/api/me?mode=admin',user),config,{},'',fetcher)).json()
    assert.equal(elevated.role,roles.length?'admin':'user')
  }
})
test('ownership transfer requires a real admin in management mode',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
  const config={...env,ADMIN_ROLE_IDS:'1572585514404413511'},body={registrationId:randomUUID(),ownerId:'888888888888888888',revision:1,ownershipVersion:0,requestId:randomUUID()}
  for(const roles of [[],['1572585514404413511']])for(const mode of ['user','admin']){
    let signed;
    const result=await handlePortal(request('/api/assign-owner',user,{...body,mode,portalAdmin:true}),config,{waitUntil(){}},'',async(url,options)=>{if(url.endsWith('/member'))return Response.json({roles});signed=JSON.parse(JSON.parse(options.body).payload);return Response.json({ok:true})})
    if(mode==='admin'&&roles.length){assert.equal(result.status,200);assert.equal(signed.kind,'portal_assign_owner');assert.equal(signed.ownerId,body.ownerId);assert.equal(signed.actorId,uid)}else{assert.equal((await result.json()).code,'PORTAL_FORBIDDEN');assert.equal(signed,undefined)}
  }
})
test('delete refreshes Discord role and refuses forged admin flags before GAS',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
  const input={registrationId:randomUUID(),revision:1,requestId:randomUUID(),portalAdmin:true};let calls=0
  const denied=await handlePortal(request('/api/delete',user,input),{...env,ADMIN_ROLE_IDS:'1572585514404413511'},{},'',async()=>{calls++;return Response.json({roles:[]})})
  assert.equal((await denied.json()).code,'PORTAL_FORBIDDEN');assert.equal(calls,1)
  let signed
  const allowed=await handlePortal(request('/api/delete',user,input),{...env,ADMIN_ROLE_IDS:'1572585514404413511'},{waitUntil(){}},'',async(url,options)=>{
    if(url.endsWith('/member'))return Response.json({roles:['1572585514404413511']});signed=JSON.parse(JSON.parse(options.body).payload);return Response.json({ok:true})
  })
  assert.equal(allowed.status,200);assert.equal(signed.kind,'portal_delete');assert.equal(signed.portalAdmin,true);assert.equal(signed.actorId,uid)
})

test('encrypted sessions reject tampering, wrong purpose and expiration; anonymous/CSRF requests make no calls',async()=>{
  const user=await login(),encoded=user.cookie.split('=')[1]
  assert.equal((await open(encoded,env.PORTAL_SESSION_SECRET,'session')).uid,uid)
  await assert.rejects(open(encoded,env.PORTAL_SESSION_SECRET,'oauth'))
  await assert.rejects(open(encoded.slice(0,-5)+'AAAAA',env.PORTAL_SESSION_SECRET,'session'))
  await assert.rejects(open(await seal({exp:Date.now()-1000},env.PORTAL_SESSION_SECRET,'session'),env.PORTAL_SESSION_SECRET,'session'))
  assert.equal((await handlePortal(request('/api/me'),env,{},'',noIO)).status,401)
  for(const headers of [{Origin:'https://evil.test'},{'X-CSRF-Token':'wrong'}])assert.equal((await (await handlePortal(request('/api/save',user,{},headers),env,{},'',noIO)).json()).code,'CSRF_REJECTED')
})

test('OAuth uses state and PKCE, derives identity from Discord and never returns its access token',async()=>{
  const start=await handlePortal(new Request('https://portal.test/auth/login'),env,{},'',noIO)
  const target=new URL(start.headers.get('Location'))
  assert.equal(target.searchParams.get('scope'),'identify guilds.members.read');assert.equal(target.searchParams.get('code_challenge_method'),'S256')
  const cookie=start.headers.get('Set-Cookie').split(';')[0],calls=[]
  const callback=new Request('https://portal.test/auth/callback?code=code&state='+target.searchParams.get('state'),{headers:{Cookie:cookie}})
  const fetcher=async(url,options)=>{
    calls.push({url,options})
    if(url.endsWith('/oauth2/token'))return Response.json({access_token:'private-discord-access-token'})
    if(url.endsWith('/users/@me'))return Response.json({id:uid,username:'display-name'})
    return Response.json({ok:true})
  }
  const result=await handlePortal(callback,env,{},'',fetcher)
  assert.equal(result.status,302);assert.equal(result.headers.get('Location'),'/auth/complete')
  assert.match(result.headers.get('Set-Cookie'),/HttpOnly/);assert.equal(result.headers.get('Set-Cookie').includes('private-discord-access-token'),false)
  assert.equal(calls.length,2)
  const pendingCookie=result.headers.getSetCookie().find(value=>value.startsWith('__Host-vbd_login=')).split(';')[0]
  const complete=await handlePortal(new Request('https://portal.test/auth/complete',{headers:{Cookie:pendingCookie}}),env,{},'',fetcher)
  assert.equal(complete.status,302);assert.equal(complete.headers.get('Location'),'/VRCBandDB/register')
  assert.match(complete.headers.get('Set-Cookie'),/__Host-vbd_session=/)
  const input=JSON.parse(JSON.parse(calls[2].options.body).payload)
  assert.equal(input.actorId,uid);assert.equal(input.kind,'portal_session');assert.equal(input.username,'display-name');assert.equal(input.displayName,'display-name')
  assert.ok(new URLSearchParams(calls[0].options.body).get('code_verifier'))
  const wrong=new Request('https://portal.test/auth/callback?code=x&state=wrong',{headers:{Cookie:cookie}})
  assert.equal((await (await handlePortal(wrong,env,{},'',noIO)).json()).code,'OAUTH_STATE_MISMATCH')
})

test('portal save ignores forged identity, signs trusted identity and upload streams are bounded',async()=>{
  const user=await login(),calls=[],tasks=[]
  const result=await handlePortal(request('/api/save',user,{actorId:'999999999999999999',registrationId:'id',revision:2,submissionId:randomUUID(),band:{活動名:'test'}}),env,{waitUntil:p=>tasks.push(p)},'',async(url,options)=>{calls.push(options);return Response.json({ok:true,id:'id',revision:3,status:'pending'})})
  assert.equal(result.status,200)
  const envelope=JSON.parse(calls[0].body),input=JSON.parse(envelope.payload)
  assert.equal(input.actorId,uid);assert.equal(input.sessionId,user.sid)
  assert.equal(envelope.signature,createHmac('sha256',env.GAS_HMAC_SECRET).update(`${envelope.timestamp}\n${envelope.nonce}\n${envelope.payload}`).digest('hex'))
  const image={field:'アイコン',bytes:70,sha256:'a'.repeat(64),uploadId:randomUUID()}
  const ticket=await (await handlePortal(request('/api/upload-ticket',user,image),env,{},'',noIO)).json()
  assert.equal(JSON.parse(ticket.ticket.payload).actorId,uid)
  assert.equal((await (await handlePortal(request('/api/upload-ticket',user,{...image,bytes:524289}),env,{},'',noIO)).json()).code,'INVALID_IMAGE')
  const text=JSON.stringify({uploadTicket:ticket.ticket,dataBase64:'sample'})
  const upload=request('/api/upload',user,JSON.parse(text))
  await handlePortal(upload,env,{},'',async(url,options)=>{assert.equal(await new Response(options.body).text(),text);return Response.json({ok:true,url:'image'})})
  await assert.rejects(new Response(boundedBody(new Request('https://portal.test',{method:'POST',body:'12345678'}),7)).text(),/BODY_TOO_LARGE/)
  await Promise.all(tasks)
})

function backend() {
  const h=gasHarness();h.properties.PORTAL_ENABLED='true';h.context.initializeIntegration()
  let sequence=800000000000000000n
  async function call(input,actor=uid,sessionId='11111111-1111-4111-8111-'+actor.slice(-12),image) {
    const envelope=await signEnvelope({kind:'portal_list',actorRole:'user',actorId:actor,sessionId,guildId:h.properties.DISCORD_GUILD_ID,channelId:h.properties.DISCORD_CHANNEL_ID,...input},h.properties.GAS_HMAC_SECRET)
    return JSON.parse(h.context.doPost({postData:{contents:JSON.stringify(image===undefined?envelope:{uploadTicket:envelope,dataBase64:image})}}).text)
  }
  async function session(actor=uid,sid='11111111-1111-4111-8111-'+actor.slice(-12),consent=true){await call({kind:'portal_session',expires:Date.now()+3600000},actor,sid);return consent?call({kind:'portal_consent',accepted:true,version:'2026-11-21-v1'},actor,sid):{ok:true}}
  async function admin(input){return call({actorRole:'admin',actorId:uid,interactionId:String(++sequence),channelId:'1572821384353288252',...input})}
  return {h,call,session,admin}
}

test('initial consent is required for save/upload, recorded once per account and version, and never published',async()=>{
  const {h,call,session}=backend();await session(uid,undefined,false)
  const me=await call({});assert.equal(me.consentRequired,true);assert.deepEqual(me.records,[])
  assert.equal((await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'未同意'}})).code,'PORTAL_CONSENT_REQUIRED')
  assert.equal((await call({kind:'portal_upload',field:'アイコン'},uid,undefined,'a')).code,'PORTAL_CONSENT_REQUIRED')
  for(const input of [{accepted:false,version:me.termsVersion},{accepted:true,version:'old'}])assert.equal((await call({kind:'portal_consent',...input})).code,'PORTAL_CONSENT_REQUIRED')
  const accept={kind:'portal_consent',accepted:true,version:me.termsVersion}
  assert.equal((await call(accept)).ok,true);assert.equal((await call(accept)).ok,true)
  assert.notEqual((await call({})).consentRequired,true)
  const other='777777777777777777';await session(other,undefined,false);assert.equal((await call({},other)).consentRequired,true)
  const saved=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'同意済み'}});assert.equal(saved.ok,true)
  assert.equal(JSON.stringify(h.context.BandReview.publicRows(h.records())).includes('acceptedAt'),false)
  const html=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../tools/band-json-editor.html',import.meta.url),'utf8'))
  const terms=JSON.parse(/<script id="registration-terms" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);assert.equal(terms.version,me.termsVersion);assert.equal(terms.clauses.length,7)
})
test('reading and English language warnings do not prevent server saves or alter input',async()=>{
  const {call,session}=backend();await session()
  const warned={活動名:'test','活動名（よみがな）※ひらがなで入力':'カタカナ','活動名（英語）':'日本語の名前'}
  const saved=await call({kind:'portal_save',submissionId:randomUUID(),band:warned});assert.equal(saved.ok,true)
  const stored=(await call({})).records.find(record=>record.id===saved.id).band
  assert.equal(stored['活動名（よみがな）※ひらがなで入力'],'カタカナ');assert.equal(stored['活動名（英語）'],'日本語の名前')
  assert.equal((await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'test','活動名（よみがな）※ひらがなで入力':'てすと'}})).ok,true)
})

test('management portal lists and edits all active bands, keeps source and ownership, and creates admin registrations',async()=>{
  const {h,call,session,admin}=backend();await session()
  const own=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'本人のバンド'}})
  await admin({kind:'admin_add',bands:[{活動名:'運営のバンド'}]})
  assert.equal((await call({})).records.length,1)
  assert.equal((await call({portalAdmin:true})).records.length,2)
  const before=h.records().find(record=>record.id===own.id)
  const edit={kind:'portal_save',portalAdmin:true,registrationId:own.id,revision:before.revision,submissionId:randomUUID(),band:{活動名:'管理人が修正'}}
  assert.equal((await call(edit)).ok,true)
  const after=h.records().find(record=>record.id===own.id)
  assert.equal(after.source,'user');assert.deepEqual(after.ownerUserIds,[uid]);assert.equal(after.status,'pending')
  assert.equal((await call(edit)).revision,after.revision)
  const added=await call({kind:'portal_save',portalAdmin:true,submissionId:randomUUID(),band:{活動名:'管理画面で新規'}})
  assert.equal(added.ok,true)
  assert.equal(h.records().find(record=>record.id===added.id).source,'admin')
  assert.equal((await call({kind:'portal_save',registrationId:added.id,revision:1,submissionId:randomUUID(),band:{活動名:'権限なし'}})).code,'PORTAL_FORBIDDEN')
})
test('portal admin delete is revision-safe, idempotent and keeps a restore backup',async()=>{
  const {h,call,session}=backend();await session()
  const added=await call({kind:'portal_save',portalAdmin:true,submissionId:randomUUID(),band:{活動名:'削除対象'}})
  const input={kind:'portal_delete',registrationId:added.id,revision:added.revision,requestId:randomUUID()}
  assert.equal((await call(input)).code,'PORTAL_FORBIDDEN')
  assert.equal((await call({...input,portalAdmin:true,revision:0})).code,'STALE_DELETE')
  const removed=await call({...input,portalAdmin:true});assert.equal(removed.ok,true);assert.equal(removed.status,'deleted')
  assert.equal((await call({...input,portalAdmin:true})).revision,removed.revision)
  assert.equal((await call({portalAdmin:true})).records.length,0)
  const record=h.records()[0];assert.equal(record.snapshot['活動名'],'削除対象');assert.ok(record.restoreBackup);assert.equal(record.deletedBy,uid)
})

test('self registration is private, revision-safe, retry-safe and uses existing approval flow without Forms',async()=>{
  const {h,call,session}=backend();await session()
  const submissionId=randomUUID(),band={活動名:'本人登録',メインジャンル:'ロック'}
  const saved=await call({kind:'portal_save',submissionId,band})
  assert.equal(saved.ok,true);assert.equal(saved.status,'pending');assert.equal(h.records().length,1)
  assert.equal((await call({kind:'portal_save',submissionId,band})).id,saved.id)
  assert.equal((await call({})).records[0].id,saved.id)
  const other='777777777777777777';await session(other)
  assert.equal((await call({},other)).records.length,0)
  assert.equal((await call({kind:'portal_save',registrationId:saved.id,revision:1,submissionId:randomUUID(),band},other)).code,'PORTAL_FORBIDDEN')
  assert.equal((await call({kind:'portal_save',registrationId:saved.id,revision:0,submissionId:randomUUID(),band})).code,'STALE_EDIT')
  h.context.runMaintenance();let record=h.records()[0]
  const envelope=await signEnvelope({actorRole:'admin',actorId:uid,interactionId:'811111111111111111',guildId:h.properties.DISCORD_GUILD_ID,channelId:h.properties.DISCORD_CHANNEL_ID,messageId:record.messageId,action:'approve',registrationId:record.id,revision:record.revision},h.properties.GAS_HMAC_SECRET)
  assert.equal(JSON.parse(h.context.doPost({postData:{contents:JSON.stringify(envelope)}}).text).ok,true)
  const rows=h.context.BandReview.publicRows(h.records());assert.equal(rows[1][rows[0].indexOf('_registrationSource')],'user')
  assert.equal((await call({kind:'portal_logout'})).ok,true)
  assert.equal((await call({})).code,'PORTAL_SESSION_EXPIRED')
})

test('admin-owned records require explicit assignment; ownership reassignment blocks old retry keys',async()=>{
  const {h,call,session,admin}=backend();await session()
  const added=await admin({kind:'admin_add',bands:[{活動名:'運営バンド'}]});assert.equal(added.ok,true)
  let record=h.records()[0]
  assert.equal((await call({})).records.length,0)
  assert.equal((await admin({kind:'admin_assign_owner',registrationId:record.id,ownerId:uid})).ok,true)
  assert.equal((await call({})).records.length,1)
  assert.equal((await call({kind:'portal_save',registrationId:record.id,revision:record.revision,submissionId:randomUUID(),band:{活動名:'本人引き継ぎ'}})).ok,true)
  assert.equal(h.records()[0].source,'user')
  const submissionId=randomUUID(),band={活動名:'新規本人'}
  const created=await call({kind:'portal_save',submissionId,band})
  await admin({kind:'admin_assign_owner',registrationId:created.id,ownerId:'777777777777777777'})
  assert.equal((await call({kind:'portal_save',submissionId,band})).code,'PORTAL_FORBIDDEN')
})
test('ownership metadata is admin-only and transfer replaces access with audit, conflict and retry protection',async()=>{
  const {h,call,session}=backend();await session();const other='777777777777777777';await session(other)
  const added=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'移譲対象'}})
  const managed=(await call({portalAdmin:true})).records[0];assert.deepEqual(managed.ownerUserIds,[uid]);assert.equal((await call({})).records[0].ownerUserIds,undefined)
  const input={kind:'portal_assign_owner',registrationId:added.id,ownerId:other,revision:added.revision,ownershipVersion:0,requestId:randomUUID()}
  assert.equal((await call(input)).code,'PORTAL_FORBIDDEN')
  const moved=await call({...input,portalAdmin:true});assert.equal(moved.ok,true);assert.equal(moved.ownershipVersion,1);assert.equal(moved.ownershipAudit[0].by,uid);assert.deepEqual(moved.ownershipAudit[0].previousOwners,[uid])
  assert.equal((await call({...input,portalAdmin:true})).ownershipAudit.length,1)
  assert.equal((await call({...input,portalAdmin:true,requestId:randomUUID()})).code,'STALE_OWNERSHIP')
  assert.equal((await call({})).records.length,0);assert.equal((await call({},other)).records[0].id,added.id)
  assert.equal((await call({kind:'portal_save',registrationId:added.id,revision:1,submissionId:randomUUID(),band:{活動名:'旧所有者の編集'}})).code,'PORTAL_FORBIDDEN')
  assert.equal((await call({kind:'portal_save',registrationId:added.id,revision:1,submissionId:randomUUID(),band:{活動名:'新所有者の編集'}},other)).ok,true)
  assert.equal(h.records()[0].revision,2)
})

function png(width=1,height=1) {
  function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,checksum])}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))])
}

test('PNG upload validates identity, hash, CRC, dimensions and quotas, saves to existing folders and retries once',async()=>{
  const {h,call,session}=backend();await session()
  h.context.Utilities.base64Decode=text=>[...Buffer.from(text,'base64')]
  h.context.Utilities.newBlob=(bytes,type,name)=>({bytes,type,name})
  h.context.Utilities.computeDigest=(_,value)=>[...createHash('sha256').update(Array.isArray(value)?Buffer.from(value):value).digest()]
  let created=0;const folders=[];let sharing=''
  h.context.DriveApp={Access:{ANYONE_WITH_LINK:'link'},Permission:{VIEW:'view'},getFolderById:id=>{folders.push(id);return {createFile:blob=>{assert.equal(blob.type,'image/png');created++;return {getId:()=>String(created),setSharing:access=>{sharing=access}}}}}}
  function upload(bytes,overrides={}){return {kind:'portal_upload',field:'アイコン',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),uploadId:randomUUID(),...overrides}}
  const bytes=png(),input=upload(bytes)
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.BandReview.pngInfo([...bytes]))),{width:1,height:1})
  const first=await call(input,uid,undefined,bytes.toString('base64'))
  assert.equal(first.ok,true);assert.equal(sharing,'link');assert.match(folders[0],/^1uiSDdGT/)
  assert.equal((await call(input,uid,undefined,bytes.toString('base64'))).url,first.url);assert.equal(created,1)
  const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1
  assert.equal((await call(upload(corrupt),uid,undefined,corrupt.toString('base64'))).code,'INVALID_PNG')
  const large=png(257,1)
  assert.equal((await call(upload(large),uid,undefined,large.toString('base64'))).code,'INVALID_IMAGE')
  assert.equal((await call({...upload(bytes),sha256:'a'.repeat(64)},uid,undefined,bytes.toString('base64'))).code,'INVALID_IMAGE')
  h.properties.PORTAL_USER_DAILY_BYTES='1'
  assert.equal((await call(upload(bytes),uid,undefined,bytes.toString('base64'))).code,'UPLOAD_DAILY_LIMIT')
  assert.equal(created,1)
})
test('upload failures identify blob versus Drive writes and redact details shown only to admins',async()=>{
  const {h,call,session}=backend();await session();const bytes=png()
  h.context.DriveApp={getFolderById:()=>({createFile(){throw Error('Drive write failed')}})}
  h.context.Utilities.base64Decode=text=>[...Buffer.from(text,'base64')]
  h.context.Utilities.computeDigest=(_,value)=>[...createHash('sha256').update(Array.isArray(value)?Buffer.from(value):value).digest()]
  h.context.Utilities.newBlob=()=>{throw Error('Blob failed '+h.properties.GAS_HMAC_SECRET+' owner@example.com https://secret.example/path')}
  const make=admin=>({kind:'portal_upload',field:'アイコン',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),uploadId:randomUUID(),diagnosticAdmin:admin})
  const failed=await call(make(true),uid,undefined,bytes.toString('base64'));assert.equal(failed.diagnostic.stage,'UPLOAD_BLOB');assert.match(failed.diagnostic.detail,/Blob failed/);assert.doesNotMatch(failed.diagnostic.detail,/owner@|https:|test-gas/)
  const ordinary=await call(make(false),uid,undefined,bytes.toString('base64'));assert.equal(ordinary.diagnostic.detail,undefined)
  h.context.Utilities.newBlob=()=>({});h.context.DriveApp={getFolderById:()=>({createFile(){throw Error('Drive write failed')}})}
  // Both paths resolve the folder before blob construction.
  const drive=await call(make(true),uid,undefined,bytes.toString('base64'));assert.equal(drive.diagnostic.stage,'UPLOAD_CREATE_FILE')
})
test('portal initialization explicitly requires Drive write consent before reading folders',()=>{
  const h=gasHarness(),calls=[]
  h.context.ScriptApp.AuthMode={FULL:'FULL'};h.context.ScriptApp.requireScopes=(mode,scopes)=>{calls.push({mode,scopes:[...scopes]})}
  h.context.DriveApp={getFolderById(){assert.equal(calls.length,1);return {getName:()=> 'folder'}}}
  h.context.initializePortalIntegration();assert.deepEqual(calls,[{mode:'FULL',scopes:['https://www.googleapis.com/auth/drive']}])
  h.context.ScriptApp.requireScopes=()=>{throw Error('CONSENT_REQUIRED')}
  h.context.DriveApp.getFolderById=()=>{assert.fail('must not read folders before consent')}
  assert.throws(()=>h.context.initializePortalIntegration(),/CONSENT_REQUIRED/)
})


test('registered user names persist independently of sessions and are admin-only',async()=>{
  const {call,session}=backend();await session()
  const other='888888888888888888',sid=randomUUID()
  await call({kind:'portal_session',expires:Date.now()+3600000,username:'first',displayName:'同名'},other,sid)
  await call({kind:'portal_session',expires:Date.now()+3600000,username:'second',displayName:'同名'})
  let data=await call({portalAdmin:true})
  assert.equal(data.users.length,2);assert.equal(data.users.find(user=>user.id===other).username,'first')
  assert.equal((await call({portalAdmin:false})).users,undefined)
  await call({kind:'portal_session',expires:Date.now()+3600000,username:'renamed',displayName:'=安全な文字列'},other,sid)
  data=await call({portalAdmin:true});assert.equal(data.users.length,2)
  assert.equal(data.users.find(user=>user.id===other).displayName,'=安全な文字列')
  await call({kind:'portal_logout'},other,sid)
  assert.equal((await call({portalAdmin:true})).users.length,2)
})


test('expired or cross-user sessions cannot read private records even with signed requests',async()=>{
  const {call,session}=backend();await session()
  const wrong=randomUUID(),other='888888888888888888'
  for(const [actor,sid] of [[uid,wrong],[other,'11111111-1111-4111-8111-'+uid.slice(-12)]]){
    const data=await call({portalAdmin:true},actor,sid)
    assert.equal(data.code,'PORTAL_SESSION_EXPIRED');assert.equal(data.records,undefined);assert.equal(data.users,undefined)
  }
  await call({kind:'portal_logout'})
  assert.equal((await call({portalAdmin:true})).code,'PORTAL_SESSION_EXPIRED')
})


test('personal mode does not need Discord membership and UI hints never authorize management',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token',canManage:true},env.PORTAL_SESSION_SECRET,'session')
  const config={...env,ADMIN_ROLE_IDS:'1572585514404413511'},signed=[]
  const fetcher=async(url,options)=>{if(url.endsWith('/member'))return Response.json({retry_after:12.2},{status:429});signed.push(JSON.parse(JSON.parse(options.body).payload));return Response.json({ok:true,records:[]})}
  const me=await (await handlePortal(request('/api/me?mode=user',user),config,{},'',fetcher)).json()
  assert.equal(me.role,'user');assert.equal(me.canManage,true);assert.equal(signed.at(-1).portalAdmin,false)
  const saved=await handlePortal(request('/api/save',user,{mode:'user',band:{活動名:'本人'}}),config,{waitUntil(){}},'',fetcher)
  assert.equal(saved.status,200);assert.equal(signed.at(-1).portalAdmin,false)
  for(const path of ['/api/me?mode=admin','/api/delete','/api/assign-owner']){
    const count=signed.length;const response=await handlePortal(request(path,user,path.includes('?')?undefined:{mode:'admin'}),config,{},'',fetcher)
    assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'13');assert.equal((await response.json()).retryAfter,13);assert.equal(signed.length,count)
  }
  const count=signed.length;const ticket=await handlePortal(request('/api/upload-ticket',user,{mode:'user',field:'アイコン',bytes:10,sha256:'a'.repeat(64),uploadId:randomUUID()}),config,{},'',fetcher)
  assert.equal(ticket.status,200);assert.equal(signed.length,count)
  assert.equal(JSON.parse((await ticket.json()).ticket.payload).diagnosticAdmin,false)
})

test('successful admin list seals only a UI switch hint without extending login expiry',async()=>{
  const user=await login();user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
  const response=await handlePortal(request('/api/me',user),{...env,ADMIN_ROLE_IDS:'1572585514404414411'}, {},'',async url=>url.endsWith('/member')?Response.json({roles:['1572585514404414411']}):Response.json({ok:true,records:[]}))
  const value=response.headers.get('Set-Cookie').split(';')[0].split('=').slice(1).join('=')
  const decoded=await open(value,env.PORTAL_SESSION_SECRET,'session');assert.equal(decoded.canManage,true);assert.equal(decoded.exp,user.exp)
})


test('admin target revokes personal ownership and updates registration badge in portal responses',async()=>{
 const {call,session}=backend();await session()
 const added=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'所有先テスト'}})
 const moved=await call({kind:'portal_assign_owner',portalAdmin:true,registrationId:added.id,revision:added.revision,ownershipVersion:0,requestId:randomUUID(),ownerId:'admin'})
 assert.equal(moved.ok,true);assert.equal(moved.registrationSource,'admin');assert.deepEqual(moved.ownerUserIds,[])
 assert.equal((await call({})).records.length,0)
 const managed=await call({portalAdmin:true});assert.equal(managed.records[0].ownershipType,'admin');assert.equal(managed.records[0].registrationSource,'admin')
 const restored=await call({kind:'portal_assign_owner',portalAdmin:true,registrationId:added.id,revision:added.revision,ownershipVersion:1,requestId:randomUUID(),ownerId:uid})
 assert.equal(restored.registrationSource,'user');assert.equal((await call({})).records.length,1)
})


function eventBackend(){const b=backend();b.h.properties.EVENT_SPREADSHEET_ID='events';b.h.properties.EVENTS_ENABLED='true';b.h.books.events=new b.h.books.public.constructor();b.h.books.events.insertSheet('Events');return b}
function liveEvent(bandId='',changes={}){return {id:'',ownerBandId:bandId,title:'公開ライブ',subtitle:'概要説明',place:'VRChat',venueName:'会場',venueUrl:'https://vrchat.com/home',startsAt:'2027-01-01T20:00:00+09:00',endsAt:'2027-01-01T21:00:00+09:00',participants:bandId?[{bandId,name:'偽装された表示名'}]:[],...changes}}
test('live events are owner-scoped, revision safe and publish no private actor metadata',async()=>{
 const {h,call,session}=eventBackend();await session();const other='888888888888888888';await session(other)
 const band=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'本人バンド'}})
 const input={kind:'portal_event_save',event:liveEvent(band.id),requestId:randomUUID()}
 assert.equal((await call({...input,requestId:randomUUID()},other)).code,'PORTAL_FORBIDDEN')
 const first=await call(input);assert.equal(first.ok,true);assert.equal(first.event.revision,1);assert.equal(first.event.participants[0].name,'本人バンド')
 assert.equal((await call(input)).event.id,first.event.id);assert.equal(h.books.events.getSheetById(0).getLastRow(),2)
 const listed=await call({kind:'portal_event_list'});assert.equal(listed.events.length,1);assert.ok(listed.bands.some(item=>item.id===band.id))
 assert.equal((await call({kind:'portal_event_list'},other)).bands.some(item=>item.id===band.id),false)
 for(const value of ['createdBy','updatedBy','actorId','sessionId','operations',uid])assert.equal(JSON.stringify(h.books.events.getSheetById(0).data).includes(value),false)
 const edit={kind:'portal_event_save',event:{...input.event,id:first.event.id,title:'変更後'},revision:1,requestId:randomUUID()}
 assert.equal((await call(edit,other)).code,'PORTAL_FORBIDDEN');const changed=await call(edit);assert.equal(changed.event.revision,2)
 assert.equal((await call({...edit,requestId:randomUUID()})).code,'STALE_EVENT')
 const remove={kind:'portal_event_delete',eventId:first.event.id,revision:2,requestId:randomUUID()}
 assert.equal((await call(remove,other)).code,'PORTAL_FORBIDDEN');assert.equal((await call(remove)).ok,true);assert.equal((await call(remove)).ok,true)
 assert.equal((await call({kind:'portal_event_list'})).events.length,0);assert.equal(h.books.events.getSheetById(0).getRange(2,1,1,1).getValues()[0][0],'')
 const privateRows=h.books.review.getSheetByName('LiveEvents').data;assert.match(JSON.stringify(privateRows),/createdBy|deleted/)
})
test('unlinked events require admin and invalid links or participant IDs never publish',async()=>{
 const {h,call,session}=eventBackend();await session()
 assert.equal((await call({kind:'portal_event_save',requestId:randomUUID(),event:liveEvent()})).code,'PORTAL_FORBIDDEN')
 const created=await call({kind:'portal_event_save',portalAdmin:true,requestId:randomUUID(),event:liveEvent('',{title:'=IMPORTDATA("https://example.invalid")'})});assert.equal(created.ok,true)
 assert.equal(h.books.events.getSheetById(0).data[1][2],'=IMPORTDATA("https://example.invalid")')
 for(const changes of [{venueUrl:'javascript:alert(1)'},{venueUrl:'https://user:secret@example.com/'},{startsAt:'2027-02-30T20:00:00+09:00'},{ownerUserIds:[uid]},{participants:[{bandId:randomUUID(),name:'存在しないバンド'}]}])assert.equal((await call({kind:'portal_event_save',portalAdmin:true,requestId:randomUUID(),event:liveEvent('',changes)})).code,'INVALID_EVENT')
 assert.equal(h.books.events.getSheetById(0).getLastRow(),2)
})
test('event public write failure can retry without duplicate creation or another content revision',async()=>{
 const {h,call,session}=eventBackend();await session();const band=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'再送用'}}),sheet=h.books.events.getSheetById(0),original=sheet.getRange.bind(sheet)
 let fail=true;sheet.getRange=(...args)=>{if(fail)throw Error('temporary failure');return original(...args)}
 const input={kind:'portal_event_save',requestId:randomUUID(),event:liveEvent(band.id)}
 assert.equal((await call(input)).ok,false);fail=false;const retry=await call(input);assert.equal(retry.ok,true);assert.equal(retry.event.revision,1);assert.equal(sheet.getLastRow(),2)
})
test('event write routes use trusted identity, CSRF and fresh admin roles',async()=>{
 const user=await login(),config={...env,ADMIN_ROLE_IDS:'1572585514404413511'};user.cookie='__Host-vbd_session='+await seal({...user,accessToken:'token'},env.PORTAL_SESSION_SECRET,'session')
 for(const path of ['/api/events/save','/api/events/delete']){let signed;const response=await handlePortal(request(path,user,{mode:'admin',actorId:'999999999999999999',portalAdmin:true,event:liveEvent(),requestId:randomUUID()}),config,{},'',async(url,options)=>{if(url.endsWith('/member'))return Response.json({roles:[]});signed=JSON.parse(JSON.parse(options.body).payload);return Response.json({ok:true})});assert.equal(response.status,200);assert.equal(signed.actorId,uid);assert.equal(signed.portalAdmin,false);assert.match(signed.kind,/portal_event_/)}
 let calls=0;const denied=await handlePortal(request('/api/events/save',user,{}, {'X-CSRF-Token':'wrong'}),config,{},'',async()=>{calls++;return Response.json({ok:true})});assert.equal((await denied.json()).code,'CSRF_REJECTED');assert.equal(calls,0)
})


test('transferring a band immediately revokes its creators event editing rights',async()=>{
 const {h,call,session}=eventBackend();await session();const other='888888888888888888';await session(other)
 const band=await call({kind:'portal_save',submissionId:randomUUID(),band:{活動名:'移譲前'}}),saved=await call({kind:'portal_event_save',requestId:randomUUID(),event:liveEvent(band.id)})
 await call({kind:'portal_assign_owner',portalAdmin:true,registrationId:band.id,ownerId:other,revision:band.revision,ownershipVersion:0,requestId:randomUUID()})
 const change={kind:'portal_event_save',requestId:randomUUID(),revision:1,event:{...liveEvent(band.id),id:saved.event.id,title:'移譲後'}}
 assert.equal((await call(change)).code,'PORTAL_FORBIDDEN');assert.equal((await call(change,other)).ok,true)
})
test('events require consent, keep public and private sheets separate and preserve revision in CSV',async()=>{
 const {h,call,session}=eventBackend();await session(uid,undefined,false)
 assert.equal((await call({kind:'portal_event_list'})).code,'PORTAL_CONSENT_REQUIRED')
 h.properties.EVENT_SPREADSHEET_ID=h.properties.REVIEW_SPREADSHEET_ID;assert.throws(()=>h.context.settings_(),/INVALID_EVENT_SETTINGS/)
})


test('deleting an ended event removes only that event from public rows and survives reload and retry',async()=>{
 const {h,call,session}=eventBackend();await session()
 const create=async(title,startsAt,endsAt)=>call({kind:'portal_event_save',portalAdmin:true,requestId:randomUUID(),event:liveEvent('',{title,startsAt,endsAt})})
 const ended=await create('終了イベント','2020-01-01T20:00:00+09:00','2020-01-01T21:00:00+09:00')
 const future=await create('残すイベント','2099-01-01T20:00:00+09:00','2099-01-01T21:00:00+09:00')
 const remove={kind:'portal_event_delete',portalAdmin:true,eventId:ended.event.id,revision:ended.event.revision,requestId:randomUUID()}
 assert.equal((await call(remove)).ok,true)
 assert.equal((await call(remove)).ok,true)
 const listed=await call({kind:'portal_event_list'})
 assert.deepEqual(listed.events.map(event=>event.id),[future.event.id])
 const rows=h.books.events.getSheetById(0).data
 assert.equal(rows[1][0],future.event.id)
 assert.equal(JSON.stringify(rows).includes(ended.event.id),false)
 assert.equal(JSON.stringify(rows).includes('終了イベント'),false)
 assert.equal((await call({kind:'portal_event_save',portalAdmin:true,event:ended.event,revision:1,requestId:randomUUID()})).code,'STALE_EVENT')
})


test('login list keeps one request pending while GAS busy is retried twice with fresh nonces',async()=>{
 const calls=[],waits=[]
 const data=await portalGas(env,{kind:'portal_list',actorId:uid},async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json(calls.length<3?{ok:false,code:'BUSY_RETRY',retryable:true}:{ok:true,records:[]})},async ms=>waits.push(ms))
 assert.equal(data.ok,true);assert.equal(calls.length,3);assert.deepEqual(waits,[1000,2000])
 assert.equal(new Set(calls.map(call=>call.nonce)).size,3)
 for(const call of calls)assert.equal(JSON.parse(call.payload).kind,'portal_list')
})

test('busy list stops after three attempts and never retries writes, permissions or other failures',async()=>{
 for(const [kind,failure,expected] of [
  ['portal_list',{ok:false,code:'BUSY_RETRY',retryable:true},3],
  ['portal_session',{ok:false,code:'BUSY_RETRY',retryable:true},3],
  ['portal_event_list',{ok:false,code:'BUSY_RETRY',retryable:true},3],
  ['portal_save',{ok:false,code:'BUSY_RETRY',retryable:true},1],
  ['portal_list',{ok:false,code:'BUSY_RETRY',retryable:false},1],
  ['portal_list',{ok:false,code:'PORTAL_FORBIDDEN',retryable:true},1]
 ]){
  let calls=0;const waits=[]
  await assert.rejects(portalGas(env,{kind},async()=>{calls++;return Response.json(failure)},async ms=>waits.push(ms)),new RegExp(failure.code))
  assert.equal(calls,expected);assert.equal(waits.length,expected-1)
 }
})

function cookieFrom(response,name) {
  return response.headers.getSetCookie().find(value=>value.startsWith(name+'=')).split(';')[0]
}

test('busy login resumes after a refresh without reusing the Discord code or creating another session',async()=>{
  let exchanges=0,gasCalls=0
  const signed=[]
  const fetcher=async(url,options)=>{
    if(url.endsWith('/oauth2/token')){exchanges++;return Response.json({access_token:'private-token',expires_in:3600})}
    if(url.endsWith('/users/@me'))return Response.json({id:uid,username:'name'})
    gasCalls++;signed.push(JSON.parse(JSON.parse(options.body).payload))
    return Response.json(gasCalls<=3?{ok:false,code:'BUSY_RETRY',retryable:true}:{ok:true})
  }
  const start=await handlePortal(new Request('https://portal.test/auth/login'),env,{},'',fetcher)
  const state=new URL(start.headers.get('Location')).searchParams.get('state')
  const callbackUrl='https://portal.test/auth/callback?code=once&state='+state
  const callback=await handlePortal(new Request(callbackUrl,{headers:{Cookie:cookieFrom(start,'__Host-vbd_oauth')}}),env,{},'',fetcher)
  const pending=cookieFrom(callback,'__Host-vbd_login')
  assert.match(pending,/^__Host-vbd_login=/)
  assert.equal(gasCalls,0)
  const waiting=await handlePortal(new Request('https://portal.test/auth/complete',{headers:{Cookie:pending}}),env,{},'',fetcher)
  assert.equal(waiting.status,503)
  const html=await waiting.text()
  assert.match(html,/自動的に再試行/);assert.match(html,/location.replace\('\/auth\/complete'\)/)
  assert.doesNotMatch(html,/private-token|code=once|BUSY_RETRY/)
  assert.equal(waiting.headers.get('Cache-Control'),'no-store')
  const resumedCookie=cookieFrom(waiting,'__Host-vbd_login')
  const refreshed=await handlePortal(new Request(callbackUrl,{headers:{Cookie:resumedCookie}}),env,{},'',noIO)
  assert.equal(refreshed.headers.get('Location'),'/auth/complete')
  const reopened=await handlePortal(new Request('https://portal.test/VRCBandDB/register',{headers:{Cookie:resumedCookie}}),env,{},'',noIO)
  assert.equal(reopened.headers.get('Location'),'/auth/complete')
  const complete=await handlePortal(new Request('https://portal.test/auth/complete',{headers:{Cookie:resumedCookie}}),env,{},'',fetcher)
  assert.equal(complete.headers.get('Location'),'/VRCBandDB/register')
  assert.equal(exchanges,1);assert.equal(gasCalls,4)
  assert.equal(new Set(signed.map(input=>input.sessionId)).size,1)
  const sessionCookie=cookieFrom(complete,'__Host-vbd_session')
  const refreshedAgain=await handlePortal(new Request(callbackUrl,{headers:{Cookie:sessionCookie}}),env,{},'',noIO)
  assert.equal(refreshedAgain.headers.get('Location'),'/VRCBandDB/register')
})

test('login wait is bounded and an invalid or expired continuation cannot authenticate',async()=>{
  const value={uid,sid:randomUUID(),csrf:randomUUID(),accessToken:'token',exp:Date.now()+3600000}
  const pending={value,username:'name',displayName:'name',round:2,exp:Date.now()+600000}
  const encoded=await seal(pending,env.PORTAL_SESSION_SECRET,'login')
  const waiting=await handlePortal(new Request('https://portal.test/auth/complete',{headers:{Cookie:'__Host-vbd_login='+encoded}}),env,{},'',async()=>Response.json({ok:false,code:'BUSY_RETRY',retryable:true}))
  const html=await waiting.text()
  assert.equal(waiting.status,503);assert.match(html,/再試行/);assert.doesNotMatch(html,/<script>/)
  for(const invalid of ['forged',encoded.slice(0,-5)+'wrong',await seal({...pending,exp:Date.now()-1},env.PORTAL_SESSION_SECRET,'login'),await seal(pending,env.PORTAL_SESSION_SECRET,'session')]){
    const response=await handlePortal(new Request('https://portal.test/auth/complete',{headers:{Cookie:'__Host-vbd_login='+invalid}}),env,{},'',noIO)
    assert.equal(response.headers.get('Location'),'/auth/login')
    assert.equal(response.headers.getSetCookie().some(cookie=>cookie.startsWith('__Host-vbd_session=')),false)
  }
})

test('GAS login upserts the same session once and does not wake notification Actions for login or reads',async()=>{
  const {h,call}=backend()
  let wakes=0
  h.context.wakeNotificationActions_=()=>{wakes++}
  const input={kind:'portal_session',expires:Date.now()+3600000,username:'name',displayName:'name'}
  h.state.busy=true
  const busy=await call(input)
  assert.equal(busy.code,'BUSY_RETRY');assert.equal(busy.retryable,true)
  h.state.busy=false
  assert.equal((await call(input)).ok,true)
  assert.equal((await call(input)).ok,true)
  assert.equal((await call({kind:'portal_list'})).ok,true)
  const book=h.books[h.properties.REVIEW_SPREADSHEET_ID]
  assert.equal(book.getSheetByName('WebSessions').getLastRow(),2)
  assert.equal(book.getSheetByName('WebUsers').getLastRow(),2)
  assert.equal(wakes,0)
})

test('logout clears all auth cookies after cookie expiry without calling GAS',async()=>{
  const value={uid,sid:randomUUID(),csrf:randomUUID(),exp:Date.now()-1}
  for(const token of [await seal(value,env.PORTAL_SESSION_SECRET,'session'),'tampered','']){
    const response=await handlePortal(new Request('https://portal.test/api/logout',{method:'POST',headers:{Origin:'https://portal.test',Cookie:'__Host-vbd_session='+token}}),env,{},'',noIO)
    assert.equal((await response.json()).ok,true)
    for(const name of ['__Host-vbd_session','__Host-vbd_login','__Host-vbd_oauth'])assert.ok(response.headers.getSetCookie().some(value=>value.startsWith(name+'=;')&&value.includes('Max-Age=0')))
  }
})

test('logout attempts server revocation but GAS expiry, lock contention and connection failure cannot trap users',async()=>{
  const user=await login()
  for(const failure of ['PORTAL_SESSION_EXPIRED','BUSY_RETRY','network']){
    let calls=0
    const response=await handlePortal(request('/api/logout',user,{}),env,{},'',async(_url,options)=>{
      calls++
      const input=JSON.parse(JSON.parse(options.body).payload)
      assert.equal(input.kind,'portal_logout');assert.equal(input.actorId,uid)
      if(failure==='network')throw Error('network')
      return Response.json({ok:false,code:failure})
    })
    assert.equal((await response.json()).ok,true)
    assert.equal(calls,1)
    assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/)
  }
  const withoutCsrf=await handlePortal(request('/api/logout',user,{}, {'X-CSRF-Token':''}),env,{},'',async()=>Response.json({ok:false,code:'PORTAL_SESSION_EXPIRED'}))
  assert.equal((await withoutCsrf.json()).ok,true)
  for(const extra of [{Origin:'https://evil.test'},{'X-CSRF-Token':'wrong'}]){
    const response=await handlePortal(request('/api/logout',user,{},extra),env,{},'',noIO)
    assert.equal((await response.json()).code,'CSRF_REJECTED')
    assert.equal(response.headers.get('Set-Cookie'),null)
  }
  const foreign=await handlePortal(new Request('https://portal.test/api/logout',{method:'POST',headers:{Origin:'https://evil.test'}}),env,{},'',noIO)
  assert.equal((await foreign.json()).code,'CSRF_REJECTED')
})
