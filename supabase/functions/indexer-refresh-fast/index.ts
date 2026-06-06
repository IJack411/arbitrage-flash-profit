// indexer-refresh-fast: fetches pool data from The Graph subgraphs and writes
// to quotes_index_latest / pools_index_latest for scanner index read-through.
// DexScreener removed — it aggregates prices and masks cross-DEX spreads.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SourceName = 'subgraph' | 'gecko' | 'rpc';
type RunMode = 'fast' | 'medium' | 'reconcile';

type RefreshRequest = {
  mode?: RunMode;
  networks?: string[];
  maxPairs?: number;
  force?: boolean;
};

type HotPairRow = {
  network: string;
  token_pair: string;
  priority_score: number;
};

// Pool result normalized from any subgraph schema
type SubgraphPool = {
  id: string;
  dex: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Price: number;  // token1 per token0
  token1Price: number;  // token0 per token1
  liquidityUsd: number;
  feeTier?: number;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const THEGRAPH_API_KEY = (Deno.env.get('THEGRAPH_API_KEY') || '').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
});

const DEFAULT_NETWORKS = ['ethereum', 'arbitrum', 'base', 'polygon'];

const GRAPH_GATEWAY = 'https://gateway.thegraph.com/api';
const GRAPH_PUBLIC = 'https://api.thegraph.com/subgraphs/name';
const LEGACY_HOST = 'api.thegraph.com/subgraphs/name/';

type SubgraphConfig = {
  dex: string;
  version: 'v3' | 'v2';
  gatewayId?: string;        // The Graph decentralized network ID (preferred when THEGRAPH_API_KEY set)
  publicUrl?: string;        // Legacy hosted fallback
  envOverrideKey?: string;   // Env var that can override URL entirely
};

// Subgraph configs. gatewayId matches scanner scan-arbitrage-opportunities/index.ts.
// For Ethereum mainnet: Uniswap V3/V2 + SushiSwap.
// For other chains: best available The Graph coverage.
const SUBGRAPHS_BY_NETWORK: Record<string, SubgraphConfig[]> = {
  ethereum: [
    {
      dex: 'Uniswap V3',
      version: 'v3',
      gatewayId: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
      publicUrl: `${GRAPH_PUBLIC}/uniswap/uniswap-v3`,
      envOverrideKey: 'THEGRAPH_UNI_V3',
    },
    {
      dex: 'Uniswap V2',
      version: 'v2',
      gatewayId: 'EYCKATKGBKLWvSfwvBjzfCBmGwYNdVkduYXVivCsLRFu',
      publicUrl: `${GRAPH_PUBLIC}/uniswap/uniswap-v2`,
      envOverrideKey: 'THEGRAPH_UNI_V2',
    },
    {
      dex: 'SushiSwap',
      version: 'v2',
      gatewayId: '6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT',
      publicUrl: `${GRAPH_PUBLIC}/sushiswap/exchange`,
      envOverrideKey: 'THEGRAPH_SUSHI',
    },
  ],
  arbitrum: [
    {
      dex: 'Uniswap V3',
      version: 'v3',
      gatewayId: 'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aFM',
      publicUrl: `${GRAPH_PUBLIC}/ianlapham/arbitrum-minimal`,
    },
    {
      dex: 'SushiSwap',
      version: 'v2',
      gatewayId: 'H9oPAbXnobBRq1BD1X35yz7frgZZa4cTqe5uiMobJ4kk',
      publicUrl: `${GRAPH_PUBLIC}/sushiswap/exchange-arbitrum-nova`,
    },
  ],
  base: [
    {
      dex: 'Uniswap V3',
      version: 'v3',
      gatewayId: '43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG',
      publicUrl: `${GRAPH_PUBLIC}/papavram/base-uniswap-v3`,
    },
  ],
  polygon: [
    {
      dex: 'Uniswap V3',
      version: 'v3',
      gatewayId: '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm',
      publicUrl: `${GRAPH_PUBLIC}/ianlapham/uniswap-v3-polygon`,
    },
    {
      dex: 'QuickSwap',
      version: 'v2',
      publicUrl: `${GRAPH_PUBLIC}/sameepsi/quickswap`,
    },
    {
      dex: 'SushiSwap',
      version: 'v2',
      gatewayId: 'Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g',
      publicUrl: `${GRAPH_PUBLIC}/sushiswap/exchange-polygon`,
    },
  ],
};

