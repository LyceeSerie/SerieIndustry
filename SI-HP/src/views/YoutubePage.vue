<template>
  <div class="youtube-page">
    <div class="video-wrapper">
      <iframe
        :src="playlistUrl"
        title="LyceeSerie Playlist"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
  </div>
</template>

<script setup>
const playlistId = "PLxhxFIU5cMGKk-BRM5-OoBOmVVaAecoc0"
const playlistUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}`
</script>

<style scoped>
  .youtube-page {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 100vh;
  width: 80%;
  margin: 0 120px 0 0;
}

.video-wrapper {
  width: 100%;
  max-width: 800px;
  aspect-ratio: 16 / 9;
}

.video-wrapper iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

@media (max-width: 768px) {
  .youtube-page {
    width: 80%;
    margin: 0;
    padding: 0 16px;
  }

  .video-wrapper {
    max-width: 100%;
  }
}

</style>
