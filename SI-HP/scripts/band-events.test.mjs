import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import {specEventSamples,refreshFixtureFields,weeksInMonth,chooseCalendarDate,eventFixtureKey,expandedEventSamples,mergeEventSamples,calendarEvents,activeEvents,weekDays,monthDays,moveCalendar,layoutDayEvents,eventDetailsUrl,eventPlaces,eventColumns,normalizeEvent,eventsOnDay,eventsForBand,fromJapanInput,toJapanInput,japanDate,sampleEvents,parseEventCsv,loadEvents,savePreviewEvent,deletePreviewEvent} from '../src/band-events.mjs'
const base={id:'event-1',ownerBandId:'band-1',title:'ライブ',place:'VRChat',startsAt:'2026-11-22T20:00:00+09:00',endsAt:'2026-11-22T21:00:00+09:00',participants:[{bandId:'band-1',name:'登録バンド'},{bandId:'',name:'ゲスト'}]}
test('JST inputs roundtrip and invalid dates are rejected',()=>{
 assert.equal(fromJapanInput('2026-11-22T20:00'),'2026-11-22T11:00:00.000Z');assert.equal(toJapanInput(fromJapanInput('2026-11-22T20:00')),'2026-11-22T20:00');assert.equal(japanDate('2026-11-22T16:00:00Z'),'2026-11-23')
 for(const value of ['','2026-02-30T20:00','2026-11-22T24:30','2026-11-22'])assert.throws(()=>fromJapanInput(value))
})
test('event fields, times and owner participation are validated; unlinked organizer events allowed',()=>{
 for(const changes of [{title:''},{title:'a'.repeat(151)},{place:'unknown'},{endsAt:base.startsAt},{endsAt:'2026-11-22T19:00:00+09:00'},{participants:[]},{startsAt:'2026-11-22T20:00:00'}])assert.throws(()=>normalizeEvent({...base,...changes}))
 assert.equal(normalizeEvent({...base,ownerBandId:'',participants:[]}).participants.length,0)
 assert.equal(normalizeEvent({...base,participants:[...base.participants,...base.participants]}).participants.length,2)
})
test('daily overlap uses JST and end-exclusive bounds; band links include all registered participants',()=>{
 const events=sampleEvents([{id:'band-1',name:'バンド'},{id:'band-2',name:'別バンド'}],new Date('2026-11-22T01:00:00Z'))
 assert.equal(eventsOnDay(events,'2026-11-22').length,5);assert.equal(eventsOnDay(events,'2026-11-23').length,2);assert.equal(eventsOnDay(events,'2026-11-22',['Cluster']).length,1);assert.equal(eventsOnDay(events,'2026-11-22',[]).length,0)
 const midnight=normalizeEvent({...base,startsAt:'2026-11-22T23:00:00+09:00',endsAt:'2026-11-23T00:00:00+09:00'});assert.equal(eventsOnDay([midnight],'2026-11-23').length,0)
 assert.equal(eventsForBand(events,'band-2').length,1);assert.equal(eventsForBand(events,'unmatched').length,0);assert.deepEqual(new Set(events.map(event=>event.place)),new Set(eventPlaces))
})
test('public sheet CSV rejects duplicate IDs and missing schema; unknown private fields dropped',()=>{
 const event=normalizeEvent({...base,actorId:'PRIVATE_SENTINEL'}),row=[event.id,event.ownerBandId,event.title,event.subtitle,event.place,event.venueName,event.venueUrl,event.startsAt,event.endsAt,JSON.stringify(event.participants),'','']
 assert.equal(parseEventCsv(Papa.unparse([eventColumns,row]))[0].title,'ライブ');assert.doesNotMatch(JSON.stringify(event),/PRIVATE_SENTINEL/);assert.throws(()=>parseEventCsv(Papa.unparse([eventColumns,row,row])),/重複/);assert.throws(()=>parseEventCsv('title,place\na,b'),/列/)
})
test('preview storage is owner-scoped and is never used on a public host; sheet fetch happens at runtime',async()=>{
 const keys=['location','localStorage','window','fetch'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),storage=new Map([[eventFixtureKey,japanDate()]])
 globalThis.location={hostname:'127.0.0.1'};globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};globalThis.window={dispatchEvent(){}}
 try{
  const saved=savePreviewEvent(base,{localPreview:true,bandId:'band-1',events:[]});assert.equal((await loadEvents({localPreview:true}))[0].id,saved[0].id)
  assert.throws(()=>savePreviewEvent({...saved[0],title:'他人の変更'},{localPreview:true,bandId:'band-2',events:saved}),/編集できません/);assert.throws(()=>deletePreviewEvent(saved[0].id,{localPreview:true,bandId:'band-2',events:saved}),/削除できません/)
  const changed=savePreviewEvent({...saved[0],title:'更新'},{localPreview:true,bandId:'band-1',events:saved});assert.equal(changed.length,1);assert.equal(changed[0].title,'更新')
  const all=savePreviewEvent({...base,id:'',ownerBandId:'',participants:[]},{localPreview:true,admin:true,events:changed});assert.equal(all.length,2);assert.equal(deletePreviewEvent(all[1].id,{localPreview:true,admin:true,events:all}).length,1)
  globalThis.location.hostname='serieindustry.com';assert.throws(()=>savePreviewEvent(base,{localPreview:true,admin:true,events:[]}),/ローカル/)
  let count=0;globalThis.fetch=async()=>{count++;throw Error('unexpected')};await assert.rejects(loadEvents({localPreview:true}),/未接続/);await assert.rejects(loadEvents({sheetCsvUrl:'https://evil.invalid/private'}),/URL/);assert.equal(count,0)
  globalThis.fetch=async(url,options)=>{count++;assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');return new Response(Papa.unparse([eventColumns,[base.id,base.ownerBandId,base.title,'',base.place,'','',base.startsAt,base.endsAt,JSON.stringify(base.participants),'','']]))};assert.equal((await loadEvents({sheetCsvUrl:'https://docs.google.com/spreadsheets/d/example/export?format=csv&gid=0'})).length,1);assert.equal(count,1)
 }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
})


