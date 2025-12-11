<template>
  <div class="contact-page">

    <div class="contact-grid">
      <ContactCard
        icon="https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.2560.png"
        title="Twitter"
        id="@zerry_furai"
        url="https://x.com/zerry_furai"
      />

      <ContactCard
        icon="https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/66e3d8014ea898f3a4b2156c_Symbol.svg"
        title="Discord"
        id="@lserie"
        url="https://discord.gg/52EFRXVR"
      />

      <ContactCard
        icon="Mail.svg"
        title="Email"
        id="LyceeSerie@gmail.com"
        url="mailto:LyceeSerie@gmail.com"
      />

      <ContactCard
        icon="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Bluesky_logo_%28black%29.svg/120px-Bluesky_logo_%28black%29.svg.png"
        title="BlueSky"
        id="@serieindustry.com"
        url="https://bsky.app/profile/serieindustry.com"
      />
      
      <ContactCard
        icon="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAkFBMVEUbHh8YGR4LABwIABsPCB0rNyN7qkCKwEVulzsTEB0aHB+W0Eqb10x/sEFTcTGe200hJyEVGBkAAABKZyYdIR9aW1yrq6xsanGHwTZ3oz6Ghof///+UlpRnki9ghDXo6OnW1tb6+vosLi8XGhszNTa4uLgKDxAABAd3eHjz8/MjJidPUVHf399mZ2jLzMylpqZa6oC6AAAA2klEQVR4AZXSBQKCQBAFULvz29LdcP/byQ7WwmCMkm+C6vwX3V5/0GrD0Xgy5W3WnS/mi2WfxelqMZ/P15sZY1vsCPcM4nA8ncu2lx5jV0VRVG2p92a8KQZ60zZTTNARa5bttNsW21Zzj57r1ywIK/MjRVFsudaJK4sTsUkhIY5ktr+lpMyXUHRTbP/e3oM0Upw6QqQZ1LcxUg0E5vSQpLYCc5RpsBoPCSmVAlSoFPLM6hFEpkLhyjcKQ3nFEbUvILYqYF/LtmPydRQOkqOZ5oXNmChGGYHT+TFuAloekmxaQRsAAAAASUVORK5CYII="
        title="Misskey.io"
        id="@lyc"
        url="https://misskey.io/@lyc"
      />
    </div>
  </div>
</template>

<script setup>
import ContactCard from './components/ContactCard.vue'
</script>

<style scoped>
.contact-page {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.contact-grid {
  display: grid;
  gap: 8px;
  justify-content: center; 
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

@media (max-width: 999px) {
  .contact-grid {
    grid-template-columns: 1fr; /* 1列 */
  }
}

@media (min-width: 1000px) and (max-width: 1399px) {
  .contact-grid {
    grid-template-columns: repeat(2, 1fr); /* 2列 */
  }
}

@media (min-width: 1400px) {
  .contact-grid {
    grid-template-columns: repeat(3, 1fr); /* 3列 */
  }
}

@media (max-width: 768px) {
  .contact-page {
    width: 100%;
  }
}
</style>
