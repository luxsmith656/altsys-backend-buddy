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
      "Mount Kalisungan is a 760 MASL mountain in Calauan, Laguna, Philippines (about 14.1475N, 121.3454E). It is moderate overall, and takes roughly 2.5 to 4 hours to the summit depending on the published route and pace. The summit gives views of Laguna de Bay, Mount Banahaw and Mount Makiling.",
  },
  {
    title: "Trails and difficulty",
    category: "trail",
    content:
      "Official route names, station sequence, distance, elevation and difficulty are published per jump-off in the database. Use the live route data supplied for the selected trailhead; never substitute a generic route or a route from another trailhead.",
  },
  {
    title: "Best season and weather guidance",
    category: "safety",
    content:
      "The dry season from November to May is the best time to hike. June to October is the rainy season: trails become slippery, especially on descent, and afternoon thunderstorms are common. If rain probability is above 50 percent, warn hikers to bring rain gear and check official advisories. If there is a storm signal, lightning risk or a flood warning, advise caution and follow official safety guidance.",
  },
  {
    title: "Recommended start times",
    category: "booking",
    content:
      "Start-time options and hike-type windows are controlled by Central and may change. Read the live schedule for the selected trailhead and date before recommending a time.",
  },
  {
    title: "Registration and booking policy",
    category: "booking",
    content:
      "Every hiker must be registered before climbing. Bookings are made per group with a booking date, start time, group size and hike type. Confirmation, capacity, pending holds, rescheduling and duplicate-booking rules are enforced from the live database settings and booking workflow.",
  },
  {
    title: "Fees",
    category: "fees",
    content:
      "Published entry, environmental, guide, peak, horse-rescue and other fees come from Central's live pricing configuration. Quote only the current database values; if they are unavailable, direct the user to the booking page or staff.",
  },
  {
    title: "Guides and guide assignment",
    category: "guides",
    content:
      "A local Mountain Guide is mandatory for every group by municipal tourism ordinance (1 guide per up to 5 hikers). Manual guide picking from a list is disabled to ensure fair livelihood rotation among local guides. During booking, hikers may enter a guide's referral code or referral link; if none is entered, or if the group needs 2 or more guides, the system automatically assigns certified mountain guides on rotation.",
  },
  {
    title: "What is advisable to wear during a hike at Mt. Kalisungan",
    category: "gear",
    content:
      "The recommended clothing for hiking Mt. Kalisungan depends on the weather conditions. During sunny or hot weather, hikers should wear lightweight, breathable clothing, a cap or hat, and comfortable hiking shoes with good grip. During rainy or cold weather, hikers should wear quick-drying clothes, a waterproof jacket or raincoat, and non-slip hiking shoes to prevent slipping on muddy trails. Hikers are advise to check the weather forecast before their hike and dress accordingly.",
  },
  {
    title: "River crossings on Mt. Kalisungan",
    category: "trail",
    content:
      "There are strictly zero (0) river crossings on Mt. Kalisungan. The trail traverses dry agricultural footpaths, coconut plantations, fruit orchards, forest trails, and open cogon grassland ridges to the 760 MASL summit. Follow your accredited guide around muddy or uneven sections during wet weather.",
  },
  {
    title: "Overnight camping at the summit",
    category: "booking",
    content:
      "Overnight camping slots are available on the Mount Kalisungan summit grassland. Campers must bring their own wind-resistant tents, warm clothing, and drinking water (no peak lodging or tent rentals onsite). Open bonfires and campfires are strictly prohibited to protect the cogon grass and prevent bushfires.",
  },
  {
    title: "Trailhead entry points and how to commute",
    category: "trail",
    content:
      "The registered trailhead jump-offs in Calauan, Laguna are Lamot 1, Lamot 2, and Sto. Tomas. To get to the trailhead via commute: take any provincial bus bound for Sta. Cruz, Laguna from Buendia, Pasay, or Cubao. Disembark at Duck Junction / Calauan highway, then hire a local tricycle directly to the Lamot 1, Lamot 2, or Sto. Tomas Barangay Hall / Trailhead Terminal.",
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
      "Capacity mode, group limits, daily limits, pending holds and slot availability are live Central settings. Only the current database response can establish whether a date or start time is available; missing data is unknown rather than closed.",
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
