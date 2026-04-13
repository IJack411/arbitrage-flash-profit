// Two-Factor Authentication Service
// Handles TOTP-based 2FA with authenticator apps like Google Authenticator or Authy

import { supabase, isSupabaseConfigured } from './supabase';

export interface TwoFactorSetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  testCode?: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
}

export interface TwoFactorVerifyResult {
  success: boolean;
  valid: boolean;
  message: string;
}

const LOCAL_2FA_KEY = 'flash-arbitrage-2fa';
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

class TwoFactorAuthService {
  private userId: string | null = null;
  private twoFactorData: {
    secret: string | null;
    enabled: boolean;
    backupCodes: string[];
    usedBackupCodes: string[];
    verifiedAt: string | null;
  } | null = null;

  setUserId(userId: string | null) {
    this.userId = userId;
    if (userId) {
      this.loadTwoFactorData();
    } else {
      this.twoFactorData = null;
    }
  }

  // Base32 encoding for TOTP secrets
  private base32Encode(buffer: Uint8Array): string {
    let result = '';
    let bits = 0;
    let value = 0;
    
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      
      while (bits >= 5) {
        result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    
    if (bits > 0) {
      result += BASE32_CHARS[(value << (5 - bits)) & 31];
    }
    
    return result;
  }

  private base32Decode(encoded: string): Uint8Array {
    const cleanedInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const output: number[] = [];
    let bits = 0;
    let value = 0;
    
    for (const char of cleanedInput) {
      const index = BASE32_CHARS.indexOf(char);
      if (index === -1) continue;
      
      value = (value << 5) | index;
      bits += 5;
      
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    
    return new Uint8Array(output);
  }

  // Generate a random secret
  private generateSecret(length: number = 20): string {
    const buffer = new Uint8Array(length);
    crypto.getRandomValues(buffer);
    return this.base32Encode(buffer);
  }

  // Generate backup codes
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const buffer = new Uint8Array(4);
      crypto.getRandomValues(buffer);
      const code = Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  }

  // HMAC-SHA1 for TOTP
  private async hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
    return new Uint8Array(signature);
  }

