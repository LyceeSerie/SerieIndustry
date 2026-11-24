import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('attachment download works in workerd and never follows redirects', async () => {
  const source = readFileSync(new URL('../../worker/src/index.mjs', import.meta.url), 'utf8')
  const download = source.slice(source.indexOf('export async function readAttachmentBytes('), source.indexOf('async function finish('))
  const requests = []
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'attachment-test',
    modules: true,
    compatibilityDate: '2026-11-18',
    script: download + `
      export default { async fetch(request) {
        try { return Response.json(await readBandAttachment({url:'https://cdn.discordapp.com/ephemeral-attachments/111/222/' + new URL(request.url).pathname.slice(1) + '.json'})) }
        catch (error) { return Response.json({code:error.message}, {status:400}) }
      } }
    `,
    outboundService(request) {
      requests.push(request.url)
      if (request.url.endsWith('/redirect.json')) return new Response(null, {status:302,headers:{location:'https://example.com/private'}})
      return Response.json([{活動名:'実行環境テスト'}])
    },
  }] }))
  try {
    const result = await runtime.dispatchFetch('https://runtime.test/success')
    assert.equal(result.status, 200)
    assert.equal((await result.json())[0]['活動名'], '実行環境テスト')
    const redirect = await runtime.dispatchFetch('https://runtime.test/redirect')
    assert.deepEqual(await redirect.json(), {code:'ATTACHMENT_HTTP_302'})
    assert.equal(requests.length, 2)
    assert.ok(requests.every(url=>url.startsWith('https://cdn.discordapp.com/ephemeral-attachments/')))
  } finally { await runtime.dispose() }
})
