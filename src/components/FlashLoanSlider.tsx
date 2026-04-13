import React, { useState, useRef, useCallback } from 'react';
import { DollarSign, Zap, Info } from 'lucide-react';

interface FlashLoanSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const FlashLoanSlider: React.FC<FlashLoanSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 1000000,
  step = 5 // Default to $5 increments for smooth sliding
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const sliderRef = useRef<HTMLDivElement>(null);

  const tickMarks = [0, 100000, 250000, 500000, 750000, 1000000];
  
  const formatValue = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  };

  const formatTickLabel = (val: number) => {
    if (val === 0) return '$0';
    if (val >= 1000000) return '$1M';
    return `$${val / 1000}K`;
  };

  const percentage = ((value - min) / (max - min)) * 100;

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    onChange(newValue);
    setInputValue(newValue.toString());
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    setInputValue(rawValue);
  };

  const handleInputBlur = () => {
    let numValue = parseInt(inputValue) || 0;
    // Clamp to min/max
    numValue = Math.max(min, Math.min(max, numValue));
    // Round to nearest step
    numValue = Math.round(numValue / step) * step;
    onChange(numValue);
    setInputValue(numValue.toString());
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    }
  };

  // Calculate estimated returns based on loan size
  const estimatedDailyReturn = value * 0.002; // 0.2% daily return estimate
  const estimatedMonthlyReturn = value * 0.06; // 6% monthly return estimate

  // Calculate the actual borrowed amount (this is what you're really borrowing)
  const actualBorrowedAmount = value;
  const flashLoanFee = value * 0.0009; // 0.09% Aave flash loan fee
  const totalRepayment = value + flashLoanFee;

  return (
    <div className="bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-[#FFD700]/30 to-[#FF8C00]/20 rounded-xl shadow-lg shadow-[#FFD700]/10">
            <Zap className="w-7 h-7 text-[#FFD700]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-xl">Flash Loan Size</h3>
            <p className="text-gray-500 text-sm">Slide smoothly in $5 increments</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 bg-gray-900/80 px-4 py-3 rounded-xl border border-[#FFD700]/40 shadow-inner">
            <DollarSign className="w-6 h-6 text-[#FFD700]" />
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              className="text-[#FFD700] font-mono text-3xl font-bold tracking-tight bg-transparent border-none outline-none w-40 text-right"
              aria-label="Flash Loan Amount"
            />
          </div>
          <span className="text-gray-500 text-xs">Click to type exact amount</span>
        </div>
      </div>

      {/* Actual Borrowing Info */}
      <div className="mb-6 p-4 bg-gradient-to-r from-[#00FF88]/10 to-[#00F0FF]/10 rounded-lg border border-[#00FF88]/30">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-xs mb-1">Actual Borrowed</div>
            <div className="text-[#00FF88] font-mono font-bold text-lg">
              ${actualBorrowedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">Flash Loan Fee (0.09%)</div>
            <div className="text-yellow-400 font-mono font-bold text-lg">
              ${flashLoanFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">Total Repayment</div>
            <div className="text-[#00F0FF] font-mono font-bold text-lg">
              ${totalRepayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Slider Section */}
      <div className="relative pt-4 pb-12" ref={sliderRef}>
        {/* Slide rule markings - top (more detailed for smooth sliding feel) */}
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

        {/* Track background */}
        <div className="absolute top-8 left-0 right-0 h-5 bg-gray-700/80 rounded-full overflow-hidden border border-gray-600">
          <div 
            className="h-full rounded-full"
            style={{ 
              width: `${percentage}%`,
              background: 'linear-gradient(90deg, #00FF88 0%, #00F0FF 40%, #FFD700 80%, #FF6B00 100%)',
              transition: isDragging ? 'none' : 'width 0.1s ease-out'
            }}
          />
        </div>

        {/* Range input - smooth sliding */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="absolute top-6 w-full h-10 opacity-0 cursor-pointer z-20"
          aria-label="Flash Loan Size"
        />

        {/* Custom thumb */}
        <div 
          className={`absolute top-6 w-10 h-10 -ml-5 rounded-full border-[3px] pointer-events-none ${
            isDragging 
              ? 'bg-[#FFD700] border-white scale-125 shadow-xl shadow-[#FFD700]/60' 
              : 'bg-white border-[#FFD700] hover:scale-110 shadow-lg'
          }`}
          style={{ 
            left: `${percentage}%`,
            transition: isDragging ? 'transform 0.05s' : 'all 0.1s ease-out'
          }}
        >
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#FFD700] to-[#FF8C00]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-5 bg-white/40 rounded-full" />
          </div>
        </div>

        {/* Tick labels */}
        <div className="absolute top-[4.5rem] left-0 right-0 flex justify-between">
          {tickMarks.map((tick) => (
            <button
              key={tick}
              onClick={() => {
                onChange(tick);
                setInputValue(tick.toString());
              }}
              className={`text-xs font-mono font-semibold transition-all hover:text-[#FFD700] hover:scale-110 ${
                value >= tick ? 'text-[#00FF88]' : 'text-gray-500'
              }`}
            >
              {formatTickLabel(tick)}
            </button>
          ))}
        </div>
      </div>

      {/* Quick select buttons */}
      <div className="flex gap-2 mt-4">
        {[50000, 100000, 250000, 500000, 1000000].map((preset) => (
          <button
            key={preset}
            onClick={() => {
              onChange(preset);
              setInputValue(preset.toString());
            }}
            className={`flex-1 py-3 px-2 rounded-lg text-sm font-bold transition-all ${
              value === preset
                ? 'bg-gradient-to-r from-[#FFD700] to-[#FF8C00] text-gray-900 shadow-lg shadow-[#FFD700]/30'
                : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-white'
            }`}
          >
            {formatValue(preset)}
          </button>
        ))}
      </div>

      {/* Fine-tune controls */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          onClick={() => {
            const newVal = Math.max(min, value - 1000);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$1K
        </button>
        <button
          onClick={() => {
            const newVal = Math.max(min, value - 100);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$100
        </button>
        <button
          onClick={() => {
            const newVal = Math.max(min, value - 5);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          -$5
        </button>
        <span className="text-gray-500 px-2">|</span>
        <button
          onClick={() => {
            const newVal = Math.min(max, value + 5);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$5
        </button>
        <button
          onClick={() => {
            const newVal = Math.min(max, value + 100);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$100
        </button>
        <button
          onClick={() => {
            const newVal = Math.min(max, value + 1000);
            onChange(newVal);
            setInputValue(newVal.toString());
          }}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-medium transition-colors"
        >
          +$1K
        </button>
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
            +${estimatedDailyReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            +${estimatedMonthlyReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Info text */}
      <p className="text-gray-500 text-sm mt-4 text-center">
        Slide smoothly or use fine-tune buttons. Higher loan amounts unlock larger arbitrage opportunities.
      </p>
    </div>
  );
};
