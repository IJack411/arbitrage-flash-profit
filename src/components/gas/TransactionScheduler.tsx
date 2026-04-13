import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Play, Pause, Trash2, Plus, CheckCircle, AlertCircle, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ScheduledTx {
  id: string;
  network: string;
  description: string;
  targetBaseFee: number;
  maxWaitMinutes: number;
  status: 'waiting' | 'ready' | 'executed' | 'expired' | 'paused';
  createdAt: Date;
  executeAt?: Date;
}

export const TransactionScheduler: React.FC = () => {
  const { toast } = useToast();
  const [scheduledTxs, setScheduledTxs] = useState<ScheduledTx[]>([
    { id: '1', network: 'ethereum', description: 'Swap ETH→USDC', targetBaseFee: 25, maxWaitMinutes: 120, status: 'waiting', createdAt: new Date(Date.now() - 3600000) },
    { id: '2', network: 'polygon', description: 'Bridge to Arbitrum', targetBaseFee: 0.02, maxWaitMinutes: 60, status: 'ready', createdAt: new Date(Date.now() - 1800000), executeAt: new Date(Date.now() + 300000) },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ network: 'ethereum', description: '', targetBaseFee: 30, maxWaitMinutes: 60 });

  const addTx = () => {
    if (!form.description) return;
    const newTx: ScheduledTx = { id: Date.now().toString(), ...form, status: 'waiting', createdAt: new Date() };
    setScheduledTxs(prev => [newTx, ...prev]);
    setShowForm(false);
    setForm({ network: 'ethereum', description: '', targetBaseFee: 30, maxWaitMinutes: 60 });
    toast({ title: 'Transaction Scheduled', description: `Will execute when gas < ${form.targetBaseFee} Gwei` });
  };

  const togglePause = (id: string) => {
    setScheduledTxs(prev => prev.map(tx => tx.id === id ? { ...tx, status: tx.status === 'paused' ? 'waiting' : 'paused' } : tx));
  };

  const removeTx = (id: string) => {
    setScheduledTxs(prev => prev.filter(tx => tx.id !== id));
    toast({ title: 'Transaction Removed' });
  };

  const getStatusBadge = (status: ScheduledTx['status']) => {
    const styles = {
      waiting: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: Clock },
      ready: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
      executed: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: CheckCircle },
      expired: { bg: 'bg-red-500/20', text: 'text-red-400', icon: AlertCircle },
      paused: { bg: 'bg-gray-500/20', text: 'text-gray-400', icon: Pause },
    }[status];
    const Icon = styles.icon;
    return <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${styles.bg} ${styles.text}`}><Icon className="h-3 w-3" /> {status}</span>;
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Timer className="h-4 w-4 text-orange-400" /> Transaction Queue
          </CardTitle>
          <button onClick={() => setShowForm(!showForm)} className="p-1 bg-[#00F0FF] rounded hover:bg-[#00D0E0]">
            <Plus className="h-4 w-4 text-gray-900" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="bg-gray-900 rounded-lg p-3 space-y-2">
            <input type="text" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm">
                <option value="ethereum">ETH</option>
                <option value="polygon">Polygon</option>
                <option value="arbitrum">Arbitrum</option>
              </select>
              <input type="number" placeholder="Target Gwei" value={form.targetBaseFee} onChange={(e) => setForm({ ...form, targetBaseFee: +e.target.value })} className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm" />
              <input type="number" placeholder="Max Wait (min)" value={form.maxWaitMinutes} onChange={(e) => setForm({ ...form, maxWaitMinutes: +e.target.value })} className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm" />
            </div>
            <button onClick={addTx} className="w-full bg-[#00F0FF] text-gray-900 py-2 rounded font-medium text-sm">Schedule</button>
          </div>
        )}
        {scheduledTxs.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">No scheduled transactions</div>
        ) : (
          scheduledTxs.map((tx) => (
            <div key={tx.id} className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-medium">{tx.description}</span>
                {getStatusBadge(tx.status)}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 capitalize">{tx.network} • Target: {tx.targetBaseFee} Gwei</span>
                <div className="flex gap-1">
                  <button onClick={() => togglePause(tx.id)} className="p-1 bg-gray-800 rounded hover:bg-gray-700">
                    {tx.status === 'paused' ? <Play className="h-3 w-3 text-green-400" /> : <Pause className="h-3 w-3 text-yellow-400" />}
                  </button>
                  <button onClick={() => removeTx(tx.id)} className="p-1 bg-gray-800 rounded hover:bg-gray-700">
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