  // Generate TOTP code
  private async generateTOTP(secret: string, timeStep: number = 30): Promise<string> {
    const key = this.base32Decode(secret);
    const time = Math.floor(Date.now() / 1000 / timeStep);
    
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setBigUint64(0, BigInt(time), false);
    
    const hmac = await this.hmacSha1(key, new Uint8Array(timeBuffer));
    
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = 
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  // Verify TOTP code with time window tolerance
  private async verifyTOTP(secret: string, token: string, window: number = 1): Promise<boolean> {
    const timeStep = 30;
    const currentTime = Math.floor(Date.now() / 1000 / timeStep);
    
    for (let i = -window; i <= window; i++) {
      const time = currentTime + i;
      const timeBuffer = new ArrayBuffer(8);
      const timeView = new DataView(timeBuffer);
      timeView.setBigUint64(0, BigInt(time), false);
      
      const key = this.base32Decode(secret);
      const hmac = await this.hmacSha1(key, new Uint8Array(timeBuffer));
      
      const offset = hmac[hmac.length - 1] & 0x0f;
      const binary = 
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
      
      const otp = (binary % 1000000).toString().padStart(6, '0');
      
      if (otp === token) {
        return true;
      }
    }
    
    return false;
  }

  // Generate QR code URL for authenticator apps
  private generateQRCodeUrl(secret: string, email: string, issuer: string = 'FlashArbitrageBot'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
    
    // Use Google Charts API for QR code generation
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`;
    
    return qrCodeUrl;
  }

  // Load 2FA data from storage
  private async loadTwoFactorData() {
    if (!this.userId) return;

    try {
      if (!isSupabaseConfigured()) {
        const stored = localStorage.getItem(`${LOCAL_2FA_KEY}-${this.userId}`);
        if (stored) {
          this.twoFactorData = JSON.parse(stored);
        } else {
          this.twoFactorData = {
            secret: null,
            enabled: false,
            backupCodes: [],
            usedBackupCodes: [],
            verifiedAt: null,
          };
        }
        return;
      }

      // Load from Supabase
      const { data, error } = await supabase
        .from('user_2fa')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading 2FA data:', error);
      }

      if (data) {
        this.twoFactorData = {
          secret: data.secret,
          enabled: data.enabled,
          backupCodes: data.backup_codes || [],
          usedBackupCodes: data.used_backup_codes || [],
          verifiedAt: data.verified_at,
        };
      } else {
        this.twoFactorData = {
          secret: null,
          enabled: false,
          backupCodes: [],
          usedBackupCodes: [],
          verifiedAt: null,
        };
      }
    } catch (error) {
      console.error('Error in loadTwoFactorData:', error);
      this.twoFactorData = {
        secret: null,
        enabled: false,
        backupCodes: [],
        usedBackupCodes: [],
        verifiedAt: null,
      };
    }
  }

  // Save 2FA data to storage
  private async saveTwoFactorData(): Promise<boolean> {
    if (!this.userId || !this.twoFactorData) return false;

    try {
      if (!isSupabaseConfigured()) {
        localStorage.setItem(
          `${LOCAL_2FA_KEY}-${this.userId}`,
          JSON.stringify(this.twoFactorData)
        );
        return true;
      }

      const { error } = await supabase
        .from('user_2fa')
        .upsert({
          user_id: this.userId,
          secret: this.twoFactorData.secret,
          enabled: this.twoFactorData.enabled,
          backup_codes: this.twoFactorData.backupCodes,
          used_backup_codes: this.twoFactorData.usedBackupCodes,
          verified_at: this.twoFactorData.verifiedAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving 2FA data:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in saveTwoFactorData:', error);
      return false;
    }
  }

  // Get current 2FA status
  getStatus(): TwoFactorStatus {
    return {
      enabled: this.twoFactorData?.enabled || false,
      verifiedAt: this.twoFactorData?.verifiedAt || null,
      backupCodesRemaining: this.twoFactorData 
        ? this.twoFactorData.backupCodes.length - this.twoFactorData.usedBackupCodes.length
        : 0,
    };
  }

  isEnabled(): boolean {
    return this.twoFactorData?.enabled || false;
  }

  // Setup 2FA - generate secret and QR code
  async setup(email: string): Promise<TwoFactorSetupData | null> {
    if (!this.userId) return null;

    try {
      // Try edge function first
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.functions.invoke('totp-2fa', {
            body: {
              action: 'setup',
              userId: this.userId,
              email,
            },
          });

          if (!error && data?.success) {
            return {
              secret: data.secret,
              qrCodeUrl: data.qrCodeUrl,
              backupCodes: data.backupCodes,
              testCode: data.testCode,
            };
          }
        } catch (e) {
          console.log('Edge function not available, using local generation');
        }
      }

      // Generate locally
      const secret = this.generateSecret();
      const backupCodes = this.generateBackupCodes(10);
      const qrCodeUrl = this.generateQRCodeUrl(secret, email);
      const testCode = await this.generateTOTP(secret);

      return {
        secret,
        qrCodeUrl,
        backupCodes,
        testCode,
      };
    } catch (error) {
      console.error('Error in 2FA setup:', error);
      return null;
    }
  }

  // Verify TOTP token
  async verify(secret: string, token: string): Promise<TwoFactorVerifyResult> {
    try {
      // Try edge function first
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.functions.invoke('totp-2fa', {
            body: {
              action: 'verify',
              userId: this.userId,
              secret,
              token,
            },
          });

          if (!error && data) {
            return {
              success: true,
              valid: data.valid,
              message: data.message,
            };
          }
        } catch (e) {
          console.log('Edge function not available, using local verification');
        }
      }

      // Verify locally
      const isValid = await this.verifyTOTP(secret, token);
      
      return {
        success: true,
        valid: isValid,
        message: isValid ? 'Token verified successfully' : 'Invalid token',
      };
    } catch (error) {
      console.error('Error verifying token:', error);
      return {
        success: false,
        valid: false,
        message: 'Verification failed',
      };
    }
  }

  // Enable 2FA after successful verification
  async enable(secret: string, token: string, backupCodes: string[]): Promise<{ success: boolean; message: string }> {
    if (!this.userId) {
      return { success: false, message: 'Not authenticated' };
    }

    try {
      // Verify the token first
      const verifyResult = await this.verify(secret, token);
      
      if (!verifyResult.valid) {
        return { success: false, message: 'Invalid verification code' };
      }

      // Update local state
      this.twoFactorData = {
        secret,
        enabled: true,
        backupCodes,
        usedBackupCodes: [],
        verifiedAt: new Date().toISOString(),
      };

      // Save to storage
      const saved = await this.saveTwoFactorData();
      
      if (!saved) {
        return { success: false, message: 'Failed to save 2FA settings' };
      }

      return { success: true, message: 'Two-factor authentication enabled successfully' };
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      return { success: false, message: 'Failed to enable 2FA' };
    }
  }

  // Disable 2FA
  async disable(token: string): Promise<{ success: boolean; message: string }> {
    if (!this.userId || !this.twoFactorData?.secret) {
      return { success: false, message: 'Not authenticated or 2FA not enabled' };
    }

    try {
      // Verify the token first
      const verifyResult = await this.verify(this.twoFactorData.secret, token);
      
      if (!verifyResult.valid) {
        return { success: false, message: 'Invalid verification code' };
      }

      // Update local state
      this.twoFactorData = {
        secret: null,
        enabled: false,
        backupCodes: [],
        usedBackupCodes: [],
        verifiedAt: null,
      };

      // Save to storage
      const saved = await this.saveTwoFactorData();
      
      if (!saved) {
        return { success: false, message: 'Failed to save 2FA settings' };
      }

      return { success: true, message: 'Two-factor authentication disabled successfully' };
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      return { success: false, message: 'Failed to disable 2FA' };
    }
  }

  // Verify backup code
  async verifyBackupCode(code: string): Promise<{ success: boolean; message: string }> {
    if (!this.userId || !this.twoFactorData) {
      return { success: false, message: 'Not authenticated' };
    }

    const normalizedCode = code.toUpperCase().trim();
    
    // Check if code exists and hasn't been used
    if (!this.twoFactorData.backupCodes.includes(normalizedCode)) {
      return { success: false, message: 'Invalid backup code' };
    }

    if (this.twoFactorData.usedBackupCodes.includes(normalizedCode)) {
      return { success: false, message: 'Backup code already used' };
    }

    // Mark code as used
    this.twoFactorData.usedBackupCodes.push(normalizedCode);
    await this.saveTwoFactorData();

    return { success: true, message: 'Backup code accepted' };
  }

  // Generate new backup codes (requires 2FA verification)
  async regenerateBackupCodes(token: string): Promise<{ success: boolean; codes: string[]; message: string }> {
    if (!this.userId || !this.twoFactorData?.secret) {
      return { success: false, codes: [], message: 'Not authenticated or 2FA not enabled' };
    }

    try {
      // Verify the token first
      const verifyResult = await this.verify(this.twoFactorData.secret, token);
      
      if (!verifyResult.valid) {
        return { success: false, codes: [], message: 'Invalid verification code' };
      }

      // Generate new backup codes
      const newCodes = this.generateBackupCodes(10);
      
      this.twoFactorData.backupCodes = newCodes;
      this.twoFactorData.usedBackupCodes = [];
      
      await this.saveTwoFactorData();

      return { success: true, codes: newCodes, message: 'Backup codes regenerated successfully' };
    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      return { success: false, codes: [], message: 'Failed to regenerate backup codes' };
    }
  }

  // Get remaining backup codes count
  getBackupCodesRemaining(): number {
    if (!this.twoFactorData) return 0;
    return this.twoFactorData.backupCodes.length - this.twoFactorData.usedBackupCodes.length;
  }

  // Clear user data
  clearUserData() {
    if (this.userId) {
      localStorage.removeItem(`${LOCAL_2FA_KEY}-${this.userId}`);
    }
    this.twoFactorData = null;
    this.userId = null;
  }
}

export const twoFactorAuthService = new TwoFactorAuthService();
