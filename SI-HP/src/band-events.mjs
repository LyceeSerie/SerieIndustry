import Papa from 'papaparse'
export const eventPlaces=['VRChat','Cluster','リアル','その他']
export const eventStorageKey='vbd-live-events-preview-v1'
export const eventFixtureKey='vbd-live-events-fixtures-v5'
export const eventColumns=['eventId','ownerBandId','title','subtitle','place','venueName','venueUrl','startsAt','endsAt','participants','updatedAt']
export function previewAllowed(enabled){return enabled===true&&typeof location!=='undefined'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)}
export function japanDate(value=new Date()){return new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,10)}
export function toJapanInput(value){return new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,16)}
export function fromJapanInput(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('日時を入力してください。')
 const date=new Date(value+':00+09:00');if(!Number.isFinite(date.getTime())||toJapanInput(date)!==value)throw Error('日時を確認してください。')
 return date.toISOString()
}
export function normalizeEvent(input){
 const text=value=>String(value??'').trim(),title=text(input.title)
 if(!title||title.length>150)throw Error('イベント名は150文字以内で入力してください。')
 const subtitle=text(input.subtitle);if(subtitle.length>1000)throw Error('サブタイトルは1000文字以内で入力してください。')
 if(!eventPlaces.includes(input.place))throw Error('形態を選択してください。')
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.startsAt||'')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.endsAt||''))throw Error('タイムゾーンを含む日時が必要です。')
 const start=new Date(input.startsAt),end=new Date(input.endsAt)
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw Error('終了日時は開始日時より後にしてください。')
 const venueName=text(input.venueName),rawUrl=text(input.venueUrl);let venueUrl=''
 if(venueName.length>150)throw Error('場所名は150文字以内で入力してください。')
 if(rawUrl){if(!venueName)throw Error('場所リンクを設定する場合は場所名を入力してください。');if(rawUrl.length>2048)throw Error('場所リンクは2048文字以内で入力してください。');let url;try{url=new URL(rawUrl)}catch{throw Error('場所リンクにはhttp/httpsのURLを入力してください。')}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('場所リンクには認証情報を含まないhttp/httpsのURLを入力してください。');venueUrl=url.href}
 const ownerBandId=text(input.ownerBandId),participants=[],seen=new Set()
 if(!Array.isArray(input.participants)||input.participants.length>50)throw Error('参加バンドは50件以内で指定してください。')
 for(const item of input.participants){const bandId=text(item.bandId),name=text(item.name);if(!name||name.length>150)throw Error('参加バンド名は150文字以内で入力してください。');const key=bandId?'id:'+bandId:'name:'+name.toLocaleLowerCase();if(!seen.has(key)){seen.add(key);participants.push({bandId,name})}}
 if(ownerBandId&&!participants.some(item=>item.bandId===ownerBandId))throw Error('登録元のバンドを参加バンドに含めてください。')
 return {id:text(input.id),ownerBandId,title,subtitle,place:input.place,venueName,venueUrl,startsAt:start.toISOString(),endsAt:end.toISOString(),participants,updatedAt:text(input.updatedAt)}
}
export function eventsOnDay(events,day,places=eventPlaces){
 const start=fromJapanInput(day+'T00:00'),end=new Date(new Date(start).getTime()+86400000).toISOString()
 return events.filter(event=>places.includes(event.place)&&event.startsAt<end&&event.endsAt>start).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.title.localeCompare(b.title,'ja'))
}
export function eventsForBand(events,id){return events.filter(event=>event.ownerBandId===id||event.participants.some(participant=>participant.bandId===id)).sort((a,b)=>a.startsAt.localeCompare(b.startsAt))}
export function parseEventCsv(csv){
 const parsed=Papa.parse(csv,{header:true,skipEmptyLines:'greedy'})
 if(parsed.errors.length||eventColumns.filter(column=>!['subtitle','venueName','venueUrl'].includes(column)).some(column=>!parsed.meta.fields?.includes(column)))throw Error('イベントシートの列・CSV形式を確認してください。')
 const seen=new Set();return parsed.data.map(row=>{if(!row.eventId||seen.has(row.eventId))throw Error('イベントIDが空か重複しています。');seen.add(row.eventId);return normalizeEvent({...row,id:row.eventId,participants:JSON.parse(row.participants)})})
}
export function sampleEvents(bands,now=new Date()){
 const day=japanDate(now),next=japanDate(new Date(new Date(day+'T00:00:00+09:00').getTime()+86400000)),first=bands[0]||{id:'00000000-0000-4000-8000-000000000001',name:'登録画面テストバンド'},second=bands[1]||first
 const items=eventPlaces.map((place,index)=>({id:'sample-event-'+index,ownerBandId:index===3?'':first.id,title:['VRライブ テスト','Cluster セッション','リアルライブ テスト','運営交流イベント'][index],place,startsAt:fromJapanInput(day+'T'+['20:00','21:00','18:00','19:00'][index]),endsAt:fromJapanInput(day+'T'+['21:00','22:00','20:00','20:30'][index]),participants:index===3?[]:[{bandId:first.id,name:first.name},...(index===0?[{bandId:second.id,name:second.name},{bandId:'',name:'未登録ゲストバンド'}]:[])],updatedAt:now.toISOString()}))
 items.push({id:'sample-overnight',ownerBandId:first.id,title:'日付をまたぐライブ',place:'VRChat',startsAt:fromJapanInput(day+'T23:30'),endsAt:fromJapanInput(next+'T01:00'),participants:[{bandId:first.id,name:first.name}],updatedAt:now.toISOString()})
 for(const [index,offset] of [1,3,14].entries()){
  const future=shiftDay(day,offset);items.push({id:'sample-future-'+index,ownerBandId:first.id,title:['翌日のライブ','週表示テストライブ','月表示テストライブ'][index],place:eventPlaces[index],startsAt:fromJapanInput(future+'T20:00'),endsAt:fromJapanInput(future+'T21:30'),participants:[{bandId:first.id,name:first.name}],updatedAt:now.toISOString()})
 }
 return items.map(normalizeEvent)
}
export async function loadEventBands(){
 const response=await fetch('/data/vrc-bands.json',{cache:'no-cache'});if(!response.ok)throw Error('バンド一覧を取得できませんでした。');const data=await response.json();if(!Array.isArray(data.bands))throw Error('バンド一覧の形式が不正です。');return data.bands.map(band=>({id:band.id,name:band.name}))
}
export async function loadEvents({localPreview=false,sheetCsvUrl=''}={}){
 if(previewAllowed(localPreview)){
  const stored=localStorage.getItem(eventStorageKey)
  let events=[]
  if(stored!==null){const parsed=JSON.parse(stored);if(!Array.isArray(parsed))throw Error('テストデータの形式が不正です。');events=parsed.map(normalizeEvent)}
  const stamp=japanDate()
  if(localStorage.getItem(eventFixtureKey)!==stamp){
   const bands=await loadEventBands(),latest=localStorage.getItem(eventStorageKey)
   if(latest!==stored){const parsed=latest===null?[]:JSON.parse(latest);if(!Array.isArray(parsed))throw Error('テストデータの形式が不正です。');events=parsed.map(normalizeEvent)}
   const samples=[...(latest===null?sampleEvents(bands):[]),...expandedEventSamples(bands),...specEventSamples(bands)]
   events=mergeEventSamples(refreshFixtureFields(events,samples),samples)
   localStorage.setItem(eventStorageKey,JSON.stringify(events));localStorage.setItem(eventFixtureKey,stamp)
  }
  return events
 }
 if(!sheetCsvUrl)throw Error('イベントシートは未接続です。現在はローカル確認のみです。')
 const url=new URL(sheetCsvUrl);if(url.origin!=='https://docs.google.com'||!/^\/spreadsheets\/d\/[\w-]+\/export$/.test(url.pathname)||url.searchParams.get('format')!=='csv'||!/^\d+$/.test(url.searchParams.get('gid')||'')||url.username||url.password||url.hash||[...url.searchParams.keys()].some(key=>!['format','gid'].includes(key)))throw Error('イベントシートのURLが不正です。')
 const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('イベント情報を取得できませんでした。');return parseEventCsv(await response.text())
}
export function savePreviewEvent(input,{localPreview=false,admin=false,bandId='',events=[]}={}){
 if(!previewAllowed(localPreview))throw Error('イベント登録はローカル確認のみです。')
 const event=normalizeEvent(input),old=events.find(item=>item.id===event.id)
 if(!admin&&(!bandId||event.ownerBandId!==bandId||old&&old.ownerBandId!==bandId))throw Error('このイベントを編集できません。')
 const saved={...event,id:old?.id||crypto.randomUUID(),updatedAt:new Date().toISOString()}
 const next=old?events.map(item=>item.id===old.id?saved:item):[...events,saved];localStorage.setItem(eventStorageKey,JSON.stringify(next));window.dispatchEvent(new Event('vbd-events-changed'));return next
}
export function deletePreviewEvent(id,{localPreview=false,admin=false,bandId='',events=[]}={}){
 if(!previewAllowed(localPreview))throw Error('イベント削除はローカル確認のみです。')
 const event=events.find(item=>item.id===id);if(!event||!admin&&(!bandId||event.ownerBandId!==bandId))throw Error('このイベントを削除できません。')
 const next=events.filter(item=>item.id!==id);localStorage.setItem(eventStorageKey,JSON.stringify(next));window.dispatchEvent(new Event('vbd-events-changed'));return next
}

