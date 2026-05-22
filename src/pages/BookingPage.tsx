import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CalendarCheck,
  Users,
  Loader2,
  Clock,
  Info,
  ChevronRight,
  ChevronLeft,
  Shield,
  UserRound,
  ClipboardCheck,
  Check,
  Sun,
  Moon,
  Minus,
  Plus,
  Baby,
  CreditCard,
  Smartphone,
  Building2,
  AlertTriangle,
  Star,
  Upload,
  ImageIcon,
  X,
  Globe,
  MapPin,
} from 'lucide-react';
import { calculateFees, formatPeso, GCASH_DETAILS, BANK_DETAILS } from '@/lib/payments';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { encodeMeta } from '@/lib/bookingMeta';
import { confirmReservation } from '@/lib/notification-service';
import { CapacityCalendar, type DayCapacityMap } from '@/components/booking/CapacityCalendar';
import BookingAIChat, { type GroupComposition } from '@/components/booking/BookingAIChat';
import BookingInsightsPanel from '@/components/booking/BookingInsightsPanel';
import { cn } from '@/lib/utils';
import { getPHLocationOptions, COMMON_NATIONALITIES } from '@/lib/ph-locations';
import { uploadPaymentScreenshot, isFirebaseConfigured } from '@/lib/firebase-storage';
import { createUserNotification } from '@/lib/firebase-firestore';
import type { CompanionDetail } from '@/types';
import { useLocations } from '@/hooks/useLocations';
import LocationPreview from '@/components/booking/LocationPreview';

/* ── Weather code → human-readable label (Open-Meteo) ── */
function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Clear Sky';
  if ([1, 2, 3].includes(code)) return 'Partly Cloudy';
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55].includes(code)) return 'Light Drizzle';
  if ([61, 63, 65].includes(code)) return 'Rainy';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain Showers';
  if ([85, 86].includes(code)) return 'Snow Showers';
  if (code === 95) return 'Thunderstorm';
  if ([96, 99].includes(code)) return 'Thunderstorm with Hail';
  return 'Variable Conditions';
}

/* ─── Types ─── */
type HikeType = 'day' | 'night';

interface TimeOption {
  time: string;
  label: string;
  recommended?: boolean;
}

interface WeatherSnapshot {
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  condition: string;
}

/* ─── Draft persistence key ─── */
const DRAFT_KEY = 'mt-kalisnugon-booking-draft';

/* ─── Constants ─── */
const HIKE_TIME_OPTIONS: Record<HikeType, TimeOption[]> = {
  day: [
    { time: '04:30 AM', label: 'Very Early' },
    { time: '05:00 AM', label: 'Early Bird' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '07:00 AM', label: 'Morning' },
    { time: '08:00 AM', label: 'Late Start' },
  ],
  night: [
    { time: '09:00 PM', label: 'Evening' },
    { time: '10:00 PM', label: 'Summit at Dawn', recommended: true },
    { time: '11:00 PM', label: 'Midnight Trek' },
    { time: '12:00 AM', label: 'Late Night' },
  ],
};

const STEPS = [
  { id: 1, label: 'Schedule', icon: CalendarCheck },
  { id: 2, label: 'Details', icon: UserRound },
  { id: 3, label: 'Agreement', icon: Shield },
  { id: 4, label: 'Confirm', icon: ClipboardCheck },
];

const DEFAULT_MAX_CAPACITY = 100;

type Sex = 'male' | 'female' | 'prefer_not_to_say';
type PaymentOption = 'onsite' | 'online';
type OnlinePayMethod = 'gcash' | 'bank_transfer';

type SubmittedBooking = {
  booking_date: string;
  group_size: number;
  qr_code_data: string;
  hikeType: HikeType;
  hikeTime: string;
  fullName: string;
  age: string;
  emailAddress: string;
  phoneNumber: string;
  province: string;
  city: string;
  companions: string[];
  medicalNotes?: string;
  sex: Sex | '';
  hasMinors: boolean;
  preferredGuide: string;
  paymentOption: PaymentOption;
  totalFee: number;
};

/* ─── Helpers ─── */
function formatTimeInput(time24: string): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseHourFromTime12(time12: string): number {
  const [time, period] = time12.split(' ');
  if (!time || !period) return 0;
  const [h] = time.split(':').map(Number);
  const normalized = h % 12;
  return period.toUpperCase() === 'PM' ? normalized + 12 : normalized;
}

