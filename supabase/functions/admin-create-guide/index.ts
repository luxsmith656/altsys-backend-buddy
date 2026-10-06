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
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
      return json({ error: 'Guide account service is not configured. Contact the system administrator.' }, 503);
    }
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
    const { data: roles, error: rolesError } = await admin.from('user_roles').select('role').eq('user_id', callerId);
    if (rolesError) return json({ error: 'Could not verify administrator permissions' }, 500);
    const ok = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'super_admin');
    if (!ok) return json({ error: 'Forbidden: admin role required' }, 403);
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === 'super_admin');

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
    if (!isSuperAdmin) {
      const { data: mapping, error: mappingError } = await admin
        .from('user_locations')
        .select('location_id')
        .eq('user_id', callerId)
        .eq('location_id', location_id)
        .maybeSingle();
      if (mappingError) return json({ error: 'Could not verify your assigned trailhead' }, 500);
      if (!mapping) return json({ error: 'You can only create guides for your assigned trailhead' }, 403);
    }

    // Create or update auth user
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) return json({ error: 'Could not check whether this email is already registered' }, 500);
    const existing = list.data?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (existing) return json({ error: 'This email already has an account. Use a new email to create a guide login.' }, 409);
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name, account_type: 'guide' },
    });
    if (created.error || !created.data.user) return json({ error: created.error?.message || 'Guide login was not created' }, 500);
    const userId = created.data.user.id;

    // Profile
    const { error: profileError } = await admin.from('profiles').upsert(
      { user_id: userId, full_name },
      { onConflict: 'user_id' },
    );
    if (profileError) return json({ error: `Guide account created but profile details failed: ${profileError.message}` }, 500);

    // Replace any auto-assigned 'hiker' role with 'guide'
    await admin.from('user_roles').delete().eq('user_id', userId).eq('role', 'hiker');
    const { error: roleError } = await admin.from('user_roles').upsert(
      { user_id: userId, role: 'guide' },
      { onConflict: 'user_id,role', ignoreDuplicates: true },
    );
    if (roleError) return json({ error: `Guide account created but role setup failed: ${roleError.message}` }, 500);

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
        onboarding_completed_at: null,
      }).select('id').single();
      if (insErr) return json({ error: insErr.message }, 500);
      guide_id = ins!.id;
    }

    const appUrl = String(body?.app_url || 'https://mtkali.vercel.app').replace(/\/$/, '');
    const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: String(email).trim().toLowerCase(),
      options: { redirectTo: `${appUrl}/guide/setup` },
    });
    if (recoveryError) console.warn('[admin-create-guide] recovery link unavailable:', recoveryError.message);

    const setupLink = recovery?.properties?.action_link ?? `${appUrl}/login?redirect=%2Fguide%2Fsetup`;
    const setupMessage = [
      `Mt. Kalisungan guide account for ${full_name}.`,
      `Open this secure setup link: ${setupLink}`,
      `Confirm your name, create a new password, then enter your sex, age, contact number, and profile photo.`,
      `Do not share this link. Contact the admin if it expires or is not yours.`,
    ].join('\n');

    // Audit log
    await admin.from('admin_logs').insert({
      user_id: callerId,
      action: 'guide_created',
      entity: 'guides',
      entity_id: guide_id,
      metadata: { email, location_id },
    });

    return json({ ok: true, user_id: userId, guide_id, setup_link: setupLink, setup_message: setupMessage });
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
