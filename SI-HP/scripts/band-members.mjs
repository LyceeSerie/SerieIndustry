export function xId(value) {
  const text = String(value || '').trim()
  const match = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/?(?:[?#][^\s]*)?$/i.exec(text)
  const id = match ? match[1] : text.replace(/^@/, '')
  return /^[A-Za-z0-9_]{1,15}$/.test(id) && !['home', 'explore', 'search', 'intent', 'share', 'i', 'settings', 'notifications', 'messages'].includes(id.toLowerCase()) ? id : ''
}
export function parseMembers(value) {
  return String(value || '').split(/\r?\n/).map(line => line.split(/[|｜]/).map(cell => cell.trim())).filter(cells => cells.length >= 2 && cells.length <= 3 && cells[1]).map(([part, name, account = '']) => ({ part, name, twitterId: xId(account) }))
}
