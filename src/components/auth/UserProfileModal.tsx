import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, User, Mail, Lock, Shield, Bell, 
  Save, LogOut, AlertCircle, CheckCircle, Eye, EyeOff,
  Clock, Calendar, Settings, Database, Smartphone, Key,
  Moon, Send, Unlink, ExternalLink
} from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { priceAlertService } from '@/lib/priceAlertService';
import { twoFactorAuthService, TwoFactorStatus } from '@/lib/twoFactorAuthService';
import { notificationPreferencesService, NotificationPreferences } from '@/lib/notificationPreferencesService';
import { telegramService, TelegramLinkStatus } from '@/lib/telegramService';
import { TwoFactorSetup } from './TwoFactorSetup';
import { TelegramSetup } from './TelegramSetup';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, profile, signOut, updateProfile, updatePassword } = useAuth();
  const { toast } = useToast();

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  };

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 2FA State
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus>({ enabled: false, verifiedAt: null, backupCodesRemaining: 0 });
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState('');

  // Telegram State
  const [telegramStatus, setTelegramStatus] = useState<TelegramLinkStatus>({ isLinked: false, chatId: null, username: null, linkedAt: null });
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);

  // Notification Preferences State
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Stats
  const [alertStats, setAlertStats] = useState({
    total: 0,
    active: 0,
    triggered: 0,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
    }
  }, [profile]);

  useEffect(() => {
    if (isOpen && user) {
      // Load alert stats
      const alerts = priceAlertService.getAllAlerts();
      setAlertStats({
        total: alerts.length,
        active: alerts.filter(a => a.enabled && !a.triggeredAt).length,
        triggered: alerts.filter(a => a.triggeredAt).length,
      });

      // Load 2FA status
      twoFactorAuthService.setUserId(user.id);
      setTwoFactorStatus(twoFactorAuthService.getStatus());

      // Load Telegram status
      telegramService.setUserId(user.id);
      telegramService.loadLinkStatus().then(status => {
        setTelegramStatus(status);
      });

      // Load notification preferences
      notificationPreferencesService.setUserId(user.id, profile?.email);
      notificationPreferencesService.loadPreferences(profile?.email).then(prefs => {
        if (prefs) setNotificationPrefs(prefs);
      });
    }
  }, [isOpen, user, profile]);

  const handleUpdateProfile = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { error: updateError } = await updateProfile({ displayName });
      
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess('Profile updated successfully!');
        toast({
          title: 'Profile updated',
          description: 'Your profile has been updated successfully.',
        });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await updatePassword(newPassword);
      
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess('Password updated successfully!');
        setNewPassword('');
        setConfirmPassword('');
        toast({
          title: 'Password updated',
          description: 'Your password has been updated successfully.',
        });
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disable2FACode || disable2FACode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await twoFactorAuthService.disable(disable2FACode);
      
      if (result.success) {
        setTwoFactorStatus(twoFactorAuthService.getStatus());
        setDisabling2FA(false);
        setDisable2FACode('');
        toast({
          title: '2FA Disabled',
          description: 'Two-factor authentication has been disabled.',
        });
        
        // Send security alert email
        await notificationPreferencesService.sendSecurityAlertEmail('2fa_disabled', {
          userName: profile?.displayName || profile?.email,
        });

        // Send Telegram security alert if linked
        if (telegramStatus.isLinked) {
          await telegramService.sendSecurityAlert(
            'Two-factor authentication has been disabled on your account.',
            profile?.displayName || profile?.email
          );
        }
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    setUnlinkingTelegram(true);
    setError(null);

    try {
      const result = await telegramService.unlinkAccount();
      
      if (result.success) {
        setTelegramStatus({ isLinked: false, chatId: null, username: null, linkedAt: null });
        
        // Update notification preferences
        await notificationPreferencesService.savePreferences({
          telegramEnabled: false,
          telegramChatId: null,
        });
        
        toast({
          title: 'Telegram Unlinked',
          description: 'Your Telegram account has been unlinked.',
        });
      } else {
        setError(result.message);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to unlink Telegram');
    } finally {
      setUnlinkingTelegram(false);
    }
  };

  const handleTelegramSetupSuccess = async () => {
    const status = telegramService.getLinkStatus();
    setTelegramStatus(status);
    
    // Update notification preferences with Telegram info
    if (status.isLinked && status.chatId) {
      await notificationPreferencesService.savePreferences({
        telegramEnabled: true,
        telegramChatId: status.chatId,
      });
    }
  };

  const handleNotificationToggle = async (key: keyof NotificationPreferences, value: boolean | string) => {
    if (!notificationPrefs) return;
    
    setSavingNotifications(true);
    const updated = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(updated as NotificationPreferences);
    
    const success = await notificationPreferencesService.savePreferences({ [key]: value });
    
    if (!success) {
      // Revert on failure
      setNotificationPrefs(notificationPrefs);
      toast({
        title: 'Error',
        description: 'Failed to save notification settings',
        variant: 'destructive',
      });
    }
    
    setSavingNotifications(false);
  };

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: 'Signed out',
      description: 'You have been signed out successfully.',
    });
    onClose();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user || !profile) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <User className="h-6 w-6 text-[#00F0FF]" />
              Your Profile
            </DialogTitle>
          </DialogHeader>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* User Info Header */}
          <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00F0FF] to-purple-500 flex items-center justify-center text-2xl font-bold text-white">
              {(profile.displayName || profile.email)[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">
                {profile.displayName || 'User'}
              </h3>
              <p className="text-gray-400 text-sm">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                  Active
                </span>
                {twoFactorStatus.enabled && (
                  <span className="px-2 py-0.5 bg-[#00F0FF]/20 text-[#00F0FF] text-xs rounded-full flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    2FA
                  </span>
                )}
                {telegramStatus.isLinked && (
                  <span className="px-2 py-0.5 bg-[#0088cc]/20 text-[#0088cc] text-xs rounded-full flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Telegram
                  </span>
                )}
                {!isSupabaseConfigured() && (
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                    Offline Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-800 rounded-lg text-center">
              <Bell className="h-5 w-5 text-[#00F0FF] mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{alertStats.total}</p>
              <p className="text-xs text-gray-400">Total Alerts</p>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg text-center">
              <Shield className="h-5 w-5 text-green-400 mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{alertStats.active}</p>
              <p className="text-xs text-gray-400">Active</p>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg text-center">
              <CheckCircle className="h-5 w-5 text-purple-400 mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{alertStats.triggered}</p>
              <p className="text-xs text-gray-400">Triggered</p>
            </div>
          </div>

          <Tabs defaultValue="profile" className="mt-4">
            <TabsList className="bg-gray-800 border border-gray-700 w-full grid grid-cols-4">
              <TabsTrigger value="profile" className="data-[state=active]:bg-gray-700 text-xs">
                <User className="h-4 w-4 mr-1" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-gray-700 text-xs">
                <Lock className="h-4 w-4 mr-1" />
                Security
              </TabsTrigger>
              <TabsTrigger value="notifications" className="data-[state=active]:bg-gray-700 text-xs">
                <Bell className="h-4 w-4 mr-1" />
                Alerts
              </TabsTrigger>
              <TabsTrigger value="account" className="data-[state=active]:bg-gray-700 text-xs">
                <Settings className="h-4 w-4 mr-1" />
                Account
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="display-name" className="text-gray-300">Display Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="display-name"
                    type="text"
                    placeholder="Your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    type="email"
                    value={profile.email}
                    disabled
                    className="pl-10 bg-gray-800 border-gray-700 text-gray-400 cursor-not-allowed"
                  />
                </div>
                <p className="text-xs text-gray-500">Email cannot be changed</p>
              </div>

              <Button
                onClick={handleUpdateProfile}
                disabled={loading || displayName === profile.displayName}
                className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-4 mt-4">
              {/* Two-Factor Authentication Section */}
              <div className="p-4 bg-gray-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${twoFactorStatus.enabled ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                      <Smartphone className={`h-5 w-5 ${twoFactorStatus.enabled ? 'text-green-400' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Two-Factor Authentication</p>
                      <p className="text-xs text-gray-400">
                        {twoFactorStatus.enabled 
                          ? `Enabled • ${twoFactorStatus.backupCodesRemaining} backup codes remaining`
                          : 'Add extra security to your account'}
                      </p>
                    </div>
                  </div>
                  {twoFactorStatus.enabled ? (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded-full">
                      Disabled
                    </span>
                  )}
                </div>

                {twoFactorStatus.enabled ? (
                  disabling2FA ? (
                    <div className="space-y-3 pt-3 border-t border-gray-700">
                      <p className="text-sm text-gray-300">Enter your 2FA code to disable:</p>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="000000"
                        value={disable2FACode}
                        onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, ''))}
                        className="bg-gray-900 border-gray-700 text-white text-center text-lg tracking-widest font-mono"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => { setDisabling2FA(false); setDisable2FACode(''); }}
                          className="flex-1 border-gray-700 text-gray-300"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleDisable2FA}
                          disabled={loading || disable2FACode.length !== 6}
                          variant="destructive"
                          className="flex-1"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setDisabling2FA(true)}
                      className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Disable 2FA
                    </Button>
                  )
                ) : (
                  <Button
                    onClick={() => setShow2FASetup(true)}
                    className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Enable 2FA
                  </Button>
                )}
              </div>

              {/* Password Section */}
              {isSupabaseConfigured() ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Change Password
                  </h4>
                  <div className="space-y-2">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="New password (min 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10 pr-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleUpdatePassword}
                    disabled={loading || !newPassword || !confirmPassword}
                    className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900 font-medium"
                  >
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="mr-2 h-4 w-4" />
                    )}
                    Update Password
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-400 text-sm text-center">
                    Password management is not available in offline mode.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-4 mt-4">
              {notificationPrefs ? (
                <>
                  {/* Telegram Notifications */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Send className="h-4 w-4 text-[#0088cc]" />
                      Telegram Notifications
                    </h4>
                    
                    <div className="p-4 bg-gray-800 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${telegramStatus.isLinked ? 'bg-[#0088cc]/20' : 'bg-gray-700'}`}>
                            <Send className={`h-5 w-5 ${telegramStatus.isLinked ? 'text-[#0088cc]' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Telegram Account</p>
                            <p className="text-xs text-gray-400">
                              {telegramStatus.isLinked 
                                ? `@${telegramStatus.username || 'Connected'}`
                                : 'Link your Telegram for instant alerts'}
                            </p>
                          </div>
                        </div>
                        {telegramStatus.isLinked ? (
                          <span className="px-2 py-1 bg-[#0088cc]/20 text-[#0088cc] text-xs rounded-full">
                            Linked
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded-full">
                            Not Linked
                          </span>
                        )}
                      </div>

                      {telegramStatus.isLinked ? (
                        <div className="space-y-3 pt-3 border-t border-gray-700">
                          <div className="flex items-center justify-between p-2 bg-gray-900 rounded">
                            <span className="text-xs text-gray-400">Linked on</span>
                            <span className="text-xs text-gray-300">{formatDate(telegramStatus.linkedAt)}</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-white">Enable Telegram Alerts</p>
                              <p className="text-xs text-gray-400">Receive price alerts via Telegram</p>
                            </div>
                            <Switch
                              checked={notificationPrefs.telegramEnabled}
                              onCheckedChange={(checked) => handleNotificationToggle('telegramEnabled', checked)}
                              disabled={savingNotifications}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(telegramService.getBotLink(), '_blank')}
                              className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-700"
                            >
                              <ExternalLink className="mr-1 h-3 w-3" />
                              Open Bot
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleUnlinkTelegram}
                              disabled={unlinkingTelegram}
                              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              {unlinkingTelegram ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Unlink className="mr-1 h-3 w-3" />
                              )}
                              Unlink
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setShowTelegramSetup(true)}
                          className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white"
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Link Telegram Account
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Email Notifications */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Notifications
                    </h4>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                          <p className="text-sm text-white">Email Notifications</p>
                          <p className="text-xs text-gray-400">Receive alerts via email</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.emailNotifications}
                          onCheckedChange={(checked) => handleNotificationToggle('emailNotifications', checked)}
                          disabled={savingNotifications}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                          <p className="text-sm text-white">Price Alert Emails</p>
                          <p className="text-xs text-gray-400">Get notified when alerts trigger</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.priceAlertEmails}
                          onCheckedChange={(checked) => handleNotificationToggle('priceAlertEmails', checked)}
                          disabled={savingNotifications || !notificationPrefs.emailNotifications}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                        <div>
                          <p className="text-sm text-white">Security Alerts</p>
                          <p className="text-xs text-gray-400">Login and security notifications</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.securityAlertEmails}
                          onCheckedChange={(checked) => handleNotificationToggle('securityAlertEmails', checked)}
                          disabled={savingNotifications || !notificationPrefs.emailNotifications}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quiet Hours */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Quiet Hours
                    </h4>
                    
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div>
                        <p className="text-sm text-white">Enable Quiet Hours</p>
                        <p className="text-xs text-gray-400">Pause notifications during set times</p>
                      </div>
                      <Switch
                        checked={notificationPrefs.quietHoursEnabled}
                        onCheckedChange={(checked) => handleNotificationToggle('quietHoursEnabled', checked)}
                        disabled={savingNotifications}
                      />
                    </div>

                    {notificationPrefs.quietHoursEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-400">Start Time</Label>
                          <Input
                            type="time"
                            value={notificationPrefs.quietHoursStart}
                            onChange={(e) => handleNotificationToggle('quietHoursStart', e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-400">End Time</Label>
                          <Input
                            type="time"
                            value={notificationPrefs.quietHoursEnd}
                            onChange={(e) => handleNotificationToggle('quietHoursEnd', e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Daily Digest */}
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-sm text-white">Daily Digest</p>
                      <p className="text-xs text-gray-400">Summary of all alerts once daily</p>
                    </div>
                    <Switch
                      checked={notificationPrefs.dailyDigest}
                      onCheckedChange={(checked) => handleNotificationToggle('dailyDigest', checked)}
                      disabled={savingNotifications}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              )}
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-300">Account Created</p>
                      <p className="text-xs text-gray-500">{formatDate(profile.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-300">Last Sign In</p>
                      <p className="text-xs text-gray-500">{formatDate(profile.lastSignIn)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-300">Data Storage</p>
                      <p className="text-xs text-gray-500">
                        {isSupabaseConfigured() ? 'Cloud (Supabase)' : 'Local (Browser)'}
                      </p>
                    </div>
                  </div>
                </div>

                {twoFactorStatus.enabled && (
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-sm text-gray-300">2FA Enabled</p>
                        <p className="text-xs text-gray-500">{formatDate(twoFactorStatus.verifiedAt)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {telegramStatus.isLinked && (
                  <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Send className="h-5 w-5 text-[#0088cc]" />
                      <div>
                        <p className="text-sm text-gray-300">Telegram Linked</p>
                        <p className="text-xs text-gray-500">@{telegramStatus.username || 'Connected'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-700">
                <Button
                  onClick={handleSignOut}
                  variant="destructive"
                  className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* 2FA Setup Modal */}
      <TwoFactorSetup
        isOpen={show2FASetup}
        onClose={() => setShow2FASetup(false)}
        onSuccess={() => {
          setTwoFactorStatus(twoFactorAuthService.getStatus());
        }}
      />

      {/* Telegram Setup Modal */}
      <TelegramSetup
        isOpen={showTelegramSetup}
        onClose={() => setShowTelegramSetup(false)}
        onSuccess={handleTelegramSetupSuccess}
      />
    </>
  );
};
