import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto'
import { deflateSync, crc32 } from 'node:zlib'
import { gasHarness } from './gas-harness.mjs'
import { handleRequest, signEnvelope } from '../worker/src/index.mjs'
import { parseManagementCommand, managementRequestId, managementCommands } from '../worker/src/management.mjs'
import { commands } from '../local/commands.mjs'

const user='666666666666666666', admin='444444444444444444',mod='888888888888888888',channel='999999999999999999'
function backend(){
 const h=gasHarness();h.properties.DISCORD_COMMAND_CHANNEL_ID=channel;h.properties.EVENT_SPREADSHEET_ID='events';h.properties.EVENTS_ENABLED='true';h.properties.PORTAL_ENABLED='true'
 h.books.events=new h.books.public.constructor();h.books.events.insertSheet('Events');h.context.initializeIntegration()
 const keys=generateKeyPairSync('ed25519'),env={DISCORD_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'),DISCORD_APPLICATION_ID:h.properties.DISCORD_APPLICATION_ID,DISCORD_GUILD_ID:h.properties.DISCORD_GUILD_ID,DISCORD_CHANNEL_ID:h.properties.DISCORD_CHANNEL_ID,ADMIN_ROLE_IDS:admin,MODERATOR_ROLE_IDS:mod,DISCORD_COMMAND_CHANNEL_ID:channel,GAS_WEBAPP_URL:'https://script.google.com/macros/s/test/exec',GAS_HMAC_SECRET:h.properties.GAS_HMAC_SECRET}
 let sequence=700000000000000000n
 async function run(name,options=[],file,change={}){
  const interactionId=change.interactionId||String(++sequence)
  const data={type:2,id:interactionId,application_id:env.DISCORD_APPLICATION_ID,token:'private-test-token',guild_id:env.DISCORD_GUILD_ID,channel_id:channel,member:{roles:[admin],user:{id:user}},data:{type:1,name,options,...(file?{resolved:{attachments:{'123456789012345678':{id:'123456789012345678',filename:name==='band-upload'?'icon.png':'input.json',size:Buffer.byteLength(file),url:'https://cdn.discordapp.com/attachments/123456789012345678/123456789012345679/input'}}}}:{})},...change}
  delete data.interactionId
  const body=JSON.stringify(data),stamp=String(Math.floor(Date.now()/1000)),signature=sign(null,Buffer.from(stamp+body),keys.privateKey).toString('hex')
  let reply;const tasks=[],calls=[]
  const response=await handleRequest(new Request('https://worker.test/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':stamp,'X-Signature-Ed25519':signature}}),env,{waitUntil:p=>tasks.push(p)},async(url,options)=>{
   calls.push(url)
   if(url.startsWith('https://cdn.discordapp.com/'))return new Response(file)
   if(url===env.GAS_WEBAPP_URL){const body=typeof options.body==='string'?options.body:await new Response(options.body).text();return new Response(h.context.doPost({postData:{contents:body}}).text,{headers:{'Content-Type':'application/json'}})}
   if(options.body instanceof FormData){const payload=JSON.parse(options.body.get('payload_json'));const f=options.body.get('files[0]');reply={...payload,file:JSON.parse(await f.text())}}
   else reply=JSON.parse(options.body)
   return Response.json({})
  })
  const initial=await response.json();await Promise.all(tasks)
  return {initial,reply,calls,interactionId}
 }
 return {h,run,env}
}
const fileOption={type:11,name:'file',value:'123456789012345678'},opt=(name,value,type=3)=>({type,name,value})
function event(bandId=''){return {id:'',ownerBandId:bandId,title:'ライブ',subtitle:'説明',place:'VRChat',venueName:'会場',venueUrl:'https://vrchat.com/home',startsAt:'2099-01-01T20:00:00+09:00',endsAt:'2099-01-01T21:00:00+09:00',participants:bandId?[{bandId,name:'入力名'}]:[]}}

