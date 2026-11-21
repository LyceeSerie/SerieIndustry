<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props = defineProps<{ videoId?: string }>()
const validId = computed(() => /^[A-Za-z0-9_-]{11}$/.test(props.videoId || '') ? props.videoId : '')
const failed=ref(false)
watch(()=>props.videoId,()=>{failed.value=false})
</script>

<template>
  <section v-if="validId" class="band-video" aria-label="動画">
    <p v-if="failed" role="status">動画を読み込めません。</p>
    <iframe v-else :key="validId" :src="`https://www.youtube-nocookie.com/embed/${validId}`" title="バンド紹介動画（YouTube）" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen @error="failed=true"></iframe>
    <a :href="`https://www.youtube.com/watch?v=${validId}`" target="_blank" rel="noopener noreferrer">YouTubeで開く ↗</a>
  </section>
</template>

<style scoped>
.band-video{margin:28px 0}.band-video iframe{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:8px;background:var(--db-image-background)}.band-video a{display:inline-block;margin-top:8px;color:var(--db-link);font-size:12px}
</style>
