// Centralized config for networks and tokens used by both backend and frontend
// WETH pairs included for Ethereum cross-DEX arb: LINK/WETH, WBTC/WETH etc exist on V2+V3+SushiSwap.
// With $50k loan and $26 ETH gas, break-even = 5.2 bps — achievable with V2 vs V3 spreads.

export type NetworkName = 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'bsc';

// CORE_BASE_TOKENS is the universe of NON-stable, NON-WETH symbols accepted as the "base" side
// of a TOKEN/STABLE or TOKEN/WETH cross-DEX pair (see `getTrackableBaseQuote` in scan-arbitrage-opportunities).
// Stables (USDC/USDT/DAI) live in STABLE_QUOTES and don't need to be listed here.
//
// Categories per network:
//   - DeFi blue chips (governance/utility tokens with deep cross-DEX liquidity)
//   - Stable proxies (FRAX, LUSD, sUSD, MIM, crvUSD, etc.) — quote against USDC/USDT/DAI
//   - LSTs (wstETH, rETH, cbETH, frxETH, etc.) — quote against WETH for the LST premium
//
// All entries must be UPPERCASE and free of non-alphanumeric chars (matching `normalizeTokenSymbol`).
export const CORE_BASE_TOKENS: Record<NetworkName, Set<string>> = {
  ethereum: new Set([
    // DeFi blue chips
    'WETH', 'WBTC', 'LINK', 'UNI', 'AAVE', 'CRV', 'SNX', 'LDO', 'MKR', 'COMP', 'RPL',
    'SUSHI', 'BAL', 'ENS', 'FXS', 'CVX', 'YFI', '1INCH', 'GRT',
    // Stable proxies (token side of TOKEN/USDC etc.; routed via Curve metapools + cross-DEX)
    'FRAX', 'LUSD', 'SUSD', 'MIM', 'CRVUSD', 'GUSD', 'USDP', 'TUSD', 'PYUSD', 'USDE',
    // Liquid staking / liquid restaking tokens (quote against WETH for LST premium arb)
    'WSTETH', 'RETH', 'CBETH', 'FRXETH', 'SFRXETH', 'METH', 'EZETH', 'RSETH', 'WEETH',
  ]),
  polygon: new Set([
    'WMATIC', 'MATIC', 'WETH', 'WBTC', 'LINK', 'AAVE', 'GHST', 'CRV', 'SAND', 'QUICK', 'BAL', 'DQUICK',
    // Stable proxies
    'FRAX', 'MIM',
  ]),
  arbitrum: new Set([
    'WETH', 'ARB', 'GMX', 'MAGIC', 'LINK', 'RDNT', 'PENDLE', 'GNS', 'WBTC', 'CRV', 'BAL', 'STG',
    // Stable proxies
    'FRAX', 'USDE',
    // LSTs on Arbitrum
    'WSTETH', 'RETH', 'WEETH',
  ]),
  base: new Set([
    'WETH', 'LINK', 'AERO', 'DEGEN', 'BRETT', 'TOSHI', 'DACKIE', 'BALD',
    // LSTs that have meaningful liquidity on Base
    'CBETH', 'WSTETH',
    // Stable proxies
    'USDE',
  ]),
  bsc: new Set([
    'WBNB', 'BNB', 'ETH', 'BTCB', 'CAKE', 'XVS', 'ALPACA', 'MDX', 'BAKE',
  ]),
};

export const SEARCH_TERMS_BY_NETWORK: Record<NetworkName, string[]> = {
  ethereum: [
    // WETH cross-DEX pairs — exist on V2 + V3 + SushiSwap; primary arb opportunity with $50k loan
    'LINK WETH', 'WBTC WETH', 'AAVE WETH', 'UNI WETH', 'COMP WETH',
    // Stablecoin pairs
    'WBTC USDC', 'WBTC USDT',
    'LINK USDC', 'LINK USDT',
    'UNI USDC', 'AAVE USDC',
    'CRV USDC', 'SNX USDC',
    'LDO USDC', 'MKR USDC',
    'COMP USDC', 'RPL USDC',
    'DAI USDC', 'USDC USDT',
    'WBTC', 'LINK', 'UNI', 'AAVE', 'CRV',
  ],
  polygon: [
    'WMATIC USDC', 'WMATIC USDT',
    'LINK USDC', 'AAVE USDC',
    'GHST USDC', 'CRV USDC',
    'SAND USDC', 'QUICK USDC',
    'BAL USDC', 'DQUICK USDC',
    'DAI USDC', 'USDC USDT',
    'WMATIC', 'GHST', 'SAND', 'QUICK',
  ],
  arbitrum: [
    // WETH cross-DEX pairs — exist on V3 + SushiSwap V2 on Arbitrum; cheap gas ($0.31/tx)
    'WETH USDC', 'WETH USDT', 'MAGIC WETH', 'ARB WETH', 'GMX WETH',
    // Stablecoin pairs
    'ARB USDC', 'GMX USDC',
    'MAGIC USDC', 'LINK USDC',
    'RDNT USDC', 'PENDLE USDC',
    'GNS USDC', 'WBTC USDC',
    'CRV USDC', 'BAL USDC',
    'STG USDC',
    'DAI USDC', 'USDC USDT',
    'ARB', 'GMX', 'MAGIC', 'PENDLE',
  ],
  base: [
    // Base-native tokens — newer ecosystem, wider spreads
    'LINK USDC', 'AERO USDC',
    'DEGEN USDC', 'BRETT USDC',
    'TOSHI USDC', 'DACKIE USDC',
    'BALD USDC',
    'USDC USDT',
    'AERO', 'DEGEN', 'BRETT', 'TOSHI',
  ],
  bsc: [
    'WBNB USDT', 'WBNB USDC',
    'CAKE USDT', 'XVS USDT',
    'ALPACA USDT', 'MDX USDT',
    'BAKE USDT',
    'USDC USDT',
    'WBNB', 'CAKE', 'ALPACA',
  ],
};

export const isNetworkName = (value: string): value is NetworkName => {
  return value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'base' || value === 'bsc';
};
