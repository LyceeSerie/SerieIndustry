<script setup lang="ts">
defineProps<{ title: string; tags: string[]; showHeading?: boolean }>()
</script>

<template>
  <template v-if="tags.length">
    <h2 v-if="showHeading !== false">{{ title }}</h2>
    <div class="chips" role="group" :aria-label="title"><span v-for="tag in tags" :key="tag">{{ tag }}</span></div>
  </template>
</template>

<style scoped>
.chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:20px}.chips span{font-size:11px;border:1px solid #c8d5be;border-radius:20px;padding:4px 10px}
</style>
