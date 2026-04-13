import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { StrategyCanvas } from './StrategyCanvas';
import { TemplateLibrary } from './TemplateLibrary';
import { BacktestPanel } from '../backtesting/BacktestPanel';
import { Strategy, StrategyTemplate } from '@/types/strategyBuilder';
import { Layers, Play, History, FileText, Plus, Rocket } from 'lucide-react';


const defaultStrategy: Strategy = {
  id: `strategy-${Date.now()}`,
  name: 'New Strategy',
  description: 'Describe your arbitrage strategy...',
  entryRules: [],
  exitRules: [],
  riskParameters: {
    maxPositionSize: 5,
    maxDailyLoss: 1,
    maxDrawdown: 15,
    stopLossPercent: 3,
    takeProfitPercent: 10,
    maxConcurrentTrades: 3,
    cooldownPeriod: 30
  },
  networks: ['ethereum'],
  tokens: ['ETH', 'USDT'],
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: false,
  version: '1.0'
};

export const StrategyBuilderDashboard: React.FC = () => {
  const { toast } = useToast();
  const [strategy, setStrategy] = useState<Strategy>(defaultStrategy);
  const [selectedRuleType, setSelectedRuleType] = useState<'entry' | 'exit'>('entry');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const handleLoadTemplate = (template: StrategyTemplate) => {
    setStrategy({
      ...template.strategy,
      id: `strategy-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    toast({ title: 'Template Loaded', description: `Loaded "${template.name}" template` });
  };

  const handleSaveStrategy = () => {
    toast({ title: 'Strategy Saved', description: `"${strategy.name}" has been saved` });
  };

  const handleDeploy = () => {
    if (strategy.entryRules.length === 0) {
      toast({ title: 'Cannot Deploy', description: 'Add at least one entry rule', variant: 'destructive' });
      return;
    }
    setStrategy(s => ({ ...s, isActive: true }));
    toast({ title: 'Strategy Deployed', description: `"${strategy.name}" is now active` });
  };

  const createNewStrategy = () => {
    setStrategy({ ...defaultStrategy, id: `strategy-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() });
    setSelectedRuleId(null);
  };

  // Auto-select first rule when rules change
  React.useEffect(() => {
    const rules = selectedRuleType === 'entry' ? strategy.entryRules : strategy.exitRules;
    if (rules.length > 0 && !selectedRuleId) {
      setSelectedRuleId(rules[0].id);
    }
  }, [strategy.entryRules, strategy.exitRules, selectedRuleType, selectedRuleId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Visual Strategy Builder</h2>
            <p className="text-sm text-slate-400">Create custom arbitrage strategies without coding</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={createNewStrategy} className="h-9">
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
          <Button onClick={handleDeploy} disabled={strategy.isActive} className="h-9 bg-gradient-to-r from-purple-500 to-pink-500">
            <Rocket className="w-4 h-4 mr-1" /> {strategy.isActive ? 'Active' : 'Deploy'}
          </Button>
          {strategy.isActive && <Badge className="bg-green-500/20 text-green-400">Live</Badge>}
        </div>
      </div>

      <Tabs defaultValue="builder" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="builder"><Layers className="w-4 h-4 mr-1" />Builder</TabsTrigger>
          <TabsTrigger value="backtest"><History className="w-4 h-4 mr-1" />Backtest</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-1" />Templates</TabsTrigger>

        </TabsList>

        <TabsContent value="builder">
          <StrategyCanvas
            strategy={strategy}
            onUpdate={setStrategy}
            selectedRuleType={selectedRuleType}
            selectedRuleId={selectedRuleId}
          />
        </TabsContent>

        <TabsContent value="backtest">
          <BacktestPanel strategy={strategy} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateLibrary
            currentStrategy={strategy}
            onLoadTemplate={handleLoadTemplate}
            onSaveStrategy={handleSaveStrategy}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
