import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, createHmac } from 'node:crypto'
import { handleRequest, signEnvelope, readBandAttachment } from '../worker/src/index.mjs'

const keys = generateKeyPairSync('ed25519')
const env = {
  DISCORD_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
  DISCORD_APPLICATION_ID: '111111111111111111', DISCORD_GUILD_ID: '222222222222222222', DISCORD_CHANNEL_ID: '333333333333333333', ADMIN_ROLE_IDS: '444444444444444444', MODERATOR_ROLE_IDS: '888888888888888888', DISCORD_COMMAND_CHANNEL_ID: '999999999999999999',
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/test-deployment/exec', GAS_HMAC_SECRET: 'unit-test-only-'.repeat(4),
}
const id = '12345678-1234-4234-8234-123456789abc'
const interaction = () => ({ type: 3, id: '555555555555555555', application_id: env.DISCORD_APPLICATION_ID, token: 'test-only-token', guild_id: env.DISCORD_GUILD_ID, channel_id: env.DISCORD_CHANNEL_ID,
  member: { roles: [env.ADMIN_ROLE_IDS], user: { id: '666666666666666666' } }, message: { id: '777777777777777777', author: { id: env.DISCORD_APPLICATION_ID } }, data: { component_type: 2, custom_id: `band:approve:${id}:1` } })
function request(data, stamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(data)
  const signature = sign(null, Buffer.from(stamp + body), keys.privateKey).toString('hex')
  return new Request('https://worker.example/interactions', { method: 'POST', headers: { 'X-Signature-Timestamp': stamp, 'X-Signature-Ed25519': signature }, body })
}
const noIO = () => { throw new Error('Unexpected external I/O') }
function editId(stage, index = 23, expires = Math.floor(Date.now() / 1000) + 300) {
  const purpose = stage === 'editpick' ? 'editpick' : 'edit:' + index
  const signature = createHmac('sha256', env.GAS_HMAC_SECRET).update([purpose, id, 1, interaction().member.user.id, env.DISCORD_GUILD_ID, env.DISCORD_COMMAND_CHANNEL_ID, expires].join('\n')).digest('hex').slice(0, 24)
  return `band:${stage}:${id}:1:${stage === 'editpick' ? '' : index + ':'}${expires}:${signature}`
}
test('valid Discord PING succeeds; unsigned, expired and malformed signatures do nothing', async () => {
  assert.deepEqual(await (await handleRequest(request({ type: 1 }), env, {}, noIO)).json(), { type: 1 })
  assert.deepEqual(await (await handleRequest(request({ type: 1, application_id: env.DISCORD_APPLICATION_ID }), env, {}, noIO)).json(), { type: 1 })
  assert.equal((await handleRequest(request({ type: 1, application_id: '999999999999999999' }), env, {}, noIO)).status, 401)
  assert.equal((await handleRequest(new Request('https://worker.example/interactions', { method: 'POST', body: '{}' }), env, {}, noIO)).status, 401)
  assert.equal((await handleRequest(request(interaction(), '1000000000'), env, {}, noIO)).status, 401)
  const tampered = request(interaction()); tampered.headers.set('X-Signature-Ed25519', '00'.repeat(64))
  assert.equal((await handleRequest(tampered, env, {}, noIO)).status, 401)
})
test('wrong guild, channel, role, app, message author and invalid buttons cannot invoke GAS', async () => {
  for (const mutate of [d => d.guild_id = '999999999999999999', d => d.channel_id = '999999999999999999', d => d.member.roles = [], d => d.member.user.bot = true, d => d.application_id = '999999999999999999', d => d.message.author.id = '999999999999999999', d => d.data.custom_id = `band:delete:${id}:1`, d => d.data.custom_id = `band:approve:${id}:0`]) {
    const data = interaction(); mutate(data)
    const result = await handleRequest(request(data), env, { waitUntil: noIO }, noIO)
    assert.ok(result.status === 401 || (await result.json()).type === 4)
  }
})
test('a valid button defers immediately; authenticated GAS review and flush are background work', async () => {
  const tasks = []; const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, ...options })
    return Response.json({ ok: true, message: 'queued' })
  }
  const result = await handleRequest(request(interaction()), env, { waitUntil: promise => tasks.push(promise) }, fakeFetch)
  assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } })
  await Promise.all(tasks)
  assert.equal(calls.length, 3)
  const signed = JSON.parse(calls[0].body)
  assert.equal(signed.signature, createHmac('sha256', env.GAS_HMAC_SECRET).update(`${signed.timestamp}\n${signed.nonce}\n${signed.payload}`).digest('hex'))
  assert.equal(JSON.parse(signed.payload).registrationId, id)
  assert.equal(JSON.parse(calls[1].body).content, 'queued')
  assert.equal(JSON.parse(JSON.parse(calls[2].body).payload).kind, 'flush')
})
test('GAS transport errors are retried but never echo tokens or raw error data', async () => {
  const tasks = []; const calls = []
  await handleRequest(request(interaction()), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
    calls.push({ url, ...options })
    if (url === env.GAS_WEBAPP_URL) throw Error('PRIVATE_TOKEN_PRIVATE_PAYLOAD')
    return Response.json({})
  })
  await Promise.all(tasks)
  assert.equal(calls.length, 3)
  assert.equal(calls[2].body.includes('PRIVATE'), false)
  assert.notEqual(JSON.parse(calls[0].body).nonce, JSON.parse(calls[1].body).nonce)
})
test('HMAC signs UTF-8 payloads without cross-runtime normalization', async () => {
  const envelope = await signEnvelope({ text: '承認／却下\nテスト' }, env.GAS_HMAC_SECRET)
  assert.equal(envelope.signature, createHmac('sha256', env.GAS_HMAC_SECRET).update(`${envelope.timestamp}\n${envelope.nonce}\n${envelope.payload}`).digest('hex'))
})

