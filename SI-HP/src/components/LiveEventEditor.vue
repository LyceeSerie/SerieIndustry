<script setup lang="ts">
import { t } from '../i18n/ui-text.mjs'
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import {activeEvents,eventPlaces,eventsForBand,loadEvents,loadEventBands,savePreviewEvent,deletePreviewEvent,fromJapanInput,toJapanInput,japanDate,type LiveEvent,type EventBand} from '../band-events.mjs'
import {useEventClock} from '../use-event-clock'
import LiveEventList from './LiveEventList.vue'
const props=defineProps<{active?:boolean;bandId?:string;bandName:string;admin:boolean;localPreview:boolean;request?:(path:string,body?:unknown)=>Promise<any>}>()
const emit=defineEmits<{notice:[value:{text:string;error:boolean}]}>()
function report(text:string,error=false){emit('notice',{text,error})}
const events=ref<LiveEvent[]>([]),directory=ref<EventBand[]>([]),loading=ref(true),saving=ref(false),editing=ref(''),query=ref(''),freeName=ref(''),unlinked=ref(false)
const title=ref(''),subtitle=ref(''),place=ref('VRChat'),venueName=ref(''),venueUrl=ref(''),starts=ref(japanDate()+'T20:00'),ends=ref(japanDate()+'T21:00'),participants=ref<{bandId:string;name:string}[]>([])
const matches=computed(()=>{const text=query.value.trim().toLocaleLowerCase();return text?directory.value.filter(band=>[band.name,band.id].some(value=>value.toLocaleLowerCase().includes(text))&&!participants.value.some(item=>item.bandId===band.id)).slice(0,20):[]})
const showEnded=ref(false)
const now=useEventClock()
const active=computed(()=>activeEvents(events.value,now.value))
const listed=computed(()=>showEnded.value?events.value:active.value)
const owned=computed(()=>props.admin?listed.value:props.bandId?listed.value.filter(event=>event.ownerBandId===props.bandId):[])
const related=computed(()=>props.bandId?eventsForBand(active.value,props.bandId).filter(event=>!owned.value.some(item=>item.id===event.id)):[])
function reset(){editing.value='';title.value='';subtitle.value='';place.value='VRChat';venueName.value='';venueUrl.value='';unlinked.value=false;starts.value=japanDate()+'T20:00';ends.value=japanDate()+'T21:00';participants.value=props.bandId?[{bandId:props.bandId,name:props.bandName}]:[];query.value='';freeName.value=''}
function add(bandId:string,name:string){if(!name.trim())return;if(!participants.value.some(item=>bandId?item.bandId===bandId:!item.bandId&&item.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase()))participants.value.push({bandId,name:name.trim()});query.value='';freeName.value=''}
function edit(event:LiveEvent){editing.value=event.id;title.value=event.title;subtitle.value=event.subtitle||'';place.value=event.place;venueName.value=event.venueName||'';venueUrl.value=event.venueUrl||'';starts.value=toJapanInput(event.startsAt);ends.value=toJapanInput(event.endsAt);participants.value=event.participants.map(item=>({...item}));unlinked.value=!event.ownerBandId;report('選択したイベントを編集中です。')}
function ownerId(){if(editing.value)return unlinked.value?'':events.value.find(item=>item.id===editing.value)?.ownerBandId||props.bandId||'';return unlinked.value?'':props.bandId||''}
const saveRequests=new Map<string,{hash:string;id:string}>(),deleteRequests=new Map<string,string>()
let needsRefresh=true
async function refresh(){if(props.active===false){needsRefresh=true;return}needsRefresh=false;loading.value=true;try{if(props.localPreview){events.value=await loadEvents({localPreview:true});directory.value=await loadEventBands()}else{if(!props.request)throw Error('認証済みの登録画面から操作してください。');const data=await props.request('/api/events?mode='+(props.admin?'admin':'user'));events.value=data.events;directory.value=data.bands}if(props.bandId&&!directory.value.some(item=>item.id===props.bandId))directory.value.unshift({id:props.bandId,name:props.bandName})}catch(e){report((e as Error).message,true)}finally{loading.value=false}}
async function save(){if(saving.value)return;saving.value=true;report('ライブ予定を保存しています…');try{
 if(!props.bandId&&!props.admin)throw Error('先にバンド情報を保存してください。');if(!props.bandId&&!unlinked.value)throw Error('運営イベントとして登録する場合はチェックを入れてください。');
 const current=events.value.find(event=>event.id===editing.value),event={id:editing.value,ownerBandId:ownerId(),title:title.value,subtitle:subtitle.value,place:place.value,venueName:venueName.value,venueUrl:venueUrl.value,startsAt:fromJapanInput(starts.value),endsAt:fromJapanInput(ends.value),participants:participants.value}
 if(props.localPreview)events.value=savePreviewEvent(event,{events:await loadEvents({localPreview:true}),bandId:props.bandId,admin:props.admin,localPreview:true})
 else{if(!props.request)throw Error('認証済みの登録画面から操作してください。');const key=editing.value||'new',hash=JSON.stringify([event,current?.revision]);let pending=saveRequests.get(key);if(!pending||pending.hash!==hash){pending={hash,id:crypto.randomUUID()};saveRequests.set(key,pending)}const data=await props.request('/api/events/save',{mode:props.admin?'admin':'user',event,revision:current?.revision,requestId:pending.id});events.value=[...events.value.filter(item=>item.id!==data.event.id),data.event];saveRequests.delete(key)}
 reset();report(props.localPreview?'このブラウザ内にライブ予定を保存しました。カレンダーにも反映されます。':'ライブ予定を保存しました。公開カレンダーの再読み込みで反映を確認できます。')
 }catch(e){report((e as Error).message,true)}finally{saving.value=false}}
