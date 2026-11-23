import { readFileSync } from 'node:fs'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import vm from 'node:vm'

export function gasHarness() {
  const state = { requests: [], dispatchFail: false, enabled: true, messages: new Map(), sheetWrites: 0, triggers: [], logs: [] }
  class Sheet {
    constructor(name, id = 0) { this.name = name; this.id = id; this.data = []; this.columns = 26; this.rows = 1000 }
    getLastRow() { let last = this.data.length; while (last && !(this.data[last - 1] || []).some(x => x !== '' && x != null)) last--; return last }
    getMaxRows() { return this.rows }
    getMaxColumns() { return this.columns }
    insertRowsAfter(_, count) { this.rows += count }
    insertColumnsAfter(_, count) { this.columns += count }
    setFrozenRows() {}
    appendRow(row) { this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]) }
    getRange(row, col, height, width) {
      if (col + width - 1 > this.columns || row + height - 1 > this.rows) throw Error('Range exceeds grid')
      const sheet = this
      return {
        getValues() { return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => sheet.data[row - 1 + y]?.[col - 1 + x] ?? '')) },
        setNumberFormat() { return this },
        setValues(values) {
          if (values.length !== height || values.some(r => r.length !== width)) throw Error('Invalid write shape')
          state.sheetWrites++
          values.forEach((r, y) => r.forEach((value, x) => {
            if (!sheet.data[row - 1 + y]) sheet.data[row - 1 + y] = []
            // Google stores leading-apostrophe strings as literal text, not formulas.
            sheet.data[row - 1 + y][col - 1 + x] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value
          }))
          return this
        },
      }
    }
  }
  class Book {
    constructor() { this.sheets = new Map() }
    getSheetByName(name) { return this.sheets.get(name) }
    getSheets() { return [...this.sheets.values()] }
    getSheetById(id) { return [...this.sheets.values()].find(s => s.id === id) }
    insertSheet(name) { const sheet = new Sheet(name, this.sheets.size); this.sheets.set(name, sheet); return sheet }
  }
  const books = { review: new Book(), public: new Book() }; books.public.insertSheet('Approved')
  const properties = {
    ENABLED: 'true', FORM_ID: 'form', REVIEW_SPREADSHEET_ID: 'review', PUBLIC_SPREADSHEET_ID: 'public', PUBLIC_SHEET_ID: '0',
    DISCORD_BOT_TOKEN: 'test-only-bot-token', DISCORD_APPLICATION_ID: '111111111111111111', DISCORD_GUILD_ID: '222222222222222222', DISCORD_CHANNEL_ID: '333333333333333333', GAS_HMAC_SECRET: 'test-only-secret-'.repeat(4),
    GITHUB_TOKEN: 'test-only-github-token', GITHUB_OWNER: 'Example', GITHUB_REPO: 'Test', GITHUB_REF: 'main',
  }
  const responses = new Map()
  const form = { getId: () => 'form', getDestinationId: () => 'intake', getResponse: id => { if (!responses.has(id)) throw Error('Unknown response'); return responses.get(id) }, getResponses: () => [...responses.values()] }
  const props = { getProperties: () => ({ ...properties }), getProperty: key => properties[key] ?? null, setProperty: (key, value) => { properties[key] = value } }
  const context = vm.createContext({
    console: { log: message => state.logs.push(message), error: message => state.logs.push(message) },
    PropertiesService: { getScriptProperties: () => props },
    FormApp: { openById: id => { if (id !== 'form') throw Error('Unknown form'); return form } },
    SpreadsheetApp: { openById: id => { if (!books[id]) throw Error('Unknown sheet'); return books[id] }, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => !state.busy, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, getUuid: randomUUID,
      computeDigest: (_, text) => [...createHash('sha256').update(text).digest()],
      computeHmacSha256Signature: (text, secret) => [...createHmac('sha256', secret).update(text).digest()],
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this } }) },
    ScriptApp: {
      getProjectTriggers: () => state.triggers.map(name => ({ getHandlerFunction: () => name })),
      newTrigger: name => { const trigger = { forForm() { return this }, onFormSubmit() { return this }, timeBased() { return this }, everyMinutes() { return this }, create() { state.triggers.push(name) } }; return trigger },
    },
    UrlFetchApp: { fetch: (url, options) => {
      state.requests.push({ url, ...options })
      let body = {}; let status = 200
      if (url.includes('discord.com') && options.method === 'post') {
        const payload = JSON.parse(options.payload)
        const id = state.messages.get(payload.nonce) || String(800000000000000000n + BigInt(state.messages.size))
        state.messages.set(payload.nonce, id); body = { id, author: { id: properties.DISCORD_APPLICATION_ID } }
      }
      if (url.includes('api.github.com')) status = state.dispatchFail ? 403 : 204
      return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) }
    } },
  })
  for (const name of ['Core.gs', 'Code.gs']) vm.runInContext(readFileSync(new URL(`../gas/${name}`, import.meta.url), 'utf8'), context)
  function setResponse(id, name = 'テスト', extra = []) {
    const entries = [{ title: '活動名', value: name }, { title: '活動形態１', value: 'バンド' }, { title: 'メインジャンル', value: ['ロック'] }, ...extra]
    const response = { getId: () => id, getItemResponses: () => entries.map(e => ({ getItem: () => ({ getTitle: () => e.title, getType: () => e.fileUpload ? 'FILE_UPLOAD' : 'TEXT' }), getResponse: () => e.value })) }
    responses.set(id, response); return response
  }
  const records = () => JSON.parse(JSON.stringify(context.repository_(properties).all()))
  return { context, properties, books, state, form, setResponse, records }
}
