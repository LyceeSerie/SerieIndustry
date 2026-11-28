import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
const result = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('../src/registration/image-link-warning.ts',import.meta.url)),formats:['es']}}})
const chunk=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk')
const {imageLinkWarning}=await import('data:text/javascript;base64,'+Buffer.from(chunk.code).toString('base64'))
test('image links warn about expiring attachments, signed URLs and local-only resources without blocking',()=>{
  for(const host of ['media.discordapp.net','cdn.discordapp.com']) assert.equal(imageLinkWarning(`https://${host}/attachments/1/2/image.png`),'discord')
  for(const key of ['X-Amz-Signature','X-Goog-Signature','Expires','token','sig','se']) assert.equal(imageLinkWarning(`https://example.com/image.png?${key}=value`),'signed')
  for(const url of ['blob:https://example.com/id','file:///C:/image.png','http://localhost:5174/image.png']) assert.equal(imageLinkWarning(url),'local')
  for(const url of ['', 'invalid','https://example.com/image.png?width=512','https://drive.google.com/file/d/abc/view','https://media.discordapp.net.evil.example/attachments/1/2/image.png','https://cdn.discordapp.com/avatars/1/image.png']) assert.equal(imageLinkWarning(url),'')
})
