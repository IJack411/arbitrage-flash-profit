import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  BellRing,
  X, 
  Check,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  Settings,
  Trash2,
  Clock,
  Server,
  Wallet,
  TrendingUp,
  DollarSign,
  Shield,
  User,
} from 'lucide-react';
import { 
  adminAlertService, 
  AdminAlert, 
  AlertType, 
  AlertSeverity 
} from '@/lib/adminAlertService';

interface AdminNotificationBellProps {
  onOpenSettings?: () => void;
}

export const AdminNotificationBell: React.FC<AdminNotificationBellProps> = ({ 
  onOpenSettings 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | AlertSeverity>('all');
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevUnreadCount = useRef(unreadCount);

  useEffect(() => {
    // Initial load
    setAlerts(adminAlertService.getActiveAlerts());
    setUnreadCount(adminAlertService.getUnreadCount());

    // Subscribe to updates
    const unsubscribe = adminAlertService.subscribe((updatedAlerts) => {
      setAlerts(updatedAlerts);
      const newUnreadCount = adminAlertService.getUnreadCount();
      
      // Animate bell if new alerts
      if (newUnreadCount > prevUnreadCount.current) {
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 1000);
      }
      
      setUnreadCount(newUnreadCount);
      prevUnreadCount.current = newUnreadCount;
    });

    return () => unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getAlertIcon = (type: AlertType) => {
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

  const getSeverityStyles = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-500/20',
          border: 'border-red-500/50',
          text: 'text-red-400',
          icon: <AlertTriangle className="h-4 w-4 text-red-400" />,
        };
      case 'warning':
        return {
          bg: 'bg-yellow-500/20',
          border: 'border-yellow-500/50',
          text: 'text-yellow-400',
          icon: <AlertCircle className="h-4 w-4 text-yellow-400" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-500/20',
          border: 'border-blue-500/50',
          text: 'text-blue-400',
          icon: <Info className="h-4 w-4 text-blue-400" />,
        };
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !alert.isRead;
    return alert.severity === filter;
  });

  const handleMarkAsRead = (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    adminAlertService.markAsRead(alertId);
  };

  const handleDismiss = (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    adminAlertService.dismissAlert(alertId);
  };

  const handleMarkAllAsRead = () => {
    adminAlertService.markAllAsRead();
  };

  const handleDismissAll = () => {
    adminAlertService.dismissAllAlerts();
  };

  const handleAlertClick = (alert: AdminAlert) => {
    if (!alert.isRead) {
      adminAlertService.markAsRead(alert.id);
    }
    if (alert.actionUrl) {
      // Navigate to action URL
      window.location.href = alert.actionUrl;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        className={`relative h-10 w-10 rounded-full ${isAnimating ? 'animate-pulse' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {unreadCount > 0 ? (
          <BellRing className={`h-5 w-5 text-[#00F0FF] ${isAnimating ? 'animate-bounce' : ''}`} />
        ) : (
          <Bell className="h-5 w-5 text-gray-400" />
        )}
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <Badge 
              className="relative h-5 min-w-5 flex items-center justify-center bg-red-500 text-white text-xs px-1.5 rounded-full"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-700 bg-gray-800/95">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#00F0FF]" />
                Notifications
              </h3>
              <div className="flex items-center gap-2">
                {onOpenSettings && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenSettings();
                    }}
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1">
              {(['all', 'unread', 'critical', 'warning', 'info'] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'ghost'}
                  size="sm"
                  className={`text-xs h-7 ${
                    filter === f 
                      ? 'bg-[#00F0FF] text-gray-900' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                  onClick={() => setFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === 'unread' && unreadCount > 0 && (
                    <span className="ml-1 text-xs">({unreadCount})</span>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Alert List */}
          <ScrollArea className="h-[400px]">
            {filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {filteredAlerts.map((alert) => {
                  const styles = getSeverityStyles(alert.severity);
                  return (
                    <div
                      key={alert.id}
                      className={`p-4 hover:bg-gray-700/50 cursor-pointer transition-colors ${
                        !alert.isRead ? 'bg-gray-700/30' : ''
                      }`}
                      onClick={() => handleAlertClick(alert)}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <div className={`flex-shrink-0 p-2 rounded-lg ${styles.bg}`}>
                          {getAlertIcon(alert.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className={`text-sm font-medium ${
                                !alert.isRead ? 'text-white' : 'text-gray-300'
                              }`}>
                                {alert.title}
                              </h4>
                              {!alert.isRead && (
                                <span className="h-2 w-2 rounded-full bg-[#00F0FF]" />
                              )}
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${styles.text} ${styles.border}`}
                            >
                              {alert.severity}
                            </Badge>
                          </div>
                          
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {alert.message}
                          </p>

                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(alert.timestamp)}
                              <span className="text-gray-600">•</span>
                              <span>{alert.source}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              {alert.actionUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = alert.actionUrl!;
                                  }}
                                >
                                  <ExternalLink className="h-3 w-3 text-gray-400" />
                                </Button>
                              )}
                              {!alert.isRead && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => handleMarkAsRead(alert.id, e)}
                                >
                                  <Check className="h-3 w-3 text-gray-400" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => handleDismiss(alert.id, e)}
                              >
                                <Trash2 className="h-3 w-3 text-gray-400" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {filteredAlerts.length > 0 && (
            <div className="p-3 border-t border-gray-700 bg-gray-800/95 flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-white"
                onClick={handleMarkAllAsRead}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all as read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-red-400"
                onClick={handleDismissAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Dismiss all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
