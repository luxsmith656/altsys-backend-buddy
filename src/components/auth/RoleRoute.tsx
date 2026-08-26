import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/types';

interface RoleRouteProps {
  children: ReactNode;
  allowedRoles: AppRole[];
}

export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen pt-20 px-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!role || !allowedRoles.includes(role)) {
    const target =
      role === 'super_admin' ? '/central' :
      role === 'admin' ? '/admin' :
      role === 'ranger' ? '/ranger' :
      role === 'guide' ? '/guide' :
      '/hiker';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
