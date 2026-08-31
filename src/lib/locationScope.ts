import type { AppRole } from '@/types';

/** Roles that are intentionally permitted to view more than one trailhead. */
export function hasAllLocationAccess(role: AppRole | null | undefined): boolean {
  return role === 'super_admin' || role === 'mdrrmo';
}

/** A scoped role must use its selected, database-backed location. */
export function getScopedLocationId(
  role: AppRole | null | undefined,
  activeLocationId: string | null | undefined,
): string | null {
  if (role === 'admin' || role === 'ranger' || role === 'guide') return activeLocationId ?? null;
  return null;
}
