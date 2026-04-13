// CoinGecko API Service with Rate Limiting and Caching
// Free tier: 10-30 calls/minute, we'll be conservative with 10 calls/minute

export interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  last_updated: string;
}

export interface CoinGeckoMarketChart {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export interface CachedPrice {
  data: CoinGeckoPrice;
  timestamp: number;
  expiresAt: number;
}

export interface RateLimitState {
  requests: number;
  windowStart: number;
  lastRequest: number;
}

// Token ID mapping for CoinGecko
export const COINGECKO_IDS: Record<string, string> = {
  // Major
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'BNB': 'binancecoin',
  'XRP': 'ripple',
  'SOL': 'solana',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'TRX': 'tron',
  'LINK': 'chainlink',
  'TON': 'the-open-network',
  'LTC': 'litecoin',
  // Altcoins
  'ATOM': 'cosmos',
  'NEAR': 'near',
  'FIL': 'filecoin',
  'APT': 'aptos',
  'SUI': 'sui',
  'SEI': 'sei-network',
  'INJ': 'injective-protocol',
  'TIA': 'celestia',
  'ALGO': 'algorand',
  'VET': 'vechain',
  'HBAR': 'hedera-hashgraph',
  'ICP': 'internet-computer',
  // Stablecoins
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'DAI': 'dai',
  'TUSD': 'true-usd',
  'FRAX': 'frax',
  'LUSD': 'liquity-usd',
  // DeFi
  'UNI': 'uniswap',
  'AAVE': 'aave',
  'MKR': 'maker',
  'CRV': 'curve-dao-token',
  'LDO': 'lido-dao',
  'SNX': 'synthetix-network-token',
  'COMP': 'compound-governance-token',
  'SUSHI': 'sushi',
  '1INCH': '1inch',
  'GMX': 'gmx',
  'DYDX': 'dydx',
  'PENDLE': 'pendle',
  // Layer 2
  'MATIC': 'matic-network',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'IMX': 'immutable-x',
  'STRK': 'starknet',
  'ZK': 'zksync',
  'MANTA': 'manta-network',
  // Meme
  'DOGE': 'dogecoin',
  'SHIB': 'shiba-inu',
  'PEPE': 'pepe',
  'FLOKI': 'floki',
  'BONK': 'bonk',
  'WIF': 'dogwifcoin',
  // Gaming
  'AXS': 'axie-infinity',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'GALA': 'gala',
  'ENJ': 'enjincoin',
  'RONIN': 'ronin',
};

class CoinGeckoService {
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private cache: Map<string, CachedPrice> = new Map();
  private batchCache: { data: Map<string, CoinGeckoPrice>; timestamp: number; expiresAt: number } | null = null;
  private chartCache: Map<string, { data: CoinGeckoMarketChart | [number, number, number, number, number][]; expiresAt: number }> = new Map();
  
  // Rate limiting - conservative for free tier
  private rateLimit: RateLimitState = {
    requests: 0,
    windowStart: Date.now(),
    lastRequest: 0,
  };
  
  // Configuration
  private readonly MAX_REQUESTS_PER_MINUTE = 8; // Conservative limit for free tier
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MIN_REQUEST_INTERVAL = 6000; // Minimum 6 seconds between requests
  private readonly CACHE_TTL = 30000; // 30 seconds cache for prices
  private readonly BATCH_CACHE_TTL = 20000; // 20 seconds for batch data
  private readonly CHART_CACHE_TTL = 300000; // 5 minutes for chart data
  
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private lastSuccessfulFetch = 0;
  private consecutiveErrors = 0;
  private backoffMultiplier = 1;

  constructor() {
    // Start queue processor
    this.processQueue();
  }

  // Check if we can make a request
  private canMakeRequest(): boolean {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.rateLimit.windowStart >= this.RATE_LIMIT_WINDOW) {
      this.rateLimit.requests = 0;
      this.rateLimit.windowStart = now;
    }
    
    // Check rate limit
    if (this.rateLimit.requests >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }
    
    // Check minimum interval with backoff
    const minInterval = this.MIN_REQUEST_INTERVAL * this.backoffMultiplier;
    if (now - this.rateLimit.lastRequest < minInterval) {
      return false;
    }
    
    return true;
  }

  // Record a request
  private recordRequest() {
    this.rateLimit.requests++;
    this.rateLimit.lastRequest = Date.now();
  }

  // Process request queue
  private async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      if (this.canMakeRequest()) {
        const request = this.requestQueue.shift();
        if (request) {
          try {
            await request();
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
          } catch (error) {
            this.consecutiveErrors++;
            this.backoffMultiplier = Math.min(4, Math.pow(2, this.consecutiveErrors));
            console.warn('CoinGecko request failed, backoff multiplier:', this.backoffMultiplier);
          }
        }
      } else {
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.isProcessingQueue = false;
  }

  // Add request to queue
  private queueRequest(request: () => Promise<void>) {
    this.requestQueue.push(request);
    this.processQueue();
  }

