/* Pure review logic. Also executed by Node tests; no Google APIs here. */
var BandReview = (function () {
  'use strict';
  var fields = ['活動名', '活動名（よみがな）※ひらがなで入力', '活動名（英語）', '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム', 'メインジャンル', 'サブジャンル', '属性', '募集パート', 'ロゴ', 'アイコン', 'アー写', 'ロゴ配置位置', 'SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', 'その他SNSリンク1', 'その他SNSリンク2', 'その他SNSリンク3', 'その他SNSリンク4', 'その他SNSリンク5', 'コメント', '活動時間帯', 'バンドメンバー', 'YouTube動画URL'];
  var metadata = ['_registrationId', '_approvedRevision', '_reviewStatus'];
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var noticeFormatVersion = 10;
  var defaultVoteThreshold = 3;
  function fail(code) { throw new Error(code); }
  function canonical(title) {
    title = String(title || '').trim();
    if (fields.indexOf(title) >= 0) return title;
    return fields.slice().sort(function (a, b) { return b.length - a.length; }).find(function (key) { return title.indexOf(key + '\n') === 0 || title.indexOf(key + '（') === 0 || title.indexOf(key + 'リンク') === 0; });
  }
  function youtubeVideoId(value) {
  var text = String(value || '').trim();
  var match = /^https:\/\/(?:www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/([^\s<>"'\\]*)$/i.exec(text);
  if (!match) return '';
  var path = match[2]; var id = '';
  if (match[1].toLowerCase() === 'youtu.be') id = path.split(/[?#]/)[0];
  else if (/^watch\?/.test(path)) { var query = /(?:\?|&)v=([A-Za-z0-9_-]{11})(?:&|#|$)/.exec(path); id = query ? query[1] : ''; }
  else { var video = /^(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/.exec(path); id = video ? video[1] : ''; }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}
  function snapshot(entries) {
    var result = {};
    fields.forEach(function (key) { result[key] = ''; });
    var seen = {};
    entries.forEach(function (entry) {
      var key = canonical(entry.title);
      if (!key) return;
      if (seen[key]) fail('DUPLICATE_FORM_FIELD');
      seen[key] = true;
      var values = Array.isArray(entry.value) ? entry.value : [entry.value];
      if (['ロゴ', 'アイコン', 'アー写'].indexOf(key) >= 0 && entry.fileUpload) {
        values = values.map(function (id) { return /^[\w-]+$/.test(String(id)) ? 'https://drive.google.com/file/d/' + id + '/view' : ''; });
      }
      result[key] = values.map(function (value) { return String(value == null ? '' : value).trim(); }).filter(Boolean).join(', ');
    });
    ['活動名', '活動形態１', 'メインジャンル'].forEach(function (key) { if (!seen[key]) fail('MISSING_FORM_FIELD'); });
    if (result['YouTube動画URL'] && !youtubeVideoId(result['YouTube動画URL'])) fail('INVALID_YOUTUBE_URL');
    if (!result['活動名']) fail('MISSING_BAND_NAME');
    if (JSON.stringify(result).length > 12000) fail('ANSWER_TOO_LONG');
    return result;
  }
  function command(value) {
    if (!value || !['approve', 'reject'].includes(value.action) || !uuidPattern.test(value.registrationId || '') || !Number.isSafeInteger(value.revision) || value.revision < 1) fail('INVALID_COMMAND');
    ['interactionId', 'actorId', 'guildId', 'channelId', 'messageId'].forEach(function (key) { if (!/^\d{10,25}$/.test(value[key] || '')) fail('INVALID_COMMAND'); });
    if (!['admin', 'moderator'].includes(value.actorRole)) fail('ROLE_REQUIRED');
    return value;
  }
  function registrationSource(record){return record.ownershipType==='admin'?'admin':record.ownershipType==='user'||(record.ownerUserIds||[]).length?'user':(record.approvedSource||record.source||'form');}
  function publicHeaders() { return metadata.concat(fields.slice(0, 26), ['_registrationSource'], fields.slice(26), ['_updatedAt']); }
  function publicRows(records) {
    return [publicHeaders()].concat(records.filter(function (record) { return !!record.approvedSnapshot; }).map(function (record) {
      return [record.id, String(record.approvedRevision), 'approved'].concat(fields.slice(0, 26).map(function (key) { return record.approvedSnapshot[key] || ''; }), [registrationSource(record) === 'admin' ? 'admin' : registrationSource(record) === 'user' ? 'user' : 'form'], fields.slice(26).map(function (key) { return record.approvedSnapshot[key] || ''; }), [record.approvedUpdatedAt || record.reviewedAt || '']);
    }));
  }
  function noticeImage(value) {
    var candidates = String(value || '').match(/https:\/\/[^\s,<>"']+/g) || [];
    var source = candidates.find(function (url) { return url.length <= 600 && /^https:\/\/[a-z0-9.-]+(?::443)?(?:\/|\?|$)/i.test(url); });
    if (!source) return null;
    // Escape Markdown delimiters in the link target; do not fetch URLs or change Drive permissions.
    source = source.replace(/[()\[\]\\]/g, function (char) { return '%' + char.charCodeAt(0).toString(16).toUpperCase(); });
    if (source.length > 600) return null;
    var preview = source;
    if (/^https:\/\/drive\.google\.com\//i.test(source)) {
      var match = /\/file\/d\/([\w-]+)/.exec(source) || /[?&]id=([\w-]+)/.exec(source);
      preview = match ? 'https://lh3.googleusercontent.com/d/' + match[1] + '=w1600' : '';
    }
    return { source: source, preview: preview };
  }
  function noticeLinks(text) {
    var specs = [{ key: 'SNSリンク（X/Twitter）', label: 'X / Twitter', base: 'https://x.com/', domains: ['x.com', 'twitter.com'] },
      { key: 'YouTube動画URL', label: '紹介動画', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
      { key: 'SNSリンク（Youtube）', label: 'YouTube', base: 'https://www.youtube.com/@', domains: ['youtube.com', 'youtu.be'] },
      { key: 'VRC Groupリンク', label: 'VRC Group', domains: ['vrchat.com', 'vrc.group'] }];
    for (var i = 1; i <= 5; i++) specs.push({ key: 'その他SNSリンク' + i, label: 'その他' + i, other: true });
    return specs.map(function (spec) {
      var raw = String(text[spec.key] || '').trim();
      if (!raw) return null;
      var url = raw; var buttonLabel = spec.label;
      if (spec.base && /^@[^\s/?#]+$/.test(raw)) url = spec.base + encodeURIComponent(raw.slice(1));
      if (spec.other && !/^https?:\/\//i.test(raw)) {
        var named = /^([^:：]+)[:：]\s*(.+)$/.exec(raw);
        if (named) {
          buttonLabel = named[1].replace(/[\r\n\t@`*_~|<>]/g, ' ').trim().slice(0, 32) || spec.label;
          url = named[2].trim();
          if (/^(mail|email|メール)$/i.test(named[1].trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return { label: spec.label, status: 'メール形式OK（Webリンク対象外）' };
        }
      }
      var match = /^https?:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?([/?#].*)?$/i.exec(url);
      if (!match || /[\s<>"'\\]/.test(url) || /\.(?:\.|$)/.test(match[1]) || (match[2] && (+match[2] < 1 || +match[2] > 65535))) return { label: spec.label, status: '⚠ URL形式を確認' };
      if (url.length > 512) return { label: spec.label, status: '⚠ URLが長すぎます（512文字以内）' };
      var host = match[1].toLowerCase();
      var status = '形式OK';
      if (spec.domains && !spec.domains.some(function (domain) { return host === domain || host.endsWith('.' + domain); })) status = '⚠ 入力欄とドメインが不一致';
      else if (spec.key === 'VRC Groupリンク' && host !== 'vrc.group' && !/^\/home\/group\/grp_[\w-]+(?:[/?#]|$)/.test(match[3] || '')) status = '⚠ グループのURLか確認';
      if (/^http:\/\//i.test(url)) status += '・HTTP';
      return { label: spec.label, buttonLabel: buttonLabel, url: url, status: status + '（' + host.slice(0, 48) + '）' };
    }).filter(Boolean);
  }
  function reviewChanges(before,after,revision,kind) {
    var values={};fields.forEach(function(key){if(String(before[key]||'')!==String(after[key]||''))values[key]=String(before[key]||'');});
    return {before:values,revision:revision,kind:kind};
  }
  function changeDescription(changes,text,limit,images) {
    function value(key,raw){
      if(!raw)return '未入力';
      if(['ロゴ','アイコン','アー写'].includes(key)){
        var asset=noticeImage(raw);return images&&asset&&asset.source.length<=250?'[画像を開く](<'+asset.source+'>)':'画像あり（URL変更）';
      }
      var plain=String(raw).replace(/[\r\n]+/g,' '),short=plain.slice(0,limit).replace(/[\\`*_~|<>]/g,'\\$&');return short+(plain.length>limit?'…':'');
    }
    return Object.keys(changes.before).map(function(key){return '**'+key+'**\n変更前：'+value(key,changes.before[key])+'\n変更後：'+value(key,text[key]||'');}).join('\n\n');
  }
  function notice(record, state) {
    state = state || record.status;
    var labels = { pending: '承認待ち', approved: '承認済み（公開処理は別途確認）', rejected: '却下・非掲載', superseded: '新しい回答があるため無効', deleted: '掲載削除済み（公開処理は別途確認）' };
    var text = record.snapshot;
    var payload = {
      content: 'VRC Band DB｜' + (record.source === 'user' ? '本人登録・' + (record.revision === 1 ? '新規' : '更新') + '｜' : '') + labels[state], allowed_mentions: { parse: [] },
      embeds: [{ title: text['活動名'].slice(0, 200), description: '登録ID: ' + record.id + '\n版: ' + record.revision + (registrationSource(record) === 'admin' ? '\n所有先: 運営' : ''),
        fields: ['活動形態１', 'メインジャンル', 'サブジャンル', 'コメント'].map(function (key) { return { name: key, value: (text[key] || '未入力').slice(0, 800) }; }) }],
      components: [{ type: 1, components: ['approve', 'reject'].map(function (action) { return { type: 2, style: action === 'approve' ? 3 : 4, label: action === 'approve' ? '承認' : '却下', custom_id: 'band:' + action + ':' + record.id + ':' + record.revision, disabled: state !== 'pending' }; }) }]
    };
    if(state==='rejected')payload.components[0].components=[{type:2,style:1,label:'再承認',custom_id:'band:reopen:'+record.id+':'+record.revision}];
    ['ロゴ', 'アイコン', 'アー写'].forEach(function (label) {
      var asset = noticeImage(text[label]);
      payload.embeds[0].fields.push({ name: label, value: asset ? '[画像を開く](<' + asset.source + '>)' : (text[label] ? '有効な画像URLを確認できません' : '未登録') });
      if (asset && asset.preview) payload.embeds.push({ title: label, url: asset.source, image: { url: asset.preview } });
    });
    payload.embeds[0].footer = { text: 'プレビューが出ない場合は「画像を開く」から確認してください。Drive画像は閲覧権限が必要な場合があります。' };
    if (text['バンドメンバー']) payload.embeds[0].fields.push({ name: 'バンドメンバー', value: text['バンドメンバー'].slice(0, 600) });
    var owners=record.ownerUserIds||[],registrant=record.source==='admin'?record.createdBy:record.source==='user'?record.submittedBy:'';
    var operations=(record.noticeOperations||[]).filter(function(op){return op.revision===record.revision&&/^\d{10,25}$/.test(op.actorId||'')&&!(owners.length?owners.includes(op.actorId):registrant===op.actorId);});
    if(operations.length){var actions={add:'登録',update:'更新',approve:'承認',reject:'却下',delete:'掲載削除',restore:'復元',reopen:'却下取り消し・再審査',edit:'応急編集',transfer:'所有者の移譲'};payload.embeds[0].fields.push({name:'登録者以外の操作',value:operations.map(function(op){return (actions[op.action]||'操作')+'：<@'+op.actorId+'>';}).join('\n').slice(0,1024)});}
    var votes = record.votes || [];
    payload.embeds[0].fields.push({ name: '審査票（管理人は1人で確定）', value: 'モデレーター承認：' + votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'approve'; }).length + '/' + (record.approveThreshold || defaultVoteThreshold) + '\nモデレーター却下：' + votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'reject'; }).length + '/' + (record.rejectThreshold || defaultVoteThreshold) });
    var links = noticeLinks(text);
    if (links.length) {
      payload.embeds[0].fields.push({ name: 'リンク確認（本人・実在確認はリンク先で）', value: links.map(function (link) { return link.label + '：' + link.status; }).join('\n') });
      var buttons = links.filter(function (link) { return link.url; }).map(function (link) {
        return { type: 2, style: 5, label: link.buttonLabel, url: link.url, disabled: state === 'superseded' };
      });
      for (var offset = 0; offset < buttons.length; offset += 5) payload.components.push({ type: 1, components: buttons.slice(offset, offset + 5) });
    }
    var changes=record.reviewChanges||(record.approvedSnapshot&&record.approvedRevision!==record.revision?reviewChanges(record.approvedSnapshot,text,record.approvedRevision,'approved'):null);
    var changedKeys=changes?Object.keys(changes.before):[],changeEmbed=null;
    if(changedKeys.length){
      payload.embeds[0].fields.push({name:'更新された項目',value:changedKeys.join('、').slice(0,1024)});
      var description=changeDescription(changes,text,180,true);
      for(var length=120;description.length>3000&&length>=20;length-=20)description=changeDescription(changes,text,length,true);
      if(description.length>3000)description=changeDescription(changes,text,20,false);
      changeEmbed={title:'更新内容（'+(changes.kind==='approved'?'公開中':'前回登録')+'の版'+changes.revision+'との比較）',description:description};
      payload.embeds.push(changeEmbed);
    }else if(record.revision>1&&state==='pending'&&!changes){payload.embeds[0].fields.push({name:'更新内容',value:'変更前の情報が残っていないため比較できません。今回の登録内容を確認してください。'});}
    // All embeds share Discord's 6000-character budget. Only shorten plain answer text, never URLs.
    var total = payload.embeds.reduce(function (sum, embed) {
      return sum + (embed.title || '').length + (embed.description || '').length + (embed.footer && embed.footer.text || '').length + (embed.fields || []).reduce(function (n, field) { return n + field.name.length + field.value.length; }, 0);
    }, 0);
    for (var index = 3; index >= 0 && total > 5900; index--) {
      var field = payload.embeds[0].fields[index];
      var remove = Math.min(field.value.length - 1, total - 5900);
      if (remove > 0) { field.value = field.value.slice(0, field.value.length - remove - 1) + '…'; total -= remove; }
    }
    if(changeEmbed&&total>5900){changeEmbed.description='変更された項目：'+changedKeys.join('、')+'\n文字数上限のため変更前後の詳細を省略しています。';}
    return payload;
  }
  function pngInfo(bytes) {
    function u(i) { return bytes[i] & 255; }
    function n(i) { return u(i)*16777216+u(i+1)*65536+u(i+2)*256+u(i+3); }
    if (bytes.length < 57 || [137,80,78,71,13,10,26,10].some(function (value,index) { return u(index) !== value; })) fail('INVALID_PNG');
    var table = Array.from({length:256},function (_,index) { var c=index; for(var k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
    var offset=8, width=0, height=0, idat=false, ended=false, chunks=0;
    while(offset+12<=bytes.length) {
      if(++chunks>8192) fail('INVALID_PNG');
      var size=n(offset), end=offset+12+size;
      if(end>bytes.length) fail('INVALID_PNG');
      var kind=String.fromCharCode(u(offset+4),u(offset+5),u(offset+6),u(offset+7));
      var crc=0xffffffff;
      for(var index=offset+4;index<offset+8+size;index++) crc=table[(crc^u(index))&255]^(crc>>>8);
      if(((crc^0xffffffff)>>>0)!==n(offset+8+size)) fail('INVALID_PNG');
      if(offset===8) { if(kind!=='IHDR'||size!==13) fail('INVALID_PNG'); width=n(offset+8);height=n(offset+12); }
      if(kind==='IDAT'&&size>0) idat=true;
      if(kind==='IEND') { if(size!==0||end!==bytes.length) fail('INVALID_PNG');ended=true;break; }
      offset=end;
    }
    if(!width||!height||!idat||!ended) fail('INVALID_PNG');
    return {width:width,height:height};
  }
  function service(store, io) {
    function rememberOperation(record,actorId,action,now){
      var operations=(record.noticeOperations||[]).filter(function(op){return op.revision===record.revision&&!(op.actorId===actorId&&['approve','reject'].includes(action)&&['approve','reject'].includes(op.action));});
      operations.push({actorId:actorId,action:action,at:now,revision:record.revision});record.noticeOperations=operations.slice(-10);
    }
    var baseThreshold = io.voteThreshold || defaultVoteThreshold;
    var approveThreshold = io.approveThreshold || baseThreshold;
    var rejectThreshold = io.rejectThreshold || baseThreshold;
    function overlay(content, record) {
      var effective = JSON.parse(JSON.stringify(content)); var overrides = {};
      Object.keys(record && record.adminOverrides || {}).forEach(function (field) {
        var item = record.adminOverrides[field];
        if (fields.indexOf(field) >= 0 && item && item.baseHash === io.hash(String(content[field] || ''))) {
          overrides[field] = item; effective[field] = item.value;
        }
      });
      return { content: effective, overrides: overrides };
    }
    function syncPolicy() {
      store.all().filter(function (record) { return record.status === 'pending'; }).forEach(function (record) {
        if (record.approveThreshold === approveThreshold && record.rejectThreshold === rejectThreshold) return;
        record.approveThreshold = approveThreshold; record.rejectThreshold = rejectThreshold; record.noticeDirty = true;
        store.save(record);
      });
    }
    function ingest(responseId, content, now, owner, managed) {
      var current = store.all().find(function (record) { return record.responseId === responseId; });
      // An ownership transfer ends legacy form synchronization, even before
      // the new owner saves through the portal for the first time.
      if (current && !owner && !managed && (current.source === 'user' || ((!current.source || current.source === 'form') && !usesFormResponse(current)))) return current;
      if (current && current.status === 'deleted') return current; // A later form edit must not restore a deleted listing.
      var legacyMembers = false;
      ['バンドメンバー', 'YouTube動画URL'].forEach(function (key) {
        if (current && !Object.prototype.hasOwnProperty.call(current.snapshot, key)) {
          legacyMembers = true; current.snapshot[key] = '';
          if (current.approvedSnapshot) current.approvedSnapshot[key] = current.approvedSnapshot[key] || '';
        }
      });
      if (legacyMembers) { var normalized = {}; fields.forEach(function (key) { normalized[key] = current.snapshot[key] || ''; }); current.snapshot = normalized; current.hash = io.hash(JSON.stringify(current.snapshot)); }
      var applied = owner || managed ? {content:content,overrides:{}} : overlay(content, current); content = applied.content;
      var hash = io.hash(JSON.stringify(content));
      if (current && current.hash === hash && !(owner && current.source !== 'user')) {
        if (legacyMembers || JSON.stringify(current.adminOverrides || {}) !== JSON.stringify(applied.overrides)) { current.adminOverrides = applied.overrides; store.save(current); }
        return current;
      }
      var record = current ? JSON.parse(JSON.stringify(current)) : { id: io.uuid(), responseId: responseId, source: String(responseId).indexOf('admin:') === 0 ? 'admin' : 'form', revision: 0, retired: [], approvedSnapshot: null, approvedRevision: 0, publishStatus: 'not_needed' };
      if (owner) {
        if (record.approvedSnapshot && !record.approvedSource) record.approvedSource = record.source || 'form';
        record.source = 'user'; record.ownerUserIds = record.ownerUserIds || [owner]; record.submittedBy = owner;
      }
      if (record.messageId) record.retired.push({ messageId: record.messageId, payload: notice(record, 'superseded') });
      if(current)record.reviewChanges=reviewChanges(current.approvedSnapshot||current.snapshot,content,current.approvedSnapshot?current.approvedRevision:current.revision,current.approvedSnapshot?'approved':'previous');
      record.revision += 1;
      record.noticeOperations=[];
      record.hash = hash; record.snapshot = content; record.status = 'pending'; record.receivedAt = now;
      record.messageId = ''; record.noticeDirty = true; record.reviewedBy = ''; record.reviewedAt = ''; record.lastInteractionId = '';
      record.lastError = '';
      record.votes = []; record.approveThreshold = approveThreshold; record.rejectThreshold = rejectThreshold;
      record.adminOverrides = applied.overrides;
      store.save(record); // Durable first: notification retries must not invent new IDs.
      return record;
    }
    function addBatch(input, now) {
      if (input.actorRole !== 'admin') fail('ADMIN_REQUIRED');
      if (!Array.isArray(input.bands) || !input.bands.length || input.bands.length > 20) fail('INVALID_IMPORT');
      var contents = input.bands.map(function (band) {
        if (!band || typeof band !== 'object' || Array.isArray(band) || Object.keys(band).some(function (key) { return fields.indexOf(key) < 0 || typeof band[key] !== 'string' || band[key].length > 4000; })) fail('INVALID_IMPORT');
        return snapshot(fields.map(function (key) { return { title: key, value: band[key] || '' }; }));
      });
      // Validate the entire batch before any write; stable interaction/index keys make retries safe.
      return contents.map(function (content, index) {
        var responseId = 'admin:' + input.interactionId + ':' + index;
        var existing = store.all().find(function (record) { return record.responseId === responseId; });
        if (existing) return existing;
        var record = ingest(responseId, content, now);
        record.source = 'admin'; record.createdBy = input.actorId; rememberOperation(record,input.actorId,'add',now); store.save(record);
        return record;
      });
    }
    function userSubmit(input, now) {
      var managed = input.actorRole === 'admin';
      if ((!managed && input.actorRole !== 'user') || !/^\d{10,25}$/.test(input.actorId || '') || !uuidPattern.test(input.submissionId || '')) fail('PORTAL_INVALID_REQUEST');
      var responseId = (managed ? 'admin:portal:' : 'user:') + input.actorId + ':' + input.submissionId;
      var record = input.registrationId ? store.all().find(function (item) { return item.id === input.registrationId; }) : store.all().find(function (item) { return item.responseId === responseId; });
      if ((input.registrationId && !record) || (record && !managed && !(record.ownerUserIds || []).includes(input.actorId))) fail('PORTAL_FORBIDDEN');
      if (record && record.status === 'deleted') fail('REGISTRATION_DELETED');
      var band = input.band;
      if (!band || typeof band !== 'object' || Array.isArray(band) || Object.keys(band).some(function (key) { return fields.indexOf(key) < 0 || typeof band[key] !== 'string' || band[key].length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(band[key]); })) fail('INVALID_IMPORT');
      var content = snapshot(fields.map(function (key) { return {title:key,value:band[key] || ''}; }));
      var hash = io.hash(JSON.stringify(content));
      if (record && record.lastPortalSubmission === input.submissionId) {
        if (record.lastPortalHash !== hash) fail('PORTAL_INVALID_REQUEST');
        return record;
      }
      if (record && record.revision !== input.revision) fail('STALE_EDIT');
      var newRegistration=!record;
      if (managed && newRegistration) {
        var nameKey = function (value) { return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); };
        var requestedName = nameKey(content['活動名']);
        var duplicate = store.all().some(function (item) {
          return item.status !== 'deleted' && [item.snapshot, item.approvedSnapshot].some(function (snapshot) {
            return snapshot && nameKey(snapshot['活動名']) === requestedName;
          });
        });
        if (duplicate) fail('DUPLICATE_BAND_NAME');
      }
      if (!record && !managed && store.all().filter(function (item) { return (item.ownerUserIds || []).includes(input.actorId); }).length >= 10) fail('PORTAL_BAND_LIMIT');
      var overrides = managed && record ? JSON.parse(JSON.stringify(record.adminOverrides || {})) : {};
      if (managed && record && record.source === 'form') fields.forEach(function (field) {
        if (record.snapshot[field] !== content[field]) overrides[field] = {baseHash:overrides[field] ? overrides[field].baseHash : io.hash(String(record.snapshot[field] || '')),value:content[field]};
      });
      record = ingest(record ? record.responseId : responseId, content, now, managed ? null : input.actorId, managed);
      if (managed) { record.adminOverrides = overrides; record.createdBy = record.createdBy || input.actorId; record.lastManagedBy = input.actorId; }
      record.lastPortalSubmission = input.submissionId; record.lastPortalHash = hash;
      rememberOperation(record,input.actorId,newRegistration?'add':'update',now);
      store.save(record);
      return record;
    }
    function assignOwner(input,now){
      if(input.actorRole!=='admin'||!/^\d{10,25}$/.test(input.actorId||'')||!(input.ownerId==='admin'||/^\d{10,25}$/.test(input.ownerId||''))||!uuidPattern.test(input.registrationId||''))fail('ADMIN_REQUIRED');
      var record=store.all().find(function(item){return item.id===input.registrationId;});if(!record||record.status==='deleted')fail('NOT_FOUND');
      var targetOwners=input.ownerId==='admin'?[]:[input.ownerId],targetType=input.ownerId==='admin'?'admin':'user';
      var previous=record.lastOwnershipRequest;
      if(input.requestId&&previous&&previous.id===input.requestId){if(previous.actorId!==input.actorId||previous.ownerId!==input.ownerId||(record.ownerUserIds||[]).join(',')!==targetOwners.join(',')||record.ownershipType!==targetType)fail('STALE_OWNERSHIP');return record;}
      if(input.revision!==undefined&&record.revision!==input.revision)fail('STALE_EDIT');
      if(input.ownershipVersion!==undefined&&(!Number.isSafeInteger(input.ownershipVersion)||input.ownershipVersion!==(record.ownershipVersion||0)))fail('STALE_OWNERSHIP');
      var before=(record.ownerUserIds||[]).slice();if(before.join(',')===targetOwners.join(',')&&record.ownershipType===targetType)return record;
      record.ownerUserIds=targetOwners;record.ownershipType=targetType;if(record.approvedSnapshot)record.publishStatus='queued';record.ownershipVersion=(record.ownershipVersion||0)+1;
      record.ownershipAudit=(record.ownershipAudit||[]).concat([{at:now,by:input.actorId,owner:input.ownerId,previousOwners:before}]).slice(-20);
      if(input.requestId)record.lastOwnershipRequest={id:input.requestId,actorId:input.actorId,ownerId:input.ownerId};
      rememberOperation(record,input.actorId,'transfer',now);record.noticeDirty=true;store.save(record);return record;
    }
    function decide(input, now) {
      command(input);
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) fail('NOT_FOUND');
      if (record.revision !== input.revision || record.messageId !== input.messageId) fail('STALE_REVIEW');
      if (record.lastInteractionId === input.interactionId) return record;
      if (record.status !== 'pending') {
        if ((record.status === 'approved' && input.action === 'approve') || (record.status === 'rejected' && input.action === 'reject')) return record;
        fail('ALREADY_REVIEWED');
      }
      var votes = record.votes || [];
      var previous = votes.find(function (vote) { return vote.actorId === input.actorId; });
      if (previous && previous.action === input.action && previous.role === input.actorRole) return record;
      if (previous && (previous.interactionId.length > input.interactionId.length || (previous.interactionId.length === input.interactionId.length && previous.interactionId >= input.interactionId))) fail('STALE_VOTE');
      votes = votes.filter(function (vote) { return vote.actorId !== input.actorId; });
      votes.push({ actorId: input.actorId, action: input.action, role: input.actorRole, interactionId: input.interactionId });
      record.votes = votes; record.approveThreshold = approveThreshold; record.rejectThreshold = rejectThreshold;
      var count = votes.filter(function (vote) { return vote.action === input.action && vote.role === 'moderator'; }).length;
      var threshold = input.action === 'approve' ? approveThreshold : rejectThreshold;
      if (input.actorRole === 'admin' || count >= threshold) {
        record.status = input.action === 'approve' ? 'approved' : 'rejected';
        record.reviewedBy = input.actorId; record.reviewedAt = now;
      }
      record.lastInteractionId = input.interactionId;
      rememberOperation(record,input.actorId,input.action,now);
      record.noticeDirty = true;
      if (record.status === 'approved') {
        record.approvedSource = record.source || 'form'; record.approvedUpdatedAt = now; record.approvedSnapshot = JSON.parse(JSON.stringify(record.snapshot)); record.approvedRevision = record.revision;
        record.publishStatus = 'queued';
      }
      store.save(record);
      return record;
    }
    function remove(input, now) {
      if (input.actorRole !== 'admin' || !uuidPattern.test(input.registrationId || '') || !Number.isSafeInteger(input.revision)) fail('ADMIN_REQUIRED');
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) fail('NOT_FOUND');
      if (record.status === 'deleted' && (record.lastDeleteInteraction === input.interactionId || record.revision === input.revision + 1)) return record;
      if (record.revision !== input.revision || record.status === 'deleted') fail('STALE_DELETE');
      record.restoreBackup = { approvedSnapshot: record.approvedSnapshot, approvedRevision: record.approvedRevision || 0 };
      record.revision++; record.status = 'deleted'; record.deletedBy = input.actorId; record.deletedAt = now;
      rememberOperation(record,input.actorId,'delete',now);
      record.lastDeleteInteraction = input.interactionId; record.approvedSnapshot = null; record.approvedRevision = 0;
      record.publishStatus = 'queued'; record.noticeDirty = true;
      store.save(record);
      return record;
    }
    function reopen(input, now) {
      if(input.actorRole!=='admin'||!uuidPattern.test(input.registrationId||'')||!Number.isSafeInteger(input.revision))fail('ADMIN_REQUIRED');
      var record=store.all().find(function(item){return item.id===input.registrationId;});
      if(!record)fail('NOT_FOUND');
      if(record.lastReopenFromRevision===input.revision&&record.revision===input.revision+1)return record;
      if(record.status!=='rejected'||record.revision!==input.revision)fail('STALE_REOPEN');
      if(record.messageId){record.retired=record.retired||[];record.retired.push({messageId:record.messageId,payload:notice(record,'superseded')});}
      record.lastReopenFromRevision=input.revision;record.reopenedBy=input.actorId;record.reopenedAt=now;
      record.revision++;record.status='pending';record.messageId='';record.noticeDirty=true;record.lastError='';
      record.votes=[];record.approveThreshold=approveThreshold;record.rejectThreshold=rejectThreshold;
      record.lastInteractionId='';record.reviewedBy='';record.reviewedAt='';record.noticeOperations=[];
      rememberOperation(record,input.actorId,'reopen',now);store.save(record);return record;
    }
    function restore(input, now, content, approval) {
      if (input.actorRole !== 'admin' || !uuidPattern.test(input.registrationId || '') || !Number.isSafeInteger(input.revision)) fail('ADMIN_REQUIRED');
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) fail('NOT_FOUND');
      if (record.lastRestoreFromRevision === input.revision && record.status !== 'deleted') return record;
      if (record.status !== 'deleted' || record.revision !== input.revision) fail('STALE_RESTORE');
      if (content) { var applied = overlay(content, record); record.snapshot = applied.content; record.adminOverrides = applied.overrides; }
      record.revision++; record.hash = io.hash(JSON.stringify(record.snapshot));
      record.approvedSnapshot = approval ? JSON.parse(JSON.stringify(approval.snapshot)) : null;
      record.approvedRevision = approval ? approval.revision : 0;
      record.status = approval && record.hash === io.hash(JSON.stringify(approval.snapshot)) ? 'approved' : 'pending';
      if (record.status === 'approved') record.approvedRevision = record.revision;
      record.votes = []; record.approveThreshold = approveThreshold; record.rejectThreshold = rejectThreshold;
      record.restoredBy = input.actorId; record.restoredAt = now; record.lastRestoreFromRevision = input.revision;
      rememberOperation(record,input.actorId,'restore',now);
      record.lastInteractionId = ''; record.reviewedBy = ''; record.reviewedAt = ''; record.noticeDirty = true;
      record.publishStatus = approval || ['queued', 'failed'].includes(record.publishStatus) ? 'queued' : 'not_needed';
      delete record.restoreBackup;
      store.save(record);
      return record;
    }
    function edit(input, now, raw) {
      if (input.actorRole !== 'admin' || !uuidPattern.test(input.registrationId || '') || !Number.isSafeInteger(input.fieldIndex) || !fields[input.fieldIndex]
        || typeof input.value !== 'string' || input.value.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.value)) fail('INVALID_EDIT');
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record || record.status === 'deleted') fail('EDIT_UNAVAILABLE');
      var value = input.value.trim(); var field = fields[input.fieldIndex]; var valueHash = io.hash(value);
      var previous = record.lastAdminEdit;
      if (previous && previous.fromRevision === input.revision && record.revision === input.revision + 1 && previous.actorId === input.actorId
        && previous.fieldIndex === input.fieldIndex && previous.valueHash === valueHash) return record;
      ingest(record.responseId, raw, now);
      record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (record.revision !== input.revision) fail('STALE_EDIT');
      if (record.snapshot[field] === value) return record;
      var content = JSON.parse(JSON.stringify(record.snapshot)); content[field] = value;
      content = snapshot(fields.map(function (key) { return { title: key, value: content[key] }; }));
      record.adminOverrides = record.adminOverrides || {};
      if (String(raw[field] || '') === value) delete record.adminOverrides[field];
      else record.adminOverrides[field] = { baseHash: io.hash(String(raw[field] || '')), value: value };
      record.lastAdminEdit = { actorId: input.actorId, fieldIndex: input.fieldIndex, fromRevision: record.revision, valueHash: valueHash, interactionId: input.interactionId, at: now };
      record.reviewChanges=reviewChanges(record.approvedSnapshot||record.snapshot,content,record.approvedSnapshot?record.approvedRevision:record.revision,record.approvedSnapshot?'approved':'previous');
      record.revision++; record.snapshot = content; record.hash = io.hash(JSON.stringify(content));
      rememberOperation(record,input.actorId,'edit',now);
      record.votes = []; record.lastInteractionId = ''; record.reviewedBy = ''; record.reviewedAt = ''; record.noticeDirty = true;
      record.approveThreshold = approveThreshold; record.rejectThreshold = rejectThreshold;
      if (record.approvedSnapshot) {
        record.approvedSnapshot[field] = value; record.approvedUpdatedAt = now;
        record.approvedRevision = record.revision; record.publishStatus = 'queued';
        record.status = io.hash(JSON.stringify(record.approvedSnapshot)) === record.hash ? 'approved' : 'pending';
        if (record.status === 'approved') { record.reviewedBy = input.actorId; record.reviewedAt = now; }
      } else record.status = 'pending';
      store.save(record);
      return record;
    }
    function notify() {
      syncPolicy();
      if (io.localNotifications) { if (io.wakeNotifications) io.wakeNotifications(); return; } // Delivery is external; keep the durable queue.
      store.all().forEach(function (record) {
        if (io.canContinue && !io.canContinue()) return;
        try {
          while (record.retired.length) { io.patch(record.retired[0].messageId, record.retired[0].payload); record.retired.shift(); store.save(record); }
          if (!record.noticeDirty && record.noticeFormatVersion === noticeFormatVersion) return;
          if (record.messageId) io.patch(record.messageId, notice(record));
          else record.messageId = io.send(notice(record), record.id + ':' + record.revision);
          record.noticeDirty = false; record.noticeFormatVersion = noticeFormatVersion; record.lastError = ''; store.save(record);
        } catch (_) { record.lastError = 'DISCORD_NOTIFY_FAILED'; store.save(record); }
      });
    }
    function publish() {
      var records = store.all();
      var pending = records.filter(function (record) { return ['queued', 'failed'].includes(record.publishStatus) || (record.approvedSnapshot && (record.publicMetadataVersion !== 3 || record.publicVideoVersion !== 1)); });
      if (!pending.length) return false;
      try {
        io.publish(publicRows(records)); // Never copy an unapproved current snapshot.
        io.dispatch();
        pending.forEach(function (record) { record.publishStatus = 'dispatched'; record.publicMetadataVersion = 3; record.publicVideoVersion = 1; record.lastError = ''; store.save(record); });
        return true;
      } catch (_) {
        pending.forEach(function (record) { record.publishStatus = 'failed'; record.lastError = 'PUBLISH_OR_DISPATCH_FAILED'; store.save(record); });
        return false;
      }
    }
    return { assignOwner:assignOwner,userSubmit: userSubmit, addBatch: addBatch, ingest: ingest, decide: decide, remove: remove, reopen: reopen, restore: restore, edit: edit, notify: notify, publish: publish, syncPolicy: syncPolicy };
  }
  function usesFormResponse(record) {
    return !['admin','user'].includes(record.source) && String(record.responseId).indexOf('admin:') !== 0
      && !(record.ownershipVersion > 0 || ['user','admin'].includes(record.ownershipType));
  }
  return { usesFormResponse:usesFormResponse,fields: fields, metadata: metadata, pngInfo: pngInfo, registrationSource:registrationSource,publicHeaders: publicHeaders, youtubeVideoId: youtubeVideoId, snapshot: snapshot, command: command, publicRows: publicRows, notice: notice, noticeFormatVersion: noticeFormatVersion, defaultVoteThreshold: defaultVoteThreshold, service: service };
})();


// Public event validation and serialization. Authentication and audit stay in Code.gs.
var BandEvents=(function(){
 'use strict';
 var headers=['eventId','ownerBandId','title','subtitle','place','venueName','venueUrl','startsAt','endsAt','participants','updatedAt','revision'];
 var places=['VRChat','Cluster','リアル','その他'];
 function fail(code){throw new Error(code);}
 function normalize(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_EVENT');
  var allowed=['id','ownerBandId','title','subtitle','place','venueName','venueUrl','startsAt','endsAt','participants','updatedAt','revision'];
  if(Object.keys(input).some(function(key){return allowed.indexOf(key)<0;}))fail('INVALID_EVENT');
  function text(key,max){var value=input[key]==null?'':input[key];if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))fail('INVALID_EVENT');return value.trim();}
  var result={id:text('id',36),ownerBandId:text('ownerBandId',36),title:text('title',150),subtitle:text('subtitle',1000),place:text('place',30),venueName:text('venueName',150),venueUrl:text('venueUrl',2048),startsAt:text('startsAt',40),endsAt:text('endsAt',40)};
  var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!result.title||places.indexOf(result.place)<0||result.id&&!uuid.test(result.id)||result.ownerBandId&&!uuid.test(result.ownerBandId))fail('INVALID_EVENT');
  var iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  var start=new Date(result.startsAt),end=new Date(result.endsAt);
  if(!iso.test(result.startsAt)||!iso.test(result.endsAt)||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)fail('INVALID_EVENT');
  [result.startsAt,result.endsAt].forEach(function(value){var parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/),year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||Number(parts[4])>23||Number(parts[5])>59||Number(parts[6]||0)>59)fail('INVALID_EVENT');});
  result.startsAt=start.toISOString();result.endsAt=end.toISOString();
  if(result.venueUrl&&(!result.venueName||!/^https?:\/\/[^\s/@:]+(?::[0-9]+)?(?:[/?#][^\s]*)?$/i.test(result.venueUrl)||/[\\<>"\x00-\x20]/.test(result.venueUrl)))fail('INVALID_EVENT');
  if(!Array.isArray(input.participants)||input.participants.length>50)fail('INVALID_EVENT');
  var seen={};result.participants=[];
  input.participants.forEach(function(item){if(!item||typeof item!=='object'||Object.keys(item).some(function(key){return !['bandId','name'].includes(key);})||typeof item.bandId!=='string'||typeof item.name!=='string'||!item.name.trim()||item.name.length>150||item.bandId&&!uuid.test(item.bandId))fail('INVALID_EVENT');var key=item.bandId?'id:'+item.bandId:'name:'+item.name.trim().toLowerCase();if(!seen[key]){seen[key]=true;result.participants.push({bandId:item.bandId,name:item.name.trim()});}});
  if(result.ownerBandId&&!result.participants.some(function(item){return item.bandId===result.ownerBandId;}))fail('INVALID_EVENT');
  return result;
 }
 function publicEvent(record){var event=record.event,result={id:event.id};headers.slice(1).forEach(function(key){result[key]=key==='revision'?record.revision:key==='updatedAt'?record.updatedAt:event[key];});return result;}
 function rows(records){return [headers].concat(records.filter(function(record){return record.status==='active';}).map(function(record){var event=publicEvent(record);return headers.map(function(key){return key==='eventId'?event.id:key==='participants'?JSON.stringify(event.participants):String(event[key]==null?'':event[key]);});}));}
 return {headers:headers,normalize:normalize,publicEvent:publicEvent,rows:rows};
})();
