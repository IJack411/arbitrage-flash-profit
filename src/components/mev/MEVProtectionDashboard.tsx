import React, { useState } from 'react';
import { Shield, Zap, Eye, Settings, AlertTriangle, CheckCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SandwichDetector } from './SandwichDetector';
import { TransactionSimulator } from './TransactionSimulator';
import { SlippageProtection } from './SlippageProtection';
import { MempoolMonitor } from './MempoolMonitor';
import { ProtectionConfig, SlippageConfig, SandwichAttack } from '@/types/mevProtection';
import { defaultProtectionConfig } from '@/lib/web3/mevProtectionService';
import { useToast } from '@/hooks/use-toast';

export const MEVProtectionDashboard: React.FC = () => {
  const [config, setConfig] = useState<ProtectionConfig>(defaultProtectionConfig);
  const [activeTab, setActiveTab] = useState<'overview' | 'detection' | 'simulation' | 'settings'>('overview');
  const [attackCount, setAttackCount] = useState(0);
  const { toast } = useToast();

  const handleAttackDetected = (attack: SandwichAttack) => {
    setAttackCount(c => c + 1);
    if (attack.riskLevel === 'critical' || attack.riskLevel === 'high') {
      toast({ title: 'Sandwich Attack Detected!', description: `${attack.riskLevel.toUpperCase()} risk on ${attack.targetDex}`, variant: 'destructive' });
    }
  };

  const updateSlippage = (slippage: SlippageConfig) => setConfig(c => ({ ...c, slippage }));

  const protectionFeatures: Array<{
    key: 'useFlashbotsProtect' | 'sandwichDetection' | 'frontrunProtection' | 'backrunProtection';
    label: string;
    desc: string;
  }> = [
    { key: 'useFlashbotsProtect', label: 'Flashbots Protect', desc: 'Route via private mempool' },
    { key: 'sandwichDetection', label: 'Sandwich Detection', desc: 'Monitor for sandwich attacks' },
    { key: 'frontrunProtection', label: 'Frontrun Protection', desc: 'Prevent frontrunning' },
    { key: 'backrunProtection', label: 'Backrun Protection', desc: 'Prevent backrunning' },
  ];

  const tabs: Array<'overview' | 'detection' | 'simulation' | 'settings'> = ['overview', 'detection', 'simulation', 'settings'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#00F0FF]" /> MEV Protection Suite
          </h2>
          <p className="text-gray-400 text-sm mt-1">Advanced protection against sandwich attacks and MEV extraction</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${config.enabled ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'}`}>
            {config.enabled ? <CheckCircle className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
            <span className={config.enabled ? 'text-green-400' : 'text-red-400'}>{config.enabled ? 'Protected' : 'Unprotected'}</span>
          </div>
          <Switch checked={config.enabled} onCheckedChange={v => setConfig(c => ({ ...c, enabled: v }))} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Attacks Detected', value: attackCount, icon: AlertTriangle, color: 'text-red-400' },
          { label: 'Txs Protected', value: 247, icon: Shield, color: 'text-green-400' },
          { label: 'Gas Saved', value: '$1,234', icon: Zap, color: 'text-yellow-400' },
          { label: 'Success Rate', value: '99.2%', icon: CheckCircle, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <s.icon className={`h-5 w-5 ${s.color} mb-2`} />
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-gray-400 text-sm">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded text-sm capitalize ${activeTab === tab ? 'bg-[#00F0FF] text-gray-900 font-medium' : 'text-gray-400 hover:text-white'}`}>{tab}</button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <MempoolMonitor />
          <SandwichDetector onAttackDetected={handleAttackDetected} />
        </div>
      )}

      {activeTab === 'detection' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <SandwichDetector onAttackDetected={handleAttackDetected} />
          <SlippageProtection config={config.slippage} onChange={updateSlippage} />
        </div>
      )}

      {activeTab === 'simulation' && <TransactionSimulator />}

      {activeTab === 'settings' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2"><Settings className="h-4 w-4" /> Protection Features</h3>
            {protectionFeatures.map(f => (
              <div key={f.key} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div><div className="text-white text-sm">{f.label}</div><div className="text-gray-500 text-xs">{f.desc}</div></div>
                <Switch checked={config[f.key]} onCheckedChange={v => setConfig(c => ({ ...c, [f.key]: v }))} />
              </div>
            ))}
          </div>
          <SlippageProtection config={config.slippage} onChange={updateSlippage} />
        </div>
      )}
    </div>
  );
};
