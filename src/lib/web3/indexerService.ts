import { ethers } from 'ethers';
import { getUnifiedConfig } from './unifiedApiConfig';

export interface IndexedBlock {
  number: number;
  timestamp: number;
  transactions: number;
  gasUsed: string;
}


export interface PoolData {
  id: string;
  token0: { symbol: string; id: string };
  token1: { symbol: string; id: string };
  liquidity: string;
  token0Price: string;
  token1Price: string;
  volumeUSD: string;
  feeTier?: number;
}

export interface IndexerStats {
  queriesPerSecond: number;
  cacheHitRate: number;
  avgLatency: number;
  activeConnections: number;
  lastUpdate: number;
}

class EnhancedIndexerService {
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private stats: IndexerStats = { queriesPerSecond: 0, cacheHitRate: 0, avgLatency: 0, activeConnections: 0, lastUpdate: Date.now() };
  private queryCount = 0;
  private cacheHits = 0;
  private latencies: number[] = [];

  // GraphQL query to The Graph
  async querySubgraph<T = unknown>(subgraph: string, query: string): Promise<T | null> {
    const config = getUnifiedConfig();
    const url = config.theGraph.subgraphs[subgraph]?.replace('{key}', config.theGraph.apiKey);
    if (!url) throw new Error(`Unknown subgraph: ${subgraph}`);

    const cacheKey = `${subgraph}:${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      this.cacheHits++;
      return cached.data as T;
    }

    const start = Date.now();
    this.queryCount++;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { data?: T };
      this.latencies.push(Date.now() - start);
      if (this.latencies.length > 100) this.latencies.shift();
      
      // Cache for 5 seconds
      this.cache.set(cacheKey, { data: data.data, expiry: Date.now() + 5000 });
      return data.data ?? null;
    } catch (e) {
      console.error('Subgraph query failed:', e);
      return null;
    }
  }

  // Get top pools from Uniswap V3
  async getTopPools(limit = 20): Promise<PoolData[]> {
    const query = `{ pools(first: ${limit}, orderBy: liquidity, orderDirection: desc) { id token0 { symbol id } token1 { symbol id } liquidity token0Price token1Price volumeUSD feeTier } }`;
    const data = await this.querySubgraph('uniswapV3', query);
    return data?.pools || [];
  }

  // Get pool by token pair
  async getPoolByPair(token0: string, token1: string): Promise<PoolData | null> {
    const query = `{ pools(where: { token0: "${token0.toLowerCase()}", token1: "${token1.toLowerCase()}" }, first: 1, orderBy: liquidity, orderDirection: desc) { id token0 { symbol id } token1 { symbol id } liquidity token0Price token1Price volumeUSD feeTier } }`;
    const data = await this.querySubgraph('uniswapV3', query);
    return data?.pools?.[0] || null;
  }

  // Parallel fetch from multiple sources
  async fetchParallel<T>(fetchers: (() => Promise<T>)[]): Promise<Array<T | null>> {
    return Promise.all(fetchers.map(f => f().catch(() => null)));
  }

  getStats(): IndexerStats {
    const now = Date.now();
    const timeDiff = (now - this.stats.lastUpdate) / 1000;
    return {
      queriesPerSecond: timeDiff > 0 ? this.queryCount / timeDiff : 0,
      cacheHitRate: this.queryCount > 0 ? (this.cacheHits / this.queryCount) * 100 : 0,
      avgLatency: this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0,
      activeConnections: 1,
      lastUpdate: now,
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

// Export class for Web3Context compatibility
export class IndexerService {
  private provider: ethers.BrowserProvider;
  constructor(provider: ethers.BrowserProvider) {
    this.provider = provider;
  }
  async indexBlock(blockNumber: number): Promise<IndexedBlock> {
    const block = await this.provider.getBlock(blockNumber);
    if (!block) throw new Error('Block not found');
    return { number: block.number, timestamp: block.timestamp, transactions: block.transactions.length, gasUsed: block.gasUsed.toString() };
  }
}

export const indexerService = new EnhancedIndexerService();
