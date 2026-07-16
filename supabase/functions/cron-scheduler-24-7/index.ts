import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  cron?: (name: string, schedule: string, fn: () => Promise<void>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Priority pairs seeded into hot_pairs_queue so indexer-refresh-fast always has work.
// WETH pairs included for Ethereum cross-DEX arb (LINK/WETH, WBTC/WETH exist on V2, V3, and SushiSwap).
// With $50k loan and $26 ETH gas, break-even = 5.2 bps — achievable with WETH cross-DEX spreads.
// Mirrors shared/networks-tokens.ts SEARCH_TERMS_BY_NETWORK.
const PRIORITY_PAIRS_BY_NETWORK: Record<string, string[]> = {
  ethereum: [
    // WETH pairs: exist on V2 + V3 + SushiSwap = real cross-DEX opportunities
    'LINK/WETH', 'WBTC/WETH', 'AAVE/WETH', 'UNI/WETH', 'COMP/WETH',
    // Stablecoin base pairs
    'WBTC/USDC', 'WBTC/USDT', 'LINK/USDC', 'LINK/USDT',
    'UNI/USDC', 'AAVE/USDC', 'CRV/USDC', 'SNX/USDC',
    'LDO/USDC', 'MKR/USDC', 'COMP/USDC', 'RPL/USDC',
    'DAI/USDC', 'USDC/USDT',
  ],
  arbitrum: [
    // WETH pairs: exist on V3 + SushiSwap on Arbitrum = cross-DEX with cheap gas ($0.31/tx)
    'WETH/USDC', 'WETH/USDT', 'MAGIC/WETH', 'ARB/WETH', 'GMX/WETH',
    // Stablecoin pairs
    'ARB/USDC', 'GMX/USDC', 'MAGIC/USDC', 'LINK/USDC',
    'RDNT/USDC', 'PENDLE/USDC', 'GNS/USDC', 'WBTC/USDC',
    'CRV/USDC', 'BAL/USDC', 'STG/USDC', 'DAI/USDC', 'USDC/USDT',
  ],
  base:     ['LINK/USDC', 'AERO/USDC', 'DEGEN/USDC', 'BRETT/USDC', 'TOSHI/USDC', 'DACKIE/USDC', 'BALD/USDC', 'USDC/USDT'],
  polygon:  ['WMATIC/USDC', 'WMATIC/USDT', 'LINK/USDC', 'AAVE/USDC', 'GHST/USDC', 'CRV/USDC', 'SAND/USDC', 'QUICK/USDC', 'BAL/USDC', 'DAI/USDC', 'USDC/USDT'],
  bsc:      ['WBNB/USDT', 'WBNB/USDC', 'CAKE/USDT', 'XVS/USDT', 'ALPACA/USDT', 'MDX/USDT', 'BAKE/USDT', 'USDC/USDT'],
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    })
  : null;

// --- Hot pairs seeding -------------------------------------------------------
// Clears stale pairs and reseeds with current PRIORITY_PAIRS_BY_NETWORK.
// Runs on every pipeline cycle to pick up pair list changes.
const seedHotPairs = async (): Promise<{ seeded: number; cleared: number }> => {
  if (!supabase) return { seeded: 0, cleared: 0 };
  try {
    // Remove any pairs that are no longer in priority list
    const allCurrentPairs: string[] = [];
    for (const pairs of Object.values(PRIORITY_PAIRS_BY_NETWORK)) {
      allCurrentPairs.push(...pairs);
    }

    const rows: { network: string; token_pair: string; priority_score: number; reason: string }[] = [];
    for (const [network, pairs] of Object.entries(PRIORITY_PAIRS_BY_NETWORK)) {
      for (let i = 0; i < pairs.length; i++) {
        rows.push({
          network,
          token_pair: pairs[i],
          priority_score: pairs.length - i,
          reason: 'priority-seed',
        });
      }
    }

    const { error } = await supabase
      .from('hot_pairs_queue')
      .upsert(rows, { onConflict: 'network,token_pair', ignoreDuplicates: false });

    if (error) {
      console.error('[cron] hot_pairs_queue seed error:', error.message);
      return { seeded: 0, cleared: 0 };
    }
    console.log(`[cron] Upserted ${rows.length} priority pairs into hot_pairs_queue`);
    return { seeded: rows.length, cleared: 0 };
  } catch (e) {
    console.error('[cron] seedHotPairs exception:', e);
    return { seeded: 0, cleared: 0 };
  }
};

// --- Indexer refresh ---------------------------------------------------------
// Calls indexer-refresh-fast via Supabase client (correct inter-function auth).
const runIndexerRefresh = async (networks: string[]): Promise<{ success: boolean; pairsScanned?: number; error?: string }> => {
  if (!supabase) return { success: false, error: 'No supabase client' };
  try {
    const { data, error } = await supabase.functions.invoke('indexer-refresh-fast', {
      body: { mode: 'fast', networks, maxPairs: 50, force: true },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, pairsScanned: (data as { pairsScanned?: number })?.pairsScanned ?? 0 };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'indexer call failed' };
  }
};

