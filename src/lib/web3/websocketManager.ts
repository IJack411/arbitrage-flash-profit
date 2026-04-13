// Enhanced WebSocket Manager with Mempool Monitoring
import { getUnifiedConfig } from './unifiedApiConfig';

export interface PriceUpdate {
  pair: string;
  price: number;
  source: string;
  timestamp: number;
  change: number;
}

export interface PendingTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  input: string;
  timestamp: number;
}

export interface MempoolStats {
  pendingCount: number;
  avgGasPrice: number;
  highValueTxs: number;
  dexTxs: number;
}

type PriceCallback = (update: PriceUpdate) => void;
type MempoolCallback = (tx: PendingTx) => void;

class WebSocketManager {
  private connections: Map<string, WebSocket> = new Map();
  private subscribers: Map<string, Set<PriceCallback>> = new Map();
  private mempoolSubscribers: Set<MempoolCallback> = new Set();
  private simulationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private mempoolInterval: NodeJS.Timeout | null = null;
  private isSimulating = true;
  private mempoolStats: MempoolStats = { pendingCount: 0, avgGasPrice: 0, highValueTxs: 0, dexTxs: 0 };

  // Subscribe to price updates
  subscribe(pair: string, callback: PriceCallback): () => void {
    if (!this.subscribers.has(pair)) {
      this.subscribers.set(pair, new Set());
      this.startPriceStream(pair);
    }
    this.subscribers.get(pair)!.add(callback);
    return () => {
      const subs = this.subscribers.get(pair);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.stopPriceStream(pair);
          this.subscribers.delete(pair);
        }
      }
    };
  }

  // Subscribe to mempool updates
  subscribeMempool(callback: MempoolCallback): () => void {
    if (this.mempoolSubscribers.size === 0) this.startMempoolMonitor();
    this.mempoolSubscribers.add(callback);
    return () => {
      this.mempoolSubscribers.delete(callback);
      if (this.mempoolSubscribers.size === 0) this.stopMempoolMonitor();
    };
  }

  private startMempoolMonitor() {
    // Simulate mempool activity
    this.mempoolInterval = setInterval(() => {
      const tx: PendingTx = {
        hash: `0x${Math.random().toString(16).substr(2, 64)}`,
        from: `0x${Math.random().toString(16).substr(2, 40)}`,
        to: `0x${Math.random().toString(16).substr(2, 40)}`,
        value: (Math.random() * 10).toFixed(4),
        gasPrice: (20 + Math.random() * 100).toFixed(0),
        input: Math.random() > 0.7 ? '0x38ed1739' : '0x', // Uniswap swap signature
        timestamp: Date.now(),
      };
      this.mempoolStats.pendingCount = 150 + Math.floor(Math.random() * 100);
      this.mempoolStats.avgGasPrice = 25 + Math.random() * 50;
      this.mempoolStats.highValueTxs = Math.floor(Math.random() * 10);
      this.mempoolStats.dexTxs = 20 + Math.floor(Math.random() * 30);
      this.mempoolSubscribers.forEach(cb => cb(tx));
    }, 500);
  }

  private stopMempoolMonitor() {
    if (this.mempoolInterval) {
      clearInterval(this.mempoolInterval);
      this.mempoolInterval = null;
    }
  }

  private startPriceStream(pair: string) {
    const basePrices: Record<string, number> = {
      'ETH/USD': 2350, 'BTC/USD': 43500, 'LINK/USD': 14.5, 'UNI/USD': 6.2,
      'AAVE/USD': 95, 'MATIC/USD': 0.85, 'ARB/USD': 1.15, 'OP/USD': 2.1,
    };
    let price = basePrices[pair] || 100;
    const sources = ['Uniswap V3', 'SushiSwap', 'Curve', 'Chainlink'];
    
    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 0.002 * price;
      price += change;
      const update: PriceUpdate = {
        pair, price, source: sources[Math.floor(Math.random() * sources.length)],
        timestamp: Date.now(), change: (change / price) * 100,
      };
      this.subscribers.get(pair)?.forEach(cb => cb(update));
    }, 300 + Math.random() * 500);
    
    this.simulationIntervals.set(pair, interval);
  }

  private stopPriceStream(pair: string) {
    const interval = this.simulationIntervals.get(pair);
    if (interval) { clearInterval(interval); this.simulationIntervals.delete(pair); }
  }

  getMempoolStats(): MempoolStats { return this.mempoolStats; }
  getActiveStreams(): string[] { return Array.from(this.subscribers.keys()); }
  setSimulationMode(enabled: boolean) { this.isSimulating = enabled; }
}

export const wsManager = new WebSocketManager();
