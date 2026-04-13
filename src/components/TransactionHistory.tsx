import React, { useState } from 'react';
import { Transaction } from '../types/arbitrage';

interface Props {
  transactions: Transaction[];
}

export const TransactionHistory: React.FC<Props> = ({ transactions }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white text-xl font-bold">Transaction History</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="text-left text-gray-400 text-xs font-medium p-3">Pair</th>
              <th className="text-left text-gray-400 text-xs font-medium p-3">DEX Route</th>
              <th className="text-right text-gray-400 text-xs font-medium p-3">Profit</th>
              <th className="text-right text-gray-400 text-xs font-medium p-3">Gas</th>
              <th className="text-right text-gray-400 text-xs font-medium p-3">Net</th>
              <th className="text-center text-gray-400 text-xs font-medium p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                className="border-t border-gray-700 hover:bg-gray-750 cursor-pointer transition-colors"
              >
                <td className="p-3 text-white font-mono text-sm">{tx.tokenPair}</td>
                <td className="p-3 text-gray-300 text-sm">{tx.dexPair}</td>
                <td className="p-3 text-[#00FF88] font-mono text-sm text-right">${(tx.profitUSD || 0).toFixed(2)}</td>
                <td className="p-3 text-red-400 font-mono text-sm text-right">${(tx.gasCost || 0).toFixed(2)}</td>
                <td className={`p-3 font-mono text-sm text-right font-bold ${(tx.netProfit || 0) > 0 ? 'text-[#00FF88]' : 'text-red-500'}`}>
                  ${(tx.netProfit || 0).toFixed(2)}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    tx.status === 'success' ? 'bg-[#00FF88]/20 text-[#00FF88]' :
                    tx.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                    'bg-yellow-500/20 text-yellow-500'
                  }`}>
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
