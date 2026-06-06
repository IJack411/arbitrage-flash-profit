import fs from 'node:fs';
import path from 'node:path';

const parseDotEnv = (fileText) => {
  const out = {};
  for (const line of fileText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
      ? raw.slice(1, -1)
      : raw;
    out[key] = value;
  }
  return out;
};

const loadEnvFallbacks = () => {
  const files = ['.env', 'supabase/.env.local'];
  for (const file of files) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const parsed = parseDotEnv(fs.readFileSync(full, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in process.env)) process.env[k] = v;
    }
  }
};

const parseArgs = (argv) => {
  const args = {
    network: 'ethereum',
    iterations: 2,
    delayMs: 600,
    quick: false,
    mode: 'standard',
    maxConfigs: 0,
    output: `benchmark-results/live-settings-sweep-${Date.now()}.json`,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--network' && argv[i + 1]) args.network = argv[++i];
    else if (a === '--iterations' && argv[i + 1]) args.iterations = Number(argv[++i]) || args.iterations;
    else if (a === '--delayMs' && argv[i + 1]) args.delayMs = Number(argv[++i]) || args.delayMs;
    else if (a === '--quick') args.quick = true;
    else if (a === '--mode' && argv[i + 1]) args.mode = String(argv[++i]).toLowerCase();
    else if (a === '--maxConfigs' && argv[i + 1]) args.maxConfigs = Number(argv[++i]) || 0;
    else if (a === '--output' && argv[i + 1]) args.output = argv[++i];
  }

  return args;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const median = (arr) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const sum = (arr) => arr.reduce((acc, n) => acc + n, 0);

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const buildCandidates = (quick = false, mode = 'standard') => {
  if (mode === 'near') {
    const loans = quick ? [600, 1000, 1500] : [400, 600, 800, 1000, 1250, 1500];
    const slippageBps = quick ? [65, 75, 80] : [60, 65, 70, 75, 80, 85];
    const liquidityUsage = quick ? [20, 25] : [20, 25, 30];
    const minNetProfits = quick ? [1, 2] : [0.5, 1, 1.5, 2, 2.5];
    const estimatedGasUsd = quick ? [7, 8, 9] : [6, 7, 8, 9, 10];

    const candidates = [];
    let id = 1;
    for (const loan of loans) {
      for (const slip of slippageBps) {
        for (const liq of liquidityUsage) {
          for (const minNetProfitUsd of minNetProfits) {
            for (const gas of estimatedGasUsd) {
              candidates.push({
                id: `cfg-${id++}`,
                loan,
                maxSlippageBps: slip,
                maxLiquidityUsagePercent: liq,
                estimatedGasUsd: gas,
                minNetProfitUsd,
                minSpreadPercent: 0.02,
                minLiquidityUsd: 60000,
                maxResults: 40,
              });
            }
          }
        }
      }
    }
    return candidates;
  }

  // Focus on the current live execution envelope (Ethereum-only) instead of legacy micro sizes.
  const loans = quick ? [3000, 4000] : [2500, 3000, 3500, 4000, 4500];
  const slippageBps = quick ? [55, 65, 75] : [50, 55, 60, 65, 75];
  const liquidityUsage = quick ? [20, 25] : [20, 25, 30];
  const minNetProfits = quick ? [2, 3] : [1.5, 2, 2.5, 3];
  const estimatedGasUsd = quick ? [10, 12] : [9, 10, 11, 12];

  const candidates = [];
  let id = 1;
  for (const loan of loans) {
    for (const slip of slippageBps) {
      for (const liq of liquidityUsage) {
        for (const minNetProfitUsd of minNetProfits) {
          for (const gas of estimatedGasUsd) {
            candidates.push({
              id: `cfg-${id++}`,
              loan,
              maxSlippageBps: slip,
              maxLiquidityUsagePercent: liq,
              estimatedGasUsd: gas,
              minNetProfitUsd,
              minSpreadPercent: 0.02,
              minLiquidityUsd: 60000,
              maxResults: 25,
            });
          }
        }
      }
    }
  }
  return candidates;
};

const scoreResult = (diag, watchlist = [], opportunities = []) => {
  const pass = toNumber(diag.opportunitiesPassed, opportunities.length);
  const feasible = toNumber(diag.feasible, 0);
  const netDrop = toNumber(diag.droppedByNetProfit, 0);
  const slipDrop = toNumber(diag.droppedBySlippage, 0);
  const riskDrop = toNumber(diag.droppedByExecutionRisk, 0);
  const badQuotes = toNumber(diag.droppedByBadQuotes, 0);
  const spreadDrop = toNumber(diag.droppedBySpread, 0);
  const liqDrop = toNumber(diag.droppedByLiquidity, 0);
  const sameDexDrop = toNumber(diag.droppedBySameDex, 0);

  const bestWatchNet = watchlist.length > 0
    ? Math.max(...watchlist.map((item) => toNumber(item.netProfit ?? item.expectedProfit, -999999)))
    : -999999;

  // Weighted heuristic: prioritize actual pass > feasible > near-miss quality,
  // and penalize slippage/net rejections.
  return (
    pass * 100
    + feasible * 15
    + Math.max(-50, Math.min(50, bestWatchNet))
    - slipDrop * 6
    - riskDrop * 6
    - badQuotes * 2
    - spreadDrop * 1.5
    - liqDrop * 1.5
    - netDrop * 2
    - sameDexDrop * 0.5
  );
};

const run = async () => {
  loadEnvFallbacks();
  const args = parseArgs(process.argv);

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/scan-arbitrage-opportunities`;
  let candidates = buildCandidates(args.quick, args.mode);
  if (args.maxConfigs > 0) {
    candidates = candidates.slice(0, args.maxConfigs);
  }

  console.log(`Starting live settings sweep: network=${args.network}, mode=${args.mode}, configs=${candidates.length}, iterations=${args.iterations}`);
  console.log(`Endpoint: ${endpoint}`);

  const results = [];

  for (const config of candidates) {
    const perRun = [];

    for (let i = 0; i < args.iterations; i += 1) {
      const payload = {
        networks: [args.network],
        loanAmountUsd: config.loan,
        minNetProfitUsd: config.minNetProfitUsd,
        perNetworkMinNetProfitUsd: { [args.network]: config.minNetProfitUsd },
        minLiquidityUsd: config.minLiquidityUsd,
        minSpreadPercent: config.minSpreadPercent,
        maxResults: config.maxResults,
        maxSlippageBps: config.maxSlippageBps,
        maxLiquidityUsagePercent: config.maxLiquidityUsagePercent,
        estimatedGasUsd: config.estimatedGasUsd,
        enableDexScreener: true,
        enableGecko: false,
      };

      const started = Date.now();
      let row;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = { parseError: true, raw: text.slice(0, 300) };
        }

        if (!response.ok) {
          row = {
            ok: false,
            status: response.status,
            latencyMs: Date.now() - started,
            error: data?.error || data?.message || `HTTP ${response.status}`,
          };
        } else {
          const diag = data?.diagnostics || {};
          const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
          const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
          row = {
            ok: true,
            latencyMs: Date.now() - started,
            pass: toNumber(diag.opportunitiesPassed, opportunities.length),
            feasible: toNumber(diag.feasible, 0),
            cand: toNumber(diag.candidates, 0),
            slipDrop: toNumber(diag.droppedBySlippage, 0),
            netDrop: toNumber(diag.droppedByNetProfit, 0),
            riskDrop: toNumber(diag.droppedByExecutionRisk, 0),
            badQuotes: toNumber(diag.droppedByBadQuotes, 0),
            spreadDrop: toNumber(diag.droppedBySpread, 0),
            liqDrop: toNumber(diag.droppedByLiquidity, 0),
            sameDexDrop: toNumber(diag.droppedBySameDex, 0),
            watchCount: watchlist.length,
            bestWatchNet: watchlist.length > 0
              ? Math.max(...watchlist.map((item) => toNumber(item.netProfit ?? item.expectedProfit, -999999)))
              : -999999,
          };
        }
      } catch (error) {
        row = {
          ok: false,
          status: 0,
          latencyMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      perRun.push(row);
      await wait(args.delayMs);
    }

    const okRuns = perRun.filter((r) => r.ok);
    const summary = {
      id: config.id,
      config,
      runs: perRun,
      okCount: okRuns.length,
      errCount: perRun.length - okRuns.length,
      passMedian: median(okRuns.map((r) => r.pass || 0)),
      feasibleMedian: median(okRuns.map((r) => r.feasible || 0)),
      candMedian: median(okRuns.map((r) => r.cand || 0)),
      bestWatchNetMedian: median(okRuns.map((r) => r.bestWatchNet || -999999)),
      slipDropMedian: median(okRuns.map((r) => r.slipDrop || 0)),
      netDropMedian: median(okRuns.map((r) => r.netDrop || 0)),
      riskDropMedian: median(okRuns.map((r) => r.riskDrop || 0)),
      badQuotesMedian: median(okRuns.map((r) => r.badQuotes || 0)),
      spreadDropMedian: median(okRuns.map((r) => r.spreadDrop || 0)),
      liqDropMedian: median(okRuns.map((r) => r.liqDrop || 0)),
      sameDexDropMedian: median(okRuns.map((r) => r.sameDexDrop || 0)),
      latencyMedianMs: median(perRun.map((r) => r.latencyMs || 0)),
    };

    summary.score = scoreResult({
      opportunitiesPassed: summary.passMedian,
      feasible: summary.feasibleMedian,
      droppedByNetProfit: summary.netDropMedian,
      droppedBySlippage: summary.slipDropMedian,
      droppedByExecutionRisk: summary.riskDropMedian,
      droppedByBadQuotes: summary.badQuotesMedian,
      droppedBySpread: summary.spreadDropMedian,
      droppedByLiquidity: summary.liqDropMedian,
      droppedBySameDex: summary.sameDexDropMedian,
    }, [{ netProfit: summary.bestWatchNetMedian }], []);

    results.push(summary);
    console.log(
      `${config.id} loan=${config.loan} slip=${(config.maxSlippageBps / 100).toFixed(2)}% liq=${config.maxLiquidityUsagePercent}% | score=${summary.score.toFixed(2)} passMed=${summary.passMedian} feasMed=${summary.feasibleMedian} bestWatchMed=${summary.bestWatchNetMedian.toFixed(2)}`
    );
  }

  const ranked = [...results].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 5);

  const output = {
    generatedAt: new Date().toISOString(),
    endpoint,
    network: args.network,
    iterations: args.iterations,
    count: results.length,
    top,
    all: ranked,
  };

  const outPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\nTop 3 configs:');
  top.slice(0, 3).forEach((row, idx) => {
    console.log(
      `${idx + 1}. ${row.id} | loan=${row.config.loan} slip=${(row.config.maxSlippageBps / 100).toFixed(2)}% liq=${row.config.maxLiquidityUsagePercent}% score=${row.score.toFixed(2)} passMed=${row.passMedian} feasMed=${row.feasibleMedian} bestWatchMed=${row.bestWatchNetMedian.toFixed(2)}`
    );
  });

  console.log(`\nSaved sweep report: ${outPath}`);
};

run().catch((error) => {
  console.error('Sweep failed:', error);
  process.exit(1);
});
