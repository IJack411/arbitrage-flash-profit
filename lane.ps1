$key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c'
$results = @()
$loans = 150,250,400,600,800,1000,1250,1500,2000,2500,3000,5000
$slip = 300,500,800,1200,1800,2500,3500
$liqUsage = 5,8,10,15,25,40,60,80,95
$minProfit = -2,-1,0,1,2,3,5
$gas = 0,1,2,3,4,6,8
$minLiq = 0,500,1000,5000,10000,20000
$spread = 0,0.0001,0.001,0.005,0.01

for ($i=0; $i -lt 40; $i++) {
    $p = @{
        loanAmountUsd = $loans | Get-Random
        maxSlippageBps = $slip | Get-Random
        maxLiquidityUsagePercent = $liqUsage | Get-Random
        minNetProfitUsd = $minProfit | Get-Random
        estimatedGasUsd = $gas | Get-Random
        minLiquidityUsd = $minLiq | Get-Random
        minSpreadPercent = $spread | Get-Random
        networks = @('ethereum','arbitrum','base','polygon')
    }
    $p.perNetworkMinNetProfitUsd = $p.minNetProfitUsd
    try {
        $resp = Invoke-RestMethod -Uri 'https://pceasvxyuizpdxwshicw.functions.supabase.co/full-scan' -Method Post -Headers @{'apikey'=$key; 'Authorization'='Bearer '+$key; 'Content-Type'='application/json'} -Body ($p | ConvertTo-Json) -TimeoutSec 180
        $d = $resp.diagnostics
        $results += [PSCustomObject]@{
            p = $p; found = $resp.found; watchlistCount = $resp.watchlistCount;
            candidates = $d.candidates; executionFeasible = $d.executionFeasible; profitQualified = $d.profitQualified;
            droppedBySlippage = $d.droppedBySlippage; droppedByNetProfit = $d.droppedByNetProfit;
            droppedByExecutionRisk = $d.droppedByExecutionRisk; topRejectionReason = $d.topRejectionReason;
            error = $null
        }
    } catch {
        $results += [PSCustomObject]@{ p = $p; error = $_.Exception.Message }
    }
}
$results | ConvertTo-Json
