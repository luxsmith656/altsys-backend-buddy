import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Send, Users, Calendar, Mountain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getProphetAIForecastContext } from '@/lib/ml/prophetDataService';
import { getHikeTypeLabel, type HikeType } from '@/lib/hikeSchedule';
import KaliAvatar from '@/components/kali/KaliAvatar';
import { getKaliExpression, getKaliQuickReplies } from '@/lib/kaliPersonality';
import { getKaliRoleLabel } from '@/lib/kaliContext';
import { useAuth } from '@/hooks/useAuth';
import ReactMarkdown from 'react-markdown';


interface WeatherSnapshot {
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  condition: string;
  sourceName?: string;
  sourceUrl?: string;
  fetchedAt?: number;
}

export interface GroupComposition {
  adults: number;
  kids: number;
  seniors: number;
}

export interface PublishedRouteContext {
  id: string;
  name: string;
  locationName: string;
  difficulty?: string;
  elevationMeters?: number;
  distanceKm?: number;
  stationNames?: string[];
}

export interface BookingSuggestion {
  date?: string;      // yyyy-MM-dd
  hikeTime?: string;  // "06:00 AM"
  groupSize?: number;
  hikeType?: HikeType;
  label?: string;
  /** AI believes the hiker asked to go ahead — the form still requires review + agreements. */
  submit?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
  suggestion?: BookingSuggestion;
}

interface BookingAIChatProps {
  date?: Date;
  groupSize: number;
  hikeType: HikeType;
  weatherInsight?: WeatherSnapshot | null;
  groupComposition?: GroupComposition | null;
  publishedRoute?: PublishedRouteContext | null;
  onGroupCompositionSet?: (composition: GroupComposition) => void;
  onTimeSuggest?: (time: string) => void;
  hikeTime?: string;
  onApplySuggestion?: (s: BookingSuggestion) => void;
  /** Where the assistant is being shown (page name/route) so it can answer page questions */
  pageContext?: string;
  /** Greeting override for non-booking pages */
  greeting?: string;
  /** Override label for the apply-suggestion button */
  applyLabel?: string;
  /** Hide the built-in launcher when a shared mobile action dock owns it. */
  showLauncher?: boolean;
}


const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trail-chat-rag`;
const APPLY_RE = /\[\[APPLY\s*(\{[\s\S]*?\})\s*\]\]/;

/** Pull the machine-readable booking suggestion out of an assistant reply. */
function extractSuggestion(text: string): { clean: string; suggestion?: BookingSuggestion } {
  const match = text.match(APPLY_RE);
  if (!match) return { clean: text };
  const clean = text.replace(APPLY_RE, '').trim();
  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;
    const suggestion: BookingSuggestion = {};
    if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) suggestion.date = raw.date;
    if (typeof raw.hikeTime === 'string' && /^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(raw.hikeTime.trim())) {
      suggestion.hikeTime = raw.hikeTime.trim().toUpperCase();
    }
    if (typeof raw.groupSize === 'number' && raw.groupSize >= 1 && raw.groupSize <= 30) {
      suggestion.groupSize = Math.round(raw.groupSize);
    }
    if (raw.hikeType === 'day' || raw.hikeType === 'morning' || raw.hikeType === 'night' || raw.hikeType === 'overnight') suggestion.hikeType = raw.hikeType;
    if (typeof raw.label === 'string') suggestion.label = raw.label.slice(0, 80);
    if (raw.submit === true) suggestion.submit = true;
    const hasValue = suggestion.date || suggestion.hikeTime || suggestion.groupSize || suggestion.hikeType;
    return hasValue ? { clean, suggestion } : { clean };
  } catch {
    return { clean };
  }
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

/* ── Weather-aware hike advice ── */
function getWeatherHikeAdvice(
  weather: WeatherSnapshot,
  hikeType: HikeType,
  comp?: GroupComposition | null,
): string {
  const hasKids = comp && comp.kids > 0;
  const hasSeniors = comp && comp.seniors > 0;
  const rainHigh = weather.rainProbability > 50;
  const hotDay = weather.maxTempC >= 32;
  const comfortable = weather.maxTempC < 30 && weather.rainProbability < 30;

  const realWebsiteLink = weather.sourceUrl || 'https://www.mountain-forecast.com/peaks/Mount-Kalisungan/forecasts/686';
  const citationBlock =
    `\n\n🌐 **Official Mountain Weather Forecast Website:**\n` +
    `• [Mountain-Forecast.com (Mt. Kalisungan 686m Peak)](${realWebsiteLink})\n` +
    `• [Zoom Earth Live Satellite Radar](https://zoom.earth/#view=14.1475,121.3454,12z)`;

  if (comfortable) {
    const time = hikeType === 'morning' || hikeType === 'day'
      ? (hasKids || hasSeniors ? '04:00 AM or 06:00 AM' : '06:00 AM')
      : '02:00 PM';
    return (
      `Great news! Forecast looks perfect — **${weather.condition}**, ` +
      `${Math.round(weather.minTempC)}–${Math.round(weather.maxTempC)}°C, ` +
      `only **${Math.round(weather.rainProbability)}% rain** chance.\n\n` +
      `A ${time} start may be comfortable for this forecast.` +
      (hasKids ? ' With kids in your group, the cooler early morning is ideal! 🧒' : '') +
      (hasSeniors ? ' The morning coolness is perfect for your senior companions. 👴' : '') +
      citationBlock
    );
  }
  if (rainHigh) {
    return (
      `⚠️ Heads up! Rain chance is **${Math.round(weather.rainProbability)}%** (${weather.condition}) — quite high.\n\n` +
      `Volcanic clay trails can get very slippery on descents. Note: Mt. Kalisungan has **no river crossings**, but steep clay slopes become muddy. I'd suggest:\n` +
      `• Starting **before 06:00 AM** before rains typically build up\n` +
      `• Bringing rain gear and trekking poles\n` +
      `Please check the official live forecast again before departure.` +
      citationBlock
    );
  }
  if (hotDay) {
    return (
      `🌡️ It'll be quite warm — up to **${Math.round(weather.maxTempC)}°C** (${weather.condition})!` +
      (hasKids ? ' With kids, heat can be extra challenging.' : '') +
      ` I strongly recommend starting at **04:00 AM or 06:00 AM** to summit before peak heat.\n\n` +
      `Bring at least **2L of water per person** and sun protection for the unshaded ridge!` +
      citationBlock
    );
  }
  return (
    `Forecast shows **${weather.condition}** — ` +
    `${Math.round(weather.minTempC)}–${Math.round(weather.maxTempC)}°C, ` +
    `${Math.round(weather.rainProbability)}% rain. Conditions look manageable — come prepared! 🏔️` +
    citationBlock
  );
}

