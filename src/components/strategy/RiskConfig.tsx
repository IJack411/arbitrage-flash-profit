import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RiskParameters } from '@/types/strategyBuilder';
import { Shield, AlertTriangle, Target, Clock } from 'lucide-react';

interface Props {
  params: RiskParameters;
  onUpdate: (params: RiskParameters) => void;
}

export const RiskConfig: React.FC<Props> = ({ params, onUpdate }) => {
  const update = (key: keyof RiskParameters, value: number) => {
    onUpdate({ ...params, [key]: value });
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
          <Shield className="w-4 h-4 text-blue-400" />
          Risk Parameters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Max Position Size (ETH)</Label>
            <Input
              type="number"
              value={params.maxPositionSize}
              onChange={(e) => update('maxPositionSize', parseFloat(e.target.value) || 0)}
              className="h-8 text-sm bg-slate-800/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Max Daily Loss (ETH)</Label>
            <Input
              type="number"
              value={params.maxDailyLoss}
              onChange={(e) => update('maxDailyLoss', parseFloat(e.target.value) || 0)}
              className="h-8 text-sm bg-slate-800/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-yellow-400" />
              Max Drawdown
            </Label>
            <span className="text-xs text-purple-400">{params.maxDrawdown}%</span>
          </div>
          <Slider
            value={[params.maxDrawdown]}
            onValueChange={([v]) => update('maxDrawdown', v)}
            max={50}
            step={1}
            className="py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              Stop Loss %
            </Label>
            <Slider
              value={[params.stopLossPercent]}
              onValueChange={([v]) => update('stopLossPercent', v)}
              max={20}
              step={0.5}
            />
            <span className="text-xs text-slate-500">{params.stopLossPercent}%</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <Target className="w-3 h-3 text-green-400" />
              Take Profit %
            </Label>
            <Slider
              value={[params.takeProfitPercent]}
              onValueChange={([v]) => update('takeProfitPercent', v)}
              max={50}
              step={1}
            />
            <span className="text-xs text-slate-500">{params.takeProfitPercent}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Max Concurrent Trades</Label>
            <Input
              type="number"
              value={params.maxConcurrentTrades}
              onChange={(e) => update('maxConcurrentTrades', parseInt(e.target.value) || 1)}
              className="h-8 text-sm bg-slate-800/50"
              min={1}
              max={10}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Cooldown (sec)
            </Label>
            <Input
              type="number"
              value={params.cooldownPeriod}
              onChange={(e) => update('cooldownPeriod', parseInt(e.target.value) || 0)}
              className="h-8 text-sm bg-slate-800/50"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
