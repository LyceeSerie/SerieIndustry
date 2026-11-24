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
  p.EVENT_SPREADSHEET_ID=p.EVENT_SPREADSHEET_ID||'1MSWnv5mYUI9cxhnnm7hq6i214zbpW7Ad8rky6s10hXo';
  p.EVENT_SHEET_ID=p.EVENT_SHEET_ID||'0';
  p.EVENTS_ENABLED=p.EVENTS_ENABLED||'true';
  googleId_('EVENT_SPREADSHEET_ID',p.EVENT_SPREADSHEET_ID);
  if([p.REVIEW_SPREADSHEET_ID,p.PUBLIC_SPREADSHEET_ID].includes(p.EVENT_SPREADSHEET_ID)||!/^\d+$/.test(p.EVENT_SHEET_ID))throw new Error('INVALID_EVENT_SETTINGS');
  p.PORTAL_LOGO_FOLDER_ID = p.PORTAL_LOGO_FOLDER_ID || '1JRfnhJcPhHKt2T5N5NKTI3Yd-k_oheB-wNBLGTqsvWhjh4p3H8VB01svi00aqpmwTvTzrI0B';
  p.PORTAL_ICON_FOLDER_ID = p.PORTAL_ICON_FOLDER_ID || '1uiSDdGTidNutU1wDnCfFCXFNG75wqxauDfCpHGFgwkXxRU_q7fijNEvYLZhpkbNN7sdDK8uW';
  p.PORTAL_PHOTO_FOLDER_ID = p.PORTAL_PHOTO_FOLDER_ID || '1bsW_QPAdBxPR-GvpdcPJopFbMST5Gq2HiVsQNGwEk9a_9kA0ms845eu4RyXABMZXzg01N57M';
  p.NOTIFICATION_TRANSPORT = p.NOTIFICATION_TRANSPORT || 'gas';
  if (!['gas', 'local'].includes(p.NOTIFICATION_TRANSPORT)) throw new Error('INVALID_NOTIFICATION_TRANSPORT');
  if (p.NOTIFICATION_TRANSPORT === 'local') {
    if (!/^[a-f0-9]{64}$/i.test(p.LOCAL_NOTIFY_SECRET || '') || p.LOCAL_NOTIFY_SECRET === p.GAS_HMAC_SECRET) throw new Error('INVALID_LOCAL_NOTIFY_SECRET');
  } else if (!p.DISCORD_BOT_TOKEN) throw new Error('MISSING_SETTING_DISCORD_BOT_TOKEN');
  if (p.REVIEW_SPREADSHEET_ID === p.PUBLIC_SPREADSHEET_ID || p.GAS_HMAC_SECRET.length < 32 || !/^\d+$/.test(p.PUBLIC_SHEET_ID)) throw new Error('INVALID_SETTINGS');
  ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID', 'DISCORD_CHANNEL_ID'].forEach(function (key) { if (!/^\d{10,25}$/.test(p[key])) throw new Error('INVALID_DISCORD_SETTING'); });
  if (!/^[\w.-]+$/.test(p.GITHUB_OWNER) || !/^[\w.-]+$/.test(p.GITHUB_REPO) || !/^[\w./-]+$/.test(p.GITHUB_REF)) throw new Error('INVALID_GITHUB_SETTING');
  // Compatibility for existing script properties after the production branch migration.
  if (p.GITHUB_REF === 'feature/spa') p.GITHUB_REF = 'main';
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
  var edits = managedSheet_(book, 'AdminEdits', ['at', 'registrationId', 'fromRevision', 'toRevision', 'field', 'beforeValue', 'afterValue', 'actorId', 'interactionId']);
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
    var edited = record.lastAdminEdit && (!previous || !previous.lastAdminEdit || previous.lastAdminEdit.interactionId !== record.lastAdminEdit.interactionId);
    if (edited) {
      var edit = record.lastAdminEdit; var field = BandReview.fields[edit.fieldIndex];
      edits.appendRow([edit.at, record.id, String(edit.fromRevision), String(record.revision), field, previous && previous.snapshot[field] || '', record.snapshot[field], edit.actorId, edit.interactionId].map(safeCell_));
    }
    if (record.votes && record.votes.length && JSON.stringify(previous && previous.votes || []) !== JSON.stringify(record.votes)) {
      var vote = record.votes[record.votes.length - 1];
      votes.appendRow([new Date().toISOString(), record.id, String(record.revision), vote.actorId, vote.action, vote.role, vote.interactionId].map(safeCell_));
    }
    // Audit first. A retry can add an audit entry twice but must never lose the snapshot.
    if (!previous || previous.revision !== record.revision || previous.status !== record.status || JSON.stringify(previous.votes || []) !== JSON.stringify(record.votes || []) || JSON.stringify(previous.ownerUserIds || []) !== JSON.stringify(record.ownerUserIds || [])) {
      var actor = record.status === 'deleted' ? record.deletedBy : edited ? record.lastAdminEdit.actorId : (record.reviewedBy || record.votes && record.votes.length && record.votes[record.votes.length - 1].actorId || record.submittedBy || (record.lastRestoreFromRevision === record.revision - 1 ? record.restoredBy : ''));
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
  function recoverApproval(id) {
    var rows = audit.getLastRow() > 1 ? audit.getRange(2, 1, audit.getLastRow() - 1, 6).getValues() : [];
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i][1] !== id || rows[i][3] !== 'approved') continue;
      var revision = Number(rows[i][2]);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('INVALID_APPROVAL_HISTORY');
      var content = JSON.parse(rows[i][5]);
      return { revision: revision, snapshot: BandReview.snapshot(BandReview.fields.map(function (key) { return { title: key, value: content[key] }; })) };
    }
    return null;
  }
  return { all: all, save: save, reserveNonce: reserveNonce, recoverApproval: recoverApproval };
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
function publicSchema_(sheet) {
  var expected = BandReview.publicHeaders();
  var width = Math.min(expected.length, sheet.getMaxColumns());
  var rows = sheet.getLastRow() ? sheet.getRange(1, 1, sheet.getLastRow(), width).getValues() : [];
  var actual = rows.length ? rows[0].slice() : [];
  while (actual.length && actual[actual.length - 1] === '') actual.pop();
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  // Both branches added columns independently. Accept only these known layouts,
  // and remap every existing row by header instead of relabelling its cells.
  var base = BandReview.metadata.concat(BandReview.fields.slice(0, 26));
  var supported = [base.slice(0, -1), base, base.concat(['_registrationSource']), base.concat(['_registrationSource', '_updatedAt']), base.concat(['_registrationSource', 'YouTube動画URL'])];
  if (rows.length && !supported.some(function (legacy) { return JSON.stringify(actual) === JSON.stringify(legacy); })) throw new Error('PUBLIC_SCHEMA_MISMATCH');
  if (sheet.getMaxColumns() < expected.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), expected.length - sheet.getMaxColumns());
  var values = [expected].concat(rows.slice(1).map(function (row) {
    return expected.map(function (key) { var index = actual.indexOf(key); return index < 0 ? '' : row[index]; });
  }));
  sheet.getRange(1, 1, values.length, expected.length).setNumberFormat('@').setValues(values.map(function (row) { return row.map(safeCell_); }));
  sheet.setFrozenRows(1);
}
// Called under the script lock. Failures retain the durable queue for maintenance retry.
function wakeNotificationActions_(cfg, store) {
  if (cfg.NOTIFICATION_TRANSPORT !== 'local') return;
  var now = Date.now();
  var pending = store.all().some(function (record) {
    if (record.localDelivery && record.localDelivery.until > now) return false;
    return record.localDelivery || (record.retired && record.retired.length) || record.noticeDirty || record.noticeFormatVersion !== BandReview.noticeFormatVersion;
  });
  if (!pending) return;
  var props = PropertiesService.getScriptProperties();
  if (now - Number(props.getProperty('NOTIFICATION_ACTIONS_LAST_WAKE') || 0) < 60000) return;
  try {
    http_('https://api.github.com/repos/' + cfg.GITHUB_OWNER + '/' + cfg.GITHUB_REPO + '/actions/workflows/discord-notify.yml/dispatches', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cfg.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: JSON.stringify({ ref: cfg.GITHUB_REF, inputs: { test_notification: false } }),
    });
    props.setProperty('NOTIFICATION_ACTIONS_LAST_WAKE', String(now));
  } catch (_) { console.error('[通知起動失敗] ACTIONS_DISPATCH_FAILED（通知待ちは保持し、定期メンテナンスで再試行）'); }
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
    wakeNotifications: function () { wakeNotificationActions_(cfg, store); },
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
      var expected = BandReview.publicHeaders();
      publicSchema_(sheet);
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
    var header = BandReview.publicHeaders();
    diagnosticStep_('公開用タブの見出しを準備', '公開用タブの編集権限と見出しを確認してください。別用途のタブを指定していないか確認してください。', function () {
      publicSchema_(sheet);
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
  if (cfg.FORM_SYNC_ENABLED === 'false') return;
  if (!event || !event.response || !event.source || event.source.getId() !== cfg.FORM_ID) throw new Error('FORM_EVENT_REQUIRED');
  locked_(function () {
    var store = repository_(cfg); var service = runtime_(cfg, store);
    service.ingest(event.response.getId(), readResponse_(event.response), new Date().toISOString());
    service.notify();
  });
}
function runMaintenance() {
  var cfg = settings_();
  var responses = cfg.FORM_SYNC_ENABLED === 'false' ? [] : FormApp.openById(cfg.FORM_ID).getResponses();
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
    || !/^[a-f0-9-]{36}$/i.test(envelope.nonce || '') || typeof envelope.payload !== 'string' || envelope.payload.length > 70000
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
function deleteConfirmation_(record, input, cfg, expires, operation) {
  var text = [operation || 'delete', record.id, record.revision, input.actorId, input.guildId, input.channelId, expires].join('\n');
  return hex_(Utilities.computeHmacSha256Signature(text, cfg.GAS_HMAC_SECRET, Utilities.Charset.UTF_8)).slice(0, 24);
}
function restoreApproval_(record, store) {
  if (!record.restoreBackup) return store.recoverApproval(record.id);
  if (!record.restoreBackup.approvedSnapshot) return null;
  var backup = record.restoreBackup;
  if (!Number.isSafeInteger(backup.approvedRevision) || backup.approvedRevision < 1) throw new Error('INVALID_APPROVAL_BACKUP');
  return { revision: backup.approvedRevision, snapshot: BandReview.snapshot(BandReview.fields.map(function (key) { return { title: key, value: backup.approvedSnapshot[key] }; })) };
}
function adminEdit_(input, cfg, store, service) {
  var record = store.all().find(function (item) { return item.id === input.registrationId; });
  if (!record || record.status === 'deleted') throw new Error('EDIT_UNAVAILABLE');
  if (input.kind === 'admin_edit_start') {
    service.ingest(record.responseId, currentContent_(record, cfg), new Date().toISOString());
    record = store.all().find(function (item) { return item.id === input.registrationId; });
    var expires = Math.floor(Date.now() / 1000) + 300;
    var ticket = 'band:editpick:' + record.id + ':' + record.revision + ':' + expires + ':' + deleteConfirmation_(record, input, cfg, expires, 'editpick');
    var menus = [];
    for (var offset = 0; offset < BandReview.fields.length; offset += 25) {
      var group = offset / 25;
      menus.push({ type: 1, components: [{ type: 3, custom_id: group ? ticket.replace('band:editpick:', 'band:editpick' + (group + 1) + ':') : ticket, placeholder: group ? '追加の編集項目' : '編集する項目', min_values: 1, max_values: 1,
        options: BandReview.fields.slice(offset, offset + 25).map(function (field, index) { return { label: field.slice(0, 100), value: String(offset + index), description: (record.snapshot[field] || '未入力').replace(/[\r\n\t]/g, ' ').slice(0, 90) }; }) }] });
    }
    return { ok: true, flush: false, message: '編集する項目を選択してください。\n活動名：' + record.snapshot['活動名'].replace(/[@`*_<>\r\n]/g, ' ').slice(0, 120) + '\n登録ID：' + record.id + '\nフォームの元回答は変更しません。選択画面は5分間有効です。', components: menus };
  }
  if (!['admin_edit_field', 'admin_edit_save'].includes(input.kind) || !Number.isSafeInteger(input.revision) || !Number.isSafeInteger(input.fieldIndex) || !BandReview.fields[input.fieldIndex]
    || !Number.isSafeInteger(input.expires) || input.expires < Math.floor(Date.now() / 1000) || input.expires > Math.floor(Date.now() / 1000) + 300
    || !/^[a-f0-9]{24}$/.test(input.confirmation || '')) throw new Error('INVALID_EDIT_TICKET');
  var purpose = input.kind === 'admin_edit_field' ? 'editpick' : 'edit:' + input.fieldIndex;
  var signature = deleteConfirmation_({ id: record.id, revision: input.revision }, input, cfg, input.expires, purpose);
  var different = 0;
  for (var i = 0; i < signature.length; i++) different |= signature.charCodeAt(i) ^ input.confirmation.charCodeAt(i);
  if (different) throw new Error('INVALID_EDIT_TICKET');
  var raw = currentContent_(record, cfg);
  if (input.kind === 'admin_edit_save') {
    var previousEdit = record.lastAdminEdit;
    var updated = service.edit(input, new Date().toISOString(), raw);
    var unchanged = updated.revision === input.revision || previousEdit && updated.lastAdminEdit && previousEdit.interactionId === updated.lastAdminEdit.interactionId;
    return { ok: true, flush: ['queued', 'failed'].includes(updated.publishStatus), message: unchanged ? 'すでに保存済み、または内容に変更がありません。重複した編集は行いません。' : '応急編集を保存しました。' + (updated.approvedSnapshot ? '選択した項目だけを掲載へ反映する更新を予約しました。ほかの未承認内容は公開しません。' : '未承認の登録のため承認待ちを維持します。') + '\nフォーム側で同じ項目の値が変わると、フォームの内容を優先します。', components: [] };
  }
  service.ingest(record.responseId, raw, new Date().toISOString());
  record = store.all().find(function (item) { return item.id === input.registrationId; });
  if (record.revision !== input.revision) throw new Error('STALE_EDIT');
  var field = BandReview.fields[input.fieldIndex]; var value = record.snapshot[field] || '';
  if (value.length > 4000) return { ok: true, flush: false, message: 'この項目は4000文字を超えるため、フォームの編集で対応してください。', components: [] };
  var expires = Math.floor(Date.now() / 1000) + 300;
  var ticket = 'band:editopen:' + record.id + ':' + record.revision + ':' + input.fieldIndex + ':' + expires + ':' + deleteConfirmation_(record, input, cfg, expires, 'edit:' + input.fieldIndex);
  return { ok: true, flush: false, message: '現在の内容を確認し、「内容を編集」から入力してください。空欄にすると項目をクリアします（活動名は必須）。入力画面は5分間有効です。',
    embeds: [{ title: field, description: value || '（未入力）', footer: { text: value ? 'current-value' : 'empty-value' } }],
    components: [{ type: 1, components: [{ type: 2, style: 1, label: '内容を編集', custom_id: ticket }] }] };
}
function currentContent_(record, cfg) {
  if (['admin','user'].includes(record.source) || String(record.responseId).indexOf('admin:') === 0) return BandReview.snapshot(BandReview.fields.map(function (key) { return { title: key, value: record.snapshot[key] || '' }; }));
  return readResponse_(FormApp.openById(cfg.FORM_ID).getResponse(record.responseId));
}
function adminOperation_(input, cfg, store, service, upload) {
  if (input.actorRole !== 'admin' || !/^\d{10,25}$/.test(input.actorId || '') || !/^\d{10,25}$/.test(input.interactionId || '')) throw new Error('ADMIN_REQUIRED');
  if (input.kind && input.kind.indexOf('admin_manage_')===0)return managementCommand_(input,cfg,store,service,upload);
  if (input.kind === 'admin_assign_owner') {
    service.assignOwner(input,new Date().toISOString());service.publish();
    return {ok:true,flush:true,message:'編集権の移譲を保存しました。ユーザーへ移譲した場合は本人が登録画面で確認してください。'};
  }
  if (input.kind === 'admin_add') {
    var added = service.addBatch(input, new Date().toISOString());
    return { ok: true, flush: true, message: '運営登録：' + added.length + '件。承認後に公開されます。\n' + added.map(function (record) { return record.id; }).join('\n') };
  }
  if (input.kind === 'admin_info') {
    var hasId = input.registrationId !== undefined; var hasName = input.name !== undefined;
    if (hasId === hasName || (hasId && (typeof input.registrationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.registrationId)))
      || (hasName && (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100))
      || (input.page !== undefined && (!hasName || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1000000))) throw new Error('INVALID_SEARCH');
    var normalize = function (value) { return String(value || '').normalize('NFKC').toLowerCase().trim(); };
    var matches = store.all().filter(function (item) { return hasId ? item.id === input.registrationId.toLowerCase() : normalize(item.snapshot['活動名']).indexOf(normalize(input.name)) >= 0; });
    if (!matches.length) return { ok: true, flush: false, message: '該当する登録はありません。' };
    var page = input.page || 1; var pages = Math.ceil(matches.length / 5);
    if (page > pages) return { ok: true, flush: false, message: 'ページ範囲外です。全' + pages + 'ページです。pageを指定し直してください。' };
    var labels = { pending: '承認待ち', approved: '承認済み', rejected: '却下', deleted: '掲載削除済み' };
    var entries = matches.slice((page - 1) * 5, page * 5).map(function (item) {
      return '活動名：' + item.snapshot['活動名'].replace(/[@`*_<>\r\n]/g, ' ').slice(0, 120) + '\n登録ID：' + item.id + '\n版：' + item.revision + '／状態：' + (labels[item.status] || item.status) + '／掲載：' + (item.approvedSnapshot ? 'あり' : 'なし') + '／登録元：' + BandReview.registrationSource(item) + '／応急編集：' + (Object.keys(item.adminOverrides || {}).length ? 'あり' : 'なし');
    });
    return { ok: true, flush: false, message: '検索結果：' + matches.length + '件（' + page + '/' + pages + 'ページ）\n\n' + entries.join('\n\n') + '\n\n掲載削除は /band-delete id:登録ID' + (pages > 1 ? '\n続きは同じnameとpageを指定してください（1ページ5件）。' : '') };
  }
  if (!/^[a-f0-9-]{36}$/i.test(input.registrationId || '')) throw new Error('INVALID_REGISTRATION_ID');
  if (['admin_edit_start', 'admin_edit_field', 'admin_edit_save'].includes(input.kind)) return adminEdit_(input, cfg, store, service);
  var record = store.all().find(function (item) { return item.id === input.registrationId; });
  if (!record) throw new Error('NOT_FOUND');
  if(['admin_reopen_preview','admin_reopen'].includes(input.kind)){
    if(input.kind==='admin_reopen_preview'){
      if(record.status!=='rejected'||input.revision!==undefined&&record.revision!==input.revision||input.messageId!==undefined&&record.messageId!==input.messageId)throw new Error('STALE_REOPEN');
      var reopenExpires=Math.floor(Date.now()/1000)+300;
      var reopenSignature=deleteConfirmation_(record,input,cfg,reopenExpires,'reopen');
      return {ok:true,flush:false,message:'「'+record.snapshot['活動名'].replace(/[@`*_<>]/g,'').slice(0,200)+'」の却下を取り消して、承認待ちへ戻しますか？\n票数をリセットし、新しい版の審査通知を送信します。この操作だけでは承認・公開されません。前回の承認済み内容は維持します。確認は5分間有効です。',components:[{type:1,components:[{type:2,style:1,label:'却下を取り消して再通知',custom_id:'band:reopen:'+record.id+':'+record.revision+':'+reopenExpires+':'+reopenSignature}]}]};
    }
    if(!Number.isSafeInteger(input.revision)||!Number.isSafeInteger(input.expires)||input.expires<Math.floor(Date.now()/1000)||input.expires>Math.floor(Date.now()/1000)+300||!/^[a-f0-9]{24}$/.test(input.confirmation||''))throw new Error('INVALID_DELETE_CONFIRMATION');
    var reopenExpected=deleteConfirmation_({id:record.id,revision:input.revision},input,cfg,input.expires,'reopen'),reopenMismatch=0;
    for(var ri=0;ri<reopenExpected.length;ri++)reopenMismatch|=reopenExpected.charCodeAt(ri)^input.confirmation.charCodeAt(ri);
    if(reopenMismatch)throw new Error('INVALID_DELETE_CONFIRMATION');
    var reopened=service.reopen(input,new Date().toISOString());
    return {ok:true,flush:true,message:'却下を取り消し、承認待ちの再通知を予約しました。新しい版の通知で承認・却下を行ってください。通知が届かない場合は通知プログラムの稼働状況を確認してください。',components:[]};
  }
  var restoring = ['admin_restore_preview', 'admin_restore'].includes(input.kind);
  var operation = restoring ? 'restore' : 'delete';
  if (input.kind === 'admin_preview' || input.kind === 'admin_restore_preview') {
    if (!restoring && record.status === 'deleted') return { ok: true, flush: false, message: 'この登録は掲載削除済みです。', components: [] };
    if (restoring && record.status !== 'deleted') return { ok: true, flush: false, message: 'この登録は削除されていないか、すでに復元済みです。', components: [] };
    if (!restoring) service.ingest(record.responseId, currentContent_(record, cfg), new Date().toISOString());
    record = store.all().find(function (item) { return item.id === input.registrationId; });
    var expires = Math.floor(Date.now() / 1000) + 300;
    var signature = deleteConfirmation_(record, input, cfg, expires, operation);
    var detail = restoring ? (restoreApproval_(record, store) ? '削除前の承認済み内容を再掲載し、未承認の変更は承認待ちに戻します。' : '承認履歴がないため承認待ちに戻します。自動掲載はしません。') : '元回答と履歴は残し、サイトから非表示にします。';
    return { ok: true, flush: false, message: '「' + record.snapshot['活動名'].replace(/[@`*_<>]/g, '').slice(0, 200) + '」を' + (restoring ? '復元' : '掲載削除') + 'しますか？\n登録ID：' + record.id + '\n版：' + record.revision + '\n' + detail + '確認は5分間有効です。',
      components: [{ type: 1, components: [{ type: 2, style: restoring ? 3 : 4, label: restoring ? '復元を確定' : '掲載削除を確定', custom_id: 'band:' + operation + ':' + record.id + ':' + record.revision + ':' + expires + ':' + signature }] }] };
  }
  if (!['admin_delete', 'admin_restore'].includes(input.kind) || !Number.isSafeInteger(input.revision) || !Number.isSafeInteger(input.expires)
    || input.expires < Math.floor(Date.now() / 1000) || input.expires > Math.floor(Date.now() / 1000) + 300
    || !/^[a-f0-9]{24}$/.test(input.confirmation || '')) throw new Error('INVALID_DELETE_CONFIRMATION');
  var expected = deleteConfirmation_({ id: record.id, revision: input.revision }, input, cfg, input.expires, operation);
  var mismatch = 0;
  for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ input.confirmation.charCodeAt(i);
  if (mismatch) throw new Error('INVALID_DELETE_CONFIRMATION');
  if (restoring) {
    if (record.status !== 'deleted' && record.lastRestoreFromRevision === input.revision) return { ok: true, flush: ['queued', 'failed'].includes(record.publishStatus), message: 'すでに復元済みです。重複した復元は行いません。', components: [] };
    var content = null;
    try { content = currentContent_(record, cfg); } catch (_) { /* Use retained review data if the original response cannot be read. */ }
    var restored = service.restore(input, new Date().toISOString(), content, restoreApproval_(record, store));
    return { ok: true, flush: ['queued', 'failed'].includes(restored.publishStatus), message: restored.approvedSnapshot ? '復元しました。削除前の承認済み内容の再掲載を予約しました。未承認の内容は公開しません。完了はGitHub Actionsで確認してください。' : '承認待ちへ復元しました。承認されるまで掲載されません。', components: [] };
  }
  if (record.status === 'deleted') return { ok: true, flush: ['queued', 'failed'].includes(record.publishStatus), message: 'すでに掲載削除済みです。重複した削除は行いません。', components: [] };
  if (record.status !== 'deleted') service.ingest(record.responseId, currentContent_(record, cfg), new Date().toISOString());
  service.remove(input, new Date().toISOString());
  return { ok: true, flush: true, message: '掲載削除を確定しました。サイト更新を予約しました。元回答と履歴は保持します。完了はGitHub Actionsで確認してください。', components: [] };
}
function reviewFailure_(code, record, input) {
  var requested = Number.isSafeInteger(input.revision) ? input.revision : null;
  var current = Number.isSafeInteger(record.revision) ? record.revision : null;
  console.error('[審査拒否] ' + code + ' requestedRevision=' + requested + ' currentRevision=' + current + ' notificationPending=' + (!!record.noticeDirty || !record.messageId));
  return { ok: false, code: code, retryable: false, details: {
    requestedRevision: requested, currentRevision: current,
    notificationPending: !!record.noticeDirty || !record.messageId,
    currentMessageId: record.messageId || ''
  } };
}
function doPost(event) {
  var result;
  try {
    var cfg = settings_();
    if (!event || !event.postData || event.postData.contents.length > 24*1024*1024) throw new Error('INVALID_BODY');
    var outer = JSON.parse(event.postData.contents);
    var upload = outer && outer.uploadTicket ? outer : null;
    if (!upload && event.postData.contents.length > 150000) throw new Error('INVALID_BODY');
    var envelope = upload ? upload.uploadTicket : outer;
    var untrusted = JSON.parse(envelope.payload);
    var local = untrusted && ['local_claim', 'local_ack'].includes(untrusted.kind);
    if (local && !cfg.LOCAL_NOTIFY_SECRET) throw new Error('LOCAL_KEY_REQUIRED');
    var input = verifyEnvelope_(envelope, cfg, local ? cfg.LOCAL_NOTIFY_SECRET : cfg.GAS_HMAC_SECRET); // No sheet reads/writes before authentication.
    result = locked_(function () {
      var store = repository_(cfg); store.reserveNonce(envelope.timestamp, envelope.nonce); var service = runtime_(cfg, store);
      var admin = ['admin_reopen_preview','admin_reopen','admin_assign_owner', 'admin_add', 'admin_info', 'admin_preview', 'admin_delete', 'admin_restore_preview', 'admin_restore', 'admin_edit_start', 'admin_edit_field', 'admin_edit_save'].includes(input.kind) || typeof input.kind==='string'&&input.kind.indexOf('admin_manage_')===0;
      if (input.guildId !== cfg.DISCORD_GUILD_ID || !(['admin_reopen_preview','admin_reopen'].includes(input.kind)?[cfg.DISCORD_CHANNEL_ID,cfg.DISCORD_COMMAND_CHANNEL_ID]:[admin?cfg.DISCORD_COMMAND_CHANNEL_ID:cfg.DISCORD_CHANNEL_ID]).includes(input.channelId)) throw new Error('WRONG_DESTINATION');
      if (input.kind && input.kind.indexOf('portal_') === 0) return portalOperation_(input, cfg, store, service, upload);
      if (local) { service.syncPolicy(); return localNotification_(input, cfg, store); }
      if (admin) return adminOperation_(input, cfg, store, service, upload);
      // Background kick after a durable decision; the five-minute trigger is the fallback.
      if (input.kind === 'flush') { service.publish(); service.notify(); return { ok: true, message: '再試行処理を実行しました。' }; }
      BandReview.command(input);
      var record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (!record) throw new Error('NOT_FOUND');
      if (record.status === 'deleted') return reviewFailure_('REGISTRATION_DELETED', record, input);
      // Re-read the live response before accepting a decision on a snapshot.
      var content;
      try { content = currentContent_(record, cfg); }
      catch (_) { throw new Error('FORM_RESPONSE_READ_FAILED'); }
      service.ingest(record.responseId, content, new Date().toISOString());
      record = store.all().find(function (item) { return item.id === input.registrationId; });
      if (record.revision !== input.revision) return reviewFailure_('STALE_REVIEW', record, input);
      if (!record.messageId) return reviewFailure_('NOTIFICATION_PENDING', record, input);
      if (record.messageId !== input.messageId) return reviewFailure_('WRONG_REVIEW_MESSAGE', record, input);
      if (record.revision === input.revision && record.messageId === input.messageId && ['approved', 'rejected'].includes(record.status)) return { ok: true, flush: ['queued', 'failed'].includes(record.publishStatus), message: 'すでに' + (record.status === 'approved' ? '承認' : '却下') + '済みです。審査結果の変更や重複した投票は行いません。' };
      var alreadyVoted = (record.votes || []).some(function (vote) { return vote.actorId === input.actorId && vote.action === input.action && vote.role === input.actorRole; });
      record = service.decide(input, new Date().toISOString());
      return { ok: true, flush: ['queued', 'failed'].includes(record.publishStatus), message: record.status === 'pending' ? (alreadyVoted ? 'すでに投票済みです。票数は変わりません。' : '投票を記録しました。') + 'モデレーター承認 ' + record.votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'approve'; }).length + '/' + record.approveThreshold + '、却下 ' + record.votes.filter(function (vote) { return vote.role === 'moderator' && vote.action === 'reject'; }).length + '/' + record.rejectThreshold + '。定足数に達するまで公開更新は行いません。' : (record.status === 'approved' ? '承認しました。公開処理を予約しました。完了はGitHub Actionsで確認してください。' : '却下しました。前回の承認済み内容がある場合は、その掲載を維持します。') };
    });
    // Login and reads never create notifications. Avoid a second global lock
    // and a GitHub wake-up check for these high-frequency portal requests.
    var portalNeedsWake = !input.kind || input.kind.indexOf('portal_') !== 0 || ['portal_save', 'portal_delete', 'portal_assign_owner'].includes(input.kind);
    if (result.ok && !local && portalNeedsWake) {
      try { locked_(function () { wakeNotificationActions_(cfg, repository_(cfg)); }); }
      catch (_) { console.error('[通知起動保留] メンテナンスで再試行します。'); }
    }
  } catch (error) {
    var busy = error && error.message === 'BUSY_RETRY';
    var editErrors = {STALE_REOPEN:'却下状態・版・通知が変更されています。最新の却下済み通知の「再承認」から確認し直してください。掲載削除済みの場合はband-restoreを使用してください。',INVALID_EVENT:'イベントの入力内容・日時・参加バンドを確認してください。',EVENT_NOT_FOUND:'イベントが見つかりません。',STALE_EVENT:'イベントが更新または削除されています。再読み込みして確認してください。',EVENT_DISABLED:'イベント登録は停止中です。',EVENT_CONFIGURATION:'イベントシートの接続設定を確認してください。',EVENT_SCHEMA_MISMATCH:'イベント公開シートの列が一致していません。', INVALID_READING:'ひらがなで入力してください。', PORTAL_DAILY_LIMIT:'本日の保存回数の上限です。', PORTAL_DISABLED:'本人登録は停止中です。', PORTAL_FORBIDDEN:'このバンドの編集権限がありません。', PORTAL_INVALID_REQUEST:'入力を確認してください。', PORTAL_BAND_LIMIT:'管理できるバンド数の上限です。', PORTAL_CONSENT_REQUIRED:'登録時の同意事項をご確認ください。画面を再読み込みして同意後に進んでください。', PORTAL_SESSION_EXPIRED:'ログインし直してください。', UPLOAD_DAILY_LIMIT:'本日の画像送信上限です。', UPLOAD_PENDING:'前回の画像保存を確認中です。運営へ連絡してください。', UPLOAD_CONFIGURATION:'画像保存先が設定されていません。', INVALID_IMAGE:'画像の容量・寸法を確認してください。', INVALID_PNG:'PNG画像を確認してください。', INVALID_YOUTUBE_URL: 'YouTube動画URLにhttpsの動画URLを入力してください。チャンネルURL・iframeコードは使用できません。', INVALID_IMPORT: 'JSONの項目名・文字列型・1〜20件の配列を確認し、修正して再実行してください。', STALE_OWNERSHIP:'所有者情報が更新されています。再読み込みして確認してください。', STALE_EDIT: '最新状態が変わったため保存していません。band-editから開き直してください。', INVALID_EDIT_TICKET: '編集画面の期限が切れたか無効です。band-editから開き直してください。', EDIT_UNAVAILABLE: 'この登録は編集できません。登録IDと削除状態を確認してください。', MISSING_BAND_NAME: '活動名は空欄にできません。', INVALID_EDIT: '編集内容の文字数・項目を確認してください。', ANSWER_TOO_LONG: '登録全体の文字数上限を超えるため保存していません。', NOT_FOUND: '登録IDが見つかりません。管理人がband-infoで確認してください。', FORM_RESPONSE_READ_FAILED: '元フォームの回答を読み取れません。管理人がフォームの回答とGAS実行アカウントの権限を確認してください。', STALE_VOTE: '以前の投票リクエストです。最新の通知で現在の投票先を確認し、変更したい場合だけ再操作してください。', INVALID_DELETE_CONFIRMATION: '削除・復元・再審査の確認が期限切れ、または無効です。対応するコマンドから確認画面を開き直してください。', STALE_DELETE: '登録が更新されています。band-infoで現在の状態を確認し、削除する場合はband-deleteを再実行してください。', STALE_RESTORE: '登録が更新されています。band-infoで削除状態を確認し、復元する場合はband-restoreを再実行してください。', ROLE_REQUIRED: '運営ロールが必要です。管理人またはモデレーターロールを確認してください。', ADMIN_REQUIRED: '管理人専用の操作です。管理人に実行を依頼してください。', WRONG_DESTINATION: '操作チャンネルが設定と一致しません。通知チャンネルと管理人用チャンネルの設定を確認してください。', INTEGRATION_DISABLED: 'GAS連携が停止しています。管理人がENABLEDを確認してください。', INVALID_SIGNATURE: '署名を検証できません。管理人がGASとWorkerのGAS_HMAC_SECRETを一致させてください。', INVALID_ENVELOPE: 'リクエストの形式または有効期限が無効です。GASとWorkerの配置を確認して再操作してください。', REPLAY: '処理済みのリクエストです。現在の状態を確認してDiscordから再操作してください。' };
    var editCode = error && Object.prototype.hasOwnProperty.call(editErrors, error.message) ? error.message : '';
    result = { ok: false, retryable: busy, code: busy ? 'BUSY_RETRY' : editCode || 'OPERATION_REJECTED', message: busy ? '別の操作を処理中です。完了後に通知の状態を確認してください。' : editCode ? editErrors[editCode] : '操作を確定できません。最新版・設定・審査状態を確認してください。' };
    var kind = error && ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'].includes(error.name) ? error.name : 'Error';
    var locations = String(error && error.stack || '').match(/\b(?:Code|Core)(?:\.gs)?:\d+(?::\d+)?\b/g) || [];
    if(input&&typeof input.kind==='string'&&input.kind.indexOf('portal_')===0){
      result.diagnostic={type:kind,locations:locations.slice(0,3),stage:['SAVE_BAND','SAVE_COUNTER','UPLOAD_BLOB','UPLOAD_CREATE_FILE','UPLOAD_SHARE_FILE'].includes(error.portalStage)?error.portalStage:'PORTAL'};
      if(input.kind==='portal_upload'&&input.diagnosticAdmin===true){
        var detail=String(error.message||'');
        Object.keys(cfg||{}).filter(function(key){return /TOKEN|SECRET|KEY/.test(key);}).forEach(function(key){if(cfg[key])detail=detail.split(String(cfg[key])).join('[REDACTED]');});
        result.diagnostic.detail=detail.replace(/https?:\/\/\S+/g,'[URL]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[EMAIL]').replace(/[A-Za-z0-9_-]{30,}/g,'[ID]').slice(0,300);
      }
    }
    console.error('[操作失敗] ' + result.code + ' 種別：' + kind + (locations.length ? ' コード位置：' + locations.slice(0, 3).join(', ') : ''));
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


// Portal requests are accepted only after Worker HMAC verification and the shared lock.
function portalDiagnosticStep_(stage,callback){
  try{return callback();}catch(error){error.portalStage=stage;throw error;}
}
function managementUsers_(book){
  var sheet=managedSheet_(book,'WebUsers',['actorId','username','displayName','updatedAt']);
  return (sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues():[]).filter(function(row){return /^\d{10,25}$/.test(row[0])&&row[1];}).map(function(row){return {id:String(row[0]),username:String(row[1]),displayName:String(row[2]||row[1])};});
}
function portalOperation_(input, cfg, store, service, upload) {
  if (cfg.PORTAL_ENABLED !== 'true') throw new Error('PORTAL_DISABLED');
  if (input.actorRole !== 'user' || !/^\d{10,25}$/.test(input.actorId || '') || !/^[a-f0-9-]{36}$/i.test(input.sessionId || '')) throw new Error('PORTAL_FORBIDDEN');
  var book = SpreadsheetApp.openById(cfg.REVIEW_SPREADSHEET_ID);
  var sessions = managedSheet_(book,'WebSessions',['sessionId','actorId','expires']);
  var rows = sessions.getLastRow()>1?sessions.getRange(2,1,sessions.getLastRow()-1,3).getValues():[];
  if(input.kind==='portal_session') {
    if(!Number.isSafeInteger(input.expires)||input.expires<=Date.now()||input.expires>Date.now()+8*3600000+10000)throw new Error('PORTAL_INVALID_REQUEST');
    if(rows.some(function(row){return row[0]===input.sessionId&&row[1]!==input.actorId;}))throw new Error('PORTAL_FORBIDDEN');
    if(!rows.some(function(row){return row[0]===input.sessionId;})) {
      var live=rows.filter(function(row){return Number(row[2])>Date.now();});
      live.push([input.sessionId,input.actorId,String(input.expires)]);
      while(live.length<rows.length)live.push(['','','']);
      if(sessions.getMaxRows()<live.length+1)sessions.insertRowsAfter(sessions.getMaxRows(),live.length+1-sessions.getMaxRows());
      sessions.getRange(2,1,live.length,3).setNumberFormat('@').setValues(live);
    }
    if(typeof input.username==='string'&&input.username.trim()){
      var users=managedSheet_(book,'WebUsers',['actorId','username','displayName','updatedAt']);
      var profiles=users.getLastRow()>1?users.getRange(2,1,users.getLastRow()-1,4).getValues():[];
      var profileAt=profiles.findIndex(function(row){return row[0]===input.actorId;});
      var clean=function(value){return String(value||'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,100);};
      users.getRange(profileAt<0?users.getLastRow()+1:profileAt+2,1,1,4).setNumberFormat('@').setValues([[input.actorId,"'"+clean(input.username),"'"+clean(input.displayName||input.username),new Date().toISOString()]]);
    }
    return {ok:true};
  }
  var at=rows.findIndex(function(row){return row[0]===input.sessionId&&row[1]===input.actorId&&Number(row[2])>Date.now();});
  if(at<0)throw new Error('PORTAL_SESSION_EXPIRED');
  if(input.kind==='portal_logout'){sessions.getRange(at+2,3,1,1).setValues([['0']]);return {ok:true};}
  var termsVersion='2026-11-21-v1';
  var consents=managedSheet_(book,'WebConsents',['actorId','version','acceptedAt']);
  var consentRows=consents.getLastRow()>1?consents.getRange(2,1,consents.getLastRow()-1,3).getValues():[];
  var consented=consentRows.some(function(row){return row[0]===input.actorId&&row[1]===termsVersion;});
  if(input.kind==='portal_consent'){
    if(input.accepted!==true||input.version!==termsVersion)throw new Error('PORTAL_CONSENT_REQUIRED');
    if(!consented)consents.getRange(consents.getLastRow()+1,1,1,3).setNumberFormat('@').setValues([[input.actorId,termsVersion,new Date().toISOString()]]);
    return {ok:true};
  }
  if(!consented){
    if(input.kind==='portal_list')return {ok:true,records:[],consentRequired:true,termsVersion:termsVersion};
    throw new Error('PORTAL_CONSENT_REQUIRED');
  }
  if(input.kind==='portal_list')return managementBandList_(input,cfg,store,book);
  if(['portal_event_list','portal_event_save','portal_event_delete'].includes(input.kind))return managementEvents_(input,cfg,book,store);
  if(input.kind==='portal_assign_owner'){
    if(input.portalAdmin!==true)throw new Error('PORTAL_FORBIDDEN');
    if(!Number.isSafeInteger(input.revision)||!Number.isSafeInteger(input.ownershipVersion)||!(input.ownerId==='admin'||/^\d{10,25}$/.test(input.ownerId||''))||!/^[a-f0-9-]{36}$/i.test(input.requestId||''))throw new Error('PORTAL_INVALID_REQUEST');
    var assigned=service.assignOwner(Object.assign({},input,{actorRole:'admin'}),new Date().toISOString());
    service.publish();
    return {ok:true,id:assigned.id,registrationSource:BandReview.registrationSource(assigned),ownershipType:assigned.ownershipType,ownerUserIds:assigned.ownerUserIds,ownershipVersion:assigned.ownershipVersion||0,ownershipAudit:(assigned.ownershipAudit||[]).slice(-5)};
  }
  if(input.kind==='portal_delete'){
    if(input.portalAdmin!==true)throw new Error('PORTAL_FORBIDDEN');
    if(!/^[a-f0-9-]{36}$/i.test(input.requestId||''))throw new Error('PORTAL_INVALID_REQUEST');
    var deleted=service.remove({actorRole:'admin',actorId:input.actorId,registrationId:input.registrationId,revision:input.revision,interactionId:input.requestId},new Date().toISOString());
    service.publish();
    return {ok:true,id:deleted.id,status:deleted.status,revision:deleted.revision};
  }
  if(input.kind==='portal_save')return managementSaveBand_(input,cfg,store,service,book);
  if(input.kind!=='portal_upload'||!upload)throw new Error('PORTAL_INVALID_REQUEST');
  return managementUpload_(input,cfg,book,upload);
}


// Run manually once to grant Drive access before enabling the public portal.
function initializePortalIntegration() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/drive']);
  var cfg=settings_();
  ['PORTAL_LOGO_FOLDER_ID','PORTAL_ICON_FOLDER_ID','PORTAL_PHOTO_FOLDER_ID'].forEach(function(key){
    var folder=DriveApp.getFolderById(cfg[key]);
    console.log('[保存先確認] '+key+'：'+folder.getName());
    PropertiesService.getScriptProperties().setProperty(key,cfg[key]);
  });
  var book=SpreadsheetApp.openById(cfg.REVIEW_SPREADSHEET_ID);
  managedSheet_(book,'WebSessions',['sessionId','actorId','expires']);
  managedSheet_(book,'WebLimits',['key','count']);
  managedSheet_(book,'WebUploads',['uploadId','actorId','field','sha256','bytes','at','fileId','url']);
  console.log('本人登録用の保存先を確認しました。画像の作成・移動・共有変更は行っていません。');
}


function eventPublicSheet_(cfg){
 var sheet=SpreadsheetApp.openById(cfg.EVENT_SPREADSHEET_ID).getSheetById(Number(cfg.EVENT_SHEET_ID));if(!sheet)throw new Error('EVENT_CONFIGURATION');
 if(!sheet.getLastRow()){sheet.getRange(1,1,1,BandEvents.headers.length).setNumberFormat('@').setValues([BandEvents.headers]);sheet.setFrozenRows(1);}
 var actual=sheet.getRange(1,1,1,BandEvents.headers.length).getValues()[0];if(JSON.stringify(actual)!==JSON.stringify(BandEvents.headers))throw new Error('EVENT_SCHEMA_MISMATCH');return sheet;
}
function initializeEventIntegration(){var cfg=settings_();eventPublicSheet_(cfg);console.log('イベント公開シートの列と書込権限を確認しました。');}
function managementEvents_(input,cfg,book,store){
 if(cfg.EVENTS_ENABLED!=='true')throw new Error('EVENT_DISABLED');
 var sheet=managedSheet_(book,'LiveEvents',['eventId','recordJson']);
 var values=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues():[];
 var records=values.map(function(row){return JSON.parse(row[1]);}),bands=store.all().filter(function(record){return record.status!=='deleted';}),managed=input.portalAdmin===true;
 function owns(id){var band=bands.find(function(record){return record.id===id;});return !!band&&(band.ownerUserIds||[]).includes(input.actorId);}
 function canEdit(event){return managed||!!event.ownerBandId&&owns(event.ownerBandId);}
 function sync(){var publicSheet=eventPublicSheet_(cfg),rows=BandEvents.rows(records),height=Math.max(rows.length,publicSheet.getLastRow());while(rows.length<height)rows.push(BandEvents.headers.map(function(){return '';}));if(publicSheet.getMaxRows()<height)publicSheet.insertRowsAfter(publicSheet.getMaxRows(),height-publicSheet.getMaxRows());publicSheet.getRange(1,1,height,BandEvents.headers.length).setNumberFormat('@').setValues(rows.map(function(row){return row.map(safeCell_);}));}
 var directory=bands.filter(function(record){return managed||record.approvedSnapshot||owns(record.id);}).map(function(record){return {id:record.id,name:(record.approvedSnapshot||record.snapshot)['活動名']};});
 if(input.kind==='portal_event_list')return {ok:true,events:records.filter(function(record){return record.status==='active';}).map(BandEvents.publicEvent),bands:directory};
 if(!/^[a-f0-9-]{36}$/i.test(input.requestId||''))throw new Error('PORTAL_INVALID_REQUEST');
 var saving=input.kind==='portal_event_save',event=saving?BandEvents.normalize(input.event):null,id=saving?event.id:input.eventId;
 if(!saving&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw new Error('INVALID_EVENT');
 var record=records.find(function(item){return item.id===id||saving&&!id&&item.creationRequestId===input.requestId;});
 if((id&&!record)||!saving&&!record)throw new Error('EVENT_NOT_FOUND');
 if(record&&!canEdit(record.event)||saving&&!canEdit(event)||!managed&&record&&saving&&record.event.ownerBandId!==event.ownerBandId)throw new Error('PORTAL_FORBIDDEN');
 var digest=hash_(JSON.stringify({kind:input.kind,event:saving?event:null,eventId:id||'',revision:input.revision}));
 var previous=record&&(record.operations||[]).find(function(operation){return operation.id===input.requestId;});
 if(previous){if(previous.actor!==input.actorId||previous.hash!==digest)throw new Error('PORTAL_INVALID_REQUEST');if(previous.revision!==record.revision)throw new Error('STALE_EVENT');sync();return saving?{ok:true,event:BandEvents.publicEvent(record)}:{ok:true,id:record.id,revision:record.revision};}
 if(record&&(record.status!=='active'||!Number.isSafeInteger(input.revision)||record.revision!==input.revision))throw new Error('STALE_EVENT');
 if(saving){event.participants.forEach(function(participant){if(!participant.bandId)return;var band=bands.find(function(item){return item.id===participant.bandId;});if(!band||!managed&&!band.approvedSnapshot&&!owns(band.id))throw new Error('INVALID_EVENT');participant.name=(band.approvedSnapshot||band.snapshot)['活動名'];});}
 var limits=managedSheet_(book,'WebLimits',['key','count']),key=new Date().toISOString().slice(0,10)+':events:'+input.actorId,limitRows=limits.getLastRow()>1?limits.getRange(2,1,limits.getLastRow()-1,2).getValues():[],limitAt=limitRows.findIndex(function(row){return row[0]===key;}),count=limitAt<0?0:Number(limitRows[limitAt][1]);if(count>=100)throw new Error('PORTAL_DAILY_LIMIT');
 var now=new Date().toISOString(),isNew=!record;
 if(!record)record={id:Utilities.getUuid(),revision:0,createdBy:input.actorId,createdAt:now,creationRequestId:input.requestId,operations:[]};
 record.revision++;record.status=saving?'active':'deleted';record.updatedAt=now;record.updatedBy=input.actorId;if(saving){event.id=record.id;record.event=event;}
 record.operations=(record.operations||[]).concat([{id:input.requestId,actor:input.actorId,hash:digest,revision:record.revision,kind:input.kind,at:now}]).slice(-20);
 var row=isNew?sheet.getLastRow()+1:values.findIndex(function(value){return value[0]===record.id;})+2;if(sheet.getMaxRows()<row)sheet.insertRowsAfter(sheet.getMaxRows(),row-sheet.getMaxRows());sheet.getRange(row,1,1,2).setNumberFormat('@').setValues([[record.id,JSON.stringify(record)].map(safeCell_)]);
 if(isNew)records.push(record);else records=records.map(function(item){return item.id===record.id?record:item;});
 limits.getRange(limitAt<0?limits.getLastRow()+1:limitAt+2,1,1,2).setNumberFormat('@').setValues([[key,String(count+1)]]);
 sync();return saving?{ok:true,event:BandEvents.publicEvent(record)}:{ok:true,id:record.id,revision:record.revision};
}

function managementSaveBand_(input,cfg,store,service,book){
    var limits=managedSheet_(book,'WebLimits',['key','count']);var key=new Date().toISOString().slice(0,10)+':'+input.actorId;
    var values=limits.getLastRow()>1?limits.getRange(2,1,limits.getLastRow()-1,2).getValues():[];
    var index=values.findIndex(function(row){return row[0]===key;});var count=index<0?0:Number(values[index][1]);
    if(count>=60)throw new Error('PORTAL_DAILY_LIMIT');
    var record=portalDiagnosticStep_('SAVE_BAND',function(){return service.userSubmit(Object.assign({},input,{actorRole:input.portalAdmin===true?'admin':'user'}),new Date().toISOString());});
    portalDiagnosticStep_('SAVE_COUNTER',function(){if(index<0)limits.getRange(limits.getLastRow()+1,1,1,2).setNumberFormat('@').setValues([[key,'1']]);else limits.getRange(index+2,2,1,1).setValues([[String(count+1)]]);});
    return {ok:true,id:record.id,revision:record.revision,status:record.status,registrationSource:BandReview.registrationSource(record),ownershipType:record.ownershipType||((record.ownerUserIds||[]).length?'user':record.source==='admin'?'admin':'unassigned'),message:'保存しました。承認後に公開されます。'};

}

function managementUpload_(input,cfg,book,upload){
  var specs={'ロゴ':[2097152,1024,512,'PORTAL_LOGO_FOLDER_ID'],'アイコン':[524288,256,256,'PORTAL_ICON_FOLDER_ID'],'アー写':[16777216,3840,2160,'PORTAL_PHOTO_FOLDER_ID']};
  var spec=specs[input.field];
  if(!spec||!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>spec[0]||!/^[a-f0-9]{64}$/.test(input.sha256||'')||!/^[a-f0-9-]{36}$/i.test(input.uploadId||''))throw new Error('INVALID_IMAGE');
  var uploads=managedSheet_(book,'WebUploads',['uploadId','actorId','field','sha256','bytes','at','fileId','url']);
  var all=uploads.getLastRow()>1?uploads.getRange(2,1,uploads.getLastRow()-1,8).getValues():[];
  var prior=all.find(function(row){return row[0]===input.uploadId;});
  if(prior){if(prior[1]!==input.actorId||prior[2]!==input.field||prior[3]!==input.sha256)throw new Error('PORTAL_FORBIDDEN');if(!prior[7])throw new Error('UPLOAD_PENDING');return {ok:true,url:prior[7]};}
  var today=new Date().toISOString().slice(0,10);
  var daily=all.filter(function(row){return String(row[5]).slice(0,10)===today;});
  var userBytes=daily.filter(function(row){return row[1]===input.actorId;}).reduce(function(sum,row){return sum+Number(row[4]);},0);
  var globalBytes=daily.reduce(function(sum,row){return sum+Number(row[4]);},0);
  var userLimit=Number(cfg.PORTAL_USER_DAILY_BYTES||67108864),globalLimit=Number(cfg.PORTAL_GLOBAL_DAILY_BYTES||268435456);
  if(!Number.isFinite(userLimit)||!Number.isFinite(globalLimit)||userBytes+input.bytes>userLimit||globalBytes+input.bytes>globalLimit)throw new Error('UPLOAD_DAILY_LIMIT');
  if(typeof upload.dataBase64!=='string'||upload.dataBase64.length!==Math.ceil(input.bytes/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(upload.dataBase64))throw new Error('INVALID_IMAGE');
  var bytes=Utilities.base64Decode(upload.dataBase64);
  if(bytes.length!==input.bytes||hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes))!==input.sha256)throw new Error('INVALID_IMAGE');
  var size=BandReview.pngInfo(bytes);if(size.width>spec[1]||size.height>spec[2])throw new Error('INVALID_IMAGE');
  var folderId=cfg[spec[3]]||cfg.PORTAL_UPLOAD_FOLDER_ID;
  if(!folderId)throw new Error('UPLOAD_CONFIGURATION');
  var folder=DriveApp.getFolderById(folderId);
  var recordRow=uploads.getLastRow()+1;
  uploads.getRange(recordRow,1,1,8).setNumberFormat('@').setValues([[input.uploadId,input.actorId,input.field,input.sha256,String(input.bytes),new Date().toISOString(),'','']]);
  var blob=portalDiagnosticStep_('UPLOAD_BLOB',function(){return Utilities.newBlob(bytes,'image/png','vbd_'+input.uploadId+'.png');});
  var file=portalDiagnosticStep_('UPLOAD_CREATE_FILE',function(){return folder.createFile(blob);});
  portalDiagnosticStep_('UPLOAD_SHARE_FILE',function(){file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);});
  var imageUrl='https://drive.google.com/file/d/'+file.getId()+'/view';
  uploads.getRange(recordRow,7,1,2).setNumberFormat('@').setValues([[file.getId(),imageUrl]]);
  return {ok:true,url:imageUrl};
}

function managementBandList_(input,cfg,store,book){return Object.assign({ok:true,eventsEnabled:cfg.EVENTS_ENABLED==='true',records:store.all().filter(function(record){return record.status!=='deleted'&&(input.portalAdmin===true||(record.ownerUserIds||[]).includes(input.actorId));}).map(function(record){return Object.assign({id:record.id,revision:record.revision,status:record.status,band:BandReview.snapshot(BandReview.fields.map(function(key){return {title:key,value:record.snapshot[key]||''};}))},input.portalAdmin===true?{ownerUserIds:record.ownerUserIds||[],ownershipVersion:record.ownershipVersion||0,ownershipAudit:(record.ownershipAudit||[]).slice(-5),registrationSource:BandReview.registrationSource(record),ownershipType:record.ownershipType||((record.ownerUserIds||[]).length?'user':record.source==='admin'?'admin':'unassigned')}:{});})},input.portalAdmin===true?{users:managementUsers_(book)}:{});}

// Transport-neutral management services. The web session and signed Discord interaction
// are authenticated separately before reaching these operations.
function managementCommand_(input,cfg,store,service,upload){
  var book=SpreadsheetApp.openById(cfg.REVIEW_SPREADSHEET_ID);
  var managed=Object.assign({},input,{portalAdmin:true});
  function clean(value){return String(value||'').replace(/[@`*_<>\r\n]/g,' ').slice(0,100);}
  function pageOf(items){var page=input.page||1;if(!Number.isSafeInteger(page)||page<1)throw new Error('INVALID_SEARCH');return {page:page,pages:Math.max(1,Math.ceil(items.length/5)),items:items.slice((page-1)*5,page*5)};}
  function norm(value){return String(value||'').normalize('NFKC').toLowerCase();}
  if(input.kind==='admin_manage_list'){
    var all=managementBandList_(managed,cfg,store,book).records;
    if(input.name)all=all.filter(function(record){return norm(record.band['活動名']).indexOf(norm(input.name))>=0;});
    if(input.status)all=all.filter(function(record){return record.status===input.status;});
    var selection=pageOf(all);
    return {ok:true,flush:false,message:'バンド一覧：'+all.length+'件（'+selection.page+'/'+selection.pages+'）\n'+selection.items.map(function(record){return '\n'+clean(record.band['活動名'])+'\nID: '+record.id+' / 版: '+record.revision+' / '+record.status+'\n所有: '+record.ownershipType+' / '+(record.ownerUserIds||[]).join(',')+'\n'+record.registrationSource;}).join('\n')};
  }
  if(input.kind==='admin_manage_users'){
    var users=managementUsers_(book);if(input.name)users=users.filter(function(user){return norm(user.username+' '+user.displayName+' '+user.id).indexOf(norm(input.name))>=0;});
    var selected=pageOf(users);
    return {ok:true,flush:false,message:'登録済みユーザー：'+users.length+'件（'+selected.page+'/'+selected.pages+'）\n'+selected.items.map(function(user){return clean(user.displayName)+' / '+clean(user.username)+'\nID: '+user.id;}).join('\n\n')};
  }
  if(input.kind==='admin_manage_export'){
    var found=managementBandList_(managed,cfg,store,book).records.find(function(record){return record.id===input.registrationId;});if(!found)throw new Error('NOT_FOUND');
    return {ok:true,flush:false,message:'活動名: '+clean(found.band['活動名'])+'\nID: '+found.id+' / 版: '+found.revision+'\nJSONを編集し /band-save file:JSON id:登録ID revision:版 で通常保存（承認待ち）できます。',file:{name:'band.json',content:JSON.stringify([found.band],null,2)}};
  }
  if(input.kind==='admin_manage_save'){
    if(input.registrationId&&!Number.isSafeInteger(input.revision)||!input.registrationId&&input.revision!==undefined)throw new Error('PORTAL_INVALID_REQUEST');
    // Discord JSON may specify only changed fields. Explicit empty strings clear fields.
    // The browser already submits a full snapshot; both paths use the same save service below.
    if(input.registrationId&&input.band&&typeof input.band==='object'&&!Array.isArray(input.band)){
      if(Object.keys(input.band).some(function(field){return BandReview.fields.indexOf(field)<0;}))throw new Error('INVALID_IMPORT');
      var existing=store.all().find(function(record){return record.id===input.registrationId;});
      if(existing)managed.band=Object.assign({},existing.snapshot,input.band);
    }
    var saved=managementSaveBand_(managed,cfg,store,service,book);
    saved.flush=true;saved.message+='\nID: '+saved.id+' / 版: '+saved.revision;return saved;
  }
  if(input.kind==='admin_manage_upload'){
    if(!upload)throw new Error('INVALID_IMAGE');
    var image=managementUpload_(managed,cfg,book,upload);image.flush=false;image.message='画像を保存しました。以下のURLを通常保存または応急編集で設定してください。\n'+image.url;return image;
  }
  if(input.kind==='admin_manage_event_delete'&&input.confirm!==true)throw new Error('PORTAL_INVALID_REQUEST');
  if(['admin_manage_event_list','admin_manage_event_info','admin_manage_event_save','admin_manage_event_delete'].includes(input.kind)){
    var operation=input.kind.replace('admin_manage_','portal_');
    if(operation==='portal_event_info')operation='portal_event_list';
    var eventResult=managementEvents_(Object.assign({},managed,{kind:operation}),cfg,book,store);
    if(input.kind==='admin_manage_event_save')return {ok:true,flush:false,message:'イベントを保存しました（審査なしでイベント公開シートへ反映）。\nID: '+eventResult.event.id+' / 版: '+eventResult.event.revision};
    if(input.kind==='admin_manage_event_delete')return {ok:true,flush:false,message:'イベントを削除しました。\nID: '+eventResult.id};
    if(input.kind==='admin_manage_event_info'){
      var event=eventResult.events.find(function(item){return item.id===input.eventId;});if(!event)throw new Error('EVENT_NOT_FOUND');
      return {ok:true,flush:false,message:clean(event.title)+'\nID: '+event.id+' / 版: '+event.revision+'\nJSONを編集し /event-save へ添付してください。',file:{name:'event.json',content:JSON.stringify(event,null,2)}};
    }
    var events=eventResult.events.filter(function(item){return (input.includeEnded===true||new Date(item.endsAt).getTime()>Date.now())&&(!input.name||norm(item.title).indexOf(norm(input.name))>=0)&&(!input.bandId||item.ownerBandId===input.bandId||item.participants.some(function(person){return person.bandId===input.bandId;}));});
    events.sort(function(a,b){return new Date(a.startsAt)-new Date(b.startsAt);});
    var list=pageOf(events);
    return {ok:true,flush:false,message:'イベント一覧：'+events.length+'件（'+list.page+'/'+list.pages+'）\n'+list.items.map(function(item){return '\n'+clean(item.title)+' / '+clean(item.place)+'\n'+item.startsAt+' ～ '+item.endsAt+'\nID: '+item.id+' / 版: '+item.revision;}).join('\n')};
    var events=eventResult.events.filter(function(event){return (input.includeEnded===true||new Date(event.endsAt).getTime()>Date.now())&&(!input.name||norm(event.title).indexOf(norm(input.name))>=0)&&(!input.registrationId||event.ownerBandId===input.registrationId||event.participants.some(function(person){return person.bandId===input.registrationId;}));});
    events.sort(function(a,b){return a.startsAt<b.startsAt?-1:a.startsAt>b.startsAt?1:0;});var listed=pageOf(events);
    return {ok:true,flush:false,message:'イベント一覧：'+events.length+'件（'+listed.page+'/'+listed.pages+'）\n'+listed.items.map(function(event){return '\n'+clean(event.title)+' / '+event.place+'\nID: '+event.id+' / 版: '+event.revision+'\n'+new Date(event.startsAt).toISOString()+'（UTC）';}).join('\n')};
  }
  throw new Error('PORTAL_INVALID_REQUEST');
}
