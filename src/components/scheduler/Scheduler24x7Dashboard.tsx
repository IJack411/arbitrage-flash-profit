
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, Play, Pause, RefreshCw, CheckCircle, XCircle, 
  AlertTriangle, Activity, Calendar, Timer, Zap, Settings,
  ExternalLink, Copy, Check, Loader2, TrendingUp, TrendingDown,
  Shield, DollarSign, Globe, Wifi, WifiOff, Power, PowerOff,
  BarChart3, AlertCircle, Rocket, Moon, Sun, Brain, Sparkles
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { SmartModePanel } from './SmartModePanel';

interface SchedulerConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  scan_interval_minutes: number;
  auto_execute_trades: boolean;
  min_profit_threshold: number;
  networks: string[];
  flash_loan_amount: number;
  last_cron_run_at: string | null;
  total_scans_24h: number;
  total_opportunities_24h: number;
  total_trades_24h: number;
  total_profit_24h: number;
  created_at: string;
  updated_at: string;
}

interface SchedulerLog {
  id: string;
  user_id: string;
  scan_timestamp: string;
  opportunities_found: number;
  trades_executed: number;
  trades_successful: number;
  total_profit: number;
  total_loss: number;
  networks_scanned: string[];
  execution_time_ms: number;
  circuit_breaker_tripped: boolean;
  error_message: string | null;
  status: string;
  created_at: string;
}

interface DailyStats {
  id: string;
  date: string;
  total_scans: number;
  total_opportunities: number;
  total_trades_executed: number;
  total_trades_successful: number;
  total_profit: number;
  total_loss: number;
  net_profit: number;
  avg_execution_time_ms: number;
  circuit_breaker_trips: number;
  uptime_percentage: number;
}

interface SmartModeConfig {
  is_enabled: boolean;
  current_interval_minutes: number;
  last_gas_price_gwei: number;
  last_volatility_percent: number;
}

const SCAN_INTERVALS = [
  { label: 'Every 1 minute', value: 1 },
  { label: 'Every 2 minutes', value: 2 },
  { label: 'Every 3 minutes', value: 3 },
  { label: 'Every 5 minutes', value: 5 },
  { label: 'Every 10 minutes', value: 10 },
  { label: 'Every 15 minutes', value: 15 },
  { label: 'Every 30 minutes', value: 30 },
];

const NETWORKS = [
  { id: 'ethereum', name: 'Ethereum', color: 'bg-blue-500', icon: '⟠' },
  { id: 'polygon', name: 'Polygon', color: 'bg-purple-500', icon: '⬡' },
  { id: 'arbitrum', name: 'Arbitrum', color: 'bg-cyan-500', icon: '◈' },
  { id: 'optimism', name: 'Optimism', color: 'bg-red-500', icon: '⊕' },
  { id: 'bsc', name: 'BSC', color: 'bg-yellow-500', icon: '◉' },
  { id: 'avalanche', name: 'Avalanche', color: 'bg-rose-500', icon: '△' },
  { id: 'base', name: 'Base', color: 'bg-blue-400', icon: '◎' },
];

const LOAN_AMOUNTS = [
  { label: '$1,000', value: 1000 },
  { label: '$5,000', value: 5000 },
  { label: '$10,000', value: 10000 },
  { label: '$25,000', value: 25000 },
  { label: '$50,000', value: 50000 },
  { label: '$100,000', value: 100000 },
  { label: '$250,000', value: 250000 },
];


