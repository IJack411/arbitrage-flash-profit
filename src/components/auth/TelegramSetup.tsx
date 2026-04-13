import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, Send, Copy, CheckCircle, ExternalLink, 
  RefreshCw, MessageCircle, Shield, AlertCircle,
  ArrowRight, Clock
} from 'lucide-react';
import { telegramService, TelegramLinkStatus } from '@/lib/telegramService';

interface TelegramSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type SetupStep = 'intro' | 'code' | 'verify' | 'complete';

export const TelegramSetup: React.FC<TelegramSetupProps> = ({ isOpen, onClose, onSuccess }) => {
  const { toast } = useToast();
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };
  const [step, setStep] = useState<SetupStep>('intro');
  const [linkCode, setLinkCode] = useState<string>('');
  const [codeExpiry, setCodeExpiry] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const botUsername = telegramService.getBotUsername();
  const botLink = telegramService.getBotLink();

  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setLinkCode('');
      setError(null);
      setCopied(false);
      setDemoMode(false);
    }
  }, [isOpen]);

  // Countdown timer for code expiry
  useEffect(() => {
    if (codeExpiry > 0) {
      const interval = setInterval(() => {
        const remaining = codeExpiry - Date.now();
        if (remaining <= 0) {
          setCodeExpiry(0);
          setLinkCode('');
          setError('Link code has expired. Please generate a new one.');
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [codeExpiry]);

  const handleGenerateCode = () => {
    const code = telegramService.generateLinkCode();
    const pending = telegramService.getPendingLinkCode();
    setLinkCode(code);
    setCodeExpiry(pending?.expiresAt || Date.now() + 10 * 60 * 1000);
    setStep('code');
    setError(null);
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(`/link ${linkCode}`);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Link command copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Copy failed',
        description: 'Please copy the code manually',
        variant: 'destructive',
      });
    }
  };

  const handleOpenBot = () => {
    window.open(`${botLink}?start=${linkCode}`, '_blank');
  };

  const handleVerify = async () => {
    setLoading(true);
    setError(null);

    try {
      // In demo mode, simulate successful verification
      if (demoMode) {
        const result = await telegramService.simulateLinkVerification(
          `demo_${Date.now()}`,
          'demo_user'
        );

        if (result.success) {
          setStep('complete');
          onSuccess();
        } else {
          setError(result.message);
        }
      } else {
        // In production, the edge function webhook would handle verification
        // For now, we'll show instructions to check the bot
        toast({
          title: 'Verification Pending',
          description: 'Please send the link command to the bot and wait for confirmation.',
        });
        
        // Check if already linked (in case webhook already processed)
        const status = await telegramService.loadLinkStatus();
        if (status.isLinked) {
          setStep('complete');
          onSuccess();
        } else {
          setError('Verification not yet received. Please make sure you sent the command to the bot.');
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLink = async () => {
    setDemoMode(true);
    setLoading(true);
    setError(null);

    try {
      const result = await telegramService.simulateLinkVerification(
        `demo_${Date.now()}`,
        'demo_user'
      );

      if (result.success) {
        setStep('complete');
        onSuccess();
        toast({
          title: 'Demo Mode',
          description: 'Telegram linked in demo mode. Notifications will be simulated.',
        });
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Demo link failed');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = () => {
    const remaining = Math.max(0, codeExpiry - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    if (step !== 'complete') {
      // Confirm if user wants to cancel
      if (linkCode && step !== 'intro') {
        if (!confirm('Are you sure you want to cancel? Your link code will be lost.')) {
          return;
        }
      }
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="h-5 w-5 text-[#0088cc]" />
            Link Telegram Account
          </DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {['intro', 'code', 'verify', 'complete'].map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step === s
                    ? 'bg-[#0088cc] text-white'
                    : ['intro', 'code', 'verify', 'complete'].indexOf(step) > i
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {['intro', 'code', 'verify', 'complete'].indexOf(step) > i ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div
                  className={`w-8 h-0.5 ${
                    ['intro', 'code', 'verify', 'complete'].indexOf(step) > i
                      ? 'bg-green-500'
                      : 'bg-gray-700'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Introduction */}
        {step === 'intro' && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#0088cc]/20 flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-[#0088cc]" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Telegram Notifications</h3>
                  <p className="text-sm text-gray-400">Get instant alerts on your phone</p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-300">
                <p>Link your Telegram account to receive:</p>
                <ul className="space-y-1 ml-4">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    Price alert notifications
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    Security alerts (login, 2FA changes)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    System notifications
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleGenerateCode}
                className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white"
              >
                <Send className="mr-2 h-4 w-4" />
                Get Started
              </Button>
              <Button
                onClick={handleDemoLink}
                variant="outline"
                className="w-full border-gray-700 text-gray-300 hover:bg-gray-800"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="mr-2 h-4 w-4" />
                )}
                Demo Mode (Skip Bot)
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Show Link Code */}
        {step === 'code' && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">Your link code:</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-2xl font-mono font-bold text-[#0088cc] tracking-wider">
                    {linkCode}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyCode}
                    className="text-gray-400 hover:text-white"
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-1 mt-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>Expires in {formatTimeRemaining()}</span>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4 space-y-3">
                <p className="text-sm text-gray-300 font-medium">Instructions:</p>
                <ol className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0088cc]/20 text-[#0088cc] text-xs flex items-center justify-center">1</span>
                    <span>Open Telegram and search for <strong className="text-white">@{botUsername}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0088cc]/20 text-[#0088cc] text-xs flex items-center justify-center">2</span>
                    <span>Start a chat with the bot</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0088cc]/20 text-[#0088cc] text-xs flex items-center justify-center">3</span>
                    <span>Send the command: <code className="bg-gray-900 px-1 rounded text-[#0088cc]">/link {linkCode}</code></span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleOpenBot}
                className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Telegram Bot
              </Button>
              <Button
                onClick={handleCopyCode}
                variant="outline"
                className="w-full border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                {copied ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link Command
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                onClick={handleGenerateCode}
                className="text-gray-400 hover:text-white text-sm"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                New Code
              </Button>
              <Button
                onClick={() => setStep('verify')}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                I've Sent the Command
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Verify */}
        {step === 'verify' && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#0088cc]/20 flex items-center justify-center mx-auto">
                <Loader2 className="h-8 w-8 text-[#0088cc] animate-spin" />
              </div>
              <div>
                <h3 className="text-white font-medium">Waiting for Verification</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Please send the link command to the bot and click verify below.
                </p>
              </div>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm text-center">
                Make sure you sent: <code className="bg-gray-800 px-1 rounded">/link {linkCode}</code>
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('code')}
                className="flex-1 border-gray-700 text-gray-300"
              >
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading}
                className="flex-1 bg-[#0088cc] hover:bg-[#0077b5] text-white"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Verify Link
              </Button>
            </div>

            <Button
              onClick={handleDemoLink}
              variant="ghost"
              className="w-full text-gray-400 hover:text-white text-sm"
              disabled={loading}
            >
              Skip verification (Demo Mode)
            </Button>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-4">
            <div className="p-6 bg-gray-800 rounded-lg text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="h-10 w-10 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Telegram Linked!</h3>
                <p className="text-gray-400 mt-2">
                  Your Telegram account has been successfully linked. You'll now receive notifications directly in Telegram.
                </p>
              </div>
              {demoMode && (
                <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-xs">
                    Demo mode: Notifications will be simulated locally
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={onClose}
              className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
