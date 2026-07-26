/**
 * REAL-TIME ARBITRAGE SCANNER — Dedicated Always-On Server
 * 
 * Connects via WebSocket to Arbitrum, reacts to every new block (~250ms).
 * Simulates actual round-trip execution and only trades when VERIFIED profitable.
 * 
 * Run: node scripts/realtime-server.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../supabase/.env.local'), override: true });
const { ethers } = require('ethers');

// ---- Config ----
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || process.env.VITE_ALCHEMY_API_KEY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID;
const CONTRACT_ADDRESS = '0x1aF90750615653db3b800f960aDAA79Ce2A25963';
const MIN_PROFIT_USD = 2; // Lowered for real-time (less competition at speed)
const MAX_GAS_USD = 0.10; // Arbitrum gas is cheap

// ---- Providers ----
const wsUrl = `wss://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const httpUrl = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
let wsProvider;
let httpProvider;

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

// ---- Execution engine ----
async function simulateStep(step, amountIn, provider) {
  const tokenIn = TOKENS[step.tokenIn]?.address;
  const tokenOut = TOKENS[step.tokenOut]?.address;
  if (!tokenIn || !tokenOut) return null;

  try {
    if (step.type === 'v3') {
      const quoter = new ethers.Contract(UNIV3_QUOTER, QUOTER_ABI, provider);
      const out = await quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, step.fee, amountIn, 0);
      return out;
    } else {
      const router = new ethers.Contract(step.router, V2_ROUTER_ABI, provider);
      const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      return amounts[1];
    }
  } catch {
    return null;
  }
}

async function evaluateRoute(route, provider) {
  const loanToken = TOKENS[route.loan];
  const loanAmount = BigInt(route.amount) * (10n ** BigInt(loanToken.decimals));
  
  let currentAmount = loanAmount;
  for (const step of route.steps) {
    currentAmount = await simulateStep(step, currentAmount, provider);
    if (!currentAmount) return { profitable: false, profit: -Infinity };
  }

  const aaveFee = loanAmount * 5n / 10000n; // 0.05%
  const totalCost = loanAmount + aaveFee;
  const netProfit = currentAmount - totalCost;
  
  let profitUSD;
  if (loanToken.decimals === 6) {
    profitUSD = Number(netProfit) / 1e6;
  } else {
    profitUSD = Number(ethers.formatUnits(netProfit, loanToken.decimals));
  }
  profitUSD -= MAX_GAS_USD;

  return { profitable: profitUSD >= MIN_PROFIT_USD, profit: profitUSD, amountOut: currentAmount, loanAmount };
}

// ---- Trade execution ----
async function executeTrade(route, result) {
  // Only 2-hop routes can be executed by our contract
  if (route.steps.length !== 2) return { success: false, error: 'Multi-hop not supported by contract' };

  const wallet = new ethers.Wallet(PRIVATE_KEY, httpProvider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, FLASH_LOAN_ABI, wallet);

  const step1 = route.steps[0];
  const step2 = route.steps[1];
  const loanToken = TOKENS[route.loan];
  const loanTokenAddr = loanToken.address;
  const intermediateToken = TOKENS[step1.tokenOut]?.address;

  const routerA = step1.type === 'v3' ? '0xE592427A0AEce92De3Edee1F18E0157C05861564' : step1.router;
  const routerB = step2.type === 'v3' ? '0xE592427A0AEce92De3Edee1F18E0157C05861564' : step2.router;
  const isV3A = step1.type === 'v3';
  const isV3B = step2.type === 'v3';
  const feeA = step1.fee || 0;
  const feeB = step2.fee || 0;
  
  // 1.5% slippage protection (we already verified profitability via simulation)
  const amountBMin = result.loanAmount * 985n / 1000n;

  try {
    // Estimate gas first (will revert if not profitable on-chain)
    await contract.executeArbitrage.estimateGas(
      loanTokenAddr, result.loanAmount, routerA, routerB, intermediateToken,
      isV3A, isV3B, feeA, feeB, amountBMin,
    );

    const feeData = await httpProvider.getFeeData();
    const tx = await contract.executeArbitrage(
      loanTokenAddr, result.loanAmount, routerA, routerB, intermediateToken,
      isV3A, isV3B, feeA, feeB, amountBMin,
      { gasLimit: 800_000n, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas },
    );

    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
  } catch (err) {
    return { success: false, error: err.message?.slice(0, 150) || 'Unknown error' };
  }
}

// ---- Telegram ----
async function notify(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.log('[TG]', text); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

// ---- Stats ----
let stats = {
  startTime: Date.now(),
  blocksScanned: 0,
  opportunitiesFound: 0,
  tradesExecuted: 0,
  tradesSucceeded: 0,
  totalProfit: 0,
  lastBlock: 0,
  bestProfit: -Infinity,
  bestRoute: '',
};

// ---- Main loop ----
let scanning = false; // Prevent overlapping scans

async function onNewBlock(blockNumber) {
  if (blockNumber <= stats.lastBlock) return; // Deduplicate
  stats.lastBlock = blockNumber;
  
  // Scan every 4th block (~1 second) to avoid rate limits
  if (blockNumber % 4 !== 0) return;
  if (scanning) return; // Skip if previous scan still running
  scanning = true;
  stats.blocksScanned++;

  const routes = getRoutes();
  
  // Evaluate all routes in parallel for speed
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const result = await evaluateRoute(route, httpProvider);
      return { route, result };
    }),
  );

  // Find best opportunity
  let best = null;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { route, result } = r.value;
    
    // Track best overall (even if not profitable)
    if (result.profit > stats.bestProfit) {
      stats.bestProfit = result.profit;
      stats.bestRoute = route.name;
    }

    if (result.profitable && (!best || result.profit > best.result.profit)) {
      best = r.value;
    }
  }

  // Execute if profitable
  if (best) {
    stats.opportunitiesFound++;
    const { route, result } = best;
    
    console.log(`\n🎯 [Block ${blockNumber}] OPPORTUNITY: ${route.name} | Profit: $${result.profit.toFixed(2)}`);
    
    const execResult = await executeTrade(route, result);
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
      console.log(`⚠️ Reverted: ${execResult.error}`);
      // Only notify on first few reverts, then silent
      if (stats.tradesExecuted <= 5) {
        await notify(`⚠️ Trade reverted at block ${blockNumber}: ${execResult.error?.slice(0, 80)}`);
      }
    }
  }

  // Periodic status (every 200 scans ~ every 3-4 minutes)
  if (stats.blocksScanned % 200 === 0) {
    const uptime = ((Date.now() - stats.startTime) / 60000).toFixed(1);
    console.log(
      `[${new Date().toISOString()}] ` +
      `Scans: ${stats.blocksScanned} | ` +
      `Opps: ${stats.opportunitiesFound} | ` +
      `Trades: ${stats.tradesSucceeded}/${stats.tradesExecuted} | ` +
      `Profit: $${stats.totalProfit.toFixed(2)} | ` +
      `Best: ${stats.bestRoute} ($${stats.bestProfit.toFixed(2)}) | ` +
      `Uptime: ${uptime}m`,
    );
  }
  scanning = false;
}

// ---- Connection management ----
function connect() {
  console.log('🔌 Connecting to Arbitrum WebSocket...');
  
  httpProvider = new ethers.JsonRpcProvider(httpUrl);
  
  try {
    wsProvider = new ethers.WebSocketProvider(wsUrl);
  } catch (err) {
    console.error('WebSocket creation failed:', err.message);
    reconnect();
    return;
  }

  wsProvider.on('block', (blockNumber) => {
    onNewBlock(blockNumber).catch(err => {
      console.error(`[Block ${blockNumber}] Error:`, err.message?.slice(0, 100));
      scanning = false;
    });
  });

  wsProvider.on('error', (err) => {
    console.error('WebSocket error:', err.message?.slice(0, 80));
    reconnect();
  });

  // Catch underlying websocket errors to prevent crash
  wsProvider.websocket?.on?.('error', () => {});
  process.on('uncaughtException', (err) => {
    if (err.message?.includes('429') || err.message?.includes('Unexpected server response')) {
      console.error('⚠️ Rate limited, backing off 30s...');
      try { wsProvider?.destroy(); } catch {}
      setTimeout(connect, 30000);
    } else {
      console.error('Uncaught:', err.message?.slice(0, 100));
      reconnect();
    }
  });

  // Detect stale connection
  let lastBlockTime = Date.now();
  const staleCheck = setInterval(() => {
    if (Date.now() - lastBlockTime > 60000) { // 60s stale timeout
      console.log('⚠️ No blocks for 60s, reconnecting...');
      clearInterval(staleCheck);
      reconnect();
    }
  }, 15000);

  wsProvider.on('block', () => { lastBlockTime = Date.now(); });

  console.log('✅ Connected! Scanning every block (~250ms)...');
  console.log(`   Min profit: $${MIN_PROFIT_USD} | Routes: ${getRoutes().length}`);
  console.log(`   Contract: ${CONTRACT_ADDRESS}`);
  console.log('');
}

function reconnect() {
  console.log('🔄 Reconnecting in 10s...');
  try { wsProvider?.destroy(); } catch {}
  setTimeout(connect, 10000);
}

// ---- Startup ----
async function main() {
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('  ⚡ FLASH ARBITRAGE — Real-Time Block Scanner');
  console.log('════════════════════════════════════════════════════');
  console.log('');

  if (!ALCHEMY_KEY) { console.error('❌ Missing ALCHEMY_API_KEY'); process.exit(1); }
  if (!PRIVATE_KEY) { console.error('❌ Missing PRIVATE_KEY'); process.exit(1); }

  // Test connection
  const testProvider = new ethers.JsonRpcProvider(httpUrl);
  const block = await testProvider.getBlockNumber();
  console.log(`📡 Arbitrum block: ${block}`);
  
  // Notify start
  await notify(`🚀 *Real-time scanner started*\nBlock: ${block}\nRoutes: ${getRoutes().length}\nMin profit: $${MIN_PROFIT_USD}`);

  connect();

  // Hourly status to Telegram
  setInterval(async () => {
    const uptime = ((Date.now() - stats.startTime) / 3600000).toFixed(1);
    await notify(
      `📊 *Hourly Status*\n` +
      `Blocks: ${stats.blocksScanned}\n` +
      `Opportunities: ${stats.opportunitiesFound}\n` +
      `Trades: ${stats.tradesSucceeded}/${stats.tradesExecuted}\n` +
      `Profit: $${stats.totalProfit.toFixed(2)}\n` +
      `Best seen: \`${stats.bestRoute}\` ($${stats.bestProfit.toFixed(2)})\n` +
      `Uptime: ${uptime}h`,
    );
  }, 3600000);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await notify('🛑 Scanner stopped');
  process.exit(0);
});
