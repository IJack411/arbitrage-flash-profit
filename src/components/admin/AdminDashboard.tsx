import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Users, 
  Wallet, 
  DollarSign, 
  Activity,
  Server,
  RefreshCw,
  BarChart3,
  Settings,
  AlertTriangle,
  TrendingUp,
  Clock,
  Bell,
  Zap,
  History,
} from 'lucide-react';
import { PlatformStatsCard } from './PlatformStatsCard';
import { SystemHealthPanel } from './SystemHealthPanel';
import { UserManagementPanel } from './UserManagementPanel';
import { WalletManagementPanel } from './WalletManagementPanel';
import { FeeConfigPanel } from './FeeConfigPanel';
import { AdminNotificationBell } from './AdminNotificationBell';
import { AlertConfigPanel } from './AlertConfigPanel';
import { AutomatedResponsePanel } from './AutomatedResponsePanel';
import { AuditLogPanel } from './AuditLogPanel';
import { adminService, PlatformStats, SystemHealth } from '@/lib/adminService';
import { adminAlertService } from '@/lib/adminAlertService';
import { automatedResponseService } from '@/lib/automatedResponseService';
import { useToast } from '@/hooks/use-toast';

export const AdminDashboard: React.FC = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [automationStats, setAutomationStats] = useState({
    totalRules: 0,
    activeRules: 0,
    totalTriggers: 0,
  });

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    
    // Subscribe to alert updates
    const unsubscribeAlerts = adminAlertService.subscribe(() => {
      setUnreadAlertCount(adminAlertService.getUnreadCount());
    });
    
    // Subscribe to rule updates
    const unsubscribeRules = automatedResponseService.subscribeToRules((rules) => {
      setAutomationStats({
        totalRules: rules.length,
        activeRules: rules.filter(r => r.enabled).length,
        totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
      });
    });
    
    // Initial counts
    setUnreadAlertCount(adminAlertService.getUnreadCount());
    const rules = automatedResponseService.getRules();
    setAutomationStats({
      totalRules: rules.length,
      activeRules: rules.filter(r => r.enabled).length,
      totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
    });
    
    return () => {
      clearInterval(interval);
      unsubscribeAlerts();
      unsubscribeRules();
    };
  }, []);

  const loadData = () => {
    const newStats = adminService.getPlatformStats();
    const newHealth = adminService.getSystemHealth();
    
    setStats(newStats);
    setHealth(newHealth);
    setLastRefresh(new Date());
    
    // Check for health degradation and trigger alerts
    if (newHealth.status !== 'healthy') {
      const existingHealthAlerts = adminAlertService.getAlertsByType('system_health');
      const recentHealthAlert = existingHealthAlerts.find(
        a => new Date(a.timestamp).getTime() > Date.now() - 5 * 60 * 1000
      );
      
      if (!recentHealthAlert) {
        adminAlertService.triggerAlert({
          type: 'system_health',
          severity: newHealth.status === 'critical' ? 'critical' : 'warning',
          title: `System Health ${newHealth.status.toUpperCase()}`,
          message: `System health has degraded to ${newHealth.status} status. Check services for issues.`,
          source: 'Health Monitor',
          actionUrl: '/admin?tab=health',
          actionLabel: 'View System Health',
        });
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Data Refreshed', description: 'Dashboard data has been updated' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#00F0FF] to-purple-500 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            Admin Dashboard
          </h2>
          <p className="text-gray-400 mt-1">
            Platform management and monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Notification Bell */}
          <AdminNotificationBell onOpenSettings={() => setShowAlertConfig(true)} />
          
          <div className="text-right">
            <p className="text-xs text-gray-400">Last updated</p>
            <p className="text-sm text-gray-300">{lastRefresh.toLocaleTimeString()}</p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            className="border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert Summary Banner */}
      {unreadAlertCount > 0 && (
        <Card className="bg-gradient-to-r from-[#00F0FF]/10 to-purple-500/10 border-[#00F0FF]/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#00F0FF]/20 rounded-lg">
                <Bell className="h-5 w-5 text-[#00F0FF]" />
              </div>
              <div>
                <p className="text-white font-medium">
                  You have {unreadAlertCount} unread notification{unreadAlertCount > 1 ? 's' : ''}
                </p>
                <p className="text-gray-400 text-sm">
                  Click the bell icon to view and manage alerts
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-[#00F0FF] text-[#00F0FF] hover:bg-[#00F0FF]/10"
              onClick={() => setShowAlertConfig(true)}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure Alerts
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      {stats && <PlatformStatsCard stats={stats} />}

      {/* System Health Alert */}
      {health && health.status !== 'healthy' && (
        <Card className={`border ${
          health.status === 'critical' ? 'bg-red-900/20 border-red-500' : 'bg-yellow-900/20 border-yellow-500'
        }`}>
          <CardContent className="p-4 flex items-center gap-4">
            <AlertTriangle className={`h-6 w-6 ${
              health.status === 'critical' ? 'text-red-400' : 'text-yellow-400'
            }`} />
            <div>
              <p className={`font-semibold ${
                health.status === 'critical' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                System Status: {health.status.toUpperCase()}
              </p>
              <p className="text-gray-400 text-sm">
                Some services may be experiencing issues. Check the System Health tab for details.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700 flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-[#00F0FF] data-[state=active]:text-gray-900">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-gray-700">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="wallets" className="data-[state=active]:bg-gray-700">
            <Wallet className="h-4 w-4 mr-2" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="fees" className="data-[state=active]:bg-gray-700">
            <DollarSign className="h-4 w-4 mr-2" />
            Fees
          </TabsTrigger>
          <TabsTrigger value="health" className="data-[state=active]:bg-gray-700">
            <Server className="h-4 w-4 mr-2" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-gray-700 relative">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
            {unreadAlertCount > 0 && (
              <Badge className="ml-2 h-5 min-w-5 bg-red-500 text-white text-xs px-1.5">
                {unreadAlertCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="automation" className="data-[state=active]:bg-purple-600">
            <Zap className="h-4 w-4 mr-2" />
            Automation
            <Badge className="ml-2 h-5 min-w-5 bg-purple-500/50 text-purple-200 text-xs px-1.5">
              {automationStats.activeRules}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="audit" className="data-[state=active]:bg-gray-700">
            <History className="h-4 w-4 mr-2" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Automation Summary Card */}
          <Card className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <Zap className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Automated Responses</p>
                  <p className="text-gray-400 text-sm">
                    {automationStats.activeRules} active rules | {automationStats.totalTriggers} total triggers
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
                onClick={() => setActiveTab('automation')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure Rules
              </Button>
            </CardContent>
          </Card>

          {/* Trading Volume Chart Placeholder */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  Trading Volume (7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-end justify-between gap-2">
                  {Array.from({ length: 7 }, (_, i) => {
                    const height = 30 + Math.random() * 70;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-gradient-to-t from-[#00F0FF] to-purple-500 rounded-t"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-xs text-gray-400">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#00F0FF]" />
                  Fee Collection (7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-end justify-between gap-2">
                  {Array.from({ length: 7 }, (_, i) => {
                    const height = 20 + Math.random() * 80;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-xs text-gray-400">
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-400" />
                Recent Platform Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { action: 'New user registered', user: 'user45@example.com', time: '2 min ago', type: 'user' },
                  { action: 'Trade executed', user: '0x1234...5678', time: '5 min ago', type: 'trade' },
                  { action: 'Wallet connected', user: '0xabcd...efgh', time: '8 min ago', type: 'wallet' },
                  { action: 'Fee collected', user: '$12.50', time: '12 min ago', type: 'fee' },
                  { action: 'Auto-suspended wallet', user: '0x7a3b...9f2c', time: '14 min ago', type: 'automation' },
                  { action: 'User upgraded to Pro', user: 'user32@example.com', time: '15 min ago', type: 'upgrade' },
                  { action: 'Trade executed', user: '0x9876...4321', time: '18 min ago', type: 'trade' },
                  { action: 'Wallet flagged', user: '0xflag...risk', time: '25 min ago', type: 'alert' },
                ].map((activity, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        activity.type === 'user' ? 'bg-blue-500/20' :
                        activity.type === 'trade' ? 'bg-green-500/20' :
                        activity.type === 'wallet' ? 'bg-purple-500/20' :
                        activity.type === 'fee' ? 'bg-[#00F0FF]/20' :
                        activity.type === 'upgrade' ? 'bg-yellow-500/20' :
                        activity.type === 'automation' ? 'bg-purple-500/20' :
                        'bg-red-500/20'
                      }`}>
                        {activity.type === 'user' && <Users className="h-4 w-4 text-blue-400" />}
                        {activity.type === 'trade' && <TrendingUp className="h-4 w-4 text-green-400" />}
                        {activity.type === 'wallet' && <Wallet className="h-4 w-4 text-purple-400" />}
                        {activity.type === 'fee' && <DollarSign className="h-4 w-4 text-[#00F0FF]" />}
                        {activity.type === 'upgrade' && <TrendingUp className="h-4 w-4 text-yellow-400" />}
                        {activity.type === 'automation' && <Zap className="h-4 w-4 text-purple-400" />}
                        {activity.type === 'alert' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      </div>
                      <div>
                        <p className="text-white text-sm">{activity.action}</p>
                        <p className="text-gray-400 text-xs font-mono">{activity.user}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400 text-xs">
                      <Clock className="h-3 w-3" />
                      {activity.time}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-400" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Button variant="outline" className="border-gray-600 h-auto py-4 flex-col gap-2">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span className="text-sm">Export Users</span>
                </Button>
                <Button variant="outline" className="border-gray-600 h-auto py-4 flex-col gap-2">
                  <Wallet className="h-5 w-5 text-purple-400" />
                  <span className="text-sm">Export Wallets</span>
                </Button>
                <Button variant="outline" className="border-gray-600 h-auto py-4 flex-col gap-2">
                  <DollarSign className="h-5 w-5 text-[#00F0FF]" />
                  <span className="text-sm">Fee Report</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="border-gray-600 h-auto py-4 flex-col gap-2"
                  onClick={() => setShowAlertConfig(true)}
                >
                  <Bell className="h-5 w-5 text-yellow-400" />
                  <span className="text-sm">Alert Settings</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="border-purple-500/50 h-auto py-4 flex-col gap-2"
                  onClick={() => setActiveTab('automation')}
                >
                  <Zap className="h-5 w-5 text-purple-400" />
                  <span className="text-sm">Automation</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <UserManagementPanel />
        </TabsContent>

        {/* Wallets Tab */}
        <TabsContent value="wallets">
          <WalletManagementPanel />
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees">
          <FeeConfigPanel />
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="health">
          {health && (
            <SystemHealthPanel health={health} onRefresh={handleRefresh} />
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <AlertsTabContent onOpenSettings={() => setShowAlertConfig(true)} />
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation">
          <AutomatedResponsePanel onViewAuditLog={() => setActiveTab('audit')} />
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <AuditLogPanel />
        </TabsContent>
      </Tabs>

      {/* Alert Configuration Modal */}
      <AlertConfigPanel 
        isOpen={showAlertConfig} 
        onClose={() => setShowAlertConfig(false)} 
      />
    </div>
  );
};

// Alerts Tab Content Component
const AlertsTabContent: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const [alerts, setAlerts] = useState(adminAlertService.getActiveAlerts());
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  useEffect(() => {
    const unsubscribe = adminAlertService.subscribe((updatedAlerts) => {
      setAlerts(updatedAlerts);
    });
    return () => unsubscribe();
  }, []);

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(a => a.severity === filter);

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400' };
      case 'warning':
        return { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400' };
      default:
        return { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400' };
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">Alert History</h3>
          <div className="flex gap-2">
            {(['all', 'critical', 'warning', 'info'] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                className={filter === f ? 'bg-[#00F0FF] text-gray-900' : 'border-gray-600'}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-600"
            onClick={() => adminAlertService.markAllAsRead()}
          >
            Mark All Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[#00F0FF] text-[#00F0FF]"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No alerts to display</p>
            </CardContent>
          </Card>
        ) : (
          filteredAlerts.map((alert) => {
            const styles = getSeverityStyles(alert.severity);
            return (
              <Card 
                key={alert.id} 
                className={`bg-gray-800 border-gray-700 ${!alert.isRead ? 'ring-1 ring-[#00F0FF]/30' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${styles.bg}`}>
                        <AlertTriangle className={`h-5 w-5 ${styles.text}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-white">{alert.title}</h4>
                          {!alert.isRead && (
                            <span className="h-2 w-2 rounded-full bg-[#00F0FF]" />
                          )}
                          <Badge variant="outline" className={`${styles.text} ${styles.border}`}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm mb-2">{alert.message}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(alert.timestamp)}
                          </span>
                          <span>Source: {alert.source}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!alert.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => adminAlertService.markAsRead(alert.id)}
                        >
                          Mark Read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => adminAlertService.dismissAlert(alert.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
