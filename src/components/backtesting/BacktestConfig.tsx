import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BacktestConfig as IBacktestConfig } from '@/types/strategyBuilder';
import { Calendar, DollarSign, Percent, Play } from 'lucide-react';

interface Props {
  config: IBacktestConfig;
  onUpdate: (config: IBacktestConfig) => void;
  onRunBacktest: () => void;
  isRunning: boolean;
}

export const BacktestConfigPanel: React.FC<Props> = ({ config, onUpdate, onRunBacktest, isRunning }) => {
  const update = (key: keyof IBacktestConfig, value: IBacktestConfig[keyof IBacktestConfig]) => {
    onUpdate({ ...config, [key]: value });
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
          <Calendar className="w-4 h-4 text-cyan-400" />
          Backtest Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Start Date</Label>
            <Input
              type="date"
              value={config.startDate.toISOString().split('T')[0]}
              onChange={(e) => update('startDate', new Date(e.target.value))}
              className="h-8 text-sm bg-slate-800/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">End Date</Label>
            <Input
              type="date"
              value={config.endDate.toISOString().split('T')[0]}
              onChange={(e) => update('endDate', new Date(e.target.value))}
              className="h-8 text-sm bg-slate-800/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-green-400" />
            Initial Capital (ETH)
          </Label>
          <Input
            type="number"
            value={config.initialCapital}
            onChange={(e) => update('initialCapital', parseFloat(e.target.value) || 0)}
            className="h-8 text-sm bg-slate-800/50"
            step={0.1}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <Percent className="w-3 h-3" />
              Trading Fees %
            </Label>
            <Input
              type="number"
              value={config.tradingFees}
              onChange={(e) => update('tradingFees', parseFloat(e.target.value) || 0)}
              className="h-8 text-sm bg-slate-800/50"
              step={0.01}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <Percent className="w-3 h-3" />
              Slippage %
            </Label>
            <Input
              type="number"
              value={config.slippage}
              onChange={(e) => update('slippage', parseFloat(e.target.value) || 0)}
              className="h-8 text-sm bg-slate-800/50"
              step={0.1}
            />
          </div>
        </div>

        <Button
          onClick={onRunBacktest}
          disabled={isRunning}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Backtest
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
