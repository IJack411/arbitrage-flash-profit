import React from 'react';
import { CodeBlock } from './CodeBlock';

export const scannerFunctionCode = `import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEX_ROUTERS: Record<string, string> = {
  uniswap: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  pancakeswap: '0xEfF92A263d31888d860bD50809A8D171709b7b1c',
}

const TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3830',
}

const ROUTER_ABI = ['function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)']

const TOKEN_PAIRS = [
  { name: 'ETH/USDC', tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, decimalsIn: 18, decimalsOut: 6 },
  { name: 'ETH/USDT', tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDT, decimalsIn: 18, decimalsOut: 6 },
  { name: 'ETH/DAI', tokenIn: TOKENS.WETH, tokenOut: TOKENS.DAI, decimalsIn: 18, decimalsOut: 18 },
]

async function getPrice(provider: any, dex: string, pair: any): Promise<number> {
  const router = new ethers.Contract(DEX_ROUTERS[dex], ROUTER_ABI, provider)
  const amountIn = ethers.parseUnits('1', pair.decimalsIn)
  const amounts = await router.getAmountsOut(amountIn, [pair.tokenIn, pair.tokenOut])
  return parseFloat(ethers.formatUnits(amounts[1], pair.decimalsOut))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    if (body.test) return new Response(JSON.stringify({ status: 'ok' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const rpcUrl = Deno.env.get('INFURA_API_KEY') 
      ? \`https://mainnet.infura.io/v3/\${Deno.env.get('INFURA_API_KEY')}\`
      : 'https://eth.llamarpc.com'

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    // ... scanning logic continues
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})`;

export const EdgeFunctionCode: React.FC = () => (
  <div className="space-y-4">
    <p className="text-gray-300 text-sm">
      Copy this code to <code className="bg-gray-800 px-2 py-1 rounded text-cyan-400">
      supabase/functions/scan-arbitrage-opportunities/index.ts</code>
    </p>
    <CodeBlock code={scannerFunctionCode} language="typescript" title="index.ts" />
    <p className="text-yellow-400 text-xs mt-2">
      Note: Full code is in EDGE_FUNCTION_CODE.md - this is a preview
    </p>
  </div>
);