test('moderators are signed as moderators; admin role takes priority and an uncompleted vote never flushes', async () => {
  for (const [roles, expectedRole] of [[[env.MODERATOR_ROLE_IDS], 'moderator'], [[env.MODERATOR_ROLE_IDS, env.ADMIN_ROLE_IDS], 'admin']]) {
    const data = interaction(); data.member.roles = roles
    const tasks = []; const calls = []
    const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
      calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'vote recorded' })
    })
    assert.equal((await result.json()).type, 5); await Promise.all(tasks)
    assert.equal(calls.length, 2)
    assert.equal(JSON.parse(JSON.parse(calls[0].options.body).payload).actorRole, expectedRole)
  }
})

test('slash commands and delete confirmation reject moderators, wrong channels and other bots without GAS calls', async () => {
  const slash = () => ({ ...interaction(), type: 2, channel_id: env.DISCORD_COMMAND_CHANNEL_ID, data: { type: 1, name: 'band-delete', options: [{ type: 3, name: 'id', value: id }] } })
  for (const mutate of [d => d.member.roles = [env.MODERATOR_ROLE_IDS], d => d.channel_id = env.DISCORD_CHANNEL_ID, d => d.guild_id = '999999999999999998', d => d.data.options[0].value = 'invalid', d => d.data.name = 'band-unknown']) {
    const data = slash(); mutate(data)
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
  for (const mutate of [d => d.member.roles = [env.MODERATOR_ROLE_IDS], d => d.channel_id = env.DISCORD_CHANNEL_ID, d => d.message.author.id = '999999999999999998']) {
    const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
    data.data.custom_id = `band:delete:${id}:1:${Math.floor(Date.now() / 1000) + 300}:${'a'.repeat(24)}`
    mutate(data)
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
})

test('admin deletion preview returns only an ephemeral confirmation and does not flush', async () => {
  const data = interaction(); data.type = 2; data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { type: 1, name: 'band-delete', options: [{ type: 3, name: 'id', value: id }] }
  const tasks = []; const calls = []
  const components = [{ type: 1, components: [{ type: 2, style: 4, custom_id: 'confirmation', label: 'delete' }] }]
  const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
    calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'confirm?', components })
  })
  assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } }); await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_preview'); assert.equal(command.actorRole, 'admin')
  assert.equal(calls.length, 2)
  assert.deepEqual(JSON.parse(calls[1].options.body).components, components)
})

