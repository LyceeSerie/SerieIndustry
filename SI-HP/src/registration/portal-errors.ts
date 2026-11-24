import { t, uiMessages } from '../i18n/ui-text.mjs'

type Failure = {
  code?: string
  message?: string
  diagnostic?: { stage: string; type: string; locations?: string[]; detail?: string }
}

export function portalErrorMessage(data: Failure, status: number, roleLimitMessage: string) {
  const messages: Record<string, string> = uiMessages.registration.errors
  const message = data.code === 'DISCORD_IDENTITY_HTTP_429'
    ? roleLimitMessage
    : messages[data.code || ''] || data.message || t('registration.failed', { code: data.code || status })
  const diagnostic = data.diagnostic
  if (!diagnostic) return message
  const location = (diagnostic.locations || []).join(', ')
  return `${message} [${diagnostic.stage} / ${diagnostic.type} / ${location}]${diagnostic.detail ? ' ' + diagnostic.detail : ''}`
}
