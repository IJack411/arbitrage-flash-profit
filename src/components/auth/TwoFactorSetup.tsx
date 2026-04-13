import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { twoFactorAuthService, TwoFactorSetupData } from '@/lib/twoFactorAuthService';
import { notificationPreferencesService } from '@/lib/notificationPreferencesService';
import {
  Loader2, Shield, QrCode, Key, Copy, Check, AlertTriangle,
  Smartphone, ChevronRight, ChevronLeft, Download, Eye, EyeOff
} from 'lucide-react';

interface TwoFactorSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type SetupStep = 'intro' | 'qrcode' | 'verify' | 'backup' | 'complete';

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ isOpen, onClose, onSuccess }) => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const [step, setStep] = useState<SetupStep>('intro');
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setSetupData(null);
      setVerificationCode('');
      setError(null);
      setCopiedSecret(false);
      setCopiedCodes(false);
      setSavedBackupCodes(false);
    }
  }, [isOpen]);

  const handleStartSetup = async () => {
    if (!profile?.email) {
      setError('Email address required for 2FA setup');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await twoFactorAuthService.setup(profile.email);
      
      if (data) {
        setSetupData(data);
        setStep('qrcode');
      } else {
        setError('Failed to generate 2FA setup. Please try again.');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!setupData || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await twoFactorAuthService.enable(
        setupData.secret,
        verificationCode,
        setupData.backupCodes
      );

      if (result.success) {
        setStep('backup');
        
        // Send security alert email
        await notificationPreferencesService.sendSecurityAlertEmail('2fa_enabled', {
          userName: profile?.displayName || profile?.email,
          backupCodes: setupData.backupCodes,
        });
      } else {
        setError(result.message || 'Invalid verification code');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (setupData?.secret) {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
      toast({ title: 'Secret copied to clipboard' });
    }
  };

  const handleCopyBackupCodes = async () => {
    if (setupData?.backupCodes) {
      const codesText = setupData.backupCodes.join('\n');
      await navigator.clipboard.writeText(codesText);
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
      toast({ title: 'Backup codes copied to clipboard' });
    }
  };

  const handleDownloadBackupCodes = () => {
    if (setupData?.backupCodes) {
      const content = `Flash Arbitrage Bot - 2FA Backup Codes
Generated: ${new Date().toLocaleString()}
Email: ${profile?.email}

IMPORTANT: Keep these codes safe! Each code can only be used once.

${setupData.backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

If you lose access to your authenticator app, use one of these codes to sign in.
`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flash-arbitrage-2fa-backup-codes.txt';
      a.click();
      URL.revokeObjectURL(url);
      setSavedBackupCodes(true);
      toast({ title: 'Backup codes downloaded' });
    }
  };

  const handleComplete = () => {
    onSuccess?.();
    onClose();
    toast({
      title: '2FA Enabled',
      description: 'Two-factor authentication is now active on your account.',
    });
  };

  const renderStep = () => {
    switch (step) {
      case 'intro':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00F0FF] to-purple-500 flex items-center justify-center">
                <Shield className="h-10 w-10 text-gray-900" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Secure Your Account
              </h3>
              <p className="text-gray-400 text-sm">
                Add an extra layer of security with two-factor authentication using an authenticator app.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                <Smartphone className="h-5 w-5 text-[#00F0FF] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Authenticator App Required</p>
                  <p className="text-xs text-gray-400">
                    Use Google Authenticator, Authy, or any TOTP-compatible app
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                <QrCode className="h-5 w-5 text-[#00F0FF] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Scan QR Code</p>
                  <p className="text-xs text-gray-400">
                    Link your authenticator app by scanning a QR code
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                <Key className="h-5 w-5 text-[#00F0FF] mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Backup Codes</p>
                  <p className="text-xs text-gray-400">
                    Get recovery codes in case you lose access to your app
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <Button
              onClick={handleStartSetup}
              disabled={loading}
              className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Get Started
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        );

      case 'qrcode':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                Scan QR Code
              </h3>
              <p className="text-gray-400 text-sm">
                Open your authenticator app and scan this QR code
              </p>
            </div>

            {setupData && (
              <>
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-lg">
                    <img
                      src={setupData.qrCodeUrl}
                      alt="2FA QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">
                    Can't scan? Enter this code manually:
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={setupData.secret}
                        readOnly
                        className="bg-gray-800 border-gray-700 text-white font-mono text-sm pr-20"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="p-1 text-gray-400 hover:text-white"
                        >
                          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={handleCopySecret}
                          className="p-1 text-gray-400 hover:text-white"
                        >
                          {copiedSecret ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('intro')}
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep('verify')}
                className="flex-1 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'verify':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                Verify Setup
              </h3>
              <p className="text-gray-400 text-sm">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification-code" className="text-gray-300">
                Verification Code
              </Label>
              <Input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="bg-gray-800 border-gray-700 text-white text-center text-2xl tracking-[0.5em] font-mono"
              />
              {setupData?.testCode && (
                <p className="text-xs text-gray-500 text-center">
                  Demo mode - current code: {setupData.testCode}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('qrcode')}
                disabled={loading}
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case 'backup':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Save Backup Codes
              </h3>
              <p className="text-gray-400 text-sm">
                Store these codes safely. You'll need them if you lose access to your authenticator app.
              </p>
            </div>

            {setupData && (
              <div className="space-y-3">
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="grid grid-cols-2 gap-2">
                    {setupData.backupCodes.map((code, index) => (
                      <div
                        key={index}
                        className="font-mono text-sm text-gray-300 bg-gray-900 px-3 py-2 rounded text-center"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopyBackupCodes}
                    className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    {copiedCodes ? (
                      <Check className="mr-2 h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadBackupCodes}
                    className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>
            )}

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                <strong>Important:</strong> Each backup code can only be used once. Store them securely and don't share them with anyone.
              </p>
            </div>

            <Button
              onClick={() => setStep('complete')}
              disabled={!savedBackupCodes && !copiedCodes}
              className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
            >
              I've Saved My Codes
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            
            {!savedBackupCodes && !copiedCodes && (
              <p className="text-xs text-gray-500 text-center">
                Please copy or download your backup codes to continue
              </p>
            )}
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-10 w-10 text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                2FA Enabled Successfully!
              </h3>
              <p className="text-gray-400 text-sm">
                Your account is now protected with two-factor authentication.
              </p>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg text-left space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Authenticator App Linked</p>
                  <p className="text-xs text-gray-400">Codes refresh every 30 seconds</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Backup Codes Saved</p>
                  <p className="text-xs text-gray-400">10 one-time recovery codes</p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleComplete}
              className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
            >
              Done
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#00F0FF]" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {step === 'intro' && 'Set up 2FA to secure your account'}
            {step === 'qrcode' && 'Step 1 of 3: Link your authenticator'}
            {step === 'verify' && 'Step 2 of 3: Verify your setup'}
            {step === 'backup' && 'Step 3 of 3: Save backup codes'}
            {step === 'complete' && 'Setup complete'}
          </DialogDescription>
        </DialogHeader>

        {renderStep()}
      </DialogContent>
    </Dialog>
  );
};