  // Fetch with rate limiting and error handling
  private async fetchWithRateLimit<T>(url: string): Promise<T | null> {
    if (!this.canMakeRequest()) {
      console.log('CoinGecko rate limit reached, waiting...');
      return null;
    }

    this.recordRequest();

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.status === 429) {
        // Rate limited - increase backoff
        this.consecutiveErrors++;
        this.backoffMultiplier = Math.min(8, Math.pow(2, this.consecutiveErrors));
        console.warn('CoinGecko rate limited, backing off');
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.lastSuccessfulFetch = Date.now();
      this.consecutiveErrors = 0;
      this.backoffMultiplier = 1;
      return data;
    } catch (error) {
      console.error('CoinGecko API error:', error);
      this.consecutiveErrors++;
      this.backoffMultiplier = Math.min(4, Math.pow(2, this.consecutiveErrors));
      return null;
    }
  }

  // Get all prices in a single batch request (most efficient)
  async fetchAllPrices(): Promise<Map<string, CoinGeckoPrice>> {
    // Check batch cache first
    if (this.batchCache && Date.now() < this.batchCache.expiresAt) {
      return this.batchCache.data;
    }

    const ids = Object.values(COINGECKO_IDS).join(',');
    const url = `${this.baseUrl}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;

    const data = await this.fetchWithRateLimit<CoinGeckoPrice[]>(url);
    
    if (data && Array.isArray(data)) {
      const priceMap = new Map<string, CoinGeckoPrice>();
      
      data.forEach(coin => {
        priceMap.set(coin.id, coin);
        
        // Also update individual cache
        this.cache.set(coin.id, {
          data: coin,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.CACHE_TTL,
        });
      });

      // Update batch cache
      this.batchCache = {
        data: priceMap,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.BATCH_CACHE_TTL,
      };

      return priceMap;
    }

    // Return cached data if available
    if (this.batchCache) {
      return this.batchCache.data;
    }

    return new Map();
  }

  // Get price for a specific token
  async getPrice(tokenSymbol: string): Promise<CoinGeckoPrice | null> {
    const coinId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
    if (!coinId) return null;

    // Check individual cache
    const cached = this.cache.get(coinId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // Check batch cache
    if (this.batchCache && Date.now() < this.batchCache.expiresAt) {
      const price = this.batchCache.data.get(coinId);
      if (price) return price;
    }

    // Fetch all prices (more efficient than individual requests)
    const allPrices = await this.fetchAllPrices();
    return allPrices.get(coinId) || null;
  }

  // Get prices for multiple tokens
  async getPrices(tokenSymbols: string[]): Promise<Map<string, CoinGeckoPrice>> {
    const result = new Map<string, CoinGeckoPrice>();
    const allPrices = await this.fetchAllPrices();

    tokenSymbols.forEach(symbol => {
      const coinId = COINGECKO_IDS[symbol.toUpperCase()];
      if (coinId) {
        const price = allPrices.get(coinId);
        if (price) {
          result.set(symbol, price);
        }
      }
    });

    return result;
  }

  // Get simple price (just USD value)
  async getSimplePrice(tokenSymbol: string): Promise<number | null> {
    const price = await this.getPrice(tokenSymbol);
    return price?.current_price || null;
  }

  // Get historical chart data
  async getMarketChart(tokenSymbol: string, days: number = 7): Promise<CoinGeckoMarketChart | null> {
    const coinId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
    if (!coinId) return null;

    const cacheKey = `${coinId}-${days}`;
    const cached = this.chartCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const url = `${this.baseUrl}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
    const data = await this.fetchWithRateLimit<CoinGeckoMarketChart>(url);

    if (data) {
      this.chartCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + this.CHART_CACHE_TTL,
      });
      return data;
    }

    return cached?.data || null;
  }

  // Get 24h OHLC data
  async getOHLC(tokenSymbol: string, days: number = 1): Promise<[number, number, number, number, number][] | null> {
    const coinId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
    if (!coinId) return null;

    const cacheKey = `ohlc-${coinId}-${days}`;
    const cached = this.chartCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as [number, number, number, number, number][];
    }

    const url = `${this.baseUrl}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const data = await this.fetchWithRateLimit<[number, number, number, number, number][]>(url);

    if (data) {
      this.chartCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + this.CHART_CACHE_TTL,
      });
      return data;
    }

    return null;
  }

  // Get current status
  getStatus(): {
    cacheSize: number;
    lastFetch: number;
    requestsInWindow: number;
    backoffMultiplier: number;
    queueLength: number;
  } {
    return {
      cacheSize: this.cache.size,
      lastFetch: this.lastSuccessfulFetch,
      requestsInWindow: this.rateLimit.requests,
      backoffMultiplier: this.backoffMultiplier,
      queueLength: this.requestQueue.length,
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    this.batchCache = null;
    this.chartCache.clear();
  }

  // Get cached price (no API call)
  getCachedPrice(tokenSymbol: string): CoinGeckoPrice | null {
    const coinId = COINGECKO_IDS[tokenSymbol.toUpperCase()];
    if (!coinId) return null;

    // Check individual cache
    const cached = this.cache.get(coinId);
    if (cached) return cached.data;

    // Check batch cache
    if (this.batchCache) {
      return this.batchCache.data.get(coinId) || null;
    }

    return null;
  }

  // Check if data is stale
  isDataStale(): boolean {
    if (!this.batchCache) return true;
    return Date.now() > this.batchCache.expiresAt;
  }

  // Get time until next allowed request
  getTimeUntilNextRequest(): number {
    const now = Date.now();
    const minInterval = this.MIN_REQUEST_INTERVAL * this.backoffMultiplier;
    const timeSinceLastRequest = now - this.rateLimit.lastRequest;
    
    if (timeSinceLastRequest >= minInterval && this.rateLimit.requests < this.MAX_REQUESTS_PER_MINUTE) {
      return 0;
    }
    
    return Math.max(0, minInterval - timeSinceLastRequest);
  }
}

// Export singleton instance
export const coingeckoService = new CoinGeckoService();
