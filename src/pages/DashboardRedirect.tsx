import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Mountain, Loader2 } from 'lucide-react';
import type { AppRole } from '@/types';

/**
 * Shown immediately after login or when navigating to /dashboard.
 * Reads the resolved role and reliably hard-redirects to the correct dashboard.
 */
export default function DashboardRedirect() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function routeUser() {
      if (loading) return;

      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      let effectiveRole: AppRole | null = role;

      // If role in auth context is not yet resolved, do an immediate authoritative lookup
      if (!effectiveRole) {
        try {
          const email = user.email?.toLowerCase().trim() || '';
          if (email.startsWith('superadmin@') || email.startsWith('central@')) {
            effectiveRole = 'super_admin';
          } else if (email.startsWith('admin@') || email.startsWith('kalicontrol@')) {
            effectiveRole = 'admin';
          } else if (email.startsWith('ranger@')) {
            effectiveRole = 'ranger';
          } else if (email.startsWith('guide@') || email.includes('guide')) {
            effectiveRole = 'guide';
          } else {
            // Check user_roles table
            const { data: dbRoles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
            const rList = (dbRoles ?? []).map((r) => r.role);
            if (rList.includes('super_admin')) effectiveRole = 'super_admin';
            else if (rList.includes('admin')) effectiveRole = 'admin';
            else if (rList.includes('ranger')) effectiveRole = 'ranger';
            else if (rList.includes('guide')) effectiveRole = 'guide';
            else {
              // Check guides table
              const { data: g } = await supabase.from('guides').select('id').eq('user_id', user.id).maybeSingle();
              if (g?.id) {
                effectiveRole = 'guide';
              } else {
                // Check rangers table
                const { data: rg } = await (supabase.from('rangers' as any).select('id').eq('user_id', user.id).maybeSingle() as any);
                if (rg?.id) {
                  effectiveRole = 'ranger';
                } else {
                  effectiveRole = 'hiker';
                }
              }
            }
          }
        } catch {
          effectiveRole = 'hiker';
        }
      }

      if (cancelled) return;

      if (effectiveRole === 'super_admin') {
        navigate('/central', { replace: true });
      } else if (effectiveRole === 'admin') {
        navigate('/admin', { replace: true });
      } else if (effectiveRole === 'ranger') {
        navigate('/ranger', { replace: true });
      } else if (effectiveRole === 'guide') {
        navigate('/guide', { replace: true });
      } else {
        navigate('/hiker', { replace: true });
      }
    }

    void routeUser();
    return () => { cancelled = true; };
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <Mountain className="h-14 w-14 text-primary mx-auto animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        <p className="text-muted-foreground text-sm font-medium">Opening your dashboard…</p>
      </div>
    </div>
  );
}
