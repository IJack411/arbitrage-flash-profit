Param(
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$logDir = Join-Path $RepoRoot "logs\scheduler"
$null = New-Item -Path $logDir -ItemType Directory -Force
$logFile = Join-Path $logDir "indexer-healthcheck.log"

$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
"[$timestamp] starting scanner:indexer:healthcheck" | Out-File -FilePath $logFile -Append -Encoding utf8

Push-Location $RepoRoot
try {
  & npm run scanner:indexer:healthcheck *>> $logFile
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

$endTs = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
if ($exitCode -eq 0) {
  "[$endTs] completed OK" | Out-File -FilePath $logFile -Append -Encoding utf8
} else {
  "[$endTs] completed FAIL exit=$exitCode" | Out-File -FilePath $logFile -Append -Encoding utf8
}

exit $exitCode