/* ── Group composition advice ── */
function getGroupAdvice(comp: GroupComposition, groupSize: number): string {
  const total = comp.adults + comp.kids + comp.seniors;

  if (comp.kids > 0) {
    return (
      `With **${comp.kids} kid${comp.kids > 1 ? 's' : ''}** in your group, here's my plan:\n\n` +
      `🕐 **Best start time: 05:00 AM** — cooler, less crowded\n` +
      `🥾 **Trail: Day Hike (Summit route)** — most manageable\n` +
      `💧 **Bring:** Extra water, snacks, sunscreen for the little ones\n` +
      `🎒 **Pace:** Plan ~30% longer than average — totally fine!\n\n` +
      `Kids absolutely **love** the summit view — a memory they'll never forget! 🏔️`
    );
  }
  if (comp.seniors > 0) {
    return (
      `With **${comp.seniors} senior${comp.seniors > 1 ? 's' : ''}** in your group:\n\n` +
      `🕐 **Best start time: 05:00–05:30 AM** — cooler, gentler on joints\n` +
      `🥾 **Pace:** Take it slow, enjoy rest stops\n` +
      `💊 **Bring:** Any necessary medications\n` +
      `🩺 **Medical clearance** advisable for 60+ with health conditions\n\n` +
      `Many seniors have made it to the summit and it's incredibly rewarding! 💪`
    );
  }
  if (total > 10) {
    return (
      `Large group of **${total} people** — exciting! Here are my tips:\n\n` +
      `👥 **Split into guide groups** of 1–5 for better trail flow and headcounts\n` +
      `🕐 **Start time: 05:00–06:00 AM** — arrive before crowds\n` +
      `📍 **Designate a group leader** per sub-group\n` +
      `⏱️ **Set a turnaround time** regardless of summit status\n\n` +
      `Large groups create amazing energy on the trail! 🎉`
    );
  }
  return (
    `Your group looks well-balanced! **${comp.adults} adult${comp.adults > 1 ? 's' : ''}** — ` +
    `great size for the trail. One guide covers up to **5 hikers**. I recommend **06:00 AM** start for the best experience. Enjoy! 🏔️`
  );
}