test('confirmed admin delete flushes in notification channel rather than command channel', async () => {
  const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data.custom_id = `band:delete:${id}:1:${Math.floor(Date.now() / 1000) + 300}:${'a'.repeat(24)}`
  const tasks = []; const calls = []
  await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, message: 'removed', flush: true }) })
  await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_delete'); assert.equal(command.channelId, env.DISCORD_COMMAND_CHANNEL_ID)
  const flush = JSON.parse(JSON.parse(calls[2].options.body).payload)
  assert.equal(flush.kind, 'flush'); assert.equal(flush.channelId, env.DISCORD_CHANNEL_ID)
})

test('admin name search passes the name and page to GAS without changing deletion to name-based targeting', async () => {
  const data = interaction(); data.type = 2; data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { type: 1, name: 'band-info', options: [{ type: 3, name: 'name', value: ' 同名バンド ' }, { type: 4, name: 'page', value: 2 }] }
  const tasks = []; const calls = []
  await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'results' }) })
  await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_info'); assert.equal(command.name, '同名バンド'); assert.equal(command.page, 2)
  assert.equal(command.registrationId, undefined); assert.equal(calls.length, 2)
  for (const options of [[], [{ type: 3, name: 'id', value: id }, { type: 3, name: 'name', value: 'band' }], [{ type: 4, name: 'page', value: 2 }], [{ type: 3, name: 'name', value: 'band' }, { type: 4, name: 'page', value: 0 }], [{ type: 3, name: 'name', value: 'a' }, { type: 3, name: 'name', value: 'b' }]]) {
    data.data.options = options
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
  data.data.name = 'band-delete'; data.data.options = [{ type: 3, name: 'name', value: '同名バンド' }]
  assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
})

test('restore command and confirmation keep admin/channel restrictions and use the restore operation', async () => {
  for (const confirm of [false, true]) {
    const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
    if (confirm) data.data.custom_id = `band:restore:${id}:2:${Math.floor(Date.now() / 1000) + 300}:${'a'.repeat(24)}`
    else { data.type = 2; data.data = { type: 1, name: 'band-restore', options: [{ type: 3, name: 'id', value: id }] } }
    const tasks = []; const calls = []
    const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'restore' }) })
    assert.equal((await result.json()).type, confirm ? 6 : 5); await Promise.all(tasks)
    assert.equal(JSON.parse(JSON.parse(calls[0].options.body).payload).kind, confirm ? 'admin_restore' : 'admin_restore_preview')
    data.member.roles = [env.MODERATOR_ROLE_IDS]
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
})

test('GAS busy responses retry with a fresh nonce and show processing rather than a false failure', async () => {
  for (const remainsBusy of [false, true]) {
    const tasks = []; const calls = []; let requests = 0
    await handleRequest(request(interaction()), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
      calls.push({ url, options })
      if (url === env.GAS_WEBAPP_URL) {
        requests++
        return requests === 1 || remainsBusy ? Response.json({ ok: false, retryable: true, code: 'BUSY_RETRY', message: 'PRIVATE' }) : Response.json({ ok: true, flush: false, message: 'すでに承認済みです。' })
      }
      return Response.json({})
    })
    await Promise.all(tasks)
    assert.equal(requests, 2)
    assert.notEqual(JSON.parse(calls[0].options.body).nonce, JSON.parse(calls[1].options.body).nonce)
    const reply = JSON.parse(calls[2].options.body).content
    assert.match(reply, remainsBusy ? /別の操作を処理中/ : /すでに承認済み/)
    assert.equal(reply.includes('確定できません'), false)
    assert.equal(reply.includes('PRIVATE'), false)
  }
})