export const Scheduler24x7Dashboard: React.FC = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const supabaseUrl = 'https://ujhsrxinfcycjtulpvqk.supabase.co';
  const webhookUrl = `${supabaseUrl}/functions/v1/cron-scheduler-24-7`;

  const loadData = useCallback(async () => {
    try {
      // Load 24/7 config
      const { data: configData, error: configError } = await supabase
        .from('scheduler_24_7_config')
        .select('*')
        .eq('user_id', 'default')
        .single();

      if (configError && configError.code !== 'PGRST116') {
        console.error('Config error:', configError);
      }
      
      if (configData) {
        setConfig(configData);
      } else {
        // Create default config
        const { data: newConfig, error: createError } = await supabase
          .from('scheduler_24_7_config')
          .insert({
            user_id: 'default',
            is_enabled: false,
            scan_interval_minutes: 5,
            auto_execute_trades: true,
            min_profit_threshold: 50,
            networks: ['ethereum', 'polygon', 'arbitrum'],
            flash_loan_amount: 10000,
          })
          .select()
          .single();
        
        if (!createError && newConfig) {
          setConfig(newConfig);
        }
      }

      // Load recent logs
      const { data: logsData, error: logsError } = await supabase
        .from('scheduler_24_7_logs')
        .select('*')
        .eq('user_id', 'default')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!logsError && logsData) {
        setLogs(logsData);
      }

      // Load today's stats
      const today = new Date().toISOString().split('T')[0];
      const { data: statsData, error: statsError } = await supabase
        .from('scheduler_daily_stats')
        .select('*')
        .eq('user_id', 'default')
        .eq('date', today)
        .single();

      if (!statsError && statsData) {
        setDailyStats(statsData);
      }

      setLastRefresh(new Date());
    } catch (error: unknown) {
      console.error('Failed to load scheduler data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Auto-refresh every 30 seconds if enabled
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(loadData, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadData, autoRefresh]);

  const toggle24x7Mode = async (enabled: boolean) => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('scheduler_24_7_config')
        .update({ 
          is_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', 'default');

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, is_enabled: enabled } : null);

      toast({
        title: enabled ? '24/7 Mode Enabled' : '24/7 Mode Disabled',
        description: enabled 
          ? 'The bot will now scan and trade automatically around the clock'
          : 'Automatic scanning has been paused',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = async (updates: Partial<SchedulerConfig>) => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('scheduler_24_7_config')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', 'default');

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, ...updates } : null);

      toast({
        title: 'Settings Saved',
        description: 'Your 24/7 scheduler configuration has been updated',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const triggerManualScan = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('cron-scheduler-24-7', {
        body: { manualTrigger: true }
      });

      if (error) throw error;

      toast({
        title: 'Scan Complete',
        description: `Found ${data.results?.opportunitiesFound || 0} opportunities, ${data.results?.tradesSuccessful || 0} trades executed`,
      });

      await loadData();
    } catch (error: unknown) {
      toast({
        title: 'Scan Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Webhook URL copied to clipboard',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'skipped':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      default:
        return <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />;
    }
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getSuccessRate = () => {
    const successLogs = logs.filter(l => l.status === 'success');
    if (logs.length === 0) return 0;
    return Math.round((successLogs.length / logs.length) * 100);
  };

  const getTotalProfit = () => {
    return logs.reduce((sum, l) => sum + (l.total_profit || 0) - (l.total_loss || 0), 0);
  };

  const getTotalOpportunities = () => {
    return logs.reduce((sum, l) => sum + (l.opportunities_found || 0), 0);
  };

  const getTotalTrades = () => {
    return logs.reduce((sum, l) => sum + (l.trades_executed || 0), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00F0FF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config?.is_enabled ? 'bg-green-500/20 animate-pulse' : 'bg-gray-700'}`}>
              {config?.is_enabled ? (
                <Power className="h-6 w-6 text-green-400" />
              ) : (
                <PowerOff className="h-6 w-6 text-gray-500" />
              )}
            </div>
            24/7 Automated Trading
          </h2>
          <p className="text-gray-400 mt-1">
            Runs automatically even when you're away - no browser needed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Clock className="h-4 w-4" />
            Last refresh: {formatTimeAgo(lastRefresh.toISOString())}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Auto-refresh</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            className="border-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Control Card */}
      <Card className={`border-2 transition-all ${config?.is_enabled ? 'bg-gradient-to-br from-green-900/20 to-gray-800 border-green-500/50' : 'bg-gray-800 border-gray-700'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-xl ${config?.is_enabled ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                {config?.is_enabled ? (
                  <Activity className="h-10 w-10 text-green-400 animate-pulse" />
                ) : (
                  <Moon className="h-10 w-10 text-gray-500" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {config?.is_enabled ? 'Bot is Running 24/7' : 'Bot is Paused'}
                </h3>
                <p className="text-gray-400">
                  {config?.is_enabled 
                    ? `Scanning every ${config.scan_interval_minutes} minutes, auto-executing profitable trades`
                    : 'Enable 24/7 mode to start automatic trading'}
                </p>
                {config?.last_cron_run_at && (
                  <p className="text-sm text-gray-500 mt-1">
                    Last scan: {formatTimeAgo(config.last_cron_run_at)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={triggerManualScan}
                disabled={triggering}
                variant="outline"
                className="border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/20"
              >
                {triggering ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run Now
              </Button>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  checked={config?.is_enabled || false}
                  onCheckedChange={toggle24x7Mode}
                  disabled={saving}
                  className="scale-125"
                />
                <span className="text-xs text-gray-500">
                  {config?.is_enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Status</p>
                <p className="text-xl font-bold text-white mt-1">
                  {config?.is_enabled ? (
                    <span className="text-green-400 flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <span className="text-gray-500 flex items-center gap-2">
                      <WifiOff className="h-4 w-4" />
                      Inactive
                    </span>
                  )}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${config?.is_enabled ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                <Zap className={`h-5 w-5 ${config?.is_enabled ? 'text-green-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Success Rate</p>
                <p className="text-xl font-bold text-white mt-1">{getSuccessRate()}%</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/20">
                <CheckCircle className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Opportunities</p>
                <p className="text-xl font-bold text-white mt-1">{getTotalOpportunities()}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Trades</p>
                <p className="text-xl font-bold text-white mt-1">{getTotalTrades()}</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/20">
                <BarChart3 className="h-5 w-5 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Net Profit</p>
                <p className={`text-xl font-bold mt-1 ${getTotalProfit() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${getTotalProfit().toFixed(2)}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${getTotalProfit() >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <DollarSign className={`h-5 w-5 ${getTotalProfit() >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="config" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="smart" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
            <Brain className="h-4 w-4 mr-2" />
            Smart Mode
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
            <Activity className="h-4 w-4 mr-2" />
            Activity Log
          </TabsTrigger>
          <TabsTrigger value="setup" className="data-[state=active]:bg-gray-700">
            <Rocket className="h-4 w-4 mr-2" />
            Setup Guide
          </TabsTrigger>
        </TabsList>


        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scan Settings */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#00F0FF]" />
                  Scan Settings
                </CardTitle>
                <CardDescription>
                  Configure how often the bot scans for opportunities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Scan Interval</label>
                  <Select 
                    value={String(config?.scan_interval_minutes || 5)}
                    onValueChange={(value) => updateConfig({ scan_interval_minutes: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {SCAN_INTERVALS.map(interval => (
                        <SelectItem key={interval.value} value={String(interval.value)} className="text-white hover:bg-gray-800">
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Bot will scan approximately {Math.floor(1440 / (config?.scan_interval_minutes || 5))} times per day
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Flash Loan Amount</label>
                  <Select 
                    value={String(config?.flash_loan_amount || 10000)}
                    onValueChange={(value) => updateConfig({ flash_loan_amount: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                      <SelectValue placeholder="Select amount" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {LOAN_AMOUNTS.map(amount => (
                        <SelectItem key={amount.value} value={String(amount.value)} className="text-white hover:bg-gray-800">
                          {amount.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Minimum Profit Threshold</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">$</span>
                    <Input
                      type="number"
                      value={config?.min_profit_threshold || 50}
                      onChange={(e) => updateConfig({ min_profit_threshold: parseFloat(e.target.value) || 50 })}
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Only execute trades with expected profit above this amount
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Auto-Execute Trades</p>
                    <p className="text-sm text-gray-400">Automatically execute profitable opportunities</p>
                  </div>
                  <Switch
                    checked={config?.auto_execute_trades || false}
                    onCheckedChange={(checked) => updateConfig({ auto_execute_trades: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Network Selection */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Globe className="h-5 w-5 text-[#00F0FF]" />
                  Networks to Scan
                </CardTitle>
                <CardDescription>
                  Select which blockchain networks to monitor
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {NETWORKS.map(network => {
                    const isSelected = (config?.networks || []).includes(network.id);
                    return (
                      <button
                        key={network.id}
                        onClick={() => {
                          const currentNetworks = config?.networks || [];
                          const newNetworks = isSelected
                            ? currentNetworks.filter(n => n !== network.id)
                            : [...currentNetworks, network.id];
                          
                          if (newNetworks.length === 0) {
                            toast({
                              title: 'Error',
                              description: 'You must select at least one network',
                              variant: 'destructive',
                            });
                            return;
                          }
                          
                          updateConfig({ networks: newNetworks });
                        }}
                        className={`p-3 rounded-lg border transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF]'
                            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full ${network.color}`}></span>
                        <span className="font-medium">{network.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-gray-900 rounded-lg p-4 mt-4">
                  <h4 className="text-white font-medium mb-2">Selected Networks</h4>
                  <div className="flex flex-wrap gap-2">
                    {(config?.networks || []).map(networkId => {
                      const network = NETWORKS.find(n => n.id === networkId);
                      return network ? (
                        <Badge key={networkId} variant="outline" className="border-gray-600">
                          <span className={`w-2 h-2 rounded-full ${network.color} mr-2`}></span>
                          {network.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="smart" className="space-y-4">
          <SmartModePanel />
        </TabsContent>


        <TabsContent value="logs" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#00F0FF]" />
                    Activity Log
                  </CardTitle>
                  <CardDescription>
                    Recent scans and trade executions
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-gray-600">
                  {logs.length} entries
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No activity logs yet</p>
                  <p className="text-sm mt-1">Enable 24/7 mode to start scanning</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {logs.map((log) => (
                    <div

                      key={log.id}
                      className={`p-4 rounded-lg border ${
                        log.status === 'success' 
                          ? 'bg-gray-900 border-gray-700' 
                          : log.status === 'failed'
                          ? 'bg-red-900/20 border-red-500/30'
                          : 'bg-yellow-900/20 border-yellow-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(log.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">
                                {log.status === 'success' ? 'Scan Complete' : log.status === 'failed' ? 'Scan Failed' : 'Scan Skipped'}
                              </span>
                              {log.circuit_breaker_tripped && (
                                <Badge variant="destructive" className="text-xs">
                                  Circuit Breaker
                                </Badge>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs">
                              {formatTime(log.scan_timestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {log.status === 'success' && (
                            <>
                              <div className="text-center">
                                <p className="text-gray-400 text-xs">Found</p>
                                <p className="text-white font-medium">{log.opportunities_found}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-400 text-xs">Trades</p>
                                <p className="text-white font-medium">{log.trades_successful}/{log.trades_executed}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-400 text-xs">Profit</p>
                                <p className={`font-medium ${(log.total_profit - log.total_loss) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ${(log.total_profit - log.total_loss).toFixed(2)}
                                </p>
                              </div>
                            </>
                          )}
                          {log.error_message && (
                            <span className="text-red-400 text-xs max-w-[200px] truncate">
                              {log.error_message}
                            </span>
                          )}
                          <span className="text-gray-500 text-xs">
                            {log.execution_time_ms}ms
                          </span>
                        </div>
                      </div>
                      {log.networks_scanned && log.networks_scanned.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {log.networks_scanned.map(n => (
                            <span
                              key={n}
                              className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          <Card className="bg-gradient-to-br from-[#00F0FF]/10 to-gray-800 border-[#00F0FF]/30">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Rocket className="h-5 w-5 text-[#00F0FF]" />
                Set Up 24/7 Automated Trading
              </CardTitle>
              <CardDescription>
                Follow these steps to run the bot automatically without keeping your browser open
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center font-bold">
                    1
                  </div>
                  <h3 className="text-white font-medium text-lg">Copy the Webhook URL</h3>
                </div>
                <div className="ml-11 space-y-2">
                  <p className="text-gray-400 text-sm">
                    This URL will be called by an external service to trigger scans:
                  </p>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-[#00F0FF] overflow-x-auto">
                      {webhookUrl}
                    </code>
                    <Button
                      variant="outline"
                      onClick={copyWebhookUrl}
                      className="border-gray-700 shrink-0"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center font-bold">
                    2
                  </div>
                  <h3 className="text-white font-medium text-lg">Sign up for a Free Cron Service</h3>
                </div>
                <div className="ml-11 space-y-3">
                  <p className="text-gray-400 text-sm">
                    Choose one of these free services to call your webhook automatically:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <a
                      href="https://cron-job.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                    >
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <Clock className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">cron-job.org</p>
                        <p className="text-xs text-gray-400">Recommended - Free</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-500 ml-auto" />
                    </a>
                    <a
                      href="https://easycron.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                    >
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <Timer className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">EasyCron</p>
                        <p className="text-xs text-gray-400">Free tier available</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-500 ml-auto" />
                    </a>
                    <a
                      href="https://uptimerobot.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                    >
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Activity className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">UptimeRobot</p>
                        <p className="text-xs text-gray-400">Also monitors uptime</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-gray-500 ml-auto" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center font-bold">
                    3
                  </div>
                  <h3 className="text-white font-medium text-lg">Configure the Cron Job</h3>
                </div>
                <div className="ml-11">
                  <div className="bg-gray-900 rounded-lg p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <span className="text-gray-400">URL:</span>
                        <p className="text-white font-mono text-xs break-all">{webhookUrl}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-400">Method:</span>
                        <p className="text-white font-medium">POST</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-400">Schedule:</span>
                        <p className="text-white font-medium">Every {config?.scan_interval_minutes || 5} minutes</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-400">Content-Type:</span>
                        <p className="text-white font-medium">application/json</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Request Body (optional):</span>
                      <pre className="mt-2 bg-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto">
{`{}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center font-bold">
                    4
                  </div>
                  <h3 className="text-white font-medium text-lg">Enable 24/7 Mode</h3>
                </div>
                <div className="ml-11">
                  <p className="text-gray-400 text-sm mb-3">
                    Turn on 24/7 mode using the switch at the top of this page. The bot will now run automatically!
                  </p>
                  <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
                    <div className={`p-3 rounded-lg ${config?.is_enabled ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                      {config?.is_enabled ? (
                        <Power className="h-6 w-6 text-green-400" />
                      ) : (
                        <PowerOff className="h-6 w-6 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {config?.is_enabled ? '24/7 Mode is Active' : '24/7 Mode is Disabled'}
                      </p>
                      <p className="text-sm text-gray-400">
                        {config?.is_enabled 
                          ? 'Your bot is running automatically' 
                          : 'Enable to start automatic trading'}
                      </p>
                    </div>
                    <Switch
                      checked={config?.is_enabled || false}
                      onCheckedChange={toggle24x7Mode}
                      disabled={saving}
                      className="scale-125"
                    />
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 ml-11">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-400 font-medium">How it works</p>
                    <p className="text-sm text-gray-400 mt-1">
                      The external cron service calls your webhook URL at regular intervals. 
                      Each call triggers a scan for arbitrage opportunities. If profitable trades 
                      are found above your threshold, they're automatically executed using Flashbots 
                      for MEV protection. All activity is logged so you can review what happened while you were away.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
