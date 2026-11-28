type Image = { url: string; source: string }
type AvatarBand = {
  icon: Image | null; logo: Image | null; photo: Image | null
  links: { url: string }[]
  members?: { twitterId: string }[]
}
function xImage(id: string): Image | null {
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(id)) return null
  return { url: `https://unavatar.io/x/${encodeURIComponent(id)}?fallback=false`, source: `https://x.com/${id}` }
}
export function bandAvatar(band: AvatarBand): Image | null {
  if (band.icon || band.logo || band.photo) return band.icon || band.logo || band.photo
  for (const link of band.links) {
    try {
      const url = new URL(link.url)
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) continue
      const path = url.pathname.split('/').filter(Boolean)
      if (path.length !== 1 || ['home', 'intent', 'share', 'search', 'explore', 'i'].includes(path[0]!.toLowerCase())) continue
      const image = xImage(path[0]!)
      if (image) return image
    } catch { /* Invalid links do not provide a profile icon. */ }
  }
  for (const member of band.members || []) {
    const image = xImage(member.twitterId)
    if (image) return image
  }
  return null
}
