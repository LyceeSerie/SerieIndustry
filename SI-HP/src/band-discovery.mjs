// Sample once per load, without duplicates or mutating the source order.
export function pickBands(bands, random = Math.random, limit = 10) {
  const pool = [...bands]
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[pool[index], pool[other]] = [pool[other], pool[index]]
  }
  return pool.slice(0, limit)
}

// Keep one identical cycle available on either side of the visible set.
export function loopPosition(position, width) {
  if (!(width > 0) || !Number.isFinite(position)) return 0
  return width + ((position - width) % width + width) % width
}
