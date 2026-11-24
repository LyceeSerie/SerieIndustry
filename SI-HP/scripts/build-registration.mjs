import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

function registrationData(terms) {
  return {
    name: 'registration-data',
    resolveId(id) {
      if (id === 'virtual:registration-terms') return '\0' + id
    },
    load(id) {
      if (id === '\0virtual:registration-terms') return 'export default ' + terms
    },
  }
}

export async function registrationPage(preview = false) {
  const legacy = await readFile(new URL('../../automation/discord/tools/band-json-editor.html', import.meta.url), 'utf8')
  const terms = legacy.match(/<script id="registration-terms" type="application\/json">([\s\S]*?)<\/script>/)[1]
  const result = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'error',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false,
    },
    plugins: [vue(), registrationData(terms)],
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('../src/registration.ts', import.meta.url)),
        name: 'BandRegistration',
        formats: ['iife'],
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
      cssCodeSplit: false,
      minify: true,
    },
  })
  const output = (Array.isArray(result) ? result[0] : result).output
  const script = output.filter(item => item.type === 'chunk').map(item => item.code).join('\n').replace(/<\/script/gi, '<\\/script')
  const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n')
  const mock = preview ? await readFile(new URL('./registration-preview.js', import.meta.url), 'utf8') : ''
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VRC Band DB｜バンド登録・編集</title><style>${css}</style><div id="registration-app"></div><script>${mock}\n${script}</script></html>`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const target = new URL('../../automation/discord/worker/generated/', import.meta.url)
  await mkdir(target, { recursive: true })
  await writeFile(new URL('registration.html', target), await registrationPage())
}