test('management commands share the registry and reject malformed or unconfirmed operations',()=>{
 for(const item of managementCommands)assert.equal(commands.filter(c=>c.name===item.name).length,1)
 assert.throws(()=>parseManagementCommand({name:'event-delete',options:[opt('id',randomUUID()),opt('revision',1,4),opt('confirm',false,5)]}),/MANAGEMENT_CONFIRM_REQUIRED/)
 assert.throws(()=>parseManagementCommand({name:'band-list',options:[opt('page',0,4)]}),/MANAGEMENT_INVALID_REQUEST/)
 assert.throws(()=>parseManagementCommand({name:'band-users',options:[opt('name','a'),opt('name','b')]}),/MANAGEMENT_INVALID_REQUEST/)
})

test('normal command save, export and web management use the same pending records, owners and revision checks',async()=>{
 const {h,run}=backend()
 let result=await run('band-save',[fileOption],JSON.stringify([{活動名:'コマンド登録',コメント:'最初'}]));assert.match(result.reply.content,/承認後/)
 const record=h.records()[0];assert.equal(record.status,'pending');assert.equal(record.createdBy,user)
 const duplicate=await run('band-save',[fileOption],JSON.stringify([{活動名:'コマンド登録',コメント:'最初'}]),{interactionId:result.interactionId});assert.equal(h.records().length,1)
 const exported=await run('band-export',[opt('id',record.id)]);assert.equal(exported.reply.file[0].活動名,'コマンド登録');assert.ok(!JSON.stringify(exported.reply.file).includes('ownerUserIds'))
 const update=await run('band-save',[fileOption,opt('id',record.id),opt('revision',record.revision,4)],JSON.stringify({...exported.reply.file[0],コメント:'更新'}));assert.match(update.reply.content,/承認後/)
 assert.equal(h.records()[0].revision,2);assert.equal(h.records()[0].status,'pending')
 const stale=await run('band-save',[fileOption,opt('id',record.id),opt('revision',1,4)],JSON.stringify({活動名:'古い値'}));assert.match(stale.reply.content,/STALE_EDIT/);assert.equal(h.records()[0].snapshot['コメント'],'更新')
 const listed=await run('band-list');assert.match(listed.reply.content,new RegExp(record.id))
 // Browser and command lookup both use the same management descriptor.
 const shared=h.context.managementBandList_({portalAdmin:true},h.properties,h.context.repository_(h.properties),h.books.review)
 assert.equal(shared.records[0].id,record.id);assert.equal(shared.records[0].band['コメント'],'更新')
 const wrong=await run('band-save',[fileOption],JSON.stringify({活動名:'不許可'}),{member:{roles:[mod],user:{id:user}}});assert.equal(wrong.initial.type,4);assert.equal(wrong.calls.length,0)
 const wrongChannel=await run('event-list',[],undefined,{channel_id:h.properties.DISCORD_CHANNEL_ID});assert.equal(wrongChannel.calls.length,0)
})

test('event commands share web validation, show ended on request, export, update and delete by revision',async()=>{
 const {h,run}=backend()
 await run('band-save',[fileOption],JSON.stringify({活動名:'参加バンド'}));const band=h.records()[0]
 let made=await run('event-save',[fileOption],JSON.stringify(event(band.id)));assert.match(made.reply.content,/イベントを保存/)
 const records=h.books.review.getSheetByName('LiveEvents').data;let stored=JSON.parse(records[1][1]);assert.equal(stored.event.participants[0].name,'参加バンド')
 let info=await run('event-info',[opt('id',stored.id)]);assert.equal(info.reply.file.revision,1)
 const invalid=await run('event-save',[fileOption],JSON.stringify({...info.reply.file,endsAt:info.reply.file.startsAt}));assert.match(invalid.reply.content,/INVALID_EVENT/)
 const update=await run('event-save',[fileOption],JSON.stringify({...info.reply.file,title:'更新ライブ'}));assert.match(update.reply.content,/版: 2/)
 const stale=await run('event-save',[fileOption],JSON.stringify(info.reply.file));assert.match(stale.reply.content,/STALE_EVENT/)
 const listed=await run('event-list',[opt('band',band.id)]);assert.match(listed.reply.content,/更新ライブ/)
 const ended=event();ended.title='終了済み';ended.startsAt='2020-01-01T20:00:00+09:00';ended.endsAt='2020-01-01T21:00:00+09:00';await run('event-save',[fileOption],JSON.stringify(ended))
 assert.doesNotMatch((await run('event-list')).reply.content,/終了済み/)
 assert.match((await run('event-list',[opt('ended',true,5)])).reply.content,/終了済み/)
 const no=await run('event-delete',[opt('id',stored.id),opt('revision',2,4),opt('confirm',false,5)]);assert.equal(no.calls.length,0)
 const removed=await run('event-delete',[opt('id',stored.id),opt('revision',2,4),opt('confirm',true,5)]);assert.match(removed.reply.content,/削除しました/)
 assert.doesNotMatch((await run('event-list',[opt('ended',true,5)])).reply.content,/更新ライブ/)
 assert.equal(h.books.events.getSheetById(0).data.some(row=>row[0]===stored.id),false)
})

