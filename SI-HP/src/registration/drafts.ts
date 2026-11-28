import { editor as C, namedKeys } from './schema'
import { splitNamedLink, joinNamedLink } from '../band-media.mjs'
import type { Band, Draft } from './types'

export function makeDraft(band: Band, meta: Partial<Draft> = {}): Draft {
  const full = { ...C.blank(), ...band }
  const tags: Draft['tags'] = {}
  const extras: Draft['extras'] = {}
  if (!full['ロゴ配置位置']?.trim()) full['ロゴ配置位置'] = 'アー写に重ねない'

  for (const key of [...C.multiple, 'サブジャンル']) {
    const values = C.tagItems(full[key] || '', key)
    const choices = C.defaults[key] || []
    tags[key] = values.filter(value => choices.includes(value))
    extras[key] = values.filter(value => !choices.includes(value))
  }
  return {
    ...meta,
    band: full,
    tags,
    extras,
    members: C.memberRows(full['バンドメンバー'] || ''),
    links: Object.fromEntries(namedKeys.map(key => [key, splitNamedLink(full[key])])),
  }
}

function validateNamedLink(key: string, title: string, url: string) {
  if (title && !url) throw Error(`${key}のリンクを入力してください。`)
  if (/[:：]/.test(title)) throw Error(`${key}のタイトルにはコロンを使用できません。`)
  const isEmail = /^(mail|email|メール)$/i.test(title) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)
  if (url && !/^https?:\/\//i.test(url) && !isEmail) {
    throw Error(`${key}にはhttp/httpsのリンクを入力してください。`)
  }
}

/** Convert editable rows to the existing storage format, without changing metadata. */
export function serializeDraft(draft: Draft): Band {
  const band = { ...draft.band }
  for (const key of [...C.multiple, 'サブジャンル']) {
    band[key] = C.tagText([...(draft.tags[key] || []), ...(draft.extras[key] || [])])
  }
  band['バンドメンバー'] = C.memberText(draft.members)
  for (const key of namedKeys) {
    const { title, url } = draft.links[key]!
    validateNamedLink(key, title, url)
    band[key] = joinNamedLink(title, url)
  }
  return band
}

export function outputDraft(draft: Draft, admin: boolean): Band {
  return JSON.parse(C.output([serializeDraft(draft)], { admin }))[0]
}

export const bandNameKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
export function hasDuplicateSavedBand(name: string, drafts: Draft[]) {
  return drafts.some(draft => draft.id && draft.status !== 'deleted' && bandNameKey(draft.band['活動名'] || '') === bandNameKey(name))
}
