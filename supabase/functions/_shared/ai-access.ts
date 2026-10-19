/** Shared authorization and untrusted-input handling for both AI functions.
 *
 * The AI functions use a service-role client for server-side reads, so these
 * checks are deliberately application-level and must run before every tool.
 */

export const AI_RESULT_LIMIT = 25;
export const AI_HISTORY_LIMIT = 20;
export const AI_NO_MATCH = 'No matching record is available in your authorized scope.';
export const AI_DENIED = AI_NO_MATCH;

export type AiAccessScope = {
  userId: string | null;
  role: string;
  locationIds: string[];
  allLocations: boolean;
};

const SECRET_KEY = /password|passwd|hash|token|secret|api[_.-]?key|jwt|refresh|access[_.-]?token|otp|verification|reset|credential|service[_.-]?role|push[_.-]?token|auth[_.-]?user/i;
const SECRET_VALUE = /(?:bearer\s+)?(?:eyJ[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9_-]{16,}|sb_secret_[a-zA-Z0-9_-]+|AIza[a-zA-Z0-9_-]{20,})/g;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[redacted]';
  if (Array.isArray(value)) return value.slice(0, AI_RESULT_LIMIT).map((item) => redactSecrets(item, depth + 1));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      output[key] = redactSecrets(item, depth + 1);
    }
    return output;
  }
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[redacted]');
  return value;
}

export function sanitizeMessages(input: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is { role?: unknown; content?: unknown } => Boolean(item && typeof item === 'object'))
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content ?? '').slice(0, 8000) }))
    .filter((item) => item.content.trim().length > 0)
    .slice(-AI_HISTORY_LIMIT);
}

export function sanitizeToolParams(value: unknown): Record<string, unknown> {
  const safe = redactSecrets(value);
  if (!safe || typeof safe !== 'object' || Array.isArray(safe)) return {};
  return safe as Record<string, unknown>;
}

const ROLE_TOOLS: Record<string, Set<string>> = {
  hiker: new Set(['my_profile', 'my_bookings', 'my_active_session', 'booking_details', 'get_capacity_summary', 'get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_trail_conditions']),
  guide: new Set(['my_profile', 'my_bookings', 'my_active_session', 'guide_assigned_bookings', 'guide_booking_hikers', 'guide_group_locations', 'booking_details', 'list_active_sessions', 'live_map_summary', 'get_capacity_summary', 'get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_trail_conditions']),
  ranger: new Set(['my_profile', 'my_active_session', 'list_active_sessions', 'live_map_summary', 'emergency_alerts', 'get_capacity_summary', 'get_trail_conditions', 'get_booking_summary', 'get_attendance_summary', 'get_checkin_summary', 'get_completion_summary', 'search_internal_policies']),
  admin: new Set(['my_profile', 'my_bookings', 'my_active_session', 'guide_assigned_bookings', 'guide_booking_hikers', 'guide_group_locations', 'list_guides', 'guide_details', 'list_bookings', 'booking_details', 'search_hikers', 'search_guides', 'hiker_details', 'list_active_sessions', 'live_map_summary', 'emergency_alerts', 'get_booking_summary', 'get_capacity_summary', 'get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_attendance_summary', 'get_checkin_summary', 'get_completion_summary', 'get_booking_trend', 'get_revenue_summary', 'get_trail_conditions', 'search_internal_policies']),
  super_admin: new Set(['my_profile', 'my_bookings', 'my_active_session', 'guide_assigned_bookings', 'guide_booking_hikers', 'guide_group_locations', 'list_guides', 'guide_details', 'list_bookings', 'booking_details', 'search_hikers', 'search_guides', 'hiker_details', 'list_active_sessions', 'live_map_summary', 'emergency_alerts', 'get_booking_summary', 'get_capacity_summary', 'get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_attendance_summary', 'get_checkin_summary', 'get_completion_summary', 'get_booking_trend', 'get_revenue_summary', 'get_trail_conditions', 'search_internal_policies']),
  mdrrmo: new Set(['my_profile', 'my_active_session', 'list_active_sessions', 'live_map_summary', 'emergency_alerts', 'get_capacity_summary', 'get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_attendance_summary', 'get_checkin_summary', 'get_completion_summary', 'get_trail_conditions', 'search_internal_policies']),
  guest: new Set(['get_hike_schedule', 'get_fares', 'get_booking_rules', 'get_slot_availability', 'get_trail_conditions']),
};

export function canUseAiTool(scope: AiAccessScope, toolName: string): boolean {
  return ROLE_TOOLS[scope.role]?.has(toolName) ?? false;
}

export function safeToolLocation(scope: AiAccessScope, requested: unknown): { locationId: string | null } | { error: string } {
  const id = typeof requested === 'string' && requested.trim() ? requested.trim() : null;
  if (scope.allLocations) {
    if (id && scope.locationIds.length > 0 && !scope.locationIds.includes(id)) return { error: AI_NO_MATCH };
    return { locationId: id };
  }
  if (scope.role === 'admin' || scope.role === 'ranger' || scope.role === 'guide') {
    if (!scope.locationIds.length) return { error: AI_NO_MATCH };
    if (id && !scope.locationIds.includes(id)) return { error: AI_NO_MATCH };
    return { locationId: id ?? (scope.locationIds.length === 1 ? scope.locationIds[0] : null) };
  }
  if (id) return { error: AI_NO_MATCH };
  return { locationId: null };
}

export function capRows<T>(rows: T[], limit = AI_RESULT_LIMIT): { rows: T[]; total: number; truncated: boolean } {
  const total = rows.length;
  return { rows: rows.slice(0, limit), total, truncated: total > limit };
}

export function disambiguate<T extends { id?: string; full_name?: string }>(rows: T[], query: string): { matches: T[]; needs_clarification: boolean } {
  const normalized = query.trim().toLowerCase();
  const matches = normalized ? rows.filter((row) => String(row.full_name ?? '').toLowerCase().includes(normalized)) : rows;
  return { matches: matches.slice(0, AI_RESULT_LIMIT), needs_clarification: matches.length > 1 };
}
