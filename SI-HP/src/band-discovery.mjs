// Sample once per load, without duplicates or mutating the source order.
export function pickBands(bands, random = Math.random) {
  const pool = [...bands]
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[pool[index], pool[other]] = [pool[other], pool[index]]
  }
  return pool.slice(0, 3)
}
