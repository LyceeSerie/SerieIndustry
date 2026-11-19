/* Pure review logic. Also executed by Node tests; no Google APIs here. */
var BandReview = (function () {
  'use strict';
  var fields = ['活動名', '活動名（よみがな）※ひらがなで入力', '活動名（英語）', '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム', 'メインジャンル', 'サブジャンル', '属性', '募集パート', 'ロゴ', 'アイコン', 'アー写', 'ロゴ配置位置', 'SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', 'その他SNSリンク1', 'その他SNSリンク2', 'その他SNSリンク3', 'その他SNSリンク4', 'その他SNSリンク5', 'コメント', '活動時間帯'];
  var metadata = ['_registrationId', '_approvedRevision', '_reviewStatus'];
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var noticeFormatVersion = 2;
  function fail(code) { throw new Error(code); }
  function canonical(title) {
    title = String(title || '').trim();
    if (fields.indexOf(title) >= 0) return title;
    return fields.slice().sort(function (a, b) { return b.length - a.length; }).find(function (key) { return title.indexOf(key + '\n') === 0 || title.indexOf(key + '（') === 0 || title.indexOf(key + 'リンク') === 0; });
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
    if (!result['活動名']) fail('MISSING_BAND_NAME');
    if (JSON.stringify(result).length > 12000) fail('ANSWER_TOO_LONG');
    return result;
  }
  function command(value) {
    if (!value || !['approve', 'reject'].includes(value.action) || !uuidPattern.test(value.registrationId || '') || !Number.isSafeInteger(value.revision) || value.revision < 1) fail('INVALID_COMMAND');
    ['interactionId', 'actorId', 'guildId', 'channelId', 'messageId'].forEach(function (key) { if (!/^\d{10,25}$/.test(value[key] || '')) fail('INVALID_COMMAND'); });
    return value;
  }
  function publicRows(records) {
    return [metadata.concat(fields)].concat(records.filter(function (record) { return !!record.approvedSnapshot; }).map(function (record) {
      return [record.id, String(record.approvedRevision), 'approved'].concat(fields.map(function (key) { return record.approvedSnapshot[key] || ''; }));
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
      preview = match ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1600' : '';
    }
    return { source: source, preview: preview };
  }
  function notice(record, state) {
    state = state || record.status;
    var labels = { pending: '承認待ち', approved: '承認済み（公開処理は別途確認）', rejected: '却下・非掲載', superseded: '新しい回答があるため無効' };
    var text = record.snapshot;
    var payload = {
      content: 'VRC Band DB｜' + labels[state], allowed_mentions: { parse: [] },
      embeds: [{ title: text['活動名'].slice(0, 200), description: '登録ID: ' + record.id + '\n版: ' + record.revision,
        fields: ['活動形態１', 'メインジャンル', 'サブジャンル', 'コメント'].map(function (key) { return { name: key, value: (text[key] || '未入力').slice(0, 800) }; }) }],
      components: [{ type: 1, components: ['approve', 'reject'].map(function (action) { return { type: 2, style: action === 'approve' ? 3 : 4, label: action === 'approve' ? '承認' : '却下', custom_id: 'band:' + action + ':' + record.id + ':' + record.revision, disabled: state !== 'pending' }; }) }]
    };
    ['ロゴ', 'アイコン', 'アー写'].forEach(function (label) {
      var asset = noticeImage(text[label]);
      payload.embeds[0].fields.push({ name: label, value: asset ? '[画像を開く](<' + asset.source + '>)' : (text[label] ? '有効な画像URLを確認できません' : '未登録') });
      if (asset && asset.preview) payload.embeds.push({ title: label, url: asset.source, image: { url: asset.preview } });
    });
    payload.embeds[0].footer = { text: 'プレビューが出ない場合は「画像を開く」から確認してください。Drive画像は閲覧権限が必要な場合があります。' };
    return payload;
  }
  function service(store, io) {
    function ingest(responseId, content, now) {
      var hash = io.hash(JSON.stringify(content));
      var current = store.all().find(function (record) { return record.responseId === responseId; });
      if (current && current.hash === hash) return current;
      var record = current ? JSON.parse(JSON.stringify(current)) : { id: io.uuid(), responseId: responseId, revision: 0, retired: [], approvedSnapshot: null, approvedRevision: 0, publishStatus: 'not_needed' };
      if (record.messageId) record.retired.push({ messageId: record.messageId, payload: notice(record, 'superseded') });
      record.revision += 1;
      record.hash = hash; record.snapshot = content; record.status = 'pending'; record.receivedAt = now;
      record.messageId = ''; record.noticeDirty = true; record.reviewedBy = ''; record.reviewedAt = ''; record.lastInteractionId = '';
      record.lastError = '';
      store.save(record); // Durable first: notification retries must not invent new IDs.
      return record;
    }
    function decide(input, now) {
      command(input);
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) fail('NOT_FOUND');
      if (record.revision !== input.revision || record.messageId !== input.messageId) fail('STALE_REVIEW');
      if (record.lastInteractionId === input.interactionId) return record;
      if (record.status !== 'pending') fail('ALREADY_REVIEWED');
      record.status = input.action === 'approve' ? 'approved' : 'rejected';
      record.reviewedBy = input.actorId; record.reviewedAt = now; record.lastInteractionId = input.interactionId;
      record.noticeDirty = true;
      if (record.status === 'approved') {
        record.approvedSnapshot = JSON.parse(JSON.stringify(record.snapshot)); record.approvedRevision = record.revision;
        record.publishStatus = 'queued';
      }
      store.save(record);
      return record;
    }
    function notify() {
      if (io.localNotifications) return; // Durable queue is delivered by the local notifier.
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
      var pending = records.filter(function (record) { return ['queued', 'failed'].includes(record.publishStatus); });
      if (!pending.length) return false;
      try {
        io.publish(publicRows(records)); // Never copy an unapproved current snapshot.
        io.dispatch();
        pending.forEach(function (record) { record.publishStatus = 'dispatched'; record.lastError = ''; store.save(record); });
        return true;
      } catch (_) {
        pending.forEach(function (record) { record.publishStatus = 'failed'; record.lastError = 'PUBLISH_OR_DISPATCH_FAILED'; store.save(record); });
        return false;
      }
    }
    return { ingest: ingest, decide: decide, notify: notify, publish: publish };
  }
  return { fields: fields, metadata: metadata, snapshot: snapshot, command: command, publicRows: publicRows, notice: notice, noticeFormatVersion: noticeFormatVersion, service: service };
})();
