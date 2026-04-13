import React from 'react';
import { TradingBot } from '@/types/tradingBot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Settings, Trash2, Activity, TrendingUp, Clock, Zap } from 'lucide-react';

interface BotStatusCardProps {
  bot: TradingBot;
  onToggle: (id: string, status: 'running' | 'stopped' | 'paused') => void;
  onEdit: (bot: TradingBot) => void;
  onDelete: (id: string) => void;
  onViewLogs: (id: string) => void;
}

export const BotStatusCard: React.FC<BotStatusCardProps> = ({ bot, onToggle, onEdit, onDelete, onViewLogs }) => {
  const statusColors = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    paused: 'bg-yellow-500',
    error: 'bg-red-500'
  };

  const successRate = bot.total_trades > 0 ? ((bot.successful_trades / bot.total_trades) * 100).toFixed(1) : '0';
  const avgProfit = bot.successful_trades > 0 ? (bot.total_profit / bot.successful_trades).toFixed(2) : '0';

  return (
    <Card className="bg-gray-800 border-gray-700 hover:border-gray-600 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${statusColors[bot.status]} ${bot.status === 'running' ? 'animate-pulse' : ''}`} />
            <CardTitle className="text-white text-lg">{bot.name}</CardTitle>
          </div>
          <Badge variant={bot.status === 'running' ? 'default' : 'secondary'} className={bot.status === 'running' ? 'bg-green-500/20 text-green-400' : ''}>
            {bot.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <TrendingUp className="h-3 w-3" /> Total Profit
            </div>
            <p className={`text-lg font-bold ${bot.total_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${bot.total_profit.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Activity className="h-3 w-3" /> Success Rate
            </div>
            <p className="text-lg font-bold text-[#00F0FF]">{successRate}%</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Zap className="h-3 w-3" /> Trades Today
            </div>
            <p className="text-lg font-bold text-white">{bot.trades_today}/{bot.daily_trade_limit}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Clock className="h-3 w-3" /> Avg Profit
            </div>
            <p className="text-lg font-bold text-purple-400">${avgProfit}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {bot.token_pairs.slice(0, 3).map(pair => (
            <Badge key={pair} variant="outline" className="text-xs border-gray-600 text-gray-300">{pair}</Badge>
          ))}
          {bot.token_pairs.length > 3 && (
            <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">+{bot.token_pairs.length - 3}</Badge>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-700">
          {bot.status === 'running' ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onToggle(bot.id, 'paused')} className="flex-1 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10">
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
              <Button size="sm" variant="outline" onClick={() => onToggle(bot.id, 'stopped')} className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10">
                <Square className="h-4 w-4 mr-1" /> Stop
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => onToggle(bot.id, 'running')} className="flex-1 bg-green-600 hover:bg-green-700">
              <Play className="h-4 w-4 mr-1" /> Start
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onViewLogs(bot.id)} className="text-gray-400 hover:text-white">
            <Activity className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(bot)} className="text-gray-400 hover:text-white">
            <Settings className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(bot.id)} className="text-gray-400 hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
