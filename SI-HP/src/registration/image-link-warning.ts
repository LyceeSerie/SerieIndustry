// Advisory only: avoid fetching arbitrary URLs or treating reachability as permanent.
export function imageLinkWarning(value: string): 'discord' | 'signed' | 'local' | '' {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (['cdn.discordapp.com', 'media.discordapp.net'].includes(host) && url.pathname.startsWith('/attachments/')) return 'discord'
    const keys = [...url.searchParams.keys()].map(key => key.toLowerCase())
    if (keys.some(key => ['x-amz-signature', 'x-goog-signature', 'signature', 'sig', 'expires', 'expiry', 'exp', 'token', 'access_token', 'auth', 'policy', 'se'].includes(key))) return 'signed'
    if (['blob:', 'file:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(host)) return 'local'
    return ''
  } catch { return '' }
}
