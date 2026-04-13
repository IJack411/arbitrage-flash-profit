import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConditionType } from '@/types/strategyBuilder';
import { DollarSign, TrendingUp, Fuel, Clock, BarChart3, Droplets, ArrowLeftRight, Percent } from 'lucide-react';

interface ConditionTemplate {
  type: ConditionType;
  label: string;
  icon: React.ReactNode;
  defaultValue: number;
  unit: string;
}

const conditionTemplates: ConditionTemplate[] = [
  { type: 'price_threshold', label: 'Price Threshold', icon: <DollarSign className="w-4 h-4" />, defaultValue: 1000, unit: 'USD' },
  { type: 'profit_minimum', label: 'Min Profit', icon: <TrendingUp className="w-4 h-4" />, defaultValue: 0.5, unit: '%' },
  { type: 'gas_limit', label: 'Gas Limit', icon: <Fuel className="w-4 h-4" />, defaultValue: 50, unit: 'Gwei' },
  { type: 'time_window', label: 'Time Window', icon: <Clock className="w-4 h-4" />, defaultValue: 60, unit: 'sec' },
  { type: 'volume_threshold', label: 'Volume Threshold', icon: <BarChart3 className="w-4 h-4" />, defaultValue: 10000, unit: 'USD' },
  { type: 'liquidity_check', label: 'Liquidity Check', icon: <Droplets className="w-4 h-4" />, defaultValue: 50000, unit: 'USD' },
  { type: 'spread_minimum', label: 'Min Spread', icon: <ArrowLeftRight className="w-4 h-4" />, defaultValue: 0.1, unit: '%' },
  { type: 'slippage_limit', label: 'Slippage Limit', icon: <Percent className="w-4 h-4" />, defaultValue: 1, unit: '%' },
];

interface Props {
  onAddCondition: (type: ConditionType, label: string, defaultValue: number) => void;
}

export const ConditionPalette: React.FC<Props> = ({ onAddCondition }) => {
  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-300">Condition Blocks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {conditionTemplates.map((template) => (
          <div
            key={template.type}
            onClick={() => onAddCondition(template.type, template.label, template.defaultValue)}
            className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 border border-slate-700 
                       hover:border-purple-500/50 hover:bg-slate-800 cursor-pointer transition-all group"
          >
            <div className="p-1.5 rounded bg-purple-500/20 text-purple-400 group-hover:bg-purple-500/30">
              {template.icon}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-300">{template.label}</p>
              <p className="text-[10px] text-slate-500">Default: {template.defaultValue} {template.unit}</p>
            </div>
            <span className="text-xs text-slate-500 group-hover:text-purple-400">+ Add</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
