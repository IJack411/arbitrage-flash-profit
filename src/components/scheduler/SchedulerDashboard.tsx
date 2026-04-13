
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Clock, Play, Pause, RefreshCw, CheckCircle, XCircle, 
  AlertTriangle, Activity, Calendar, Timer, Zap, Settings,
  ExternalLink, Copy, Check, Loader2, TrendingUp
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface SchedulerJob {
  id: string;
  job_name: string;
  description: string;
  cron_expression: string;
  function_name: string;
  function_params: {
    networks?: string[];
    loanAmount?: number;
    scheduledRun?: boolean;
  };
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SchedulerLog {
  id: string;
  job_name: string;
  status: 'success' | 'failed' | 'running';
  opportunities_found: number;
  networks_scanned: string[];
  error_message: string | null;
  execution_time_ms: number;
  created_at: string;
}

const CRON_PRESETS = [
  { label: 'Every 1 minute', value: '* * * * *', interval: 60 },
  { label: 'Every 5 minutes', value: '*/5 * * * *', interval: 300 },
  { label: 'Every 10 minutes', value: '*/10 * * * *', interval: 600 },
  { label: 'Every 15 minutes', value: '*/15 * * * *', interval: 900 },
  { label: 'Every 30 minutes', value: '*/30 * * * *', interval: 1800 },
  { label: 'Every hour', value: '0 * * * *', interval: 3600 },
];

const NETWORKS = [
  { id: 'ethereum', name: 'Ethereum', color: 'bg-blue-500' },
  { id: 'polygon', name: 'Polygon', color: 'bg-purple-500' },
  { id: 'arbitrum', name: 'Arbitrum', color: 'bg-cyan-500' },
  { id: 'optimism', name: 'Optimism', color: 'bg-red-500' },
  { id: 'bsc', name: 'BSC', color: 'bg-yellow-500' },
];

export const SchedulerDashboard: React.FC = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>(['ethereum', 'polygon', 'arbitrum']);
  const [selectedCron, setSelectedCron] = useState('*/5 * * * *');
  const [loanAmount, setLoanAmount] = useState(10000);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const supabaseUrl = 'https://ujhsrxinfcycjtulpvqk.supabase.co';
  const webhookUrl = `${supabaseUrl}/functions/v1/scheduler-trigger`;

  const loadData = useCallback(async () => {
    try {
      // Load jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('scheduler_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;
      setJobs(jobsData || []);

      // Load recent logs
      const { data: logsData, error: logsError } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setLogs(logsData || []);

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

  const toggleJob = async (jobName: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduler_jobs')
        .update({ 
          is_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('job_name', jobName);

      if (error) throw error;

      setJobs(prev => prev.map(j => 
        j.job_name === jobName ? { ...j, is_enabled: enabled } : j
      ));

      toast({
        title: enabled ? 'Scheduler Enabled' : 'Scheduler Disabled',
        description: `${jobName} has been ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const updateJobConfig = async (jobName: string, updates: Partial<SchedulerJob>) => {
    try {
      const { error } = await supabase
        .from('scheduler_jobs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('job_name', jobName);

      if (error) throw error;

      await loadData();

      toast({
        title: 'Configuration Updated',
        description: 'Scheduler settings have been saved',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const createDefaultJob = async () => {
    try {
      const { error } = await supabase
        .from('scheduler_jobs')
        .insert({
          job_name: 'arbitrage-scanner',
          description: 'Scans for arbitrage opportunities across DEXes',
          cron_expression: selectedCron,
          function_name: 'scan-arbitrage-opportunities',
          function_params: {
            networks: selectedNetworks,
            loanAmount: loanAmount,
            scheduledRun: true
          },
          is_enabled: false
        });

      if (error) throw error;

      await loadData();

      toast({
        title: 'Job Created',
        description: 'Arbitrage scanner job has been created',
      });
    } catch (error: unknown) {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (errorCode === '23505') {
        toast({
          title: 'Job Exists',
          description: 'The arbitrage scanner job already exists',
        });
      } else {
        toast({
          title: 'Error',
          description: getErrorMessage(error),
          variant: 'destructive',
        });
      }
    }
  };

  const triggerNow = async (jobName?: string) => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('scheduler-trigger', {
        body: jobName ? { jobName } : {}
      });

      if (error) throw error;

      toast({
        title: 'Scan Triggered',
        description: `Found ${data.results?.[0]?.opportunitiesFound || 0} opportunities`,
      });

      await loadData();
    } catch (error: unknown) {
      toast({
        title: 'Trigger Failed',
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
      case 'running':
        return <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const getSuccessRate = () => {
    if (logs.length === 0) return 0;
    const successful = logs.filter(l => l.status === 'success').length;
    return Math.round((successful / logs.length) * 100);
  };

  const getTotalOpportunities = () => {
    return logs.reduce((sum, l) => sum + (l.opportunities_found || 0), 0);
  };

  const getAverageExecutionTime = () => {
    const validLogs = logs.filter(l => l.execution_time_ms > 0);
    if (validLogs.length === 0) return 0;
    return Math.round(validLogs.reduce((sum, l) => sum + l.execution_time_ms, 0) / validLogs.length);
  };

  const arbitrageJob = jobs.find(j => j.job_name === 'arbitrage-scanner');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock className="h-6 w-6 text-[#00F0FF]" />
            Automated Scheduler
          </h2>
          <p className="text-gray-400 mt-1">
            Configure automatic arbitrage scanning every 5 minutes
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Status</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {arbitrageJob?.is_enabled ? (
                    <span className="text-green-400 flex items-center gap-2">
                      <Activity className="h-5 w-5 animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="text-gray-500">Inactive</span>
                  )}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${arbitrageJob?.is_enabled ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                <Zap className={`h-6 w-6 ${arbitrageJob?.is_enabled ? 'text-green-400' : 'text-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Success Rate</p>
                <p className="text-2xl font-bold text-white mt-1">{getSuccessRate()}%</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/20">
                <CheckCircle className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Opportunities Found</p>
                <p className="text-2xl font-bold text-white mt-1">{getTotalOpportunities()}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Avg Execution</p>
                <p className="text-2xl font-bold text-white mt-1">{getAverageExecutionTime()}ms</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/20">
                <Timer className="h-6 w-6 text-orange-400" />
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
          <TabsTrigger value="logs" className="data-[state=active]:bg-gray-700">
            <Activity className="h-4 w-4 mr-2" />
            Execution Logs
          </TabsTrigger>
          <TabsTrigger value="external" className="data-[state=active]:bg-gray-700">
            <ExternalLink className="h-4 w-4 mr-2" />
            External Cron
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          {/* Main Scheduler Card */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[#00F0FF]" />
                    Arbitrage Scanner
                  </CardTitle>
                  <CardDescription>
                    Automatically scan for profitable arbitrage opportunities
                  </CardDescription>
                </div>
                {arbitrageJob ? (
                  <Switch
                    checked={arbitrageJob.is_enabled}
                    onCheckedChange={(checked) => toggleJob('arbitrage-scanner', checked)}
                  />
                ) : (
                  <Button onClick={createDefaultJob} className="bg-[#00F0FF] text-gray-900 hover:bg-[#00D0E0]">
                    Create Job
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Schedule Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Scan Interval</label>
                <Select 
                  value={arbitrageJob?.cron_expression || selectedCron}
                  onValueChange={(value) => {
                    setSelectedCron(value);
                    if (arbitrageJob) {
                      updateJobConfig('arbitrage-scanner', { cron_expression: value });
                    }
                  }}
                >
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {CRON_PRESETS.map(preset => (
                      <SelectItem key={preset.value} value={preset.value} className="text-white hover:bg-gray-800">
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Network Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Networks to Scan</label>
                <div className="flex flex-wrap gap-2">
                  {NETWORKS.map(network => {
                    const isSelected = (arbitrageJob?.function_params?.networks || selectedNetworks).includes(network.id);
                    return (
                      <button
                        key={network.id}
                        onClick={() => {
                          const currentNetworks = arbitrageJob?.function_params?.networks || selectedNetworks;
                          const newNetworks = isSelected
                            ? currentNetworks.filter(n => n !== network.id)
                            : [...currentNetworks, network.id];
                          
                          if (newNetworks.length === 0) return; // Must have at least one network
                          
                          setSelectedNetworks(newNetworks);
                          if (arbitrageJob) {
                            updateJobConfig('arbitrage-scanner', {
                              function_params: {
                                ...arbitrageJob.function_params,
                                networks: newNetworks
                              }
                            });
                          }
                        }}
                        className={`px-3 py-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF]'
                            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span className={`inline-block w-2 h-2 rounded-full ${network.color} mr-2`}></span>
                        {network.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Loan Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Flash Loan Amount (USD)</label>
                <Select
                  value={String(arbitrageJob?.function_params?.loanAmount || loanAmount)}
                  onValueChange={(value) => {
                    const amount = parseInt(value);
                    setLoanAmount(amount);
                    if (arbitrageJob) {
                      updateJobConfig('arbitrage-scanner', {
                        function_params: {
                          ...arbitrageJob.function_params,
                          loanAmount: amount
                        }
                      });
                    }
                  }}
                >
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue placeholder="Select amount" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="1000" className="text-white hover:bg-gray-800">$1,000</SelectItem>
                    <SelectItem value="5000" className="text-white hover:bg-gray-800">$5,000</SelectItem>
                    <SelectItem value="10000" className="text-white hover:bg-gray-800">$10,000</SelectItem>
                    <SelectItem value="25000" className="text-white hover:bg-gray-800">$25,000</SelectItem>
                    <SelectItem value="50000" className="text-white hover:bg-gray-800">$50,000</SelectItem>
                    <SelectItem value="100000" className="text-white hover:bg-gray-800">$100,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Last Run Info */}
              {arbitrageJob && (
                <div className="bg-gray-900 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Last Run:</span>
                    <span className="text-white">{formatTime(arbitrageJob.last_run_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Created:</span>
                    <span className="text-white">{formatTime(arbitrageJob.created_at)}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => triggerNow('arbitrage-scanner')}
                  disabled={triggering || !arbitrageJob?.is_enabled}
                  className="flex-1 bg-[#00F0FF] text-gray-900 hover:bg-[#00D0E0]"
                >
                  {triggering ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Run Now
                </Button>
                {arbitrageJob?.is_enabled && (
                  <Button
                    variant="outline"
                    onClick={() => toggleJob('arbitrage-scanner', false)}
                    className="border-red-500 text-red-400 hover:bg-red-500/20"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#00F0FF]" />
                Execution History
              </CardTitle>
              <CardDescription>
                Recent scheduler runs and their results
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-[#00F0FF]" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No execution logs yet</p>
                  <p className="text-sm mt-1">Enable the scheduler to start scanning</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map(log => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(log.status)}
                        <div>
                          <p className="text-white text-sm font-medium">{log.job_name}</p>
                          <p className="text-gray-500 text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {log.status === 'success' && (
                          <Badge variant="outline" className="border-green-500 text-green-400">
                            {log.opportunities_found} found
                          </Badge>
                        )}
                        {log.status === 'failed' && log.error_message && (
                          <span className="text-red-400 text-xs max-w-[200px] truncate">
                            {log.error_message}
                          </span>
                        )}
                        {log.execution_time_ms > 0 && (
                          <span className="text-gray-500 text-xs">
                            {log.execution_time_ms}ms
                          </span>
                        )}
                        {log.networks_scanned?.length > 0 && (
                          <div className="flex gap-1">
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
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="external" className="space-y-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-[#00F0FF]" />
                External Cron Setup
              </CardTitle>
              <CardDescription>
                Use an external service like cron-job.org to trigger scans every 5 minutes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <h3 className="text-white font-medium">Copy Webhook URL</h3>
                </div>
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

              {/* Step 2 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <h3 className="text-white font-medium">Sign up for cron-job.org (Free)</h3>
                </div>
                <a
                  href="https://cron-job.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg text-white transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open cron-job.org
                </a>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#00F0FF] text-gray-900 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <h3 className="text-white font-medium">Create a new cron job with these settings:</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">URL:</span>
                      <span className="text-white ml-2">Paste the webhook URL above</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Method:</span>
                      <span className="text-white ml-2">POST</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Schedule:</span>
                      <span className="text-white ml-2">Every 5 minutes</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Content-Type:</span>
                      <span className="text-white ml-2">application/json</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Request Body (optional):</span>
                    <pre className="mt-2 bg-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto">
{`{
  "jobName": "arbitrage-scanner"
}`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Alternative Services */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Alternative Services:</h4>
                <ul className="space-y-1 text-sm text-gray-400">
                  <li>• <a href="https://easycron.com" target="_blank" rel="noopener noreferrer" className="text-[#00F0FF] hover:underline">EasyCron</a> - Free tier available</li>
                  <li>• <a href="https://www.setcronjob.com" target="_blank" rel="noopener noreferrer" className="text-[#00F0FF] hover:underline">SetCronJob</a> - Simple interface</li>
                  <li>• <a href="https://uptimerobot.com" target="_blank" rel="noopener noreferrer" className="text-[#00F0FF] hover:underline">UptimeRobot</a> - Also monitors uptime</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
