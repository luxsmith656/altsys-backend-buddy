// Offline knowledge base for Mt. Kalisungan trail assistant
// Static entries + dynamic learning cache from previous AI responses + live system snapshot sync
import { getPricingConfig } from './payments';
import { fetchPricingConfig } from './pricingService';
import { MOUNTAIN_FACTS, MOUNTAIN_ELEVATION_FEET_LABEL, MOUNTAIN_ELEVATION_LABEL } from './mountainFacts';
import { officialRoutesForLocation } from './officialRoutes';
import { supabase } from '@/integrations/supabase/client';
import type { PricingConfig } from '@/types/pricing';

const CACHE_KEY = 'kalisungan_learned_cache';
const LIVE_SNAPSHOT_KEY = 'kalisungan_live_system_snapshot';
const CACHE_MAX = 200;

export interface LiveRouteSummary {
  id: string;
  name: string;
  locationId?: string | null;
  locationName: string;
  difficulty?: string;
  elevationMeters?: number;
  distanceKm?: number;
  stationNames?: string[];
}

export interface LiveSystemSnapshot {
  syncedAt: string | null;
  pricing: PricingConfig;
  capacity: {
    mode: 'shared' | 'per_trailhead';
    sharedMaxGroups: number;
    maxPeoplePerGroup: number;
    holdPending: boolean;
    dailyLimit: number | null;
  };
  schedule: {
    morning: string[];
    night: string[];
    overnight: string[];
  };
  trailheads: string[];
  routes: LiveRouteSummary[];
}

const DEFAULT_MORNING_SLOTS = ['2:00 AM', '4:00 AM', '6:00 AM', '8:00 AM', '10:00 AM'];
const DEFAULT_NIGHT_SLOTS = ['2:00 PM', '4:00 PM'];
const DEFAULT_OVERNIGHT_SLOTS = ['2:00 PM', '3:00 PM', '4:00 PM'];

export const OFFICIAL_CLOTHING_FAQ_ANSWER =
  'The recommended clothing for hiking Mt. Kalisungan depends on the weather conditions. During sunny or hot weather, hikers should wear lightweight, breathable clothing, a cap or hat, and comfortable hiking shoes with good grip. During rainy or cold weather, hikers should wear quick-drying clothes, a waterproof jacket or raincoat, and non-slip hiking shoes to prevent slipping on muddy trails. Hikers are advise to check the weather forecast before their hike and dress accordingly.';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getLiveSystemSnapshot(): LiveSystemSnapshot {
  const pricing = getPricingConfig();
  const base: LiveSystemSnapshot = {
    syncedAt: pricing.updatedAt ?? null,
    pricing,
    capacity: {
      mode: 'shared',
      sharedMaxGroups: 3,
      maxPeoplePerGroup: pricing.maxPaxPerGuide || 5,
      holdPending: false,
      dailyLimit: null,
    },
    schedule: {
      morning: DEFAULT_MORNING_SLOTS,
      night: DEFAULT_NIGHT_SLOTS,
      overnight: DEFAULT_OVERNIGHT_SLOTS,
    },
    trailheads: [...MOUNTAIN_FACTS.jumpOffs],
    routes: [],
  };

  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(LIVE_SNAPSHOT_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<LiveSystemSnapshot>;
    return {
      syncedAt: parsed.syncedAt ?? base.syncedAt,
      pricing: { ...pricing, ...(parsed.pricing ?? {}) },
      capacity: {
        mode: parsed.capacity?.mode === 'per_trailhead' ? 'per_trailhead' : 'shared',
        sharedMaxGroups: Number(parsed.capacity?.sharedMaxGroups) > 0 ? Number(parsed.capacity?.sharedMaxGroups) : base.capacity.sharedMaxGroups,
        maxPeoplePerGroup: Number(parsed.capacity?.maxPeoplePerGroup) > 0 ? Number(parsed.capacity?.maxPeoplePerGroup) : base.capacity.maxPeoplePerGroup,
        holdPending: Boolean(parsed.capacity?.holdPending),
        dailyLimit: typeof parsed.capacity?.dailyLimit === 'number' ? parsed.capacity.dailyLimit : null,
      },
      schedule: {
        morning: Array.isArray(parsed.schedule?.morning) && parsed.schedule!.morning.length ? parsed.schedule!.morning : base.schedule.morning,
        night: Array.isArray(parsed.schedule?.night) && parsed.schedule!.night.length ? parsed.schedule!.night : base.schedule.night,
        overnight: Array.isArray(parsed.schedule?.overnight) && parsed.schedule!.overnight.length ? parsed.schedule!.overnight : base.schedule.overnight,
      },
      trailheads: Array.isArray(parsed.trailheads) && parsed.trailheads.length ? parsed.trailheads : base.trailheads,
      routes: Array.isArray(parsed.routes) ? parsed.routes : base.routes,
    };
  } catch {
    return base;
  }
}

export function updateLiveSystemSnapshotPartial(patch: Partial<LiveSystemSnapshot>) {
  if (typeof window === 'undefined') return;
  try {
    const current = getLiveSystemSnapshot();
    const merged: LiveSystemSnapshot = {
      ...current,
      ...patch,
      syncedAt: patch.syncedAt ?? current.syncedAt ?? new Date().toISOString(),
      pricing: patch.pricing ? { ...current.pricing, ...patch.pricing } : current.pricing,
      capacity: patch.capacity ? { ...current.capacity, ...patch.capacity } : current.capacity,
      schedule: patch.schedule ? { ...current.schedule, ...patch.schedule } : current.schedule,
      trailheads: patch.trailheads?.length ? patch.trailheads : current.trailheads,
      routes: patch.routes?.length ? patch.routes : current.routes,
    };
    localStorage.setItem(LIVE_SNAPSHOT_KEY, JSON.stringify(merged));
  } catch {
    /* ignore storage errors */
  }
}

let syncInFlight: Promise<LiveSystemSnapshot> | null = null;

