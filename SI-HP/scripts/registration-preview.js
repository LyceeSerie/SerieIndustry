// Included only in the test build. No production API or external storage is used.
if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
  document.documentElement.hidden = true;
  throw new Error('Local preview only');
}
window.VBD_PORTAL = true;
const previewRole = new URLSearchParams(location.search).get('role') === 'admin' ? 'admin' : 'user';
window.VBD_PREVIEW_OUTPUT = (core, target) => {
  const input = { ...target }, images = {};
  for (const field of ['ロゴ', 'アイコン', 'アー写']) if (String(input[field] || '').startsWith('data:image/png;base64,')) {
    images[field] = input[field];
    input[field] = 'https://example.invalid/local-preview.png';
  }
  return { ...JSON.parse(core.output([input]))[0], ...images };
};
const previewStorageKey = 'vbd-registration-preview-v2';
const previewConsentKey='vbd-registration-preview-consent';
const previewTermsVersion='2026-11-21-v1';
const previewConsented=()=>localStorage.getItem(previewConsentKey)===previewTermsVersion;
const previewLimits = {
  'ロゴ': { bytes: 2097152, width: 1024, height: 512 },
  'アイコン': { bytes: 524288, width: 256, height: 256 },
  'アー写': { bytes: 16777216, width: 3840, height: 2160 },
};
let previewRecords;
try { previewRecords = JSON.parse(localStorage.getItem(previewStorageKey) || 'null'); } catch { /* Reset invalid preview data. */ }
if (!Array.isArray(previewRecords)) previewRecords = [{
  id: '00000000-0000-4000-8000-000000000001', revision: 1, status: 'approved', owner: 'self', source: 'user',
  band: { '活動名': '登録画面テストバンド', 'コメント': 'ローカル確認用データです。自由に編集できます。',
    '活動形態１': 'バンド', '活動形態２': 'オリジナル', '活動形態３': '活動中',
    '活動プラットフォーム': 'VRChat', 'メインジャンル': 'ロック', '属性': 'インスト',
    'アイコン': 'https://example.invalid/test-icon.png', 'アー写': 'https://example.invalid/test-photo.png',
    'SNSリンク（X/Twitter）': '@zerry_furai', '活動時間帯': '21:00〜24:00' },
}];
if(!previewRecords.some(record=>record.id==='00000000-0000-4000-8000-000000000002'))previewRecords.push({
  ...structuredClone(previewRecords[0]), id:'00000000-0000-4000-8000-000000000002',owner:'other',source:'admin',
  band:{...previewRecords[0].band,'活動名':'管理用テストバンド（他の登録者）'},
});
window.VBD_PREVIEW_API = async (path, body) => {
  if (path === '/api/me') return { role:previewRole,records: previewConsented()?structuredClone(previewRecords.filter(record=>record.status!=='deleted'&&(previewRole==='admin'||record.owner==='self'))):[], consentRequired:!previewConsented(),termsVersion:previewTermsVersion,csrf: 'local-preview', limits: previewLimits };
  if(path==='/api/consent'){
    if(body?.accepted!==true||body.version!==previewTermsVersion)throw Error('同意事項を確認してください。');
    localStorage.setItem(previewConsentKey,previewTermsVersion);return {ok:true};
  }
  if(path!=='/api/logout'&&!previewConsented())throw Error('登録時の同意事項への同意が必要です。');
  if(path==='/api/delete'){
    if(previewRole!=='admin')throw Error('管理人専用の操作です。');
    const record=previewRecords.find(item=>item.id===body.registrationId);
    if(!record)throw Error('登録が見つかりません。');
    if(record.status==='deleted'&&record.revision===body.revision+1)return {ok:true};
    if(record.revision!==body.revision||record.status==='deleted')throw Error('登録情報が更新されています。再読み込みしてください。');
    const next=previewRecords.map(item=>item===record?{...item,status:'deleted',revision:item.revision+1}:item);
    localStorage.setItem(previewStorageKey,JSON.stringify(next));previewRecords=next;return {ok:true};
  }
  if (path === '/api/save') {
    const old = previewRecords.find(record => record.id === body.registrationId);
    if(old?.status==='deleted')throw Error('この登録は削除されています。');
    if(body.registrationId&&!old||old&&previewRole!=='admin'&&old.owner!=='self')throw Error('このバンドを編集する権限がありません。');
    if (old && old.revision !== body.revision) throw Error('別の変更が保存されています。再読み込みしてください。');
    const saved = { id: old?.id || crypto.randomUUID(), revision: (old?.revision || 0) + 1, status: 'pending', owner:old?.owner||(previewRole==='admin'?'other':'self'), source:old?.source||(previewRole==='admin'?'admin':'user'), band: structuredClone(body.band) };
    const next = old ? previewRecords.map(record => record === old ? saved : record) : [...previewRecords, saved];
    if (previewRole!=='admin'&&next.filter(record=>record.owner==='self').length > 10) throw Error('テスト登録は10件までです。');
    try { localStorage.setItem(previewStorageKey, JSON.stringify(next)); } catch { throw Error('ブラウザの保存容量が不足しています。画像を小さくするか、リンクで指定してください。'); }
    previewRecords = next;
    return saved;
  }
  if (path === '/api/upload-ticket') return { ticket: { field: body.field } };
  if (path === '/api/upload') return { url: 'data:image/png;base64,' + body.dataBase64 };
  if (path === '/api/logout') { location.href = '/#/VRCBandDB'; return new Promise(() => {}); }
  throw Error('テスト対象外の操作です。');
};
document.addEventListener('DOMContentLoaded', () => {
  const banner = document.createElement('p');
  banner.textContent = 'ローカルテスト：認証なし。保存はこのブラウザ内だけで、Drive・Discord・公開データには送信しません。画像もブラウザ内で保持します。';
  banner.style.cssText = 'padding:12px;background:#fff3cd;color:#332700;font-weight:bold';
  const label=document.createElement('label');label.textContent=' 確認モード：';
  const select=document.createElement('select');select.setAttribute('aria-label','確認モード');
  for(const [value,text]of [['user','通常用（ロールなし・未参加）'],['admin','管理用（管理人ロール）']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.value=previewRole;select.onchange=()=>{location.search='?role='+select.value;};label.append(select);banner.append(label);
  const reset=document.createElement('button');reset.type='button';reset.textContent='初回同意を再表示';reset.onclick=()=>{localStorage.setItem(previewConsentKey,'');location.reload();};banner.append(reset);
  document.body.prepend(banner);
});