test('field selection returns a current-value preview asynchronously without a public update', async () => {
  const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { component_type: 3, custom_id: editId('editpick'), values: ['23'] }
  const tasks = []; const calls = []
  const embeds = [{ title: 'コメント', description: 'current value', footer: { text: 'current-value' } }]
  const result = await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'edit', embeds, components: [] }) })
  assert.equal((await result.json()).type, 5); await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_edit_field'); assert.equal(command.fieldIndex, 23)
  assert.deepEqual(JSON.parse(calls[1].options.body).embeds, embeds)
  assert.equal(calls.length, 2)
})

test('edit modal opens immediately with the exact current value, then submits as an admin operation', async () => {
  const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data.custom_id = editId('editopen')
  data.message.embeds = [{ title: 'コメント', description: 'line1\nline2 ☃', footer: { text: 'current-value' } }]
  const modal = await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()
  assert.equal(modal.type, 9); assert.ok(modal.data.custom_id.length <= 100)
  assert.equal(modal.data.components[0].type, 18)
  assert.equal(modal.data.components[0].component.value, data.message.embeds[0].description)
  const submitted = { ...data, type: 5, data: { custom_id: modal.data.custom_id, components: [{ type: 18, component: { type: 4, custom_id: 'value', value: 'edited value' } }] } }
  delete submitted.message
  const tasks = []; const calls = []
  const result = await handleRequest(request(submitted), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'saved' }) })
  assert.deepEqual(await result.json(), { type: 5, data: { flags: 64 } }); await Promise.all(tasks)
  const command = JSON.parse(JSON.parse(calls[0].options.body).payload)
  assert.equal(command.kind, 'admin_edit_save'); assert.equal(command.value, 'edited value'); assert.equal(command.actorRole, 'admin')
  data.message.embeds[0].footer.text = 'empty-value'
  const empty = await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()
  assert.equal(empty.data.components[0].component.value, '')
})

test('edit modals and selections reject other roles, actors, fields, expired tickets and unsupported inputs without I/O', async () => {
  for (const mutate of [data => data.member.roles = [env.MODERATOR_ROLE_IDS], data => data.member.user.id = '888888888888888889', data => data.channel_id = env.DISCORD_CHANNEL_ID, data => data.data.custom_id = data.data.custom_id.replace(':23:', ':24:'), data => data.data.custom_id = editId('editopen', 23, Math.floor(Date.now() / 1000) - 1)]) {
    const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
    data.data.custom_id = editId('editopen'); data.message.embeds = [{ title: 'コメント', description: 'text', footer: { text: 'current-value' } }]
    mutate(data)
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
  for (const value of ['x'.repeat(4001), '\u0000secret']) {
    const data = interaction(); data.type = 5; data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
    data.data = { custom_id: editId('editsave'), components: [{ type: 18, component: { type: 4, custom_id: 'value', value } }] }
    assert.equal((await (await handleRequest(request(data), env, { waitUntil: noIO }, noIO)).json()).type, 4)
  }
})

test('review errors show safe code, revision comparison, notification link and recovery steps without raw errors', async () => {
  const tasks = []; const replies = []
  await handleRequest(request(interaction()), env, { waitUntil: p => tasks.push(p) }, async (url, options) => {
    if (url === env.GAS_WEBAPP_URL) return Response.json({ ok: false, code: 'STALE_REVIEW', message: 'PRIVATE_REMOTE_MESSAGE', details: { requestedRevision: 1, currentRevision: 3, notificationPending: true, currentMessageId: '777777777777777777' } })
    replies.push(JSON.parse(options.body)); return Response.json({})
  })
  await Promise.all(tasks)
  assert.match(replies[0].content, /\[STALE_REVIEW\]/)
  assert.match(replies[0].content, /押したボタンの版：1／現在の版：3/)
  assert.match(replies[0].content, /ローカル通知プログラム/)
  assert.match(replies[0].content, /acknowledged/)
  assert.ok(replies[0].content.includes('https://discord.com/channels/' + env.DISCORD_GUILD_ID + '/' + env.DISCORD_CHANNEL_ID + '/777777777777777777'))
  assert.equal(replies[0].content.includes('PRIVATE_REMOTE_MESSAGE'), false)
  assert.ok(replies[0].content.length < 2000)
})

test('the additional editor menu accepts appended member field without changing old field indexes', async () => {
  const data = interaction(); data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { component_type: 3, custom_id: editId('editpick').replace(':editpick:', ':editpick2:'), values: ['25'] }
  const tasks = []; const calls = []
  await handleRequest(request(data), env, { waitUntil: p => tasks.push(p) }, async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true, flush: false, message: 'member editor' }) })
  await Promise.all(tasks)
  assert.equal(JSON.parse(JSON.parse(calls[0].options.body).payload).fieldIndex, 25)
})


