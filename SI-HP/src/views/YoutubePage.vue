<template>
  <div class="youtube-page">
    <h1></h1>

    <!-- プレイリスト埋め込み -->
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
  flex-direction: column;
  align-items: center;
  padding: 20% 0px;
}

iframe {
  max-width: 100%;
}
</style>
