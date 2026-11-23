<script setup lang="ts">
import UiIcon from '../components/UiIcon.vue'
import '../styles/vrc-band-db-theme.css'
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import {activeEvents,japanDate,loadEvents,previewAllowed,type LiveEvent} from '../band-events.mjs'
import {useEventClock} from '../use-event-clock'
import EventVenue from '../components/EventVenue.vue'
import settings from '../config/app-settings.json'
import brandIcon from '../assets/VBDLogo.png'
const route=useRoute(),localPreview=previewAllowed(import.meta.env.MODE==='test'),enabled=localPreview||settings.vrcBandDb.liveEvents.enabled
const events=ref<LiveEvent[]>([]),loading=ref(false),error=ref(''),now=useEventClock()
const event=computed(()=>(route.query.ended==='1'?events.value:activeEvents(events.value,now.value)).find(item=>item.id===route.params.eventId))
const ended=computed(()=>events.value.some(item=>item.id===route.params.eventId&&new Date(item.endsAt).getTime()<=now.value))
const backUrl=computed(()=>{const query=new URLSearchParams();for(const key of ['day','view','places','ended'])if(typeof route.query[key]==='string')query.set(key,route.query[key] as string);if(!query.has('day'))query.set('day',event.value?japanDate(new Date(Math.max(now.value,new Date(event.value.startsAt).getTime()))):japanDate(new Date(now.value)));return '/#/VRCBandDB/events?'+query})
const when=(value:string)=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'})
watch(event,value=>{document.title=value?value.title+'｜VRC Band DB':'イベント詳細｜VRC Band DB'},{immediate:true})
async function refresh(){if(!enabled)return;loading.value=true;error.value='';try{events.value=await loadEvents({localPreview,sheetCsvUrl:settings.vrcBandDb.liveEvents.sheetCsvUrl})}catch(e){error.value=(e as Error).message}finally{loading.value=false}}
onMounted(()=>{refresh();window.addEventListener('storage',refresh);window.addEventListener('vbd-events-changed',refresh)})
onUnmounted(()=>{window.removeEventListener('storage',refresh);window.removeEventListener('vbd-events-changed',refresh)})
</script>
<template>
 <div class="band-db event-detail"><header><a class="brand" href="/#/VRCBandDB"><img :src="brandIcon" width="42" height="42" alt=""><span>VRC BAND <b>DB.</b></span></a><a :href="backUrl">カレンダーへ</a></header>
 <main><a class="back-link" :href="backUrl">‹ イベントカレンダーに戻る</a><p v-if="localPreview" class="preview-note">ローカル確認用・架空データ</p>
 <p v-if="!enabled">イベント詳細は現在ローカルで確認中です。</p><p v-else-if="loading" role="status">イベントを読み込み中…</p><div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="refresh">再読み込み</button></div>
 <article v-else-if="event" class="detail-card"><div class="meta"><span class="place">{{ event.place }}</span><span v-if="!event.ownerBandId">運営イベント</span><span v-if="ended" class="ended-badge">終了</span></div><h1>{{ event.title }}</h1><p v-if="event.subtitle" class="event-subtitle">{{ event.subtitle }}</p>
 <dl><div><dt>開始日時</dt><dd><time :datetime="event.startsAt">{{ when(event.startsAt) }}</time></dd></div><div><dt>終了日時</dt><dd><time :datetime="event.endsAt">{{ when(event.endsAt) }}</time></dd></div><div><dt>形態</dt><dd>{{ event.place }}</dd></div><div v-if="event.venueName"><dt>場所</dt><dd><EventVenue :name="event.venueName" :url="event.venueUrl"/></dd></div></dl><p class="timezone">日時はすべて日本時間です。</p>
 <section v-if="event.participants.length"><h2>参加バンド</h2><div class="participants"><template v-for="(participant,index) in event.participants" :key="index"><a v-if="participant.bandId" :href="`/#/VRCBandDB?band=${encodeURIComponent(participant.bandId)}`">{{ participant.name }} <UiIcon/></a><span v-else>{{ participant.name }} <small>未登録</small></span></template></div></section>
 <p v-else class="muted">参加バンドの指定はありません。</p>
 </article><p v-else role="status">{{ ended?'このイベントは終了しました。':'イベントが見つかりません。削除された可能性があります。' }}</p>
 </main></div>
</template>
<style scoped>
.event-subtitle{margin:-12px 0 28px;font-size:15px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--db-text-secondary)}

.event-detail{min-height:100vh;background:var(--db-background);color:var(--db-text);font-family:Arial,'Yu Gothic',sans-serif;line-height:1.7}.event-detail *{box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px max(20px,calc((100vw - 1000px)/2));border-bottom:1px solid var(--db-border-control);background:var(--db-header-background)}header>a:last-child{font-size:13px}.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;text-decoration:none;color:var(--db-logo-color);white-space:nowrap}.brand b{color:var(--db-logo-accent)}main{max-width:850px;margin:auto;padding:28px 24px 70px}a{color:var(--db-link)}.back-link{display:inline-block;font-size:13px;margin-bottom:20px}.preview-note{font-size:12px;color:var(--db-text-muted)}.detail-card{padding:32px;border:1px solid var(--db-border-control);border-radius:12px;background:var(--db-surface-white)}h1{font-size:clamp(23px,4vw,32px);line-height:1.45;margin:20px 0 30px;overflow-wrap:anywhere}.meta{display:flex;gap:12px;align-items:center;font-size:12px}.place{border-radius:999px;padding:4px 12px;background:var(--db-primary);color:var(--db-surface-white)}dl>div{display:grid;grid-template-columns:90px 1fr;gap:16px;margin:16px 0}dt{font-size:12px;color:var(--db-text-muted)}dd{margin:0;font-size:15px}.ended-badge{border:1px solid var(--db-border-control);border-radius:999px;padding:2px 10px;color:var(--db-text-muted)}.timezone,.muted{font-size:12px;color:var(--db-text-muted)}h2{font-size:15px;margin-top:32px}.participants{display:flex;flex-wrap:wrap;gap:10px}.participants>a,.participants>span{border:1px solid var(--db-border-control);border-radius:999px;padding:9px 15px;font-size:14px;text-decoration:none}.participants a:hover{background:var(--db-control-hover)}small{font-size:10px;color:var(--db-text-muted)}button{padding:8px 12px;border:1px solid var(--db-border-control);border-radius:5px;background:var(--db-surface-white);color:var(--db-text);cursor:pointer}a:focus-visible,button:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}@media(max-width:600px){header{padding:12px 16px}.brand{font-size:16px}.brand img{width:32px;height:32px}main{padding:22px 16px 50px}.detail-card{padding:22px 18px}dl>div{grid-template-columns:1fr;gap:3px}}
</style>
