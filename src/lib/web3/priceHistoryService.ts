// Price History Service for tracking and charting
export interface PricePoint {
  timestamp: number;
  price: number;
  source: string;
  volume?: number;
}

export interface PriceHistory {
  pair: string;
  points: PricePoint[];
  high24h: number;
  low24h: number;
  avgPrice: number;
  volatility: number;
}

class PriceHistoryService {
  private history: Map<string, PricePoint[]> = new Map();
  private maxPoints = 500; // Keep last 500 points per pair

  addPrice(pair: string, price: number, source: string, volume?: number) {
    if (!this.history.has(pair)) {
      this.history.set(pair, []);
    }
    
    const points = this.history.get(pair)!;
    points.push({ timestamp: Date.now(), price, source, volume });
    
    // Trim to max points
    if (points.length > this.maxPoints) {
      points.shift();
    }
  }

  getHistory(pair: string, duration: number = 3600000): PriceHistory | null {
    const points = this.history.get(pair);
    if (!points || points.length === 0) return null;
    
    const cutoff = Date.now() - duration;
    const filtered = points.filter(p => p.timestamp >= cutoff);
    
    if (filtered.length === 0) return null;
    
    const prices = filtered.map(p => p.price);
    const high24h = Math.max(...prices);
    const low24h = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Calculate volatility (standard deviation)
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance) / avgPrice * 100;
    
    return { pair, points: filtered, high24h, low24h, avgPrice, volatility };
  }

  getChartData(pair: string, interval: '1m' | '5m' | '15m' | '1h' = '1m'): { time: number; price: number }[] {
    const points = this.history.get(pair);
    if (!points) return [];
    
    const intervalMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000 }[interval];
    const grouped: Map<number, number[]> = new Map();
    
    points.forEach(p => {
      const bucket = Math.floor(p.timestamp / intervalMs) * intervalMs;
      if (!grouped.has(bucket)) grouped.set(bucket, []);
      grouped.get(bucket)!.push(p.price);
    });
    
    return Array.from(grouped.entries())
      .map(([time, prices]) => ({
        time,
        price: prices.reduce((a, b) => a + b, 0) / prices.length,
      }))
      .sort((a, b) => a.time - b.time);
  }

  getSpread(pair: string): { uniswap: number; sushi: number; curve: number; spread: number } | null {
    const points = this.history.get(pair);
    if (!points || points.length < 3) return null;
    
    const recent = points.slice(-50);
    const bySource: Record<string, number[]> = {};
    
    recent.forEach(p => {
      const key = p.source.toLowerCase().includes('uni') ? 'uniswap' 
        : p.source.toLowerCase().includes('sushi') ? 'sushi' 
        : p.source.toLowerCase().includes('curve') ? 'curve' : 'other';
      if (!bySource[key]) bySource[key] = [];
      bySource[key].push(p.price);
    });
    
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const uniswap = avg(bySource.uniswap || []);
    const sushi = avg(bySource.sushi || []);
    const curve = avg(bySource.curve || []);
    
    const prices = [uniswap, sushi, curve].filter(p => p > 0);
    const spread = prices.length > 1 ? ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100 : 0;
    
    return { uniswap, sushi, curve, spread };
  }

  clearHistory(pair?: string) {
    if (pair) {
      this.history.delete(pair);
    } else {
      this.history.clear();
    }
  }

  // Generate initial mock history for demo
  generateMockHistory(pair: string, basePrice: number) {
    const points: PricePoint[] = [];
    const sources = ['Uniswap V3', 'SushiSwap', 'Curve'];
    let price = basePrice;
    
    for (let i = 300; i >= 0; i--) {
      price += (Math.random() - 0.5) * basePrice * 0.002;
      points.push({
        timestamp: Date.now() - i * 10000,
        price,
        source: sources[Math.floor(Math.random() * sources.length)],
        volume: Math.random() * 1000000,
      });
    }
    
    this.history.set(pair, points);
  }
}

export const priceHistoryService = new PriceHistoryService();
