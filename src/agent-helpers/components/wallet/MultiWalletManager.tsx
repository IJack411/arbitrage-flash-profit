import React, { useState } from 'react';
import { useMultiWallet } from '@/agent-helpers/contexts/MultiWalletContext';
import { WalletCard } from './WalletCard';
import { WalletSelector } from './WalletSelector';
import { WalletPerformanceTracker } from './WalletPerformanceTracker';
import { WalletAlertDashboard } from './WalletAlertDashboard';
import { 
  WalletTradingLimits, 
  WalletConnectionType, 
  WalletStrategyConfig,
  WalletNetworkConfig,
  CONNECTION_TYPES, 
  WALLET_COLORS,
  STRATEGY_INFO,
  NETWORK_INFO,
  TradingStrategy,
  NetworkDesignation,
} from '@/agent-helpers/types/multiWallet';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Wallet,
  Plus,
  RefreshCw,
  TrendingUp,
  PieChart,
  Layers,
  Bot,
  Settings,
  FolderPlus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Activity,
  Target,
  Network,
  Zap,
  Shield,
  BarChart3,
  Tag,
  FileText,
  Bell,
  Brain,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';



export const MultiWalletManager: React.FC = () => {
  const {
    wallets,
    groups,
    activeWallet,
    portfolio,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    setActiveWallet,
    setPrimaryWallet,
    updateWalletName,
    updateTradingLimits,
    updateWalletStrategies,
    updateWalletNetworks,
    setWalletPurpose,
    updateWalletTags,
    updateWalletNotes,
    createGroup,
    deleteGroup,
    addWalletToGroup,
    removeWalletFromGroup,
    allocateBot,
    deallocateBot,
    refreshBalances,
    clearError,
  } = useMultiWallet();

  const { toast } = useToast();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [showBotsModal, setShowBotsModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [tempLimits, setTempLimits] = useState<WalletTradingLimits | null>(null);
  const [tempStrategies, setTempStrategies] = useState<WalletStrategyConfig[]>([]);
  const [tempNetworks, setTempNetworks] = useState<WalletNetworkConfig[]>([]);
  const [tempPurpose, setTempPurpose] = useState<'trading' | 'holding' | 'testing' | 'gas-reserve'>('trading');
  const [tempTags, setTempTags] = useState<string[]>([]);
  const [tempNotes, setTempNotes] = useState('');
  const [newTag, setNewTag] = useState('');
  const [activeTab, setActiveTab] = useState('wallets');

  // Mock bots for allocation
  const mockBots = [
    { id: 'bot-1', name: 'ETH Arbitrage Bot', status: 'running' },
    { id: 'bot-2', name: 'Multi-Chain Scanner', status: 'paused' },
    { id: 'bot-3', name: 'Flash Loan Hunter', status: 'stopped' },
  ];

  const handleConnect = async (type: WalletConnectionType) => {
    try {
      await connectWallet(type);
      setShowConnectModal(false);
      toast({ title: 'Wallet Connected', description: 'Successfully connected wallet' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast({ title: 'Connection Failed', description: message, variant: 'destructive' });
    }
  };

  const handleConfigureLimits = (walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet) {
      setSelectedWalletId(walletId);
      setTempLimits({ ...wallet.tradingLimits });
      setShowLimitsModal(true);
    }
  };

  const handleSaveLimits = () => {
    if (selectedWalletId && tempLimits) {
      updateTradingLimits(selectedWalletId, tempLimits);
      setShowLimitsModal(false);
      toast({ title: 'Limits Updated', description: 'Trading limits saved successfully' });
    }
  };

  const handleManageBots = (walletId: string) => {
    setSelectedWalletId(walletId);
    setShowBotsModal(true);
  };

  const handleConfigureStrategy = (walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet) {
      setSelectedWalletId(walletId);
      setTempStrategies(wallet.strategyConfigs || []);
      setTempNetworks(wallet.networkConfigs || []);
      setTempPurpose(wallet.designatedPurpose || 'trading');
      setTempTags(wallet.tags || []);
      setTempNotes(wallet.notes || '');
      setShowStrategyModal(true);
    }
  };

  const handleSaveStrategy = () => {
    if (selectedWalletId) {
      updateWalletStrategies(selectedWalletId, tempStrategies);
      updateWalletNetworks(selectedWalletId, tempNetworks);
      setWalletPurpose(selectedWalletId, tempPurpose);
      updateWalletTags(selectedWalletId, tempTags);
      updateWalletNotes(selectedWalletId, tempNotes);
      setShowStrategyModal(false);
      toast({ title: 'Configuration Saved', description: 'Wallet strategy and network settings updated' });
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tempTags.includes(newTag.trim())) {
      setTempTags([...tempTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTempTags(tempTags.filter(t => t !== tag));
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      createGroup(newGroupName, newGroupDescription);
      setNewGroupName('');
      setNewGroupDescription('');
      setShowGroupModal(false);
      toast({ title: 'Group Created', description: `Created group "${newGroupName}"` });
    }
  };

  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  const purposeColors = {
    trading: 'bg-green-500/20 text-green-400 border-green-500',
    holding: 'bg-blue-500/20 text-blue-400 border-blue-500',
    testing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
    'gas-reserve': 'bg-purple-500/20 text-purple-400 border-purple-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Wallet className="h-7 w-7 text-[#00F0FF]" />
            Multi-Wallet Manager
          </h2>
          <p className="text-gray-400 mt-1">
            Manage multiple wallets, set trading limits, and allocate strategies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WalletSelector 
            onConnectNew={() => setShowConnectModal(true)}
            showBalance={true}
            showPerformance={true}
          />
          <Button
            variant="outline"
            onClick={refreshBalances}
            className="border-gray-600"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowGroupModal(true)}
            className="border-gray-600"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            New Group
          </Button>
          <Button
            onClick={() => setShowConnectModal(true)}
            className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900"
          >
            <Plus className="h-4 w-4 mr-2" />
            Connect Wallet
          </Button>
        </div>
      </div>

      {/* Tabs for different views */}
      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="wallets" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <Wallet className="h-4 w-4 mr-2" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <BarChart3 className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="strategies" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <Target className="h-4 w-4 mr-2" />
            Strategies
          </TabsTrigger>
        </TabsList>


        <TabsContent value="wallets" className="space-y-6 mt-6">
          {/* Portfolio Summary */}
          {portfolio && (
            <Card className="bg-gradient-to-r from-gray-800 to-gray-900 border-gray-700">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                  <div>
                    <p className="text-gray-400 text-sm">Total Portfolio Value</p>
                    <p className="text-3xl font-bold text-white">
                      ${portfolio.totalBalanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    <div className={`flex items-center gap-1 text-sm ${portfolio.dailyChangePercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      <TrendingUp className={`h-4 w-4 ${portfolio.dailyChangePercentage < 0 ? 'rotate-180' : ''}`} />
                      {portfolio.dailyChangePercentage >= 0 ? '+' : ''}{portfolio.dailyChangePercentage.toFixed(2)}% today
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Connected Wallets</p>
                    <p className="text-3xl font-bold text-[#00F0FF]">{portfolio.totalWallets}</p>
                    <p className="text-sm text-gray-500">{portfolio.activeWallets} active</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Tokens</p>
                    <p className="text-3xl font-bold text-purple-400">{portfolio.totalTokens}</p>
                    <p className="text-sm text-gray-500">across all wallets</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Wallet Groups</p>
                    <p className="text-3xl font-bold text-yellow-400">{groups.length}</p>
                    <p className="text-sm text-gray-500">organized groups</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Daily Change</p>
                    <p className={`text-3xl font-bold ${portfolio.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {portfolio.dailyChange >= 0 ? '+' : ''}${Math.abs(portfolio.dailyChange).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Network & Token Breakdown */}
                <div className="grid md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-gray-700">
                  <div>
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-[#00F0FF]" />
                      Network Distribution
                    </h4>
                    <div className="space-y-2">
                      {portfolio.networkBreakdown.map(item => (
                        <div key={item.network} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-300">{item.network}</span>
                              <span className="text-gray-400">{item.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#00F0FF] rounded-full"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-white font-medium w-24 text-right">
                            ${item.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-purple-400" />
                      Top Tokens
                    </h4>
                    <div className="space-y-2">
                      {portfolio.tokenBreakdown.slice(0, 5).map(item => (
                        <div key={item.symbol} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-300">{item.symbol}</span>
                              <span className="text-gray-400">{item.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-white font-medium w-24 text-right">
                            ${item.balanceUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wallet Groups */}
          {groups.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Wallet Groups</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {groups.map(group => {
                  const groupWallets = wallets.filter(w => w.groupId === group.id);
                  const totalBalance = groupWallets.reduce((sum, w) => sum + w.balanceUSD, 0);
                  return (
                    <Card key={group.id} className="bg-gray-800 border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            <h4 className="text-white font-semibold">{group.name}</h4>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteGroup(group.id)}
                            className="text-gray-400 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {group.description && (
                          <p className="text-gray-400 text-sm mb-3">{group.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-sm">{groupWallets.length} wallets</span>
                          <span className="text-white font-semibold">
                            ${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connected Wallets */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">
              Connected Wallets ({wallets.length})
            </h3>
            {wallets.length === 0 ? (
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="py-12 text-center">
                  <Wallet className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Wallets Connected</h3>
                  <p className="text-gray-400 mb-4">Connect your first wallet to get started</p>
                  <Button
                    onClick={() => setShowConnectModal(true)}
                    className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Wallet
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wallets.map(wallet => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    groups={groups}
                    isActive={activeWallet?.id === wallet.id}
                    onSelect={() => setActiveWallet(wallet.id)}
                    onSetPrimary={() => setPrimaryWallet(wallet.id)}
                    onDisconnect={() => disconnectWallet(wallet.id)}
                    onRename={(name) => updateWalletName(wallet.id, name)}
                    onAddToGroup={(groupId) => addWalletToGroup(wallet.id, groupId)}
                    onRemoveFromGroup={() => removeWalletFromGroup(wallet.id)}
                    onConfigureLimits={() => handleConfigureLimits(wallet.id)}
                    onManageBots={() => handleManageBots(wallet.id)}
                    onConfigureStrategy={() => handleConfigureStrategy(wallet.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <WalletPerformanceTracker />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <WalletAlertDashboard />
        </TabsContent>

        <TabsContent value="strategies" className="mt-6 space-y-6">
          {/* Strategy Overview */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(STRATEGY_INFO).map(([key, info]) => {
              const strategy = key as TradingStrategy;
              const walletsWithStrategy = wallets.filter(w => 
                w.strategyConfigs?.some(s => s.strategy === strategy && s.isEnabled)
              );
              return (
                <Card key={key} className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-[#00F0FF]" />
                        <h4 className="text-white font-semibold">{info.name}</h4>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          info.riskLevel === 'Low' ? 'border-green-500 text-green-400' :
                          info.riskLevel === 'Medium' ? 'border-yellow-500 text-yellow-400' :
                          'border-red-500 text-red-400'
                        }`}
                      >
                        {info.riskLevel} Risk
                      </Badge>
                    </div>
                    <p className="text-gray-400 text-sm mb-3">{info.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{walletsWithStrategy.length} wallets assigned</span>
                      <div className="flex -space-x-2">
                        {walletsWithStrategy.slice(0, 3).map(w => (
                          <div
                            key={w.id}
                            className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-800 flex items-center justify-center"
                            title={w.name}
                          >
                            <span className="text-xs text-white">{w.name.charAt(0)}</span>
                          </div>
                        ))}
                        {walletsWithStrategy.length > 3 && (
                          <div className="w-6 h-6 rounded-full bg-gray-600 border-2 border-gray-800 flex items-center justify-center">
                            <span className="text-xs text-white">+{walletsWithStrategy.length - 3}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Network Overview */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Network Assignments</h3>
            <div className="grid md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.entries(NETWORK_INFO).filter(([key]) => key !== 'all').map(([key, info]) => {
                const network = key as NetworkDesignation;
                const walletsOnNetwork = wallets.filter(w => 
                  w.networkConfigs?.some(n => n.network === network && n.isEnabled)
                );
                return (
                  <Card 
                    key={key} 
                    className="bg-gray-800 border-gray-700 hover:border-gray-600 transition-colors"
                  >
                    <CardContent className="p-3 text-center">
                      <div 
                        className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center"
                        style={{ backgroundColor: `${info.color}20` }}
                      >
                        <Network className="h-4 w-4" style={{ color: info.color }} />
                      </div>
                      <p className="text-white text-sm font-medium">{info.name}</p>
                      <p className="text-gray-400 text-xs mt-1">{walletsOnNetwork.length} wallets</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* Connect Wallet Modal */}
      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Connect Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {CONNECTION_TYPES.map(conn => (
              <button
                key={conn.type}
                onClick={() => handleConnect(conn.type)}
                disabled={isConnecting}
                className="w-full flex items-center gap-4 p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="text-2xl">{conn.icon}</span>
                <span className="text-white font-medium">{conn.name}</span>
                {isConnecting && (
                  <RefreshCw className="h-4 w-4 text-gray-400 animate-spin ml-auto" />
                )}
              </button>
            ))}
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Trading Limits Modal */}
      <Dialog open={showLimitsModal} onOpenChange={setShowLimitsModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#00F0FF]" />
              Trading Limits - {selectedWallet?.name}
            </DialogTitle>
          </DialogHeader>
          {tempLimits && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">Enable Trading</Label>
                  <p className="text-gray-400 text-sm">Allow this wallet to execute trades</p>
                </div>
                <Switch
                  checked={tempLimits.isEnabled}
                  onCheckedChange={(checked) => setTempLimits({ ...tempLimits, isEnabled: checked })}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Max Daily Trades</Label>
                  <Input
                    type="number"
                    value={tempLimits.maxDailyTrades}
                    onChange={(e) => setTempLimits({ ...tempLimits, maxDailyTrades: parseInt(e.target.value) || 0 })}
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Max Concurrent Trades</Label>
                  <Input
                    type="number"
                    value={tempLimits.maxConcurrentTrades}
                    onChange={(e) => setTempLimits({ ...tempLimits, maxConcurrentTrades: parseInt(e.target.value) || 0 })}
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Max Trade Size ($)</Label>
                  <Input
                    type="number"
                    value={tempLimits.maxTradeSize}
                    onChange={(e) => setTempLimits({ ...tempLimits, maxTradeSize: parseInt(e.target.value) || 0 })}
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-white">Max Daily Volume ($)</Label>
                  <Input
                    type="number"
                    value={tempLimits.maxDailyVolume}
                    onChange={(e) => setTempLimits({ ...tempLimits, maxDailyVolume: parseInt(e.target.value) || 0 })}
                    className="bg-gray-700 border-gray-600 text-white mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-white">Stop Loss Percentage: {tempLimits.stopLossPercentage}%</Label>
                <Slider
                  value={[tempLimits.stopLossPercentage]}
                  onValueChange={([val]) => setTempLimits({ ...tempLimits, stopLossPercentage: val })}
                  max={20}
                  step={0.5}
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="text-white">Daily Loss Limit ($)</Label>
                <Input
                  type="number"
                  value={tempLimits.dailyLossLimit}
                  onChange={(e) => setTempLimits({ ...tempLimits, dailyLossLimit: parseInt(e.target.value) || 0 })}
                  className="bg-gray-700 border-gray-600 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-white mb-2 block">Allowed Networks</Label>
                <div className="flex flex-wrap gap-2">
                  {['ethereum', 'polygon', 'arbitrum', 'bsc', 'optimism', 'avalanche'].map(network => (
                    <Badge
                      key={network}
                      variant={tempLimits.allowedNetworks.includes(network) ? 'default' : 'outline'}
                      className={`cursor-pointer ${tempLimits.allowedNetworks.includes(network) ? 'bg-[#00F0FF] text-gray-900' : 'border-gray-600 text-gray-400'}`}
                      onClick={() => {
                        const networks = tempLimits.allowedNetworks.includes(network)
                          ? tempLimits.allowedNetworks.filter(n => n !== network)
                          : [...tempLimits.allowedNetworks, network];
                        setTempLimits({ ...tempLimits, allowedNetworks: networks });
                      }}
                    >
                      {network}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-white mb-2 block">Allowed DEXes</Label>
                <div className="flex flex-wrap gap-2">
                  {['uniswap', 'sushiswap', 'pancakeswap', 'curve', 'balancer', '1inch'].map(dex => (
                    <Badge
                      key={dex}
                      variant={tempLimits.allowedDexes.includes(dex) ? 'default' : 'outline'}
                      className={`cursor-pointer ${tempLimits.allowedDexes.includes(dex) ? 'bg-purple-500 text-white' : 'border-gray-600 text-gray-400'}`}
                      onClick={() => {
                        const dexes = tempLimits.allowedDexes.includes(dex)
                          ? tempLimits.allowedDexes.filter(d => d !== dex)
                          : [...tempLimits.allowedDexes, dex];
                        setTempLimits({ ...tempLimits, allowedDexes: dexes });
                      }}
                    >
                      {dex}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitsModal(false)} className="border-gray-600">
              Cancel
            </Button>
            <Button onClick={handleSaveLimits} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              Save Limits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strategy Configuration Modal */}
      <Dialog open={showStrategyModal} onOpenChange={setShowStrategyModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5 text-[#00F0FF]" />
              Strategy & Network Configuration - {selectedWallet?.name}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="strategies" className="mt-4">
            <TabsList className="bg-gray-700">
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="networks">Networks</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="strategies" className="space-y-4 mt-4">
              <p className="text-gray-400 text-sm">Enable and configure trading strategies for this wallet</p>
              {tempStrategies.map((strategy, index) => (
                <div
                  key={strategy.strategy}
                  className={`p-4 rounded-lg border ${strategy.isEnabled ? 'bg-gray-700/50 border-[#00F0FF]/50' : 'bg-gray-800 border-gray-700'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={strategy.isEnabled}
                        onCheckedChange={(checked) => {
                          const updated = [...tempStrategies];
                          updated[index] = { ...strategy, isEnabled: checked };
                          setTempStrategies(updated);
                        }}
                      />
                      <div>
                        <h4 className="text-white font-medium">{STRATEGY_INFO[strategy.strategy].name}</h4>
                        <p className="text-gray-400 text-xs">{STRATEGY_INFO[strategy.strategy].description}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${
                        strategy.riskLevel === 'low' ? 'border-green-500 text-green-400' :
                        strategy.riskLevel === 'medium' ? 'border-yellow-500 text-yellow-400' :
                        'border-red-500 text-red-400'
                      }`}
                    >
                      {strategy.riskLevel} risk
                    </Badge>
                  </div>
                  {strategy.isEnabled && (
                    <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-600">
                      <div>
                        <Label className="text-gray-400 text-xs">Max Allocation (%)</Label>
                        <Slider
                          value={[strategy.maxAllocation]}
                          onValueChange={([val]) => {
                            const updated = [...tempStrategies];
                            updated[index] = { ...strategy, maxAllocation: val };
                            setTempStrategies(updated);
                          }}
                          max={100}
                          step={5}
                          className="mt-2"
                        />
                        <span className="text-white text-sm">{strategy.maxAllocation}%</span>
                      </div>
                      <div>
                        <Label className="text-gray-400 text-xs">Priority</Label>
                        <Select
                          value={String(strategy.priority)}
                          onValueChange={(val) => {
                            const updated = [...tempStrategies];
                            updated[index] = { ...strategy, priority: parseInt(val) };
                            setTempStrategies(updated);
                          }}
                        >
                          <SelectTrigger className="bg-gray-700 border-gray-600 text-white mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            {[1, 2, 3, 4, 5].map(p => (
                              <SelectItem key={p} value={String(p)} className="text-white">
                                Priority {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="networks" className="space-y-4 mt-4">
              <p className="text-gray-400 text-sm">Configure which networks this wallet can operate on</p>
              <div className="grid md:grid-cols-2 gap-3">
                {tempNetworks.map((network, index) => (
                  <div
                    key={network.network}
                    className={`p-4 rounded-lg border ${network.isEnabled ? 'bg-gray-700/50 border-[#00F0FF]/50' : 'bg-gray-800 border-gray-700'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={network.isEnabled}
                          onCheckedChange={(checked) => {
                            const updated = [...tempNetworks];
                            updated[index] = { ...network, isEnabled: checked };
                            setTempNetworks(updated);
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: `${NETWORK_INFO[network.network].color}20` }}
                          >
                            <Network className="h-3 w-3" style={{ color: NETWORK_INFO[network.network].color }} />
                          </div>
                          <span className="text-white font-medium">{NETWORK_INFO[network.network].name}</span>
                        </div>
                      </div>
                    </div>
                    {network.isEnabled && (
                      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-600">
                        <div>
                          <Label className="text-gray-400 text-xs">Gas Multiplier</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={network.gasLimitMultiplier}
                            onChange={(e) => {
                              const updated = [...tempNetworks];
                              updated[index] = { ...network, gasLimitMultiplier: parseFloat(e.target.value) || 1 };
                              setTempNetworks(updated);
                            }}
                            className="bg-gray-700 border-gray-600 text-white mt-1 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Priority Fee (Gwei)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={network.priorityFeeGwei}
                            onChange={(e) => {
                              const updated = [...tempNetworks];
                              updated[index] = { ...network, priorityFeeGwei: parseFloat(e.target.value) || 0 };
                              setTempNetworks(updated);
                            }}
                            className="bg-gray-700 border-gray-600 text-white mt-1 h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div>
                <Label className="text-white">Wallet Purpose</Label>
                <Select value={tempPurpose} onValueChange={(val) => setTempPurpose(val as 'trading' | 'holding' | 'testing' | 'gas-reserve')}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="trading" className="text-white">Trading - Active trading operations</SelectItem>
                    <SelectItem value="holding" className="text-white">Holding - Long-term asset storage</SelectItem>
                    <SelectItem value="testing" className="text-white">Testing - Development and testing</SelectItem>
                    <SelectItem value="gas-reserve" className="text-white">Gas Reserve - Gas fee funding</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white">Tags</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add a tag..."
                    className="bg-gray-700 border-gray-600 text-white"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  />
                  <Button onClick={handleAddTag} variant="outline" className="border-gray-600">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {tempTags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="border-gray-600 text-gray-300 cursor-pointer hover:border-red-500 hover:text-red-400"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                      <span className="ml-1">×</span>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-white">Notes</Label>
                <Textarea
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="Add notes about this wallet..."
                  className="bg-gray-700 border-gray-600 text-white mt-1 min-h-[100px]"
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowStrategyModal(false)} className="border-gray-600">
              Cancel
            </Button>
            <Button onClick={handleSaveStrategy} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bot Allocation Modal */}
      <Dialog open={showBotsModal} onOpenChange={setShowBotsModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-400" />
              Bot Allocation - {selectedWallet?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {mockBots.map(bot => {
              const isAllocated = selectedWallet?.allocatedBots.includes(bot.id);
              return (
                <div
                  key={bot.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    isAllocated ? 'bg-purple-900/20 border-purple-500' : 'bg-gray-700 border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bot className={`h-5 w-5 ${isAllocated ? 'text-purple-400' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-white font-medium">{bot.name}</p>
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          bot.status === 'running' ? 'border-green-500 text-green-400' :
                          bot.status === 'paused' ? 'border-yellow-500 text-yellow-400' :
                          'border-gray-500 text-gray-400'
                        }`}
                      >
                        {bot.status}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={isAllocated}
                    onCheckedChange={(checked) => {
                      if (selectedWalletId) {
                        if (checked) {
                          allocateBot(selectedWalletId, bot.id);
                        } else {
                          deallocateBot(selectedWalletId, bot.id);
                        }
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBotsModal(false)} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Modal */}
      <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-yellow-400" />
              Create Wallet Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white">Group Name</Label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Trading Wallets"
                className="bg-gray-700 border-gray-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-white">Description (optional)</Label>
              <Input
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="e.g., Wallets used for active trading"
                className="bg-gray-700 border-gray-600 text-white mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupModal(false)} className="border-gray-600">
              Cancel
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900"
            >
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