export async function syncLiveSystemSnapshot(): Promise<LiveSystemSnapshot> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return getLiveSystemSnapshot();
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      const current = getLiveSystemSnapshot();
      const [pricing, controlRes, locationsRes, zonesRes] = await Promise.all([
        fetchPricingConfig().catch(() => current.pricing),
        Promise.resolve((supabase as any).rpc('get_booking_capacity_control')).catch(() => ({ data: null })),
        Promise.resolve(supabase.from('locations').select('id,name,slug,status').eq('status', 'active')).catch(() => ({ data: null })),
        Promise.resolve(
          supabase
            .from('trail_zones')
            .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,recording_metadata,status,is_official,review_status'),
        ).catch(() => ({ data: null })),
      ]);

      const control = controlRes?.data as Record<string, any> | null;
      const cap = (control?.capacity ?? {}) as Record<string, any>;
      const schedSlots = (control?.schedule?.slots ?? {}) as Record<string, any>;

      const locRows = Array.isArray(locationsRes?.data) ? (locationsRes.data as Array<{ id: string; name: string; slug?: string }>) : [];
      const locMap = new Map(locRows.map((l) => [l.id, l.name]));
      const jumpOffNames = locRows
        .map((l) => l.name)
        .filter((name) => /lamot|tomas/i.test(name));

      const rawZones = Array.isArray(zonesRes?.data) ? (zonesRes.data as Array<Record<string, any>>) : [];
      const officialZones = officialRoutesForLocation(rawZones as any);
      const routes: LiveRouteSummary[] = officialZones.map((route: any) => {
        const points = Array.isArray(route.coordinates_json) ? (route.coordinates_json as Array<{ lat: number; lng: number }>) : [];
        let distanceKm = 0;
        for (let i = 1; i < points.length; i++) {
          distanceKm += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
        }
        const meta = (route.recording_metadata ?? {}) as { stationNames?: unknown; stations?: unknown };
        const rawStations = Array.isArray(meta.stationNames)
          ? meta.stationNames
          : Array.isArray(meta.stations)
            ? meta.stations.map((s: any) => (typeof s === 'object' && s && 'name' in s ? s.name : s))
            : [];
        const locName = (route.location_id && locMap.get(route.location_id)) || route.name || 'Trailhead';
        return {
          id: String(route.id),
          name: String(route.name || `${locName} Official Route`),
          locationId: route.location_id ?? null,
          locationName: String(locName),
          difficulty: route.difficulty ? String(route.difficulty) : undefined,
          elevationMeters: Number(route.elevation_meters) > 0 ? Number(route.elevation_meters) : undefined,
          distanceKm: distanceKm > 0 ? Number(distanceKm.toFixed(2)) : undefined,
          stationNames: rawStations.filter((s: unknown): s is string => typeof s === 'string').slice(0, 8),
        };
      });

      const next: LiveSystemSnapshot = {
        syncedAt: new Date().toISOString(),
        pricing: pricing ?? current.pricing,
        capacity: {
          mode: cap.mode === 'per_trailhead' ? 'per_trailhead' : current.capacity.mode,
          sharedMaxGroups: Number(cap.sharedMaxGroups) > 0 ? Number(cap.sharedMaxGroups) : current.capacity.sharedMaxGroups,
          maxPeoplePerGroup: Number(cap.maxPeoplePerGroup) > 0 ? Number(cap.maxPeoplePerGroup) : current.capacity.maxPeoplePerGroup,
          holdPending: typeof cap.holdPending === 'boolean' ? cap.holdPending : current.capacity.holdPending,
          dailyLimit: current.capacity.dailyLimit,
        },
        schedule: {
          morning: Array.isArray(schedSlots.morning) && schedSlots.morning.length ? schedSlots.morning.map(String) : current.schedule.morning,
          night: Array.isArray(schedSlots.night) && schedSlots.night.length ? schedSlots.night.map(String) : current.schedule.night,
          overnight: Array.isArray(schedSlots.overnight) && schedSlots.overnight.length ? schedSlots.overnight.map(String) : current.schedule.overnight,
        },
        trailheads: jumpOffNames.length ? jumpOffNames : current.trailheads,
        routes: routes.length ? routes : current.routes,
      };

      updateLiveSystemSnapshotPartial(next);
      return next;
    } catch {
      return getLiveSystemSnapshot();
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

interface KBEntry {
  keywords: string[];
  answer: string | (() => string);
}

const KB: KBEntry[] = [
  // ─── TRAILS ───
  {
    keywords: ['trail', 'available', 'trails', 'route', 'routes', 'path', 'which'],
    answer: `**Mt. Kalisungan has 3 trails:**

1. **Lamot 1 Trail** – published distance and terrain details come from the selected route.
2. **Lamot 2 Trail** – published distance and terrain details come from the selected route.
3. **Sto. Tomas Trail** – published distance and terrain details come from the selected route.`,
  },
  {
    keywords: ['summit', 'trail', 'top', 'peak'],
    answer: `**Lamot 2 Trail:**

- Distance, elevation along the trail, and duration: use the published route record
- Features: Dense forest canopy, steep switchbacks, rocky sections near the top
- Best for: Experienced hikers looking for a workout
- ⚠️ Can be very slippery when wet — bring trekking poles`,
  },
  {
    keywords: ['river', 'crossing', 'creek', 'stream', 'water crossing', 'river crossing'],
    answer: `**🚫 NO River Crossings on Mt. Kalisungan:**

- **Zero river crossings:** Mt. Kalisungan has **no river crossings** anywhere along its trails!
- The trail passes entirely through coconut plantations, fruit orchards, forest woodlands, and an open cogon grassland ridge to the summit.
- Hikers do **not** need to wade across streams or wet their feet.
- Regular trail shoes or hiking boots with good grip are recommended.
- Fresh buko and water refills are available at rest huts along the lower trail.`,
  },
  {
    keywords: ['plantation', 'orchard', 'valley', 'easy', 'flat', 'gentle'],
    answer: `**Lamot 1 Trail:**

- Distance: 2.1 km one way
- Max elevation: 350m
- Duration: 1–2 hours
- Features: Shaded coconut groves, banana orchards, tropical canopy, rustic rest huts
- Best for: Beginners, families, and casual hikers
- Note: Strictly NO river crossings — paths stay on dry agricultural and forest soil`,
  },
  {
    keywords: ['ridge', 'trail', 'panoramic', 'view', 'views'],
    answer: `**Sto. Tomas Trail:**

- Distance: 2.8 km one way
- Elevation: ~480m
- Duration: 2–3 hours
- Features: Panoramic ridge views, open grassland sections, some exposed areas
- Best for: Intermediate hikers wanting views without the full summit push
- Tip: Bring sun protection — limited shade on the ridge sections`,
  },

  // ─── GEAR & PREPARATION ───
  {
    keywords: ['bring', 'pack', 'gear', 'equipment', 'checklist', 'prepare', 'need', 'carry'],
    answer: `**What to bring for a day hike:**

- 💧 Water (2L minimum per person)
- 🍫 Trail snacks & energy food
- 🩹 First aid kit
- ☀️ Sunscreen, hat, rain jacket
- 🔦 Flashlight/headlamp if starting early
- 📱 Fully charged phone with offline maps
- 📯 Whistle for emergencies
- 👟 Proper hiking shoes (trail can be slippery)
- 🧻 Tissue / wet wipes
- 🗑️ Trash bag (Leave No Trace)`,
  },
  {
    keywords: ['shoes', 'footwear', 'boots', 'sandals', 'slippers'],
    answer: `**Footwear Guide:**

- ✅ Trail running shoes or hiking boots with good grip
- ✅ Ankle-high boots recommended for steep sections on the published routes
- ❌ Do NOT wear slippers, sandals, or flat sneakers
- The trail can be muddy and slippery, especially after rain
- Break in new shoes before the hike to avoid blisters`,
  },
  {
    keywords: ['first aid', 'medical', 'medicine', 'injury', 'hurt', 'blister'],
    answer: `**First Aid Essentials:**

- Adhesive bandages / blister patches
- Antiseptic wipes
- Pain relievers (ibuprofen / paracetamol)
- Anti-histamine for allergic reactions
- Elastic bandage for sprains
- Insect repellent
- Personal medications
- Oral rehydration salts

⚠️ For serious injuries, call local rescue and stay put.`,
  },

  // ─── WEATHER ───
  {
    keywords: ['rain', 'rainy', 'wet', 'season', 'weather', 'monsoon', 'typhoon', 'storm'],
    answer: `**Weather & Seasons:**

🌤️ **Best season:** November to May (dry season)
🌧️ **Avoid:** June to October (rainy / typhoon season)

**Monthly breakdown:**
- **Nov–Feb:** Cool & dry, best hiking weather (20–28°C)
- **Mar–May:** Hot & dry, start very early to avoid heat (25–35°C)
- **Jun–Oct:** Monsoon rains, slippery trails, flash flood risk

⚠️ Always check weather forecasts before your hike, even in dry season.
Afternoon thunderstorms can occur year-round.`,
  },
  {
    keywords: ['temperature', 'hot', 'cold', 'warm', 'cool', 'climate'],
    answer: `**Temperature on Mt. Kalisungan:**

- Base (trailhead): 25–35°C depending on season
- Summit: Usually 3–5°C cooler than the trailhead
- Early morning (5–7 AM): 20–25°C — most comfortable
- Midday: Can exceed 32°C on exposed sections

💡 Start early to avoid the midday heat. Bring layers for cool mornings.`,
  },
  {
    keywords: ['fog', 'mist', 'cloud', 'visibility', 'cloudy'],
    answer: `**Fog & Visibility:**

- Early morning fog is common, especially Nov–Feb
- Summit views are clearest between 6–9 AM
- Afternoon clouds often roll in, reducing visibility
- If fog is thick, stay on marked trails and use GPS
- Fog can make trails slippery — slow down`,
  },

  // ─── WILDLIFE ───
  {
    keywords: ['wildlife', 'animal', 'bird', 'fauna', 'flora', 'plant', 'see', 'insect', 'snake'],
    answer: `**Flora & Fauna on Mt. Kalisungan:**

🌿 **Plants:**
- Tropical forest canopy with various fern species
- Mossy trees near the summit
- Wild orchids and pitcher plants (rare sightings)

🦅 **Animals:**
- Philippine eagle owl
- Various bird species (kingfishers, sunbirds)
- Diverse butterfly species along the published forest routes
- Monitor lizards (rare)

⚠️ **Watch out for:**
- Leeches during wet season
- Fire ants on certain sections
- Non-venomous snakes (rare but present — don't disturb)`,
  },
  {
    keywords: ['leech', 'leeches', 'bite', 'blood'],
    answer: `**Dealing with Leeches:**

- Common during rainy season (June–October)
- Wear long pants tucked into socks
- Apply insect repellent on ankles and shoes
- If bitten: don't pull — apply salt, alcohol, or heat to detach
- Clean bite with antiseptic; bleeding is normal and will stop
- Not dangerous but can be uncomfortable`,
  },

  // ─── SAFETY ───
  {
    keywords: ['emergency', 'rescue', 'help', 'danger', 'accident', 'lost', 'sos'],
    answer: `**Emergency Information:**

🚨 If you're in danger, **call local authorities immediately.**

- 📞 National Emergency: **911**
- Always register at the trailhead before hiking
- Carry a whistle for signaling (3 blasts = distress)
- Stay on marked trails — don't take shortcuts
- Contact the barangay hall for rescue coordination
- Always hike with a buddy
- Share your itinerary with someone not on the hike`,
  },
  {
    keywords: ['safe', 'safety', 'tip', 'tips', 'precaution', 'rule', 'rules'],
    answer: `**Safety Tips:**

1. ✅ Always register at the trailhead
2. ✅ Bring at least 2L of water per person
3. ✅ Wear proper hiking shoes
4. ✅ Start before 6 AM
5. ✅ Always hike with a buddy
6. ✅ Bring rain gear during transition months
7. ✅ Tell someone your expected return time
8. ✅ Stay on marked trails
9. ✅ Carry a whistle and flashlight
10. ❌ Don't litter — practice Leave No Trace`,
  },
  {
    keywords: ['signal', 'phone', 'cell', 'network', 'reception', 'coverage', 'gps'],
    answer: `**Phone Signal & Connectivity:**

- Signal is **weak to none** on most of the trail
- Best signal: trailhead and some ridge sections
- 📱 Download offline maps before your hike (offline maps or AllTrails)
- GPS works even without signal — keep location services on
- Bring a power bank — GPS drains battery fast
- Consider a two-way radio for group hikes`,
  },

  // ─── REGISTRATION & FEES ───
  {
    keywords: ['register', 'registration', 'fee', 'permit', 'book', 'cost', 'price', 'entrance', 'how much'],
    answer: () => {
      const p = getPricingConfig();
      return `**Registration & Fees:**

- Registration is **required** at the barangay hall / trailhead
- Registration fee: ₱${p.entryFee} per person
- Environmental fee: ₱${p.envFee} per person
- Mandatory Mountain Guide fee: ₱${p.guideFeeMorning} per morning guide (1 guide per ${p.maxPaxPerGuide} hikers; groups over ${p.maxPaxPerGuide} require an additional guide)
- Groups should register together
- Bring exact cash, GCash, or pre-book through the app

💡 Book through the app to pre-register and skip the queue!`;
    },
  },

  // ─── DIFFICULTY & FITNESS ───
  {
    keywords: ['difficulty', 'beginner', 'easy', 'hard', 'moderate', 'level', 'fitness', 'fit'],
    answer: `**Trail Difficulty Levels:**

- Route difficulty is published per jump-off: Lamot 1, Lamot 2, or Sto. Tomas.
- Use the selected route record for its current distance, terrain, and expected time.

**Fitness tips:**
- Ask the assigned guide which published route sections match your experience.
- Start jogging/walking 2 weeks before a steep route if your guide recommends it.
- Stretch before and after the hike
- Listen to your body — rest when needed`,
  },
  {
    keywords: ['kid', 'kids', 'child', 'children', 'family', 'baby', 'toddler'],
    answer: `**Hiking with Kids:**

- ✅ Ask the guide which published route is suitable for your family group.
- Children 7+ can handle it with supervision
- ❌ Steep sections may not be suitable for young children
- Bring extra snacks and water for kids
- Keep them close — some sections have drop-offs
- Consider a carrier for toddlers only where the assigned guide confirms the terrain is suitable
- Start very early to avoid midday heat`,
  },
  {
    keywords: ['senior', 'elderly', 'old', 'age', 'knee', 'joint'],
    answer: `**For Senior Hikers:**

- ✅ Ask the guide which published route is gentlest for your fitness level
- Use trekking poles for stability
- Take frequent breaks
- Avoid steep sections if you have knee/joint issues
- Start early when it's cooler
- Bring personal medication
- Hike at your own pace — it's not a race!`,
  },

  // ─── TIME & DURATION ───
  {
    keywords: ['time', 'duration', 'how long', 'hours', 'start', 'early', 'schedule'],
    answer: `**Hiking Duration & Schedule:**

| Trail | Up | Down | Total |
|-------|-----|------|-------|
| Summit | 2–3 hrs | 1.5–2 hrs | 3.5–5 hrs |
| Ridge | 1.5–2 hrs | 1–1.5 hrs | 2.5–3.5 hrs |
| Plantation | 1–1.5 hrs | 45 min–1 hr | 1.5–2.5 hrs |

⏰ **Recommended start:** Before 6 AM
🏁 **Aim to finish by:** 12 PM (avoid afternoon heat & storms)`,
  },

  // ─── ELEVATION ───
  {
    keywords: ['elevation', 'height', 'altitude', 'summit', 'meters', 'tall'],
    answer: `**Mt. Kalisungan Elevation:**

- Mountain summit: **760 MASL** (2,493 ft)
- Location: Calauan, Laguna, Philippines
- Coordinates: approximately 14.1475°N, 121.3454°E
- Prominence: ~400m from trailhead
- One of the accessible peaks in Laguna province`,
  },

  // ─── WATER & HYDRATION ───
  {
    keywords: ['water', 'hydration', 'drink', 'thirsty', 'dehydrate'],
    answer: `**Hydration Tips:**

- Bring at least **2 liters of water** per person
- There are no reliable water sources on the trail
- Consider electrolyte drinks for longer hikes
- Start hydrating the day before your hike
- Drink small sips regularly, don't wait until thirsty
- Avoid alcohol the night before
- Coconut water is a great post-hike recovery drink`,
  },

  // ─── ACCOMMODATIONS ───
  {
    keywords: ['hotel', 'accommodation', 'stay', 'sleep', 'lodge', 'inn', 'resort', 'hostel', 'airbnb', 'overnight', 'camp', 'camping', 'tent'],
    answer: `**Nearby Accommodations:**

🏕️ **Camping:**
- Camping is possible near the trailhead (ask barangay for permission)
- Bring your own tent, sleeping bag, and mat
- No camping facilities on the mountain itself

🏨 **Nearby Lodging (within 30 min drive):**
- Budget inns and transient homes in Calauan town proper (₱500–1,500/night)
- Resorts near Laguna de Bay (₱1,500–5,000/night)
- Airbnb rentals in nearby towns (Calauan, Los Baños, Calamba)

🏡 **Popular areas to stay:**
- **Los Baños** (30 min) — Many hotels, restaurants, near UPLB
- **Calamba** (40 min) — Hot springs resorts, more hotel options
- **Calauan town** (closest) — Budget-friendly transient rooms

💡 Book accommodation in advance during peak hiking season (Dec–May).`,
  },

  // ─── TRANSPORTATION ───
  {
    keywords: ['transport', 'transportation', 'how to get', 'commute', 'bus', 'van', 'jeep', 'jeepney', 'grab', 'car', 'drive', 'parking', 'direction', 'directions'],
    answer: `**Getting to Mt. Kalisungan:**

🚗 **By Private Car:**
- From Manila: ~2.5–3 hours via SLEX → Calauan exit
- Parking available at the trailhead (limited spots, arrive early)
- Navigation apps: Search "Mt. Kalisungan Trailhead, Calauan, Laguna"

🚌 **By Public Transport:**
- Bus: Take a Calauan/Santa Cruz-bound bus from Buendia or Cubao
- Alight at Calauan junction, then take a tricycle to the trailhead (~₱100–150)
- Jeepney from Los Baños to Calauan is also available

🚐 **By Van:**
- UV Express vans from Olivarez, Biñan to Calauan
- Ask to be dropped at the Calauan proper, then tricycle to trailhead

🏍️ **Tricycle:**
- From Calauan town to trailhead: ₱100–150 (negotiate)
- Arrange return pickup in advance — signal is limited on the mountain

💡 Start your commute early to arrive at the trailhead by 5:30–6:00 AM.`,
  },
  {
    keywords: ['parking', 'park', 'car', 'motorcycle', 'vehicle'],
    answer: `**Parking Information:**

- Free parking at the trailhead (limited spots)
- Arrive before 6 AM on weekends to secure a spot
- Motorcycle parking also available
- Your vehicle should be safe, but don't leave valuables visible
- Consider carpooling — fewer cars, easier parking`,
  },

  // ─── FOOD & DINING ───
  {
    keywords: ['food', 'eat', 'restaurant', 'dining', 'meal', 'snack', 'store', 'sari-sari', 'canteen', 'cook', 'cooking', 'breakfast', 'lunch'],
    answer: `**Food Options:**

🏔️ **On the Trail:**
- No food stalls on the mountain
- Bring your own trail food: energy bars, nuts, sandwiches, bananas, dried fruit
- Pack out all trash (Leave No Trace!)

🍽️ **Near the Trailhead:**
- Small sari-sari stores for drinks and snacks
- Local eateries (karinderya) in Calauan town — rice meals ₱50–80
- Street food near the town proper

🍴 **Nearby Restaurants (post-hike):**
- **Calauan town** — Local Filipino restaurants
- **Los Baños** (30 min) — Wide variety: Filipino, Korean, Japanese, cafes
- **Calamba** (40 min) — Mall food courts, restaurant strips
- Popular post-hike spot: bulalo (beef bone marrow soup) restaurants in Tagaytay

💡 Eat a good breakfast before starting — carbs and protein for energy.`,
  },
  {
    keywords: ['trail food', 'snack', 'energy', 'nutrition', 'eat on trail'],
    answer: `**Best Trail Snacks:**

- 🍌 Bananas — natural energy, easy to carry
- 🥜 Trail mix (nuts, dried fruit, chocolate)
- 🍫 Energy/granola bars
- 🥪 Sandwiches (PB&J holds up well)
- 🍬 Hard candy for quick sugar boost
- 🧃 Electrolyte drinks or powder
- 🍚 Rice balls (onigiri) for longer hikes

⚠️ Avoid heavy, greasy food — it slows you down
💡 Eat small amounts frequently rather than one big meal`,
  },

  // ─── HISTORY & CULTURE ───
  {
    keywords: ['history', 'story', 'culture', 'name', 'meaning', 'origin', 'about', 'background', 'local'],
    answer: `**About Mt. Kalisungan:**

- Located in Calauan, Laguna, Philippines
- Mountain summit: 760 MASL; route terrain elevations are published separately
- The name "Kalisungan" comes from the local dialect
- Part of the Sierra Madre mountain range foothills
- Rich in biodiversity and tropical forest ecosystems
- Popular hiking destination for beginners and weekend warriors
- The local barangay manages trail maintenance and safety
- Cultural significance to the local Calauan community`,
  },

  // ─── PHOTOGRAPHY ───
  {
    keywords: ['photo', 'photography', 'camera', 'picture', 'instagram', 'selfie', 'sunset', 'sunrise', 'view'],
    answer: `**Photography Tips:**

📸 **Best photo spots:**
- Summit — 360° panoramic views (best at sunrise)
- Lamot 1 — route-specific landscape shots
- Lamot 2 and Sto. Tomas — forest and jump-off scenery
- Sunrise from the summit is the #1 photo op

⏰ **Best times:**
- Sunrise: 5:30–6:30 AM (golden hour)
- Early morning: 6–8 AM (soft light, misty atmosphere)
- Avoid midday — harsh shadows

📱 **Tips:**
- Protect camera/phone from moisture
- Bring a ziplock bag for rain protection
- Wide-angle lens works best for summit views
- Portrait mode great for trail shots with bokeh`,
  },

  // ─── ETIQUETTE & ENVIRONMENT ───
  {
    keywords: ['trash', 'garbage', 'litter', 'clean', 'leave no trace', 'environment', 'eco', 'plastic'],
    answer: `**Trail Etiquette & Leave No Trace:**

1. 🗑️ **Pack out ALL trash** — bring a trash bag
2. 🚫 No single-use plastics — use refillable bottles
3. 🌿 Stay on marked trails — don't create shortcuts
4. 🔇 Keep noise levels down — respect wildlife
5. 🚭 No smoking on the trail
6. 🔥 No open fires unless in designated areas
7. 📸 Don't disturb plants or animals for photos
8. 🤝 Yield to hikers going uphill
9. 💧 Don't pollute water sources
10. ♻️ If you see trash, pick it up — leave it better than you found it`,
  },

  // ─── GROUPS & GUIDES ───
  {
    keywords: ['guide', 'tour', 'group', 'hire', 'porter', 'organized', 'join'],
    answer: () => {
      const p = getPricingConfig();
      return `**Guides & Group Hikes:**

- A guide is mandatory: 1 guide covers 1–${p.maxPaxPerGuide} hikers
- Guide rate: ₱${p.guideFeeMorning} morning, ₱${p.guideFeeNight} night, or ₱${p.guideFeeOvernight} overnight per guide
- Guides know the best routes and hidden viewpoints
- Group hikes organized by local mountaineering clubs
- Join Facebook groups for organized weekend hikes
- Minimum group size: 2 (never hike alone)
- Maximum group: Check with barangay for capacity limits`;
    },
  },

  // ─── NEARBY ATTRACTIONS ───
  {
    keywords: ['nearby', 'attraction', 'visit', 'tourist', 'other', 'side trip', 'what else', 'explore'],
    answer: `**Nearby Attractions:**

- 🌊 **Laguna de Bay** — Largest lake in the Philippines (30 min drive)
- 🏫 **UPLB** (Los Baños) — Beautiful campus, museum, botanical garden
- ♨️ **Calamba Hot Springs** — Perfect post-hike relaxation (40 min)
- 🏔️ **Mt. Makiling** — Another popular hiking destination nearby
- 🌿 **Makiling Botanic Gardens** — Nature walks and bird watching
- 🍦 **Los Baños town** — Known for ice cream, dairy products
- 🏛️ **Rizal Shrine** (Calamba) — Historical site`,
  },

  // ─── BUDGET ───
  {
    keywords: ['budget', 'expense', 'spend', 'cheap', 'affordable', 'money', 'total cost'],
    answer: () => {
      const p = getPricingConfig();
      return `**Estimated Budget (per person):**

| Item | Cost (₱) |
|------|----------|
| Registration / entry fee | ₱${p.entryFee} |
| Environmental fee | ₱${p.envFee} |
| Morning guide (1–${p.maxPaxPerGuide} hikers) | ₱${p.guideFeeMorning} per guide |
| Night guide (1–${p.maxPaxPerGuide} hikers) | ₱${p.guideFeeNight} per guide |
| Overnight guide (1–${p.maxPaxPerGuide} hikers) | ₱${p.guideFeeOvernight} per guide |
| Transportation (Manila roundtrip) | 300–600 |
| Food & water | 200–400 |
| Accommodation | Bring your own tent; no peak lodging |

💡 Your final total depends on group size, hike type, transport, and optional emergency services.`;
    },
  },

  // ─── BEST TIME TO VISIT ───
  {
    keywords: ['best time', 'when', 'month', 'recommend', 'ideal', 'perfect', 'visit'],
    answer: `**Best Time to Visit:**

🌟 **Top pick:** December to February
- Cool weather, clear skies, minimal rain
- Perfect for sunrise hikes

✅ **Also great:** March to May
- Dry but hot — start very early
- Less crowded on weekdays

⚠️ **Avoid:** June to October
- Heavy rains, typhoon season
- Slippery trails, leech season
- Flash flood risk

📅 **Weekdays** are less crowded than weekends
🎄 **Holiday weekends** get very busy — arrive extra early`,
  },

  // ─── SOLO HIKING ───
  {
    keywords: ['solo', 'alone', 'single', 'one person', 'by myself'],
    answer: `**Solo Hiking Advisory:**

⚠️ **Solo hiking is not recommended** on Mt. Kalisungan.

- Always hike with at least one buddy
- If you must go solo, inform the barangay and leave your itinerary
- Hire a local guide for safety
- Tell someone your expected return time
- Bring a whistle and fully charged phone
- Follow the selected published route and your assigned guide's safety instructions
- Join organized group hikes through Facebook/mountaineering clubs`,
  },

  // ─── NIGHT HIKING ───
  {
    keywords: ['night', 'nighttime', 'dark', 'headlamp', 'lamp', 'star', 'stargazing'],
    answer: `**Night Hiking:**

- Night hikes to catch the sunrise are popular
- Start at 3–4 AM to reach the summit by sunrise
- **Essential gear:** Headlamp with spare batteries
- Stay on marked trails — getting lost at night is dangerous
- Go with a guide or experienced group
- The summit offers decent stargazing on clear nights (limited light pollution)
- ⚠️ Watch for snakes and spiders on the trail at night`,
  },

  // ─── MOBILE APP ───
  {
    keywords: ['app', 'download', 'application', 'mobile', 'use', 'feature', 'map', 'offline map'],
    answer: `**Using This App:**

📱 **Key features:**
- 🗺️ Interactive trail map with GPS tracking
- 📍 Real-time location on the trail
- 🧭 Built-in compass
- 📊 Elevation profile for each trail
- 📅 Online booking & registration
- 🤖 AI Trail Assistant (this chat!)
- 📴 Works offline with local knowledge base

💡 Download offline maps before your hike for GPS navigation without signal.`,
  },
];

// ─── LEARNING CACHE ───
// Stores AI responses in localStorage so they can be served offline next time

interface CachedQA {
  query: string;
  keywords: string[];
  answer: string;
  timestamp: number;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'during', 'before', 'after', 'above', 'below', 'and', 'but',
    'or', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
    'such', 'than', 'too', 'very', 'just', 'because', 'if', 'when', 'what',
    'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me',
    'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
    'how', 'where', 'there', 'here', 'up', 'out', 'then', 'also', 'its',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function loadCache(): CachedQA[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCache(cache: CachedQA[]) {
  try {
    // Keep only the most recent entries
    const trimmed = cache.slice(-CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full — silently fail */ }
}

/** Call after a successful online AI response to cache it for future offline use */
export function learnFromResponse(userQuery: string, aiResponse: string) {
  if (!userQuery.trim() || !aiResponse.trim() || aiResponse.length < 30) return;
  // Don't cache error messages
  if (aiResponse.includes('*Error:')) return;

  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) return;

  const cache = loadCache();

  // Check for duplicate — if same keywords exist, update the answer
  const existing = cache.findIndex((c) =>
    c.keywords.length > 0 && keywords.some((kw) => c.keywords.includes(kw)) &&
    keywords.filter((kw) => c.keywords.includes(kw)).length >= Math.min(2, keywords.length)
  );

  const entry: CachedQA = { query: userQuery, keywords, answer: aiResponse, timestamp: Date.now() };

  if (existing >= 0) {
    cache[existing] = entry; // update
  } else {
    cache.push(entry);
  }

  saveCache(cache);
}

/** Get the number of cached responses */
export function getCacheSize(): number {
  return loadCache().length;
}

function formatSyncLabel(syncedAt: string | null): string {
  if (!syncedAt) return 'Latest system configuration';
  try {
    const dt = new Date(syncedAt);
    if (Number.isNaN(dt.getTime())) return 'Latest system configuration';
    return `Last synced from live system: ${dt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}`;
  } catch {
    return 'Latest system configuration';
  }
}

/**
 * Matches the 8 Official System FAQs and live system data questions (clothing/what to wear,
 * river crossings, mandatory guide, guide assignment/referral code, difficulty & elevation,
 * booking time slots, summit overnight camping, trailhead entry points, commute directions,
 * fees/fares, and capacity) using the latest synced live system snapshot.
 */
export function matchSystemFaqOrLiveQuery(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const snap = getLiveSystemSnapshot();
  const p = snap.pricing;
  const syncNote = formatSyncLabel(snap.syncedAt);

  // FAQ-05 (New): What is advisable to wear during a hike at Mt. Kalisungan?
  if (/(advisable to wear|what to wear|what should i wear|wear during a hike|recommended clothing|clothing|clothes|attire|outfit|dress|jacket|raincoat)/i.test(q)) {
    return (
      `**What is advisable to wear during a hike at Mt. Kalisungan?**\n\n` +
      `${OFFICIAL_CLOTHING_FAQ_ANSWER}\n\n` +
      `• **Sunny / Hot Weather:** Lightweight, breathable clothing, a cap or hat, and comfortable hiking shoes with good grip.\n` +
      `• **Rainy / Cold Weather:** Quick-drying clothes, a waterproof jacket or raincoat, and non-slip hiking shoes to prevent slipping on muddy trails.`
    );
  }

  // FAQ-01: Are there any river crossings on Mt. Kalisungan?
  if (/(river|crossing|creek|stream|water crossing|wading|waterfall)/i.test(q)) {
    return (
      `**🚫 Are there any river crossings on Mt. Kalisungan?**\n\n` +
      `**Strictly zero (0) river crossings.** Mt. Kalisungan has **no river crossings** anywhere along its trails. ` +
      `The path traverses dry agricultural footpaths, coconut plantations, fruit orchards, forest trails, and open cogon grassland ridges up to the **${MOUNTAIN_ELEVATION_LABEL}** summit. ` +
      `Hikers do not need to wade across streams or rivers. Route conditions vary by published trail and weather—check your selected route briefing and follow your accredited Mountain Guide around muddy or uneven sections.`
    );
  }

  // FAQ-03: How does guide assignment work during booking?
  if (/(guide assignment|assign.*guide|how does guide|choose a guide|pick a guide|select a guide|referral code|referral link|guide rotation)/i.test(q)) {
    return (
      `**How does guide assignment work during booking?**\n\n` +
      `Manual guide picking from a list is disabled to ensure **fair livelihood rotation** among local mountain guides. ` +
      `You may enter a guide's **referral code or referral link** during booking. ` +
      `If none is entered, or if your group needs **2+ guides** (more than ${p.maxPaxPerGuide} hikers), the system automatically assigns certified mountain guides on rotation.`
    );
  }

  // FAQ-02: Is a local guide mandatory for all hikers?
  if (/(guide mandatory|mandatory.*guide|is a.*guide.*mandatory|is a.*guide.*required|need a guide|require a guide|without a guide|do we need a guide)/i.test(q)) {
    return (
      `**Is a local guide mandatory for all hikers?**\n\n` +
      `**Yes.** By municipal tourism ordinance, every group must be accompanied by an accredited local Mountain Guide (**1 guide per ${p.maxPaxPerGuide} hikers**) to ensure hiker safety, proper navigation, and environmental preservation.\n\n` +
      `• **Morning Guide Fee:** ₱${p.guideFeeMorning} per guide\n` +
      `• **Night Guide Fee:** ₱${p.guideFeeNight} per guide\n` +
      `• **Overnight Guide Fee:** ₱${p.guideFeeOvernight} per guide\n` +
      `*(${syncNote})*`
    );
  }

  // FAQ-06: Can we camp overnight at the summit?
  if (/(camp overnight|overnight.*summit|can we camp|camping.*summit|summit.*camp|pitch a tent|bonfire|campfire)/i.test(q)) {
    return (
      `**Can we camp overnight at the summit?**\n\n` +
      `**Yes!** Overnight slots are available on the summit grassland (departures at **${snap.schedule.overnight.join(', ')}**). ` +
      `Campers must bring their own **wind-resistant tents, warm clothing, and drinking water** (tents are not provided and there is no lodging at the peak). ` +
      `**Open bonfires are strictly prohibited** to protect the cogon grass and prevent bushfires.`
    );
  }

  // FAQ-08: How do we get to the trailhead via commute?
  if (/(via commute|how do we get to the trailhead|how to get to.*trailhead|commute|public transport|bus to|duck junction|tricycle)/i.test(q)) {
    return (
      `**How do we get to the trailhead via commute?**\n\n` +
      `Take any provincial bus bound for **Sta. Cruz, Laguna** from **Buendia, Pasay, or Cubao**. ` +
      `Disembark at **Duck Junction / Calauan highway**, then hire a local tricycle directly to the **Lamot 1, Lamot 2, or Sto. Tomas Barangay Hall / Trailhead Terminal** (approx. ₱100–150).\n\n` +
      `• **By Private Car:** Take SLEX to the Calauan exit (~2.5–3 hours from Manila) and navigate to your chosen barangay trailhead.`
    );
  }

  // FAQ-07: What trailhead entry points can I choose from?
  if (/(trailhead entry points|entry points|jump-off|jump off|jumpoff|which trailhead|what trailhead|choose from)/i.test(q)) {
    const routeLines = snap.routes.length
      ? '\n\n**Latest Synced Published Routes:**\n' +
        snap.routes
          .map(
            (r) =>
              `• **${r.locationName} (${r.name})**${r.distanceKm ? ` — ${r.distanceKm} km` : ''}${r.elevationMeters ? `, ${r.elevationMeters}m elevation` : ''}${r.difficulty ? ` (${r.difficulty})` : ''}`,
          )
          .join('\n')
      : '';
    return (
      `**What trailhead entry points can I choose from?**\n\n` +
      `The registered jump-offs in Calauan, Laguna are **Lamot 1**, **Lamot 2**, and **Sto. Tomas**. ` +
      `Route distance, terrain, and timing follow the currently published trail record.${routeLines}\n*(${syncNote})*`
    );
  }

  // FAQ-04: What is the difficulty rating and summit elevation?
  if (/(difficulty rating|summit elevation|difficulty.*elevation|elevation.*difficulty|how high|masl|altitude|elevation)/i.test(q)) {
    const routeLines = snap.routes.length
      ? '\n\n**Published Route Records:**\n' +
        snap.routes
          .map(
            (r) =>
              `• **${r.locationName} (${r.name}):** Difficulty: ${r.difficulty || MOUNTAIN_FACTS.difficulty}${r.distanceKm ? `, Distance: ${r.distanceKm} km` : ''}${r.elevationMeters ? `, Elevation: ${r.elevationMeters}m` : ''}`,
          )
          .join('\n')
      : '';
    return (
      `**What is the difficulty rating and summit elevation?**\n\n` +
      `The mountain stands at **${MOUNTAIN_ELEVATION_LABEL}** (**${MOUNTAIN_ELEVATION_FEET_LABEL}** above sea level) in ${MOUNTAIN_FACTS.place} and is classified overall as **${MOUNTAIN_FACTS.difficulty}** (typically taking ${MOUNTAIN_FACTS.typicalHikingTime}). ` +
      `Route-specific timing and terrain are shown from the selected published route record.${routeLines}\n*(${syncNote})*`
    );
  }

  // Booking Time Slots / Schedule (Former FAQ-05 & live schedule inquiries)
  if (/(booking time slots|available.*time slots|time slots|start time|schedule|available.*slots)/i.test(q)) {
    return (
      `**Available Booking Time Slots & Schedule:**\n\n` +
      `To prevent overcrowding, slots follow published intervals:\n` +
      `• **Morning Hike:** ${snap.schedule.morning.join(', ')}\n` +
      `• **Afternoon / Night Hike:** ${snap.schedule.night.join(', ')}\n` +
      `• **Overnight Hike:** ${snap.schedule.overnight.join(', ')}\n` +
      `• **Capacity Rules:** Up to **${snap.capacity.sharedMaxGroups} groups** per start-time slot, maximum **${snap.capacity.maxPeoplePerGroup} hikers per group** (${snap.capacity.mode === 'per_trailhead' ? 'per trailhead' : 'shared across trailheads'}).\n` +
      `*(${syncNote})*`
    );
  }

  // Live Fees / Fares / Pricing Inquiries
  if (/(fee|fees|pricing|prices|price|cost|costs|rate|rates|fare|fares|magkano|how much)/i.test(q)) {
    return (
      `**Official Mt. Kalisungan Published Fees & Fares:**\n\n` +
      `• **Registration / Entry Fee:** ₱${p.entryFee} per hiker\n` +
      `• **Environmental / DSPA Fee:** ₱${p.envFee} per hiker\n` +
      `• **Mandatory Mountain Guide Fee** (1 guide covers 1–${p.maxPaxPerGuide} hikers):\n` +
      `  - Morning Hike: ₱${p.guideFeeMorning} per guide\n` +
      `  - Night Hike: ₱${p.guideFeeNight} per guide\n` +
      `  - Overnight Hike: ₱${p.guideFeeOvernight} per guide\n` +
      `• **Peak Summit Extension:** ₱${p.peakExtensionFeePerHour} per extra hour\n` +
      `• **Emergency Horse Assistance:** ₱${p.horseEmergencyFee} (Stations 2–1) / ₱${p.horseHighStationFee} (Stations 5–3)\n\n` +
      `*(${syncNote})*`
    );
  }

  // Capacity / Group Limit Inquiries
  if (/(capacity|group limit|max group|maximum hikers|daily limit|how many groups)/i.test(q)) {
    return (
      `**Mt. Kalisungan Capacity & Group Rules:**\n\n` +
      `• **Capacity Mode:** ${snap.capacity.mode === 'per_trailhead' ? 'Per trailhead' : 'Shared across active trailheads'}\n` +
      `• **Max Groups per Start Time:** ${snap.capacity.sharedMaxGroups} groups\n` +
      `• **Max Hikers per Guide Group:** ${snap.capacity.maxPeoplePerGroup} hikers (groups above ${p.maxPaxPerGuide} require an additional guide)\n` +
      (snap.capacity.dailyLimit ? `• **Daily Mountain Limit:** ${snap.capacity.dailyLimit} hikers\n` : '') +
      `• **Active Trailheads:** ${snap.trailheads.join(', ')}\n` +
      `*(${syncNote})*`
    );
  }

  // Trails / Routes / Distance / Difficulty general queries
  if (/(trail|trails|route|routes|distance|difficulty)/i.test(q)) {
    const routeLines = snap.routes.length
      ? '\n\n**Latest Synced Published Routes:**\n' +
        snap.routes
          .map(
            (r) =>
              `• **${r.locationName} (${r.name})**${r.distanceKm ? ` — ${r.distanceKm} km` : ''}${r.elevationMeters ? `, ${r.elevationMeters}m elevation` : ''}${r.difficulty ? `, ${r.difficulty}` : ''}${r.stationNames?.length ? ` (Stations: ${r.stationNames.join(' → ')})` : ''}`,
          )
          .join('\n')
      : '';
    return (
      `**Mt. Kalisungan Trails & Official Jump-Offs (${MOUNTAIN_ELEVATION_LABEL}):**\n\n` +
      `The mountain stands at **${MOUNTAIN_ELEVATION_LABEL}** (${MOUNTAIN_ELEVATION_FEET_LABEL}) in ${MOUNTAIN_FACTS.place}, rated **${MOUNTAIN_FACTS.difficulty}** overall (${MOUNTAIN_FACTS.typicalHikingTime}), with **strictly 0 river crossings**.\n\n` +
      `**Official Registered Trailheads:**\n` +
      `1. **Lamot 1** — Official jump-off in Calauan, Laguna\n` +
      `2. **Lamot 2** — Official jump-off in Calauan, Laguna\n` +
      `3. **Sto. Tomas** — Official jump-off in Calauan, Laguna${routeLines}\n*(${syncNote})*`
    );
  }

  return null;
}

export function getOfflineAnswer(query: string): string {
  const q = query.toLowerCase();

  // 1. Check Official System FAQs & Live-Synced System Snapshot first
  const faqOrLive = matchSystemFaqOrLiveQuery(query);
  if (faqOrLive) {
    return `${faqOrLive}\n\n---\n*📴 Offline mode — using latest synced system data (${formatSyncLabel(getLiveSystemSnapshot().syncedAt)}).*`;
  }

  const queryKeywords = extractKeywords(query);

  // 2. Score learned cache entries (from previous online AI sessions)
  let best: { score: number; answer: string } = { score: 0, answer: '' };
  const cache = loadCache();
  for (const entry of cache) {
    const score =
      entry.keywords.reduce((s, kw) => s + (q.includes(kw) ? 1 : 0), 0) +
      queryKeywords.filter((kw) => entry.keywords.includes(kw)).length;
    if (score > best.score) best = { score, answer: entry.answer };
  }

  // 3. Score static KB entries
  for (const entry of KB) {
    const score = entry.keywords.reduce((s, kw) => s + (q.includes(kw) ? 1 : 0), 0);
    if (score > best.score) {
      const ans = typeof entry.answer === 'function' ? entry.answer() : entry.answer;
      best = { score, answer: ans };
    }
  }

  if (best.score > 0) {
    return `${best.answer}\n\n---\n*📴 Offline mode — using latest synced system data (${formatSyncLabel(getLiveSystemSnapshot().syncedAt)}).*`;
  }

  return (
    `**Mt. Kalisungan Trail Assistant (${MOUNTAIN_ELEVATION_LABEL}):**\n\n` +
    `• **Elevation & Difficulty:** ${MOUNTAIN_ELEVATION_LABEL} (${MOUNTAIN_ELEVATION_FEET_LABEL}), ${MOUNTAIN_FACTS.difficulty}\n` +
    `• **Trailheads:** ${getLiveSystemSnapshot().trailheads.join(', ')} (Strictly 0 river crossings)\n` +
    `• **Mandatory Guide:** 1 accredited Mountain Guide per ${getLiveSystemSnapshot().pricing.maxPaxPerGuide} hikers (assigned via referral code/link or automatic rotation)\n` +
    `• **What to Wear:** ${OFFICIAL_CLOTHING_FAQ_ANSWER}\n\n` +
    `---\n*📴 Offline mode — using latest synced system data (${formatSyncLabel(getLiveSystemSnapshot().syncedAt)}).*`
  );
}