function dayDifference(target: Date): number {
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/* ─── Component ─── */
export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // ── Step 1: Schedule
  const [date, setDate] = useState<Date | undefined>();
  const [hikeType, setHikeType] = useState<HikeType>('day');
  const [hikeTime, setHikeTime] = useState('06:00 AM');
  const [groupSize, setGroupSize] = useState(1);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [monthCapacity, setMonthCapacity] = useState<DayCapacityMap>({});
  const [smartGuideEnabled, setSmartGuideEnabled] = useState(false);
  const [groupComposition, setGroupComposition] = useState<GroupComposition | null>(null);
  const [weatherInsight, setWeatherInsight] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // ── Step 2: Personal details
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | ''>('');
  const [nationality, setNationality] = useState('Filipino');
  const [emailAddress, setEmailAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionDetails, setCompanionDetails] = useState<CompanionDetail[]>([]);
  const [medicalNotes, setMedicalNotes] = useState('');
  const [preferredGuide, setPreferredGuide] = useState('');
  const [locationSearch, setLocationSearch] = useState('');

  // ── Multi-location: hiker picks where to start (Lamot 1, Lamot 2, etc.) ──
  const { locations: allLocations } = useLocations();
  const [startLocationId, setStartLocationId] = useState<string>('');
  const [dbGuides, setDbGuides] = useState<Array<{ id: string; full_name: string; location_id: string; per_trip_fee: number }>>([]);
  const [preferredGuideId, setPreferredGuideId] = useState<string>('');

  // ── Guide dropdown options ──
  const [guideOptions, setGuideOptions] = useState<string[]>([]);

  // ── Step 3: Sworn declaration ──
  const [agreedTruthful, setAgreedTruthful] = useState(false);
  const [showSwornPrompt, setShowSwornPrompt] = useState(false);
  const [minorAcknowledged, setMinorAcknowledged] = useState(false);
  const [committedMainAge, setCommittedMainAge] = useState('');
  const [committedCompanionAges, setCommittedCompanionAges] = useState<string[]>([]);

  // ── Auto-detected minor status ──
  const hasMinors = useMemo(() => {
    const mainIsMinor = committedMainAge.trim() !== '' && Number(committedMainAge) > 0 && Number(committedMainAge) <= 17;
    const companionIsMinor = committedCompanionAges.some(
      (raw) => raw.trim() !== '' && Number(raw) > 0 && Number(raw) <= 17,
    );
    return mainIsMinor || companionIsMinor;
  }, [committedMainAge, committedCompanionAges]);

  const minorCount = useMemo(() => {
    let count = 0;
    if (committedMainAge.trim() !== '' && Number(committedMainAge) > 0 && Number(committedMainAge) <= 17) count++;
    count += committedCompanionAges.filter(
      (raw) => raw.trim() !== '' && Number(raw) > 0 && Number(raw) <= 17,
    ).length;
    return count;
  }, [committedMainAge, committedCompanionAges]);

  useEffect(() => {
    if (!hasMinors && minorAcknowledged) setMinorAcknowledged(false);
  }, [hasMinors, minorAcknowledged]);

  // ── Step 4: Payment
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('onsite');
  const [onlinePayMethod, setOnlinePayMethod] = useState<OnlinePayMethod>('gcash');
  const [transactionRef, setTransactionRef] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);

  const phLocations = useMemo(() => getPHLocationOptions(), []);

  // ── Step 3: Agreement
  const [agreedRules, setAgreedRules] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [hasScrolledRulesToEnd, setHasScrolledRulesToEnd] = useState(false);
  const [hasScrolledPrivacyToEnd, setHasScrolledPrivacyToEnd] = useState(false);
  const rulesRef = useRef<HTMLDivElement | null>(null);
  const privacyRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<SubmittedBooking | null>(null);

  /* ── Restore form draft from localStorage ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.date) setDate(new Date(d.date));
      if (d.hikeType) setHikeType(d.hikeType);
      if (d.hikeTime) setHikeTime(d.hikeTime);
      if (typeof d.groupSize === 'number') setGroupSize(d.groupSize);
      if (d.fullName) setFullName(d.fullName);
      if (d.age) setAge(d.age);
      if (d.sex) setSex(d.sex);
      if (d.nationality) setNationality(d.nationality);
      if (d.emailAddress) setEmailAddress(d.emailAddress);
      if (d.phoneNumber) setPhoneNumber(d.phoneNumber);
      if (d.province) setProvince(d.province);
      if (d.city) setCity(d.city);
      if (d.locationSearch) setLocationSearch(d.locationSearch);
      if (Array.isArray(d.companions)) setCompanions(d.companions);
      if (Array.isArray(d.companionDetails)) setCompanionDetails(d.companionDetails);
      if (d.medicalNotes) setMedicalNotes(d.medicalNotes);
      if (d.preferredGuide) setPreferredGuide(d.preferredGuide);
    } catch {
      // ignore malformed draft
    }
  }, []); // mount only

  /* ── Save draft on every change ── */
  useEffect(() => {
    if (booking) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          date: date?.toISOString(),
          hikeType, hikeTime, groupSize,
          fullName, age, sex, nationality,
          emailAddress, phoneNumber, province, city, locationSearch,
          companions, companionDetails, medicalNotes, preferredGuide,
        }),
      );
    } catch { /* storage unavailable */ }
  }, [date, hikeType, hikeTime, groupSize, fullName, age, sex, nationality,
      emailAddress, phoneNumber, province, city, locationSearch,
      companions, companionDetails, medicalNotes, preferredGuide, booking]);

  /* ── Fetch guides (real DB rows for fee + location scoping; also feeds dropdown names) ── */
  useEffect(() => {
    const fetchGuides = async () => {
      const { data: gs } = await supabase
        .from('guides' as any)
        .select('id,full_name,location_id,per_trip_fee,is_active')
        .eq('is_active', true);
      const list = ((gs as any[]) ?? []) as Array<{ id: string; full_name: string; location_id: string; per_trip_fee: number }>;
      setDbGuides(list);
      const names = list.map((g) => g.full_name).filter(Boolean);
      setGuideOptions(names.length ? names : ['Rodel Manalansan', 'Bong Villarosa', 'Nilo Santos', 'Allan Reyes']);
    };
    void fetchGuides();
  }, []);

  /* ── Auto-pick first active location if none chosen ── */
  useEffect(() => {
    if (!startLocationId && allLocations.length > 0) {
      setStartLocationId(allLocations[0].id);
    }
  }, [allLocations, startLocationId]);

  const selectedLocation = useMemo(
    () => allLocations.find((l) => l.id === startLocationId) || null,
    [allLocations, startLocationId],
  );

  const guidesAtLocation = useMemo(
    () => dbGuides.filter((g) => g.location_id === startLocationId),
    [dbGuides, startLocationId],
  );


  /* ── Capacity fetching ── */
  const fetchMonthCapacity = useCallback(async (year: number, month: number) => {
    const start = format(new Date(year, month, 1), 'yyyy-MM-dd');
    const end = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('daily_capacity')
      .select('*')
      .gte('date', start)
      .lte('date', end);
    if (data) {
      setMonthCapacity((prev) => {
        const map = { ...prev };
        data.forEach((row) => {
          map[row.date] = {
            max_capacity: row.max_capacity,
            current_count: row.current_count,
          };
        });
        return map;
      });
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    fetchMonthCapacity(now.getFullYear(), now.getMonth());

    // Realtime: update calendar when admin changes capacity or bookings are confirmed
    const channel = supabase
      .channel('booking-page-capacity')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_capacity' },
        (payload) => {
          const row = payload.new as { date?: string; max_capacity?: number; current_count?: number };
          if (row?.date) {
            setMonthCapacity((prev) => ({
              ...prev,
              [row.date]: {
                max_capacity: row.max_capacity ?? DEFAULT_MAX_CAPACITY,
                current_count: row.current_count ?? 0,
              },
            }));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMonthCapacity]);

  useEffect(() => {
    if (!user) return;
    setFullName((prev) => prev || user.user_metadata?.full_name || '');
    setEmailAddress((prev) => prev || user.email || '');

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', user.id)
        .single();

      if (data?.full_name) setFullName((prev) => prev || data.full_name);
      if (data?.phone) setPhoneNumber((prev) => prev || data.phone);
    };

    void fetchProfile();
  }, [user]);

  useEffect(() => {
    const neededCompanions = Math.max(0, groupSize - 1);
    setCompanions((prev) => {
      if (prev.length === neededCompanions) return prev;
      if (prev.length < neededCompanions) {
        return [...prev, ...Array.from({ length: neededCompanions - prev.length }, () => '')];
      }
      return prev.slice(0, neededCompanions);
    });
    setCompanionDetails((prev) => {
      if (prev.length === neededCompanions) return prev;
    if (prev.length < neededCompanions) {
        return [...prev, ...Array.from({ length: neededCompanions - prev.length }, () => ({ name: '', sex: 'prefer_not_to_say' as const }))];
      }
      return prev.slice(0, neededCompanions);
    });
  }, [groupSize]);

  const updateCompanionDetail = useCallback((idx: number, field: keyof CompanionDetail, value: string) => {
    setCompanionDetails((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
    if (field === 'name') {
      setCompanions((prev) =>
        prev.map((item, index) => (index === idx ? value : item))
      );
    }
  }, []);

  /* ── Derived slot count for selected date ── */
  const slotsForDate = useMemo(() => {
    if (!date) return null;
    const dateStr = format(date, 'yyyy-MM-dd');
    const cap = monthCapacity[dateStr];
    const max = cap?.max_capacity ?? DEFAULT_MAX_CAPACITY;
    const current = cap?.current_count ?? 0;
    return Math.max(0, max - current);
  }, [date, monthCapacity]);

  const fetchSmartWeather = useCallback(async (selectedDate: Date) => {
    const weatherApiKey = import.meta.env.VITE_WEATHERAPI_KEY as string | undefined;
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');

    try {
      setWeatherLoading(true);
      setWeatherError(null);

      if (weatherApiKey) {
        const diff = Math.max(1, Math.min(10, dayDifference(selectedDate) + 1));
        const response = await fetch(
          `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=14.1475,121.3454&days=${diff}&aqi=no&alerts=no`,
        );
        if (!response.ok) throw new Error(`WeatherAPI request failed (${response.status})`);
        const payload = await response.json() as {
          forecast?: { forecastday?: Array<{ date: string; day: { maxtemp_c: number; mintemp_c: number; daily_chance_of_rain: number; condition?: { text?: string } } }> };
        };
        const selected = payload.forecast?.forecastday?.find((item) => item.date === formattedDate);
        if (!selected) throw new Error('No forecast available for the selected date');
        setWeatherInsight({
          maxTempC: selected.day.maxtemp_c,
          minTempC: selected.day.mintemp_c,
          rainProbability: Number(selected.day.daily_chance_of_rain ?? 0),
          condition: selected.day.condition?.text ?? 'Forecast available',
        });
        return;
      }

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=14.1475&longitude=121.3454&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=Asia%2FManila&forecast_days=16`,
      );
      if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status})`);
      const payload = await response.json() as {
        daily?: {
          time: string[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_probability_max: number[];
          weathercode: number[];
        };
      };

      const idx = payload.daily?.time?.findIndex((d) => d === formattedDate) ?? -1;
      if (idx < 0 || !payload.daily) throw new Error('No forecast available for the selected date');
      setWeatherInsight({
        maxTempC: payload.daily.temperature_2m_max[idx],
        minTempC: payload.daily.temperature_2m_min[idx],
        rainProbability: payload.daily.precipitation_probability_max[idx] ?? 0,
        condition: weatherCodeToLabel(payload.daily.weathercode[idx] ?? -1),
      });
    } catch (err: unknown) {
      setWeatherInsight(null);
      setWeatherError(err instanceof Error ? err.message : 'Unable to load weather insight');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!smartGuideEnabled || !date) return;
    void fetchSmartWeather(date);
  }, [smartGuideEnabled, date, fetchSmartWeather]);

  const handleClearInsights = useCallback(() => {
    setSmartGuideEnabled(false);
    setWeatherInsight(null);
    setWeatherError(null);
    setWeatherLoading(false);
  }, []);

  const smartRecommendations = useMemo(() => {
    if (!smartGuideEnabled || !date || !weatherInsight) return null;

    const selectedHour = parseHourFromTime12(hikeTime);
    const highHeat = selectedHour >= 8 && weatherInsight.maxTempC >= 32;
    const highRain = weatherInsight.rainProbability > 50;

    const groupMessage = groupSize <= 2
      ? 'Small group detected. Hiking with 3 or more improves safety coverage.'
      : groupSize > 10
      ? 'Large group detected. Consider splitting into smaller teams for trail flow and safety.'
      : 'Group size is in an ideal range for pace and coordination.';

    const recommendedTimes = HIKE_TIME_OPTIONS[hikeType]
      .filter((opt) => {
        const hour = parseHourFromTime12(opt.time);
        if (highRain) return hour < 8;
        if (weatherInsight.maxTempC >= 32) return hour < 8;
        return true;
      })
      .map((opt) => opt.time);

    const bestTime = recommendedTimes[0] ?? HIKE_TIME_OPTIONS[hikeType][0].time;

    return {
      bestTime,
      highHeat,
      highRain,
      groupMessage,
      recommendedTimes,
    };
  }, [smartGuideEnabled, date, weatherInsight, hikeTime, groupSize, hikeType]);

  /* ── Hike type change ── */
  const handleHikeTypeChange = (type: HikeType) => {
    setHikeType(type);
    setUseCustomTime(false);
    setCustomTimeInput('');
    const recommended = HIKE_TIME_OPTIONS[type].find((t) => t.recommended);
    if (recommended) setHikeTime(recommended.time);
  };

  /* ── Validation ── */
  const validateStep = () => {
    if (step === 1) {
      if (!date) return 'Please select a date on the calendar.';
      if (groupSize < 1 || groupSize > 30) return 'Group size must be between 1 and 30.';
      if (slotsForDate !== null && groupSize > slotsForDate) {
        return `Only ${slotsForDate} slot${slotsForDate !== 1 ? 's' : ''} available on this date. Reduce group size or choose another date.`;
      }
      if (!hikeTime) return 'Please select a start time.';
    }
    if (step === 2) {
      if (!fullName.trim()) return 'Full name is required.';
      if (!age.trim() || Number(age) < 1) return 'Please enter a valid age.';
      if (!emailAddress.trim()) return 'Email address is required.';
      if (groupSize > 1) {
        const missing = companions.findIndex((name) => !name.trim());
        if (missing >= 0) return `Please provide full name for Companion ${missing + 1}.`;
      }
      if (hasMinors && !minorAcknowledged) return 'Please confirm minor requirements acknowledgment before continuing.';
    }
    if (step === 3) {
      if (!hasScrolledRulesToEnd) return 'Please read the full rules and scroll to the end before agreeing.';
      if (!hasScrolledPrivacyToEnd) return 'Please read the full data privacy policy and scroll to the end before agreeing.';
      if (!agreedRules || !agreedPrivacy) return 'You must agree to all policies.';
    }
    return '';
  };

  const next = () => {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    if (step === 2 && !agreedTruthful) {
      setShowSwornPrompt(true);
      return;
    }
    setStep((s) => s + 1);
  };

  /* ── Screenshot handler ── */
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file.'); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error('File too large. Max 15MB.'); return; }
    setPaymentScreenshot(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  /* ── Submit ── */
  const handleBook = async () => {
    if (!user || !date) return;
    if (!startLocationId) {
      toast.error('Please choose a starting location (e.g. Lamot 1).');
      return;
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    setLoading(true);

    // ── Per-guide-per-day quota: 5 bookings max per guide for the same date.
    if (preferredGuideId) {
      const { data: existing, error: qErr } = await supabase
        .from('booking_assignments' as any)
        .select('id,status,booking:bookings!inner(booking_date)')
        .eq('guide_id', preferredGuideId)
        .in('status', ['pending', 'accepted']);
      if (!qErr) {
        const sameDay = ((existing as any[]) ?? []).filter((row: any) => row.booking?.booking_date === dateStr).length;
        if (sameDay >= 5) {
          setLoading(false);
          toast.error('This guide is already at the 5-booking quota for that date. Please pick another guide or date.');
          return;
        }
      }
    }

    const qrData = `KALISUNGAN-${user.id.slice(0, 8)}-${dateStr}-${Date.now()}`;
    const companionNames = companions.map((name) => name.trim()).filter(Boolean);
    const fees = calculateFees(groupSize);

    // Upload screenshot to Firebase if present
    let screenshotUrl: string | undefined;
    let screenshotPath: string | undefined;
    if (paymentScreenshot) {
      setScreenshotUploading(true);
      try {
        const result = await uploadPaymentScreenshot(paymentScreenshot, `${user.id.slice(0, 8)}-${dateStr}`);
        if (result) {
          screenshotUrl = result.url;
          screenshotPath = result.path;
        } else {
          toast.warning('Firebase not configured — screenshot not uploaded. Contact admin.');
        }
      } catch {
        toast.error('Failed to upload screenshot. Booking will continue without it.');
      }
      setScreenshotUploading(false);
    }

    const enrichedCompanions = companionDetails.map((c, i) => ({
      ...c,
      name: c.name || companions[i] || '',
    })).filter((c) => c.name.trim());

    const metaNotes = encodeMeta({
      userNotes: medicalNotes,
      fullName,
      age,
      nationality,
      emailAddress,
      phoneNumber,
      province,
      city,
      companions: companionNames,
      companionDetails: enrichedCompanions.length ? enrichedCompanions : undefined,
      medicalNotes,
      sex: sex || undefined,
      hasMinors,
      minorCount: hasMinors ? minorCount : undefined,
      preferredGuide: preferredGuide.trim() || undefined,
      hikeType,
      hikeTime,
      paymentStatus: paymentOption === 'online' && (transactionRef || screenshotUrl) ? 'partial' : 'unpaid',
      paymentMethod: paymentOption === 'online' ? onlinePayMethod : 'onsite',
      transactionId: transactionRef.trim() || undefined,
      amountPaid: amountPaid ? Number(amountPaid) : undefined,
      paymentScreenshotUrl: screenshotUrl,
      paymentScreenshotPath: screenshotPath,
      entryFee: fees.entryFee,
      envFee: fees.envFee,
      guideFee: fees.guideFee,
      totalFee: fees.totalFee,
    });

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        booking_date: dateStr,
        group_size: groupSize,
        qr_code_data: qrData,
        emergency_contact_name: fullName,
        emergency_contact_phone: phoneNumber,
        notes: metaNotes,
        status: 'pending',
        location_id: startLocationId,
      } as any)
      .select()
      .single();


    // Auto-create assignment row if hiker requested a specific guide.
    if (data && preferredGuideId) {
      await supabase.from('booking_assignments' as any).insert({
        booking_id: data.id,
        guide_id: preferredGuideId,
        location_id: startLocationId,
        status: 'pending',
      } as any);
    }

    if (error) {
      toast.error(error.message);
    } else {
      const fees = calculateFees(groupSize);
      setBooking({
        ...data,
        hikeTime,
        hikeType,
        fullName,
        age,
        emailAddress,
        phoneNumber,
        province,
        city,
        companions: companionNames,
        sex,
        hasMinors,
        preferredGuide,
        paymentOption,
        totalFee: fees.totalFee,
      });
      // Clear saved draft on successful booking
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success('Booking submitted! Awaiting admin approval.');
      confirmReservation({
        id: data.id.toString(),
        visitorName: fullName,
        email: emailAddress || user.email || '',
        phone: phoneNumber,
        hikeDate: dateStr,
        trail: 'Mt. Kalisungan Summit',
        hikeTime,
      });

      if (isFirebaseConfigured() && user?.id) {
        void createUserNotification(user.id, {
          title: 'Booking submitted',
          body: `Your booking for ${dateStr} is now pending admin approval.`,
          category: 'booking',
        });
      }
    }
    setLoading(false);
  };

  /* ─────────────── SUCCESS SCREEN ─────────────── */
  if (booking) {
    return (
      <motion.div
        className="min-h-screen pt-20 pb-12 px-4 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Card className="glass-card border-primary/30 max-w-md w-full mx-auto">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-gradient text-2xl font-bold">Booking Submitted!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Your reservation is pending admin approval. You'll be notified via Email &amp; SMS once reviewed.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm font-medium">
              <Info className="h-4 w-4 flex-shrink-0" />
              Status: Awaiting Admin Approval
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Date', value: booking.booking_date },
                { label: 'Hike Type', value: booking.hikeType === 'night' ? '🌙 Night Hike' : '☀️ Day Hike' },
                { label: 'Start Time', value: booking.hikeTime },
                { label: 'Group Size', value: `${booking.group_size} pax` },
                { label: 'Full Name', value: booking.fullName },
                { label: 'Age', value: booking.age },
                { label: 'Email', value: booking.emailAddress },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-border/15">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Your booking QR code</p>
              <div className="inline-block bg-white p-3 rounded-xl">
                <QRCodeSVG value={booking.qr_code_data} size={140} bgColor="#ffffff" fgColor="#1a2e1a" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Show this at the trailhead once confirmed.</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setBooking(null);
                setStep(1);
                setDate(undefined);
                setGroupSize(1);
                setAgreedRules(false);
                setAgreedPrivacy(false);
                setAgreedTruthful(false);
                setHasScrolledRulesToEnd(false);
                setHasScrolledPrivacyToEnd(false);
              }}
            >
              Book Another Hike
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  /* ─────────────── BOOKING FORM ─────────────── */
  return (
    <div className="min-h-screen pt-20 pb-24 md:pb-12 px-2 sm:px-4">
      <div className="container max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            Book Your <span className="text-gradient">Hike</span>
          </h1>
          <p className="text-muted-foreground">
            Complete the {STEPS.length}-step process to secure your slot at Mount Kalisungan.
          </p>
        </motion.div>

        {/* ─── Step Indicator ─── */}
        <div className="mb-8 md:mb-12 pb-1">
          <div className="grid grid-cols-4 items-start gap-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex flex-col items-center">
                <div className="flex flex-col items-center gap-1.5 px-1">
                  <div
                    className={cn(
                      'w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300',
                      done ? 'bg-primary text-white' :
                      active ? 'bg-primary/20 border-2 border-primary text-primary' :
                      'bg-secondary/50 border-2 border-border/30 text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="h-4 w-4 sm:h-5 sm:w-5" /> : <Icon className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </div>
                  <span
                    className={cn(
                      'text-[9px] sm:text-[10px] font-bold uppercase tracking-wide whitespace-nowrap',
                      active ? 'text-primary' : 'text-muted-foreground opacity-50',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'w-full h-[2px] mt-2 transition-colors duration-300',
                      done ? 'bg-primary' : 'bg-border/30',
                    )}
                  />
                )}
              </div>
            );
          })}
          </div>
        </div>

        {/* ─── Step Content ─── */}
        <div className="max-w-none md:max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="glass-card border-primary/20 p-4 sm:p-8">

                {/* ═══════════════ STEP 1: SCHEDULE ═══════════════ */}
                {step === 1 && (
                  <div className="space-y-5">

                    <div className="text-center">
                      <h2 className="text-xl font-bold">Select Schedule</h2>
                      <p className="text-sm text-muted-foreground mt-1">When do you plan to hike?</p>
                    </div>

                    {/* Hike Type Toggle */}
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          { type: 'day' as HikeType, Icon: Sun, label: 'Day Hike', desc: 'Summit by daylight' },
                          { type: 'night' as HikeType, Icon: Moon, label: 'Night Hike', desc: 'Sunrise at the top' },
                        ] as const
                      ).map(({ type, Icon, label, desc }) => (
                        <button
                          key={type}
                          onClick={() => handleHikeTypeChange(type)}
                          aria-pressed={hikeType === type}
                          className={cn(
                            'flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 font-semibold transition-all duration-200 text-sm',
                            hikeType === type
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span>{label}</span>
                          <span
                            className={cn(
                              'text-[10px] font-normal',
                              hikeType === type ? 'text-primary/70' : 'text-muted-foreground/60',
                            )}
                          >
                            {desc}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Capacity Calendar */}
                    <div className="rounded-xl border border-border/30 p-2 sm:p-4 bg-background/40">
                      <CapacityCalendar
                        selected={date}
                        onSelect={setDate}
                        groupSize={groupSize}
                        monthCapacity={monthCapacity}
                        onMonthChange={fetchMonthCapacity}
                      />
                    </div>

                    {/* Selected date info */}
                    {date && (
                      <div className="relative">
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm',
                            slotsForDate !== null && slotsForDate < groupSize
                              ? 'bg-destructive/10 border-destructive/30 text-destructive'
                              : slotsForDate !== null && slotsForDate < 20
                              ? 'bg-warning/10 border-warning/30 text-warning'
                              : 'bg-primary/10 border-primary/30 text-primary',
                          )}
                        >
                          <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                          <span>
                            <strong>{format(date, 'MMMM d, yyyy')}</strong>
                            {slotsForDate !== null && (
                              <> — <strong>{slotsForDate}</strong> slot{slotsForDate !== 1 ? 's' : ''} available</>
                            )}
                          </span>
                        </motion.div>

                      </div>
                    )}

                    {/* Group Size */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border/20 bg-secondary/20">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-semibold leading-tight">Group Size</p>
                          <p className="text-[11px] text-muted-foreground">1–30 people per booking</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setGroupSize((s) => Math.max(1, s - 1))}
                          disabled={groupSize <= 1}
                          aria-label="Decrease group size"
                          className="w-8 h-8 rounded-full border border-border/50 flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-lg font-bold tabular-nums">{groupSize}</span>
                        <button
                          onClick={() => setGroupSize((s) => Math.min(30, s + 1))}
                          disabled={groupSize >= 30}
                          aria-label="Increase group size"
                          className="w-8 h-8 rounded-full border border-border/50 flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        {date && slotsForDate !== null && groupSize > slotsForDate && (
                          <span className="ml-1 text-[10px] font-bold px-2 py-1 rounded-full bg-destructive/10 text-destructive">
                            Over limit
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Start Time */}
                    <div className="space-y-2.5">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex flex-wrap items-center gap-1.5">
                        Preferred Start Time
                        <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/60">
                          — {hikeType === 'day' ? 'Day hike schedule' : 'Night hike schedule'}
                        </span>
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {HIKE_TIME_OPTIONS[hikeType].map((opt) => (
                          <button
                            key={opt.time}
                            onClick={() => { setHikeTime(opt.time); setUseCustomTime(false); }}
                            aria-pressed={hikeTime === opt.time && !useCustomTime}
                            className={cn(
                              'flex flex-col items-center px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all min-w-[76px]',
                              hikeTime === opt.time && !useCustomTime
                                ? 'bg-primary border-primary text-primary-foreground shadow-md'
                                : smartRecommendations?.recommendedTimes.includes(opt.time)
                                ? 'border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'border-border/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5',
                            )}
                          >
                            <span>{opt.time}</span>
                            <span
                              className={cn(
                                'text-[9px] font-medium mt-0.5',
                                hikeTime === opt.time && !useCustomTime
                                  ? 'text-primary-foreground/70'
                                  : smartRecommendations?.recommendedTimes.includes(opt.time)
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : opt.recommended
                                  ? 'text-amber-500'
                                  : 'opacity-55',
                              )}
                            >
                              {smartRecommendations?.recommendedTimes.includes(opt.time)
                                ? '⭐ Recommended'
                                : opt.recommended
                                ? '★ Recommended'
                                : opt.label}
                            </span>
                          </button>
                        ))}

                        {/* Custom time chip */}
                        <button
                          onClick={() => setUseCustomTime(true)}
                          aria-pressed={useCustomTime}
                          className={cn(
                            'flex flex-col items-center px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all min-w-[76px]',
                            useCustomTime
                              ? 'bg-primary border-primary text-primary-foreground shadow-md'
                              : 'border-border/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5',
                          )}
                        >
                          <span>{useCustomTime && hikeTime ? hikeTime : 'Custom'}</span>
                          <span
                            className={cn(
                              'text-[9px] font-medium mt-0.5',
                              useCustomTime ? 'text-primary-foreground/70' : 'opacity-55',
                            )}
                          >
                            Pick time
                          </span>
                        </button>
                      </div>

                      {/* Custom time input */}
                      <AnimatePresence>
                        {useCustomTime && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-3 overflow-hidden"
                          >
                            <Input
                              type="time"
                              value={customTimeInput}
                              onChange={(e) => {
                                setCustomTimeInput(e.target.value);
                                const formatted = formatTimeInput(e.target.value);
                                if (formatted) setHikeTime(formatted);
                              }}
                              className="max-w-[150px] font-semibold"
                              aria-label="Custom start time"
                            />
                            <span className="text-sm text-muted-foreground">
                              {hikeTime && useCustomTime ? (
                                <span className="text-primary font-semibold">{hikeTime}</span>
                              ) : (
                                'Enter desired time'
                              )}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                )}

                {/* ═══════════════ STEP 2: PERSONAL DETAILS ═══════════════ */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Hiker Details</h2>
                      <p className="text-sm text-muted-foreground mt-1">Connected to your account but you can edit before submitting.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Juan Dela Cruz"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age">Age</Label>
                        <Input
                          id="age"
                          type="number"
                          min={1}
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          onBlur={() => setCommittedMainAge(age)}
                          placeholder="e.g. 24"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Sex</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { value: 'male',              label: 'Male' },
                            { value: 'female',            label: 'Female' },
                            { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                          ] as { value: Sex; label: string }[]).map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setSex(value)}
                              className={cn(
                                'py-2 rounded-xl border-2 text-xs font-semibold transition-all',
                                sex === value
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border/30 text-muted-foreground hover:border-primary/30',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="emailAddress">Email Address</Label>
                        <Input
                          id="emailAddress"
                          type="email"
                          value={emailAddress}
                          onChange={(e) => setEmailAddress(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber">Phone Number</Label>
                        <Input
                          id="phoneNumber"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="09XXXXXXXXX"
                        />
                      </div>
                      {/* Nationality */}
                      <div className="space-y-2">
                        <Label htmlFor="nationality" className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Nationality
                        </Label>
                        <select
                          id="nationality"
                          value={nationality}
                          onChange={(e) => setNationality(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {COMMON_NATIONALITIES.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>

                      {/* PH Location (city/municipality dropdown) */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> City / Municipality
                        </Label>
                        <div className="relative">
                          <Input
                            placeholder="Search PH city or municipality…"
                            value={locationSearch}
                            onChange={(e) => {
                              setLocationSearch(e.target.value);
                              setCityPicked(false);
                              if (!e.target.value) { setCity(''); setProvince(''); }
                            }}
                            onFocus={() => { if (city) setCityPicked(true); }}
                            className="text-sm"
                          />
                          {locationSearch && !cityPicked && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-border/40 bg-card shadow-xl">
                              {phLocations
                                .filter((loc) => loc.toLowerCase().includes(locationSearch.toLowerCase()))
                                .slice(0, 20)
                                .map((loc) => (
                                  <button
                                    key={loc}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      const [locCity, locProv] = loc.split(', ');
                                      setCity(locCity);
                                      setProvince(locProv || '');
                                      setLocationSearch(loc);
                                      setCityPicked(true);
                                    }}
                                  >
                                    {loc}
                                  </button>
                                ))}
                              {phLocations.filter((loc) => loc.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">No matches. You can type it manually.</div>
                              )}
                            </div>
                          )}
                        </div>
                        {city && <p className="text-xs text-primary font-medium">Selected: {city}{province ? `, ${province}` : ''}</p>}

                      </div>

                      {/* Companions with full details */}
                      <div className="space-y-3 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <Label>Companions ({Math.max(0, groupSize - 1)})</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setGroupSize((s) => Math.min(30, s + 1))}
                          >
                            + Add Companion
                          </Button>
                        </div>
                        {companions.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            No companions yet. Increase group size to add companions.
                          </p>
                        )}
                        <div className="space-y-4">
                          {companions.map((_, idx) => {
                            const cd: CompanionDetail = companionDetails[idx] || ({} as CompanionDetail);
                            return (
                              <div key={`companion-${idx}`} className="rounded-xl border border-border/30 bg-secondary/10 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Companion {idx + 1}</p>
                                  {companions.length > 0 && (
                                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                                      onClick={() => setGroupSize((s) => Math.max(1, s - 1))}>
                                      Remove
                                    </Button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs">Full Name *</Label>
                                    <Input
                                      value={cd.name || ''}
                                      onChange={(e) => updateCompanionDetail(idx, 'name', e.target.value)}
                                      placeholder="e.g. Maria Santos"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Age</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={120}
                                      value={cd.age || ''}
                                      onChange={(e) => updateCompanionDetail(idx, 'age', e.target.value)}
                                      onBlur={(e) => {
                                        setCommittedCompanionAges((prev) => {
                                          const next = [...prev];
                                          next[idx] = e.target.value;
                                          return next;
                                        });
                                      }}
                                      placeholder="e.g. 25"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Sex</Label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {(['male', 'female', 'prefer_not_to_say'] as const).map((sv) => (
                                        <button key={sv} type="button"
                                          onClick={() => updateCompanionDetail(idx, 'sex', sv)}
                                          className={cn(
                                            'py-1.5 rounded-lg border text-[10px] font-semibold transition-all',
                                            cd.sex === sv ? 'border-primary bg-primary/10 text-primary' : 'border-border/30 text-muted-foreground hover:border-primary/30',
                                          )}
                                        >
                                          {sv === 'male' ? 'Male' : sv === 'female' ? 'Female' : 'N/A'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">Nationality</Label>
                                    <select
                                      value={cd.nationality || 'Filipino'}
                                      onChange={(e) => updateCompanionDetail(idx, 'nationality', e.target.value)}
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                      {COMMON_NATIONALITIES.map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs">City / Municipality</Label>
                                    <Input
                                      value={cd.city || ''}
                                      onChange={(e) => updateCompanionDetail(idx, 'city', e.target.value)}
                                      placeholder="e.g. Calauan, Laguna"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="medicalNotes">Special Medical Notes (Optional)</Label>
                        <Textarea
                          id="medicalNotes"
                          value={medicalNotes}
                          onChange={(e) => setMedicalNotes(e.target.value)}
                          placeholder="Allergies, medical history, or reminders for rangers"
                        />
                      </div>

                      {/* Minors — auto-detected from ages entered above */}
                      {hasMinors && (
                        <div className="space-y-3 sm:col-span-2">
                          <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-400/60 bg-amber-500/5 text-amber-700 dark:text-amber-300">
                            <Baby className="h-5 w-5 flex-shrink-0 text-amber-500" />
                            <div>
                              <p className="text-sm font-semibold">
                                {minorCount} minor{minorCount > 1 ? 's' : ''} detected in your group
                              </p>
                              <p className="text-xs opacity-70">Age 17 or below requires additional documents at the trailhead</p>
                            </div>
                          </div>
                          <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4 space-y-2.5">
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                              <AlertTriangle className="h-4 w-4" />
                              Required Documents for Minors (bring onsite)
                            </div>
                            {[
                              'Original signed Parental/Guardian Consent Letter',
                              "Photocopy of parent or guardian's valid government-issued ID",
                              "Photocopy of the minor's PSA Birth Certificate",
                              'Emergency contact number of parent/guardian in booking details',
                              'Minor must be accompanied by a responsible adult at all times',
                            ].map((item, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                                <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                                <span>{item}</span>
                              </div>
                            ))}
                            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 pt-1 border-t border-amber-400/20 mt-2">
                              ⚠️ If a parent or guardian is NOT present onsite, the minor MUST carry a notarized parental consent letter and a photocopy of the parent's valid ID. Entry will be denied without these documents.
                            </p>
                            <div className="flex items-start space-x-3 p-3 rounded-lg border border-amber-400/30 bg-amber-500/10">
                              <Checkbox
                                id="minorAcknowledge"
                                checked={minorAcknowledged}
                                onCheckedChange={(v) => setMinorAcknowledged(!!v)}
                                className="mt-0.5"
                              />
                              <Label htmlFor="minorAcknowledge" className="text-xs leading-relaxed cursor-pointer">
                                I understand the minor requirements and will bring all required documents onsite.
                              </Label>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Start Location (Lamot 1 / Lamot 2 / Main) — REQUIRED */}
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="startLocation" className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          Starting Location <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={startLocationId}
                          onValueChange={(v) => { setStartLocationId(v); setPreferredGuideId(''); }}
                        >
                          <SelectTrigger id="startLocation">
                            <SelectValue placeholder="Choose where you'll start hiking" />
                          </SelectTrigger>
                          <SelectContent>
                            {allLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}{loc.lgu ? ` — ${loc.lgu}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Pick the trailhead you'll start from. Each LGU site has its own admin and team.
                        </p>
                      </div>

                      {/* Map preview — shown BEFORE booking is confirmed so hikers see exactly where to go */}
                      {selectedLocation && (
                        <div className="sm:col-span-2">
                          <LocationPreview
                            name={selectedLocation.name}
                            lgu={selectedLocation.lgu}
                            lat={Number(selectedLocation.center_lat)}
                            lng={Number(selectedLocation.center_lng)}
                            description={selectedLocation.description}
                          />
                        </div>
                      )}

                      {/* Preferred Guide — scoped to chosen location, shows fee */}
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="preferredGuide">Preferred Guide <span className="text-muted-foreground font-normal">(Optional, additional fee)</span></Label>
                        <Select
                          value={preferredGuideId || 'none'}
                          onValueChange={(v) => {
                            if (v === 'none') {
                              setPreferredGuideId('');
                              setPreferredGuide('');
                            } else {
                              setPreferredGuideId(v);
                              const g = guidesAtLocation.find((x) => x.id === v);
                              setPreferredGuide(g?.full_name || '');
                            }
                          }}
                        >
                          <SelectTrigger id="preferredGuide">
                            <SelectValue placeholder="None (Admin will assign)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Admin will assign)</SelectItem>
                            {guidesAtLocation.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.full_name} — ₱{Number(g.per_trip_fee).toLocaleString()}
                              </SelectItem>
                            ))}
                            {guidesAtLocation.length === 0 && (
                              <SelectItem value="__none__" disabled>No guides yet at this location</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Each guide can take up to <strong>5 bookings per day</strong>. Assignment subject to availability.
                        </p>
                      </div>

                    </div>
                  </div>
                )}

                {/* ═══════════════ STEP 3: AGREEMENT ═══════════════ */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Agreement</h2>
                      <p className="text-sm text-muted-foreground mt-1">Read all rules below. You can only agree after scrolling to the end.</p>
                    </div>
                    <div
                      ref={rulesRef}
                      onScroll={(e) => {
                        const element = e.currentTarget;
                        const reachedEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
                        if (reachedEnd) setHasScrolledRulesToEnd(true);
                      }}
                      className="h-48 overflow-y-auto rounded-xl border border-border/20 bg-secondary/10 p-4 text-sm leading-relaxed"
                    >
                      <p className="font-semibold mb-2">Trail Rules and Regulations</p>
                      <p>1. Follow ranger instructions at all times during registration, ascent, and descent.</p>
                      <p>2. Stay on official trail routes and avoid restricted or dangerous areas.</p>
                      <p>3. Practice Leave No Trace: bring back all trash and do not damage flora and fauna.</p>
                      <p>4. Carry enough water, basic first-aid, and weather-appropriate gear.</p>
                      <p>5. Report medical concerns before the hike and inform rangers of emergencies immediately.</p>
                      <p>6. Respect local community guidelines at Barangay Lamot II and all checkpoints.</p>
                      <p>7. You are responsible for providing accurate details for yourself and companions.</p>
                      <p className="mt-3 font-semibold text-destructive">8. LIABILITY WAIVER — IMPORTANT</p>
                      <p>By booking and participating in this activity, the hiker fully acknowledges that hiking involves inherent risks including but not limited to: physical injury, accidents, loss or damage of property, and adverse weather conditions. <strong>The Mt. Kalisungan community, the Local Government Unit (LGU) of Calauan, Barangay Lamot II, the Barangay Council, and any affiliated organization, corporation, or association are NOT liable and shall bear NO responsibility</strong> for any injury, accident, illness, death, loss of personal belongings, or damage to property occurring before, during, or after the hiking activity. ALL LIABILITY rests solely with the hiker and their group. Participation is entirely at the hiker's own risk.</p>
                      <p>9. For minors, the parent or guardian assumes full liability and responsibility. Failure to present required parental consent documents will result in denial of entry.</p>
                      <p>10. Payment of fees does not constitute insurance coverage. Hikers are strongly advised to secure their own personal accident and travel insurance.</p>
                    </div>
                    {!hasScrolledRulesToEnd && (
                      <p className="text-xs text-amber-600 font-medium">Please scroll to the end of the rules to enable agreement.</p>
                    )}
                    <div className="space-y-4">
                      {hasScrolledRulesToEnd && (
                        <div className="flex items-start space-x-3 p-4 rounded-xl bg-secondary/20 border border-border/15">
                          <Checkbox
                            id="rules"
                            checked={agreedRules}
                            onCheckedChange={(v) => setAgreedRules(!!v)}
                            className="mt-1"
                          />
                          <Label htmlFor="rules" className="text-sm leading-relaxed cursor-pointer">
                            I agree to follow the{' '}
                            <span className="text-primary font-bold">Rules &amp; Regulations</span> of Mount
                            Kalisungan, including the "Leave No Trace" policy.
                          </Label>
                        </div>
                      )}
                      {agreedRules && (
                        <>
                          <div
                            ref={privacyRef}
                            onScroll={(e) => {
                              const element = e.currentTarget;
                              const reachedEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
                              if (reachedEnd) setHasScrolledPrivacyToEnd(true);
                            }}
                            className="h-40 overflow-y-auto rounded-xl border border-border/20 bg-secondary/10 p-4 text-sm leading-relaxed"
                          >
                            <p className="font-semibold mb-2">Data Privacy Policy</p>
                            <p>1. Personal data is collected for booking verification, safety coordination, emergency response, and post-incident review.</p>
                            <p>2. Your details may only be accessed by authorized personnel in relevant roles for operational and safety purposes.</p>
                            <p>3. Companion details must be submitted with their awareness and consent.</p>
                            <p>4. Data retention follows operational and legal needs, and records may be archived securely for incident tracing.</p>
                            <p>5. By submitting this booking, you consent to storing and processing your data for mountain operation services.</p>
                          </div>
                          {!hasScrolledPrivacyToEnd && (
                            <p className="text-xs text-amber-600 font-medium">Please scroll to the end of the data privacy policy to enable consent.</p>
                          )}
                          {hasScrolledPrivacyToEnd && (
                            <div className="flex items-start space-x-3 p-4 rounded-xl bg-secondary/20 border border-border/15">
                              <Checkbox
                                id="privacy"
                                checked={agreedPrivacy}
                                onCheckedChange={(v) => setAgreedPrivacy(!!v)}
                                className="mt-1"
                              />
                              <Label htmlFor="privacy" className="text-sm leading-relaxed cursor-pointer">
                                I consent to the{' '}
                                <span className="text-primary font-bold">Data Privacy Policy</span> regarding the
                                collection of my personal and safety information.
                              </Label>
                            </div>
                          )}
                        </>
                      )}
                      {agreedTruthful && (
                        <div className="flex items-start space-x-3 p-4 rounded-xl bg-primary/5 border border-primary/30">
                          <Check className="h-4 w-4 text-primary mt-0.5" />
                          <p className="text-sm leading-relaxed">
                            <span className="font-bold text-primary">Sworn declaration completed.</span> You confirmed your details are true and accurate.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══════════════ STEP 4: CONFIRM ═══════════════ */}
                {step === 4 && (() => {
                  const { entryFee, envFee, guideFee, totalFee } = calculateFees(groupSize);
                  return (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Confirm Booking</h2>
                      <p className="text-sm text-muted-foreground mt-1">Review your details before submitting.</p>
                    </div>
                    <div className="space-y-3 p-5 rounded-2xl bg-primary/5 border border-primary/20">
                      {[
                        { label: 'Hike Date', value: date ? format(date, 'MMMM d, yyyy') : '' },
                        { label: 'Hike Type', value: hikeType === 'night' ? '🌙 Night Hike' : '☀️ Day Hike' },
                        { label: 'Start Time', value: hikeTime },
                        { label: 'Group Size', value: `${groupSize} Pax` },
                        { label: 'Full Name', value: fullName },
                        { label: 'Age', value: age },
                        { label: 'Sex', value: sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : sex === 'prefer_not_to_say' ? 'Prefer not to say' : 'Not specified' },
                        { label: 'Minors in Group', value: hasMinors ? `Yes (${minorCount})` : 'No' },
                        { label: 'Email', value: emailAddress },
                        { label: 'Address', value: [city, province].filter(Boolean).join(', ') || 'Not provided' },
                        { label: 'Companions', value: companions.map((name) => name.trim()).filter(Boolean).join(', ') || 'None listed' },
                        { label: 'Preferred Guide', value: preferredGuide.trim() || 'No preference' },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-border/10 last:border-0">
                          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{label}</span>
                          <span className="font-bold text-primary text-sm text-right max-w-[55%] truncate">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* ── Payment Section ── */}
                    <div className="space-y-4 p-5 rounded-2xl border border-border/20 bg-secondary/10">
                      <h3 className="font-semibold flex items-center gap-2 text-base">
                        <CreditCard className="h-4 w-4 text-primary" /> Payment Summary
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entry Fee (₱{50} × {groupSize} pax)</span>
                          <span className="font-semibold">{formatPeso(entryFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Environmental/DSPA Fee (₱{20} × {groupSize} pax)</span>
                          <span className="font-semibold">{formatPeso(envFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Guide Fee (per group)</span>
                          <span className="font-semibold">{formatPeso(guideFee)}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-border/20 text-base font-bold">
                          <span>Total</span>
                          <span className="text-primary">{formatPeso(totalFee)}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Option</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: 'onsite' as PaymentOption, label: 'Pay Onsite', desc: 'Pay at trailhead on your hike date' },
                            { value: 'online' as PaymentOption, label: 'Pay Online', desc: 'Optional advance payment' },
                          ]).map(({ value, label, desc }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setPaymentOption(value)}
                              className={cn(
                                'flex flex-col items-center py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all',
                                paymentOption === value
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border/30 text-muted-foreground hover:border-primary/30',
                              )}
                            >
                              <span>{label}</span>
                              <span className="text-[10px] font-normal mt-0.5 opacity-70">{desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {paymentOption === 'online' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { value: 'gcash' as OnlinePayMethod, Icon: Smartphone, label: 'GCash' },
                              { value: 'bank_transfer' as OnlinePayMethod, Icon: Building2, label: 'Bank Transfer' },
                            ]).map(({ value, Icon, label }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setOnlinePayMethod(value)}
                                className={cn(
                                  'flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all',
                                  onlinePayMethod === value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border/30 text-muted-foreground hover:border-primary/30',
                                )}
                              >
                                <Icon className="h-4 w-4" /> {label}
                              </button>
                            ))}
                          </div>

                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm space-y-1">
                            {onlinePayMethod === 'gcash' ? (
                              <>
                                <p className="font-semibold text-primary mb-2">GCash Payment Details</p>
                                <p>Number: <strong>{GCASH_DETAILS.number}</strong></p>
                                <p>Name: <strong>{GCASH_DETAILS.name}</strong></p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-primary mb-2">Bank Transfer Details</p>
                                <p>Bank: <strong>{BANK_DETAILS.bank}</strong></p>
                                <p>Account No.: <strong>{BANK_DETAILS.accountNo}</strong></p>
                                <p>Account Name: <strong>{BANK_DETAILS.accountName}</strong></p>
                              </>
                            )}
                            <p className="text-xs text-muted-foreground pt-1">Amount: <strong>{formatPeso(totalFee)}</strong> — use your booking name as reference.</p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="transactionRef" className="text-xs">Transaction Reference No.</Label>
                              <Input
                                id="transactionRef"
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                placeholder={onlinePayMethod === 'gcash' ? 'GCash ref no.' : 'Bank transaction no.'}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="amountPaid" className="text-xs">Amount Paid (₱)</Label>
                              <Input
                                id="amountPaid"
                                type="number"
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                                placeholder={String(totalFee)}
                              />
                            </div>
                          </div>

                          {/* Payment screenshot upload */}
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-1.5">
                              <ImageIcon className="h-3.5 w-3.5" /> Payment Screenshot
                              {isFirebaseConfigured() ? (
                                <span className="text-[10px] font-normal text-muted-foreground">(saved to secure storage, compressed)</span>
                              ) : (
                                <span className="text-[10px] font-normal text-amber-500">(Firebase not configured — admin will request manually)</span>
                              )}
                            </Label>
                            {screenshotPreview ? (
                              <div className="relative inline-block">
                                <img src={screenshotPreview} alt="Payment screenshot" className="max-h-36 rounded-xl border border-border/30 object-cover" />
                                <button
                                  type="button"
                                  onClick={() => { setPaymentScreenshot(null); setScreenshotPreview(null); }}
                                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-border/40 hover:border-primary/40 cursor-pointer transition-colors bg-secondary/10">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Click to upload screenshot</span>
                                <input type="file" accept="image/*" className="sr-only" onChange={handleScreenshotChange} />
                              </label>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Online payment is optional — you may pay remaining balance onsite. Proof of payment may be required at check-in.
                          </p>
                        </motion.div>
                      )}

                      {paymentOption === 'onsite' && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                          <span>You chose to pay onsite. Please prepare {formatPeso(totalFee)} in cash at the trailhead on your booking date.</span>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* ─── Navigation Buttons ─── */}
          <div className="hidden md:flex justify-between items-center mt-6">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 1 || loading}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            {step < STEPS.length ? (
              <Button
                onClick={next}
                className="gap-2 px-8 h-12 text-base font-bold shadow-lg shadow-primary/20"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleBook}
                disabled={loading || screenshotUploading}
                className="gap-2 px-8 h-12 text-base font-bold shadow-lg shadow-primary/20"
              >
                {loading || screenshotUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {screenshotUploading ? 'Uploading…' : 'Confirm Reservation'}
              </Button>
            )}
          </div>
          <div className="md:hidden fixed bottom-3 left-3 right-3 z-30">
            <div className="glass-card border border-border/30 rounded-2xl p-2 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 1 || loading}
                className="gap-2 flex-1"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              {step < STEPS.length ? (
                <Button
                  onClick={next}
                  className="gap-2 flex-1 h-11 text-sm font-bold"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleBook}
                  disabled={loading || screenshotUploading}
                  className="gap-2 flex-1 h-11 text-sm font-bold"
                >
                  {loading || screenshotUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {screenshotUploading ? 'Uploading…' : 'Confirm'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating AI Chat — left side */}
      <BookingAIChat
        date={date}
        groupSize={groupSize}
        hikeType={hikeType}
        weatherInsight={weatherInsight}
        groupComposition={groupComposition}
        onGroupCompositionSet={setGroupComposition}
      />

      {/* Floating AI Insights Panel — right side (desktop) */}
      <BookingInsightsPanel
        date={date}
        smartGuideEnabled={smartGuideEnabled}
        weatherInsight={weatherInsight}
        weatherLoading={weatherLoading}
        weatherError={weatherError}
        smartRecommendations={smartRecommendations}
        groupSize={groupSize}
        hikeType={hikeType}
        onToggleSmartGuide={setSmartGuideEnabled}
        onClear={handleClearInsights}
      />

      {showSwornPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="glass-card w-full max-w-lg border-primary/30">
            <CardHeader>
              <CardTitle>Sworn Declaration Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Before moving to Agreement, you must declare that all details you entered are true and accurate.
              </p>
              <div className="flex items-start space-x-3 p-4 rounded-xl bg-primary/5 border border-primary/30">
                <Checkbox
                  id="truthful-floating"
                  checked={agreedTruthful}
                  onCheckedChange={(v) => setAgreedTruthful(!!v)}
                  className="mt-1"
                />
                <Label htmlFor="truthful-floating" className="text-sm leading-relaxed cursor-pointer">
                  <span className="font-bold text-primary">I swear and declare</span> that all information I have provided in this booking form is true and accurate. I understand identities may be verified onsite using valid IDs.
                </Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowSwornPrompt(false)}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!agreedTruthful}
                  onClick={() => {
                    setShowSwornPrompt(false);
                    setStep(3);
                  }}
                >
                  Continue to Agreement
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
