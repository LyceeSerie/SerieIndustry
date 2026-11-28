<script setup lang="ts">
import { t } from '../i18n/ui-text.mjs';
import UiIcon from '../components/UiIcon.vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { editor as C, readingKey, namedKeys, imageKeys, labels, sections } from '../registration/schema';
import terms from 'virtual:registration-terms';
import LiveEventEditor from '../components/LiveEventEditor.vue';
import BandImage from '../components/BandImage.vue';
import BandVisual from '../components/BandVisual.vue';
import BandVideo from '../components/BandVideo.vue';
import FileUploadButton from '../components/FileUploadButton.vue';
import ImageCropDialog from '../components/ImageCropDialog.vue';
import { bandImage, logoLayout, validReading, validEnglish } from '../band-media.mjs';
import { useBandOwnership } from '../registration/use-band-ownership';
import { useImageUpload } from '../registration/use-image-upload';
import { usePortalClient } from '../registration/use-portal-client';
import { hasDuplicateSavedBand, makeDraft, outputDraft, serializeDraft } from '../registration/drafts';
import type { Band, Draft, Me, PreviewWindow } from '../registration/types';
const preview = window as PreviewWindow;
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) && !!preview.VBD_PREVIEW_API;
const drafts = ref<Draft[]>([]);
const active = ref(0);
const admin = ref(false);
const loaded = ref(false);
const busy = ref(false);
const dirty = ref(false);
const notice = ref('');
const error = ref(false);
const consentRequired = ref(true);
const accepted = ref(false);
const current = computed(() => drafts.value[active.value]);
const canManage = ref(false);
const requestedMode = ref(sessionStorage.getItem('vbd-portal-mode') === 'user' ? 'user' : 'admin');
const { api, csrf, roleBlockedUntil, roleLimitMessage } = usePortalClient(local ? preview.VBD_PREVIEW_API : undefined);
async function openPersonalMode() {
    if (busy.value)
        return;
    if (dirty.value && !confirm('未保存の入力があります。破棄して個人用に切り替えますか？'))
        return;
    busy.value = true;
    const previous = requestedMode.value;
    requestedMode.value = 'user';
    try {
        if (await load())
            sessionStorage.setItem('vbd-portal-mode', 'user');
        else
            requestedMode.value = previous;
    }
    finally {
        busy.value = false;
    }
}
const editorTab = ref('band');
const eventsEnabled = ref(false);
const loggingOut = ref(false);
const loginId = ref('');
const { ownerInput, ownerSearch, registeredUsers, matchingUsers, validOwner, ownerLabel, transferOwnership } = useBandOwnership({
    current, admin, busy, dirty, local, api, message
});
function sourceLabel(draft: Draft) {
    return !draft.id ? '運営登録予定' : ({
        admin: '運営登録', user: '本人登録', form: 'フォーム登録'
    }[draft.registrationSource || 'form'] || '登録元不明');
}
const draftMenu = ref<{
    draft: Draft;
    x: number;
    y: number;
} | null>(null);
const menuElement = ref<HTMLElement>();
const readingWarning = computed(() => !!current.value && !validReading(current.value.band[readingKey]));
const englishWarning = computed(() => !!current.value && !validEnglish(current.value.band['活動名（英語）']));
const fieldWarning = (key: string) => key === readingKey && readingWarning.value ? 'ひらがなで入力してください。' : key === '活動名（英語）' && englishWarning.value ? '英語で入力してください。' : '';
const requiredFields = computed(() => admin.value ? ['活動名'] : C.required);
let serverVersion = '';
const limits = ref<Me['limits']>({});
const baselines = new WeakMap<object, string>();
const draftText = (draft: Draft) => JSON.stringify([draft.band, draft.tags, draft.extras, draft.members, draft.links]);
function refreshDirty() {
    dirty.value = drafts.value.some(draft => baselines.get(draft) !== draftText(draft));
}
function output(draft: Draft): Band {
    if (local && preview.VBD_PREVIEW_OUTPUT)
        return preview.VBD_PREVIEW_OUTPUT(C, serializeDraft(draft), { admin: admin.value });
    return outputDraft(draft, admin.value);
}
function message(text: string, isError = false) {
    notice.value = text;
    error.value = isError;
}
async function load() {
    try {
        const data: Me = await api('/api/me?mode=' + requestedMode.value);
        csrf.value = data.csrf;
        limits.value = data.limits;
        eventsEnabled.value = local || data.eventsEnabled === true;
        admin.value = data.role === 'admin';
        canManage.value = data.canManage === true;
        loginId.value = data.userId || '';
        registeredUsers.value = data.users || [];
        serverVersion = data.termsVersion || terms.version;
        consentRequired.value = data.consentRequired === true;
        drafts.value = data.records.length ? data.records.map(record => makeDraft(record.band, record)) : [makeDraft({})];
        drafts.value.forEach(draft => baselines.set(draft, draftText(draft)));
        active.value = 0;
        ownerInput.value = '';
        loaded.value = true;
        dirty.value = false;
        document.title = `VRC Band DB｜${admin.value ? 'バンド管理' : 'バンド登録・編集'}`;
        message(consentRequired.value ? '初回登録の前に、同意事項をご確認ください。' : '');
        return true;
    }
    catch (e) {
        message((e as Error).message, true);
        return false;
    }
}
async function switchMode(mode: string) {
    if (!canManage.value || busy.value || mode === (admin.value ? 'admin' : 'user'))
        return;
    if (dirty.value && !confirm('未保存の入力があります。破棄してモードを切り替えますか？'))
        return;
    const previous = requestedMode.value;
    busy.value = true;
    requestedMode.value = mode;
    closeDraftMenu();
    try {
        if (await load())
            sessionStorage.setItem('vbd-portal-mode', mode);
        else
            requestedMode.value = previous;
    }
    finally {
        busy.value = false;
    }
}
async function consent() {
    if (!accepted.value || busy.value)
        return;
    busy.value = true;
    try {
        if (serverVersion !== terms.version)
            throw Error('同意事項が更新されています。再読み込みしてください。');
        await api('/api/consent', {
            accepted: true, version: terms.version
        });
        await load();
    }
    catch (e) {
        message((e as Error).message, true);
    }
    finally {
        busy.value = false;
    }
}
async function save() {
    if (busy.value || !current.value)
        return;
    busy.value = true;
    message('保存しています…');
    try {
        const draft = current.value;
        const band = output(draft);
        if(admin.value&&!draft.id&&hasDuplicateSavedBand(band['活動名']||'',drafts.value))throw Error(t('registration.errors.DUPLICATE_BAND_NAME'));
        const hash = JSON.stringify(band);
        if (hash !== draft.hash) {
            draft.hash = hash;
            draft.submissionId = crypto.randomUUID();
        }
        const saved = await api('/api/save', {
            mode: admin.value ? 'admin' : 'user', registrationId: draft.id, revision: draft.revision, submissionId: draft.submissionId, band
        });
        draft.id = saved.id;
        draft.revision = saved.revision;
        draft.status = saved.status;
        draft.registrationSource = saved.registrationSource;
        baselines.set(draft, draftText(draft));
        refreshDirty();
        message(local ? 'このブラウザ内に保存しました。公開データへの送信は行っていません。' : '保存しました。承認後に公開されます。');
    }
    catch (e) {
        message((e as Error).message, true);
    }
    finally {
        busy.value = false;
    }
}
const { cropUpload, cancelCrop, upload, uploadCropped } = useImageUpload({
    current, admin, busy, limits, api, message, closeDraftMenu
});
const media = computed(() => ({
    photo: bandImage(current.value?.band['アー写'], { localPreview: local }), logo: bandImage(current.value?.band['ロゴ'], { localPreview: local }), icon: bandImage(current.value?.band['アイコン'], { localPreview: local }), layout: logoLayout(current.value?.band['ロゴ配置位置'])
}));
const videoId = computed(() => C.videoId(current.value?.band['YouTube動画URL'] || ''));
function addBand() {
    if (busy.value)
        return;
    const blank = drafts.value.findIndex(draft => !draft.id && draftText(draft) === draftText(makeDraft({})));
    if (blank >= 0) {
        active.value = blank;
        message('未入力の新規バンドを表示しました。');
        return;
    }
    if (!admin.value && drafts.value.length >= 10)
        return;
    drafts.value.push(makeDraft({}));
    active.value = drafts.value.length - 1;
}
function removeFromList(draft: Draft) {
    const index = drafts.value.indexOf(draft);
    if (index < 0)
        return;
    const selected = current.value;
    drafts.value.splice(index, 1);
    if (!drafts.value.length) {
        drafts.value.push(makeDraft({}));
        baselines.set(drafts.value[0]!, draftText(drafts.value[0]!));
    }
    const retained = selected && drafts.value.indexOf(selected);
    active.value = retained !== undefined && retained >= 0 ? retained : Math.min(index, drafts.value.length - 1);
    refreshDirty();
}
function removeUnsaved(draft: Draft) {
    draftMenu.value = null;
    if (busy.value || draft.id)
        return;
    if (draftText(draft) !== draftText(makeDraft({})) && !confirm(`未登録の「${draft.band['活動名'] || '新規バンド'}」を削除しますか？入力内容は失われます。`))
        return;
    removeFromList(draft);
    message('未登録のバンドを一覧から削除しました。');
}
function openDraftMenu(event: MouseEvent | KeyboardEvent, draft: Draft) {
    if (draft.id || busy.value)
        return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    draftMenu.value = {
        draft, x: Math.max(8, Math.min(('clientX' in event && event.clientX) || rect.left, innerWidth - 230)), y: Math.max(8, Math.min(('clientY' in event && event.clientY) || rect.bottom, innerHeight - 65))
    };
    void nextTick(() => menuElement.value?.querySelector('button')?.focus());
}
function closeDraftMenu() {
    draftMenu.value = null;
}
function menuKey(event: KeyboardEvent) {
    if (event.key === 'Escape')
        closeDraftMenu();
}
async function importBands(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !admin.value || busy.value)
        return;
    busy.value = true;
    try {
        if (file.size > 65536)
            throw Error('64KiB以内のJSONを選んでください。');
        const added = C.parseImport(await file.text()).map(band => makeDraft(band));
        const start = drafts.value.length;
        drafts.value.push(...added);
        active.value = start;
        message(`${added.length}件を新規バンドとして読み込みました。内容を確認し、各バンドで「登録・変更を保存」を押してください。`);
    }
    catch (e) {
        message('読み込み失敗：' + (e as Error).message, true);
    }
    finally {
        busy.value = false;
        input.value = '';
    }
}
async function deleteBand() {
    const draft = current.value;
    if (!admin.value || busy.value || !draft)
        return;
    const text = draft.id ? '掲載を削除します。履歴は保持され、Discordの /band-restore から復元できます。' : '未保存の入力を削除します。';
    if (!confirm(`「${draft.band['活動名'] || '新規バンド'}」を削除しますか？\n${text}`))
        return;
    busy.value = true;
    try {
        if (draft.id)
            await api('/api/delete', {
                mode: 'admin', registrationId: draft.id, revision: draft.revision, requestId: crypto.randomUUID()
            });
        removeFromList(draft);
        message(draft.id ? (local ? 'テスト用の登録を削除しました。' : '掲載削除を保存しました。サイトへの反映は更新処理後です。') : '未保存の入力を削除しました。');
    }
    catch (e) {
        message((e as Error).message, true);
    }
    finally {
        busy.value = false;
    }
}
async function logout() {
    if (busy.value || loggingOut.value)
        return;
    if (dirty.value && !confirm('未保存の入力があります。ログアウトしますか？'))
        return;
    loggingOut.value = true;
    busy.value = true;
    closeDraftMenu();
    try {
        await api('/api/logout', {});
        dirty.value = false;
        location.href = '/auth/logged-out';
    }
    catch (e) {
        loggingOut.value = false;
        busy.value = false;
        message((e as Error).message, true);
    }
}
function unload(event: BeforeUnloadEvent) {
    if (dirty.value) {
        event.preventDefault();
        event.returnValue = '';
    }
}
watch(drafts, () => {
    if (loaded.value)
        refreshDirty();
}, {
    deep: true, flush: 'sync'
});
watch(active, () => {
    ownerInput.value = '';
});
onMounted(() => {
    void load();
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pointerdown', closeDraftMenu);
    window.addEventListener('keydown', menuKey);
    window.addEventListener('resize', closeDraftMenu);
});
onUnmounted(() => {
    window.removeEventListener('beforeunload', unload);
    window.removeEventListener('pointerdown', closeDraftMenu);
    window.removeEventListener('keydown', menuKey);
    window.removeEventListener('resize', closeDraftMenu);
});
</script>

