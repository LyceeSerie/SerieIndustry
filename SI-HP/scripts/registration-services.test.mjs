import test from 'node:test'
import assert from 'node:assert/strict'
import { computed, ref } from 'vue'
import { useBandOwnership } from '../src/registration/use-band-ownership.ts'
import { useImageUpload } from '../src/registration/use-image-upload.ts'
import { portalErrorMessage } from '../src/registration/portal-errors.ts'

const makeContext = (api, overrides = {}) => ({
  current: computed(() => ({ id: 'band-id', revision: 2, band: { 活動名: 'テスト' }, ownerUserIds: [] })),
  admin: ref(true), busy: ref(false), dirty: ref(false), local: false, api, message() {}, ...overrides,
})

test('ownership retries reuse the request ID; failed, dirty or unauthorized transfers do not change the owner', async () => {
  const previous = globalThis.confirm
  globalThis.confirm = () => true
  const calls = []
  let fail = true
  const context = makeContext(async (_path, body) => {
    calls.push(body)
    if (fail) throw Error('connection interrupted')
    return { ownerUserIds: [body.ownerId], ownershipVersion: 1, registrationSource: 'user', ownershipType: 'user' }
  })
  try {
    const owner = useBandOwnership(context)
    owner.ownerInput.value = '430696975193866240'
    context.admin.value = false; await owner.transferOwnership(); assert.equal(calls.length, 0)
    context.admin.value = true; context.dirty.value = true; await owner.transferOwnership(); assert.equal(calls.length, 0)
    context.dirty.value = false
    await owner.transferOwnership()
    assert.equal(context.busy.value, false)
    assert.deepEqual(context.current.value.ownerUserIds, [])
    fail = false; await owner.transferOwnership()
    assert.equal(calls[0].requestId, calls[1].requestId)
    assert.deepEqual(context.current.value.ownerUserIds, ['430696975193866240'])
    assert.equal(context.current.value.registrationSource, 'user')
    assert.equal(owner.ownerInput.value, '')
  } finally { globalThis.confirm = previous }
})

test('image upload validates dimensions before sending and retries with the original upload ID', async () => {
  const bitmap = globalThis.createImageBitmap, reader = globalThis.FileReader
  let tooLarge = true, uploadFails = true, closed = 0
  globalThis.createImageBitmap = async () => ({ width: tooLarge ? 257 : 256, height: 256, close() { closed++ } })
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,YQ=='; queueMicrotask(() => this.onload()) }
  }
  const calls = [], context = makeContext(async (path, body) => {
    calls.push({ path, body })
    if (path === '/api/upload-ticket') return { ticket: 'ticket' }
    if (uploadFails) throw Error('interrupted')
    return { url: 'https://drive.google.com/file/d/example/view' }
  }, { limits: ref({ アイコン: { width: 256, height: 256, bytes: 1024 } }), closeDraftMenu() {} })
  const upload = useImageUpload(context)
  const file = new File(['a'], 'icon.png', { type: 'image/png' })
  const select = () => upload.upload('アイコン', { target: { files: [file], value: 'icon.png' } })
  try {
    await select(); await upload.uploadCropped(file)
    assert.equal(calls.length, 0)
    assert.equal(context.busy.value, false)
    tooLarge = false
    await select(); await upload.uploadCropped(file)
    assert.equal(context.current.value.band['アイコン'], undefined)
    uploadFails = false
    await select(); await upload.uploadCropped(file)
    const tickets = calls.filter(call => call.path === '/api/upload-ticket')
    assert.equal(tickets[0].body.uploadId, tickets[1].body.uploadId)
    assert.equal(context.current.value.band['アイコン'], 'https://drive.google.com/file/d/example/view')
    assert.equal(closed, 3)
    assert.equal(context.busy.value, false)
  } finally { globalThis.createImageBitmap = bitmap; globalThis.FileReader = reader }
})

test('translated portal errors retain diagnostic locations and useful fallback messages', () => {
  assert.match(portalErrorMessage({ code: 'STALE_EDIT' }, 400, ''), /別の変更が保存されています/)
  assert.equal(portalErrorMessage({ code: 'DISCORD_IDENTITY_HTTP_429' }, 429, 'wait'), 'wait')
  assert.equal(portalErrorMessage({ code: 'UNKNOWN', diagnostic: { stage: 'UPLOAD', type: 'Error', locations: ['Code:12:3'], detail: 'detail' } }, 400, ''), '処理できませんでした（UNKNOWN）。 [UPLOAD / Error / Code:12:3] detail')
})
