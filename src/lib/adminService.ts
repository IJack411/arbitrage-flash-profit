/**
 * Admin Service
 * Manages platform-wide admin operations, user management, and system health
 */

import { feeService, FeeConfig, FeeTransaction } from './feeService';

export interface PlatformUser {
  id: string;
  email: string;
  walletAddress?: string;
  displayName?: string;
  role: 'user' | 'admin' | 'superadmin';
  status: 'active' | 'suspended' | 'pending';
  subscriptionTier: 'free' | 'basic' | 'pro' | 'enterprise';
  createdAt: string;
  lastActive: string;
  totalTrades: number;
  totalVolume: number;
  totalProfit: number;
  feesGenerated: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number; // in seconds
  lastCheck: string;
  services: {
    name: string;
    status: 'online' | 'offline' | 'degraded';
    latency: number; // in ms
    lastError?: string;
  }[];
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    activeConnections: number;
    requestsPerMinute: number;
    errorRate: number;
  };
}

export interface PlatformStats {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  newUsersToday: number;
  totalWallets: number;
  activeWallets: number;
  totalTrades: number;
  trades24h: number;
  totalVolume: number;
  volume24h: number;
  totalFees: number;
  fees24h: number;
  avgTradeSize: number;
  successRate: number;
}

export interface AdminWallet {
  id: string;
  address: string;
  ownerEmail?: string;
  ownerName?: string;
  network: string;
  balance: number;
  balanceUSD: number;
  status: 'active' | 'flagged' | 'suspended';
  tradingEnabled: boolean;
  totalTrades: number;
  totalVolume: number;
  lastActivity: string;
  riskScore: number;
  notes?: string;
}

export interface FeeOverride {
  id: string;
  userId?: string;
  walletAddress?: string;
  feePercent: number;
  reason: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
}

class AdminService {
  private users: PlatformUser[] = [];
  private wallets: AdminWallet[] = [];
  private feeOverrides: FeeOverride[] = [];
  private systemHealth: SystemHealth;
  private platformStats: PlatformStats;

  constructor() {
    // Initialize with mock data
    this.loadMockData();
    this.systemHealth = this.generateSystemHealth();
    this.platformStats = this.calculatePlatformStats();
  }

  private loadMockData(): void {
    // Generate mock users
    const roles: PlatformUser['role'][] = ['user', 'user', 'user', 'admin', 'user'];
    const statuses: PlatformUser['status'][] = ['active', 'active', 'active', 'pending', 'suspended'];
    const tiers: PlatformUser['subscriptionTier'][] = ['free', 'basic', 'pro', 'enterprise', 'free'];

    this.users = Array.from({ length: 50 }, (_, i) => ({
      id: `user-${i + 1}`,
      email: `user${i + 1}@example.com`,
      walletAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      displayName: `User ${i + 1}`,
      role: roles[i % roles.length],
      status: statuses[i % statuses.length],
      subscriptionTier: tiers[i % tiers.length],
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      totalTrades: Math.floor(Math.random() * 500),
      totalVolume: Math.random() * 100000,
      totalProfit: Math.random() * 5000 - 1000,
      feesGenerated: Math.random() * 100,
    }));

    // Generate mock wallets
    const networks = ['ethereum', 'polygon', 'arbitrum', 'bsc', 'optimism'];
    const walletStatuses: AdminWallet['status'][] = ['active', 'active', 'active', 'flagged', 'suspended'];

    this.wallets = Array.from({ length: 75 }, (_, i) => ({
      id: `wallet-${i + 1}`,
      address: `0x${Math.random().toString(16).substr(2, 40)}`,
      ownerEmail: this.users[i % this.users.length]?.email,
      ownerName: this.users[i % this.users.length]?.displayName,
      network: networks[i % networks.length],
      balance: Math.random() * 50,
      balanceUSD: Math.random() * 125000,
      status: walletStatuses[i % walletStatuses.length],
      tradingEnabled: Math.random() > 0.1,
      totalTrades: Math.floor(Math.random() * 200),
      totalVolume: Math.random() * 50000,
      lastActivity: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString(),
      riskScore: Math.floor(Math.random() * 100),
    }));

    // Generate mock fee overrides
    this.feeOverrides = Array.from({ length: 10 }, (_, i) => ({
      id: `override-${i + 1}`,
      userId: this.users[i]?.id,
      walletAddress: this.wallets[i]?.address,
      feePercent: Math.random() * 0.3,
      reason: ['VIP customer', 'Partner discount', 'Promotional offer', 'Bug compensation'][i % 4],
      createdBy: 'admin@platform.com',
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: Math.random() > 0.5 ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      isActive: Math.random() > 0.2,
    }));
  }

