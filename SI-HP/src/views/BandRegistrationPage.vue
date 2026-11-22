<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import C from 'virtual:band-editor'
import terms from 'virtual:registration-terms'
import LiveEventEditor from '../components/LiveEventEditor.vue'
import BandImage from '../components/BandImage.vue'
import BandVisual from '../components/BandVisual.vue'
import BandVideo from '../components/BandVideo.vue'
import FileUploadButton from '../components/FileUploadButton.vue'
import { bandImage, logoLayout, validReading, validEnglish, splitNamedLink, joinNamedLink } from '../band-media.mjs'

type Band=Record<string,string>
type OwnershipEvent={at:string;by:string;owner:string;previousOwners?:string[]}
type Draft={band:Band;id?:string;revision?:number;status?:string;submissionId?:string;hash?:string;ownerUserIds?:string[];ownershipVersion?:number;ownershipAudit?:OwnershipEvent[];registrationSource?:string;ownershipType?:string;tags:Record<string,string[]>;extras:Record<string,string[]>;members:{part:string;name:string;account:string}[];links:Record<string,{title:string;url:string}>}
type PortalUser={id:string;username:string;displayName:string}
type Me={users?:PortalUser[];role?:string;userId?:string;canManage?:boolean;csrf:string;records:({id:string;revision:number;status:string;band:Band}&Partial<Draft>)[];limits:Record<string,{bytes:number;width:number;height:number}>;consentRequired?:boolean;termsVersion?:string}
type PreviewWindow=Window&{VBD_PREVIEW_API?:(path:string,body?:unknown)=>Promise<any>;VBD_PREVIEW_OUTPUT?:(core:typeof C,band:Band)=>Band}
const preview=window as PreviewWindow
const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&!!preview.VBD_PREVIEW_API
const drafts=ref<Draft[]>([]),active=ref(0),admin=ref(false),loaded=ref(false),busy=ref(false),dirty=ref(false),notice=ref(''),error=ref(false),consentRequired=ref(true),accepted=ref(false)
const current=computed(()=>drafts.value[active.value])
const canManage=ref(false),requestedMode=ref(sessionStorage.getItem('vbd-portal-mode')==='user'?'user':'admin')
const editorTab=ref('band')
const loginId=ref(''),ownerInput=ref(''),ownerSearch=ref(''),registeredUsers=ref<PortalUser[]>([])
const matchingUsers=computed(()=>{const query=ownerSearch.value.trim().toLocaleLowerCase();return registeredUsers.value.filter(user=>!query||[user.displayName,user.username,user.id].some(value=>value.toLocaleLowerCase().includes(query))).sort((a,b)=>a.displayName.localeCompare(b.displayName,'ja'))})
function sourceLabel(draft:Draft){return !draft.id?'運営登録予定':({admin:'運営登録',user:'本人登録',form:'フォーム登録'}[draft.registrationSource||'form']||'登録元不明')}
function ownerLabel(id:string){if(id==='admin')return '運営';const user=registeredUsers.value.find(user=>user.id===id);return user?`${user.displayName} (@${user.username}) · ${id}`:id}
const ownershipRequests=new WeakMap<object,{ownerId:string;version:number;requestId:string}>()
const validOwner=computed(()=>ownerInput.value==='admin'||/^\d{10,25}$/.test(ownerInput.value.trim()))
const draftMenu=ref<{draft:Draft;x:number;y:number}|null>(null),menuElement=ref<HTMLElement>()
const readingKey='活動名（よみがな）※ひらがなで入力'
const readingWarning=computed(()=>!!current.value&&!validReading(current.value.band[readingKey]))
const englishWarning=computed(()=>!!current.value&&!validEnglish(current.value.band['活動名（英語）']))
const fieldWarning=(key:string)=>key===readingKey&&readingWarning.value?'ひらがなで入力してください。':key==='活動名（英語）'&&englishWarning.value?'英語で入力してください。':''
const namedKeys=C.fields.filter(key=>/^その他SNSリンク\d+$/.test(key))
const imageKeys=['ロゴ','アイコン','アー写']
const labels:Record<string,string>={'活動形態１':'活動形態','活動形態２':'演奏区分','活動形態３':'活動状態',[readingKey]:'活動名（よみがな）','ロゴ配置位置':'ロゴ配置位置','募集パート':'募集パート（未選択でなし）','YouTube動画URL':'Youtube 動画 URL'}
const sections:[string,string[]][]=[['活動情報',C.fields.slice(0,10)],['画像・ロゴ配置',['ロゴ','アイコン','アー写']],['メンバー',['バンドメンバー','募集パート']],['動画',['YouTube動画URL']],['SNS・リンク',C.fields.slice(15,23)],['紹介',['コメント','活動時間帯']]]
let csrf='',serverVersion='',limits:Me['limits']={}
const uploadKeys=new WeakMap<object,Record<string,{id:string;hash:string}>>()
const baselines=new WeakMap<object,string>()
const draftText=(draft:Draft)=>JSON.stringify([draft.band,draft.tags,draft.extras,draft.members,draft.links])
function refreshDirty(){dirty.value=drafts.value.some(draft=>baselines.get(draft)!==draftText(draft))}
function makeDraft(band:Band,meta:Partial<Draft>={}):Draft{
  const full={...C.blank(),...band},tags:Draft['tags']={},extras:Draft['extras']={}
  if(!full['ロゴ配置位置']?.trim())full['ロゴ配置位置']='アー写に重ねない'
  for(const key of [...C.multiple,'サブジャンル']){const values=C.tagItems(full[key]||'',key);tags[key]=values.filter(value=>(C.defaults[key]||[]).includes(value));extras[key]=values.filter(value=>!(C.defaults[key]||[]).includes(value))}
  return {...meta,band:full,tags,extras,members:C.memberRows(full['バンドメンバー']||''),links:Object.fromEntries(namedKeys.map(key=>[key,splitNamedLink(full[key])]))}
}
function output(draft:Draft):Band{
  const band={...draft.band}
  for(const key of [...C.multiple,'サブジャンル'])band[key]=C.tagText([...(draft.tags[key]||[]),...(draft.extras[key]||[])])
  band['バンドメンバー']=C.memberText(draft.members)
  for(const key of namedKeys){const link=draft.links[key]!;if(link.title&&!link.url)throw Error(`${key}のリンクを入力してください。`);if(/[:：]/.test(link.title))throw Error(`${key}のタイトルにはコロンを使用できません。`);if(link.url&&!/^https?:\/\//i.test(link.url)&&!(/^(mail|email|メール)$/i.test(link.title)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link.url)))throw Error(`${key}にはhttp/httpsのリンクを入力してください。`);band[key]=joinNamedLink(link.title,link.url)}
  return local&&preview.VBD_PREVIEW_OUTPUT?preview.VBD_PREVIEW_OUTPUT(C,band):JSON.parse(C.output([band]))[0]
}
async function api(path:string,body?:unknown):Promise<any>{
  if(local)return preview.VBD_PREVIEW_API!(path,body)
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})
  const data=await response.json()
  if(!response.ok||!data.ok){const messages:Record<string,string>={STALE_DELETE:'登録情報が更新されています。再読み込みしてから削除してください。',PORTAL_FORBIDDEN:'管理権限がありません。ログインし直して権限を確認してください。',PORTAL_CONSENT_REQUIRED:'同意事項をご確認ください。画面を再読み込みして同意後に進んでください。',STALE_OWNERSHIP:'所有者情報が更新されています。再読み込みして確認してください。', STALE_EDIT:'別の変更が保存されています。入力を控えたうえで再読み込みしてください。',LOGIN_REQUIRED:'ログインし直してください。',PORTAL_SESSION_EXPIRED:'ログイン期限が切れました。入力を控えてログインし直してください。',UPLOAD_DAILY_LIMIT:'本日の画像送信上限です。',UPLOAD_PENDING:'画像の保存結果を確認中です。運営へ連絡してください。',INVALID_READING:'ひらがなで入力してください。'};throw Error((data.code==='DISCORD_IDENTITY_HTTP_429'?`Discordの権限確認が一時的に制限されています。${data.retryAfter?data.retryAfter+'秒ほど待ってから':'しばらく待ってから'}再度操作してください。`:(messages[data.code]||data.message||`処理できませんでした（${data.code||response.status}）。`))+(data.diagnostic?` [${data.diagnostic.stage} / ${data.diagnostic.type} / ${(data.diagnostic.locations||[]).join(", ")}]${data.diagnostic.detail?" "+data.diagnostic.detail:""}`:""))}
  return data
}
function message(text:string,isError=false){notice.value=text;error.value=isError}
async function load(){
  try{const data:Me=await api('/api/me?mode='+requestedMode.value);csrf=data.csrf;limits=data.limits;admin.value=data.role==='admin';canManage.value=data.canManage===true;loginId.value=data.userId||'';registeredUsers.value=data.users||[];serverVersion=data.termsVersion||terms.version;consentRequired.value=data.consentRequired===true
    drafts.value=data.records.length?data.records.map(record=>makeDraft(record.band,record)):[makeDraft({})];drafts.value.forEach(draft=>baselines.set(draft,draftText(draft)));active.value=0;ownerInput.value='';loaded.value=true;dirty.value=false
    document.title=`VRC Band DB｜${admin.value?'バンド管理':'バンド登録・編集'}`
    message(consentRequired.value?'初回登録の前に、同意事項をご確認ください。':'')
    return true
  }catch(e){message((e as Error).message,true);return false}
}
async function switchMode(mode:string){
  if(!canManage.value||busy.value||mode===(admin.value?'admin':'user'))return
  if(dirty.value&&!confirm('未保存の入力があります。破棄してモードを切り替えますか？'))return
  const previous=requestedMode.value;busy.value=true;requestedMode.value=mode;closeDraftMenu()
  try{if(await load())sessionStorage.setItem('vbd-portal-mode',mode);else requestedMode.value=previous}finally{busy.value=false}
}
async function consent(){if(!accepted.value||busy.value)return;busy.value=true;try{if(serverVersion!==terms.version)throw Error('同意事項が更新されています。再読み込みしてください。');await api('/api/consent',{accepted:true,version:terms.version});await load()}catch(e){message((e as Error).message,true)}finally{busy.value=false}}
async function save(){
  if(busy.value||!current.value)return
  busy.value=true;message('保存しています…')
  try{const draft=current.value,band=output(draft),hash=JSON.stringify(band);if(hash!==draft.hash){draft.hash=hash;draft.submissionId=crypto.randomUUID()}
    const saved=await api('/api/save',{mode:admin.value?'admin':'user',registrationId:draft.id,revision:draft.revision,submissionId:draft.submissionId,band});draft.id=saved.id;draft.revision=saved.revision;draft.status=saved.status;draft.registrationSource=saved.registrationSource;baselines.set(draft,draftText(draft));refreshDirty();message(local?'このブラウザ内に保存しました。公開データへの送信は行っていません。':'保存しました。承認後に公開されます。')
  }catch(e){message((e as Error).message,true)}finally{busy.value=false}
}
async function upload(key:string,event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0],draft=current.value
  if(!file||!draft)return
  busy.value=true
  try{const limit=limits[key];if(!limit||file.type!=='image/png'||file.size<1||file.size>limit.bytes)throw Error('PNG画像の種類・容量を確認してください。')
    const bitmap=await createImageBitmap(file),valid=bitmap.width<=limit.width&&bitmap.height<=limit.height;bitmap.close();if(!valid)throw Error('画像の寸法が上限を超えています。')
    message('画像を保存しています…')
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(value=>value.toString(16).padStart(2,'0')).join(''),pending=uploadKeys.get(draft)||{};uploadKeys.set(draft,pending);if(pending[key]?.hash!==hash)pending[key]={id:crypto.randomUUID(),hash}
    const {ticket}=await api('/api/upload-ticket',{mode:admin.value?'admin':'user',field:key,bytes:file.size,sha256:hash,uploadId:pending[key]!.id})
    const dataBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('画像を読み込めません。'));reader.readAsDataURL(file)})
    const saved=await api('/api/upload',{uploadTicket:ticket,dataBase64});draft.band[key]=saved.url;delete pending[key];message('画像のURLを反映しました。バンド情報も保存してください。')
  }catch(e){message((e as Error).message,true)}finally{busy.value=false;input.value=''}
}
const media=computed(()=>({photo:bandImage(current.value?.band['アー写'],{localPreview:local}),logo:bandImage(current.value?.band['ロゴ'],{localPreview:local}),icon:bandImage(current.value?.band['アイコン'],{localPreview:local}),layout:logoLayout(current.value?.band['ロゴ配置位置'])}))
const videoId=computed(()=>C.videoId(current.value?.band['YouTube動画URL']||''))
function addBand(){
  if(busy.value)return
  const blank=drafts.value.findIndex(draft=>!draft.id&&draftText(draft)===draftText(makeDraft({})))
  if(blank>=0){active.value=blank;message('未入力の新規バンドを表示しました。');return}
  if(!admin.value&&drafts.value.length>=10)return
  drafts.value.push(makeDraft({}));active.value=drafts.value.length-1
}
async function transferOwnership(){
  const draft=current.value,ownerId=ownerInput.value.trim();if(!admin.value||busy.value||!draft?.id||!validOwner.value)return
  if(dirty.value){message('未保存の入力があります。先に保存してから所有者を移譲してください。',true);return}
  const old=(draft.ownerUserIds||[]).map(ownerLabel).join('、')||(draft.ownershipType==='admin'||draft.registrationSource==='admin'?'運営':'未設定')
  if(!confirm(`「${draft.band['活動名']}」の所有者を移譲しますか？\n現在：${old}\n移譲先Discord ID：${ownerLabel(ownerId)}\n現在の所有者を置き換え、移譲先が個人用画面から編集できるようになります。`))return
  const version=draft.ownershipVersion||0;let pending=ownershipRequests.get(draft)
  if(!pending||pending.ownerId!==ownerId||pending.version!==version){pending={ownerId,version,requestId:crypto.randomUUID()};ownershipRequests.set(draft,pending)}
  busy.value=true;message('所有者を移譲しています…')
  try{const result=await api('/api/assign-owner',{mode:'admin',registrationId:draft.id,revision:draft.revision,ownerId,ownershipVersion:version,requestId:pending.requestId});draft.ownerUserIds=result.ownerUserIds;draft.ownershipVersion=result.ownershipVersion;draft.ownershipAudit=result.ownershipAudit;draft.registrationSource=result.registrationSource;draft.ownershipType=result.ownershipType;ownershipRequests.delete(draft);ownerInput.value='';message(local?'ブラウザ内のテストデータの所有者を変更しました。':'所有者を移譲しました。移譲先の方は個人用画面を再読み込みしてください。')}catch(e){message((e as Error).message,true)}finally{busy.value=false}
}
function removeFromList(draft:Draft){
  const index=drafts.value.indexOf(draft);if(index<0)return
  const selected=current.value;drafts.value.splice(index,1)
  if(!drafts.value.length){drafts.value.push(makeDraft({}));baselines.set(drafts.value[0]!,draftText(drafts.value[0]!))}
  const retained=selected&&drafts.value.indexOf(selected)
  active.value=retained!==undefined&&retained>=0?retained:Math.min(index,drafts.value.length-1)
  refreshDirty()
}
function removeUnsaved(draft:Draft){
  draftMenu.value=null
  if(busy.value||draft.id)return
  if(draftText(draft)!==draftText(makeDraft({}))&&!confirm(`未登録の「${draft.band['活動名']||'新規バンド'}」を削除しますか？入力内容は失われます。`))return
  removeFromList(draft);message('未登録のバンドを一覧から削除しました。')
}
function openDraftMenu(event:MouseEvent|KeyboardEvent,draft:Draft){
  if(draft.id||busy.value)return
  event.preventDefault()
  const rect=(event.currentTarget as HTMLElement).getBoundingClientRect()
  draftMenu.value={draft,x:Math.max(8,Math.min(('clientX' in event&&event.clientX)||rect.left,innerWidth-230)),y:Math.max(8,Math.min(('clientY' in event&&event.clientY)||rect.bottom,innerHeight-65))}
  void nextTick(()=>menuElement.value?.querySelector('button')?.focus())
}
function closeDraftMenu(){draftMenu.value=null}
function menuKey(event:KeyboardEvent){if(event.key==='Escape')closeDraftMenu()}
async function importBands(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0]
  if(!file||!admin.value||busy.value)return
  busy.value=true
  try{if(file.size>65536)throw Error('64KiB以内のJSONを選んでください。');const added=C.parseImport(await file.text()).map(band=>makeDraft(band));const start=drafts.value.length;drafts.value.push(...added);active.value=start;message(`${added.length}件を新規バンドとして読み込みました。内容を確認し、各バンドで「登録・変更を保存」を押してください。`)}catch(e){message('読み込み失敗：'+(e as Error).message,true)}finally{busy.value=false;input.value=''}
}
async function deleteBand(){
  const draft=current.value;if(!admin.value||busy.value||!draft)return
  const text=draft.id?'掲載を削除します。履歴は保持され、Discordの /band-restore から復元できます。':'未保存の入力を削除します。'
  if(!confirm(`「${draft.band['活動名']||'新規バンド'}」を削除しますか？\n${text}`))return
  busy.value=true
  try{if(draft.id)await api('/api/delete',{mode:'admin',registrationId:draft.id,revision:draft.revision,requestId:crypto.randomUUID()});removeFromList(draft);message(draft.id?(local?'テスト用の登録を削除しました。':'掲載削除を保存しました。サイトへの反映は更新処理後です。'):'未保存の入力を削除しました。')}catch(e){message((e as Error).message,true)}finally{busy.value=false}
}
async function logout(){if(dirty.value&&!confirm('未保存の入力があります。ログアウトしますか？'))return;try{await api('/api/logout',{});dirty.value=false;location.href='/auth/logged-out'}catch(e){message((e as Error).message,true)}}
function unload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue=''}}
watch(drafts,()=>{if(loaded.value)refreshDirty()},{deep:true,flush:'sync'})
watch(active,()=>{ownerInput.value='';})
onMounted(()=>{void load();window.addEventListener('beforeunload',unload);window.addEventListener('pointerdown',closeDraftMenu);window.addEventListener('keydown',menuKey);window.addEventListener('resize',closeDraftMenu)})
onUnmounted(()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('pointerdown',closeDraftMenu);window.removeEventListener('keydown',menuKey);window.removeEventListener('resize',closeDraftMenu)})
</script>

