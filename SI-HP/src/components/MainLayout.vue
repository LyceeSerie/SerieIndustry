<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import SideMenu from './Menu.vue';

const route = useRoute();
const pageName = computed(() => {
  switch(route.name) {
    case 'Top': return '';
    case 'Works': return 'WORKS';
    case 'Booth': return 'Booth';
    case 'Contact': return 'Contact';
    case 'Tou': return '商品利用規約';
    case 'Youtube': return 'Youtube';
    case 'Form': return '依頼フォーム';
    default: return 'ページ未定義';
  }
});

const titleRef = ref<HTMLElement | null>(null);
const leftMargin = ref('0px');
let resizeObserver: ResizeObserver | null = null;

const updateMargin = () => {
  if (titleRef.value) {
    const width = titleRef.value.offsetWidth;
    const left = parseFloat(getComputedStyle(titleRef.value).left) || 0;
    leftMargin.value = `${left + width + 80}px`;
  }
};

onMounted(() => {
  updateMargin();

  // ウィンドウリサイズにも対応
  window.addEventListener('resize', updateMargin);

  // タイトルのサイズ変化を監視
  if (titleRef.value) {
    resizeObserver = new ResizeObserver(updateMargin);
    resizeObserver.observe(titleRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMargin);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="layout">
    <main class="main-content">
      <router-link to="/" class="logo-link">
        <img src="/logo.png" class="logo" />
      </router-link>
      <div ref="titleRef" class="page-title">{{ pageName }}</div>
      <div class="page-content" :style="{ marginLeft: leftMargin }">
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
  position: relative;
}

.main-content {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: flex-start;
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
  cursor: pointer;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #00ff40aa);
}

.page-title {
  position: absolute;
  left: 2em;
  top: 50%;
  transform: translateY(-50%);
  font-size: 3em;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
  z-index: 10;
}

.page-content {
  position: relative;
  margin-left: 16px;
  margin-right: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

SideMenu {
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 100%;
}
</style>
