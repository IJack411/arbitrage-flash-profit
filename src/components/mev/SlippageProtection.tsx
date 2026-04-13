import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Shield, Percent, Clock, Activity, AlertTriangle } from 'lucide-react';
import { SlippageConfig } from '@/types/mevProtection';
import { calculateDynamicSlippage } from '@/lib/web3/mevProtectionService';

interface Props {
  config: SlippageConfig;
  onChange: (config: SlippageConfig) => void;
}

export const SlippageProtection: React.FC<Props> = ({ config, onChange }) => {
  const [volatility, setVolatility] = useState(2.5);
  const [liquidity, setLiquidity] = useState(1000000);
  const [tradeSize, setTradeSize] = useState(10000);
  const [dynamicSlippage, setDynamicSlippage] = useState(0);

  useEffect(() => {
    if (config.dynamicSlippage) {
      setDynamicSlippage(calculateDynamicSlippage(volatility, liquidity, tradeSize));
    }
  }, [volatility, liquidity, tradeSize, config.dynamicSlippage]);

  const presets = [
    { label: 'Conservative', value: 0.5, color: 'bg-green-500' },
    { label: 'Standard', value: 1.0, color: 'bg-blue-500' },
    { label: 'Aggressive', value: 2.0, color: 'bg-yellow-500' },
    { label: 'Degen', value: 5.0, color: 'bg-red-500' },
  ];

  const effectiveSlippage = config.dynamicSlippage ? dynamicSlippage : config.maxSlippage;

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" /> Slippage Protection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {presets.map(p => (
            <button key={p.label} onClick={() => onChange({ ...config, maxSlippage: p.value })}
              className={`flex-1 py-2 rounded text-xs font-medium transition-all ${config.maxSlippage === p.value ? `${p.color} text-white` : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <Label className="text-gray-400 text-xs flex items-center gap-1"><Percent className="h-3 w-3" /> Max Slippage</Label>
            <span className="text-white font-medium">{config.maxSlippage.toFixed(1)}%</span>
          </div>
          <Slider value={[config.maxSlippage]} onValueChange={([v]) => onChange({ ...config, maxSlippage: v })} min={0.1} max={10} step={0.1} className="w-full" />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-gray-400 text-xs flex items-center gap-1"><Activity className="h-3 w-3" /> Dynamic Slippage</Label>
          <Switch checked={config.dynamicSlippage} onCheckedChange={v => onChange({ ...config, dynamicSlippage: v })} />
        </div>

        {config.dynamicSlippage && (
          <div className="bg-gray-900 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">Calculated Slippage</span>
              <span className={`font-bold ${dynamicSlippage > 2 ? 'text-yellow-400' : 'text-green-400'}`}>{dynamicSlippage.toFixed(2)}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-gray-500">Volatility</span><div className="text-white">{volatility.toFixed(1)}%</div></div>
              <div><span className="text-gray-500">Liquidity</span><div className="text-white">${(liquidity/1e6).toFixed(1)}M</div></div>
              <div><span className="text-gray-500">Trade Size</span><div className="text-white">${(tradeSize/1e3).toFixed(0)}K</div></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-gray-400 text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Volatility Adjustment</Label>
          <Switch checked={config.volatilityAdjustment} onCheckedChange={v => onChange({ ...config, volatilityAdjustment: v })} />
        </div>

        <div>
          <Label className="text-gray-400 text-xs flex items-center gap-1 mb-2"><Clock className="h-3 w-3" /> Deadline (seconds)</Label>
          <Input type="number" value={config.deadline} onChange={e => onChange({ ...config, deadline: parseInt(e.target.value) || 1200 })} className="bg-gray-900 border-gray-700 text-white h-8" />
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="text-blue-400 text-xs font-medium mb-1">Effective Protection</div>
          <div className="text-white text-lg font-bold">{effectiveSlippage.toFixed(2)}% Max Slippage</div>
          <div className="text-gray-400 text-xs">Transaction deadline: {Math.floor(config.deadline / 60)}m {config.deadline % 60}s</div>
        </div>
      </CardContent>
    </Card>
  );
};