  private generateSystemHealth(): SystemHealth {
    const services = [
      { name: 'API Gateway', status: 'online' as const, latency: 45 },
      { name: 'Database', status: 'online' as const, latency: 12 },
      { name: 'Redis Cache', status: 'online' as const, latency: 3 },
      { name: 'Price Feed', status: 'online' as const, latency: 89 },
      { name: 'Blockchain RPC', status: 'online' as const, latency: 156 },
      { name: 'Flashbots Relay', status: 'online' as const, latency: 234 },
      { name: 'WebSocket Server', status: 'online' as const, latency: 8 },
      { name: 'Alert Engine', status: 'online' as const, latency: 23 },
    ];

    return {
      status: 'healthy',
      uptime: 2592000 + Math.floor(Math.random() * 86400), // ~30 days
      lastCheck: new Date().toISOString(),
      services,
      metrics: {
        cpuUsage: 35 + Math.random() * 20,
        memoryUsage: 45 + Math.random() * 25,
        activeConnections: 1200 + Math.floor(Math.random() * 500),
        requestsPerMinute: 15000 + Math.floor(Math.random() * 5000),
        errorRate: Math.random() * 0.5,
      },
    };
  }

  private calculatePlatformStats(): PlatformStats {
    const feeStats = feeService.getStats();
    const activeUsers24h = this.users.filter(u => 
      new Date(u.lastActive).getTime() > Date.now() - 24 * 60 * 60 * 1000
    ).length;
    const activeUsers7d = this.users.filter(u => 
      new Date(u.lastActive).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    ).length;
    const newUsersToday = this.users.filter(u => 
      new Date(u.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
    ).length;

    const totalVolume = this.users.reduce((sum, u) => sum + u.totalVolume, 0);
    const totalTrades = this.users.reduce((sum, u) => sum + u.totalTrades, 0);

    return {
      totalUsers: this.users.length,
      activeUsers24h,
      activeUsers7d,
      newUsersToday,
      totalWallets: this.wallets.length,
      activeWallets: this.wallets.filter(w => w.status === 'active').length,
      totalTrades,
      trades24h: Math.floor(totalTrades * 0.05),
      totalVolume,
      volume24h: totalVolume * 0.08,
      totalFees: feeStats.totalCollected + this.users.reduce((sum, u) => sum + u.feesGenerated, 0),
      fees24h: feeStats.totalCollected * 0.1,
      avgTradeSize: totalTrades > 0 ? totalVolume / totalTrades : 0,
      successRate: 94.5 + Math.random() * 3,
    };
  }

  // User Management
  getUsers(filters?: {
    role?: PlatformUser['role'];
    status?: PlatformUser['status'];
    tier?: PlatformUser['subscriptionTier'];
    search?: string;
  }): PlatformUser[] {
    let filtered = [...this.users];

    if (filters?.role) {
      filtered = filtered.filter(u => u.role === filters.role);
    }
    if (filters?.status) {
      filtered = filtered.filter(u => u.status === filters.status);
    }
    if (filters?.tier) {
      filtered = filtered.filter(u => u.subscriptionTier === filters.tier);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(u => 
        u.email.toLowerCase().includes(search) ||
        u.displayName?.toLowerCase().includes(search) ||
        u.walletAddress?.toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  getUserById(userId: string): PlatformUser | undefined {
    return this.users.find(u => u.id === userId);
  }

  updateUserStatus(userId: string, status: PlatformUser['status']): void {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.status = status;
    }
  }

  updateUserRole(userId: string, role: PlatformUser['role']): void {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.role = role;
    }
  }

  updateUserTier(userId: string, tier: PlatformUser['subscriptionTier']): void {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.subscriptionTier = tier;
    }
  }

  // Wallet Management
  getWallets(filters?: {
    network?: string;
    status?: AdminWallet['status'];
    search?: string;
    minRiskScore?: number;
  }): AdminWallet[] {
    let filtered = [...this.wallets];

    if (filters?.network) {
      filtered = filtered.filter(w => w.network === filters.network);
    }
    if (filters?.status) {
      filtered = filtered.filter(w => w.status === filters.status);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(w => 
        w.address.toLowerCase().includes(search) ||
        w.ownerEmail?.toLowerCase().includes(search) ||
        w.ownerName?.toLowerCase().includes(search)
      );
    }
    if (filters?.minRiskScore !== undefined) {
      filtered = filtered.filter(w => w.riskScore >= filters.minRiskScore!);
    }

    return filtered;
  }

  updateWalletStatus(walletId: string, status: AdminWallet['status']): void {
    const wallet = this.wallets.find(w => w.id === walletId);
    if (wallet) {
      wallet.status = status;
    }
  }

  toggleWalletTrading(walletId: string, enabled: boolean): void {
    const wallet = this.wallets.find(w => w.id === walletId);
    if (wallet) {
      wallet.tradingEnabled = enabled;
    }
  }

  addWalletNote(walletId: string, note: string): void {
    const wallet = this.wallets.find(w => w.id === walletId);
    if (wallet) {
      wallet.notes = note;
    }
  }

  // Fee Management
  getFeeOverrides(): FeeOverride[] {
    return [...this.feeOverrides];
  }

  createFeeOverride(override: Omit<FeeOverride, 'id' | 'createdAt'>): FeeOverride {
    const newOverride: FeeOverride = {
      ...override,
      id: `override-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.feeOverrides.push(newOverride);
    return newOverride;
  }

  updateFeeOverride(overrideId: string, updates: Partial<FeeOverride>): void {
    const override = this.feeOverrides.find(o => o.id === overrideId);
    if (override) {
      Object.assign(override, updates);
    }
  }

  deleteFeeOverride(overrideId: string): void {
    this.feeOverrides = this.feeOverrides.filter(o => o.id !== overrideId);
  }

  getFeeConfig(): FeeConfig {
    return feeService.getConfig();
  }

  updateFeeConfig(config: Partial<FeeConfig>): void {
    feeService.updateConfig(config);
  }

  getFeeHistory(limit?: number): FeeTransaction[] {
    return feeService.getFeeHistory(limit);
  }

  // System Health
  getSystemHealth(): SystemHealth {
    // Refresh health data
    this.systemHealth = this.generateSystemHealth();
    return this.systemHealth;
  }

  // Platform Stats
  getPlatformStats(): PlatformStats {
    this.platformStats = this.calculatePlatformStats();
    return this.platformStats;
  }

  // Export data
  exportUsers(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'email', 'displayName', 'role', 'status', 'tier', 'totalTrades', 'totalVolume'];
      const rows = this.users.map(u => 
        [u.id, u.email, u.displayName, u.role, u.status, u.subscriptionTier, u.totalTrades, u.totalVolume].join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }
    return JSON.stringify(this.users, null, 2);
  }

  exportWallets(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'address', 'network', 'status', 'balanceUSD', 'totalTrades', 'riskScore'];
      const rows = this.wallets.map(w => 
        [w.id, w.address, w.network, w.status, w.balanceUSD.toFixed(2), w.totalTrades, w.riskScore].join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }
    return JSON.stringify(this.wallets, null, 2);
  }
}

// Export singleton instance
export const adminService = new AdminService();
