<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {activeEvents,eventsForBand,loadEvents,type LiveEvent} from '../band-events.mjs'
import {useEventClock} from '../use-event-clock'
import LiveEventList from './LiveEventList.vue'
const props=defineProps<{bandId:string;localPreview:boolean;sheetCsvUrl?:string}>()
const events=ref<LiveEvent[]>([]),error=ref(''),loading=ref(true)
const now=useEventClock()
const upcoming=computed(()=>activeEvents(eventsForBand(events.value,props.bandId),now.value))
async function refresh(){loading.value=true;error.value='';try{events.value=await loadEvents({localPreview:props.localPreview,sheetCsvUrl:props.sheetCsvUrl})}catch(e){error.value=(e as Error).message}finally{loading.value=false}}
onMounted(()=>{refresh();window.addEventListener('storage',refresh);window.addEventListener('vbd-events-changed',refresh)})
onUnmounted(()=>{window.removeEventListener('storage',refresh);window.removeEventListener('vbd-events-changed',refresh)})
</script>
<template><section class="band-events"><h2>ライブ予定</h2><p v-if="loading">ライブ予定を読み込み中…</p><p v-else-if="error" role="status">{{ error }} <button type="button" @click="refresh">再読み込み</button></p><LiveEventList v-else :events="upcoming"/><a class="calendar-link" href="/#/VRCBandDB/events">イベントカレンダーを見る</a></section></template>
<style scoped>.band-events{margin-top:30px}.calendar-link{display:inline-block;margin-top:16px;color:var(--db-link)}</style>
