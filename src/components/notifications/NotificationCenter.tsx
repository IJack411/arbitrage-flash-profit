import React, { useState, useEffect } from 'react';
import { NotificationPreferences } from './NotificationPreferences';
import { NotificationHistory } from './NotificationHistory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, TestTube } from 'lucide-react';
import { notificationService, ArbitrageNotification } from '@/lib/notificationService';

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<ArbitrageNotification[]>([]);

  useEffect(() => {
    setNotifications(notificationService.getHistory());
    return notificationService.subscribe(setNotifications);
  }, []);

  const sendTestNotification = () => {
    const networks = ['Ethereum', 'Polygon', 'Arbitrum', 'BSC'];
    const pairs = ['ETH/USDT', 'BTC/USDT', 'MATIC/USDT', 'BNB/USDT'];
    const profit = 50 + Math.random() * 500;
    
    notificationService.sendNotification({
      type: 'opportunity',
      title: 'Arbitrage Opportunity Detected!',
      message: `${profit.toFixed(2)} USD profit available on ${pairs[Math.floor(Math.random() * pairs.length)]}`,
      profitAmount: profit,
      network: networks[Math.floor(Math.random() * networks.length)],
      tokenPair: pairs[Math.floor(Math.random() * pairs.length)],
      opportunityId: `opp-${Date.now()}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 rounded-xl">
            <Bell className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Notification Center</h2>
            <p className="text-slate-400">
              Configure alerts for profitable arbitrage opportunities
            </p>
          </div>
        </div>
        <Button onClick={sendTestNotification} variant="outline" className="gap-2">
          <TestTube className="w-4 h-4" />
          Test Notification
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <NotificationPreferences />
        <NotificationHistory notifications={notifications} />
      </div>
    </div>
  );
}
