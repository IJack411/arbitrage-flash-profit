Param(
  [string]$TaskName = "ArbBot-Indexer-Healthcheck",
  [int]$EveryMinutes = 5,
  [switch]$Remove,
  [switch]$Status,
  [switch]$DryRun,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$installer = Join-Path $PSScriptRoot "install-scheduled-healthcheck-task.ps1"

$params = @{
  TaskName = $TaskName
  RunnerScript = "scripts/run-indexer-healthcheck.ps1"
  EveryMinutes = $EveryMinutes
}

if ($Remove) { $params.Remove = $true }
if ($Status) { $params.Status = $true }
if ($DryRun) { $params.DryRun = $true }
if ($RunNow) { $params.RunNow = $true }

& $installer @params

exit $LASTEXITCODE
