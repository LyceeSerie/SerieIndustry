param(
 [string]$Destination = 'C:\Users\Cubase\Documents\Unity_VRC\VCC\SI-Samples\Assets\SerieIndustry\VRCBandDB',
 [switch]$Build
)
$ErrorActionPreference = 'Stop'
$sourcePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'VRCBandDB'))
$targetPath = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($targetPath -notmatch '[\\/]Assets[\\/]SerieIndustry[\\/]VRCBandDB$') { throw 'Destination must be Assets/SerieIndustry/VRCBandDB.' }
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
Get-ChildItem -LiteralPath $sourcePath -File -Recurse | Where-Object { $_.Name -ne 'BuildCalendar.request' } | ForEach-Object {
 $relative = $_.FullName.Substring($sourcePath.Length).TrimStart('\','/')
 $targetFile = Join-Path $targetPath $relative
 New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
 if ((Test-Path -LiteralPath $targetFile) -and ($_.Extension -eq '.prefab' -or $_.Extension -eq '.meta')) { return }
 Copy-Item -LiteralPath $_.FullName -Destination $targetFile -Force
}
if ($Build) { Set-Content -LiteralPath (Join-Path $targetPath 'Editor/BuildCalendar.request') -Value 'build' -Encoding UTF8 }
Write-Output ('Copied calendar sources to ' + $targetPath)
Write-Output 'No existing destination files were deleted. Prefab generation occurs only with -Build or the Unity menu.'
