<script setup lang="ts">
import UiIcon from './UiIcon.vue'
defineProps<{name?:string;url?:string}>()
</script>
<template><span v-if="name" class="event-venue"><a v-if="url" :href="url" target="_blank" rel="noopener noreferrer">{{ name }} <UiIcon/></a><span v-else>{{ name }}</span></span></template>
<style scoped>.event-venue{position:relative;z-index:1;display:block;min-width:0;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.event-venue a{color:var(--db-link);text-decoration:underline;text-underline-offset:2px}.event-venue a:hover{color:var(--db-primary-hover)}.event-venue a:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}</style>
