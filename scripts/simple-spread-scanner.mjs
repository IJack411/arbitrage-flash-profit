// Simple price-spread scanner (Arbitrum, read-only).
//
// For a handful of token pairs it asks several DEXes "what price do you give?"
// and shows where the token is CHEAPEST (buy) and MOST EXPENSIVE (sell), plus
// the raw gross spread between them. Nothing fancy: low here, high there.
//
// Run once (default):   node scripts/simple-spread-scanner.mjs
// Loop every N seconds: SIMPLE_SCAN_INTERVAL_SEC=30 node scripts/simple-spread-scanner.mjs
//
// This prints the RAW gross spread. It does NOT subtract DEX swap fees, price
// impact, or gas, so a positive number here is necessary-but-not-sufficient for
// an actual profit. Treat it as "worth a closer look", not "free money".

import { JsonRpcProvider, Contract, formatUnits, parseUnits } from 'ethers';

// ---------------------------------------------------------------------------
// EDIT ME: token pairs to watch. base = the token you price, quote = priced in.
// ---------------------------------------------------------------------------
const PAIRS = [
  { base: 'WETH', quote: 'USDC' },
  { base: 'WETH', quote: 'USDCe' },
  { base: 'GMX', quote: 'WETH' },
  { base: 'MAGIC', quote: 'WETH' },
  { base: 'PENDLE', quote: 'WETH' },
];

// ---------------------------------------------------------------------------
// Arbitrum token addresses + decimals (canonical mainnet addresses).
// ---------------------------------------------------------------------------
const TOKENS = {
  WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 }, // native USDC
  USDCe: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 }, // bridged USDC.e
  USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  GMX: { address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
  MAGIC: { address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342', decimals: 18 },
  RDNT: { address: '0x3082CC23568eA640225c2467653dB90e9250AaA0', decimals: 18 },
  PENDLE: { address: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', decimals: 18 },
  STG: { address: '0x6694340fc020c5E6B96567843da2df01b2CE1eb6', decimals: 18 },
};

// ---------------------------------------------------------------------------
// DEX contracts on Arbitrum.
// ---------------------------------------------------------------------------
const UNIV3_QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'; // UniswapV3 QuoterV2
const UNIV3_FEE_TIERS = [500, 3000]; // 0.05% and 0.3% — the common ones
const SUSHI_V2_ROUTER = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'; // SushiSwap V2 router

// We quote a SMALL probe amount and scale up to a per-1-unit rate. A tiny probe
// barely moves the pool, so the number we get is close to the true spot price
// instead of a price wrecked by slippage on a thin pool. This is what stops
// near-empty pools from reporting fake 1000%+ "spreads".
const PROBE_UNITS = '0.01';

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];
const V2_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
];

// ---------------------------------------------------------------------------
// RPC selection: EXP_RPC_URL > VITE_ALCHEMY_API_KEY > public fallback.
// ---------------------------------------------------------------------------
function resolveRpcUrl() {
  if (process.env.EXP_RPC_URL) return process.env.EXP_RPC_URL;
  if (process.env.VITE_ALCHEMY_API_KEY) {
    return `https://arb-mainnet.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_API_KEY}`;
  }
  return 'https://arbitrum-one-rpc.publicnode.com';
}

// ---------------------------------------------------------------------------
// Quote helpers. Each returns out-per-1-unit-in (a plain Number) or null.
// ---------------------------------------------------------------------------
async function quoteUniV3(quoter, tokenIn, tokenOut, fee) {
  const amountIn = parseUnits(PROBE_UNITS, tokenIn.decimals);
  const params = {
    tokenIn: tokenIn.address,
    tokenOut: tokenOut.address,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0n,
  };
  // QuoterV2 is non-view; use staticCall so no transaction is sent.
  const [amountOut] = await quoter.quoteExactInputSingle.staticCall(params);
  const out = Number(formatUnits(amountOut, tokenOut.decimals));
  return out / Number(PROBE_UNITS); // normalize to out-per-1-unit-in
}

async function quoteSushiV2(router, tokenIn, tokenOut) {
  const amountIn = parseUnits(PROBE_UNITS, tokenIn.decimals);
  const amounts = await router.getAmountsOut(amountIn, [tokenIn.address, tokenOut.address]);
  const out = Number(formatUnits(amounts[amounts.length - 1], tokenOut.decimals));
  return out / Number(PROBE_UNITS); // normalize to out-per-1-unit-in
}

