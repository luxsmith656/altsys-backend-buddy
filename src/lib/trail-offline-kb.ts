// Offline knowledge base for Mt. Kalisungan trail assistant
// Static entries + dynamic learning cache from previous AI responses

const CACHE_KEY = 'kalisungan_learned_cache';
const CACHE_MAX = 200;

interface KBEntry {
  keywords: string[];
  answer: string;
}

const KB: KBEntry[] = [
  // ─── TRAILS ───
  {
    keywords: ['trail', 'available', 'trails', 'route', 'routes', 'path', 'which'],
    answer: `**Mt. Kalisungan has 3 trails:**

1. **Summit Trail (Hard)** – 3.2 km, steep ascent through forest canopy to 622m summit
2. **River Trail (Easy)** – 2.1 km, scenic riverside path, great for beginners, max 350m elevation
3. **Ridge Trail (Moderate)** – 2.8 km, panoramic ridge views, 480m elevation`,
  },
  {
    keywords: ['summit', 'trail', 'top', 'peak'],
    answer: `**Summit Trail (Hard):**

- Distance: 3.2 km one way
- Elevation gain: ~622m
- Duration: 2–4 hours to summit
- Features: Dense forest canopy, steep switchbacks, rocky sections near the top
- Best for: Experienced hikers looking for a workout
- ⚠️ Can be very slippery when wet — bring trekking poles`,
  },
  {
    keywords: ['river', 'trail', 'riverside', 'creek', 'stream'],
    answer: `**River Trail (Easy):**

- Distance: 2.1 km one way
- Max elevation: 350m
- Duration: 1–2 hours
- Features: Scenic riverside path, natural pools, shaded canopy
- Best for: Beginners, families, and casual hikers
- Tip: Great for photography — morning light hits the river beautifully`,
  },
  {
    keywords: ['ridge', 'trail', 'panoramic', 'view', 'views'],
    answer: `**Ridge Trail (Moderate):**

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
- ✅ Ankle-high boots recommended for Summit Trail
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
- Summit (622m): Usually 3–5°C cooler than base
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
- Diverse butterfly species along River Trail
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
    answer: `**Registration & Fees:**

- Registration is **required** at the barangay hall / trailhead
- Registration fee: ₱30 per person
- Environmental fee: ₱20 per person
- Mandatory Tour Guide fee: ₱800 per guide (1 guide per 8 hikers; groups over 8 require an additional guide)
- Groups should register together
- Bring exact cash, GCash, or pre-book through the app

💡 Book through the app to pre-register and skip the queue!`,
  },

  // ─── DIFFICULTY & FITNESS ───
  {
    keywords: ['difficulty', 'beginner', 'easy', 'hard', 'moderate', 'level', 'fitness', 'fit'],
    answer: `**Trail Difficulty Levels:**

- 🟢 **River Trail (Easy)** – Best for beginners, families, 2.1 km
- 🟡 **Ridge Trail (Moderate)** – Some steep sections, 2.8 km
- 🔴 **Summit Trail (Hard)** – Steep ascent, requires good fitness, 3.2 km

**Fitness tips:**
- No prior hiking experience needed for River Trail
- Start jogging/walking 2 weeks before for Summit Trail
- Stretch before and after the hike
- Listen to your body — rest when needed`,
  },
  {
    keywords: ['kid', 'kids', 'child', 'children', 'family', 'baby', 'toddler'],
    answer: `**Hiking with Kids:**

- ✅ **River Trail** is family-friendly (Easy, 2.1 km)
- Children 7+ can handle it with supervision
- ❌ Summit Trail not recommended for young children
- Bring extra snacks and water for kids
- Keep them close — some sections have drop-offs
- Consider a carrier for toddlers on River Trail only
- Start very early to avoid midday heat`,
  },
  {
    keywords: ['senior', 'elderly', 'old', 'age', 'knee', 'joint'],
    answer: `**For Senior Hikers:**

- ✅ **River Trail** is gentle and doable for most fitness levels
- Use trekking poles for stability
- Take frequent breaks
- Avoid Summit Trail if you have knee/joint issues
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
| River | 1–1.5 hrs | 45 min–1 hr | 1.5–2.5 hrs |

⏰ **Recommended start:** Before 6 AM
🏁 **Aim to finish by:** 12 PM (avoid afternoon heat & storms)`,
  },

  // ─── ELEVATION ───
  {
    keywords: ['elevation', 'height', 'altitude', 'summit', 'meters', 'tall'],
    answer: `**Mt. Kalisungan Elevation:**

- Summit: **622 meters** above sea level
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
- Elevation: 622 meters above sea level
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
- Ridge Trail — dramatic landscape shots
- River Trail — waterfalls and forest canopy
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
    answer: `**Guides & Group Hikes:**

- Local guides available at the trailhead (₱300–500/day)
- Guides are **recommended** for first-timers on Summit Trail
- Guides know the best routes and hidden viewpoints
- Group hikes organized by local mountaineering clubs
- Join Facebook groups for organized weekend hikes
- Minimum group size: 2 (never hike alone)
- Maximum group: Check with barangay for capacity limits`,
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
    answer: `**Estimated Budget (per person):**

| Item | Cost (₱) |
|------|----------|
| Registration fee | 50–100 |
| Guide (optional) | 300–500 |
| Transportation (Manila roundtrip) | 300–600 |
| Food & water | 200–400 |
| Accommodation (if overnight) | 500–3,000 |
| **Total day trip** | **~₱850–1,600** |
| **Total with overnight** | **~₱1,350–4,600** |

💡 Budget tip: Bring your own food and water to save ₱200+`,
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
- Stick to River Trail (easiest, most trafficked)
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

export function getOfflineAnswer(query: string): string {
  const q = query.toLowerCase();
  const queryKeywords = extractKeywords(query);

  // 1. Score static KB entries
  let best: { score: number; answer: string } = { score: 0, answer: '' };

  for (const entry of KB) {
    const score = entry.keywords.reduce((s, kw) => s + (q.includes(kw) ? 1 : 0), 0);
    if (score > best.score) best = { score, answer: entry.answer };
  }

  // 2. Score learned cache entries
  const cache = loadCache();
  for (const entry of cache) {
    const score = entry.keywords.reduce((s, kw) => s + (q.includes(kw) ? 1 : 0), 0) +
      queryKeywords.filter((kw) => entry.keywords.includes(kw)).length;
    if (score > best.score) best = { score, answer: entry.answer };
  }

  if (best.score > 0) {
    return best.answer + '\n\n---\n*📴 Offline response — connect to the internet for more detailed answers.*';
  }

  return `I'm currently **offline** and can only answer from my local knowledge base.

**Topics I can help with:**
- 🥾 Trails (Summit, River, Ridge)
- 🎒 Gear & preparation
- 🌤️ Weather & best seasons
- 🦅 Wildlife & nature
- 🚨 Safety & emergencies
- 📋 Registration & fees
- 🏨 Accommodations nearby
- 🚗 Transportation & directions
- 🍽️ Food & dining options
- 📸 Photography tips
- 💰 Budget estimates
- 👨‍👩‍👧 Family & group hiking
- 🌙 Night hiking

Try asking something specific, or connect to the internet for full AI-powered assistance.`;
}
