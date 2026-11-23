<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ twitterId: string }>()
const emit = defineEmits<{ availability: [available: boolean] }>()
const failed = ref(false)
watch(() => props.twitterId, () => { failed.value = false; emit('availability', false) }, { immediate: true })
function loaded() { emit('availability', true) }
function unavailable() { failed.value = true; emit('availability', false) }
</script>
<template>
  <span class="x-avatar" aria-hidden="true">
    <img v-if="twitterId && !failed" :src="`https://unavatar.io/x/${encodeURIComponent(twitterId)}?fallback=false`" alt="" loading="lazy" referrerpolicy="no-referrer" @load="loaded" @error="unavailable">
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
  </span>
</template>
<style scoped>
.x-avatar{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;border-radius:50%;background:var(--db-control-hover);color:var(--db-text-control)}.x-avatar img{width:100%;height:100%;object-fit:cover}.x-avatar svg{width:65%;height:65%}
</style>
