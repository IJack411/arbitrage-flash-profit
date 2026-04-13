import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { 
  AlertTriangle, 
  TrendingDown, 
  Fuel, 
  Settings, 
  Bell, 
  Send, 
  Mail, 
  Globe,
  Plus,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { walletAlertService } from '@/lib/walletAlertService';
import {
  WalletAlertRule,
  AlertType,
  NotificationChannel,
  AlertSeverity,
  ALERT_TYPE_PRESETS,
  NOTIFICATION_CHANNEL_CONFIG,
  SEVERITY_CONFIG,
  CreateAlertRuleInput,
} from '@/types/walletAlerts';
import { ConnectedWallet, WalletGroup } from '@/types/multiWallet';
import { useToast } from '@/hooks/use-toast';

interface WalletAlertConfigProps {
  wallet?: ConnectedWallet;
  group?: WalletGroup;
  wallets?: ConnectedWallet[];
  onClose?: () => void;
  onSave?: () => void;
}

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

const ChannelIcon: React.FC<{ channel: NotificationChannel; className?: string }> = ({ channel, className }) => {
  const icons = {
    in_app: Bell,
    telegram: Send,
    email: Mail,
    webhook: Globe,
  };
  const Icon = icons[channel];
  return <Icon className={className} />;
};

export const WalletAlertConfig: React.FC<WalletAlertConfigProps> = ({
  wallet,
  group,
  wallets = [],
  onClose,
  onSave,
}) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<WalletAlertRule[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  
  // New rule form state
  const [newRule, setNewRule] = useState<Partial<CreateAlertRuleInput>>({
    alertType: 'low_balance',
    thresholdValue: 0.1,
    thresholdPercentage: 10,
    comparisonOperator: 'lt',
    notificationChannels: ['in_app'],
    cooldownMinutes: 60,
    config: {
      severity: 'warning',
    },
  });

  const loadRules = useCallback(() => {
    if (wallet) {
      setRules(walletAlertService.getRulesForWallet(wallet.address));
    } else if (group) {
      setRules(walletAlertService.getRulesForGroup(group.id));
    } else {
      setRules(walletAlertService.getRules());
    }
  }, [wallet, group]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = async () => {
    try {
      const targetAddress = wallet?.address || (group ? `group:${group.id}` : '');
      if (!targetAddress && !newRule.walletAddress) {
        toast({
          title: 'Error',
          description: 'Please select a wallet or group',
          variant: 'destructive',
        });
        return;
      }

      await walletAlertService.createRule({
        walletAddress: newRule.walletAddress || targetAddress,
        walletGroupId: group?.id,
        alertType: newRule.alertType!,
        thresholdValue: newRule.thresholdValue,
        thresholdPercentage: newRule.thresholdPercentage,
        comparisonOperator: newRule.comparisonOperator!,
        notificationChannels: newRule.notificationChannels!,
        cooldownMinutes: newRule.cooldownMinutes,
        config: newRule.config,
      });

      toast({
        title: 'Alert Created',
        description: 'Your alert rule has been created successfully',
      });

      loadRules();
      setIsCreating(false);
      resetNewRule();
      onSave?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create alert rule',
        variant: 'destructive',
      });
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    await walletAlertService.toggleRule(ruleId);
    loadRules();
  };

  const handleDeleteRule = async (ruleId: string) => {
    await walletAlertService.deleteRule(ruleId);
    loadRules();
    toast({
      title: 'Alert Deleted',
      description: 'Alert rule has been removed',
    });
  };

  const resetNewRule = () => {
    setNewRule({
      alertType: 'low_balance',
      thresholdValue: 0.1,
      thresholdPercentage: 10,
      comparisonOperator: 'lt',
      notificationChannels: ['in_app'],
      cooldownMinutes: 60,
      config: { severity: 'warning' },
    });
  };

  const toggleRuleExpanded = (ruleId: string) => {
    const newExpanded = new Set(expandedRules);
    if (newExpanded.has(ruleId)) {
      newExpanded.delete(ruleId);
    } else {
      newExpanded.add(ruleId);
    }
    setExpandedRules(newExpanded);
  };

  const toggleNotificationChannel = (channel: NotificationChannel) => {
    const channels = newRule.notificationChannels || [];
    if (channels.includes(channel)) {
      setNewRule({
        ...newRule,
        notificationChannels: channels.filter(c => c !== channel),
      });
    } else {
      setNewRule({
        ...newRule,
        notificationChannels: [...channels, channel],
      });
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-cyan-400" />
            Alert Configuration
            {wallet && (
              <Badge variant="outline" className="ml-2">
                {wallet.name}
              </Badge>
            )}
            {group && (
              <Badge variant="outline" className="ml-2" style={{ borderColor: group.color }}>
                {group.name}
              </Badge>
            )}
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-300">Active Rules</h3>
            <Button
              size="sm"
              onClick={() => setIsCreating(true)}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No alert rules configured</p>
              <p className="text-sm">Create a rule to start monitoring</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`border rounded-lg p-3 transition-colors ${
                    rule.isEnabled 
                      ? 'border-slate-600 bg-slate-800/50' 
                      : 'border-slate-700 bg-slate-800/30 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTypeIcon 
                        type={rule.alertType} 
                        className={`h-5 w-5 ${
                          rule.config.severity === 'critical' ? 'text-red-400' :
                          rule.config.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-sm">
                          {rule.config.name || ALERT_TYPE_PRESETS[rule.alertType].name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {rule.alertType === 'balance_change' 
                            ? `${rule.thresholdPercentage}% change`
                            : `< ${rule.thresholdValue} ETH`
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {rule.notificationChannels.map(channel => (
                          <ChannelIcon 
                            key={channel} 
                            channel={channel} 
                            className="h-4 w-4 text-slate-400"
                          />
                        ))}
                      </div>
                      <Switch
                        checked={rule.isEnabled}
                        onCheckedChange={() => handleToggleRule(rule.id)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRuleExpanded(rule.id)}
                      >
                        {expandedRules.has(rule.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {expandedRules.has(rule.id) && (
                    <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-400">Cooldown:</span>
                          <span className="ml-2">{rule.cooldownMinutes} min</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Triggered:</span>
                          <span className="ml-2">{rule.triggerCount} times</span>
                        </div>
                        {rule.lastTriggeredAt && (
                          <div className="col-span-2">
                            <span className="text-slate-400">Last triggered:</span>
                            <span className="ml-2">
                              {new Date(rule.lastTriggeredAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create New Rule Form */}
        {isCreating && (
          <div className="border border-cyan-500/30 rounded-lg p-4 bg-cyan-500/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-cyan-400">Create New Alert</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Alert Type Selection */}
            <div className="space-y-2">
              <Label>Alert Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(ALERT_TYPE_PRESETS) as AlertType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setNewRule({ 
                      ...newRule, 
                      alertType: type,
                      thresholdValue: ALERT_TYPE_PRESETS[type].defaultThreshold,
                      comparisonOperator: ALERT_TYPE_PRESETS[type].defaultOperator,
                      config: { 
                        ...newRule.config, 
                        severity: ALERT_TYPE_PRESETS[type].defaultSeverity 
                      },
                    })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      newRule.alertType === type
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTypeIcon type={type} className="h-4 w-4 text-cyan-400" />
                      <span className="font-medium text-sm">
                        {ALERT_TYPE_PRESETS[type].name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {ALERT_TYPE_PRESETS[type].description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Wallet Selection (if not already specified) */}
            {!wallet && !group && wallets.length > 0 && (
              <div className="space-y-2">
                <Label>Select Wallet</Label>
                <Select
                  value={newRule.walletAddress}
                  onValueChange={(value) => setNewRule({ ...newRule, walletAddress: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((w) => (
                      <SelectItem key={w.id} value={w.address}>
                        {w.name} ({w.address.slice(0, 6)}...{w.address.slice(-4)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Threshold Configuration */}
            <div className="space-y-2">
              <Label>
                {newRule.alertType === 'balance_change' ? 'Change Threshold (%)' : 'Balance Threshold (ETH)'}
              </Label>
              {newRule.alertType === 'balance_change' ? (
                <div className="space-y-3">
                  <Slider
                    value={[newRule.thresholdPercentage || 10]}
                    onValueChange={([value]) => setNewRule({ ...newRule, thresholdPercentage: value })}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>1%</span>
                    <span className="text-cyan-400 font-medium">
                      {newRule.thresholdPercentage}%
                    </span>
                    <span>50%</span>
                  </div>
                </div>
              ) : (
                <Input
                  type="number"
                  step="0.001"
                  value={newRule.thresholdValue}
                  onChange={(e) => setNewRule({ ...newRule, thresholdValue: parseFloat(e.target.value) })}
                  className="bg-slate-800 border-slate-600"
                />
              )}
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <Label>Severity</Label>
              <div className="flex gap-2">
                {(['info', 'warning', 'critical'] as AlertSeverity[]).map((severity) => (
                  <button
                    key={severity}
                    onClick={() => setNewRule({ 
                      ...newRule, 
                      config: { ...newRule.config, severity } 
                    })}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      newRule.config?.severity === severity
                        ? `${SEVERITY_CONFIG[severity].bgColor} ${SEVERITY_CONFIG[severity].borderColor} ${SEVERITY_CONFIG[severity].color}`
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {SEVERITY_CONFIG[severity].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification Channels */}
            <div className="space-y-2">
              <Label>Notification Channels</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(NOTIFICATION_CHANNEL_CONFIG) as NotificationChannel[]).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => toggleNotificationChannel(channel)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      newRule.notificationChannels?.includes(channel)
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <ChannelIcon channel={channel} className="h-4 w-4" />
                    {NOTIFICATION_CHANNEL_CONFIG[channel].name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cooldown */}
            <div className="space-y-2">
              <Label>Cooldown Period</Label>
              <Select
                value={String(newRule.cooldownMinutes)}
                onValueChange={(value) => setNewRule({ ...newRule, cooldownMinutes: parseInt(value) })}
              >
                <SelectTrigger className="bg-slate-800 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="360">6 hours</SelectItem>
                  <SelectItem value="720">12 hours</SelectItem>
                  <SelectItem value="1440">24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRule} className="bg-cyan-600 hover:bg-cyan-700">
                <Save className="h-4 w-4 mr-1" />
                Create Alert
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WalletAlertConfig;
