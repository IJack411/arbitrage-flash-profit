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
// Mirrors shared/networks-tokens.ts SEARCH_TERMS_BY_NETWORK.
const PRIORITY_PAIRS_BY_NETWORK: Record<string, string[]> = {
  ethereum: ['WETH/USDC', 'WETH/USDT', 'WETH/DAI', 'WBTC/USDC', 'WBTC/USDT', 'LINK/USDC', 'DAI/USDC', 'USDC/USDT'],
  arbitrum: ['WETH/USDC', 'WETH/USDT', 'ARB/USDC', 'GMX/USDC', 'LINK/USDC', 'DAI/USDC', 'USDC/USDT'],
  base:     ['WETH/USDC', 'WETH/USDT', 'LINK/USDC', 'AERO/USDC', 'USDC/USDT'],
  polygon:  ['WMATIC/USDC', 'WMATIC/USDT', 'WETH/USDC', 'LINK/USDC', 'AAVE/USDC', 'DAI/USDC', 'USDC/USDT'],
  bsc:      ['WBNB/USDT', 'WBNB/USDC', 'ETH/USDT', 'CAKE/USDT', 'USDC/USDT'],
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    })
  : null;

// --- Hot pairs seeding -------------------------------------------------------
// Ensures hot_pairs_queue has entries so indexer-refresh-fast can work.
const seedHotPairsIfEmpty = async (): Promise<{ seeded: number }> => {
  if (!supabase) return { seeded: 0 };
  try {
    const { count } = await supabase
      .from('hot_pairs_queue')
      .select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) return { seeded: 0 };

    const rows: { network: string; token_pair: string; priority_score: number; reason: string }[] = [];
    for (const [network, pairs] of Object.entries(PRIORITY_PAIRS_BY_NETWORK)) {
      for (let i = 0; i < pairs.length; i++) {
        rows.push({
          network,
          token_pair: pairs[i],
          priority_score: pairs.length - i,
          reason: 'initial-seed',
        });
      }
    }

    const { error } = await supabase
      .from('hot_pairs_queue')
      .upsert(rows, { onConflict: 'network,token_pair', ignoreDuplicates: true });

    if (error) {
      console.error('[cron] hot_pairs_queue seed error:', error.message);
      return { seeded: 0 };
    }
    console.log(`[cron] Seeded ${rows.length} priority pairs into hot_pairs_queue`);
    return { seeded: rows.length };
  } catch (e) {
    console.error('[cron] seedHotPairs exception:', e);
    return { seeded: 0 };
  }
};

// --- Indexer refresh ---------------------------------------------------------
// Calls indexer-refresh-fast to write fresh DexScreener data into quotes_index_latest.
const runIndexerRefresh = async (networks: string[]): Promise<{ success: boolean; pairsScanned?: number; error?: string }> => {
  if (!SUPABASE_URL) return { success: false, error: 'No SUPABASE_URL' };
  const authKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!authKey) return { success: false, error: 'No auth key' };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/indexer-refresh-fast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: authKey,
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({ mode: 'fast', networks }),
    });
    if (!res.ok) return { success: false, error: `indexer returned ${res.status}` };
    const data = await res.json().catch(() => ({})) as { pairsScanned?: number };
    return { success: true, pairsScanned: data?.pairsScanned ?? 0 };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'indexer call failed' };
  }
};

// --- Full scanner call -------------------------------------------------------
// Always runs — independent of any pre-scan result.
const runFullScan = async (networks: string[]): Promise<{ success: boolean; found?: number; watchlist?: number; error?: string }> => {
  if (!SUPABASE_URL) return { success: false, error: 'No SUPABASE_URL' };
  const authKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!authKey) return { success: false, error: 'No auth key' };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-arbitrage-opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: authKey,
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({ triggeredBy: 'cron-scheduler-24-7', networks }),
    });
    if (!res.ok) return { success: false, error: `scanner returned ${res.status}` };
    const data = await res.json().catch(() => ({})) as { found?: number; watchlistCount?: number; success?: boolean; error?: string };
    if (!data?.success) return { success: false, error: data?.error || 'scanner returned success=false' };
    return { success: true, found: data.found ?? 0, watchlist: data.watchlistCount ?? 0 };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'scanner call failed' };
  }
};

// --- Logging -----------------------------------------------------------------
const logSchedulerRun = async (
  opportunitiesFound: number,
  durationMs: number,
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
      execution_time_ms: durationMs,
      status: error ? 'failed' : 'success',
      error_message: error ?? null,
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
const runPipeline = async (networks: string[]) => {
  const start = performance.now();
  const seedResult = await seedHotPairsIfEmpty();
  const indexerResult = await runIndexerRefresh(networks);
  const scanResult = await runFullScan(networks);
  const durationMs = Math.round(performance.now() - start);

  const opportunitiesFound = scanResult.found ?? 0;
  const error = !scanResult.success ? scanResult.error : undefined;
  await logSchedulerRun(opportunitiesFound, durationMs, error);

  console.log(`[cron] pipeline done in ${durationMs}ms | seed=${seedResult.seeded} indexer=${indexerResult.pairsScanned ?? 0} pairs | scan found=${opportunitiesFound} watchlist=${scanResult.watchlist ?? 0}`);

  return { seedResult, indexerResult, scanResult, durationMs };
};

// --- Cron registration -------------------------------------------------------
const scheduleExpression = Deno.env.get('CRON_SCHEDULE_EXPRESSION') || '*/5 * * * *';
const defaultNetworks = (Deno.env.get('CRON_NETWORKS') || 'ethereum,arbitrum,base,polygon')
  .split(',').map((s) => s.trim()).filter(Boolean);

const denoWithCron = Deno as unknown as { cron?: (name: string, cron: string, fn: () => Promise<void>) => void };
if (typeof denoWithCron.cron === 'function') {
  denoWithCron.cron('cron-scheduler-24-7', scheduleExpression, () => runPipeline(defaultNetworks).catch(console.error));
}

// --- HTTP handler ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as { networks?: string[]; manualTrigger?: boolean };
    const networks = Array.isArray(body.networks) && body.networks.length > 0
      ? body.networks
      : defaultNetworks;

    const result = await runPipeline(networks);

    return new Response(
      JSON.stringify({
        success: true,
        manualTrigger: body.manualTrigger ?? false,
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