<template>
  <div class="registration band-db" :aria-busy="loggingOut">
    <div v-if="loggingOut" class="logout-overlay" role="status" aria-live="polite"><p>ログアウトしています…</p></div>
    <ImageCropDialog v-if="cropUpload" :file="cropUpload.file" :label="cropUpload.key" :limit="cropUpload.limit" @cancel="cancelCrop" @confirm="uploadCropped"/>
    <div :inert="loggingOut">
    <header><h1>VRC Band DB｜{{ admin?'バンド管理':'バンド登録・編集' }}</h1><span class="mode">{{ admin?'管理用':canManage?'個人用':'通常用' }}</span>
      <div v-if="canManage" class="mode-switch" role="group" aria-label="利用モード"><button type="button" :aria-pressed="admin" :disabled="busy||roleBlockedUntil>0" @click="switchMode('admin')">{{ t('registration.adminMode') }}</button><button type="button" :aria-pressed="!admin" :disabled="busy" @click="switchMode('user')">{{ t('registration.personalMode') }}</button></div>
      <p>{{ admin?'登録済みバンドの編集と運営登録ができます。':'自分のバンドを登録・編集できます。' }}変更は承認後に公開されます。</p>
      <p class="privacy-link">ログイン状態の維持と安全な操作のためにCookieを使用します。<br><a :href="local?'/#/privacy':'https://serieindustry.com/#/privacy'" target="_blank" rel="noopener noreferrer">プライバシー・外部送信について（別タブ）</a></p>
      <p><span class="required" aria-hidden="true">*</span> は必須項目です。</p><button type="button" :disabled="busy" @click="logout">{{ loggingOut?'ログアウト中…':'ログアウト' }}</button>
      <div v-if="roleBlockedUntil>0" class="role-limit" role="status"><p>{{ roleLimitMessage }}</p><button v-if="requestedMode!=='user'" type="button" :disabled="busy" @click="openPersonalMode">{{ t('registration.openPersonal') }}</button></div>
      <p v-if="!loaded||consentRequired" role="status" aria-live="polite" :class="{error}">{{ notice }}</p>
    </header>
    <p v-if="!loaded" class="loading">{{ roleBlockedUntil>0?'管理権限の確認を停止しています。「個人用で開く」から続けられます。':error?'読み込みに失敗しました。上のメッセージを確認してください。':'読み込み中です。' }}</p>
    <section v-else-if="consentRequired" class="consent card" aria-labelledby="consent-title">
      <h2 id="consent-title">{{ terms.title }}</h2><p>{{ terms.introduction }}</p><ol><li v-for="clause in terms.clauses" :key="clause">{{ clause }}</li></ol>
      <label><input v-model="accepted" type="checkbox" :disabled="busy"> 上記の内容を確認し、誓約・同意します。</label>
      <button class="primary" :disabled="!accepted||busy" @click="consent">同意して登録画面へ進む</button>
    </section>
    <main v-else-if="current">
      <aside class="card"><h2>{{ admin?'登録済みバンド':'自分のバンド' }}（{{ drafts.length }}）</h2>
        <ol><li v-for="(draft,index) in drafts" :key="draft.id||index" class="draft-row" @contextmenu="openDraftMenu($event,draft)">
          <button class="draft-select" :aria-current="active===index" :disabled="busy" @click="active=index" @keydown.shift.f10.prevent="openDraftMenu($event,draft)">{{ draft.band['活動名']||'新規バンド' }}<span v-if="admin" class="source-badge" :class="{managed:draft.registrationSource==='admin'||!draft.id}">{{ sourceLabel(draft) }}</span><span v-if="!draft.id" class="draft-status">{{ t('common.unregistered') }}</span></button>
          <button v-if="!draft.id" class="draft-remove" type="button" :disabled="busy" :aria-label="`未登録の${draft.band['活動名']||'新規バンド'}を削除`" title="未登録のバンドを削除" @click="removeUnsaved(draft)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
        </li></ol>
        <button :disabled="busy||(!admin&&drafts.length>=10)" @click="addBand">＋ バンド追加</button><FileUploadButton v-if="admin" class="import-label" label="JSONを読み込む" accept=".json,application/json" :disabled="busy" @change="importBands"/><p v-if="admin" class="hint">1〜20件・64KiB以内。読み込み後、各バンドを保存してください。</p>
      </aside>
      <div class="editor-column"><div v-if="eventsEnabled" class="editor-tabs" role="group" aria-label="登録する情報"><button type="button" :aria-pressed="editorTab==='band'" @click="editorTab='band'">バンド情報</button><button type="button" :aria-pressed="editorTab==='events'" @click="editorTab='events'">ライブ予定登録</button><a :href="local?'/#/VRCBandDB/events':'https://serieindustry.com/#/VRCBandDB/events'" target="_blank" rel="noopener noreferrer">{{ t('navigation.events') }} <UiIcon/></a></div><form id="band-registration-form" v-show="editorTab==='band'" @submit.prevent="save">
        <h2>{{ current.band['活動名']||'新規バンド' }}{{ current.id?' の編集':' の登録' }}</h2>
        <p v-if="admin"><span class="source-badge" :class="{managed:current.registrationSource==='admin'||!current.id}">{{ sourceLabel(current) }}</span></p>
        <section v-if="admin&&current.id" class="card ownership" aria-labelledby="ownership-title">
          <h3 id="ownership-title">所有者・移譲</h3>
          <p>現在の所有者：<span v-if="!current.ownerUserIds?.length">{{ current.ownershipType==='admin'||current.registrationSource==='admin'?'運営':'未設定（本人との紐付けなし）' }}</span><template v-else><a v-for="id in current.ownerUserIds" :key="id" :href="`https://discord.com/users/${id}`" target="_blank" rel="noopener noreferrer">{{ ownerLabel(id) }}</a></template></p>
          <label for="owner-search">登録済みユーザーを検索</label><input id="owner-search" v-model="ownerSearch" type="search" :disabled="busy" placeholder="表示名・ユーザー名・IDで検索"><label for="owner-select">移譲先ユーザー</label><select id="owner-select" v-model="ownerInput" :disabled="busy"><option value="">移譲先を選択してください</option><option value="admin">運営</option><option v-if="ownerInput&&ownerInput!=='admin'&&!matchingUsers.some(user=>user.id===ownerInput)" :value="ownerInput">{{ ownerLabel(ownerInput) }}</option><option v-for="user in matchingUsers" :key="user.id" :value="user.id">{{ ownerLabel(user.id) }}</option></select><p v-if="!matchingUsers.length" class="hint">該当するユーザーがいません。</p><label for="owner-id">DiscordユーザーIDで直接指定</label><div class="ownership-input"><input id="owner-id" v-model="ownerInput" type="text" inputmode="numeric" maxlength="25" :disabled="busy" placeholder="DiscordユーザーIDを入力"><button v-if="loginId" type="button" :disabled="busy" @click="ownerInput=loginId">自分のIDを入力</button><button type="button" :disabled="busy||!validOwner" @click="transferOwnership">所有者を移譲</button></div>
          <p class="hint">選択肢には、この機能追加後にDiscordログインしたユーザーが表示されます。同名の場合はユーザー名・IDで確認してください。移譲先は未ログイン・サーバー未参加でも指定できます。現在の所有者は置き換わります。</p>
          <p class="hint">運営が所有するものに運営登録マークを表示します。ユーザーへの移譲でマークが外れ、運営への移譲でマークが付きます。公開ページはデータ更新後に反映されます。</p>
          <details v-if="current.ownershipAudit?.length"><summary>移譲履歴（最新5件）</summary><ul><li v-for="(entry,index) in [...current.ownershipAudit].reverse()" :key="index">{{ new Date(entry.at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) }}：{{ ownerLabel(entry.by) }} <UiIcon name="right"/> {{ ownerLabel(entry.owner) }}</li></ul></details>
        </section>
        <fieldset :disabled="busy" class="form-body">
          <section v-for="{id:section,title,fields:keys} in sections" :key="section" class="card"><h3>{{ title }}</h3><p v-if="section==='images'" class="hint">{{ t('registration.imageHelp') }}</p><div class="grid">
            <div v-for="key in keys" :key="key" class="field" :class="{wide:key==='バンドメンバー'||key==='コメント'}">
              <label :for="`field-${key}`">{{ labels[key]||key }} <span v-if="requiredFields.includes(key)" class="required" aria-hidden="true">*</span><span v-if="fieldWarning(key)" :id="`warning-${key}`" class="input-warning" role="status">{{ fieldWarning(key) }}</span></label>
              <template v-if="key==='バンドメンバー'">
                <fieldset v-for="(member,index) in current.members" :key="index" class="member"><legend>メンバー {{ index+1 }}</legend>
                  <label>パート<input v-model="member.part" maxlength="1000"></label><label>名前 <span class="required">*</span><input v-model="member.name" required maxlength="1000"></label><label>XのID・プロフィールURL<input v-model="member.account" maxlength="1000"></label><button type="button" @click="current.members.splice(index,1)">{{ t('common.remove') }}</button>
                </fieldset><button type="button" @click="current.members.push({part:'',name:'',account:''})">＋ メンバー追加</button>
              </template>
              <template v-else-if="C.multiple.includes(key)||key==='サブジャンル'">
                <div v-if="C.defaults[key]" class="checks" role="group" :aria-label="labels[key]||key" :aria-required="requiredFields.includes(key)"><label v-for="choice in C.defaults[key]" :key="choice"><input v-model="current.tags[key]" type="checkbox" :value="choice">{{ choice }}</label></div>
                <div v-for="(_item,index) in current.extras[key]" :key="index" class="item-row"><label>{{ key }} {{ index+1 }}<input v-model="current.extras[key]![index]" maxlength="1000"></label><button type="button" @click="current.extras[key]!.splice(index,1)">{{ t('common.remove') }}</button></div>
                <button v-if="key==='サブジャンル'||C.otherAllowed.includes(key)" type="button" @click="current.extras[key]!.push('')">{{ key==='募集パート'?'＋ 募集パート（自由入力）':`＋ ${key}を追加` }}</button>
                <p v-if="C.multiple.includes(key)" class="hint">複数選択できます。</p>
              </template>
              <select v-else-if="C.defaults[key]" :id="`field-${key}`" v-model="current.band[key]" :required="requiredFields.includes(key)"><option value="">未設定</option><option v-for="choice in C.defaults[key]" :key="choice">{{ choice }}</option><option v-if="current.band[key]&&!C.defaults[key]!.includes(current.band[key]!)" :value="current.band[key]">{{ current.band[key] }}（既存値）</option></select>
              <div v-else-if="namedKeys.includes(key)" class="named-link"><label>タイトル<input v-model="current.links[key]!.title" maxlength="1000" :aria-label="`${key} タイトル`"></label><label>{{ t('labels.links') }}<input v-model="current.links[key]!.url" type="text" inputmode="url" maxlength="3000" placeholder="https://" :aria-label="`${key} リンク`"></label></div>
              <textarea v-else-if="key==='コメント'" :id="`field-${key}`" v-model="current.band[key]" :required="requiredFields.includes(key)" maxlength="4000"/>
              <input v-else :id="`field-${key}`" v-model="current.band[key]" :required="requiredFields.includes(key)" maxlength="4000" :aria-describedby="fieldWarning(key)?`warning-${key}`:undefined">
              <template v-if="imageKeys.includes(key)"><FileUploadButton class="upload" label="PNG画像を選択" accept="image/png" :disabled="busy" @change="upload(key,$event)"/><p v-if="limits[key]" class="hint">{{ limits[key]!.width }}×{{ limits[key]!.height }}px以内・{{ limits[key]!.bytes/1048576 }}MiB以内</p><p v-if="current.band[key]&&!bandImage(current.band[key],{localPreview:local})" class="error">画像を読み込めません。</p></template>
              <template v-if="key==='YouTube動画URL'"><BandVideo v-if="videoId" :video-id="videoId"/><p v-else-if="current.band[key]" class="error">動画を読み込めません。YouTubeの動画URLを確認してください。</p></template>
            </div>
          </div>
          <button v-if="section==='introduction'&&admin" class="delete-band" type="button" @click="deleteBand">{{ t('common.remove') }}</button>
          <section v-if="section==='images'" class="layout-preview" aria-label="画像とロゴ配置のプレビュー">
            <h4>表示プレビュー</h4>
            <div class="layout-control"><label for="preview-logo-layout">ロゴ配置位置</label><select id="preview-logo-layout" v-model="current.band['ロゴ配置位置']"><option v-for="choice in C.defaults['ロゴ配置位置']" :key="choice">{{ choice }}</option><option v-if="current.band['ロゴ配置位置']&&!C.defaults['ロゴ配置位置']!.includes(current.band['ロゴ配置位置']!)" :value="current.band['ロゴ配置位置']">{{ current.band['ロゴ配置位置'] }}（既存値）</option></select></div>
            <div class="preview-body"><div class="preview-heading"><BandImage v-if="media.icon" class="icon-preview" :image="media.icon" alt="アイコン"/><strong>{{ current.band['活動名']||'バンド名' }}</strong></div><BandVisual :photo="media.photo" :logo="media.logo" :layout="media.layout"/></div>
            <p v-if="!media.photo&&!media.logo" class="hint">画像を選択するかURLを入力すると、配置を確認できます。</p>
          </section>
          </section>
        </fieldset>
      </form><LiveEventEditor :active="editorTab==='events'" @notice="message($event.text,$event.error)" v-if="eventsEnabled" :request="api" v-show="editorTab==='events'" :band-id="current.id" :band-name="current.band['活動名']||'新規バンド'" :admin="admin" :local-preview="local"/><div class="save-bar"><p v-if="notice" class="save-notice" role="status" aria-live="polite" :class="{error}">{{ notice }}</p><button v-if="editorTab==='band'" form="band-registration-form" class="primary save" :disabled="busy" type="submit">{{ busy?'処理中…':'登録・変更を保存' }}</button></div></div>
    </main>
    <div v-if="draftMenu" ref="menuElement" class="draft-menu" role="menu" :style="{left:`${draftMenu.x}px`,top:`${draftMenu.y}px`}" @pointerdown.stop><button role="menuitem" type="button" @click="removeUnsaved(draftMenu.draft)">未登録のバンドを削除</button></div>
  </div>
  </div>
