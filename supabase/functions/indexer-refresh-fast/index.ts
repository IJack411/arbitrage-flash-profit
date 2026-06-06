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

type SourceName = 'subgraph' | 'dexscreener' | 'gecko' | 'rpc';
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

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  baseToken?: { symbol?: string; address?: string };
  quoteToken?: { symbol?: string; address?: string };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
});

const DEFAULT_NETWORKS = ['ethereum', 'arbitrum', 'base', 'polygon'];

const CHAIN_ALIASES: Record<string, string[]> = {
  ethereum: ['ethereum', 'eth'],
  arbitrum: ['arbitrum', 'arbitrum-one'],
  base: ['base'],
  polygon: ['polygon', 'matic'],
  bsc: ['bsc', 'bnb'],
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
  const [, pairPart = ''] = String(tokenPair || '').split(':');
  const [tokenA = '', tokenB = ''] = pairPart.split('/');
  return { tokenA: tokenA.trim().toUpperCase(), tokenB: tokenB.trim().toUpperCase() };
};

const networkMatches = (network: string, chainId: string): boolean => {
  const aliases = CHAIN_ALIASES[network] || [network];
  const normalizedChain = String(chainId || '').toLowerCase();
  return aliases.some((alias) => normalizedChain === alias || normalizedChain.includes(alias));
};

const normalizeDexName = (dexId: string): string => {
  const normalized = String(dexId || '').toLowerCase();
  if (normalized.includes('uniswap-v3') || normalized.includes('uni-v3')) return 'Uniswap V3';
  if (normalized.includes('uniswap-v2') || normalized.includes('uni-v2')) return 'Uniswap V2';
  if (normalized.includes('sushi')) return 'SushiSwap';
  if (normalized.includes('balancer')) return 'Balancer';
  if (normalized.includes('curve')) return 'Curve';
  return normalized || 'Unknown';
};

const fetchDexScreenerPairs = async (network: string, tokenA: string, tokenB: string): Promise<DexScreenerPair[]> => {
  const terms = [`${tokenA} ${tokenB}`, `${tokenB} ${tokenA}`];
  const outputs: DexScreenerPair[] = [];

  for (const term of terms) {
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`;
    const response = await fetch(url);
    if (!response.ok) continue;
    const json = await response.json().catch(() => ({}));
    const pairs = Array.isArray(json?.pairs) ? (json.pairs as DexScreenerPair[]) : [];
    for (const pair of pairs) {
      if (!networkMatches(network, String(pair.chainId || ''))) continue;
      const base = String(pair.baseToken?.symbol || '').toUpperCase();
      const quote = String(pair.quoteToken?.symbol || '').toUpperCase();
      if (!((base === tokenA && quote === tokenB) || (base === tokenB && quote === tokenA))) continue;
      outputs.push(pair);
    }
  }

  const dedup = new Map<string, DexScreenerPair>();
  for (const pair of outputs) {
    const key = `${pair.pairAddress || ''}:${pair.dexId || ''}`;
    if (!dedup.has(key)) dedup.set(key, pair);
  }
  return Array.from(dedup.values());
};

const buildPoolRows = (network: string, pairs: DexScreenerPair[], latencyMs: number) => {
  const rows: Array<Record<string, unknown>> = [];
  for (const pair of pairs) {
    const base = String(pair.baseToken?.symbol || '').toUpperCase();
    const quote = String(pair.quoteToken?.symbol || '').toUpperCase();
    const priceUsd = toNumberSafe(pair.priceUsd, 0);
    const liquidityUsd = toNumberSafe(pair.liquidity?.usd, 0);
    if (!base || !quote || priceUsd <= 0 || liquidityUsd <= 0) continue;

    rows.push({
      network,
      dex: normalizeDexName(String(pair.dexId || '')),
      pool_address: String(pair.pairAddress || ''),
      token0_symbol: base,
      token1_symbol: quote,
      token0_address: pair.baseToken?.address || null,
      token1_address: pair.quoteToken?.address || null,
      fee_tier: null,
      liquidity_usd: liquidityUsd,
      token0_price: priceUsd,
      token1_price: priceUsd > 0 ? 1 / priceUsd : null,
      source: 'dexscreener' as SourceName,
      indexed_at: nowIso(),
      freshness_ms: latencyMs,
      metadata: { chainId: pair.chainId || null },
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
        source: 'dexscreener' as SourceName,
        indexed_at: nowIso(),
        freshness_ms: 0,
        metadata: {},
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
      source_name: 'dexscreener',
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
      let fetchedPairs: DexScreenerPair[] = [];
      let ok = false;
      try {
        fetchedPairs = await fetchDexScreenerPairs(pair.network, tokenA, tokenB);
        ok = true;
      } catch {
        ok = false;
      }
      const latencyMs = Date.now() - fetchStart;

      await updateSourceHealth(pair.network, ok, latencyMs);
      if (!ok || fetchedPairs.length === 0) {
        await touchHotPair(pair.network, pair.token_pair, mode);
        continue;
      }

      const poolRows = buildPoolRows(pair.network, fetchedPairs, latencyMs);
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
