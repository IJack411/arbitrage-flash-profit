// Price Alert Service - Custom alerts for token pairs with threshold notifications
// Integrated with CoinGecko API for real-time prices
// Supports 50+ popular trading pairs
// Now includes email and Telegram notification support

import { coingeckoService, CoinGeckoPrice, COINGECKO_IDS } from './coingeckoService';
import { notificationPreferencesService } from './notificationPreferencesService';
import { telegramService } from './telegramService';

export interface TokenPairInfo {
  symbol: string;
  baseToken: string;
  quoteToken: string;
  category: 'major' | 'altcoin' | 'stablecoin' | 'defi' | 'layer2' | 'meme' | 'gaming';
  coingeckoId: string;
  basePrice: number;
  volatility: number;
  logo?: string;
}

export interface PriceAlert {
  id: string;
  tokenPair: string;
  targetPrice: number;
  condition: 'above' | 'below' | 'crosses';
  currentPrice: number;
  createdAt: number;
  triggeredAt: number | null;
  enabled: boolean;
  notified: boolean;
  repeatAlert: boolean;
  note: string;
  network: string;
}

export interface PriceAlertNotification {
  id: string;
  alertId: string;
  tokenPair: string;
  message: string;
  targetPrice: number;
  triggeredPrice: number;
  condition: string;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
}

export interface PriceData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: number;
  source: 'coingecko' | 'simulated';
}

type AlertCallback = (notification: PriceAlertNotification) => void;

