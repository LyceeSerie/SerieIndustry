$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '.credentials.json'
if (Test-Path -LiteralPath $path) {
    # Re-running setup copies the existing key, without rotating it or replacing the token.
    $existing = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $savedKey = ConvertTo-SecureString -String $existing.secret
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($savedKey)
        Set-Clipboard -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
        Write-Host 'Existing LOCAL_NOTIFY_SECRET copied to clipboard. Credentials were not changed.'
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $savedKey.Dispose()
    }
    exit 0
}
$token = Read-Host 'Paste DISCORD_BOT_TOKEN (hidden)' -AsSecureString
try {
    $bytes = [byte[]]::new(32)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    $secureKey = ConvertTo-SecureString -String $key -AsPlainText -Force
    try {
        # Windows DPAPI: decryptable only by this Windows user on this PC.
        @{ token = ($token | ConvertFrom-SecureString); secret = ($secureKey | ConvertFrom-SecureString) } |
            ConvertTo-Json | Set-Content -LiteralPath $path -Encoding UTF8
        Set-Clipboard -Value $key
        Write-Host 'Encrypted credentials saved for the current Windows user.'
        Write-Host 'LOCAL_NOTIFY_SECRET was copied to the clipboard (not displayed).'
        Write-Host 'In GAS Script Properties set LOCAL_NOTIFY_SECRET to the clipboard value.'
        Write-Host 'Then set NOTIFICATION_TRANSPORT to local. Keep ENABLED=true.'
        Write-Host 'Deploy the updated GAS code before starting start.ps1.'
    } finally { $secureKey.Dispose(); $key = $null }
} finally { $token.Dispose() }
