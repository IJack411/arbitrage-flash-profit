// Oracle Types for Multi-Source Price Aggregation

export interface OraclePrice {
  pair: string;
  price: number;
  decimals: number;
  source: 'chainlink' | 'pyth' | 'band' | 'dex';
  network: string;
  timestamp: number;
  roundId?: string;
  confidence?: number;
  publishTime?: number;
}

export interface AggregatedPrice {
  pair: string;
  network: string;
  aggregatedPrice: number;
  medianPrice: number;
  sources: OraclePrice[];
  deviation: number;
  maxDeviation: number;
  timestamp: number;
  isValid: boolean;
  primarySource: string;
}

export interface OracleFeedHealth {
  feedId: string;
  pair: string;
  source: string;
  network: string;
  status: 'healthy' | 'degraded' | 'stale' | 'offline';
  lastUpdate: number;
  updateFrequency: number;
  deviationThreshold: number;
  heartbeatInterval: number;
  consecutiveFailures: number;
  lastError?: string;
  isPrimary: boolean;
  latency: number;
}

export interface DeviationAlert {
  id: string;
  pair: string;
  network: string;
  sourceA: string;
  sourceB: string;
  priceA: number;
  priceB: number;
  deviationPercent: number;
  severity: 'info' | 'warning' | 'critical';
  resolved: boolean;
  createdAt: number;
  resolvedAt?: number;
}

export interface OracleConfig {
  pair: string;
  network: string;
  updateInterval: number;
  deviationThreshold: number;
  maxStaleness: number;
  enabledSources: string[];
  primarySource: string;
  fallbackOrder: string[];
  alertOnDeviation: boolean;
}

export interface PriceHistoryEntry {
  timestamp: number;
  price: number;
  source: string;
  network: string;
}
