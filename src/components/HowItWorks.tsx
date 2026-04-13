import React from 'react';

export const HowItWorks: React.FC = () => {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-white text-2xl font-bold mb-6">How Flash Loan Arbitrage Works</h2>
      
      <div className="grid md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="w-12 h-12 bg-[#00F0FF]/20 rounded-lg flex items-center justify-center">
            <span className="text-[#00F0FF] text-2xl font-bold">1</span>
          </div>
          <h3 className="text-white text-lg font-bold">Borrow Flash Loan</h3>
          <p className="text-gray-400 text-sm">
            Instantly borrow large amounts of crypto without collateral from lending protocols like Aave or dYdX. 
            The loan must be repaid within the same transaction.
          </p>
        </div>

        <div className="space-y-3">
          <div className="w-12 h-12 bg-[#00FF88]/20 rounded-lg flex items-center justify-center">
            <span className="text-[#00FF88] text-2xl font-bold">2</span>
          </div>
          <h3 className="text-white text-lg font-bold">Execute Arbitrage</h3>
          <p className="text-gray-400 text-sm">
            Buy the asset on the DEX with the lower price and simultaneously sell it on the DEX with the higher price. 
            The bot executes both trades atomically.
          </p>
        </div>

        <div className="space-y-3">
          <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <span className="text-purple-400 text-2xl font-bold">3</span>
          </div>
          <h3 className="text-white text-lg font-bold">Repay & Profit</h3>
          <p className="text-gray-400 text-sm">
            Repay the flash loan with a small fee (typically 0.09%). Keep the remaining profit after deducting gas costs. 
            If unprofitable, the transaction reverts.
          </p>
        </div>
      </div>

      <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <h4 className="text-yellow-500 font-bold mb-2">⚠️ Risk Factors</h4>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• High gas fees can eliminate profits on small arbitrage opportunities</li>
          <li>• Price slippage during execution may reduce expected returns</li>
          <li>• MEV bots may front-run your transactions</li>
          <li>• Smart contract risks and potential exploits</li>
        </ul>
      </div>
    </div>
  );
};
