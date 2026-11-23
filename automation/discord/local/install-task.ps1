$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.credentials.json'))) { throw 'Run setup.ps1 first.' }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$start = Join-Path $PSScriptRoot 'start.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershell -Argument ('-NoProfile -WindowStyle Hidden -File "{0}" -NodePath "{1}"' -f $start, $nodeExecutable) -WorkingDirectory $PSScriptRoot
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'VRC Band DB Local Notifier' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Deliver pending VRC Band DB Discord notifications from this PC.' -Force | Out-Null
Write-Host 'Task registered: VRC Band DB Local Notifier (starts at your Windows logon).'
Write-Host 'Stop any manually running notifier before starting the task.'
Write-Host 'Start-ScheduledTask -TaskName "VRC Band DB Local Notifier"'
