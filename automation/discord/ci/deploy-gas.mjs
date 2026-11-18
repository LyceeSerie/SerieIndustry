import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises'
import { resolve, join, dirname, relative, basename, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parse as parseJsonc } from 'jsonc-parser'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceFiles = ['Core.gs', 'Code.gs', 'appsscript.json']
export function deploymentIdFromUrl(value) {
  const match = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/.exec(value || '')
  if (!match) throw new Error('GAS_WEBAPP_URL must be an existing /exec deployment URL')
  return match[1]
}
export function validateAuth(raw) {
  let auth
  try { auth = JSON.parse(raw) } catch { throw new Error('CLASPRC_JSON must contain valid clasp credential JSON') }
  if (!auth || Array.isArray(auth) || typeof auth !== 'object') throw new Error('Invalid clasp credential object')
  let hasRefresh = false
  const values = []
  function visit(object) {
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === 'string') {
        if (['refresh_token', 'refreshToken'].includes(key) && value) hasRefresh = true
        if (value) values.push(value)
      } else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(auth)
  if (!hasRefresh) throw new Error('Clasp credentials need a refresh token; run clasp login again')
  return { auth, values }
}
export async function stageGas(directory, { scriptId, sourceDirectory = join(root, 'gas') }) {
  if (!/^[\w-]+$/.test(scriptId || '')) throw new Error('GAS_SCRIPT_ID is required (script project ID, not Form ID)')
  const code = join(directory, 'source')
  await mkdir(code, { recursive: true, mode: 0o700 })
  for (const name of sourceFiles) {
    const contents = await readFile(join(sourceDirectory, name), 'utf8')
    if (!contents.trim()) throw new Error(`Missing GAS source: ${name}`)
    await writeFile(join(code, name), contents)
  }
  await writeFile(join(directory, '.clasp.json'), JSON.stringify({ scriptId, rootDir: await realpath(code), scriptExtensions: ['.gs'], jsonExtensions: ['.json'] }), { mode: 0o600 })
  // Only these three files are uploaded; configuration examples and tests stay local.
  await writeFile(join(directory, '.claspignore'), '**/**\n!Core.gs\n!Code.gs\n!appsscript.json\n')
  return { code, project: join(directory, '.clasp.json'), files: sourceFiles }
}
export async function deployGas({ dryRun = false, env = process.env, execute = spawnSync, log = console.log, tempParent = env.RUNNER_TEMP || tmpdir() } = {}) {
  const config = parseJsonc(await readFile(join(root, 'worker/wrangler.jsonc'), 'utf8'))
  const deploymentId = deploymentIdFromUrl(config.vars.GAS_WEBAPP_URL)
  const scriptId = env.GAS_SCRIPT_ID || (dryRun ? 'DRY_RUN_SCRIPT_ID' : '')
  const credentials = dryRun ? null : validateAuth(env.CLASPRC_JSON || '')
  // All validation happens before invoking clasp or changing the remote project.
  if (!/^[\w-]+$/.test(scriptId)) throw new Error('GAS_SCRIPT_ID is required (Apps Script project settings → Script ID)')
  const parent = resolve(tempParent)
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(join(parent, 'vrc-band-db-gas-'))
  const owned = relative(parent, directory)
  if (!owned || owned.startsWith('..') || owned.includes(sep) || !basename(directory).startsWith('vrc-band-db-gas-')) throw new Error('Unsafe temporary directory')
  try {
    const staged = await stageGas(directory, { scriptId })
    const authFile = join(directory, '.clasprc.json')
    if (credentials) {
      // Mask individual credential values as well as the whole GitHub Secret.
      if (env.GITHUB_ACTIONS === 'true') for (const value of credentials.values) log('::add-mask::' + value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'))
      await writeFile(authFile, JSON.stringify(credentials.auth), { mode: 0o600 })
    }
    const clasp = join(root, 'node_modules/@google/clasp/build/src/index.js')
    const args = ['--project', staged.project, '--ignore', join(directory, '.claspignore')]
    if (credentials) args.push('--auth', authFile)
    const childEnv = { ...env }
    delete childEnv.CLASPRC_JSON
    function run(command) {
      const result = execute(process.execPath, [clasp, ...args, ...command], { cwd: directory, env: childEnv, encoding: 'utf8', maxBuffer: 1024 * 1024 })
      // Never forward raw credential-bearing CLI errors to Actions logs.
      if (result.error || result.status !== 0) throw new Error(`clasp ${command[0]} failed. Check the Google login, Apps Script API, script ID and deployment owner.`)
      return result.stdout
    }
    if (dryRun) {
      const output = run(['show-file-status'])
      for (const name of sourceFiles) if (!String(output).includes(name)) throw new Error(`Clasp would omit ${name}; deployment stopped`)
      log('GAS dry-run: Core.gs, Code.gs and appsscript.json are selected. No Google request, upload or deployment was performed.')
      return { dryRun: true, files: sourceFiles }
    }
    let deployments
    try { deployments = JSON.parse(run(['list-deployments', '--json'])) }
    catch { throw new Error('Cannot verify GAS deployment ownership. No source was uploaded.') }
    const previous = Array.isArray(deployments) && deployments.find(item => item.deploymentId === deploymentId && Number.isInteger(item.versionNumber) && item.versionNumber > 0)
    if (!previous) throw new Error('GAS_SCRIPT_ID does not contain the existing web app deployment. No source was uploaded.')
    log('Verified the existing GAS deployment. Previous version: ' + previous.versionNumber)
    // Source updates do not reset Script Properties or reinstall triggers.
    run(['push', '--force'])
    // Updating the existing deployment preserves the /exec URL used by the Worker.
    try { run(['create-deployment', '--deploymentId', deploymentId, '--description', 'GitHub ' + (env.GITHUB_SHA || 'manual').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)]) }
    catch { throw new Error('GAS source was uploaded, but web app deployment update failed. Triggers may already use the new source; inspect the project and retry or restore the prior source.') }
    log('Updated the existing GAS deployment. Script Properties and triggers were not modified.')
    return { dryRun: false, deploymentId }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await deployGas({ dryRun: process.argv.includes('--dry-run') }) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
