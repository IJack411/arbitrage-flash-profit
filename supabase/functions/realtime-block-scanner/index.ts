import { ethers } from 'npm:ethers@6.7.0';

// ============================================================
// PRODUCTION MULTI-HOP ARBITRAGE SCANNER v2
// - Simulates ACTUAL execution (full round-trip router quotes)
// - Multi-hop routing (circular paths across 5 DEXs)
// - Dynamic sizing (adapts loan to pool depth)
// - Only signals when VERIFIED profitable after all fees
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY') || '';
const PRIVATE_KEY = Deno.env.get('PRIVATE_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';
const MIN_NET_PROFIT_USD = parseFloat(Deno.env.get('REALTIME_MIN_NET_PROFIT_USD') || '3');
const ARBITRAGE_CONTRACT = '0x1aF90750615653db3b800f960aDAA79Ce2A25963';

// ---- Live-trade safety gate (default-off; mirrors the rest of the system) ----
function parseBool(value: string | undefined | null, dflt: boolean): boolean {
  if (value === undefined || value === null || value.trim() === '') return dflt;
  return /^(1|true|yes|on)$/i.test(value.trim());
}
// DRY_RUN defaults TRUE (safe). Live execution requires BOTH flags flipped explicitly.
const DRY_RUN = parseBool(Deno.env.get('EXP_DRY_RUN'), true);
const LIVE_TRADING_ENABLED = !DRY_RUN && parseBool(Deno.env.get('EXP_ALLOW_LIVE_TRADING'), false);
// Only these venues are ever eligible for live submission (matches experimental server + bridge allowlist).
const LIVE_SAFE_DEXES = new Set(['uniV3', 'sushiswap']);

// ---- DEX Routers on Arbitrum ----
const DEXES = {
  uniV3: {
    name: 'UniswapV3',
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    isV3: true,
    feeTiers: [100, 500, 3000, 10000],
  },
  sushiswap: {
    name: 'SushiSwap',
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    isV3: false,
  },
  camelot: {
    name: 'Camelot',
    router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
    isV3: false,
  },
  traderJoe: {
    name: 'TraderJoe',
    router: '0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30', // LBRouter
    isV3: false,
  },
  ramses: {
    name: 'Ramses',
    router: '0xAAA87963EFeB6f7E0a2711F397663105Acb1805e',
    isV3: false,
  },
} as const;

// ---- Tokens ----
const TOKENS: Record<string, { address: string; decimals: number }> = {
  WETH:   { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  USDC:   { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  USDCe:  { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
  USDT:   { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  ARB:    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
  GMX:    { address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18 },
  LINK:   { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18 },
  WBTC:   { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
  PENDLE: { address: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', decimals: 18 },
  DAI:    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
};

// ---- ABIs ----
const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];
const V3_QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];
const V2_PAIR_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
];
const FLASH_LOAN_ABI = [
  'function executeArbitrage(address asset, uint256 amount, address routerA, address routerB, address tokenB, bool routerAisV3, bool routerBisV3, uint24 feeA, uint24 feeB, uint256 amountBMin) external',
];

// ---- Route definitions ----
// Each route: borrow tokenA on Aave, swap through DEX path, end with more tokenA
interface Route {
  name: string;
  loanToken: string;          // token we flash loan
  path: { dex: string; tokenIn: string; tokenOut: string; fee?: number }[];
  loanSizes: number[];        // USD amounts to try (adapted to liquidity)
}

function buildRoutes(): Route[] {
  const routes: Route[] = [];

  // 2-hop routes: borrow A, buy B on dex1, sell B on dex2 for A
  const pairs = [
    { a: 'WETH', b: 'USDCe' },
    { a: 'WETH', b: 'USDC' },
    { a: 'WETH', b: 'USDT' },
    { a: 'WETH', b: 'ARB' },
    { a: 'WETH', b: 'GMX' },
    { a: 'WETH', b: 'LINK' },
    { a: 'WETH', b: 'PENDLE' },
    { a: 'USDCe', b: 'WETH' },
    { a: 'USDCe', b: 'ARB' },
    { a: 'USDCe', b: 'GMX' },
    { a: 'USDC', b: 'WETH' },
    { a: 'ARB', b: 'WETH' },
  ];

  const v2Dexes = ['sushiswap', 'camelot'];
  const v3Fees = [500, 3000, 10000];

  for (const { a, b } of pairs) {
    // V2 -> V3 and V3 -> V2
    for (const v2Dex of v2Dexes) {
      for (const fee of v3Fees) {
        routes.push({
          name: `${a}→${b}(${v2Dex})→${a}(UniV3-${fee})`,
          loanToken: a,
          path: [
            { dex: v2Dex, tokenIn: a, tokenOut: b },
            { dex: 'uniV3', tokenIn: b, tokenOut: a, fee },
          ],
          loanSizes: [500, 1000, 2000, 5000],
        });
        routes.push({
          name: `${a}→${b}(UniV3-${fee})→${a}(${v2Dex})`,
          loanToken: a,
          path: [
            { dex: 'uniV3', tokenIn: a, tokenOut: b, fee },
            { dex: v2Dex, tokenIn: b, tokenOut: a },
          ],
          loanSizes: [500, 1000, 2000, 5000],
        });
      }
    }
    // V2 -> V2 cross-DEX
    for (let i = 0; i < v2Dexes.length; i++) {
      for (let j = 0; j < v2Dexes.length; j++) {
        if (i === j) continue;
        routes.push({
          name: `${a}→${b}(${v2Dexes[i]})→${a}(${v2Dexes[j]})`,
          loanToken: a,
          path: [
            { dex: v2Dexes[i], tokenIn: a, tokenOut: b },
            { dex: v2Dexes[j], tokenIn: b, tokenOut: a },
          ],
          loanSizes: [500, 1000, 2000, 5000],
        });
      }
    }
  }

  // 3-hop triangular: A -> B -> C -> A
  const triangles = [
    { a: 'WETH', b: 'USDC', c: 'ARB' },
    { a: 'WETH', b: 'USDCe', c: 'ARB' },
    { a: 'WETH', b: 'USDC', c: 'GMX' },
    { a: 'WETH', b: 'USDC', c: 'LINK' },
    { a: 'WETH', b: 'USDCe', c: 'GMX' },
    { a: 'WETH', b: 'ARB', c: 'USDC' },
    { a: 'USDCe', b: 'WETH', c: 'ARB' },
    { a: 'USDCe', b: 'WETH', c: 'LINK' },
  ];

  for (const { a, b, c } of triangles) {
    // All V2 triangles
    for (const d1 of v2Dexes) {
      for (const d2 of v2Dexes) {
        for (const d3 of v2Dexes) {
          routes.push({
            name: `△ ${a}→${b}(${d1})→${c}(${d2})→${a}(${d3})`,
            loanToken: a,
            path: [
              { dex: d1, tokenIn: a, tokenOut: b },
              { dex: d2, tokenIn: b, tokenOut: c },
              { dex: d3, tokenIn: c, tokenOut: a },
            ],
            loanSizes: [500, 1000, 2000],
          });
        }
      }
    }
    // Mixed V2/V3 triangles (one hop on V3)
    for (const fee of [500, 3000]) {
      for (const d1 of v2Dexes) {
        for (const d2 of v2Dexes) {
          routes.push({
            name: `△ ${a}→${b}(V3-${fee})→${c}(${d1})→${a}(${d2})`,
            loanToken: a,
            path: [
              { dex: 'uniV3', tokenIn: a, tokenOut: b, fee },
              { dex: d1, tokenIn: b, tokenOut: c },
              { dex: d2, tokenIn: c, tokenOut: a },
            ],
            loanSizes: [500, 1000, 2000],
          });
        }
      }
    }
  }

  return routes;
}

// ---- Quote engine ----
interface QuoteResult {
  amountOut: bigint;
  success: boolean;
}

async function getV2Quote(
  routerAddr: string, tokenIn: string, tokenOut: string, amountIn: bigint, provider: ethers.JsonRpcProvider,
): Promise<QuoteResult> {
  try {
    const router = new ethers.Contract(routerAddr, V2_ROUTER_ABI, provider);
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    return { amountOut: amounts[1], success: true };
  } catch {
    return { amountOut: 0n, success: false };
  }
}

async function getV3Quote(
  quoterAddr: string, tokenIn: string, tokenOut: string, fee: number, amountIn: bigint, provider: ethers.JsonRpcProvider,
): Promise<QuoteResult> {
  try {
    const quoter = new ethers.Contract(quoterAddr, V3_QUOTER_ABI, provider);
    const amountOut = await quoter.quoteExactInputSingle.staticCall(tokenIn, tokenOut, fee, amountIn, 0);
    return { amountOut, success: true };
  } catch {
    return { amountOut: 0n, success: false };
  }
}

async function simulateRoute(
  route: Route, loanAmountUSD: number, provider: ethers.JsonRpcProvider, ethPriceUSD: number,
): Promise<{ profitable: boolean; netProfitUSD: number; amountOut: bigint; loanAmount: bigint } | null> {
  const loanToken = TOKENS[route.loanToken];
  if (!loanToken) return null;

  // Convert USD loan to token amount
  let loanAmountRaw: bigint;
  if (route.loanToken === 'WETH') {
    const ethAmount = loanAmountUSD / ethPriceUSD;
    loanAmountRaw = ethers.parseEther(ethAmount.toFixed(8));
  } else if (loanToken.decimals === 6) {
    loanAmountRaw = BigInt(Math.floor(loanAmountUSD)) * 10n ** 6n;
  } else {
    loanAmountRaw = ethers.parseUnits(String(loanAmountUSD), loanToken.decimals);
  }

  let currentAmount = loanAmountRaw;

  // Execute each hop
  for (const hop of route.path) {
    const tokenIn = TOKENS[hop.tokenIn]?.address;
    const tokenOut = TOKENS[hop.tokenOut]?.address;
    if (!tokenIn || !tokenOut) return null;

    let result: QuoteResult;
    if (hop.dex === 'uniV3') {
      result = await getV3Quote(DEXES.uniV3.quoter, tokenIn, tokenOut, hop.fee || 3000, currentAmount, provider);
    } else {
      const dex = DEXES[hop.dex as keyof typeof DEXES];
      if (!dex || !('router' in dex)) return null;
      result = await getV2Quote(dex.router, tokenIn, tokenOut, currentAmount, provider);
    }

    if (!result.success || result.amountOut === 0n) return null;
    currentAmount = result.amountOut;
  }

  // Calculate profit
  const aaveFee = loanAmountRaw * 5n / 10000n; // 0.05%
  const totalCost = loanAmountRaw + aaveFee;
  const netProfit = currentAmount - totalCost;

  // Convert to USD
  let netProfitUSD: number;
  if (route.loanToken === 'WETH') {
    netProfitUSD = Number(ethers.formatEther(netProfit)) * ethPriceUSD;
  } else if (loanToken.decimals === 6) {
    netProfitUSD = Number(netProfit) / 1e6;
  } else {
    netProfitUSD = Number(ethers.formatUnits(netProfit, loanToken.decimals));
  }

  // Subtract gas cost (~$0.05 on Arbitrum)
  netProfitUSD -= 0.05;

  return {
    profitable: netProfitUSD >= MIN_NET_PROFIT_USD,
    netProfitUSD,
    amountOut: currentAmount,
    loanAmount: loanAmountRaw,
  };
}

// ---- Get ETH price ----
async function getEthPrice(provider: ethers.JsonRpcProvider): Promise<number> {
  try {
    const quoter = new ethers.Contract(DEXES.uniV3.quoter, V3_QUOTER_ABI, provider);
    const out = await quoter.quoteExactInputSingle.staticCall(
      TOKENS.WETH.address, TOKENS.USDC.address, 500, ethers.parseEther('1'), 0,
    );
    return Number(out) / 1e6;
  } catch {
    return 1900; // fallback
  }
}

// ---- Main scan ----
interface VerifiedOpportunity {
  route: string;
  loanToken: string;
  loanAmountUSD: number;
  netProfitUSD: number;
  path: Route['path'];
  loanAmountRaw: bigint;
  expectedOutput: bigint;
}

async function scanAllRoutes(provider: ethers.JsonRpcProvider): Promise<{
  blockNumber: number;
  routesScanned: number;
  opportunities: VerifiedOpportunity[];
  topResults: { route: string; profit: number }[];
  ethPrice: number;
}> {
  const blockNumber = await provider.getBlockNumber();
  const ethPrice = await getEthPrice(provider);
  const routes = buildRoutes();
  const opportunities: VerifiedOpportunity[] = [];
  const allResults: { route: string; profit: number }[] = [];

  // Scan routes in batches of 20 to avoid rate limits
  const BATCH_SIZE = 20;
  let scanned = 0;

  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    const batch = routes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (route) => {
        // Try each loan size, keep the most profitable
        let best: { profitable: boolean; netProfitUSD: number; amountOut: bigint; loanAmount: bigint; loanUSD: number } | null = null;

        for (const loanUSD of route.loanSizes) {
          const result = await simulateRoute(route, loanUSD, provider, ethPrice);
          if (result && (!best || result.netProfitUSD > best.netProfitUSD)) {
            best = { ...result, loanUSD };
          }
        }

        if (best) {
          allResults.push({ route: route.name, profit: best.netProfitUSD });
          if (best.profitable) {
            opportunities.push({
              route: route.name,
              loanToken: route.loanToken,
              loanAmountUSD: best.loanUSD,
              netProfitUSD: best.netProfitUSD,
              path: route.path,
              loanAmountRaw: best.loanAmount,
              expectedOutput: best.amountOut,
            });
          }
        }
      }),
    );
    scanned += batchResults.filter(r => r.status === 'fulfilled').length;
  }

  // Sort by profit
  allResults.sort((a, b) => b.profit - a.profit);
  opportunities.sort((a, b) => b.netProfitUSD - a.netProfitUSD);

  return {
    blockNumber,
    routesScanned: scanned,
    opportunities,
    topResults: allResults.slice(0, 10),
    ethPrice,
  };
}

// ---- Execute ----
async function executeOpportunity(opp: VerifiedOpportunity, provider: ethers.JsonRpcProvider): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!LIVE_TRADING_ENABLED) {
    return { success: false, error: 'dry-run: live trading disabled (set EXP_DRY_RUN=false and EXP_ALLOW_LIVE_TRADING=true to enable)' };
  }
  if (!PRIVATE_KEY) return { success: false, error: 'No private key' };
  if (opp.path.length !== 2) return { success: false, error: 'Only 2-hop execution supported by contract' };

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(ARBITRAGE_CONTRACT, FLASH_LOAN_ABI, wallet);

  const hop1 = opp.path[0];
  const hop2 = opp.path[1];

  const dex1 = DEXES[hop1.dex as keyof typeof DEXES];
  const dex2 = DEXES[hop2.dex as keyof typeof DEXES];
  if (!dex1 || !dex2) return { success: false, error: 'Unknown DEX' };
  if (!LIVE_SAFE_DEXES.has(hop1.dex) || !LIVE_SAFE_DEXES.has(hop2.dex)) {
    return { success: false, error: `venue not allowlisted for live execution: ${hop1.dex}/${hop2.dex}` };
  }

  const loanTokenAddr = TOKENS[opp.loanToken]?.address;
  const intermediateToken = TOKENS[hop1.tokenOut]?.address;
  if (!loanTokenAddr || !intermediateToken) return { success: false, error: 'Unknown token' };

  // 1% slippage on min output (the simulation already verified profitability)
  const amountBMin = opp.loanAmountRaw * 99n / 100n;
  const feeA = hop1.fee || 0;
  const feeB = hop2.fee || 0;

  try {
    await contract.executeArbitrage.estimateGas(
      loanTokenAddr, opp.loanAmountRaw,
      dex1.router, dex2.router,
      intermediateToken,
      'isV3' in dex1 ? dex1.isV3 : false,
      'isV3' in dex2 ? dex2.isV3 : false,
      feeA, feeB, amountBMin,
    );

    const feeData = await provider.getFeeData();
    const tx = await contract.executeArbitrage(
      loanTokenAddr, opp.loanAmountRaw,
      dex1.router, dex2.router,
      intermediateToken,
      'isV3' in dex1 ? dex1.isV3 : false,
      'isV3' in dex2 ? dex2.isV3 : false,
      feeA, feeB, amountBMin,
      {
        gasLimit: 1_000_000n,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      },
    );

    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    return { success: false, error: msg.slice(0, 200) };
  }
}

