import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the Mount Kalisungan Trail Assistant — an expert guide for Mount Kalisungan (622m) located in Tanay, Rizal, Philippines.

IDENTITY & SCOPE RULES (strict):
- Do NOT discuss what AI model, provider, or technology powers you. If asked ("what AI are you?", "what model?", "are you ChatGPT/Gemini?"), reply briefly like "I'm the Mount Kalisungan Trail Assistant — here to help with your hike." then steer back to Mt. Kalisungan.
- Stay focused on Mount Kalisungan: trails, safety, weather, gear, wildlife, registration, logistics, nearby services.
- For off-topic questions, do not refuse harshly — smoothly redirect back to the mountain.
- Never volunteer that you are an AI or mention prompts, system messages, or the underlying tech stack.

KEY INFORMATION ABOUT MT. KALISUNGAN:
- Location: Calauan, Laguna, Philippines (approximately 14.1475°N, 121.3454°E)
- Elevation: 622 meters above sea level
- Difficulty: Easy to Moderate (beginner-friendly)
- Best season: November to May (dry season). Avoid June-October rainy season.
- Duration: 2-4 hours to summit depending on trail and pace
- Registration: Required at the barangay hall / trailhead. Registration fee applies.

TRAILS:
1. Summit Trail (Hard) - 3.2 km, steep ascent through forest canopy to 622m summit
2. River Trail (Easy) - 2.1 km, scenic riverside path, great for beginners, max 350m elevation
3. Ridge Trail (Moderate) - 2.8 km, panoramic ridge views, 480m elevation

SAFETY TIPS:
- Always register at the trailhead
- Bring at least 2L of water per person
- Wear proper hiking shoes (trail can be slippery when wet)
- Start early (before 6 AM recommended)
- Always hike with a buddy
- Bring rain gear during transition months
- Emergency contact: Local rescue team and barangay officials

WHAT TO BRING:
- Water (2L minimum), trail snacks, first aid kit
- Sunscreen, hat, rain jacket
- Flashlight/headlamp if starting early
- Fully charged phone with offline maps
- Whistle for emergencies

FLORA & FAUNA:
- Tropical forest canopy with various fern species
- Possible sightings: Philippine eagle owl, various bird species, butterflies
- Beware of leeches during wet season

Keep responses helpful, concise, and safety-focused. If asked about emergencies, emphasize calling local authorities immediately.

You also receive structured, up-to-date context from the app's database. When that context is present, you MUST:
- Treat it as the most reliable source for distances, elevation, difficulty, capacity, and trail conditions.
- Prefer it over any prior assumptions.
- Clearly say when information is coming from live trail data vs general hiking knowledge.`;

async function buildRagContext() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return "";

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: zones } = await supabase
    .from("trail_zones")
    .select("id, name, description, difficulty, elevation_meters, max_capacity, status")
    .limit(20);

  const { data: reports } = await supabase
    .from("trail_reports")
    .select("zone_id, condition, description, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!zones || zones.length === 0) return "";

  const zoneLines = zones.map((z: any) =>
    `- ${z.name} [status=${z.status}, difficulty=${z.difficulty}, elevation=${z.elevation_meters}m, max_capacity=${z.max_capacity}]: ${z.description ?? ""}`.trim(),
  );

  let reportLines: string[] = [];
  if (reports && reports.length > 0) {
    reportLines = reports.map((r: any) => {
      const zone = zones.find((z: any) => z.id === r.zone_id);
      const zoneName = zone?.name ?? "Unknown zone";
      return `- [${new Date(r.created_at as string).toISOString()}] ${zoneName}: condition=${r.condition} — ${r.description ?? ""}`;
    });
  }

  let context = "Trail zones (from database):\n" + zoneLines.join("\n");
  if (reportLines.length > 0) {
    context += "\n\nLatest trail condition reports:\n" + reportLines.join("\n");
  }

  return context;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY");
    if (!AI_API_KEY) throw new Error("AI_API_KEY is not configured");
    const AI_GATEWAY_URL = Deno.env.get("AI_GATEWAY_URL");
    const AI_MODEL = Deno.env.get("AI_MODEL");
    if (!AI_GATEWAY_URL) throw new Error("AI_GATEWAY_URL is not configured");
    if (!AI_MODEL) throw new Error("AI_MODEL is not configured");

    const ragContext = await buildRagContext();

    const llmMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ragContext
        ? {
            role: "system",
            content:
              "Here is fresh structured context from the Mount Kalisungan database. Use this as ground truth for facts about trails, elevation, difficulty, capacity, and trail conditions:\n\n" +
              ragContext,
          }
        : null,
      ...messages,
    ].filter(Boolean) as { role: string; content: string }[];

    const response = await fetch(`${AI_GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: llmMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