test('ended events disappear at the exact end boundary and ongoing events remain',()=>{
 const event=normalizeEvent(base),end=new Date(event.endsAt).getTime()
 assert.equal(activeEvents([event],end-1).length,1);assert.equal(activeEvents([event],end).length,0);assert.equal(activeEvents([event],end+1).length,0)
 assert.equal(activeEvents([event],new Date(event.startsAt).getTime()).length,1)
 assert.equal(activeEvents([event],new Date(event.startsAt).getTime()-86400000).length,1)
})
test('week starts on Sunday across year boundaries; month includes all surrounding weekdays',()=>{
 assert.deepEqual(weekDays('2026-11-25'),['2026-11-22','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28'])
 assert.deepEqual(weekDays('2027-01-01'),['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02'])
 const november=monthDays('2026-11-22');assert.equal(november[0],'2026-11-01');assert.equal(november.at(-1),'2026-12-05');assert.equal(november.length,35)
 const leap=monthDays('2024-02-10');assert.equal(leap[0],'2024-01-28');assert.equal(leap.at(-1),'2024-03-02');assert.ok(leap.includes('2024-02-29'))
 assert.equal(monthDays('2026-08-12').length,42);assert.equal(monthDays('2026-02-12').length,28)
 assert.equal(moveCalendar('2026-01-31','month',1),'2026-02-28');assert.equal(moveCalendar('2024-01-31','month',1),'2024-02-29');assert.equal(moveCalendar('2026-12-31','month',1),'2027-01-31');assert.equal(moveCalendar('2026-11-22','week',1),'2026-11-29')
})
test('daily grid clips midnight spans and allocates lanes only for actual time overlaps',()=>{
 const make=(id,start,end)=>normalizeEvent({...base,id,startsAt:start,endsAt:end})
 const events=[make('a','2026-11-22T10:00:00+09:00','2026-11-22T11:00:00+09:00'),make('b','2026-11-22T10:30:00+09:00','2026-11-22T12:00:00+09:00'),make('c','2026-11-22T11:00:00+09:00','2026-11-22T12:00:00+09:00'),make('d','2026-11-22T12:00:00+09:00','2026-11-22T13:00:00+09:00')]
 const slots=layoutDayEvents(events,'2026-11-22');assert.deepEqual(slots.map(item=>item.columns),[2,2,2,1]);assert.equal(slots[0].column,slots[2].column)
 const over=[make('overnight','2026-11-21T23:00:00+09:00','2026-11-23T01:00:00+09:00')];assert.equal(layoutDayEvents(over,'2026-11-22')[0].start,0);assert.equal(layoutDayEvents(over,'2026-11-22')[0].end,1440)
})
test('event detail links escape IDs and keep only calendar navigation filters',()=>{
 const url=eventDetailsUrl('id/with?query',{day:'2026-11-22',view:'month',places:'VRChat,Cluster',ended:'1',secret:'do-not-copy'})
 assert.ok(url.startsWith('/#/VRCBandDB/events/id%2Fwith%3Fquery?'));assert.ok(url.includes('view=month'));assert.ok(url.includes('ended=1'));assert.doesNotMatch(url,/secret|do-not-copy/)
})


