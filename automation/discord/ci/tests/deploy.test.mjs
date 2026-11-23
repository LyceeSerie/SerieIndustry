import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { parse } from 'jsonc-parser'
import { deploymentIdFromUrl, stageGas, deployGas, validateAuth } from '../deploy-gas.mjs'
import { selectTargets } from '../select-targets.mjs'

const fakeAuth = JSON.stringify({ tokens: { default: { client_id: 'fixture-client', client_secret: 'fixture-client-secret', refresh_token: 'fixture-refresh-token' } } })
const env = { GAS_SCRIPT_ID: 'fixture-script', CLASPRC_JSON: fakeAuth, GITHUB_SHA: 'a'.repeat(40) }
const config = parse(await readFile(new URL('../../worker/wrangler.jsonc', import.meta.url), 'utf8'))
const deploymentId = deploymentIdFromUrl(config.vars.GAS_WEBAPP_URL)
async function temporary(callback) {
  const parent = resolve(tmpdir())
  const path = await mkdtemp(join(parent, 'vrc-deploy-test-'))
  assert.ok(relative(parent, path).startsWith('vrc-deploy-test-'))
  try { return await callback(path) } finally { await rm(path, { recursive: true, force: true }) }
}
test('staging includes exactly code and manifest, never settings or credentials', async () => temporary(async directory => {
  const staged = await stageGas(directory, { scriptId: env.GAS_SCRIPT_ID })
  assert.deepEqual((await readdir(staged.code)).sort(), ['Code.gs', 'Core.gs', 'appsscript.json'])
  assert.equal(JSON.parse(await readFile(staged.project, 'utf8')).scriptId, env.GAS_SCRIPT_ID)
  assert.match(await readFile(join(directory, '.claspignore'), 'utf8'), /!Core.gs/)
  assert.deepEqual(JSON.parse(await readFile(join(staged.code, 'appsscript.json'), 'utf8')).webapp, { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' })
}))

test('a manifest that would remove the externally accessible web app is refused before deployment', async () => temporary(async directory => {
  const sourceDirectory = join(directory, 'fixture')
  await mkdir(sourceDirectory)
  await writeFile(join(sourceDirectory, 'Core.gs'), 'var fixture = true;')
  await writeFile(join(sourceDirectory, 'Code.gs'), 'function doPost() {}')
  await writeFile(join(sourceDirectory, 'appsscript.json'), JSON.stringify({ runtimeVersion: 'V8' }))
  await assert.rejects(stageGas(join(directory, 'stage'), { scriptId: env.GAS_SCRIPT_ID, sourceDirectory }), /manifest must preserve/)
}))
test('dry-run never asks for credentials and performs only local file selection', async () => {
  const calls = []
  const result = await deployGas({ dryRun: true, env: {}, log() {}, execute: (exe, args, options) => {
    calls.push({ exe, args, options }); return { status: 0, stdout: 'Core.gs\nCode.gs\nappsscript.json' }
  } })
  assert.equal(result.dryRun, true); assert.equal(calls.length, 1)
  assert.ok(calls[0].args.includes('show-file-status')); assert.ok(!calls[0].args.includes('push'))
  await assert.rejects(stat(calls[0].options.cwd), /ENOENT/)
})
test('GAS deployment verifies the existing version before push and reuses the deployment ID', async () => {
  const calls = []; const logs = []
  const result = await deployGas({ env, log: line => logs.push(line), execute: (exe, args, options) => {
    calls.push({ args, options })
    assert.equal(options.env.CLASPRC_JSON, undefined)
    assert.equal(args.includes('initializeIntegration'), false)
    return { status: 0, stdout: args.includes('list-deployments') ? JSON.stringify([{ deploymentId, versionNumber: 3 }]) : '' }
  } })
  assert.equal(result.deploymentId, deploymentId); assert.equal(calls.length, 3)
  assert.ok(calls[0].args.includes('list-deployments')); assert.ok(calls[1].args.includes('push'))
  assert.ok(calls[2].args.includes('--deploymentId')); assert.ok(calls[2].args.includes(deploymentId))
  assert.equal(logs.join('\n').includes('fixture-refresh-token'), false)
  await assert.rejects(stat(calls[0].options.cwd), /ENOENT/)
})
test('wrong script/deployment mapping cannot upload source', async () => {
  const calls = []
  await assert.rejects(deployGas({ env, log() {}, execute: (exe, args, options) => {
    calls.push({ args, options }); return { status: 0, stdout: '[]' }
  } }), /No source was uploaded/)
  assert.equal(calls.length, 1); assert.ok(!calls[0].args.includes('push'))
  await assert.rejects(stat(calls[0].options.cwd), /ENOENT/)
})
test('failed push stops deployment and hides raw CLI errors, even if they contain tokens', async () => {
  const calls = []
  await assert.rejects(deployGas({ env, log() {}, execute: (exe, args) => {
    calls.push(args)
    return args.includes('list-deployments') ? { status: 0, stdout: JSON.stringify([{ deploymentId, versionNumber: 3 }]) } : { status: 1, stderr: fakeAuth }
  } }), error => !error.message.includes('fixture-refresh-token') && error.message.includes('push failed'))
  assert.equal(calls.length, 2)
})
test('bad credentials and IDs fail before invoking deployment tools', async () => {
  for (const invalid of ['', '{}', 'not-json', '[]']) assert.throws(() => validateAuth(invalid))
  await assert.rejects(deployGas({ env: { ...env, GAS_SCRIPT_ID: '' }, execute() { assert.fail('Unexpected command') } }), /GAS_SCRIPT_ID/)
  assert.throws(() => deploymentIdFromUrl('https://example.com/exec'))
})
test('push selects only changed components; documentation/tests do not trigger a redeploy', () => {
  assert.deepEqual(selectTargets(['automation/discord/gas/Code.gs'], 'push'), { gas: true, worker: false })
  assert.deepEqual(selectTargets(['automation/discord/worker/src/index.mjs'], 'push'), { gas: false, worker: true })
  assert.deepEqual(selectTargets(['automation/discord/tools/band-json-editor.html'], 'push'), { gas: false, worker: true })
  assert.deepEqual(selectTargets(['SI-HP/src/views/BandRegistrationPage.vue'], 'push'), { gas: false, worker: true })
  assert.deepEqual(selectTargets(['SI-HP/src/components/BandVisual.vue'], 'push'), { gas: false, worker: true })
  assert.deepEqual(selectTargets(['automation/discord/tests/core.test.mjs', 'automation/discord/README.md'], 'push'), { gas: false, worker: false })
  assert.deepEqual(selectTargets(['.github/workflows/deploy-discord.yml'], 'push'), { gas: true, worker: true })
  assert.deepEqual(selectTargets([], 'workflow_dispatch', 'gas'), { gas: true, worker: false })
  assert.throws(() => selectTargets([], 'workflow_dispatch', 'unknown'))
})
