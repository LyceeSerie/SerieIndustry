import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareTestAssets } from './test-assets.mjs'
import { readdir, cp, mkdir } from 'node:fs/promises'
const root = fileURLToPath(new URL('../', import.meta.url))
const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
run('./sync-bands.mjs', ['--test', ...(process.argv.includes('--fixtures') ? ['--fixtures'] : [])])
const testPublic = new URL('../test-public/', import.meta.url)
await mkdir(testPublic, { recursive: true })
for (const name of await readdir(new URL('../public/', import.meta.url))) {
  if (name !== 'data') await cp(new URL(`../public/${name}`, import.meta.url), new URL(name, testPublic), { recursive: true })
}
await prepareTestAssets()
run('../node_modules/vue-tsc/bin/vue-tsc.js', ['-b'])
run('../node_modules/vite/bin/vite.js', ['build', '--mode', 'test'])
run('./start-preview.cjs', ['--test'])
