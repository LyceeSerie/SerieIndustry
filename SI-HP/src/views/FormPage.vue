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
  height: 300vh;
  overflow: auto;
  display: flex;
  justify-content: left;
  padding: 30px 0 0 0;
  -webkit-overflow-scrolling: touch;
}

iframe {
  width: 640px;
  border: none;
}

/* Chrome, Edge, Safari */
.form-container::-webkit-scrollbar {
  display: none;
}

@media (max-width: 768px) {
  iframe {
    width: 100vw;
    height: auto;
  }

  .form-container::-webkit-scrollbar {
    display: flex;
  }
}
</style>
