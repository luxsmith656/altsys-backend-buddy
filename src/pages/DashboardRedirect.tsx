import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Mountain, Loader2 } from 'lucide-react';

/**
 * Shown immediately after login.
 * Reads the resolved role and hard-redirects to the correct dashboard.
 */
export default function DashboardRedirect() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    // If a user session exists but role hasn't resolved yet, keep waiting
    if (role === null) return;
    if (role === 'super_admin') navigate('/central', { replace: true });
    else if (role === 'admin') navigate('/admin', { replace: true });
    else if (role === 'ranger') navigate('/ranger', { replace: true });
    else if (role === 'guide') navigate('/guide', { replace: true });
    else navigate('/hiker', { replace: true });
  }, [role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Mountain className="h-14 w-14 text-primary mx-auto animate-pulse" />
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        <p className="text-muted-foreground text-sm">Loading your dashboard…</p>
      </div>
    </div>
  );
}
