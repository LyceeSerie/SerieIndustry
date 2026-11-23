<script setup lang="ts">
defineProps<{ source?: string }>()
defineEmits<{ contact: [] }>()
</script>

<template>
  <div v-if="source === 'admin'" class="profile-registration-actions">
    <button type="button" class="rights-contact" @click="$emit('contact')">掲載内容の修正・削除について</button>
  </div>
</template>

<style scoped>
.profile-registration-actions{display:flex;flex:0 1 auto;max-width:45%;min-width:0;margin-left:auto}.rights-contact{min-height:36px;padding:6px 10px;border:1px solid var(--db-border-control);border-radius:5px;background:var(--db-surface-white);color:var(--db-link);font-size:12px;line-height:1.5;cursor:pointer;overflow-wrap:anywhere}.rights-contact:hover{background:var(--db-control-hover)}.rights-contact:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:3px}
</style>
