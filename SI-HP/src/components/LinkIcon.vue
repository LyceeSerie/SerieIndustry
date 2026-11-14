<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props = defineProps<{ url: string }>()
const failed = ref(false)
const isMail = computed(() => props.url.startsWith('mailto:'))
const favicon = computed(() => {
  try {
    const url = new URL(props.url)
    if (url.hostname === 'serieindustry.com' || url.hostname === 'www.serieindustry.com') return 'https://serieindustry.com/logo.png'
    if (url.hostname === 'bsky.app' || url.hostname === 'www.bsky.app') return 'https://web-cdn.bsky.app/static/favicon-32x32.png'
    return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}/favicon.ico` : ''
  } catch { return '' }
})
watch(() => props.url, () => { failed.value = false })
</script>
<template>
  <span class="link-icon" aria-hidden="true">
    <img v-if="favicon && !failed" :src="favicon" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failed = true">
    <svg v-else-if="isMail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)"/></svg>
  </span>
</template>
<style scoped>
.link-icon{display:inline-flex;width:18px;height:18px;flex-shrink:0;align-items:center;justify-content:center}.link-icon img,.link-icon svg{width:100%;height:100%;object-fit:contain}
</style>
