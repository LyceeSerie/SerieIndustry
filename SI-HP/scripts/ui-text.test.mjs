import test from 'node:test'
import assert from 'node:assert/strict'
import { t, uiMessages } from '../src/i18n/ui-text.mjs'

test('UI messages resolve nested keys and interpolate values without changing missing placeholders', () => {
  assert.equal(t('navigation.register'), uiMessages.navigation.register)
  assert.equal(t('calendar.count', { count: 3 }), '3件・日本時間')
  assert.equal(t('common.openNewTab', { label: 'Discord' }), 'Discord（別タブ）')
  assert.equal(t('calendar.count'), '{count}件・日本時間')
  assert.throws(() => t('unknown.key'), /Unknown UI message key/)
})

test('all UI dictionary leaves are nonempty messages', () => {
  const visit = (node, prefix = '') => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'object') visit(value, path)
      else { assert.equal(typeof value, 'string', path); assert.ok(value.trim(), path); assert.equal(t(path), value) }
    }
  }
  visit(uiMessages)
})
