$ErrorActionPreference = 'Stop'
function Unprotect-LocalValue([string]$Value) {
    $secure = ConvertTo-SecureString -String $Value
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $secure.Dispose()
    }
}
try {
    $credentials = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.credentials.json') -Raw | ConvertFrom-Json
    $env:LOCAL_DISCORD_BOT_TOKEN = Unprotect-LocalValue $credentials.token
    $env:LOCAL_NOTIFY_SECRET = Unprotect-LocalValue $credentials.secret
    & node (Join-Path $PSScriptRoot 'notifier.mjs')
    $result = $LASTEXITCODE
} catch {
    Write-Host 'LOCAL_START_FAILED: run setup.ps1 first, using the same Windows account and PC.'
    $result = 1
} finally {
    Remove-Item Env:LOCAL_DISCORD_BOT_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:LOCAL_NOTIFY_SECRET -ErrorAction SilentlyContinue
}
exit $result
