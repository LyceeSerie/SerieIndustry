import { appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function selectTargets(paths, event, target = 'all') {
  if (event === 'workflow_dispatch') {
    if (!['all', 'gas', 'worker'].includes(target)) throw new Error('Invalid deployment target')
    return { gas: target !== 'worker', worker: target !== 'gas' }
  }
  const common = paths.some(path => path === '.github/workflows/deploy-discord.yml' || /^automation\/discord\/(ci\/|package(?:-lock)?\.json$)/.test(path))
  return { gas: common || paths.some(path => path.startsWith('automation/discord/gas/')), worker: common || paths.some(path => path.startsWith('automation/discord/worker/')) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env
  let paths = []
  if (env.EVENT_NAME === 'push') {
    if (!/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || '')) throw new Error('Invalid commit SHA')
    if (/^0{40}$/.test(env.PUSH_BEFORE || '')) paths = ['.github/workflows/deploy-discord.yml']
    else {
      if (!/^[a-f0-9]{40}$/i.test(env.PUSH_BEFORE || '')) throw new Error('Invalid previous commit SHA')
      const result = spawnSync('git', ['diff', '--name-only', env.PUSH_BEFORE, env.GITHUB_SHA], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error('Cannot inspect the pushed changes; refusing to guess deployment targets')
      paths = result.stdout.trim().split('\n')
    }
  }
  const targets = selectTargets(paths, env.EVENT_NAME, env.MANUAL_TARGET || 'all')
  if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(env.GITHUB_OUTPUT, `gas=${targets.gas}\nworker=${targets.worker}\n`)
  console.log(`Deployment targets: GAS=${targets.gas}, Worker=${targets.worker}`)
}
