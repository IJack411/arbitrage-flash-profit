Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location "$PSScriptRoot\.."

$statusJson = supabase status --output json
$status = $statusJson | ConvertFrom-Json
$anon = $status.ANON_KEY
if ([string]::IsNullOrWhiteSpace($anon)) {
  throw 'Missing local anon key from supabase status.'
}

$uri = 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities'
$headers = @{
  Authorization = "Bearer $anon"
  apikey = $anon
  'Content-Type' = 'application/json'
}

function Get-OptionalValue {
  param(
    [AllowNull()] $Object,
    [Parameter(Mandatory = $true)][string] $PropertyName,
    $Default = $null
  )

  if ($null -eq $Object) {
    return $Default
  }

  $prop = $Object.PSObject.Properties[$PropertyName]
  if ($null -eq $prop) {
    return $Default
  }

  return $prop.Value
}

$baseNetFloor = @{ ethereum = -2; arbitrum = 4; base = 3; polygon = 3 }

$cases = @(
  @{ name='eth-baseline-1000'; body=@{ networks=@('ethereum'); loanAmountUsd=1000; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=8; maxSlippageBps=100; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$false } },
  @{ name='eth-near-600'; body=@{ networks=@('ethereum'); loanAmountUsd=600; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=8; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$false } },
  @{ name='eth-near-1500'; body=@{ networks=@('ethereum'); loanAmountUsd=1500; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=8; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$false } },
  @{ name='eth-mixed-feeds-1000'; body=@{ networks=@('ethereum'); loanAmountUsd=1000; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=8; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$true } },
  @{ name='eth-tight-gas-900'; body=@{ networks=@('ethereum'); loanAmountUsd=900; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=6; maxSlippageBps=80; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=50; enableDexScreener=$true; enableGecko=$false } },
  @{ name='arb-near-1000'; body=@{ networks=@('arbitrum'); loanAmountUsd=1000; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=6; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$true } },
  @{ name='base-near-1000'; body=@{ networks=@('base'); loanAmountUsd=1000; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=6; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=40; enableDexScreener=$true; enableGecko=$true } },
  @{ name='multi-all-800'; body=@{ networks=@('ethereum','arbitrum','base','polygon'); loanAmountUsd=800; minNetProfitUsd=-2; perNetworkMinNetProfitUsd=$baseNetFloor; minSpreadPercent=0.02; estimatedGasUsd=7; maxSlippageBps=120; maxLiquidityUsagePercent=25; minLiquidityUsd=50000; maxResults=60; enableDexScreener=$true; enableGecko=$true } }
)

$results = @()
foreach ($case in $cases) {
  $json = $case.body | ConvertTo-Json -Depth 12
  try {
    $resp = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $json
    $diag = $resp.diagnostics
    $executionRisk = Get-OptionalValue -Object $diag -PropertyName 'executionRisk'
    $topWatchItem = if ($resp.watchlist -and $resp.watchlist.Count -gt 0) { $resp.watchlist[0] } else { $null }
    $topWatchRaw = Get-OptionalValue -Object $topWatchItem -PropertyName 'expectedProfit' -Default (Get-OptionalValue -Object $topWatchItem -PropertyName 'netProfitUsd' -Default $null)
    $topDistanceRaw = Get-OptionalValue -Object $topWatchItem -PropertyName 'distanceToMinProfit' -Default $null
    $topWatch = if ($null -ne $topWatchRaw) { [double]$topWatchRaw } else { $null }
    $topDistance = if ($null -ne $topDistanceRaw) { [double]$topDistanceRaw } else { $null }

    $results += [PSCustomObject]@{
      name = $case.name
      success = [bool]$resp.success
      found = [int]$resp.found
      watchlist = [int]$resp.watchlistCount
      topWatchNet = $topWatch
      topDistance = $topDistance
      pairKeys = [int](Get-OptionalValue -Object $diag -PropertyName 'pairKeyCount' -Default (Get-OptionalValue -Object $diag -PropertyName 'pairKeys' -Default 0))
      badQuotes = [int](Get-OptionalValue -Object $diag -PropertyName 'badQuotes' -Default (Get-OptionalValue -Object $diag -PropertyName 'droppedByBadQuotes' -Default 0))
      droppedBySlippage = [int](Get-OptionalValue -Object $executionRisk -PropertyName 'droppedBySlippage' -Default (Get-OptionalValue -Object $diag -PropertyName 'droppedBySlippage' -Default 0))
      droppedByNet = [int](Get-OptionalValue -Object $executionRisk -PropertyName 'droppedByNetProfit' -Default (Get-OptionalValue -Object $diag -PropertyName 'droppedByNetProfit' -Default 0))
      error = $null
    }
  } catch {
    $results += [PSCustomObject]@{
      name = $case.name
      success = $false
      found = 0
      watchlist = 0
      topWatchNet = $null
      topDistance = $null
      pairKeys = $null
      badQuotes = $null
      droppedBySlippage = $null
      droppedByNet = $null
      error = $_.Exception.Message
    }
  }
}

$ranked = $results | Sort-Object @{Expression='found';Descending=$true}, @{Expression='watchlist';Descending=$true}, @{Expression='topWatchNet';Descending=$true}
$best = $ranked | Select-Object -First 1

$results | Format-Table -AutoSize
Write-Host '--- BEST CANDIDATE ---'
$best | Format-List

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outPath = "benchmark-results/local-scan-matrix-$stamp.json"
$results | ConvertTo-Json -Depth 8 | Set-Content -Path $outPath -Encoding utf8
Write-Host "Saved: $outPath"