// 50+ Token pairs organized by category with CoinGecko IDs
export const TOKEN_PAIRS: Record<string, TokenPairInfo> = {
  // Major Cryptocurrencies
  'BTC/USDT': { symbol: 'BTC/USDT', baseToken: 'BTC', quoteToken: 'USDT', category: 'major', coingeckoId: 'bitcoin', basePrice: 43500, volatility: 0.015 },
  'ETH/USDT': { symbol: 'ETH/USDT', baseToken: 'ETH', quoteToken: 'USDT', category: 'major', coingeckoId: 'ethereum', basePrice: 2350, volatility: 0.02 },
  'BNB/USDT': { symbol: 'BNB/USDT', baseToken: 'BNB', quoteToken: 'USDT', category: 'major', coingeckoId: 'binancecoin', basePrice: 315, volatility: 0.025 },
  'XRP/USDT': { symbol: 'XRP/USDT', baseToken: 'XRP', quoteToken: 'USDT', category: 'major', coingeckoId: 'ripple', basePrice: 0.62, volatility: 0.03 },
  'SOL/USDT': { symbol: 'SOL/USDT', baseToken: 'SOL', quoteToken: 'USDT', category: 'major', coingeckoId: 'solana', basePrice: 98, volatility: 0.035 },
  'ADA/USDT': { symbol: 'ADA/USDT', baseToken: 'ADA', quoteToken: 'USDT', category: 'major', coingeckoId: 'cardano', basePrice: 0.58, volatility: 0.028 },
  'AVAX/USDT': { symbol: 'AVAX/USDT', baseToken: 'AVAX', quoteToken: 'USDT', category: 'major', coingeckoId: 'avalanche-2', basePrice: 38, volatility: 0.032 },
  'DOT/USDT': { symbol: 'DOT/USDT', baseToken: 'DOT', quoteToken: 'USDT', category: 'major', coingeckoId: 'polkadot', basePrice: 7.5, volatility: 0.028 },
  'TRX/USDT': { symbol: 'TRX/USDT', baseToken: 'TRX', quoteToken: 'USDT', category: 'major', coingeckoId: 'tron', basePrice: 0.11, volatility: 0.025 },
  'LINK/USDT': { symbol: 'LINK/USDT', baseToken: 'LINK', quoteToken: 'USDT', category: 'major', coingeckoId: 'chainlink', basePrice: 14.5, volatility: 0.025 },
  'TON/USDT': { symbol: 'TON/USDT', baseToken: 'TON', quoteToken: 'USDT', category: 'major', coingeckoId: 'the-open-network', basePrice: 5.8, volatility: 0.03 },
  'LTC/USDT': { symbol: 'LTC/USDT', baseToken: 'LTC', quoteToken: 'USDT', category: 'major', coingeckoId: 'litecoin', basePrice: 72, volatility: 0.022 },
  
  // Altcoins
  'ATOM/USDT': { symbol: 'ATOM/USDT', baseToken: 'ATOM', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'cosmos', basePrice: 9.5, volatility: 0.03 },
  'NEAR/USDT': { symbol: 'NEAR/USDT', baseToken: 'NEAR', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'near', basePrice: 5.2, volatility: 0.035 },
  'FIL/USDT': { symbol: 'FIL/USDT', baseToken: 'FIL', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'filecoin', basePrice: 5.8, volatility: 0.032 },
  'APT/USDT': { symbol: 'APT/USDT', baseToken: 'APT', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'aptos', basePrice: 9.2, volatility: 0.04 },
  'SUI/USDT': { symbol: 'SUI/USDT', baseToken: 'SUI', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'sui', basePrice: 1.85, volatility: 0.045 },
  'SEI/USDT': { symbol: 'SEI/USDT', baseToken: 'SEI', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'sei-network', basePrice: 0.52, volatility: 0.05 },
  'INJ/USDT': { symbol: 'INJ/USDT', baseToken: 'INJ', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'injective-protocol', basePrice: 35, volatility: 0.045 },
  'TIA/USDT': { symbol: 'TIA/USDT', baseToken: 'TIA', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'celestia', basePrice: 12.5, volatility: 0.05 },
  'ALGO/USDT': { symbol: 'ALGO/USDT', baseToken: 'ALGO', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'algorand', basePrice: 0.22, volatility: 0.028 },
  'VET/USDT': { symbol: 'VET/USDT', baseToken: 'VET', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'vechain', basePrice: 0.035, volatility: 0.03 },
  'HBAR/USDT': { symbol: 'HBAR/USDT', baseToken: 'HBAR', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'hedera-hashgraph', basePrice: 0.085, volatility: 0.032 },
  'ICP/USDT': { symbol: 'ICP/USDT', baseToken: 'ICP', quoteToken: 'USDT', category: 'altcoin', coingeckoId: 'internet-computer', basePrice: 12.5, volatility: 0.035 },
  
  // Stablecoins
  'USDC/USDT': { symbol: 'USDC/USDT', baseToken: 'USDC', quoteToken: 'USDT', category: 'stablecoin', coingeckoId: 'usd-coin', basePrice: 1.0, volatility: 0.001 },
  'DAI/USDT': { symbol: 'DAI/USDT', baseToken: 'DAI', quoteToken: 'USDT', category: 'stablecoin', coingeckoId: 'dai', basePrice: 1.0, volatility: 0.001 },
  'TUSD/USDT': { symbol: 'TUSD/USDT', baseToken: 'TUSD', quoteToken: 'USDT', category: 'stablecoin', coingeckoId: 'true-usd', basePrice: 1.0, volatility: 0.002 },
  'FRAX/USDT': { symbol: 'FRAX/USDT', baseToken: 'FRAX', quoteToken: 'USDT', category: 'stablecoin', coingeckoId: 'frax', basePrice: 1.0, volatility: 0.001 },
  'LUSD/USDT': { symbol: 'LUSD/USDT', baseToken: 'LUSD', quoteToken: 'USDT', category: 'stablecoin', coingeckoId: 'liquity-usd', basePrice: 1.0, volatility: 0.002 },
  
  // DeFi Tokens
  'UNI/USDT': { symbol: 'UNI/USDT', baseToken: 'UNI', quoteToken: 'USDT', category: 'defi', coingeckoId: 'uniswap', basePrice: 6.2, volatility: 0.028 },
  'AAVE/USDT': { symbol: 'AAVE/USDT', baseToken: 'AAVE', quoteToken: 'USDT', category: 'defi', coingeckoId: 'aave', basePrice: 95, volatility: 0.022 },
  'MKR/USDT': { symbol: 'MKR/USDT', baseToken: 'MKR', quoteToken: 'USDT', category: 'defi', coingeckoId: 'maker', basePrice: 1450, volatility: 0.025 },
  'CRV/USDT': { symbol: 'CRV/USDT', baseToken: 'CRV', quoteToken: 'USDT', category: 'defi', coingeckoId: 'curve-dao-token', basePrice: 0.55, volatility: 0.035 },
  'LDO/USDT': { symbol: 'LDO/USDT', baseToken: 'LDO', quoteToken: 'USDT', category: 'defi', coingeckoId: 'lido-dao', basePrice: 2.3, volatility: 0.032 },
  'SNX/USDT': { symbol: 'SNX/USDT', baseToken: 'SNX', quoteToken: 'USDT', category: 'defi', coingeckoId: 'synthetix-network-token', basePrice: 3.2, volatility: 0.035 },
  'COMP/USDT': { symbol: 'COMP/USDT', baseToken: 'COMP', quoteToken: 'USDT', category: 'defi', coingeckoId: 'compound-governance-token', basePrice: 55, volatility: 0.028 },
  'SUSHI/USDT': { symbol: 'SUSHI/USDT', baseToken: 'SUSHI', quoteToken: 'USDT', category: 'defi', coingeckoId: 'sushi', basePrice: 1.2, volatility: 0.04 },
  '1INCH/USDT': { symbol: '1INCH/USDT', baseToken: '1INCH', quoteToken: 'USDT', category: 'defi', coingeckoId: '1inch', basePrice: 0.38, volatility: 0.035 },
  'GMX/USDT': { symbol: 'GMX/USDT', baseToken: 'GMX', quoteToken: 'USDT', category: 'defi', coingeckoId: 'gmx', basePrice: 42, volatility: 0.03 },
  'DYDX/USDT': { symbol: 'DYDX/USDT', baseToken: 'DYDX', quoteToken: 'USDT', category: 'defi', coingeckoId: 'dydx', basePrice: 2.8, volatility: 0.04 },
  'PENDLE/USDT': { symbol: 'PENDLE/USDT', baseToken: 'PENDLE', quoteToken: 'USDT', category: 'defi', coingeckoId: 'pendle', basePrice: 1.45, volatility: 0.045 },
  
  // Layer 2 Tokens
  'MATIC/USDT': { symbol: 'MATIC/USDT', baseToken: 'MATIC', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'matic-network', basePrice: 0.92, volatility: 0.03 },
  'ARB/USDT': { symbol: 'ARB/USDT', baseToken: 'ARB', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'arbitrum', basePrice: 1.15, volatility: 0.035 },
  'OP/USDT': { symbol: 'OP/USDT', baseToken: 'OP', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'optimism', basePrice: 2.1, volatility: 0.038 },
  'IMX/USDT': { symbol: 'IMX/USDT', baseToken: 'IMX', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'immutable-x', basePrice: 2.0, volatility: 0.04 },
  'STRK/USDT': { symbol: 'STRK/USDT', baseToken: 'STRK', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'starknet', basePrice: 1.2, volatility: 0.05 },
  'ZK/USDT': { symbol: 'ZK/USDT', baseToken: 'ZK', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'zksync', basePrice: 0.18, volatility: 0.05 },
  'MANTA/USDT': { symbol: 'MANTA/USDT', baseToken: 'MANTA', quoteToken: 'USDT', category: 'layer2', coingeckoId: 'manta-network', basePrice: 1.8, volatility: 0.045 },
  
  // Meme Coins
  'DOGE/USDT': { symbol: 'DOGE/USDT', baseToken: 'DOGE', quoteToken: 'USDT', category: 'meme', coingeckoId: 'dogecoin', basePrice: 0.092, volatility: 0.04 },
  'SHIB/USDT': { symbol: 'SHIB/USDT', baseToken: 'SHIB', quoteToken: 'USDT', category: 'meme', coingeckoId: 'shiba-inu', basePrice: 0.0000095, volatility: 0.045 },
  'PEPE/USDT': { symbol: 'PEPE/USDT', baseToken: 'PEPE', quoteToken: 'USDT', category: 'meme', coingeckoId: 'pepe', basePrice: 0.0000018, volatility: 0.06 },
  'FLOKI/USDT': { symbol: 'FLOKI/USDT', baseToken: 'FLOKI', quoteToken: 'USDT', category: 'meme', coingeckoId: 'floki', basePrice: 0.00018, volatility: 0.055 },
  'BONK/USDT': { symbol: 'BONK/USDT', baseToken: 'BONK', quoteToken: 'USDT', category: 'meme', coingeckoId: 'bonk', basePrice: 0.000018, volatility: 0.06 },
  'WIF/USDT': { symbol: 'WIF/USDT', baseToken: 'WIF', quoteToken: 'USDT', category: 'meme', coingeckoId: 'dogwifcoin', basePrice: 2.5, volatility: 0.07 },
  
  // Gaming & Metaverse
  'AXS/USDT': { symbol: 'AXS/USDT', baseToken: 'AXS', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'axie-infinity', basePrice: 7.5, volatility: 0.04 },
  'SAND/USDT': { symbol: 'SAND/USDT', baseToken: 'SAND', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'the-sandbox', basePrice: 0.48, volatility: 0.038 },
  'MANA/USDT': { symbol: 'MANA/USDT', baseToken: 'MANA', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'decentraland', basePrice: 0.45, volatility: 0.035 },
  'GALA/USDT': { symbol: 'GALA/USDT', baseToken: 'GALA', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'gala', basePrice: 0.028, volatility: 0.045 },
  'ENJ/USDT': { symbol: 'ENJ/USDT', baseToken: 'ENJ', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'enjincoin', basePrice: 0.32, volatility: 0.035 },
  'RONIN/USDT': { symbol: 'RONIN/USDT', baseToken: 'RONIN', quoteToken: 'USDT', category: 'gaming', coingeckoId: 'ronin', basePrice: 2.8, volatility: 0.04 },
  
  // Cross pairs
  'ETH/BTC': { symbol: 'ETH/BTC', baseToken: 'ETH', quoteToken: 'BTC', category: 'major', coingeckoId: 'ethereum', basePrice: 0.054, volatility: 0.01 },
  'BNB/ETH': { symbol: 'BNB/ETH', baseToken: 'BNB', quoteToken: 'ETH', category: 'major', coingeckoId: 'binancecoin', basePrice: 0.134, volatility: 0.015 },
  'SOL/ETH': { symbol: 'SOL/ETH', baseToken: 'SOL', quoteToken: 'ETH', category: 'major', coingeckoId: 'solana', basePrice: 0.042, volatility: 0.02 },
};

