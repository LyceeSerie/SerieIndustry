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
  padding: 25px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  height: calc(100vh - 0px);
}

.scroll-container::-webkit-scrollbar {
  display: none;
}

.product-grid {
  display: grid;
  gap: 8px;
  justify-content: start;
  width: 50%; 
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

@media (max-width: 1099px) {
  .product-grid {
    grid-template-columns: 1fr; /* 1列 */
  }
}

@media (min-width: 1100px) and (max-width: 1499px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr); /* 2列 */
  }
}

@media (min-width: 1500px) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr); /* 3列 */
  }
}
</style>
