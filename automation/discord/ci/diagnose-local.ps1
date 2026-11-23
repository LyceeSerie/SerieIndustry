param([switch]$SendTest)

# Run interactively. Never accept a token as a command-line argument or save it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$channelId = '1572258078017986620'
$applicationId = '1572571223731474452'
$guildId = '1571340844689268827'
$secureToken = Read-Host 'Paste the SAME DISCORD_BOT_TOKEN used in GAS (input is hidden)' -AsSecureString
$pointer = [IntPtr]::Zero
$client = $null
$token = $null
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($token) -or $token -ne $token.Trim() -or $token.StartsWith('Bot ')) {
        throw 'Enter only the token, without quotes, spaces or the Bot prefix.'
    }
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(20)
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bot', $token)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('DiscordBot (https://github.com/LyceeSerie/SerieIndustry, 1.0.0)')

    function Invoke-DiscordCheck([string]$Label, [string]$Path, [string]$Payload = '') {
        $method = if ($Payload) { [System.Net.Http.HttpMethod]::Post } else { [System.Net.Http.HttpMethod]::Get }
        $request = [System.Net.Http.HttpRequestMessage]::new($method, ('https://discord.com/api/v10' + $Path))
        $response = $null
        try {
            if ($Payload) { $request.Content = [System.Net.Http.StringContent]::new($Payload, [Text.Encoding]::UTF8, 'application/json') }
            try { $response = $client.SendAsync($request).GetAwaiter().GetResult() }
            catch { throw ('{0}: NETWORK_ERROR (raw exception hidden)' -f $Label) }
            $status = [int]$response.StatusCode
            $body = $null
            try { $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json } catch { }
            $code = 'none'
            if ($null -ne $body -and $null -ne $body.code -and [string]$body.code -match '^\d+$') { $code = [string]$body.code }
            Write-Host ('{0}: HTTP {1}, Discord code={2}' -f $Label, $status, $code)
            if (-not $response.IsSuccessStatusCode) { throw ('{0}: stopped; do not retry repeatedly.' -f $Label) }
            return $body
        } finally {
            if ($null -ne $response) { $response.Dispose() }
            $request.Dispose()
        }
    }

    $bot = Invoke-DiscordCheck 'Bot authentication' '/users/@me'
    if ($bot.id -ne $applicationId -or $bot.bot -ne $true) { throw 'WRONG_BOT: the token does not belong to the configured application.' }
    Write-Host 'Bot identity: matches configured application'
    $channel = Invoke-DiscordCheck 'Channel access' ('/channels/' + $channelId)
    if ($channel.id -ne $channelId -or $channel.guild_id -ne $guildId) { throw 'WRONG_CHANNEL_OR_GUILD' }
    Write-Host 'Channel identity: matches configured server'
    if ($SendTest) {
        $payload = @{
            content = '[VRC Band DB] Local connection test (not a registration notice).'
            embeds = @(@{ title = 'Connection test'; description = 'Testing message and embed permissions from the local PC.' })
            allowed_mentions = @{ parse = @() }
        } | ConvertTo-Json -Depth 6 -Compress
        $message = Invoke-DiscordCheck 'Test message' ('/channels/' + $channelId + '/messages') $payload
        if ($message.author.id -ne $applicationId) { throw 'UNEXPECTED_MESSAGE_AUTHOR' }
        Write-Host 'SUCCESS: one test message was posted. No registration data was changed.'
    } else {
        Write-Host 'Read-only checks passed. Use -SendTest to post one test message.'
    }
} catch {
    # Controlled error messages only; no HTTP payloads or credential-bearing exceptions.
    $safe = [string]$_.Exception.Message
    if ($token) { $safe = $safe.Replace($token, '[REDACTED]') }
    if ($safe -match '^(Enter only|Bot authentication:|Channel access:|Test message:|WRONG_|UNEXPECTED_)') { Write-Host $safe }
    else { Write-Host 'LOCAL_DIAGNOSTIC_FAILED: exception details hidden to protect credentials.' }
    exit 1
} finally {
    if ($null -ne $client) { $client.Dispose() }
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $token = $null
    $secureToken.Dispose()
}
