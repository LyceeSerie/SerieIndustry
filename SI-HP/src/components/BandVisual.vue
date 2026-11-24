<script setup lang="ts">
import BandImage from './BandImage.vue'
type Image = {url:string;source:string}|null
defineProps<{photo:Image;logo:Image;layout?:string}>()
</script>
<template>
  <BandImage v-if="logo && (!layout || layout === 'separate' || !photo)" class="separate-logo" :image="logo" alt="バンドロゴ"/>
  <div v-if="photo" class="artist-visual">
    <BandImage class="profile-photo" :image="photo" alt="アー写"/>
    <BandImage v-if="logo && layout && layout !== 'separate'" class="overlay-logo" :class="layout" :image="logo" alt="バンドロゴ"/>
  </div>
</template>
<style scoped>
.separate-logo{width:min(100%,300px);height:160px;margin:24px 0;background:transparent;align-items:flex-start}.separate-logo :deep(img){object-position:top left}.artist-visual{position:relative;isolation:isolate;margin:28px 0;aspect-ratio:16/9;background:var(--db-image-background);border-radius:var(--db-radius-surface);overflow:hidden}.profile-photo{width:100%;height:100%;min-height:0}.profile-photo :deep(img){width:100%;height:100%;object-fit:contain}.overlay-logo{position:absolute;top:16px;left:16px;z-index:1;width:clamp(100px,30%,220px);height:40%;min-height:0;background:transparent;filter:drop-shadow(0 1px 3px var(--db-logo-shadow))}.overlay-logo :deep(img){object-position:top left}.overlay-logo.top-right{left:auto;right:16px}.overlay-logo.bottom-left{top:auto;bottom:16px}.overlay-logo.bottom-right{top:auto;left:auto;bottom:16px;right:16px}.overlay-logo.top-right :deep(img){object-position:top right}.overlay-logo.bottom-left :deep(img){object-position:bottom left}.overlay-logo.bottom-right :deep(img){object-position:bottom right}@media(max-width:760px){.overlay-logo{top:10px;left:10px;width:30%}.overlay-logo.top-right{right:10px}.overlay-logo.bottom-left{bottom:10px}.overlay-logo.bottom-right{right:10px;bottom:10px}}
</style>
