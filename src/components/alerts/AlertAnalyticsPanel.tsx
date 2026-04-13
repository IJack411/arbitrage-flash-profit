import React from 'react';
import { AlertAnalytics, AlertTriggerType, AlertSeverity, ChannelType } from '@/types/alertSystem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Target, Clock, CheckCircle, XCircle, DollarSign, Activity } from 'lucide-react';

interface Props {
  analytics: AlertAnalytics;
}

const typeLabels: Record<AlertTriggerType, string> = {
  price_threshold: 'Price',
  profit_target: 'Profit',
  gas_price: 'Gas',
  mev_detection: 'MEV',
  liquidity_change: 'Liquidity',
  spread_threshold: 'Spread',
  volume_spike: 'Volume',
  whale_movement: 'Whale',
};

export const AlertAnalyticsPanel: React.FC<Props> = ({ analytics }) => {
  const topEffective = [...analytics.effectiveness].sort((a, b) => {
    const aRate = a.totalTriggered > 0 ? a.truePositives / a.totalTriggered : 0;
    const bRate = b.totalTriggered > 0 ? b.truePositives / b.totalTriggered : 0;
    return bRate - aRate;
  }).slice(0, 5);

  const totalProfit = analytics.effectiveness.reduce((sum, e) => sum + e.profitGenerated, 0);
  const avgEffectiveness = analytics.effectiveness.length > 0
    ? analytics.effectiveness.reduce((sum, e) => sum + (e.totalTriggered > 0 ? e.truePositives / e.totalTriggered : 0), 0) / analytics.effectiveness.length * 100
    : 0;

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />Alert Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <Activity className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{analytics.totalAlerts}</div>
            <div className="text-gray-400 text-sm">Total Alerts</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <Clock className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{analytics.avgAlertsPerDay.toFixed(1)}</div>
            <div className="text-gray-400 text-sm">Avg/Day</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <Target className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{avgEffectiveness.toFixed(1)}%</div>
            <div className="text-gray-400 text-sm">Effectiveness</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <DollarSign className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">${totalProfit.toFixed(0)}</div>
            <div className="text-gray-400 text-sm">Profit Generated</div>
          </div>
        </div>

        {/* Alerts by Type */}
        <div>
          <h4 className="text-gray-300 font-medium mb-3">Alerts by Type</h4>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(analytics.alertsByType).map(([type, count]) => (
              <div key={type} className="bg-gray-900 rounded-lg p-3">
                <div className="text-lg font-bold text-white">{count}</div>
                <div className="text-gray-400 text-xs">{typeLabels[type as AlertTriggerType]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts by Severity */}
        <div>
          <h4 className="text-gray-300 font-medium mb-3">Alerts by Severity</h4>
          <div className="flex gap-2">
            {Object.entries(analytics.alertsBySeverity).map(([sev, count]) => {
              const total = Object.values(analytics.alertsBySeverity).reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              const colors: Record<string, string> = { low: 'bg-blue-500', medium: 'bg-yellow-500', high: 'bg-orange-500', critical: 'bg-red-500' };
              return (
                <div key={sev} className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 capitalize">{sev}</span>
                    <span className="text-white">{count}</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[sev]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Effective Rules */}
        <div>
          <h4 className="text-gray-300 font-medium mb-3">Most Effective Rules</h4>
          <div className="space-y-2">
            {topEffective.map((eff, i) => {
              const rate = eff.totalTriggered > 0 ? (eff.truePositives / eff.totalTriggered) * 100 : 0;
              return (
                <div key={eff.ruleId} className="flex items-center justify-between bg-gray-900 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm">#{i + 1}</span>
                    <div>
                      <div className="text-white text-sm">Rule {eff.ruleId.slice(0, 8)}</div>
                      <div className="text-gray-500 text-xs">{eff.totalTriggered} triggers</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        <span className="text-green-400 text-sm">{eff.truePositives}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-400" />
                        <span className="text-red-400 text-sm">{eff.falsePositives}</span>
                      </div>
                    </div>
                    <Badge className={rate >= 70 ? 'bg-green-500/20 text-green-400' : rate >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}>
                      {rate.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
