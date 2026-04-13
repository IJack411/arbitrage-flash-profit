// Web3 Configuration
export const NETWORKS = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpc: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io',
    currency: 'ETH',
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    rpc: 'https://polygon-rpc.com',
    explorer: 'https://polygonscan.com',
    currency: 'MATIC',
  },
  bsc: {
    chainId: 56,
    name: 'BSC',
    rpc: 'https://bsc-dataseed.binance.org',
    explorer: 'https://bscscan.com',
    currency: 'BNB',
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum',
    rpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    currency: 'ETH',
  },
};

export const FLASH_LOAN_PROVIDERS = {
  aave: {
    ethereum: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
    polygon: '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf',
  },
  dydx: {
    ethereum: '0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e',
  },
};

export const DEX_ROUTERS = {
  uniswap: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
};

// ============================================
// DEPLOYED CONTRACT ADDRESS MANAGEMENT
// ============================================
// Reads from: localStorage (priority) → .env → empty
// Set via: Contracts tab in the UI, or .env file

const getStoredAddress = (key: string): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key) || '';
  }
  return '';
};

const getEnvAddress = (key: string): string => {
  try {
    const val = import.meta.env[key] || '';
    // Don't return placeholder values
    if (val.startsWith('0xYour') || val === '') return '';
    return val;
  } catch {
    return '';
  }
};

export interface ContractAddresses {
  arbitrageContract: string;   // Your deployed receiver contract
  flashLoanProvider: string;   // Flash loan provider (e.g., Aave Pool)
  network: string;             // Which network the contract is on
}

// Get the currently configured contract addresses
export const getContractAddresses = (): ContractAddresses => {
  return {
    arbitrageContract: getStoredAddress('arbitrage_contract_address') || getEnvAddress('VITE_ARBITRAGE_CONTRACT_ADDRESS'),
    flashLoanProvider: getStoredAddress('flash_loan_provider_address') || getEnvAddress('VITE_FLASH_LOAN_PROVIDER_ADDRESS'),
    network: getStoredAddress('contract_network') || 'ethereum',
  };
};

// Save contract addresses to localStorage (persists across sessions)
export const saveContractAddresses = (addresses: Partial<ContractAddresses>) => {
  if (addresses.arbitrageContract) {
    localStorage.setItem('arbitrage_contract_address', addresses.arbitrageContract);
  }
  if (addresses.flashLoanProvider) {
    localStorage.setItem('flash_loan_provider_address', addresses.flashLoanProvider);
  }
  if (addresses.network) {
    localStorage.setItem('contract_network', addresses.network);
  }
};

// Clear saved contract addresses
export const clearContractAddresses = () => {
  localStorage.removeItem('arbitrage_contract_address');
  localStorage.removeItem('flash_loan_provider_address');
  localStorage.removeItem('contract_network');
};

// Check if contract addresses are configured
export const isContractConfigured = (): boolean => {
  const addresses = getContractAddresses();
  return !!(addresses.arbitrageContract && addresses.flashLoanProvider);
};

// Validate an Ethereum address format
export const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};
