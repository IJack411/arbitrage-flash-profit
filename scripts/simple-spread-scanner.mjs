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
//
// THIN-POOL GUARD: every venue is probed at TWO trade sizes (~$50 and ~$1000
// worth). If the per-unit price moves more than THIN_IMPACT_PCT between the two,
// that pool is too shallow to trade at size, so it's marked THIN and dropped
// from the buy/sell comparison. This kills empty-pool mirages so the reported
// spread reflects liquidity you could actually use.
//
// Known limit: the guard catches SLIPPAGE mirages, not a pool that is uniformly
// thin/stale at both sizes (similar wrong price at $50 and $1000 = low impact =
// looks OK). So an unusually large spread on an otherwise-efficient asset (e.g.
// an LST) is more likely a stale small pool than a real edge — sanity-check it.

import { JsonRpcProvider, Network, Contract, formatUnits, parseUnits } from 'ethers';

// ---------------------------------------------------------------------------
// EDIT ME: token pairs to watch. base = the token you price, quote = priced in.
// Priority pairs (real cross-venue fragmentation) first, majors as a baseline.
// ---------------------------------------------------------------------------
const PAIRS = [
  { base: 'GRAIL', quote: 'WETH' },
  { base: 'MAGIC', quote: 'WETH' },
  { base: 'wstETH', quote: 'WETH' },
  { base: 'ARB', quote: 'USDC' },
  { base: 'GMX', quote: 'WETH' },
  { base: 'RDNT', quote: 'WETH' },
  { base: 'PENDLE', quote: 'WETH' },
  { base: 'WETH', quote: 'USDC' }, // baseline major (should be ~0%)
  { base: 'WETH', quote: 'USDCe' }, // baseline major (should be ~0%)
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
  GRAIL: { address: '0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8', decimals: 18 },
  wstETH: { address: '0x5979D7b546E38E414F7E9822514be443A4800529', decimals: 18 },
  ARB: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  RAM: { address: '0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418', decimals: 18 },
};

const STABLES = new Set(['USDC', 'USDCe', 'USDT']);

// ---------------------------------------------------------------------------
// DEX quoter/router addresses on Arbitrum.
// ---------------------------------------------------------------------------
const ADDR = {
  uniV3Quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // UniswapV3 QuoterV2
  sushiV3Quoter: '0x0524E833cCD057e4d7A296e3aaAb9f7675964Ce1', // SushiSwap V3 (UniV3-fork) quoter
  camelotV3Quoter: '0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E', // Camelot V3 (Algebra) quoter
  camelotV4Quoter: '0xFe24b2cDfF01B644995bc248bA8497467d688F7B', // Camelot V4 (Algebra) quoter
  ramsesQuoter: '0xaa20eff7ad2f523590de6c04918daae0904b28d4', // Ramses CL (Algebra) quoter — UNVERIFIED (lowercased: source had a bad EIP-55 checksum)
  sushiV2Router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap V2 router
  camelotV2Router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Camelot V2 router
};

const V3_FEE_TIERS = [500, 3000]; // 0.05% and 0.3%

// Tuning knobs.
const THIN_IMPACT_PCT = 1.5; // >this move between the two probes = thin pool
const PROBE_SMALL_USD = 50; // small trade probe (~spot)
const PROBE_LARGE_USD = 1000; // modest trade probe (executable size)
const MIN_INTERESTING_SPREAD = 0.25; // realistic post-fee threshold to highlight
const THROTTLE_MS = 120; // min gap between RPC calls (be nice to public nodes)

// ---------------------------------------------------------------------------
// ABIs (only the one method we need from each).
// ---------------------------------------------------------------------------
const UNI_QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];
const SUSHI_V3_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)',
];
const ALGEBRA_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn,address tokenOut,uint256 amountIn,uint160 limitSqrtPrice) returns (uint256 amountOut,uint16 fee)',
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
// Small helpers.
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  const m = String(err?.shortMessage || err?.message || err).toLowerCase();
  return (
    m.includes('rate') ||
    m.includes('429') ||
    m.includes('timeout') ||
    m.includes('limit') ||
    m.includes('coalesce') ||
    m.includes('could not') ||
    m.includes('server') ||
    m.includes('503') ||
    m.includes('missing response') ||
    m.includes('failed to detect network')
  );
}

