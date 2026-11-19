export const commands = ['band-info', 'band-delete'].map(name => ({
  type: 1, name,
  description: name === 'band-info' ? '【管理人専用】登録IDから登録状態を確認します' : '【管理人専用】登録をサイトから掲載削除します（確認あり）',
  default_member_permissions: null,
  options: [{ type: 3, name: 'id', description: '通知メッセージに表示された登録ID', required: true, min_length: 36, max_length: 36 }],
}))

export async function registerCommands(config, fetchImpl = fetch, log = console.log) {
  const headers = { Authorization: 'Bot ' + config.token, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)' }
  async function request(path, method, body) {
    let result
    try { result = await fetchImpl('https://discord.com/api/v10' + path, { method, headers, body: body && JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) }) }
    catch { throw new Error('DISCORD_COMMAND_NETWORK_ERROR') }
    let data
    try { data = await result.json() } catch { throw new Error('DISCORD_COMMAND_INVALID_RESPONSE') }
    if (!result.ok) throw new Error('DISCORD_COMMAND_HTTP_' + result.status + (Number.isSafeInteger(data?.code) ? '_CODE_' + data.code : ''))
    return data
  }
  const bot = await request('/users/@me', 'GET')
  if (bot.id !== config.applicationId || bot.bot !== true) throw new Error('INVALID_COMMAND_BOT')
  for (const command of commands) {
    // POST upserts by name, preserving unrelated commands. Never bulk overwrite the server's commands.
    const result = await request('/applications/' + config.applicationId + '/guilds/' + config.guildId + '/commands', 'POST', command)
    if (result.name !== command.name || !/^\d{10,25}$/.test(result.id || '')) throw new Error('INVALID_COMMAND_RESPONSE')
    log('Registered /' + command.name)
  }
}
