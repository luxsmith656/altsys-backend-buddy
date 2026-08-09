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

function pickPrimaryRole(rows: { role: string | null }[] | null): AppRole {
  const roles = new Set((rows ?? []).map((row) => row.role).filter(Boolean));
  return ROLE_PRIORITY.find((candidate) => roles.has(candidate)) ?? 'hiker';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.warn('Role fetch warning:', error.message);
      setRole(null);
      return;
    }

    setRole(pickPrimaryRole(data));
  }, []);

  const syncSession = useCallback(async (session: { user: User } | null) => {
    setLoading(true);
    setUser(session?.user ?? null);

    if (!session?.user) {
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      await fetchRole(session.user.id);
    } catch (err) {
      console.error('Session sync error:', err);
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, [fetchRole]);

  useEffect(() => {
    let mounted = true;

    const runSync = async (session: { user: User } | null) => {
      if (!mounted) return;
      await syncSession(session);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void runSync(session as { user: User } | null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signIn = async (email: string, password: string) => {
    // Retry logic for cold-start database issues
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error as Error };
        return { error: null }; // Success
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries - 1) {
          // Wait before retrying (exponential backoff)
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