function removeEditing(){const event=events.value.find(item=>item.id===editing.value);if(event)return remove(event)}
async function remove(event:LiveEvent){if(saving.value||!confirm('「'+event.title+'」を削除しますか？イベントカレンダーとバンドページからも削除されます。'))return;saving.value=true;report('ライブ予定を削除しています…');try{
 if(props.localPreview)events.value=deletePreviewEvent(event.id,{events:await loadEvents({localPreview:true}),localPreview:true,admin:props.admin,bandId:props.bandId})
 else{if(!props.request)throw Error('認証済みの登録画面から操作してください。');const key=event.id+':'+event.revision;let requestId=deleteRequests.get(key);if(!requestId){requestId=crypto.randomUUID();deleteRequests.set(key,requestId)}await props.request('/api/events/delete',{mode:props.admin?'admin':'user',eventId:event.id,revision:event.revision,requestId});events.value=events.value.filter(item=>item.id!==event.id);deleteRequests.delete(key)}
 if(editing.value===event.id)reset();report('ライブ予定を削除しました。イベントカレンダーとバンドページからも表示されなくなります。')
 }catch(e){report((e as Error).message,true)}finally{saving.value=false}}
watch(()=>props.active,active=>{if(active!==false&&needsRefresh)refresh()})
watch(()=>[props.bandId,props.bandName,props.admin],()=>{reset();refresh()})
watch(unlinked,value=>{if(!editing.value&&props.bandId){if(value)participants.value=participants.value.filter(item=>item.bandId!==props.bandId);else add(props.bandId,props.bandName)}})
onMounted(()=>{reset();refresh();window.addEventListener('storage',refresh)})
onUnmounted(()=>window.removeEventListener('storage',refresh))
</script>
<template>
<section class="event-editor card" aria-labelledby="live-editor-title">
 <h3 id="live-editor-title">ライブ予定登録</h3><p class="local-note">{{ localPreview?'ローカル確認用：このブラウザ内だけに保存します。':'イベント情報は保存後に公開されます。' }}日時は日本時間です。</p>
 <p v-if="!bandId&&!admin">先にバンド情報を保存すると、そのバンドのライブ予定を登録できます。</p>
 <template v-else>
  <label v-if="admin" class="unlinked"><input v-model="unlinked" type="checkbox"> バンドに紐づかない運営イベントとして登録</label>
  <p v-if="!unlinked" class="owner-band">登録元：{{ editing?events.find(event=>event.id===editing)?.participants.find(item=>item.bandId===ownerId())?.name||bandName:bandName }}</p>
  <div class="event-fields">
   <label class="event-title-field">イベント名 <span class="required">*</span><input v-model="title" type="text" maxlength="150" placeholder="イベント名を入力"></label>
   <label class="event-subtitle-field">サブタイトル<textarea v-model="subtitle" rows="3" maxlength="1000" placeholder="イベントの概要や紹介文（任意・1000文字以内）"></textarea></label>
   <label>{{ t('labels.format') }} <span class="required">*</span><select v-model="place"><option v-for="value in eventPlaces" :key="value">{{ value }}</option></select></label>
   <label>場所名<input v-model="venueName" type="text" maxlength="150" placeholder="ワールド名・会場名など"></label><label class="event-venue-url-field">場所リンク<input v-model="venueUrl" type="url" maxlength="2048" placeholder="https://…"></label>
   <label>{{ t('labels.startsAt') }} <span class="required">*</span><input v-model="starts" type="datetime-local"></label><label>{{ t('labels.endsAt') }} <span class="required">*</span><input v-model="ends" type="datetime-local"></label>
  </div>
  <h4>{{ t('labels.participants') }}</h4><div class="chosen-bands"><span v-for="(band,index) in participants" :key="index">{{ band.name }}<small v-if="!band.bandId">（未登録）</small><button type="button" :disabled="!unlinked&&band.bandId===ownerId()" :aria-label="band.name+'を参加バンドから外す'" @click="participants.splice(index,1)">×</button></span></div>
  <label>登録済みバンドを検索<input v-model="query" type="search" placeholder="バンド名・IDを入力"></label><ul v-if="query.trim()" class="band-results"><li v-for="band in matches" :key="band.id"><button type="button" @click="add(band.id,band.name)">{{ band.name }}<small>{{ band.id }}</small></button></li><li v-if="!matches.length">該当するバンドはありません。</li></ul>
  <label>未登録バンド名<div class="free-band"><input v-model="freeName" type="text" maxlength="150" placeholder="バンド名を自由入力" @keydown.enter.prevent="add('',freeName)"><button type="button" :disabled="!freeName.trim()" @click="add('',freeName)">{{ t('common.add') }}</button></div></label>
  <p v-if="unlinked" class="local-note">運営イベントは参加バンドなしでも登録できます。登録済みバンドを参加者に追加すると、そのバンドページにも表示されます。</p>
  <div class="event-actions"><button v-if="editing" class="event-delete" type="button" :disabled="saving" @click="removeEditing()">このイベントを削除</button><button v-if="editing" type="button" :disabled="saving" @click="reset">編集をキャンセル</button><button class="event-save" type="button" :disabled="saving||loading" @click="save">{{ editing?'ライブ予定を更新':'ライブ予定を登録' }}</button></div>
 </template>
 <h4>{{ admin?'登録イベント一覧':'このバンドが登録したライブ予定' }}</h4><label class="ended-toggle"><input v-model="showEnded" type="checkbox"> 終了したイベントを表示する</label><p v-if="loading">{{ t('common.loading') }}</p><p v-else-if="!owned.length">登録されたライブ予定はありません。</p>
 <div v-for="event in owned" :key="event.id" class="editable-event"><LiveEventList :events="[event]" :include-ended="showEnded"/><div class="event-actions"><button type="button" :disabled="saving" @click="edit(event)">編集</button><button class="event-delete" type="button" :disabled="saving" @click="remove(event)">{{ t('common.remove') }}</button></div></div>
 <template v-if="related.length"><h4>参加予定（他の登録者によるイベント）</h4><LiveEventList :events="related"/></template>
 <a :href="localPreview?'/#/VRCBandDB/events':'https://serieindustry.com/#/VRCBandDB/events'" target="_blank" rel="noopener noreferrer">{{ t('navigation.openCalendar') }}</a>
