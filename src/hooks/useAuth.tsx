import { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import type { AppRole } from '@/types';

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, referralGuideId?: string | null) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ROLE_PRIORITY: AppRole[] = ['super_admin', 'admin', 'ranger', 'guide', 'hiker'];

function pickPrimaryRole(rows: { role: string | null }[] | null, user?: User | null): AppRole {
  // 1. If database has explicit role records in user_roles, strictly respect them
  const dbRoles = (rows ?? []).map((row) => row.role).filter(Boolean) as AppRole[];
  if (dbRoles.length > 0) {
    const matched = ROLE_PRIORITY.find((candidate) => dbRoles.includes(candidate));
    if (matched) return matched;
  }

  // 2. Explicit metadata fallback
  if (user?.user_metadata?.role && ROLE_PRIORITY.includes(user.user_metadata.role)) {
    return user.user_metadata.role;
  }
  if (user?.app_metadata?.role && ROLE_PRIORITY.includes(user.app_metadata.role)) {
    return user.app_metadata.role;
  }

  // 3. System staff account detection by email prefix / keywords
  if (user?.email) {
    const email = user.email.toLowerCase().trim();
    if (email === 'superadmin@mtkalisungan.ph' || email.startsWith('superadmin@') || email.startsWith('central@')) {
      return 'super_admin';
    } else if (email === 'admin@mtkalisungan.ph' || email.startsWith('admin@') || email.startsWith('kalicontrol@')) {
      return 'admin';
    } else if (email === 'ranger@mtkalisungan.ph' || email.startsWith('ranger@')) {
      return 'ranger';
    } else if (email === 'guide@mtkalisungan.ph' || email.startsWith('guide@') || email.includes('guide')) {
      return 'guide';
    }
  }

  return 'hiker';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (u: User) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', u.id);

      let detectedRole = pickPrimaryRole(data, u);

      // If still defaulted to hiker, check if user exists in guides or rangers tables
      if (detectedRole === 'hiker') {
        const { data: g } = await supabase.from('guides').select('id').eq('user_id', u.id).maybeSingle();
        if (g?.id) {
          detectedRole = 'guide';
        } else {
          const { data: r } = await (supabase.from('rangers' as any).select('id').eq('user_id', u.id).maybeSingle() as any);
          if (r?.id) {
            detectedRole = 'ranger';
          }
        }
      }

      setRole(detectedRole);
    } catch (err) {
      console.warn('Role lookup fallback:', err);
      setRole(pickPrimaryRole(null, u));
    }
  }, []);

  const syncSession = useCallback(async (session: { user: User } | null) => {
    setUser(session?.user ?? null);

    if (!session?.user) {
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      await fetchRole(session.user);
    } catch (err) {
      console.error('Session sync error:', err);
      setRole(pickPrimaryRole(null, session.user));
    } finally {
      setLoading(false);
    }
  }, [fetchRole]);

  useEffect(() => {
    let mounted = true;

    // 1. Instantly read existing stored session on app boot
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
          await syncSession(session as { user: User } | null);
        }
      } catch (err) {
        console.warn('Initial session lookup error:', err);
        if (mounted) setLoading(false);
      }
    };
    void initAuth();

    // 2. Subscribe to subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        void syncSession(session as { user: User } | null);
      }
    });

    // Safety timeout: Never leave the app hung in loading state
    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        setLoading(false);
      }
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signIn = async (email: string, password: string) => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error as Error };
        return { error: null };
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    return { error: lastError };
  };

  const signUp = async (email: string, password: string, fullName: string, referralGuideId?: string | null) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, ...(referralGuideId ? { referral_guide_id: referralGuideId } : {}) },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) console.error('Sign out error:', error);
    } catch (err) {
      console.error('Unexpected sign out error:', err);
    } finally {
      setUser(null);
      setRole(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
