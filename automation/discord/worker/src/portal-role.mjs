// Cache only server-verified roles, scoped to the token, guild and role configuration.
// Writes always call Discord again. Cached grants are never used after a failed check.
export function createRoleChecker(readRole, { now = Date.now, ttlMs = 30000, maxEntries = 256 } = {}) {
  const entries = new Map()

  return async function checkRole(user, env, fetchImpl, { allowCache = false } = {}) {
    if (!user.accessToken) return 'user'
    const scope = JSON.stringify([
      env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID, env.ADMIN_ROLE_IDS || '',
      user.uid || '', user.sid || '', user.accessToken,
    ])
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope))
    const key = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
    const previous = entries.get(key)
    if (previous?.retryUntil > now()) {
      const error = Error('DISCORD_IDENTITY_HTTP_429')
      error.retryAfter = Math.ceil((previous.retryUntil - now()) / 1000)
      throw error
    }
    if (allowCache && previous) {
      if (previous.pending) return previous.pending
      if (previous.until > now()) return previous.role
    }

    const entry = {}
    entries.delete(key)
    entries.set(key, entry)
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    entry.pending = Promise.resolve().then(async () => {
      try {
        const role = await readRole(user, env, fetchImpl)
        entry.role = role
        entry.until = now() + ttlMs
        return role
      } catch (error) {
        if (entries.get(key) === entry) {
          if (error.message === 'DISCORD_IDENTITY_HTTP_429') {
            entry.retryUntil = now() + Math.max(1, Number(error.retryAfter) || 60) * 1000
          } else entries.delete(key)
        }
        throw error
      } finally {
        delete entry.pending
      }
    })
    return entry.pending
  }
}
