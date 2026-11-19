<script setup lang="ts">
import XAvatar from './XAvatar.vue'
import { ref } from 'vue'
defineProps<{ members?: { part: string; name: string; twitterId: string }[] }>()
const available = ref<Record<number, boolean>>({})
</script>
<template>
  <section v-if="members?.length" class="band-members" aria-label="バンドメンバー">
    <h2>バンドメンバー</h2>
    <div class="member-list">
      <component :is="member.twitterId ? 'a' : 'span'" v-for="(member, index) in members" :key="index" class="member-pill" :href="member.twitterId && available[index] ? `https://x.com/${encodeURIComponent(member.twitterId)}` : undefined" :target="member.twitterId && available[index] ? '_blank' : undefined" :rel="member.twitterId && available[index] ? 'noopener noreferrer' : undefined" :aria-label="member.twitterId && available[index] ? `${member.part} ${member.name}のXを開く` : undefined">
        <XAvatar class="member-avatar" :twitter-id="member.twitterId" @availability="available[index] = $event"/>
        <span v-if="member.part" class="member-part">{{ member.part }}</span>
        <strong class="member-name">{{ member.name }}</strong>
      </component>
    </div>
  </section>
</template>
<style scoped>
.band-members h2{font-size:13px;margin:28px 0 12px}.member-list{display:flex;flex-wrap:wrap;gap:10px}.member-pill{display:inline-flex;align-items:center;gap:10px;min-width:0;max-width:100%;padding:8px 16px 8px 8px;border:1px solid var(--db-border-control);border-radius:999px;background:var(--db-surface);color:var(--db-text);text-decoration:none;overflow-wrap:anywhere}.member-pill:not([href]){cursor:default}.member-avatar{width:40px;height:40px;flex:0 0 40px}.member-part{font-size:12px;color:var(--db-text-secondary)}.member-name{font-size:16px;font-weight:700}a.member-pill[href]:hover{border-color:var(--db-primary);background:var(--db-control-hover)}a.member-pill[href]:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:3px}@media(max-width:760px){.member-pill{gap:8px;padding-right:12px}.member-name{font-size:14px}.member-avatar{width:36px;height:36px;flex-basis:36px}}
</style>