// Category labels for UI
export const CATEGORY_LABELS: Record<string, string> = {
  major: 'Major Cryptocurrencies',
  altcoin: 'Altcoins',
  stablecoin: 'Stablecoins',
  defi: 'DeFi Tokens',
  layer2: 'Layer 2',
  meme: 'Meme Coins',
  gaming: 'Gaming & Metaverse',
};

class PriceAlertService {
  private alerts: Map<string, PriceAlert> = new Map();
  private notifications: PriceAlertNotification[] = [];
  private subscribers: Set<AlertCallback> = new Set();
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private currentPrices: Map<string, number> = new Map();
  private previousPrices: Map<string, number> = new Map();
  private priceData: Map<string, PriceData> = new Map();
  private maxNotifications = 50;
  private isMonitoring = false;
  private lastApiUpdate = 0;
  private apiUpdateInterval = 15000; // 15 seconds between API calls (respects rate limit)
  private usingLiveData = false;

  constructor() {
    this.loadFromStorage();
    this.initializePrices();
  }

  private initializePrices() {
    Object.entries(TOKEN_PAIRS).forEach(([pair, config]) => {
      this.currentPrices.set(pair, config.basePrice);
      this.previousPrices.set(pair, config.basePrice);
      this.priceData.set(pair, {
        price: config.basePrice,
        change24h: 0,
        high24h: config.basePrice * 1.02,
        low24h: config.basePrice * 0.98,
        volume24h: 0,
        marketCap: 0,
        lastUpdated: Date.now(),
        source: 'simulated',
      });
    });
  }

