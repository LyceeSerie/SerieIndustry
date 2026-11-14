import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4)
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([size, body, checksum])
}
function png(width, height, pixel) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (width * 4 + 1) + 1 + x * 4
    raw.set(pixel(x, y), offset)
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
export async function prepareTestAssets() {
  const dir = new URL('../test-public/test-assets/', import.meta.url)
  await mkdir(dir, { recursive: true })
  await writeFile(new URL('photo.png', dir), png(960, 540, (x, y) => {
    if (x < 6 || y < 6 || x > 953 || y > 533) return [40,60,80,255]
    if (Math.abs(x - 480) < 2 || Math.abs(y - 270) < 2) return [255,255,255,255]
    return x < 480 ? y < 270 ? [163,200,230,255] : [184,216,184,255] : y < 270 ? [239,208,159,255] : [216,184,222,255]
  }))
  await writeFile(new URL('logo.png', dir), png(240, 120, (x, y) => (x > 10 && x < 230 && y > 10 && y < 110) ? (y > 35 && y < 85 && x > 30 && x < 210 ? [255,255,255,255] : [163,38,95,220]) : [0,0,0,0]))
  await writeFile(new URL('icon.png', dir), png(128, 128, (x, y) => (x - 64) ** 2 + (y - 64) ** 2 < 35 ** 2 ? [255,255,255,255] : [36,87,65,255]))
}
