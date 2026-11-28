export function musicCandidates(bands) {
  const seen = new Set()
  return bands.filter(band => /^[A-Za-z0-9_-]{11}$/.test(band.youtubeVideoId || '') && !seen.has(band.youtubeVideoId) && seen.add(band.youtubeVideoId))
    .map(band => ({ id:'video:'+band.youtubeVideoId, bandId: band.id, name: band.name, videoId: band.youtubeVideoId }))
}
export function musicState() {
  return { current: null, pending: [], randomEnabled: false, seen: [], failed: [] }
}
export function createMusicQueue(state = musicState(), random = Math.random) {
  let sequence=0
  const item = band => musicCandidates([band])[0]
  function add(band) {
    const value = item(band)
    if (!value) return 'noVideo'
    state.failed = state.failed.filter(id => id !== value.videoId)
    state.pending.push({...value,id:'queue:'+ ++sequence})
    return 'added'
  }
  function addAll(bands) {
    let added=0
    for(const band of bands)if(add(band)==='added')added++
    return {added,skipped:bands.length-added}
  }
  function play(band) {
    const value = item(band)
    if (!value) return null
    state.failed = state.failed.filter(id => id !== value.videoId)
    state.current = {...value,id:'play:'+ ++sequence}
    if (!state.seen.includes(value.videoId)) state.seen.push(value.videoId)
    return value
  }
  function playQueued(id) {
    const index=state.pending.findIndex(row=>row.id===id)
    if(index<0)return null
    const [value]=state.pending.splice(index,1)
    state.failed=state.failed.filter(videoId=>videoId!==value.videoId)
    state.current=value
    if(!state.seen.includes(value.videoId))state.seen.push(value.videoId)
    return value
  }
  function next(bands) {
    let value
    while (state.pending.length && !value) {
      const candidate = state.pending.shift()
      if (!state.failed.includes(candidate.videoId)) value = candidate
    }
    if (!value && state.randomEnabled) {
      const candidates = musicCandidates(bands).filter(row => !state.failed.includes(row.videoId))
      let available = candidates.filter(row => !state.seen.includes(row.videoId))
      if (!available.length && candidates.length > 1) {
        const last = state.current?.videoId || state.seen.at(-1)
        state.seen = last ? [last] : []
        available = candidates.filter(row => row.videoId !== last)
      }
      if (available.length) value = available[Math.floor(random() * available.length)]
    }
    state.current = value || null
    if (value && !state.seen.includes(value.videoId)) state.seen.push(value.videoId)
    return state.current
  }
  function startRandom(bands) {
    if (!state.current) state.seen = []
    state.randomEnabled = true
    return state.current || next(bands)
  }
  function fail(bands) {
    if (state.current && !state.failed.includes(state.current.videoId)) state.failed.push(state.current.videoId)
    return next(bands)
  }
  function remove(id) { state.pending = state.pending.filter(row => row.id !== id) }
  function move(id, direction) {
    const from = state.pending.findIndex(row => row.id === id), to = from + direction
    if (from < 0 || to < 0 || to >= state.pending.length) return
    ;[state.pending[from], state.pending[to]] = [state.pending[to], state.pending[from]]
  }
  function close() { state.current = null; state.randomEnabled = false }
  return { add, addAll, play, playQueued, next, startRandom, fail, remove, move, close }
}

export function clampMusicSize(width,videoHeight,viewportWidth,viewportHeight,overhead=160) {
  const maxWidth=Math.max(0,viewportWidth-32)
  return {
    width:Math.min(maxWidth,Math.max(Math.min(264,maxWidth),width)),
    videoHeight:Math.max(200,Math.min(videoHeight,viewportHeight-overhead-32)),
  }
}

export function clampMusicPosition(right,bottom,width,height,viewportWidth,viewportHeight) {
  return {
    right:Math.max(8,Math.min(right,Math.max(8,viewportWidth-width-8))),
    bottom:height>viewportHeight-16?viewportHeight-height-8:Math.max(8,Math.min(bottom,viewportHeight-height-8)),
  }
}
