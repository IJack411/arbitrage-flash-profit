import { ethers } from 'ethers';
import { DEX_ROUTERS } from './config';
import { indexerService } from './indexerService';
import { applyBps, fromScaled, spreadBpsFromPrices, toScaled } from '@/lib/math/deterministicMath';

const UNISWAP_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)',
];

// Well-known token addresses on Ethereum Mainnet
const TOKENS: Record<string, { address: string; decimals: number }> = {
  WETH:  { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  USDC:  { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
  USDT:  { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
  DAI:   { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  WBTC:  { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8  },
  LINK:  { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
};

// Pairs to scan across DEXes
const SCAN_PAIRS = [
  ['WETH', 'USDC'],
  ['WETH', 'USDT'],
  ['WETH', 'DAI'],
  ['WBTC', 'WETH'],
  ['LINK', 'WETH'],
];

export interface DexPrice {
  dex: string;
  price: number;
  liquidity: number;
  timestamp: number;
}

interface GraphTokenRef {
  symbol: string;
  id: string;
}

interface GraphPoolRef {
  token0: GraphTokenRef;
  token1: GraphTokenRef;
}

interface ScannerOpportunity {
  tokenPair: string;
  buyDex: string;
  sellDex: string;
  network: string;
  loanAmount: number;
  netProfit: number;
  gasCost: number;
  confidenceScore: number;
  spread: string;
}

export class DexService {
  private provider: ethers.BrowserProvider;

  constructor(provider: ethers.BrowserProvider) {
    this.provider = provider;
  }

  private isNoRouteQuoteError(error: unknown): boolean {
    const candidate = error as { code?: string; message?: string; shortMessage?: string };
    const code = candidate?.code ?? '';
    const message = String(candidate?.message ?? '').toLowerCase();
    const shortMessage = String(candidate?.shortMessage ?? '').toLowerCase();
    return (
      code === 'BAD_DATA' ||
      code === 'CALL_EXCEPTION' ||
      message.includes('could not decode result data') ||
      shortMessage.includes('could not decode result data') ||
      message.includes('missing revert data') ||
      shortMessage.includes('missing revert data')
    );
  }

  async getPrice(dex: string, tokenIn: string, tokenOut: string, amountIn: string): Promise<number> {
    const routerAddress = DEX_ROUTERS[dex.toLowerCase() as keyof typeof DEX_ROUTERS];
    if (!routerAddress) throw new Error(`Unknown DEX: ${dex}`);

    const router = new ethers.Contract(routerAddress, UNISWAP_ROUTER_ABI, this.provider);
    const path = [tokenIn, tokenOut];
    
    try {
      const tokenInInfo = Object.values(TOKENS).find(t => t.address.toLowerCase() === tokenIn.toLowerCase());
      const tokenOutInfo = Object.values(TOKENS).find(t => t.address.toLowerCase() === tokenOut.toLowerCase());
      const inDecimals = tokenInInfo?.decimals ?? 18;
      const outDecimals = tokenOutInfo?.decimals ?? 18;

      const amountInWei = ethers.parseUnits(amountIn, inDecimals);
      const amounts = await router.getAmountsOut(amountInWei, path);
      return parseFloat(ethers.formatUnits(amounts[1], outDecimals));
    } catch (error) {
      // Common case when a direct pair path does not exist on this router.
      if (this.isNoRouteQuoteError(error)) {
        return 0;
      }
      console.warn(`Failed to fetch price from ${dex}:`, error);
      return 0;
    }
  }

  async fetchAllPrices(tokenPair: string): Promise<DexPrice[]> {
    // Real implementation would query subgraphs/RPC for this pair.
    // Returns empty until wired to a live data source.
    return [];
  }

  // Primary scan: use The Graph indexer for fast multi-DEX, multi-pair coverage
  async scanOpportunities(networks: string[]): Promise<ScannerOpportunity[]> {
    if (!networks.includes('ethereum')) return [];

    const opportunities: ScannerOpportunity[] = [];

    // Strategy 1: Use The Graph indexed pool data (fast, rich data)
    try {
      const [uniV3Pools, uniV2Pools, sushiPools] = await Promise.all([
        indexerService.querySubgraph('uniswapV3',
          `{ pools(first: 50, orderBy: volumeUSD, orderDirection: desc, where: { volumeUSD_gt: "100000" }) {
            id token0 { symbol id } token1 { symbol id }
            token0Price token1Price volumeUSD liquidity feeTier
          }}`
        ),
        indexerService.querySubgraph('uniswapV2',
          `{ pairs(first: 50, orderBy: volumeUSD, orderDirection: desc, where: { volumeUSD_gt: "100000" }) {
            id token0 { symbol id } token1 { symbol id }
            token0Price token1Price volumeUSD reserveUSD
          }}`
        ),
        indexerService.querySubgraph('sushiswap',
          `{ pairs(first: 50, orderBy: volumeUSD, orderDirection: desc, where: { volumeUSD_gt: "100000" }) {
            id token0 { symbol id } token1 { symbol id }
            token0Price token1Price volumeUSD reserveUSD
          }}`
        ),
      ]);

      // Build lookup maps: "TOKEN0/TOKEN1" -> price
      const v3Map: Record<string, { price: number; liquidity: string; pool: GraphPoolRef }> = {};
      const v2Map: Record<string, { price: number; liquidity: string; pool: GraphPoolRef }> = {};
      const sushiMap: Record<string, { price: number; liquidity: string; pool: GraphPoolRef }> = {};

      for (const pool of uniV3Pools?.pools ?? []) {
        const key = `${pool.token0.symbol}/${pool.token1.symbol}`;
        const price = parseFloat(pool.token1Price);
        if (!v3Map[key] || price > 0) v3Map[key] = { price, liquidity: pool.liquidity, pool };
      }
      for (const pair of uniV2Pools?.pairs ?? []) {
        const key = `${pair.token0.symbol}/${pair.token1.symbol}`;
        const price = parseFloat(pair.token1Price);
        v2Map[key] = { price, liquidity: pair.reserveUSD, pool: pair };
      }
      for (const pair of sushiPools?.pairs ?? []) {
        const key = `${pair.token0.symbol}/${pair.token1.symbol}`;
        const price = parseFloat(pair.token1Price);
        sushiMap[key] = { price, liquidity: pair.reserveUSD, pool: pair };
      }

      // Compare prices across DEXes for each pair
      const allKeys = new Set([...Object.keys(v3Map), ...Object.keys(v2Map), ...Object.keys(sushiMap)]);
      
      for (const key of allKeys) {
        const prices: Array<{ dex: string; price: number; liquidity: string }> = [];
        if (v3Map[key]?.price > 0) prices.push({ dex: 'Uniswap V3', price: v3Map[key].price, liquidity: v3Map[key].liquidity });
        if (v2Map[key]?.price > 0) prices.push({ dex: 'Uniswap V2', price: v2Map[key].price, liquidity: v2Map[key].liquidity });
        if (sushiMap[key]?.price > 0) prices.push({ dex: 'SushiSwap', price: sushiMap[key].price, liquidity: sushiMap[key].liquidity });

        if (prices.length < 2) continue;

        const maxPrice = Math.max(...prices.map(p => p.price));
        const minPrice = Math.min(...prices.map(p => p.price));
        if (minPrice === 0) continue;

        const maxPriceScaled = toScaled(maxPrice);
        const minPriceScaled = toScaled(minPrice);
        const spreadBps = spreadBpsFromPrices(maxPriceScaled, minPriceScaled);
        const spread = Number(spreadBps) / 100;

        if (spread > 0.08) {
          const buyEntry = prices.find(p => p.price === minPrice)!;
          const sellEntry = prices.find(p => p.price === maxPrice)!;
          const estimatedProfitScaled = applyBps(toScaled('5000'), spreadBps);
          const estimatedProfit = fromScaled(estimatedProfitScaled, 6);
          const gasCost = 3.5; // USD

          opportunities.push({
            tokenPair: key,
            buyDex: buyEntry.dex,
            sellDex: sellEntry.dex,
            network: 'ethereum',
            loanAmount: 5000,
            netProfit: estimatedProfit - gasCost,
            gasCost,
            confidenceScore: Math.min(99, Math.round(60 + spread * 100)),
            spread: spread.toFixed(4),
          });
        }
      }

      console.log(`[Scanner] The Graph scan: checked ${allKeys.size} pairs, found ${opportunities.length} opportunities`);

      // If The Graph returned data, use it (even if empty means no opps right now)
      if ((uniV3Pools?.pools?.length ?? 0) > 0 || (uniV2Pools?.pairs?.length ?? 0) > 0) {
        return opportunities;
      }
    } catch (e) {
      console.warn('[Scanner] The Graph scan failed, falling back to on-chain RPC:', e);
    }

    // Strategy 2: Fallback — direct on-chain RPC calls (slower but always works)
    console.log('[Scanner] Running fallback on-chain RPC scan...');
    try {
      for (const [baseSymbol, quoteSymbol] of SCAN_PAIRS) {
        const base = TOKENS[baseSymbol];
        const quote = TOKENS[quoteSymbol];
        if (!base || !quote) continue;

        const INPUT_AMOUNT = '1.0';
        const [uniPrice, sushiPrice] = await Promise.all([
          this.getPrice('uniswap', base.address, quote.address, INPUT_AMOUNT),
          this.getPrice('sushiswap', base.address, quote.address, INPUT_AMOUNT),
        ]);

        if (uniPrice > 0 && sushiPrice > 0) {
          const uniPriceScaled = toScaled(uniPrice);
          const sushiPriceScaled = toScaled(sushiPrice);
          const higherPrice = uniPriceScaled > sushiPriceScaled ? uniPriceScaled : sushiPriceScaled;
          const lowerPrice = uniPriceScaled > sushiPriceScaled ? sushiPriceScaled : uniPriceScaled;
          const spreadBps = spreadBpsFromPrices(higherPrice, lowerPrice);
          const spread = Number(spreadBps) / 100;
          console.log(`[Scanner] ${baseSymbol}/${quoteSymbol}: Uni=${uniPrice.toFixed(4)}, Sushi=${sushiPrice.toFixed(4)}, Spread=${spread.toFixed(4)}%`);

          if (spread > 0.08) {
            const isUniCheaper = uniPrice < sushiPrice;
            const estimatedProfitScaled = applyBps(toScaled('5000'), spreadBps);
            const estimatedProfit = fromScaled(estimatedProfitScaled, 6);
            const gasCost = 3.5;
            opportunities.push({
              tokenPair: `${baseSymbol}/${quoteSymbol}`,
              buyDex: isUniCheaper ? 'Uniswap V2' : 'SushiSwap',
              sellDex: isUniCheaper ? 'SushiSwap' : 'Uniswap V2',
              network: 'ethereum',
              loanAmount: 5000,
              netProfit: estimatedProfit - gasCost,
              gasCost,
              confidenceScore: Math.min(99, Math.round(60 + spread * 100)),
              spread: spread.toFixed(4),
            });
          }
        }
      }
    } catch (e) {
      console.error('[Scanner] Fallback RPC scan failed:', e);
    }

    return opportunities;
  }
}
