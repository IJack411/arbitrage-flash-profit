import React, { useState } from 'react';
import { Shield, TrendingDown, AlertTriangle, BarChart2 } from 'lucide-react';
import { RiskMetrics } from './RiskMetrics';
import { CircuitBreaker } from './CircuitBreaker';
import { PositionSizer } from './PositionSizer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const RiskManagementPanel: React.FC = () => {
  const [circuitTriggered, setCircuitTriggered] = useState(false);
  const [positionSize, setPositionSize] = useState(1000);
  const [capital] = useState(50000);

  const riskMetrics = {
    currentDrawdown: 3.2,
    maxDrawdown: 8.5,
    sharpeRatio: 1.85,
    winStreak: 7,
    loseStreak: 2,
    riskScore: 35,
    exposurePercent: 12.5,
    dailyPnL: 425.50
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="h-6 w-6 text-[#00F0FF]" />
        <div>
          <h2 className="text-white text-2xl font-bold">Risk Management</h2>
          <p className="text-gray-400">Protect your capital with advanced risk controls</p>
        </div>
      </div>

      <RiskMetrics metrics={riskMetrics} />

      <Tabs defaultValue="circuit" className="space-y-4">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="circuit" className="data-[state=active]:bg-gray-700">
            <AlertTriangle className="h-4 w-4 mr-2" />Circuit Breaker
          </TabsTrigger>
          <TabsTrigger value="position" className="data-[state=active]:bg-gray-700">
            <BarChart2 className="h-4 w-4 mr-2" />Position Sizing
          </TabsTrigger>
          <TabsTrigger value="exposure" className="data-[state=active]:bg-gray-700">
            <TrendingDown className="h-4 w-4 mr-2" />Exposure Limits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="circuit">
          <CircuitBreaker onStatusChange={setCircuitTriggered} isTriggered={circuitTriggered} triggerReason={circuitTriggered ? "Max daily loss exceeded" : undefined} />
        </TabsContent>

        <TabsContent value="position">
          <PositionSizer capital={capital} onSizeChange={setPositionSize} />
        </TabsContent>

        <TabsContent value="exposure">
          <ExposureLimits />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ExposureLimits: React.FC = () => {
  const [limits, setLimits] = useState({
    maxSingleTrade: 5000,
    maxDailyVolume: 50000,
    maxOpenPositions: 5,
    maxPerNetwork: 20000,
    maxPerToken: 10000
  });

  const exposures = [
    { name: 'Ethereum', current: 12500, limit: limits.maxPerNetwork, color: 'bg-blue-500' },
    { name: 'Polygon', current: 8000, limit: limits.maxPerNetwork, color: 'bg-purple-500' },
    { name: 'Arbitrum', current: 5500, limit: limits.maxPerNetwork, color: 'bg-orange-500' },
    { name: 'BSC', current: 3000, limit: limits.maxPerNetwork, color: 'bg-yellow-500' }
  ];

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
      <h3 className="text-white font-semibold">Exposure Limits</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(limits).map(([key, value]) => (
          <div key={key}>
            <label className="text-gray-400 text-xs capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
            <input type="number" value={value} onChange={(e) => setLimits(l => ({ ...l, [key]: +e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mt-1" />
          </div>
        ))}
      </div>

      <div className="space-y-3 mt-4">
        <h4 className="text-gray-400 text-sm">Current Network Exposure</h4>
        {exposures.map(exp => (
          <div key={exp.name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">{exp.name}</span>
              <span className="text-gray-400">${exp.current.toLocaleString()} / ${exp.limit.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full ${exp.color} transition-all`} style={{ width: `${(exp.current / exp.limit) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
