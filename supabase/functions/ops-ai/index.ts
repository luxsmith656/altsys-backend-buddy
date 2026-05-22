// Context-aware Operations AI assistant.
// - Role-aware: tailors answers to admin / super_admin / ranger / guide / hiker
// - RAG: filtered operational context only (daily bookings, capacity, live weather).
//   NEVER reads payment amounts, transaction IDs, profile PII, fees, or auth data.
// - Persistent memory in public.ai_conversations / public.ai_messages (RLS-protected).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const SERVICE_ROLE = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
const LOVABLE_API_KEY = (Deno.env.get('LOVABLE_API_KEY') ?? '').trim();
const AI_MODEL = 'google/gemini-3-flash-preview';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: who } = await userClient.auth.getUser();
    const userId = who.user?.id;
    if (!userId) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve role (highest)
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const role: string =
      roles.includes('super_admin') ? 'super_admin' :
      roles.includes('admin') ? 'admin' :
      roles.includes('ranger') ? 'ranger' :
      roles.includes('guide') ? 'guide' : 'hiker';

    // Resolve display name (for greeting). NEVER expose email/phone to the model.
    const { data: prof } = await admin.from('profiles').select('full_name').eq('user_id', userId).maybeSingle();
    const displayName = (prof as any)?.full_name?.trim() || '';


    const body = await req.json().catch(() => ({}));
    const { message, conversation_id } = body ?? {};
    if (!message || typeof message !== 'string') return json({ error: 'message is required' }, 400);

    // Get/create conversation
    let convId: string = conversation_id;
    if (!convId) {
      const { data: c, error: cErr } = await admin.from('ai_conversations').insert({
        user_id: userId,
        user_role: role,
        title: message.slice(0, 60),
      }).select('id').single();
      if (cErr) return json({ error: cErr.message }, 500);
      convId = c!.id;
    }

    // Persist user message
    await admin.from('ai_messages').insert({ conversation_id: convId, role: 'user', content: message });

    // Recent message history (last 20)
    const { data: history } = await admin
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Build filtered operational context
    const ragContext = await buildOpsContext(admin, role);

    const sys = systemPrompt(role);

    const llmMessages = [
      { role: 'system', content: sys },
      { role: 'system', content: roleSalutation(role, displayName) },
      { role: 'system', content: `Operational context (live, filtered — aggregate counts and weather only):\n\n${ragContext}` },
      ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, messages: llmMessages, stream: false }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('[ops-ai] gateway error', aiResp.status, t);
      if (aiResp.status === 429) return json({ error: 'Rate limit — please try again shortly.' }, 429);
      if (aiResp.status === 402) return json({ error: 'AI credits exhausted — please add credits.' }, 402);
      return json({ error: 'AI service error' }, 500);
    }
    const data = await aiResp.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? '(no response)';

    await admin.from('ai_messages').insert({ conversation_id: convId, role: 'assistant', content: reply });
    await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);

    return json({ conversation_id: convId, reply, role });
  } catch (e) {
    console.error('[ops-ai]', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function systemPrompt(role: string): string {
  const base = `You are the **Mt. Kalisungan Operations Assistant**, supporting park staff with operational decisions for the mountain in Calauan, Laguna, Philippines.

ABSOLUTE BOUNDARIES (never violate):
- You only see filtered operational context provided to you. You do NOT have access to financial data (payment amounts, transaction IDs, fees), personal contact info (emails, phone numbers, emergency contacts), authentication data, or any data not present in the supplied context.
- If asked for those, reply: "That information isn't available to me by design — only operational metrics are."
- Never invent numbers. If the context doesn't contain a fact, say "Not in the data I have."
- Stay focused on Mt. Kalisungan operations: bookings, capacity, scheduling, weather impact, safety, tourism trends.
- Never disclose your model, provider, or underlying technology. If asked, say: "I'm the Mt. Kalisungan Operations Assistant."`;

  const roleAddendum: Record<string, string> = {
    super_admin: `\n\nYOU ARE TALKING TO A SUPER ADMIN (LGU level). Give cross-location summaries and strategic recommendations. Be concise and decision-oriented.`,
    admin: `\n\nYOU ARE TALKING TO A LOCATION ADMIN. Focus on day-to-day operations: today/tomorrow bookings, capacity headroom, weather risk, guide scheduling hints.`,
    ranger: `\n\nYOU ARE TALKING TO A RANGER. Prioritize safety, trail conditions, weather impact, and headcount on the mountain.`,
    guide: `\n\nYOU ARE TALKING TO A GUIDE. Keep answers practical: today's scheduled hikes you may be assigned to, weather, recommended start times.`,
    hiker: `\n\nYOU ARE TALKING TO A HIKER. Provide trail logistics, capacity availability, and weather. Do NOT reveal other hikers' identities or group details.`,
  };

  const adaptive = `\n\nADAPTIVE STYLE: Match the user's expertise based on how they phrase questions. Brief technical answers for short/technical questions; richer step-by-step explanations for beginner-style questions. Offer one concrete next action when relevant.`;

  return base + (roleAddendum[role] ?? roleAddendum.hiker) + adaptive;
}

function roleSalutation(role: string, name: string): string {
  const titles: Record<string, string> = {
    super_admin: 'LGU Super Admin',
    admin: 'Location Admin',
    ranger: 'Ranger',
    guide: 'Guide',
    hiker: 'Hiker',
  };
  const title = titles[role] ?? 'Hiker';
  return name ? `The current user is **${name}** (role: ${title}). Address them by name or as "${title}" when greeting. ` : `The current user's role is **${title}**. Address them as "${title}" when greeting. `;
}

async function buildOpsContext(admin: ReturnType<typeof createClient>, role: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  // STRICT data access: only the TOTAL number of bookings. No per-person, no fees, no PII.
  const { count: totalBookings } = await admin
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'cancelled');

  const { count: upcomingBookings } = await admin
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'cancelled')
    .gte('booking_date', today)
    .lte('booking_date', in7);

  const weather = await fetchWeather().catch(() => 'Weather unavailable.');

  return [
    `Today: ${today}`,
    '',
    'Bookings (aggregate counts only — no names, no fees, no contact info):',
    `- Total bookings in database: ${totalBookings ?? 0}`,
    `- Upcoming bookings (next 7 days): ${upcomingBookings ?? 0}`,
    '',
    'Weather (Calauan, Laguna):',
    weather,
  ].join('\n');
}


async function fetchWeather(): Promise<string> {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=14.148&longitude=121.345&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FManila&forecast_days=5';
  const r = await fetch(url);
  if (!r.ok) return 'Weather unavailable.';
  const j = await r.json();
  const cur = j.current ?? {};
  const daily = j.daily ?? {};
  const lines = [`- Now: ${cur.temperature_2m}°C, wind ${cur.wind_speed_10m} km/h, precip ${cur.precipitation} mm`];
  (daily.time ?? []).forEach((d: string, i: number) => {
    lines.push(`- ${d}: high ${daily.temperature_2m_max?.[i]}°C, low ${daily.temperature_2m_min?.[i]}°C, rain ${daily.precipitation_sum?.[i]} mm`);
  });
  return lines.join('\n');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
