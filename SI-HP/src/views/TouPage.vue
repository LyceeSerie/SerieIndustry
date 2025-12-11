<template>
  <div class="tou-page">
    <section>
      <h2>個人利用向け (2024/03/20改訂版)</h2>
      <ul>
        <li><a href="https://serieindustry.com/tou/v20240315_vn3_ja.pdf" target="_blank">商品利用規約[JP]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315_vn3_en.pdf" target="_blank">商品利用規約[EN]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315_vn3_ko.pdf" target="_blank">商品利用規約[KO]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315_vn3_zh.pdf" target="_blank">商品利用規約[ZH]</a></li>
      </ul>
    </section>

    <section>
      <h2>法人利用向け (2024/03/20改訂版)</h2>
      <ul>
        <li><a href="https://serieindustry.com/tou/v20240315C_vn3_ja.pdf" target="_blank">商品利用規約[JP]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315C_vn3_en.pdf" target="_blank">商品利用規約[EN]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315C_vn3_ko.pdf" target="_blank">商品利用規約[KO]</a></li>
        <li><a href="https://serieindustry.com/tou/v20240315C_vn3_zh.pdf" target="_blank">商品利用規約[ZH]</a></li>
      </ul>
    </section>

    <section>
      <h2>(OLD) 2021/12/22改訂版</h2>
      <ul>
        <li><a href="https://serieindustry.com/tou/v20211222_vn3_ja.pdf" target="_blank">商品利用規約[JP]</a></li>
        <li><a href="https://serieindustry.com/tou/v20211222_vn3_en.pdf" target="_blank">商品利用規約[EN]</a></li>
      </ul>
    </section>
  </div>
</template>

<script setup>
</script>

<style scoped>
.tou-page {
  width: 100%;
  padding: 200px 20px;
  box-sizing: border-box;
}

h1 {
  font-size: 2rem;
  margin-bottom: 30px;
  text-align: left;
}

h2 {
  font-size: 1.4rem;
  margin-top: 30px;
  margin-bottom: 10px;
  text-align: left;
}

ul {
  list-style: none;
  padding-left: 0;
  margin-left: 0;
}

li {
  margin-bottom: 8px;
}

a {
  color: #1a73e8;
  text-decoration: none;
}

section{ 
  color: #000; 
  font-size: large;
}

a:hover {
  text-decoration: underline;
}

.tou-page {
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
  padding-right: 110px;
}

/* Chrome, Edge, Safari */
.tou-page::-webkit-scrollbar {
  display: none;
}
</style>
