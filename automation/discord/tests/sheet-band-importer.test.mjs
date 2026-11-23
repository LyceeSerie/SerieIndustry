import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const html=readFileSync(new URL('../tools/sheet-band-importer.html',import.meta.url),'utf8')
const context=vm.createContext({URL,URLSearchParams,TextEncoder})
vm.runInContext(html.match(/<script id="import-core">([\s\S]*?)<\/script>/)[1]+'\nglobalThis.converter=SheetImport;',context)
vm.runInContext(readFileSync(new URL('../gas/Core.gs',import.meta.url),'utf8'),context)
const c=context.converter,plain=x=>JSON.parse(JSON.stringify(x))
const head=['アーティスト名','形態','解散済み','主な活動場所','X (旧Twitter) URL (なければ他SNS)','YouTube / 公式リンク','VRCグループ','公式サイトなど','情報源・きっかけ','備考（タグ等）','リアルライブ可否','最終確認日']
function rows(...values){return c.convert([head,...values])}
test('maps actual sheet headers to import allowlist without publishing observational notes or inferring missing information',()=>{
 const [row]=rows(['試験バンド','バンド','','Cluster/VRChat','https://x.com/test','https://www.youtube.com/@test','https://vrc.group/TEST.1234','https://example.com/','PRIVATE_SOURCE','分類: ユニット; PRIVATE_NOTE','PRIVATE_AVAILABILITY','2026/01/01'])
 const band=JSON.parse(c.batches([row])[0])[0]
 assert.equal(band['活動形態１'],'バンド');assert.equal(band['活動形態３'],undefined)
 assert.equal(band['活動プラットフォーム'],'Cluster, VRChat');assert.equal(band['コメント'],undefined)
 assert.equal(band['SNSリンク（Youtube）'],'https://www.youtube.com/@test')
 assert.equal(band['その他SNSリンク1'],'リンク1: https://example.com/')
 for(const key of Object.keys(band))assert.ok(context.BandReview.fields.includes(key))
 const snapshot=context.BandReview.snapshot(context.BandReview.fields.map(title=>({title,value:band[title]||''})))
 assert.equal(snapshot['活動名'],'試験バンド')
 assert.equal(JSON.stringify(band).includes('PRIVATE_'),false)
})
test('filters strictly by source type, name and explicit dissolved marker, leaving ambiguous personal type unassigned',()=>{
 const list=rows(['A','バンド','はい'],['B','ユニット'],['Ｃ','個人'],['D','ソロ？'])
 assert.equal(c.filter(list,{type:'ユニット'}).length,1)
 assert.equal(c.filter(list,{state:'yes'}).length,1)
 assert.equal(c.filter(list,{state:'no'}).length,3)
 assert.equal(c.filter(list,{query:'c'})[0].band['活動名'],'Ｃ')
 assert.equal(list[0].band['活動形態３'],'解散/活動停止中（休止）')
 assert.equal(list[2].band['活動形態１'],undefined)
})
test('CSV handles BOM, CRLF, quoted comma/newline/escaped quotes and rejects malformed headers and quote structure',()=>{
 assert.deepEqual(plain(c.csv('\uFEFFa,b\r\n"x,y","a""b\n続き"\r\n')),[['a','b'],['x,y','a"b\n続き']])
 for(const text of ['a,"unterminated','a,"closed"x','a,b"c'])assert.throws(()=>c.csv(text))
 assert.throws(()=>c.convert([['bad']]))
 assert.throws(()=>c.convert([[...head,'形態']]))
})
test('classifies non-X socials and YouTube videos without confusing playlists with video IDs',()=>{
 const [row]=rows(['unit','ユニット','','VRChat','https://bsky.app/profile/test','https://www.youtube.com/watch?v=M7lc1UVf-VE','https://vrc.group/A.1234','https://example.com'])
 assert.equal(row.band['SNSリンク（X/Twitter）'],undefined)
 assert.equal(row.band.YouTube動画URL,'https://www.youtube.com/watch?v=M7lc1UVf-VE')
 assert.equal(row.band['その他SNSリンク1'],'リンク1: https://bsky.app/profile/test')
 const [playlist]=rows(['list','バンド','','','','https://www.youtube.com/playlist?list=PLtest'])
 assert.equal(playlist.band.YouTube動画URL,undefined);assert.ok(playlist.band['SNSリンク（Youtube）'])
 const [bad]=rows(['bad','バンド','','','javascript:alert(1)']);assert.throws(()=>c.batches([bad]))
})
test('output batches obey both count and byte limits, preserve duplicates for review, and reject unsupported data',()=>{
 const many=rows(...Array.from({length:45},(_,i)=>['Band '+i,'バンド']))
 assert.deepEqual(plain(c.batches(many).map(s=>JSON.parse(s).length)),[20,20,5])
 const heavy=many.slice(0,20).map(r=>({...r,band:{'活動名':'あ'.repeat(3900),'活動形態１':'バンド'}}))
 const chunks=c.batches(heavy);assert.ok(chunks.length>1)
 for(const chunk of chunks){assert.ok(new TextEncoder().encode(chunk).length<=65536);assert.ok(JSON.parse(chunk).length<=20)}
 assert.throws(()=>c.batches([]));assert.throws(()=>c.batches([{id:1,band:{'活動名':''}}]))
 const [r]=rows(['x','バンド']);r.band.unknown='PRIVATE';assert.equal(c.batches([r])[0].includes('unknown'),false)
})
test('source URL is restricted to HTTPS Google Sheets and honors the requested tab',()=>{
 assert.ok(c.sourceUrl('https://docs.google.com/spreadsheets/d/abc/edit#gid=2113204474').endsWith('gid=2113204474'))
 for(const raw of ['http://docs.google.com/spreadsheets/d/a/edit','https://evil.test/spreadsheets/d/a/edit','https://docs.google.com/spreadsheets/d/a/edit?gid=bad'])assert.throws(()=>c.sourceUrl(raw))
 for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(match[1]))
 assert.equal(html.includes('innerHTML'),false)
})


