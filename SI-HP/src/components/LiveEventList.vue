<script setup lang="ts">
import EventVenue from './EventVenue.vue'
import {computed} from 'vue'
import {activeEvents,eventDetailsUrl,type LiveEvent} from '../band-events.mjs'
import {useEventClock} from '../use-event-clock'
const props=defineProps<{events:LiveEvent[];emptyText?:string;includeEnded?:boolean}>()
const now=useEventClock()
const visible=computed(()=>props.includeEnded?props.events:activeEvents(props.events,now.value))
const when=(value:string)=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
</script>
<template>
  <div class="live-event-list"><p v-if="!visible.length" class="empty">{{ emptyText||'ライブ予定はありません。' }}</p>
    <article v-for="event in visible" :key="event.id" class="live-event-item">
      <div class="event-meta"><span class="place">{{ event.place }}</span><span v-if="Date.parse(event.endsAt)<=now" class="organizer">終了</span><span v-if="!event.ownerBandId" class="organizer">運営イベント</span></div>
      <h3><a class="event-detail-link" :href="eventDetailsUrl(event.id,props.includeEnded?{ended:'1'}:{})" :aria-label="event.title+'の詳細を開く'">{{ event.title }}</a></h3><p class="event-time"><time :datetime="event.startsAt">{{ when(event.startsAt) }}</time> 〜 <time :datetime="event.endsAt">{{ when(event.endsAt) }}</time><small> 日本時間</small></p>
      <EventVenue :name="event.venueName" :url="event.venueUrl"/>
      <div v-if="event.participants.length" class="participants" aria-label="参加バンド"><template v-for="(participant,index) in event.participants" :key="index"><a v-if="participant.bandId" :href="`/#/VRCBandDB?band=${encodeURIComponent(participant.bandId)}`">{{ participant.name }}</a><span v-else>{{ participant.name }} <small>未登録</small></span></template></div>
    </article>
  </div>
</template>
<style scoped>
.live-event-item{position:relative}.event-detail-link{color:inherit;text-decoration:none}.event-detail-link::after{content:'';position:absolute;inset:0;border-radius:inherit}.event-detail-link:focus-visible{outline:0}.event-detail-link:focus-visible::after{outline:3px solid var(--db-focus-ring);outline-offset:2px}.participants a{position:relative;z-index:1}.live-event-item:has(.event-detail-link:hover){border-color:var(--db-primary)}

.live-event-list{display:grid;gap:14px}.live-event-item{padding:18px;border:1px solid var(--db-border-control);border-radius:10px;background:var(--db-surface-white)}.live-event-item h3{margin:10px 0 6px;font-size:18px;border:0;padding:0}.event-meta{display:flex;align-items:center;gap:8px;font-size:12px}.place{background:var(--db-primary);color:var(--db-surface-white);padding:3px 10px;border-radius:999px}.organizer,.empty{color:var(--db-text-muted)}.event-time{margin:6px 0 12px;font-variant-numeric:tabular-nums}.participants{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px}.participants a,.participants span{display:inline-block;padding:5px 11px;border:1px solid var(--db-border-control);border-radius:999px;font-size:13px;color:var(--db-text);text-decoration:none}.participants a:hover{background:var(--db-control-hover)}small{font-size:11px;color:var(--db-text-muted)}
</style>
