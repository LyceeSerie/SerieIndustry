export const productionSheetUrl = 'https://docs.google.com/spreadsheets/d/1fwkoyzz8c82Soh-2WKxwMLl_oMmb-u_cnC5cc6aMP9Y/export?format=csv&gid=554969304'
export const testSheetUrl = 'https://docs.google.com/spreadsheets/d/1DzdgqNtbOWJ6PAF1QusKWaeD-vmw7pfLBOJr-8WUiXI/export?format=csv&gid=0'
export function sourceConfig(testMode = false, env = process.env) {
  if (testMode) return { url: testSheetUrl, directory: '../test-public/data/', environment: 'test', approvedOnly: false }
  const approvedUrl = String(env.VRC_BAND_DB_APPROVED_SHEET_URL || '').trim()
  if (env.VRC_BAND_DB_REQUIRE_APPROVED === 'true' && !approvedUrl) throw new Error('承認済み公開シートURLが未設定です。元回答シートへは切り替えません。')
  if (approvedUrl) {
    const url = new URL(approvedUrl)
    if (url.origin !== 'https://docs.google.com' || !/^\/spreadsheets\/d\/[\w-]+\/export$/.test(url.pathname) || url.searchParams.get('format') !== 'csv' || !/^\d+$/.test(url.searchParams.get('gid') || '')
      || [...url.searchParams.keys()].some(key => !['format', 'gid'].includes(key)) || url.hash || url.username || url.password) throw new Error('公開シートはGoogle SheetsのCSV出力URLを設定してください。')
  }
  // Until external setup is complete, ordinary local builds keep their existing source.
  // Dispatch builds explicitly require the approved source in the workflow.
  return { url: approvedUrl || productionSheetUrl, directory: '../public/data/', environment: 'production', approvedOnly: Boolean(approvedUrl) }
}
