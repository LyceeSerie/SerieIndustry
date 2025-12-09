<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SideMenu from './Menu.vue'

const route = useRoute()
const pageName = computed(() => {
  switch(route.name) {
    case 'Top': return ''
    case 'Works': return 'WORKS'
    case 'Booth': return 'Booth'
    case 'Contact': return 'Contact'
    case 'Tou': return '商品利用規約'
    case 'Youtube': return 'Youtube'
    case 'Form': return '依頼フォーム'
    default: return 'ページ未定義'
  }
})
</script>

<template>
  <div class="layout">
    <main class="main-content">
      <router-link to="/" class="logo-link">
        <img src="/logo.png" class="logo" />
      </router-link>
      <div class="page-title">{{ pageName }}</div>
      <div class="page-content">
        <router-view />
      </div>
    </main>
    <SideMenu />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.main-content {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #fff;
}

.logo-link {
  position: absolute;
  top: 1em;
  left: 1em;
  z-index: 10;
}

.logo {
  height: 6em;
  will-change: filter;
  transition: filter 300ms;
  cursor: pointer;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.page-title {
  position: absolute;
  top: 50%;
  left: 3em;
  transform: translateY(-50%);
  font-size: 3em;
  font-weight: bold;
  color: #333;
  z-index: 10;
}

.page-content {
  left: 0em;
}

.page-container {
  flex: 1;
  padding-left: 150px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>