import React, { useEffect, useState } from 'react';
import { notificationService, ArbitrageNotification } from '@/lib/notificationService';
import { alertSuggestionService } from '@/lib/alertSuggestionService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Bell, Sparkles, Brain, Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export const AgentNotificationBar: React.FC = () => {
  const [notifications, setNotifications] = useState<ArbitrageNotification[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>(['Mandy', 'Arbitrage Scout']);
  const { toast } = useToast();

  useEffect(() => {
    // Initial load
    setNotifications(notificationService.getHistory().filter(n => !n.read).slice(0, 3));

    // Subscribe to new notifications
    const unsub = notificationService.subscribe((history) => {
      const unread = history.filter(n => !n.read).slice(0, 3);
      setNotifications(unread);
      if (unread.length > 0) {
        setIsVisible(true);
      }
    });

    return () => unsub();
  }, []);

  const handleApplySuggestion = async (e: React.MouseEvent, n: ArbitrageNotification) => {
    e.stopPropagation();
    if (!n.suggestionId) return;

    try {
      const success = await alertSuggestionService.applySuggestion(n.suggestionId);
      if (success) {
        toast({
          title: "Suggestion Applied",
          description: "Agent recommendation has been implemented.",
        });
        notificationService.markAsRead(n.id);
      } else {
        toast({
          title: "Failed to Apply",
          description: "Could not implement the suggestion at this time.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred while applying suggestion.",
        variant: "destructive",
      });
    }
  };

  if (!isVisible && notifications.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 flex items-center gap-2">
        <button 
          onClick={() => setIsVisible(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all flex items-center gap-2"
        >
          <Brain className="w-5 h-5" />
          <span className="text-xs font-bold px-1">Agents Active</span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-blue-500/30 p-2 z-50 transition-all transform",
      isVisible ? "translate-y-0" : "translate-y-full"
    )}>
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Agent Status */}
        <div className="flex items-center gap-3 border-r border-gray-800 pr-4">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center border-2 border-gray-900" title="Mandy">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center border-2 border-gray-900" title="Arbitrage Scout">
              <Search className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-[10px] text-gray-400 uppercase font-bold">Background Swarm</div>
            <div className="text-xs text-blue-400 font-medium">Running Simulations...</div>
          </div>
        </div>

        {/* Latest Suggestions */}
        <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar py-1">
          {notifications.length > 0 ? (
            notifications.map((n) => (
              <div 
                key={n.id} 
                className="bg-gray-800/50 border border-gray-700 rounded px-3 py-1 flex items-center gap-2 min-w-[200px] hover:bg-gray-800 transition-colors cursor-pointer group relative"
                onClick={() => notificationService.markAsRead(n.id)}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  n.type === 'opportunity' ? "bg-green-500" : n.type === 'warning' ? "bg-yellow-500" : "bg-blue-500"
                )} />
                <div className="flex flex-col pr-8">
                  <span className="text-[10px] font-bold text-gray-300 truncate leading-tight">{n.title}</span>
                  <span className="text-[11px] text-gray-400 truncate leading-tight">{n.message}</span>
                </div>
                
                {n.suggestionId && (
                  <Button
                    size="icon"
                    className="absolute right-1 w-6 h-6 bg-blue-500 hover:bg-blue-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleApplySuggestion(e, n)}
                    title="Apply Recommendation"
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-500 italic flex items-center gap-2">
              <Activity className="w-3 h-3 animate-pulse" />
              Monitoring market state and project health for improvements...
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 pl-4 border-l border-gray-800">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-gray-400 hover:text-white"
            onClick={() => setIsVisible(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
