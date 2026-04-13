import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Filter, ArrowLeftRight, TrendingUp, Clock, DollarSign } from 'lucide-react';
import { CrossChainOpportunityCard } from './CrossChainOpportunityCard';
import { CrossChainOpportunity } from '@/lib/web3/crossChainService';
import { BRIDGE_CONFIGS } from '@/lib/web3/bridgeConfig';
import { getContractAddresses } from '@/lib/web3/config';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

type ScannerLikeCrossChainOpportunity = Partial<CrossChainOpportunity> & {
  id?: string;
  tokenPair?: string;
  netProfit?: number;
  buyDex?: string;
  sellDex?: string;
};

export const CrossChainArbitrage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<CrossChainOpportunity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedBridge, setSelectedBridge] = useState<string>('all');
  const [minProfit, setMinProfit] = useState<number>(0);
  const { toast } = useToast();

  const mapScannerOpportunity = (raw: ScannerLikeCrossChainOpportunity, index: number): CrossChainOpportunity | null => {
    const sourceChain = Number(raw.sourceChain ?? 1);
    const destChain = Number(raw.destChain ?? 137);
    const tokenFromPair = typeof raw.tokenPair === 'string' ? raw.tokenPair.split('/')[0] : undefined;

    const netProfit = Number(raw.netProfit ?? 0);
    if (!Number.isFinite(netProfit)) return null;

    return {
      id: raw.id ?? `cross-${index}`,
      token: typeof raw.token === 'string' ? raw.token : tokenFromPair ?? 'UNKNOWN',
      sourceChain,
      destChain,
      sourceChainName: typeof raw.sourceChainName === 'string' ? raw.sourceChainName : sourceChain === 1 ? 'Ethereum' : 'Source',
      destChainName: typeof raw.destChainName === 'string' ? raw.destChainName : destChain === 137 ? 'Polygon' : 'Destination',
      sourceDex: typeof raw.sourceDex === 'string' ? raw.sourceDex : typeof raw.buyDex === 'string' ? raw.buyDex : 'Unknown',
      destDex: typeof raw.destDex === 'string' ? raw.destDex : typeof raw.sellDex === 'string' ? raw.sellDex : 'Unknown',
      buyPrice: Number(raw.buyPrice ?? 0),
      sellPrice: Number(raw.sellPrice ?? 0),
      bridge: typeof raw.bridge === 'string' ? raw.bridge : 'N/A',
      bridgeFee: Number(raw.bridgeFee ?? 0),
      bridgeTime: Number(raw.bridgeTime ?? 0),
      slippage: Number(raw.slippage ?? 0),
      gasCostSource: Number(raw.gasCostSource ?? 0),
      gasCostDest: Number(raw.gasCostDest ?? 0),
      totalCost: Number(raw.totalCost ?? 0),
      grossProfit: Number(raw.grossProfit ?? 0),
      netProfit,
      profitPercentage: Number(raw.profitPercentage ?? 0),
      tradeAmount: Number(raw.tradeAmount ?? 0),
      confidenceScore: raw.confidenceScore === 'high' || raw.confidenceScore === 'medium' || raw.confidenceScore === 'low'
        ? raw.confidenceScore
        : 'low',
      timestamp: Number(raw.timestamp ?? Date.now()),
      status: raw.status === 'executing' || raw.status === 'completed' || raw.status === 'failed' ? raw.status : 'active',
    };
  };

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', {
        body: { mode: 'cross-chain' }
      });

      if (error) throw error;

      const raw = Array.isArray(data?.opportunities)
        ? (data.opportunities as ScannerLikeCrossChainOpportunity[])
        : [];

      const mapped = raw
        .map((item, index) => mapScannerOpportunity(item, index))
        .filter((item): item is CrossChainOpportunity => item !== null)
        .filter((item) => item.netProfit > 0);

      setOpportunities(mapped);
      toast({ title: 'Scan Complete', description: `Found ${mapped.length} backend opportunities` });
    } catch {
      setOpportunities([]);
      toast({
        title: 'Cross-chain scan failed',
        description: 'No simulated opportunities were generated. Configure backend cross-chain scanner support.',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    void handleScan();
  }, [handleScan]);

  const handleExecute = async (id: string) => {
    const selected = opportunities.find((o) => o.id === id);
    if (!selected) return;

    const contractAddress = getContractAddresses().arbitrageContract;
    if (!contractAddress) {
      toast({
        title: 'Execution Blocked',
        description: 'VITE_ARBITRAGE_CONTRACT_ADDRESS is required to execute live trades.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Executing Cross-Chain Arbitrage', description: 'Submitting bundle to backend executor...' });
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: 'executing' as const } : o));

    try {
      const { data, error } = await supabase.functions.invoke('flashbots-executor', {
        body: {
          action: 'execute-arbitrage',
          params: {
            contractAddress,
            opportunity: {
              tokenPair: `${selected.token}/USDC`,
              buyDex: selected.sourceDex,
              sellDex: selected.destDex,
              loanAmount: selected.tradeAmount,
              netProfit: selected.netProfit,
            },
          },
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Execution request failed');
      }

      setOpportunities(prev => prev.filter(o => o.id !== id));
      toast({ title: 'Execution Started', description: 'Bundle submitted. Monitor status in Flashbots panel.' });
    } catch {
      setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: 'failed' as const } : o));
      toast({
        title: 'Execution Failed',
        description: 'Backend execution failed. No simulated completion was used.',
        variant: 'destructive',
      });
    }
  };

  const filteredOpps = opportunities.filter(o => {
    if (selectedBridge !== 'all' && !o.bridge.toLowerCase().includes(selectedBridge)) return false;
    if (o.netProfit < minProfit) return false;
    return true;
  });

  const totalPotentialProfit = filteredOpps.reduce((sum, o) => sum + o.netProfit, 0);
  const avgBridgeTime = filteredOpps.length > 0 ? filteredOpps.reduce((sum, o) => sum + o.bridgeTime, 0) / filteredOpps.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-[#00F0FF]" />
            Cross-Chain Arbitrage
          </h2>
          <p className="text-gray-400 text-sm mt-1">Buy on one chain, sell on another via bridges</p>
        </div>
        <button onClick={handleScan} disabled={isScanning}
          className="bg-[#00F0FF] hover:bg-[#00D0E0] disabled:bg-gray-700 text-gray-900 font-medium px-4 py-2 rounded-lg flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Scan Chains'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingUp className="h-4 w-4" /> Potential Profit
          </div>
          <div className="text-2xl font-bold text-green-400">${totalPotentialProfit.toFixed(2)}</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Clock className="h-4 w-4" /> Avg Bridge Time
          </div>
          <div className="text-2xl font-bold text-white">{avgBridgeTime.toFixed(0)} min</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <DollarSign className="h-4 w-4" /> Opportunities
          </div>
          <div className="text-2xl font-bold text-[#00F0FF]">{filteredOpps.length}</div>
        </div>
      </div>

      <div className="flex gap-4 items-center bg-gray-800 border border-gray-700 rounded-lg p-4">
        <Filter className="h-5 w-5 text-gray-400" />
        <select value={selectedBridge} onChange={e => setSelectedBridge(e.target.value)} title="Filter by bridge"
          className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
          <option value="all">All Bridges</option>
          {Object.values(BRIDGE_CONFIGS).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Min Profit:</span>
          <input type="number" value={minProfit} onChange={e => setMinProfit(Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-24 text-sm" placeholder="$0" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOpps.map(opp => <CrossChainOpportunityCard key={opp.id} opportunity={opp} onExecute={handleExecute} />)}
      </div>
      {filteredOpps.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-400">No cross-chain opportunities found matching your criteria.</p>
        </div>
      )}
    </div>
  );
};
