import React, { useState, useCallback, useEffect } from 'react';
import { DollarSign, Zap, Info, Link2, Unlink, Settings2, TrendingUp, AlertTriangle, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface NetworkAllocation {
  network: string;
  label: string;
  color: string;
  percentage: number;
  amount: number;
  enabled: boolean;
}

interface MasterFlashLoanSliderProps {
  totalValue: number;
  onTotalChange: (value: number) => void;
  onAllocationsChange?: (allocations: NetworkAllocation[]) => void;
  min?: number;
  max?: number;
  step?: number;
}

const NETWORK_CONFIGS = [
  { network: 'ethereum', label: 'Ethereum', color: '#627EEA', defaultPct: 50 },
  { network: 'polygon', label: 'Polygon', color: '#8247E5', defaultPct: 30 },
  { network: 'arbitrum', label: 'Arbitrum', color: '#28A0F0', defaultPct: 20 },
];

const NETWORK_COLOR_CLASSES: Record<string, string> = {
  ethereum: 'bg-[#627EEA] text-[#627EEA] border-[#627EEA]',
  polygon: 'bg-[#8247E5] text-[#8247E5] border-[#8247E5]',
  arbitrum: 'bg-[#28A0F0] text-[#28A0F0] border-[#28A0F0]',
};

export const MasterFlashLoanSlider: React.FC<MasterFlashLoanSliderProps> = ({
  totalValue,
  onTotalChange,
  onAllocationsChange,
  min = 0,
  max = 1000000,
  step = 5 // Default to $5 increments for smooth sliding
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [linkedMode, setLinkedMode] = useState(true);
  const [inputValue, setInputValue] = useState(totalValue.toString());
  const [allocations, setAllocations] = useState<NetworkAllocation[]>(
    NETWORK_CONFIGS.map(cfg => ({
      ...cfg,
      percentage: cfg.defaultPct,
      amount: (totalValue * cfg.defaultPct) / 100,
      enabled: true
    }))
  );

  // Update allocations when total value changes
  useEffect(() => {
    if (linkedMode) {
      setAllocations((prev) => {
        const enabledAllocations = prev.filter(a => a.enabled);
        const totalPercentage = enabledAllocations.reduce((sum, a) => sum + a.percentage, 0);

        const newAllocations = prev.map(alloc => {
          if (!alloc.enabled) {
            return { ...alloc, amount: 0 };
          }
          // Calculate exact amount based on percentage of total
          const exactAmount = totalPercentage > 0 ? (totalValue * alloc.percentage) / totalPercentage : 0;
          return {
            ...alloc,
            amount: Math.round(exactAmount * 100) / 100 // Round to 2 decimal places
          };
        });

        onAllocationsChange?.(newAllocations);
        return newAllocations;
      });
    }
    setInputValue(totalValue.toString());
  }, [totalValue, linkedMode, onAllocationsChange]);

  const formatValue = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(2)}K`;
    return `$${val.toFixed(2)}`;
  };

  const formatExactValue = (val: number) => {
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatTickLabel = (val: number) => {
    if (val === 0) return '$0';
    if (val >= 1000000) return '$1M';
    return `$${val / 1000}K`;
  };

  const tickMarks = [0, 100000, 250000, 500000, 750000, 1000000];
  const percentage = ((totalValue - min) / (max - min)) * 100;

  const handleMasterSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    onTotalChange(newValue);
  }, [onTotalChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9.]/g, '');
    setInputValue(rawValue);
  };

  const handleInputBlur = () => {
    let numValue = parseFloat(inputValue) || 0;
    numValue = Math.max(min, Math.min(max, numValue));
    numValue = Math.round(numValue / step) * step;
    onTotalChange(numValue);
    setInputValue(numValue.toString());
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    }
  };

  const handleNetworkSliderChange = (index: number, newAmount: number) => {
    // Round to nearest step
    newAmount = Math.round(newAmount / step) * step;
    
    if (linkedMode) {
      // In linked mode, adjust proportionally to maintain total
      const currentAlloc = allocations[index];
      const diff = newAmount - currentAlloc.amount;
      const otherEnabled = allocations.filter((a, i) => a.enabled && i !== index);
      const otherTotal = otherEnabled.reduce((sum, a) => sum + a.amount, 0);
      
      if (otherEnabled.length > 0 && otherTotal > 0) {
        const newAllocations = allocations.map((alloc, i) => {
          if (i === index) {
            const newPct = (newAmount / totalValue) * 100;
            return { ...alloc, amount: newAmount, percentage: newPct };
          } else if (alloc.enabled) {
            // Distribute the difference proportionally among other enabled networks
            const proportion = alloc.amount / otherTotal;
            const adjustment = diff * proportion;
            const newAmt = Math.max(0, alloc.amount - adjustment);
            const newPct = (newAmt / totalValue) * 100;
            return { ...alloc, amount: Math.round(newAmt * 100) / 100, percentage: newPct };
          }
          return alloc;
        });
        setAllocations(newAllocations);
        onAllocationsChange?.(newAllocations);
      }
    } else {
      // In unlinked mode, just update this one and recalculate total
      const newAllocations = allocations.map((alloc, i) => {
        if (i === index) {
          return { ...alloc, amount: newAmount };
        }
        return alloc;
      });
      
      const newTotal = newAllocations.filter(a => a.enabled).reduce((sum, a) => sum + a.amount, 0);
      
      // Recalculate percentages based on new total
      const finalAllocations = newAllocations.map(alloc => ({
        ...alloc,
        percentage: newTotal > 0 ? (alloc.amount / newTotal) * 100 : 0
      }));
      
      setAllocations(finalAllocations);
      onAllocationsChange?.(finalAllocations);
      onTotalChange(newTotal);
    }
  };

  const handleNetworkInputChange = (index: number, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    handleNetworkSliderChange(index, numValue);
  };

  const toggleNetwork = (index: number) => {
    const newAllocations = allocations.map((alloc, i) => {
      if (i === index) {
        const newEnabled = !alloc.enabled;
        return { 
          ...alloc, 
          enabled: newEnabled,
          amount: newEnabled ? (totalValue * alloc.percentage) / 100 : 0
        };
      }
      return alloc;
    });
    
    // Recalculate percentages for enabled networks
    const enabledTotal = newAllocations.filter(a => a.enabled).reduce((sum, a) => sum + a.percentage, 0);
    const finalAllocations = newAllocations.map(alloc => {
      if (alloc.enabled && enabledTotal > 0) {
        const normalizedPct = (alloc.percentage / enabledTotal) * 100;
        return {
          ...alloc,
          percentage: normalizedPct,
          amount: (totalValue * normalizedPct) / 100
        };
      }
      return alloc;
    });
    
    setAllocations(finalAllocations);
    onAllocationsChange?.(finalAllocations);
  };

  const resetToDefault = () => {
    const newAllocations = NETWORK_CONFIGS.map(cfg => ({
      ...cfg,
      percentage: cfg.defaultPct,
      amount: (totalValue * cfg.defaultPct) / 100,
      enabled: true
    }));
    setAllocations(newAllocations);
    onAllocationsChange?.(newAllocations);
  };

  // Calculate estimated returns and fees
  const estimatedDailyReturn = totalValue * 0.002;
  const estimatedMonthlyReturn = totalValue * 0.06;
  const totalAllocated = allocations.filter(a => a.enabled).reduce((sum, a) => sum + a.amount, 0);
  const flashLoanFee = totalValue * 0.0009; // 0.09% Aave flash loan fee
  const totalRepayment = totalValue + flashLoanFee;

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#FFD700]/30 to-[#FF8C00]/20 rounded-xl shadow-lg shadow-[#FFD700]/10">
            <Zap className="w-7 h-7 text-[#FFD700]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-xl">Master Flash Loan Controller</h3>
            <p className="text-gray-500 text-sm">Smooth $5 increments across all networks</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">Linked</span>
            <button
              onClick={() => setLinkedMode(!linkedMode)}
              className={`p-2 rounded-lg transition-all ${linkedMode ? 'bg-[#00F0FF]/20 text-[#00F0FF]' : 'bg-gray-700 text-gray-400'}`}
              title={linkedMode ? 'Allocations linked to total' : 'Allocations independent'}
            >
              {linkedMode ? <Link2 className="h-5 w-5" /> : <Unlink className="h-5 w-5" />}
            </button>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 bg-gray-900/80 px-4 py-3 rounded-xl border border-[#FFD700]/40 shadow-inner">
              <DollarSign className="w-6 h-6 text-[#FFD700]" />
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                className="text-[#FFD700] font-mono text-3xl font-bold tracking-tight bg-transparent border-none outline-none w-36 text-right"
                aria-label="Total Flash Loan Amount"
              />
            </div>
            <span className="text-gray-500 text-xs mt-1">Click to type exact amount</span>
          </div>
        </div>
      </div>

      {/* Actual Borrowing Summary */}
      <div className="mb-6 p-4 bg-gradient-to-r from-[#00FF88]/10 to-[#00F0FF]/10 rounded-lg border border-[#00FF88]/30">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-5 w-5 text-[#00FF88]" />
          <span className="text-white font-semibold">Actual Borrowing Breakdown</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-xs mb-1">Total Borrowed</div>
            <div className="text-[#00FF88] font-mono font-bold text-lg">
              {formatExactValue(totalValue)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">Flash Loan Fee (0.09%)</div>
            <div className="text-yellow-400 font-mono font-bold text-lg">
              {formatExactValue(flashLoanFee)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">Total Repayment</div>
            <div className="text-[#00F0FF] font-mono font-bold text-lg">
              {formatExactValue(totalRepayment)}
            </div>
          </div>
        </div>
      </div>

      {/* Master Slider Section */}
      <div className="relative pt-4 pb-12 mb-6">
        {/* Slide rule markings - more detailed for smooth sliding */}
        <div className="absolute top-0 left-0 right-0 h-6 flex justify-between items-end px-0">
          {Array.from({ length: 101 }).map((_, i) => (
            <div 
              key={i} 
              className={`${
                i % 25 === 0 ? 'w-0.5 h-6 bg-gray-400' : 
                i % 10 === 0 ? 'w-0.5 h-4 bg-gray-500' : 
                i % 5 === 0 ? 'w-px h-3 bg-gray-600' :
                'w-px h-1.5 bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="absolute top-8 left-0 right-0 h-6 bg-gradient-to-r from-[#00FF88] via-[#00F0FF] via-[#FFD700] to-[#FF6B00] rounded-full border border-gray-600 opacity-60" />

        {/* Range input - smooth sliding with $5 steps */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={totalValue}
          onChange={handleMasterSliderChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          title="Master flash loan size"
          className="absolute top-6 w-full h-12 cursor-pointer z-20 accent-[#FFD700]"
          aria-label="Master Flash Loan Size"
        />

        {/* Tick labels */}
        <div className="absolute top-[5rem] left-0 right-0 flex justify-between">
          {tickMarks.map((tick) => (
            <button
              key={tick}
              onClick={() => onTotalChange(tick)}
              className={`text-xs font-mono font-semibold transition-all hover:text-[#FFD700] hover:scale-110 ${
                totalValue >= tick ? 'text-[#00FF88]' : 'text-gray-500'
              }`}
            >
              {formatTickLabel(tick)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick select buttons */}
      <div className="flex gap-2 mb-4">
        {[50000, 100000, 250000, 500000, 1000000].map((preset) => (
          <button
            key={preset}
            onClick={() => onTotalChange(preset)}
            className={`flex-1 py-3 px-2 rounded-lg text-sm font-bold transition-all ${
              totalValue === preset
                ? 'bg-gradient-to-r from-[#FFD700] to-[#FF8C00] text-gray-900 shadow-lg shadow-[#FFD700]/30'
                : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            {formatValue(preset)}
          </button>
        ))}
      </div>

      {/* Fine-tune controls */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <button
          onClick={() => onTotalChange(Math.max(min, totalValue - 1000))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$1K
        </button>
        <button
          onClick={() => onTotalChange(Math.max(min, totalValue - 100))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$100
        </button>
        <button
          onClick={() => onTotalChange(Math.max(min, totalValue - 5))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$5
        </button>
        <span className="text-gray-500 px-2">|</span>
        <button
          onClick={() => onTotalChange(Math.min(max, totalValue + 5))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$5
        </button>
        <button
          onClick={() => onTotalChange(Math.min(max, totalValue + 100))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$100
        </button>
        <button
          onClick={() => onTotalChange(Math.min(max, totalValue + 1000))}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$1K
        </button>
      </div>

      {/* Network Allocation Sliders */}
      <div className="border-t border-gray-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-white font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#00F0FF]" />
            Network Allocation (Exact Amounts)
          </h4>
          <button
            onClick={resetToDefault}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Reset to Default
          </button>
        </div>

        <div className="space-y-4">
          {allocations.map((alloc, index) => (
            <div key={alloc.network} className={`p-4 rounded-lg border transition-all ${alloc.enabled ? 'bg-gray-900/60 border-gray-700' : 'bg-gray-900/30 border-gray-800 opacity-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div 
                    className={`w-4 h-4 rounded-full ${NETWORK_COLOR_CLASSES[alloc.network]?.split(' ')[0] ?? 'bg-gray-500'}`}
                  />
                  <span className="text-white font-medium">{alloc.label}</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${NETWORK_COLOR_CLASSES[alloc.network]?.split(' ').slice(1).join(' ') ?? 'text-gray-300 border-gray-600'}`}
                  >
                    {alloc.percentage.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  {/* Editable amount input */}
                  <div className="flex items-center bg-gray-800 rounded-lg px-2 py-1 border border-gray-600">
                    <span className="text-gray-400 text-sm">$</span>
                    <input
                      type="text"
                      value={alloc.amount.toFixed(2)}
                      onChange={(e) => handleNetworkInputChange(index, e.target.value)}
                      disabled={!alloc.enabled}
                      title={`${alloc.label} allocation amount`}
                      className={`w-24 bg-transparent text-right font-mono font-bold outline-none disabled:opacity-50 ${NETWORK_COLOR_CLASSES[alloc.network]?.split(' ')[1] ?? 'text-white'}`}
                    />
                  </div>
                  <Switch
                    checked={alloc.enabled}
                    onCheckedChange={() => toggleNetwork(index)}
                  />
                </div>
              </div>
              
              {/* Network slider with $5 increments */}
              <div className="relative h-4">
                <div className="absolute inset-0 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-200 ${NETWORK_COLOR_CLASSES[alloc.network]?.split(' ')[0] ?? 'bg-gray-500'}`}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={linkedMode ? totalValue : max}
                  step={step}
                  value={alloc.amount}
                  onChange={(e) => handleNetworkSliderChange(index, Number(e.target.value))}
                  disabled={!alloc.enabled}
                  title={`${alloc.label} allocation slider`}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
              
              {/* Network fine-tune buttons */}
              {alloc.enabled && (
                <div className="flex items-center justify-center gap-1 mt-2">
                  <button
                    onClick={() => handleNetworkSliderChange(index, Math.max(0, alloc.amount - 100))}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded text-xs transition-colors"
                  >
                    -$100
                  </button>
                  <button
                    onClick={() => handleNetworkSliderChange(index, Math.max(0, alloc.amount - 5))}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded text-xs transition-colors"
                  >
                    -$5
                  </button>
                  <button
                    onClick={() => handleNetworkSliderChange(index, Math.min(linkedMode ? totalValue : max, alloc.amount + 5))}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded text-xs transition-colors"
                  >
                    +$5
                  </button>
                  <button
                    onClick={() => handleNetworkSliderChange(index, Math.min(linkedMode ? totalValue : max, alloc.amount + 100))}
                    className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded text-xs transition-colors"
                  >
                    +$100
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Allocation Summary - Shows exact amounts */}
        <div className="mt-4 p-4 bg-gray-900/40 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Allocated:</span>
            <span className={`font-mono font-bold ${Math.abs(totalAllocated - totalValue) < 1 ? 'text-green-400' : 'text-yellow-400'}`}>
              {formatExactValue(totalAllocated)} / {formatExactValue(totalValue)}
            </span>
          </div>
          
          {/* Breakdown by network */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-700">
            {allocations.filter(a => a.enabled).map(alloc => (
              <div key={alloc.network} className="text-center">
                <div className="text-xs text-gray-500">{alloc.label}</div>
                <div className={`font-mono text-sm font-bold ${NETWORK_COLOR_CLASSES[alloc.network]?.split(' ')[1] ?? 'text-white'}`}>
                  {formatExactValue(alloc.amount)}
                </div>
              </div>
            ))}
          </div>
          
          {Math.abs(totalAllocated - totalValue) > 1 && (
            <div className="flex items-center gap-2 mt-3 text-yellow-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Allocation doesn't match total ({formatExactValue(Math.abs(totalAllocated - totalValue))} difference). Enable linked mode for auto-balance.</span>
            </div>
          )}
        </div>
      </div>

      {/* Estimated Returns */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-400 text-sm">Est. Daily Return</span>
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-gray-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                Based on 0.2% average daily return
              </div>
            </div>
          </div>
          <div className="text-green-400 font-bold text-xl">
            +{formatExactValue(estimatedDailyReturn)}
          </div>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-gray-400 text-sm">Est. Monthly Return</span>
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-gray-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                Based on 6% average monthly return
              </div>
            </div>
          </div>
          <div className="text-green-400 font-bold text-xl">
            +{formatExactValue(estimatedMonthlyReturn)}
          </div>
        </div>
      </div>

      {/* Info text */}
      <p className="text-gray-500 text-sm mt-4 text-center">
        Slide smoothly in $5 increments or type exact amounts. Network allocations show precisely how much you're borrowing on each chain.
      </p>
    </div>
  );
};
