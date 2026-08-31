import type { AppRole } from '@/types';

export interface RoleIdentity {
  email?: string | null;
  user_metadata?: unknown;
  app_metadata?: unknown;
}

const ROLE_PRIORITY: AppRole[] = ['super_admin', 'mdrrmo', 'admin', 'ranger', 'guide', 'hiker'];

const SEEDED_ACCOUNT_ROLES: Record<string, AppRole> = {
  'central@kalisungan.ph': 'super_admin',
  'superadmin@mtkalisungan.ph': 'super_admin',
  'lamot1@kalisungan.ph': 'admin',
  'lamot2@kalisungan.ph': 'admin',
  'stotomas@kalisungan.ph': 'admin',
  'guide@kalisungan.ph': 'guide',
  'guide@mtkalisungan.ph': 'guide',
  'hiker@kalisungan.ph': 'hiker',
  'mdrrmo@kalisungan.ph': 'mdrrmo',
};

function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && ROLE_PRIORITY.includes(value as AppRole);
}

function metadataRole(value: unknown): unknown {
  return value && typeof value === 'object' && 'role' in value
    ? (value as { role?: unknown }).role
    : undefined;
}

export function resolveAccountRole(
  rows: { role: string | null }[] | null,
  identity?: RoleIdentity | null,
): AppRole {
  const databaseRoles = (rows ?? [])
    .map((row) => row.role)
    .filter(isAppRole);
  const databaseRole = ROLE_PRIORITY.find((candidate) => databaseRoles.includes(candidate));
  if (databaseRole) return databaseRole;

  return resolveKnownAccountRole(identity) ?? 'hiker';
}

export function resolveKnownAccountRole(identity?: RoleIdentity | null): AppRole | null {

  const userMetadataRole = metadataRole(identity?.user_metadata);
  if (isAppRole(userMetadataRole)) return userMetadataRole;
  const appMetadataRole = metadataRole(identity?.app_metadata);
  if (isAppRole(appMetadataRole)) return appMetadataRole;

  const email = identity?.email?.trim().toLowerCase();
  if (email && SEEDED_ACCOUNT_ROLES[email]) return SEEDED_ACCOUNT_ROLES[email];

  return null;
}

export function getRoleHomePath(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/central';
    case 'admin':
      return '/admin';
    case 'mdrrmo':
      return '/mdrrmo';
    case 'ranger':
      return '/ranger';
    case 'guide':
      return '/guide';
    default:
      return '/hiker';
  }
}