// Simple global throttle so a burst of quotes doesn't trip public-node limits.
let lastCallAt = 0;
async function throttle() {
  const gap = Date.now() - lastCallAt;
  if (gap < THROTTLE_MS) await sleep(THROTTLE_MS - gap);
  lastCallAt = Date.now();
}

// Run a quote; on a transient RPC error retry with backoff. Returns bigint or null.
async function tryQuote(fn) {
  const backoff = [400, 900];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    await throttle();
    try {
      return await fn();
    } catch (err) {
      if (attempt < backoff.length && isTransient(err)) {
        await sleep(backoff[attempt]);
        continue;
      }
      return null; // no pool / revert / gave up — skip this venue quietly
    }
  }
  return null;
}

function toUnitString(human, decimals) {
  const digits = Math.min(decimals, 18);
  return Number(human).toFixed(digits);
}

// ---------------------------------------------------------------------------
// Build the list of venues. Each returns amountOut (bigint) or throws.
// ---------------------------------------------------------------------------
function makeVenues(provider) {
  const uni = new Contract(ADDR.uniV3Quoter, UNI_QUOTER_V2_ABI, provider);
  const sushiV3 = new Contract(ADDR.sushiV3Quoter, SUSHI_V3_QUOTER_ABI, provider);
  const camV3 = new Contract(ADDR.camelotV3Quoter, ALGEBRA_QUOTER_ABI, provider);
  const camV4 = new Contract(ADDR.camelotV4Quoter, ALGEBRA_QUOTER_ABI, provider);
  const ramses = new Contract(ADDR.ramsesQuoter, ALGEBRA_QUOTER_ABI, provider);
  const sushiV2 = new Contract(ADDR.sushiV2Router, V2_ROUTER_ABI, provider);
  const camV2 = new Contract(ADDR.camelotV2Router, V2_ROUTER_ABI, provider);

  const uniLike = (contract, fee) => async (tIn, tOut, amt) => {
    const [out] = await contract.quoteExactInputSingle.staticCall({
      tokenIn: tIn.address,
      tokenOut: tOut.address,
      amountIn: amt,
      fee,
      sqrtPriceLimitX96: 0n,
    });
    return out;
  };
  const sushiV3Like = (fee) => async (tIn, tOut, amt) =>
    sushiV3.quoteExactInputSingle.staticCall(tIn.address, tOut.address, fee, amt, 0n);
  const algebraLike = (contract) => async (tIn, tOut, amt) => {
    const [out] = await contract.quoteExactInputSingle.staticCall(tIn.address, tOut.address, amt, 0n);
    return out;
  };
  const v2Like = (router) => async (tIn, tOut, amt) => {
    const amounts = await router.getAmountsOut(amt, [tIn.address, tOut.address]);
    return amounts[amounts.length - 1];
  };

  const venues = [];
  for (const fee of V3_FEE_TIERS) venues.push({ name: `UniV3 ${fee / 10000}%`, quote: uniLike(uni, fee) });
  for (const fee of V3_FEE_TIERS) venues.push({ name: `SushiV3 ${fee / 10000}%`, quote: sushiV3Like(fee) });
  venues.push({ name: 'CamelotV3', quote: algebraLike(camV3) });
  venues.push({ name: 'CamelotV4', quote: algebraLike(camV4) });
  venues.push({ name: 'RamsesCL', quote: algebraLike(ramses) }); // unverified — skipped on revert
  venues.push({ name: 'SushiV2', quote: v2Like(sushiV2) });
  venues.push({ name: 'CamelotV2', quote: v2Like(camV2) });
  return venues;
}

