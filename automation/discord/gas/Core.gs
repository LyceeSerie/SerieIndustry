/* Pure review logic. Also executed by Node tests; no Google APIs here. */
var BandReview = (function () {
  'use strict';
  var fields = ['活動名', '活動名（よみがな）※ひらがなで入力', '活動名（英語）', '活動形態１', '活動形態２', '活動形態３', '活動プラットフォーム', 'メインジャンル', 'サブジャンル', '属性', '募集パート', 'ロゴ', 'アイコン', 'アー写', 'ロゴ配置位置', 'SNSリンク（X/Twitter）', 'SNSリンク（Youtube）', 'VRC Groupリンク', 'その他SNSリンク1', 'その他SNSリンク2', 'その他SNSリンク3', 'その他SNSリンク4', 'その他SNSリンク5', 'コメント', '活動時間帯'];
  var metadata = ['_registrationId', '_approvedRevision', '_reviewStatus'];
  var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      store.all().forEach(function (record) {
        if (io.canContinue && !io.canContinue()) return;
        try {
          while (record.retired.length) { io.patch(record.retired[0].messageId, record.retired[0].payload); record.retired.shift(); store.save(record); }
          if (!record.noticeDirty) return;
          if (record.messageId) io.patch(record.messageId, notice(record));
          else record.messageId = io.send(notice(record), record.id + ':' + record.revision);
          record.noticeDirty = false; record.lastError = ''; store.save(record);
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
  return { fields: fields, metadata: metadata, snapshot: snapshot, command: command, publicRows: publicRows, notice: notice, service: service };
})();
