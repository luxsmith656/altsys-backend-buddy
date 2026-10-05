import { supabase } from '@/integrations/supabase/client';

export interface AdminAccount {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  locationId: string | null;
  locationName: string;
  createdAt: string;
  lastSignIn?: string | null;
  status?: 'active' | 'deactivated';
}

export interface UserAccount {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  emergencyContact?: string;
  role: 'guide' | 'hiker';
  locationId?: string | null;
  locationName?: string;
  specialty?: string;
  status?: string;
  accountStatus?: 'active' | 'deactivated';
  createdAt: string;
  bookingsCount?: number;
}

const DEACTIVATED_ACCOUNTS_KEY = 'mtk_deactivated_accounts';

export function getDeactivatedAccounts(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEACTIVATED_ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* An unavailable or malformed local cache has no entries. */ }
  return [];
}

export function isAccountDeactivated(userId: string, email?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = getDeactivatedAccounts();
    if (userId && list.includes(userId)) return true;
    if (email && list.includes(email.toLowerCase().trim())) return true;
  } catch { /* Ignore malformed optional cached account records. */ }
  return false;
}

export function setAccountDeactivated(userId: string, email: string | undefined, deactivated: boolean) {
  if (typeof window === 'undefined') return;
  try {
    let list = getDeactivatedAccounts();
    const targets = [userId, email?.toLowerCase().trim()].filter(Boolean) as string[];
    if (deactivated) {
      targets.forEach((t) => {
        if (!list.includes(t)) list.push(t);
      });
    } else {
      list = list.filter((t) => !targets.includes(t));
    }
    localStorage.setItem(DEACTIVATED_ACCOUNTS_KEY, JSON.stringify(list));
  } catch (error) { console.warn('Could not cache account status.', error); }
}

// Fallback seed admin accounts matching standard deployment
const SEED_ADMINS: AdminAccount[] = [
  {
    id: 'admin-lamot1',
    userId: 'admin-lamot1',
    email: 'lamot1@kalisungan.ph',
    fullName: 'Lamot 1 Admin',
    phone: '+63 917 111 0001',
    role: 'admin',
    locationId: 'lamot1',
    locationName: 'Lamot 1 Trailhead',
    createdAt: '2026-06-01T00:00:00Z',
    status: 'active',
  },
  {
    id: 'admin-lamot2',
    userId: 'admin-lamot2',
    email: 'lamot2@kalisungan.ph',
    fullName: 'Lamot 2 Admin',
    phone: '+63 917 111 0002',
    role: 'admin',
    locationId: 'lamot2',
    locationName: 'Lamot 2 Trailhead',
    createdAt: '2026-06-01T00:00:00Z',
    status: 'active',
  },
  {
    id: 'admin-stotomas',
    userId: 'admin-stotomas',
    email: 'stotomas@kalisungan.ph',
    fullName: 'Sto. Tomas Admin',
    phone: '+63 917 111 0003',
    role: 'admin',
    locationId: 'stotomas',
    locationName: 'Sto. Tomas Trailhead',
    createdAt: '2026-06-01T00:00:00Z',
    status: 'active',
  },
];

function isMtKalisunganAccount(a: Partial<AdminAccount>): boolean {
  const loc = (a.locationName || '').toLowerCase();
  const name = (a.fullName || '').toLowerCase();
  const email = (a.email || '').toLowerCase();
  return (
    loc.includes('mount kalisungan') ||
    name.includes('mount kalisungan') ||
    email.includes('mtkalisungan') ||
    email === 'kalisungan@kalisungan.ph' ||
    a.locationId === '3082d38d-6f8e-491e-8a4d-6497b88f973a'
  );
}

const LOCAL_STORAGE_ADMIN_KEY = 'mtk_managed_admins';
const LOCAL_STORAGE_USERS_KEY = 'mtk_managed_users';

function getStoredAdmins(): AdminAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ADMIN_KEY);
    if (raw) {
      const parsed: AdminAccount[] = JSON.parse(raw);
      return parsed.filter((a) => !isMtKalisunganAccount(a)).map((a) => ({
        ...a,
        status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
      }));
    }
  } catch { /* Use the existing fallback list when local cache cannot be read. */ }
  return [...SEED_ADMINS].map((a) => ({
    ...a,
    status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
  }));
}

