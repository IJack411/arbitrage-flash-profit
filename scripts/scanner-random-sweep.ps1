$ErrorActionPreference = 'Stop'

$envLine = Get-Content .env | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1
if (-not $envLine) {
  throw 'VITE_SUPABASE_ANON_KEY not found in .env'
}
$anon = ($envLine -split '=', 2)[1].Trim()

$url = 'https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities'
$headers = @{
  'Content-Type' = 'application/json'
  'Authorization' = "Bearer $anon"
  'apikey' = $anon
}

$scriptBlock = {
  param($laneName, $iterations, $url, $headers)

  $loanSet = @(150, 250, 400, 600, 800, 1000, 1250, 1500, 2000, 2500, 3000, 5000)
  $slipSet = @(300, 500, 800, 1200, 1800, 2500, 3500)
  $liqSet = @(5, 8, 10, 15, 25, 40, 60, 80, 95)
  $profitSet = @(-2, -1, 0, 1, 2, 3, 5)
  $gasSet = @(0, 1, 2, 3, 4, 6, 8)

  $rnd = [System.Random]::new()
  $rows = @()

  for ($i = 1; $i -le $iterations; $i++) {
    $loan = $loanSet[$rnd.Next(0, $loanSet.Count)]
    $slip = $slipSet[$rnd.Next(0, $slipSet.Count)]
    $liq = $liqSet[$rnd.Next(0, $liqSet.Count)]
    $minProfit = $profitSet[$rnd.Next(0, $profitSet.Count)]
    $gas = $gasSet[$rnd.Next(0, $gasSet.Count)]

    $payload = @{
      networks = @('ethereum', 'arbitrum', 'base', 'polygon')
      loanAmountUsd = $loan
      minNetProfitUsd = $minProfit
      perNetworkMinNetProfitUsd = @{
        ethereum = $minProfit
        arbitrum = $minProfit
        base = $minProfit
        polygon = $minProfit
      }
      minLiquidityUsd = 20000
      minSpreadPercent = 0.01
      maxSlippageBps = $slip
      maxLiquidityUsagePercent = $liq
      estimatedGasUsd = $gas
    }

    $body = $payload | ConvertTo-Json -Depth 10

    try {
      $res = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body
      $diag = $res.diagnostics

      $rows += [pscustomobject]@{
        lane = $laneName
        i = $i
        loan = $loan
        slip = $slip
        liq = $liq
        minProfit = $minProfit
        gas = $gas
        found = [int]$res.found
        watch = [int]$res.watchlistCount
        cand = [int]$diag.candidates
        feas = [int]$diag.executionFeasible
        pass = [int]$diag.profitQualified
        slipDrop = [int]$diag.droppedBySlippage
        netDrop = [int]$diag.droppedByNetProfit
        riskDrop = [int]$diag.droppedByExecutionRisk
        topReason = [string]$diag.topRejectionReason
        err = ''
      }
    }
    catch {
      $rows += [pscustomobject]@{
        lane = $laneName
        i = $i
        loan = $loan
        slip = $slip
        liq = $liq
        minProfit = $minProfit
        gas = $gas
        found = 0
        watch = 0
        cand = 0
        feas = 0
        pass = 0
        slipDrop = 0
        netDrop = 0
        riskDrop = 0
        topReason = 'error'
        err = $_.Exception.Message
      }
    }
  }

  return $rows
}

$jobs = @()
1..8 | ForEach-Object {
  $jobs += Start-Job -ScriptBlock $scriptBlock -ArgumentList ("R$_"), 30, $url, $headers
}

$allRows = Receive-Job -Job $jobs -Wait -AutoRemoveJob

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = "benchmark-results/scanner-random-sweep-valid-$stamp.json"
$allRows | ConvertTo-Json -Depth 6 | Set-Content -Path $outFile

$okRows = $allRows | Where-Object { $_.err -eq '' }
$errRows = $allRows | Where-Object { $_.err -ne '' }
$hits = $okRows | Where-Object { $_.feas -gt 0 -or $_.pass -gt 0 -or $_.found -gt 0 -or $_.watch -gt 0 }

Write-Host "Saved $outFile"
Write-Host "total=$($allRows.Count) ok=$($okRows.Count) err=$($errRows.Count) hits=$($hits.Count)"

$summary = [pscustomobject]@{
  maxCand = ($okRows | Measure-Object cand -Maximum).Maximum
  maxFeas = ($okRows | Measure-Object feas -Maximum).Maximum
  maxPass = ($okRows | Measure-Object pass -Maximum).Maximum
  maxFound = ($okRows | Measure-Object found -Maximum).Maximum
  maxWatch = ($okRows | Measure-Object watch -Maximum).Maximum
  avgNetDrop = [math]::Round((($okRows | Measure-Object netDrop -Average).Average), 2)
  avgSlipDrop = [math]::Round((($okRows | Measure-Object slipDrop -Average).Average), 2)
}

Write-Host '=== Aggregate ==='
$summary | Format-List | Out-String | Write-Host

Write-Host '=== Top 20 by pass/feas/found/watch ==='
$okRows |
  Sort-Object @{Expression='pass'; Descending=$true}, @{Expression='feas'; Descending=$true}, @{Expression='found'; Descending=$true}, @{Expression='watch'; Descending=$true} |
  Select-Object -First 20 lane, i, loan, slip, liq, minProfit, gas, found, watch, cand, feas, pass, slipDrop, netDrop, riskDrop, topReason |
  Format-Table -AutoSize | Out-String | Write-Host

if ($errRows.Count -gt 0) {
  Write-Host '=== First 5 errors ==='
  $errRows | Select-Object -First 5 lane, i, loan, slip, liq, minProfit, gas, err | Format-Table -AutoSize | Out-String | Write-Host
}

if ($hits.Count -gt 0) {
  Write-Host '=== Hits (feas/pass/found/watch > 0) ==='
  $hits |
    Sort-Object @{Expression='pass'; Descending=$true}, @{Expression='feas'; Descending=$true}, @{Expression='found'; Descending=$true}, @{Expression='watch'; Descending=$true} |
    Select-Object -First 20 lane, i, loan, slip, liq, minProfit, gas, found, watch, cand, feas, pass, slipDrop, netDrop, riskDrop, topReason |
    Format-Table -AutoSize | Out-String | Write-Host
}
