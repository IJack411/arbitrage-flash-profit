export interface TradingBot {
  id: string;
  name: string;
  wallet_address?: string;
  status: 'running' | 'stopped' | 'paused' | 'error';
  
  // Trigger Configuration
  min_profit_threshold: number;
  max_gas_limit: number;
  token_pairs: string[];
  enabled_networks: string[];
  enabled_dexes: string[];
  
  // Scheduling
  active_hours_start: number;
  active_hours_end: number;
  daily_trade_limit: number;
  max_concurrent_trades: number;
  cooldown_seconds: number;
  
  // Risk Management
  max_position_size: number;
  stop_loss_percentage: number;
  daily_loss_limit: number;
  
  // Performance
  total_trades: number;
  successful_trades: number;
  total_profit: number;
  total_gas_spent: number;
  trades_today: number;
  profit_today: number;
  
  last_execution_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BotExecutionLog {
  id: string;
  bot_id: string;
  opportunity_id?: string;
  action: string;
  status: 'success' | 'failed' | 'skipped' | 'pending';
  token_pair?: string;
  buy_dex?: string;
  sell_dex?: string;
  network?: string;
  loan_amount?: number;
  expected_profit?: number;
  actual_profit?: number;
  gas_cost?: number;
  transaction_hash?: string;
  block_number?: number;
  execution_time_ms?: number;
  error_message?: string;
  error_code?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BotConfig {
  name: string;
  min_profit_threshold: number;
  max_gas_limit: number;
  token_pairs: string[];
  enabled_networks: string[];
  enabled_dexes: string[];
  active_hours_start: number;
  active_hours_end: number;
  daily_trade_limit: number;
  max_concurrent_trades: number;
  cooldown_seconds: number;
  max_position_size: number;
  stop_loss_percentage: number;
  daily_loss_limit: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  name: 'New Trading Bot',
  min_profit_threshold: 50,
  max_gas_limit: 100,
  token_pairs: ['ETH/USDT', 'BTC/USDT', 'WETH/USDC'],
  enabled_networks: ['ethereum', 'polygon', 'arbitrum'],
  enabled_dexes: ['uniswap', 'sushiswap', 'curve'],
  active_hours_start: 0,
  active_hours_end: 24,
  daily_trade_limit: 50,
  max_concurrent_trades: 3,
  cooldown_seconds: 60,
  max_position_size: 10000,
  stop_loss_percentage: 5,
  daily_loss_limit: 500,
};
