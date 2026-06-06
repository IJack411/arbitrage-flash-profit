import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Clock,
  Cpu,
  Eye,
  Gauge,
  Play,
  Radio,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { realTimeMLService } from '@/agent-helpers/lib/realTimeMLService';
import {
  SensitivityLevel,
  SENSITIVITY_PRESETS,
  SENSITIVITY_DISPLAY,
  WalletMonitoringState,
  RealTimeAlert,
  RealTimeTransaction,
  RealTimeAnomalyResult,
  MonitoringSession,
  getThreatLevelFromScore,
  RISK_THRESHOLDS,
} from '@/agent-helpers/types/realTimeML';
import { THREAT_LEVEL_CONFIG, ANOMALY_TYPE_INFO } from '@/agent-helpers/types/mlAnalytics';
import { useToast } from '@/hooks/use-toast';

interface RealTimeMLDashboardProps {
  walletAddresses: string[];
  walletNames?: Record<string, string>;
}

export const RealTimeMLDashboard: React.FC<RealTimeMLDashboardProps> = ({
  walletAddresses,
  walletNames = {},
}) => {
  const { toast } = useToast();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [session, setSession] = useState<MonitoringSession | null>(null);
  const [walletStates, setWalletStates] = useState<WalletMonitoringState[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<RealTimeAlert[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RealTimeTransaction[]>([]);
  const [recentAnomalies, setRecentAnomalies] = useState<RealTimeAnomalyResult[]>([]);
  const [sensitivityLevel, setSensitivityLevel] = useState<SensitivityLevel>('medium');
  const [globalRiskScore, setGlobalRiskScore] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  // Custom sensitivity settings
  const [customThreshold, setCustomThreshold] = useState(2.5);
  const [customCooldown, setCustomCooldown] = useState(15);
  const [customMinConfidence, setCustomMinConfidence] = useState(60);

  // Refresh state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isMonitoring) {
        setWalletStates(realTimeMLService.getAllWalletStates());
        setRecentAlerts(realTimeMLService.getRecentAlerts(undefined, 20));
        setGlobalRiskScore(realTimeMLService.getGlobalRiskScore());
        setSession(realTimeMLService.getSession());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  // Subscribe to events
  useEffect(() => {
    const unsubTransaction = realTimeMLService.onTransaction((tx) => {
      setRecentTransactions(prev => [tx, ...prev.slice(0, 49)]);
    });

    const unsubAnomaly = realTimeMLService.onAnomaly((anomaly) => {
      setRecentAnomalies(prev => [anomaly, ...prev.slice(0, 49)]);
      if (anomaly.isAnomaly) {
        toast({
          title: 'Anomaly Detected',
          description: anomaly.description,
          variant: anomaly.anomalyScore > 60 ? 'destructive' : 'default',
        });
      }
    });

    const unsubAlert = realTimeMLService.onAlert((alert) => {
      setRecentAlerts(prev => [alert, ...prev.slice(0, 49)]);
      toast({
        title: alert.title,
        description: alert.message,
        variant: alert.severity === 'critical' ? 'destructive' : 'default',
      });
    });

    const unsubRisk = realTimeMLService.onRiskUpdate((address, score, level) => {
      setGlobalRiskScore(realTimeMLService.getGlobalRiskScore());
    });

    return () => {
      unsubTransaction();
      unsubAnomaly();
      unsubAlert();
      unsubRisk();
    };
  }, [toast]);

  const handleStartMonitoring = () => {
    realTimeMLService.setSensitivity(sensitivityLevel);
    const newSession = realTimeMLService.startMonitoring(walletAddresses);
    setSession(newSession);
    setIsMonitoring(true);
    toast({
      title: 'Monitoring Started',
      description: `Now monitoring ${walletAddresses.length} wallet(s)`,
    });
  };

  const handleStopMonitoring = () => {
    realTimeMLService.stopMonitoring();
    setIsMonitoring(false);
    toast({
      title: 'Monitoring Stopped',
      description: 'Real-time monitoring has been paused',
    });
  };

  const handleSensitivityChange = (level: SensitivityLevel) => {
    setSensitivityLevel(level);
    if (isMonitoring) {
      realTimeMLService.setSensitivity(level);
    }
  };

  const handleApplyCustomSensitivity = () => {
    realTimeMLService.setCustomSensitivity({
      anomalyThreshold: customThreshold,
      alertCooldownMs: customCooldown * 60 * 1000,
      minConfidence: customMinConfidence,
    });
    toast({
      title: 'Custom Settings Applied',
      description: 'Sensitivity settings have been updated',
    });
  };

  const handleAcknowledgeAlert = (alertId: string, walletAddress: string) => {
    realTimeMLService.acknowledgeAlert(alertId, walletAddress);
    setRecentAlerts(realTimeMLService.getRecentAlerts(undefined, 20));
  };

  const handleInjectTestTransaction = async () => {
    if (walletAddresses.length === 0) return;
    
    const testTx = {
      value: Math.random() * 2, // Random 0-2 ETH
      type: Math.random() > 0.5 ? 'outgoing' : 'incoming' as const,
    };

    await realTimeMLService.injectTransaction(walletAddresses[0], testTx);
    toast({
      title: 'Test Transaction Injected',
      description: `${testTx.type === 'outgoing' ? 'Sent' : 'Received'} ${testTx.value.toFixed(4)} ETH`,
    });
  };

  const getRiskColor = (score: number) => {
    if (score >= RISK_THRESHOLDS.critical) return 'text-red-400';
    if (score >= RISK_THRESHOLDS.high) return 'text-orange-400';
    if (score >= RISK_THRESHOLDS.medium) return 'text-yellow-400';
    if (score >= RISK_THRESHOLDS.low) return 'text-blue-400';
    return 'text-green-400';
  };

  const getRiskBgColor = (score: number) => {
    if (score >= RISK_THRESHOLDS.critical) return 'bg-red-500/20';
    if (score >= RISK_THRESHOLDS.high) return 'bg-orange-500/20';
    if (score >= RISK_THRESHOLDS.medium) return 'bg-yellow-500/20';
    if (score >= RISK_THRESHOLDS.low) return 'bg-blue-500/20';
    return 'bg-green-500/20';
  };

  const stats = realTimeMLService.getStatistics();

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {isMonitoring ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleStopMonitoring}
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Stop Monitoring
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleStartMonitoring}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={walletAddresses.length === 0}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Start Monitoring
                  </Button>
                )}
              </div>

              {isMonitoring && (
                <div className="flex items-center gap-2 text-green-400">
                  <Radio className="h-4 w-4 animate-pulse" />
                  <span className="text-sm font-medium">Live</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleInjectTestTransaction}
                disabled={!isMonitoring}
              >
                <Zap className="h-4 w-4 mr-1" />
                Test Transaction
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-slate-700 ${getRiskBgColor(globalRiskScore)}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Global Risk Score</p>
                <p className={`text-3xl font-bold ${getRiskColor(globalRiskScore)}`}>
                  {globalRiskScore.toFixed(0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {getThreatLevelFromScore(globalRiskScore).toUpperCase()}
                </p>
              </div>
              <div className={`p-3 rounded-full ${getRiskBgColor(globalRiskScore)}`}>
                {globalRiskScore >= RISK_THRESHOLDS.high ? (
                  <ShieldAlert className={`h-8 w-8 ${getRiskColor(globalRiskScore)}`} />
                ) : (
                  <ShieldCheck className={`h-8 w-8 ${getRiskColor(globalRiskScore)}`} />
                )}
              </div>
            </div>
            <Progress 
              value={globalRiskScore} 
              className="mt-3 h-2"
            />
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Transactions Processed</p>
                <p className="text-3xl font-bold text-cyan-400">
                  {stats.totalTransactions}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {session?.averageProcessingTimeMs.toFixed(1) || 0}ms avg
                </p>
              </div>
              <Activity className="h-8 w-8 text-cyan-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Anomalies Detected</p>
                <p className="text-3xl font-bold text-yellow-400">
                  {stats.totalAnomalies}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {stats.totalTransactions > 0 
                    ? ((stats.totalAnomalies / stats.totalTransactions) * 100).toFixed(1)
                    : 0}% rate
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Alerts Triggered</p>
                <p className="text-3xl font-bold text-red-400">
                  {stats.totalAlerts}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {stats.highRiskWallets} high-risk wallets
                </p>
              </div>
              <Bell className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="bg-slate-800">
          <TabsTrigger value="live" className="flex items-center gap-1">
            <Radio className="h-4 w-4" />
            Live Feed
          </TabsTrigger>
          <TabsTrigger value="wallets" className="flex items-center gap-1">
            <Wallet className="h-4 w-4" />
            Wallet Status
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1">
            <Bell className="h-4 w-4" />
            Alerts
            {recentAlerts.filter(a => !a.acknowledged).length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-xs px-1.5">
                {recentAlerts.filter(a => !a.acknowledged).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="flex items-center gap-1">
            <Gauge className="h-4 w-4" />
            Sensitivity
          </TabsTrigger>
        </TabsList>

        {/* Live Feed Tab */}
        <TabsContent value="live">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Transaction Stream */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  Transaction Stream
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {recentTransactions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No transactions yet</p>
                      <p className="text-sm">Transactions will appear here in real-time</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {tx.type === 'outgoing' ? (
                                <ArrowUpRight className="h-4 w-4 text-red-400" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-green-400" />
                              )}
                              <span className="font-mono text-sm">
                                {tx.value.toFixed(4)} ETH
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {tx.type}
                              </Badge>
                            </div>
                            <span className="text-xs text-slate-500">
                              {new Date(tx.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                            {tx.hash.slice(0, 20)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Anomaly Stream */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  Anomaly Detections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {recentAnomalies.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No anomalies detected</p>
                      <p className="text-sm">Anomalies will appear here when detected</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentAnomalies.map((anomaly, idx) => (
                        <div
                          key={`${anomaly.transactionId}-${idx}`}
                          className={`p-3 rounded-lg border ${
                            anomaly.isAnomaly
                              ? anomaly.anomalyScore >= 70
                                ? 'bg-red-500/10 border-red-500/30'
                                : anomaly.anomalyScore >= 40
                                ? 'bg-yellow-500/10 border-yellow-500/30'
                                : 'bg-blue-500/10 border-blue-500/30'
                              : 'bg-slate-800/50 border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {anomaly.isAnomaly ? (
                                <AlertCircle className={`h-4 w-4 ${
                                  anomaly.anomalyScore >= 70 ? 'text-red-400' :
                                  anomaly.anomalyScore >= 40 ? 'text-yellow-400' : 'text-blue-400'
                                }`} />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-400" />
                              )}
                              <span className="font-medium text-sm">
                                {anomaly.isAnomaly ? anomaly.anomalyType?.replace('_', ' ') || 'Anomaly' : 'Normal'}
                              </span>
                              {anomaly.isAnomaly && (
                                <Badge className={`text-xs ${
                                  anomaly.anomalyScore >= 70 ? 'bg-red-500/20 text-red-400' :
                                  anomaly.anomalyScore >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }`}>
                                  Score: {anomaly.anomalyScore.toFixed(0)}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">
                              {new Date(anomaly.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {anomaly.description}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span>Z-Score: {anomaly.zScore.toFixed(2)}</span>
                            <span>Confidence: {anomaly.confidence.toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Wallet Status Tab */}
        <TabsContent value="wallets">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {walletStates.length === 0 ? (
              <Card className="col-span-full bg-slate-900/50 border-slate-700">
                <CardContent className="py-12 text-center text-slate-400">
                  <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No wallets being monitored</p>
                  <p className="text-sm">Start monitoring to see wallet status</p>
                </CardContent>
              </Card>
            ) : (
              walletStates.map((state) => {
                const threatConfig = THREAT_LEVEL_CONFIG[state.threatLevel];
                return (
                  <Card 
                    key={state.walletAddress}
                    className={`border-slate-700 ${threatConfig.bgColor}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wallet className={`h-5 w-5 ${threatConfig.color}`} />
                          <CardTitle className="text-base">
                            {walletNames[state.walletAddress] || state.walletAddress.slice(0, 10)}...
                          </CardTitle>
                        </div>
                        <Badge className={`${threatConfig.bgColor} ${threatConfig.color}`}>
                          {threatConfig.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Risk Score */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-400">Risk Score</span>
                          <span className={`font-bold ${getRiskColor(state.currentRiskScore)}`}>
                            {state.currentRiskScore.toFixed(0)}
                          </span>
                        </div>
                        <Progress value={state.currentRiskScore} className="h-2" />
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-400 text-xs">Transactions</p>
                          <p className="font-bold text-cyan-400">
                            {state.recentTransactions.length}
                          </p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-400 text-xs">Anomalies</p>
                          <p className="font-bold text-yellow-400">
                            {state.activeAnomalies.length}
                          </p>
                        </div>
                      </div>

                      {/* Trend */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Trend</span>
                        <div className="flex items-center gap-1">
                          {state.trendState.direction.includes('increasing') ? (
                            <TrendingUp className="h-4 w-4 text-green-400" />
                          ) : state.trendState.direction.includes('decreasing') ? (
                            <TrendingDown className="h-4 w-4 text-red-400" />
                          ) : (
                            <Activity className="h-4 w-4 text-slate-400" />
                          )}
                          <span className="capitalize">
                            {state.trendState.direction.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Last Activity */}
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Last Activity</span>
                        <span>{new Date(state.lastUpdated).toLocaleTimeString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recent Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {recentAlerts.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No alerts yet</p>
                    <p className="text-sm">Alerts will appear here when triggered</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-lg border ${
                          alert.acknowledged
                            ? 'bg-slate-800/30 border-slate-700'
                            : alert.severity === 'critical'
                            ? 'bg-red-500/10 border-red-500/30'
                            : alert.severity === 'warning'
                            ? 'bg-yellow-500/10 border-yellow-500/30'
                            : 'bg-blue-500/10 border-blue-500/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {alert.severity === 'critical' ? (
                              <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                            ) : alert.severity === 'warning' ? (
                              <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
                            )}
                            <div>
                              <p className="font-medium">{alert.title}</p>
                              <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Wallet className="h-3 w-3" />
                                  {walletNames[alert.walletAddress] || alert.walletAddress.slice(0, 10)}...
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(alert.timestamp).toLocaleString()}
                                </span>
                                {alert.details.anomalyScore && (
                                  <span>Score: {alert.details.anomalyScore.toFixed(0)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {!alert.acknowledged && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAcknowledgeAlert(alert.id, alert.walletAddress)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sensitivity Tab */}
        <TabsContent value="sensitivity">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Preset Levels */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-cyan-400" />
                  Sensitivity Presets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(Object.keys(SENSITIVITY_PRESETS) as SensitivityLevel[]).map((level) => {
                  const display = SENSITIVITY_DISPLAY[level];
                  const preset = SENSITIVITY_PRESETS[level];
                  const isSelected = sensitivityLevel === level;

                  return (
                    <div
                      key={level}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? `${display.bgColor} border-current ${display.color}`
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => handleSensitivityChange(level)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            isSelected ? display.color.replace('text-', 'bg-') : 'bg-slate-600'
                          }`} />
                          <div>
                            <p className={`font-medium ${isSelected ? display.color : ''}`}>
                              {display.label}
                            </p>
                            <p className="text-xs text-slate-400">{display.description}</p>
                          </div>
                        </div>
                        {isSelected && <Check className={`h-5 w-5 ${display.color}`} />}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-900/50 rounded p-2">
                          <p className="text-slate-500">Threshold</p>
                          <p className="font-mono">{preset.anomalyThreshold}σ</p>
                        </div>
                        <div className="bg-slate-900/50 rounded p-2">
                          <p className="text-slate-500">Cooldown</p>
                          <p className="font-mono">{preset.alertCooldownMs / 60000}m</p>
                        </div>
                        <div className="bg-slate-900/50 rounded p-2">
                          <p className="text-slate-500">Min Conf.</p>
                          <p className="font-mono">{preset.minConfidence}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Custom Settings */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-cyan-400" />
                  Custom Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Anomaly Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Anomaly Threshold (Z-Score)</label>
                    <span className="text-sm font-mono text-cyan-400">{customThreshold.toFixed(1)}σ</span>
                  </div>
                  <Slider
                    value={[customThreshold]}
                    onValueChange={([value]) => setCustomThreshold(value)}
                    min={1}
                    max={5}
                    step={0.1}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Lower values detect more anomalies but may increase false positives
                  </p>
                </div>

                {/* Alert Cooldown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Alert Cooldown</label>
                    <span className="text-sm font-mono text-cyan-400">{customCooldown} min</span>
                  </div>
                  <Slider
                    value={[customCooldown]}
                    onValueChange={([value]) => setCustomCooldown(value)}
                    min={1}
                    max={60}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Minimum time between alerts for the same wallet
                  </p>
                </div>

                {/* Minimum Confidence */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Minimum Confidence</label>
                    <span className="text-sm font-mono text-cyan-400">{customMinConfidence}%</span>
                  </div>
                  <Slider
                    value={[customMinConfidence]}
                    onValueChange={([value]) => setCustomMinConfidence(value)}
                    min={10}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Minimum model confidence required to trigger alerts
                  </p>
                </div>

                <Button
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  onClick={handleApplyCustomSensitivity}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Apply Custom Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RealTimeMLDashboard;
