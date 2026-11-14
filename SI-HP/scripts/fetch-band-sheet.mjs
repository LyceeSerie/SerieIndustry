// Build-time fetch for the link-shared sheet. No credentials are used.
export async function fetchBandCsv(config, { fetchImpl = fetch } = {}) {
  let response
  try {
    response = await fetchImpl(config.url, { signal: AbortSignal.timeout(30000) })
  } catch {
    throw new Error('回答シートに接続できませんでした。ネットワークと共有設定を確認してください。')
  }
  if (!response.ok) throw new Error(`回答シート取得失敗 (${response.status})。リンクを知っている全員が閲覧できる設定か確認してください。`)
  const csv = await response.text()
  if (/^\s*(?:<!doctype html|<html)/i.test(csv)) throw new Error('CSVではなくHTMLが返されました。シートの共有設定を確認してください。')
  return csv
}
