<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ image: { url: string; source: string } | null; alt: string; compact?: boolean }>()
const failed = ref(false)
watch(() => props.image?.url, () => { failed.value = false })
</script>
<template>
  <div class="image-slot">
    <img v-if="image && !failed" :src="image.url" :alt="alt" loading="lazy" referrerpolicy="no-referrer" @error="failed = true">
    <span v-else>{{ compact ? '画像なし' : image ? `${alt}を表示できません` : `${alt}未登録` }}</span>
    <a v-if="image && failed && !compact" :href="image.source" target="_blank" rel="noopener noreferrer">元の画像を開く ↗</a>
  </div>
</template>
<style scoped>
.image-slot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;overflow:hidden;background:#e5eadf;color:#63775b;font-size:11px;min-height:42px}.image-slot img{width:100%;height:100%;object-fit:contain;min-height:0}.image-slot a{color:#365a3c;font-size:11px}
</style>