</template>

<style scoped>
.privacy-link a{color:var(--db-link);text-decoration:underline;text-underline-offset:3px}

.role-limit{margin:16px 0;padding:12px 16px;border:1px solid var(--db-border-control);border-radius:var(--db-radius-control);background:var(--db-surface-muted)}.role-limit p{margin:0 0 8px}
.logout-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:#0006;cursor:wait}.logout-overlay p{padding:20px 28px;border-radius:var(--db-radius-surface);background:var(--db-surface-white);color:var(--db-text);box-shadow:0 4px 24px #0003}

.editor-column{min-width:0}.editor-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 20px}.editor-tabs button[aria-pressed=true]{background:var(--db-primary);color:var(--db-surface-white)}.editor-tabs a{font-size:12px;margin-left:auto;color:var(--db-link)}

.source-badge{display:inline-block;border:1px solid var(--db-border-divider);border-radius:var(--db-radius-pill);padding:1px 9px;font-size:11px;line-height:1.7;margin:3px 6px;vertical-align:middle}.source-badge.managed{background:var(--db-text);color:var(--db-surface-white);border-color:var(--db-text)}

.registration{font-family:Arial,'Yu Gothic',sans-serif;background:var(--db-background);color:var(--db-text);line-height:1.7;min-height:100vh}.registration *{box-sizing:border-box}header{padding:24px max(24px,calc((100vw - 1200px)/2));background:var(--db-surface-white);border-bottom:1px solid var(--db-border-divider)}h1{font-size:24px;margin:0 0 8px}h2{font-size:19px}h3{margin:0 0 22px;padding-bottom:10px;border-bottom:1px solid var(--db-border-divider)}p{font-size:13px}.mode-switch{display:inline-flex;gap:6px;margin:10px 0 0 12px}.mode-switch button{padding:6px 14px;font-size:12px}.mode-switch [aria-pressed=true]{background:var(--db-primary);border-color:var(--db-primary);color:var(--db-surface-white)}.mode{font-size:12px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-tag);padding:3px 12px}button,input,select,textarea{font:inherit}button{cursor:pointer;padding:9px 14px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-control);background:var(--db-surface-white);color:inherit}button:disabled{opacity:.5;cursor:default}.primary{background:var(--db-primary);color:var(--db-surface-white);border-color:var(--db-primary)}main{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;max-width:1250px;margin:auto;padding:24px}.card{padding:24px;background:var(--db-surface-white);border:1px solid var(--db-border-divider);border-radius:var(--db-radius-dialog);margin-bottom:20px}aside{align-self:start;position:sticky;top:20px}aside ol{list-style:none;padding:0}aside li{margin:8px 0}aside button{width:100%;text-align:left;overflow-wrap:anywhere}aside [aria-current=true]{border-color:var(--db-primary)}.draft-row{display:flex;gap:5px;align-items:stretch}.draft-select{flex:1;min-width:0}.draft-status{display:block;font-size:11px;color:var(--db-text-muted);margin-top:3px}aside .draft-remove{width:32px;flex-shrink:0;padding:6px;display:grid;place-items:center;color:#bc202b}.draft-remove svg{width:16px;height:16px}.draft-menu{position:fixed;z-index:1000;border:1px solid var(--db-border-input);border-radius:7px;padding:5px;background:var(--db-surface-white);box-shadow:0 4px 18px #0002}.draft-menu button{border:0;color:#bc202b}.draft-menu button:hover{background:var(--db-surface-muted)}.ownership a{display:inline-block;margin-right:12px;overflow-wrap:anywhere;color:var(--db-link)}.ownership>label{display:block;font-size:13px;font-weight:bold;margin-bottom:6px}.ownership-input{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ownership-input input{flex:1;min-width:180px}.ownership-input button{flex-shrink:0}.ownership details{font-size:12px;overflow-wrap:anywhere}.form-body{border:0;margin:0;padding:0;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.field{min-width:0}.field>label{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;font-size:13px;font-weight:bold;margin-bottom:7px}.wide{grid-column:1/-1}input:not([type=checkbox]):not([type=file]),textarea,select{width:100%;padding:10px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-small);background:var(--db-surface-white);color:inherit}textarea{min-height:130px;resize:vertical}.input-warning{color:#896300;background:#fff4be;border:1px solid #e7c95c;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:normal}.required,.error{color:#bc202b}.hint{font-size:12px;color:var(--db-text-muted)}.checks{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.checks label{border:1px solid var(--db-border-input);border-radius:var(--db-radius-control);padding:5px 8px;font-size:12px}.checks label:has(:checked){border-color:var(--db-primary)}.item-row{display:flex;align-items:end;gap:8px;margin:10px 0}.item-row label{flex:1}.member{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:15px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-control)}.member input,.member>button{height:44px}.member>button{align-self:end}.member label,.named-link label{font-size:12px}.named-link{display:grid;gap:10px}.upload{margin-top:12px}.upload input{display:block;font-size:12px;font-weight:normal;margin-top:5px;max-width:100%}.layout-preview{border-top:1px solid var(--db-border-divider);margin-top:24px}.layout-control{max-width:480px;margin-bottom:16px}.layout-control label{display:block;font-size:13px;font-weight:bold;margin-bottom:6px}.preview-body{max-width:480px}.layout-preview :deep(.artist-visual){margin:14px 0}.layout-preview :deep(.separate-logo){height:100px;margin:14px 0}.preview-heading{display:flex;align-items:center;gap:14px}.icon-preview{width:48px;height:48px;border-radius:var(--db-radius-surface)}.consent{max-width:900px;margin:24px auto;line-height:1.9}.consent li{margin-bottom:18px}.consent button{display:block;margin-top:20px}.import-label{display:block;margin-top:16px;font-size:12px}.delete-band{display:block;margin:20px 0 0 auto;color:#bc202b;border-color:#bc202b}.save-bar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:stretch;gap:12px;margin-bottom:30px}.save-notice{min-height:48px;font-size:14px;line-height:1.4;flex:1;min-width:0;margin:0;padding:12px 16px;border:1px solid var(--db-border-input);border-radius:var(--db-radius-surface);background:var(--db-surface-white);box-shadow:0 3px 16px #0002;white-space:pre-wrap;overflow-wrap:anywhere;max-height:30vh;overflow:auto}.save{display:block;min-height:48px;font-size:14px;line-height:1.4;width:fit-content;flex-shrink:0;padding:12px 24px;margin-left:auto}.save-notice.error{border-color:#bc202b}@media(max-width:760px){.save-bar{flex-direction:column;align-items:stretch}.save-notice{flex:none}.save{align-self:flex-end}}.loading{padding:24px}input[aria-invalid=true]{border-color:#bc202b}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--db-focus-ring);outline-offset:2px}@media(max-width:760px){main{display:block;padding:16px}.grid{grid-template-columns:1fr}aside{position:static}.card{padding:18px}.member{grid-template-columns:1fr}.consent{margin:16px}h1{font-size:20px}}
</style>