</section>
</template>
<style scoped>
.event-editor .event-delete{color:#b42318;border-color:#b42318}
.event-title-field,.event-subtitle-field,.event-venue-url-field{grid-column:1/-1}.event-editor textarea{display:block;width:100%;min-height:84px;padding:10px;margin-top:5px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-small);background:var(--db-surface-white);color:var(--db-text);font:inherit;resize:vertical}

.event-editor{margin-top:24px}.event-editor h4{margin:22px 0 10px}.local-note,.owner-band{font-size:12px;color:var(--db-text-muted)}.event-editor label{display:block;font-size:13px;margin:10px 0}.event-editor input:not([type=checkbox]),.event-editor select{display:block;width:100%;padding:10px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-small);background:var(--db-surface-white);color:var(--db-text);font:inherit;margin-top:5px}.event-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.unlinked,.ended-toggle{display:flex!important;gap:9px;align-items:center}.event-editor .unlinked input,.event-editor .ended-toggle input{width:auto}.chosen-bands{display:flex;flex-wrap:wrap;gap:7px}.chosen-bands>span{display:flex;align-items:center;gap:6px;padding:4px 10px;background:var(--db-surface-muted);border-radius:var(--db-radius-pill);font-size:13px}.event-editor button{cursor:pointer;padding:7px 12px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-small);background:var(--db-surface-white);color:var(--db-text);font:inherit}.chosen-bands button{border:0;padding:0 3px;background:none}.event-editor button:disabled{opacity:.5;cursor:default}.band-results{list-style:none;margin:0;padding:0;max-height:200px;overflow:auto;border:1px solid var(--db-border-control)}.band-results button{width:100%;text-align:left;border:0;border-radius:0}.band-results small{display:block;font-size:10px;color:var(--db-text-muted)}.free-band{display:flex;gap:8px;align-items:center}.free-band input{flex:1;min-width:0;width:auto!important}.free-band button{flex-shrink:0;white-space:nowrap;min-width:64px;align-self:stretch;margin-top:5px}.event-actions{display:flex;justify-content:flex-end;gap:8px;margin:14px 0}.event-editor .event-save{background:var(--db-primary);color:var(--db-surface-white)}.editable-event{margin:14px 0}.error,.required{color:#b42318}@media(max-width:600px){.event-fields{grid-template-columns:1fr}}
</style>
