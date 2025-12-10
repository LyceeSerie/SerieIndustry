<template>
  <div class="tweet-container">
    <div v-for="(tweet, i) in tweets" :key="i">
      <h2>{{ tweet.title }}</h2>
      <div v-html="tweet.html"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const tweets = [
  {
    title: "Vket2025Winter SUZUKIブース　プロップ制作",
    html: `<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">【お仕事告知】<br>現在開催中の <a href="https://twitter.com/hashtag/Vket2025Winter?src=hash&amp;ref_src=twsrc%5Etfw">#Vket2025Winter</a> にてSUZUKI企業ブースで展示されている以下３点を製作させていただきました！<br>・SUZU-RIDE<br>・SUZU-RIDE2<br>・SUZU-CARGO<br>パラリアルシンガポールに展示されてます！ <a href="https://t.co/CX5IPup3LD">pic.twitter.com/CX5IPup3LD</a></p>&mdash; 芹井りせ/芹井産業 (@zerry_furai) <a href="https://twitter.com/zerry_furai/status/1997215920125890946?ref_src=twsrc%5Etfw">December 6, 2025</a></blockquote>`
  },
  {
    title: "Vket2023Summer Canonブース　プロップ制作",
    html: `<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">【お仕事報告】<a href="https://twitter.com/hashtag/Vket2023Summer?src=hash&amp;ref_src=twsrc%5Etfw">#Vket2023Summer</a> パラリアルラスベガス Canonブースで展示されている、カメラとレンズ５種のモデルを制作しました！<br>Canonブースは猫カフェのVR動画が最高なので見に行くべきです。 <a href="https://t.co/rWvrLxgNjJ">pic.twitter.com/rWvrLxgNjJ</a></p>&mdash; 芹井りせ/芹井産業 (@zerry_furai) <a href="https://twitter.com/zerry_furai/status/1680427035720577026?ref_src=twsrc%5Etfw">July 16, 2023</a></blockquote>`
  },
  {
    title: "Vket2022Winter YAMAHAブース　プロップ制作",
    html: `<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">【お仕事告知】<br>現在開催中の <a href="https://twitter.com/hashtag/Vket2022Winter?src=hash&amp;ref_src=twsrc%5Etfw">#Vket2022Winter</a> にてYAMAHA企業ブースで展示されている、以下４点の楽器を製作させていただきました！<br>・RevStar[YAMAHA]<br>・BBP34[YAMAHA]<br>・CATALYST200[LINE6]<br>・SVT-CL,SVT-410HLF[Ampeg]<br><br>ぜひ細部まで見てみてください！ <a href="https://t.co/9wtHgovoPp">pic.twitter.com/9wtHgovoPp</a></p>&mdash; 芹井りせ/芹井産業 (@zerry_furai) <a href="https://twitter.com/zerry_furai/status/1599378980364509185?ref_src=twsrc%5Etfw">December 4, 2022</a></blockquote>`
  },
]

onMounted(() => {
  if (!(window.twttr && window.twttr.widgets)) {
    const script = document.createElement('script')
    script.src = "https://platform.twitter.com/widgets.js"
    script.async = true
    script.charset = "utf-8"
    document.body.appendChild(script)
  } else {
    window.twttr.widgets.load()
  }
})
</script>

<style lang="css" scoped>
h2{
  color: #000;
  padding: 30px 0 0 0;
}

.tweet-container {
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  width: 100%;
}

/* Chrome, Edge, Safari */
.tweet-container::-webkit-scrollbar {
  display: none;
}
</style>