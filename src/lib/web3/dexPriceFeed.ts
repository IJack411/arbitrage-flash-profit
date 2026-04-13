// DEX Price Feed Service - Real prices from CoinGecko with DEX spread simulation
import { coingeckoService, CoinGeckoPrice, COINGECKO_IDS } from '../coingeckoService';

export interface DexPriceData {
  dex: string;
  pair: string;
  price: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  timestamp: number;
  source: 'dex' | 'coingecko';
}

export interface AggregatedPrice {
  pair: string;
  bestPrice: number;
  bestDex: string;
  prices: DexPriceData[];
  spread: number;
  avgPrice: number;
  timestamp: number;
}

// Token symbol to CoinGecko ID mapping
const TOKEN_TO_COINGECKO: Record<string, string> = {
  'ETH': 'ethereum',
  'BTC': 'bitcoin',
  'WETH': 'ethereum',
  'WBTC': 'bitcoin',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'MATIC': 'matic-network',
  'SOL': 'solana',
  'AVAX': 'avalanche-2',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'CRV': 'curve-dao-token',
  'SUSHI': 'sushi',
  'COMP': 'compound-governance-token',
  'MKR': 'maker',
  'SNX': 'synthetix-network-token',
  'YFI': 'yearn-finance',
  'BAL': 'balancer',
  '1INCH': '1inch',
};

// DEX configurations with typical spreads and liquidity
const DEX_CONFIG = {
  'Uniswap V3': { spreadFactor: 0.0005, liquidityBase: 50000000, volumeBase: 20000000 },
  'SushiSwap': { spreadFactor: 0.001, liquidityBase: 20000000, volumeBase: 8000000 },
  'Curve': { spreadFactor: 0.0002, liquidityBase: 100000000, volumeBase: 30000000 },
  'Balancer': { spreadFactor: 0.0008, liquidityBase: 15000000, volumeBase: 5000000 },
  '1inch': { spreadFactor: 0.0003, liquidityBase: 0, volumeBase: 25000000 }, // Aggregator
  'PancakeSwap': { spreadFactor: 0.0012, liquidityBase: 30000000, volumeBase: 15000000 },
};

export class DexPriceFeedService {
  private cache: Map<string, { data: DexPriceData; expiry: number }> = new Map();
  private aggregatedCache: Map<string, { data: AggregatedPrice; expiry: number }> = new Map();
  private cacheTTL = 15000; // 15 seconds
  private lastRealPrice: Map<string, number> = new Map();

  // Get base token from pair (e.g., "ETH/USD" -> "ETH")
  private getBaseToken(pair: string): string {
    return pair.split('/')[0];
  }

  // Get real price from CoinGecko
  private async getRealPrice(pair: string): Promise<number | null> {
    const baseToken = this.getBaseToken(pair);
    const coinId = TOKEN_TO_COINGECKO[baseToken] || COINGECKO_IDS[baseToken];
    
    if (!coinId) {
      // Return cached or default price
      return this.lastRealPrice.get(pair) || this.getDefaultPrice(pair);
    }

    try {
      const price = await coingeckoService.getSimplePrice(baseToken);
      if (price) {
        this.lastRealPrice.set(pair, price);
        return price;
      }
    } catch (error) {
      console.warn('Failed to get CoinGecko price for', pair);
    }

    return this.lastRealPrice.get(pair) || this.getDefaultPrice(pair);
  }

  private getDefaultPrice(pair: string): number {
    const prices: Record<string, number> = {
      'ETH/USD': 2350, 'BTC/USD': 43500, 'LINK/USD': 14.5,
      'UNI/USD': 6.2, 'AAVE/USD': 95, 'MATIC/USD': 0.85,
      'SOL/USD': 98, 'AVAX/USD': 38, 'ARB/USD': 1.15,
      'OP/USD': 2.1, 'CRV/USD': 0.55, 'SUSHI/USD': 1.2,
    };
    return prices[pair] || 100;
  }