function saveStoredAdmins(admins: AdminAccount[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, JSON.stringify(admins));
  } catch (error) { console.warn('Could not cache admin accounts.', error); }
}

/** Calls the server-side account manager and throws a readable error on any failure (no fake success). */
async function invokeManageUsers(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('admin-manage-users', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      }
    } catch { /* Preserve the original server error when its response is not JSON. */ }
    throw new Error(msg || 'Server request failed');
  }
  if (data?.error) throw new Error(data.error);
  if (data && data.success === false) throw new Error(data.message || 'Request failed');
  return data ?? {};
}

export async function fetchAdminsList(): Promise<AdminAccount[]> {
  const data = await invokeManageUsers({ action: 'list_admins' });
  const list: AdminAccount[] = (data.admins ?? []).map((a: AdminAccount) => ({
    ...a,
    status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
  }));
  saveStoredAdmins(list);
  return list;
}

export async function resetAdminPassword(
  targetUserId: string,
  targetEmail: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const data = await invokeManageUsers({ action: 'reset_admin_password', targetUserId, newPassword });
  return { success: true, message: data.message || `Password for ${targetEmail} has been updated.` };
}

export async function updateAdminInfo(
  targetUserId: string,
  updates: {
    fullName?: string;
    phone?: string;
    locationId?: string | null;
    locationName?: string;
    status?: 'active' | 'deactivated';
  }
): Promise<{ success: boolean; message: string }> {
  const currentAdmin = getStoredAdmins().find((a) => a.userId === targetUserId);
  await invokeManageUsers({
    action: 'update_admin',
    targetUserId,
    fullName: updates.fullName,
    phone: updates.phone,
    locationId: updates.locationId,
    status: updates.status,
  });
  if (updates.status !== undefined) {
    setAccountDeactivated(targetUserId, currentAdmin?.email, updates.status === 'deactivated');
  }
  return { success: true, message: 'Admin details updated' };
}

