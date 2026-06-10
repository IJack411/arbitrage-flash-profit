param(
	[Parameter(Mandatory = $true)]
	[string]$RemoteUrl,
	[string]$Branch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location "$PSScriptRoot\.."

$inside = git rev-parse --is-inside-work-tree 2>$null
if ($inside -ne 'true') {
	throw 'Current directory is not a Git repository.'
}

$existingOrigin = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($existingOrigin)) {
	git remote set-url origin $RemoteUrl
	Write-Host "Updated origin -> $RemoteUrl"
} else {
	git remote add origin $RemoteUrl
	Write-Host "Added origin -> $RemoteUrl"
}

git branch -M $Branch
Write-Host "Using branch: $Branch"

git push -u origin $Branch
Write-Host 'Remote setup complete.'
