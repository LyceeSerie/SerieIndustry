<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { clampMusicPosition, clampMusicSize, createMusicQueue, musicState, type MusicBand, type MusicItem } from '../band-music.mjs'
import { loadYouTubeAPI, type YouTubePlayer } from '../youtube-player'
import { t } from '../i18n/ui-text.mjs'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ bands: MusicBand[]; searchResults?:MusicBand[]; testMode?: boolean }>()
const emit = defineEmits<{ select: [id: string]; visibility: [visible: boolean]; playing: [] }>()
const state = reactive(musicState())
const queue = createMusicQueue(state)
const visible = ref(false), notice = ref('')
const panel = ref<HTMLElement>()
const size = reactive({width:480,videoHeight:250})
const position=reactive({right:16,bottom:12})
let moving:{id:number;x:number;y:number;right:number;bottom:number;started:boolean}|undefined
let ignoreMoveClick=false
function keepPosition() {
  if(disposed)return
  const rect=panel.value?.getBoundingClientRect()
  Object.assign(position,clampMusicPosition(position.right,position.bottom,rect?.width||size.width,rect?.height||size.videoHeight+resizeOverhead(),document.documentElement.clientWidth,document.documentElement.clientHeight))
}
function startMove(event:PointerEvent) {
  if(event.button!==0||(event.target as HTMLElement).closest('button,input,select,textarea'))return
  moving={id:event.pointerId,x:event.clientX,y:event.clientY,right:position.right,bottom:position.bottom,started:false}
}
function moveWindow(event:PointerEvent) {
  if(!moving||event.pointerId!==moving.id)return
  if(!moving.started&&Math.hypot(event.clientX-moving.x,event.clientY-moving.y)<4)return
  moving.started=true
  event.preventDefault()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  position.right=moving.right-(event.clientX-moving.x)
  position.bottom=moving.bottom-(event.clientY-moving.y)
  keepPosition()
}
function endMove(event:PointerEvent) {
  if(!moving||event.pointerId!==moving.id)return
  ignoreMoveClick=moving.started&&event.type!=='pointercancel'
  moving=undefined
  const target=event.currentTarget as HTMLElement
  if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId)
  setTimeout(()=>{ignoreMoveClick=false},0)
}
function moveClick(event:MouseEvent){if(ignoreMoveClick){event.preventDefault();event.stopPropagation();ignoreMoveClick=false}}
function moveKeys(event:KeyboardEvent) {
  if(event.target!==event.currentTarget||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
  event.preventDefault()
  position.right+=event.key==='ArrowLeft'?20:event.key==='ArrowRight'?-20:0
  position.bottom+=event.key==='ArrowUp'?20:event.key==='ArrowDown'?-20:0
  keepPosition()
}
let resizing: {id:number;x:number;y:number;width:number;height:number;overhead:number}|undefined
const phase = ref<'idle'|'loading'|'playing'|'paused'|'ended'|'error'>('idle')
const displayItem = ref<MusicItem|null>(null)
const frame = ref<HTMLElement>(), host = ref<HTMLElement>()
let player: YouTubePlayer | undefined, preparing: Promise<YouTubePlayer> | undefined
let initializing: YouTubePlayer | undefined
let readyTimeout: ReturnType<typeof setTimeout> | undefined
let rejectReady: ((error:Error)=>void) | undefined
let loadedVideoId = ''
let disposed = false, version = 0, observer: IntersectionObserver | undefined
let focusTimer:ReturnType<typeof setInterval>|undefined
watch(phase,value=>{clearInterval(focusTimer);if(value==='playing')focusTimer=setInterval(()=>{if(document.activeElement?.closest('.band-video'))pause()},250)})
const status = computed(() => t(`music.${phase.value}`))
watch(visible, value => emit('visibility', value))

function frameVisible() {
  const element = frame.value
  if (!element) return false
  if (document.fullscreenElement && element.contains(document.fullscreenElement)) return true
  const rect = element.getBoundingClientRect()
  if (rect.width < 200 || rect.height < 200) return false
  const width = Math.max(0,Math.min(rect.right,document.documentElement.clientWidth)-Math.max(0,rect.left))
  const height = Math.max(0,Math.min(rect.bottom,document.documentElement.clientHeight)-Math.max(0,rect.top))
  return width*height > rect.width*rect.height*.5
}
function pause(message = '') {
  player?.pauseVideo()
  if (state.current || phase.value==='playing' || phase.value==='loading') phase.value = 'paused'
  if (message) notice.value = message
}
function openQueue() { visible.value = true }
function enqueueAll(bands:MusicBand[]) {
  const firstNewIndex=state.pending.length
  const result=queue.addAll(bands)
  notice.value=t('music.addedCount',{count:result.added,skipped:result.skipped})
  openQueue()
  const firstNew=state.pending[firstNewIndex]
  if(result.added&&firstNew)queue.playQueued(firstNew.id)
}
function playQueued(item:MusicItem) {notice.value='';queue.playQueued(item.id);visible.value=true}
function resizeOverhead() {
  return (panel.value?.getBoundingClientRect().height||0)-(frame.value?.getBoundingClientRect().height||0)||160
}
function setSize(width:number,height:number,overhead=resizeOverhead()) {
  Object.assign(size,clampMusicSize(width,height,document.documentElement.clientWidth,document.documentElement.clientHeight,overhead))
  void nextTick(()=>keepPosition())
}
function startResize(event:PointerEvent) {
  if(event.button!==0)return
  event.preventDefault()
  const target=event.currentTarget as HTMLElement
  resizing={id:event.pointerId,x:event.clientX,y:event.clientY,width:panel.value?.getBoundingClientRect().width||size.width,height:size.videoHeight,overhead:resizeOverhead()}
  target.setPointerCapture(event.pointerId)
}
function moveResize(event:PointerEvent) {
  if(!resizing||event.pointerId!==resizing.id)return
  setSize(resizing.width+resizing.x-event.clientX,resizing.height+resizing.y-event.clientY,resizing.overhead)
}
function endResize(event:PointerEvent) {
  if(resizing?.id!==event.pointerId)return
  resizing=undefined
  const target=event.currentTarget as HTMLElement
  if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId)
}
function resizeKeys(event:KeyboardEvent) {
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
  event.preventDefault()
  setSize(size.width+(event.key==='ArrowLeft'?20:event.key==='ArrowRight'?-20:0),size.videoHeight+(event.key==='ArrowUp'?20:event.key==='ArrowDown'?-20:0))
}
function resizeViewport(){if(disposed)return;setSize(size.width,size.videoHeight);keepPosition()}
watch([visible,()=>state.pending.length,notice],async()=>{await nextTick();if(visible.value)resizeViewport()})
function enqueue(band: MusicBand) {
  const result = queue.add(band)
  notice.value = t(`music.${result}`)
  openQueue()
}
function play(band: MusicBand) {
  notice.value = ''
  if (!queue.play(band)) { notice.value = t('music.noVideo'); openQueue(); return }
  visible.value = true
}
function startRandom() {
  visible.value = true
  notice.value = ''
  if (!queue.startRandom(props.bands)) notice.value = t('music.noVideo')
  else if (phase.value === 'paused'||phase.value==='error') resume()
}
function advance(stop = true) {
  notice.value = ''
  if (!queue.next(props.bands)) { if(stop)player?.stopVideo(); phase.value = 'ended' }
}
function close() {
  version++
  player?.stopVideo()
  queue.close()
  phase.value = 'idle'
  visible.value = false
}
async function prepare() {
  if (player) return player
  if (preparing) return preparing
  preparing = (async () => {
    const api = await loadYouTubeAPI()
    if (disposed || !host.value) throw Error(t('music.connection'))
    if (host.value.isConnected===false && frame.value) {
      const mount=document.createElement('div')
      frame.value.replaceChildren(mount)
      host.value=mount
    }
    return new Promise<YouTubePlayer>((resolve,reject) => {
      rejectReady=reject
      readyTimeout=setTimeout(()=>{initializing?.destroy();initializing=undefined;preparing=undefined;reject(Error(t('music.connection')))},20000)
      try {
      initializing = new api.Player(host.value!, {
        host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: { playsinline: 1, origin: location.origin },
        events: {
          onReady(event) {
            clearTimeout(readyTimeout)
            if (disposed) { event.target.destroy(); reject(Error(t('music.connection'))); return }
            initializing=undefined
            rejectReady=undefined
            player = event.target
            resolve(event.target)
          },
          onStateChange(event) {
            if (disposed || !visible.value) return
            if (event.data === 1) {
              if (document.hidden || !frameVisible()) { pause(t('music.hidden')); return }
              if(!state.current)displayItem.value=null
              phase.value = 'playing'
              emit('playing')
            }
            if (event.data === 2 && state.current) phase.value = 'paused'
            if (event.data === 0 && state.current) {
              const actual = new URL(event.target.getVideoUrl()).searchParams.get('v')
              if (actual === state.current.videoId) advance(false)
            }
          },
          onError(event) {
            if (disposed || !visible.value || !state.current) return
            if ([2,100,101,150].includes(event.data)) {
              notice.value = t('music.skipped')
              if (!queue.fail(props.bands)) { phase.value = 'error'; notice.value = t('music.unavailable') }
            } else { pause(); phase.value = 'error'; notice.value = t('music.connection') }
          },
          onAutoplayBlocked() { pause(t('music.blocked')) },
        },
      })
      } catch(error) { clearTimeout(readyTimeout);reject(error) }
    })
  })().catch(error => { preparing = undefined; throw error })
  return preparing
}
async function resume() {
  if (document.hidden) return
  notice.value = ''
  if (!state.current) {
    if (!queue.next(props.bands)) { notice.value = t('music.empty'); return }
    return
  }
  if (!player || loadedVideoId !== state.current.videoId || phase.value === 'error') { await loadCurrent(); return }
  notice.value = ''
  player.playVideo()
}
async function loadCurrent() {
  const current = state.current
  if (!current) return
  const request = ++version
  displayItem.value = { ...current }
  phase.value = 'loading'
  try {
    await nextTick()
    if (!frameVisible()) throw Error(t('music.small'))
    const target = await prepare()
    if (disposed || request !== version || !visible.value) return
    if (document.hidden || !frameVisible()) { pause(t('music.hidden')); return }
    loadedVideoId = current.videoId
    target.loadVideoById(current.videoId)
  } catch (error) {
    if (!disposed && request === version) { phase.value = 'error'; notice.value = (error as Error).message }
  }
}
watch(() => state.current, () => { if (state.current) void loadCurrent() })
function visibilityChanged() { if (document.hidden && (state.current || phase.value==='playing' || phase.value==='loading')) pause(t('music.hidden')) }
function dialogFocused() { if ((state.current || phase.value==='playing') && document.activeElement?.closest('dialog[open]')) pause(t('music.hidden')) }
onMounted(() => {
  if(document.documentElement.clientWidth<=760)size.videoHeight=200
  resizeViewport()
  window.addEventListener('resize',resizeViewport)
  document.addEventListener('visibilitychange', visibilityChanged)
  document.addEventListener('focusin', dialogFocused)
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.intersectionRatio <= .5) && phase.value === 'playing') pause(t('music.hidden'))
  }, { threshold: [.5] })
  if (frame.value) observer.observe(frame.value)
})
onUnmounted(() => { disposed = true; version++; clearInterval(focusTimer); clearTimeout(readyTimeout);rejectReady?.(Error(t('music.connection')));initializing?.destroy();player?.destroy(); observer?.disconnect(); window.removeEventListener('resize',resizeViewport); document.removeEventListener('visibilitychange', visibilityChanged); document.removeEventListener('focusin',dialogFocused) })
defineExpose({ play, enqueue, enqueueAll, startRandom, openQueue, pause })
</script>