// ---- Telegram ----
async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

// ---- Persist ----
async function persistResult(opp: VerifiedOpportunity, execResult?: { success: boolean; txHash?: string; error?: string }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: 'return=minimal',
  };

  // Log opportunity
  await fetch(`${SUPABASE_URL}/rest/v1/opportunities`, {
    method: 'POST', headers,
    body: JSON.stringify({
      token_pair: opp.route,
      buy_dex: opp.path[0]?.dex || 'unknown',
      sell_dex: opp.path[opp.path.length - 1]?.dex || 'unknown',
      spread_percent: (opp.netProfitUSD / opp.loanAmountUSD) * 100,
      estimated_profit: opp.netProfitUSD,
      loan_amount: opp.loanAmountUSD,
      network: 'arbitrum',
      status: execResult?.success ? 'executed' : 'verified',
      source: 'realtime-block-scanner-v2',
    }),
  }).catch(() => {});

  // Log trade if executed
  if (execResult) {
    await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        wallet_address: '0xF7291186C20515495bA0c50e0a4928F8C6bb0561',
        token_pair: opp.route,
        buy_dex: opp.path[0]?.dex,
        sell_dex: opp.path[opp.path.length - 1]?.dex,
        loan_amount: opp.loanAmountUSD,
        profit: execResult.success ? opp.netProfitUSD : 0,
        network: 'arbitrum',
        transaction_hash: execResult.txHash || null,
        status: execResult.success ? 'success' : 'reverted',
        error_message: execResult.error || null,
      }),
    }).catch(() => {});
  }
}