export async function createAdminAccount(params: {
  email: string;
  fullName: string;
  phone?: string;
  locationId?: string | null;
  locationName?: string;
  password?: string;
}): Promise<{ success: boolean; message: string; admin?: AdminAccount }> {
  const email = params.email.toLowerCase().trim();
  const fullName = params.fullName.trim();
  const phone = params.phone?.trim() || '';
  const locationId = params.locationId || null;
  const locationName = params.locationName || 'Unassigned';
  const password = params.password || 'kalisungan2026';

  if (!email || !fullName) {
    throw new Error('Email and full name are required');
  }

  const data = await invokeManageUsers({ action: 'create_admin', email, fullName, phone, locationId, password });
  const uid = data.admin?.userId || data.admin?.id;
  if (!uid) throw new Error('Account was not created on the server. Please try again.');
  const newAdmin: AdminAccount = {
    id: uid,
    userId: uid,
    email,
    fullName,
    phone,
    role: 'admin',
    locationId,
    locationName,
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  return { success: true, message: `Admin account for ${fullName} created. They can sign in with ${email}.`, admin: newAdmin };
}

// ────────────────────────────────────────────────────────
// Trailhead Admin: Guide & Hiker Management
// ────────────────────────────────────────────────────────

export async function fetchUsersList(locationId?: string | null): Promise<UserAccount[]> {
  const users: UserAccount[] = [];

  try {
    let guideQuery = supabase
      .from('guides')
      .select('id, user_id, full_name, phone, specialty, status, location_id, is_active, created_at');

    if (locationId) {
      guideQuery = guideQuery.eq('location_id', locationId);
    }

    const { data: guidesData } = await guideQuery;

    let bookingQuery: any = supabase
      .from('bookings' as any)
      .select('id, user_id, contact_phone, contact_email, notes, emergency_contact_name, emergency_contact_phone, location_id, created_at')
      .order('created_at', { ascending: false });

    if (locationId) {
      bookingQuery = bookingQuery.eq('location_id', locationId);
    }

    const { data: bookingsData } = await bookingQuery;

    const [{ data: profiles }, { data: userRoles }, { data: locations }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, phone, emergency_contact, created_at, is_active'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('locations').select('id, name'),
    ]);

    const locMap = new Map((locations ?? []).map((l) => [l.id, l.name]));

    // Known guide user_ids and admin user_ids
    const guideUserIds = new Set<string>();
    if (guidesData) {
      for (const g of guidesData) {
        if (g.user_id) guideUserIds.add(g.user_id);
      }
    }

    const adminUserIds = new Set<string>();
    if (userRoles) {
      for (const r of userRoles) {
        if (r.role === 'admin' || r.role === 'super_admin') {
          adminUserIds.add(r.user_id);
        }
      }
    }

    // Map guides
    if (guidesData) {
      for (const g of guidesData) {
        const uId = g.user_id || g.id;
        const email = g.user_id ? `${g.full_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@kalisungan.ph` : 'No email linked';
        const isDeact = isAccountDeactivated(uId, email) || g.is_active === false;

        users.push({
          id: g.id,
          userId: uId,
          email,
          fullName: g.full_name,
          phone: g.phone || 'No phone',
          role: 'guide',
          locationId: g.location_id,
          locationName: locMap.get(g.location_id) || 'Trailhead Guide',
          specialty: g.specialty || 'General Guiding',
          status: isDeact ? 'deactivated' : (g.status || 'available'),
          accountStatus: isDeact ? 'deactivated' : 'active',
          createdAt: g.created_at || new Date().toISOString(),
        });
      }
    }

    // Group bookings by user_id to prevent creating separate profiles per booking
    const userBookingsMap = new Map<string, any[]>();
    if (bookingsData) {
      for (const b of (bookingsData as any[])) {
        if (!b.user_id) continue;
        const list = userBookingsMap.get(b.user_id) || [];
        list.push(b);
        userBookingsMap.set(b.user_id, list);
      }
    }

    // Map hikers strictly anchored on their persistent profile (1 hiker = 1 profile)
    const processedHikerUserIds = new Set<string>();

    if (profiles) {
      for (const p of profiles) {
        if (!p.user_id) continue;
        if (adminUserIds.has(p.user_id) || guideUserIds.has(p.user_id)) continue;

        processedHikerUserIds.add(p.user_id);
        const userBookings = userBookingsMap.get(p.user_id) || [];
        const latestBooking = userBookings[0];

        let latestMeta: any = null;
        if (latestBooking?.notes) {
          try {
            latestMeta = typeof latestBooking.notes === 'string' ? JSON.parse(latestBooking.notes) : latestBooking.notes;
          } catch { /* Legacy free-text notes contain no structured contact fields. */ }
        }

        const email = latestMeta?.emailAddress || latestMeta?.email || latestBooking?.contact_email || `${(p.full_name || 'hiker').toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
        const phone = p.phone || latestMeta?.phoneNumber || latestBooking?.emergency_contact_phone || latestBooking?.contact_phone || '';
        const emergency = p.emergency_contact || latestBooking?.emergency_contact_name || '';
        const locId = latestBooking?.location_id || null;
        const isDeact = isAccountDeactivated(p.user_id, email) || p.is_active === false;

        users.push({
          id: p.user_id,
          userId: p.user_id,
          email,
          fullName: p.full_name || latestMeta?.fullName || 'Registered Hiker',
          phone,
          emergencyContact: emergency,
          role: 'hiker',
          locationId: locId,
          locationName: locMap.get(locId) || 'Trailhead Visitor',
          status: isDeact ? 'deactivated' : 'active',
          accountStatus: isDeact ? 'deactivated' : 'active',
          createdAt: p.created_at || latestBooking?.created_at || new Date().toISOString(),
          bookingsCount: userBookings.length,
        });
      }
    }

    // Include any bookings whose user_id wasn't in profiles table
    for (const [uId, bList] of userBookingsMap.entries()) {
      if (processedHikerUserIds.has(uId)) continue;
      if (adminUserIds.has(uId) || guideUserIds.has(uId)) continue;

      processedHikerUserIds.add(uId);
      const latestBooking = bList[0];
      let latestMeta: any = null;
      if (latestBooking?.notes) {
        try {
          latestMeta = typeof latestBooking.notes === 'string' ? JSON.parse(latestBooking.notes) : latestBooking.notes;
        } catch { /* Legacy free-text notes contain no structured contact fields. */ }
      }

      const email = latestMeta?.emailAddress || latestMeta?.email || latestBooking?.contact_email || 'hiker@example.com';
      const fullName = latestMeta?.fullName || latestBooking?.emergency_contact_name || 'Hiker';
      const phone = latestMeta?.phoneNumber || latestBooking?.emergency_contact_phone || latestBooking?.contact_phone || '';
      const emergency = latestBooking?.emergency_contact_name || '';
      const locId = latestBooking?.location_id || null;
      const isDeact = isAccountDeactivated(uId, email);

      users.push({
        id: uId,
        userId: uId,
        email,
        fullName,
        phone,
        emergencyContact: emergency,
        role: 'hiker',
        locationId: locId,
        locationName: locMap.get(locId) || 'Visitor',
        status: isDeact ? 'deactivated' : 'active',
        accountStatus: isDeact ? 'deactivated' : 'active',
        createdAt: latestBooking?.created_at || new Date().toISOString(),
        bookingsCount: bList.length,
      });
    }
  } catch (err) {
    console.warn('Error fetching users list:', err);
  }

  // Ensure test accounts appear if empty
  if (users.length === 0) {
    const isGuideDeact = isAccountDeactivated('guide-user-1', 'guide@kalisungan.ph');
    const isHikerDeact = isAccountDeactivated('hiker-user-1', 'hiker@kalisungan.ph');

    users.push(
      {
        id: 'guide-1',
        userId: 'guide-user-1',
        email: 'guide@kalisungan.ph',
        fullName: 'Test Guide',
        phone: '+63 917 222 0001',
        role: 'guide',
        locationId: locationId || 'lamot1',
        locationName: 'Lamot 1',
        specialty: 'Summit Trail, Historical Caves',
        status: isGuideDeact ? 'deactivated' : 'available',
        accountStatus: isGuideDeact ? 'deactivated' : 'active',
        createdAt: '2026-06-01T00:00:00Z',
      },
      {
        id: 'hiker-1',
        userId: 'hiker-user-1',
        email: 'hiker@kalisungan.ph',
        fullName: 'Test Hiker',
        phone: '+63 917 333 0001',
        emergencyContact: 'Family (+63 917 000 9999)',
        role: 'hiker',
        locationId: locationId || 'lamot1',
        locationName: 'Lamot 1',
        status: isHikerDeact ? 'deactivated' : 'active',
        accountStatus: isHikerDeact ? 'deactivated' : 'active',
        createdAt: '2026-06-01T00:00:00Z',
      }
    );
  }

  // Check stored overrides in local storage
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    if (raw) {
      const overrides: Record<string, Partial<UserAccount>> = JSON.parse(raw);
      return users.map((u) => {
        const ov = overrides[u.userId];
        const isDeact = isAccountDeactivated(u.userId, u.email);
        return ov
          ? {
              ...u,
              ...ov,
              status: isDeact ? 'deactivated' : (ov.status || u.status),
              accountStatus: isDeact ? 'deactivated' : 'active',
            }
          : {
              ...u,
              status: isDeact ? 'deactivated' : u.status,
              accountStatus: isDeact ? 'deactivated' : 'active',
            };
      });
    }
  } catch { /* Optional local overrides must not prevent displaying server records. */ }

  return users;
}

export async function changeUserPassword(
  targetUserId: string,
  targetEmail: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const data = await invokeManageUsers({ action: 'change_user_password', targetUserId, newPassword });
  return { success: true, message: data.message || `Password for ${targetEmail} updated successfully` };
}

export async function editUserInfo(
  targetUserId: string,
  updates: {
    fullName: string;
    phone?: string;
    emergencyContact?: string;
    specialty?: string;
    status?: string;
    accountStatus?: 'active' | 'deactivated';
    locationId?: string | null;
  }
): Promise<{ success: boolean; message: string }> {
  const isDeactivated = updates.accountStatus === 'deactivated' || updates.status === 'deactivated';
  await invokeManageUsers({ action: 'edit_user_info', targetUserId, ...updates });
  if (updates.accountStatus !== undefined || updates.status === 'deactivated') {
    setAccountDeactivated(targetUserId, undefined, isDeactivated);
  }
  return { success: true, message: 'User information updated' };
}

export async function deleteUserAccount(
  targetUserId: string,
  role: 'admin' | 'guide' | 'hiker'
): Promise<{ success: boolean; message: string }> {
  setAccountDeactivated(targetUserId, undefined, true);

  if (role === 'admin') {
    const current = getStoredAdmins();
    saveStoredAdmins(current.filter((a) => a.userId !== targetUserId && a.id !== targetUserId));
  }

  await invokeManageUsers({ action: 'delete_user', targetUserId, role });
  return { success: true, message: 'User account deleted successfully' };
}
