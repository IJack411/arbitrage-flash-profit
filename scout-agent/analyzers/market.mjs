// Gas trend tracker and new pool detector — read-only
import fetch from 'node-fetch';

// ---------- Gas Analysis ----------

export async function analyzeGas(provider) {
  const findings = [];

  const feeData = await provider.getFeeData();
  const baseFeeGwei = feeData.maxFeePerGas
    ? parseFloat((Number(feeData.maxFeePerGas) / 1e9).toFixed(2))
    : null;
  const priorityGwei = feeData.maxPriorityFeePerGas
    ? parseFloat((Number(feeData.maxPriorityFeePerGas) / 1e9).toFixed(2))
    : null;

  if (baseFeeGwei !== null) {
    // Estimate cost for a 600k gas arb tx
    const estimatedCostEth = (baseFeeGwei * 600_000) / 1e9;
    const ethPrice = await fetchEthPrice();
    const estimatedCostUsd = estimatedCostEth * ethPrice;

    // The scanner uses SCANNER_ESTIMATED_GAS_USD=18 by default
    const scannerDefault = 18;

    if (estimatedCostUsd < scannerDefault * 0.5) {
      findings.push({
        type: 'gas_opportunity',
        severity: 'recommendation',
        title: 'Gas is cheap right now',
        detail: `Current gas: ${baseFeeGwei} gwei → ~$${estimatedCostUsd.toFixed(2)} for arb tx. Scanner filters at $${scannerDefault}. You're leaving $${(scannerDefault - estimatedCostUsd).toFixed(2)} on the table per trade.`,
        action: `Lower SCANNER_ESTIMATED_GAS_USD to ${Math.ceil(estimatedCostUsd + 2)} during low-gas windows to capture more opportunities.`,
      });
    } else if (estimatedCostUsd > scannerDefault * 1.5) {
      findings.push({
        type: 'gas_warning',
        severity: 'warning',
        title: 'Gas is elevated',
        detail: `Current gas: ${baseFeeGwei} gwei → ~$${estimatedCostUsd.toFixed(2)} for arb tx. Scanner estimates $${scannerDefault}. Real cost exceeds estimate — trades may lose money to gas.`,
        action: `Raise SCANNER_ESTIMATED_GAS_USD to ${Math.ceil(estimatedCostUsd + 3)} or pause scanning until gas drops.`,
      });
    }

    findings.push({
      type: 'gas_report',
      severity: 'info',
      title: 'Gas Snapshot',
      detail: `Base: ${baseFeeGwei} gwei | Priority: ${priorityGwei} gwei | ETH: $${ethPrice.toFixed(0)} | Arb tx cost: ~$${estimatedCostUsd.toFixed(2)}`,
      action: null,
    });
  }

  return findings;
}

// ---------- New Pool Detection ----------

const UNISWAP_V3_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const SUSHI_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange';

async function querySubgraph(url, query) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function detectNewPools() {
  const findings = [];
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;

  // Check Uniswap V3 for new high-liquidity pools
  const uniData = await querySubgraph(UNISWAP_V3_SUBGRAPH, `{
    pools(first: 10, orderBy: createdAtTimestamp, orderDirection: desc,
          where: { totalValueLockedUSD_gt: "500000", createdAtTimestamp_gt: "${oneDayAgo}" }) {
      id
      token0 { symbol }
      token1 { symbol }
      feeTier
      totalValueLockedUSD
      createdAtTimestamp
    }
  }`);

  if (uniData?.pools?.length > 0) {
    for (const pool of uniData.pools) {
      const tvl = parseFloat(pool.totalValueLockedUSD);
      findings.push({
        type: 'new_pool',
        severity: 'recommendation',
        title: `New Uniswap V3 Pool: ${pool.token0.symbol}/${pool.token1.symbol}`,
        detail: `TVL: $${(tvl / 1e6).toFixed(2)}M | Fee: ${pool.feeTier / 10000}% | Created ${new Date(pool.createdAtTimestamp * 1000).toISOString()}`,
        action: `New pools often have price inefficiency. Your scanner may want to cover this pair. Pool: ${pool.id}`,
      });
    }
  }

  // Check for large liquidity changes on existing pools (potential arb moments)
  const spreadData = await querySubgraph(UNISWAP_V3_SUBGRAPH, `{
    pools(first: 20, orderBy: volumeUSD, orderDirection: desc) {
      token0 { symbol }
      token1 { symbol }
      token0Price
      token1Price
      totalValueLockedUSD
      volumeUSD
    }
  }`);

  const sushiData = await querySubgraph(SUSHI_SUBGRAPH, `{
    pools: pairs(first: 20, orderBy: volumeUSD, orderDirection: desc) {
      token0 { symbol }
      token1 { symbol }
      token1Price
      reserveUSD
    }
  }`);

  if (spreadData?.pools && sushiData?.pools) {
    const uniPrices = new Map();
    for (const p of spreadData.pools) {
      const key = `${p.token0.symbol}/${p.token1.symbol}`;
      const price = parseFloat(p.token1Price || '0');
      if (price > 0) uniPrices.set(key, { price, tvl: parseFloat(p.totalValueLockedUSD) });
    }

    for (const p of sushiData.pools) {
      const key = `${p.token0.symbol}/${p.token1.symbol}`;
      const sushiPrice = parseFloat(p.token1Price || '0');
      const uni = uniPrices.get(key);
      if (!uni || sushiPrice <= 0) continue;

      const spread = Math.abs(uni.price - sushiPrice) / Math.min(uni.price, sushiPrice) * 100;
      if (spread > 0.2) {
        findings.push({
          type: 'spread_alert',
          severity: 'recommendation',
          title: `Cross-DEX spread: ${key} at ${spread.toFixed(3)}%`,
          detail: `Uni V3: ${uni.price.toFixed(6)} | Sushi: ${sushiPrice.toFixed(6)} | Uni TVL: $${(uni.tvl / 1e6).toFixed(1)}M`,
          action: `Spread exceeds 0.2%. Worth investigating if gas-adjusted profit is positive.`,
        });
      }
    }
  }

  return findings;
}

// ---------- ETH Price Helper ----------

async function fetchEthPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await res.json();
    return data?.ethereum?.usd ?? 3000;
  } catch {
    return 3000; // fallback
  }
}
