import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the Mount Kalisungan Trail AI Assistant — an expert guide for Mount Kalisungan (622m) located in Tanay, Rizal, Philippines.

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

Keep responses helpful, concise, and safety-focused. If asked about emergencies, emphasize calling local authorities immediately.`;

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

    const response = await fetch(`${AI_GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
