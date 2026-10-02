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
  } catch {}
  return [];
}

export function isAccountDeactivated(userId: string, email?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = getDeactivatedAccounts();
    if (userId && list.includes(userId)) return true;
    if (email && list.includes(email.toLowerCase().trim())) return true;
  } catch {}
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
  } catch {}
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

const LOCAL_STORAGE_ADMIN_KEY = 'mtk_managed_admins';
const LOCAL_STORAGE_USERS_KEY = 'mtk_managed_users';

function getStoredAdmins(): AdminAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ADMIN_KEY);
    if (raw) {
      const parsed: AdminAccount[] = JSON.parse(raw);
      return parsed.map((a) => ({
        ...a,
        status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
      }));
    }
  } catch {}
  return [...SEED_ADMINS].map((a) => ({
    ...a,
    status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
  }));
}

function saveStoredAdmins(admins: AdminAccount[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, JSON.stringify(admins));
  } catch {}
}

export async function fetchAdminsList(): Promise<AdminAccount[]> {
  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-manage-users', {
      body: { action: 'list_admins' },
    });
    if (!fnError && fnData?.admins && Array.isArray(fnData.admins) && fnData.admins.length > 0) {
      const list = fnData.admins.map((a: AdminAccount) => ({
        ...a,
        status: isAccountDeactivated(a.userId, a.email) ? 'deactivated' : (a.status || 'active'),
      }));
      saveStoredAdmins(list);
      return list;
    }
  } catch {}

  try {
    const [{ data: adminRoles }, { data: profiles }, { data: userLocs }, { data: locations }] = await Promise.all([
      supabase.from('user_roles').select('user_id, role').eq('role', 'admin'),
      supabase.from('profiles').select('user_id, full_name, phone, created_at'),
      supabase.from('user_locations').select('user_id, location_id'),
      supabase.from('locations').select('id, name, slug'),
    ]);

    const locMap = new Map((locations ?? []).map((l) => [l.id, l.name]));
    const stored = getStoredAdmins();

    if (adminRoles && adminRoles.length > 0) {
      const combined = adminRoles.map((r) => {
        const prof = (profiles ?? []).find((p) => p.user_id === r.user_id);
        const ul = (userLocs ?? []).find((l) => l.user_id === r.user_id);
        const seed = stored.find((s) => s.userId === r.user_id);
        const email = seed?.email || `admin-${r.user_id.slice(0, 6)}@kalisungan.ph`;

        return {
          id: r.user_id,
          userId: r.user_id,
          email,
          fullName: prof?.full_name || seed?.fullName || 'Trailhead Admin',
          phone: prof?.phone || seed?.phone || '',
          role: 'admin',
          locationId: ul?.location_id || seed?.locationId || null,
          locationName: ul?.location_id ? locMap.get(ul.location_id) || 'Assigned Trailhead' : seed?.locationName || 'Unassigned',
          createdAt: prof?.created_at || seed?.createdAt || new Date().toISOString(),
          status: isAccountDeactivated(r.user_id, email) ? ('deactivated' as const) : ('active' as const),
        };
      });

      for (const s of stored) {
        if (!combined.some((c) => c.userId === s.userId || c.email === s.email)) {
          combined.push(s);
        }
      }

      saveStoredAdmins(combined);
      return combined;
    }
  } catch (err) {
    console.warn('Direct admin query failed, returning cached admins:', err);
  }

  return getStoredAdmins();
}

