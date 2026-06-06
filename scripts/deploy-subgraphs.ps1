param(
  [string]$GraphDeployKey = $env:GRAPH_DEPLOY_KEY,
  [string]$UniV2DeployKey = $env:GRAPH_UNI_V2_DEPLOY_KEY,
  [string]$BalancerDeployKey = $env:GRAPH_BALANCER_DEPLOY_KEY,
  [string]$CurveDeployKey = $env:GRAPH_CURVE_DEPLOY_KEY,
  [string]$UniV2Slug = $env:GRAPH_UNI_V2_SLUG,
  [string]$BalancerSlug = $env:GRAPH_BALANCER_SLUG,
  [string]$CurveSlug = $env:GRAPH_CURVE_SLUG,
  [int]$DeployRetries = 3,
  [string]$VersionLabel = "auto-$(Get-Date -Format yyyyMMdd-HHmmss)"
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($UniV2DeployKey)) { $UniV2DeployKey = $GraphDeployKey }
if ([string]::IsNullOrWhiteSpace($BalancerDeployKey)) { $BalancerDeployKey = $GraphDeployKey }
if ([string]::IsNullOrWhiteSpace($CurveDeployKey)) { $CurveDeployKey = $GraphDeployKey }

if ([string]::IsNullOrWhiteSpace($UniV2Slug)) { $UniV2Slug = 'subgraphs-uniswap-v2' }
if ([string]::IsNullOrWhiteSpace($BalancerSlug)) { $BalancerSlug = 'subgraphs-balancer-v2' }
if ([string]::IsNullOrWhiteSpace($CurveSlug)) { $CurveSlug = 'subgraphs-curve-lite' }

$repoRoot = Resolve-Path "$PSScriptRoot\\.."

$targets = @(
  @{ Name = 'uniswap-v2'; Path = 'subgraphs/uniswap-v2'; Slug = $UniV2Slug; DeployKey = $UniV2DeployKey },
  @{ Name = 'balancer-v2'; Path = 'subgraphs/balancer-v2'; Slug = $BalancerSlug; DeployKey = $BalancerDeployKey },
  @{ Name = 'curve-lite'; Path = 'subgraphs/curve-lite'; Slug = $CurveSlug; DeployKey = $CurveDeployKey }
)

$missingKeys = $targets | Where-Object { [string]::IsNullOrWhiteSpace($_.DeployKey) } | ForEach-Object { $_.Name }
if ($missingKeys.Count -gt 0) {
  throw "Missing deploy key for: $($missingKeys -join ', '). Set GRAPH_DEPLOY_KEY or per-subgraph GRAPH_*_DEPLOY_KEY env vars."
}

foreach ($target in $targets) {
  Write-Host "\n=== Deploying $($target.Name) -> studio slug '$($target.Slug)' ==="
  Set-Location (Join-Path $repoRoot $target.Path)
  npx graph codegen
  npx graph build

  $deployed = $false
  for ($attempt = 1; $attempt -le [Math]::Max(1, $DeployRetries); $attempt++) {
    try {
      Write-Host "Deploy attempt $attempt/$DeployRetries"
      npx graph deploy --studio $target.Slug --deploy-key $target.DeployKey --version-label $VersionLabel
      $deployed = $true
      break
    }
    catch {
      if ($attempt -ge [Math]::Max(1, $DeployRetries)) {
        throw
      }
      Write-Warning "Deploy attempt failed for $($target.Name). Retrying in 3 seconds..."
      Start-Sleep -Seconds 3
    }
  }

  if (-not $deployed) {
    throw "Failed to deploy $($target.Name) after $DeployRetries attempts."
  }
}

Write-Host "\nDeploy commands completed."
Write-Host "Next: open each subgraph in Graph Studio and click Publish for the new version label: $VersionLabel"
