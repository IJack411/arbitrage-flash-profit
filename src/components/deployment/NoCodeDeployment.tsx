import React, { useState } from 'react';
import { 
  ExternalLink, Copy, CheckCircle, AlertCircle, Loader2, 
  ChevronRight, Play, ArrowRight, Sparkles, Globe, Bell, 
  Zap, Shield, FileCode, Terminal, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface StepProps {
  number: number;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  children: React.ReactNode;
  onComplete: () => void;
}

const Step: React.FC<StepProps> = ({ number, title, description, isActive, isCompleted, children, onComplete }) => {
  return (
    <div className={`border rounded-xl transition-all duration-300 ${
      isActive ? 'border-cyan-500/50 bg-gray-800/50' : 
      isCompleted ? 'border-green-500/30 bg-green-500/5' : 
      'border-gray-700/50 bg-gray-900/30'
    }`}>
      <div className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
          isCompleted ? 'bg-green-500 text-white' :
          isActive ? 'bg-cyan-500 text-white' :
          'bg-gray-700 text-gray-400'
        }`}>
          {isCompleted ? <CheckCircle className="h-5 w-5" /> : number}
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold ${isActive || isCompleted ? 'text-white' : 'text-gray-400'}`}>{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {isCompleted && <span className="text-green-400 text-sm font-medium">Done</span>}
      </div>
      
      {isActive && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-700/50">
          {children}
          <button
            onClick={onComplete}
            className="mt-4 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-medium rounded-lg flex items-center gap-2 transition-all"
          >
            I've Completed This Step <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied!', description: `${label} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
        copied ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
      }`}
    >
      {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied!' : label}
    </button>
  );
};

const CodeBox: React.FC<{ code: string; title?: string; showCopy?: boolean }> = ({ code, title, showCopy = true }) => {
  const { toast } = useToast();
  
  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-400">{title}</span>
          {showCopy && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(code);
                toast({ title: 'Copied!', description: 'Code copied to clipboard' });
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <pre className="p-4 text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
};

export const NoCodeDeployment: React.FC = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<unknown>(null);
  const [showCode, setShowCode] = useState<{ [key: string]: boolean }>({});

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  // Your Supabase project details
  const PROJECT_REF = 'ujhsrxinfcycjtulpvqk';
  const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaHNyeGluZmN5Y2p0dWxwdnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY3MDIsImV4cCI6MjA4MjUyMjcwMn0.yO5gLgLnjQxsUvhK2DuAcnanyrO0kzZzxHtjEetPM4c';

  const completeStep = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
    setCurrentStep(step + 1);
  };

  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { test: true }
      });
      if (error) throw error;
      setTestStatus('success');
      setTestResult(data);
      toast({ title: 'Success!', description: 'Edge function is working correctly!' });
    } catch (err: unknown) {
      setTestStatus('error');
      setTestResult({ error: getErrorMessage(err) });
      toast({ title: 'Not deployed yet', description: 'Complete the deployment steps first', variant: 'destructive' });
    }
  };

  const runFullScan = async () => {
    setTestStatus('testing');
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { networks: ['ethereum', 'polygon', 'arbitrum'] }
      });
      if (error) throw error;
      setTestStatus('success');
      setTestResult(data);
      toast({ 
        title: 'Scan Complete!', 
        description: `Found ${data?.found || 0} arbitrage opportunities across 3 networks.` 
      });
    } catch (err: unknown) {
      setTestStatus('error');
      setTestResult({ error: getErrorMessage(err) });
    }
  };

  // Function code snippets
  const scannerCode = `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { ethers } from 'https://esm.sh/ethers@6.9.0';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const NETWORK_CONFIG = {
  ethereum: {
    rpc: (infura, alchemy) => alchemy ? \`https://eth-mainnet.g.alchemy.com/v2/\${alchemy}\` : 'https://eth.llamarpc.com',
    dexes: [
      { name: 'Uniswap V2', factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
      { name: 'SushiSwap', factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F' }
    ],
    tokens: [
      { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH' },
      { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
      { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT' }
    ]
  },
  polygon: {
    rpc: (infura, alchemy) => alchemy ? \`https://polygon-mainnet.g.alchemy.com/v2/\${alchemy}\` : 'https://polygon-rpc.com',
    dexes: [
      { name: 'QuickSwap', factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' },
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' }
    ],
    tokens: [
      { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC' },
      { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC' }
    ]
  },
  arbitrum: {
    rpc: (infura, alchemy) => alchemy ? \`https://arb-mainnet.g.alchemy.com/v2/\${alchemy}\` : 'https://arb1.arbitrum.io/rpc',
    dexes: [
      { name: 'SushiSwap', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506' },
      { name: 'Camelot', factory: '0x6EcCab422D763aC031210895C81787E87B43A652', router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d' }
    ],
    tokens: [
      { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH' },
      { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC' }
    ]
  }
};

const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)'];
const FACTORY_ABI = ['function getPair(address,address) view returns (address)'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { networks = ['ethereum'], test = false } = await req.json().catch(() => ({}));
    
    if (test) {
      const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Edge function is running',
        hasAlchemyKey: !!alchemyKey,
        timestamp: new Date().toISOString()
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const alchemyKey = Deno.env.get('ALCHEMY_API_KEY');
    const allOpportunities = [];

    for (const network of networks) {
      const config = NETWORK_CONFIG[network];
      if (!config) continue;

      const provider = new ethers.JsonRpcProvider(config.rpc(null, alchemyKey));
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
            } catch (e) { console.error(\`\${dex.name} error:\`, e); }
          }

          if (prices.length >= 2) {
            prices.sort((a, b) => a.price - b.price);
            const buy = prices[0], sell = prices[prices.length - 1];
            const priceDiff = ((sell.price - buy.price) / buy.price) * 100;

            if (priceDiff > 0.5) {
              const profit = (10 * priceDiff / 100) - gasCostEth - 0.03;
              if (profit > 0) {
                allOpportunities.push({
                  token_pair: \`\${token0.symbol}/\${token1.symbol}\`, buy_dex: buy.dex, sell_dex: sell.dex,
                  price_difference: priceDiff.toFixed(4), profit_percentage: priceDiff.toFixed(4),
                  estimated_profit: profit.toFixed(6), network, status: 'active', created_at: new Date().toISOString()
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
});`;

  const priceAlertCode = `const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendDiscordWebhook(url, alert) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '🔔 Price Alert Triggered',
        color: alert.condition === 'above' ? 0x00ff00 : 0xff0000,
        fields: [
          { name: 'Token Pair', value: alert.token_pair, inline: true },
          { name: 'Target Price', value: \`$\${alert.target_price}\`, inline: true },
          { name: 'Current Price', value: \`$\${alert.current_price}\`, inline: true },
        ],
        timestamp: alert.triggered_at,
      }]
    })
  });
  return response.ok;
}

async function sendTelegramNotification(chatId, alert) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return false;

  const message = \`🔔 *Price Alert*\\n\\n*\${alert.token_pair}*\\nTarget: $\${alert.target_price}\\nCurrent: $\${alert.current_price}\`;
  
  const response = await fetch(\`https://api.telegram.org/bot\${botToken}/sendMessage\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  });
  return response.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { alert, channels } = await req.json();
    if (!alert) throw new Error('Missing alert data');

    const results = {};
    if (channels?.discord) results.discord = await sendDiscordWebhook(channels.discord, alert);
    if (channels?.telegram_chat_id) results.telegram = await sendTelegramNotification(channels.telegram_chat_id, alert);

    return new Response(JSON.stringify({ success: true, results }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});`;

  const tradingSignalsCode = `const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendSignalWebhooks(signal, webhooks) {
  const results = {};

  if (webhooks.discord) {
    try {
      const response = await fetch(webhooks.discord, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '⚡ Trading Signal',
            color: signal.severity === 'critical' ? 0xff0000 : 0x00ff00,
            fields: [
              { name: 'Type', value: signal.type, inline: true },
              { name: 'Token Pair', value: signal.token_pair, inline: true },
              { name: 'Profit', value: \`\${signal.data.profit_percentage}%\`, inline: true },
            ],
            timestamp: signal.timestamp,
          }]
        })
      });
      results.discord = response.ok;
    } catch (e) { results.discord = false; }
  }

  if (webhooks.telegram_chat_id) {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (botToken) {
      try {
        const message = \`⚡ *Trading Signal*\\n\\n*\${signal.token_pair}*\\nProfit: \${signal.data.profit_percentage}%\`;
        const response = await fetch(\`https://api.telegram.org/bot\${botToken}/sendMessage\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: webhooks.telegram_chat_id, text: message, parse_mode: 'Markdown' }),
        });
        results.telegram = response.ok;
      } catch (e) { results.telegram = false; }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, opportunity, webhooks } = await req.json().catch(() => ({}));

    if (action === 'analyze' && opportunity) {
      const profitPercentage = parseFloat(opportunity.profit_percentage);
      let severity = 'low';
      if (profitPercentage > 2) severity = 'critical';
      else if (profitPercentage > 1) severity = 'high';
      else if (profitPercentage > 0.7) severity = 'medium';

      const signal = {
        type: 'arbitrage',
        severity,
        token_pair: opportunity.token_pair,
        network: opportunity.network,
        data: opportunity,
        timestamp: new Date().toISOString(),
      };

      if (webhooks) {
        const results = await sendSignalWebhooks(signal, webhooks);
        return new Response(JSON.stringify({ success: true, signal, webhookResults: results }), 
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, signal }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, actions: ['analyze', 'test-webhooks'] }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});`;

  const functions = [
    { name: 'scan-arbitrage-opportunities', code: scannerCode, icon: <Zap className="h-5 w-5" />, description: 'Scans DEXs for arbitrage opportunities' },
    { name: 'price-alert-webhook', code: priceAlertCode, icon: <Bell className="h-5 w-5" />, description: 'Sends price alerts to Discord/Telegram' },
    { name: 'trading-signals', code: tradingSignalsCode, icon: <Globe className="h-5 w-5" />, description: 'Analyzes and broadcasts trading signals' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Deploy Edge Functions</h1>
            <p className="text-gray-400">No coding required - just copy, paste, and click!</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg">
            <span className="text-green-400 font-medium">{completedSteps.length}/5 Steps Complete</span>
          </div>
          <a
            href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" /> Open Supabase Dashboard
          </a>
        </div>
      </div>

      {/* Step 1: Open Dashboard */}
      <Step
        number={1}
        title="Open Supabase Edge Functions"
        description="Go to the Edge Functions page in your Supabase dashboard"
        isActive={currentStep === 1}
        isCompleted={completedSteps.includes(1)}
        onComplete={() => completeStep(1)}
      >
        <div className="space-y-4">
          <p className="text-gray-300">Click the button below to open your Supabase project's Edge Functions page:</p>
          
          <a
            href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-500/25"
          >
            <ExternalLink className="h-5 w-5" />
            Open Edge Functions Dashboard
          </a>
          
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-blue-400 text-sm">
              <strong>Tip:</strong> You'll see a list of your deployed functions here. If this is your first time, it will be empty.
            </p>
          </div>
        </div>
      </Step>

      {/* Step 2: Create Functions */}
      <Step
        number={2}
        title="Create the Edge Functions"
        description="Create 3 new edge functions using the Supabase CLI"
        isActive={currentStep === 2}
        isCompleted={completedSteps.includes(2)}
        onComplete={() => completeStep(2)}
      >
        <div className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 font-medium mb-2">You'll need to use Terminal/Command Prompt for this step</p>
            <p className="text-gray-400 text-sm">Open Terminal (Mac) or Command Prompt (Windows) and run these commands:</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">1. Install Supabase CLI:</span>
              <CopyButton text="npm install -g supabase" label="Copy" />
            </div>
            <CodeBox code="npm install -g supabase" title="Install CLI" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">2. Login to Supabase:</span>
              <CopyButton text="supabase login" label="Copy" />
            </div>
            <CodeBox code="supabase login" title="Login" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">3. Link your project:</span>
              <CopyButton text={`supabase link --project-ref ${PROJECT_REF}`} label="Copy" />
            </div>
            <CodeBox code={`supabase link --project-ref ${PROJECT_REF}`} title="Link Project" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">4. Create the functions:</span>
              <CopyButton text={`supabase functions new scan-arbitrage-opportunities\nsupabase functions new price-alert-webhook\nsupabase functions new trading-signals`} label="Copy All" />
            </div>
            <CodeBox 
              code={`supabase functions new scan-arbitrage-opportunities
supabase functions new price-alert-webhook
supabase functions new trading-signals`} 
              title="Create Functions" 
            />
          </div>
        </div>
      </Step>

      {/* Step 3: Copy Function Code */}
      <Step
        number={3}
        title="Copy the Function Code"
        description="Paste the code into each function's index.ts file"
        isActive={currentStep === 3}
        isCompleted={completedSteps.includes(3)}
        onComplete={() => completeStep(3)}
      >
        <div className="space-y-6">
          <p className="text-gray-300">
            After creating the functions, you'll have folders in <code className="bg-gray-800 px-2 py-1 rounded text-cyan-400">supabase/functions/</code>. 
            Copy the code below into each function's <code className="bg-gray-800 px-2 py-1 rounded text-cyan-400">index.ts</code> file.
          </p>

          {functions.map((func, index) => (
            <div key={func.name} className="border border-gray-700 rounded-xl overflow-hidden">
              <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400">
                    {func.icon}
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{func.name}</h4>
                    <p className="text-gray-500 text-sm">{func.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCode({ ...showCode, [func.name]: !showCode[func.name] })}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm flex items-center gap-2"
                  >
                    {showCode[func.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showCode[func.name] ? 'Hide' : 'Show'} Code
                  </button>
                  <CopyButton text={func.code} label="Copy Code" />
                </div>
              </div>
              
              {showCode[func.name] && (
                <div className="max-h-96 overflow-auto">
                  <CodeBox code={func.code} showCopy={false} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Step>

      {/* Step 4: Deploy */}
      <Step
        number={4}
        title="Deploy the Functions"
        description="Deploy all functions to Supabase"
        isActive={currentStep === 4}
        isCompleted={completedSteps.includes(4)}
        onComplete={() => completeStep(4)}
      >
        <div className="space-y-4">
          <p className="text-gray-300">Run this command to deploy all functions at once:</p>
          
          <div className="flex items-center gap-2">
            <CopyButton text="supabase functions deploy" label="Copy Command" />
          </div>
          
          <CodeBox code="supabase functions deploy" title="Deploy All Functions" />
          
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 text-sm">
              <strong>Success!</strong> After deployment, you'll see a success message for each function. 
              You can also verify in the Supabase Dashboard.
            </p>
          </div>
          
          <a
            href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/30 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Verify in Dashboard
          </a>
        </div>
      </Step>

      {/* Step 5: Test */}
      <Step
        number={5}
        title="Test Your Deployment"
        description="Verify everything is working correctly"
        isActive={currentStep === 5}
        isCompleted={completedSteps.includes(5)}
        onComplete={() => completeStep(5)}
      >
        <div className="space-y-4">
          <p className="text-gray-300">Click the buttons below to test your deployed functions:</p>
          
          <div className="flex flex-wrap gap-3">
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing'}
              className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-xl flex items-center gap-2 transition-all"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle className="h-5 w-5" />
              )}
              Test Connection
            </button>
            
            <button
              onClick={runFullScan}
              disabled={testStatus === 'testing'}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-gray-600 disabled:to-gray-600 text-white font-medium rounded-xl flex items-center gap-2 transition-all"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Play className="h-5 w-5" />
              )}
              Run Full Scan
            </button>
          </div>
          
          {testResult && (
            <div className={`p-4 rounded-xl ${
              testStatus === 'success' 
                ? 'bg-green-500/10 border border-green-500/30' 
                : 'bg-red-500/10 border border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {testStatus === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
                <span className={`font-medium ${testStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {testStatus === 'success' ? 'Success!' : 'Error'}
                </span>
              </div>
              <pre className="text-sm text-gray-300 overflow-auto max-h-48 bg-gray-900/50 p-3 rounded-lg">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Step>

      {/* Completion */}
      {completedSteps.length === 5 && (
        <div className="bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-cyan-500/20 border border-green-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-500 rounded-xl">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Deployment Complete!</h2>
              <p className="text-gray-400">Your edge functions are now live and ready to scan for arbitrage opportunities.</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <a
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/functions`}
              target="_blank"
              rel="noreferrer"
              className="p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-colors flex items-center gap-3"
            >
              <FileCode className="h-6 w-6 text-cyan-400" />
              <div>
                <p className="text-white font-medium">View Functions</p>
                <p className="text-gray-500 text-sm">Manage deployed functions</p>
              </div>
            </a>
            <a
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/logs/edge-functions`}
              target="_blank"
              rel="noreferrer"
              className="p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-colors flex items-center gap-3"
            >
              <Terminal className="h-6 w-6 text-purple-400" />
              <div>
                <p className="text-white font-medium">View Logs</p>
                <p className="text-gray-500 text-sm">Monitor function execution</p>
              </div>
            </a>
            <a
              href={`https://supabase.com/dashboard/project/${PROJECT_REF}/settings/functions`}
              target="_blank"
              rel="noreferrer"
              className="p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-xl transition-colors flex items-center gap-3"
            >
              <Shield className="h-6 w-6 text-green-400" />
              <div>
                <p className="text-white font-medium">Manage Secrets</p>
                <p className="text-gray-500 text-sm">Update API keys</p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
