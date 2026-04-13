import React from 'react';
import { ArrowRight, Clock, DollarSign, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { CrossChainOpportunity } from '@/lib/web3/crossChainService';

interface Props {
  opportunity: CrossChainOpportunity;
  onExecute: (id: string) => void;
  disabled?: boolean;
}

const chainColors: Record<number, string> = {
  1: 'bg-blue-500', 137: 'bg-purple-500', 42161: 'bg-cyan-500', 56: 'bg-yellow-500',
};

const confidenceColors = {
  high: 'text-green-400 bg-green-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  low: 'text-red-400 bg-red-400/10',
};

export const CrossChainOpportunityCard: React.FC<Props> = ({ opportunity, onExecute, disabled }) => {
  const { token, sourceChainName, destChainName, sourceDex, destDex, bridge, bridgeFee, bridgeTime,
    buyPrice, sellPrice, netProfit, profitPercentage, tradeAmount, confidenceScore, sourceChain, destChain } = opportunity;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-[#00F0FF]/50 transition-all">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">{token}</span>
          <span className={`px-2 py-0.5 rounded text-xs ${confidenceColors[confidenceScore]}`}>
            {confidenceScore.toUpperCase()}
          </span>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${netProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${netProfit.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">{profitPercentage.toFixed(2)}%</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 bg-gray-900/50 rounded-lg p-3">
        <div className="text-center">
          <div className={`w-3 h-3 rounded-full ${chainColors[sourceChain]} mx-auto mb-1`} />
          <div className="text-white text-sm font-medium">{sourceChainName}</div>
          <div className="text-gray-400 text-xs">{sourceDex}</div>
          <div className="text-[#00F0FF] text-sm mt-1">${buyPrice.toFixed(4)}</div>
        </div>
        <div className="flex flex-col items-center px-2">
          <ArrowRight className="h-5 w-5 text-[#00F0FF]" />
          <div className="text-xs text-gray-500 mt-1">{bridge}</div>
        </div>
        <div className="text-center">
          <div className={`w-3 h-3 rounded-full ${chainColors[destChain]} mx-auto mb-1`} />
          <div className="text-white text-sm font-medium">{destChainName}</div>
          <div className="text-gray-400 text-xs">{destDex}</div>
          <div className="text-green-400 text-sm mt-1">${sellPrice.toFixed(4)}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
        <div className="bg-gray-900/50 rounded p-2 text-center">
          <Clock className="h-3 w-3 text-gray-400 mx-auto mb-1" />
          <div className="text-gray-400">~{bridgeTime}m</div>
        </div>
        <div className="bg-gray-900/50 rounded p-2 text-center">
          <DollarSign className="h-3 w-3 text-gray-400 mx-auto mb-1" />
          <div className="text-gray-400">${bridgeFee.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900/50 rounded p-2 text-center">
          <TrendingUp className="h-3 w-3 text-gray-400 mx-auto mb-1" />
          <div className="text-gray-400">{tradeAmount}</div>
        </div>
      </div>

      <button
        onClick={() => onExecute(opportunity.id)}
        disabled={disabled || netProfit <= 0}
        className="w-full bg-gradient-to-r from-[#00F0FF] to-[#00D0E0] hover:from-[#00D0E0] hover:to-[#00B0C0] disabled:from-gray-600 disabled:to-gray-700 text-gray-900 font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
      >
        <Zap className="h-4 w-4" />
        Execute Cross-Chain
      </button>
    </div>
  );
};