/* ── Rule-based AI response engine ── */
function generateResponse(
  message: string,
  context: {
    date?: Date;
    groupSize: number;
    hikeType: HikeType;
    weatherInsight?: WeatherSnapshot | null;
    groupComposition?: GroupComposition | null;
    publishedRoute?: PublishedRouteContext | null;
  },
  onCompositionDetected: (comp: GroupComposition) => void,
): { content: string; quickReplies?: string[] } {
  const lower = message.toLowerCase();
  const { date, groupSize, hikeType, weatherInsight, groupComposition, publishedRoute } = context;

  /* Greeting */
  if (lower.match(/^(hi|hello|hey|good|musta|kumusta)/)) {
    return {
      content:
        `Hi there! 👋 I'm **Kali**, your AI trail assistant for Mt. Kalisungan!\n\n` +
        `I'm here to help you plan the perfect hike — best dates, start times, group tips, and more. ` +
        `What can I help you with?`,
      quickReplies: ['Best time to go?', 'Is it good for kids?', 'What should I bring?', 'Help me pick a date'],
    };
  }

  /* Kids */
  if (lower.match(/(kid|child|children|baby|toddler|minor|young)/)) {
    return {
      content:
        `Mt. Kalisungan can be great for kids (ages 7+)! 🧒\n\n` +
        `To give you the best recommendation, how many kids and how old are they?\n\n` +
        `You can reply like: *"2 kids, ages 8 and 10"*`,
      quickReplies: ['1 kid age 8', '2 kids ages 7 and 9', 'My kids are teenagers', 'Kids can hike it?'],
    };
  }

  /* Seniors */
  if (lower.match(/(senior|elderly|lolo|lola|grandpa|grandma|parent|60\+)/)) {
    return {
      content:
        `Mt. Kalisungan has been summited by many seniors! 💪\n\n` +
        `For seniors, I recommend:\n` +
        `• Medical clearance if they have any conditions\n` +
        `• **05:00 AM** start for cooler weather\n` +
        `• Day hike for better visibility\n` +
        `• Extra rest stops and hydration\n\n` +
        `How many seniors are in your group?`,
      quickReplies: ['1 senior', '2 seniors', 'My parents are fit!', 'Is it too difficult for them?'],
    };
  }

  /* Quick-reply group composition parsing */
  if (lower === 'all adults' || lower.includes('all adults')) {
    const comp: GroupComposition = { adults: groupSize, kids: 0, seniors: 0 };
    onCompositionDetected(comp);
    return {
      content:
        `Perfect — all adults! 🙌 Here's your optimized plan:\n\n` +
        `⭐ **Best time: 06:00 AM** (Day Hike)\n` +
        `🏔️ **Trail: Summit Route** for the full experience\n` +
        `💪 **Pace: Moderate** — plan 3–4 hours up\n\n` +
        `You've got an ideal group for a great adventure. Ready to lock in that booking?`,
      quickReplies: ["Let's continue booking", 'What about night hike?', 'Pack list please'],
    };
  }

  if (lower.match(/we have senior/)) {
    const comp: GroupComposition = { adults: Math.max(0, groupSize - 1), kids: 0, seniors: 1 };
    onCompositionDetected(comp);
    return { content: getGroupAdvice(comp, groupSize), quickReplies: ['What to bring for seniors?', 'Best route?', 'Continue booking'] };
  }

  /* Number + kid pattern */
  const kidsMatch = lower.match(/(\d+)\s*kid/);
  const adultsMatch = lower.match(/(\d+)\s*adult/);
  const seniorMatch = lower.match(/(senior|lolo|lola|grandpa|grandma)/);

  if (kidsMatch || seniorMatch) {
    const kids = kidsMatch ? parseInt(kidsMatch[1]) : 0;
    const seniors = seniorMatch ? 1 : 0;
    const adults = Math.max(0, groupSize - kids - seniors);
    const comp: GroupComposition = { adults, kids, seniors };
    onCompositionDetected(comp);
    return {
      content: getGroupAdvice(comp, groupSize),
      quickReplies: ['Book for this group', 'What to bring for kids?', 'Best start time?'],
    };
  }

  /* Date recommendations */
  if (lower.match(/(best date|which date|what date|when|weekend|good day|choose date|pick a date)/)) {
    const daysToSat = (6 - new Date().getDay() + 7) % 7 || 7;
    const nextSat = new Date();
    nextSat.setDate(new Date().getDate() + daysToSat);
    return {
      content:
        `I'd recommend hiking on **clear weekday mornings** (Tue–Thu) for smaller crowds!\n\n` +
        `Weekends are amazing for the social vibe but can be busier.\n` +
        `Upcoming this weekend: **${format(nextSat, 'MMMM d')}** (Saturday)\n\n` +
        `**Dry season (Nov–April)** gives the clearest summit views. ` +
        `Have you selected a date on the calendar yet?`,
      quickReplies: ['Not yet', 'Yes, I picked one', 'I prefer weekends', 'What about rainy season?'],
    };
  }

  /* Time recommendations */
  if (lower.match(/(time|start|morning|early|late|best time|what time)/)) {
    const hasKids = groupComposition && groupComposition.kids > 0;
    const hasSeniors = groupComposition && groupComposition.seniors > 0;

    if (hikeType === 'night') {
      return {
        content:
          `For a **night hike**, available departure times are **02:00 PM** and **04:00 PM** (2-hour interval).\n\n` +
          `Bring headlamps, spare batteries, and visibility layers. You'll descend the same day after your summit experience.`,
        quickReplies: ['Why choose overnight?', "What's the trail like at night?", 'Any safety tips?'],
      };
    }

    if (hikeType === 'overnight') {
      return {
        content:
          `For an **overnight hike**, departures are available in the afternoon at **02:00 PM, 03:00 PM, and 04:00 PM** (**02:00 PM** recommended to set up camp before dark).\n\n` +
          `Unlike a night hike, this includes an overnight stay. Bring your own tent because tents are not provided and there is no lodging at the peak, plus extra food, warm layers, and lighting.`,
        quickReplies: ['What is a night hike?', 'What should I pack?', 'Any safety tips?'],
      };
    }

    const recommended = hasKids || hasSeniors ? '05:00 AM' : '06:00 AM';
    return {
      content:
        `For a **morning hike**, here's my recommendation:\n\n` +
        `${hasKids ? '👦 With kids: **05:00 AM**' : hasSeniors ? '👴 With seniors: **05:00 AM**' : `⭐ **${recommended}** — Best weather window`}\n` +
        `📍 Reach the summit by 9–10 AM before peak heat\n` +
        `🌤️ Morning light makes for the best summit photos!\n\n` +
        `Starting before **07:00 AM** is strongly recommended.`,
      quickReplies: ['Got it, 06:00 AM', 'What about 05:00 AM?', 'Is 07:00 AM too late?'],
    };
  }

  /* Crowd & Prophet Demand Forecast & Interpretation */
  if (lower.match(/(interpret|analysis|analyze|breakdown|crowd|crowded|busy|how many people|how many hikers|quiet|least crowd|peak day|demand|prophet|prediction)/)) {
    return {
      content:
        `📊 **Mount Kalisungan Prophet ML Forecast Interpretation**\n\n` +
        `Here is the automated breakdown from the mathematical model:\n\n` +
        `• 📈 **Weekly Traffic Pattern**: High weekend concentration (65–70% of total weekly volume falls on Saturdays & Sundays).\n` +
        `• 🏔️ **Quiet Hiking Windows**: Tuesday through Thursday average only 10–20 hikers/day — recommended for hikers wanting peaceful nature and solitude.\n` +
        `• ⚡ **Peak Demand Management**: Saturdays project 70–100+ hikers. Additional tour guides and checkpoint rangers are recommended.\n` +
        `• 🌧️ **Weather Regressor Impact**: Rain probabilities above 60% historically reduce traffic by ~35% while increasing slip risks on descent.\n` +
        `• 💡 **Actionable Advice**: Start at **05:00–06:00 AM** for the best weather window and summit views.\n\n` +
        `Would you like to explore specific dates or simulate capacity adjustments?`,
      quickReplies: ['Recommend quiet date', 'Check weekend slots', 'How does Prophet work?'],
    };
  }

  /* Weather */
  if (lower.match(/(weather|rain|cold|hot|temperature|forecast|wet|dry|sunny|cloudy)/)) {
    if (weatherInsight) {
      return {
        content: getWeatherHikeAdvice(weatherInsight, hikeType, groupComposition),
        quickReplies: ['Is rain dangerous?', 'What gear for rain?', 'Best alternative date?'],
      };
    }
    return {
      content:
        `To get a real weather forecast for your hike date:\n\n` +
        `1. **Select a date** on the booking calendar above\n` +
        `2. I'll automatically analyze the live Mt. Kalisungan weather for that day! 🌤️\n\n` +
        `You can also view the live forecast right now on the official mountain weather website:\n` +
        `• [Mountain-Forecast.com (Mt. Kalisungan 686m Peak)](https://www.mountain-forecast.com/peaks/Mount-Kalisungan/forecasts/686)\n` +
        `• [Zoom Earth Live Satellite Radar](https://zoom.earth/#view=14.1475,121.3454,12z)`,
      quickReplies: ['Help me pick a date', 'Are there river crossings?', 'What should I bring?'],
    };
  }

  /* What to bring */
  if (lower.match(/(bring|pack|gear|equipment|what to|prepare|essentials|bag|backpack)/)) {
    const hasKids = groupComposition && groupComposition.kids > 0;
    return {
      content:
        `**Essential packing list** for Mt. Kalisungan:\n\n` +
        `💧 **Water** — 1.5–2L per person minimum\n` +
        `👟 **Footwear** — Trail shoes or boots (no slippers!)\n` +
        `🍱 **Snacks/Lunch** — High-energy food\n` +
        `🧴 **Sunscreen + bug spray** — Essential!\n` +
        `🔦 **Flashlight** — Even for day hikes (early start)\n` +
        `🩹 **Basic first aid** — Bandages, meds` +
        (hasKids ? `\n🧒 **For kids** — Extra snacks, light jacket` : '') +
        `\n\nTrail registration fee collected at the trailhead!`,
      quickReplies: ["What's the registration fee?", 'Any food along the trail?', 'Safety tips'],
    };
  }

  /* Safety */
  if (lower.match(/(safe|danger|risk|emergency|accident|injury|altitude|vertigo)/)) {
    return {
      content:
        `Safety is top priority at Mt. Kalisungan! 🛡️\n\n` +
        `✅ **Rangers** stationed along the trail\n` +
        `✅ **Register** at the trailhead before starting\n` +
        `✅ Follow the **app's GPS** to stay on trail\n` +
        `✅ **Never hike alone** — always with a companion\n` +
        `✅ Set a **turnaround time** — don't push through storms\n\n` +
        `The trail is rated **moderate** — suitable for fit beginners with proper prep! 💪`,
      quickReplies: ['Is a guide required?', 'Emergency contacts?', 'What if someone gets hurt?'],
    };
  }

  /* River crossings / water */
  if (lower.match(/(river|crossing|creek|stream|water crossing|wading|waterfall)/)) {
    return {
      content:
        `🚫 **No River Crossings on Mt. Kalisungan:**\n\n` +
        `There are **absolutely NO river crossings** anywhere on Mt. Kalisungan!\n\n` +
        `• The trail climbs through **coconut plantations, fruit orchards, forest woodlands, and an open cogon grassland ridge** directly to the summit (622m).\n` +
        `• Hikers will **never** need to wade across rivers, creeks, or streams.\n` +
        `• Trail running shoes or standard hiking boots with good grip are ideal—no water shoes or aquatic gear needed.\n` +
        `• Water refill stations and fresh buko juice are sold by local farmers at rest huts along the lower trail.`,
      quickReplies: ['Summit Route details', 'What shoes should I wear?', 'Weather advice'],
    };
  }

  /* Trail info */
  if (lower.match(/(trail|route|path|distance|km|elevation|summit|difficulty|how long)/)) {
    if (publishedRoute) {
      const distance = publishedRoute.distanceKm ? ` about **${publishedRoute.distanceKm.toFixed(1)} km**` : '';
      const elevation = publishedRoute.elevationMeters ? ` and **${publishedRoute.elevationMeters}m** elevation` : '';
      const stations = publishedRoute.stationNames?.length ? `\n\nStations: **${publishedRoute.stationNames.join(' → ')}**.` : '';
      return {
        content:
          `The published route for **${publishedRoute.locationName}** is **${publishedRoute.name}**${distance}${elevation}.\n\n` +
          `Difficulty: **${publishedRoute.difficulty || 'not specified'}**. This is the route to follow for this entry point; I won't substitute an unpublished path.${stations}`,
        quickReplies: ['How long will it take?', 'How do I stay on the route?', 'What should I bring?'],
      };
    }
    return {
      content:
        `Mt. Kalisungan has **3 trail routes**:\n\n` +
        `🏔️ **Summit Route** — Most popular, 622m elevation (~3–4 hrs up)\n` +
        `🌴 **Plantation Route** — Shaded coconut & fruit groves, scenic valley (NO river crossings!)\n` +
        `🌄 **Ridge Route** — Best panoramic views along the ridgeline\n\n` +
        `**Summit Route** is ~7km round trip. Total estimated time: **6–8 hours**.\n\n` +
        `Which route interests you most?`,
      quickReplies: ['Summit Route details', 'Are there river crossings?', 'Which is easiest?', 'Can beginners do it?'],
    };
  }

  /* Persuasion / worth it */
  if (lower.match(/(worth|should i|is it good|recommend|convince|why|experience|motivat)/)) {
    return {
      content:
        `**Absolutely worth it!** Here's why Mt. Kalisungan will blow your mind:\n\n` +
        `🌅 **Sea of Clouds** at sunrise — one of the best views in Laguna\n` +
        `🌿 **Lush tropical jungle** that feels like another world\n` +
        `📸 **Stunning ridgeline** perfect for photos\n` +
        `🦅 **Wildlife sightings** — eagles, birds, and more\n` +
        `💚 **Affordable & accessible** — easy to get to from Manila\n` +
        `🏕️ **Camp spots** available for overnight adventures\n\n` +
        `*"Every summit is just the beginning of a new adventure"* 🏔️\n\n` +
        `You won't regret it — I promise! Should we finalize your booking?`,
      quickReplies: ["Yes, let's book!", 'How do I book?', 'Tell me about the summit views'],
    };
  }

  /* Group size context */
  if (lower.match(/(group|people|pax|how many|friend|family|alone|solo)/)) {
    if (lower.match(/(alone|solo|just me|by myself)/)) {
      return {
        content:
          `Solo hiking at Mt. Kalisungan is possible but I strongly recommend going with at least one companion for safety! 🙏\n\n` +
          `If solo:\n` +
          `• Inform rangers of your solo plan at trailhead\n` +
          `• Set a check-in time with someone at home\n` +
          `• Stick to the **Summit Route** (most monitored)\n\n` +
          `Or we can connect you with **guided group hikes** through the app!`,
        quickReplies: ['Find a group hike', 'I have a companion', 'Solo safety tips'],
      };
    }
    if (groupSize > 1) {
      return {
        content:
          `Great, a group of **${groupSize}**! 🎉 To give you the best recommendations:\n\n` +
          `**How many are kids (under 12) and how many are seniors (60+)?**`,
        quickReplies: ['All adults', '1 kid, rest adults', '2 kids', 'We have seniors'],
      };
    }
    return {
      content:
        `Currently you have **${groupSize} person** booked. ` +
        `You can add companions in **Step 2** of the booking form.\n\n` +
        `Groups of 3–10 are ideal for pace and coordination!`,
      quickReplies: ['Tips for booking a group', 'Large group tips'],
    };
  }

  /* Contextual default */
  if (date && weatherInsight) {
    return {
      content:
        `You're all set with **${format(date, 'MMMM d')}** selected and weather loaded! 🎯\n\n` +
      `Current plan: **${getHikeTypeLabel(hikeType)} Hike ${hikeType === 'morning' || hikeType === 'day' ? '☀️' : '🌙'}** ` +
        `with **${groupSize} person${groupSize > 1 ? 's' : ''}**.\n\n` +
        `Anything else I can help with?`,
      quickReplies: ['Weather advice', 'Best start time', 'What to pack'],
    };
  }

  if (!date) {
    return {
      content:
        `I see you haven't picked a date yet! 📅\n\n` +
        `• **Weekdays (Tue–Thu)** for quieter trails\n` +
        `• **Dry season (Nov–April)** for clear skies\n` +
        `• Check forecasts carefully in Jun–Oct (rainy season)\n\n` +
        `Pick a date on the calendar and I'll give you specific weather-based advice!`,
      quickReplies: ['When is dry season?', 'Is January a good month?', 'Any upcoming clear days?'],
    };
  }

  return {
    content:
      `I'm here to make your Mt. Kalisungan experience amazing! 🏔️\n\n` +
      `Ask me about:\n` +
      `• 🌤️ Weather and best times\n` +
      `• 👥 Group tips and composition\n` +
      `• 🎒 What to pack\n` +
      `• 🛤️ Trail routes\n` +
      `• 🔒 Safety tips\n\n` +
      `What would you like to know?`,
    quickReplies: ['Best time to go?', 'Is it safe?', 'What to pack?', 'About the trail'],
  };
}

