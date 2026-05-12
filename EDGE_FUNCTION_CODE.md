# Multi-Chain Arbitrage Scanner Edge Function

Deploy this edge function to scan for arbitrage opportunities across multiple blockchain networks.

## Function Code

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { ethers } from 'https://esm.sh/ethers@6.9.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const NETWORK_CONFIG = {
  ethereum: {
    rpc: (infura, alchemy) => infura ? `https://mainnet.infura.io/v3/${infura}` : alchemy ? `https://eth-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://eth.llamarpc.com',
    dexes: [
      { name: 'Uniswap V2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
      { name: 'SushiSwap', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F' }
    ],
    tokens: [
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' },
      { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI' }
    ]
  },
  polygon: {
    rpc: (infura, alchemy) => infura ? `https://polygon-mainnet.infura.io/v3/${infura}` : alchemy ? `https://polygon-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://polygon-rpc.com',
    dexes: [
      { name: 'QuickSwap', factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' },
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' }
    ],
    tokens: [
      { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC' },
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC' },
      { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH' }
    ]
  },
  arbitrum: {
    rpc: (infura, alchemy) => infura ? `https://arbitrum-mainnet.infura.io/v3/${infura}` : alchemy ? `https://arb-mainnet.g.alchemy.com/v2/${alchemy}` : 'https://arb1.arbitrum.io/rpc',
    dexes: [
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' },
      { name: 'Camelot', factory: '0x6EcCab422D763aC031210895C81787E87B43A652', router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d' }
    ],
    tokens: [
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
      { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC' },
      { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT' }
    ]
  },
  bsc: {
    rpc: () => 'https://bsc-dataseed1.binance.org',
    dexes: [
      { name: 'PancakeSwap', factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E' },
      { name: 'BiSwap', factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE', router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8' }
    ],
    tokens: [
      { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },
      { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC' },
      { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' }
    ]
  }
};

const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { networks = ['ethereum'] } = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const infuraKey = Deno.env.get('INFURA_API_KEY');
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    
    const allOpportunities = [];

    for (const network of networks) {
      const config = NETWORK_CONFIG[network];
      if (!config) continue;

      const provider = new ethers.JsonRpcProvider(config.rpc(infuraKey, alchemyKey));
      const gasPrice = await provider.getFeeData();
      const gasCostWei = (gasPrice.gasPrice || 30000000000n) * 250000n;
      const gasCostEth = Number(gasCostWei) / 1e18;

      for (let i = 0; i < config.tokens.length; i++) {
        for (let j = i + 1; j < config.tokens.length; j++) {
          const token0 = config.tokens[i], token1 = config.tokens[j];
          const prices = [];

          for (const dex of config.dexes) {
            try {
              const factory = new ethers.Contract(dex.factory, FACTORY_ABI, provider);
              const pairAddr = await factory.getPair(token0.address, token1.address);
              if (pairAddr === '0x0000000000000000000000000000000000000000') continue;

              const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
              const [r0, r1] = await pair.getReserves();
              const pt0 = await pair.token0();
              const price = pt0.toLowerCase() === token0.address.toLowerCase() ? Number(r1) / Number(r0) : Number(r0) / Number(r1);
              prices.push({ dex: dex.name, price, router: dex.router, liquidity: Math.min(Number(r0), Number(r1)) / 1e18 });
            } catch (e) { console.error(`${dex.name} error:`, e); }
          }

          if (prices.length >= 2) {
            prices.sort((a, b) => a.price - b.price);
            const buy = prices[0], sell = prices[prices.length - 1];
            const priceDiff = ((sell.price - buy.price) / buy.price) * 100;

            if (priceDiff > 0.5) {
              const profit = (10 * priceDiff / 100) - gasCostEth - 0.03;
              if (profit > 0) {
                allOpportunities.push({
                  token_pair: `${token0.symbol}/${token1.symbol}`, buy_dex: buy.dex, sell_dex: sell.dex,
                  price_difference: priceDiff.toFixed(4), profit_percentage: priceDiff.toFixed(4),
                  estimated_profit: profit.toFixed(6), loan_amount: '10.00', gas_cost: gasCostEth.toFixed(6),
                  buy_price: buy.price.toFixed(8), sell_price: sell.price.toFixed(8),
                  liquidity: (buy.liquidity + sell.liquidity).toFixed(2),
                  confidence_score: priceDiff > 2 ? 'high' : priceDiff > 1 ? 'medium' : 'low',
                  token0_address: token0.address, token1_address: token1.address,
                  buy_router: buy.router, sell_router: sell.router,
                  network, status: 'active', created_at: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    }

    if (allOpportunities.length > 0) {
      await supabase.from('opportunities').insert(allOpportunities);
    }

    return new Response(JSON.stringify({ success: true, networks, found: allOpportunities.length, opportunities: allOpportunities.slice(0, 10) }), 
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});
```

## Deployment Commands

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Create the function
supabase functions new scan-arbitrage-opportunities God Dang it

# Set secrets
supabase secrets set INFURA_API_KEY=your_key
supabase secrets set ALCHEMY_API_KEY=your_key

# Deploy
supabase functions deploy scan-arbitrage-opportunities
```
