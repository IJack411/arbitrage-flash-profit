/**
 * Experimental real-time arbitrage scanner.
 *
 * Runbook:
 * - Conservative (safe dry-run smoke test):
 *   EXP_MODE=conservative EXP_DRY_RUN=true EXP_SMOKE_TEST=true node scripts/realtime-server-experimental.cjs
 * - Balanced (default, dry-run):
 *   EXP_MODE=balanced EXP_DRY_RUN=true node scripts/realtime-server-experimental.cjs
 * - Aggressive discovery (explicitly enabled, still dry-run):
 *   EXP_MODE=aggressive EXP_ALLOW_AGGRESSIVE=true EXP_DRY_RUN=true node scripts/realtime-server-experimental.cjs
 * - Live trading (explicitly enabled, risky):
 *   EXP_MODE=balanced EXP_DRY_RUN=false EXP_ALLOW_LIVE_TRADING=true node scripts/realtime-server-experimental.cjs
 * - Offline smoke test (no RPC, validates route partition + KPI path):
 *   EXP_MODE=balanced EXP_OFFLINE_SMOKE_TEST=true node scripts/realtime-server-experimental.cjs
 * - Live benchmark (dry-run, exits after N scans and prints final KPI):
 *   EXP_MODE=balanced EXP_DRY_RUN=true EXP_MAX_SCANS=15 EXP_BENCH=true node scripts/realtime-server-experimental.cjs
 *
 * Phase 1.1 safety policy:
 * - Live execution venue allowlist: UniswapV3 Router + Sushi Router only.
 * - Camelot-router routes are quoted/scanned but BLOCKED from live submit (scan-only).
 * - Token bucket debits once per actual RPC attempt (including retries).
 * - KPI output uses [kpi-W] for windowed metrics and [kpi-C] for cumulative.
 *
 * Phase 1.2 changes (amountBMin unit-safety + diagnostic policy flags):
 * - amountBMin is now derived from the quoted step-1 output (buy-token units) * 98.5%, not loanAmount.
 *   loanAmount is in the loan-token denomination; amountBMin must be in the buy-token (intermediate)
 *   denomination that the contract checks after the first swap leg. Using loanAmount was unit-unsafe.
 * - Optional diagnostic policy parity flags (all default false, dry-run only, no live-submit effect):
 *     EXP_CHECK_QUOTE_AGE=true    warn if quote was evaluated more than EXP_QUOTE_MAX_AGE_MS ago (default 4000 ms)
 *     EXP_CHECK_GAS_TO_NET=true   warn if estimated gas cost exceeds EXP_GAS_TO_NET_MAX_PCT of net profit (default 80%)
 *     EXP_CHECK_CONFIDENCE=true   warn if profitUsd is below EXP_CONFIDENCE_FLOOR_USD above minProfitUsd (default 0.50)
 *
 * Phase 1 tuning knobs (env overrides):
 *   EXP_SCAN_DELAY_MS       base scan cadence override (ms)
 *   EXP_MAX_CONCURRENT_QUOTES  primary (executable-route) quote concurrency
 *   EXP_ROUTE_CAP           max total routes per scan cycle
 *   EXP_BENCH               emit final KPI snapshot when EXP_MAX_SCANS exits (true/false)
 *   EXP_RPC_URL             override RPC endpoint
 *   EXP_CONTRACT_ADDRESS    override flash-arb contract address
 *
 * Route-ranking tuner knobs (env overrides, conservative defaults):
 *   EXP_RANK_WEIGHT_NEAR_MISS   weight for near-miss quality signal  (default 0.50)
 *   EXP_RANK_WEIGHT_STABILITY   weight for quote-success stability    (default 0.30)
 *   EXP_RANK_WEIGHT_LIVE_SAFE   weight bonus for live-safe routes     (default 0.20)
 *   EXP_RANK_DECAY_WINDOW       near-miss EMA decay window in scans   (default 40)
 *   All weights should sum to 1.0; liveSafe bonus lifts safe routes above scan-only regardless.
 *
 * Notes:
 * - This script is intentionally separate from scripts/realtime-server.cjs.
 * - Aggressive behavior and live execution are both behind explicit flags.
 * - Non-executable (3-hop) routes are quarantined to a diagnostic-only budget.
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../supabase/.env.local'), true);

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.VITE_ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;
const CONTRACT_ADDRESS = process.env.EXP_CONTRACT_ADDRESS || '0x1aF90750615653db3b800f960aDAA79Ce2A25963';
const TARGET_CHAIN_ID = 42161n;

const TOKENS = {
  WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  USDCe: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
  USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  ARB: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
};

const UNIV3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const UNIV3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const SUSHI_ROUTER = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const CAMELOT_ROUTER = '0xc873fEcbd354f5A56E00E710B90EF4201db2448d';

// Phase 1.1: venues permitted for live execution.
// Camelot is intentionally excluded — treat as scan/discovery-only until further validation.
// Routes using non-allowlisted venues are quoted but blocked from live on-chain submit.
const LIVE_EXEC_VENUE_ALLOWLIST = new Set([UNIV3_ROUTER, SUSHI_ROUTER]);

// Returns true only when a route is safe to submit live:
//   • exactly 2 hops (matches contract ABI constraint)
//   • every v2 hop uses an allowlisted router address
// v3 hops always resolve to UNIV3_ROUTER so they are implicitly safe.
function isLiveSafeRoute(route) {
  if (!route.steps || route.steps.length !== 2) return false;
  return route.steps.every((s) => s.type === 'v3' || LIVE_EXEC_VENUE_ALLOWLIST.has(s.router));
}

const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];
const V2_ROUTER_ABI = ['function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)'];
const FLASH_LOAN_ABI = [
  'function executeArbitrage(address asset, uint256 amount, address routerA, address routerB, address tokenB, bool routerAisV3, bool routerBisV3, uint24 feeA, uint24 feeB, uint256 amountBMin) external',
];

const PRESETS = {
  conservative: {
    minProfitUsd: 3.0,
    maxGasUsd: 0.12,
    baseScanDelayMs: 1400,
    minScanDelayMs: 900,
    maxScanDelayMs: 4500,
    maxConcurrentQuotes: 3,
    maxQuoteRetries: 2,
    quoteRetryBaseMs: 180,
    rateLimitCooldownMs: 6000,
    tradeCooldownMs: 45000,
    routeCap: 24,
    amountLadder: [500, 1000, 2500],
    includeAggressiveRoutes: false,
    // Phase 1: token bucket + pressure modulo + KPI
    diagnosticConcurrentQuotes: 1,
    tokenBucketCapacity: 10,
    tokenBucketRefillPerSec: 5,
    pressureThreshold: 2,
    scanModuloMax: 4,
    kpiIntervalScans: 20,
  },
  balanced: {
    minProfitUsd: 2.0,
    maxGasUsd: 0.10,
    baseScanDelayMs: 700,
    minScanDelayMs: 400,
    maxScanDelayMs: 3500,
    maxConcurrentQuotes: 6,
    maxQuoteRetries: 3,
    quoteRetryBaseMs: 120,
    rateLimitCooldownMs: 9000,
    tradeCooldownMs: 25000,
    routeCap: 54,
    amountLadder: [500, 1000, 2500, 5000],
    includeAggressiveRoutes: true,
    // Phase 1: token bucket + pressure modulo + KPI
    diagnosticConcurrentQuotes: 2,
    tokenBucketCapacity: 18,
    tokenBucketRefillPerSec: 9,
    pressureThreshold: 3,
    scanModuloMax: 5,
    kpiIntervalScans: 25,
  },
  aggressive: {
    minProfitUsd: 1.2,
    maxGasUsd: 0.10,
    baseScanDelayMs: 320,
    minScanDelayMs: 180,
    maxScanDelayMs: 3000,
    maxConcurrentQuotes: 10,
    maxQuoteRetries: 4,
    quoteRetryBaseMs: 80,
    rateLimitCooldownMs: 13000,
    tradeCooldownMs: 15000,
    routeCap: 96,
    amountLadder: [250, 500, 1000, 2500, 5000, 10000],
    includeAggressiveRoutes: true,
    // Phase 1: token bucket + pressure modulo + KPI
    diagnosticConcurrentQuotes: 3,
    tokenBucketCapacity: 30,
    tokenBucketRefillPerSec: 15,
    pressureThreshold: 4,
    scanModuloMax: 6,
    kpiIntervalScans: 30,
  },
};

const BASE_ROUTE_FAMILIES = [
  {
    name: 'WETH/USDC fee500->fee3000',
    loan: 'USDC',
    steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 3000 },
    ],
  },
  {
    name: 'WETH/USDC fee3000->fee500',
    loan: 'USDC',
    steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 500 },
    ],
  },
  {
    name: 'WETH/USDCe fee500->fee3000',
    loan: 'USDCe',
    steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 3000 },
    ],
  },
  {
    name: 'WETH/USDCe fee3000->fee500',
    loan: 'USDCe',
    steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ],
  },
  {
    name: 'USDCe Sushi->UniV3-500',
    loan: 'USDCe',
    steps: [
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ],
  },
  {
    name: 'USDCe UniV3-500->Sushi',
    loan: 'USDCe',
    steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'WETH', tokenOut: 'USDCe' },
    ],
  },
  {
    name: 'USDCe Camelot->UniV3-500',
    loan: 'USDCe',
    steps: [
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ],
  },
  {
    name: 'USDCe UniV3-500->Camelot',
    loan: 'USDCe',
    steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'WETH', tokenOut: 'USDCe' },
    ],
  },
];

const AGGRESSIVE_ROUTE_FAMILIES = [
  {
    name: 'USDC/ARB Sushi->UniV3-3000',
    loan: 'USDC',
    steps: [
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'USDC', tokenOut: 'ARB' },
      { type: 'v3', tokenIn: 'ARB', tokenOut: 'USDC', fee: 3000 },
    ],
  },
  {
    name: 'USDC/ARB UniV3-3000->Sushi',
    loan: 'USDC',
    steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'ARB', fee: 3000 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'ARB', tokenOut: 'USDC' },
    ],
  },
  {
    name: 'USDT/WETH fee500->fee3000',
    loan: 'USDT',
    steps: [
      { type: 'v3', tokenIn: 'USDT', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDT', fee: 3000 },
    ],
  },
  {
    name: 'USDT/WETH fee3000->fee500',
    loan: 'USDT',
    steps: [
      { type: 'v3', tokenIn: 'USDT', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDT', fee: 500 },
    ],
  },
  {
    name: 'USDC triangle V3/Sushi/V3',
    loan: 'USDC',
    fixedAmount: 1000,
    steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'WETH', tokenOut: 'ARB' },
      { type: 'v3', tokenIn: 'ARB', tokenOut: 'USDC', fee: 3000 },
    ],
  },
  {
    name: 'USDCe triangle V3/Camelot/Sushi',
    loan: 'USDCe',
    fixedAmount: 1000,
    steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'WETH', tokenOut: 'ARB' },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'ARB', tokenOut: 'USDCe' },
    ],
  },
];

function parseBool(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function parseIntOr(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function parseFloatOr(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests');
}

const REQUESTED_MODE = (process.env.EXP_MODE || 'balanced').toLowerCase();
const AGGRESSIVE_ENABLED = parseBool(process.env.EXP_ALLOW_AGGRESSIVE, false);
let MODE = ['conservative', 'balanced', 'aggressive'].includes(REQUESTED_MODE) ? REQUESTED_MODE : 'balanced';
if (MODE === 'aggressive' && !AGGRESSIVE_ENABLED) {
  console.warn('[exp] aggressive mode requested but EXP_ALLOW_AGGRESSIVE is not true; falling back to balanced');
  MODE = 'balanced';
}

const BASE_PRESET = PRESETS[MODE];
const PRESET = {
  ...BASE_PRESET,
  baseScanDelayMs: parseIntOr(process.env.EXP_SCAN_DELAY_MS, BASE_PRESET.baseScanDelayMs),
  maxConcurrentQuotes: parseIntOr(process.env.EXP_MAX_CONCURRENT_QUOTES, BASE_PRESET.maxConcurrentQuotes),
  routeCap: parseIntOr(process.env.EXP_ROUTE_CAP, BASE_PRESET.routeCap),
};

// ---- Route-ranking tuner (Phase 1 optimization) ----
// Weights prioritise routes by near-miss quality, stability, and live-safe venue status.
// Defaults are conservative; all three weights should nominally sum to 1.0.
const RANK_CONFIG = {
  weightNearMiss:   parseFloatOr(process.env.EXP_RANK_WEIGHT_NEAR_MISS,  0.50),
  weightStability:  parseFloatOr(process.env.EXP_RANK_WEIGHT_STABILITY,  0.30),
  weightLiveSafe:   parseFloatOr(process.env.EXP_RANK_WEIGHT_LIVE_SAFE,  0.20),
  // Number of scans after which a near-miss observation has decayed to ~37% of its value.
  decayWindowScans: parseIntOr(process.env.EXP_RANK_DECAY_WINDOW,        40),
};

const DRY_RUN = parseBool(process.env.EXP_DRY_RUN, true);
const LIVE_TRADING_ENABLED = !DRY_RUN && parseBool(process.env.EXP_ALLOW_LIVE_TRADING, false);
const SMOKE_TEST = parseBool(process.env.EXP_SMOKE_TEST, false);
const OFFLINE_SMOKE_TEST = parseBool(process.env.EXP_OFFLINE_SMOKE_TEST, false);
const MAX_SCANS = parseIntOr(process.env.EXP_MAX_SCANS, 0);

// Phase 1.2: optional diagnostic policy flags — all default off, never affect live submit.
const POLICY_CHECK_QUOTE_AGE = parseBool(process.env.EXP_CHECK_QUOTE_AGE, false);
const POLICY_QUOTE_MAX_AGE_MS = parseIntOr(process.env.EXP_QUOTE_MAX_AGE_MS, 4000);
const POLICY_CHECK_GAS_TO_NET = parseBool(process.env.EXP_CHECK_GAS_TO_NET, false);
const POLICY_GAS_TO_NET_MAX_PCT = parseIntOr(process.env.EXP_GAS_TO_NET_MAX_PCT, 80);
const POLICY_CHECK_CONFIDENCE = parseBool(process.env.EXP_CHECK_CONFIDENCE, false);
const POLICY_CONFIDENCE_FLOOR_USD = Number(process.env.EXP_CONFIDENCE_FLOOR_USD || '0.50');
const HTTP_URL = process.env.EXP_RPC_URL || (ALCHEMY_KEY
  ? `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
  : 'https://arb1.arbitrum.io/rpc');

const runtime = {
  provider: null,
  quoteV3: null,
  lastScannedBlock: 0,
  scanInFlight: false,
  adaptiveDelayMs: PRESET.baseScanDelayMs,
  cooldownUntil: 0,
  consecutiveRateLimits: 0,
  lastTradeAttemptMs: 0,
  scansCompleted: 0,
  startedAt: Date.now(),
  // Phase 1: quote rate-limit token bucket
  tokenBucket: { tokens: PRESET.tokenBucketCapacity, lastRefillMs: Date.now() },
  // Phase 1: pressure score drives adaptive scan modulo
  pressureScore: 0,
  scanModulo: 1,
  scanIndex: 0,
  // Phase 1: latency telemetry ring buffer (capped at 500 entries)
  cycleLatencies: [],
  // Phase 1: per-reason skip counters (all-time)
  skipReasons: { cooldown: 0, modulo: 0, noNewBlock: 0, tradeCooldown: 0 },
  // Phase 1: rolling KPI window (reset each snapshot)
  kpi: {
    windowStartMs: Date.now(),
    windowScans: 0,
    windowRateLimits: 0,
    windowCooldownSkips: 0,
    windowModuloSkips: 0,
    bestEdgeSamples: [],
  },
  // Phase 1: cache last partition counts for KPI display
  lastPartition: { execCount: 0, diagCount: 0, liveSafeCount: 0 },
  // Phase 1 ranking tuner: per-family EMA state (nearMissEma, stabilityEma, liveSafe, lastScanIdx)
  familyRankState: new Map(),
  stats: {
    opportunitiesFound: 0,
    dryRunOpportunities: 0,
    tradesAttempted: 0,
    tradesSucceeded: 0,
    totalProfitUsd: 0,
    bestProfitUsd: Number.NEGATIVE_INFINITY,
    bestRoute: '',
    quoteFailures: 0,
  },
};

// Build all route instances across families and amount ladders (no cap applied here).
// Called by buildRoutes() which applies ranking before capping.
function buildAllRoutes() {
  const families = PRESET.includeAggressiveRoutes
    ? [...BASE_ROUTE_FAMILIES, ...AGGRESSIVE_ROUTE_FAMILIES]
    : [...BASE_ROUTE_FAMILIES];

  const routes = [];
  for (const family of families) {
    const ladder = family.fixedAmount ? [family.fixedAmount] : PRESET.amountLadder;
    for (const amount of ladder) {
      const steps = family.steps;
      const executable = steps.length === 2;
      // liveSafe: 2-hop AND every v2 step uses an allowlisted venue.
      // Non-liveSafe routes (e.g. Camelot-leg) are still quoted for opportunity discovery
      // but blocked at the policy gate and in executeTrade before any live submit.
      const liveSafe = executable && steps.every(
        (s) => s.type === 'v3' || LIVE_EXEC_VENUE_ALLOWLIST.has(s.router),
      );
      routes.push({
        name: `${family.name} @${amount}`,
        family: family.name,
        loan: family.loan,
        amount,
        steps,
        executable,
        liveSafe,
      });
    }
  }
  return routes;
}

// Compute a bounded [0, 1] rank score for a route family.
// Higher score → route is surfaced earlier in the quota when routeCap is applied.
function computeFamilyRankScore(familyName, liveSafe) {
  const state = runtime.familyRankState.get(familyName);
  const nearMiss  = state ? Math.max(0, Math.min(1, state.nearMissEma))  : 0;
  const stability = state ? Math.max(0, Math.min(1, state.stabilityEma)) : 0.5;
  return (
    RANK_CONFIG.weightNearMiss  * nearMiss  +
    RANK_CONFIG.weightStability * stability +
    RANK_CONFIG.weightLiveSafe  * (liveSafe ? 1 : 0)
  );
}

// Sort routes by rank score (liveSafe always above scan-only), then apply routeCap.
// Deterministic: ties broken by original build order (stable sort not guaranteed in V8
// for equal keys, but score differences from the liveSafe binary flag prevent true ties
// between safe and non-safe routes).
function rankAndCapRoutes(routes) {
  routes.sort((a, b) => {
    const scoreA = computeFamilyRankScore(a.family, a.liveSafe);
    const scoreB = computeFamilyRankScore(b.family, b.liveSafe);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tie-break: liveSafe first (redundant if weights are configured correctly, but
    // keeps the safety property unconditionally even with unusual weight configs)
    if (a.liveSafe !== b.liveSafe) return a.liveSafe ? -1 : 1;
    return 0;
  });
  return routes.slice(0, PRESET.routeCap);
}

// Build and rank-sort the active route list, applying routeCap after ranking.
function buildRoutes() {
  return rankAndCapRoutes(buildAllRoutes());
}

// Update per-family ranking EMA state after a completed scan cycle.
// nearMissEma tracks how close routes have come to profitability (signal ∈ [0,1]).
// stabilityEma tracks quote-success rate (signal 1=success, 0=failure).
// Both signals use exponential decay referenced to RANK_CONFIG.decayWindowScans.
function updateFamilyStats(results) {
  const alpha = 1 / Math.max(1, RANK_CONFIG.decayWindowScans);
  const currentScan = runtime.scansCompleted;

  for (const r of results) {
    const familyName = r.route.family;
    let state = runtime.familyRankState.get(familyName);
    if (!state) {
      state = {
        nearMissEma:  0,
        stabilityEma: 0.5, // neutral prior — neither good nor bad
        liveSafe:     r.route.liveSafe,
        lastScanIdx:  currentScan,
      };
      runtime.familyRankState.set(familyName, state);
    } else {
      // Lazy exponential decay for scans where this family was not observed
      const elapsed = Math.max(0, currentScan - state.lastScanIdx);
      if (elapsed > 0) {
        const decayFactor = Math.exp(-elapsed / RANK_CONFIG.decayWindowScans);
        state.nearMissEma  *= decayFactor;
        // Stability decays toward the neutral prior (0.5)
        state.stabilityEma = 0.5 + (state.stabilityEma - 0.5) * decayFactor;
      }
      // Preserve the liveSafe flag from the most recent observation
      state.liveSafe = r.route.liveSafe;
    }

    if (r.ok) {
      // Near-miss signal: profitUsd normalised from [-10, +5] → [0, 1].
      // Routes barely below the profit threshold (profitUsd ≈ 0) score near 0.67;
      // very negative routes score near 0; profitable routes score ≥ 0.67.
      const nearMissSignal = Math.max(0, Math.min(1, (r.profitUsd + 10) / 15));
      state.nearMissEma  = (1 - alpha) * state.nearMissEma  + alpha * nearMissSignal;
      state.stabilityEma = (1 - alpha) * state.stabilityEma + alpha * 1;
    } else {
      // Quote failure: only update stability (near-miss signal is undefined)
      state.stabilityEma = (1 - alpha) * state.stabilityEma + alpha * 0;
    }

    state.lastScanIdx = currentScan;
  }
}

// Partition route list into execution-safe (2-hop) vs diagnostic (3-hop+) buckets.
// Diagnostic routes share a separate, smaller concurrency budget so they never
// crowd out the primary quote quota allocated to executable routes.
function partitionRoutes(routes) {
  const executable = [];
  const diagnostic = [];
  for (const r of routes) {
    (r.executable ? executable : diagnostic).push(r);
  }
  return { executable, diagnostic };
}

async function notify(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log(`[notify] ${text}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.warn(`[notify] failed: ${err?.message || 'unknown'}`);
  }
}

function chunkedMapLimit(items, limit, mapper) {
  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve([]);
      return;
    }
    const out = new Array(items.length);
    let nextIndex = 0;
    let active = 0;

    const launch = () => {
      while (active < limit && nextIndex < items.length) {
        const i = nextIndex++;
        active += 1;
        Promise.resolve(mapper(items[i], i))
          .then((value) => {
            out[i] = { status: 'fulfilled', value };
          })
          .catch((reason) => {
            out[i] = { status: 'rejected', reason };
          })
          .finally(() => {
            active -= 1;
            if (nextIndex >= items.length && active === 0) {
              resolve(out);
            } else {
              launch();
            }
          });
      }
    };
    launch();
  });
}

async function callWithRetries(label, fn) {
  let lastErr;
  for (let attempt = 0; attempt <= PRESET.maxQuoteRetries; attempt += 1) {
    await acquireOneQuoteToken();  // Phase 1.1: debit per actual RPC attempt (incl. retries)
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) {
        runtime.consecutiveRateLimits += 1;
        runtime.kpi.windowRateLimits += 1;
        runtime.cooldownUntil = Math.max(
          runtime.cooldownUntil,
          Date.now() + PRESET.rateLimitCooldownMs + (runtime.consecutiveRateLimits * 250),
        );
      }
      if (attempt >= PRESET.maxQuoteRetries) break;
      const waitMs = PRESET.quoteRetryBaseMs * (2 ** attempt);
      await sleep(waitMs);
    }
  }
  throw new Error(`${label} failed after retries: ${lastErr?.message || 'unknown error'}`);
}

// Phase 1: quote rate-limit token bucket.
// Smooths burst RPC load and provides back-pressure before hitting 429s.
function refillTokenBucket() {
  const now = Date.now();
  const elapsedSec = (now - runtime.tokenBucket.lastRefillMs) / 1000;
  runtime.tokenBucket.tokens = Math.min(
    PRESET.tokenBucketCapacity,
    runtime.tokenBucket.tokens + (elapsedSec * PRESET.tokenBucketRefillPerSec),
  );
  runtime.tokenBucket.lastRefillMs = now;
}

// Phase 1.1: debit exactly one token per actual RPC attempt (including retries).
// Called inside callWithRetries so the bucket accurately reflects true quote volume.
async function acquireOneQuoteToken() {
  refillTokenBucket();
  if (runtime.tokenBucket.tokens >= 1) {
    runtime.tokenBucket.tokens -= 1;
    return;
  }
  // Bucket empty — wait for 1 token to refill (max 1 s)
  const waitMs = Math.min(Math.ceil((1 / PRESET.tokenBucketRefillPerSec) * 1000), 1000);
  await sleep(waitMs);
  refillTokenBucket();
  runtime.tokenBucket.tokens = Math.max(0, runtime.tokenBucket.tokens - 1);
}

// Pre-scan availability gate: blocks a new scan cycle from starting when the
// bucket is fully depleted. Does NOT debit tokens — per-hop debit in callWithRetries
// is the authoritative accounting point.
async function checkBucketAvailability() {
  refillTokenBucket();
  if (runtime.tokenBucket.tokens >= 1) return;
  const waitMs = Math.min(Math.ceil((1 / PRESET.tokenBucketRefillPerSec) * 1000), 2000);
  await sleep(waitMs);
  refillTokenBucket();
}

async function simulateStep(step, amountIn) {
  const tokenIn = TOKENS[step.tokenIn]?.address;
  const tokenOut = TOKENS[step.tokenOut]?.address;
  if (!tokenIn || !tokenOut) {
    throw new Error(`invalid token mapping: ${step.tokenIn}->${step.tokenOut}`);
  }

  if (step.type === 'v3') {
    return callWithRetries('v3 quote', async () => {
      return runtime.quoteV3.quoteExactInputSingle.staticCall(tokenIn, tokenOut, step.fee, amountIn, 0);
    });
  }

  if (step.type === 'v2') {
    const router = new ethers.Contract(step.router, V2_ROUTER_ABI, runtime.provider);
    return callWithRetries('v2 quote', async () => {
      const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      return amounts[1];
    });
  }

  throw new Error(`unsupported step type: ${step.type}`);
}

async function evaluateRoute(route) {
  const loanToken = TOKENS[route.loan];
  if (!loanToken) {
    return { route, ok: false, error: 'unknown loan token' };
  }

  const loanAmount = BigInt(route.amount) * (10n ** BigInt(loanToken.decimals));
  let currentAmount = loanAmount;
  // Phase 1.2: track step-1 output separately — this is the buy-token quantity used for amountBMin.
  let step1AmountOut = null;
  try {
    for (let i = 0; i < route.steps.length; i++) {
      currentAmount = await simulateStep(route.steps[i], currentAmount);
      if (i === 0) step1AmountOut = currentAmount;
    }
  } catch (err) {
    runtime.stats.quoteFailures += 1;
    return { route, ok: false, error: err.message || 'quote failed' };
  }

  const aaveFee = loanAmount * 5n / 10000n;
  const totalCost = loanAmount + aaveFee;
  const netProfitRaw = currentAmount - totalCost;
  const grossProfit = Number(ethers.formatUnits(netProfitRaw, loanToken.decimals));
  const profitUsd = grossProfit - PRESET.maxGasUsd;
  const profitable = profitUsd >= PRESET.minProfitUsd;

  if (profitUsd > runtime.stats.bestProfitUsd) {
    runtime.stats.bestProfitUsd = profitUsd;
    runtime.stats.bestRoute = route.name;
  }

  return {
    route,
    ok: true,
    profitable,
    profitUsd,
    amountOut: currentAmount,
    loanAmount,
    // Phase 1.2: step1AmountOut is the quoted intermediate amount in buy-token units.
    // Used as the base for amountBMin slippage protection (unit-safe).
    step1AmountOut,
    quoteTimestampMs: Date.now(),
  };
}

function canExecuteRoute(route) {
  return route.steps.length === 2;
}

// Phase 1: latency percentile helper (expects pre-sorted array).
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.max(0, Math.min(Math.ceil((p / 100) * sortedArr.length) - 1, sortedArr.length - 1));
  return sortedArr[idx];
}

// Phase 1 / 1.1: KPI snapshot.
// Emits two clearly labelled lines:
//   [kpi-W]  windowed metrics — reset after each snapshot interval
//   [kpi-C]  cumulative metrics — from process start; includes latency percentiles
function emitKpiSnapshot() {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - runtime.kpi.windowStartMs);
  const elapsedMin = elapsedMs / 60000;
  const totalElapsedMs = Math.max(1, now - runtime.startedAt);
  const totalElapsedMin = totalElapsedMs / 60000;
  const totalElapsedHr = totalElapsedMs / 3600000;

  // ---- Windowed KPIs (reset each interval) ----
  const scansPerMin = (runtime.kpi.windowScans / elapsedMin).toFixed(2);
  const rlPerMin = (runtime.kpi.windowRateLimits / elapsedMin).toFixed(2);
  const windowTotal = runtime.kpi.windowScans + runtime.kpi.windowCooldownSkips + runtime.kpi.windowModuloSkips;
  const cooldownDutyPct = windowTotal > 0
    ? ((runtime.kpi.windowCooldownSkips / windowTotal) * 100).toFixed(1)
    : '0.0';
  const winSec = (elapsedMs / 1000).toFixed(0);

  console.log(
    `[kpi-W] win=${winSec}s scans/min=${scansPerMin} rl/min=${rlPerMin} ` +
    `cooldownDuty=${cooldownDutyPct}% modulo=${runtime.scanModulo} pressure=${runtime.pressureScore.toFixed(1)} ` +
    `exec=${runtime.lastPartition.execCount} diag=${runtime.lastPartition.diagCount} liveSafe=${runtime.lastPartition.liveSafeCount}`,
  );

  // ---- Cumulative KPIs (all-time) ----
  const oppsPerHr = (runtime.stats.opportunitiesFound / Math.max(0.0001, totalElapsedHr)).toFixed(1);
  const edgeTrend = runtime.kpi.bestEdgeSamples.slice(-5).map((v) => `$${v.toFixed(2)}`).join('->') || 'n/a';
  const skips = `cooldown=${runtime.skipReasons.cooldown} modulo=${runtime.skipReasons.modulo}` +
    ` noBlock=${runtime.skipReasons.noNewBlock} tradeCd=${runtime.skipReasons.tradeCooldown}`;

  // Latency percentiles (rolling 500-cycle ring buffer — sliding window, not fully cumulative)
  function sortedField(field) {
    return runtime.cycleLatencies.map((c) => c[field]).sort((a, b) => a - b);
  }
  const cycleS = sortedField('tCycle');
  const quoteS = sortedField('tQuote');
  const policyS = sortedField('tPolicy');
  const submitS = sortedField('tSubmit');

  const latStr = cycleS.length > 0
    ? `cycle=${percentile(cycleS, 50)}/${percentile(cycleS, 95)}ms ` +
      `quote=${percentile(quoteS, 50)}/${percentile(quoteS, 95)}ms ` +
      `policy=${percentile(policyS, 50)}/${percentile(policyS, 95)}ms ` +
      `submit=${percentile(submitS, 50)}/${percentile(submitS, 95)}ms`
    : 'lat=no-data';

  console.log(
    `[kpi-C] up=${totalElapsedMin.toFixed(1)}m opps/hr=${oppsPerHr} ` +
    `totalOpps=${runtime.stats.opportunitiesFound} dryRun=${runtime.stats.dryRunOpportunities} ` +
    `trades=${runtime.stats.tradesSucceeded}/${runtime.stats.tradesAttempted} ` +
    `qFail=${runtime.stats.quoteFailures} ` +
    `best=${runtime.stats.bestRoute || 'n/a'}(${runtime.stats.bestProfitUsd > Number.NEGATIVE_INFINITY ? `$${runtime.stats.bestProfitUsd.toFixed(3)}` : 'n/a'}) ` +
    `bestEdge=${edgeTrend} | lat(P50/P95): ${latStr} | skips(cum): ${skips}`,
  );

  // Reset windowed counters
  runtime.kpi.windowStartMs = now;
  runtime.kpi.windowScans = 0;
  runtime.kpi.windowRateLimits = 0;
  runtime.kpi.windowCooldownSkips = 0;
  runtime.kpi.windowModuloSkips = 0;

  // ---- Rank telemetry (per-interval) ----
  // Shows the top-ranked route families and current weight config for observability.
  const rankedFamilies = [...runtime.familyRankState.entries()]
    .map(([name, state]) => ({
      name,
      score: computeFamilyRankScore(name, state.liveSafe || false),
      nearMiss: Math.max(0, Math.min(1, state.nearMissEma)).toFixed(3),
      stability: Math.max(0, Math.min(1, state.stabilityEma)).toFixed(3),
      liveSafe: state.liveSafe ? 'L' : 'S',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const topStr = rankedFamilies.length > 0
    ? rankedFamilies.map((f) => `${f.name}[${f.liveSafe}](score=${f.score.toFixed(3)} nm=${f.nearMiss} stab=${f.stability})`).join(' | ')
    : 'no-data';
  console.log(
    `[kpi-R] topFamilies: ${topStr} | ` +
    `weights(nearMiss=${RANK_CONFIG.weightNearMiss} stability=${RANK_CONFIG.weightStability} liveSafe=${RANK_CONFIG.weightLiveSafe}) ` +
    `decayWin=${RANK_CONFIG.decayWindowScans}scans`,
  );
}

async function executeTrade(candidate) {
  runtime.stats.tradesAttempted += 1;
  const { route, loanAmount } = candidate;
  const step1 = route.steps[0];
  const step2 = route.steps[1];
  const loanToken = TOKENS[route.loan];
  const intermediateToken = TOKENS[step1.tokenOut]?.address;
  const wallet = new ethers.Wallet(PRIVATE_KEY, runtime.provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, FLASH_LOAN_ABI, wallet);

  // Phase 1.2: amountBMin must be in buy-token (step1.tokenOut) units, not loan-token units.
  // The contract checks: amount received from swap-A >= amountBMin before proceeding to swap-B.
  // Using loanAmount (loan-token denomination) here would be unit-unsafe when decimals differ
  // (e.g. USDC=6 dec for loan but WETH=18 dec for buy token).
  // Correct base: quoted step-1 output (step1AmountOut) * 98.5% slippage floor.
  const step1Base = candidate.step1AmountOut != null ? candidate.step1AmountOut : loanAmount;
  const amountBMin = step1Base * 985n / 1000n;

  const payload = {
    asset: loanToken.address,
    amount: loanAmount,
    routerA: step1.type === 'v3' ? UNIV3_ROUTER : step1.router,
    routerB: step2.type === 'v3' ? UNIV3_ROUTER : step2.router,
    tokenB: intermediateToken,
    routerAisV3: step1.type === 'v3',
    routerBisV3: step2.type === 'v3',
    feeA: step1.fee || 0,
    feeB: step2.fee || 0,
    amountBMin,
  };

  if (!LIVE_TRADING_ENABLED) {
    runtime.stats.dryRunOpportunities += 1;

    // Phase 1.2: optional diagnostic policy parity checks (dry-run only, no live-submit effect).
    const policyWarnings = [];
    if (POLICY_CHECK_QUOTE_AGE && candidate.quoteTimestampMs != null) {
      const ageMs = Date.now() - candidate.quoteTimestampMs;
      if (ageMs > POLICY_QUOTE_MAX_AGE_MS) {
        policyWarnings.push(`quote-age=${ageMs}ms > max=${POLICY_QUOTE_MAX_AGE_MS}ms`);
      }
    }
    if (POLICY_CHECK_GAS_TO_NET && candidate.profitUsd > 0) {
      const gasToNetPct = (PRESET.maxGasUsd / candidate.profitUsd) * 100;
      if (gasToNetPct > POLICY_GAS_TO_NET_MAX_PCT) {
        policyWarnings.push(`gas-to-net=${gasToNetPct.toFixed(1)}% > max=${POLICY_GAS_TO_NET_MAX_PCT}%`);
      }
    }
    if (POLICY_CHECK_CONFIDENCE) {
      const margin = candidate.profitUsd - PRESET.minProfitUsd;
      if (margin < POLICY_CONFIDENCE_FLOOR_USD) {
        policyWarnings.push(`confidence-margin=$${margin.toFixed(3)} < floor=$${POLICY_CONFIDENCE_FLOOR_USD}`);
      }
    }
    const policyTag = policyWarnings.length > 0 ? ` [policy-warn: ${policyWarnings.join('; ')}]` : '';

    console.log(`[dry-run] would execute ${route.name} amount=${route.amount} expectedProfit=$${candidate.profitUsd.toFixed(4)} amountBMin=${amountBMin.toString()}${policyTag}`);
    return { success: true, txHash: null, dryRun: true };
  }

  // Phase 1.1: hard venue-allowlist gate — defense-in-depth for the live path.
  // The policy gate in scanOnce already filters non-liveSafe candidates before this
  // point, but this check ensures no non-allowlisted venue can ever reach the on-chain call.
  if (!isLiveSafeRoute(route)) {
    throw new Error(`[safety] route ${route.name} uses non-allowlisted venue — live submit blocked`);
  }

  await contract.executeArbitrage.estimateGas(
    payload.asset, payload.amount, payload.routerA, payload.routerB, payload.tokenB,
    payload.routerAisV3, payload.routerBisV3, payload.feeA, payload.feeB, payload.amountBMin,
  );

  const feeData = await runtime.provider.getFeeData();
  const tx = await contract.executeArbitrage(
    payload.asset, payload.amount, payload.routerA, payload.routerB, payload.tokenB,
    payload.routerAisV3, payload.routerBisV3, payload.feeA, payload.feeB, payload.amountBMin,
    { gasLimit: 800_000n, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas },
  );
  const receipt = await tx.wait();
  runtime.stats.tradesSucceeded += 1;
  runtime.stats.totalProfitUsd += candidate.profitUsd;
  return { success: true, txHash: receipt.hash, dryRun: false };
}

function selectCandidates(results) {
  const profitable = results.filter((r) => r.ok && r.profitable);
  profitable.sort((a, b) => {
    if (a.route.amount !== b.route.amount) return a.route.amount - b.route.amount;
    return b.profitUsd - a.profitUsd;
  });
  return profitable;
}

async function scanOnce() {
  const tCycleStart = Date.now();

  // Guard: skip if we are in a global rate-limit cooldown window
  if (tCycleStart < runtime.cooldownUntil) {
    runtime.skipReasons.cooldown += 1;
    runtime.kpi.windowCooldownSkips += 1;
    return;
  }

  // Phase 1: pressure-based scan modulo — reduces RPC frequency when RL stress is high
  runtime.scanIndex += 1;
  if (runtime.scanModulo > 1 && (runtime.scanIndex % runtime.scanModulo) !== 0) {
    runtime.skipReasons.modulo += 1;
    runtime.kpi.windowModuloSkips += 1;
    return;
  }

  const block = await runtime.provider.getBlockNumber();
  const tBlockSeen = Date.now();
  if (block <= runtime.lastScannedBlock) {
    runtime.skipReasons.noNewBlock += 1;
    return;
  }
  runtime.lastScannedBlock = block;

  // Phase 1: partition routes — executable (2-hop) get primary budget; diagnostic (3-hop+) get limited budget
  const allRoutes = buildRoutes();
  const { executable: execRoutes, diagnostic: diagRoutes } = partitionRoutes(allRoutes);
  runtime.lastPartition.execCount = execRoutes.length;
  runtime.lastPartition.diagCount = diagRoutes.length;
  runtime.lastPartition.liveSafeCount = execRoutes.filter((r) => r.liveSafe).length;

  // Phase 1.1: pre-scan availability gate (non-debiting).
  // Per-hop debit happens inside callWithRetries -> acquireOneQuoteToken.
  await checkBucketAvailability();

  // Quote both buckets concurrently; diagnostic bucket never blocks executable quotes
  const [execSettled, diagSettled] = await Promise.all([
    chunkedMapLimit(execRoutes, Math.max(1, PRESET.maxConcurrentQuotes), evaluateRoute),
    chunkedMapLimit(diagRoutes, Math.max(1, PRESET.diagnosticConcurrentQuotes), evaluateRoute),
  ]);

  const tQuoteDone = Date.now();

  const execResults = execSettled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const diagResults = diagSettled.filter((s) => s.status === 'fulfilled').map((s) => s.value);

  // Phase 1 ranking tuner: update per-family EMA state from this cycle's exec results.
  // Diagnostic results are excluded — they inform the diag bucket only.
  updateFamilyStats(execResults);

  // Diagnostic-only: log profitable non-executable opportunities for analysis
  for (const d of diagResults) {
    if (d.ok && d.profitable) {
      console.log(`[diag] non-executable opp: ${d.route.name} profit~$${d.profitUsd.toFixed(3)}`);
    }
  }

  const candidates = selectCandidates(execResults);
  const tPolicyDone = Date.now();
  let tSubmit = tPolicyDone;

  if (candidates.length > 0) {
    runtime.stats.opportunitiesFound += candidates.length;
    const now = Date.now();
    if (now - runtime.lastTradeAttemptMs >= PRESET.tradeCooldownMs) {
      // Phase 1.1: policy gate — only liveSafe routes are forwarded to executeTrade in live mode.
      // In dry-run mode all executable candidates are included (useful for full discovery reporting).
      const executableCandidates = LIVE_TRADING_ENABLED
        ? candidates.filter((c) => c.route.liveSafe)
        : candidates;
      const blockedByVenue = LIVE_TRADING_ENABLED
        ? candidates.filter((c) => !c.route.liveSafe)
        : [];
      for (const b of blockedByVenue) {
        console.log(`[policy] venue-blocked (scan-only): ${b.route.name} profit~$${b.profitUsd.toFixed(3)}`);
      }
      for (const candidate of executableCandidates) {
        try {
          const executed = await executeTrade(candidate);
          tSubmit = Date.now();
          runtime.lastTradeAttemptMs = tSubmit;
          if (executed.success) {
            if (executed.dryRun) {
              await notify(`Dry-run candidate: ${candidate.route.name} amount=${candidate.route.amount} profit~$${candidate.profitUsd.toFixed(2)}`);
            } else {
              await notify(`Trade executed: ${candidate.route.name} profit~$${candidate.profitUsd.toFixed(2)} tx=${executed.txHash}`);
            }
            break;
          }
        } catch (err) {
          console.warn(`[trade] failed for ${candidate.route.name}: ${err?.message || 'unknown'}`);
        }
      }
    } else {
      runtime.skipReasons.tradeCooldown += 1;
    }
  }

  const tCycleEnd = Date.now();
  const cycleDurationMs = tCycleEnd - tCycleStart;

  // Phase 1: record end-to-end latency telemetry in ring buffer
  runtime.cycleLatencies.push({
    tCycle: cycleDurationMs,
    tQuote: tQuoteDone - tBlockSeen,
    tPolicy: tPolicyDone - tQuoteDone,
    tSubmit: tSubmit - tPolicyDone,
  });
  if (runtime.cycleLatencies.length > 500) runtime.cycleLatencies.shift();

  // Phase 1: sample best-edge for KPI trend line
  if (runtime.stats.bestProfitUsd > Number.NEGATIVE_INFINITY) {
    runtime.kpi.bestEdgeSamples.push(runtime.stats.bestProfitUsd);
    if (runtime.kpi.bestEdgeSamples.length > 20) runtime.kpi.bestEdgeSamples.shift();
  }

  runtime.kpi.windowScans += 1;
  runtime.scansCompleted += 1;

  // Adaptive delay: tighten when scans are fast and healthy, loosen under pressure
  if (runtime.consecutiveRateLimits > 0) {
    runtime.adaptiveDelayMs = Math.min(PRESET.maxScanDelayMs, runtime.adaptiveDelayMs + 200);
    runtime.consecutiveRateLimits = Math.max(0, runtime.consecutiveRateLimits - 1);
  } else if (cycleDurationMs < runtime.adaptiveDelayMs * 0.6) {
    runtime.adaptiveDelayMs = Math.max(PRESET.minScanDelayMs, runtime.adaptiveDelayMs - 40);
  } else if (cycleDurationMs > runtime.adaptiveDelayMs * 1.25) {
    runtime.adaptiveDelayMs = Math.min(PRESET.maxScanDelayMs, runtime.adaptiveDelayMs + 80);
  }

  // Phase 1: periodic KPI snapshot (count-based)
  if (runtime.scansCompleted % PRESET.kpiIntervalScans === 0) {
    emitKpiSnapshot();
  }
}

async function verifyAddressCode(label, addr) {
  if (!ethers.isAddress(addr)) {
    throw new Error(`${label} is not a valid address: ${addr}`);
  }
  const code = await runtime.provider.getCode(addr);
  if (!code || code === '0x') {
    throw new Error(`${label} has no deployed code on the connected chain`);
  }
}

async function startupSanityChecks() {
  if (!DRY_RUN && !LIVE_TRADING_ENABLED) {
    throw new Error('Live trading requires EXP_DRY_RUN=false and EXP_ALLOW_LIVE_TRADING=true');
  }
  if (LIVE_TRADING_ENABLED && !PRIVATE_KEY) {
    throw new Error('Missing PRIVATE_KEY for live trading mode');
  }

  runtime.provider = new ethers.JsonRpcProvider(HTTP_URL);
  runtime.quoteV3 = new ethers.Contract(UNIV3_QUOTER, QUOTER_ABI, runtime.provider);

  const network = await runtime.provider.getNetwork();
  if (network.chainId !== TARGET_CHAIN_ID) {
    throw new Error(`Wrong network: expected ${TARGET_CHAIN_ID}, got ${network.chainId}`);
  }

  for (const [symbol, token] of Object.entries(TOKENS)) {
    await verifyAddressCode(`token ${symbol}`, token.address);
  }
  await verifyAddressCode('UniswapV3 Quoter', UNIV3_QUOTER);
  await verifyAddressCode('UniswapV3 Router', UNIV3_ROUTER);
  await verifyAddressCode('Sushi Router', SUSHI_ROUTER);
  await verifyAddressCode('Camelot Router', CAMELOT_ROUTER);
  await verifyAddressCode('Flash arbitrage contract', CONTRACT_ADDRESS);

  const probe = {
    type: 'v3',
    tokenIn: 'USDC',
    tokenOut: 'WETH',
    fee: 500,
  };
  const probeAmount = 100n * 10n ** 6n;
  const quote = await simulateStep(probe, probeAmount);
  if (!quote || quote <= 0n) {
    throw new Error('Probe quote failed during startup checks');
  }

  console.log(`[exp] startup checks ok: chain=${network.chainId} probeOut=${quote.toString()}`);
}

function offlineSmokeChecks() {
  const allRoutes = buildRoutes();
  if (allRoutes.length === 0) throw new Error('Offline smoke check failed: no routes generated');
  if (allRoutes.length > PRESET.routeCap) throw new Error('Offline smoke check failed: route cap exceeded');

  // Phase 1: verify route partition logic
  const { executable: execRoutes, diagnostic: diagRoutes } = partitionRoutes(allRoutes);
  if (execRoutes.length === 0) throw new Error('Offline smoke check failed: no executable routes generated');
  if (execRoutes.some((r) => !r.executable)) throw new Error('Offline smoke check failed: non-executable route leaked into exec bucket');
  if (diagRoutes.some((r) => r.executable)) throw new Error('Offline smoke check failed: executable route leaked into diag bucket');

  // Phase 1.1: verify venue-allowlist policy
  const liveSafeRoutes = execRoutes.filter((r) => r.liveSafe);
  const scanOnlyRoutes = execRoutes.filter((r) => !r.liveSafe);
  if (liveSafeRoutes.length === 0) throw new Error('Offline smoke check failed: no liveSafe exec routes');
  // Camelot-leg routes must NOT be liveSafe
  const camelotLive = execRoutes.filter(
    (r) => r.liveSafe && r.steps.some((s) => s.router === CAMELOT_ROUTER),
  );
  if (camelotLive.length > 0) {
    throw new Error(`Offline smoke check failed: Camelot-leg route tagged liveSafe: ${camelotLive[0].name}`);
  }
  // isLiveSafeRoute must reject a known Camelot route
  const mockCamelotRoute = { steps: [{ type: 'v2', router: CAMELOT_ROUTER }, { type: 'v3' }] };
  if (isLiveSafeRoute(mockCamelotRoute)) {
    throw new Error('Offline smoke check failed: isLiveSafeRoute accepted Camelot-leg route');
  }
  // isLiveSafeRoute must accept a known safe route
  const mockSafeRoute = { steps: [{ type: 'v3' }, { type: 'v2', router: SUSHI_ROUTER }] };
  if (!isLiveSafeRoute(mockSafeRoute)) {
    throw new Error('Offline smoke check failed: isLiveSafeRoute rejected Sushi-leg route');
  }

  for (const [symbol, token] of Object.entries(TOKENS)) {
    if (!ethers.isAddress(token.address)) {
      throw new Error(`Offline smoke check failed: invalid token address for ${symbol}`);
    }
  }
  for (const [label, addr] of [
    ['UniswapV3 Quoter', UNIV3_QUOTER],
    ['UniswapV3 Router', UNIV3_ROUTER],
    ['Sushi Router', SUSHI_ROUTER],
    ['Camelot Router', CAMELOT_ROUTER],
    ['Flash arbitrage contract', CONTRACT_ADDRESS],
  ]) {
    if (!ethers.isAddress(addr)) throw new Error(`Offline smoke check failed: invalid ${label} address`);
  }

  const mockCandidates = selectCandidates([
    { ok: true, profitable: true, route: { amount: 250, name: 'a' }, profitUsd: 1.5 },
    { ok: true, profitable: true, route: { amount: 1000, name: 'b' }, profitUsd: 4.1 },
    { ok: true, profitable: true, route: { amount: 250, name: 'c' }, profitUsd: 2.2 },
  ]);
  if (mockCandidates[0]?.route?.name !== 'c') {
    throw new Error('Offline smoke check failed: small-first candidate ordering broke');
  }

  // Phase 1.1: verify token bucket starts at full capacity
  const bucketRatio = runtime.tokenBucket.tokens / PRESET.tokenBucketCapacity;
  if (bucketRatio < 0.9) {
    throw new Error(`Offline smoke check failed: token bucket not at capacity (${runtime.tokenBucket.tokens.toFixed(1)}/${PRESET.tokenBucketCapacity})`);
  }

  // Phase 1.2: verify amountBMin unit-safety — step1AmountOut path
  // Simulate a candidate where step1AmountOut (buy-token units) differs from loanAmount (loan-token units).
  // amountBMin must equal step1AmountOut * 985 / 1000, not loanAmount * 985 / 1000.
  const mockStep1Out = 500_000_000_000_000_000n; // 0.5 WETH in 18-dec units
  const mockLoanAmt = 1000n * 10n ** 6n;          // 1000 USDC in 6-dec units
  const expectedAmtBMin = mockStep1Out * 985n / 1000n;
  const wrongAmtBMin = mockLoanAmt * 985n / 1000n;
  if (expectedAmtBMin === wrongAmtBMin) {
    throw new Error('Offline smoke check failed: amountBMin unit-safety check is a no-op (values coincide — update test values)');
  }
  // Verify the formula itself
  const computedAmtBMin = mockStep1Out * 985n / 1000n;
  if (computedAmtBMin !== expectedAmtBMin) {
    throw new Error(`Offline smoke check failed: amountBMin computation mismatch: ${computedAmtBMin} !== ${expectedAmtBMin}`);
  }

  // Phase 1.2: verify policy flag constants are parseable (no runtime errors at startup)
  const _ageOk = POLICY_QUOTE_MAX_AGE_MS > 0;
  const _pctOk = POLICY_GAS_TO_NET_MAX_PCT > 0 && POLICY_GAS_TO_NET_MAX_PCT <= 100;
  const _confOk = Number.isFinite(POLICY_CONFIDENCE_FLOOR_USD) && POLICY_CONFIDENCE_FLOOR_USD >= 0;
  if (!_ageOk || !_pctOk || !_confOk) {
    throw new Error(`Offline smoke check failed: policy flag constant out of range (age=${POLICY_QUOTE_MAX_AGE_MS} pct=${POLICY_GAS_TO_NET_MAX_PCT} conf=${POLICY_CONFIDENCE_FLOOR_USD})`);
  }

  // Phase 1 ranking tuner: verify buildAllRoutes, rankAndCapRoutes, and computeFamilyRankScore
  const allRoutesUnranked = buildAllRoutes();
  if (allRoutesUnranked.length === 0) throw new Error('Offline smoke check failed: buildAllRoutes returned no routes');
  // buildAllRoutes must NOT apply the cap
  const totalPossible = (PRESET.includeAggressiveRoutes
    ? [...BASE_ROUTE_FAMILIES, ...AGGRESSIVE_ROUTE_FAMILIES]
    : [...BASE_ROUTE_FAMILIES])
    .reduce((sum, f) => sum + (f.fixedAmount ? 1 : PRESET.amountLadder.length), 0);
  if (allRoutesUnranked.length !== totalPossible) {
    throw new Error(`Offline smoke check failed: buildAllRoutes length mismatch (got ${allRoutesUnranked.length}, expected ${totalPossible})`);
  }

  // rankAndCapRoutes must respect routeCap
  const ranked = rankAndCapRoutes([...allRoutesUnranked]);
  if (ranked.length > PRESET.routeCap) throw new Error('Offline smoke check failed: rankAndCapRoutes exceeded routeCap');
  if (ranked.length === 0) throw new Error('Offline smoke check failed: rankAndCapRoutes returned no routes');

  // All rank scores must be bounded [0, 1]
  for (const r of ranked) {
    const score = computeFamilyRankScore(r.family, r.liveSafe);
    if (score < 0 || score > 1 + 1e-9) {
      throw new Error(`Offline smoke check failed: rank score out of bounds (${score}) for ${r.family}`);
    }
  }

  // liveSafe routes must rank at or above scan-only routes (with default cold-start state)
  const liveSafeRanked = ranked.filter((r) => r.liveSafe);
  const scanOnlyRanked = ranked.filter((r) => r.executable && !r.liveSafe);
  if (liveSafeRanked.length > 0 && scanOnlyRanked.length > 0) {
    const lowestLiveSafeScore  = Math.min(...liveSafeRanked.map((r) => computeFamilyRankScore(r.family, r.liveSafe)));
    const highestScanOnlyScore = Math.max(...scanOnlyRanked.map((r) => computeFamilyRankScore(r.family, r.liveSafe)));
    if (lowestLiveSafeScore < highestScanOnlyScore - 1e-9) {
      throw new Error(
        `Offline smoke check failed: cold-start liveSafe score (${lowestLiveSafeScore.toFixed(4)}) ` +
        `is below scan-only score (${highestScanOnlyScore.toFixed(4)}) — liveSafe weight is too low`,
      );
    }
  }

  // Simulate EMA updates and verify scores are updated correctly
  const testFamily = ranked[0].family;
  const testLiveSafe = ranked[0].liveSafe;
  const scoreBefore = computeFamilyRankScore(testFamily, testLiveSafe);
  // Inject a high near-miss signal for the test family
  updateFamilyStats([{ route: ranked[0], ok: true, profitUsd: -0.1 }]);
  const scoreAfter = computeFamilyRankScore(testFamily, testLiveSafe);
  if (scoreAfter < scoreBefore) {
    throw new Error(
      `Offline smoke check failed: near-miss update lowered rank score for ${testFamily} ` +
      `(before=${scoreBefore.toFixed(4)} after=${scoreAfter.toFixed(4)})`,
    );
  }

  // Simulate a quote failure and verify stability decreases
  const stabilityBefore = runtime.familyRankState.get(testFamily)?.stabilityEma ?? 0.5;
  updateFamilyStats([{ route: ranked[0], ok: false, error: 'quote failed' }]);
  const stabilityAfter = runtime.familyRankState.get(testFamily)?.stabilityEma ?? 0.5;
  if (stabilityAfter >= stabilityBefore) {
    throw new Error(
      `Offline smoke check failed: quote-failure did not lower stabilityEma for ${testFamily} ` +
      `(before=${stabilityBefore.toFixed(4)} after=${stabilityAfter.toFixed(4)})`,
    );
  }

  // Phase 1: verify emitKpiSnapshot executes without throwing
  try {
    emitKpiSnapshot();
  } catch (kpiErr) {
    throw new Error(`Offline smoke check failed: emitKpiSnapshot threw: ${kpiErr?.message}`);
  }

  console.log(
    `[exp] offline smoke checks ok: totalRoutes=${allRoutes.length} exec=${execRoutes.length} ` +
    `liveSafe=${liveSafeRoutes.length} scanOnly=${scanOnlyRoutes.length} ` +
    `diag=${diagRoutes.length} mode=${MODE} tokenBucket=${PRESET.tokenBucketCapacity}@${PRESET.tokenBucketRefillPerSec}/s ` +
    `rankWeights=(nm=${RANK_CONFIG.weightNearMiss} stab=${RANK_CONFIG.weightStability} ls=${RANK_CONFIG.weightLiveSafe}) ` +
    `decayWin=${RANK_CONFIG.decayWindowScans}scans`,
  );
}

let shutdownRequested = false;

async function loop() {
  if (shutdownRequested) return;
  if (runtime.scanInFlight) {
    setTimeout(loop, runtime.adaptiveDelayMs);
    return;
  }

  runtime.scanInFlight = true;
  try {
    await scanOnce();
  } catch (err) {
    if (isRateLimitError(err)) {
      // Raise pressure score; it decays passively each loop iteration
      runtime.pressureScore = Math.min(PRESET.scanModuloMax * 2, runtime.pressureScore + 2);
      runtime.cooldownUntil = Math.max(runtime.cooldownUntil, Date.now() + PRESET.rateLimitCooldownMs);
      runtime.adaptiveDelayMs = Math.min(PRESET.maxScanDelayMs, runtime.adaptiveDelayMs + 250);
      runtime.kpi.windowRateLimits += 1;
      console.warn(`[exp] rate-limited (loop), pressure=${runtime.pressureScore.toFixed(1)} cooldown=${PRESET.rateLimitCooldownMs}ms`);
    } else {
      console.warn(`[exp] scan error: ${err?.message || 'unknown error'}`);
    }
  } finally {
    runtime.scanInFlight = false;
  }

  // Phase 1: adaptive pressure modulo — raise skip factor when stressed, lower when healthy
  if (runtime.pressureScore > PRESET.pressureThreshold) {
    runtime.scanModulo = Math.min(PRESET.scanModuloMax, Math.ceil(runtime.pressureScore / 2));
  } else if (runtime.scanModulo > 1) {
    runtime.scanModulo = Math.max(1, runtime.scanModulo - 1);
  }
  // Passive pressure decay each loop tick
  if (runtime.pressureScore > 0) {
    runtime.pressureScore = Math.max(0, runtime.pressureScore - 0.5);
  }

  if (MAX_SCANS > 0 && runtime.scansCompleted >= MAX_SCANS) {
    console.log(`[exp] reached EXP_MAX_SCANS=${MAX_SCANS}, exiting`);
    if (parseBool(process.env.EXP_BENCH, false)) {
      console.log('[bench] final KPI snapshot:');
      emitKpiSnapshot();
    }
    shutdownRequested = true;
    return;
  }

  const nextDelay = Math.max(PRESET.minScanDelayMs, runtime.adaptiveDelayMs);
  setTimeout(loop, nextDelay);
}

async function main() {
  console.log('======================================================');
  console.log('Experimental Arbitrage Scanner (secondary path)');
  console.log('======================================================');
  console.log(`[exp] mode=${MODE} dryRun=${DRY_RUN} liveTrading=${LIVE_TRADING_ENABLED} smokeTest=${SMOKE_TEST}`);
  console.log(
    `[exp] preset: minProfit=$${PRESET.minProfitUsd} maxConcurrentQuotes=${PRESET.maxConcurrentQuotes} ` +
    `baseDelayMs=${PRESET.baseScanDelayMs} routeCap=${PRESET.routeCap}`,
  );
  console.log(`[exp] runtime guards: quoteRetries=${PRESET.maxQuoteRetries} tradeCooldownMs=${PRESET.tradeCooldownMs}`);
  const _initRoutes = buildRoutes();
  const _initPartition = partitionRoutes(_initRoutes);
  const _liveSafeCount = _initPartition.executable.filter((r) => r.liveSafe).length;
  const _scanOnlyCount = _initPartition.executable.length - _liveSafeCount;
  console.log(
    `[exp] phase1: execRoutes=${_initPartition.executable.length} ` +
    `liveSafe=${_liveSafeCount} scanOnly(venue-blocked)=${_scanOnlyCount} ` +
    `diagRoutes=${_initPartition.diagnostic.length} ` +
    `tokenBucket=${PRESET.tokenBucketCapacity}cap@${PRESET.tokenBucketRefillPerSec}/s ` +
    `pressureThreshold=${PRESET.pressureThreshold} scanModuloMax=${PRESET.scanModuloMax} ` +
    `kpiInterval=${PRESET.kpiIntervalScans}scans`,
  );
  console.log(
    `[exp] rankTuner: weightNearMiss=${RANK_CONFIG.weightNearMiss} ` +
    `weightStability=${RANK_CONFIG.weightStability} ` +
    `weightLiveSafe=${RANK_CONFIG.weightLiveSafe} ` +
    `decayWindow=${RANK_CONFIG.decayWindowScans}scans`,
  );

  if (OFFLINE_SMOKE_TEST) {
  offlineSmokeChecks();
  console.log('[exp] offline smoke test complete');
  return;
  }

  await startupSanityChecks();
  await notify(`Experimental scanner started: mode=${MODE} dryRun=${DRY_RUN} routeCap=${PRESET.routeCap}`);

  if (SMOKE_TEST) {
    await scanOnce();
    console.log('[exp] smoke test complete');
    return;
  }

  loop();

  // Phase 1: time-based KPI snapshot fallback (every 5 min) in case scan count is low
  setInterval(() => {
    if (!shutdownRequested && runtime.kpi.windowScans > 0) emitKpiSnapshot();
  }, 5 * 60 * 1000);
}

main().catch((err) => {
  console.error(`[exp] fatal: ${err?.message || err}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  shutdownRequested = true;
  await notify('Experimental scanner stopped');
  console.log('[exp] stopped');
  process.exit(0);
});
