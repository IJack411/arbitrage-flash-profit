
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, Zap, TrendingUp, TrendingDown, Fuel, Activity, 
  RefreshCw, Loader2, Clock, AlertTriangle, CheckCircle,
  Gauge, BarChart3, Settings2, Sparkles, ArrowUp, ArrowDown,
  Minus, Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface SmartModeConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  base_interval_minutes: number;
  min_interval_minutes: number;
  max_interval_minutes: number;
  gas_low_threshold: number;
  gas_medium_threshold: number;
  gas_high_threshold: number;
  volatility_low_threshold: number;
  volatility_medium_threshold: number;
  volatility_high_threshold: number;
  high_gas_interval_multiplier: number;
  high_volatility_interval_divisor: number;
  current_interval_minutes: number;
  last_gas_price_gwei: number;
  last_volatility_percent: number;
  last_market_check_at: string | null;
}

interface MarketCondition {
  id: string;
  timestamp: string;
  ethereum_gas_gwei: number | null;
  polygon_gas_gwei: number | null;
  arbitrum_gas_gwei: number | null;
  avg_gas_gwei: number;
  eth_price_usd: number;
  eth_price_change_1h: number;
  btc_price_usd: number;
  btc_price_change_1h: number;
  overall_volatility_score: number;
  recommended_interval_minutes: number;
  reason: string;
}