// ---------------------------------------------------------------------------
// Least-slipped price of `base` measured in `quote`, used only to size probes.
// We ask every venue for a TINY trade and take the MAX per-unit result: a deep
// pool barely slips (high out), while near-empty/mispriced pools slip down (low
// out), so the max is the quote from the deepest pool — the honest price. This
// is what stops a broken Uniswap pool from mis-sizing probes for a token whose
// real liquidity lives on Camelot.
// ---------------------------------------------------------------------------
const DISCOVERY_UNITS = '0.001';

async function priceInQuote(base, quote, venues) {
  const tokenIn = TOKENS[base];
  const tokenOut = TOKENS[quote];
  const wei = parseUnits(DISCOVERY_UNITS, tokenIn.decimals);
  let best = null;
  for (const v of venues) {
    const out = await tryQuote(() => v.quote(tokenIn, tokenOut, wei));
    if (out && out > 0n) {
      const price = Number(formatUnits(out, tokenOut.decimals)) / Number(DISCOVERY_UNITS);
      if (best === null || price > best) best = price;
    }
  }
  return best;
}

// USD value of a quote token (our quote tokens are stables or WETH).
function quoteUsdOf(sym, wethUsd) {
  if (STABLES.has(sym)) return 1;
  if (sym === 'WETH') return wethUsd;
  return null;
}

// ---------------------------------------------------------------------------
// Quote one venue at two sizes and decide if the pool is deep enough.
// Returns { venue, price, impactPct, thin } or null (venue has no pool).
// ---------------------------------------------------------------------------
async function probeVenue(venue, tokenIn, tokenOut, smallHuman, largeHuman) {
  const smallWei = parseUnits(toUnitString(smallHuman, tokenIn.decimals), tokenIn.decimals);
  const largeWei = parseUnits(toUnitString(largeHuman, tokenIn.decimals), tokenIn.decimals);

  const outSmall = await tryQuote(() => venue.quote(tokenIn, tokenOut, smallWei));
  const outLarge = await tryQuote(() => venue.quote(tokenIn, tokenOut, largeWei));
  if (!outSmall || !outLarge || outSmall <= 0n || outLarge <= 0n) return null;

  const priceSmall = Number(formatUnits(outSmall, tokenOut.decimals)) / smallHuman;
  const priceLarge = Number(formatUnits(outLarge, tokenOut.decimals)) / largeHuman;
  const impactPct = Math.abs(priceSmall - priceLarge) / priceSmall * 100;
  return { venue: venue.name, price: priceSmall, impactPct, thin: impactPct > THIN_IMPACT_PCT };
}

// ---------------------------------------------------------------------------
// One full scan pass.
// ---------------------------------------------------------------------------
async function scanOnce(provider) {
  const venues = makeVenues(provider);
  const debug = !!process.env.SIMPLE_SCAN_DEBUG;

  // Anchor: ETH price in USD from the least-slipped WETH->USDC quote.
  const wethUsd = await priceInQuote('WETH', 'USDC', venues);

  const rows = [];
  for (const pair of PAIRS) {
    const label = `${pair.base}/${pair.quote}`;
    const tokenIn = TOKENS[pair.base];
    const tokenOut = TOKENS[pair.quote];

    // Size the two probes to ~$50 and ~$1000 of the base token.
    const priceBQ = await priceInQuote(pair.base, pair.quote, venues);
    const quoteUsd = quoteUsdOf(pair.quote, wethUsd);
    const baseUsd = priceBQ && quoteUsd ? priceBQ * quoteUsd : null;
    const smallHuman = baseUsd ? PROBE_SMALL_USD / baseUsd : 0.05;
    const largeHuman = baseUsd ? PROBE_LARGE_USD / baseUsd : 1.0;
    if (debug) {
      console.log(
        `[debug] ${label} baseUsd=${baseUsd ? baseUsd.toFixed(4) : 'n/a'} small=${smallHuman.toPrecision(3)} large=${largeHuman.toPrecision(3)} ${pair.base}`,
      );
    }

    const quotes = [];
    for (const venue of venues) {
      const q = await probeVenue(venue, tokenIn, tokenOut, smallHuman, largeHuman);
      if (q) quotes.push(q);
      if (debug && q) {
        console.log(`[debug]   ${pad(q.venue, 12)} price=${fmtPrice(q.price)} impact=${q.impactPct.toFixed(2)}% ${q.thin ? 'THIN' : 'ok'}`);
      }
    }

    const healthy = quotes.filter((q) => !q.thin);
    const thinCount = quotes.length - healthy.length;

    if (healthy.length < 2) {
      rows.push({
        label,
        note: `insufficient deep liquidity (${healthy.length} OK / ${thinCount} thin / ${quotes.length} quoting)`,
      });
      continue;
    }

    let low = healthy[0];
    let high = healthy[0];
    for (const q of healthy) {
      if (q.price < low.price) low = q;
      if (q.price > high.price) high = q;
    }
    const spreadPct = ((high.price - low.price) / low.price) * 100;
    rows.push({ label, low, high, spreadPct, healthy: healthy.length, total: quotes.length, thinCount });
  }

  rows.sort((a, b) => (b.spreadPct ?? -1) - (a.spreadPct ?? -1));
  printTable(rows);
  return rows;
}

