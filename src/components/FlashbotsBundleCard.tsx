import React from 'react';
import { CheckCircle, XCircle, Clock, Send, RefreshCw, RotateCcw } from 'lucide-react';
import { FlashbotsBundle } from '@/lib/web3/flashbotsService';
import { resubmissionManager } from '@/lib/web3/mevOptimizer';

interface Props {
  bundle: FlashbotsBundle;
  onMonitor: (bundleHash: string) => void;
  onResubmit?: (bundleHash: string) => void;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Pending' },
  submitted: { icon: Send, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Submitted' },
  included: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Included' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Failed' },
};

const networkColors: Record<string, string> = {
  ethereum: 'bg-blue-500', polygon: 'bg-purple-500', arbitrum: 'bg-cyan-500', bsc: 'bg-yellow-500',
};

export const FlashbotsBundleCard: React.FC<Props> = ({ bundle, onMonitor, onResubmit }) => {
  const { bundleHash, targetBlocks, status, transactions, simulationResult, profitLoss, gasUsed, createdAt, network } = bundle;
  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const attemptInfo = resubmissionManager.getAttemptInfo(bundleHash);
  const canResubmit = status === 'failed' && resubmissionManager.shouldResubmit(bundleHash);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-all">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${networkColors[network]}`} />
          <span className="text-white font-mono text-sm">{bundleHash.slice(0, 10)}...{bundleHash.slice(-6)}</span>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded ${config.bg}`}>
          <StatusIcon className={`h-3 w-3 ${config.color}`} />
          <span className={`text-xs ${config.color}`}>{config.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        <div>
          <div className="text-gray-400 text-xs">Target Blocks</div>
          <div className="text-white">{targetBlocks}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs">Transactions</div>
          <div className="text-white">{transactions}</div>
        </div>
        {simulationResult && (
          <>
            <div>
              <div className="text-gray-400 text-xs">Gas Used</div>
              <div className="text-white">{(gasUsed || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs">Coinbase Diff</div>
              <div className="text-[#00F0FF]">{simulationResult.coinbaseDiff} ETH</div>
            </div>
          </>
        )}
      </div>

      {attemptInfo && status === 'failed' && (
        <div className="bg-orange-400/10 border border-orange-400/30 rounded p-2 mb-3">
          <div className="flex items-center gap-2 text-orange-400 text-sm">
            <RotateCcw className="h-4 w-4" />
            <span>Resubmit Attempt {attemptInfo.attempt}/{attemptInfo.max}</span>
          </div>
        </div>
      )}

      {profitLoss !== undefined && (
        <div className={`text-center py-2 rounded mb-3 ${profitLoss > 0 ? 'bg-green-400/10' : 'bg-red-400/10'}`}>
          <span className={`font-bold ${profitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)}
          </span>
          <span className="text-gray-400 text-sm ml-2">P/L</span>
        </div>
      )}

      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>{new Date(createdAt).toLocaleTimeString()}</span>
        <div className="flex gap-2">
          {canResubmit && onResubmit && (
            <button onClick={() => onResubmit(bundleHash)} className="flex items-center gap-1 text-orange-400 hover:text-orange-300">
              <RotateCcw className="h-3 w-3" /> Resubmit
            </button>
          )}
          {status === 'submitted' && (
            <button onClick={() => onMonitor(bundleHash)} className="flex items-center gap-1 text-[#00F0FF] hover:text-[#00D0E0]">
              <RefreshCw className="h-3 w-3" /> Monitor
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
