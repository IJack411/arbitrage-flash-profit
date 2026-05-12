import React, { useState } from 'react';
import { ArbitrageOpportunity } from '../types/arbitrage';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowRight, Zap, Globe } from 'lucide-react';
import { dexLogos } from '../data/dexAssets';

interface OpportunityCardProps {
  opportunity: ArbitrageOpportunity;
  onExecute: (id: string) => void;
  disabled?: boolean;
}


import { NETWORK_INFO } from '../types/multiWallet';
// If you need NetworkName, CORE_BASE_TOKENS, etc, import from '../shared/networks-tokens'

const networkBadgeClasses: Record<string, string> = {
  ethereum: 'bg-blue-500/20 text-blue-400',
  polygon: 'bg-purple-500/20 text-purple-400',
  arbitrum: 'bg-cyan-500/20 text-cyan-400',
  bsc: 'bg-yellow-500/20 text-yellow-400',
  base: 'bg-indigo-500/20 text-indigo-400',
};

export const OpportunityCard: React.FC<OpportunityCardProps> = ({ opportunity, onExecute, disabled = false }) => {
  const [executing, setExecuting] = useState(false);

  const handleExecute = async () => {
    setExecuting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      onExecute(opportunity.id);
    } catch (error) {
      console.error('Execution failed:', error);
    } finally {
      setExecuting(false);
    }
  };

  const isProfitable = opportunity.netProfit > 0;
  const network = opportunity.network || 'ethereum';
  const executableLoanAmount = opportunity.executableLoanAmount || opportunity.loanAmount;
  const confidenceTier = opportunity.confidenceTier || (opportunity.confidenceScore && opportunity.confidenceScore >= 80
    ? 'high'
    : opportunity.confidenceScore && opportunity.confidenceScore >= 60
      ? 'medium'
      : 'low');
  const confidenceTierClasses: Record<'high' | 'medium' | 'low', string> = {
    high: 'bg-green-500/20 text-green-300',
    medium: 'bg-yellow-500/20 text-yellow-300',
    low: 'bg-red-500/20 text-red-300',
  };

  return (
    <Card className="bg-gray-800 border-gray-700 p-4 hover:border-[#00F0FF] transition-all">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-white font-bold text-lg">{opportunity.tokenPair}</h3>
          <p className="text-gray-400 text-sm">Exec Size: ${executableLoanAmount.toFixed(0)} / ${opportunity.loanAmount.toFixed(0)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isProfitable ? 'default' : 'destructive'} className={isProfitable ? 'bg-green-600' : ''}>
            {opportunity.profitPercentage?.toFixed(2) || '0.00'}%
          </Badge>
          <Badge className={confidenceTierClasses[confidenceTier]}>
            {confidenceTier.toUpperCase()} {(opportunity.confidenceScore ?? 0) > 0 ? `${opportunity.confidenceScore}%` : ''}
          </Badge>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${networkBadgeClasses[network] || 'bg-gray-700 text-gray-300'}`}>
            <Globe className="w-3 h-3" />
            {NETWORK_INFO[network]?.name || network.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <img src={dexLogos[opportunity.buyDex]} alt={opportunity.buyDex} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <span className="text-gray-300 text-sm">{opportunity.buyDex}</span>
        <ArrowRight className="text-[#00F0FF] w-4 h-4" />
        <img src={dexLogos[opportunity.sellDex]} alt={opportunity.sellDex} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <span className="text-gray-300 text-sm">{opportunity.sellDex}</span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Gross Profit:</span>
          <span className="text-green-400 font-mono">${(opportunity.grossProfit ?? opportunity.profitUSD).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Gas Cost:</span>
          <span className="text-red-400 font-mono">-${opportunity.gasCost.toFixed(2)}</span>
        </div>
        {typeof opportunity.estimatedSlippageBps === 'number' && opportunity.estimatedSlippageBps > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Exec Risk:</span>
            <span className="text-amber-300 font-mono">{opportunity.estimatedSlippageBps.toFixed(0)} bps</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold border-t border-gray-700 pt-2">
          <span className="text-white">Net Profit:</span>
          <span className={isProfitable ? 'text-[#00FF88]' : 'text-red-500'}>
            ${opportunity.netProfit.toFixed(2)}
          </span>
        </div>
      </div>

      <Button onClick={handleExecute} disabled={executing || !isProfitable || disabled} className="w-full bg-[#00F0FF] hover:bg-[#00d4e6] text-gray-900">
        {executing ? 'Executing...' : 'Execute Trade'}
        <Zap className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );
};
