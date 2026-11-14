import { writeFile, mkdir, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseBands } from './band-data.mjs'
import { sourceConfig } from './band-source.mjs'
import { fetchBandCsv } from './fetch-band-sheet.mjs'

const config = sourceConfig(process.argv.includes('--test'))
const csv = await fetchBandCsv(config)
const bands = parseBands(csv)
const dir = new URL(config.directory, import.meta.url)
await mkdir(dir, { recursive: true })
const target = new URL('vrc-bands.json', dir)
const temporary = fileURLToPath(target) + '.tmp'
// The raw CSV, response email and timestamp are never saved or distributed.
await writeFile(temporary, JSON.stringify({ environment: config.environment, updatedAt: new Date().toISOString(), bands }, null, 2) + '\n')
await rename(temporary, target)
console.log(`公開用データを更新しました: ${bands.length}件（回答者メール・タイムスタンプは除外）`)
