<template>
  <div class="youtube-page">
    <iframe
      width="800"
      height="450"
      :src="playlistUrl"
      title="LyceeSerie Playlist"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  </div>
</template>

<script setup>
const playlistId = "PLxhxFIU5cMGKk-BRM5-OoBOmVVaAecoc0"
const playlistUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}`
</script>

<style scoped>
.youtube-page {
  display: flex;
  justify-content: left;
  align-items: center;
  height: 100vh;
  width: 80%;
  overflow: hidden;
  margin: 0 120px 0 0;
}
iframe {
  max-width: 100%;
  max-height: 90vh;
}
</style>
