import React from 'react';
import { Notification } from '@/types/governance';
import { useGovernance } from '@/contexts/GovernanceContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, GitPullRequest, CheckCircle, AlertTriangle, GitBranch, X, Check } from 'lucide-react';

interface NotificationCenterProps {
  onClose?: () => void;
}

const typeIcons = {
  change_request: <GitPullRequest className="h-4 w-4 text-blue-400" />,
  approval_needed: <CheckCircle className="h-4 w-4 text-yellow-400" />,
  status_change: <AlertTriangle className="h-4 w-4 text-green-400" />,
  dependency_modified: <GitBranch className="h-4 w-4 text-purple-400" />,
};

const typeColors = {
  change_request: 'bg-blue-500/20 border-blue-500/30',
  approval_needed: 'bg-yellow-500/20 border-yellow-500/30',
  status_change: 'bg-green-500/20 border-green-500/30',
  dependency_modified: 'bg-purple-500/20 border-purple-500/30',
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
  const { notifications, markNotificationRead, currentUser } = useGovernance();
  
  const userNotifications = notifications.filter(n => n.userId === currentUser.id);
  const unreadCount = userNotifications.filter(n => !n.read).length;

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const markAllRead = () => {
    userNotifications.forEach(n => {
      if (!n.read) markNotificationRead(n.id);
    });
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-gray-400 hover:text-white">
              <Check className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {userNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No notifications yet</p>
            <p className="text-gray-500 text-sm mt-1">You'll be notified when features you follow are modified</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {userNotifications.map(notification => (
              <div
                key={notification.id}
                onClick={() => !notification.read && markNotificationRead(notification.id)}
                className={`p-4 cursor-pointer transition-colors hover:bg-gray-700/50 ${
                  !notification.read ? 'bg-gray-700/30' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${typeColors[notification.type]}`}>
                    {typeIcons[notification.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${notification.read ? 'text-gray-300' : 'text-white'}`}>
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-[#00F0FF] rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">{notification.message}</p>
                    <p className="text-gray-500 text-xs mt-2">{formatTime(notification.timestamp)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
