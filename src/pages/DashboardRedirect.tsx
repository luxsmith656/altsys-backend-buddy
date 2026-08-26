import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Mountain, Loader2 } from 'lucide-react';

/**
 * Shown immediately after login or when navigating to /dashboard.
 * Reads the resolved role and reliably hard-redirects to the correct dashboard.
 */
export default function DashboardRedirect() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (role === 'super_admin') {
      navigate('/central', { replace: true });
    } else if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'ranger') {
      navigate('/ranger', { replace: true });
    } else if (role === 'guide') {
      navigate('/guide', { replace: true });
    } else {
      // Default to hiker for authenticated users with standard/pending role
      navigate('/hiker', { replace: true });
    }
  }, [user, role, loading, navigate]);

  // Safety fallback timeout: if auth takes too long, don't leave user stranded
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!user) {
        navigate('/login', { replace: true });
      } else {
        navigate('/hiker', { replace: true });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [user, navigate]);

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
