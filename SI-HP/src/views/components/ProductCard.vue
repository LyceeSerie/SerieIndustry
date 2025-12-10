<template>
  <div class="grid-container">
    <a :href="url" target="_blank" class="product-card">
      <img :src="image" :alt="name" class="product-image" />
      <h2 class="product-name">{{ name }}</h2>
      <div class="product-price">¥ {{ price }}</div>
    </a>
  </div>
</template>

<script setup>
defineProps({
  image: String,
  name: String,
  price: [String, Number],
  url: String,
});
</script>

<style scoped>
.grid-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  justify-items: center;
}

.product-card {
  width: 300px;
  display: flex;
  flex-direction: column;
  background-color: #f9f9f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* 画像 */
.product-image {
  width: 100%;
  height: auto;
  display: block;
}

/* 商品名 */
.product-name {
  font-size: 1.1rem;
  font-weight: 600;
  padding: 12px;
  word-break: break-word;
  margin: 0;
  color: #000;
}

/* 値段 */
.product-price {
  padding: 0 12px 12px 12px;
  font-weight: 500;
  color: #4b5563;
  margin-top: auto;
}
</style>