// --- Full scanner call -------------------------------------------------------
// Always runs — independent of any pre-scan result.
const runFullScan = async (networks: string[], triggerReason: string): Promise<{ success: boolean; found?: number; watchlist?: number; error?: string; diagnostics?: Record<string, unknown>; readinessGates?: Record<string, unknown> | null }> => {
  if (!supabase) return { success: false, error: 'No supabase client' };
  try {
    const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
      body: { triggeredBy: 'cron-scheduler-24-7', triggerReason, scheduledRun: true, networks },
    });
    if (error) return { success: false, error: error.message };
    const d = data as { found?: number; watchlistCount?: number; success?: boolean; error?: string; diagnostics?: Record<string, unknown>; readinessGates?: Record<string, unknown> | null };
    if (!d?.success) return { success: false, error: d?.error || 'scanner returned success=false' };
    return { success: true, found: d.found ?? 0, watchlist: d.watchlistCount ?? 0, diagnostics: d.diagnostics, readinessGates: d.readinessGates ?? null };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'scanner call failed' };
  }
};

// --- Logging -----------------------------------------------------------------
const logSchedulerRun = async (
  opportunitiesFound: number,
  durationMs: number,
  triggerReason: string,
  networks: string[],
  scanDiagnostics?: Record<string, unknown>,
  readinessGates?: Record<string, unknown> | null,
  error?: string,
) => {
  if (!supabase) return;
  const scanTimestamp = new Date().toISOString();
  try {
    await supabase.from('scheduler_24_7_logs').insert({
      user_id: 'default',
      scan_timestamp: scanTimestamp,
      scan_type: 'scheduled',
      opportunities_found: Math.max(0, opportunitiesFound),
      networks_scanned: networks,
      execution_time_ms: durationMs,
      status: error ? 'failed' : 'success',
      error_message: error ?? null,
      error_details: {
        triggerReason,
        readinessGates,
        sourceFailureCounts: scanDiagnostics && typeof scanDiagnostics === 'object'
          ? {
            subgraphSourcesFailed: Math.max(0, 5 - Number((scanDiagnostics as { subgraphSourcesOk?: number }).subgraphSourcesOk ?? 0)),
            fallbackEntriesAccepted: Number((scanDiagnostics as { fallbackEntriesAccepted?: number }).fallbackEntriesAccepted ?? 0),
            fallbackFetches: Number(((scanDiagnostics as { indexCache?: { fallbackFetches?: number } }).indexCache?.fallbackFetches) ?? 0),
          }
          : null,
      },
    });
    await supabase
      .from('scheduler_24_7_config')
      .update({ last_cron_run_at: scanTimestamp })
      .eq('user_id', 'default');
  } catch {
    // Swallow logging errors so the cron cycle doesn't fail.
  }
};

// --- Main pipeline -----------------------------------------------------------
const runPipeline = async (networks: string[], triggerReason = 'cron') => {
  const start = performance.now();
  const seedResult = await seedHotPairs();
  const indexerResult = await runIndexerRefresh(networks);
  const scanResult = await runFullScan(networks, triggerReason);
  const durationMs = Math.round(performance.now() - start);

  const opportunitiesFound = scanResult.found ?? 0;
  const error = !scanResult.success ? scanResult.error : undefined;
  await logSchedulerRun(opportunitiesFound, durationMs, triggerReason, networks, scanResult.diagnostics, scanResult.readinessGates, error);

  console.log(`[cron] pipeline done in ${durationMs}ms | seed=${seedResult.seeded} indexer=${indexerResult.pairsScanned ?? 0} pairs | scan found=${opportunitiesFound} watchlist=${scanResult.watchlist ?? 0}`);

  return { seedResult, indexerResult, scanResult, durationMs, triggerReason };
};

// --- Cron registration -------------------------------------------------------
const scheduleExpression = Deno.env.get('CRON_SCHEDULE_EXPRESSION') || '*/5 * * * *';
const defaultNetworks = (Deno.env.get('CRON_NETWORKS') || 'ethereum,arbitrum,base,polygon')
  .split(',').map((s) => s.trim()).filter(Boolean);

const denoWithCron = Deno as unknown as { cron?: (name: string, cron: string, fn: () => Promise<void>) => void };
if (typeof denoWithCron.cron === 'function') {
  denoWithCron.cron('cron-scheduler-24-7', scheduleExpression, () => runPipeline(defaultNetworks, 'cron').catch(console.error));
}

// --- HTTP handler ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as { networks?: string[]; manualTrigger?: boolean; triggerReason?: string };
    const networks = Array.isArray(body.networks) && body.networks.length > 0
      ? body.networks
      : defaultNetworks;
    const triggerReason = typeof body.triggerReason === 'string' && body.triggerReason.trim()
      ? body.triggerReason.trim()
      : body.manualTrigger
        ? 'manual'
        : 'http';

    const result = await runPipeline(networks, triggerReason);

    return new Response(
      JSON.stringify({
        success: true,
        manualTrigger: body.manualTrigger ?? false,
        triggerReason,
        networks,
        pipeline: result,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
