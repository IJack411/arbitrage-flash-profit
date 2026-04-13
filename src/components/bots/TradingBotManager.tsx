import React, { useState, useEffect, useCallback } from 'react';
import { TradingBot, BotExecutionLog, BotConfig } from '@/types/tradingBot';
import { BotStatusCard } from './BotStatusCard';
import { BotConfigForm } from './BotConfigForm';
import { BotExecutionLogs } from './BotExecutionLogs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Bot, TrendingUp, Activity, Zap, RefreshCw, Clock, Power } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useWeb3 } from '@/contexts/Web3Context';

type BotActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

const isRunningLikeStatus = (status: TradingBot['status']) => status === 'running' || status === 'paused';

export const TradingBotManager: React.FC = () => {
  const { account } = useWeb3();
  const { toast } = useToast();
  const [bots, setBots] = useState<TradingBot[]>([]);
  const [logs, setLogs] = useState<BotExecutionLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBot, setEditingBot] = useState<TradingBot | null>(null);
  const [viewingLogsFor, setViewingLogsFor] = useState<string | null>(null);
  const [is24_7Mode, setIs24_7Mode] = useState(false);

  const invokeBotAction = useCallback(async <T,>(action: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('trading-bot-executor', {
      body: { action, wallet_address: account, ...params }
    });

    if (error) throw error;

    const response = (data ?? {}) as BotActionResponse<T>;
    if (!response.success) {
      throw new Error(response.error || response.code || 'Bot action failed');
    }

    return response.data as T;
  }, [account]);

  const loadBotLogs = useCallback(async (botId: string) => {
    if (!account || !botId) {
      setLogs([]);
      return;
    }

    try {
      const data = await invokeBotAction<BotExecutionLog[]>('get_bot_logs', {
        bot_id: botId,
        limit: 100,
        offset: 0,
      });
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
      toast({
        title: 'Unable to load logs',
        description: 'Failed to fetch bot execution logs from backend.',
        variant: 'destructive',
      });
    }
  }, [account, invokeBotAction, toast]);

  const handleToggle = useCallback(async (id: string, status: 'running' | 'stopped' | 'paused') => {
    const current = bots.find((b) => b.id === id);
    if (!current || !account) return;

    try {
      const updated = await invokeBotAction<TradingBot>('set_bot_status', {
        bot_id: id,
        status,
        updated_at: current.updated_at,
      });

      setBots(prev => prev.map(b => b.id === id ? updated : b));
      toast({ title: `Bot ${status}`, description: `Trading bot has been ${status}` });
    } catch (error) {
      toast({
        title: 'Status update failed',
        description: error instanceof Error ? error.message : 'Unable to update bot status',
        variant: 'destructive',
      });
    }
  }, [account, bots, invokeBotAction, toast]);

  // Load bots
  const loadBots = useCallback(async () => {
    if (!account) {
      setBots([]);
      setLogs([]);
      return;
    }

    try {
      const data = await invokeBotAction<TradingBot[]>('list_bots');
      setBots(Array.isArray(data) ? data : []);
    } catch {
      setBots([]);
      toast({
        title: 'Unable to load bots',
        description: 'Trading bot service is unavailable. No simulated bot data is shown.',
        variant: 'destructive',
      });
    }
  }, [account, invokeBotAction, toast]);

  useEffect(() => { void loadBots(); }, [loadBots]);

  useEffect(() => {
    if (viewingLogsFor) {
      void loadBotLogs(viewingLogsFor);
    }
  }, [viewingLogsFor, loadBotLogs]);

  // 24/7 Mode - keep bots running around the clock
  useEffect(() => {
    if (is24_7Mode) {
      bots.forEach(bot => {
        if (bot.status !== 'running' && bot.status !== 'error') {
          void handleToggle(bot.id, 'running');
        }
      });
    }
  }, [is24_7Mode, bots, handleToggle]);

  const handleSave = async (config: BotConfig) => {
    if (!account) {
      toast({
        title: 'Wallet Required',
        description: 'Connect your wallet before managing bots.',
        variant: 'destructive',
      });
      return;
    }

    if (editingBot) {
      try {
        const updated = await invokeBotAction<TradingBot>('update_bot', {
          bot_id: editingBot.id,
          updated_at: editingBot.updated_at,
          config,
        });
        setBots(prev => prev.map(b => b.id === editingBot.id ? updated : b));
        toast({ title: 'Bot Updated', description: 'Trading bot configuration saved' });
      } catch (error) {
        toast({
          title: 'Update failed',
          description: error instanceof Error ? error.message : 'Unable to update bot configuration',
          variant: 'destructive',
        });
        return;
      }
    } else {
      try {
        const created = await invokeBotAction<TradingBot>('create_bot', { config });
        setBots(prev => [created, ...prev]);
        toast({ title: 'Bot Created', description: 'New trading bot is ready to start' });
      } catch (error) {
        toast({
          title: 'Create failed',
          description: error instanceof Error ? error.message : 'Unable to create bot',
          variant: 'destructive',
        });
        return;
      }
    }

    setShowForm(false);
    setEditingBot(null);
  };

  const handleDelete = async (id: string) => {
    if (!account) return;
    try {
      await invokeBotAction('delete_bot', { bot_id: id });
      setBots(prev => prev.filter(b => b.id !== id));
      toast({ title: 'Bot Deleted', description: 'Trading bot has been removed' });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unable to delete bot',
        variant: 'destructive',
      });
    }
  };

  const handleViewLogs = async (id: string) => {
    setViewingLogsFor(id);
    await loadBotLogs(id);
  };

  const startAllBots = async () => {
    if (!account) return;
    const targets = bots.filter((b) => !isRunningLikeStatus(b.status) && b.status !== 'error');
    if (targets.length === 0) return;

    await Promise.all(targets.map(async (bot) => {
      try {
        const updated = await invokeBotAction<TradingBot>('set_bot_status', {
          bot_id: bot.id,
          status: 'running',
          updated_at: bot.updated_at,
        });
        setBots(prev => prev.map(b => b.id === bot.id ? updated : b));
      } catch {
        // Keep rolling updates for remaining bots.
      }
    }));

    toast({ title: 'All Bots Started', description: 'All eligible trading bots are now running' });
  };

  const stopAllBots = async () => {
    if (!account) return;
    const targets = bots.filter((b) => b.status !== 'stopped');

    await Promise.all(targets.map(async (bot) => {
      try {
        const updated = await invokeBotAction<TradingBot>('set_bot_status', {
          bot_id: bot.id,
          status: 'stopped',
          updated_at: bot.updated_at,
        });
        setBots(prev => prev.map(b => b.id === bot.id ? updated : b));
      } catch {
        // Keep rolling updates for remaining bots.
      }
    }));

    setIs24_7Mode(false);
    toast({ title: 'All Bots Stopped', description: 'All trading bots have been stopped' });
  };

  const stats = {
    total: bots.length,
    running: bots.filter(b => b.status === 'running').length,
    totalProfit: bots.reduce((sum, b) => sum + b.total_profit, 0),
    totalTrades: bots.reduce((sum, b) => sum + b.total_trades, 0),
    profitToday: bots.reduce((sum, b) => sum + b.profit_today, 0),
    tradesToday: bots.reduce((sum, b) => sum + b.trades_today, 0)
  };

  const viewingBot = bots.find(b => b.id === viewingLogsFor);
  const botLogs = logs;

  return (
    <div className="space-y-6">
      {/* Global Controls */}
      <Card className="bg-gradient-to-r from-gray-800 to-gray-900 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${is24_7Mode ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                <Power className={`h-6 w-6 ${is24_7Mode ? 'text-green-400' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  24/7 Auto Trading Mode
                  {is24_7Mode && (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  )}
                </h3>
                <p className="text-gray-400 text-sm">
                  {is24_7Mode 
                    ? 'Bots are running continuously around the clock' 
                    : 'Enable to run bots 24/7 without hour restrictions'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">24/7 Mode</span>
                <Switch
                  checked={is24_7Mode}
                  onCheckedChange={(checked) => {
                    setIs24_7Mode(checked);
                    if (checked) startAllBots();
                  }}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>
              <Button
                onClick={startAllBots}
                className="bg-green-500 hover:bg-green-600"
                disabled={stats.running === stats.total}
              >
                Start All
              </Button>
              <Button
                onClick={stopAllBots}
                variant="destructive"
                disabled={stats.running === 0}
              >
                Stop All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Header */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg"><Bot className="h-5 w-5 text-blue-400" /></div>
              <div><p className="text-gray-400 text-sm">Total Bots</p><p className="text-2xl font-bold text-white">{stats.total}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg"><Activity className="h-5 w-5 text-green-400" /></div>
              <div><p className="text-gray-400 text-sm">Running</p><p className="text-2xl font-bold text-green-400">{stats.running}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#00F0FF]/20 rounded-lg"><TrendingUp className="h-5 w-5 text-[#00F0FF]" /></div>
              <div><p className="text-gray-400 text-sm">Total Profit</p><p className="text-2xl font-bold text-[#00F0FF]">${stats.totalProfit.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg"><Zap className="h-5 w-5 text-purple-400" /></div>
              <div><p className="text-gray-400 text-sm">Total Trades</p><p className="text-2xl font-bold text-purple-400">{stats.totalTrades}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg"><Clock className="h-5 w-5 text-yellow-400" /></div>
              <div><p className="text-gray-400 text-sm">Today's Trades</p><p className="text-2xl font-bold text-yellow-400">{stats.tradesToday}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg"><TrendingUp className="h-5 w-5 text-green-400" /></div>
              <div><p className="text-gray-400 text-sm">Today's Profit</p><p className="text-2xl font-bold text-green-400">${stats.profitToday.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Trading Bots</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadBots} className="border-gray-600"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Button onClick={() => { setEditingBot(null); setShowForm(true); }} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
            <Plus className="h-4 w-4 mr-2" />New Bot
          </Button>
        </div>
      </div>

      {/* Form or Logs */}
      {showForm && <BotConfigForm initialConfig={editingBot || undefined} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingBot(null); }} isEditing={!!editingBot} />}
      {viewingLogsFor && viewingBot && <BotExecutionLogs logs={botLogs} botName={viewingBot.name} onClose={() => setViewingLogsFor(null)} />}

      {/* Bot Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map(bot => (
          <BotStatusCard key={bot.id} bot={bot} onToggle={handleToggle} onEdit={(b) => { setEditingBot(b); setShowForm(true); }} onDelete={handleDelete} onViewLogs={handleViewLogs} />
        ))}
      </div>

      {bots.length === 0 && !showForm && (
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="py-12 text-center">
            <Bot className="h-16 w-16 mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold text-white mb-2">No Trading Bots</h3>
            <p className="text-gray-400 mb-4">No live bot records returned by the backend service.</p>
            <Button onClick={() => setShowForm(true)} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              <Plus className="h-4 w-4 mr-2" />Create Bot
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
