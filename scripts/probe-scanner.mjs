const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c';

const payload = {
  networks: ['ethereum', 'arbitrum', 'base', 'polygon'],
  loanAmountUsd: 10000,
  minNetProfitUsd: 100,
  perNetworkMinNetProfitUsd: {
    ethereum: 100,
    arbitrum: 100,
    base: 100,
    polygon: 100,
  },
  minLiquidityUsd: 20000,
  minSpreadPercent: 0.01,
  maxResults: 20,
  maxSlippageBps: 120,
  maxLiquidityUsagePercent: 15,
  estimatedGasUsd: 12,
};

const run = async () => {
  const res = await fetch('https://ujhsrxinfcycjtulpvqk.supabase.co/functions/v1/scan-arbitrage-opportunities', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.log('Non-JSON response:', text.slice(0, 500));
    process.exit(1);
  }

  if (!res.ok) {
    console.log('Request failed:', res.status, data);
    process.exit(1);
  }

  const d = data.diagnostics || {};
  console.log(
    `active=${(data.opportunities || []).length} watch=${(data.watchlist || []).length} pairKeys=${d.pairKeys ?? 0} cand=${d.candidates ?? 0} badQuotes=${d.droppedByBadQuotes ?? 0} spreadDrop=${d.droppedBySpread ?? 0} liqDrop=${d.droppedByLiquidity ?? 0} slipDrop=${d.droppedBySlippage ?? 0} netDrop=${d.droppedByNetProfit ?? 0} riskDrop=${d.droppedByExecutionRisk ?? 0}`
  );

  console.log('rejectionSamples=', JSON.stringify((d.rejectionSamples || []).slice(0, 5), null, 2));
  if ((data.watchlist || []).length > 0) {
    console.log('topWatch=', JSON.stringify(data.watchlist.slice(0, 3), null, 2));
  }
};

run().catch((error) => {
  console.error('Probe error:', error);
  process.exit(1);
});