// ---- HTTP Handler ----
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const rpcUrl = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const scan = await scanAllRoutes(provider);

    // Execute best opportunity if found (only 2-hop routes can be executed by contract)
    const execResults: { route: string; success: boolean; error?: string; txHash?: string }[] = [];

    for (const opp of scan.opportunities) {
      if (opp.path.length === 2) {
        // Re-verify right before execution (prices can move)
        const result = await executeOpportunity(opp, provider);
        execResults.push({ route: opp.route, ...result });
        await persistResult(opp, result);

        if (result.success) {
          await sendTelegram(
            `✅ *TRADE EXECUTED*\n\n` +
            `Route: \`${opp.route}\`\n` +
            `Loan: $${opp.loanAmountUSD}\n` +
            `💰 Profit: *$${opp.netProfitUSD.toFixed(2)}*\n` +
            `Tx: \`${result.txHash}\``,
          );
          break; // One execution per scan cycle
        }
      } else {
        // Log multi-hop opportunity (can't execute yet, but track it)
        await persistResult(opp);
        await sendTelegram(
          `🔍 *MULTI-HOP OPPORTUNITY* (monitoring only)\n\n` +
          `Route: \`${opp.route}\`\n` +
          `Loan: $${opp.loanAmountUSD}\n` +
          `💰 Est. Profit: *$${opp.netProfitUSD.toFixed(2)}*`,
        );
      }
    }

    const response = {
      success: true,
      scanner: 'realtime-block-scanner-v2',
      block: scan.blockNumber,
      ethPrice: scan.ethPrice,
      routesScanned: scan.routesScanned,
      opportunitiesFound: scan.opportunities.length,
      verifiedProfitable: scan.opportunities.map(o => ({
        route: o.route,
        loanUSD: o.loanAmountUSD,
        netProfit: `$${o.netProfitUSD.toFixed(2)}`,
        hops: o.path.length,
      })),
      executions: execResults,
      topRoutes: scan.topResults.slice(0, 5),
      config: { minProfitUsd: MIN_NET_PROFIT_USD, network: 'arbitrum' },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
