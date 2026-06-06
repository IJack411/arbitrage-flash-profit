$WETH = '0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2'
$LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA'

function Print-Pair {
  param(
    [array]$Rows,
    [string]$Base,
    [string]$Quote,
    [int]$Top = 5
  )

  $filtered = $Rows |
    Where-Object {
      ($_.baseToken.symbol -eq $Base -and $_.quoteToken.symbol -eq $Quote) -or
      ($_.baseToken.symbol -eq $Quote -and $_.quoteToken.symbol -eq $Base)
    } |
    Sort-Object { [double]($_.liquidity.usd) } -Descending |
    Select-Object -First $Top

  Write-Output ""
  Write-Output "=== $Base/$Quote (Ethereum) ==="
  if (@($filtered).Count -eq 0) {
    Write-Output "No pools found"
    return
  }

  foreach ($r in $filtered) {
    $sym = "$($r.baseToken.symbol)/$($r.quoteToken.symbol)"
    $dex = "$($r.dexId)"
    $price = [double]$r.priceUsd
    $liq = [double]$r.liquidity.usd
    Write-Output ("{0,-14} | {1,-12} | priceUsd={2,12:N8} | liq=${3,13:N2} | {4}" -f $dex, $sym, $price, $liq, $r.pairAddress)
  }
}

$wethRows = Invoke-RestMethod -Uri "https://api.dexscreener.com/token-pairs/v1/ethereum/$WETH" -Method Get
$linkRows = Invoke-RestMethod -Uri "https://api.dexscreener.com/token-pairs/v1/ethereum/$LINK" -Method Get

Print-Pair -Rows $wethRows -Base 'WETH' -Quote 'USDC' -Top 6
Print-Pair -Rows $wethRows -Base 'WETH' -Quote 'USDT' -Top 6
Print-Pair -Rows $linkRows -Base 'LINK' -Quote 'USDC' -Top 6