test('band-add only fetches Discord CDN attachments, bounds streamed bytes and defers admin import', async () => {
  for (const url of ['https://example.com/attachments/1/2/a.json', 'http://cdn.discordapp.com/attachments/1/2/a.json', 'https://cdn.discordapp.com/evil']) {
    await assert.rejects(readBandAttachment({url}, noIO))
  }
  const url = 'https://cdn.discordapp.com/attachments/111/222/bands.json?ex=test'
  await assert.rejects(readBandAttachment({url}, async () => new Response('x'.repeat(65537))))
  await assert.rejects(readBandAttachment({url}, async () => Response.json({bands:[]})))
  const data = interaction(); data.type = 2; data.channel_id = env.DISCORD_COMMAND_CHANNEL_ID
  data.data = { type: 1, name:'band-add', options:[{type:11,name:'file',value:'222'}], resolved:{attachments:{'222':{id:'222',filename:'bands.json',size:100,url}}} }
  const tasks=[]; const calls=[]
  assert.equal((await (await handleRequest(request(data), env, {waitUntil:p=>tasks.push(p)}, async (target, options) => {
    calls.push({target, options})
    return target.startsWith('https://cdn.') ? Response.json([{活動名:'追加'}]) : Response.json({ok:true,flush:true,message:'追加済み'})
  })).json()).type, 5)
  await Promise.all(tasks)
  const command=JSON.parse(JSON.parse(calls[1].options.body).payload)
  assert.equal(command.kind,'admin_add'); assert.equal(command.bands[0]['活動名'],'追加'); assert.equal(command.attachment,undefined)
  data.member.roles=[env.MODERATOR_ROLE_IDS]
  assert.equal((await (await handleRequest(request(data), env, {waitUntil:noIO}, noIO)).json()).type,4)
})

test('slash command temporary attachments are accepted and download errors remain distinguishable', async () => {
  const url = 'https://cdn.discordapp.com/ephemeral-attachments/111/222/追加バンド%20(1).json?ex=test&is=test&hm=test'
  assert.equal((await readBandAttachment({url}, async () => Response.json([{活動名:'一時添付'}])))[0]['活動名'], '一時添付')
  await assert.rejects(readBandAttachment({url}, async () => new Response('',{status:403})), /ATTACHMENT_HTTP_403/)
  await assert.rejects(readBandAttachment({url}, async () => { throw Error('private details') }), /ATTACHMENT_FETCH_FAILED/)
  await assert.rejects(readBandAttachment({url}, async () => new Response('{bad')), /INVALID_JSON_SYNTAX/)
  await assert.rejects(readBandAttachment({url}, async () => new Response(new Uint8Array([0xff]))), /INVALID_JSON_ENCODING/)
  await assert.rejects(readBandAttachment({url}, async () => new Response('x'.repeat(65537))), /ATTACHMENT_TOO_LARGE/)
  for (const invalid of ['https://evil.test/ephemeral-attachments/111/222/a.json','https://cdn.discordapp.com/ephemeral-attachments/not-an-id/a.json']) await assert.rejects(readBandAttachment({url:invalid},noIO),/INVALID_ATTACHMENT_URL/)
})