  // Fetch prices from CoinGecko API
  async fetchPricesFromApi(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastApiUpdate < this.apiUpdateInterval) {
      return this.usingLiveData;
    }

    try {
      const allPrices = await coingeckoService.fetchAllPrices();
      
      if (allPrices.size > 0) {
        this.usingLiveData = true;
        this.lastApiUpdate = now;

        // Update prices for each pair
        Object.entries(TOKEN_PAIRS).forEach(([pair, config]) => {
          const coinData = allPrices.get(config.coingeckoId);
          
          if (coinData) {
            const previousPrice = this.currentPrices.get(pair) || config.basePrice;
            this.previousPrices.set(pair, previousPrice);
            
            // For cross pairs, calculate the ratio
            let newPrice = coinData.current_price;
            if (config.quoteToken !== 'USDT') {
              const quotePrice = this.getQuoteTokenPrice(config.quoteToken, allPrices);
              if (quotePrice > 0) {
                newPrice = coinData.current_price / quotePrice;
              }
            }
            
            this.currentPrices.set(pair, newPrice);
            
            // Update full price data
            this.priceData.set(pair, {
              price: newPrice,
              change24h: coinData.price_change_percentage_24h || 0,
              high24h: coinData.high_24h || newPrice * 1.02,
              low24h: coinData.low_24h || newPrice * 0.98,
              volume24h: coinData.total_volume || 0,
              marketCap: coinData.market_cap || 0,
              lastUpdated: Date.now(),
              source: 'coingecko',
            });
          }
        });

        this.updateAlertPrices();
        this.checkAlerts();
        this.saveToStorage();
        return true;
      }
    } catch (error) {
      console.error('Failed to fetch prices from CoinGecko:', error);
    }