<template>
  <section v-show="visible" ref="panel" class="music-player" :style="{width:`${size.width}px`,right:`${position.right}px`,bottom:`${position.bottom}px`,'--music-video-height':`${size.videoHeight}px`}" :aria-label="t('music.title')">
    <div class="music-now" tabindex="0" role="group" :aria-label="t('music.move')" :title="t('music.moveHint')" @pointerdown="startMove" @pointermove="moveWindow" @pointerup="endMove" @pointercancel="endMove" @pointerleave="moving&&!moving.started&&(moving=undefined)" @lostpointercapture="moving=undefined" @click.capture="moveClick" @dragstart.prevent @keydown="moveKeys"><button type="button" class="music-resize" :aria-label="t('music.resize')" :title="t('music.resizeHint')" @pointerdown="startResize" @pointermove="moveResize" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="resizing=undefined" @keydown="resizeKeys"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 10V4h6M4 4l7 7M20 14v6h-6m6 0-7-7"/></svg></button><a v-if="displayItem" :href="`/#/VRCBandDB?band=${encodeURIComponent(displayItem.bandId)}`" @click.prevent="emit('select',displayItem.bandId)" :title="t('music.goBand')">{{ displayItem.name }}</a><span v-else></span><a v-if="displayItem" class="music-external" :href="`https://www.youtube.com/watch?v=${displayItem.videoId}`" target="_blank" rel="noopener noreferrer">{{ t('music.openYouTube') }} <UiIcon/></a><button type="button" class="music-close" :aria-label="t('music.close')" :title="t('music.close')" @click="close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
    <div class="music-video-row"><div ref="frame" class="music-frame"><div ref="host"/></div></div>
    <span class="music-status" role="status">{{ status }}</span>
    <div class="music-bulk"><p v-if="notice" role="status" class="music-notice">{{ notice }}</p><div class="music-actions"><button type="button" @click="startRandom">{{ t('music.random') }}</button><button type="button" :disabled="!(searchResults||bands).some(band=>band.youtubeVideoId)" @click="enqueueAll(searchResults||bands)">{{ t('music.addResults') }}</button></div></div>
    <div v-if="state.pending.length" class="music-queue"><ol><li v-for="(item,index) in state.pending" :key="item.id"><button type="button" class="queue-name" :aria-label="t('music.playItem',{name:item.name})" :title="t('music.playItem',{name:item.name})" @click="playQueued(item)"><img class="queue-thumbnail" :src="`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`" width="125" height="70" alt="" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"><span>{{ item.name }}</span></button><div><button type="button" :disabled="index===0" :aria-label="`${item.name}: ${t('music.up')}`" :title="t('music.up')" @click="queue.move(item.id,-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 6 8 12H4Z" fill="currentColor"/></svg></button><button type="button" :disabled="index===state.pending.length-1" :aria-label="`${item.name}: ${t('music.down')}`" :title="t('music.down')" @click="queue.move(item.id,1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 18 8-12H4Z" fill="currentColor"/></svg></button><button type="button" :aria-label="`${item.name}: ${t('music.remove')}`" :title="t('music.remove')" @click="queue.remove(item.id)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></div></li></ol></div>
  </section>
</template>

<style scoped>
.music-queue li>div button{display:grid;place-items:center;width:30px;height:30px;padding:5px}.music-queue li>div svg{width:18px;height:18px}

.music-close{width:28px;height:28px;display:grid;place-items:center;flex-shrink:0;padding:3px!important}.music-close svg{width:18px;height:18px}.music-bulk{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}.music-bulk p{flex:1;min-width:0}.music-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0}.music-player .music-actions button{font-size:11px;padding:5px 6px;white-space:nowrap}

.music-player{position:fixed;right:16px;bottom:12px;z-index:9;box-sizing:border-box;max-width:calc(100vw - 32px);padding:10px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-dialog);background:var(--db-surface-white);color:var(--db-text);box-shadow:0 8px 32px #0003;font-size:12px}.music-now{cursor:grab;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:24px;margin-bottom:6px}.music-now:active{cursor:grabbing}.music-now:focus-visible{outline:3px solid var(--db-focus-ring)}.music-now a,.music-now button{cursor:pointer}.music-now>a:not(.music-external){flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.music-external{margin-left:auto;white-space:nowrap;flex-shrink:0}.music-player a{color:var(--db-link)}.music-video-row{display:flex;align-items:stretch;gap:8px}.music-frame{flex:1;min-width:0;height:var(--music-video-height);min-height:200px;background:#111}.music-frame>div,.music-frame :deep(iframe){width:100%;height:100%;border:0}.music-player button{font:inherit;cursor:pointer;padding:5px 7px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-control);background:var(--db-surface-muted);color:var(--db-text)}.music-player button:disabled{opacity:.4;cursor:default}.music-player button:focus-visible,.music-player a:focus-visible{outline:3px solid var(--db-focus-ring)}.music-player .music-resize{position:static;flex-shrink:0;align-self:center;width:22px;height:22px;padding:2px;border:0;background:transparent;cursor:nwse-resize;touch-action:none}.music-resize svg{width:100%;height:100%}.music-queue{max-height:150px;overflow-y:auto;margin-top:8px;border-top:1px solid var(--db-border-control)}.music-queue ol{list-style:none;padding:0;margin:0}.music-queue li{display:flex;align-items:center;justify-content:space-between;gap:8px;height:70px;margin:6px 0;padding:0}.music-player .queue-name{display:flex;align-items:center;gap:8px;flex:1;height:70px;border:0;background:transparent;text-align:left;padding:0;min-width:0}.queue-thumbnail{display:block;width:calc(70px * 16 / 9);height:70px;flex-shrink:0;object-fit:contain;background:#111}.queue-name span{min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.music-queue li>div{display:flex;flex-shrink:0;gap:3px}.music-notice{margin:6px 0 0;font-size:11px;max-height:40px;overflow:auto}.music-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}@media(max-height:550px){.music-queue{max-height:78px}}@media(max-width:760px){.music-player{bottom:8px}.music-queue li>div button{padding:4px}.music-now{gap:6px}}
</style>
