import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StreakData } from '@/types/analytics';
import { Flame, Snowflake, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  streaks: StreakData[];
  currentStreak: { type: 'win' | 'loss'; count: number } | null;
}

export const StreakAnalysis: React.FC<Props> = ({ streaks, currentStreak }) => {
  const winStreaks = streaks.filter(s => s.type === 'win').sort((a, b) => b.count - a.count);
  const lossStreaks = streaks.filter(s => s.type === 'loss').sort((a, b) => b.count - a.count);
  
  const maxWinStreak = winStreaks[0]?.count || 0;
  const maxLossStreak = lossStreaks[0]?.count || 0;
  const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b.count, 0) / winStreaks.length : 0;
  const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b.count, 0) / lossStreaks.length : 0;

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" />
          Win/Loss Streaks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current Streak */}
        {currentStreak && (
          <div className={`mb-6 p-4 rounded-lg ${currentStreak.type === 'win' ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentStreak.type === 'win' ? (
                  <Flame className="h-6 w-6 text-green-400 animate-pulse" />
                ) : (
                  <Snowflake className="h-6 w-6 text-red-400" />
                )}
                <div>
                  <p className="text-gray-400 text-xs">Current Streak</p>
                  <p className={`text-xl font-bold ${currentStreak.type === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                    {currentStreak.count} {currentStreak.type === 'win' ? 'Wins' : 'Losses'}
                  </p>
                </div>
              </div>
              {currentStreak.type === 'win' && currentStreak.count >= 5 && (
                <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded animate-pulse">HOT</span>
              )}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-green-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-green-400 font-medium">Win Streaks</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Longest</span>
                <span className="text-white font-bold">{maxWinStreak}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Average</span>
                <span className="text-white">{avgWinStreak.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-white">{winStreaks.length}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-red-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-red-400 font-medium">Loss Streaks</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Longest</span>
                <span className="text-white font-bold">{maxLossStreak}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Average</span>
                <span className="text-white">{avgLossStreak.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-white">{lossStreaks.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Streaks */}
        <h4 className="text-gray-400 text-sm mb-2">Recent Streaks</h4>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {streaks.slice(0, 10).map((streak, i) => (
            <div key={i} className={`flex items-center justify-between p-2 rounded ${streak.type === 'win' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center gap-2">
                {streak.type === 'win' ? (
                  <TrendingUp className="h-4 w-4 text-green-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
                <span className={`font-medium ${streak.type === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                  {streak.count}x {streak.type}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${streak.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {streak.totalProfit >= 0 ? '+' : ''}${streak.totalProfit.toFixed(2)}
                </p>
                <p className="text-gray-500 text-xs">{streak.startDate.toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
