// Simple price-spread scanner (Arbitrum, read-only).
//
// For a handful of token pairs it asks several DEXes "what price do you give?"
// and shows where the token is CHEAPEST (buy) and MOST EXPENSIVE (sell), plus
// the raw gross spread between them. Nothing fancy: low here, high there.
//
// Run once (default):   node scripts/simple-spread-scanner.mjs
// Loop every N seconds: SIMPLE_SCAN_INTERVAL_SEC=30 node scripts/simple-spread-scanner.mjs
// Pick a chain:         SIMPLE_SCAN_CHAIN=base node scripts/simple-spread-scanner.mjs
//                       (default arbitrum; also supports base / chainId 8453)
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
// an LST) is more likely a stale small pool than a real edge.
//
// CONSENSUS CHECK: to catch that stale-but-uniform case, when a pair has >=3
// LIQ-OK venues we take the MEDIAN per-unit price and drop any venue more than
// OUTLIER_PCT (default 3%) off it — one broken quote 4% off the pack is a bad
// quote, not an arb. Such pairs are labelled VERIFIED. Pairs with only 2 LIQ-OK
// venues can't form a consensus (a real 2-DEX gap and one broken quote look
// identical), so they're kept but labelled 2-VENUE (unverified). The raw
// pre-consensus spread is still shown in SIMPLE_SCAN_DEBUG so nothing is hidden.
//
// FEE FLOOR: a raw spread only matters if it beats trading costs. Each row shows
// FEE% = buy-venue swap fee + sell-venue swap fee + gas (a fixed ~$GAS_USD for
// two swaps, expressed as a % of the clip). NET% = SPREAD% - FEE%, and PROFIT?
// flags whether NET% is positive. Because gas is a fixed dollar cost, its % share
// grows as the clip shrinks, so small clips are HARDER to make profitable.
// Tune with SIMPLE_SCAN_CLIP_USD (default 1000) and SIMPLE_SCAN_GAS_USD
// (default: Arbitrum 0.2, Base 0.02 — Base gas is far cheaper).

import { JsonRpcProvider, Network, Contract, formatUnits, parseUnits } from 'ethers';

// ---------------------------------------------------------------------------
// CHAIN SELECTION. All the honesty guards (least-slipped USD anchor, two-probe
// thin-pool guard, >=3-venue median consensus, fee-floor NET/PROFIT? columns)
// are chain-agnostic and reused unchanged. Only the token/venue tables differ.
// ---------------------------------------------------------------------------
const CHAIN_NAME = (process.env.SIMPLE_SCAN_CHAIN || 'arbitrum').toLowerCase();

