import React, { useState } from 'react';
import {
  AlertTriangle,
  Shield,
  CheckCircle,
  XCircle,
  Wallet,
  Activity,
  Clock,
  DollarSign,
  AlertCircle,
  Lock,
  Unlock,
  FileText,
} from 'lucide-react';

interface LiveTradingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentBalance?: number;
  minBalanceRequired: number;
  maxDailyLoss: number;
  circuitBreakerEnabled: boolean;
}

export const LiveTradingConfirmationModal: React.FC<LiveTradingConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentBalance,
  minBalanceRequired,
  maxDailyLoss,
  circuitBreakerEnabled,
}) => {
  const [step, setStep] = useState(1);
  const [acknowledgments, setAcknowledgments] = useState({
    understandRisks: false,
    verifiedWallet: false,
    acceptLoss: false,
    confirmedSettings: false,
    finalConfirmation: false,
  });
  const [confirmationText, setConfirmationText] = useState('');

  if (!isOpen) return null;

  const allAcknowledged = Object.values(acknowledgments).every(Boolean);
  const confirmationValid = confirmationText.toLowerCase() === 'enable live trading';

  const handleConfirm = () => {
    if (allAcknowledged && confirmationValid) {
      onConfirm();
      // Reset state
      setStep(1);
      setAcknowledgments({
        understandRisks: false,
        verifiedWallet: false,
        acceptLoss: false,
        confirmedSettings: false,
        finalConfirmation: false,
      });
      setConfirmationText('');
    }
  };

  const handleClose = () => {
    setStep(1);
    setAcknowledgments({
      understandRisks: false,
      verifiedWallet: false,
      acceptLoss: false,
      confirmedSettings: false,
      finalConfirmation: false,
    });
    setConfirmationText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-900 border border-red-500/50 rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-2xl shadow-red-500/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-900/50 to-orange-900/50 p-6 border-b border-red-500/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500/20 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Enable Live Trading</h2>
              <p className="text-red-300">This action will use real funds for trading</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Warning Banner */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-red-400 font-semibold">Critical Warning</h3>
                <p className="text-gray-300 text-sm mt-1">
                  Enabling live trading will execute real transactions using your wallet funds. 
                  Cryptocurrency trading involves significant risk of loss. Only proceed if you 
                  fully understand and accept these risks.
                </p>
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-5 w-5 text-blue-400" />
                <span className="text-gray-400 text-sm">Wallet Balance</span>
              </div>
              <p className={`text-xl font-bold ${
                currentBalance && currentBalance >= minBalanceRequired 
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}>
                {currentBalance !== undefined ? `${currentBalance.toFixed(4)} ETH` : 'Not checked'}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Min required: {minBalanceRequired} ETH
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-yellow-400" />
                <span className="text-gray-400 text-sm">Circuit Breaker</span>
              </div>
              <p className={`text-xl font-bold ${
                circuitBreakerEnabled ? 'text-green-400' : 'text-red-400'
              }`}>
                {circuitBreakerEnabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Max daily loss: ${maxDailyLoss}
              </p>
            </div>
          </div>

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-3 h-3 rounded-full transition-colors ${
                  step >= s ? 'bg-red-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Step 1: Risk Acknowledgments */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-yellow-400" />
                Step 1: Acknowledge Risks
              </h3>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={acknowledgments.understandRisks}
                    onChange={(e) => setAcknowledgments(prev => ({ ...prev, understandRisks: e.target.checked }))}
                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                  />
                  <div>
                    <p className="text-white font-medium">I understand the risks of automated trading</p>
                    <p className="text-gray-400 text-sm">
                      I acknowledge that automated trading can result in significant financial losses, 
                      including the potential loss of my entire investment.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={acknowledgments.verifiedWallet}
                    onChange={(e) => setAcknowledgments(prev => ({ ...prev, verifiedWallet: e.target.checked }))}
                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                  />
                  <div>
                    <p className="text-white font-medium">I have verified my wallet configuration</p>
                    <p className="text-gray-400 text-sm">
                      I confirm that the connected wallet is correct and I have sole control over its private keys.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={acknowledgments.acceptLoss}
                    onChange={(e) => setAcknowledgments(prev => ({ ...prev, acceptLoss: e.target.checked }))}
                    className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                  />
                  <div>
                    <p className="text-white font-medium">I accept potential losses</p>
                    <p className="text-gray-400 text-sm">
                      I understand that I may lose funds due to market conditions, slippage, gas costs, 
                      smart contract risks, or other unforeseen circumstances.
                    </p>
                  </div>
                </label>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!acknowledgments.understandRisks || !acknowledgments.verifiedWallet || !acknowledgments.acceptLoss}
                className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
              >
                Continue to Safety Settings
              </button>
            </div>
          )}

          {/* Step 2: Safety Settings Confirmation */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-yellow-400" />
                Step 2: Confirm Safety Settings
              </h3>

              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Wallet Balance Check</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Minimum Balance Required</span>
                  <span className="text-white">{minBalanceRequired} ETH</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Auto-Fallback to Simulation</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Circuit Breaker</span>
                  <span className={circuitBreakerEnabled ? 'text-green-400' : 'text-red-400'}>
                    {circuitBreakerEnabled ? (
                      <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Enabled</span>
                    ) : (
                      <span className="flex items-center gap-1"><XCircle className="h-4 w-4" /> Disabled</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Max Daily Loss Limit</span>
                  <span className="text-white">${maxDailyLoss}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Transaction Monitoring</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Enabled
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
                <input
                  type="checkbox"
                  checked={acknowledgments.confirmedSettings}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, confirmedSettings: e.target.checked }))}
                  className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                />
                <div>
                  <p className="text-white font-medium">I have reviewed and accept these safety settings</p>
                  <p className="text-gray-400 text-sm">
                    I understand how these safety mechanisms work and accept the configured limits.
                  </p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!acknowledgments.confirmedSettings}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  Final Confirmation
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Final Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-400" />
                Step 3: Final Confirmation
              </h3>

              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-300 text-center">
                  You are about to enable <strong>LIVE TRADING</strong> with real funds.
                  <br />
                  This action cannot be undone automatically.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 cursor-pointer hover:border-gray-600 transition-colors">
                <input
                  type="checkbox"
                  checked={acknowledgments.finalConfirmation}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, finalConfirmation: e.target.checked }))}
                  className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                />
                <div>
                  <p className="text-white font-medium">I confirm I want to enable live trading</p>
                  <p className="text-gray-400 text-sm">
                    I have read all warnings, understand the risks, and wish to proceed with live trading.
                  </p>
                </div>
              </label>

              <div>
                <label className="text-gray-400 text-sm block mb-2">
                  Type <span className="text-red-400 font-mono">"ENABLE LIVE TRADING"</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type confirmation text..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                />
                {confirmationText && !confirmationValid && (
                  <p className="text-red-400 text-xs mt-1">
                    Please type exactly: ENABLE LIVE TRADING
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!allAcknowledged || !confirmationValid}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Unlock className="h-5 w-5" />
                  Enable Live Trading
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex justify-between items-center">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <p className="text-gray-500 text-xs">
            Your acknowledgment will be recorded for audit purposes
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveTradingConfirmationModal;
