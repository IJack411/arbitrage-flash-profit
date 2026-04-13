import React, { useState } from 'react';
import { Settings, Save, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { OracleConfig } from '@/types/oracle';

interface Props {
  config: OracleConfig | null;
  onSave: (config: OracleConfig) => void;
  pair: string;
  network: string;
}

const SOURCES = ['chainlink', 'pyth', 'band'];

export const OracleConfigPanel: React.FC<Props> = ({ config, onSave, pair, network }) => {
  const [formData, setFormData] = useState<OracleConfig>(config || {
    pair, network, updateInterval: 30, deviationThreshold: 1,
    maxStaleness: 3600, enabledSources: ['chainlink', 'pyth', 'band'],
    primarySource: 'chainlink', fallbackOrder: ['pyth', 'band'],
    alertOnDeviation: true,
  });

  const handleSourceToggle = (source: string) => {
    const enabled = formData.enabledSources.includes(source);
    const newSources = enabled
      ? formData.enabledSources.filter(s => s !== source)
      : [...formData.enabledSources, source];
    setFormData({ ...formData, enabledSources: newSources });
  };

  const handleSave = () => {
    onSave({ ...formData, pair, network });
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="h-5 w-5 text-[#00F0FF]" />
        <h3 className="text-white font-semibold">Oracle Configuration</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-gray-400 text-sm block mb-2">Enabled Sources</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map(source => (
              <button
                key={source}
                onClick={() => handleSourceToggle(source)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  formData.enabledSources.includes(source)
                    ? 'bg-[#00F0FF] text-gray-900'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {source}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-2">Primary Source</label>
          <select
            value={formData.primarySource}
            onChange={e => setFormData({ ...formData, primarySource: e.target.value })}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            {formData.enabledSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-gray-400 text-sm flex items-center gap-1 mb-2">
              <RefreshCw className="h-3 w-3" /> Update Interval (s)
            </label>
            <input
              type="number"
              value={formData.updateInterval}
              onChange={e => setFormData({ ...formData, updateInterval: parseInt(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm flex items-center gap-1 mb-2">
              <Clock className="h-3 w-3" /> Max Staleness (s)
            </label>
            <input
              type="number"
              value={formData.maxStaleness}
              onChange={e => setFormData({ ...formData, maxStaleness: parseInt(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-sm flex items-center gap-1 mb-2">
            <AlertTriangle className="h-3 w-3" /> Deviation Threshold (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={formData.deviationThreshold}
            onChange={e => setFormData({ ...formData, deviationThreshold: parseFloat(e.target.value) })}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-gray-400 text-sm">Alert on Deviation</label>
          <button
            onClick={() => setFormData({ ...formData, alertOnDeviation: !formData.alertOnDeviation })}
            className={`w-12 h-6 rounded-full transition-colors ${formData.alertOnDeviation ? 'bg-[#00F0FF]' : 'bg-gray-700'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${formData.alertOnDeviation ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-[#00F0FF] hover:bg-[#00D4E8] text-gray-900 font-semibold py-2 rounded-lg flex items-center justify-center gap-2"
        >
          <Save className="h-4 w-4" /> Save Configuration
        </button>
      </div>
    </div>
  );
};
