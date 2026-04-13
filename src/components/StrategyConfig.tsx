import React from 'react';
import { dexLogos } from '../data/dexAssets';
import { useAppContext } from '../contexts/AppContext';
import { useWeb3 } from '../contexts/Web3Context';
import { saveUserSettings } from '@/lib/supabaseService';
import { FlashLoanSlider } from './FlashLoanSlider';

export const StrategyConfig: React.FC = () => {
  const { strategySettings, updateStrategySettings } = useAppContext();
  const { account } = useWeb3();

  const toggleDex = async (dex: string) => {
    const newSettings = {
      enabledDexes: {
        ...strategySettings.enabledDexes,
        [dex]: !strategySettings.enabledDexes[dex]
      }
    };
    updateStrategySettings(newSettings);
    
    // Save to Supabase if wallet connected
    if (account) {
      try {
        await saveUserSettings({
          wallet_address: account,
          min_profit_percentage: strategySettings.minProfit,
          max_gas_price: strategySettings.maxGas,
          max_loan_amount: strategySettings.loanSize,
          auto_execute: false,
          enabled_networks: ['ethereum', 'polygon', 'bsc', 'arbitrum'],
          enabled_dexes: Object.keys(newSettings.enabledDexes).filter(k => newSettings.enabledDexes[k]),
          slippage_tolerance: strategySettings.slippage,
        });
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  };

  const handleLoanSizeChange = async (newSize: number) => {
    updateStrategySettings({ loanSize: newSize });
    
    // Save to Supabase if wallet connected
    if (account) {
      try {
        await saveUserSettings({
          wallet_address: account,
          min_profit_percentage: strategySettings.minProfit,
          max_gas_price: strategySettings.maxGas,
          max_loan_amount: newSize,
          auto_execute: false,
          enabled_networks: ['ethereum', 'polygon', 'bsc', 'arbitrum'],
          enabled_dexes: Object.keys(strategySettings.enabledDexes).filter(k => strategySettings.enabledDexes[k]),
          slippage_tolerance: strategySettings.slippage,
        });
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-white text-xl font-bold mb-4">Strategy Configuration</h2>
      
      <div className="space-y-6">
        {/* Flash Loan Slider */}
        <FlashLoanSlider 
          value={strategySettings.loanSize} 
          onChange={handleLoanSizeChange}
          min={0}
          max={1000000}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <label className="text-gray-400 text-sm block mb-2">Min Profit (USD)</label>
            <input
              type="range"
              title="Minimum profit"
              min="10"
              max="500"
              value={strategySettings.minProfit}
              onChange={(e) => updateStrategySettings({ minProfit: Number(e.target.value) })}
              className="w-full accent-[#00FF88]"
            />
            <div className="text-[#00FF88] font-mono text-xl mt-1">${strategySettings.minProfit}</div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <label className="text-gray-400 text-sm block mb-2">Slippage Tolerance (%)</label>
            <input
              type="range"
              title="Slippage tolerance"
              min="0.1"
              max="5"
              step="0.1"
              value={strategySettings.slippage}
              onChange={(e) => updateStrategySettings({ slippage: Number(e.target.value) })}
              className="w-full accent-[#00F0FF]"
            />
            <div className="text-[#00F0FF] font-mono text-xl mt-1">{strategySettings.slippage}%</div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <label className="text-gray-400 text-sm block mb-2">Max Gas (USD)</label>
            <input
              type="range"
              title="Maximum gas"
              min="10"
              max="200"
              value={strategySettings.maxGas}
              onChange={(e) => updateStrategySettings({ maxGas: Number(e.target.value) })}
              className="w-full accent-red-400"
            />
            <div className="text-red-400 font-mono text-xl mt-1">${strategySettings.maxGas}</div>
          </div>
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-3">Enabled DEXes</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(strategySettings.enabledDexes).map(([dex, enabled]) => (
              <button
                key={dex}
                onClick={() => toggleDex(dex)}
                className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                  enabled
                    ? 'bg-[#00FF88]/10 border-[#00FF88]'
                    : 'bg-gray-900 border-gray-700'
                }`}
              >
                <img src={dexLogos[dex]} alt={dex} className="w-6 h-6 rounded-full" />
                <span className={`text-sm ${enabled ? 'text-white' : 'text-gray-500'}`}>{dex}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