const resolveEndpoint = (cfg: SubgraphConfig): string => {
  const override = cfg.envOverrideKey ? (Deno.env.get(cfg.envOverrideKey) || '').trim() : '';
  const overrideIsLegacy = override.includes(LEGACY_HOST);
  if (THEGRAPH_API_KEY && cfg.gatewayId && (!override || overrideIsLegacy)) {
    return `${GRAPH_GATEWAY}/${THEGRAPH_API_KEY}/subgraphs/id/${cfg.gatewayId}`;
  }
  return override || cfg.publicUrl || '';
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const nowIso = () => new Date().toISOString();

const parsePair = (tokenPair: string): { tokenA: string; tokenB: string } => {
  // Handle both 'ethereum:WETH/USDC' and 'WETH/USDC' formats
  const pairPart = String(tokenPair || '').includes(':')
    ? String(tokenPair).split(':')[1]
    : String(tokenPair);
  const [tokenA = '', tokenB = ''] = (pairPart || '').split('/');
  return { tokenA: tokenA.trim().toUpperCase(), tokenB: tokenB.trim().toUpperCase() };
};

// Fetch pools from a Uniswap V3-style subgraph (pools entity, totalValueLockedUSD)
const fetchV3Pools = async (
  endpoint: string,
  dex: string,
  tokenA: string,
  tokenB: string,
): Promise<SubgraphPool[]> => {
  if (!endpoint) return [];
  const query = `{
    ab: pools(
      where: { token0_: { symbol: "${tokenA}" }, token1_: { symbol: "${tokenB}" } }
      orderBy: totalValueLockedUSD orderDirection: desc first: 4
    ) { id feeTier token0Price token1Price totalValueLockedUSD token0 { symbol } token1 { symbol } }
    ba: pools(
      where: { token0_: { symbol: "${tokenB}" }, token1_: { symbol: "${tokenA}" } }
      orderBy: totalValueLockedUSD orderDirection: desc first: 4
    ) { id feeTier token0Price token1Price totalValueLockedUSD token0 { symbol } token1 { symbol } }
  }`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({})) as {
    data?: {
      ab?: Array<{ id: string; feeTier?: string; token0Price: string; token1Price: string; totalValueLockedUSD: string; token0: { symbol: string }; token1: { symbol: string } }>;
      ba?: Array<{ id: string; feeTier?: string; token0Price: string; token1Price: string; totalValueLockedUSD: string; token0: { symbol: string }; token1: { symbol: string } }>;
    };
  };

  const results: SubgraphPool[] = [];
  for (const raw of [...(json.data?.ab ?? []), ...(json.data?.ba ?? [])]) {
    const t0Price = toNumberSafe(raw.token0Price, 0);
    const t1Price = toNumberSafe(raw.token1Price, 0);
    const liq = toNumberSafe(raw.totalValueLockedUSD, 0);
    if (t0Price <= 0 || liq <= 0) continue;
    results.push({
      id: raw.id,
      dex,
      token0Symbol: raw.token0.symbol.toUpperCase(),
      token1Symbol: raw.token1.symbol.toUpperCase(),
      token0Price: t0Price,
      token1Price: t1Price,
      liquidityUsd: liq,
      feeTier: raw.feeTier ? Number(raw.feeTier) : undefined,
    });
  }
  return results;
};

// Fetch pools from a Uniswap V2-style subgraph (pairs entity, reserveUSD)
const fetchV2Pools = async (
  endpoint: string,
  dex: string,
  tokenA: string,
  tokenB: string,
): Promise<SubgraphPool[]> => {
  if (!endpoint) return [];
  const query = `{
    ab: pairs(
      where: { token0_: { symbol: "${tokenA}" }, token1_: { symbol: "${tokenB}" } }
      orderBy: reserveUSD orderDirection: desc first: 4
    ) { id token0Price token1Price reserveUSD token0 { symbol } token1 { symbol } }
    ba: pairs(
      where: { token0_: { symbol: "${tokenB}" }, token1_: { symbol: "${tokenA}" } }
      orderBy: reserveUSD orderDirection: desc first: 4
    ) { id token0Price token1Price reserveUSD token0 { symbol } token1 { symbol } }
  }`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({})) as {
    data?: {
      ab?: Array<{ id: string; token0Price: string; token1Price: string; reserveUSD: string; token0: { symbol: string }; token1: { symbol: string } }>;
      ba?: Array<{ id: string; token0Price: string; token1Price: string; reserveUSD: string; token0: { symbol: string }; token1: { symbol: string } }>;
    };
  };

  const results: SubgraphPool[] = [];
  for (const raw of [...(json.data?.ab ?? []), ...(json.data?.ba ?? [])]) {
    const t0Price = toNumberSafe(raw.token0Price, 0);
    const t1Price = toNumberSafe(raw.token1Price, 0);
    const liq = toNumberSafe(raw.reserveUSD, 0);
    if (t0Price <= 0 || liq <= 0) continue;
    results.push({
      id: raw.id,
      dex,
      token0Symbol: raw.token0.symbol.toUpperCase(),
      token1Symbol: raw.token1.symbol.toUpperCase(),
      token0Price: t0Price,
      token1Price: t1Price,
      liquidityUsd: liq,
    });
  }
  return results;
};

