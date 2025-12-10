<template>
  <div class="form-container">
    <iframe
      src="https://docs.google.com/forms/d/e/1FAIpQLSfCkqBf6QmNgZIds2IXQvbmaE-6BFJxWn0vaJ6XQUGxYxyj4A/viewform"
      width="640"
      height=100%
      frameborder="0"
      marginheight="0"
      marginwidth="0"
    >
      読み込んでいます…
    </iframe>
  </div>
</template>

<style scoped>
.form-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: left;
  padding: 30px 0 0 0;
}
iframe {
  max-width: 100%;
}
/* Chrome, Edge, Safari */
.form-container::-webkit-scrollbar {
  display: none;
}
</style>
