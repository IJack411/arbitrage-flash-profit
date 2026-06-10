# start-dev.ps1 — Run this to start (or restart) the local dev server
# Double-click or run: powershell -ExecutionPolicy Bypass -File start-dev.ps1

Set-Location $PSScriptRoot

Write-Host "Starting dev server at http://localhost:8080/ ..." -ForegroundColor Cyan

# Kill any existing vite process on port 8080
$existing = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($existing) {
    Write-Host "Stopping existing process on port 8080 (PID $existing)..." -ForegroundColor Yellow
    Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
    Start-Sleep 2
}

npm run dev
