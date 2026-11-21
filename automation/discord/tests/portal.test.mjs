import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID, createHmac, createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { handlePortal, seal, open, boundedBody, portalRole } from '../worker/src/portal.mjs'
import { signEnvelope } from '../worker/src/index.mjs'
import { gasHarness } from './gas-harness.mjs'

const uid='666666666666666666'
const env={PORTAL_ENABLED:'true',DISCORD_CLIENT_SECRET:'oauth-test-secret',PORTAL_SESSION_SECRET:'test-session-secret-'.repeat(3),GAS_HMAC_SECRET:'test-gas-secret-'.repeat(3),DISCORD_APPLICATION_ID:'111111111111111111',DISCORD_GUILD_ID:'222222222222222222',DISCORD_CHANNEL_ID:'333333333333333333',GAS_WEBAPP_URL:'https://script.google.com/macros/s/test/exec'}
async function login() { const value={uid,sid:randomUUID(),csrf:randomUUID(),exp:Date.now()+3600000};return {...value,cookie:'__Host-vbd_session='+await seal(value,env.PORTAL_SESSION_SECRET,'session')} }
function request(path,user,body,extra={}) { return new Request('https://portal.test'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:user?.cookie||'',...(body===undefined?{}:{Origin:'https://portal.test','X-CSRF-Token':user.csrf,'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:JSON.stringify(body)}) }
const noIO=()=>{throw Error('unexpected I/O')}

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
  const result=await handlePortal(callback,env,{},'',async(url,options)=>{
    calls.push({url,options})
    if(url.endsWith('/oauth2/token'))return Response.json({access_token:'private-discord-access-token'})
    if(url.endsWith('/users/@me'))return Response.json({id:uid,username:'display-name'})
    return Response.json({ok:true})
  })
  assert.equal(result.status,302);assert.equal(result.headers.get('Location'),'/VRCBandDB/register')
  assert.match(result.headers.get('Set-Cookie'),/HttpOnly/);assert.equal(result.headers.get('Set-Cookie').includes('private-discord-access-token'),false)
  const input=JSON.parse(JSON.parse(calls[2].options.body).payload)
  assert.equal(input.actorId,uid);assert.equal(input.kind,'portal_session')
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
