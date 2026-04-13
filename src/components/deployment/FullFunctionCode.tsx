import React, { useState } from 'react';
import { Copy, Check, FileCode, ChevronDown, ChevronUp } from 'lucide-react';

const SCANNER_CODE = `import { createClient } from 'npm:@supabase/supabase-js@2'
import { ethers } from 'npm:ethers@6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEX_ROUTERS = {
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

async function getPrice(provider, dex, pair) {
  const router = new ethers.Contract(DEX_ROUTERS[dex], ROUTER_ABI, provider)
  const amountIn = ethers.parseUnits('1', pair.decimalsIn)
  const amounts = await router.getAmountsOut(amountIn, [pair.tokenIn, pair.tokenOut])
  return parseFloat(ethers.formatUnits(amounts[1], pair.decimalsOut))
}

async function estimateGas(provider) {
  const feeData = await provider.getFeeData()
  const gasPrice = feeData.gasPrice || ethers.parseUnits('30', 'gwei')
  return parseFloat(ethers.formatEther(gasPrice * 350000n))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    if (body.test) return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const rpcUrl = Deno.env.get('INFURA_API_KEY') 
      ? \`https://mainnet.infura.io/v3/\${Deno.env.get('INFURA_API_KEY')}\`
      : 'https://eth.llamarpc.com'

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const opportunities = []
    const dexNames = Object.keys(DEX_ROUTERS)

    for (const pair of TOKEN_PAIRS) {
      const prices = {}
      for (const dex of dexNames) {
        try { prices[dex] = await getPrice(provider, dex, pair) } catch {}
      }
      
      const dexList = Object.keys(prices)
      for (let i = 0; i < dexList.length; i++) {
        for (let j = i + 1; j < dexList.length; j++) {
          const spread = Math.abs(prices[dexList[i]] - prices[dexList[j]]) / 
                        Math.min(prices[dexList[i]], prices[dexList[j]]) * 100
          if (spread > 0.3) {
            const gas = await estimateGas(provider)
            opportunities.push({
              token_pair: pair.name, 
              buy_dex: prices[dexList[i]] < prices[dexList[j]] ? dexList[i] : dexList[j],
              sell_dex: prices[dexList[i]] < prices[dexList[j]] ? dexList[j] : dexList[i],
              buy_price: Math.min(prices[dexList[i]], prices[dexList[j]]),
              sell_price: Math.max(prices[dexList[i]], prices[dexList[j]]),
              profit_percentage: spread, estimated_profit: 10 * spread / 100 - gas,
              loan_amount: 10, gas_cost: gas, network: 'ethereum', status: 'active'
            })
          }
        }
      }
    }

    if (opportunities.length > 0) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
      await supabase.from('opportunities').insert(opportunities)
    }

    return new Response(JSON.stringify({ success: true, found: opportunities.length, opportunities }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
  }
})`;

export const FullFunctionCode: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(SCANNER_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <FileCode className="h-5 w-5 text-cyan-400" />
          <span className="text-white font-medium">scan-arbitrage-opportunities/index.ts</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg flex items-center gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-2 hover:bg-gray-700 rounded-lg">
            {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
        </div>
      </div>
      <div className={`overflow-auto transition-all ${expanded ? 'max-h-[600px]' : 'max-h-[300px]'}`}>
        <pre className="p-4 text-sm text-green-400 font-mono whitespace-pre">{SCANNER_CODE}</pre>
      </div>
    </div>
  );
};