export function activeEvents(events,now=Date.now()){
 const time=new Date(now).getTime();return events.filter(event=>new Date(event.endsAt).getTime()>time)
}
export function shiftDay(day,amount){return japanDate(new Date(new Date(fromJapanInput(day+'T00:00')).getTime()+amount*86400000))}
export function weekDays(day){const weekday=new Date(day+'T00:00:00Z').getUTCDay();return Array.from({length:7},(_,i)=>shiftDay(day,i-weekday))}
export function monthDays(day){
 const first=day.slice(0,7)+'-01',date=new Date(first+'T00:00:00Z'),last=japanDate(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)))
 const start=weekDays(first)[0],end=weekDays(last)[6],count=Math.round((new Date(end+'T00:00:00Z')-new Date(start+'T00:00:00Z'))/86400000)+1
 return Array.from({length:count},(_,i)=>shiftDay(start,i))
}
export function moveCalendar(day,view,amount){
 if(view!=='month')return shiftDay(day,amount*(view==='week'?7:1))
 const date=new Date(day+'T00:00:00Z'),year=date.getUTCFullYear(),month=date.getUTCMonth()+amount,last=new Date(Date.UTC(year,month+1,0)).getUTCDate()
 return japanDate(new Date(Date.UTC(year,month,Math.min(date.getUTCDate(),last))))
}
export function layoutDayEvents(events,day){
 const midnight=new Date(fromJapanInput(day+'T00:00')).getTime(),items=eventsOnDay(events,day).map(event=>({event,start:Math.max(0,(new Date(event.startsAt).getTime()-midnight)/60000),end:Math.min(1440,(new Date(event.endsAt).getTime()-midnight)/60000),column:0,columns:1})).sort((a,b)=>a.start-b.start||a.end-b.end||a.event.id.localeCompare(b.event.id))
 let group=[],groupEnd=0
 function finish(){const ends=[];for(const item of group){let column=ends.findIndex(end=>end<=item.start);if(column<0)column=ends.length;ends[column]=item.end;item.column=column}for(const item of group)item.columns=ends.length;group=[]}
 for(const item of items){if(group.length&&item.start>=groupEnd)finish();if(!group.length)groupEnd=item.end;else groupEnd=Math.max(groupEnd,item.end);group.push(item)}finish();return items
}
export function eventDetailsUrl(id,query={}){const params=new URLSearchParams();for(const key of ['day','view','places','ended'])if(typeof query[key]==='string')params.set(key,query[key]);return '/#/VRCBandDB/events/'+encodeURIComponent(id)+(params.size?'?'+params:'')}

