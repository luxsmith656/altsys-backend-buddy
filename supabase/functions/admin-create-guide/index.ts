// Admin-only endpoint: creates a real auth user for a guide with a temp password,
// assigns the 'guide' role, and adds a row to public.guides for the selected location.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_ROLE = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    // Use the caller's JWT to find out who they are
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who } = await userClient.auth.getUser();
    const callerId = who.user?.id;
    if (!callerId) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is admin/super_admin
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', callerId);
    const ok = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'super_admin');
    if (!ok) return json({ error: 'Forbidden: admin role required' }, 403);

    const body = await req.json().catch(() => ({}));
    const { email, password, full_name, phone, specialty, per_trip_fee, location_id } = body ?? {};

    if (!email || !password || !full_name || !location_id) {
      return json({ error: 'email, password, full_name and location_id are required' }, 400);
    }
    if (typeof password !== 'string' || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Verify location exists
    const { data: loc } = await admin.from('locations').select('id').eq('id', location_id).maybeSingle();
    if (!loc) return json({ error: 'Unknown location_id' }, 400);

    // Create or update auth user
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.data?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    let userId: string;
    if (existing) {
      userId = existing.id;
      await admin.auth.admin.updateUserById(existing.id, {
        password, email_confirm: true, user_metadata: { full_name },
      });
    } else {
      const created = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      });
      if (created.error) return json({ error: created.error.message }, 500);
      userId = created.data.user!.id;
    }

    // Profile
    await admin.from('profiles').upsert(
      { user_id: userId, full_name },
      { onConflict: 'user_id' },
    );

    // Replace any auto-assigned 'hiker' role with 'guide'
    await admin.from('user_roles').delete().eq('user_id', userId).eq('role', 'hiker');
    await admin.from('user_roles').upsert(
      { user_id: userId, role: 'guide' },
      { onConflict: 'user_id,role', ignoreDuplicates: true },
    );

    // Guides row (one per user)
    const { data: existingG } = await admin.from('guides').select('id').eq('user_id', userId).maybeSingle();
    let guide_id: string;
    if (existingG?.id) {
      const { data: upd } = await admin.from('guides').update({
        full_name, phone: phone ?? '', specialty: specialty ?? '',
        per_trip_fee: per_trip_fee ?? 0, location_id, is_active: true,
      }).eq('id', existingG.id).select('id').single();
      guide_id = upd!.id;
    } else {
      const { data: ins, error: insErr } = await admin.from('guides').insert({
        user_id: userId,
        full_name,
        phone: phone ?? '',
        specialty: specialty ?? '',
        per_trip_fee: per_trip_fee ?? 0,
        location_id,
        is_active: true,
      }).select('id').single();
      if (insErr) return json({ error: insErr.message }, 500);
      guide_id = ins!.id;
    }

    // Audit log
    await admin.from('admin_logs').insert({
      user_id: callerId,
      action: 'guide_created',
      entity: 'guides',
      entity_id: guide_id,
      metadata: { email, location_id },
    });

    return json({ ok: true, user_id: userId, guide_id });
  } catch (e) {
    console.error('[admin-create-guide]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
