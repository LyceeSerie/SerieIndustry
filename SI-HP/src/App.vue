<script setup lang="ts">
import MainLayout from './components/MainLayout.vue';
import { useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <RouterView v-if="route.name === 'VRCBandDB' || route.name === 'BandEvents' || route.name === 'BandEventDetail'" />
  <MainLayout v-else />
</template>

<style scoped>
body, html, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  font-family: Arial, sans-serif;
}
</style>
