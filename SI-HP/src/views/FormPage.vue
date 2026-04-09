<template>
  <div class="form-container">
    <iframe src="https://docs.google.com/forms/d/e/1FAIpQLSfCkqBf6QmNgZIds2IXQvbmaE-6BFJxWn0vaJ6XQUGxYxyj4A/viewform"
      frameborder="0" marginheight="0" marginwidth="0">
      読み込んでいます…
    </iframe>
  </div>
</template>

<style scoped>
.form-container {
  height: 100dvh;
  overflow: auto;
  display: flex;
  justify-content: left;
  padding: 30px 0 0 0;
  -webkit-overflow-scrolling: touch;
}

iframe {
  width: 640px;
  height: 100%;
  border: none;
}

/* Chrome, Edge, Safari */
.form-container::-webkit-scrollbar {
  display: none;
}
</style>