test('Google browser JSONP uses fixed Google host and maps table response without CSV fetch',()=>{
 const url=new URL(c.jsonpUrl('https://docs.google.com/spreadsheets/d/abc/edit#gid=2113204474','VbdSheet_test'))
 assert.equal(url.hostname,'docs.google.com');assert.equal(url.pathname,'/spreadsheets/d/abc/gviz/tq')
 assert.equal(url.searchParams.get('gid'),'2113204474');assert.equal(url.searchParams.get('headers'),'1')
 assert.equal(url.searchParams.get('tqx'),'out:json;responseHandler:VbdSheet_test')
 assert.throws(()=>c.jsonpUrl('https://docs.google.com/spreadsheets/d/abc/edit','evil()'))
 const table={status:'ok',table:{cols:head.map(label=>({label})),rows:[{c:[{v:'Test'},{v:'バンド'},null,{v:'VRChat'}]}]}}
 assert.equal(c.convert(c.tableRows(table))[0].band['活動名'],'Test')
 assert.throws(()=>c.tableRows({status:'error'}))
 assert.equal(html.includes('await fetch('),false)
})


test('activity type override uses supported choices, changes exports and preserves source filters',()=>{
 const list=rows(['Solo','個人'],['Maybe','ソロ？'],['Band','バンド'])
 c.overrideType(list.slice(0,2),'ユニット')
 const exported=JSON.parse(c.batches(list)[0])
 assert.equal(exported[0]['活動形態１'],'ユニット');assert.equal(exported[1]['活動形態１'],'ユニット')
 assert.equal(exported[2]['活動形態１'],'バンド');assert.equal(c.filter(list,{type:'個人'}).length,1)
 c.overrideType([list[0]],'弾き語り');assert.equal(JSON.parse(c.batches(list)[0])[0]['活動形態１'],'弾き語り')
 assert.throws(()=>c.overrideType(list,'個人'));assert.equal(list[0].band['活動形態１'],'弾き語り')
 c.overrideType([list[0]],'');assert.equal(JSON.parse(c.batches(list)[0])[0]['活動形態１'],undefined)
})
