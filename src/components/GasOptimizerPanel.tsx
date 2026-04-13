import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Fuel, TrendingDown, TrendingUp, Minus, Clock, Timer, Globe } from 'lucide-react';
import { getGasHistory, getCurrentGasPrice, getCongestionLevel, calculateOptimalGas, scheduleTransaction, CongestionLevel, GasHistory, TransactionTiming } from '@/lib/web3/gasOptimizer';
import { predictBaseFee, findOptimalWindow, BaseFeePredict, ExecutionWindow } from '@/lib/web3/gasForecastService';
import { getNetworkComparison, getMempoolState, MempoolState, NetworkGasComparison } from '@/lib/web3/advancedGasOptimizer';
import { GasForecastChart } from './GasForecastChart';
import { GasHistoryChart } from './GasHistoryChart';
import { GasNetworkComparison } from './gas/GasNetworkComparison';
import { MempoolAnalyzer } from './gas/MempoolAnalyzer';
import { TransactionScheduler } from './gas/TransactionScheduler';
import { useToast } from '@/hooks/use-toast';

const networks = ['ethereum', 'polygon', 'arbitrum', 'bsc'];
const PANEL_TABS: Array<'overview' | 'networks' | 'mempool' | 'scheduler'> = ['overview', 'networks', 'mempool', 'scheduler'];

const CongestionBadge: React.FC<{ level: CongestionLevel['level'] }> = ({ level }) => {
  const colors = {
    low: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[level]}`}>{level.toUpperCase()}</span>;
};

export const GasOptimizerPanel: React.FC = () => {
  const { toast } = useToast();
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('medium');
  const [congestion, setCongestion] = useState<CongestionLevel | null>(null);
  const [forecast, setForecast] = useState<BaseFeePredict | null>(null);
  const [history, setHistory] = useState<GasHistory | null>(null);
  const [optimalWindow, setOptimalWindow] = useState<ExecutionWindow | null>(null);
  const [autoTiming, setAutoTiming] = useState(false);
  const [networkComparisons, setNetworkComparisons] = useState<NetworkGasComparison[]>([]);
  const [mempool, setMempool] = useState<MempoolState | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'networks' | 'mempool' | 'scheduler'>('overview');

  useEffect(() => {
    const update = () => {
      setCongestion(getCongestionLevel(selectedNetwork));
      setForecast(predictBaseFee(selectedNetwork, 6));
      setHistory(getGasHistory(selectedNetwork));
      setOptimalWindow(findOptimalWindow(selectedNetwork));
      setNetworkComparisons(getNetworkComparison());
      setMempool(getMempoolState(selectedNetwork));
    };
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, [selectedNetwork]);

  const currentGas = getCurrentGasPrice(selectedNetwork);
  const optimalGas = calculateOptimalGas(selectedNetwork, urgency);
  const TrendIcon = forecast?.trend === 'rising' ? TrendingUp : forecast?.trend === 'falling' ? TrendingDown : Minus;
  const trendColor = forecast?.trend === 'rising' ? 'text-red-400' : forecast?.trend === 'falling' ? 'text-green-400' : 'text-gray-400';

  const handleSchedule = () => {
    const timing = scheduleTransaction(selectedNetwork, 6);
    toast({ title: 'Transaction Scheduled', description: `Scheduled for ${timing.scheduledTime.toLocaleTimeString()}` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Fuel className="h-5 w-5 text-[#00F0FF]" /> Gas Optimization Engine
        </h2>
        <div className="flex gap-2">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {PANEL_TABS.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1 rounded text-sm capitalize ${activeTab === tab ? 'bg-[#00F0FF] text-gray-900' : 'text-gray-400'}`}>{tab}</button>
            ))}
          </div>
          <select value={selectedNetwork} onChange={(e) => setSelectedNetwork(e.target.value)} className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg">
            {networks.map(n => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="bg-gray-800 border-gray-700"><CardContent className="p-4"><div className="text-gray-400 text-sm">Base Fee</div><div className="text-2xl font-bold text-white">{currentGas?.baseFee.toFixed(2)} <span className="text-sm text-gray-400">Gwei</span></div></CardContent></Card>
            <Card className="bg-gray-800 border-gray-700"><CardContent className="p-4"><div className="text-gray-400 text-sm">Priority Fee</div><div className="text-2xl font-bold text-[#00F0FF]">{optimalGas.maxPriorityFeePerGas.toFixed(2)} <span className="text-sm text-gray-400">Gwei</span></div></CardContent></Card>
            <Card className="bg-gray-800 border-gray-700"><CardContent className="p-4"><div className="text-gray-400 text-sm">Congestion</div><div className="mt-1">{congestion && <CongestionBadge level={congestion.level} />}</div></CardContent></Card>
            <Card className="bg-gray-800 border-gray-700"><CardContent className="p-4"><div className="text-gray-400 text-sm">Trend</div><div className={`flex items-center gap-2 text-lg font-bold ${trendColor}`}><TrendIcon className="h-5 w-5" /> {forecast?.trend.toUpperCase()}</div></CardContent></Card>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-gray-800 border-gray-700"><CardHeader className="pb-2"><CardTitle className="text-white text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-purple-400" /> 6-Hour Forecast</CardTitle></CardHeader><CardContent>{forecast && <GasForecastChart forecast={forecast} height={160} />}</CardContent></Card>
            <Card className="bg-gray-800 border-gray-700"><CardHeader className="pb-2"><CardTitle className="text-white text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-blue-400" /> 24-Hour History</CardTitle></CardHeader><CardContent>{history && <GasHistoryChart history={history} height={160} />}</CardContent></Card>
          </div>
          <Card className="bg-gray-800 border-gray-700"><CardHeader><CardTitle className="text-white flex items-center gap-2"><Timer className="h-5 w-5 text-green-400" /> Optimal Window</CardTitle></CardHeader><CardContent><div className="grid md:grid-cols-3 gap-4 mb-4"><div><div className="text-gray-400 text-sm">Best Time</div><div className="text-white font-bold">{optimalWindow?.optimalTime.toLocaleTimeString()}</div></div><div><div className="text-gray-400 text-sm">Expected Fee</div><div className="text-green-400 font-bold">{optimalWindow?.expectedBaseFee.toFixed(2)} Gwei</div></div><div><div className="text-gray-400 text-sm">Savings</div><div className="text-[#00F0FF] font-bold">{optimalWindow?.savings.toFixed(1)}%</div></div></div><div className="flex gap-2"><button onClick={handleSchedule} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium px-4 py-2 rounded-lg">Schedule Tx</button><button onClick={() => setAutoTiming(!autoTiming)} className={`px-4 py-2 rounded-lg ${autoTiming ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{autoTiming ? 'Auto ON' : 'Auto OFF'}</button></div></CardContent></Card>
        </>
      )}
      {activeTab === 'networks' && <GasNetworkComparison comparisons={networkComparisons} onSelectNetwork={setSelectedNetwork} />}
      {activeTab === 'mempool' && mempool && <MempoolAnalyzer mempool={mempool} />}
      {activeTab === 'scheduler' && <TransactionScheduler />}
    </div>
  );
};
