/**
 * REAL-TIME ARBITRAGE SCANNER — Dedicated Always-On Server
 *
 * Safety-first runtime:
 * 1) Verifies chain context and signer/contract wiring at startup.
 * 2) Enforces RPC call/error budgets with adaptive throttling.
 * 3) Auto-switches to observe-only mode when health/resource gates fail.
 *
 * Run: node scripts/realtime-server.cjs
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../supabase/.env.local'), true);

// ---- Config ----
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.VITE_ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;
const CONTRACT_ADDRESS = '0x1aF90750615653db3b800f960aDAA79Ce2A25963';
const MIN_PROFIT_USD = 2;
const MAX_GAS_USD = 0.10;

const EXPECTED_CHAIN_ID = Number(process.env.SCANNER_CHAIN_ID || 42161);
const EXPECTED_SIGNER_ADDRESS = (process.env.SCANNER_SIGNER_ADDRESS || process.env.AUTO_WALLET_ADDRESS || '').trim();
const BASE_SCAN_BLOCK_MODULO = Math.max(1, Number(process.env.SCANNER_SCAN_BLOCK_MODULO || 4));
const MAX_SCAN_BLOCK_MODULO = Math.max(BASE_SCAN_BLOCK_MODULO, Number(process.env.SCANNER_MAX_SCAN_BLOCK_MODULO || 12));
const RPC_CALL_BUDGET_PER_MIN = Math.max(50, Number(process.env.SCANNER_RPC_CALL_BUDGET_PER_MIN || 2200));
const RPC_ERROR_BUDGET_PER_MIN = Math.max(5, Number(process.env.SCANNER_RPC_ERROR_BUDGET_PER_MIN || 120));
const RPC_COOLDOWN_BASE_MS = Math.max(5000, Number(process.env.SCANNER_RPC_COOLDOWN_MS || 15000));
const TELEMETRY_INTERVAL_MS = Math.max(10000, Number(process.env.SCANNER_TELEMETRY_INTERVAL_MS || 60000));
const QUOTE_RATE_LIMIT_PER_SEC = Math.min(20, Math.max(1, Number(process.env.EXEC_QUOTE_RATE_LIMIT_PER_SEC || 20)));
const QUOTE_BURST_LIMIT = Math.min(40, Math.max(1, Number(process.env.EXEC_QUOTE_BURST_LIMIT || 40)));
const EXEC_MAX_QUOTE_AGE_MS = Math.min(45000, Math.max(1000, Number(process.env.EXEC_MAX_QUOTE_AGE_MS || 45000)));
const EXEC_MIN_CONFIDENCE_SCORE = Math.max(60, Math.min(100, Number(process.env.EXEC_MIN_CONFIDENCE_SCORE || 60)));
const EXEC_MAX_GAS_TO_NET_RATIO = Math.min(0.35, Math.max(0.01, Number(process.env.EXEC_MAX_GAS_TO_NET_RATIO || 0.35)));
const EXEC_AMOUNT_B_MIN_RATIO = 0.90;
const EXEC_AMOUNT_B_MAX_RATIO = 0.995;
const EXEC_DEFAULT_SLIPPAGE_RATIO = Math.min(EXEC_AMOUNT_B_MAX_RATIO, Math.max(EXEC_AMOUNT_B_MIN_RATIO, Number(process.env.EXEC_AMOUNT_B_SLIPPAGE_RATIO || 0.985)));

// ---- Providers ----
const wsUrl = `wss://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY || ''}`;
const httpUrl = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY || ''}`;
let wsProvider;
let httpProvider;
let tradeWallet;
let reconnectTimer = null;
let staleCheckTimer = null;
let telemetryTimer = null;
let hourlyStatusTimer = null;
let connecting = false;
let shuttingDown = false;

// ---- Tokens ----
const TOKENS = {
  WETH:  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  USDC:  { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  USDCe: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
  USDT:  { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  ARB:   { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
};

// ---- DEX Contracts ----
const UNIV3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const SUSHI_ROUTER = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const CAMELOT_ROUTER = '0xc873fEcbd354f5A56E00E710B90EF4201db2448d';
const UNISWAP_V3_SWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const UNISWAP_V2_ROUTER = (process.env.UNISWAP_V2_ROUTER || '').trim();

const ALLOWED_EXECUTION_V2_ROUTERS = new Set([SUSHI_ROUTER, UNISWAP_V2_ROUTER].filter(Boolean).map((x) => x.toLowerCase()));

const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];
const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];
const FLASH_LOAN_ABI = [
  'function executeArbitrage(address asset, uint256 amount, address routerA, address routerB, address tokenB, bool routerAisV3, bool routerBisV3, uint24 feeA, uint24 feeB, uint256 amountBMin) external',
];

// ---- Route definitions ----
// Pre-computed routes for speed (no dynamic generation during hot path)
function getRoutes() {
  return [
    // Cross-fee-tier (closest to profitable based on testing)
    { name: 'WETH/USDC fee500→fee3000', loan: 'USDC', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 3000 },
    ]},
    { name: 'WETH/USDC fee3000→fee500', loan: 'USDC', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 500 },
    ]},
    { name: 'WETH/USDC fee500→fee3000 $5k', loan: 'USDC', amount: 5000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 3000 },
    ]},
    { name: 'WETH/USDC fee3000→fee500 $5k', loan: 'USDC', amount: 5000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 500 },
    ]},
    // USDCe cross-fee
    { name: 'WETH/USDCe fee500→fee3000', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 3000 },
    ]},
    { name: 'WETH/USDCe fee3000→fee500', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 3000 },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ]},
    // Cross-DEX (Sushi/Camelot vs UniV3)
    { name: 'Buy WETH Sushi→Sell UniV3-500 (USDCe)', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ]},
    { name: 'Buy WETH UniV3-500→Sell Sushi (USDCe)', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'WETH', tokenOut: 'USDCe' },
    ]},
    { name: 'Buy WETH Camelot→Sell UniV3-500 (USDCe)', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ]},
    { name: 'Buy WETH UniV3-500→Sell Camelot (USDCe)', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'WETH', tokenOut: 'USDCe' },
    ]},
    // Larger sizes for cross-DEX
    { name: 'Buy WETH Sushi→Sell UniV3-500 $5k', loan: 'USDCe', amount: 5000, steps: [
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ]},
    { name: 'Buy WETH Camelot→Sell UniV3-500 $5k', loan: 'USDCe', amount: 5000, steps: [
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'USDCe', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDCe', fee: 500 },
    ]},
    // ARB routes
    { name: 'ARB/USDC Sushi→UniV3-3000', loan: 'USDC', amount: 1000, steps: [
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'USDC', tokenOut: 'ARB' },
      { type: 'v3', tokenIn: 'ARB', tokenOut: 'USDC', fee: 3000 },
    ]},
    { name: 'ARB/USDC UniV3-3000→Sushi', loan: 'USDC', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'ARB', fee: 3000 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'ARB', tokenOut: 'USDC' },
    ]},
    // Triangular: USDC → WETH → ARB → USDC
    { name: '△ USDC→WETH(V3-500)→ARB(Sushi)→USDC(V3-3000)', loan: 'USDC', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'WETH', tokenOut: 'ARB' },
      { type: 'v3', tokenIn: 'ARB', tokenOut: 'USDC', fee: 3000 },
    ]},
    { name: '△ USDC→ARB(V3-3000)→WETH(Sushi)→USDC(V3-500)', loan: 'USDC', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDC', tokenOut: 'ARB', fee: 3000 },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'ARB', tokenOut: 'WETH' },
      { type: 'v3', tokenIn: 'WETH', tokenOut: 'USDC', fee: 500 },
    ]},
    // USDCe triangular
    { name: '△ USDCe→WETH(V3-500)→ARB(Camelot)→USDCe(Sushi)', loan: 'USDCe', amount: 1000, steps: [
      { type: 'v3', tokenIn: 'USDCe', tokenOut: 'WETH', fee: 500 },
      { type: 'v2', router: CAMELOT_ROUTER, tokenIn: 'WETH', tokenOut: 'ARB' },
      { type: 'v2', router: SUSHI_ROUTER, tokenIn: 'ARB', tokenOut: 'USDCe' },
    ]},
  ];
}

// ---- Runtime state ----
const runtime = {
  observeOnly: false,
  observeReason: '',
  scanning: false,
  lastBlockAt: 0,
  scanBlockModulo: BASE_SCAN_BLOCK_MODULO,
  cooldownUntil: 0,
  cooldownReason: '',
  rpcWindowStart: Date.now(),
  rpcCallsThisWindow: 0,
  rpcErrorsThisWindow: 0,
  consecutiveRpcErrors: 0,
  quoteTokens: QUOTE_BURST_LIMIT,
  quoteTokenLastRefill: Date.now(),
};

let stats = {
  startTime: Date.now(),
  blocksScanned: 0,
  opportunitiesFound: 0,
  tradesExecuted: 0,
  tradesSucceeded: 0,
  tradeReverts: 0,
  totalProfit: 0,
  lastBlock: 0,
  bestProfit: -Infinity,
  bestRoute: '',
  reconnects: 0,
  skippedOverlap: 0,
  skippedCooldown: 0,
  skippedObserveOnly: 0,
  skippedBudget: 0,
  healthFailures: 0,
  modeSwitches: 0,
  scanErrors: 0,
  rpcCalls: 0,
  rpcErrors: 0,
  quoteRateLimited: 0,
  skippedExecPolicy: 0,
};

function now() {
  return Date.now();
}

function isCooldownActive() {
  return runtime.cooldownUntil > now();
}

function normalizeAddress(value) {
  if (!value) return '';
  return ethers.getAddress(value);
}

function setObserveOnly(reason) {
  const nextReason = reason || 'unspecified';
  if (!runtime.observeOnly || runtime.observeReason !== nextReason) {
    runtime.observeOnly = true;
    runtime.observeReason = nextReason;
    stats.modeSwitches++;
    console.warn(`🛡️ Entered OBSERVE-ONLY mode: ${nextReason}`);
    void notify(`🛡️ *Observe-only mode*\nReason: ${nextReason}`);
  }
}

function setCooldown(ms, reason) {
  const until = now() + ms;
  if (until > runtime.cooldownUntil) {
    runtime.cooldownUntil = until;
    runtime.cooldownReason = reason;
    console.warn(`⏸️ Cooldown ${Math.ceil(ms / 1000)}s: ${reason}`);
  }
  if (runtime.scanBlockModulo < MAX_SCAN_BLOCK_MODULO) {
    runtime.scanBlockModulo = Math.min(MAX_SCAN_BLOCK_MODULO, runtime.scanBlockModulo + 1);
  }
}

function maybeRelaxThrottle() {
  if (isCooldownActive()) return;
  if (runtime.scanBlockModulo > BASE_SCAN_BLOCK_MODULO) {
    runtime.scanBlockModulo -= 1;
  }
}

function resetRpcWindowIfNeeded() {
  const elapsed = now() - runtime.rpcWindowStart;
  if (elapsed >= 60000) {
    runtime.rpcWindowStart = now();
    runtime.rpcCallsThisWindow = 0;
    runtime.rpcErrorsThisWindow = 0;
    runtime.consecutiveRpcErrors = 0;
    maybeRelaxThrottle();
  }
}

function classifyRpcError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate')) return 'rate_limit';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout';
  if (msg.includes('network') || msg.includes('socket') || msg.includes('econn')) return 'network';
  return 'rpc';
}

function consumeQuoteToken() {
  const ts = now();
  const elapsedSeconds = (ts - runtime.quoteTokenLastRefill) / 1000;
  if (elapsedSeconds > 0) {
    runtime.quoteTokens = Math.min(QUOTE_BURST_LIMIT, runtime.quoteTokens + elapsedSeconds * QUOTE_RATE_LIMIT_PER_SEC);
    runtime.quoteTokenLastRefill = ts;
  }
  if (runtime.quoteTokens < 1) return false;
  runtime.quoteTokens -= 1;
  return true;
}

async function rpcCall(label, fn, options = {}) {
  resetRpcWindowIfNeeded();
  const critical = options.critical === true;
  const kind = options.kind || 'rpc';

  if (kind === 'quote' && !consumeQuoteToken()) {
    stats.quoteRateLimited++;
    setCooldown(RPC_COOLDOWN_BASE_MS, 'quote rate limit exceeded');
    const quoteRateErr = new Error(`Quote rate limit exceeded for ${label}`);
    if (critical) throw quoteRateErr;
    return null;
  }

  if (runtime.rpcCallsThisWindow >= RPC_CALL_BUDGET_PER_MIN) {
    stats.skippedBudget++;
    setCooldown(RPC_COOLDOWN_BASE_MS, `RPC budget exceeded (${runtime.rpcCallsThisWindow}/${RPC_CALL_BUDGET_PER_MIN})`);
    setObserveOnly('resource budget exceeded');
    const budgetErr = new Error(`RPC budget exceeded for ${label}`);
    if (critical) throw budgetErr;
    return null;
  }

  runtime.rpcCallsThisWindow += 1;
  stats.rpcCalls += 1;

  try {
    const result = await fn();
    runtime.consecutiveRpcErrors = 0;
    return result;
  } catch (err) {
    runtime.rpcErrorsThisWindow += 1;
    runtime.consecutiveRpcErrors += 1;
    stats.rpcErrors += 1;
    const category = classifyRpcError(err);

    if (category === 'rate_limit' || category === 'timeout' || runtime.consecutiveRpcErrors >= 5) {
      const factor = Math.min(runtime.consecutiveRpcErrors, 6);
      setCooldown(RPC_COOLDOWN_BASE_MS * factor, `RPC instability (${category})`);
    }

    if (runtime.rpcErrorsThisWindow >= RPC_ERROR_BUDGET_PER_MIN) {
      setObserveOnly(`RPC error budget exceeded (${runtime.rpcErrorsThisWindow}/${RPC_ERROR_BUDGET_PER_MIN})`);
    }

    if (critical) throw err;
    return null;
  }
}

function getTelemetrySnapshot() {
  resetRpcWindowIfNeeded();
  const uptimeMinutes = Math.max((now() - stats.startTime) / 60000, 1 / 60);
  const scanRate = stats.blocksScanned / uptimeMinutes;
  const rpcErrorRate = stats.rpcCalls > 0 ? (stats.rpcErrors / stats.rpcCalls) * 100 : 0;
  const cooldownRemaining = isCooldownActive() ? Math.ceil((runtime.cooldownUntil - now()) / 1000) : 0;
  const bestEdge = Number.isFinite(stats.bestProfit)
    ? `${stats.bestRoute || 'n/a'} ($${stats.bestProfit.toFixed(2)})`
    : 'n/a';

  return {
    scanRate,
    bestEdge,
    rpcErrorRate,
    cooldownRemaining,
    cooldownReason: runtime.cooldownReason || 'none',
  };
}

function logTelemetry(prefix = 'Runtime') {
  const snap = getTelemetrySnapshot();
  const mode = runtime.observeOnly ? `OBSERVE-ONLY(${runtime.observeReason})` : 'ACTIVE';
  const cooldown = snap.cooldownRemaining > 0
    ? `${snap.cooldownRemaining}s (${snap.cooldownReason})`
    : 'none';

  console.log(
    `[${new Date().toISOString()}] ${prefix} | ` +
    `mode=${mode} | scanRate=${snap.scanRate.toFixed(2)}/min | ` +
    `bestEdge=${snap.bestEdge} | reverts=${stats.tradeReverts} | ` +
    `rpcErr=${snap.rpcErrorRate.toFixed(2)}% (${stats.rpcErrors}/${stats.rpcCalls}) | quoteRL=${stats.quoteRateLimited} | ` +
    `cooldown=${cooldown} | scanModulo=${runtime.scanBlockModulo}`,
  );
}

// ---- Execution engine ----
async function simulateStep(step, amountIn, provider) {
  const tokenIn = TOKENS[step.tokenIn]?.address;
  const tokenOut = TOKENS[step.tokenOut]?.address;
  if (!tokenIn || !tokenOut) return null;

  if (step.type === 'v3') {
    const quoter = new ethers.Contract(UNIV3_QUOTER, QUOTER_ABI, provider);
    return rpcCall(
      `quote:${step.tokenIn}-${step.tokenOut}-${step.fee}`,
      () => quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, step.fee, amountIn, 0),
      { kind: 'quote' },
    );
  }

  const router = new ethers.Contract(step.router, V2_ROUTER_ABI, provider);
  const amounts = await rpcCall(
    `amountsOut:${step.tokenIn}-${step.tokenOut}`,
    () => router.getAmountsOut(amountIn, [tokenIn, tokenOut]),
    { kind: 'quote' },
  );
  return amounts ? amounts[1] : null;
}

function isAllowedExecutionRoute(route) {
  if (!route || route.steps.length !== 2) return { ok: false, reason: 'contract supports only 2-hop execution' };
  for (const step of route.steps) {
    if (step.type !== 'v2' && step.type !== 'v3') {
      return { ok: false, reason: `unsupported step type ${step.type}` };
    }
    if (step.type === 'v2' && (!step.router || !ALLOWED_EXECUTION_V2_ROUTERS.has(step.router.toLowerCase()))) {
      return { ok: false, reason: `v2 router not allowlisted (${step.router || 'missing'})` };
    }
  }
  return { ok: true, reason: '' };
}

function buildExecutionPolicy(route, result) {
  const quoteAgeMs = now() - Number(result.quoteTimestamp || 0);
  const expectedBuyTokenAmount = result?.stepOutputs?.[0];
  let confidenceScore = 100;
  if (isCooldownActive()) confidenceScore -= 25;
  if (runtime.consecutiveRpcErrors > 0) confidenceScore -= Math.min(25, runtime.consecutiveRpcErrors * 5);
  if (result.profit < MIN_PROFIT_USD * 2) confidenceScore -= 20;
  if (result.profit < MIN_PROFIT_USD * 3) confidenceScore -= 10;
  if (quoteAgeMs > EXEC_MAX_QUOTE_AGE_MS / 2) confidenceScore -= 10;
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  const amountBMin = expectedBuyTokenAmount
    ? (expectedBuyTokenAmount * BigInt(Math.floor(EXEC_DEFAULT_SLIPPAGE_RATIO * 10000))) / 10000n
    : 0n;

  const amountBMinRatio = expectedBuyTokenAmount && expectedBuyTokenAmount > 0n
    ? Number((amountBMin * 10000n) / expectedBuyTokenAmount) / 10000
    : 0;
  const gasToNetRatio = result.profit > 0 ? MAX_GAS_USD / result.profit : Infinity;

  const reasons = [];
  const routePolicy = isAllowedExecutionRoute(route);
  if (!routePolicy.ok) reasons.push(routePolicy.reason);
  if (quoteAgeMs > EXEC_MAX_QUOTE_AGE_MS) reasons.push(`quote age ${quoteAgeMs}ms exceeds ${EXEC_MAX_QUOTE_AGE_MS}ms`);
  if (confidenceScore < EXEC_MIN_CONFIDENCE_SCORE) reasons.push(`confidence ${confidenceScore} < ${EXEC_MIN_CONFIDENCE_SCORE}`);
  if (gasToNetRatio > EXEC_MAX_GAS_TO_NET_RATIO) reasons.push(`gas/net ${gasToNetRatio.toFixed(3)} > ${EXEC_MAX_GAS_TO_NET_RATIO}`);
  if (!expectedBuyTokenAmount || expectedBuyTokenAmount <= 0n) reasons.push('missing expected buy-token quote amount');
  if (amountBMinRatio < EXEC_AMOUNT_B_MIN_RATIO || amountBMinRatio > EXEC_AMOUNT_B_MAX_RATIO) {
    reasons.push(`amountBMin ratio ${amountBMinRatio.toFixed(3)} outside [${EXEC_AMOUNT_B_MIN_RATIO}, ${EXEC_AMOUNT_B_MAX_RATIO}]`);
  }

  return {
    allow: reasons.length === 0,
    reasons,
    amountBMin,
    confidenceScore,
    quoteAgeMs,
    gasToNetRatio,
    expectedBuyTokenAmount,
    amountBMinRatio,
  };
}

async function evaluateRoute(route, provider) {
  const loanToken = TOKENS[route.loan];
  const loanAmount = BigInt(route.amount) * (10n ** BigInt(loanToken.decimals));
  const quoteTimestamp = now();
  const stepOutputs = [];

  let currentAmount = loanAmount;
  for (const step of route.steps) {
    currentAmount = await simulateStep(step, currentAmount, provider);
    if (!currentAmount) return { profitable: false, profit: -Infinity };
    stepOutputs.push(currentAmount);
  }

  const aaveFee = loanAmount * 5n / 10000n;
  const totalCost = loanAmount + aaveFee;
  const netProfit = currentAmount - totalCost;

  let profitUSD;
  if (loanToken.decimals === 6) {
    profitUSD = Number(netProfit) / 1e6;
  } else {
    profitUSD = Number(ethers.formatUnits(netProfit, loanToken.decimals));
  }
  profitUSD -= MAX_GAS_USD;

  return {
    profitable: profitUSD >= MIN_PROFIT_USD,
    profit: profitUSD,
    amountOut: currentAmount,
    loanAmount,
    quoteTimestamp,
    stepOutputs,
  };
}

// ---- Trade execution ----
async function executeTrade(route, result) {
  if (runtime.observeOnly) {
    stats.skippedObserveOnly++;
    return { success: false, skipped: true, error: `observe-only: ${runtime.observeReason}` };
  }
  if (!tradeWallet) {
    stats.skippedObserveOnly++;
    return { success: false, skipped: true, error: 'trading wallet not configured' };
  }
  const policy = buildExecutionPolicy(route, result);
  if (!policy.allow) {
    stats.skippedExecPolicy++;
    return {
      success: false,
      skipped: true,
      error: `execution policy blocked: ${policy.reasons.join('; ')}`,
      policy,
    };
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, FLASH_LOAN_ABI, tradeWallet);
  const step1 = route.steps[0];
  const step2 = route.steps[1];
  const loanToken = TOKENS[route.loan];
  const loanTokenAddr = loanToken.address;
  const intermediateToken = TOKENS[step1.tokenOut]?.address;
  const routerA = step1.type === 'v3' ? UNISWAP_V3_SWAP_ROUTER : step1.router;
  const routerB = step2.type === 'v3' ? UNISWAP_V3_SWAP_ROUTER : step2.router;
  const isV3A = step1.type === 'v3';
  const isV3B = step2.type === 'v3';
  const feeA = step1.fee || 0;
  const feeB = step2.fee || 0;
  const amountBMin = policy.amountBMin;

  try {
    const gasEstimate = await rpcCall(
      'trade:estimateGas',
      () => contract.executeArbitrage.estimateGas(
        loanTokenAddr, result.loanAmount, routerA, routerB, intermediateToken,
        isV3A, isV3B, feeA, feeB, amountBMin,
      ),
      { critical: true },
    );

    const feeData = await rpcCall('provider:getFeeData', () => httpProvider.getFeeData(), { critical: true });
    const tx = await rpcCall(
      'trade:executeArbitrage',
      () => contract.executeArbitrage(
        loanTokenAddr, result.loanAmount, routerA, routerB, intermediateToken,
        isV3A, isV3B, feeA, feeB, amountBMin,
        {
          gasLimit: gasEstimate ? (gasEstimate * 12n / 10n) : 800_000n,
          maxFeePerGas: feeData?.maxFeePerGas,
          maxPriorityFeePerGas: feeData?.maxPriorityFeePerGas,
        },
      ),
      { critical: true },
    );

    const receipt = await rpcCall('trade:waitReceipt', () => tx.wait(), { critical: true });
    return { success: true, txHash: receipt.hash, gasUsed: receipt.gasUsed.toString(), policy };
  } catch (err) {
    const error = String(err?.message || err || 'Unknown error').slice(0, 160);
    return { success: false, error, policy };
  }
}

// ---- Telegram ----
async function notify(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[TG]', text);
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('Telegram notify failed:', String(err?.message || err).slice(0, 120));
  }
}

// ---- Main loop ----
async function onNewBlock(blockNumber) {
  runtime.lastBlockAt = now();
  if (blockNumber <= stats.lastBlock) return;
  stats.lastBlock = blockNumber;

  if (blockNumber % runtime.scanBlockModulo !== 0) return;
  if (isCooldownActive()) {
    stats.skippedCooldown++;
    return;
  }
  if (runtime.scanning) {
    stats.skippedOverlap++;
    return;
  }

  runtime.scanning = true;
  stats.blocksScanned++;

  try {
    const routes = getRoutes();
    const results = await Promise.allSettled(
      routes.map(async (route) => {
        const result = await evaluateRoute(route, httpProvider);
        return { route, result };
      }),
    );

    let best = null;
    for (const settled of results) {
      if (settled.status !== 'fulfilled') {
        stats.scanErrors++;
        continue;
      }
      const { route, result } = settled.value;
      if (result.profit > stats.bestProfit) {
        stats.bestProfit = result.profit;
        stats.bestRoute = route.name;
      }
      if (result.profitable && (!best || result.profit > best.result.profit)) {
        best = settled.value;
      }
    }

    if (best) {
      stats.opportunitiesFound++;
      const { route, result } = best;
      console.log(`\n🎯 [Block ${blockNumber}] OPPORTUNITY: ${route.name} | Profit: $${result.profit.toFixed(2)}`);

      const execResult = await executeTrade(route, result);
      if (execResult.skipped) {
        console.log(`🛡️ Skipped execution: ${execResult.error}`);
      } else {
        stats.tradesExecuted++;
        if (execResult.success) {
          stats.tradesSucceeded++;
          stats.totalProfit += result.profit;
          console.log(`✅ EXECUTED! Tx: ${execResult.txHash} | Profit: $${result.profit.toFixed(2)}`);
          await notify(
            `✅ *TRADE EXECUTED*\n\n` +
            `Route: \`${route.name}\`\n` +
            `💰 Profit: *$${result.profit.toFixed(2)}*\n` +
            `🔗 Tx: \`${execResult.txHash}\`\n` +
            `Block: ${blockNumber}`,
          );
        } else {
          stats.tradeReverts++;
          console.log(`⚠️ Reverted: ${execResult.error}`);
          if (stats.tradesExecuted <= 5) {
            await notify(`⚠️ Trade reverted at block ${blockNumber}: ${execResult.error?.slice(0, 80)}`);
          }
        }
      }
    }

    if (runtime.rpcCallsThisWindow > RPC_CALL_BUDGET_PER_MIN * 0.85) {
      setCooldown(RPC_COOLDOWN_BASE_MS, 'high RPC utilization');
    }
  } finally {
    runtime.scanning = false;
  }
}

// ---- Connection management ----
function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (staleCheckTimer) {
    clearInterval(staleCheckTimer);
    staleCheckTimer = null;
  }
}

function destroyWsProvider() {
  if (!wsProvider) return;
  try {
    wsProvider.removeAllListeners();
    wsProvider.destroy();
  } catch (err) {
    console.error('WebSocket destroy failed:', String(err?.message || err).slice(0, 80));
  } finally {
    wsProvider = undefined;
  }
}

function scheduleReconnect(reason, delayMs) {
  if (shuttingDown || reconnectTimer) return;
  stats.reconnects++;
  const delay = Math.max(1000, delayMs);
  console.warn(`🔄 Reconnecting in ${Math.ceil(delay / 1000)}s (${reason})...`);
  clearTimers();
  destroyWsProvider();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

async function connect() {
  if (connecting || shuttingDown) return;
  connecting = true;
  clearTimers();
  destroyWsProvider();

  console.log('🔌 Connecting to Arbitrum WebSocket...');
  try {
    wsProvider = new ethers.WebSocketProvider(wsUrl);
  } catch (err) {
    connecting = false;
    scheduleReconnect(`websocket creation failed: ${String(err?.message || err).slice(0, 80)}`, 10000);
    return;
  }

  wsProvider.on('block', (blockNumber) => {
    onNewBlock(blockNumber).catch((err) => {
      stats.scanErrors++;
      runtime.scanning = false;
      console.error(`[Block ${blockNumber}] Scan error:`, String(err?.message || err).slice(0, 120));
    });
  });

  wsProvider.on('error', (err) => {
    const message = String(err?.message || err).slice(0, 140);
    console.error('WebSocket error:', message);
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('rate')) {
      setCooldown(RPC_COOLDOWN_BASE_MS * 2, 'websocket rate-limit');
      scheduleReconnect('websocket rate-limited', 30000);
      return;
    }
    scheduleReconnect('websocket error', 10000);
  });

  wsProvider.websocket?.on?.('close', () => {
    scheduleReconnect('websocket closed', 10000);
  });
  wsProvider.websocket?.on?.('error', () => {
    scheduleReconnect('websocket transport error', 10000);
  });

  runtime.lastBlockAt = now();
  staleCheckTimer = setInterval(() => {
    if (shuttingDown) return;
    if (now() - runtime.lastBlockAt > 60000) {
      setCooldown(RPC_COOLDOWN_BASE_MS, 'stale websocket stream');
      scheduleReconnect('no blocks for 60s', 5000);
    }
  }, 15000);

  connecting = false;
  console.log('✅ Connected.');
}

// ---- Startup verification ----
async function verifyStartupContext() {
  if (!ALCHEMY_KEY) {
    throw new Error('Missing ALCHEMY_API_KEY (or VITE_ALCHEMY_API_KEY)');
  }

  httpProvider = new ethers.JsonRpcProvider(httpUrl);

  const network = await rpcCall('startup:getNetwork', () => httpProvider.getNetwork(), { critical: true });
  const chainId = Number(network.chainId);
  if (chainId !== EXPECTED_CHAIN_ID) {
    stats.healthFailures++;
    setObserveOnly(`chain mismatch expected=${EXPECTED_CHAIN_ID} got=${chainId}`);
  }

  const contractCode = await rpcCall('startup:getCode', () => httpProvider.getCode(CONTRACT_ADDRESS), { critical: true });
  if (!contractCode || contractCode === '0x') {
    stats.healthFailures++;
    setObserveOnly(`no contract code at ${CONTRACT_ADDRESS}`);
  }

  if (!PRIVATE_KEY) {
    stats.healthFailures++;
    setObserveOnly('PRIVATE_KEY missing');
    return { chainId };
  }

  try {
    tradeWallet = new ethers.Wallet(PRIVATE_KEY, httpProvider);
  } catch (err) {
    stats.healthFailures++;
    setObserveOnly(`invalid PRIVATE_KEY: ${String(err?.message || err).slice(0, 100)}`);
    return { chainId };
  }

  const signerAddress = normalizeAddress(tradeWallet.address);
  if (EXPECTED_SIGNER_ADDRESS) {
    const expected = normalizeAddress(EXPECTED_SIGNER_ADDRESS);
    if (expected !== signerAddress) {
      stats.healthFailures++;
      setObserveOnly(`signer mismatch expected=${expected} got=${signerAddress}`);
    }
  }

  const block = await rpcCall('startup:getBlockNumber', () => httpProvider.getBlockNumber(), { critical: true });
  return { block, chainId, signerAddress };
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Shutting down (${reason})...`);
  clearTimers();
  if (telemetryTimer) clearInterval(telemetryTimer);
  if (hourlyStatusTimer) clearInterval(hourlyStatusTimer);
  destroyWsProvider();
  await notify('🛑 Scanner stopped');
  process.exit(0);
}

// ---- Startup ----
async function main() {
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('  ⚡ FLASH ARBITRAGE — Real-Time Block Scanner');
  console.log('════════════════════════════════════════════════════');
  console.log('');

  const startup = await verifyStartupContext();
  console.log(`📡 Chain: ${startup.chainId} | Block: ${startup.block ?? 'n/a'}`);
  console.log(`🧠 Routes: ${getRoutes().length} | Min profit: $${MIN_PROFIT_USD.toFixed(2)} | Contract: ${CONTRACT_ADDRESS}`);
  if (startup.signerAddress) {
    console.log(`🔐 Signer: ${startup.signerAddress}`);
  }
  if (runtime.observeOnly) {
    console.log(`🛡️ Starting in OBSERVE-ONLY mode: ${runtime.observeReason}`);
  }
  console.log('');

  await notify(
    `🚀 *Real-time scanner started*\n` +
    `Chain: ${startup.chainId}\n` +
    `Block: ${startup.block ?? 'n/a'}\n` +
    `Routes: ${getRoutes().length}\n` +
    `Mode: ${runtime.observeOnly ? `observe-only (${runtime.observeReason})` : 'active execution'}\n` +
    `Min profit: $${MIN_PROFIT_USD}`,
  );

  await connect();
  telemetryTimer = setInterval(() => logTelemetry('Runtime'), TELEMETRY_INTERVAL_MS);
  hourlyStatusTimer = setInterval(async () => {
    const snap = getTelemetrySnapshot();
    const uptime = ((now() - stats.startTime) / 3600000).toFixed(1);
    await notify(
      `📊 *Hourly Status*\n` +
      `Mode: ${runtime.observeOnly ? `observe-only (${runtime.observeReason})` : 'active'}\n` +
      `Scans: ${stats.blocksScanned}\n` +
      `Scan rate: ${snap.scanRate.toFixed(2)}/min\n` +
      `Opportunities: ${stats.opportunitiesFound}\n` +
      `Trades: ${stats.tradesSucceeded}/${stats.tradesExecuted}\n` +
      `Reverts: ${stats.tradeReverts}\n` +
      `RPC error rate: ${snap.rpcErrorRate.toFixed(2)}%\n` +
      `Best edge: \`${snap.bestEdge}\`\n` +
      `Profit: $${stats.totalProfit.toFixed(2)}\n` +
      `Uptime: ${uptime}h`,
    );
  }, 3600000);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('uncaughtException', (err) => {
  const message = String(err?.message || err).slice(0, 160);
  console.error('Uncaught exception:', message);
  const lower = message.toLowerCase();
  if (lower.includes('429') || lower.includes('rate') || lower.includes('socket')) {
    setCooldown(RPC_COOLDOWN_BASE_MS * 2, 'uncaught transport/rate exception');
    scheduleReconnect('uncaught websocket/rate exception', 30000);
    return;
  }
  setObserveOnly(`uncaught exception: ${message}`);
});
process.on('unhandledRejection', (reason) => {
  const message = String(reason?.message || reason || '').slice(0, 160);
  console.error('Unhandled rejection:', message);
  setObserveOnly(`unhandled rejection: ${message || 'unknown'}`);
});

main().catch((err) => {
  console.error('Fatal startup error:', String(err?.message || err));
  process.exit(1);
});