// ---------------------------------------------------------------------------
// Output.
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

function printTable(rows) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n=== Simple Spread Scanner — Arbitrum — ${stamp} UTC ===`);
  console.log('RAW gross spread only (no DEX fees / gas subtracted).');
  console.log(`Venues probed at ~$${PROBE_SMALL_USD} vs ~$${PROBE_LARGE_USD}; >${THIN_IMPACT_PCT}% price move = THIN pool (excluded).\n`);
  console.log(
    `${pad('PAIR', 14)}${pad('BUY @ (cheapest)', 26)}${pad('SELL @ (dearest)', 26)}${pad('SPREAD%', 10)}LIQ`,
  );
  console.log('-'.repeat(84));

  let best = null;
  const interesting = [];
  for (const r of rows) {
    if (r.note) {
      console.log(`${pad(r.label, 14)}${r.note}`);
      continue;
    }
    const buy = `${r.low.venue} (${fmtPrice(r.low.price)})`;
    const sell = `${r.high.venue} (${fmtPrice(r.high.price)})`;
    const liq = `LIQ-OK ${r.healthy}/${r.total}`;
    console.log(
      `${pad(r.label, 14)}${pad(buy, 26)}${pad(sell, 26)}${pad(r.spreadPct.toFixed(3) + '%', 10)}${liq}`,
    );
    if (!best || r.spreadPct > best.spreadPct) best = r;
    if (r.spreadPct >= MIN_INTERESTING_SPREAD) interesting.push(r);
  }

  console.log('-'.repeat(84));
  if (best) {
    console.log(`BIGGEST SPREAD RIGHT NOW: ${best.label} ${best.spreadPct.toFixed(3)}% (${best.low.venue} -> ${best.high.venue})`);
  } else {
    console.log('BIGGEST SPREAD RIGHT NOW: none (no pair had 2+ deep venues)');
  }
  if (interesting.length) {
    console.log(`\nLIQ-OK spreads above ${MIN_INTERESTING_SPREAD}% (worth a closer look):`);
    for (const r of interesting) {
      console.log(`  ${pad(r.label, 14)} ${r.spreadPct.toFixed(3)}%  buy ${r.low.venue} / sell ${r.high.venue}`);
    }
  } else {
    console.log(`\nNo LIQ-OK pair cleared ${MIN_INTERESTING_SPREAD}% — markets look efficient right now.`);
  }
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------
async function main() {
  const rpcUrl = resolveRpcUrl();
  // Arbitrum-only: pin the network so ethers doesn't re-detect on every hiccup.
  const provider = new JsonRpcProvider(rpcUrl, Network.from(42161), { staticNetwork: true });
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
      await sleep(intervalSec * 1000);
    }
  } while (loop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
