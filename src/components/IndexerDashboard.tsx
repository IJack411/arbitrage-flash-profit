import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { indexerService, PoolData, IndexerStats } from '@/lib/web3/indexerService';
import { IndexerStatsCard } from './indexer/IndexerStatsCard';
import { PoolDataTable } from './indexer/PoolDataTable';
import { MempoolMonitor } from './indexer/MempoolMonitor';
import { Database, Zap, RefreshCw, Settings, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { getUnifiedConfig, saveApiConfig } from '@/lib/web3/unifiedApiConfig';

export const IndexerDashboard: React.FC = () => {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [stats, setStats] = useState<IndexerStats>(indexerService.getStats());
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    const config = getUnifiedConfig();
    setApiKey(config.provider.apiKey);
    fetchPools();
    const interval = setInterval(() => setStats(indexerService.getStats()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchPools = async () => {
    setLoading(true);
    try {
      const data = await indexerService.getTopPools(20);
      setPools(data);
    } catch (e) {
      console.error('Failed to fetch pools:', e);
    }
    setLoading(false);
  };

  const handleSaveConfig = () => {
    saveApiConfig({ provider: { type: 'alchemy', apiKey, networks: {} } });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  const config = getUnifiedConfig();
  const isRpcConfigured = !!config.provider.apiKey;
  const isGraphConfigured = !!config.theGraph.apiKey;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Database className="h-7 w-7 text-[#00F0FF]" />
            High-Speed Indexer
          </h2>
          <p className="text-gray-400 mt-1">Optimized data fetching via The Graph + WebSocket mempool monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isRpcConfigured ? 'default' : 'destructive'} className="flex items-center gap-1">
            {isRpcConfigured ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {isRpcConfigured ? 'RPC Configured' : 'RPC Key Required'}
          </Badge>
          <Badge variant={isGraphConfigured ? 'default' : 'secondary'} className="flex items-center gap-1">
            {isGraphConfigured ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {isGraphConfigured ? 'Graph Key Set' : 'Graph Key Missing'}
          </Badge>
          <button onClick={fetchPools} disabled={loading} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <IndexerStatsCard stats={stats} />

      {/* Main Content */}
      <Tabs defaultValue="pools" className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="pools">Pool Data</TabsTrigger>
          <TabsTrigger value="mempool">Mempool</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          <PoolDataTable pools={pools} loading={loading} />
        </TabsContent>

        <TabsContent value="mempool">
          <MempoolMonitor />
        </TabsContent>

        <TabsContent value="config">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Settings className="h-5 w-5" /> Unified API Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-400 text-sm">Use Alchemy for blockchain RPC. The Graph indexed queries require a separate Graph API key.</p>
              {!isGraphConfigured && (
                <div className="rounded-lg border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  Add VITE_GRAPH_API_KEY (or saved thegraph_api_key) to enable authenticated The Graph queries.
                </div>
              )}
              <div>
                <label className="text-gray-400 text-sm block mb-2">Alchemy API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter your Alchemy API key" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <button onClick={handleSaveConfig} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium px-6 py-2 rounded-lg">
                {configSaved ? 'Saved!' : 'Save Configuration'}
              </button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
