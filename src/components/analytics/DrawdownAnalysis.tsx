import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DrawdownPeriod } from '@/types/analytics';
import { TrendingDown, Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface Props {
  drawdowns: DrawdownPeriod[];
  maxDrawdown: number;
  avgDrawdown: number;
}

export const DrawdownAnalysis: React.FC<Props> = ({ drawdowns, maxDrawdown, avgDrawdown }) => {
  const sortedDrawdowns = [...drawdowns].sort((a, b) => b.drawdownPercent - a.drawdownPercent);
  const top5 = sortedDrawdowns.slice(0, 5);
  
  const getSeverityColor = (dd: number) => {
    if (dd >= 20) return 'text-red-500';
    if (dd >= 10) return 'text-orange-400';
    if (dd >= 5) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getSeverityBg = (dd: number) => {
    if (dd >= 20) return 'bg-red-500/20';
    if (dd >= 10) return 'bg-orange-500/20';
    if (dd >= 5) return 'bg-yellow-500/20';
    return 'bg-green-500/20';
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-400" />
          Drawdown Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Max Drawdown</p>
            <p className="text-red-400 text-2xl font-bold">-{maxDrawdown.toFixed(2)}%</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">Avg Drawdown</p>
            <p className="text-orange-400 text-2xl font-bold">-{avgDrawdown.toFixed(2)}%</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4 text-center">
            <p className="text-gray-400 text-xs mb-1">DD Periods</p>
            <p className="text-white text-2xl font-bold">{drawdowns.length}</p>
          </div>
        </div>

        {/* Drawdown Visualization */}
        <div className="mb-6">
          <h4 className="text-gray-400 text-sm mb-2">Drawdown Timeline</h4>
          <div className="h-16 bg-gray-700/50 rounded-lg relative overflow-hidden">
            {top5.map((dd, i) => {
              const width = Math.min(dd.drawdownPercent * 2, 100);
              return (
                <div
                  key={i}
                  className={`absolute h-full ${getSeverityBg(dd.drawdownPercent)} border-r border-gray-600`}
                  style={{ left: `${i * 20}%`, width: `${width}%`, maxWidth: '20%' }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-xs font-medium ${getSeverityColor(dd.drawdownPercent)}`}>
                      -{dd.drawdownPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Drawdowns Table */}
        <h4 className="text-gray-400 text-sm mb-2">Largest Drawdowns</h4>
        <div className="space-y-2">
          {top5.map((dd, i) => (
            <div key={i} className={`p-3 rounded-lg ${getSeverityBg(dd.drawdownPercent)} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-sm w-6">#{i + 1}</span>
                <div>
                  <p className={`font-bold ${getSeverityColor(dd.drawdownPercent)}`}>
                    -{dd.drawdownPercent.toFixed(2)}%
                  </p>
                  <p className="text-gray-400 text-xs">
                    ${dd.peakEquity.toFixed(0)} → ${dd.troughEquity.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-gray-400 text-xs">
                  <Clock className="h-3 w-3" />
                  {dd.duration.toFixed(1)} days
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {dd.recovered ? (
                    <><CheckCircle className="h-3 w-3 text-green-400" /><span className="text-green-400 text-xs">Recovered</span></>
                  ) : (
                    <><AlertCircle className="h-3 w-3 text-yellow-400" /><span className="text-yellow-400 text-xs">Active</span></>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {drawdowns.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
            <p>No significant drawdowns recorded</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
