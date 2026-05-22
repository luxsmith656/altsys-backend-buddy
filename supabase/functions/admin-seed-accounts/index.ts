// One-shot seed/reset of standard test accounts.
// Creates (or updates passwords for) the test users, assigns roles,
// upserts profiles, links admins to locations, and seeds two guides.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_ROLE = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

type SeedRole = 'super_admin' | 'admin' | 'guide' | 'hiker' | 'ranger';

interface SeedSpec {
  email: string;
  password: string;
  full_name: string;
  role: SeedRole;
  location_slugs?: string[]; // for admins
  guide?: { phone: string; specialty: string; per_trip_fee: number };
}

const SEEDS: SeedSpec[] = [
  { email: 'central@kalisungan.ph', password: 'central123', full_name: 'LGU Central', role: 'super_admin' },
  { email: 'admin@kalisungan.ph',   password: 'admin123',   full_name: 'Main Admin',   role: 'admin', location_slugs: ['mt-kalisungan', 'lamot-1', 'lamot-2'] },
  { email: 'lamot1@kalisungan.ph',  password: 'lamot123',   full_name: 'Lamot 1 Admin', role: 'admin', location_slugs: ['lamot-1'] },
  { email: 'lamot2@kalisungan.ph',  password: 'lamot123',   full_name: 'Lamot 2 Admin', role: 'admin', location_slugs: ['lamot-2'] },
  { email: 'guide@kalisungan.ph',   password: 'guide123',   full_name: 'Test Guide',   role: 'guide',
    guide: { phone: '+63 917 000 0001', specialty: 'Summit Trail', per_trip_fee: 500 } },
  { email: 'hiker@kalisungan.ph',   password: 'hiker123',   full_name: 'Test Hiker',   role: 'hiker' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Build slug -> location_id map
    const { data: locs } = await admin.from('locations').select('id, slug');
    const locMap = new Map<string, string>((locs ?? []).map((l: any) => [l.slug, l.id]));

    const results: any[] = [];

    for (const s of SEEDS) {
      // Try to find existing user
      let userId: string | null = null;
      const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list.data?.users?.find((u) => u.email?.toLowerCase() === s.email.toLowerCase());

      if (existing) {
        userId = existing.id;
        await admin.auth.admin.updateUserById(existing.id, {
          password: s.password,
          email_confirm: true,
          user_metadata: { full_name: s.full_name },
        });
      } else {
        const created = await admin.auth.admin.createUser({
          email: s.email,
          password: s.password,
          email_confirm: true,
          user_metadata: { full_name: s.full_name },
        });
        if (created.error) { results.push({ email: s.email, error: created.error.message }); continue; }
        userId = created.data.user!.id;
      }

      if (!userId) continue;

      // Profile
      await admin.from('profiles').upsert(
        { user_id: userId, full_name: s.full_name },
        { onConflict: 'user_id' },
      );

      // Role: ensure only the seeded role (drop other roles for this user)
      await admin.from('user_roles').delete().eq('user_id', userId);
      await admin.from('user_roles').insert({ user_id: userId, role: s.role });

      // Admin: link to locations
      if (s.role === 'admin' || s.role === 'super_admin') {
        await admin.from('user_locations').delete().eq('user_id', userId);
        const slugs = s.location_slugs ?? [];
        const rows = slugs.map((slug) => ({ user_id: userId!, location_id: locMap.get(slug) })).filter((r) => r.location_id);
        if (rows.length) await admin.from('user_locations').insert(rows);
      }

      // Guide row
      if (s.role === 'guide' && s.guide) {
        const locId = locMap.get('mt-kalisungan');
        // Upsert by user_id (one guide per user)
        const { data: existingG } = await admin.from('guides').select('id').eq('user_id', userId).maybeSingle();
        if (existingG?.id) {
          await admin.from('guides').update({
            full_name: s.full_name,
            phone: s.guide.phone,
            specialty: s.guide.specialty,
            per_trip_fee: s.guide.per_trip_fee,
            is_active: true,
            location_id: locId,
          }).eq('id', existingG.id);
        } else if (locId) {
          await admin.from('guides').insert({
            user_id: userId,
            full_name: s.full_name,
            phone: s.guide.phone,
            specialty: s.guide.specialty,
            per_trip_fee: s.guide.per_trip_fee,
            is_active: true,
            location_id: locId,
          });
        }
      }

      results.push({ email: s.email, role: s.role, id: userId });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[admin-seed-accounts]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
