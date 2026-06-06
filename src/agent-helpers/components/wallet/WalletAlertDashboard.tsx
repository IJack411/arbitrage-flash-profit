import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { 
  Bell, 
  BellOff,
  AlertTriangle, 
  TrendingDown, 
  Fuel, 
  Settings,
  Check,
  CheckCheck,
  Clock,
  Wallet,
  Activity,
  RefreshCw,
  Trash2,
  Brain,
  Cpu,
  Radio,
  GraduationCap,
  Calendar,
} from 'lucide-react';
import { walletAlertService } from '@/agent-helpers/lib/walletAlertService';
import { useMultiWallet } from '@/agent-helpers/contexts/MultiWalletContext';
import {
  WalletAlertRule,
  WalletAlertHistory,
  WalletAlertSummary,
  AlertNotification,
  AlertType,
  ALERT_TYPE_PRESETS,
  SEVERITY_CONFIG,
} from '@/agent-helpers/types/walletAlerts';
import { WalletAlertConfig } from './WalletAlertConfig';
import { AlertSuggestionPanel } from './AlertSuggestionPanel';
import { MLInsightsPanel } from './MLInsightsPanel';
import { RealTimeMLDashboard } from './RealTimeMLDashboard';
import { HistoricalTrainingDashboard } from './HistoricalTrainingDashboard';
import { ScheduledTrainingDashboard } from './ScheduledTrainingDashboard';
import { alertSuggestionService } from '@/agent-helpers/lib/alertSuggestionService';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PreTrainedModelState } from '@/agent-helpers/types/historicalTraining';


const AlertTypeIcon: React.FC<{ type: AlertType; className?: string }> = ({ type, className }) => {
  const icons = {
    low_balance: AlertTriangle,
    balance_change: TrendingDown,
    gas_reserve: Fuel,
    custom: Settings,
  };
  const Icon = icons[type];
  return <Icon className={className} />;
};



