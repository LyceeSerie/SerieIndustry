import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDateTime, formatCalendarDate } from '../src/date-format.mjs'

test('calendar date formats consistently use Japan time across UTC date boundaries', () => {
  const instant = '2026-11-24T15:05:00Z'
  assert.equal(formatDateTime(instant, 'time'), '00:05')
  assert.equal(formatDateTime(instant, 'event'), '11/25 00:05')
  assert.match(formatDateTime(instant, 'eventDetail'), /2026年11月25日/)
  assert.match(formatCalendarDate('2026-11-25'), /2026\/11\/25/)
})
