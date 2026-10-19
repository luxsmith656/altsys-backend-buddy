import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

export type AiRole = 'guest' | 'hiker' | 'guide' | 'ranger' | 'admin' | 'super_admin' | 'mdrrmo';

export interface AiRoleScope {
  userId: string | null;
  role: AiRole;
  locationIds: string[];
  locationNames: string[];
  allLocations: boolean;
}

const ROLE_ORDER: AiRole[] = ['super_admin', 'mdrrmo', 'admin', 'ranger', 'guide', 'hiker'];
const LOCATION_ROLES = new Set<AiRole>(['admin', 'ranger', 'guide']);

function highestRole(rows: Array<{ role?: string }> | null | undefined): AiRole {
  for (const role of ROLE_ORDER) {
    if (rows?.some((row) => row.role === role)) return role;
  }
  return 'hiker';
}

/** Resolve the trusted role and trailhead scope from the authenticated JWT. */
export async function resolveAiRoleScope(
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  authHeader: string | null,
): Promise<AiRoleScope> {
  const empty: AiRoleScope = { userId: null, role: 'guest', locationIds: [], locationNames: [], allLocations: false };
  if (!authHeader?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) return empty;

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData } = await userClient.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) return empty;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const role = highestRole(roleRows as Array<{ role?: string }> | null);
    const allLocations = role === 'super_admin' || role === 'mdrrmo';

    let locationIds: string[] = [];
    if (allLocations) {
      const { data } = await admin.from('locations').select('id').eq('status', 'active').order('name');
      locationIds = (data ?? []).map((row: { id: string }) => row.id).filter(Boolean);
    } else if (LOCATION_ROLES.has(role)) {
      const { data } = await admin.from('user_locations').select('location_id').eq('user_id', userId);
      locationIds = (data ?? []).map((row: { location_id: string }) => row.location_id).filter(Boolean);
    }

    let locationNames: string[] = [];
    if (locationIds.length) {
      const { data } = await admin.from('locations').select('id,name').in('id', locationIds);
      const byId = new Map((data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
      locationNames = locationIds.map((id) => byId.get(id)).filter((name): name is string => Boolean(name));
    }

    return { userId, role, locationIds, locationNames, allLocations };
  } catch (error) {
    console.error('[ai-role-scope] scope lookup failed', error);
    return empty;
  }
}

export function isFinanceRole(role: AiRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isStaffRole(role: AiRole): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'mdrrmo' || role === 'ranger' || role === 'guide';
}

/** Validate an optional location filter before it reaches an aggregate RPC. */
export function resolveScopedLocationId(scope: AiRoleScope, requested: unknown): { locationId: string | null } | { error: string } {
  const requestedId = typeof requested === 'string' && requested.trim() ? requested.trim() : null;
  if (!scope.allLocations && (scope.role === 'admin' || scope.role === 'ranger' || scope.role === 'guide')) {
    if (!scope.locationIds.length) return { error: 'This account has no verified trailhead scope.' };
    if (requestedId && !scope.locationIds.includes(requestedId)) return { error: 'That location is outside this account scope.' };
    return { locationId: requestedId ?? (scope.locationIds.length === 1 ? scope.locationIds[0] : null) };
  }
  if (scope.allLocations && requestedId && scope.locationIds.length && !scope.locationIds.includes(requestedId)) {
    return { error: 'That location is not an active Mount Kalisungan trailhead.' };
  }
  return { locationId: requestedId };
}

export function roleAudienceInstructions(scope: AiRoleScope): string {
  const locations = scope.locationNames.length ? scope.locationNames.join(', ') : 'no verified trailhead';
  switch (scope.role) {
    case 'hiker':
      return "AUDIENCE SCOPE: You are speaking to a hiker. Discuss the mountain, published routes, safety and only that signed-in hiker's own booking history. Never reveal another hiker's booking, identity, contact, medical note or payment data.";
    case 'admin':
      return `AUDIENCE SCOPE: You are speaking to a local trailhead admin. This account is restricted to ${locations}. Discuss only that trailhead's bookings, hikers, guide operations, capacity, system status and authorized aggregate revenue. Never mix another trailhead into the answer. If the account has no verified scope, say that staff must map the account before showing operational data.`;
    case 'super_admin':
      return 'AUDIENCE SCOPE: You are speaking to the central tourism admin. You may read exact booking, hiker and guide records across all local trailheads, including IDs, names, dates, status, group size and assigned guides. Use live database records for named lookups and never invent details. Central access is read-only: do not delete, edit, cancel, approve or otherwise modify records.';
    case 'mdrrmo':
      return 'AUDIENCE SCOPE: You are speaking to MDRRMO. Prioritize cross-trailhead emergency operations, active hikers, capacity and safety. Use only the minimum personal detail needed for an emergency response and do not discuss revenue.';
    case 'guide':
      return `AUDIENCE SCOPE: You are speaking to a mountain guide assigned to ${locations}. You may read the complete operational details for hikers and companions on bookings assigned to this guide, including contact and safety details needed for the hike. Do not reveal unrelated hikers or trailheads, and never modify records.`;
    case 'ranger':
      return `AUDIENCE SCOPE: You are speaking to a ranger for ${locations}. Focus on trail conditions, safety, check-in and active session aggregates within that trailhead scope.`;
    default:
      return 'AUDIENCE SCOPE: You are speaking to a visitor. Provide public Mount Kalisungan information only; do not disclose operational or personal records.';
  }
}
