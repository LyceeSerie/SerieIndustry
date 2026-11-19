/* Copy this file and Core.gs to the same Apps Script project. */
function safeDiagnosticError_(error) {
  var message = String(error && error.message || '詳細不明のエラー');
  var properties = PropertiesService.getScriptProperties().getProperties();
  ['DISCORD_BOT_TOKEN', 'GITHUB_TOKEN', 'GAS_HMAC_SECRET', 'LOCAL_NOTIFY_SECRET'].forEach(function (key) {
    if (properties[key]) message = message.split(properties[key]).join('[秘密値を非表示]');
  });
  return message.replace(/(?:github_pat_|ghp_)[A-Za-z0-9_]+/g, '[GitHub Tokenを非表示]').slice(0, 800);
}
function googleId_(key, value) {
  if (!value || value !== String(value).trim() || !/^[\w-]+$/.test(value)) throw new Error(key + '：IDだけを入力してください。前後の空白・引用符・URLは入れません。');
  if (key === 'FORM_ID' && /^1FAIp/.test(value)) throw new Error('FORM_ID：回答用IDではなく、フォーム編集URLの /d/ と /edit の間のIDを指定してください。');
  return value;
}
function diagnosticStep_(step, hint, callback) {
  console.log('[開始] ' + step);
  try {
    var value = callback();
    console.log('[成功] ' + step);
    return value;
  } catch (error) {
    var detail = '[失敗] ' + step + '\n確認事項：' + hint + '\n原因：' + safeDiagnosticError_(error);
    console.error(detail);
    throw new Error(detail);
  }
}
// Read-only. Does not require ENABLED=true or any Bot/GitHub secrets.
function diagnoseIntegration() {
  var cfg = PropertiesService.getScriptProperties().getProperties();
  var results = [];
  function check(step, hint, callback) {
    try { diagnosticStep_(step, hint, callback); results.push({ step: step, ok: true }); }
    catch (error) { results.push({ step: step, ok: false, message: safeDiagnosticError_(error) }); }
  }
  check('フォームを開く（FORM_ID）', 'GASを実行するGoogleアカウントでフォーム編集URLを開けるか確認してください。回答用URLや回答先シートのIDは使いません。', function () {
    FormApp.openById(googleId_('FORM_ID', cfg.FORM_ID)).getId();
  });
  check('審査管理シートを開く（REVIEW_SPREADSHEET_ID）', 'GAS実行アカウントへ審査用ファイルの編集権限を付けてください。', function () {
    SpreadsheetApp.openById(googleId_('REVIEW_SPREADSHEET_ID', cfg.REVIEW_SPREADSHEET_ID)).getSheets();
  });
  check('公開用シートとタブを開く（PUBLIC_SPREADSHEET_ID / PUBLIC_SHEET_ID）', '公開用ファイルの編集権限とタブのgidを確認してください。PUBLIC_SHEET_IDは数字だけです。', function () {
    var book = SpreadsheetApp.openById(googleId_('PUBLIC_SPREADSHEET_ID', cfg.PUBLIC_SPREADSHEET_ID));
    if (!/^\d+$/.test(cfg.PUBLIC_SHEET_ID || '')) throw new Error('PUBLIC_SHEET_IDが数値ではありません。');
    if (!book.getSheetById(Number(cfg.PUBLIC_SHEET_ID))) throw new Error('指定gidの公開用タブがありません。');
  });
  console.log('診断結果：' + results.filter(function (item) { return item.ok; }).length + '/' + results.length + '件成功。診断はデータを書き込みません。');
  console.log('読取成功だけでは編集権限を保証しません。各ファイルをGAS実行アカウントで編集できることも確認してください。');
  return results;
}
function settings_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  ['FORM_ID', 'REVIEW_SPREADSHEET_ID', 'PUBLIC_SPREADSHEET_ID', 'PUBLIC_SHEET_ID', 'DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_CHANNEL_ID', 'GAS_HMAC_SECRET', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_REF'].forEach(function (key) {
    if (!p[key] || !String(p[key]).trim()) throw new Error('MISSING_SETTING_' + key);
  });
  ['FORM_ID', 'REVIEW_SPREADSHEET_ID', 'PUBLIC_SPREADSHEET_ID'].forEach(function (key) { googleId_(key, p[key]); });
  if (p.ENABLED !== 'true') throw new Error('INTEGRATION_DISABLED');
  p.DISCORD_COMMAND_CHANNEL_ID = p.DISCORD_COMMAND_CHANNEL_ID || '1572821384353288252';
  if (!/^\d{10,25}$/.test(p.DISCORD_COMMAND_CHANNEL_ID)) throw new Error('INVALID_COMMAND_CHANNEL');
  p.MODERATOR_VOTE_THRESHOLD = p.MODERATOR_VOTE_THRESHOLD || String(BandReview.defaultVoteThreshold);
  p.MODERATOR_APPROVE_THRESHOLD = p.MODERATOR_APPROVE_THRESHOLD || p.MODERATOR_VOTE_THRESHOLD;
  p.MODERATOR_REJECT_THRESHOLD = p.MODERATOR_REJECT_THRESHOLD || p.MODERATOR_VOTE_THRESHOLD;
  ['MODERATOR_VOTE_THRESHOLD', 'MODERATOR_APPROVE_THRESHOLD', 'MODERATOR_REJECT_THRESHOLD'].forEach(function (key) {
    if (!/^[1-9]\d?$/.test(p[key])) throw new Error('INVALID_VOTE_THRESHOLD');
  });
  p.NOTIFICATION_TRANSPORT = p.NOTIFICATION_TRANSPORT || 'gas';
  if (!['gas', 'local'].includes(p.NOTIFICATION_TRANSPORT)) throw new Error('INVALID_NOTIFICATION_TRANSPORT');
  if (p.NOTIFICATION_TRANSPORT === 'local') {
    if (!/^[a-f0-9]{64}$/i.test(p.LOCAL_NOTIFY_SECRET || '') || p.LOCAL_NOTIFY_SECRET === p.GAS_HMAC_SECRET) throw new Error('INVALID_LOCAL_NOTIFY_SECRET');
  } else if (!p.DISCORD_BOT_TOKEN) throw new Error('MISSING_SETTING_DISCORD_BOT_TOKEN');
  if (p.REVIEW_SPREADSHEET_ID === p.PUBLIC_SPREADSHEET_ID || p.GAS_HMAC_SECRET.length < 32 || !/^\d+$/.test(p.PUBLIC_SHEET_ID)) throw new Error('INVALID_SETTINGS');
  ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_CHANNEL_ID'].forEach(function (key) { if (!/^\d{10,25}$/.test(p[key])) throw new Error('INVALID_DISCORD_SETTING'); });
  if (!/^[\w.-]+$/.test(p.GITHUB_OWNER) || !/^[\w.-]+$/.test(p.GITHUB_REPO) || !/^[\w./-]+$/.test(p.GITHUB_REF)) throw new Error('INVALID_GITHUB_SETTING');
  p.GITHUB_WORKFLOW = p.GITHUB_WORKFLOW || 'deploy-spa.yml';
  if (!/^[\w.-]+\.ya?ml$/.test(p.GITHUB_WORKFLOW)) throw new Error('INVALID_WORKFLOW_SETTING');
  return p;
}
function locked_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('BUSY_RETRY');
  try { return callback(); } finally { lock.releaseLock(); }
}
function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function (value) { return ('0' + ((value + 256) % 256).toString(16)).slice(-2); }).join('');
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function safeCell_(value) { value = String(value == null ? '' : value); return /^[=+'\-@]/.test(value) ? "'" + value : value; }
function managedSheet_(book, name, headers) {
  var sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(headers)) throw new Error('MANAGEMENT_SCHEMA_MISMATCH');
  return sheet;
}
function repository_(cfg) {
  var book = SpreadsheetApp.openById(cfg.REVIEW_SPREADSHEET_ID);
  var records = managedSheet_(book, 'Registrations', ['registrationId', 'responseId', 'recordJson']);
  var audit = managedSheet_(book, 'Audit', ['at', 'registrationId', 'revision', 'status', 'actorId', 'snapshotJson']);
  var votes = managedSheet_(book, 'ReviewVotes', ['at', 'registrationId', 'revision', 'actorId', 'action', 'role', 'interactionId']);
  var nonces = managedSheet_(book, 'Nonces', ['timestamp', 'nonce']);
  function all() {
    if (records.getLastRow() < 2) return [];
    return records.getRange(2, 1, records.getLastRow() - 1, 3).getValues().filter(function (row) { return row[0]; }).map(function (row) {
      var record = JSON.parse(row[2]);
      if (record.id !== row[0] || record.responseId !== row[1]) throw new Error('CORRUPT_RECORD');
      return record;
    });
  }
  function save(record) {
    var existing = all();
    var previous = existing.find(function (item) { return item.id === record.id; });
    var physical = records.getLastRow() > 1 ? records.getRange(2, 1, records.getLastRow() - 1, 1).getValues() : [];
    var index = physical.findIndex(function (row) { return row[0] === record.id; });
    var raw = JSON.stringify(record);
    if (raw.length > 48000) throw new Error('RECORD_TOO_LONG');
    if (record.votes && record.votes.length && JSON.stringify(previous && previous.votes || []) !== JSON.stringify(record.votes)) {
      var vote = record.votes[record.votes.length - 1];
      votes.appendRow([new Date().toISOString(), record.id, String(record.revision), vote.actorId, vote.action, vote.role, vote.interactionId].map(safeCell_));
    }
    // Audit first. A retry can add an audit entry twice but must never lose the snapshot.
    if (!previous || previous.revision !== record.revision || previous.status !== record.status || JSON.stringify(previous.votes || []) !== JSON.stringify(record.votes || [])) {
      var actor = record.status === 'deleted' ? record.deletedBy : (record.reviewedBy || record.votes && record.votes.length && record.votes[record.votes.length - 1].actorId || '');
      audit.appendRow([new Date().toISOString(), record.id, String(record.revision), record.status, actor, JSON.stringify(record.snapshot)].map(safeCell_));
    }
    var row = index >= 0 ? index + 2 : records.getLastRow() + 1;
    records.getRange(row, 1, 1, 3).setValues([[record.id, record.responseId, raw].map(safeCell_)]);
    SpreadsheetApp.flush();
  }
  function reserveNonce(timestamp, nonce) {
    var rows = nonces.getLastRow() > 1 ? nonces.getRange(2, 1, nonces.getLastRow() - 1, 2).getValues() : [];
    if (rows.some(function (row) { return row[1] === nonce; })) throw new Error('REPLAY');
    var recent = rows.filter(function (row) { return Number(row[0]) >= Math.floor(Date.now() / 1000) - 600; });
    recent.push([String(timestamp), nonce]);
    var height = Math.max(rows.length, recent.length);
    var values = recent.concat(Array.from({ length: height - recent.length }, function () { return ['', '']; }));
    nonces.getRange(2, 1, height, 2).setValues(values);
    SpreadsheetApp.flush();
  }
  return { all: all, save: save, reserveNonce: reserveNonce };
}
function readResponse_(response) {
  return BandReview.snapshot(response.getItemResponses().map(function (itemResponse) {
    return { title: itemResponse.getItem().getTitle(), value: itemResponse.getResponse(), fileUpload: String(itemResponse.getItem().getType()) === 'FILE_UPLOAD' };
  }));
}
function http_(url, options) {
  options.muteHttpExceptions = true;
  var result;
  try { result = UrlFetchApp.fetch(url, options); } catch (_) { throw new Error('EXTERNAL_REQUEST_FAILED'); }
  if (result.getResponseCode() < 200 || result.getResponseCode() >= 300) {
    var detail = '';
    if (url.indexOf('https://discord.com/api/v10/') === 0) {
      try {
        var body = JSON.parse(result.getContentText());
        detail = Number.isSafeInteger(body.code) && body.code >= 0 ? '_DISCORD_CODE_' + body.code : '_NO_DISCORD_CODE';
      } catch (_) { detail = '_NON_JSON_RESPONSE'; }
    }
    throw new Error('EXTERNAL_HTTP_' + result.getResponseCode() + detail);
  }
  return result;
}
function runtime_(cfg, store) {
  var started = Date.now();
  function discord(method, path, payload) {
    try {
      return http_('https://discord.com/api/v10' + path, { method: method, contentType: 'application/json', headers: { Authorization: 'Bot ' + cfg.DISCORD_BOT_TOKEN, 'User-Agent': 'DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)' }, payload: JSON.stringify(payload) });
    } catch (error) {
      // Only our fixed HTTP error codes; never log tokens, response bodies or form data.
      var code = String(error && error.message || '');
      console.error('[通知失敗] Discord：' + (/^EXTERNAL_HTTP_\d{3}(?:_DISCORD_CODE_\d+|_NO_DISCORD_CODE|_NON_JSON_RESPONSE)?$/.test(code) ? code : 'EXTERNAL_REQUEST_FAILED'));
      throw error;
    }
  }
  return BandReview.service(store, {
    localNotifications: cfg.NOTIFICATION_TRANSPORT === 'local',
    voteThreshold: Number(cfg.MODERATOR_VOTE_THRESHOLD),
    approveThreshold: Number(cfg.MODERATOR_APPROVE_THRESHOLD),
    rejectThreshold: Number(cfg.MODERATOR_REJECT_THRESHOLD),
    hash: hash_, uuid: function () { return Utilities.getUuid(); },
    canContinue: function () { return Date.now() - started < 180000; },
    send: function (payload, key) {
      payload.nonce = hash_(key).slice(0, 24); payload.enforce_nonce = true;
      var data = JSON.parse(discord('post', '/channels/' + cfg.DISCORD_CHANNEL_ID + '/messages', payload).getContentText());
      if (!/^\d{10,25}$/.test(data.id) || data.author.id !== cfg.DISCORD_APPLICATION_ID) throw new Error('INVALID_DISCORD_MESSAGE');
      return data.id;
    },
    patch: function (id, payload) {
      if (!/^\d{10,25}$/.test(id)) throw new Error('INVALID_MESSAGE_ID');
      discord('patch', '/channels/' + cfg.DISCORD_CHANNEL_ID + '/messages/' + id, payload);
    },
    publish: function (rows) {
      var book = SpreadsheetApp.openById(cfg.PUBLIC_SPREADSHEET_ID);
      var sheet = book.getSheetById(Number(cfg.PUBLIC_SHEET_ID));
      if (!sheet) throw new Error('PUBLIC_TAB_NOT_FOUND');
      var expected = BandReview.metadata.concat(BandReview.fields);
      if (sheet.getLastRow() && JSON.stringify(sheet.getRange(1, 1, 1, expected.length).getValues()[0]) !== JSON.stringify(expected)) throw new Error('PUBLIC_SCHEMA_MISMATCH');
      var height = Math.max(rows.length, sheet.getLastRow());
      var width = expected.length;
      if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
      if (sheet.getMaxRows() < height) sheet.insertRowsAfter(sheet.getMaxRows(), height - sheet.getMaxRows());
      // One rectangular write; do not clear the public sheet first (empty-window race).
      var padded = rows.concat(Array.from({ length: height - rows.length }, function () { return Array(width).fill(''); }));
      sheet.getRange(1, 1, height, width).setNumberFormat('@').setValues(padded.map(function (row) { return row.map(safeCell_); }));
      SpreadsheetApp.flush();
    },
    dispatch: function () {
      http_('https://api.github.com/repos/' + cfg.GITHUB_OWNER + '/' + cfg.GITHUB_REPO + '/actions/workflows/' + cfg.GITHUB_WORKFLOW + '/dispatches', {
        method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + cfg.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, payload: JSON.stringify({ ref: cfg.GITHUB_REF }),
      });
    },
  });
}
// Explicit owner action: prepares only the dedicated management/public sheets.
function initializeIntegration() {
  var cfg = diagnosticStep_('スクリプトプロパティを検証', '必須項目とENABLED=trueを確認してください。', settings_);
  var form = diagnosticStep_('フォームを開く（FORM_ID）', 'GAS実行アカウントで編集画面を開けるか、FORM_IDが編集用IDか確認してください。', function () { return FormApp.openById(cfg.FORM_ID); });
  var destination = diagnosticStep_('フォームの回答先を確認', 'フォームの編集権限と回答先の設定を確認してください。', function () { return form.getDestinationId(); });
  if (destination === cfg.PUBLIC_SPREADSHEET_ID || destination === cfg.REVIEW_SPREADSHEET_ID) throw new Error('USE_SEPARATE_SPREADSHEETS');
  locked_(function () {
    diagnosticStep_('審査管理シートの管理タブを準備', 'REVIEW_SPREADSHEET_IDと編集権限を確認してください。既存の管理タブがある場合は見出しも確認してください。', function () { repository_(cfg); });
    var sheet = diagnosticStep_('公開用シートとタブを開く', 'PUBLIC_SPREADSHEET_ID、数値のPUBLIC_SHEET_ID（gid）、編集権限を確認してください。', function () {
      var target = SpreadsheetApp.openById(cfg.PUBLIC_SPREADSHEET_ID).getSheetById(Number(cfg.PUBLIC_SHEET_ID));
      if (!target) throw new Error('PUBLIC_TAB_NOT_FOUND');
      return target;
    });
    var header = BandReview.metadata.concat(BandReview.fields);
    diagnosticStep_('公開用タブの見出しを準備', '公開用タブの編集権限と見出しを確認してください。別用途のタブを指定していないか確認してください。', function () {
      if (!sheet.getLastRow()) {
        if (sheet.getMaxColumns() < header.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length - sheet.getMaxColumns());
        sheet.getRange(1, 1, 1, header.length).setValues([header]); sheet.setFrozenRows(1);
      } else if (JSON.stringify(sheet.getRange(1, 1, 1, header.length).getValues()[0]) !== JSON.stringify(header)) throw new Error('PUBLIC_SCHEMA_MISMATCH');
    });
  });
}
// Run once after initializeIntegration. Re-running does not duplicate these triggers.
function installIntegrationTriggers() {
  var cfg = settings_();
  var handlers = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
  if (!handlers.includes('onBandFormSubmit')) ScriptApp.newTrigger('onBandFormSubmit').forForm(cfg.FORM_ID).onFormSubmit().create();
  if (!handlers.includes('runMaintenance')) ScriptApp.newTrigger('runMaintenance').timeBased().everyMinutes(5).create();
}
function onBandFormSubmit(event) {
  var cfg = settings_();
  if (!event || !event.response || !event.source || event.source.getId() !== cfg.FORM_ID) throw new Error('FORM_EVENT_REQUIRED');
  locked_(function () {
    var store = repository_(cfg); var service = runtime_(cfg, store);
    service.ingest(event.response.getId(), readResponse_(event.response), new Date().toISOString());
    service.notify();
  });
}
function runMaintenance() {
  var cfg = settings_();
  var form = FormApp.openById(cfg.FORM_ID);
  var responses = form.getResponses();
  console.log('[回答確認] フォーム回答数：' + responses.length);
  var props = PropertiesService.getScriptProperties();
  var cursor = Number(props.getProperty('SCAN_CURSOR') || 0);
  if (!Number.isSafeInteger(cursor) || cursor >= responses.length) cursor = 0;
  locked_(function () {
    var store = repository_(cfg); var service = runtime_(cfg, store);
    // Full rotation catches edits even if the form's timestamp is unchanged.
    var end = Math.min(cursor + 30, responses.length);
    for (var i = cursor; i < end; i++) {
      try { service.ingest(responses[i].getId(), readResponse_(responses[i]), new Date().toISOString()); }
      catch (_) {
        props.setProperty('LAST_SCAN_ERROR', 'RESPONSE_IMPORT_FAILED');
        console.error('[取込失敗] RESPONSE_IMPORT_FAILED（回答内容はログに出力しません）');
      }
    }
    props.setProperty('SCAN_CURSOR', String(end >= responses.length ? 0 : end));
    service.publish(); service.notify();
    var records = store.all();
    console.log('[通知結果] 管理件数：' + records.length + '、通知待ち：' + records.filter(function (record) { return record.noticeDirty; }).length + '、通知失敗：' + records.filter(function (record) { return record.lastError === 'DISCORD_NOTIFY_FAILED'; }).length);
  });
}
function verifyEnvelope_(envelope, cfg, secret) {
  if (!envelope || !Number.isSafeInteger(envelope.timestamp) || Math.abs(Date.now() / 1000 - envelope.timestamp) > 300
    || !/^[a-f0-9-]{36}$/i.test(envelope.nonce || '') || typeof envelope.payload !== 'string' || envelope.payload.length > 10000
    || !/^[a-f0-9]{64}$/i.test(envelope.signature || '')) throw new Error('INVALID_ENVELOPE');
  var signed = envelope.timestamp + '\n' + envelope.nonce + '\n' + envelope.payload;
  var expected = hex_(Utilities.computeHmacSha256Signature(signed, secret || cfg.GAS_HMAC_SECRET, Utilities.Charset.UTF_8));
  var different = 0;
  for (var i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ envelope.signature.toLowerCase().charCodeAt(i);
  if (different) throw new Error('INVALID_SIGNATURE');
  return JSON.parse(envelope.payload);
}
// Called only inside the authenticated, locked request. Local key cannot approve registrations.
function localNotification_(input, cfg, store) {
  if (cfg.NOTIFICATION_TRANSPORT !== 'local') throw new Error('LOCAL_NOTIFICATIONS_DISABLED');
  var records = store.all();
  if (input.kind === 'local_claim') {
    var now = Date.now();
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (record.localDelivery) {
        if (record.localDelivery.until > now) continue;
        // Retain the identical job after timeout; a lost acknowledgement must not invent a new nonce.
        record.localDelivery.until = now + 600000; store.save(record);
        return { ok: true, job: record.localDelivery.job };
      }
      var retired = record.retired && record.retired[0];
      if (!retired && !record.noticeDirty && record.noticeFormatVersion === BandReview.noticeFormatVersion) continue;
      var job = { id: Utilities.getUuid(), registrationId: record.id, revision: record.revision,
        formatVersion: BandReview.noticeFormatVersion,
        kind: retired ? 'retired' : 'current', messageId: retired ? retired.messageId : record.messageId,
        channelId: cfg.DISCORD_CHANNEL_ID, applicationId: cfg.DISCORD_APPLICATION_ID,
        payload: retired ? retired.payload : BandReview.notice(record) };
      record.localDelivery = { until: now + 600000, job: job, payloadHash: hash_(JSON.stringify(job.payload)) };
      store.save(record);
      return { ok: true, job: job };
    }
    return { ok: true, job: null };
  }
  if (input.kind !== 'local_ack' || !/^[\w-]{36}$/.test(input.jobId || '') || !/^\d{10,25}$/.test(input.messageId || '')) throw new Error('INVALID_LOCAL_ACK');
  var target = records.find(function (item) { return item.id === input.registrationId; });
  if (!target) throw new Error('NOT_FOUND');
  if (target.lastLocalAck && target.lastLocalAck.jobId === input.jobId && target.lastLocalAck.messageId === input.messageId) return { ok: true };
  var delivery = target.localDelivery;
  if (!delivery || delivery.job.id !== input.jobId) throw new Error('STALE_LOCAL_ACK');
  var job = delivery.job;
  if (job.messageId && job.messageId !== input.messageId) throw new Error('WRONG_MESSAGE');
  if (job.kind === 'retired') {
    if (target.retired[0] && target.retired[0].messageId === input.messageId) target.retired.shift();
  } else if (target.revision === job.revision) {
    target.messageId = input.messageId;
    target.noticeFormatVersion = job.formatVersion || 1;
    // A decision made while the PC was sending must still refresh the message.
    target.noticeDirty = delivery.payloadHash !== hash_(JSON.stringify(BandReview.notice(target)));
  } else {
    // Form edited during delivery: disable buttons on the old message next.
    var obsolete = JSON.parse(JSON.stringify(job.payload));
    obsolete.content = 'VRC Band DB｜新しい回答があるため無効';
    obsolete.components.forEach(function (row) { row.components.forEach(function (button) { button.disabled = true; }); });
    if (!target.retired.some(function (item) { return item.messageId === input.messageId; })) target.retired.push({ messageId: input.messageId, payload: obsolete });
  }
  target.lastLocalAck = { jobId: input.jobId, messageId: input.messageId };
  delete target.localDelivery;
  if (target.lastError === 'DISCORD_NOTIFY_FAILED') target.lastError = '';
  store.save(target);
  return { ok: true };
}
function deleteConfirmation_(record, input, cfg, expires) {
  var text = ['delete', record.id, record.revision, input.actorId, input.guildId, input.channelId, expires].join('\n');
  return hex_(Utilities.computeHmacSha256Signature(text, cfg.GAS_HMAC_SECRET, Utilities.Charset.UTF_8)).slice(0, 24);
}
function adminOperation_(input, cfg, store, service) {
  if (input.actorRole !== 'admin' || !/^\d{10,25}$/.test(input.actorId || '') || !/^\d{10,25}$/.test(input.interactionId || '')
    || !/^[a-f0-9-]{36}$/i.test(input.registrationId || '')) throw new Error('ADMIN_REQUIRED');
  var record = store.all().find(function (item) { return item.id === input.registrationId; });
  if (!record) throw new Error('NOT_FOUND');
  if (input.kind === 'admin_info') {
    var safeName = record.snapshot['活動名'].replace(/[@`*_<>]/g, '').slice(0, 200);
    return { ok: true, flush: false, message: '活動名：' + safeName + '\n登録ID：' + record.id + '\n版：' + record.revision + '\n状態：' + record.status + '\n掲載：' + (record.approvedSnapshot ? '承認済みデータあり' : 'なし') };
  }
  if (input.kind === 'admin_preview') {
    if (record.status === 'deleted') return { ok: true, flush: false, message: 'この登録は掲載削除済みです。' };
    service.ingest(record.responseId, readResponse_(FormApp.openById(cfg.FORM_ID).getResponse(record.responseId)), new Date().toISOString());
    record = store.all().find(function (item) { return item.id === input.registrationId; });
    var expires = Math.floor(Date.now() / 1000) + 300;
    var signature = deleteConfirmation_(record, input, cfg, expires);
    return { ok: true, flush: false, message: '「' + record.snapshot['活動名'].replace(/[@`*_<>]/g, '').slice(0, 200) + '」を掲載削除しますか？\n登録ID：' + record.id + '\n版：' + record.revision + '\n元回答と履歴は残し、サイトから非表示にします。確認は5分間有効です。',
      components: [{ type: 1, components: [{ type: 2, style: 4, label: '掲載削除を確定', custom_id: 'band:delete:' + record.id + ':' + record.revision + ':' + expires + ':' + signature }] }] };
  }
  if (input.kind !== 'admin_delete' || !Number.isSafeInteger(input.revision) || !Number.isSafeInteger(input.expires)
    || input.expires < Math.floor(Date.now() / 1000) || input.expires > Math.floor(Date.now() / 1000) + 300
    || !/^[a-f0-9]{24}$/.test(input.confirmation || '')) throw new Error('INVALID_DELETE_CONFIRMATION');
  var expected = deleteConfirmation_({ id: record.id, revision: input.revision }, input, cfg, input.expires);
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ input.confirmation.charCodeAt(i);
  if (mismatch) throw new Error('INVALID_DELETE_CONFIRMATION');
  if (record.status !== 'deleted') service.ingest(record.responseId, readResponse_(FormApp.openById(cfg.FORM_ID).getResponse(record.responseId)), new Date().toISOString());
  service.remove(input, new Date().toISOString());
  return { ok: true, flush: true, message: '掲載削除を確定しました。サイト更新を予約しました。元回答と履歴は保持します。完了はGitHub Actionsで確認してください。', components: [] };
}
function doPost(event) {
  var result;
  try {
    var cfg = settings_();
    if (!event || !event.postData || event.postData.contents.length > 20000) throw new Error('INVALID_BODY');
    var envelope = JSON.parse(event.postData.contents);
    var untrusted = JSON.parse(envelope.payload);
    var local = untrusted && ['local_claim', 'local_ack'].includes(untrusted.kind);
    if (local && !cfg.LOCAL_NOTIFY_SECRET) throw new Error('LOCAL_KEY_REQUIRED');
    var input = verifyEnvelope_(envelope, cfg, local ? cfg.LOCAL_NOTIFY_SECRET : cfg.GAS_HMAC_SECRET); // No sheet reads/writes before authentication.
    result = locked_(function () {
      var store = repository_(cfg); store.reserveNonce(envelope.timestamp, envelope.nonce); var service = runtime_(cfg, store);
      var admin = ['admin_info', 'admin_preview', 'admin_delete'].includes(input.kind);
      if (input.guildId !== cfg.DISCORD_GUILD_ID || input.channelId !== (admin ? cfg.DISCORD_COMMAND_CHANNEL_ID : cfg.DISCORD_CHANNEL_ID)) throw new Error('WRONG_DESTINATION');
      if (local) { service.syncPolicy(); return localNotification_(input, cfg, store); }
      if (admin) return adminOperation_(input, cfg, store, service);
      // Background kick after a durable decision; the five-minute trigger is the fallback.
      if (input.kind === 'flush') { service.publish(); service.notify(); return { ok: true, message: '再試行処理を実行しました。' }; }
      BandReview.command(input);
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) throw new Error('NOT_FOUND');
      // Re-read the live response before accepting a decision on a snapshot.
      var live = FormApp.openById(cfg.FORM_ID).getResponse(record.responseId);
      service.ingest(record.responseId, readResponse_(live), new Date().toISOString());
      record = service.decide(input, new Date().toISOString());
      return { ok: true, flush: record.status !== 'pending', message: record.status === 'pending' ? '投票を記録しました。モデレーター承認 ' + record.votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'approve'; }).length + '/' + record.approveThreshold + '、却下 ' + record.votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'reject'; }).length + '/' + record.rejectThreshold + '。定足数に達するまで公開更新は行いません。' : (record.status === 'approved' ? '承認しました。公開処理を予約しました。完了はGitHub Actionsで確認してください。' : '却下しました。前回の承認済み内容がある場合は、その掲載を維持します。') };
    });
  } catch (_) { result = { ok: false, message: '操作を確定できません。最新版・設定・審査状態を確認してください。' }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