test('owner command supports admin ownership and user search returns names without credentials',async()=>{
 const {h,run}=backend();await run('band-save',[fileOption],JSON.stringify({活動名:'所有者'}));const record=h.records()[0]
 const target='777777777777777777'
 let moved=await run('band-owner',[opt('id',record.id),opt('user',target,6)]);assert.match(moved.reply.content,/移譲/);assert.deepEqual(h.records()[0].ownerUserIds,[target])
 await run('band-owner',[opt('id',record.id),opt('admin',true,5)]);assert.equal(h.records()[0].ownershipType,'admin');assert.deepEqual(h.records()[0].ownerUserIds,[])
 const sheet=h.books.review.getSheetByName('WebUsers')||h.books.review.insertSheet('WebUsers');sheet.data=[['actorId','username','displayName','updatedAt'],[target,'target','ユーザー名','now']]
 const users=await run('band-users',[opt('name','ユーザー')]);assert.match(users.reply.content,/ユーザー名/);assert.match(users.reply.content,new RegExp(target));assert.doesNotMatch(users.reply.content,/session|token/i)
})

function png(){function chunk(type,data){const kind=Buffer.from(type),head=Buffer.alloc(4),crc=Buffer.alloc(4);head.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([head,kind,data,crc])}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))])}

test('PNG command shares Drive validation and storage and retries without duplicate files',async()=>{
 const {h,run}=backend();h.context.Utilities.base64Decode=value=>[...Buffer.from(value,'base64')];h.context.Utilities.newBlob=(bytes,type,name)=>({bytes,type,name});h.context.Utilities.computeDigest=(_,value)=>[...createHash('sha256').update(Array.isArray(value)?Buffer.from(value):value).digest()]
 let created=0;h.context.DriveApp={Access:{ANYONE_WITH_LINK:'link'},Permission:{VIEW:'view'},getFolderById:()=>({createFile(){created++;return {getId:()=> 'image-1',setSharing(){}}}})}
 const first=await run('band-upload',[fileOption,opt('field','アイコン')],png());assert.match(first.reply.content,/drive.google.com/);assert.equal(created,1)
 await run('band-upload',[fileOption,opt('field','アイコン')],png(),{interactionId:first.interactionId});assert.equal(created,1)
 const bad=await run('band-upload',[fileOption,opt('field','アイコン')],Buffer.from('not png'));assert.match(bad.reply.content,/INVALID_IMAGE/);assert.equal(created,1)
})

test('normal partial changes retain omitted fields, explicit empty clears, internal keys cannot be imported',async()=>{
 const {h,run}=backend();await run('band-save',[fileOption],JSON.stringify({活動名:'維持する名前',コメント:'維持するコメント',メインジャンル:'ロック'}));const record=h.records()[0]
 await run('band-save',[fileOption,opt('id',record.id),opt('revision',1,4)],JSON.stringify({コメント:''}))
 assert.equal(h.records()[0].snapshot['活動名'],'維持する名前');assert.equal(h.records()[0].snapshot['メインジャンル'],'ロック');assert.equal(h.records()[0].snapshot['コメント'],'')
 const forbidden=await run('band-save',[fileOption,opt('id',record.id),opt('revision',2,4)],'{"__proto__":{"actorRole":"admin"},"コメント":"不正"}')
 assert.match(forbidden.reply.content,/INVALID_IMPORT/);assert.equal(h.records()[0].revision,2)
})
