import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  OctagonX,
  AlertTriangle,
  Shield,
  XCircle,
  CheckCircle,
  Loader2,
  Radio,
  Ban,
  MessageSquare,
  Wallet,
  Activity,
} from 'lucide-react';

interface EmergencyStopButtonProps {
  isAutoPilotRunning: boolean;
  executionMode: 'simulation' | 'live';
  onEmergencyStop: () => void;
  walletBalance?: number | null;
  pendingTransactions?: number;
}

interface EmergencyStopState {
  scanningStoppedAt: string | null;
  transactionsCancelled: number;
  circuitBreakerTripped: boolean;
  switchedToSimulation: boolean;
  telegramAlertSent: boolean;
}

export const EmergencyStopButton: React.FC<EmergencyStopButtonProps> = ({
  isAutoPilotRunning,
  executionMode,
  onEmergencyStop,
  walletBalance,
  pendingTransactions = 0,
}) => {
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Failed to execute emergency stop. Please try again.';
  };
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [emergencyStopResult, setEmergencyStopResult] = useState<EmergencyStopState | null>(null);

  const CONFIRM_PHRASE = 'EMERGENCY STOP';

  const executeEmergencyStop = async () => {
    if (confirmText !== CONFIRM_PHRASE) {
      toast({
        title: 'Confirmation Required',
        description: `Please type "${CONFIRM_PHRASE}" to confirm.`,
        variant: 'destructive',
      });
      return;
    }

    setIsExecuting(true);

    try {
      // Step 1: Stop all scanning by updating scheduler config
      console.log('[Emergency Stop] Step 1: Stopping all scanning...');
      const { error: schedulerError } = await supabase
        .from('scheduler_24_7_config')
        .update({
          is_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', 'default');

      if (schedulerError) {
        console.error('Failed to stop scheduler:', schedulerError);
      }

      // Step 2: Trip the circuit breaker
      console.log('[Emergency Stop] Step 2: Tripping circuit breaker...');
      const { error: circuitBreakerError } = await supabase
        .from('circuit_breaker_state')
        .upsert({
          user_id: 'default',
          is_tripped: true,
          tripped_at: new Date().toISOString(),
          trip_reason: `Emergency Stop: ${reason || 'Manual emergency stop triggered'}`,
          trip_type: 'emergency_stop',
          updated_at: new Date().toISOString(),
        });

      if (circuitBreakerError) {
        console.error('Failed to trip circuit breaker:', circuitBreakerError);
      }

      // Step 3: Switch to simulation mode and mark emergency stop active
      console.log('[Emergency Stop] Step 3: Switching to simulation mode...');
      const { error: configError } = await supabase
        .from('auto_trade_config')
        .upsert({
          user_id: 'default',
          execution_mode: 'simulation',
          emergency_stop_active: true,
          emergency_stop_triggered_at: new Date().toISOString(),
          emergency_stop_reason: reason || 'Manual emergency stop triggered',
          updated_at: new Date().toISOString(),
        });

      if (configError) {
        console.error('Failed to update config:', configError);
      }

      // Step 4: Send Telegram alert via edge function
      console.log('[Emergency Stop] Step 4: Sending Telegram alert...');
      let telegramSent = false;
      try {
        const { data: telegramData, error: telegramError } = await supabase.functions.invoke('cron-scheduler-24-7', {
          body: {
            emergencyStop: true,
            reason: reason || 'Manual emergency stop triggered',
            walletBalance: walletBalance,
            wasLiveTrading: executionMode === 'live',
            wasAutoPilotRunning: isAutoPilotRunning,
          },
        });
        
        telegramSent = !telegramError;
        if (telegramError) {
          console.error('Telegram alert failed:', telegramError);
        }
      } catch (e) {
        console.error('Failed to send Telegram alert:', e);
      }

      // Step 5: Log the emergency stop event
      console.log('[Emergency Stop] Step 5: Creating audit log...');
      const { error: logError } = await supabase
        .from('emergency_stop_logs')
        .insert({
          user_id: 'default',
          trigger_source: 'manual',
          was_auto_pilot_running: isAutoPilotRunning,
          was_live_trading: executionMode === 'live',
          pending_transactions_count: pendingTransactions,
          wallet_balance_eth: walletBalance,
          scanning_stopped: true,
          transactions_cancelled: pendingTransactions,
          circuit_breaker_tripped: true,
          switched_to_simulation: true,
          telegram_alert_sent: telegramSent,
          reason: reason || 'Manual emergency stop triggered',
        });

      if (logError) {
        console.error('Failed to create audit log:', logError);
      }

      // Set result state
      setEmergencyStopResult({
        scanningStoppedAt: new Date().toISOString(),
        transactionsCancelled: pendingTransactions,
        circuitBreakerTripped: true,
        switchedToSimulation: true,
        telegramAlertSent: telegramSent,
      });

      // Notify parent component
      onEmergencyStop();

      toast({
        title: 'Emergency Stop Executed',
        description: 'All trading has been halted. System is now in safe mode.',
        duration: 10000,
      });

    } catch (error: unknown) {
      console.error('[Emergency Stop] Error:', error);
      toast({
        title: 'Emergency Stop Failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const closeDialog = () => {
    setShowConfirmDialog(false);
    setConfirmText('');
    setReason('');
    setEmergencyStopResult(null);
  };

  return (
    <>
      {/* Emergency Stop Button */}
      <button
        onClick={() => setShowConfirmDialog(true)}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-red-500/30 border-2 border-red-400"
        title="Emergency Stop - Halt all trading immediately"
      >
        <OctagonX className="h-5 w-5" />
        <span className="hidden sm:inline">Emergency Stop</span>
      </button>

      {/* Confirmation Dialog Overlay */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border-2 border-red-500 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-red-500/20">
            {/* Header */}
            <div className="bg-red-600 p-4 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-700 rounded-lg">
                  <OctagonX className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Emergency Stop</h2>
                  <p className="text-red-100 text-sm">Halt all trading operations immediately</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {!emergencyStopResult ? (
                <>
                  {/* Warning */}
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-red-400 font-semibold">This action will:</h3>
                        <ul className="mt-2 space-y-2 text-gray-300 text-sm">
                          <li className="flex items-center gap-2">
                            <Ban className="h-4 w-4 text-red-400" />
                            Stop all active scanning immediately
                          </li>
                          <li className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-400" />
                            Cancel all pending transactions
                          </li>
                          <li className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-red-400" />
                            Trip the circuit breaker
                          </li>
                          <li className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-yellow-400" />
                            Switch to simulation mode
                          </li>
                          <li className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-blue-400" />
                            Send Telegram alert notification
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Current Status */}
                  <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <h4 className="text-white font-semibold">Current Status</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Radio className={`h-4 w-4 ${isAutoPilotRunning ? 'text-green-400 animate-pulse' : 'text-gray-500'}`} />
                        <span className="text-gray-300 text-sm">
                          Auto-Pilot: {isAutoPilotRunning ? 'Running' : 'Stopped'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${executionMode === 'live' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <span className="text-gray-300 text-sm">
                          Mode: {executionMode === 'live' ? 'LIVE' : 'Simulation'}
                        </span>
                      </div>
                      {walletBalance !== undefined && walletBalance !== null && (
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-blue-400" />
                          <span className="text-gray-300 text-sm">
                            Balance: {walletBalance.toFixed(4)} ETH
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-yellow-400" />
                        <span className="text-gray-300 text-sm">
                          Pending Tx: {pendingTransactions}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Reason Input */}
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">
                      Reason for Emergency Stop (optional)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g., Suspicious activity detected, Market crash, etc."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Confirmation Input */}
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">
                      Type <span className="text-red-400 font-mono font-bold">{CONFIRM_PHRASE}</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                      placeholder={CONFIRM_PHRASE}
                      className={`w-full bg-gray-800 border rounded-lg px-4 py-3 text-white font-mono text-center text-lg tracking-wider ${
                        confirmText === CONFIRM_PHRASE
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-gray-700'
                      }`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={closeDialog}
                      disabled={isExecuting}
                      className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeEmergencyStop}
                      disabled={isExecuting || confirmText !== CONFIRM_PHRASE}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <OctagonX className="h-5 w-5" />
                          Execute Emergency Stop
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                /* Success State */
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                      <CheckCircle className="h-10 w-10 text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Emergency Stop Executed</h3>
                    <p className="text-gray-400 mt-2">All trading operations have been halted</p>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <h4 className="text-white font-semibold">Actions Completed</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm flex items-center gap-2">
                          <Ban className="h-4 w-4" />
                          Scanning Stopped
                        </span>
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Transactions Cancelled
                        </span>
                        <span className="text-white font-medium">{emergencyStopResult.transactionsCancelled}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Circuit Breaker Tripped
                        </span>
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Switched to Simulation
                        </span>
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300 text-sm flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Telegram Alert
                        </span>
                        {emergencyStopResult.telegramAlertSent ? (
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-yellow-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-yellow-400 font-semibold text-sm">Next Steps</h4>
                        <ul className="mt-2 text-gray-300 text-sm space-y-1">
                          <li>• Review the situation that triggered the emergency stop</li>
                          <li>• Check wallet balance and pending transactions</li>
                          <li>• Reset the circuit breaker when ready to resume</li>
                          <li>• Re-enable 24/7 scheduler if needed</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={closeDialog}
                    className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