<template>
  <div class="registration band-db">
    <header><h1>VRC Band DB｜{{ admin?'バンド管理':'バンド登録・編集' }}</h1><span class="mode">{{ admin?'管理用':canManage?'個人用':'通常用' }}</span>
      <div v-if="canManage" class="mode-switch" role="group" aria-label="利用モード"><button type="button" :aria-pressed="admin" :disabled="busy" @click="switchMode('admin')">管理用</button><button type="button" :aria-pressed="!admin" :disabled="busy" @click="switchMode('user')">個人用</button></div>
      <p>{{ admin?'登録済みバンドの編集と運営登録ができます。':'自分のバンドを登録・編集できます。' }}変更は承認後に公開されます。</p>
      <p><span class="required" aria-hidden="true">*</span> は必須項目です。</p><button type="button" :disabled="busy" @click="logout">ログアウト</button>
      <p v-if="!loaded||consentRequired" role="status" aria-live="polite" :class="{error}">{{ notice }}</p>
    </header>
    <p v-if="!loaded" class="loading">読み込み中です。</p>
    <section v-else-if="consentRequired" class="consent card" aria-labelledby="consent-title">
      <h2 id="consent-title">{{ terms.title }}</h2><p>{{ terms.introduction }}</p><ol><li v-for="clause in terms.clauses" :key="clause">{{ clause }}</li></ol>
      <label><input v-model="accepted" type="checkbox" :disabled="busy"> 上記の内容を確認し、誓約・同意します。</label>
      <button class="primary" :disabled="!accepted||busy" @click="consent">同意して登録画面へ進む</button>
    </section>
    <main v-else-if="current">
      <aside class="card"><h2>{{ admin?'登録済みバンド':'自分のバンド' }}（{{ drafts.length }}）</h2>
        <ol><li v-for="(draft,index) in drafts" :key="draft.id||index" class="draft-row" @contextmenu="openDraftMenu($event,draft)">
          <button class="draft-select" :aria-current="active===index" :disabled="busy" @click="active=index" @keydown.shift.f10.prevent="openDraftMenu($event,draft)">{{ draft.band['活動名']||'新規バンド' }}<span v-if="admin" class="source-badge" :class="{managed:draft.registrationSource==='admin'||!draft.id}">{{ sourceLabel(draft) }}</span><span v-if="!draft.id" class="draft-status">未登録</span></button>
          <button v-if="!draft.id" class="draft-remove" type="button" :disabled="busy" :aria-label="`未登録の${draft.band['活動名']||'新規バンド'}を削除`" title="未登録のバンドを削除" @click="removeUnsaved(draft)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
        </li></ol>
        <button :disabled="busy||(!admin&&drafts.length>=10)" @click="addBand">＋ バンド追加</button><FileUploadButton v-if="admin" class="import-label" label="JSONを読み込む" accept=".json,application/json" :disabled="busy" @change="importBands"/><p v-if="admin" class="hint">1〜20件・64KiB以内。読み込み後、各バンドを保存してください。</p>
      </aside>
      <div class="editor-column"><div v-if="local" class="editor-tabs" role="group" aria-label="登録する情報"><button type="button" :aria-pressed="editorTab==='band'" @click="editorTab='band'">バンド情報</button><button type="button" :aria-pressed="editorTab==='events'" @click="editorTab='events'">ライブ予定登録</button><a href="/#/VRCBandDB/events" target="_blank" rel="noopener noreferrer">イベントカレンダー ↗</a></div><form v-show="editorTab==='band'" @submit.prevent="save">
        <h2>{{ current.band['活動名']||'新規バンド' }}{{ current.id?' の編集':' の登録' }}</h2>
        <p v-if="admin"><span class="source-badge" :class="{managed:current.registrationSource==='admin'||!current.id}">{{ sourceLabel(current) }}</span></p>
        <section v-if="admin&&current.id" class="card ownership" aria-labelledby="ownership-title">
          <h3 id="ownership-title">所有者・移譲</h3>
          <p>現在の所有者：<span v-if="!current.ownerUserIds?.length">{{ current.ownershipType==='admin'||current.registrationSource==='admin'?'運営':'未設定（本人との紐付けなし）' }}</span><template v-else><a v-for="id in current.ownerUserIds" :key="id" :href="`https://discord.com/users/${id}`" target="_blank" rel="noopener noreferrer">{{ ownerLabel(id) }}</a></template></p>
          <label for="owner-search">登録済みユーザーを検索</label><input id="owner-search" v-model="ownerSearch" type="search" :disabled="busy" placeholder="表示名・ユーザー名・IDで検索"><label for="owner-select">移譲先ユーザー</label><select id="owner-select" v-model="ownerInput" :disabled="busy"><option value="">移譲先を選択してください</option><option value="admin">運営</option><option v-if="ownerInput&&ownerInput!=='admin'&&!matchingUsers.some(user=>user.id===ownerInput)" :value="ownerInput">{{ ownerLabel(ownerInput) }}</option><option v-for="user in matchingUsers" :key="user.id" :value="user.id">{{ ownerLabel(user.id) }}</option></select><p v-if="!matchingUsers.length" class="hint">該当するユーザーがいません。</p><label for="owner-id">DiscordユーザーIDで直接指定</label><div class="ownership-input"><input id="owner-id" v-model="ownerInput" type="text" inputmode="numeric" maxlength="25" :disabled="busy" placeholder="DiscordユーザーIDを入力"><button v-if="loginId" type="button" :disabled="busy" @click="ownerInput=loginId">自分のIDを入力</button><button type="button" :disabled="busy||!validOwner" @click="transferOwnership">所有者を移譲</button></div>
          <p class="hint">選択肢には、この機能追加後にDiscordログインしたユーザーが表示されます。同名の場合はユーザー名・IDで確認してください。移譲先は未ログイン・サーバー未参加でも指定できます。現在の所有者は置き換わります。</p>
          <p class="hint">運営が所有するものに運営登録マークを表示します。ユーザーへの移譲でマークが外れ、運営への移譲でマークが付きます。公開ページはデータ更新後に反映されます。</p>
          <details v-if="current.ownershipAudit?.length"><summary>移譲履歴（最新5件）</summary><ul><li v-for="(entry,index) in [...current.ownershipAudit].reverse()" :key="index">{{ new Date(entry.at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) }}：{{ ownerLabel(entry.by) }} → {{ ownerLabel(entry.owner) }}</li></ul></details>
        </section>
        <fieldset :disabled="busy" class="form-body">
          <section v-for="[section,keys] in sections" :key="section" class="card"><h3>{{ section }}</h3><div class="grid">
            <div v-for="key in keys" :key="key" class="field" :class="{wide:key==='バンドメンバー'||key==='コメント'}">
              <label :for="`field-${key}`">{{ labels[key]||key }} <span v-if="C.required.includes(key)" class="required" aria-hidden="true">*</span><span v-if="fieldWarning(key)" :id="`warning-${key}`" class="input-warning" role="status">{{ fieldWarning(key) }}</span></label>
              <template v-if="key==='バンドメンバー'">
                <fieldset v-for="(member,index) in current.members" :key="index" class="member"><legend>メンバー {{ index+1 }}</legend>
                  <label>パート<input v-model="member.part" maxlength="1000"></label><label>名前 <span class="required">*</span><input v-model="member.name" required maxlength="1000"></label><label>XのID・プロフィールURL<input v-model="member.account" maxlength="1000"></label><button type="button" @click="current.members.splice(index,1)">削除</button>
                </fieldset><button type="button" @click="current.members.push({part:'',name:'',account:''})">＋ メンバー追加</button>
              </template>
              <template v-else-if="C.multiple.includes(key)||key==='サブジャンル'">
                <div v-if="C.defaults[key]" class="checks" role="group" :aria-label="labels[key]||key" :aria-required="C.required.includes(key)"><label v-for="choice in C.defaults[key]" :key="choice"><input v-model="current.tags[key]" type="checkbox" :value="choice">{{ choice }}</label></div>
                <div v-for="(_item,index) in current.extras[key]" :key="index" class="item-row"><label>{{ key }} {{ index+1 }}<input v-model="current.extras[key]![index]" maxlength="1000"></label><button type="button" @click="current.extras[key]!.splice(index,1)">削除</button></div>
                <button v-if="key==='サブジャンル'||C.otherAllowed.includes(key)" type="button" @click="current.extras[key]!.push('')">{{ key==='募集パート'?'＋ 募集パート（自由入力）':`＋ ${key}を追加` }}</button>
                <p v-if="C.multiple.includes(key)" class="hint">複数選択できます。</p>
              </template>
              <select v-else-if="C.defaults[key]" :id="`field-${key}`" v-model="current.band[key]" :required="C.required.includes(key)"><option value="">未設定</option><option v-for="choice in C.defaults[key]" :key="choice">{{ choice }}</option><option v-if="current.band[key]&&!C.defaults[key]!.includes(current.band[key]!)" :value="current.band[key]">{{ current.band[key] }}（既存値）</option></select>
              <div v-else-if="namedKeys.includes(key)" class="named-link"><label>タイトル<input v-model="current.links[key]!.title" maxlength="1000" :aria-label="`${key} タイトル`"></label><label>リンク<input v-model="current.links[key]!.url" type="text" inputmode="url" maxlength="3000" placeholder="https://" :aria-label="`${key} リンク`"></label></div>
              <textarea v-else-if="key==='コメント'" :id="`field-${key}`" v-model="current.band[key]" required maxlength="4000"/>
              <input v-else :id="`field-${key}`" v-model="current.band[key]" :required="C.required.includes(key)" maxlength="4000" :aria-describedby="fieldWarning(key)?`warning-${key}`:undefined">
              <template v-if="imageKeys.includes(key)"><FileUploadButton class="upload" label="PNG画像を選択" accept="image/png" :disabled="busy" @change="upload(key,$event)"/><p v-if="limits[key]" class="hint">{{ limits[key]!.width }}×{{ limits[key]!.height }}px以内・{{ limits[key]!.bytes/1048576 }}MiB以内</p><p v-if="current.band[key]&&!bandImage(current.band[key],{localPreview:local})" class="error">画像を読み込めません。</p></template>
              <template v-if="key==='YouTube動画URL'"><BandVideo v-if="videoId" :video-id="videoId"/><p v-else-if="current.band[key]" class="error">動画を読み込めません。YouTubeの動画URLを確認してください。</p></template>
            </div>
          </div>
          <button v-if="section==='紹介'&&admin" class="delete-band" type="button" @click="deleteBand">削除</button>
          <section v-if="section==='画像・ロゴ配置'" class="layout-preview" aria-label="画像とロゴ配置のプレビュー">
            <h4>表示プレビュー</h4>
            <div class="layout-control"><label for="preview-logo-layout">ロゴ配置位置</label><select id="preview-logo-layout" v-model="current.band['ロゴ配置位置']"><option v-for="choice in C.defaults['ロゴ配置位置']" :key="choice">{{ choice }}</option><option v-if="current.band['ロゴ配置位置']&&!C.defaults['ロゴ配置位置']!.includes(current.band['ロゴ配置位置']!)" :value="current.band['ロゴ配置位置']">{{ current.band['ロゴ配置位置'] }}（既存値）</option></select></div>
            <div class="preview-body"><div class="preview-heading"><BandImage v-if="media.icon" class="icon-preview" :image="media.icon" alt="アイコン"/><strong>{{ current.band['活動名']||'バンド名' }}</strong></div><BandVisual :photo="media.photo" :logo="media.logo" :layout="media.layout"/></div>
            <p v-if="!media.photo&&!media.logo" class="hint">画像を選択するかURLを入力すると、配置を確認できます。</p>
          </section>
          </section>
        </fieldset>
        <div class="save-bar"><p v-if="notice" class="save-notice" role="status" aria-live="polite" :class="{error}">{{ notice }}</p><button class="primary save" :disabled="busy" type="submit">{{ busy?'処理中…':'登録・変更を保存' }}</button></div>
      </form><LiveEventEditor v-if="local" v-show="editorTab==='events'" :band-id="current.id" :band-name="current.band['活動名']||'新規バンド'" :admin="admin" :local-preview="local"/></div>
    </main>
    <div v-if="draftMenu" ref="menuElement" class="draft-menu" role="menu" :style="{left:`${draftMenu.x}px`,top:`${draftMenu.y}px`}" @pointerdown.stop><button role="menuitem" type="button" @click="removeUnsaved(draftMenu.draft)">未登録のバンドを削除</button></div>
  </div>
