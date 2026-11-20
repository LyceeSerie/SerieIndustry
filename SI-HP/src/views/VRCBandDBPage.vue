<script setup lang="ts">
import '../styles/vrc-band-db-theme.css'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BandOptionalTags from '../components/BandOptionalTags.vue'
import BandTeamModal from '../components/BandTeamModal.vue'
import BandImage from '../components/BandImage.vue'
import BandMembers from '../components/BandMembers.vue'
import LinkIcon from '../components/LinkIcon.vue'
import guide from '../data/vrc-band-db-guide.json'
import brandIcon from '../assets/VBDLogo.png'
import { matchesBand, getSubgenreOptions } from '../band-filter.mjs'

type Image = { url: string; source: string } | null
type Band = { registrationSource?: 'admin' | 'form'; members?: { part: string; name: string; twitterId: string }[]; recruitingParts: string[]; attributes: string[]; logoLayout: string; activityStatus: string; activityLabel: string; id: string; name: string; reading: string; englishName: string; types: string[]; styles: string[]; platforms: string[]; genres: string[]; subgenres: string[]; comment: string; activeTime: string; logo: Image; icon: Image; photo: Image; links: { label: string; url: string }[] }
const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfgMHoncY1txjJ-91hAfnznOZAOqz_0hh2KkMLwf8qz0DvKeQ/viewform?usp=header'
const bands = ref<Band[]>([])
const loading = ref(true)
const error = ref('')
const updatedAt = ref('')
const isTest = import.meta.env.MODE === 'test'
const genres = computed(() => [...new Set(bands.value.flatMap(b => b.genres).filter(Boolean))])
const typeOptions = computed(() => [...new Set(bands.value.flatMap(b => b.types))])
const styleOptions = computed(() => [...new Set(bands.value.flatMap(b => b.styles))])
const platformOptions = computed(() => [...new Set(bands.value.flatMap(b => b.platforms))])
const recruitingPart = ref('')
const attributes = ref<string[]>([])
const recruitingOptions = computed(() => [...new Set(bands.value.flatMap(b => b.recruitingParts))])
const attributeOptions = computed(() => [...new Set(bands.value.flatMap(b => b.attributes))])
const attributeOpen = ref(false)
const attributePicker = ref<HTMLElement | null>(null)
function closeAttributesOutside(event: PointerEvent) { if (event.target instanceof Node && !attributePicker.value?.contains(event.target)) attributeOpen.value = false }
function closeAttributes(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) attributeOpen.value = false }
function toggleAttribute(value: string) { attributes.value = attributes.value.includes(value) ? attributes.value.filter(item => item !== value) : [...attributes.value, value] }
const query = ref('')
const type = ref('')
const style = ref('')
const platforms = ref<string[]>([])
const status = ref('')
const statusOptions = [{ value: '', label: 'すべて' }, { value: 'active', label: '活動中' }]
const genre = ref('')
const sub = ref('')
const genreMode = ref<'AND' | 'OR'>('AND')
const subgenreOptions = computed(() => getSubgenreOptions(bands.value, genre.value, genreMode.value))
watch(subgenreOptions, options => { if (sub.value && !options.includes(sub.value)) sub.value = '' })
const selected = ref<Band | null>(null)
const drawer = ref(false)
const results = computed(() => bands.value.filter(b => matchesBand(b, { recruitingParts: recruitingPart.value ? [recruitingPart.value] : [], attributes: attributes.value, query: query.value, status: status.value, type: type.value, style: style.value, platforms: platforms.value, genre: genre.value, sub: sub.value, genreMode: genreMode.value })))
function reset() { recruitingPart.value = ''; attributeOpen.value = false; attributes.value = []; genreMode.value = 'AND'; status.value = ''; query.value = ''; type.value = ''; style.value = ''; platforms.value = []; genre.value = ''; sub.value = '' }
function resetNameAndActivity() { query.value = ''; type.value = ''; style.value = '' }
function togglePlatform(value: string) { platforms.value = platforms.value.includes(value) ? platforms.value.filter(p => p !== value) : [...platforms.value, value] }
function select(band: Band) { selected.value = band; drawer.value = false }
async function load() {
  loading.value = true; error.value = ''
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/vrc-bands.json`, { cache: 'no-cache' })
    if (!response.ok) throw new Error('load failed')
    const data = await response.json()
    if (!Array.isArray(data.bands)) throw new Error('invalid data')
    bands.value = data.bands.map((band: Band) => ({ ...band, recruitingParts: band.recruitingParts || [], attributes: band.attributes || [] }))
    updatedAt.value = new Date(data.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    selected.value = null
  } catch { error.value = '登録情報を読み込めませんでした。時間をおいて再試行してください。' }
  finally { loading.value = false }
}
onMounted(() => { load(); document.addEventListener('pointerdown', closeAttributesOutside) })
onUnmounted(() => document.removeEventListener('pointerdown', closeAttributesOutside))
</script>

<template>
  <div class="band-db" @keydown.esc="drawer = false">
    <header class="db-header">
      <button class="mobile-toggle" :aria-expanded="drawer" aria-controls="db-navigation" aria-label="検索・一覧を開閉" @click="drawer = !drawer">☰</button>
      <button class="brand" @click="selected = null; drawer = false"><img class="brand-icon" :src="brandIcon" alt="" width="48" height="48"/><span class="brand-text">VRC BAND <span>DB.</span></span></button>
      <div class="header-actions"><BandTeamModal/>
      <a class="discord-button" href="https://discord.gg/8GYFcRJkbK" target="_blank" rel="noopener noreferrer">Discord</a>
      <a class="register" :href="formUrl" target="_blank" rel="noopener noreferrer">バンド登録</a></div>
    </header>
    <div class="notice" role="status"><strong v-if="isTest">テスト環境（架空データ）｜</strong><template v-if="loading">登録情報を読み込み中…</template><template v-else-if="error">{{ error }} <button @click="load">再試行</button></template><template v-else>登録情報の取込日時：{{ updatedAt }}（日本時間）</template></div>
    <button v-if="drawer" class="scrim" aria-label="検索・一覧を閉じる" @click="drawer = false"></button>
    <div class="workspace">
      <div id="db-navigation" class="navigation" :class="{ open: drawer }">
        <aside class="search-pane" aria-label="検索条件">
          <div class="pane-heading search-heading"><h2>検索</h2><button class="reset-all" @click="reset">すべてリセット</button><button class="close" aria-label="検索・一覧を閉じる" @click="drawer = false">×</button></div>
          <div class="field-heading"><label for="band-query">バンド名・活動名</label><button class="field-reset" aria-label="バンド名・活動名・活動形態・演奏区分をリセット" title="バンド名・活動名・活動形態・演奏区分をリセット" :disabled="!query && !type && !style" @click="resetNameAndActivity">↺</button></div>
          <input id="band-query" v-model="query" type="search" placeholder="名前で検索">
          <div class="activity-selects">
            <select v-model="type" aria-label="活動形態１"><option value="">すべての活動形態</option><option v-for="item in typeOptions" :key="item">{{ item }}</option></select>
            <select v-model="style" aria-label="活動形態２"><option value="">すべての演奏区分</option><option v-for="item in styleOptions" :key="item">{{ item }}</option></select>
          </div>
          <fieldset><legend class="field-heading"><span>活動状態</span><button class="field-reset" aria-label="活動状態をリセット" title="活動状態をリセット" :disabled="!status" @click="status = ''">↺</button></legend><div class="platform-toggles"><button v-for="item in statusOptions" :key="item.value" class="platform-toggle" :class="{ selected: status === item.value }" :aria-pressed="status === item.value" @click="status = status === item.value ? '' : item.value">{{ item.label }}</button></div></fieldset>
          <fieldset class="platform-field"><legend class="field-heading"><span>活動プラットフォーム</span><button class="field-reset" aria-label="活動プラットフォームをリセット" title="活動プラットフォームをリセット" :disabled="!platforms.length" @click="platforms = []">↺</button></legend><div class="platform-toggles"><button v-for="item in platformOptions" :key="item" class="platform-toggle" :class="{ selected: platforms.includes(item) }" :aria-pressed="platforms.includes(item)" @click="togglePlatform(item)">{{ item }}</button></div></fieldset>
          <div class="field-heading"><label for="band-recruiting">募集パート</label><button class="field-reset" aria-label="募集パートをリセット" :disabled="!recruitingPart" @click="recruitingPart = ''">↺</button></div>
          <select id="band-recruiting" v-model="recruitingPart"><option value="">すべて</option><option value="__none__">募集なし</option><option v-for="part in recruitingOptions" :key="part">{{ part }}</option></select>
          <div class="field-heading"><span id="attribute-label">属性</span><button class="field-reset" aria-label="属性をリセット" :disabled="!attributes.length" @click="attributes = []">↺</button></div>
          <div ref="attributePicker" class="attribute-picker" @keydown.esc.stop="attributeOpen = false" @focusout="closeAttributes">
            <button class="attribute-trigger" aria-labelledby="attribute-label attribute-value" aria-haspopup="true" :aria-expanded="attributeOpen" aria-controls="attribute-options" @click="attributeOpen = !attributeOpen"><span id="attribute-value">{{ attributes.length ? attributes.join('、') : 'すべて' }}</span><span aria-hidden="true">▾</span></button>
            <div v-if="attributeOpen" id="attribute-options" class="attribute-options" role="group" aria-label="属性（複数選択・OR）"><label v-for="item in attributeOptions" :key="item"><input type="checkbox" :checked="attributes.includes(item)" @change="toggleAttribute(item)">{{ item }}</label><p v-if="!attributeOptions.length" class="muted">登録された選択肢はありません。</p></div>
          </div>
          <section class="genre-search" aria-labelledby="genre-search-label">
            <div class="genre-search-heading"><span id="genre-search-label">ジャンル検索</span><div class="genre-mode" role="group" aria-label="ジャンル検索の条件"><button v-for="mode in (['AND', 'OR'] as const)" :key="mode" :aria-pressed="genreMode === mode" :class="{ selected: genreMode === mode }" @click="genreMode = mode">{{ mode }}</button></div></div>
            <div class="field-heading"><label for="band-genre">メインジャンル</label><button class="field-reset" aria-label="メインジャンルをリセット" title="メインジャンルをリセット" :disabled="!genre" @click="genre = ''">↺</button></div><select id="band-genre" v-model="genre"><option value="">すべて</option><option v-for="name in genres" :key="name">{{ name }}</option></select>
            <div class="field-heading"><label for="band-sub">サブジャンル</label><button class="field-reset" aria-label="サブジャンルをリセット" title="サブジャンルをリセット" :disabled="!sub" @click="sub = ''">↺</button></div><select id="band-sub" v-model="sub"><option value="">すべて</option><option v-for="item in subgenreOptions" :key="item">{{ item }}</option></select>
          </section>

        </aside>
        <section class="list-pane" aria-label="バンド一覧">
          <div class="pane-heading"><h2>バンド一覧</h2><span aria-live="polite">{{ results.length }} 件</span></div>
          <button v-for="band in results" :key="band.id" class="band-row" :class="{ active: selected === band }" :aria-pressed="selected === band" @click="select(band)"><BandImage compact class="list-image" :image="band.icon || band.logo" :alt="`${band.name}のアイコン`"/><span class="list-band-heading"><span v-if="band.registrationSource === 'admin'" class="registration-source">運営登録</span><strong>{{ band.name }}</strong></span></button>
          <p v-if="!loading && !error && !results.length" class="muted">{{ bands.length ? '条件に合うバンドがありません。検索条件を変更してください。' : '登録情報はまだありません。' }}</p>
        </section>
      </div>
      <main class="detail">
        <template v-if="!selected">
          <div class="db-logo" aria-label="VRC Band DB">VRC<br>BAND <span>DB.</span></div>
          <h1>{{ guide.title }}</h1>
          <ol class="instructions"><li v-for="(item, index) in guide.items" :key="index">{{ item.text }}<p v-for="(detail, detailIndex) in item.details" :key="detailIndex" class="instruction-detail">{{ detail }}</p></li></ol>
        </template>
        <article v-else>
          <div class="profile-heading"><span v-if="selected.icon || selected.registrationSource === 'admin'" class="registration-avatar profile-avatar"><BandImage compact class="profile-icon" :image="selected.icon" alt="アイコン"/><span v-if="selected.registrationSource === 'admin'" class="registration-source">運営登録</span></span><div><p class="reading">{{ selected.reading }}</p><h1>{{ selected.name }}</h1><p v-if="selected.englishName" class="english-name">{{ selected.englishName }}</p></div></div>
          <BandImage v-if="selected.logo && (!selected.logoLayout || selected.logoLayout === 'separate' || !selected.photo)" class="separate-logo" :image="selected.logo" alt="バンドロゴ"/>
          <div v-if="selected.photo" class="artist-visual">
            <BandImage class="profile-photo" :image="selected.photo" alt="アー写"/>
            <BandImage v-if="selected.logo && selected.logoLayout && selected.logoLayout !== 'separate'" compact class="overlay-logo" :class="selected.logoLayout" :image="selected.logo" alt="バンドロゴ"/>
          </div>
          <template v-if="selected.activeTime"><h2>活動時間帯</h2><p class="comment">{{ selected.activeTime }}</p></template>
          <template v-if="selected.comment"><h2>コメント</h2><p class="comment">{{ selected.comment }}</p></template>
          <BandMembers :members="selected.members"/>
          <h2 v-if="selected.genres.length || selected.subgenres.length || selected.types.length || selected.styles.length || selected.platforms.length || selected.activityLabel || selected.attributes.length">タグ</h2>
          <div v-if="selected.genres.length || selected.subgenres.length" class="chips genre-chips" role="group" aria-label="ジャンル"><span v-for="(tag, i) in [...selected.genres, ...selected.subgenres].filter(Boolean)" :key="i">{{ tag }}</span></div>
          <div v-if="selected.types.length || selected.styles.length || selected.platforms.length || selected.activityLabel" class="chips" role="group" aria-label="活動形態・プラットフォーム"><span v-for="(tag, i) in [...selected.types, ...selected.styles, ...selected.platforms, selected.activityLabel].filter(Boolean)" :key="i">{{ tag }}</span></div>
          <BandOptionalTags title="属性" :show-heading="false" :tags="selected.attributes"/>
          <BandOptionalTags title="募集メンバー" :tags="selected.recruitingParts"/>
          <template v-if="selected.links.length"><h2>リンク</h2><div class="links"><a v-for="(link, i) in selected.links" :key="i" :href="link.url" target="_blank" rel="noopener noreferrer"><LinkIcon :url="link.url"/>{{ link.label }} ↗</a></div></template>
        </article>
      </main>
    </div>
  </div>
</template>

<style scoped>
.registration-avatar{position:relative;display:block;flex-shrink:0}.list-band-heading{min-width:0}.list-band-heading .registration-source{position:static;display:table;margin-bottom:5px;padding:2px 8px;font-size:11px}.profile-avatar{width:76px;height:76px}.registration-source{position:absolute;top:0;left:0;z-index:1;background:var(--db-primary);color:var(--db-surface-white);border-radius:3px;padding:2px 3px;font-size:10px;line-height:1.4;font-weight:bold;white-space:nowrap}
.band-db .brand,.db-logo{color:var(--db-logo-color)}
.brand .brand-text{color:var(--db-logo-color)}
.brand-text span,.db-logo span{color:var(--db-logo-accent)}
.brand{display:inline-flex;align-items:center;gap:10px;white-space:nowrap}.brand-icon{width:48px;height:48px;object-fit:contain;flex-shrink:0}
.discord-button{display:inline-flex;align-items:center;background:var(--db-surface-muted);color:var(--db-text);border:1px solid var(--db-border-control);border-radius:5px;padding:10px 12px;font-size:12px;text-decoration:none;white-space:nowrap}.discord-button:hover{background:var(--db-control-hover)}
@media(max-width:760px){.brand-icon{width:36px;height:36px}.brand{gap:7px}.header-actions{flex-wrap:wrap}.discord-button{font-size:10px;padding:9px}}
.instruction-detail{margin:10px 0;line-height:1.9}
.header-actions{display:flex;align-items:center;gap:10px;margin-left:auto}@media(max-width:760px){.header-actions{gap:6px}}
.attribute-picker{position:relative}.band-db .attribute-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:11px 9px;background:var(--db-surface-white);border:1px solid var(--db-border-input);text-align:left;font-size:12px}.attribute-trigger span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attribute-options{position:absolute;top:100%;left:0;right:0;z-index:12;max-height:260px;overflow:auto;padding:10px;background:var(--db-surface-white);border:1px solid var(--db-border-input);border-radius:5px;box-shadow:0 4px 12px var(--db-dropdown-shadow)}.attribute-options label{display:flex;gap:8px;align-items:center;font-size:12px;padding:7px 0}.attribute-options input{accent-color:var(--db-primary)}

.search-heading{gap:8px}.band-db .search-heading .reset-all{width:auto;margin:0 0 0 auto;padding:5px 8px;font-size:10px;white-space:nowrap}@media(max-width:760px){.search-heading{padding-right:32px}}
.band-db .reset-all{width:100%;padding:9px 12px;border:1px solid var(--db-border-reset);background:var(--db-surface-muted);font-size:12px;margin:24px 0 0}.field-heading{display:flex!important;align-items:center;justify-content:space-between;gap:5px;width:100%;font-size:12px;font-weight:bold;margin:14px 0 8px}.field-heading label{margin:0!important}.field-control{display:flex;align-items:center;gap:6px}.field-control select{min-width:0;flex:1}.band-db .field-reset{display:inline-flex;align-items:center;justify-content:center;flex:0 0 26px;width:26px;height:26px;padding:0;border:0;background:transparent;font-size:18px;color:var(--db-text-control)}.band-db .field-reset:disabled{opacity:.25;cursor:default}.band-db .field-reset:not(:disabled):hover{background:var(--db-control-hover)}.genre-search-heading{gap:4px!important}.genre-search-heading>span{white-space:nowrap}.genre-mode{margin-left:auto}
.genre-search{margin-top:24px}.genre-search-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:bold}.genre-search label{display:block;font-size:12px;font-weight:bold;margin:16px 0 9px}.genre-mode{display:flex;gap:3px}.band-db .genre-mode button{padding:4px 7px;font-size:10px;border:1px solid var(--db-border-control);background:var(--db-surface-white)}.band-db .genre-mode button.selected{background:var(--db-primary);border-color:var(--db-primary);color:var(--db-surface-white)}
.separate-logo{width:min(100%,300px);height:160px;margin:24px 0;background:transparent;align-items:flex-start}.separate-logo :deep(img){object-position:top left}
.links a{display:inline-flex;align-items:center;gap:8px}
.activity-selects{display:grid;gap:12px;margin-top:10px}.platform-toggles{display:flex;flex-wrap:wrap;gap:8px}.band-db .platform-toggle{border:1px solid var(--db-border-control);background:var(--db-surface-white);padding:7px 12px;border-radius:20px;font-size:12px}.band-db .platform-toggle.selected{background:var(--db-primary);border-color:var(--db-primary);color:var(--db-surface-white)}
.genre-chips{margin-top:10px!important}
.artist-visual{position:relative;isolation:isolate;margin:28px 0;aspect-ratio:16/9;background:var(--db-image-background);border-radius:8px;overflow:hidden}.artist-visual .profile-photo{width:100%;height:100%;min-height:0;max-height:none;margin:0}.artist-visual .profile-photo :deep(img){width:100%;height:100%;object-fit:contain}.artist-visual .overlay-logo{position:absolute;top:16px;left:16px;z-index:1;width:clamp(100px,30%,220px);height:40%;min-height:0;background:transparent;filter:drop-shadow(0 1px 3px var(--db-logo-shadow))}.artist-visual .overlay-logo :deep(img){object-position:top left}@media(max-width:760px){.artist-visual .overlay-logo{top:10px;left:10px;width:30%}}
.list-image{width:48px;height:48px;flex-shrink:0;border-radius:5px}.profile-icon{width:76px;height:76px;flex-shrink:0;border-radius:8px}.profile-logo{max-width:100%;height:180px;margin:26px 0;background:transparent}.profile-photo{width:100%;min-height:180px;max-height:500px;margin:28px 0}.reading,.english-name{font-size:12px;color:var(--db-text-reading);margin:0 0 8px}.chips{margin-top:20px}.comment{white-space:pre-wrap;overflow-wrap:anywhere}.links a{border:1px solid var(--db-border-link);padding:10px 16px;border-radius:4px;color:var(--db-link);font-size:12px}.band-row strong{overflow-wrap:anywhere}
.band-db{width:100%;min-height:100dvh;background:var(--db-background);color:var(--db-text);font-family:Arial,'Yu Gothic',sans-serif;line-height:1.6;color-scheme:light}.band-db *{box-sizing:border-box}.band-db button,.band-db input,.band-db select{font:inherit;color:inherit}.band-db button{cursor:pointer;border-radius:5px;background:transparent}.band-db button:focus-visible,.band-db a:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:3px}.db-header{min-height:88px;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid var(--db-border-divider);background:var(--db-header-background)}.brand{font-weight:900!important;font-size:24px!important;letter-spacing:-1px;border:0;padding:0!important}.register{background:var(--db-primary);color:var(--db-surface-white);border-radius:5px;padding:12px 18px;font-size:12px;text-decoration:none;white-space:nowrap}.register:hover{color:var(--db-surface-white);background:var(--db-primary-hover)}.notice{padding:9px 32px;background:var(--db-notice-background);color:var(--db-notice-text);font-size:11px}.workspace{display:grid;grid-template-columns:500px minmax(0,1fr);min-height:calc(100dvh - 124px)}.navigation{display:grid;grid-template-columns:240px 260px}.search-pane{padding:28px 24px;background:var(--db-surface);border-right:1px solid var(--db-border-divider)}.pane-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px}.pane-heading h2{margin:0;font-size:17px}.pane-heading>span{font-size:11px;color:var(--db-text-count)}.search-pane>label,legend{display:block;font-size:12px;font-weight:bold;margin:22px 0 9px}.band-db input[type=search],.band-db select{width:100%;padding:11px 9px;background:var(--db-surface-white);border:1px solid var(--db-border-input);border-radius:5px;font-size:12px}.band-db select:disabled{opacity:.5}.band-db fieldset{border:0;padding:0;margin:20px 0}.band-db legend{margin:0 0 8px}.check{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12px}.check input{accent-color:var(--db-primary)}.band-db .reset{margin-top:28px;border:0;border-bottom:1px solid var(--db-border-reset-line);border-radius:0;padding:0 0 5px;font-size:11px;color:var(--db-text-muted)}.list-pane{background:var(--db-surface-muted);padding:28px 16px;border-right:1px solid var(--db-border-divider)}.list-pane .pane-heading{padding:0 8px}.band-db .band-row{display:flex;align-items:center;gap:12px;padding:17px 10px;width:100%;text-align:left;border:1px solid transparent;border-bottom-color:var(--db-border-row)}.band-row strong{font-size:13px}.band-db .band-row:hover,.band-db .band-row.active{background:var(--db-surface-white);border-color:var(--db-border-input)}.band-row.active{box-shadow:inset 3px 0 var(--db-selection-indicator)}.mark{display:grid;place-items:center;flex-shrink:0;width:42px;height:42px;background:var(--db-avatar-background);border-radius:50%;color:var(--db-surface-white);font-size:13px;font-weight:bold}.detail{min-width:0;padding:55px 48px}.db-logo{font-size:clamp(54px,6vw,90px);font-weight:900;line-height:.95;letter-spacing:-4px;margin:30px 0 48px}.detail h1{font-size:24px;line-height:1.3;color:var(--db-text);margin:0 0 20px}.instructions{padding-left:22px;font-size:13px;color:var(--db-text-secondary);max-width:600px}.instructions li{margin:18px 0;padding-left:4px}.profile-heading{display:flex;gap:20px;align-items:center}.profile-heading h1{font-size:clamp(25px,3vw,44px);margin:0 0 14px}.large{width:76px;height:76px;font-size:24px}.chips{display:flex;gap:7px;flex-wrap:wrap}.chips :deep(span){font-size:11px;border:1px solid var(--db-border-control);border-radius:20px;padding:4px 10px}.photo-placeholder{min-height:230px;margin:32px 0;background:repeating-linear-gradient(135deg,var(--db-placeholder-stripe),var(--db-placeholder-stripe) 16px,var(--db-placeholder-stripe-alt) 16px,var(--db-placeholder-stripe-alt) 32px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--db-text-placeholder);font-size:16px;border-radius:5px}.photo-placeholder span{font-size:11px;margin-top:8px}.detail :deep(h2){font-size:13px;margin:28px 0 12px}.comment{font-size:14px;line-height:1.9}.links{display:flex;flex-wrap:wrap;gap:10px}.links > span{border:1px solid var(--db-border-link);padding:10px 16px;border-radius:4px;color:var(--db-text-disabled-link);font-size:12px}.muted{font-size:11px;line-height:1.9;color:var(--db-text-notice);margin-top:24px}.mobile-toggle,.close,.scrim{display:none}
@media(min-width:1500px){.workspace{grid-template-columns:560px minmax(0,1fr)}.navigation{grid-template-columns:260px 300px}.detail{padding:65px 70px}}
@media(min-width:761px) and (max-width:1050px){.workspace{grid-template-columns:410px minmax(0,1fr)}.navigation{grid-template-columns:195px 215px}.search-pane{padding:28px 16px}.detail{padding:40px 25px}.profile-heading{flex-wrap:wrap}}
@media(max-width:760px){.db-header{min-height:76px;padding:15px;gap:10px;flex-wrap:wrap}.brand{font-size:19px!important}.register{font-size:10px;padding:10px}.band-db .mobile-toggle{display:block;border:1px solid var(--db-border-control);padding:7px 10px;font-size:14px}.mobile-toggle span{font-size:10px}.notice{padding:9px 18px}.workspace{display:block;min-height:calc(100dvh - 125px)}.navigation{display:none}.navigation.open{display:flex;flex-direction:column;position:fixed;inset:0 auto 0 0;width:min(88vw,360px);z-index:11;background:var(--db-surface);overflow:auto}.search-pane{padding:22px;flex-shrink:0}.list-pane{padding:22px;flex:1}.band-db .close{display:block;font-size:22px;border:0;padding:0 8px}.pane-heading{margin-bottom:15px}.search-pane>label{margin-top:15px}.check{display:inline-flex;margin:7px 8px 0 0}.band-db fieldset{margin:18px 0}.band-db .reset{margin-top:20px}.band-db .scrim{display:block;position:fixed;inset:0;width:100%;height:100%;background:var(--db-drawer-backdrop);border:0;border-radius:0;z-index:10}.detail{padding:30px 24px}.db-logo{font-size:70px;margin:25px 0 40px}.profile-heading{gap:14px;flex-wrap:wrap}.large{width:60px;height:60px;font-size:20px}.photo-placeholder{min-height:200px}}
.artist-visual .overlay-logo.top-right{left:auto;right:16px}.artist-visual .overlay-logo.bottom-left{top:auto;bottom:16px}.artist-visual .overlay-logo.bottom-right{top:auto;left:auto;right:16px;bottom:16px}.overlay-logo.top-right :deep(img){object-position:top right}.overlay-logo.bottom-left :deep(img){object-position:bottom left}.overlay-logo.bottom-right :deep(img){object-position:bottom right}@media(max-width:760px){.artist-visual .overlay-logo.top-right{right:10px}.artist-visual .overlay-logo.bottom-left{bottom:10px}.artist-visual .overlay-logo.bottom-right{right:10px;bottom:10px}}
</style>
