export function readBandNavigation(query) {
  const bandId = typeof query.band === 'string' ? query.band : ''
  return { bandId, browsing: !!bandId || query.view === 'list' }
}

export function createBandNavigation(router) {
  function navigate(view, bandId) {
    const query = { ...router.currentRoute.value.query }
    delete query.view
    delete query.band
    if (view === 'list') query.view = 'list'
    if (bandId) query.band = bandId
    return router.push({ name: 'VRCBandDB', query })
  }
  return {
    home: () => navigate(),
    browse: () => navigate('list'),
    select: id => navigate(undefined, id),
  }
}
