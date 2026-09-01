// Shared knowledge-base helpers for the unified hiker AI.
// Content lives in public.kb_chunks with pgvector embeddings; retrieval is
// similarity search so we never dump the whole corpus into a prompt.

export const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

export interface KbSeed {
  title: string;
  category: string;
  content: string;
}

/** Baseline knowledge: rules, FAQs, safety procedures, policies, trail facts. */
export const KB_SEED: KbSeed[] = [
  {
    title: "Mountain overview",
    category: "trail",
    content:
      "Mount Kalisungan is a 622-metre mountain in Calauan, Laguna, Philippines (about 14.1475N, 121.3454E). It is beginner friendly, rated easy to moderate, and takes roughly 2 to 4 hours to the summit depending on trail and pace. The summit gives views of Laguna de Bay, Mount Banahaw and Mount Makiling.",
  },
  {
    title: "Trails and difficulty",
    category: "trail",
    content:
      "Summit Trail: hard, about 3.2 km, tops out at 622 m, the steepest and most direct route. River Trail: easy, about 2.1 km, up to 350 m, shaded and best for kids, seniors and first timers. Ridge Trail: moderate, about 2.8 km, up to 480 m, exposed ridgeline with strong wind and sun.",
  },
  {
    title: "Best season and weather guidance",
    category: "safety",
    content:
      "The dry season from November to May is the best time to hike. June to October is the rainy season: trails become slippery, especially on descent, and afternoon thunderstorms are common. If rain probability is above 50 percent, recommend an earlier start, the River Trail instead of the Ridge or Summit Trail, or rescheduling. If there is a storm signal, lightning risk or a flood warning, advise not to hike at all.",
  },
  {
    title: "Recommended start times",
    category: "booking",
    content:
      "For all adult groups the recommended morning start time is 06:00 AM. When the group includes children, seniors, or the forecast is hot (32C or above), 05:00 AM is better. Morning hikes may start 02:00–08:00 AM, night hikes 02:00–05:00 PM and descend the same day, and overnight hikes 02:00–04:00 PM with the hiker's own tent because there is no peak lodging.",
  },
  {
    title: "Registration and booking policy",
    category: "booking",
    content:
      "Every hiker must be registered before climbing. Bookings are made per group with a booking date, start time, group size and hike type (day or night). A booking is pending until staff confirm it, and daily capacity limits how many hikers can be confirmed for a date. Hikers may reschedule from their dashboard; staff review the request. One group should not book twice within the same Monday to Sunday week without approval.",
  },
  {
    title: "Fees",
    category: "fees",
    content:
      "Registration or entry fee is 30 pesos per person. Environmental fee is 20 pesos per person. A guide is mandatory: 1 guide covers 1–5 hikers. The per-guide rate is 800 pesos for morning, 1,000 pesos for night, and 1,600 pesos for overnight; groups above 5 need another guide. Example: a morning group of 6 pays (30 x 6) + (20 x 6) + (800 x 2) = 1,900 pesos. Fees are the same on every trail. Payment is accepted onsite at the registration desk, through GCash, or by bank transfer.",
  },
  {
    title: "Guides",
    category: "guides",
    content:
      "A trail guide is mandatory for every group. Guides are assigned by staff after a booking is confirmed and the hiker is notified in the booking chat. Guides may be reassigned by an admin if they go off duty; everyone involved is notified with the reason. Guide availability changes with approved leave and current assignments.",
  },
  {
    title: "What to bring",
    category: "gear",
    content:
      "Bring at least 2 litres of water per person, trail shoes or sturdy footwear with grip, a hat and sunscreen, rain jacket in transition months, trail snacks, a fully charged phone, a small first aid kit, and a trash bag. Night hikes also need a headlamp with spare batteries and a warm layer. Leave no trace: everything you carry up comes back down with you.",
  },
  {
    title: "Safety rules",
    category: "safety",
    content:
      "Never hike alone and never leave the marked trail. Register at the barangay hall or trailhead before starting. Start early so you finish the descent before afternoon rain. Turn back if visibility drops, if a member of the group is exhausted, or if lightning is nearby. Keep the group together and match the pace of the slowest member.",
  },
  {
    title: "Emergency procedure",
    category: "safety",
    content:
      "In an emergency, call local emergency services first, then notify your guide and the barangay tourism office at the trailhead. Stay where you are if you are lost, keep warm and dry, and conserve phone battery. The app has an SOS panel that shares your last known position with monitoring staff. Rescue points along the trail are marked on the map.",
  },
  {
    title: "GPS tracking and offline use",
    category: "app",
    content:
      "Hikers can track their hike from the Trail Map page. Tracking auto starts after a QR check in. Map tiles can be downloaded before the hike so the map keeps working without a signal, and recorded positions sync automatically once the phone is back online. Staff can see active hikers on a live monitoring map and are alerted if a hiker stops moving for a long period.",
  },
  {
    title: "Capacity and availability",
    category: "booking",
    content:
      "Each date has a maximum capacity of hikers. Remaining slots are the capacity minus already confirmed hikers. Only confirmed bookings consume capacity; cancelled bookings do not. If no capacity is configured for a date, availability is unknown rather than closed, and staff should be asked to confirm.",
  },
  {
    title: "Privacy policy for the assistant",
    category: "policy",
    content:
      "The assistant may discuss the signed-in hiker's own profile and their own bookings, and may quote the published fee schedule. It must never reveal another person's booking details, contact information, notes, or any payment record, receipt, refund, revenue or collection figure. Group level numbers such as total hikers booked for a date are allowed because they are aggregates.",
  },
];

export function hashContent(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", bytes).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/** Embed a batch of strings through the AI gateway. */
export async function embed(texts: string[], apiKey: string, gatewayUrl: string): Promise<number[][]> {
  const res = await fetch(`${gatewayUrl}/v1/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embedding request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const rows = (json?.data ?? []) as { index: number; embedding: number[] }[];
  return rows.sort((a, b) => a.index - b.index).map((r) => r.embedding);
}
