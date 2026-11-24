import { computed, onScopeDispose, ref, watch } from 'vue'
import { portalErrorMessage } from './portal-errors'
import type { PortalRequest } from './types'

const roleRetryKey = 'vbd-role-retry-at'

function needsAdminRole(path: string, body?: unknown) {
  return path.includes('mode=admin')
    || (body as { mode?: string })?.mode === 'admin'
    || ['/api/delete', '/api/assign-owner'].includes(path)
}

/** Transport, CSRF and the role-check cooldown belong to this mounted form. */
export function usePortalClient(previewRequest?: PortalRequest) {
  const csrf = ref('')
  const storedRetry = Number(sessionStorage.getItem(roleRetryKey)) || 0
  const roleBlockedUntil = ref(storedRetry > Date.now() ? storedRetry : 0)
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined
  const roleLimitMessage = computed(() => {
    const retryAt = new Date(roleBlockedUntil.value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    return `Discordの管理権限確認が制限されています。再試行の目安：${retryAt}（日本時間）。個人用では自分のバンドを編集できます。`
  })

  watch(roleBlockedUntil, until => {
    clearTimeout(cooldownTimer)
    if (until <= Date.now()) {
      sessionStorage.removeItem(roleRetryKey)
      return
    }
    sessionStorage.setItem(roleRetryKey, String(until))
    cooldownTimer = setTimeout(() => {
      roleBlockedUntil.value = 0
      sessionStorage.removeItem(roleRetryKey)
    }, Math.min(2147483647, until - Date.now()))
  }, { immediate: true })

  async function api(path: string, body?: unknown): Promise<any> {
    if (previewRequest) return previewRequest(path, body)
    if (roleBlockedUntil.value > Date.now() && needsAdminRole(path, body)) {
      throw Error(roleLimitMessage.value)
    }
    const isRead = body === undefined
    const response = await fetch(path, {
      method: isRead ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: isRead ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.value },
      body: isRead ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await response.json()
    if (data.code === 'DISCORD_IDENTITY_HTTP_429') {
      roleBlockedUntil.value = Date.now() + Math.max(1, Number(data.retryAfter) || 60) * 1000
    }
    if (!response.ok || !data.ok) {
      throw Error(portalErrorMessage(data, response.status, roleLimitMessage.value))
    }
    return data
  }

  onScopeDispose(() => clearTimeout(cooldownTimer))
  return { api, csrf, roleBlockedUntil, roleLimitMessage }
}
