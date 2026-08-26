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

  const currentRole = role || 'hiker';
  const isSuperAdmin = currentRole === 'super_admin';
  const isAdmin = currentRole === 'admin';

  // Permission hierarchy: super_admin can view everything; admin can view admin, ranger, guide, hiker; etc.
  const hasAccess =
    isSuperAdmin ||
    allowedRoles.includes(currentRole) ||
    (isAdmin && (allowedRoles.includes('admin') || allowedRoles.includes('ranger') || allowedRoles.includes('guide') || allowedRoles.includes('hiker')));

  if (!hasAccess) {
    const target =
      currentRole === 'super_admin' ? '/central' :
      currentRole === 'admin' ? '/admin' :
      currentRole === 'ranger' ? '/ranger' :
      currentRole === 'guide' ? '/guide' :
      '/hiker';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
