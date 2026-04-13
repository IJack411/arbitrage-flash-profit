import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, ExternalLink, Copy, BookOpen } from 'lucide-react';
import { supabase, isSupabaseConfigured, checkConnection } from '@/lib/supabase';
import { useWeb3 } from '@/contexts/Web3Context';
import { DeploymentGuide } from './DeploymentGuide';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CheckItem {
  name: string;
  status: 'checking' | 'pass' | 'fail' | 'warning';
  message: string;
  action?: string;
}

export const ProductionReadiness: React.FC = () => {
  const { account } = useWeb3();
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [isChecking, setIsChecking] = useState(true);

  const updateCheck = useCallback((name: string, update: Partial<CheckItem>) => {
    setChecks(prev => prev.map(c => c.name === name ? { ...c, ...update } : c));
  }, []);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    const initialChecks: CheckItem[] = [
      { name: 'Supabase Config', status: 'checking', message: 'Checking...' },
      { name: 'Database Connection', status: 'checking', message: 'Checking...' },
      { name: 'Opportunities Table', status: 'checking', message: 'Checking...' },
      { name: 'Transactions Table', status: 'checking', message: 'Checking...' },
      { name: 'Edge Functions', status: 'checking', message: 'Checking...' },
      { name: 'Graph Connectivity', status: 'checking', message: 'Checking...' },
      { name: 'Wallet Connected', status: 'checking', message: 'Checking...' },
    ];
    setChecks(initialChecks);

    updateCheck('Supabase Config', isSupabaseConfigured() 
      ? { status: 'pass', message: 'Environment variables configured' }
      : { status: 'fail', message: 'Missing env vars', action: 'Add to .env' });

    const connected = await checkConnection();
    updateCheck('Database Connection', connected 
      ? { status: 'pass', message: 'Connected to Supabase' }
      : { status: 'fail', message: 'Cannot connect', action: 'Check credentials' });

    for (const table of ['opportunities', 'transactions']) {
      try {
        const { error } = await supabase.from(table).select('id').limit(1);
        updateCheck(`${table.charAt(0).toUpperCase() + table.slice(1)} Table`, 
          error ? { status: 'fail', message: error.message, action: 'Run migrations' }
                : { status: 'pass', message: 'Table accessible' });
      } catch { updateCheck(`${table.charAt(0).toUpperCase() + table.slice(1)} Table`, { status: 'fail', message: 'Query failed' }); }
    }

    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage-opportunities', { body: { test: true } });
      updateCheck('Edge Functions', error
        ? { status: 'warning', message: 'Needs deployment', action: 'Deploy functions' }
        : { status: 'pass', message: 'Scanner responding' });

      if (error || !data) {
        updateCheck('Graph Connectivity', { status: 'warning', message: 'Skipped - scanner test unavailable', action: 'Fix edge function access' });
      } else {
        const hasGraphKey = Boolean((data as { hasGraphKey?: boolean }).hasGraphKey);
        const connectivity = Array.isArray((data as { graphConnectivity?: unknown[] }).graphConnectivity)
          ? (data as { graphConnectivity: Array<{ name?: string; status?: string; usedSource?: string }> }).graphConnectivity
          : [];

        if (!hasGraphKey) {
          updateCheck('Graph Connectivity', { status: 'warning', message: 'Graph key missing in edge env', action: 'Set THEGRAPH_API_KEY secret' });
        } else if (connectivity.length === 0) {
          updateCheck('Graph Connectivity', { status: 'warning', message: 'No Graph connectivity diagnostics returned', action: 'Update scanner function' });
        } else {
          const failed = connectivity.filter((entry) => entry.status !== 'ok');
          const usedFallback = connectivity.filter((entry) => entry.usedSource === 'fallback');

          if (failed.length > 0) {
            const failedNames = failed.map((entry) => entry.name || 'unknown').join(', ');
            updateCheck('Graph Connectivity', {
              status: 'warning',
              message: `Some Graph sources failed: ${failedNames}`,
              action: 'Check Graph gateway/subgraph endpoints',
            });
          } else if (usedFallback.length > 0) {
            updateCheck('Graph Connectivity', {
              status: 'warning',
              message: `Graph reachable with fallback for ${usedFallback.length} source(s)`,
              action: 'Review gateway key/limits',
            });
          } else {
            updateCheck('Graph Connectivity', { status: 'pass', message: 'All Graph sources reachable via primary endpoints' });
          }
        }
      }
    } catch {
      updateCheck('Edge Functions', { status: 'warning', message: 'Could not reach functions' });
      updateCheck('Graph Connectivity', { status: 'warning', message: 'Could not run Graph diagnostics', action: 'Check function deployment/network' });
    }

    updateCheck('Wallet Connected', account 
      ? { status: 'pass', message: `${account.slice(0,6)}...${account.slice(-4)}` }
      : { status: 'warning', message: 'Not connected', action: 'Connect wallet' });

    setIsChecking(false);
  }, [account, updateCheck]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'checking') return <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />;
    if (status === 'pass') return <CheckCircle className="h-5 w-5 text-green-400" />;
    if (status === 'warning') return <AlertCircle className="h-5 w-5 text-yellow-400" />;
    return <XCircle className="h-5 w-5 text-red-400" />;
  };

  const passCount = checks.filter(c => c.status === 'pass').length;

  return (
    <Tabs defaultValue="status" className="space-y-4">
      <TabsList className="bg-gray-800 border border-gray-700">
        <TabsTrigger value="status">System Status</TabsTrigger>
        <TabsTrigger value="guide">Setup Guide</TabsTrigger>
      </TabsList>

      <TabsContent value="status">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white">Production Readiness</h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${passCount >= 5 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {passCount}/{checks.length} Ready
            </span>
          </div>
          <div className="space-y-3">
            {checks.map(check => (
              <div key={check.name} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <StatusIcon status={check.status} />
                  <div>
                    <p className="text-white font-medium">{check.name}</p>
                    <p className="text-gray-400 text-sm">{check.message}</p>
                  </div>
                </div>
                {check.action && <span className="text-xs text-cyan-400">{check.action}</span>}
              </div>
            ))}
          </div>
          <button onClick={runChecks} disabled={isChecking} className="mt-4 w-full bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 text-white py-2 rounded-lg">
            {isChecking ? 'Checking...' : 'Re-run Checks'}
          </button>
        </div>
      </TabsContent>

      <TabsContent value="guide">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">Deployment Guide</h3>
          <DeploymentGuide />
        </div>
      </TabsContent>
    </Tabs>
  );
};
