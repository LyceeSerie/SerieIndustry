export function matchesBand(band, filters) {
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase()
  const { query = '', type = '', style = '', platforms = [], genre = '', sub = '', status = '', genreMode = 'AND', recruitingParts = [], attributes = [] } = filters
  const genreMatches = !genre && !sub ? true : genreMode === 'OR'
    ? (Boolean(genre) && band.genres.includes(genre)) || (Boolean(sub) && band.subgenres.includes(sub))
    : (!genre || band.genres.includes(genre)) && (!sub || band.subgenres.includes(sub))
  return normalize([band.name, band.reading, band.englishName].join(' ')).includes(normalize(query.trim()))
    && (!status || band.activityStatus === status)
    && (!type || band.types.includes(type))
    && (!style || band.styles.includes(style))
    && (!platforms.length || band.platforms.some(p => platforms.includes(p)))
    && (!recruitingParts.length || recruitingParts.some(part => part === '__none__' ? !band.recruitingParts?.length : band.recruitingParts?.includes(part)))
    && (!attributes.length || attributes.some(tag => band.attributes?.includes(tag)))
    && genreMatches
}

export function getSubgenreOptions(bands, genre = '', genreMode = 'AND') {
  const eligible = genreMode === 'AND' && genre ? bands.filter(b => b.genres.includes(genre)) : bands
  return [...new Set(eligible.flatMap(b => b.subgenres).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
}


export function getFilterOptions(bands, key) {
  return [...new Set(bands.flatMap(band => band[key] || []).filter(Boolean))]
}
export function getActivityStatusOptions(bands) {
  const available = new Set(bands.map(band => band.activityStatus))
  return [{ value: '', label: 'すべて' }, ...[
    { value: 'active', label: '活動中' },
    { value: 'dissolved', label: '解散' },
    { value: 'hiatus', label: '休止中' },
    { value: 'inactive', label: '解散・休止（区分未確認）' },
  ].filter(item => available.has(item.value))]
}
