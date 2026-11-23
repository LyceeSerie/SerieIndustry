export function youtubeVideoId(value) {
  var text = String(value || '').trim();
  var match = /^https:\/\/(?:www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/([^\s<>"'\\]*)$/i.exec(text);
  if (!match) return '';
  var path = match[2]; var id = '';
  if (match[1].toLowerCase() === 'youtu.be') id = path.split(/[?#]/)[0];
  else if (/^watch\?/.test(path)) { var query = /(?:\?|&)v=([A-Za-z0-9_-]{11})(?:&|#|$)/.exec(path); id = query ? query[1] : ''; }
  else { var video = /^(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/.exec(path); id = video ? video[1] : ''; }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}