test('calendar may include ended events explicitly while preserving location filters',()=>{
 const ended=normalizeEvent(base),future=normalizeEvent({...base,id:'future',place:'Cluster',startsAt:'2026-11-23T20:00:00+09:00',endsAt:'2026-11-23T21:00:00+09:00'}),now=new Date(ended.endsAt).getTime()
 assert.deepEqual(calendarEvents([ended,future],{now}).map(event=>event.id),['future'])
 assert.deepEqual(calendarEvents([ended,future],{now,showEnded:true}).map(event=>event.id),['event-1','future'])
 assert.deepEqual(calendarEvents([ended,future],{now,showEnded:true,places:['VRChat']}).map(event=>event.id),['event-1'])
 assert.equal(calendarEvents([ended,future],{now,showEnded:true,places:[]}).length,0)
 assert.equal(activeEvents([ended],now).length,0)
})


test('expanded fixtures cover late-night visibility, all places, overlaps, ended and future dates without overwriting edits',()=>{
 const now=new Date('2026-11-22T14:55:00Z'),bands=[{id:'band-1',name:'A'},{id:'band-2',name:'B'}],samples=expandedEventSamples(bands,now)
 assert.equal(samples.length,44);assert.equal(new Set(samples.map(event=>event.id)).size,44)
 assert.ok(eventsOnDay(activeEvents(samples,now),'2026-11-22').length>=4)
 assert.deepEqual(new Set(samples.map(event=>event.place)),new Set(eventPlaces))
 assert.ok(samples.some(event=>new Date(event.endsAt)<now));assert.ok(samples.some(event=>event.startsAt.startsWith('2026-12')))
 assert.ok(samples.some(event=>!event.ownerBandId&&!event.participants.length))
 assert.ok(samples.some(event=>event.participants.some(band=>!band.bandId)))
 const modified={...samples[0],title:'手動編集を保持'}
 const merged=mergeEventSamples([modified],samples);assert.equal(merged.length,44);assert.equal(merged[0].title,'手動編集を保持');assert.equal(mergeEventSamples(merged,samples).length,44)
})

test('existing local events receive fixtures once per JST day while preserving saved records',async()=>{
 const keys=['location','localStorage','fetch'],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),storage=new Map([['vbd-live-events-preview-v1',JSON.stringify([normalizeEvent(base)])]])
 globalThis.location={hostname:'127.0.0.1'};globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};let calls=0
 globalThis.fetch=async()=>{calls++;return Response.json({bands:[{id:'band-1',name:'登録済み'}]})}
 try{const first=await loadEvents({localPreview:true});assert.equal(first.length,57);assert.equal(first[0].id,'event-1');const again=await loadEvents({localPreview:true});assert.equal(again.length,57);assert.equal(calls,1);assert.equal(storage.get(eventFixtureKey),japanDate())}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
})