// Fetch from all subgraphs for a network, dedup by pool address, take highest-liquidity per DEX
const fetchSubgraphPools = async (
  network: string,
  tokenA: string,
  tokenB: string,
): Promise<{ pools: SubgraphPool[]; subgraphsQueried: number; subgraphsFailed: number }> => {
  const configs = SUBGRAPHS_BY_NETWORK[network] ?? [];
  const allPools: SubgraphPool[] = [];
  let queried = 0;
  let failed = 0;

  await Promise.all(
    configs.map(async (cfg) => {
      const endpoint = resolveEndpoint(cfg);
      if (!endpoint) return;
      queried += 1;
      try {
        const pools = cfg.version === 'v3'
          ? await fetchV3Pools(endpoint, cfg.dex, tokenA, tokenB)
          : await fetchV2Pools(endpoint, cfg.dex, tokenA, tokenB);
        allPools.push(...pools);
      } catch {
        failed += 1;
      }
    }),
  );

  // Dedup: keep highest-liquidity pool per (dex, token-pair-direction)
  const bestByDex = new Map<string, SubgraphPool>();
  for (const pool of allPools) {
    const key = `${pool.dex}`;
    const existing = bestByDex.get(key);
    if (!existing || pool.liquidityUsd > existing.liquidityUsd) {
      bestByDex.set(key, pool);
    }
  }

  return {
    pools: Array.from(bestByDex.values()),
    subgraphsQueried: queried,
    subgraphsFailed: failed,
  };
};

const buildPoolRows = (network: string, pools: SubgraphPool[], latencyMs: number): Array<Record<string, unknown>> => {
  const rows: Array<Record<string, unknown>> = [];
  for (const pool of pools) {
    if (pool.token0Price <= 0 || pool.liquidityUsd <= 0) continue;
    rows.push({
      network,
      dex: pool.dex,
      pool_address: pool.id,
      token0_symbol: pool.token0Symbol,
      token1_symbol: pool.token1Symbol,
      token0_address: null,
      token1_address: null,
      fee_tier: pool.feeTier ?? null,
      liquidity_usd: pool.liquidityUsd,
      token0_price: pool.token0Price,
      token1_price: pool.token1Price > 0 ? pool.token1Price : (pool.token0Price > 0 ? 1 / pool.token0Price : null),
      source: 'subgraph' as SourceName,
      indexed_at: nowIso(),
      freshness_ms: latencyMs,
      metadata: {},
    });
  }
  return rows;
};

const buildQuoteRows = (network: string, tokenPair: string, poolRows: Array<Record<string, unknown>>) => {
  const byDex = new Map<string, { price: number; liquidity: number }>();

  for (const row of poolRows) {
    const dex = String(row.dex || 'Unknown');
    const price = toNumberSafe(row.token0_price, 0);
    const liq = toNumberSafe(row.liquidity_usd, 0);
    if (price <= 0 || liq <= 0) continue;

    const existing = byDex.get(dex);
    if (!existing || liq > existing.liquidity) {
      byDex.set(dex, { price, liquidity: liq });
    }
  }

  const dexes = Array.from(byDex.entries());
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < dexes.length; i += 1) {
    for (let j = i + 1; j < dexes.length; j += 1) {
      const [dexA, a] = dexes[i];
      const [dexB, b] = dexes[j];
      if (!(a.price > 0 && b.price > 0)) continue;
      const buyDex = a.price < b.price ? dexA : dexB;
      const sellDex = a.price < b.price ? dexB : dexA;
      const buy = a.price < b.price ? a : b;
      const sell = a.price < b.price ? b : a;
      const spreadBps = ((sell.price - buy.price) / buy.price) * 10_000;
      if (!Number.isFinite(spreadBps) || spreadBps <= 0) continue;

      rows.push({
        network,
        token_pair: tokenPair.toLowerCase(),
        buy_dex: buyDex,
        sell_dex: sellDex,
        buy_price: buy.price,
        sell_price: sell.price,
        spread_bps: spreadBps,
        buy_liquidity_usd: buy.liquidity,
        sell_liquidity_usd: sell.liquidity,
        source: 'subgraph' as SourceName,
        indexed_at: nowIso(),
        freshness_ms: 0,
      });
    }
  }

  return rows;
};

