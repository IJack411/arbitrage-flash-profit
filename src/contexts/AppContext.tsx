import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { 
  getUserSettings,
  getOpportunities,
  getTransactions,
  subscribeToOpportunities 
} from '@/lib/supabaseService';
import type { ArbitrageOpportunity, Transaction } from '@/types/arbitrage';

export interface StrategySettings {
  minProfit: number;
  slippage: number;
  maxGas: number;
  loanSize: number;
  enabledDexes: Record<string, boolean>;
}

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  strategySettings: StrategySettings;
  updateStrategySettings: (settings: Partial<StrategySettings>) => void;
  opportunities: ArbitrageOpportunity[];
  transactions: Transaction[];
  loadOpportunities: () => Promise<void>;
  loadTransactions: (walletAddress?: string) => Promise<void>;
  syncSettings: (walletAddress: string) => Promise<void>;
}

const defaultStrategySettings: StrategySettings = {
  minProfit: 15,
  slippage: 0.5,
  maxGas: 8,
  loanSize: 8000,
  enabledDexes: {
    Uniswap: true,
    SushiSwap: true,
    PancakeSwap: true,
    Curve: true,
    Balancer: false,
    '1inch': true,
  },
};

const AppContext = createContext<AppContextType>({
  sidebarOpen: false,
  toggleSidebar: () => {},
  strategySettings: defaultStrategySettings,
  updateStrategySettings: () => {},
  opportunities: [],
  transactions: [],
  loadOpportunities: async () => {},
  loadTransactions: async () => {},
  syncSettings: async () => {},
});

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [strategySettings, setStrategySettings] = useState<StrategySettings>(() => {
    try {
      const saved = localStorage.getItem('strategySettings');
      return saved ? JSON.parse(saved) : defaultStrategySettings;
    } catch {
      // Ignore malformed local data and use defaults.
      return defaultStrategySettings;
    }
  });
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('strategySettings', JSON.stringify(strategySettings));
    } catch {
      // Ignore storage quota/private-mode failures.
    }
  }, [strategySettings]);

  // Subscribe to real-time opportunities (silently fail if unavailable)
  useEffect(() => {
    try {
      channelRef.current = subscribeToOpportunities((payload) => {
        try {
          const newOpp = payload?.new;
          if (newOpp) {
            setOpportunities(prev => [newOpp, ...prev]);
          }
        } catch {
          // Ignore malformed realtime payloads.
        }
      });
    } catch {
      // Ignore realtime subscription failures.
    }

    return () => {
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      } catch {
        // Ignore realtime cleanup failures.
      }
    };
  }, []);

  const loadOpportunities = useCallback(async () => {
    try {
      const data = await getOpportunities();
      if (Array.isArray(data)) {
        setOpportunities(data);
      }
    } catch {
      // Silently fail - will use mock data
    }
  }, []);

  const loadTransactions = useCallback(async (walletAddress?: string) => {
    try {
      const data = await getTransactions(walletAddress);
      if (Array.isArray(data)) {
        setTransactions(data);
      }
    } catch {
      // Silently fail - will use mock data
    }
  }, []);

  const syncSettings = useCallback(async (walletAddress: string) => {
    try {
      const settings = await getUserSettings(walletAddress);
      if (settings) {
        setStrategySettings({
          minProfit: settings.min_profit_percentage ?? defaultStrategySettings.minProfit,
          slippage: settings.slippage_tolerance ?? defaultStrategySettings.slippage,
          maxGas: settings.max_gas_price ?? defaultStrategySettings.maxGas,
          loanSize: settings.max_loan_amount ?? defaultStrategySettings.loanSize,
          enabledDexes: defaultStrategySettings.enabledDexes,
        });
      }
    } catch {
      // Silently fail - will use local settings
    }
  }, []);

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  const updateStrategySettings = (settings: Partial<StrategySettings>) => {
    setStrategySettings(prev => ({ ...prev, ...settings }));
  };

  return (
    <AppContext.Provider
      value={{
        sidebarOpen, toggleSidebar, strategySettings, updateStrategySettings,
        opportunities, transactions, loadOpportunities, loadTransactions, syncSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
