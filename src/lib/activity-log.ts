/** Uses the existing admin_logs table; structured change details belong in metadata. */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type LogAction =
  | 'payment_recorded'
  | 'payment_updated'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_adjusted'
  | 'screenshot_uploaded'
  | 'hike_started'
  | 'guide_assigned'
  | 'capacity_set';

export interface ActivityLogEntry {
  actor_id?: string;
  action: LogAction;
  entity_type: 'booking' | 'payment' | 'capacity' | 'guide';
  entity_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function writeActivityLog(entry: ActivityLogEntry): Promise<void> {
  try {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) throw authError || new Error('An authenticated actor is required for audit logging.');
    const { error } = await supabase.from('admin_logs').insert({
      user_id: data.user.id,
      action: entry.action,
      entity: entry.entity_type,
      entity_id: entry.entity_id,
      metadata: {
        ...entry.metadata,
        before_state: entry.before_state,
        after_state: entry.after_state,
      } as Json,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('[ActivityLog] Insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[ActivityLog] Error:', err);
  }
}

export async function fetchActivityLogs(
  entityId?: string,
  limit = 50,
): Promise<any[]> {
  try {
    let query = supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (entityId) {
      query = query.eq('entity_id', entityId);
    }

    const { data, error } = await query;
    if (error) return [];
    return (data || []).map((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
      return { ...row, actor_id: row.user_id, entity_type: row.entity, before_state: metadata.before_state, after_state: metadata.after_state };
    });
  } catch {
    return [];
  }
}