export function calendarEvents(events,{now=Date.now(),places=eventPlaces,showEnded=false}={}){return (showEnded?events:activeEvents(events,now)).filter(event=>places.includes(event.place))}

export function mergeEventSamples(events,samples){const ids=new Set(events.map(event=>event.id));return [...events,...samples.filter(event=>{if(ids.has(event.id))return false;ids.add(event.id);return true})]}
export function expandedEventSamples(bands,now=new Date()){
 const day=japanDate(now),catalog=bands.length?bands:[{id:'band-1',name:'テストバンド'}],first=catalog[0],items=[],prefix='demo-v3-'+day+'-'
 function add(key,title,place,start,end,index=0,unlinked=false,guests=true){const owner=catalog[index%catalog.length];items.push(normalizeEvent({id:prefix+key,ownerBandId:unlinked?'':owner.id,title,subtitle:index%4===0?'':index%4===1?'初めての方も参加しやすい、バンドによるライブイベントです。':'オリジナル曲とカバー曲をお届けする合同ライブです。\n途中参加・途中退出も歓迎します。\n場所名のリンクから会場を確認してください。',place,...sampleVenue(place,index),startsAt:start,endsAt:end,participants:unlinked?[]:[{bandId:owner.id,name:owner.name},...(guests?[{bandId:first.id,name:first.name},{bandId:'',name:'未登録ゲスト '+(index+1)}]:[])],updatedAt:now.toISOString()}))}
 // Several currently running events remain visible even when testing late at night.
 for(let i=0;i<4;i++)add('ongoing-'+i,['VRChat ナイトフェス','Cluster 深夜セッション','リアル配信ライブ','運営交流会（バンド指定なし）'][i],eventPlaces[i],new Date(now.getTime()-15*60000).toISOString(),new Date(now.getTime()+(45+i*20)*60000).toISOString(),i,i===3)
 for(let i=0;i<4;i++)add('near-'+i,'このあと開催 '+['アコースティック','ロック','ジャズ','電子音楽'][i],eventPlaces[i],new Date(now.getTime()+(5+i*10)*60000).toISOString(),new Date(now.getTime()+(65+i*15)*60000).toISOString(),i+1)
 for(const [index,offset]of [-2,-1,0,1,2,3,4,5,6,7,10,14,20,28].entries()){
  const date=shiftDay(day,offset)
  add('evening-'+index,['合同ライブ','ソロステージ','週末フェス','バンド対バン'][index%4]+'・'+date,eventPlaces[index%4],fromJapanInput(date+'T19:00'),fromJapanInput(date+'T20:30'),index)
  add('late-'+index,'夜のライブ・'+date,eventPlaces[(index+1)%4],fromJapanInput(date+'T22:30'),fromJapanInput(shiftDay(date,1)+'T00:30'),index+1,index%5===0)
 }
 const last=monthDays(day).filter(date=>date.slice(0,7)===day.slice(0,7)).at(-1)
 add('month-boundary','月末から翌月へのカウントダウン','VRChat',fromJapanInput(last+'T23:00'),fromJapanInput(shiftDay(last,1)+'T01:00'),0)
 add('long-name','長いイベント名の折り返し確認：登録バンドと未登録ゲストが参加するスペシャルセッション','Cluster',fromJapanInput(shiftDay(day,2)+'T13:00'),fromJapanInput(shiftDay(day,2)+'T17:00'),2)
 add('short','15分ミニライブ','リアル',fromJapanInput(shiftDay(day,1)+'T12:00'),fromJapanInput(shiftDay(day,1)+'T12:15'),3,false,false)
 add('all-day','終日イベント（0時〜24時）','その他',fromJapanInput(shiftDay(day,3)+'T00:00'),fromJapanInput(shiftDay(day,4)+'T00:00'),0,true)
 for(let i=0;i<4;i++)add('venue-example-'+i,'場所リンク確認・'+eventPlaces[i],eventPlaces[i],new Date(now.getTime()+i*5*60000).toISOString(),new Date(now.getTime()+90*60000).toISOString(),i)
 return items
}

