import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { youtubeVideoId } from './youtube-video.mjs'
import { parseBands } from './band-data.mjs'

const context = vm.createContext({})
vm.runInContext(readFileSync(new URL('../../automation/discord/gas/Core.gs', import.meta.url), 'utf8'), context)
const id = 'M7lc1UVf-VE'
test('build and GAS agree on supported video URLs and reject unsafe or non-video inputs', () => {
  for (const parse of [youtubeVideoId, context.BandReview.youtubeVideoId]) {
    for (const url of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=test`, `https://m.youtube.com/shorts/${id}`, `https://youtube.com/live/${id}`, `https://www.youtube-nocookie.com/embed/${id}`]) assert.equal(parse(url), id)
    for (const url of ['', 'https://youtube.com/@channel', 'https://youtube.com/playlist?list=x', `https://youtube.com.evil.test/watch?v=${id}`, `https://evil.test/watch?v=${id}`, `https://youtube.com@evil.test/watch?v=${id}`, `http://youtube.com/watch?v=${id}`, '<iframe src="https://youtube.com/embed/x"></iframe>', `https://youtu.be/${id}/extra`, 'javascript:alert(1)']) assert.equal(parse(url), '')
  }
})
test('video CSV field maps to embed ID independently of the channel link', () => {
  const bands = parseBands(`活動名,活動形態１,メインジャンル,YouTube動画URL,SNSリンク（Youtube）\n動画あり,バンド,ロック,https://youtu.be/${id},https://www.youtube.com/@channel\n動画なし,バンド,ロック,,\n`)
  assert.equal(bands[0].youtubeVideoId, id)
  assert.equal(bands[0].links.find(link => link.label === 'YouTube').url, 'https://www.youtube.com/@channel')
  assert.equal(bands[1].youtubeVideoId, '')
})
