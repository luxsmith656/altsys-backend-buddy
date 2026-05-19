import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MessageSquare, X, Send, Sparkles, Users, Calendar, Mountain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type HikeType = 'day' | 'night';

interface WeatherSnapshot {
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  condition: string;
}

export interface GroupComposition {
  adults: number;
  kids: number;
  seniors: number;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
}

interface BookingAIChatProps {
  date?: Date;
  groupSize: number;
  hikeType: HikeType;
  weatherInsight?: WeatherSnapshot | null;
  groupComposition?: GroupComposition | null;
  onGroupCompositionSet?: (composition: GroupComposition) => void;
  onTimeSuggest?: (time: string) => void;
}

const TYPING_DELAY = 750;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trail-chat`;

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

  if (comfortable) {
    const time = hasKids || hasSeniors ? '05:00 AM' : '06:00 AM';
    return (
      `Great news! Forecast looks perfect — **${weather.condition}**, ` +
      `${Math.round(weather.minTempC)}–${Math.round(weather.maxTempC)}°C, ` +
      `only **${Math.round(weather.rainProbability)}% rain** chance.\n\n` +
      `I'd recommend starting at **${time}** for the best experience.` +
      (hasKids ? ' With kids in your group, the cooler early morning is ideal! 🧒' : '') +
      (hasSeniors ? ' The morning coolness is perfect for your senior companions. 👴' : '')
    );
  }
  if (rainHigh) {
    return (
      `⚠️ Heads up! Rain chance is **${Math.round(weather.rainProbability)}%** — quite high.\n\n` +
      `Trails can get slippery on descents. I'd suggest:\n` +
      `• Starting **before 06:00 AM** before rains typically build up\n` +
      `• Bringing rain gear and trekking poles\n` +
      `• Or consider 1–2 days later when skies may be clearer\n\n` +
      `Want me to suggest a better date?`
    );
  }
  if (hotDay) {
    return (
      `🌡️ It'll be quite warm — up to **${Math.round(weather.maxTempC)}°C**!` +
      (hasKids ? ' With kids, heat can be extra challenging.' : '') +
      ` I strongly recommend starting at **04:30 or 05:00 AM** to summit before peak heat.\n\n` +
      `Bring at least **2L of water per person** and sun protection!`
    );
  }
  return (
    `Forecast shows **${weather.condition}** — ` +
    `${Math.round(weather.minTempC)}–${Math.round(weather.maxTempC)}°C, ` +
    `${Math.round(weather.rainProbability)}% rain. Conditions look manageable — come prepared! 🏔️`
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
      `👥 **Split into sub-groups** of 5–8 for better trail flow\n` +
      `🕐 **Start time: 05:00–06:00 AM** — arrive before crowds\n` +
      `📍 **Designate a group leader** per sub-group\n` +
      `⏱️ **Set a turnaround time** regardless of summit status\n\n` +
      `Large groups create amazing energy on the trail! 🎉`
    );
  }
  return (
    `Your group looks well-balanced! **${comp.adults} adult${comp.adults > 1 ? 's' : ''}** — ` +
    `great size for the trail. I recommend **06:00 AM** start for the best experience. Enjoy! 🏔️`
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
  },
  onCompositionDetected: (comp: GroupComposition) => void,
): { content: string; quickReplies?: string[] } {
  const lower = message.toLowerCase();
  const { date, groupSize, hikeType, weatherInsight, groupComposition } = context;

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
          `For a **night hike**, best start times:\n\n` +
          `⭐ **10:00 PM** — Summit at dawn, witness the sea of clouds! (Most popular)\n` +
          `🌙 **09:00 PM** — More time to rest at the summit\n` +
          `⚡ **11:00 PM** — For the adventurous!\n\n` +
          `The summit at sunrise is absolutely **breathtaking** 🌅 — worth every dark step!`,
        quickReplies: ['Tell me about sunrise at summit', "What's the trail like at night?", 'Any safety tips?'],
      };
    }

    const recommended = hasKids || hasSeniors ? '05:00 AM' : '06:00 AM';
    return {
      content:
        `For a **day hike**, here's my recommendation:\n\n` +
        `${hasKids ? '👦 With kids: **05:00 AM**' : hasSeniors ? '👴 With seniors: **05:00 AM**' : `⭐ **${recommended}** — Best weather window`}\n` +
        `📍 Reach the summit by 9–10 AM before peak heat\n` +
        `🌤️ Morning light makes for the best summit photos!\n\n` +
        `Starting before **07:00 AM** is strongly recommended.`,
      quickReplies: ['Got it, 06:00 AM', 'What about 05:00 AM?', 'Is 07:00 AM too late?'],
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
        `To get a real weather forecast for your hike date:\n` +
        `1. **Select a date** on the calendar\n` +
        `2. **Enable Smart Guide** (right panel) to load the forecast\n\n` +
        `I'll then give you specific advice based on actual conditions! 🌤️`,
      quickReplies: ['How does Smart Guide work?', 'Help me pick a date'],
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

  /* Trail info */
  if (lower.match(/(trail|route|path|distance|km|elevation|summit|difficulty|how long)/)) {
    return {
      content:
        `Mt. Kalisungan has **3 trail routes**:\n\n` +
        `🏔️ **Summit Route** — Most popular, 622m elevation (~3–4 hrs up)\n` +
        `🌊 **River Route** — Scenic river crossings, lush jungle\n` +
        `🌄 **Ridge Route** — Best panoramic views along the ridgeline\n\n` +
        `**Summit Route** is ~7km round trip. Total estimated time: **6–8 hours**.\n\n` +
        `Which route interests you most?`,
      quickReplies: ['Summit Route details', 'Which is easiest?', 'Can beginners do it?', 'Best for families?'],
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
        `Current plan: **${hikeType === 'night' ? 'Night Hike 🌙' : 'Day Hike ☀️'}** ` +
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
  onGroupCompositionSet,
  onTimeSuggest: _onTimeSuggest,
}: BookingAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const addAIMessage = useCallback((content: string, quickReplies?: string[]) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', content, quickReplies },
      ]);
    }, TYPING_DELAY);
  }, []);

  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    addAIMessage(
      `Let's plan this booking together.\n\n` +
      `I can guide your **date**, **start time**, and **group size**.\n` +
      `Current setup: ${date ? format(date, 'MMM d, yyyy') : 'No date yet'} · ${hikeType === 'night' ? 'Night hike' : 'Day hike'} · ${groupSize} pax.\n\n` +
      `What should we adjust first?`,
      ['Pick best date', 'Recommend time', 'Set group size tips', 'Check weather for my date'],
    );
  }, [isOpen, messages.length, date, hikeType, groupSize, addAIMessage]);

  const getOnlineAnswer = useCallback(async (text: string): Promise<string | null> => {
    if (!navigator.onLine) return null;
    try {
      const thread = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ];
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: thread }),
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
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const userMsg: ChatMsg = { id: generateId(), role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      const onlineAnswer = await getOnlineAnswer(text);
      if (onlineAnswer) {
        addAIMessage(onlineAnswer);
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }

      const response = generateResponse(
        text,
        { date, groupSize, hikeType, weatherInsight, groupComposition },
        (comp) => onGroupCompositionSet?.(comp),
      );
      addAIMessage(response.content, response.quickReplies);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [date, groupSize, hikeType, weatherInsight, groupComposition, onGroupCompositionSet, addAIMessage, getOnlineAnswer],
  );

  const handleMarkdown = (text: string) =>
    text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');

  return (
    <>
      {/* Toggle button */}
      {!isOpen && (
        <motion.button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold transition-colors duration-200',
            'bottom-24 md:bottom-6 left-3 md:left-6',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Open AI Chat"
        >
            <MessageSquare className="h-4 w-4" />
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
            className="fixed inset-0 z-[2100] w-screen sm:w-[360px] sm:left-0 sm:right-auto sm:top-16 sm:bottom-0 flex flex-col bg-card sm:border-r border-border/50 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border/30 bg-primary/5">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">Kali — AI Trail Assistant</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                  Online · Mt. Kalisungan
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
                  {hikeType === 'night' ? 'Night Hike' : 'Day Hike'}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[82%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed',
                      msg.role === 'assistant'
                        ? 'bg-secondary/60 text-foreground rounded-tl-sm'
                        : 'bg-primary text-primary-foreground rounded-tr-sm',
                    )}
                  >
                    {/* eslint-disable-next-line react/no-danger */}
                    <span
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: handleMarkdown(msg.content) }}
                    />
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
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
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