export const SmartModePanel: React.FC = () => {
  const { toast } = useToast();
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };
  const [config, setConfig] = useState<SmartModeConfig | null>(null);
  const [marketHistory, setMarketHistory] = useState<MarketCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Load smart mode config
      const { data: configData, error: configError } = await supabase
        .from('smart_mode_config')
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
          .from('smart_mode_config')
          .insert({
            user_id: 'default',
            is_enabled: false,
            base_interval_minutes: 5,
            min_interval_minutes: 1,
            max_interval_minutes: 30,
          })
          .select()
          .single();
        
        if (!createError && newConfig) {
          setConfig(newConfig);
        }
      }

      // Load recent market conditions
      const { data: historyData, error: historyError } = await supabase
        .from('market_conditions_history')
        .select('*')
        .eq('user_id', 'default')
        .order('timestamp', { ascending: false })
        .limit(24);

      if (!historyError && historyData) {
        setMarketHistory(historyData);
      }
    } catch (error: unknown) {
      console.error('Failed to load smart mode data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleSmartMode = async (enabled: boolean) => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('smart_mode_config')
        .update({ 
          is_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', 'default');

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, is_enabled: enabled } : null);

      toast({
        title: enabled ? 'Smart Mode Enabled' : 'Smart Mode Disabled',
        description: enabled 
          ? 'Scan frequency will now adjust based on market conditions'
          : 'Using fixed scan interval',
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

  const updateConfig = async (updates: Partial<SmartModeConfig>) => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('smart_mode_config')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', 'default');

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, ...updates } : null);

      toast({
        title: 'Settings Saved',
        description: 'Smart mode configuration updated',
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

  const refreshMarketData = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('cron-scheduler-24-7', {
        body: { manualTrigger: true, forceSmartModeCheck: true }
      });

      if (error) throw error;

      toast({
        title: 'Market Data Refreshed',
        description: data.smartMode?.conditions 
          ? `Gas: ${data.smartMode.conditions.avgGasGwei?.toFixed(1)} gwei, Volatility: ${data.smartMode.conditions.volatilityScore?.toFixed(2)}%`
          : 'Market conditions updated',
      });

      await loadData();
    } catch (error: unknown) {
      toast({
        title: 'Refresh Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const getGasLevel = (gasGwei: number) => {
    if (!config) return { level: 'unknown', color: 'gray' };
    if (gasGwei >= config.gas_high_threshold) return { level: 'High', color: 'red' };
    if (gasGwei >= config.gas_medium_threshold) return { level: 'Medium', color: 'yellow' };
    if (gasGwei <= config.gas_low_threshold) return { level: 'Low', color: 'green' };
    return { level: 'Normal', color: 'blue' };
  };

  const getVolatilityLevel = (volatility: number) => {
    if (!config) return { level: 'unknown', color: 'gray' };
    if (volatility >= config.volatility_high_threshold) return { level: 'High', color: 'green' };
    if (volatility >= config.volatility_medium_threshold) return { level: 'Medium', color: 'yellow' };
    if (volatility <= config.volatility_low_threshold) return { level: 'Low', color: 'red' };
    return { level: 'Normal', color: 'blue' };
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const latestCondition = marketHistory[0];
  const gasLevel = getGasLevel(config?.last_gas_price_gwei || 0);
  const volatilityLevel = getVolatilityLevel(config?.last_volatility_percent || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00F0FF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Smart Mode Toggle Card */}
      <Card className={`border-2 transition-all ${config?.is_enabled ? 'bg-gradient-to-br from-purple-900/30 to-gray-800 border-purple-500/50' : 'bg-gray-800 border-gray-700'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-xl ${config?.is_enabled ? 'bg-purple-500/20' : 'bg-gray-700'}`}>
                <Brain className={`h-10 w-10 ${config?.is_enabled ? 'text-purple-400 animate-pulse' : 'text-gray-500'}`} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  Smart Mode
                  {config?.is_enabled && (
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  )}
                </h3>
                <p className="text-gray-400">
                  {config?.is_enabled 
                    ? 'Automatically adjusting scan frequency based on market conditions'
                    : 'Enable to optimize scan frequency based on gas prices and volatility'}
                </p>
                {config?.is_enabled && config?.last_market_check_at && (
                  <p className="text-sm text-gray-500 mt-1">
                    Last check: {formatTimeAgo(config.last_market_check_at)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button
                onClick={refreshMarketData}
                disabled={refreshing}
                variant="outline"
                size="sm"
                className="border-gray-700"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  checked={config?.is_enabled || false}
                  onCheckedChange={toggleSmartMode}
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

      {/* Current Market Conditions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Gas Price */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Fuel className={`h-5 w-5 text-${gasLevel.color}-400`} />
                <span className="text-gray-400 text-sm">Gas Price</span>
              </div>
              <Badge className={`bg-${gasLevel.color}-500/20 text-${gasLevel.color}-400 border-${gasLevel.color}-500/30`}>
                {gasLevel.level}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-white">
              {(config?.last_gas_price_gwei || 0).toFixed(1)} <span className="text-sm text-gray-400">gwei</span>
            </p>
            <div className="mt-2">
              <Progress 
                value={Math.min(100, ((config?.last_gas_price_gwei || 0) / (config?.gas_high_threshold || 100)) * 100)} 
                className="h-1.5"
              />
            </div>
          </CardContent>
        </Card>

        {/* Volatility */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className={`h-5 w-5 text-${volatilityLevel.color}-400`} />
                <span className="text-gray-400 text-sm">Volatility</span>
              </div>
              <Badge className={`bg-${volatilityLevel.color}-500/20 text-${volatilityLevel.color}-400 border-${volatilityLevel.color}-500/30`}>
                {volatilityLevel.level}
              </Badge>
            </div>
            <p className="text-2xl font-bold text-white">
              {(config?.last_volatility_percent || 0).toFixed(2)}<span className="text-sm text-gray-400">%</span>
            </p>
            <div className="mt-2">
              <Progress 
                value={Math.min(100, ((config?.last_volatility_percent || 0) / (config?.volatility_high_threshold || 5)) * 100)} 
                className="h-1.5"
              />
            </div>
          </CardContent>
        </Card>

        {/* Current Interval */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#00F0FF]" />
                <span className="text-gray-400 text-sm">Scan Interval</span>
              </div>
              {config?.is_enabled && (
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                  Smart
                </Badge>
              )}
            </div>
            <p className="text-2xl font-bold text-white">
              {config?.current_interval_minutes || config?.base_interval_minutes || 5} <span className="text-sm text-gray-400">min</span>
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Base: {config?.base_interval_minutes || 5} min
            </p>
          </CardContent>
        </Card>

        {/* Optimization Status */}
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-[#00F0FF]" />
                <span className="text-gray-400 text-sm">Optimization</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.is_enabled ? (
                <>
                  {(config?.current_interval_minutes || 5) < (config?.base_interval_minutes || 5) ? (
                    <>
                      <ArrowUp className="h-5 w-5 text-green-400" />
                      <span className="text-green-400 font-medium">Faster</span>
                    </>
                  ) : (config?.current_interval_minutes || 5) > (config?.base_interval_minutes || 5) ? (
                    <>
                      <ArrowDown className="h-5 w-5 text-yellow-400" />
                      <span className="text-yellow-400 font-medium">Slower</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-5 w-5 text-blue-400" />
                      <span className="text-blue-400 font-medium">Normal</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-gray-500">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {latestCondition?.reason || 'Enable Smart Mode to optimize'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How Smart Mode Works */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Info className="h-5 w-5 text-[#00F0FF]" />
            How Smart Mode Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-gray-900 rounded-lg">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <Fuel className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">High Gas Prices</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    When gas is expensive (&gt;{config?.gas_high_threshold || 100} gwei), Smart Mode reduces scan frequency to save on transaction costs. Fewer scans = lower overhead.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="border-red-500/30 text-red-400">
                      Scan less often
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-gray-900 rounded-lg">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Fuel className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">Low Gas Prices</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    When gas is cheap (&lt;{config?.gas_low_threshold || 20} gwei), it's cost-effective to scan more frequently and catch more opportunities.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="border-green-500/30 text-green-400">
                      Scan more often
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-gray-900 rounded-lg">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">High Volatility</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    When prices are moving fast (&gt;{config?.volatility_high_threshold || 5}% change), there are more arbitrage opportunities. Smart Mode increases scan frequency to catch them.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="border-green-500/30 text-green-400">
                      More opportunities
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-gray-900 rounded-lg">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <TrendingDown className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <h4 className="text-white font-medium">Low Volatility</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    When markets are calm (&lt;{config?.volatility_low_threshold || 0.5}% change), fewer arbitrage opportunities exist. Smart Mode reduces scan frequency to conserve resources.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">
                      Fewer opportunities
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Mode Settings */}
      {config?.is_enabled && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-[#00F0FF]" />
              Smart Mode Settings
            </CardTitle>
            <CardDescription>
              Fine-tune how Smart Mode adjusts scan frequency
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Interval Range */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Interval Range</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Minimum Interval</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.min_interval_minutes || 1]}
                      onValueChange={([value]) => updateConfig({ min_interval_minutes: value })}
                      min={1}
                      max={10}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-white font-medium w-12 text-right">
                      {config?.min_interval_minutes || 1}m
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Base Interval</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.base_interval_minutes || 5]}
                      onValueChange={([value]) => updateConfig({ base_interval_minutes: value })}
                      min={1}
                      max={15}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-white font-medium w-12 text-right">
                      {config?.base_interval_minutes || 5}m
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Maximum Interval</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.max_interval_minutes || 30]}
                      onValueChange={([value]) => updateConfig({ max_interval_minutes: value })}
                      min={10}
                      max={60}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-white font-medium w-12 text-right">
                      {config?.max_interval_minutes || 30}m
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Gas Thresholds */}
            <div className="space-y-4">
              <h4 className="text-white font-medium flex items-center gap-2">
                <Fuel className="h-4 w-4 text-orange-400" />
                Gas Price Thresholds (gwei)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Low (scan faster)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.gas_low_threshold || 20]}
                      onValueChange={([value]) => updateConfig({ gas_low_threshold: value })}
                      min={5}
                      max={50}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-green-400 font-medium w-16 text-right">
                      &lt;{config?.gas_low_threshold || 20}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Medium (normal)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.gas_medium_threshold || 50]}
                      onValueChange={([value]) => updateConfig({ gas_medium_threshold: value })}
                      min={20}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-yellow-400 font-medium w-16 text-right">
                      {config?.gas_medium_threshold || 50}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">High (scan slower)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.gas_high_threshold || 100]}
                      onValueChange={([value]) => updateConfig({ gas_high_threshold: value })}
                      min={50}
                      max={200}
                      step={10}
                      className="flex-1"
                    />
                    <span className="text-red-400 font-medium w-16 text-right">
                      &gt;{config?.gas_high_threshold || 100}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Volatility Thresholds */}
            <div className="space-y-4">
              <h4 className="text-white font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-400" />
                Volatility Thresholds (% change)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Low (scan slower)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.volatility_low_threshold || 0.5]}
                      onValueChange={([value]) => updateConfig({ volatility_low_threshold: value })}
                      min={0.1}
                      max={2}
                      step={0.1}
                      className="flex-1"
                    />
                    <span className="text-red-400 font-medium w-16 text-right">
                      &lt;{config?.volatility_low_threshold || 0.5}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Medium (normal)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.volatility_medium_threshold || 2]}
                      onValueChange={([value]) => updateConfig({ volatility_medium_threshold: value })}
                      min={1}
                      max={5}
                      step={0.5}
                      className="flex-1"
                    />
                    <span className="text-yellow-400 font-medium w-16 text-right">
                      {config?.volatility_medium_threshold || 2}%
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">High (scan faster)</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[config?.volatility_high_threshold || 5]}
                      onValueChange={([value]) => updateConfig({ volatility_high_threshold: value })}
                      min={3}
                      max={15}
                      step={0.5}
                      className="flex-1"
                    />
                    <span className="text-green-400 font-medium w-16 text-right">
                      &gt;{config?.volatility_high_threshold || 5}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Conditions History */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[#00F0FF]" />
                Market Conditions History
              </CardTitle>
              <CardDescription>
                Recent market snapshots and interval adjustments
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-gray-600">
              {marketHistory.length} records
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {marketHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No market data yet</p>
              <p className="text-sm mt-1">Enable Smart Mode to start tracking market conditions</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {marketHistory.map((condition) => (
                <div
                  key={condition.id}
                  className="p-4 bg-gray-900 rounded-lg border border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-gray-500 text-sm">
                        {new Date(condition.timestamp).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Fuel className="h-4 w-4 text-orange-400" />
                          <span className="text-white">{condition.avg_gas_gwei?.toFixed(1)} gwei</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="h-4 w-4 text-purple-400" />
                          <span className="text-white">{condition.overall_volatility_score?.toFixed(2)}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF]">
                        {condition.recommended_interval_minutes}min interval
                      </Badge>
                    </div>
                  </div>
                  {condition.reason && (
                    <p className="text-sm text-gray-400 mt-2">{condition.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
