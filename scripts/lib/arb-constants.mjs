// Canonical Arbitrum addresses, ABIs, and token decimals shared by the
// discovery->execution bridge. Mirrors the constants in
// scripts/realtime-server-experimental.cjs (kept in sync intentionally; the
// .cjs scanner cannot import this ESM module directly).

export const CHAIN_ID = 42161n;

// Aave V3 flash loan premium on Arbitrum = 5 bps (0.05%).
export const AAVE_PREMIUM_BPS = 5n;

export const ROUTERS = {
  UNIV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  SUSHI: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
};

export const UNIV3_QUOTER = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

// Venues permitted for live execution (defense-in-depth mirror of the scanner).
export const LIVE_EXEC_VENUE_ALLOWLIST = new Set([ROUTERS.UNIV3, ROUTERS.SUSHI]);

export const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

export const V2_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
];

export const FLASH_LOAN_ABI = [
  'function executeArbitrage(address asset, uint256 amount, address routerA, address routerB, address tokenB, bool routerAisV3, bool routerBisV3, uint24 feeA, uint24 feeB, uint256 amountBMin) external',
];

// Known Arbitrum token decimals keyed by lowercased address. Used to convert
// on-chain base-unit quotes to human units for USD math.
export const TOKEN_DECIMALS_BY_ADDRESS = new Map([
  ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 18], // WETH
  ['0xaf88d065e77c8cc2239327c5edb3a432268e5831', 6],  // USDC
  ['0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', 6],  // USDCe
  ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', 6],  // USDT
  ['0x912ce59144191c1204e64559fe8253a0e49e6548', 18], // ARB
  ['0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a', 18], // GMX
  ['0x539bde0d7dbd336b79148aa742883198bbf60342', 18], // MAGIC
  ['0x3082cc23568ea640225c2467653db90e9250aaa0', 18], // RDNT
  ['0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8', 18], // PENDLE
  ['0x6694340fc020c5e6b96567843da2df01b2ce1eb6', 18], // STG
]);

export function decimalsForAddress(address, fallback = 18) {
  const d = TOKEN_DECIMALS_BY_ADDRESS.get(String(address || '').toLowerCase());
  return Number.isInteger(d) ? d : fallback;
}
