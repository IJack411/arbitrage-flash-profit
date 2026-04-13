import React, { useState } from 'react';
import { BacktestConfigPanel } from './BacktestConfig';
import { BacktestResults } from './BacktestResults';
import { BacktestConfig, BacktestResult, Strategy } from '@/types/strategyBuilder';

interface Props {
  strategy?: Strategy;
}

const defaultStrategy: Strategy = {
  id: 'default',
  name: 'Default Strategy',
  description: '',
  entryRules: [],
  exitRules: [],
  riskParameters: {
    maxPositionSize: 5, maxDailyLoss: 1, maxDrawdown: 15,
    stopLossPercent: 3, takeProfitPercent: 10, maxConcurrentTrades: 3, cooldownPeriod: 30
  },
  networks: ['ethereum'],
  tokens: ['ETH'],
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: false,
  version: '1.0'
};

export const BacktestPanel: React.FC<Props> = ({ strategy = defaultStrategy }) => {
  const [config, setConfig] = useState<BacktestConfig>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    initialCapital: 10,
    tradingFees: 0.3,
    slippage: 0.5
  });
  
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runBacktest = async () => {
    setIsRunning(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const totalTrades = Math.floor(Math.random() * 50) + 20;
    const winRate = 45 + Math.random() * 30;
    const winningTrades = Math.floor(totalTrades * (winRate / 100));
    const losingTrades = totalTrades - winningTrades;
    
    const avgProfit = 0.01 + Math.random() * 0.05;
    const avgLoss = -(0.005 + Math.random() * 0.02);
    const totalProfit = (winningTrades * avgProfit) + (losingTrades * avgLoss);
    
    const mockResult: BacktestResult = {
      strategyId: strategy.id,
      totalTrades,
      winningTrades,
      losingTrades,
      totalProfit,
      maxDrawdown: 5 + Math.random() * 15,
      sharpeRatio: 0.5 + Math.random() * 2,
      winRate,
      avgProfit,
      avgLoss,
      profitFactor: Math.abs((winningTrades * avgProfit) / (losingTrades * avgLoss)),
      trades: []
    };
    
    setResult(mockResult);
    setIsRunning(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BacktestConfigPanel
        config={config}
        onUpdate={setConfig}
        onRunBacktest={runBacktest}
        isRunning={isRunning}
      />
      <BacktestResults result={result} />
    </div>
  );
};

