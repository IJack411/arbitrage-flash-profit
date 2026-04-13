import React, { useState } from 'react';
import { AlertOctagon, Power, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface CircuitBreakerProps {
  onStatusChange: (isActive: boolean) => void;
  isTriggered: boolean;
  triggerReason?: string;
}

export const CircuitBreaker: React.FC<CircuitBreakerProps> = ({ onStatusChange, isTriggered, triggerReason }) => {
  const [settings, setSettings] = useState({
    enabled: true,
    maxDailyLoss: 500,
    maxConsecutiveLosses: 5,
    maxDrawdownPercent: 10,
    cooldownMinutes: 30,
    autoResume: false
  });

  const handleReset = () => {
    onStatusChange(false);
  };

  return (
    <div className={`bg-gray-800 border rounded-lg p-4 ${isTriggered ? 'border-red-500' : 'border-gray-700'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <AlertOctagon className={`h-5 w-5 ${isTriggered ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
          <div>
            <h3 className="text-white font-semibold">Circuit Breaker</h3>
            <p className="text-gray-400 text-sm">Emergency stop protection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">{settings.enabled ? 'Active' : 'Disabled'}</span>
          <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings(s => ({ ...s, enabled: v }))} />
        </div>
      </div>

      {isTriggered && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
          <p className="text-red-400 font-medium">Trading Halted</p>
          <p className="text-red-300 text-sm">{triggerReason || 'Circuit breaker triggered'}</p>
          <button onClick={handleReset} className="mt-2 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Reset & Resume
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-gray-400 text-xs">Max Daily Loss ($)</label>
          <input type="number" value={settings.maxDailyLoss} onChange={(e) => setSettings(s => ({ ...s, maxDailyLoss: +e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-gray-400 text-xs">Max Consecutive Losses</label>
          <input type="number" value={settings.maxConsecutiveLosses} onChange={(e) => setSettings(s => ({ ...s, maxConsecutiveLosses: +e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-gray-400 text-xs">Max Drawdown (%)</label>
          <input type="number" value={settings.maxDrawdownPercent} onChange={(e) => setSettings(s => ({ ...s, maxDrawdownPercent: +e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mt-1" />
        </div>
        <div>
          <label className="text-gray-400 text-xs">Cooldown (min)</label>
          <input type="number" value={settings.cooldownMinutes} onChange={(e) => setSettings(s => ({ ...s, cooldownMinutes: +e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mt-1" />
        </div>
      </div>
    </div>
  );
};
