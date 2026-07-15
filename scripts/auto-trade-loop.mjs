const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseList = (value, fallback) => {
  if (!value || typeof value !== 'string') return fallback;
  const list = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
};

const scanUrl = process.env.AUTO_SCAN_URL || 'http://127.0.0.1:54321/functions/v1/scan-arbitrage-opportunities';
const execUrl = process.env.AUTO_EXEC_URL || 'http://127.0.0.1:54321/functions/v1/flashbots-executor';
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.AUTO_SUPABASE_ANON_KEY || '';

const intervalMs = Math.max(5_000, parseNumber(process.env.AUTO_TRADE_INTERVAL_MS, 30_000));
const mode = String(process.env.AUTO_TRADE_MODE || 'dry').toLowerCase(); // dry | live
const minNetProfitUsd = parseNumber(process.env.AUTO_MIN_NET_PROFIT_USD, 15);
const maxSlippageBps = parseNumber(process.env.AUTO_MAX_SLIPPAGE_BPS, 65);
const estimatedGasUsd = parseNumber(process.env.AUTO_ESTIMATED_GAS_USD, 8);
const loanAmountUsd = parseNumber(process.env.AUTO_LOAN_USD, 20_000);
const networks = parseList(process.env.AUTO_NETWORKS, ['ethereum', 'arbitrum', 'base']);
const contractAddress = process.env.AUTO_CONTRACT_ADDRESS || process.env.VITE_ARBITRAGE_CONTRACT_ADDRESS || '';
const walletAddress = process.env.AUTO_WALLET_ADDRESS || '';

const seenCandidates = new Map();
const maxSeenAgeMs = 20 * 60 * 1000;

const authHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }
  return headers;
};

const pruneSeenCandidates = (now) => {
  for (const [key, ts] of seenCandidates.entries()) {
    if (now - ts > maxSeenAgeMs) seenCandidates.delete(key);
  }
};

const chooseBestOpportunity = (opportunities) => {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null;

  const filtered = opportunities.filter((opp) => {
    const net = Number(opp?.netProfit ?? 0);
    const slippage = Number(opp?.estimatedSlippageBps ?? 0);
    const network = String(opp?.network || '').toLowerCase();
    return Number.isFinite(net)
      && net >= minNetProfitUsd
      && Number.isFinite(slippage)
      && slippage <= maxSlippageBps
      && networks.includes(network);
  });

  if (filtered.length === 0) return null;

  filtered.sort((a, b) => {
    const netDiff = Number(b.netProfit ?? 0) - Number(a.netProfit ?? 0);
    if (netDiff !== 0) return netDiff;
    return Number(b.confidenceScore ?? 0) - Number(a.confidenceScore ?? 0);
  });

  return filtered[0];
};

const runScan = async () => {
  const response = await fetch(scanUrl, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      scheduledRun: true,
      networks,
      loanAmountUsd,
      minNetProfitUsd,
      maxSlippageBps,
      estimatedGasUsd,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    const reason = json?.error || `HTTP ${response.status}`;
    throw new Error(`scan failed: ${reason}`);
  }
  return json;
};

const executeOpportunity = async (opportunity) => {
  const response = await fetch(execUrl, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      action: 'execute-arbitrage',
      params: {
        walletAddress: walletAddress || undefined,
        contractAddress,
        opportunity,
        scanRunId: opportunity?.scanRunId,
        candidateId: opportunity?.candidateId,
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    const reason = json?.error || `HTTP ${response.status}`;
    throw new Error(`execute failed: ${reason}`);
  }

  return json;
};

const logPrefix = () => new Date().toISOString();

const main = async () => {
  if (mode === 'live' && !contractAddress) {
    console.error(`[${logPrefix()}] AUTO_TRADE_MODE=live requires AUTO_CONTRACT_ADDRESS or VITE_ARBITRAGE_CONTRACT_ADDRESS.`);
    process.exit(1);
  }

  console.log(`[${logPrefix()}] Auto trade loop started. mode=${mode} intervalMs=${intervalMs} networks=${networks.join(',')}`);

  let cycle = 0;
  let executed = 0;
  let skipped = 0;
  let failures = 0;

  while (true) {
    cycle += 1;
    const now = Date.now();
    pruneSeenCandidates(now);

    try {
      const scan = await runScan();
      const opportunities = Array.isArray(scan.opportunities) ? scan.opportunities : [];
      const best = chooseBestOpportunity(opportunities);

      if (!best) {
        skipped += 1;
        console.log(`[${logPrefix()}] cycle=${cycle} no eligible opportunities found (active=${opportunities.length}).`);
        await sleep(intervalMs);
        continue;
      }

      const candidateKey = String(best.candidateId || `${best.tokenPair}|${best.buyDex}|${best.sellDex}`);
      if (seenCandidates.has(candidateKey)) {
        skipped += 1;
        console.log(`[${logPrefix()}] cycle=${cycle} duplicate candidate skipped key=${candidateKey}.`);
        await sleep(intervalMs);
        continue;
      }
      seenCandidates.set(candidateKey, now);

      const net = Number(best.netProfit ?? 0).toFixed(4);
      console.log(`[${logPrefix()}] cycle=${cycle} picked ${best.tokenPair} ${best.buyDex}->${best.sellDex} net=${net} status=${best.status}.`);

      if (mode !== 'live') {
        skipped += 1;
        console.log(`[${logPrefix()}] cycle=${cycle} dry mode enabled; execution skipped.`);
        await sleep(intervalMs);
        continue;
      }

      const execution = await executeOpportunity(best);
      executed += 1;
      const bundleHash = execution?.bundleHash || execution?.bundle?.bundleHash || 'n/a';
      console.log(`[${logPrefix()}] cycle=${cycle} executed bundle=${bundleHash}. totals executed=${executed} skipped=${skipped} failures=${failures}`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${logPrefix()}] cycle=${cycle} error: ${message}. totals executed=${executed} skipped=${skipped} failures=${failures}`);
    }

    await sleep(intervalMs);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${logPrefix()}] fatal: ${message}`);
  process.exit(1);
});
