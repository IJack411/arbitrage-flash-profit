$envFile = ".env"
$anonKey = ""
if (Test-Path $envFile) {
    $content = Get-Content $envFile
    foreach ($line in $content) {
        if ($line -match "^VITE_SUPABASE_ANON_KEY=(.*)") {
            $anonKey = $matches[1].Trim().Trim('"').Trim("'")
            break
        }
    }
}
if (-not $anonKey) { throw "Anon key not found" }
$targetUrl = "https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities"
$lanes = @{
    "A-loan" = @((500,450,8,2,3),(750,450,8,2,3),(1000,450,10,3,4),(1250,450,10,3,4),(1500,500,10,4,4),(1750,500,12,4,5),(2000,500,12,5,5),(2250,500,12,6,5),(2500,550,12,6,6),(3000,600,15,8,6))
    "B-slip" = @((2000,250,8,2,3),(2000,300,8,2,3),(2000,350,8,3,4),(2000,400,8,3,4),(2000,450,8,4,4),(2000,500,8,4,5),(2000,550,8,5,5),(2000,600,8,6,6),(2000,650,8,8,6),(2000,700,8,10,8))
    "C-liq" = @((2000,450,4,2,3),(2000,450,6,2,3),(2000,450,8,3,4),(2000,450,10,3,4),(2000,450,12,4,5),(2000,450,15,4,5),(2000,450,18,5,5),(2000,450,22,6,6),(2000,450,28,8,6),(2000,450,35,10,8))
    "D-profitGas" = @((1000,500,10,-1,1),(1250,500,10,-1,2),(1500,500,10,0,2),(1750,500,10,0,3),(2000,500,10,1,3),(2250,500,10,2,4),(2500,500,10,3,4),(2750,500,10,4,5),(3000,500,10,5,6),(3500,550,12,8,8))
    "E-highloan" = @((4000,300,8,5,6),(5000,350,10,8,7),(6000,400,12,10,8),(7000,450,15,12,8),(8000,500,18,15,9),(9000,550,20,18,10),(10000,600,22,20,11),(12000,650,25,24,12),(14000,700,28,28,13),(16000,750,30,32,14))
    "F-gradient" = @((500,250,5,-1,1),(750,300,6,-1,1),(1000,350,7,0,2),(1250,400,8,0,2),(1500,450,9,1,3),(1750,500,10,2,3),(2000,550,11,3,4),(2250,600,12,4,4),(2500,650,13,5,5),(3000,700,15,6,6))
}
$scriptBlock = {
    param($laneName, $configs, $url, $key)
    $results = @()
    foreach ($cfg in $configs) {
        $loanAmountUsd, $maxSlippageBps, $maxLiquidityUsagePercent, $minNetProfitUsd, $estimatedGasUsd = $cfg
        $payload = @{
            networks = @("ethereum", "arbitrum", "base", "polygon")
            perNetworkMinNetProfitUsd = @{ ethereum = $minNetProfitUsd; arbitrum = $minNetProfitUsd; base = $minNetProfitUsd; polygon = $minNetProfitUsd }
            minNetProfitUsd = $minNetProfitUsd; loanAmountUsd = $loanAmountUsd; maxSlippageBps = $maxSlippageBps; maxLiquidityUsagePercent = $maxLiquidityUsagePercent; estimatedGasUsd = $estimatedGasUsd; minLiquidityUsd = 20000; minSpreadPercent = 0.01
        }
        try {
            $json = $payload | ConvertTo-Json
            $resp = Invoke-RestMethod -Uri $url -Method Post -Body $json -Headers @{ "Authorization" = "Bearer $key"; "Content-Type" = "application/json" }
            $results += [PSCustomObject]@{ lane = $laneName; config = $cfg; data = $resp; error = $null }
        } catch { $results += [PSCustomObject]@{ lane = $laneName; config = $cfg; data = $null; error = $_.Exception.Message } }
    }
    return $results
}
$jobs = foreach ($ln in $lanes.Keys) { Start-Job -ScriptBlock $scriptBlock -ArgumentList $ln, $lanes[$ln], $targetUrl, $anonKey }
$allResults = $jobs | Wait-Job | Receive-Job
if (-not (Test-Path "benchmark-results")) { New-Item -ItemType Directory "benchmark-results" }
$filename = "benchmark-results/scanner-sweep-$((Get-Date).ToString('yyyyMMdd-HHmmss')).json"
$allResults | ConvertTo-Json -Depth 10 | Out-File $filename
$laneStats = $allResults | Group-Object lane | ForEach-Object {
    $items = $_.Group | Where-Object { $null -ne $_.data }; $cand = $items | ForEach-Object { $_.data.summary.totalCandidates } | Measure-Object -Average
    [PSCustomObject]@{ Lane=$_.Name; Runs=$_.Count; MaxFeas=($items | ForEach-Object { $_.data.summary.feasibleCount } | Measure-Object -Maximum).Maximum; MaxPass=($items | ForEach-Object { $_.data.summary.passingCount } | Measure-Object -Maximum).Maximum; MaxFound=($items | ForEach-Object { $_.data.summary.foundCount } | Measure-Object -Maximum).Maximum; MaxWatch=($items | ForEach-Object { $_.data.summary.watchlistCount } | Measure-Object -Maximum).Maximum; AvgCand=if($cand.Average){[Math]::Round($cand.Average, 2)}else{0} }
}
$top12 = $allResults | Where-Object { $null -ne $_.data } | Select-Object lane, config, @{n='Pass';e={$_.data.summary.passingCount}}, @{n='Feas';e={$_.data.summary.feasibleCount}}, @{n='Found';e={$_.data.summary.foundCount}}, @{n='Watch';e={$_.data.summary.watchlistCount}} | Sort-Object Pass, Feas, Found, Watch -Descending | Select-Object -First 12
Write-Host "`nLANE SUMMARY:"; $laneStats | Format-Table -AutoSize
Write-Host "`nTOP 12 CONFIGS:"; $top12 | Format-Table -AutoSize
Write-Host "`nERRORS: $($allResults | Where-Object { $null -ne $_.error } | Measure-Object).Count"
$allResults | Where-Object { $null -ne $_.error } | Select-Object -First 5 | ForEach-Object { Write-Host " - $($_.lane) $($_.config): $($_.error)" }
Write-Host "`nResults saved to: $filename"
