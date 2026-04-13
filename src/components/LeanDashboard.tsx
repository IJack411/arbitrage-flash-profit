import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveTradingPanel } from './bots/LiveTradingPanel';
import { TransactionHistory } from './TransactionHistory';
import { useAppContext } from '@/contexts/AppContext';
import { AgentNotificationBar } from './AgentNotificationBar';
import { useAgentSwarm } from '@/lib/agentSwarm';

export const LeanDashboard: React.FC = () => {
  const { transactions, loadTransactions } = useAppContext();
  
  // Activate Agent Swarm
  useAgentSwarm();

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return (
    <div className="space-y-6 p-4 max-w-6xl mx-auto">
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-xl">Arbitrage Control Center (Lean Mode)</CardTitle>
        </CardHeader>
        <CardContent className="text-gray-300 text-sm">
          Focused view with just the essentials: scanner, execution, and trade history. All other panels are hidden to keep this fast and stable.
        </CardContent>
      </Card>

      <LiveTradingPanel />

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionHistory transactions={transactions} />
        </CardContent>
      </Card>
      
      <AgentNotificationBar />
    </div>
  );
};