const getHotPairs = async (networks: string[], maxPairs: number, force: boolean): Promise<HotPairRow[]> => {
  let query = supabase
    .from('hot_pairs_queue')
    .select('network,token_pair,priority_score')
    .in('network', networks)
    .order('priority_score', { ascending: false })
    .order('next_refresh_at', { ascending: true })
    .limit(maxPairs);

  if (!force) {
    query = query.lte('next_refresh_at', nowIso());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as HotPairRow[];
};

const upsertRows = async (table: string, rows: Array<Record<string, unknown>>, onConflict: string): Promise<number> => {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: false });
  if (error) throw error;
  return rows.length;
};

const updateSourceHealth = async (network: string, ok: boolean, latencyMs: number) => {
  const { error } = await supabase.from('source_health_index').upsert([
    {
      source_name: 'thegraph',
      network,
      success_rate_5m: ok ? 1 : 0,
      p95_latency_ms: Math.round(clamp(latencyMs, 0, 120000)),
      error_rate_5m: ok ? 0 : 1,
      last_ok_at: ok ? nowIso() : null,
      updated_at: nowIso(),
      metadata: {},
    },
  ], { onConflict: 'source_name,network', ignoreDuplicates: false });

  if (error) throw error;
};

const touchHotPair = async (network: string, tokenPair: string, mode: RunMode) => {
  const nextSeconds = mode === 'fast' ? 15 : mode === 'medium' ? 60 : 300;
  const nextRefreshAt = new Date(Date.now() + nextSeconds * 1000).toISOString();
  const { error } = await supabase
    .from('hot_pairs_queue')
    .update({
      last_scanned_at: nowIso(),
      next_refresh_at: nextRefreshAt,
      updated_at: nowIso(),
    })
    .eq('network', network)
    .eq('token_pair', tokenPair);

  if (error) throw error;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const body = (await req.json().catch(() => ({}))) as RefreshRequest;
    const mode: RunMode = body.mode || 'fast';
    const networks = (Array.isArray(body.networks) && body.networks.length > 0 ? body.networks : DEFAULT_NETWORKS)
      .map((item) => String(item || '').toLowerCase())
      .filter(Boolean);
    const maxPairs = Math.max(10, Math.min(500, Math.round(toNumberSafe(body.maxPairs, mode === 'fast' ? 100 : 250))));
    const force = body.force === true;

    const startedAt = Date.now();
    const hotPairs = await getHotPairs(networks, maxPairs, force);

    let poolsUpserted = 0;
    let quotesUpserted = 0;

    for (const pair of hotPairs) {
      const { tokenA, tokenB } = parsePair(pair.token_pair);
      if (!tokenA || !tokenB) continue;

      const fetchStart = Date.now();
      let subgraphResult: { pools: SubgraphPool[]; subgraphsQueried: number; subgraphsFailed: number } = {
        pools: [], subgraphsQueried: 0, subgraphsFailed: 0,
      };
      let ok = false;
      try {
        subgraphResult = await fetchSubgraphPools(pair.network, tokenA, tokenB);
        ok = subgraphResult.pools.length > 0;
      } catch {
        ok = false;
      }
      const latencyMs = Date.now() - fetchStart;

      await updateSourceHealth(pair.network, ok, latencyMs);
      if (!ok || subgraphResult.pools.length === 0) {
        await touchHotPair(pair.network, pair.token_pair, mode);
        continue;
      }

      const poolRows = buildPoolRows(pair.network, subgraphResult.pools, latencyMs);
      poolsUpserted += await upsertRows('pools_index_latest', poolRows, 'network,dex,pool_address');

      const quoteRows = buildQuoteRows(pair.network, pair.token_pair, poolRows);
      quotesUpserted += await upsertRows('quotes_index_latest', quoteRows, 'network,token_pair,buy_dex,sell_dex');

      await touchHotPair(pair.network, pair.token_pair, mode);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        pairsScanned: hotPairs.length,
        rowsUpserted: {
          pools_index_latest: poolsUpserted,
          quotes_index_latest: quotesUpserted,
        },
        durationMs: Date.now() - startedAt,
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
