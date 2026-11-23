<script setup lang="ts" generic="T extends { id: string }">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{ items: T[]; animated?: boolean }>(), { animated: true })
const viewport = ref<HTMLElement | null>(null)
const group = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const looping = ref(false)
const running = ref(props.animated !== false)
let cycleWidth = 0
let animation: Animation | undefined
let duration = 0
let disposed = false
let observer: ResizeObserver | undefined
let motion: MediaQueryList | undefined
let drag: { id: number; x: number; scroll: number; moved: boolean } | null = null
let suppressClick = false

function manualPosition(position: number) {
  return Math.max(0, Math.min(position, Math.max(0, cycleWidth - (viewport.value?.clientWidth || 0))))
}
function phase() {
  const time = typeof animation?.currentTime === 'number' ? animation.currentTime : 0
  return duration ? (time % duration) / duration : 0
}
function pause() {
  if (!running.value) return
  const position = manualPosition(animation ? phase() * cycleWidth : viewport.value?.scrollLeft || 0)
  running.value = false
  animation?.cancel()
  animation = undefined
  if (viewport.value) viewport.value.scrollLeft = position
  void nextTick(() => { if (viewport.value) viewport.value.scrollLeft = position })
}
async function measure() {
  const element = viewport.value
  if (!element || !group.value) return
  const oldWidth = cycleWidth
  const progress = phase()
  cycleWidth = group.value.getBoundingClientRect().width
  const needed = props.animated !== false && props.items.length > 1 && cycleWidth > element.clientWidth + 1
  looping.value = needed
  await nextTick()
  if (disposed || !track.value || !viewport.value) return
  if (!needed || !running.value) {
    animation?.cancel()
    animation = undefined
    return
  }
  if (animation && oldWidth === cycleWidth) return
  animation?.cancel()
  viewport.value.scrollLeft = 0
  duration = cycleWidth / 22 * 1000
  // Animate fractional pixels on the compositor, without per-frame scroll rounding.
  animation = track.value.animate([
    { transform: `translate3d(${-cycleWidth}px,0,0)` },
    { transform: `translate3d(${-2 * cycleWidth}px,0,0)` },
  ], { duration, iterations: Infinity, easing: 'linear' })
  animation.currentTime = progress * duration
}
function pointerDown(event: PointerEvent) {
  if (props.animated === false) return
  pause()
  if (event.pointerType === 'mouse' && event.button === 0 && viewport.value) {
    drag = { id: event.pointerId, x: event.clientX, scroll: viewport.value.scrollLeft, moved: false }
  }
}
function pointerMove(event: PointerEvent) {
  if (!drag || !viewport.value || drag.id !== event.pointerId) return
  const delta = event.clientX - drag.x
  if (!drag.moved && Math.abs(delta) < 6) return
  drag.moved = true
  viewport.value.setPointerCapture(event.pointerId)
  viewport.value.scrollLeft = manualPosition(drag.scroll - delta)
  event.preventDefault()
}
function pointerEnd() {
  if (drag?.moved) {
    suppressClick = true
    setTimeout(() => { suppressClick = false }, 0)
  }
  drag = null
}
function clickCapture(event: MouseEvent) {
  if (suppressClick) { event.preventDefault(); event.stopPropagation() }
}
function step(direction: number) {
  pause()
  void nextTick(() => {
    if (viewport.value) viewport.value.scrollLeft = manualPosition(viewport.value.scrollLeft + direction * cycleWidth / Math.max(props.items.length, 1))
  })
}
function keyDown(event: KeyboardEvent) {
  if (props.animated === false) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    step(event.key === 'ArrowLeft' ? -1 : 1)
  }
}
function motionChanged() { if (motion?.matches) pause() }
onMounted(async () => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionChanged()
  motion.addEventListener('change', motionChanged)
  await measure()
  if (disposed) return
  observer = new ResizeObserver(() => { void measure() })
  if (viewport.value) observer.observe(viewport.value)
  if (group.value) observer.observe(group.value)
})
onUnmounted(() => {
  disposed = true
  animation?.cancel()
  observer?.disconnect()
  motion?.removeEventListener('change', motionChanged)
})
</script>

<template>
  <div class="carousel" :class="{ static: animated === false }" role="region" :aria-label="animated === false ? '紹介バンド' : 'ランダムバンド紹介スライダー'">
    <div ref="viewport" :class="looping && running ? 'viewport automatic' : 'viewport'" :tabindex="animated === false ? undefined : 0" :aria-label="animated === false ? '紹介バンド一覧' : '紹介バンド。左右矢印キーでも移動できます'"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd"
      @focusin="pause" @keydown="keyDown" @click.capture="clickCapture" @dragstart.prevent>
      <div ref="track" class="track">
        <div v-for="copy in (looping && running ? [1, 2, 3] : [2])" :key="copy" :ref="element => { if (copy === 2) group = element as HTMLElement | null }" class="group" :aria-hidden="looping && running && copy !== 2 ? true : undefined">
          <slot v-for="item in items" :key="item.id" :item="item" :duplicate="looping && running && copy !== 2"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.carousel{min-width:0}.viewport{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none;-ms-overflow-style:none;cursor:grab;-webkit-overflow-scrolling:touch}.viewport::-webkit-scrollbar{display:none}.viewport:active{cursor:grabbing}.viewport.automatic{overflow-x:hidden}.automatic .track{will-change:transform}.track{display:flex;width:max-content}.group{display:flex;gap:16px;padding-right:16px;flex-shrink:0}.viewport :slotted(button){user-select:none}.viewport :slotted(button img){-webkit-user-drag:none}
.static .viewport{overflow:visible;cursor:default}.static .track{width:100%}.static .group{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;gap:16px;padding-right:0}.static :slotted(.discovery-card){width:100%;max-width:none}@media(max-width:600px){.static .group{grid-template-columns:1fr}}
.carousel:not(.static) .viewport{--edge-fade:18px;-webkit-mask-image:linear-gradient(to right,transparent,#000 var(--edge-fade),#000 calc(100% - var(--edge-fade)),transparent);mask-image:linear-gradient(to right,transparent,#000 var(--edge-fade),#000 calc(100% - var(--edge-fade)),transparent)}
@media(max-width:600px){.carousel:not(.static) .viewport{--edge-fade:10px}}
</style>
