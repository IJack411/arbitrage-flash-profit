import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Radio, RefreshCw, Database, TrendingUp, AlertTriangle, Settings, History } from 'lucide-react';
import { oracleService } from '@/lib/web3/oracleService';
import { OracleHealthMonitor } from './OracleHealthMonitor';
import { PriceAggregator } from './PriceAggregator';
import { DeviationAlerts } from './DeviationAlerts';
import { OracleConfigPanel } from './OracleConfigPanel';
import { OraclePriceHistory } from './OraclePriceHistory';
import { AggregatedPrice, OracleFeedHealth, DeviationAlert, OracleConfig, OraclePrice } from '@/types/oracle';
import { useToast } from '@/hooks/use-toast';

const PAIRS = ['ETH/USD', 'BTC/USD', 'LINK/USD', 'UNI/USD', 'AAVE/USD'];

export const OracleDashboard: React.FC = () => {
  const [network, setNetwork] = useState('ethereum');
  const [selectedPair, setSelectedPair] = useState('ETH/USD');
  const [aggregatedPrices, setAggregatedPrices] = useState<AggregatedPrice[]>([]);
  const [healthData, setHealthData] = useState<OracleFeedHealth[]>([]);
  const [alerts, setAlerts] = useState<DeviationAlert[]>([]);
  const [priceHistory, setPriceHistory] = useState<OraclePrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'history' | 'config'>('overview');
  const { toast } = useToast();
  const alertsRef = useRef<DeviationAlert[]>([]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      const prices = await Promise.all(PAIRS.map(pair => oracleService.getAggregatedPrice(pair, network)));
      setAggregatedPrices(prices);
      setHealthData(oracleService.getHealthStatus());
      setPriceHistory(oracleService.getPriceHistory(selectedPair, 100));
      
      prices.forEach(p => {
        if (p.deviation > 1) {
          const existingAlert = alertsRef.current.find(a => a.pair === p.pair && !a.resolved && Date.now() - a.createdAt < 60000);
          if (!existingAlert && p.sources.length >= 2) {
            const newAlert: DeviationAlert = {
              id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              pair: p.pair, network, sourceA: p.sources[0].source, sourceB: p.sources[1].source,
              priceA: p.sources[0].price, priceB: p.sources[1].price,
              deviationPercent: p.deviation, severity: p.deviation > 3 ? 'critical' : p.deviation > 2 ? 'warning' : 'info',
              resolved: false, createdAt: Date.now(),
            };
            setAlerts(prev => [newAlert, ...prev].slice(0, 50));
            if (p.deviation > 2) {
              toast({ title: 'Price Deviation Alert', description: `${p.pair} deviation: ${p.deviation.toFixed(2)}%`, variant: 'destructive' });
            }
          }
        }
      });
    } catch (e) {
      console.error('Failed to fetch prices:', e);
    }
    setLoading(false);
  }, [network, selectedPair, toast]);

  useEffect(() => { void fetchPrices(); }, [fetchPrices]);
  useEffect(() => { setPriceHistory(oracleService.getPriceHistory(selectedPair, 100)); }, [selectedPair]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchPrices, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchPrices]);

  const handleDismissAlert = (id: string) => setAlerts(prev => prev.filter(a => a.id !== id));
  const handleResolveAlert = (id: string) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true, resolvedAt: Date.now() } : a));
  const handleSaveConfig = (config: OracleConfig) => {
    oracleService.saveConfig(config);
    toast({ title: 'Configuration Saved', description: `Oracle config for ${config.pair} updated` });
  };

  const activeAlertCount = alerts.filter(a => !a.resolved).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className={`h-5 w-5 ${autoRefresh ? 'text-green-400 animate-pulse' : 'text-gray-500'}`} />
          <h2 className="text-white text-xl font-bold">Price Oracle Dashboard</h2>
          {activeAlertCount > 0 && (
            <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">{activeAlertCount} alerts</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select title="Select network" value={network} onChange={e => setNetwork(e.target.value)} className="bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded-lg text-sm">
            <option value="ethereum">Ethereum</option>
            <option value="polygon">Polygon</option>
            <option value="arbitrum">Arbitrum</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`px-3 py-1.5 rounded-lg text-sm ${autoRefresh ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <button onClick={fetchPrices} disabled={loading} title="Refresh oracle prices" className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-lg">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'health', label: 'Health', icon: Database },
          { id: 'history', label: 'History', icon: History },
          { id: 'config', label: 'Config', icon: Settings }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as 'overview' | 'health' | 'history' | 'config')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${activeTab === tab.id ? 'bg-[#00F0FF] text-gray-900' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PriceAggregator aggregatedPrices={aggregatedPrices} onSelectPair={setSelectedPair} selectedPair={selectedPair} />
          </div>
          <div>
            <DeviationAlerts alerts={alerts} onDismiss={handleDismissAlert} onResolve={handleResolveAlert} />
          </div>
        </div>
      )}

      {activeTab === 'health' && <OracleHealthMonitor healthData={healthData} />}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {PAIRS.map(pair => (
              <button key={pair} onClick={() => setSelectedPair(pair)} className={`px-4 py-2 rounded-lg text-sm ${selectedPair === pair ? 'bg-[#00F0FF] text-gray-900' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                {pair}
              </button>
            ))}
          </div>
          <OraclePriceHistory history={priceHistory} pair={selectedPair} />
        </div>
      )}

      {activeTab === 'config' && (
        <OracleConfigPanel config={oracleService.getConfig(selectedPair, network) || null} onSave={handleSaveConfig} pair={selectedPair} network={network} />
      )}
    </div>
  );
};

