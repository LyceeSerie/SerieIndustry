<script setup lang="ts">
withDefaults(defineProps<{name?:'external'|'menu'|'check' | 'package'|'right'}>(),{name:'external'})
</script>
<template>
 <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path v-if="name==='menu'" d="M4 6h16M4 12h16M4 18h16"/>
  <path v-else-if="name==='right'" d="M4 12h16m-6-6 6 6-6 6"/>
  <path v-else-if="name==='check'" d="m5 12 4 4L19 6"/>
  <path v-else-if="name==='package'" d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 19V12M3 8l9 4 9-4M7.5 5.5l9 5V15"/>
  <path v-else d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>
 </svg>
</template>
<style scoped>
.ui-icon{display:inline-block;width:1em;height:1em;flex-shrink:0;vertical-align:-.13em}
</style>
