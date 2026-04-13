import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import { alertService, AlertConfig, Alert } from '@/lib/web3/alertService';

const PAIRS = ['ETH/USD', 'BTC/USD', 'LINK/USD', 'UNI/USD', 'AAVE/USD', 'MATIC/USD'];

export const AlertConfigPanel: React.FC = () => {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ pair: 'ETH/USD', type: 'spread' as const, threshold: 0.5, direction: 'above' as const, sound: true });

  useEffect(() => {
    setConfigs(alertService.getConfigs());
    setAlerts(alertService.getAlerts());
    
    const unsub = alertService.subscribe((alert) => {
      setAlerts(alertService.getAlerts());
    });
    return unsub;
  }, []);

  const handleAdd = () => {
    alertService.addConfig({ ...form, enabled: true });
    setConfigs(alertService.getConfigs());
    setShowForm(false);
    setForm({ pair: 'ETH/USD', type: 'spread', threshold: 0.5, direction: 'above', sound: true });
  };

  const handleToggle = (id: string, enabled: boolean) => {
    alertService.updateConfig(id, { enabled });
    setConfigs(alertService.getConfigs());
  };

  const handleDelete = (id: string) => {
    alertService.removeConfig(id);
    setConfigs(alertService.getConfigs());
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#00F0FF]" />
          <h3 className="text-white font-semibold">Alert Configuration</h3>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1">
          <Plus className="h-4 w-4" /> Add Alert
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select title="Trading pair" aria-label="Trading pair" value={form.pair} onChange={e => setForm({ ...form, pair: e.target.value })} className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select title="Alert type" aria-label="Alert type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'spread' | 'price' | 'opportunity' })} className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value="spread">Spread %</option>
              <option value="price">Price</option>
              <option value="opportunity">Opportunity %</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select title="Direction" aria-label="Direction" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as 'above' | 'below' })} className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: parseFloat(e.target.value) })} placeholder="Threshold" className="bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm" step="0.01" />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-gray-400 text-sm">
              <input type="checkbox" checked={form.sound} onChange={e => setForm({ ...form, sound: e.target.checked })} className="rounded" />
              Sound notification
            </label>
            <button onClick={handleAdd} className="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm">Create</button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {configs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No alerts configured</p>
        ) : configs.map(config => (
          <div key={config.id} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
            <div className="flex items-center gap-3">
              <button
                title={config.enabled ? 'Disable alert' : 'Enable alert'}
                aria-label={config.enabled ? 'Disable alert' : 'Enable alert'}
                onClick={() => handleToggle(config.id, !config.enabled)}
                className={`w-8 h-4 rounded-full relative ${config.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${config.enabled ? 'right-0.5' : 'left-0.5'}`} />
              </button>
              <div>
                <span className="text-white text-sm">{config.pair}</span>
                <span className="text-gray-400 text-xs ml-2">{config.type} {config.direction} {config.threshold}{config.type === 'price' ? '' : '%'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config.sound ? <Volume2 className="h-4 w-4 text-gray-500" /> : <VolumeX className="h-4 w-4 text-gray-600" />}
              <button title="Delete alert" aria-label="Delete alert" onClick={() => handleDelete(config.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Recent Alerts</span>
            <button onClick={() => { alertService.clearAlerts(); setAlerts([]); }} className="text-gray-500 text-xs hover:text-gray-300">Clear</button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {alerts.slice(0, 5).map(alert => (
              <div key={alert.id} className={`text-xs px-2 py-1.5 rounded ${alert.read ? 'bg-gray-900 text-gray-500' : 'bg-yellow-900/30 text-yellow-300'}`}>
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
