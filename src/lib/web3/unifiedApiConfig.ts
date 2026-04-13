// Unified API Configuration - ONE PLACE FOR ALL API KEYS
// This consolidates all external service configurations

export interface ApiConfig {
  // Primary blockchain provider (Alchemy or Infura - pick ONE)
  provider: {
    type: 'alchemy' | 'infura';
    apiKey: string;
    networks: Record<string, string>; // chainId -> endpoint
  };
  // The Graph for indexed data (uses same API key pattern)
  theGraph: {
    apiKey: string;
    subgraphs: Record<string, string>;
  };
  // Webhook URLs for notifications (no API keys needed!)
  webhooks: {
    discord?: string;
    telegram?: string;
    slack?: string;
    custom?: string;
  };
}

// Get API key from localStorage or env
const getStoredKey = (key: string): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || '';
  }
  return '';
};

// Get env variable safely
const getEnvVar = (key: string): string => {
  try {
    return import.meta.env[key] || '';
  } catch {
    return '';
  }
};

// Default configuration using Alchemy (recommended)
export const getUnifiedConfig = (): ApiConfig => {
  const alchemyKey = getStoredKey('alchemy_api_key') || getEnvVar('VITE_ALCHEMY_API_KEY') || '';
  const graphKey = getStoredKey('thegraph_api_key') || getEnvVar('VITE_GRAPH_API_KEY') || '';
  

  
  return {
    provider: {
      type: 'alchemy',
      apiKey: alchemyKey,
      networks: {
        '1': `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        '137': `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        '42161': `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        '10': `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`,
        '8453': `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`,
      },
    },
    theGraph: {
      apiKey: graphKey,
      subgraphs: {
        uniswapV3: 'https://gateway.thegraph.com/api/{key}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
        uniswapV2: 'https://gateway.thegraph.com/api/{key}/subgraphs/id/A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum',
        aaveV3: 'https://gateway.thegraph.com/api/{key}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF',
        sushiswap: 'https://gateway.thegraph.com/api/{key}/subgraphs/id/6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT',
      },
    },
    webhooks: {
      discord: getStoredKey('webhook_discord') || getEnvVar('VITE_DISCORD_WEBHOOK_URL'),
      telegram: getStoredKey('webhook_telegram') || getEnvVar('VITE_TELEGRAM_BOT_TOKEN'),
      slack: getStoredKey('webhook_slack') || getEnvVar('VITE_SLACK_WEBHOOK_URL'),
      custom: getStoredKey('webhook_custom'),
    },
  };
};

export const saveApiConfig = (config: Partial<ApiConfig>) => {
  if (config.provider?.apiKey) {
    localStorage.setItem('alchemy_api_key', config.provider.apiKey);
  }
  if (config.theGraph?.apiKey) {
    localStorage.setItem('thegraph_api_key', config.theGraph.apiKey);
  }
  if (config.webhooks) {
    Object.entries(config.webhooks).forEach(([k, v]) => {
      if (v) localStorage.setItem(`webhook_${k}`, v);
    });
  }
};
