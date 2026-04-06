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
    case 'Schedule': return 'スケジュール';
    default: return 'ページ未定義';
  }
});

const titleRef = ref<HTMLElement | null>(null);
const leftMargin = ref('0px');
let resizeObserver: ResizeObserver | null = null;

const updateMargin = () => {
if (window.innerWidth <= 768) {
    leftMargin.value = '0px';
    return;
  }
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

/* スマホ用: 幅 768px 以下 */
@media (max-width: 768px) {
  .layout {
    flex-direction: column; /* 縦並び */
    height: 100%;
  }

  .main-content {
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    align-items: flex-start;
    position: relative;
  }

  .page-title {
    position: relative;
    left: auto;
    top: 30px;
    transform: none;
    margin: 16px 0;
    font-size: 2em;
    text-align: center;
    width: 100%;
  }

  .page-content {
    margin-left: 0;
    margin-right: 0;
    width: 100%;
  }

  SideMenu {
    position: relative;
    width: 100%;
    height: auto;
    order: 1;
  }
}
</style>