    // Fall back to simulated prices
    this.usingLiveData = false;
    this.simulatePriceUpdate();
    return false;
  }

  private getQuoteTokenPrice(quoteToken: string, allPrices: Map<string, CoinGeckoPrice>): number {
    const coinId = COINGECKO_IDS[quoteToken];
    if (coinId) {
      const coinData = allPrices.get(coinId);
      if (coinData) return coinData.current_price;
    }
    
    // Fallback
    switch (quoteToken) {
      case 'BTC': return this.currentPrices.get('BTC/USDT') || 43500;
      case 'ETH': return this.currentPrices.get('ETH/USDT') || 2350;
      default: return 1;
    }
  }

  getAvailablePairs(): string[] {
    return Object.keys(TOKEN_PAIRS);
  }

  getPairsByCategory(category: string): string[] {
    return Object.entries(TOKEN_PAIRS)
      .filter(([_, info]) => info.category === category)
      .map(([pair]) => pair);
  }

  getCategories(): string[] {
    return Object.keys(CATEGORY_LABELS);
  }

  getCategoryLabel(category: string): string {
    return CATEGORY_LABELS[category] || category;
  }

  getPairInfo(pair: string): TokenPairInfo | null {
    return TOKEN_PAIRS[pair] || null;
  }

  searchPairs(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    return Object.entries(TOKEN_PAIRS)
      .filter(([pair, info]) => 
        pair.toLowerCase().includes(lowerQuery) ||
        info.baseToken.toLowerCase().includes(lowerQuery) ||
        info.category.toLowerCase().includes(lowerQuery)
      )
      .map(([pair]) => pair);
  }

  getCurrentPrice(pair: string): number {
    return this.currentPrices.get(pair) || TOKEN_PAIRS[pair]?.basePrice || 0;
  }

  getPriceData(pair: string): PriceData | null {
    return this.priceData.get(pair) || null;
  }

  getAllCurrentPrices(): Record<string, number> {
    const prices: Record<string, number> = {};
    this.currentPrices.forEach((price, pair) => {
      prices[pair] = price;
    });
    return prices;
  }

  getAllPriceData(): Record<string, PriceData> {
    const data: Record<string, PriceData> = {};
    this.priceData.forEach((priceData, pair) => {
      data[pair] = priceData;
    });
    return data;
  }

  isUsingLiveData(): boolean {
    return this.usingLiveData;
  }

  getApiStatus(): { usingLiveData: boolean; lastUpdate: number; nextUpdate: number } {
    return {
      usingLiveData: this.usingLiveData,
      lastUpdate: this.lastApiUpdate,
      nextUpdate: this.lastApiUpdate + this.apiUpdateInterval,
    };
  }

  // Simulate price updates when API is not available
  private simulatePriceUpdate() {
    Object.entries(TOKEN_PAIRS).forEach(([pair, config]) => {
      const currentPrice = this.currentPrices.get(pair) || config.basePrice;
      this.previousPrices.set(pair, currentPrice);
      
      // Random walk with mean reversion
      const change = (Math.random() - 0.5) * 2 * config.volatility;
      const meanReversion = (config.basePrice - currentPrice) / config.basePrice * 0.1;
      const newPrice = currentPrice * (1 + change + meanReversion);
      
      this.currentPrices.set(pair, Math.max(newPrice, config.basePrice * 0.5));
      
      // Update price data
      const existingData = this.priceData.get(pair);
      this.priceData.set(pair, {
        price: newPrice,
        change24h: existingData?.change24h || ((newPrice - config.basePrice) / config.basePrice * 100),
        high24h: Math.max(existingData?.high24h || newPrice, newPrice),
        low24h: Math.min(existingData?.low24h || newPrice, newPrice),
        volume24h: existingData?.volume24h || 0,
        marketCap: existingData?.marketCap || 0,
        lastUpdated: Date.now(),
        source: 'simulated',
      });
    });

    this.updateAlertPrices();
    this.checkAlerts();
    this.saveToStorage();
  }

  private updateAlertPrices() {
    this.alerts.forEach((alert, id) => {
      const currentPrice = this.currentPrices.get(alert.tokenPair) || 0;
      this.alerts.set(id, { ...alert, currentPrice });
    });
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    
    // Initial API fetch
    this.fetchPricesFromApi();
    
    // Set up interval for price updates
    this.priceUpdateInterval = setInterval(() => {
      this.fetchPricesFromApi().catch(() => {
        this.simulatePriceUpdate();
      });
    }, 5000); // Check every 5 seconds, but API calls are rate limited internally
  }

  stopMonitoring() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    this.isMonitoring = false;
  }

  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  createAlert(params: {
    tokenPair: string;
    targetPrice: number;
    condition: 'above' | 'below' | 'crosses';
    repeatAlert?: boolean;
    note?: string;
    network?: string;
  }): PriceAlert {
    const currentPrice = this.getCurrentPrice(params.tokenPair);
    
    const alert: PriceAlert = {
      id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tokenPair: params.tokenPair,
      targetPrice: params.targetPrice,
      condition: params.condition,
      currentPrice,
      createdAt: Date.now(),
      triggeredAt: null,
      enabled: true,
      notified: false,
      repeatAlert: params.repeatAlert || false,
      note: params.note || '',
      network: params.network || 'ethereum',
    };

    this.alerts.set(alert.id, alert);
    this.saveToStorage();
    return alert;
  }

  updateAlert(id: string, updates: Partial<PriceAlert>): PriceAlert | null {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    const updatedAlert = { ...alert, ...updates };
    this.alerts.set(id, updatedAlert);
    this.saveToStorage();
    return updatedAlert;
  }

  deleteAlert(id: string): boolean {
    const deleted = this.alerts.delete(id);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  getAlert(id: string): PriceAlert | null {
    return this.alerts.get(id) || null;
  }

  getAllAlerts(): PriceAlert[] {
    return Array.from(this.alerts.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getActiveAlerts(): PriceAlert[] {
    return this.getAllAlerts().filter(a => a.enabled && !a.triggeredAt);
  }

  getTriggeredAlerts(): PriceAlert[] {
    return this.getAllAlerts().filter(a => a.triggeredAt !== null);
  }

  private checkAlerts() {
    this.alerts.forEach((alert) => {
      if (!alert.enabled) return;
      if (alert.triggeredAt && !alert.repeatAlert) return;

      const currentPrice = this.currentPrices.get(alert.tokenPair) || 0;
      const previousPrice = this.previousPrices.get(alert.tokenPair) || currentPrice;
      
      let triggered = false;
      let message = '';

      switch (alert.condition) {
        case 'above':
          if (currentPrice >= alert.targetPrice && previousPrice < alert.targetPrice) {
            triggered = true;
            message = `${alert.tokenPair} crossed above $${this.formatPrice(alert.targetPrice)}`;
          } else if (currentPrice >= alert.targetPrice && !alert.notified) {
            triggered = true;
            message = `${alert.tokenPair} is above $${this.formatPrice(alert.targetPrice)}`;
          }
          break;
        case 'below':
          if (currentPrice <= alert.targetPrice && previousPrice > alert.targetPrice) {
            triggered = true;
            message = `${alert.tokenPair} crossed below $${this.formatPrice(alert.targetPrice)}`;
          } else if (currentPrice <= alert.targetPrice && !alert.notified) {
            triggered = true;
            message = `${alert.tokenPair} is below $${this.formatPrice(alert.targetPrice)}`;
          }
          break;
        case 'crosses':
          if ((currentPrice >= alert.targetPrice && previousPrice < alert.targetPrice) ||
              (currentPrice <= alert.targetPrice && previousPrice > alert.targetPrice)) {
            triggered = true;
            message = `${alert.tokenPair} crossed $${this.formatPrice(alert.targetPrice)}`;
          }
          break;
      }

      if (triggered) {
        this.triggerAlert(alert, currentPrice, message);
      }
    });
  }

  private formatPrice(price: number): string {
    if (price < 0.00001) return price.toExponential(4);
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  private triggerAlert(alert: PriceAlert, triggeredPrice: number, message: string) {
    const notification: PriceAlertNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      alertId: alert.id,
      tokenPair: alert.tokenPair,
      message,
      targetPrice: alert.targetPrice,
      triggeredPrice,
      condition: alert.condition,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // Update alert state
    const updatedAlert: PriceAlert = {
      ...alert,
      triggeredAt: Date.now(),
      notified: true,
      currentPrice: triggeredPrice,
    };
    this.alerts.set(alert.id, updatedAlert);

    // Notify subscribers (toast notifications will be handled by the component)
    this.subscribers.forEach(callback => callback(notification));

    // Send email notification if enabled
    this.sendEmailNotification(alert, triggeredPrice);

    this.saveToStorage();
  }

  // Send email notification for triggered alert
  private async sendEmailNotification(alert: PriceAlert, triggeredPrice: number) {
    try {
      await notificationPreferencesService.sendPriceAlertEmail({
        tokenPair: alert.tokenPair,
        targetPrice: alert.targetPrice,
        currentPrice: triggeredPrice,
        condition: alert.condition,
      });
    } catch (error) {
      console.error('Failed to send email notification:', error);
    }

    // Send Telegram notification if enabled
    this.sendTelegramNotification(alert, triggeredPrice);
  }

  // Send Telegram notification for triggered alert
  private async sendTelegramNotification(alert: PriceAlert, triggeredPrice: number) {
    try {
      const prefs = notificationPreferencesService.getPreferences();
      if (prefs?.telegramEnabled && prefs?.telegramChatId) {
        const percentChange = ((triggeredPrice - alert.targetPrice) / alert.targetPrice) * 100;
        await telegramService.sendPriceAlert({
          tokenPair: alert.tokenPair,
          targetPrice: alert.targetPrice,
          currentPrice: triggeredPrice,
          condition: alert.condition,
          percentChange,
        });
      }
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }


  subscribe(callback: AlertCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getNotifications(): PriceAlertNotification[] {
    return this.notifications.filter(n => !n.dismissed);
  }

  getAllNotifications(): PriceAlertNotification[] {
    return this.notifications;
  }

  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read && !n.dismissed).length;
  }

  markNotificationRead(id: string) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.saveToStorage();
    }
  }

  markAllNotificationsRead() {
    this.notifications.forEach(n => n.read = true);
    this.saveToStorage();
  }

  dismissNotification(id: string) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.dismissed = true;
      this.saveToStorage();
    }
  }

  clearAllNotifications() {
    this.notifications = [];
    this.saveToStorage();
  }

  resetAlert(id: string) {
    const alert = this.alerts.get(id);
    if (alert) {
      this.alerts.set(id, {
        ...alert,
        triggeredAt: null,
        notified: false,
      });
      this.saveToStorage();
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem('priceAlerts', JSON.stringify(Array.from(this.alerts.entries())));
      localStorage.setItem('priceAlertNotifications', JSON.stringify(this.notifications));
    } catch (e) {
      console.error('Failed to save price alerts to storage:', e);
    }
  }

  private loadFromStorage() {
    try {
      const alertsData = localStorage.getItem('priceAlerts');
      if (alertsData) {
        const entries = JSON.parse(alertsData);
        this.alerts = new Map(entries);
      }

      const notificationsData = localStorage.getItem('priceAlertNotifications');
      if (notificationsData) {
        this.notifications = JSON.parse(notificationsData);
      }
    } catch (e) {
      console.error('Failed to load price alerts from storage:', e);
    }
  }

  // Get price change percentage
  getPriceChange(pair: string): number {
    const data = this.priceData.get(pair);
    if (data) return data.change24h;
    
    const current = this.currentPrices.get(pair) || 0;
    const base = TOKEN_PAIRS[pair]?.basePrice || current;
    return ((current - base) / base) * 100;
  }

  // Get 24h high/low
  get24hRange(pair: string): { high: number; low: number } {
    const data = this.priceData.get(pair);
    if (data) {
      return { high: data.high24h, low: data.low24h };
    }
    
    const current = this.currentPrices.get(pair) || TOKEN_PAIRS[pair]?.basePrice || 0;
    const volatility = TOKEN_PAIRS[pair]?.volatility || 0.02;
    return {
      high: current * (1 + volatility * 2),
      low: current * (1 - volatility * 2),
    };
  }

  // Get volume
  getVolume(pair: string): number {
    return this.priceData.get(pair)?.volume24h || 0;
  }

  // Get market cap
  getMarketCap(pair: string): number {
    return this.priceData.get(pair)?.marketCap || 0;
  }
}

export const priceAlertService = new PriceAlertService();
