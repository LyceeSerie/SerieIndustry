import ja from './locales/ja.json' with { type: 'json' }
// Components depend only on t(). A future locale engine can replace this adapter.
export const uiMessages = ja
export function t(key, values = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], uiMessages)
  if (typeof value !== 'string') throw new Error('Unknown UI message key: ' + key)
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder)
}
