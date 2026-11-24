<script setup lang="ts">
import { ref } from 'vue'
defineProps<{label:string;accept:string;disabled?:boolean}>()
const emit=defineEmits<{change:[event:Event]}>()
const input=ref<HTMLInputElement>()
</script>
<template>
  <div class="file-upload">
    <button type="button" :disabled="disabled" @click="input?.click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/></svg>
      <span>{{ label }}</span>
    </button>
    <input ref="input" type="file" :accept="accept" :disabled="disabled" hidden @change="emit('change',$event)">
  </div>
</template>
<style scoped>
.file-upload button{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:11px 14px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-control);background:var(--db-surface-white);color:var(--db-text);font:inherit;font-size:13px;cursor:pointer;transition:border-color .15s,color .15s}.file-upload button:hover:not(:disabled){color:var(--db-primary);border-color:var(--db-primary)}.file-upload button:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}.file-upload button:disabled{opacity:.5;cursor:default}.file-upload svg{width:18px;height:18px;flex-shrink:0}.file-upload input[hidden]{display:none}
</style>
