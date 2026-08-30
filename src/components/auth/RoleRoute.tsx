import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/types';
import { Button } from '@/components/ui/button';
import { getRoleHomePath } from '@/lib/authRoles';

interface RoleRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
}

export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user, role, loading, roleError, retryRole } = useAuth();

  if (user && roleError && !role) {
    return (
      <div className="min-h-screen pt-20 px-4 flex items-center justify-center">
        <div className="max-w-sm text-center space-y-3">
          <p className="font-semibold">We could not verify your account role.</p>
          <p className="text-sm text-muted-foreground">{roleError}</p>
          <Button onClick={() => void retryRole()}>Retry access check</Button>
        </div>
      </div>
    );
  }

  if (loading || (user && !role)) {
    return (
      <div className="min-h-screen pt-20 px-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const currentRole: AppRole = role;
  const hasAccess = allowedRoles.includes(currentRole);

  if (!hasAccess) {
    return <Navigate to={getRoleHomePath(currentRole)} replace />;
  }

  return <>{children}</>;
}
