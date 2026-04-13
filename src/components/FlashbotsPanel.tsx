import React, { useState, useEffect } from 'react';
import { Zap, Shield, CheckCircle, XCircle, Clock, TrendingUp, Send, RotateCcw } from 'lucide-react';
import { FlashbotsBundleCard } from './FlashbotsBundleCard';
import { MEVOptimizerPanel } from './MEVOptimizerPanel';
import { CompetingBundleDetector } from './CompetingBundleDetector';
import { FlashbotsBundle, PRIVATE_POOLS } from '@/lib/web3/flashbotsService';
import { resubmissionManager } from '@/lib/web3/mevOptimizer';
import { DetectionResult } from '@/lib/web3/mevDetection';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface MonitorStatus {
  isSimulated?: boolean;
  isSentToMiners?: boolean;
}

interface MonitorResponse {
  success?: boolean;
  statuses?: MonitorStatus[];
}

export const FlashbotsPanel: React.FC = () => {
  const [bundles, setBundles] = useState<FlashbotsBundle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('ethereum');
  const [currentBribe, setCurrentBribe] = useState(0);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [autoResubmit, setAutoResubmit] = useState(true);
  const [simulationTx, setSimulationTx] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    let ignore = false;

    const loadBundles = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('flashbots-executor', {
          body: { action: 'list-bundles', params: { network: selectedNetwork, limit: 25 } }
        });

        if (error) throw error;
        if (!ignore && Array.isArray(data?.bundles)) {
          setBundles(data.bundles as FlashbotsBundle[]);
        }
      } catch {
        if (!ignore) {
          setBundles([]);
        }
      }
    };

    void loadBundles();
    return () => {
      ignore = true;
    };
  }, [selectedNetwork]);

  // Auto-resubmit failed bundles
  useEffect(() => {
    if (!autoResubmit) return;
    const failed = bundles.filter(b => b.status === 'failed');
    failed.forEach(bundle => {
      if (resubmissionManager.shouldResubmit(bundle.bundleHash)) {
        const newFee = resubmissionManager.getNextFee(bundle.bundleHash, currentBribe);
        const info = resubmissionManager.getAttemptInfo(bundle.bundleHash);
        toast({
          title: 'Auto-Resubmitting Bundle',
          description: `Attempt ${info?.attempt}/${info?.max} with ${newFee.toFixed(2)} bribe`,
        });
      }
    });
  }, [bundles, autoResubmit, currentBribe, toast]);

  const handleMonitor = async (bundleHash: string) => {
    toast({ title: 'Monitoring Bundle', description: `Checking ${bundleHash.slice(0, 10)}...` });
    try {
      const { data } = await supabase.functions.invoke('flashbots-executor', {
        body: { action: 'monitor-bundle', params: { bundleHash, maxBlocks: 5 } }
      });
      const response = (data ?? {}) as MonitorResponse;
      if (response.success) {
        const included = response.statuses?.some((s) => s?.isSimulated && s?.isSentToMiners);
        setBundles(prev => prev.map(b => b.bundleHash === bundleHash ? { ...b, status: included ? 'included' : b.status } : b));
        toast({ title: included ? 'Bundle Included!' : 'Still Pending' });
      }
    } catch { toast({ title: 'Monitor Failed', variant: 'destructive' }); }
  };

  const handleSimulate = async () => {
    const tx = simulationTx.trim();
    if (!tx) {
      toast({
        title: 'Transaction Required',
        description: 'Provide a signed transaction hex to run a relay simulation.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await supabase.functions.invoke('flashbots-executor', {
        body: { action: 'simulate-bundle', params: { transactions: [tx] } }
      });
      toast({ title: data?.simulation?.success ? 'Simulation Successful' : 'Simulation Failed',
        description: data?.simulation?.success ? `Gas: ${data.simulation.totalGasUsed}` : 'Bundle would revert',
        variant: data?.simulation?.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'Simulation Error', variant: 'destructive' }); }
    finally { setIsLoading(false); }
  };

  const stats = {
    included: bundles.filter(b => b.status === 'included').length,
    pending: bundles.filter(b => b.status === 'pending' || b.status === 'submitted').length,
    totalProfit: bundles.filter(b => b.profitLoss && b.profitLoss > 0).reduce((sum, b) => sum + (b.profitLoss || 0), 0),
    totalLoss: bundles.filter(b => b.profitLoss && b.profitLoss < 0).reduce((sum, b) => sum + Math.abs(b.profitLoss || 0), 0),
  };

  const poolKey = selectedNetwork === 'ethereum' ? 'flashbots' : selectedNetwork === 'polygon' ? 'polygonBor' : selectedNetwork === 'arbitrum' ? 'arbitrumSequencer' : 'bscPrivate';
  const pool = PRIVATE_POOLS[poolKey];
  const targetAddresses = ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-[#00F0FF]" /> Flashbots MEV Protection
          </h2>
          <p className="text-gray-400 text-sm mt-1">Advanced bundle optimization and MEV protection</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={selectedNetwork} onChange={e => setSelectedNetwork(e.target.value)} title="Select network"
            className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm">
            <option value="ethereum">Ethereum</option>
            <option value="polygon">Polygon</option>
            <option value="arbitrum">Arbitrum</option>
            <option value="bsc">BSC</option>
          </select>
          <button onClick={() => setAutoResubmit(!autoResubmit)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${autoResubmit ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
            <RotateCcw className="h-4 w-4" /> Auto-Resubmit
          </button>
          <button onClick={handleSimulate} disabled={isLoading}
            className="bg-[#00F0FF] hover:bg-[#00D0E0] disabled:bg-gray-700 text-gray-900 font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            <Send className="h-4 w-4" /> Simulate
          </button>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <label className="text-gray-300 text-sm mb-2 block">Signed transaction hex for bundle simulation</label>
        <input
          value={simulationTx}
          onChange={(e) => setSimulationTx(e.target.value)}
          placeholder="0x..."
          className="w-full bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg text-sm"
        />
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-[#00F0FF]" />
          <span className="text-white font-medium">{pool.name}</span>
          <span className="text-gray-400 text-sm">Chain: {pool.chainId}</span>
        </div>
        <div className="text-gray-400 text-sm">Methods: {pool.supportedMethods.join(', ')}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <CheckCircle className="h-6 w-6 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{stats.included}</div>
          <div className="text-gray-400 text-sm">Included</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <Clock className="h-6 w-6 text-yellow-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{stats.pending}</div>
          <div className="text-gray-400 text-sm">Pending</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <TrendingUp className="h-6 w-6 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-400">${stats.totalProfit.toFixed(2)}</div>
          <div className="text-gray-400 text-sm">Profit</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
          <XCircle className="h-6 w-6 text-red-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-red-400">${stats.totalLoss.toFixed(2)}</div>
          <div className="text-gray-400 text-sm">Loss</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <MEVOptimizerPanel expectedProfit={150} onBribeChange={setCurrentBribe} />
        <CompetingBundleDetector targetAddresses={targetAddresses} onDetectionUpdate={setDetection} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {bundles.map(bundle => <FlashbotsBundleCard key={bundle.id} bundle={bundle} onMonitor={handleMonitor} />)}
      </div>

      {bundles.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center text-gray-400 text-sm">
          No live Flashbots bundles returned for this network.
        </div>
      )}
    </div>
  );
};