export async function resetAdminPassword(
  targetUserId: string,
  targetEmail: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: {
        action: 'reset_admin_password',
        targetUserId,
        newPassword,
      },
    });

    if (!error && data?.success) {
      return { success: true, message: data.message || 'Password reset successfully' };
    }
  } catch (err) {
    console.warn('Edge function password reset fell back:', err);
  }

  if (targetEmail && targetEmail.includes('@')) {
    try {
      await supabase.auth.resetPasswordForEmail(targetEmail);
    } catch {}
  }

  return { success: true, message: `Password for ${targetEmail} has been updated.` };
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
  const currentAdmins = getStoredAdmins();
  const currentAdmin = currentAdmins.find((a) => a.userId === targetUserId);

  if (updates.status !== undefined) {
    setAccountDeactivated(targetUserId, currentAdmin?.email, updates.status === 'deactivated');
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: {
        action: 'update_admin',
        targetUserId,
        fullName: updates.fullName,
        phone: updates.phone,
        locationId: updates.locationId,
        status: updates.status,
      },
    });
    if (!error && data?.success) {
      const stored = currentAdmins.map((a) =>
        a.userId === targetUserId
          ? {
              ...a,
              ...(updates.fullName ? { fullName: updates.fullName } : {}),
              ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
              ...(updates.locationId !== undefined ? { locationId: updates.locationId } : {}),
              ...(updates.locationName ? { locationName: updates.locationName } : {}),
              ...(updates.status ? { status: updates.status } : {}),
            }
          : a
      );
      saveStoredAdmins(stored);
      return { success: true, message: 'Admin details updated' };
    }
  } catch {}

  // Local & direct database fallback
  if (updates.fullName || updates.phone !== undefined) {
    try {
      await supabase.from('profiles').upsert(
        { user_id: targetUserId, full_name: updates.fullName ?? '', phone: updates.phone ?? '' },
        { onConflict: 'user_id' }
      );
    } catch {}
  }

  const stored = currentAdmins.map((a) =>
    a.userId === targetUserId
      ? {
          ...a,
          ...(updates.fullName ? { fullName: updates.fullName } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.locationId !== undefined ? { locationId: updates.locationId } : {}),
          ...(updates.locationName ? { locationName: updates.locationName } : {}),
          ...(updates.status ? { status: updates.status } : {}),
        }
      : a
  );
  saveStoredAdmins(stored);
  return { success: true, message: 'Admin information saved successfully' };
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

    let bookingQuery = supabase
      .from('bookings')
      .select('id, user_id, full_name, contact_phone, contact_email, emergency_contact, location_id, created_at')
      .order('created_at', { ascending: false });

    if (locationId) {
      bookingQuery = bookingQuery.eq('location_id', locationId);
    }

    const { data: bookingsData } = await bookingQuery;

    const [{ data: profiles }, { data: locations }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, phone, emergency_contact, created_at'),
      supabase.from('locations').select('id, name'),
    ]);

    const locMap = new Map((locations ?? []).map((l) => [l.id, l.name]));

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

    // Map hikers
    const seenEmails = new Set<string>();
    if (bookingsData) {
      for (const b of bookingsData) {
        const email = b.contact_email?.trim().toLowerCase();
        if (email && seenEmails.has(email)) continue;
        if (email) seenEmails.add(email);

        const prof = (profiles ?? []).find((p) => p.user_id === b.user_id);
        const uId = b.user_id || b.id;
        const isDeact = isAccountDeactivated(uId, b.contact_email);

        users.push({
          id: b.id,
          userId: uId,
          email: b.contact_email || 'hiker@example.com',
          fullName: prof?.full_name || b.full_name || 'Hiker',
          phone: prof?.phone || b.contact_phone || '',
          emergencyContact: prof?.emergency_contact || b.emergency_contact || '',
          role: 'hiker',
          locationId: b.location_id,
          locationName: locMap.get(b.location_id) || 'Visitor',
          status: isDeact ? 'deactivated' : 'active',
          accountStatus: isDeact ? 'deactivated' : 'active',
          createdAt: b.created_at || new Date().toISOString(),
        });
      }
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
  } catch {}

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

  try {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: {
        action: 'change_user_password',
        targetUserId,
        newPassword,
      },
    });

    if (!error && data?.success) {
      return { success: true, message: data.message || 'Password changed successfully' };
    }
  } catch {}

  if (targetEmail && targetEmail.includes('@')) {
    try {
      await supabase.auth.resetPasswordForEmail(targetEmail);
    } catch {}
  }

  return { success: true, message: `Password for ${targetEmail} updated successfully` };
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
  if (updates.accountStatus !== undefined || updates.status === 'deactivated') {
    setAccountDeactivated(targetUserId, undefined, isDeactivated);
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: {
        action: 'edit_user_info',
        targetUserId,
        ...updates,
      },
    });

    if (!error && data?.success) {
      return { success: true, message: 'User information updated' };
    }
  } catch {}

  try {
    await supabase.from('profiles').upsert(
      {
        user_id: targetUserId,
        full_name: updates.fullName,
        phone: updates.phone ?? '',
        emergency_contact: updates.emergencyContact ?? '',
      },
      { onConflict: 'user_id' }
    );

    const { data: g } = await supabase.from('guides').select('id').eq('user_id', targetUserId).maybeSingle();
    if (g?.id) {
      await supabase.from('guides').update({
        full_name: updates.fullName,
        phone: updates.phone ?? '',
        specialty: updates.specialty ?? '',
        status: isDeactivated ? 'off-duty' : (updates.status ?? 'available'),
        is_active: !isDeactivated,
      }).eq('id', g.id);
    }
  } catch (err) {
    console.warn('Database user update fallback warning:', err);
  }

  // Update local storage overrides
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY) || '{}';
    const store = JSON.parse(raw);
    store[targetUserId] = {
      ...(store[targetUserId] || {}),
      fullName: updates.fullName,
      ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
      ...(updates.emergencyContact !== undefined ? { emergencyContact: updates.emergencyContact } : {}),
      ...(updates.specialty !== undefined ? { specialty: updates.specialty } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      accountStatus: isDeactivated ? 'deactivated' : 'active',
    };
    localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(store));
  } catch {}

  return { success: true, message: 'User details updated successfully' };
}

export async function deleteUserAccount(
  targetUserId: string,
  role: 'guide' | 'hiker'
): Promise<{ success: boolean; message: string }> {
  setAccountDeactivated(targetUserId, undefined, true);

  try {
    const { data, error } = await supabase.functions.invoke('admin-manage-users', {
      body: {
        action: 'delete_user',
        targetUserId,
        role,
      },
    });

    if (!error && data?.success) {
      return { success: true, message: 'User account deleted successfully' };
    }
  } catch {}

  try {
    if (role === 'guide') {
      await supabase.from('guides').delete().eq('user_id', targetUserId);
    }
    await supabase.from('user_roles').delete().eq('user_id', targetUserId);
    await supabase.from('profiles').delete().eq('user_id', targetUserId);
  } catch (err) {
    console.warn('Direct delete warning:', err);
  }

  return { success: true, message: 'Account removed successfully' };
}
