import { supabase, isSupabaseConfigured } from './supabase';
import type { ArbitrageOpportunity, Transaction } from '@/types/arbitrage';
import type { AuditEntry, AuditFilter } from '@/types/auditTypes';

export interface UserSettings {
  wallet_address: string;
  min_profit_percentage: number;
  max_gas_price: number;
  max_loan_amount: number;
  auto_execute: boolean;
  enabled_networks: string[];
  enabled_dexes: string[];
  slippage_tolerance: number;
}

// Safe query helper that never throws
const safeQuery = async <T>(queryFn: () => Promise<{ data: T | null; error: unknown }>): Promise<T | null> => {
  if (!isSupabaseConfigured()) return null;
  
  try {
    const result = await queryFn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((result as any)?.error) return null;
    return result?.data ?? null;
  } catch {
    return null;
  }
};

// Opportunities
export const saveOpportunity = async (opp: ArbitrageOpportunity) => {
  return safeQuery(() => supabase.from('opportunities').insert({
    token_pair: opp.tokenPair,
    buy_dex: opp.buyDex,
    sell_dex: opp.sellDex,
    buy_price: opp.buyPrice,
    sell_price: opp.sellPrice,
    profit_percentage: opp.profitPercentage,
    estimated_profit: opp.estimatedProfit,
    loan_amount: opp.loanAmount,
    gas_cost: opp.gasCost,
    liquidity: opp.liquidity,
    confidence_score: opp.confidenceScore,
    network: opp.network || 'ethereum',
    status: 'active'
  }).select().single());
};

export const getOpportunities = async (limit = 50): Promise<ArbitrageOpportunity[]> => {
  const data = await safeQuery(() => supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit));
  return Array.isArray(data) ? data as ArbitrageOpportunity[] : [];
};

export const subscribeToOpportunities = (callback: (payload: { new: ArbitrageOpportunity }) => void) => {
  if (!isSupabaseConfigured()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { unsubscribe: () => {} } as any;
  }
  
  try {
    return supabase
      .channel('opportunities')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'opportunities' }, callback as any)
      .subscribe();
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { unsubscribe: () => {} } as any;
  }
};

// Transactions
export const saveTransaction = async (tx: Partial<Transaction> & Record<string, unknown>) => {
  return safeQuery(() => supabase.from('transactions').insert(tx).select().single());
};

export const getTransactions = async (walletAddress?: string, limit = 100): Promise<Transaction[]> => {
  let query = supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(limit);
  if (walletAddress) query = query.eq('wallet_address', walletAddress);
  const data = await safeQuery(() => query);
  return Array.isArray(data) ? data as Transaction[] : [];
};

// User Settings
export const saveUserSettings = async (settings: UserSettings) => {
  return safeQuery(() => supabase.from('user_settings').upsert(settings, { onConflict: 'wallet_address' }).select().single());
};

export const getUserSettings = async (walletAddress: string) => {
  return safeQuery(() => supabase.from('user_settings').select('*').eq('wallet_address', walletAddress).single());
};

// Audit Logs
export const saveAuditLog = async (entry: Partial<AuditEntry>) => {
  return safeQuery(() => supabase.from('governance_audit_logs').insert(entry).select().single());
};

export const getAuditLogs = async (filter?: AuditFilter, limit = 500): Promise<AuditEntry[]> => {
  let query = supabase.from('governance_audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (filter?.actionTypes?.length) query = query.in('action_type', filter.actionTypes);
  if (filter?.categories?.length) query = query.in('action_category', filter.categories);
  if (filter?.userId) query = query.eq('user_id', filter.userId);
  const data = await safeQuery(() => query);
  return Array.isArray(data) ? data as AuditEntry[] : [];
};

export const checkDatabaseConnection = async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const result = await safeQuery(() => supabase.from('governance_audit_logs').select('id').limit(1));
  return result !== null;
};