</template>

<style scoped>
.editor-column{min-width:0}.editor-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 20px}.editor-tabs button[aria-pressed=true]{background:var(--db-primary);color:var(--db-surface-white)}.editor-tabs a{font-size:12px;margin-left:auto;color:var(--db-link)}

.source-badge{display:inline-block;border:1px solid var(--db-border-divider);border-radius:999px;padding:1px 9px;font-size:11px;line-height:1.7;margin:3px 6px;vertical-align:middle}.source-badge.managed{background:var(--db-text);color:var(--db-surface-white);border-color:var(--db-text)}

.registration{font-family:Arial,'Yu Gothic',sans-serif;background:var(--db-background);color:var(--db-text);line-height:1.7;min-height:100vh}.registration *{box-sizing:border-box}header{padding:24px max(24px,calc((100vw - 1200px)/2));background:var(--db-surface-white);border-bottom:1px solid var(--db-border-divider)}h1{font-size:24px;margin:0 0 8px}h2{font-size:19px}h3{margin:0 0 22px;padding-bottom:10px;border-bottom:1px solid var(--db-border-divider)}p{font-size:13px}.mode-switch{display:inline-flex;gap:6px;margin:10px 0 0 12px}.mode-switch button{padding:6px 14px;font-size:12px}.mode-switch [aria-pressed=true]{background:var(--db-primary);border-color:var(--db-primary);color:var(--db-surface-white)}.mode{font-size:12px;border:1px solid var(--db-border-input);border-radius:20px;padding:3px 12px}button,input,select,textarea{font:inherit}button{cursor:pointer;padding:9px 14px;border:1px solid var(--db-border-input);border-radius:6px;background:var(--db-surface-white);color:inherit}button:disabled{opacity:.5;cursor:default}.primary{background:var(--db-primary);color:var(--db-surface-white);border-color:var(--db-primary)}main{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;max-width:1250px;margin:auto;padding:24px}.card{padding:24px;background:var(--db-surface-white);border:1px solid var(--db-border-divider);border-radius:12px;margin-bottom:20px}aside{align-self:start;position:sticky;top:20px}aside ol{list-style:none;padding:0}aside li{margin:8px 0}aside button{width:100%;text-align:left;overflow-wrap:anywhere}aside [aria-current=true]{border-color:var(--db-primary)}.draft-row{display:flex;gap:5px;align-items:stretch}.draft-select{flex:1;min-width:0}.draft-status{display:block;font-size:11px;color:var(--db-text-muted);margin-top:3px}aside .draft-remove{width:32px;flex-shrink:0;padding:6px;display:grid;place-items:center;color:#bc202b}.draft-remove svg{width:16px;height:16px}.draft-menu{position:fixed;z-index:1000;border:1px solid var(--db-border-input);border-radius:7px;padding:5px;background:var(--db-surface-white);box-shadow:0 4px 18px #0002}.draft-menu button{border:0;color:#bc202b}.draft-menu button:hover{background:var(--db-surface-muted)}.ownership a{display:inline-block;margin-right:12px;overflow-wrap:anywhere;color:var(--db-link)}.ownership>label{display:block;font-size:13px;font-weight:bold;margin-bottom:6px}.ownership-input{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ownership-input input{flex:1;min-width:180px}.ownership-input button{flex-shrink:0}.ownership details{font-size:12px;overflow-wrap:anywhere}.form-body{border:0;margin:0;padding:0;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.field{min-width:0}.field>label{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;font-size:13px;font-weight:bold;margin-bottom:7px}.wide{grid-column:1/-1}input:not([type=checkbox]):not([type=file]),textarea,select{width:100%;padding:10px;border:1px solid var(--db-border-input);border-radius:5px;background:var(--db-surface-white);color:inherit}textarea{min-height:130px;resize:vertical}.input-warning{color:#896300;background:#fff4be;border:1px solid #e7c95c;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:normal}.required,.error{color:#bc202b}.hint{font-size:12px;color:var(--db-text-muted)}.checks{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.checks label{border:1px solid var(--db-border-input);border-radius:6px;padding:5px 8px;font-size:12px}.checks label:has(:checked){border-color:var(--db-primary)}.item-row{display:flex;align-items:end;gap:8px;margin:10px 0}.item-row label{flex:1}.member{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;border:1px solid var(--db-border-input);border-radius:6px}.member label,.named-link label{font-size:12px}.named-link{display:grid;gap:10px}.upload{margin-top:12px}.upload input{display:block;font-size:12px;font-weight:normal;margin-top:5px;max-width:100%}.layout-preview{border-top:1px solid var(--db-border-divider);margin-top:24px}.layout-control{max-width:480px;margin-bottom:16px}.layout-control label{display:block;font-size:13px;font-weight:bold;margin-bottom:6px}.preview-body{max-width:480px}.layout-preview :deep(.artist-visual){margin:14px 0}.layout-preview :deep(.separate-logo){height:100px;margin:14px 0}.preview-heading{display:flex;align-items:center;gap:14px}.icon-preview{width:48px;height:48px;border-radius:8px}.consent{max-width:900px;margin:24px auto;line-height:1.9}.consent li{margin-bottom:18px}.consent button{display:block;margin-top:20px}.import-label{display:block;margin-top:16px;font-size:12px}.delete-band{display:block;margin:20px 0 0 auto;color:#bc202b;border-color:#bc202b}.save-bar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:flex-end;gap:12px;margin-bottom:30px}.save-notice{flex:1;min-width:0;margin:0;padding:12px 16px;border:1px solid var(--db-border-input);border-radius:8px;background:var(--db-surface-white);box-shadow:0 3px 16px #0002;white-space:pre-wrap;overflow-wrap:anywhere;max-height:30vh;overflow:auto}.save{display:block;width:fit-content;flex-shrink:0;padding:12px 24px;margin-left:auto}.save-notice.error{border-color:#bc202b}@media(max-width:760px){.save-bar{flex-direction:column;align-items:stretch}.save-notice{flex:none}.save{align-self:flex-end}}.loading{padding:24px}input[aria-invalid=true]{border-color:#bc202b}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}@media(max-width:760px){main{display:block;padding:16px}.grid{grid-template-columns:1fr}aside{position:static}.card{padding:18px}.member{grid-template-columns:1fr}.consent{margin:16px}h1{font-size:20px}}
</style>
