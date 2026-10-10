$ErrorActionPreference = "Stop"

$taskName = "SkillPulse Hourly Scan"
$wrapper = Join-Path $PSScriptRoot "skillpulse-hidden.vbs"

if (-not (Test-Path -LiteralPath $wrapper)) {
    throw "Wrapper not found: $wrapper"
}

# Probe the wrapper once so we know it works before scheduling it.
Write-Output "=== probing the wrapper (one run) ==="
& cscript.exe //nologo $wrapper
Write-Output ("  exit code: {0}" -f $LASTEXITCODE)
if ($LASTEXITCODE -ne 0) { throw "Scan probe failed; task was not changed." }

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    $backup = Join-Path $env:USERPROFILE (".codex\skillpulse\task-backup-{0}.xml" -f (Get-Date -Format yyyyMMdd-HHmmss))
    [IO.File]::WriteAllText($backup, (Export-ScheduledTask -TaskName $taskName), [Text.UTF8Encoding]::new($false))
}

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument "//B //Nologo `"$wrapper`""
if ($existing) {
    Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
    Write-Output "Updated existing task action; backup: $backup"
    exit
}
# RepetitionDuration caps how long the hourly repetition keeps firing, so use a
# long horizon rather than MaxValue, which some Windows builds reject.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Hours 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Scans every supported agent harness for skill invocations and folds them into the SkillPulse usage ledger. Headless; does not need the dashboard running." | Out-Null

$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Output ""
Write-Output "=== registered ==="
Write-Output ("  name  : {0}" -f $task.TaskName)
Write-Output ("  state : {0}" -f $task.State)
Write-Output ("  every : {0}" -f $task.Triggers[0].Repetition.Interval)
Write-Output ("  next  : {0}" -f $info.NextRunTime)
