import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Strategy, StrategyTemplate } from '@/types/strategyBuilder';
import { Save, Download, Share2, Star, Search, Trash2 } from 'lucide-react';

const defaultTemplates: StrategyTemplate[] = [
  { id: 't1', name: 'Conservative Arbitrage', description: 'Low risk, stable profits', category: 'Low Risk', downloads: 1234, rating: 4.5, strategy: { name: 'Conservative', description: 'Safe strategy', entryRules: [], exitRules: [], riskParameters: { maxPositionSize: 1, maxDailyLoss: 0.5, maxDrawdown: 10, stopLossPercent: 2, takeProfitPercent: 5, maxConcurrentTrades: 2, cooldownPeriod: 60 }, networks: ['ethereum'], tokens: ['ETH', 'USDT'], isActive: false, version: '1.0' } },
  { id: 't2', name: 'Aggressive Scalper', description: 'High frequency, small gains', category: 'High Risk', downloads: 856, rating: 4.2, strategy: { name: 'Scalper', description: 'Fast trades', entryRules: [], exitRules: [], riskParameters: { maxPositionSize: 5, maxDailyLoss: 2, maxDrawdown: 25, stopLossPercent: 5, takeProfitPercent: 15, maxConcurrentTrades: 5, cooldownPeriod: 10 }, networks: ['polygon', 'arbitrum'], tokens: ['ETH', 'MATIC'], isActive: false, version: '1.0' } },
  { id: 't3', name: 'Cross-Chain Hunter', description: 'Multi-chain opportunities', category: 'Advanced', downloads: 567, rating: 4.8, strategy: { name: 'Cross-Chain', description: 'Bridge arbitrage', entryRules: [], exitRules: [], riskParameters: { maxPositionSize: 3, maxDailyLoss: 1, maxDrawdown: 15, stopLossPercent: 3, takeProfitPercent: 10, maxConcurrentTrades: 3, cooldownPeriod: 30 }, networks: ['ethereum', 'polygon', 'arbitrum'], tokens: ['ETH', 'USDC'], isActive: false, version: '1.0' } },
];

interface Props {
  currentStrategy: Strategy;
  onLoadTemplate: (template: StrategyTemplate) => void;
  onSaveStrategy: () => void;
}

export const TemplateLibrary: React.FC<Props> = ({ currentStrategy, onLoadTemplate, onSaveStrategy }) => {
  const [search, setSearch] = useState('');
  const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);

  const filteredTemplates = defaultTemplates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    setSavedStrategies(prev => [...prev, { ...currentStrategy, id: `saved-${Date.now()}` }]);
    onSaveStrategy();
  };

  const handleShare = () => {
    const shareData = JSON.stringify(currentStrategy);
    navigator.clipboard.writeText(shareData);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-slate-300">Strategy Templates</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleSave} className="h-7 text-xs">
              <Save className="w-3 h-3 mr-1" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleShare} className="h-7 text-xs">
              <Share2 className="w-3 h-3 mr-1" /> Share
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-8 h-8 text-sm bg-slate-800/50"
          />
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredTemplates.map(t => (
            <div key={t.id} className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 cursor-pointer" onClick={() => onLoadTemplate(t)}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{t.name}</span>
                <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t.description}</p>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><Download className="w-3 h-3" />{t.downloads}</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />{t.rating}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
