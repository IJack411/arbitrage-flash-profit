import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveTradingPanel } from './bots/LiveTradingPanel';
import { TransactionHistory } from './TransactionHistory';
import { useAppContext } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';

const LEAN_SCANNER_VISIBLE_STORAGE_KEY = 'lean_dashboard_scanner_visible_v1';

export const LeanDashboard: React.FC = () => {
  const { transactions, loadTransactions } = useAppContext();
  const [scannerVisible, setScannerVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem(LEAN_SCANNER_VISIBLE_STORAGE_KEY);
    return saved === '1';
  });

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LEAN_SCANNER_VISIBLE_STORAGE_KEY, scannerVisible ? '1' : '0');
  }, [scannerVisible]);

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

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-white text-lg">Scanner Panel</CardTitle>
          <Button
            size="sm"
            variant={scannerVisible ? 'outline' : 'default'}
            onClick={() => setScannerVisible((prev) => !prev)}
            className={scannerVisible ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : ''}
          >
            {scannerVisible ? 'Hide Scanner' : 'Show Scanner'}
          </Button>
        </CardHeader>
        <CardContent className="text-gray-300 text-sm">
          Scanner is now manual in Lean Mode to prevent repeated pop-ups.
        </CardContent>
      </Card>

      {scannerVisible ? <LiveTradingPanel leanMode /> : null}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionHistory transactions={transactions} />
        </CardContent>
      </Card>
    </div>
  );
};
