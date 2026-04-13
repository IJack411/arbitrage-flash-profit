import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Settings,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Mail,
  MessageSquare,
  AlertTriangle,
  AlertCircle,
  Info,
  Server,
  Wallet,
  TrendingUp,
  DollarSign,
  Shield,
  User,
  Save,
  RotateCcw,
  Clock,
  Zap,
  TestTube,
} from 'lucide-react';
import { 
  adminAlertService, 
  AlertThreshold, 
  AlertConfig,
  AlertType,
  AlertSeverity,
} from '@/lib/adminAlertService';
import { useToast } from '@/hooks/use-toast';

interface AlertConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertConfigPanel: React.FC<AlertConfigPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const { toast } = useToast();
  const [config, setConfig] = useState<AlertConfig>(adminAlertService.getConfig());
  const [thresholds, setThresholds] = useState<AlertThreshold[]>(adminAlertService.getThresholds());
  const [hasChanges, setHasChanges] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(adminAlertService.getConfig());
      setThresholds(adminAlertService.getThresholds());
      setHasChanges(false);
    }
  }, [isOpen]);

  const getAlertTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'system_health':
      case 'service_degraded':
        return <Server className="h-4 w-4" />;
      case 'high_risk_wallet':
        return <Wallet className="h-4 w-4" />;
      case 'unusual_trading':
        return <TrendingUp className="h-4 w-4" />;
      case 'fee_collection_failed':
        return <DollarSign className="h-4 w-4" />;
      case 'security_breach':
        return <Shield className="h-4 w-4" />;
      case 'user_flagged':
        return <User className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
    }
  };

  const handleThresholdChange = (id: string, field: keyof AlertThreshold, value: AlertThreshold[keyof AlertThreshold]) => {
    setThresholds(prev => prev.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
    setHasChanges(true);
  };

  const handleNotificationPrefChange = (
    field: keyof AlertConfig['notificationPreferences'],
    value: AlertConfig['notificationPreferences'][keyof AlertConfig['notificationPreferences']]
  ) => {
    setConfig(prev => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Update all thresholds
    thresholds.forEach(t => {
      adminAlertService.updateThreshold(t.id, t);
    });

    // Update notification preferences
    adminAlertService.updateNotificationPreferences(config.notificationPreferences);

    toast({
      title: 'Settings Saved',
      description: 'Alert configuration has been updated successfully.',
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    setConfig(adminAlertService.getConfig());
    setThresholds(adminAlertService.getThresholds());
    setHasChanges(false);
    toast({
      title: 'Settings Reset',
      description: 'Alert configuration has been reset to current values.',
    });
  };

  const handleTestAlert = () => {
    setTestingAlert(true);
    
    adminAlertService.triggerAlert({
      type: 'system_health',
      severity: 'info',
      title: 'Test Alert',
      message: 'This is a test notification to verify your alert settings are working correctly.',
      source: 'Alert Configuration',
    });

    setTimeout(() => {
      setTestingAlert(false);
      toast({
        title: 'Test Alert Sent',
        description: 'Check your notification bell for the test alert.',
      });
    }, 500);
  };

  const handleRequestPermission = async () => {
    const permission = await adminAlertService.requestBrowserNotificationPermission();
    if (permission === 'granted') {
      toast({
        title: 'Permission Granted',
        description: 'Browser notifications are now enabled.',
      });
    } else {
      toast({
        title: 'Permission Denied',
        description: 'Browser notifications were not enabled.',
        variant: 'destructive',
      });
    }
  };

  const groupedThresholds = thresholds.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<AlertType, AlertThreshold[]>);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] bg-gray-800 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#00F0FF]" />
            Alert Configuration
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="thresholds" className="flex-1">
          <TabsList className="bg-gray-700 border border-gray-600">
            <TabsTrigger value="thresholds" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
              <Zap className="h-4 w-4 mr-2" />
              Thresholds
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-gray-600">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Thresholds Tab */}
          <TabsContent value="thresholds" className="mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-6">
                {Object.entries(groupedThresholds).map(([type, items]) => (
                  <Card key={type} className="bg-gray-700/50 border-gray-600">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-white flex items-center gap-2">
                        {getAlertTypeIcon(type as AlertType)}
                        {type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {items.map((threshold) => (
                        <div 
                          key={threshold.id} 
                          className="p-4 bg-gray-800/50 rounded-lg border border-gray-600"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={threshold.enabled}
                                onCheckedChange={(checked) => 
                                  handleThresholdChange(threshold.id, 'enabled', checked)
                                }
                              />
                              <div>
                                <p className="text-sm font-medium text-white">{threshold.name}</p>
                                <p className="text-xs text-gray-400">{threshold.description}</p>
                              </div>
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`${getSeverityColor(threshold.severity)} border-current`}
                            >
                              {threshold.severity}
                            </Badge>
                          </div>

                          {threshold.enabled && (
                            <div className="grid grid-cols-3 gap-4 mt-4">
                              {/* Threshold Value */}
                              <div>
                                <Label className="text-xs text-gray-400">Threshold</Label>
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    type="number"
                                    value={threshold.threshold}
                                    onChange={(e) => 
                                      handleThresholdChange(threshold.id, 'threshold', parseFloat(e.target.value))
                                    }
                                    className="h-8 bg-gray-700 border-gray-600 text-white"
                                  />
                                  <span className="text-xs text-gray-400 whitespace-nowrap">
                                    {threshold.unit}
                                  </span>
                                </div>
                              </div>

                              {/* Severity */}
                              <div>
                                <Label className="text-xs text-gray-400">Severity</Label>
                                <Select
                                  value={threshold.severity}
                                  onValueChange={(value) => 
                                    handleThresholdChange(threshold.id, 'severity', value as AlertSeverity)
                                  }
                                >
                                  <SelectTrigger className="h-8 mt-1 bg-gray-700 border-gray-600 text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-gray-700 border-gray-600">
                                    <SelectItem value="info">Info</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Cooldown */}
                              <div>
                                <Label className="text-xs text-gray-400">Cooldown (min)</Label>
                                <div className="flex items-center gap-2 mt-1">
                                  <Input
                                    type="number"
                                    value={threshold.cooldownMinutes}
                                    onChange={(e) => 
                                      handleThresholdChange(threshold.id, 'cooldownMinutes', parseInt(e.target.value))
                                    }
                                    className="h-8 bg-gray-700 border-gray-600 text-white"
                                    min={1}
                                  />
                                  <Clock className="h-4 w-4 text-gray-400" />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-4">
            <div className="space-y-6">
              {/* Sound Settings */}
              <Card className="bg-gray-700/50 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    {config.notificationPreferences.soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-green-400" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-gray-400" />
                    )}
                    Sound Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300">Play sound on new alerts</p>
                      <p className="text-xs text-gray-500">A short beep will play when new alerts arrive</p>
                    </div>
                    <Switch
                      checked={config.notificationPreferences.soundEnabled}
                      onCheckedChange={(checked) => 
                        handleNotificationPrefChange('soundEnabled', checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Browser Notifications */}
              <Card className="bg-gray-700/50 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    {config.notificationPreferences.browserNotifications ? (
                      <Bell className="h-4 w-4 text-green-400" />
                    ) : (
                      <BellOff className="h-4 w-4 text-gray-400" />
                    )}
                    Browser Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300">Show browser notifications</p>
                      <p className="text-xs text-gray-500">Desktop notifications even when tab is not active</p>
                    </div>
                    <Switch
                      checked={config.notificationPreferences.browserNotifications}
                      onCheckedChange={(checked) => 
                        handleNotificationPrefChange('browserNotifications', checked)
                      }
                    />
                  </div>
                  
                  {'Notification' in window && Notification.permission !== 'granted' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#00F0FF] text-[#00F0FF]"
                      onClick={handleRequestPermission}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Enable Browser Notifications
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Email Alerts */}
              <Card className="bg-gray-700/50 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300">Send email for critical alerts</p>
                      <p className="text-xs text-gray-500">Receive email notifications for critical severity alerts</p>
                    </div>
                    <Switch
                      checked={config.notificationPreferences.emailAlerts}
                      onCheckedChange={(checked) => 
                        handleNotificationPrefChange('emailAlerts', checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Webhook Integrations */}
              <Card className="bg-gray-700/50 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Webhook Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-gray-400">Slack Webhook URL</Label>
                    <Input
                      placeholder="https://hooks.slack.com/services/..."
                      value={config.notificationPreferences.slackWebhook || ''}
                      onChange={(e) => 
                        handleNotificationPrefChange('slackWebhook', e.target.value)
                      }
                      className="mt-1 bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">Discord Webhook URL</Label>
                    <Input
                      placeholder="https://discord.com/api/webhooks/..."
                      value={config.notificationPreferences.discordWebhook || ''}
                      onChange={(e) => 
                        handleNotificationPrefChange('discordWebhook', e.target.value)
                      }
                      className="mt-1 bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Test Alert */}
              <Card className="bg-gray-700/50 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Test Notifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-300">Send a test alert</p>
                      <p className="text-xs text-gray-500">Verify your notification settings are working</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#00F0FF] text-[#00F0FF]"
                      onClick={handleTestAlert}
                      disabled={testingAlert}
                    >
                      {testingAlert ? (
                        <>
                          <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Send Test Alert
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 flex justify-between">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges}
            className="border-gray-600"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-gray-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              className="bg-[#00F0FF] text-gray-900 hover:bg-[#00D4E0]"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
