const { spawn } = require('node:child_process')
const path = require('node:path')

// CI only produces deployment files; local builds also keep a preview available.
if (process.env.CI) process.exit(0)

const root = path.resolve(__dirname, '..')
const testMode = process.argv.includes('--test')
const port = testMode ? '5174' : '5173'
const url = `http://127.0.0.1:${port}/`
async function available() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
    return response.ok && (await response.text()).includes('/assets/')
  } catch { return false }
}
async function main() {
  if (!await available()) {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--mode', testMode ? 'test' : 'production', '--outDir', testMode ? 'dist-test' : 'dist', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
    })
    child.on('error', error => { console.error(error.message); process.exitCode = 1 })
    child.unref()
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await available()) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!await available()) {
    throw new Error(`Preview could not start on port ${port}. Check whether another application is using the port.`)
  }
  console.log(`Preview ready: ${url}#/VRCBandDB`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
