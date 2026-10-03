import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_ROLE = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: 'Supabase service configuration missing' }, 500);
    }

    // Authenticate caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who, error: authErr } = await userClient.auth.getUser();
    if (authErr || !who.user) return json({ error: 'Not authenticated' }, 401);
    const callerId = who.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check caller role
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', callerId);
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === 'super_admin');
    const isAdmin = isSuperAdmin || (roles ?? []).some((r: any) => r.role === 'admin');

    if (!isAdmin) {
      return json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ──────────────────────────────────────────────
    // 1. Central Admin: List Admins
    // ──────────────────────────────────────────────
    if (action === 'list_admins') {
      if (!isSuperAdmin) return json({ error: 'Forbidden: Super Admin access required' }, 403);

      const { data: adminRoles } = await admin.from('user_roles').select('user_id, role').eq('role', 'admin');
      const adminUserIds = (adminRoles ?? []).map((r: any) => r.user_id);

      const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const { data: profiles } = await admin.from('profiles').select('*').in('user_id', adminUserIds);
      const { data: userLocs } = await admin.from('user_locations').select('user_id, location_id');
      const { data: locs } = await admin.from('locations').select('id, name, slug');

      const locMap = new Map((locs ?? []).map((l: any) => [l.id, l]));

      const adminsList = adminUserIds.map((uid: string) => {
        const authUser = authUsers.data?.users?.find((u) => u.id === uid);
        const prof = (profiles ?? []).find((p: any) => p.user_id === uid);
        const ul = (userLocs ?? []).find((l: any) => l.user_id === uid);
        const loc = ul ? locMap.get(ul.location_id) : null;

        return {
          id: uid,
          userId: uid,
          email: authUser?.email ?? 'Unknown',
          fullName: prof?.full_name ?? authUser?.user_metadata?.full_name ?? 'Trailhead Admin',
          phone: prof?.phone ?? '',
          role: 'admin',
          locationId: ul?.location_id ?? null,
          locationName: loc?.name ?? 'Unassigned',
          createdAt: authUser?.created_at ?? prof?.created_at ?? new Date().toISOString(),
          lastSignIn: authUser?.last_sign_in_at ?? null,
        };
      });

      return json({ admins: adminsList });
    }

    // ──────────────────────────────────────────────
    // 2. Central Admin: Reset Admin Password
    // ──────────────────────────────────────────────
    if (action === 'reset_admin_password') {
      if (!isSuperAdmin) return json({ error: 'Forbidden: Super Admin access required' }, 403);

      const { targetUserId, newPassword } = body;
      if (!targetUserId || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return json({ error: 'Target user ID and valid new password (min 6 chars) are required' }, 400);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ success: true, message: 'Admin password reset successfully' });
    }

    // ──────────────────────────────────────────────
    // 3. Central Admin: Update Admin Info
    // ──────────────────────────────────────────────
    if (action === 'update_admin') {
      if (!isSuperAdmin) return json({ error: 'Forbidden: Super Admin access required' }, 403);

      const { targetUserId, fullName, phone, locationId, status } = body;
      if (!targetUserId) return json({ error: 'Target user ID required' }, 400);

      const isDeactivated = status === 'deactivated';

      if (fullName || phone !== undefined || status !== undefined) {
        await admin.from('profiles').upsert(
          {
            user_id: targetUserId,
            full_name: fullName,
            phone: phone ?? '',
            is_active: !isDeactivated,
          },
          { onConflict: 'user_id' }
        );
      }

      if (status !== undefined) {
        await admin.auth.admin.updateUserById(targetUserId, {
          user_metadata: {
            deactivated: isDeactivated,
            ...(fullName ? { full_name: fullName } : {}),
          },
        });
      }

      if (locationId !== undefined) {
        await admin.from('user_locations').delete().eq('user_id', targetUserId);
        if (locationId) {
          await admin.from('user_locations').insert({ user_id: targetUserId, location_id: locationId });
        }
      }

      return json({ success: true, message: 'Admin details updated' });
    }

    // ──────────────────────────────────────────────
    // 4. Trailhead Admin: Change User Password (Guide or Hiker)
    // ──────────────────────────────────────────────
    if (action === 'change_user_password') {
      const { targetUserId, newPassword } = body;
      if (!targetUserId || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return json({ error: 'Target user ID and valid new password (min 6 chars) are required' }, 400);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ success: true, message: 'Password updated successfully' });
    }

    // ──────────────────────────────────────────────
    // 5. Trailhead Admin: Edit User Info
    // ──────────────────────────────────────────────
    if (action === 'edit_user_info') {
      const { targetUserId, fullName, phone, emergencyContact, specialty, status, locationId } = body;
      if (!targetUserId) return json({ error: 'Target user ID required' }, 400);

      const isDeactivated = status === 'deactivated';

      await admin.from('profiles').upsert(
        {
          user_id: targetUserId,
          full_name: fullName,
          phone: phone ?? '',
          emergency_contact: emergencyContact ?? '',
          is_active: !isDeactivated,
        },
        { onConflict: 'user_id' }
      );

      if (status !== undefined || fullName) {
        await admin.auth.admin.updateUserById(targetUserId, {
          user_metadata: {
            deactivated: isDeactivated,
            ...(fullName ? { full_name: fullName } : {}),
          },
        });
      }

      if (locationId !== undefined) {
        await admin.from('user_locations').delete().eq('user_id', targetUserId);
        if (locationId) {
          await admin.from('user_locations').insert({ user_id: targetUserId, location_id: locationId });
        }
      }

      // If user is a guide, update guides table
      const { data: g } = await admin.from('guides').select('id').eq('user_id', targetUserId).maybeSingle();
      if (g) {
        await admin.from('guides').update({
          full_name: fullName,
          phone: phone ?? '',
          specialty: specialty ?? '',
          status: isDeactivated ? 'off-duty' : (status ?? 'available'),
          is_active: !isDeactivated,
          ...(locationId !== undefined ? { location_id: locationId } : {}),
        }).eq('id', g.id);
      }

      return json({ success: true, message: 'User info updated' });
    }

    // ──────────────────────────────────────────────
    // 6. Trailhead Admin: Delete User Account
    // ──────────────────────────────────────────────
    if (action === 'delete_user_account' || action === 'delete_user') {
      const { targetUserId } = body;
      if (!targetUserId) return json({ error: 'Target user ID required' }, 400);

      // Clean up relations
      await admin.from('guides').delete().eq('user_id', targetUserId);
      await admin.from('user_locations').delete().eq('user_id', targetUserId);
      await admin.from('user_roles').delete().eq('user_id', targetUserId);
      await admin.from('profiles').delete().eq('user_id', targetUserId);

      // Delete from auth.users
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        console.warn('Could not delete auth user:', delErr);
      }

      return json({ success: true, message: 'User account removed successfully' });
    }

    // ──────────────────────────────────────────────
    // 7. Central Admin: Create Admin Account
    // ──────────────────────────────────────────────
    if (action === 'create_admin') {
      if (!isSuperAdmin) return json({ error: 'Forbidden: Super Admin access required' }, 403);

      const { email, fullName, phone, locationId, password } = body;
      if (!email || !fullName) {
        return json({ error: 'Email and full name are required' }, 400);
      }

      const initialPassword = password || 'kalisungan2026';
      if (initialPassword.length < 6) {
        return json({ error: 'Password must be at least 6 characters' }, 400);
      }

      // Check if user already exists
      const existingUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = existingUsers.data?.users?.find(
        (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
      );

      let targetId: string;
      if (found) {
        targetId = found.id;
        await admin.auth.admin.updateUserById(targetId, {
          password: initialPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
      } else {
        const createRes = await admin.auth.admin.createUser({
          email: email.toLowerCase().trim(),
          password: initialPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createRes.error) {
          return json({ error: createRes.error.message }, 500);
        }
        targetId = createRes.data.user!.id;
      }

      // Upsert profile
      await admin.from('profiles').upsert(
        { user_id: targetId, full_name: fullName, phone: phone ?? '' },
        { onConflict: 'user_id' }
      );

      // Assign admin role
      await admin.from('user_roles').delete().eq('user_id', targetId);
      await admin.from('user_roles').insert({ user_id: targetId, role: 'admin' });

      // Link location
      await admin.from('user_locations').delete().eq('user_id', targetId);
      if (locationId) {
        await admin.from('user_locations').insert({ user_id: targetId, location_id: locationId });
      }

      return json({
        success: true,
        message: `Admin account for ${fullName} created successfully`,
        admin: {
          id: targetId,
          userId: targetId,
          email,
          fullName,
          phone: phone ?? '',
          role: 'admin',
          locationId: locationId ?? null,
        },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return json({ error: err.message || 'Internal server error' }, 500);
  }
});