test('venue name and link are separate from event format and unsafe links are refused',()=>{
 const event=normalizeEvent({...base,venueName:'テストワールド',venueUrl:'https://vrchat.com/home/world/wrld_example'})
 assert.equal(event.place,'VRChat');assert.equal(event.venueName,'テストワールド');assert.equal(event.venueUrl,'https://vrchat.com/home/world/wrld_example')
 assert.equal(normalizeEvent({...base,venueName:'会場名のみ'}).venueUrl,'')
 assert.equal(normalizeEvent(base).venueName,'')
 for(const venueUrl of ['javascript:alert(1)','data:text/html,test','file:///C:/secret','https://user:password@example.com/','not-a-link'])assert.throws(()=>normalizeEvent({...base,venueName:'会場',venueUrl}))
 assert.throws(()=>normalizeEvent({...base,venueUrl:'https://example.com/'}),/場所名/)
 assert.throws(()=>normalizeEvent({...base,venueName:'a'.repeat(151)}),/150/)
})

test('venue fields survive new CSV export and legacy CSV without venue columns still loads',()=>{
 const event=normalizeEvent({...base,venueName:'東京駅',venueUrl:'https://www.google.com/maps/search/?api=1&query=Tokyo+Station'})
 const row={eventId:event.id,ownerBandId:event.ownerBandId,title:event.title,place:event.place,venueName:event.venueName,venueUrl:event.venueUrl,startsAt:event.startsAt,endsAt:event.endsAt,participants:JSON.stringify(event.participants),updatedAt:''}
 assert.equal(parseEventCsv(Papa.unparse([row]))[0].venueUrl,event.venueUrl)
 delete row.venueName;delete row.venueUrl;assert.equal(parseEventCsv(Papa.unparse([row]))[0].venueName,'')
})


test('date selectors clamp month length and expose leap days without free-form dates',()=>{
 assert.equal(chooseCalendarDate('2026-01-31','day',{month:2}),'2026-02-28')
 assert.equal(chooseCalendarDate('2024-02-29','day',{year:2025}),'2025-02-28')
 assert.equal(chooseCalendarDate('2024-01-31','day',{month:2}),'2024-02-29')
 assert.equal(chooseCalendarDate('2026-11-22','day',{dayOfMonth:1}),'2026-11-01')
 assert.equal(chooseCalendarDate('2026-11-22','month',{year:2027,month:3}),'2027-03-01')
 for(const changes of [{month:0},{month:13},{year:NaN},{dayOfMonth:0}])assert.throws(()=>chooseCalendarDate('2026-11-22','day',changes))
})
test('week selector anchors inside the chosen month even when its Sunday belongs to the previous month',()=>{
 const weeks=weeksInMonth('2026-12-22')
 assert.equal(weeks[0].start,'2026-11-29');assert.equal(weeks[0].anchor,'2026-12-01')
 assert.equal(chooseCalendarDate('2026-12-22','week',{week:1}),'2026-12-01')
 assert.deepEqual(weekDays(chooseCalendarDate('2026-12-22','week',{week:1})),['2026-11-29','2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-05'])
 assert.equal(chooseCalendarDate('2026-11-29','week',{month:2}),'2026-02-22')
 assert.equal(weeksInMonth('2026-08-01').length,6);assert.equal(weeksInMonth('2026-02-01').length,4)
})


test('subtitle is optional, bounded and survives editing and CSV without requiring old columns',()=>{
 assert.equal(normalizeEvent(base).subtitle,'')
 const event=normalizeEvent({...base,subtitle:' 概要説明\n二行目 '});assert.equal(event.subtitle,'概要説明\n二行目')
 assert.throws(()=>normalizeEvent({...base,subtitle:'あ'.repeat(1001)}),/1000/)
 const row={eventId:event.id,ownerBandId:event.ownerBandId,title:event.title,subtitle:event.subtitle,place:event.place,venueName:'',venueUrl:'',startsAt:event.startsAt,endsAt:event.endsAt,participants:JSON.stringify(event.participants),updatedAt:''}
 assert.equal(parseEventCsv(Papa.unparse([row]))[0].subtitle,event.subtitle)
 delete row.subtitle;assert.equal(parseEventCsv(Papa.unparse([row]))[0].subtitle,'')
 assert.equal(normalizeEvent({...event,title:'変更後'}).subtitle,event.subtitle)
})


