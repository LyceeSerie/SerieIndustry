<!-- Menu.vue -->
<template>
  <aside class="side-menu">
    <ul>
      <li><RouterLink to="/Booth">Booth</RouterLink></li>
      <li><RouterLink to="/Tou">商品利用規約</RouterLink></li>
      <li><RouterLink to="/Form">依頼受付</RouterLink></li>
      <li><RouterLink to="/Contact">Contact</RouterLink></li>
      <li><RouterLink to="/Mov">Youtube</RouterLink></li>
      <li><RouterLink to="/Works">Works</RouterLink></li>
    </ul>
  </aside>
</template>

<script setup lang="ts">
</script>

<style scoped>
.side-menu {
  position: absolute;
  width: 200px;
  background-color: rgba(255, 255, 255, 0);
  height: 100vh;
  right: 0;  
  padding: 2%;
  box-sizing: border-box;
}
.side-menu ul {
  list-style: none;
  padding: 0;
  text-align: right;
  font-size: large;
}
.side-menu li {
  margin-bottom: 1em;
}
.side-menu a {
  text-decoration: none;
  color: #333;
}
.side-menu a:hover {
  color: #42b883;
}
</style>
