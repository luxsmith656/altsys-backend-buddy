import { supabase } from '@/integrations/supabase/client';

export type AnnouncementType = 'info' | 'warning' | 'closure';
export type AnnouncementTarget = 'all' | 'admins' | 'hikers' | 'guides';
export type AnnouncementApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  source?: string;
  type: AnnouncementType;
  target?: AnnouncementTarget;
  created_at: string;
  isImportant: boolean;
  starts_at?: string;
  expires_at?: string;
  location_id?: string | null;
  approval_status?: AnnouncementApprovalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
}

const KEY = 'mtk_admin_announcements_v1';

export function loadAnnouncements(roleFilter?: string | null): AdminAnnouncement[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdminAnnouncement[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((a) => {
        const startsAt = a.starts_at ? new Date(a.starts_at).getTime() : null;
        const expiresAt = a.expires_at ? new Date(a.expires_at).getTime() : null;
        if (startsAt !== null && now < startsAt) return false;
        if (expiresAt !== null && now > expiresAt) return false;

        // Role targeting filter
        if (roleFilter) {
          const target = a.target || 'all';
          if (target === 'all') return true;
          if (roleFilter === 'super_admin' || roleFilter === 'admin') {
            return target === 'admins';
          }
          if (roleFilter === 'hiker') {
            return target === 'hikers';
          }
          if (roleFilter === 'guide') {
            return target === 'guides';
          }
        }

        return true;
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  } catch {
    return [];
  }
}

export function visibleAnnouncements(items: AdminAnnouncement[], role?: string | null): AdminAnnouncement[] {
  const normalizedRole = role === 'super_admin' ? 'admin' : role;
  const now = Date.now();
  return items.filter((item) => {
    if ((item.approval_status || 'approved') !== 'approved') return false;
    const startsAt = item.starts_at ? new Date(item.starts_at).getTime() : null;
    const expiresAt = item.expires_at ? new Date(item.expires_at).getTime() : null;
    if (startsAt !== null && now < startsAt) return false;
    if (expiresAt !== null && now > expiresAt) return false;
    const target = item.target || 'all';
    if (target === 'all') return true;
    if (target === 'admins') return normalizedRole === 'admin';
    if (target === 'hikers') return role === 'hiker';
    if (target === 'guides') return role === 'guide';
    return false;
  }).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

/** Central announcements have no location; local announcements are scoped to active bookings. */
export function scopeAnnouncementsByBookingLocations(
  items: AdminAnnouncement[],
  activeBookingLocationIds: string[] = [],
): AdminAnnouncement[] {
  const locations = new Set(activeBookingLocationIds.filter(Boolean));
  if (!locations.size) return items;
  return items.filter((item) => !item.location_id || locations.has(item.location_id));
}

export function saveAnnouncements(items: AdminAnnouncement[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function fetchAnnouncementsFromDb(): Promise<AdminAnnouncement[]> {
  try {
    const { data, error } = await (supabase
      .from('announcements' as any)
      .select('*')
      .order('created_at', { ascending: false }) as any);

    if (!error && Array.isArray(data)) {
      const mapped: AdminAnnouncement[] = data.map((d: any) => ({
        id: String(d.id),
        title: String(d.title || ''),
        body: String(d.body || ''),
        source: d.source ? String(d.source) : undefined,
        type: (d.type as AnnouncementType) || 'info',
        target: (d.target as AnnouncementTarget) || 'all',
        isImportant: Boolean(d.is_important),
        created_at: d.created_at || new Date().toISOString(),
        starts_at: d.starts_at || undefined,
        expires_at: d.expires_at || undefined,
        location_id: d.location_id ? String(d.location_id) : null,
        approval_status: (d.approval_status as AnnouncementApprovalStatus) || 'approved',
        approved_by: d.approved_by ? String(d.approved_by) : null,
        approved_at: d.approved_at || null,
        rejection_reason: d.rejection_reason ? String(d.rejection_reason) : null,
      }));
      saveAnnouncements(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('Announcements database sync fallback:', err);
  }
  return loadAnnouncements();
}

export async function addAnnouncement(item: AdminAnnouncement): Promise<AdminAnnouncement[]> {
  const all = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AdminAnnouncement[]) : [];
    } catch {
      return [];
    }
  })();
  const next = [item, ...all.filter((a) => a.id !== item.id)];
  saveAnnouncements(next);

  const { error } = await (supabase.from('announcements' as any).upsert({
        id: item.id,
        title: item.title,
        body: item.body,
        source: item.source || null,
        type: item.type,
        target: item.target || 'all',
        is_important: item.isImportant,
        created_at: item.created_at,
        starts_at: item.starts_at || null,
        expires_at: item.expires_at || null,
        location_id: item.location_id || null,
        approval_status: item.approval_status || 'approved',
        approved_by: item.approved_by || null,
        approved_at: item.approved_at || null,
        rejection_reason: item.rejection_reason || null,
      }) as any);
  if (error) {
    saveAnnouncements(all);
    throw error;
  }

  return next;
}

export async function setAnnouncementApproval(
  id: string,
  status: Extract<AnnouncementApprovalStatus, 'approved' | 'rejected'>,
  options: { approvedBy?: string | null; rejectionReason?: string | null } = {},
): Promise<void> {
  const { error } = await (supabase.from('announcements' as any).update({
    approval_status: status,
    approved_by: options.approvedBy || null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
    rejection_reason: status === 'rejected' ? (options.rejectionReason || 'Not approved by Central Admin') : null,
  }).eq('id', id) as any);
  if (error) throw error;
}

export async function removeAnnouncement(id: string): Promise<AdminAnnouncement[]> {
  const all = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AdminAnnouncement[]) : [];
    } catch {
      return [];
    }
  })();
  const next = all.filter((a) => a.id !== id);
  saveAnnouncements(next);

  const { error } = await (supabase.from('announcements' as any).delete().eq('id', id) as any);
  if (error) {
    saveAnnouncements(all);
    throw error;
  }

  return next;
}
