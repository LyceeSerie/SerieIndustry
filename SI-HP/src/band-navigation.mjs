export function readBandNavigation(query, settings = {}) {
  const bandId = typeof query.band === 'string' ? query.band : ''
  return { bandId, browsing: !!bandId || query.view === 'list' || settings.discoveryEnabled === false }
}

export function createBandNavigation(router, settings = {}) {
  function navigate(view, bandId) {
    const query = { ...router.currentRoute.value.query }
    delete query.view
    delete query.band
    if (view === 'list') query.view = 'list'
    if (bandId) query.band = bandId
    return router.push({ name: 'VRCBandDB', query })
  }
  return {
    home: () => navigate(settings.discoveryEnabled === false ? 'list' : undefined),
    browse: () => navigate('list'),
    select: id => navigate(undefined, id),
  }
}