export const WalletAlertDashboard: React.FC = () => {
  const { toast } = useToast();
  const { wallets, groups } = useMultiWallet();
  const [summary, setSummary] = useState<WalletAlertSummary | null>(null);
  const [rules, setRules] = useState<WalletAlertRule[]>([]);
  const [history, setHistory] = useState<WalletAlertHistory[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<AlertType | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
    
    // Subscribe to notifications
    const unsubscribe = walletAlertService.subscribe((newNotifications) => {
      setNotifications(newNotifications);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isMonitoring && wallets.length > 0) {
      walletAlertService.startMonitoring(wallets);
    } else {
      walletAlertService.stopMonitoring();
    }

    return () => walletAlertService.stopMonitoring();
  }, [isMonitoring, wallets]);

  const loadData = () => {
    setSummary(walletAlertService.getSummary());
    setRules(walletAlertService.getRules());
    setHistory(walletAlertService.getHistory());
    setNotifications(walletAlertService.getNotifications());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    for (const wallet of wallets) {
      await walletAlertService.checkWallet(wallet);
    }
    loadData();
    setIsRefreshing(false);
    toast({
      title: 'Alerts Refreshed',
      description: 'All wallets have been checked for alert conditions',
    });
  };

  const handleAcknowledge = async (historyId: string) => {
    await walletAlertService.acknowledgeAlert(historyId);
    loadData();
  };

  const handleAcknowledgeAll = async () => {
    const unacknowledged = history.filter(h => !h.acknowledged);
    for (const h of unacknowledged) {
      await walletAlertService.acknowledgeAlert(h.id);
    }
    loadData();
    toast({
      title: 'All Acknowledged',
      description: `${unacknowledged.length} alerts have been acknowledged`,
    });
  };

  const handleMarkAllRead = () => {
    walletAlertService.markAllNotificationsRead();
    loadData();
  };

  const handleClearNotifications = () => {
    walletAlertService.clearNotifications();
    loadData();
  };

  const filteredHistory = filterType === 'all' 
    ? history 
    : history.filter(h => h.alertType === filterType);

  const selectedWallet = selectedWalletId 
    ? wallets.find(w => w.id === selectedWalletId) 
    : undefined;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Create wallet names map for RealTimeMLDashboard
  const walletNamesMap = wallets.reduce((acc, w) => {
    acc[w.address.toLowerCase()] = w.name;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total Rules</p>
                <p className="text-2xl font-bold text-white">{summary?.totalRules || 0}</p>
              </div>
              <Settings className="h-8 w-8 text-slate-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Active Rules</p>
                <p className="text-2xl font-bold text-cyan-400">{summary?.activeRules || 0}</p>
              </div>
              <Bell className="h-8 w-8 text-cyan-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Triggered Today</p>
                <p className="text-2xl font-bold text-yellow-400">{summary?.triggeredToday || 0}</p>
              </div>
              <Activity className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Unacknowledged</p>
                <p className="text-2xl font-bold text-orange-400">{summary?.unacknowledged || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Critical</p>
                <p className="text-2xl font-bold text-red-400">{summary?.criticalAlerts || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Warnings</p>
                <p className="text-2xl font-bold text-yellow-400">{summary?.warningAlerts || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={isMonitoring}
                  onCheckedChange={setIsMonitoring}
                  id="monitoring"
                />
                <label htmlFor="monitoring" className="text-sm font-medium cursor-pointer">
                  {isMonitoring ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <Activity className="h-4 w-4 animate-pulse" />
                      Monitoring Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400">
                      <BellOff className="h-4 w-4" />
                      Monitoring Paused
                    </span>
                  )}
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Check Now
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedWalletId(null);
                  setShowConfigModal(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Settings className="h-4 w-4 mr-1" />
                Configure Alerts
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList className="bg-slate-800 flex-wrap">
          <TabsTrigger value="notifications" className="relative">
            Notifications
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Alert History</TabsTrigger>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
          <TabsTrigger value="suggestions" className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            AI Suggestions
          </TabsTrigger>
          <TabsTrigger value="ml-insights" className="flex items-center gap-1">
            <Cpu className="h-4 w-4" />
            ML Insights
          </TabsTrigger>
          <TabsTrigger value="realtime-ml" className="flex items-center gap-1">
            <Radio className="h-4 w-4" />
            Real-Time ML
          </TabsTrigger>
          <TabsTrigger value="historical-training" className="flex items-center gap-1">
            <GraduationCap className="h-4 w-4" />
            Train Model
          </TabsTrigger>
          <TabsTrigger value="scheduled-training" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Scheduled
          </TabsTrigger>
        </TabsList>


        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Recent Notifications</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Mark All Read
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearNotifications}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {notifications.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No notifications yet</p>
                    <p className="text-sm">Alerts will appear here when triggered</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          notification.isRead
                            ? 'bg-slate-800/30 border-slate-700'
                            : `${SEVERITY_CONFIG[notification.severity].bgColor} ${SEVERITY_CONFIG[notification.severity].borderColor}`
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <AlertTypeIcon
                              type={notification.alertType}
                              className={`h-5 w-5 mt-0.5 ${SEVERITY_CONFIG[notification.severity].color}`}
                            />
                            <div>
                              <p className={`font-medium ${notification.isRead ? 'text-slate-300' : 'text-white'}`}>
                                {notification.title}
                              </p>
                              <p className="text-sm text-slate-400 mt-1">
                                {notification.message}
                              </p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Wallet className="h-3 w-3" />
                                  {notification.walletName || notification.walletAddress.slice(0, 10)}...
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(notification.timestamp).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => walletAlertService.markNotificationRead(notification.id)}
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

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Alert History</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                    <Button
                      variant={filterType === 'all' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setFilterType('all')}
                    >
                      All
                    </Button>
                    {(Object.keys(ALERT_TYPE_PRESETS) as AlertType[]).map((type) => (
                      <Button
                        key={type}
                        variant={filterType === type ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setFilterType(type)}
                      >
                        <AlertTypeIcon type={type} className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                  {summary && summary.unacknowledged > 0 && (
                    <Button variant="outline" size="sm" onClick={handleAcknowledgeAll}>
                      <CheckCheck className="h-4 w-4 mr-1" />
                      Acknowledge All
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No alert history</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredHistory.map((item) => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border ${
                          item.acknowledged
                            ? 'bg-slate-800/30 border-slate-700'
                            : `${SEVERITY_CONFIG[item.metadata.severity || 'warning'].bgColor} ${SEVERITY_CONFIG[item.metadata.severity || 'warning'].borderColor}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertTypeIcon
                              type={item.alertType}
                              className={`h-5 w-5 ${SEVERITY_CONFIG[item.metadata.severity || 'warning'].color}`}
                            />
                            <div>
                              <p className="font-medium text-sm">{item.message}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                <span>{item.metadata.walletName || item.walletAddress.slice(0, 10)}...</span>
                                <span>{new Date(item.triggeredAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.acknowledged ? (
                              <Badge variant="outline" className="text-green-400 border-green-500/30">
                                <Check className="h-3 w-3 mr-1" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAcknowledge(item.id)}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Acknowledge
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Alert Rules</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedWalletId(null);
                    setShowConfigModal(true);
                  }}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Settings className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No alert rules configured</p>
                  <p className="text-sm">Create rules to monitor your wallets</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const wallet = wallets.find(w => 
                      w.address.toLowerCase() === rule.walletAddress.toLowerCase()
                    );
                    return (
                      <div
                        key={rule.id}
                        className={`p-4 rounded-lg border ${
                          rule.isEnabled
                            ? 'bg-slate-800/50 border-slate-600'
                            : 'bg-slate-800/20 border-slate-700 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertTypeIcon
                              type={rule.alertType}
                              className={`h-6 w-6 ${
                                rule.config.severity === 'critical' ? 'text-red-400' :
                                rule.config.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                              }`}
                            />
                            <div>
                              <p className="font-medium">
                                {rule.config.name || ALERT_TYPE_PRESETS[rule.alertType].name}
                              </p>
                              <p className="text-sm text-slate-400">
                                {wallet?.name || rule.walletAddress.slice(0, 10)}... • 
                                {rule.alertType === 'balance_change'
                                  ? ` ${rule.thresholdPercentage}% change`
                                  : ` < ${rule.thresholdValue} ETH`
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-slate-400">
                              {rule.triggerCount} triggers
                            </Badge>
                            <Switch
                              checked={rule.isEnabled}
                              onCheckedChange={() => walletAlertService.toggleRule(rule.id).then(loadData)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Wallet Tab */}
        <TabsContent value="wallets">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.length === 0 ? (
              <Card className="col-span-full bg-slate-900/50 border-slate-700">
                <CardContent className="py-12 text-center text-slate-400">
                  <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No wallets connected</p>
                  <p className="text-sm">Connect a wallet to configure alerts</p>
                </CardContent>
              </Card>
            ) : (
              wallets.map((wallet) => {
                const walletRules = walletAlertService.getRulesForWallet(wallet.address);
                const walletHistory = walletAlertService.getHistoryForWallet(wallet.address, 5);
                const activeRules = walletRules.filter(r => r.isEnabled).length;
                const recentAlerts = walletHistory.filter(h => !h.acknowledged).length;

                return (
                  <Card key={wallet.id} className="bg-slate-900/50 border-slate-700">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-5 w-5 text-cyan-400" />
                          <CardTitle className="text-base">{wallet.name}</CardTitle>
                        </div>
                        <Badge variant="outline">
                          {parseFloat(wallet.balance).toFixed(4)} ETH
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-400 text-xs">Active Rules</p>
                          <p className="font-bold text-cyan-400">{activeRules}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2">
                          <p className="text-slate-400 text-xs">Pending Alerts</p>
                          <p className={`font-bold ${recentAlerts > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                            {recentAlerts}
                          </p>
                        </div>
                      </div>

                      {walletHistory.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400">Recent Alerts</p>
                          {walletHistory.slice(0, 3).map((h) => (
                            <div
                              key={h.id}
                              className="flex items-center gap-2 text-xs p-2 bg-slate-800/30 rounded"
                            >
                              <AlertTypeIcon
                                type={h.alertType}
                                className={`h-3 w-3 ${SEVERITY_CONFIG[h.metadata.severity || 'warning'].color}`}
                              />
                              <span className="truncate flex-1">{h.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedWalletId(wallet.id);
                          setShowConfigModal(true);
                        }}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configure Alerts
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* AI Suggestions Tab */}
        <TabsContent value="suggestions">
          <AlertSuggestionPanel />
        </TabsContent>

        {/* ML Insights Tab */}
        <TabsContent value="ml-insights">
          {wallets.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No wallets connected</p>
                <p className="text-sm">Connect a wallet to run ML analysis</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="bg-slate-900/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm text-slate-400">Select wallet for ML analysis:</span>
                    <div className="flex gap-2 flex-wrap">
                      {wallets.map((wallet) => (
                        <Button
                          key={wallet.id}
                          variant={selectedWalletId === wallet.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedWalletId(wallet.id)}
                          className={selectedWalletId === wallet.id ? 'bg-cyan-600' : ''}
                        >
                          <Wallet className="h-4 w-4 mr-1" />
                          {wallet.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedWallet ? (
                <MLInsightsPanel
                  walletAddress={selectedWallet.address}
                  walletName={selectedWallet.name}
                  balanceHistory={alertSuggestionService.getAnalysis(selectedWallet.address)?.balanceHistory || []}
                  transactions={alertSuggestionService.getAnalysis(selectedWallet.address)?.transactionHistory || []}
                  gasHistory={alertSuggestionService.getAnalysis(selectedWallet.address)?.gasHistory || []}
                  onRecommendationApply={(rec) => {
                    toast({
                      title: 'Recommendation Applied',
                      description: `Applied: ${rec.title}`,
                    });
                    loadData();
                  }}
                />
              ) : (
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardContent className="py-12 text-center text-slate-400">
                    <Cpu className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a wallet above to view ML insights</p>
                    <p className="text-sm mt-2">
                      First, run "Analyze Wallets" in the AI Suggestions tab to collect data
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Real-Time ML Tab */}
        <TabsContent value="realtime-ml">
          {wallets.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <Radio className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No wallets connected</p>
                <p className="text-sm">Connect a wallet to enable real-time ML monitoring</p>
              </CardContent>
            </Card>
          ) : (
            <RealTimeMLDashboard
              walletAddresses={wallets.map(w => w.address)}
              walletNames={walletNamesMap}
            />
          )}
        </TabsContent>

        {/* Historical Training Tab */}
        <TabsContent value="historical-training">
          <HistoricalTrainingDashboard
            walletAddress={selectedWallet?.address}
            onModelTrained={(model) => {
              toast({
                title: 'Model Training Complete',
                description: `Trained model for ${model.walletAddress.slice(0, 10)}... with ${model.metadata.transactionsProcessed} transactions`,
              });
            }}
          />
        </TabsContent>

        {/* Scheduled Training Tab */}
        <TabsContent value="scheduled-training">
          <ScheduledTrainingDashboard
            walletAddresses={wallets.map(w => w.address)}
            walletNames={walletNamesMap}
          />
        </TabsContent>
      </Tabs>




      {/* Config Modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Configure Wallet Alerts</DialogTitle>
          </DialogHeader>
          <WalletAlertConfig
            wallet={selectedWallet}
            wallets={wallets}
            onClose={() => setShowConfigModal(false)}
            onSave={() => {
              loadData();
              setShowConfigModal(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WalletAlertDashboard;
