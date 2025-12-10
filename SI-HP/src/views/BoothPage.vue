<script setup lang="ts">
import ProductCard from './components/ProductCard.vue';
</script>
<template>
  <div class="scroll-container">
    <div class="product-grid">
      <ProductCard
        v-for="i in 18"
        :key="i"
        image="https://booth.pximg.net/c/300x300_a2_g5/a3916d87-2345-4c36-89e0-7c61148b72b9/i/7277932/a2c9e909-b556-4bc6-b4b4-2e3ebba00b53_base_resized.jpg"
        name="ギター・SIS-VII△11196 | VRChat想定"
        price="420"
        url="https://serie-tech.booth.pm/items/7277932"
      />
    </div>
  </div>
</template>

<style scoped>
.scroll-container {
  height: 80vh;
  overflow-y: auto;
  padding: 0;
  border: none;
  
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scroll-container::-webkit-scrollbar {
  display: none;
}

.product-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 600px) {
  .product-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 900px) {
  .product-grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
</style>