export function sampleVenue(place,index=0){
 if(index%5===4)return {venueName:'会場調整中',venueUrl:''}
 return {venueName:{VRChat:'VRChat サンプル会場（リンク例）',Cluster:'Cluster 会場（リンク例）',リアル:'東京駅周辺（地図の例）',その他:'配信会場（リンク例）'}[place]||'サンプル会場',venueUrl:{VRChat:'https://vrchat.com/home',Cluster:'https://cluster.mu/',リアル:'https://www.google.com/maps/search/?api=1&query=Tokyo+Station',その他:'https://www.youtube.com/'}[place]||''}
}

export function weeksInMonth(day){const month=day.slice(0,7),dates=monthDays(day),weeks=[];for(let i=0;i<dates.length;i+=7){const range=dates.slice(i,i+7);weeks.push({number:weeks.length+1,start:range[0],end:range[6],anchor:range.find(date=>date.startsWith(month))})}return weeks}
export function chooseCalendarDate(day,view,changes={}){
 const year=Number(changes.year??day.slice(0,4)),month=Number(changes.month??day.slice(5,7))
 if(!Number.isInteger(year)||year<1000||year>9999||!Number.isInteger(month)||month<1||month>12)throw Error('年月を確認してください。')
 const first=String(year)+'-'+String(month).padStart(2,'0')+'-01'
 if(view==='month')return first
 if(view==='week'){const currentWeeks=weeksInMonth(day),index=currentWeeks.findIndex(week=>week.start===weekDays(day)[0]),weeks=weeksInMonth(first),number=Number(changes.week??index+1);if(!Number.isInteger(number)||number<1||number>6)throw Error('週を確認してください。');return weeks[Math.min(number,weeks.length)-1].anchor}
 const requested=Number(changes.dayOfMonth??day.slice(8)),last=new Date(Date.UTC(year,month,0)).getUTCDate();if(!Number.isInteger(requested)||requested<1||requested>31)throw Error('日を確認してください。');return first.slice(0,8)+String(Math.min(requested,last)).padStart(2,'0')
}