/* ─────────────────────────────────────────────
   BookingAIChat Component
───────────────────────────────────────────── */
export default function BookingAIChat({
  date,
  groupSize,
  hikeType,
  weatherInsight,
  groupComposition,
  publishedRoute,
  onGroupCompositionSet,
  onTimeSuggest: _onTimeSuggest,
  hikeTime,
  onApplySuggestion,
  pageContext,
  greeting,
  applyLabel,
  showLauncher = false,
}: BookingAIChatProps) {
  const { role, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const previousDateKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const contextGuidance = useRef<Array<{ title: string; message: string }>>([]);
  const [basicGuidance, setBasicGuidance] = useState(false);
  const latestReply = [...messages].reverse().find((message) => message.role === 'assistant');
  const expression = isTyping ? 'thinking' : input ? 'listening' : getKaliExpression(latestReply?.content ?? '');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const addAIMessage = useCallback(
    (content: string, quickReplies?: string[], suggestion?: BookingSuggestion) => {
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', content, quickReplies, suggestion },
      ]);
    },
    [],
  );

  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    addAIMessage(
      greeting ??
      (`Let's plan this booking together.\n\n` +
      `I can guide your **date**, **start time**, and **group size**.\n` +
      `Current setup: ${date ? format(date, 'MMM d, yyyy') : 'No date yet'} · ${getHikeTypeLabel(hikeType)} hike · ${groupSize} pax.\n\n` +
      `What should we adjust first?`),
      greeting
        ? getKaliQuickReplies(role ?? 'guest')
        : ['Pick best date', 'Recommend time', 'Set group size tips', 'Check weather for my date'],
    );
  }, [isOpen, messages.length, date, hikeType, groupSize, addAIMessage, greeting, role]);

  useEffect(() => {
    const nextDateKey = date ? format(date, 'yyyy-MM-dd') : null;
    const previous = previousDateKey.current;
    if (isOpen && previous && nextDateKey && previous !== nextDateKey) {
      addAIMessage(
        `I noticed you changed your hike date from **${format(new Date(`${previous}T00:00:00`), 'MMMM d')}** to **${format(date, 'MMMM d, yyyy')}**. I’ll use the new date for weather, start-time advice, and booking reminders.`,
        ['Weather advice', 'Best start time', 'What to pack'],
      );
    }
    previousDateKey.current = nextDateKey;
  }, [date, isOpen, addAIMessage]);


  const getOnlineAnswer = useCallback(async (text: string): Promise<string | null> => {
    if (!navigator.onLine) return null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const thread = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ];
      const forecastContext = /crowd|forecast|busy|quiet|capacity|demand|projection/i.test(text)
        ? await getProphetAIForecastContext().catch(() => null) : null;
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: thread,
          page_context: pageContext ?? 'Book a Hike',
          booking_context: {
            viewer_role: role ?? 'guest',
            viewer_name: user?.user_metadata?.full_name ?? null,
            current_guidance: contextGuidance.current,
            current_page: pageContext ?? 'Book a Hike',
            selected_date: date ? format(date, 'yyyy-MM-dd') : null,
            selected_start_time: hikeTime ?? null,
            group_size: groupSize,
            hike_type: hikeType,
            group_composition: groupComposition ?? null,
            entry_point: publishedRoute?.locationName ?? null,
            published_route: publishedRoute ? {
              id: publishedRoute.id,
              name: publishedRoute.name,
              locationName: publishedRoute.locationName,
              difficulty: publishedRoute.difficulty ?? null,
              elevationMeters: publishedRoute.elevationMeters ?? null,
              distanceKm: publishedRoute.distanceKm ?? null,
              stationNames: publishedRoute.stationNames ?? [],
            } : null,
            weather_forecast: weatherInsight ?? null,
            forecasting: forecastContext ? {
              summary: forecastContext.summaryText,
              horizonDays: forecastContext.horizonDays,
              totalProjectedHikers: forecastContext.totalProjectedHikers,
              evaluation: forecastContext.evaluation,
              next7Days: forecastContext.next7Days,
              next14Days: forecastContext.next14Days,
              allWeeklySummaries: forecastContext.allWeeklySummaries,
              allMonthlySummaries: forecastContext.allMonthlySummaries,
              quietestDay: forecastContext.quietestDayNext7Days,
              busiestDay: forecastContext.busiestDayNext7Days,
              dailyMap: forecastContext.dailyMap,
            } : null,
          },
        }),
      });
      if (!resp.ok) return null;
      const reader = resp.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let buf = '';
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let ni: number;
        while ((ni = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, ni);
          buf = buf.slice(ni + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) full += content;
          } catch {
            // ignore partial JSON chunks
          }
        }
      }
      return full.trim() || null;
    } catch {
      return null;
    }
  }, [messages, date, hikeTime, groupSize, hikeType, groupComposition, publishedRoute, weatherInsight, pageContext, role, user]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || inFlight.current) return;
      inFlight.current = true;
      setIsTyping(true);
      const userMsg: ChatMsg = { id: generateId(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      try {
        const onlineAnswer = await getOnlineAnswer(text);
        setBasicGuidance(!onlineAnswer);
        if (onlineAnswer) {
          const { clean, suggestion } = extractSuggestion(onlineAnswer);
          addAIMessage(clean, undefined, suggestion);
          setTimeout(() => inputRef.current?.focus(), 100);
          return;
        }
        if (navigator.onLine) {
          addAIMessage(
            "I couldn't reach live AI. Here is basic guidance from the app; I can't verify current availability or trail conditions.",
          );
        }

        const response = generateResponse(
          text,
          { date, groupSize, hikeType, weatherInsight, groupComposition, publishedRoute },
          (comp) => onGroupCompositionSet?.(comp),
        );
        addAIMessage(response.content, response.quickReplies);
        setTimeout(() => inputRef.current?.focus(), 100);
      } finally {
        inFlight.current = false;
        setIsTyping(false);
      }
    },
    [date, groupSize, hikeType, weatherInsight, groupComposition, publishedRoute, onGroupCompositionSet, addAIMessage, getOnlineAnswer],
  );

  useEffect(() => {
    const openAssistant = (e?: Event) => {
      setIsOpen(true);
      const customEvent = e as CustomEvent<{ prompt?: string; guidance?: Array<{ title: string; message: string }> }>;
      if (customEvent?.detail?.guidance) contextGuidance.current = customEvent.detail.guidance;
      if (customEvent?.detail?.prompt) {
        setTimeout(() => {
          void sendMessage(customEvent.detail.prompt!);
        }, 300);
      }
    };
    window.addEventListener('open-global-ai-assistant', openAssistant as EventListener);
    return () => window.removeEventListener('open-global-ai-assistant', openAssistant as EventListener);
  }, [sendMessage]);

  return (
    <>
      {/* Toggle button */}
      {showLauncher && !isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-6 left-6 z-50 md:hidden flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl transition-colors duration-200',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Open AI Chat"
        >
            <KaliAvatar expression="happy" size="sm" className="rounded-full" />
            <span>AI Assistant</span>
            {messages.length === 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full animate-pulse" />
            )}
        </motion.button>
      )}

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Chat with Kali"
            initial={{ opacity: 0, x: -400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -400 }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              const startX = touchStartX.current;
              const endX = e.changedTouches[0]?.clientX ?? null;
              if (startX === null || endX === null) return;
              if (startX - endX > 70) setIsOpen(false);
              touchStartX.current = null;
            }}
            className="fixed inset-0 z-[2100] w-screen transform-gpu overscroll-contain sm:w-[360px] sm:left-0 sm:right-auto sm:top-16 sm:bottom-0 flex flex-col bg-card sm:border-r border-border/50 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border/30 bg-primary/5">
              <KaliAvatar key={latestReply?.id ?? 'greeting'} expression={expression} activity={isTyping ? 'thinking' : input ? 'listening' : 'speaking'} size="sm" className="h-11 w-11 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Kali — AI Trail Assistant</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                  {isTyping ? 'Thinking about your question...' : basicGuidance ? 'Basic guidance' : `Here for you, ${getKaliRoleLabel(role ?? 'guest')}`}
                </p>
              </div>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 shrink-0 border border-border/40"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Context chips */}
            {(date || groupSize > 1) && (
              <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-border/20 bg-background/30">
                {date && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-full font-semibold">
                    <Calendar className="h-2.5 w-2.5" />
                    {format(date, 'MMM d')}
                  </span>
                )}
                {groupSize > 1 && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-secondary/80 text-foreground px-2 py-1 rounded-full font-semibold">
                    <Users className="h-2.5 w-2.5" />
                    {groupSize} pax
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[10px] bg-secondary/80 text-foreground px-2 py-1 rounded-full font-semibold">
                  <Mountain className="h-2.5 w-2.5" />
                  {getHikeTypeLabel(hikeType)} Hike
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overscroll-contain overflow-y-auto px-3 py-4 space-y-3">
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'assistant' && (
                    <KaliAvatar expression={getKaliExpression(msg.content)} activity="speaking" animated={index === messages.length - 1} size="sm" className="mt-0.5 h-8 w-8 rounded-full" />
                  )}
                  <div
                    className={cn(
                      'max-w-[82%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed',
                      msg.role === 'assistant'
                        ? 'bg-secondary/60 text-foreground rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm',
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words [&_p]:mb-2 [&_p:last-child]:mb-0">
                      <ReactMarkdown
                        components={{
                          a: ({ node, ...props }) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80 inline-flex items-center gap-1"
                            />
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.suggestion && onApplySuggestion && (
                      <button
                        onClick={() => onApplySuggestion(msg.suggestion!)}
                        className="mt-2.5 w-full text-[11px] font-semibold bg-primary text-primary-foreground px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors"
                      >
                        {applyLabel || msg.suggestion.label || 'Apply these details to my booking'}
                      </button>
                    )}
                    {msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {msg.quickReplies.map((reply) => (
                          <button
                            key={reply}
                            onClick={() => sendMessage(reply)}
                            className="text-[10px] bg-background/70 border border-primary/30 text-primary px-2 py-1 rounded-full hover:bg-primary/10 transition-colors font-semibold"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-2 items-center">
                  <KaliAvatar expression="thinking" activity="thinking" size="sm" className="h-8 w-8 rounded-full" />
                  <div className="bg-secondary/60 rounded-2xl rounded-tl-sm px-3 py-2.5 flex gap-1.5">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 bg-primary/60 rounded-full"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/30 bg-background/60">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the trail…"
                  aria-label="Ask Kali"
                  className="flex-1 bg-secondary/40 border border-border/30 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isTyping}
                  className="h-9 w-9 rounded-xl shrink-0"
                  aria-label="Send message"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