async function getVenueQuotes(pair, quoter, router) {
  const tokenIn = TOKENS[pair.base];
  const tokenOut = TOKENS[pair.quote];
  const quotes = [];

  for (const fee of UNIV3_FEE_TIERS) {
    try {
      const price = await quoteUniV3(quoter, tokenIn, tokenOut, fee);
      if (price > 0) quotes.push({ venue: `UniV3 ${fee / 10000}%`, price });
    } catch {
      // no pool / not enough liquidity for this fee tier — skip quietly
    }
  }

  try {
    const price = await quoteSushiV2(router, tokenIn, tokenOut);
    if (price > 0) quotes.push({ venue: 'SushiV2', price });
  } catch {
    // no Sushi pair — skip
  }

  return quotes;
}

// ---------------------------------------------------------------------------
// Formatting helpers.
// ---------------------------------------------------------------------------
function fmtPrice(n) {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

function pad(str, width) {
  str = String(str);
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

// ---------------------------------------------------------------------------
// One full scan pass.
// ---------------------------------------------------------------------------
async function scanOnce(provider) {
  const quoter = new Contract(UNIV3_QUOTER, QUOTER_V2_ABI, provider);
  const router = new Contract(SUSHI_V2_ROUTER, V2_ROUTER_ABI, provider);

  const rows = [];
  for (const pair of PAIRS) {
    const label = `${pair.base}/${pair.quote}`;
    const quotes = await getVenueQuotes(pair, quoter, router);

    if (quotes.length < 2) {
      rows.push({ label, note: quotes.length === 1 ? 'only 1 venue quoted' : 'no quotes' });
      continue;
    }

    let low = quotes[0];
    let high = quotes[0];
    for (const q of quotes) {
      if (q.price < low.price) low = q;
      if (q.price > high.price) high = q;
    }
    const spreadPct = ((high.price - low.price) / low.price) * 100;
    rows.push({ label, low, high, spreadPct });
  }

  // Sort scannable rows by spread desc; keep unquotable ones at the bottom.
  rows.sort((a, b) => (b.spreadPct ?? -1) - (a.spreadPct ?? -1));

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n=== Simple Spread Scanner — Arbitrum — ${stamp} UTC ===`);
  console.log('RAW gross spread only. Does NOT subtract DEX/swap fees or gas.\n');
  console.log(
    `${pad('PAIR', 14)}${pad('BUY @ (cheapest)', 26)}${pad('SELL @ (dearest)', 26)}SPREAD%`,
  );
  console.log('-'.repeat(72));

  let best = null;
  for (const r of rows) {
    if (r.note) {
      console.log(`${pad(r.label, 14)}${r.note}`);
      continue;
    }
    const buy = `${r.low.venue} (${fmtPrice(r.low.price)})`;
    const sell = `${r.high.venue} (${fmtPrice(r.high.price)})`;
    console.log(`${pad(r.label, 14)}${pad(buy, 26)}${pad(sell, 26)}${r.spreadPct.toFixed(3)}%`);
    if (!best || r.spreadPct > best.spreadPct) best = r;
  }

  console.log('-'.repeat(72));
  if (best) {
    console.log(`BIGGEST SPREAD RIGHT NOW: ${best.label} ${best.spreadPct.toFixed(3)}%`);
  } else {
    console.log('BIGGEST SPREAD RIGHT NOW: none (no pair had 2+ venues)');
  }
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------
async function main() {
  const rpcUrl = resolveRpcUrl();
  const provider = new JsonRpcProvider(rpcUrl);
  console.log(`RPC: ${rpcUrl}`);

  const intervalSec = Number(process.env.SIMPLE_SCAN_INTERVAL_SEC || 0);
  const loop = intervalSec > 0 && !process.argv.includes('--once');

  do {
    try {
      await scanOnce(provider);
    } catch (err) {
      console.error(`Scan failed: ${err?.shortMessage || err?.message || err}`);
    }
    if (loop) {
      console.log(`\nSleeping ${intervalSec}s... (Ctrl+C to stop)`);
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
    }
  } while (loop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
