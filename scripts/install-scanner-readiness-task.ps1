Param(
  [string]$TaskName = "ArbBot-Scanner-Readiness",
  [int]$EveryMinutes = 30,
  [switch]$Remove,
  [switch]$Status,
  [switch]$DryRun,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$installer = Join-Path $PSScriptRoot "install-scheduled-healthcheck-task.ps1"

$params = @{
  TaskName = $TaskName
  RunnerScript = "scripts/run-scanner-readiness-healthcheck.ps1"
  EveryMinutes = $EveryMinutes
}

if ($Remove) { $params.Remove = $true }
if ($Status) { $params.Status = $true }
if ($DryRun) { $params.DryRun = $true }
if ($RunNow) { $params.RunNow = $true }

& $installer @params

exit $LASTEXITCODE