  // Fetch price from a specific DEX with real base price
  async fetchDexPrice(dex: string, pair: string): Promise<DexPriceData | null> {
    const cacheKey = `${dex}-${pair}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) return cached.data;

    const config = DEX_CONFIG[dex as keyof typeof DEX_CONFIG];
    if (!config) return null;

    try {
      // Get real price from CoinGecko
      const basePrice = await this.getRealPrice(pair);
      if (!basePrice) return null;

      // Apply DEX-specific spread (simulating real DEX behavior)
      const spreadDirection = (Math.random() - 0.5) * 2; // -1 to 1
      const spread = config.spreadFactor * spreadDirection;
      const price = basePrice * (1 + spread);

      // Simulate liquidity and volume based on DEX characteristics
      const liquidityVariation = 0.8 + Math.random() * 0.4; // 80% to 120%
      const volumeVariation = 0.7 + Math.random() * 0.6; // 70% to 130%

      const data: DexPriceData = {
        dex,
        pair,
        price,
        liquidity: config.liquidityBase * liquidityVariation,
        volume24h: config.volumeBase * volumeVariation,
        priceChange24h: (Math.random() - 0.5) * 5, // Will be overwritten with real data if available
        timestamp: Date.now(),
        source: 'coingecko',
      };

      // Try to get real 24h change from CoinGecko
      const baseToken = this.getBaseToken(pair);
      const coinData = coingeckoService.getCachedPrice(baseToken);
      if (coinData) {
        data.priceChange24h = coinData.price_change_percentage_24h;
        data.volume24h = coinData.total_volume * (config.volumeBase / 20000000); // Scale to DEX
      }

      this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheTTL });
      return data;
    } catch (e) {
      console.error(`Error fetching ${dex} price for ${pair}:`, e);
      return null;
    }
  }

  // Legacy methods for backward compatibility
  async fetchUniswapPrice(pair: string): Promise<DexPriceData | null> {
    return this.fetchDexPrice('Uniswap V3', pair);
  }

  async fetchSushiSwapPrice(pair: string): Promise<DexPriceData | null> {
    return this.fetchDexPrice('SushiSwap', pair);
  }

  async fetchCurvePrice(pair: string): Promise<DexPriceData | null> {
    return this.fetchDexPrice('Curve', pair);
  }

  // Get all DEX prices for a pair
  async getAllDexPrices(pair: string): Promise<DexPriceData[]> {
    const dexes = Object.keys(DEX_CONFIG);
    const promises = dexes.map(dex => this.fetchDexPrice(dex, pair));
    const results = await Promise.all(promises);
    return results.filter((p): p is DexPriceData => p !== null);
  }

  // Get aggregated price data with best price and spread
  async getAggregatedPrice(pair: string): Promise<AggregatedPrice | null> {
    const cached = this.aggregatedCache.get(pair);
    if (cached && cached.expiry > Date.now()) return cached.data;

    const prices = await this.getAllDexPrices(pair);
    if (prices.length === 0) return null;

    // Sort by price to find best (lowest for buying)
    const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
    const bestPrice = sortedPrices[0].price;
    const bestDex = sortedPrices[0].dex;

    // Calculate spread
    const highestPrice = sortedPrices[sortedPrices.length - 1].price;
    const spread = ((highestPrice - bestPrice) / bestPrice) * 100;

    // Calculate average price
    const avgPrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

    const data: AggregatedPrice = {
      pair,
      bestPrice,
      bestDex,
      prices,
      spread,
      avgPrice,
      timestamp: Date.now(),
    };

    this.aggregatedCache.set(pair, { data, expiry: Date.now() + this.cacheTTL });
    return data;
  }

  // Get arbitrage opportunities
  async findArbitrageOpportunities(pairs: string[], minSpreadPercent: number = 0.1): Promise<Array<{
    pair: string;
    buyDex: string;
    sellDex: string;
    buyPrice: number;
    sellPrice: number;
    spreadPercent: number;
    potentialProfit: number;
  }>> {
    const opportunities = [];

    for (const pair of pairs) {
      const aggregated = await this.getAggregatedPrice(pair);
      if (!aggregated || aggregated.prices.length < 2) continue;

      const sortedPrices = [...aggregated.prices].sort((a, b) => a.price - b.price);
      const lowest = sortedPrices[0];
      const highest = sortedPrices[sortedPrices.length - 1];

      const spreadPercent = ((highest.price - lowest.price) / lowest.price) * 100;

      if (spreadPercent >= minSpreadPercent) {
        opportunities.push({
          pair,
          buyDex: lowest.dex,
          sellDex: highest.dex,
          buyPrice: lowest.price,
          sellPrice: highest.price,
          spreadPercent,
          potentialProfit: (highest.price - lowest.price) * 1000, // Assuming 1000 units
        });
      }
    }

    return opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    this.aggregatedCache.clear();
  }

  // Get cache status
  getCacheStatus(): { size: number; aggregatedSize: number } {
    return {
      size: this.cache.size,
      aggregatedSize: this.aggregatedCache.size,
    };
  }
}

export const dexPriceFeedService = new DexPriceFeedService();
