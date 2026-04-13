import React, { useState } from 'react';
import { BotConfig, DEFAULT_BOT_CONFIG } from '@/types/tradingBot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Save } from 'lucide-react';

interface BotConfigFormProps {
  initialConfig?: Partial<BotConfig>;
  onSave: (config: BotConfig) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

const NETWORKS = ['ethereum', 'polygon', 'arbitrum', 'bsc', 'optimism', 'avalanche'];
const DEXES = ['uniswap', 'sushiswap', 'curve', 'balancer', 'pancakeswap', '1inch'];
const TOKEN_PAIRS = ['ETH/USDT', 'BTC/USDT', 'WETH/USDC', 'ETH/DAI', 'WBTC/ETH', 'LINK/ETH', 'UNI/ETH', 'AAVE/ETH'];

export const BotConfigForm: React.FC<BotConfigFormProps> = ({ initialConfig, onSave, onCancel, isEditing }) => {
  const [config, setConfig] = useState<BotConfig>({ ...DEFAULT_BOT_CONFIG, ...initialConfig });
  const [newPair, setNewPair] = useState('');

  const toggleItem = (field: 'token_pairs' | 'enabled_networks' | 'enabled_dexes', item: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter(i => i !== item) : [...prev[field], item]
    }));
  };

  const addCustomPair = () => {
    if (newPair && !config.token_pairs.includes(newPair)) {
      setConfig(prev => ({ ...prev, token_pairs: [...prev.token_pairs, newPair] }));
      setNewPair('');
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white">{isEditing ? 'Edit Bot' : 'Create New Bot'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-gray-300">Bot Name</Label>
          <Input value={config.name} onChange={e => setConfig(p => ({ ...p, name: e.target.value }))} className="bg-gray-900 border-gray-700 text-white mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Min Profit ($)</Label>
            <Input type="number" value={config.min_profit_threshold} onChange={e => setConfig(p => ({ ...p, min_profit_threshold: +e.target.value }))} className="bg-gray-900 border-gray-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300">Max Gas ($)</Label>
            <Input type="number" value={config.max_gas_limit} onChange={e => setConfig(p => ({ ...p, max_gas_limit: +e.target.value }))} className="bg-gray-900 border-gray-700 text-white mt-1" />
          </div>
        </div>

        <div>
          <Label className="text-gray-300 mb-2 block">Token Pairs</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {TOKEN_PAIRS.map(pair => (
              <Badge key={pair} variant={config.token_pairs.includes(pair) ? 'default' : 'outline'} className={`cursor-pointer ${config.token_pairs.includes(pair) ? 'bg-[#00F0FF] text-gray-900' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`} onClick={() => toggleItem('token_pairs', pair)}>
                {pair}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Custom pair..." value={newPair} onChange={e => setNewPair(e.target.value)} className="bg-gray-900 border-gray-700 text-white" />
            <Button size="sm" onClick={addCustomPair} variant="outline"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <div>
          <Label className="text-gray-300 mb-2 block">Networks</Label>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map(net => (
              <Badge key={net} variant={config.enabled_networks.includes(net) ? 'default' : 'outline'} className={`cursor-pointer capitalize ${config.enabled_networks.includes(net) ? 'bg-purple-500' : 'border-gray-600 text-gray-400'}`} onClick={() => toggleItem('enabled_networks', net)}>
                {net}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-gray-300 mb-2 block">DEXes</Label>
          <div className="flex flex-wrap gap-2">
            {DEXES.map(dex => (
              <Badge key={dex} variant={config.enabled_dexes.includes(dex) ? 'default' : 'outline'} className={`cursor-pointer capitalize ${config.enabled_dexes.includes(dex) ? 'bg-green-500' : 'border-gray-600 text-gray-400'}`} onClick={() => toggleItem('enabled_dexes', dex)}>
                {dex}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-gray-300">Active Hours: {config.active_hours_start}:00 - {config.active_hours_end}:00</Label>
          <div className="flex gap-4 mt-2">
            <Slider value={[config.active_hours_start]} onValueChange={([v]) => setConfig(p => ({ ...p, active_hours_start: v }))} max={23} className="flex-1" />
            <Slider value={[config.active_hours_end]} onValueChange={([v]) => setConfig(p => ({ ...p, active_hours_end: v }))} min={1} max={24} className="flex-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-gray-300">Daily Trade Limit</Label>
            <Input type="number" value={config.daily_trade_limit} onChange={e => setConfig(p => ({ ...p, daily_trade_limit: +e.target.value }))} className="bg-gray-900 border-gray-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300">Cooldown (sec)</Label>
            <Input type="number" value={config.cooldown_seconds} onChange={e => setConfig(p => ({ ...p, cooldown_seconds: +e.target.value }))} className="bg-gray-900 border-gray-700 text-white mt-1" />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-700">
          <Button onClick={() => onSave(config)} className="flex-1 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
            <Save className="h-4 w-4 mr-2" /> {isEditing ? 'Update' : 'Create'} Bot
          </Button>
          <Button onClick={onCancel} variant="outline" className="border-gray-600"><X className="h-4 w-4 mr-2" /> Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
};
