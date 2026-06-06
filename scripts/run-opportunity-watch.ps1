Param(
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$logDir = Join-Path $RepoRoot "logs\scheduler"
$null = New-Item -Path $logDir -ItemType Directory -Force
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runLogFile = Join-Path $logDir ("opportunity-watch-" + $runStamp + ".log")

Write-Host "[opportunity-watch] starting scanner:opportunity:watch (one-shot)"
Write-Host "[opportunity-watch] run_log=$runLogFile"

Push-Location $RepoRoot
try {
  $env:OPPORTUNITY_WATCH_ONCE = 'true'
  # Keep PRECHECK enabled by default for scheduler-driven early operator awareness.
  $env:OPPORTUNITY_WATCH_NOTIFY_ON_PRECHECK = 'true'
  $env:OPPORTUNITY_WATCH_STOP_ON_PRECHECK = 'false'
  $env:OPPORTUNITY_WATCH_STRICT_PRECHECK_EXIT = 'false'
  # Slightly wider PRECHECK band for early visibility; strict ALERT remains unchanged.
  $env:ALERT_PRECHECK_TOP_DISTANCE_MAX = '22'
  & npm run scanner:opportunity:watch *>> $runLogFile
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:OPPORTUNITY_WATCH_ONCE -ErrorAction SilentlyContinue
  Remove-Item Env:OPPORTUNITY_WATCH_NOTIFY_ON_PRECHECK -ErrorAction SilentlyContinue
  Remove-Item Env:OPPORTUNITY_WATCH_STOP_ON_PRECHECK -ErrorAction SilentlyContinue
  Remove-Item Env:OPPORTUNITY_WATCH_STRICT_PRECHECK_EXIT -ErrorAction SilentlyContinue
  Remove-Item Env:ALERT_PRECHECK_TOP_DISTANCE_MAX -ErrorAction SilentlyContinue
  Pop-Location
}

$endTs = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
if ($exitCode -eq 0) {
  Write-Host "[opportunity-watch] completed OK at $endTs run_log=$runLogFile"
} else {
  Write-Host "[opportunity-watch] completed FAIL exit=$exitCode at $endTs run_log=$runLogFile"
}

exit $exitCode
