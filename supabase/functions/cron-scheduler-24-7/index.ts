import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNI_V3_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const SUSHI_SUBGRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange';

const UNI_V3_SUBGRAPH = Deno.env.get('THEGRAPH_UNI_V3') ||
  (Deno.env.get('THEGRAPH_API_KEY')
    ? `https://gateway.thegraph.com/api/${Deno.env.get('THEGRAPH_API_KEY')}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`
    : UNI_V3_SUBGRAPH_PUBLIC);

const SUSHI_SUBGRAPH = Deno.env.get('THEGRAPH_SUSHI') ||
  (Deno.env.get('THEGRAPH_API_KEY')
    ? `https://gateway.thegraph.com/api/${Deno.env.get('THEGRAPH_API_KEY')}/subgraphs/id/6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT`
    : SUSHI_SUBGRAPH_PUBLIC);

const fetchSubgraph = async (url: string, query: string) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Subgraph error ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
};

const fetchSubgraphWithFallback = async (primaryUrl: string, fallbackUrl: string, query: string) => {
  try {
    return await fetchSubgraph(primaryUrl, query);
  } catch (primaryError) {
    if (primaryUrl !== fallbackUrl) {
      console.warn(`Primary subgraph failed, retrying fallback: ${primaryUrl}`);
      try {
        return await fetchSubgraph(fallbackUrl, query);
      } catch {
        // Re-throw the primary error for clearer diagnostics.
      }
    }
    throw primaryError;
  }
};

interface SubgraphPool {
  token0: { symbol: string };
  token1: { symbol: string };
  token1Price?: string;
}

const topPairsQuery = (limit = 10) => `
{
  pools(first: ${limit}, orderBy: volumeUSD, orderDirection: desc) {
    token0 { symbol }
    token1 { symbol }
    token0Price
    token1Price
  }
}`;

const runScan = async () => {
  const [uniResult, sushiResult] = await Promise.allSettled([
    fetchSubgraphWithFallback(UNI_V3_SUBGRAPH, UNI_V3_SUBGRAPH_PUBLIC, topPairsQuery(15)),
    fetchSubgraphWithFallback(SUSHI_SUBGRAPH, SUSHI_SUBGRAPH_PUBLIC, topPairsQuery(15)),
  ]);

  if (uniResult.status === 'rejected') {
    console.error('Uniswap V3 subgraph fetch failed:', uniResult.reason);
  }
  if (sushiResult.status === 'rejected') {
    console.error('Sushi subgraph fetch failed:', sushiResult.reason);
  }

  const uniData = uniResult.status === 'fulfilled' ? uniResult.value : { pools: [] };
  const sushiData = sushiResult.status === 'fulfilled' ? sushiResult.value : { pools: [] };

  const uniPools = (uniData?.pools || []) as SubgraphPool[];
  const sushiPools = (sushiData?.pools || []) as SubgraphPool[];

  const map = new Map<string, number>();
  for (const p of uniPools) {
    const key = `${p.token0.symbol}/${p.token1.symbol}`;
    const price = parseFloat(p.token1Price || '0');
    if (price > 0) map.set(key, price);
  }
  let opps = 0;
  const opportunities: Array<{ pair: string; spread: number; uniPrice: number; sushiPrice: number }> = [];
  for (const p of sushiPools) {
    const key = `${p.token0.symbol}/${p.token1.symbol}`;
    const price = parseFloat(p.token1Price || '0');
    const uniPrice = map.get(key);
    if (!uniPrice || price <= 0) continue;
    const spread = ((Math.max(uniPrice, price) - Math.min(uniPrice, price)) / Math.min(uniPrice, price)) * 100;
    if (spread > 0.08) {
      opps++;
      opportunities.push({ pair: key, spread, uniPrice, sushiPrice: price });
    }
  }
  return { count: opps, opportunities };
};

// Trigger the full scanner when opportunities are detected
const triggerFullScan = async (): Promise<{ triggered: boolean; result?: unknown; error?: string }> => {
  if (!SUPABASE_URL) return { triggered: false, error: 'No SUPABASE_URL configured' };
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || SUPABASE_SERVICE_ROLE_KEY || '';
  if (!anonKey) return { triggered: false, error: 'No auth key available' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-arbitrage-opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ triggeredBy: 'cron-scheduler-24-7' }),
    });
    const data = await res.json().catch(() => ({}));
    return { triggered: true, result: data };
  } catch (err) {
    return { triggered: false, error: err instanceof Error ? err.message : 'trigger failed' };
  }
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } } })
  : null;

const logSchedulerRun = async (
  opportunitiesFound: number,
  durationMs: number,
  error?: string,
) => {
  if (!supabase) return;
  const scanTimestamp = new Date().toISOString();
  const status = error ? 'failed' : 'success';
  const insertPayload = {
    user_id: 'default',
    scan_timestamp: scanTimestamp,
    scan_type: 'scheduled',
    opportunities_found: Math.max(opportunitiesFound, 0),
    execution_time_ms: durationMs,
    status,
    error_message: error ?? null,
  };
  try {
    await supabase.from('scheduler_24_7_logs').insert(insertPayload);
    await supabase
      .from('scheduler_24_7_config')
      .update({
        last_cron_run_at: scanTimestamp,
      })
      .eq('user_id', 'default');
  } catch (_e) {
    // Swallow logging errors to avoid failing the cron execution
  }
};

const scheduleExpression = Deno.env.get('CRON_SCHEDULE_EXPRESSION') || '*/5 * * * *';

// Register server-side cron to keep scanning without manual triggers
const denoWithCron = Deno as unknown as {
  cron?: (name: string, cron: string, callback: () => Promise<void>) => void;
};

if (typeof denoWithCron.cron === 'function') {
  denoWithCron.cron('cron-scheduler-24-7', scheduleExpression, async () => {
    const start = performance.now();
    try {
      const { count: opportunitiesFound } = await runScan();
      const durationMs = Math.round(performance.now() - start);
      await logSchedulerRun(opportunitiesFound, durationMs);
      if (opportunitiesFound > 0) {
        const trigger = await triggerFullScan();
        console.log(`Cron triggered full scan: ${JSON.stringify(trigger)}`);
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logSchedulerRun(0, durationMs, message);
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const manualTrigger = Boolean(body.manualTrigger);

    const { count: opportunitiesFound, opportunities } = await runScan();
    let scanTrigger: { triggered: boolean; result?: unknown; error?: string } | null = null;
    if (opportunitiesFound > 0) {
      scanTrigger = await triggerFullScan();
    }

    return new Response(
      JSON.stringify({
        success: true,
        manualTrigger,
        results: {
          opportunitiesFound,
          topOpportunities: opportunities.sort((a, b) => b.spread - a.spread).slice(0, 5),
          scanTriggered: scanTrigger,
        },
        message: opportunitiesFound > 0
          ? `Found ${opportunitiesFound} opportunities, full scan triggered`
          : 'Scanner executed server-side, no actionable opportunities',
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
