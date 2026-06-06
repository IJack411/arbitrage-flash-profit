Param(
  [Parameter(Mandatory = $true)]
  [string]$TaskName,

  [Parameter(Mandatory = $true)]
  [string]$RunnerScript,

  [int]$EveryMinutes = 5,
  [switch]$Remove,
  [switch]$Status,
  [switch]$DryRun,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runnerPath = if ([System.IO.Path]::IsPathRooted($RunnerScript)) {
  $RunnerScript
} else {
  Join-Path $repoRoot $RunnerScript
}

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

if ($EveryMinutes -lt 1) {
  throw "EveryMinutes must be >= 1"
}

$taskQueryCmd = "schtasks /Query /TN `"$TaskName`" /FO LIST /V"

if ($Status) {
  if ($DryRun) {
    Write-Host "DRY RUN: $taskQueryCmd"
    exit 0
  }

  & schtasks /Query /TN "$TaskName" /FO LIST /V
  exit $LASTEXITCODE
}

if ($Remove) {
  $removeCmd = "schtasks /Delete /TN `"$TaskName`" /F"
  if ($DryRun) {
    Write-Host "DRY RUN: $removeCmd"
    exit 0
  }

  & schtasks /Delete /TN "$TaskName" /F
  exit $LASTEXITCODE
}

$taskAction = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`" -RepoRoot `"$repoRoot`""
$createCmd = "schtasks /Create /SC MINUTE /MO $EveryMinutes /TN `"$TaskName`" /TR `"$taskAction`" /F"

if ($DryRun) {
  Write-Host "DRY RUN: $createCmd"
  if ($RunNow) {
    Write-Host "DRY RUN: schtasks /Run /TN `"$TaskName`""
  }
  Write-Host "DRY RUN: $taskQueryCmd"
  exit 0
}

& schtasks /Create /SC MINUTE /MO $EveryMinutes /TN "$TaskName" /TR "$taskAction" /F
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create scheduled task ${TaskName}"
}

if ($RunNow) {
  & schtasks /Run /TN "$TaskName"
  if ($LASTEXITCODE -ne 0) {
    throw "Task created, but failed to run immediately: ${TaskName}"
  }
}

& schtasks /Query /TN "$TaskName" /FO LIST /V
exit $LASTEXITCODE