// ===========================================================================
// ARBITRUM (chainId 42161)
// ===========================================================================
const ARB_PAIRS = [
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

const ARB_TOKENS = {
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

const ARB_STABLES = new Set(['USDC', 'USDCe', 'USDT']);

const ARB_ADDR = {
  uniV3Quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // UniswapV3 QuoterV2
  sushiV3Quoter: '0x0524E833cCD057e4d7A296e3aaAb9f7675964Ce1', // SushiSwap V3 (UniV3-fork) quoter
  camelotV3Quoter: '0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E', // Camelot V3 (Algebra) quoter
  camelotV4Quoter: '0xFe24b2cDfF01B644995bc248bA8497467d688F7B', // Camelot V4 (Algebra) quoter
  ramsesQuoter: '0xaa20eff7ad2f523590de6c04918daae0904b28d4', // Ramses CL (Algebra) quoter — UNVERIFIED (lowercased: source had a bad EIP-55 checksum)
  sushiV2Router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap V2 router
  camelotV2Router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Camelot V2 router
};

// ===========================================================================
// BASE (chainId 8453). Verified venues: Aerodrome V1 (Solidly) + CL/Slipstream,
// Uniswap V3 + V2. To-verify (behind try/catch, skipped on revert): Pancake V3,
// SushiSwap V2, BaseSwap. Addresses lowercased where the source checksum was
// uncertain so ethers never throws on construction.
// ===========================================================================
const BASE_PAIRS = [
  { base: 'AERO', quote: 'WETH' },
  { base: 'AERO', quote: 'USDC' },
  { base: 'DEGEN', quote: 'WETH' },
  { base: 'BRETT', quote: 'WETH' },
  { base: 'TOSHI', quote: 'WETH' },
  { base: 'VIRTUAL', quote: 'WETH' },
  { base: 'cbETH', quote: 'WETH' },
  { base: 'cbBTC', quote: 'WETH' },
  { base: 'WETH', quote: 'USDC' }, // baseline major (should be ~0%)
];

const BASE_TOKENS = {
  WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  AERO: { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
  cbETH: { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
  cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  wstETH: { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18 },
  DEGEN: { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18 },
  BRETT: { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18 },
  TOSHI: { address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', decimals: 18 },
  VIRTUAL: { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7020', decimals: 18 },
};

const BASE_STABLES = new Set(['USDC']);

const BASE_ADDR = {
  aerodromeV1Router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome V1 (Solidly) router
  aerodromeFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da', // Aerodrome PoolFactory (route tuple)
  aerodromeCLQuoter: '0x514c8B5f54112481E28028F1166Bd78501089259', // Aerodrome CL / Slipstream QuoterV2
  uniV3Quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', // Uniswap V3 QuoterV2
  uniV2Router: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24', // Uniswap V2 router
  pancakeV3Quoter: '0xb048bbc1ee6b733fffcfb9e9cef7375518e25997', // PancakeSwap V3 quoter — TO-VERIFY (lowercased)
  sushiV2Router: '0x6bded42c6da8fbf0d2ba55b2fa120c5e0c8d7891', // SushiSwap V2 router — TO-VERIFY (lowercased)
  baseSwapRouter: '0x327df1e6de05895d2ab08513aadd9313fe505d86', // BaseSwap router — TO-VERIFY (lowercased)
};

const V3_FEE_TIERS = [500, 3000]; // Arbitrum Uni/Sushi V3 tiers: 0.05% and 0.3%

// Per-chain config, selected by SIMPLE_SCAN_CHAIN. makeVenues fns are hoisted.
const CHAINS = {
  arbitrum: { id: 42161, label: 'Arbitrum', tokens: ARB_TOKENS, stables: ARB_STABLES, pairs: ARB_PAIRS, gasUsd: 0.2, makeVenues: makeArbitrumVenues },
  base: { id: 8453, label: 'Base', tokens: BASE_TOKENS, stables: BASE_STABLES, pairs: BASE_PAIRS, gasUsd: 0.02, makeVenues: makeBaseVenues },
};
const CHAIN = CHAINS[CHAIN_NAME] || CHAINS.arbitrum;
const TOKENS = CHAIN.tokens;
const STABLES = CHAIN.stables;
const PAIRS = CHAIN.pairs;

// Tuning knobs.
const THIN_IMPACT_PCT = 1.5; // >this move between the two probes = thin pool
const PROBE_SMALL_USD = 50; // small trade probe (~spot reference)
const CLIP_USD = Number(process.env.SIMPLE_SCAN_CLIP_USD || 1000); // the clip / "modest" executable size (also the large probe)
const GAS_USD = Number(process.env.SIMPLE_SCAN_GAS_USD || CHAIN.gasUsd); // approx gas for the two swaps of a round trip (chain-specific default)
const V2_FEE_PCT = 0.3; // constant-product V2 swap fee (Sushi V2 / Camelot V2 / Uni V2 / BaseSwap ~0.3%)
const MIN_INTERESTING_SPREAD = 0.25; // realistic post-fee threshold to highlight
const THROTTLE_MS = Number(process.env.SIMPLE_SCAN_THROTTLE_MS || 120); // min gap between RPC calls (be nice to public nodes)
const MIN_CONSENSUS_VENUES = 3; // need this many LIQ-OK venues to form consensus
const OUTLIER_PCT = Number(process.env.SIMPLE_SCAN_OUTLIER_PCT || 3); // drop venues this far off the median

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
// Aerodrome V1 (Solidly) — route tuple carries the stable/volatile flag + factory.
const AERO_V1_ABI = [
  'function getAmountsOut(uint256 amountIn, (address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)',
];
// Aerodrome CL / Slipstream — UniV3-fork but keyed on tickSpacing, not fee.
const AERO_CL_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];

// ---------------------------------------------------------------------------
// RPC selection: EXP_RPC_URL > VITE_ALCHEMY_API_KEY > public fallback (per chain).
// ---------------------------------------------------------------------------
function resolveRpcUrl() {
  if (process.env.EXP_RPC_URL) return process.env.EXP_RPC_URL;
  if (CHAIN_NAME === 'base') {
    if (process.env.VITE_ALCHEMY_API_KEY) {
      return `https://base-mainnet.g.alchemy.com/v2/${process.env.VITE_ALCHEMY_API_KEY}`;
    }
    return 'https://mainnet.base.org'; // alt: https://base-rpc.publicnode.com
  }
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
// Build the list of venues. Each quote returns { out: bigint, feePct } or throws.
// ---------------------------------------------------------------------------
function makeArbitrumVenues(provider) {
  const A = ARB_ADDR;
  const uni = new Contract(A.uniV3Quoter, UNI_QUOTER_V2_ABI, provider);
  const sushiV3 = new Contract(A.sushiV3Quoter, SUSHI_V3_QUOTER_ABI, provider);
  const camV3 = new Contract(A.camelotV3Quoter, ALGEBRA_QUOTER_ABI, provider);
  const camV4 = new Contract(A.camelotV4Quoter, ALGEBRA_QUOTER_ABI, provider);
  const ramses = new Contract(A.ramsesQuoter, ALGEBRA_QUOTER_ABI, provider);
  const sushiV2 = new Contract(A.sushiV2Router, V2_ROUTER_ABI, provider);
  const camV2 = new Contract(A.camelotV2Router, V2_ROUTER_ABI, provider);

  const venues = [];
  for (const fee of V3_FEE_TIERS) venues.push({ name: `UniV3 ${fee / 10000}%`, quote: uniV3Like(uni, fee) });
  for (const fee of V3_FEE_TIERS) venues.push({ name: `SushiV3 ${fee / 10000}%`, quote: sushiV3Like(sushiV3, fee) });
  venues.push({ name: 'CamelotV3', quote: algebraLike(camV3) });
  venues.push({ name: 'CamelotV4', quote: algebraLike(camV4) });
  venues.push({ name: 'RamsesCL', quote: algebraLike(ramses) }); // unverified — skipped on revert
  venues.push({ name: 'SushiV2', quote: v2Like(sushiV2) });
  venues.push({ name: 'CamelotV2', quote: v2Like(camV2) });
  return venues;
}

// Aerodrome CL / Slipstream fee is set per-pool; approximate by tickSpacing.
const AERO_CL_TIERS = [
  { tickSpacing: 1, feePct: 0.01 },
  { tickSpacing: 50, feePct: 0.05 },
  { tickSpacing: 100, feePct: 0.05 },
  { tickSpacing: 200, feePct: 0.3 },
  { tickSpacing: 2000, feePct: 1.0 },
];
const BASE_V3_FEE_TIERS = [500, 3000, 10000]; // Uniswap V3 on Base
const PANCAKE_V3_FEE_TIERS = [100, 500, 2500, 10000]; // PancakeSwap V3 on Base

function makeBaseVenues(provider) {
  const A = BASE_ADDR;
  const aeroV1 = new Contract(A.aerodromeV1Router, AERO_V1_ABI, provider);
  const aeroCL = new Contract(A.aerodromeCLQuoter, AERO_CL_QUOTER_ABI, provider);
  const uniV3 = new Contract(A.uniV3Quoter, UNI_QUOTER_V2_ABI, provider);
  const uniV2 = new Contract(A.uniV2Router, V2_ROUTER_ABI, provider);
  const pancakeV3 = new Contract(A.pancakeV3Quoter, UNI_QUOTER_V2_ABI, provider); // Pancake V3 quoter shares Uni QuoterV2 struct
  const sushiV2 = new Contract(A.sushiV2Router, V2_ROUTER_ABI, provider);
  const baseSwap = new Contract(A.baseSwapRouter, V2_ROUTER_ABI, provider);

  const venues = [];
  // Aerodrome V1 (Solidly): try volatile + stable routes, keep the better fill.
  venues.push({ name: 'AeroV1', quote: aeroV1Like(aeroV1, A.aerodromeFactory) });
  // Aerodrome CL / Slipstream across common tickSpacings.
  for (const t of AERO_CL_TIERS) venues.push({ name: `AeroCL ts${t.tickSpacing}`, quote: aeroCLLike(aeroCL, t.tickSpacing, t.feePct) });
  for (const fee of BASE_V3_FEE_TIERS) venues.push({ name: `UniV3 ${fee / 10000}%`, quote: uniV3Like(uniV3, fee) });
  venues.push({ name: 'UniV2', quote: v2Like(uniV2) });
  for (const fee of PANCAKE_V3_FEE_TIERS) venues.push({ name: `PancakeV3 ${fee / 10000}%`, quote: uniV3Like(pancakeV3, fee) }); // to-verify
  venues.push({ name: 'SushiV2', quote: v2Like(sushiV2) }); // to-verify
  venues.push({ name: 'BaseSwap', quote: v2Like(baseSwap) }); // to-verify
  return venues;
}

// --- Shared venue quote adapters (each returns { out, feePct } or throws) -----
const uniV3Like = (contract, fee) => async (tIn, tOut, amt) => {
  const [out] = await contract.quoteExactInputSingle.staticCall({
    tokenIn: tIn.address,
    tokenOut: tOut.address,
    amountIn: amt,
    fee,
    sqrtPriceLimitX96: 0n,
  });
  return { out, feePct: fee / 10000 };
};
const sushiV3Like = (contract, fee) => async (tIn, tOut, amt) => {
  const out = await contract.quoteExactInputSingle.staticCall(tIn.address, tOut.address, fee, amt, 0n);
  return { out, feePct: fee / 10000 };
};
const algebraLike = (contract) => async (tIn, tOut, amt) => {
  // Algebra pools charge a DYNAMIC fee, returned by the quoter — capture it.
  const [out, fee] = await contract.quoteExactInputSingle.staticCall(tIn.address, tOut.address, amt, 0n);
  return { out, feePct: Number(fee) / 10000 };
};
const v2Like = (router) => async (tIn, tOut, amt) => {
  const amounts = await router.getAmountsOut(amt, [tIn.address, tOut.address]);
  return { out: amounts[amounts.length - 1], feePct: V2_FEE_PCT };
};
// Aerodrome V1 (Solidly): quote both stable + volatile routes, keep the better.
const aeroV1Like = (router, factory) => async (tIn, tOut, amt) => {
  let best = null;
  for (const stable of [false, true]) {
    try {
      const amounts = await router.getAmountsOut(amt, [
        { from: tIn.address, to: tOut.address, stable, factory },
      ]);
      const out = amounts[amounts.length - 1];
      if (out > 0n && (best === null || out > best.out)) best = { out, feePct: stable ? 0.05 : 0.3 };
    } catch {
      // this route flavour has no pool — try the other
    }
  }
  if (!best) throw new Error('no aerodrome v1 route');
  return best;
};
// Aerodrome CL / Slipstream: UniV3-fork keyed on tickSpacing, non-view -> staticCall.
const aeroCLLike = (quoter, tickSpacing, feePct) => async (tIn, tOut, amt) => {
  const [out] = await quoter.quoteExactInputSingle.staticCall(tIn.address, tOut.address, amt, tickSpacing, 0n);
  return { out, feePct };
};

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
    const r = await tryQuote(() => v.quote(tokenIn, tokenOut, wei));
    if (r && r.out > 0n) {
      const price = Number(formatUnits(r.out, tokenOut.decimals)) / Number(DISCOVERY_UNITS);
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
// Returns { venue, price, feePct, impactPct, thin } or null (venue has no pool).
// ---------------------------------------------------------------------------
async function probeVenue(venue, tokenIn, tokenOut, smallHuman, largeHuman) {
  const smallWei = parseUnits(toUnitString(smallHuman, tokenIn.decimals), tokenIn.decimals);
  const largeWei = parseUnits(toUnitString(largeHuman, tokenIn.decimals), tokenIn.decimals);

  const rSmall = await tryQuote(() => venue.quote(tokenIn, tokenOut, smallWei));
  const rLarge = await tryQuote(() => venue.quote(tokenIn, tokenOut, largeWei));
  if (!rSmall || !rLarge || rSmall.out <= 0n || rLarge.out <= 0n) return null;

  const priceSmall = Number(formatUnits(rSmall.out, tokenOut.decimals)) / smallHuman;
  const priceLarge = Number(formatUnits(rLarge.out, tokenOut.decimals)) / largeHuman;
  const impactPct = Math.abs(priceSmall - priceLarge) / priceSmall * 100;
  return { venue: venue.name, price: priceSmall, feePct: rSmall.feePct, impactPct, thin: impactPct > THIN_IMPACT_PCT };
}

// ---------------------------------------------------------------------------
// One full scan pass.
// ---------------------------------------------------------------------------
async function scanOnce(provider) {
  const venues = CHAIN.makeVenues(provider);
  const debug = !!process.env.SIMPLE_SCAN_DEBUG;

  // Anchor: ETH price in USD from the least-slipped WETH->USDC quote.
  const wethUsd = await priceInQuote('WETH', 'USDC', venues);

  const rows = [];
  for (const pair of PAIRS) {
    const label = `${pair.base}/${pair.quote}`;
    const tokenIn = TOKENS[pair.base];
    const tokenOut = TOKENS[pair.quote];

    // Size the two probes to ~$PROBE_SMALL_USD and ~$CLIP_USD of the base token.
    const priceBQ = await priceInQuote(pair.base, pair.quote, venues);
    const quoteUsd = quoteUsdOf(pair.quote, wethUsd);
    const baseUsd = priceBQ && quoteUsd ? priceBQ * quoteUsd : null;
    const smallHuman = baseUsd ? PROBE_SMALL_USD / baseUsd : 0.05;
    const largeHuman = baseUsd ? CLIP_USD / baseUsd : 1.0;
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

    // Raw (pre-consensus) spread across all LIQ-OK venues — shown in debug.
    const rawEnds = lowHigh(healthy);
    const rawSpread = ((rawEnds.high.price - rawEnds.low.price) / rawEnds.low.price) * 100;

    // Consensus check: with >=3 LIQ-OK venues, drop any whose price is an
    // outlier vs the median (a broken/stale quote). With only 2 we can't tell a
    // real gap from a bad quote, so keep both and mark the row unverified.
    let used = healthy;
    let dropped = [];
    let verified = false;
    if (healthy.length >= MIN_CONSENSUS_VENUES) {
      const med = median(healthy.map((q) => q.price));
      used = [];
      for (const q of healthy) {
        if (Math.abs(q.price - med) / med * 100 > OUTLIER_PCT) dropped.push(q);
        else used.push(q);
      }
      verified = true;
    }

    if (debug) {
      console.log(
        `[debug]   raw spread ${rawSpread.toFixed(3)}% (${rawEnds.low.venue} -> ${rawEnds.high.venue})` +
          (dropped.length ? ` | dropped outliers: ${dropped.map((q) => `${q.venue}(${fmtPrice(q.price)})`).join(', ')}` : ''),
      );
    }

    if (used.length < 2) {
      rows.push({
        label,
        note: `no consensus (all but ${used.length} LIQ-OK venue(s) were outliers > ${OUTLIER_PCT}% off median)`,
      });
      continue;
    }

    const { low, high } = lowHigh(used);
    const spreadPct = ((high.price - low.price) / low.price) * 100;

    // Fee floor = round-trip swap fees (buy venue + sell venue) + gas as a % of
    // the clip. Gas is fixed in $, so its % share grows as the clip shrinks.
    const gasPct = (GAS_USD / CLIP_USD) * 100;
    const feeFloorPct = low.feePct + high.feePct + gasPct;
    const netPct = spreadPct - feeFloorPct;

    rows.push({
      label,
      low,
      high,
      spreadPct,
      feeFloorPct,
      gasPct,
      netPct,
      profitable: netPct > 0,
      liqOk: used.length,
      total: quotes.length,
      thinCount,
      verified,
      droppedCount: dropped.length,
    });
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

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function lowHigh(quotes) {
  let low = quotes[0];
  let high = quotes[0];
  for (const q of quotes) {
    if (q.price < low.price) low = q;
    if (q.price > high.price) high = q;
  }
  return { low, high };
}

function pad(str, width) {
  str = String(str);
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function printTable(rows) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n=== Simple Spread Scanner — ${CHAIN.label} — ${stamp} UTC ===`);
  console.log(`Clip size ~$${CLIP_USD} per swap; gas allowance ~$${GAS_USD} for the round trip.`);
  console.log(`Venues probed at ~$${PROBE_SMALL_USD} vs ~$${CLIP_USD}; >${THIN_IMPACT_PCT}% price move = THIN pool (excluded).`);
  console.log(`VERIFIED = >=${MIN_CONSENSUS_VENUES} LIQ-OK venues agree (outliers >${OUTLIER_PCT}% off median dropped); 2-VENUE = only 2 venues, gap unconfirmed.`);
  console.log('FEE% = buy-venue fee + sell-venue fee + gas(as % of clip). NET% = SPREAD% - FEE%. PROFIT? = is NET% positive.\n');
  console.log(
    `${pad('PAIR', 14)}${pad('BUY @ (cheapest)', 24)}${pad('SELL @ (dearest)', 24)}${pad('SPREAD%', 9)}${pad('FEE%', 8)}${pad('NET%', 9)}${pad('PROFIT?', 8)}STATUS`,
  );
  console.log('-'.repeat(120));

  const statusOf = (r) =>
    r.verified
      ? `VERIFIED ${r.liqOk}/${r.total}${r.droppedCount ? ` (-${r.droppedCount} outlier)` : ''}`
      : `2-VENUE ${r.liqOk}/${r.total} (unverified)`;

  let best = null;
  const profitable = [];
  for (const r of rows) {
    if (r.note) {
      console.log(`${pad(r.label, 14)}${r.note}`);
      continue;
    }
    const buy = `${r.low.venue} (${fmtPrice(r.low.price)})`;
    const sell = `${r.high.venue} (${fmtPrice(r.high.price)})`;
    const net = r.netPct.toFixed(3) + '%';
    console.log(
      `${pad(r.label, 14)}${pad(buy, 24)}${pad(sell, 24)}${pad(r.spreadPct.toFixed(3) + '%', 9)}${pad(r.feeFloorPct.toFixed(3) + '%', 8)}${pad(net, 9)}${pad(r.profitable ? 'YES' : 'no', 8)}${statusOf(r)}`,
    );
    if (!best || r.spreadPct > best.spreadPct) best = r;
    if (r.profitable && r.verified) profitable.push(r);
  }

  console.log('-'.repeat(120));
  if (best) {
    console.log(`BIGGEST SPREAD RIGHT NOW: ${best.label} ${best.spreadPct.toFixed(3)}% (${best.low.venue} -> ${best.high.venue}) [${best.verified ? 'VERIFIED' : '2-VENUE unverified'}] -> NET ${best.netPct.toFixed(3)}% after fees.`);
  } else {
    console.log('BIGGEST SPREAD RIGHT NOW: none (no pair had 2+ deep venues)');
  }
  if (profitable.length) {
    console.log(`\nVERIFIED + net-positive after the ~${(GAS_USD / CLIP_USD * 100).toFixed(3)}% gas + swap-fee floor:`);
    for (const r of profitable) {
      console.log(`  ${pad(r.label, 14)} NET ${pad(r.netPct.toFixed(3) + '%', 9)} (spread ${r.spreadPct.toFixed(3)}% - fees ${r.feeFloorPct.toFixed(3)}%)  buy ${r.low.venue} / sell ${r.high.venue}`);
    }
  } else {
    console.log(`\nNothing clears the fee floor: no VERIFIED pair has a positive NET% after swap fees + gas. Raw spreads exist, but none are executable at a profit.`);
  }
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------
async function main() {
  const rpcUrl = resolveRpcUrl();
  // Pin the network so ethers doesn't re-detect on every hiccup.
  const provider = new JsonRpcProvider(rpcUrl, Network.from(CHAIN.id), { staticNetwork: true });
  console.log(`Chain: ${CHAIN.label} (${CHAIN.id})   RPC: ${rpcUrl}`);

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
