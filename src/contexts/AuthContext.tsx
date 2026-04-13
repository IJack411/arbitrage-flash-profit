import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { twoFactorAuthService } from '@/lib/twoFactorAuthService';
import { notificationPreferencesService } from '@/lib/notificationPreferencesService';
import { userAlertService } from '@/lib/userAlertService';
import { telegramService } from '@/lib/telegramService';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignIn: string | null;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  requires2FA: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null; requires2FA?: boolean }>;
  signInWith2FA: (email: string, password: string, token: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  isAuthenticated: false,
  requires2FA: false,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInWith2FA: async () => ({ error: null }),
  signOut: async () => {},
  updateProfile: async () => ({ error: null }),
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
});

export const useAuth = () => useContext(AuthContext);

// Local storage keys for offline mode
const LOCAL_USER_KEY = 'flash-arbitrage-local-user';
const LOCAL_PROFILE_KEY = 'flash-arbitrage-local-profile';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

  // Initialize services when user changes
  const initializeServices = useCallback((userId: string | null, email?: string) => {
    twoFactorAuthService.setUserId(userId);
    notificationPreferencesService.setUserId(userId, email);
    userAlertService.setUserId(userId);
    telegramService.setUserId(userId);
  }, []);


  // Load user profile from Supabase or local storage
  const loadProfile = useCallback(async (userId: string, userEmail: string) => {
    // Initialize services
    initializeServices(userId, userEmail);

    if (!isSupabaseConfigured()) {
      // Load from local storage
      const localProfile = localStorage.getItem(LOCAL_PROFILE_KEY);
      if (localProfile) {
        try {
          const parsed = JSON.parse(localProfile);
          setProfile(parsed);
          return parsed;
        } catch {
          // Create default profile
          const defaultProfile: UserProfile = {
            id: userId,
            email: userEmail,
            displayName: userEmail.split('@')[0],
            avatarUrl: null,
            createdAt: new Date().toISOString(),
            lastSignIn: new Date().toISOString(),
            twoFactorEnabled: false,
          };
          setProfile(defaultProfile);
          localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(defaultProfile));
          return defaultProfile;
        }
      }
      return null;
    }

    try {
      // Try to get profile from user_profiles table
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
      }

      if (data) {
        const userProfile: UserProfile = {
          id: data.id,
          email: userEmail,
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
          createdAt: data.created_at,
          lastSignIn: data.last_sign_in,
          twoFactorEnabled: data.two_factor_enabled || false,
        };
        setProfile(userProfile);
        return userProfile;
      } else {
        // Create default profile
        const defaultProfile: UserProfile = {
          id: userId,
          email: userEmail,
          displayName: userEmail.split('@')[0],
          avatarUrl: null,
          createdAt: new Date().toISOString(),
          lastSignIn: new Date().toISOString(),
          twoFactorEnabled: false,
        };
        setProfile(defaultProfile);

        // Try to insert profile
        await supabase.from('user_profiles').insert({
          id: userId,
          display_name: defaultProfile.displayName,
          avatar_url: null,
          created_at: defaultProfile.createdAt,
          last_sign_in: defaultProfile.lastSignIn,
          two_factor_enabled: false,
        });

        return defaultProfile;
      }
    } catch (error) {
      console.error('Error in loadProfile:', error);
      // Fallback to default profile
      const fallbackProfile: UserProfile = {
        id: userId,
        email: userEmail,
        displayName: userEmail.split('@')[0],
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        lastSignIn: new Date().toISOString(),
        twoFactorEnabled: false,
      };
      setProfile(fallbackProfile);
      return fallbackProfile;
    }
  }, [initializeServices]);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      if (!isSupabaseConfigured()) {
        // Check for local user
        const localUser = localStorage.getItem(LOCAL_USER_KEY);
        if (localUser) {
          try {
            const parsed = JSON.parse(localUser);
            setUser(parsed as User);
            await loadProfile(parsed.id, parsed.email);
          } catch {
            // Invalid local user
            localStorage.removeItem(LOCAL_USER_KEY);
          }
        }
        setLoading(false);
        return;
      }

      try {
        // Get current session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          await loadProfile(currentSession.user.id, currentSession.user.email || '');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await loadProfile(newSession.user.id, newSession.user.email || '');
      } else {
        setProfile(null);
        initializeServices(null);
      }

      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(LOCAL_USER_KEY);
        localStorage.removeItem(LOCAL_PROFILE_KEY);
        twoFactorAuthService.clearUserData();
        notificationPreferencesService.clearUserData();
        userAlertService.clearUserData();
        telegramService.clearUserData();
      }

    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile, initializeServices]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (!isSupabaseConfigured()) {
      // Local signup simulation
      const localUser = {
        id: `local-${Date.now()}`,
        email,
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
      setUser(localUser as unknown as User);
      
      const localProfile: UserProfile = {
        id: localUser.id,
        email,
        displayName: displayName || email.split('@')[0],
        avatarUrl: null,
        createdAt: localUser.created_at,
        lastSignIn: localUser.created_at,
        twoFactorEnabled: false,
      };
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(localProfile));
      setProfile(localProfile);
      
      // Initialize services
      initializeServices(localUser.id, email);
      
      // Send welcome email
      await notificationPreferencesService.sendWelcomeEmail(
        displayName || email.split('@')[0],
        email
      );
      
      return { error: null };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });

    if (!error && data.user) {
      // Create profile
      await supabase.from('user_profiles').insert({
        id: data.user.id,
        display_name: displayName || email.split('@')[0],
        created_at: new Date().toISOString(),
        last_sign_in: new Date().toISOString(),
        two_factor_enabled: false,
      });

      // Initialize services
      initializeServices(data.user.id, email);
      
      // Send welcome email
      await notificationPreferencesService.sendWelcomeEmail(
        displayName || email.split('@')[0],
        email
      );
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      // Local signin simulation - check if user exists
      const localUser = localStorage.getItem(LOCAL_USER_KEY);
      if (localUser) {
        const parsed = JSON.parse(localUser);
        if (parsed.email === email) {
          // Check if 2FA is enabled
          twoFactorAuthService.setUserId(parsed.id);
          const twoFAStatus = twoFactorAuthService.getStatus();
          
          if (twoFAStatus.enabled) {
            setPendingCredentials({ email, password });
            setRequires2FA(true);
            return { error: null, requires2FA: true };
          }
          
          setUser(parsed as unknown as User);
          const localProfile = localStorage.getItem(LOCAL_PROFILE_KEY);
          if (localProfile) {
            setProfile(JSON.parse(localProfile));
          }
          initializeServices(parsed.id, email);
          return { error: null };
        }
      }
      
      // Create new local user on first sign in
      const newUser = {
        id: `local-${Date.now()}`,
        email,
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(newUser));
      setUser(newUser as unknown as User);
      
      const newProfile: UserProfile = {
        id: newUser.id,
        email,
        displayName: email.split('@')[0],
        avatarUrl: null,
        createdAt: newUser.created_at,
        lastSignIn: newUser.created_at,
        twoFactorEnabled: false,
      };
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(newProfile));
      setProfile(newProfile);
      initializeServices(newUser.id, email);
      
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      // Update last sign in
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from('user_profiles').update({
          last_sign_in: new Date().toISOString(),
        }).eq('id', currentUser.id);
        
        // Check if 2FA is enabled
        twoFactorAuthService.setUserId(currentUser.id);
        const twoFAStatus = twoFactorAuthService.getStatus();
        
        if (twoFAStatus.enabled) {
          // Sign out and require 2FA
          await supabase.auth.signOut();
          setPendingCredentials({ email, password });
          setRequires2FA(true);
          return { error: null, requires2FA: true };
        }
      }
    }

    return { error };
  };

  const signInWith2FA = async (email: string, password: string, token: string) => {
    // Verify 2FA token
    const verifyResult = await twoFactorAuthService.verify(
      // We need to get the secret from somewhere - for now, verify locally
      '', // This would need to be fetched from the user's stored 2FA data
      token
    );

    if (!verifyResult.valid) {
      return { error: { message: 'Invalid 2FA code' } as AuthError };
    }

    // Complete sign in
    if (!isSupabaseConfigured()) {
      const localUser = localStorage.getItem(LOCAL_USER_KEY);
      if (localUser) {
        const parsed = JSON.parse(localUser);
        setUser(parsed as unknown as User);
        const localProfile = localStorage.getItem(LOCAL_PROFILE_KEY);
        if (localProfile) {
          setProfile(JSON.parse(localProfile));
        }
        initializeServices(parsed.id, email);
      }
      setRequires2FA(false);
      setPendingCredentials(null);
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error) {
      setRequires2FA(false);
      setPendingCredentials(null);
    }

    return { error };
  };

  const signOut = async () => {
    // Clear services
    twoFactorAuthService.clearUserData();
    notificationPreferencesService.clearUserData();
    userAlertService.clearUserData();
    telegramService.clearUserData();

    if (!isSupabaseConfigured()) {
      localStorage.removeItem(LOCAL_USER_KEY);
      localStorage.removeItem(LOCAL_PROFILE_KEY);
      setUser(null);
      setProfile(null);
      setRequires2FA(false);
      setPendingCredentials(null);
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRequires2FA(false);
    setPendingCredentials(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      return { error: new Error('Not authenticated') };
    }

    if (!isSupabaseConfigured()) {
      // Update local profile
      const updatedProfile = { ...profile, ...updates } as UserProfile;
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(updatedProfile));
      setProfile(updatedProfile);
      return { error: null };
    }

    try {
      const { error } = await supabase.from('user_profiles').update({
        display_name: updates.displayName,
        avatar_url: updates.avatarUrl,
        two_factor_enabled: updates.twoFactorEnabled,
      }).eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...updates } : null);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const resetPassword = async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { error: { message: 'Password reset not available in offline mode' } as AuthError };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    if (!isSupabaseConfigured()) {
      return { error: { message: 'Password update not available in offline mode' } as AuthError };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAuthenticated: !!user,
        requires2FA,
        signUp,
        signIn,
        signInWith2FA,
        signOut,
        updateProfile,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