export function refreshFixtureFields(events,samples){const definitions=new Map(samples.map(event=>[event.id,event]));return events.map(event=>{const sample=definitions.get(event.id);if(!sample||!/^demo-(?:v3|spec-v5)-/.test(event.id))return event;return {...event,subtitle:event.subtitle||sample.subtitle,...(!event.venueName&&!event.venueUrl?{venueName:sample.venueName,venueUrl:sample.venueUrl}:{})}})}
export function specEventSamples(bands,now=new Date()){
 const day=japanDate(now),catalog=bands.length?bands:[{id:'band-1',name:'確認バンド'}],first=catalog[0]
 const longSubtitle=('会場へのアクセス、演奏内容、参加方法についての長文説明です。\n自由な改行と折り返しを確認してください。\n').repeat(20).slice(0,1000)
 const cases=[
  {title:'TC-E01 短い概要・ワールドリンク',place:'VRChat',subtitle:'バンドのオリジナル曲を中心にお届けするライブです。',venueName:'VRChat ワールド（架空リンクの例）',venueUrl:'https://vrchat.com/home/world/wrld_00000000-0000-4000-8000-000000000001'},
  {title:'TC-E02 複数行の概要・グループリンク',place:'VRChat',subtitle:'初めての方も歓迎します。\nグループへの参加方法は場所リンクから確認できます。\n途中参加・途中退出も可能です。',venueName:'VRChat グループ（リンク形式の例）',venueUrl:'https://vrc.group/TEST.0000'},
  {title:'TC-E03 長文1000文字・地図リンク',place:'リアル',subtitle:longSubtitle,venueName:'東京駅周辺（地図の例）',venueUrl:'https://www.google.com/maps/search/?api=1&query=Tokyo+Station'},
  {title:'TC-E04 サブタイトルなし・場所名のみ',place:'Cluster',subtitle:'',venueName:'会場準備中（リンクなし）',venueUrl:''},
  {title:'TC-E05 サブタイトル・場所の入力なし',place:'その他',subtitle:'',venueName:'',venueUrl:''},
  {title:'TC-E06 長い場所名の折り返し',place:'リアル',subtitle:'場所名が長い場合の折り返しと、名前を押したときのリンクを確認できます。',venueName:'架空のライブハウス・ホール・イベント会場の名前が長い場合の表示を確認するための場所名です。'.repeat(2),venueUrl:'https://www.google.com/maps/search/?api=1&query=Tokyo'},
  {title:'TC-E07 記号・改行を含む概要',place:'Cluster',subtitle:'出演：A & B / C\n開場前の案内「お知らせ」や <b>文字として表示</b> を確認します。\n料金：無料（テスト用）',venueName:'Cluster 会場（リンク例）',venueUrl:'https://cluster.mu/'},
  {title:'TC-E08 登録・未登録バンド多数',place:'VRChat',subtitle:'多くの出演バンドが並ぶイベントです。\n参加バンドのリンクと、未登録名がリンクにならないことを確認できます。',venueName:'合同ライブ会場（リンク例）',venueUrl:'https://vrchat.com/home'},
  {title:'TC-E09 終了イベント・概要あり',place:'リアル',subtitle:'終了イベントの表示設定を有効にすると、この説明を詳細で確認できます。',venueName:'終了済みの会場（地図例）',venueUrl:'https://www.google.com/maps/search/?api=1&query=Tokyo+Station'},
  {title:'TC-E10 日をまたぐイベント・概要あり',place:'VRChat',subtitle:'夜から翌日まで続くライブです。\n日・週・月で表示が分割されても、同じイベント詳細へ移動します。',venueName:'ナイトライブ会場（リンク例）',venueUrl:'https://vrchat.com/home'},
  {title:'TC-E11 運営イベント・参加バンドなし',place:'その他',subtitle:'バンドに紐づかない運営主催の交流イベントです。\n参加バンドの欄が空でも概要は表示されます。',venueName:'運営配信会場（リンク例）',venueUrl:'https://www.youtube.com/'},
  {title:'TC-E12 長いイベント名と概要の組み合わせ：複数の登録バンドと未登録ゲストによる特別な合同セッションを開催します',place:'Cluster',subtitle:'カレンダーの簡易表示にはイベント名だけを表示し、こちらの説明文は表示しません。\nイベント詳細で長い名前と説明が自然に折り返されることを確認できます。',venueName:'Cluster 会場（リンク例）',venueUrl:'https://cluster.mu/'}
 ]
 return cases.map((item,index)=>{
  const date=shiftDay(day,index===8?-1:Math.max(0,index-4)),start=index<5?new Date(now.getTime()-5*60000).toISOString():fromJapanInput(date+'T20:00'),end=index<5?new Date(now.getTime()+120*60000).toISOString():fromJapanInput((index===9?shiftDay(date,1):date)+(index===9?'T01:00':'T22:00'))
  const owner=catalog[index%catalog.length],participants=index===10?[]:index===7?[...catalog.slice(0,12).map(band=>({bandId:band.id,name:band.name})),...['ゲストA','ゲストB','ゲストC'].map(name=>({bandId:'',name}))]:[{bandId:owner.id,name:owner.name},...(index%2?[{bandId:'',name:'未登録ゲスト'}]:[])]
  return normalizeEvent({id:'demo-spec-v5-'+day+'-'+index,ownerBandId:index===10?'':owner.id,...item,startsAt:start,endsAt:end,participants,updatedAt:now.toISOString()})
 })
}
