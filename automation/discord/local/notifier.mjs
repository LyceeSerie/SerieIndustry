import { createHash } from 'node:crypto'
import { appendFileSync, statSync, renameSync, mkdirSync } from 'node:fs'
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signEnvelope } from '../worker/src/index.mjs'
import { registerCommands } from './commands.mjs'

const snowflake = value => typeof value === 'string' && /^\d{10,25}$/.test(value)
function localLog(message, error = false) {
  const line = new Date().toISOString() + ' ' + message
  if (error) console.error(line); else console.log(line)
  try {
    const directory = fileURLToPath(new URL('./.state/', import.meta.url))
    mkdirSync(directory, { recursive: true })
    const path = join(directory, 'notifier.log')
    try { if (statSync(path).size >= 1024 * 1024) renameSync(path, path + '.previous') } catch { /* No log yet, or keep using current log. */ }
    appendFileSync(path, line + '\n', { mode: 0o600 })
  } catch { /* Logging must not interrupt durable notification delivery. */ }
}
export function validateConfig(config) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.gasUrl || '')
    || ![config.guildId, config.channelId, config.applicationId].every(snowflake)
    || !/^[a-f0-9]{64}$/i.test(config.secret || '') || !config.token?.trim() || config.token !== config.token.trim()) throw new Error('INVALID_LOCAL_SETTINGS')
  return config
}
export function validateJob(job, config) {
  if (!job || !/^[a-f0-9-]{36}$/i.test(job.id || '') || !/^[a-f0-9-]{36}$/i.test(job.registrationId || '')
    || !['current', 'retired'].includes(job.kind) || !Number.isSafeInteger(job.revision) || job.revision < 1
    || job.channelId !== config.channelId || job.applicationId !== config.applicationId
    || (job.messageId && !snowflake(job.messageId)) || (job.kind === 'retired' && !snowflake(job.messageId))
    || !job.payload || typeof job.payload !== 'object') throw new Error('INVALID_NOTIFICATION_JOB')
  return job
}
export async function gasCall(config, data, fetchImpl = fetch) {
  const envelope = await signEnvelope({ ...data, guildId: config.guildId, channelId: config.channelId }, config.secret)
  let result
  try {
    result = await fetchImpl(config.gasUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope), redirect: 'follow', signal: AbortSignal.timeout(30000) })
  } catch { throw new Error('GAS_NETWORK_ERROR') }
  if (!result.ok) throw new Error('GAS_HTTP_' + result.status)
  let body
  try { body = await result.json() } catch { throw new Error('GAS_INVALID_RESPONSE') }
  if (body?.ok !== true) throw new Error('GAS_REQUEST_REJECTED_CHECK_MODE_AND_LOCAL_KEY')
  return body
}
export async function deliver(config, job, fetchImpl = fetch) {
  validateJob(job, config)
  // Same job has a stable Discord nonce across transport retries.
  const payload = { ...job.payload, allowed_mentions: { parse: [] } }
  if (!job.messageId) { payload.nonce = createHash('sha256').update(job.id).digest('hex').slice(0, 24); payload.enforce_nonce = true }
  let result
  try {
    result = await fetchImpl('https://discord.com/api/v10/channels/' + config.channelId + '/messages' + (job.messageId ? '/' + job.messageId : ''), {
      method: job.messageId ? 'PATCH' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bot ' + config.token, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)' }, body: JSON.stringify(payload),
    })
  } catch { throw new Error('DISCORD_NETWORK_ERROR') }
  let body
  try { body = await result.json() } catch { throw new Error('DISCORD_INVALID_RESPONSE_HTTP_' + result.status) }
  if (!result.ok) {
    const code = Number.isSafeInteger(body?.code) ? '_CODE_' + body.code : ''
    const error = new Error('DISCORD_HTTP_' + result.status + code)
    // Honor the server's rate limit without retrying inside a delivery attempt.
    error.retryMs = result.status === 429 && Number.isFinite(body.retry_after) ? Math.min(3600000, Math.max(60000, body.retry_after * 1000)) : 60000
    throw error
  }
  if (!snowflake(body?.id) || body.author?.id !== config.applicationId || (job.messageId && body.id !== job.messageId)) throw new Error('INVALID_DISCORD_MESSAGE')
  return body.id
}
export async function tick(config, state, fetchImpl = fetch) {
  // Durable receipt is retried before claiming or sending anything else, including after restart.
  const receipt = await state.read()
  if (receipt) {
    await gasCall(config, { kind: 'local_ack', ...receipt }, fetchImpl)
    await state.clear()
    return 'acknowledged'
  }
  const { job } = await gasCall(config, { kind: 'local_claim' }, fetchImpl)
  if (!job) return 'idle'
  const messageId = await deliver(config, job, fetchImpl)
  await state.save({ registrationId: job.registrationId, jobId: job.id, messageId })
  return 'sent' // Next tick acknowledges; never resend after a saved receipt.
}
export async function fileState(directory) {
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'receipt.json')
  return {
    async read() {
      let raw
      try { raw = await readFile(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('RECEIPT_READ_FAILED') }
      let receipt
      try { receipt = JSON.parse(raw) } catch { throw new Error('RECEIPT_INVALID_DO_NOT_DELETE') }
      if (!/^[a-f0-9-]{36}$/i.test(receipt.registrationId || '') || !/^[a-f0-9-]{36}$/i.test(receipt.jobId || '') || !snowflake(receipt.messageId)) throw new Error('RECEIPT_INVALID_DO_NOT_DELETE')
      return receipt
    },
    async save(receipt) { await writeFile(path + '.tmp', JSON.stringify(receipt), { mode: 0o600 }); await rename(path + '.tmp', path) },
    async clear() { await unlink(path) },
  }
}
export async function run() {
  const configPath = fileURLToPath(new URL('./config.json', import.meta.url))
  const nonSecret = JSON.parse(await readFile(configPath, 'utf8'))
  const config = validateConfig({ ...nonSecret, token: process.env.LOCAL_DISCORD_BOT_TOKEN, secret: process.env.LOCAL_NOTIFY_SECRET })
  delete process.env.LOCAL_DISCORD_BOT_TOKEN; delete process.env.LOCAL_NOTIFY_SECRET
  if (process.argv.includes('--register-commands')) { await registerCommands(config); return }
  const directory = fileURLToPath(new URL('./.state/', import.meta.url))
  const state = await fileState(directory)
  const lockPath = join(directory, 'process.lock')
  let lock
  for (let attempt = 0; attempt < 2; attempt++) {
    try { lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); break }
    catch (error) {
      if (error.code !== 'EEXIST' || attempt) throw new Error('NOTIFIER_ALREADY_RUNNING_OR_LOCKED')
      const pid = Number(await readFile(lockPath, 'utf8'))
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('INVALID_PROCESS_LOCK')
      try { process.kill(pid, 0); throw new Error('NOTIFIER_ALREADY_RUNNING') }
      catch (check) { if (check.code !== 'ESRCH') throw new Error('NOTIFIER_ALREADY_RUNNING_OR_LOCKED') }
      await unlink(lockPath)
    }
  }
  let stopping = false
  process.once('SIGINT', () => { stopping = true }); process.once('SIGTERM', () => { stopping = true })
  localLog('Local notifier started. Polling every 30 seconds; Ctrl+C stops it.')
  let failures = 0
  let lastIdleLog = 0
  try {
    while (!stopping) {
      let delay = 30000
      try {
        const result = await tick(config, state)
        failures = 0
        if (result !== 'idle') localLog(result)
        else if (Date.now() - lastIdleLog >= 300000) { localLog('idle: no pending notifications'); lastIdleLog = Date.now() }
        if (result === 'sent' || result === 'acknowledged') delay = 1000
      } catch (error) {
        failures++
        const message = /^(GAS_|DISCORD_|INVALID_|RECEIPT_)[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'LOCAL_NOTIFICATION_FAILED'
        localLog(message, true)
        delay = Math.max(error.retryMs || 0, Math.min(900000, 60000 * 2 ** Math.min(failures - 1, 4)))
      }
      for (let elapsed = 0; elapsed < delay && !stopping; elapsed += 1000) await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } finally { await lock.close(); await unlink(lockPath) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run() } catch (error) {
    if (/^(DISCORD_COMMAND_|INVALID_COMMAND_)[A-Z0-9_]+$/.test(error.message || '')) localLog(error.message, true)
    localLog('LOCAL_START_FAILED: check settings, credentials and whether another notifier is running.', true); process.exitCode = 1
  }
}
