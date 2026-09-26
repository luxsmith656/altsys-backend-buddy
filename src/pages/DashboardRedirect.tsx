import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Mountain, Loader2 } from 'lucide-react';
import { getRoleHomePath } from '@/lib/authRoles';
import { Button } from '@/components/ui/button';

/**
 * Shown immediately after login or when navigating to /dashboard.
 * Reads the resolved role and reliably hard-redirects to the correct dashboard.
 */
export default function DashboardRedirect() {
  const { user, role, loading, roleError, retryRole } = useAuth();
  const navigate = useNavigate();
  const [checkingGuideSetup, setCheckingGuideSetup] = useState(false);

  useEffect(() => {
    if (loading || roleError) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (role === 'guide') {
      setCheckingGuideSetup(true);
      void (async () => {
        try {
          // Keep login compatible while the guide onboarding migration rolls out.
          // The setup page remains available from the admin invite link.
          await supabase.from('guides').select('id').eq('user_id', user.id).maybeSingle();
          navigate('/guide', { replace: true });
        } finally {
          setCheckingGuideSetup(false);
        }
      })();
      return;
    }
    if (role) navigate(getRoleHomePath(role), { replace: true });
  }, [user, role, loading, roleError, navigate]);

  if (user && roleError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="font-semibold">We could not verify your account role.</p>
          <p className="text-sm text-muted-foreground">{roleError}</p>
          <Button onClick={() => void retryRole()}>Retry access check</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <Mountain className="h-14 w-14 text-primary mx-auto animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        <p className="text-muted-foreground text-sm font-medium">{checkingGuideSetup ? 'Checking your guide profile…' : 'Opening your dashboard…'}</p>
      </div>
    </div>
  );
}
