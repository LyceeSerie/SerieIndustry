import { bandImage as image, logoLayout, platformLabel } from '../src/band-media.mjs'
export { logoLayout }
import { youtubeVideoId } from './youtube-video.mjs'
import Papa from 'papaparse'
import { parseMembers } from './band-members.mjs'

export { productionSheetUrl as sheetUrl } from './band-source.mjs'
export const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfgMHoncY1txjJ-91hAfnznOZAOqz_0hh2KkMLwf8qz0DvKeQ/viewform?usp=header'
const clean = value => String(value ?? '').trim()
// Normalize form Other prefixes before splitting free-text tags.
export const splitTags = value => [...new Set(clean(value).replace(/(^|[,、，。\s/／])その他\s*[:：]\s*/gu, '$1').split(/[,、，。\s/／]+/u).filter(Boolean))]
export function activityStatus(value) {
  const text = clean(value)
  if (/解散|停止|休止/.test(text)) return 'inactive'
  return text === '活動中' ? 'active' : 'unknown'
}

export function webUrl(value) {
  try { const url = new URL(clean(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}
function social(value, base) {
  const text = clean(value)
  if (/^@[^\s/?#]+$/u.test(text)) return base + encodeURIComponent(text.slice(1))
  return webUrl(text)
}
export function otherLink(value, index) {
  const text = clean(value)
  if (!text) return null
  const direct = webUrl(text)
  if (direct) return { label: `その他リンク${index}`, url: direct }
  const match = text.match(/^([^:：]+)[:：]\s*(.+)$/u)
  if (!match) return null
  const label = match[1].trim()
  const target = match[2].trim()
  if (/^(mail|email|メール)$/i.test(label) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return { label, url: `mailto:${target}` }
  const url = webUrl(target)
  return url ? { label, url } : null
}

export function parseBands(csv, { approvedOnly = false } = {}) {
  const parsed = Papa.parse(csv, { delimiter: ',', header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() })
  if (parsed.errors.length) throw new Error('CSVの形式が不正です。公開データは更新しません。')
  const headers = parsed.meta.fields || []
  for (const field of ['活動名', '活動形態１', 'メインジャンル']) if (!headers.includes(field)) throw new Error(`必要な列がありません: ${field}`)
  if (approvedOnly) for (const field of ['_registrationId', '_approvedRevision', '_reviewStatus']) if (!headers.includes(field)) throw new Error(`承認用の列がありません: ${field}`)
  const seenIds = new Set()
  return parsed.data.filter(row => clean(row['活動名']) && (!approvedOnly || clean(row['_reviewStatus']) === 'approved')).map((row, index) => {
    const registrationId = clean(row['_registrationId'])
    if (approvedOnly) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationId) || !/^[1-9]\d*$/.test(clean(row['_approvedRevision'])) || seenIds.has(registrationId.toLowerCase())) throw new Error('承認済みデータのID・版が不正または重複しています。')
      seenIds.add(registrationId.toLowerCase())
    }
    const get = prefix => clean(row[headers.find(h => h === prefix || h.startsWith(prefix + '\n') || h.startsWith(prefix + '（') || h.startsWith(prefix + 'リンク')) || prefix])
    const links = [
      { label: 'X / Twitter', url: social(get('SNSリンク（X/Twitter）'), 'https://x.com/') },
      { label: 'YouTube', url: social(get('SNSリンク（Youtube）'), 'https://www.youtube.com/@') },
      { label: 'VRC Group', url: webUrl(get('VRC Groupリンク')) },
      ...Array.from({ length: 5 }, (_, i) => otherLink(get(`その他SNSリンク${i + 1}`), i + 1)),
    ].filter(link => link?.url)
    return {
      id: approvedOnly ? registrationId : `band-${index + 1}`, name: get('活動名'), reading: get('活動名（よみがな）※ひらがなで入力'), englishName: get('活動名（英語）'),
      types: splitTags(get('活動形態１')), styles: splitTags(get('活動形態２')), platforms: [...new Set(get('活動プラットフォーム').replace(/(^|[,、，。\s])その他\s*[:：]\s*/gu, '$1').split(/[,、，。\s]+/u).filter(Boolean).map(platformLabel))],
      activityStatus: activityStatus(get('活動形態３')), activityLabel: get('活動形態３'),
      recruitingParts: splitTags(get('募集パート')).filter(value => value !== 'なし'), attributes: splitTags(get('属性')),
      logoLayout: logoLayout(get('ロゴ配置位置')),
      genres: [...new Set(get('メインジャンル').split(/[,，、\n]+/u).map(clean).filter(Boolean))], subgenres: splitTags(get('サブジャンル')), comment: get('コメント'), activeTime: get('活動時間帯'),
      logo: image(get('ロゴ')), icon: image(get('アイコン')), photo: image(get('アー写')), links,
      members: parseMembers(get('バンドメンバー')),
      updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(clean(row['_updatedAt'])) && Number.isFinite(Date.parse(row['_updatedAt'])) ? new Date(row['_updatedAt']).toISOString() : '',

      youtubeVideoId: youtubeVideoId(get('YouTube動画URL')),
      registrationSource: ['admin','user'].includes(clean(row['_registrationSource'])) ? clean(row['_registrationSource']) : 'form',
    }
  })
}