test('new specification fixtures cover subtitle and venue variations without showing unsafe HTML as markup',()=>{
 const samples=specEventSamples([{id:'band-1',name:'バンドA'},{id:'band-2',name:'バンドB'}],new Date('2026-11-22T14:55:00Z'))
 assert.equal(samples.length,12);assert.equal(new Set(samples.map(event=>event.id)).size,12)
 assert.ok(samples.some(event=>event.subtitle.length===1000));assert.ok(samples.some(event=>event.subtitle.includes('\n')));assert.ok(samples.some(event=>!event.subtitle))
 assert.ok(samples.some(event=>event.venueName&&!event.venueUrl));assert.ok(samples.some(event=>!event.venueName&&!event.venueUrl))
 assert.ok(samples.some(event=>event.venueUrl.includes('/world/')));assert.ok(samples.some(event=>event.venueUrl.includes('vrc.group')));assert.ok(samples.some(event=>event.venueUrl.includes('google.com/maps')))
 assert.ok(samples.some(event=>!event.ownerBandId&&!event.participants.length));assert.ok(samples.some(event=>event.participants.length>=5))
 assert.equal(samples.find(event=>event.title.startsWith('TC-E09')).endsAt<'2026-11-22T14:55:00.000Z',true)
})

test('fixture upgrade fills new empty fields but preserves manual content and non-fixture records',()=>{
 const sample=expandedEventSamples([{id:'band-1',name:'A'}],new Date('2026-11-22T01:00:00Z')).find(event=>event.subtitle&&event.venueUrl)
 const old={...sample,title:'手動編集タイトル',subtitle:'',venueName:'',venueUrl:''},manual={...old,id:'custom-event'}
 const upgraded=refreshFixtureFields([old,manual],[sample]);assert.equal(upgraded[0].title,'手動編集タイトル');assert.equal(upgraded[0].subtitle,sample.subtitle);assert.equal(upgraded[0].venueName,sample.venueName);assert.deepEqual(upgraded[1],manual)
 const edited={...old,subtitle:'手動の概要',venueName:'リンクを設定しない会場名'};const kept=refreshFixtureFields([edited],[sample])[0];assert.equal(kept.subtitle,edited.subtitle);assert.equal(kept.venueName,edited.venueName);assert.equal(kept.venueUrl,'')
})


test('a dense day allocates a separate lane for each simultaneous event without adding lanes for later events',()=>{
 const events=Array.from({length:20},(_,i)=>normalizeEvent({...base,id:'dense-'+i}))
 const later=normalizeEvent({...base,id:'later',startsAt:base.endsAt,endsAt:'2026-11-22T22:00:00+09:00'})
 const slots=layoutDayEvents([...events,later],'2026-11-22')
 assert.equal(new Set(slots.slice(0,20).map(slot=>slot.column)).size,20)
 assert.ok(slots.slice(0,20).every(slot=>slot.columns===20))
 assert.equal(slots.at(-1).columns,1)
})


test('minimum visual duration separates consecutive short cards without changing their actual event times',()=>{
 const first=normalizeEvent({...base,id:'short1',startsAt:'2026-11-22T12:00:00+09:00',endsAt:'2026-11-22T12:15:00+09:00'})
 const next=normalizeEvent({...base,id:'short2',startsAt:first.endsAt,endsAt:'2026-11-22T12:30:00+09:00'})
 const later=normalizeEvent({...base,id:'later',startsAt:'2026-11-22T13:00:00+09:00',endsAt:'2026-11-22T13:15:00+09:00'})
 const normal=layoutDayEvents([first,next],'2026-11-22');assert.equal(normal[0].columns,1)
 const slots=layoutDayEvents([first,next,later],'2026-11-22',55)
 assert.equal(slots[0].columns,2);assert.notEqual(slots[0].column,slots[1].column)
 assert.equal(slots[2].column,slots[0].column)
 assert.equal(slots[0].end-slots[0].start,15);assert.equal(slots[0].event.endsAt,first.endsAt)
})
