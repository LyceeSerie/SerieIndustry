<script setup lang="ts">
import { ref } from 'vue'
import XAvatar from './XAvatar.vue'
import members from '../data/vrc-band-db-team.json'
import recruitment from '../data/vrc-band-db-recruitment.json'

const dialog = ref<HTMLDialogElement | null>(null)
const groups = [...new Set(members.map(member => member.classification))]
function open() { dialog.value?.showModal() }
function close() { dialog.value?.close() }
function closeOutside(event: MouseEvent) {
  const element = dialog.value
  if (!element || event.target !== element) return
  const bounds = element.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}
</script>

<template>
  <button class="team-trigger" aria-label="運営情報" title="運営情報" @click="open"><svg class="team-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2"/></svg><span class="team-trigger-label">運営情報</span></button>
  <dialog ref="dialog" class="team-dialog" aria-labelledby="team-title" @click="closeOutside">
    <div class="team-heading"><h2 id="team-title">運営情報</h2><button class="team-close" aria-label="運営情報を閉じる" @click="close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    <section v-for="group in groups" :key="group" class="team-group">
      <h3>{{ group }}</h3>
      <div v-for="(member, index) in members.filter(member => member.classification === group)" :key="`${group}-${index}`" class="team-member">
        <a class="team-avatar" :href="`https://x.com/${encodeURIComponent(member.twitterId)}`" target="_blank" rel="noopener noreferrer" :aria-label="`${member.name}のTwitter / X（@${member.twitterId}）を開く`">
          <XAvatar :twitter-id="member.twitterId"/>
        </a>
        <div><strong>{{ member.name }}</strong><p>@{{ member.twitterId }}</p></div>
      </div>
    </section>
    <section v-if="recruitment.positions.length" class="team-recruitment" aria-labelledby="team-recruitment-title">
      <h3 id="team-recruitment-title">{{ recruitment.title }}</h3>
      <ul><li v-for="(position, index) in recruitment.positions" :key="index">{{ position }}</li></ul>
      <p>{{ recruitment.message }}</p>
      <a class="recruitment-contact" href="https://discord.gg/8GYFcRJkbK" target="_blank" rel="noopener noreferrer">{{ recruitment.contactLabel }}</a>
    </section>
  </dialog>
</template>

<style scoped>
.team-recruitment{border-top:1px solid var(--db-border-divider);margin-top:28px;padding-top:24px}.team-recruitment h3{font-size:15px;margin:0 0 12px}.team-recruitment ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0 0 16px}.team-recruitment li{border:1px solid var(--db-border-control);border-radius:20px;padding:5px 12px;font-size:12px}.team-recruitment p{font-size:13px;line-height:1.8;margin:0 0 18px;overflow-wrap:anywhere}.team-recruitment .recruitment-contact{display:inline-flex;align-items:center;gap:12px;background:var(--db-primary);color:var(--db-surface-white);text-decoration:none;border-radius:5px;padding:10px 14px;font-size:12px}.recruitment-contact:hover{background:var(--db-primary-hover)}
.team-trigger{background:var(--db-surface-muted);color:var(--db-text);border:1px solid var(--db-border-control);padding:10px 12px;font-size:12px!important;white-space:nowrap}.team-dialog{position:fixed;inset:0;width:min(480px,calc(100vw - 32px));max-height:calc(100dvh - 48px);margin:auto;padding:24px;border:1px solid var(--db-border-input);border-radius:12px;background:var(--db-surface);color:var(--db-text);overflow:auto;box-shadow:0 12px 48px var(--db-modal-shadow)}.team-dialog::backdrop{background:var(--db-modal-backdrop)}.team-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.team-heading h2{margin:0;font-size:20px}.team-dialog .team-close{background:transparent;color:var(--db-text);display:grid;place-items:center;width:36px;height:36px;border:0;padding:6px}.team-close svg{width:24px;height:24px}.team-group{margin-top:24px}.team-group h3{margin:0 0 12px;font-size:13px;color:var(--db-text-secondary)}.team-member{display:flex;align-items:center;gap:16px;margin:12px 0}.team-avatar{display:grid;place-items:center;width:64px;height:64px;flex-shrink:0;overflow:hidden;border-radius:50%;background:var(--db-control-hover);color:var(--db-text-control)}.team-avatar img{width:100%;height:100%;object-fit:cover}.team-avatar svg{width:40px;height:40px}.team-member strong{font-size:16px}.team-member p{margin:4px 0 0;color:var(--db-text-muted);font-size:12px}@media(max-width:760px){.team-trigger{font-size:10px!important;padding:9px}.team-dialog{padding:20px}}
.team-trigger-icon{display:none}@media(max-width:760px){.team-trigger{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0}.team-trigger-icon{display:block;width:20px;height:20px}.team-trigger-label{display:none}}
</style>
