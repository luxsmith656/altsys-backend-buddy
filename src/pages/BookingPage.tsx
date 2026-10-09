import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  UserPlus,
  ArrowUp,
  Compass,
  CheckCircle2,
} from 'lucide-react';
import { calculateFees, formatPeso, GCASH_DETAILS, BANK_DETAILS, MAX_PAX_PER_GUIDE } from '@/lib/payments';
import { usePricing } from '@/hooks/usePricing';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { encodeMeta } from '@/lib/bookingMeta';
import { CapacityCalendar, type DayCapacityMap } from '@/components/booking/CapacityCalendar';
import BookingAIChat, { type GroupComposition, type PublishedRouteContext } from '@/components/booking/BookingAIChat';
import { cn } from '@/lib/utils';
import { getPHLocationOptions, COMMON_NATIONALITIES } from '@/lib/ph-locations';
import { uploadPaymentScreenshot, isFirebaseConfigured } from '@/lib/firebase-storage';
import { createUserNotification } from '@/lib/firebase-firestore';
import type { CompanionDetail } from '@/types';
import { useLocations } from '@/hooks/useLocations';
import LocationPreview from '@/components/booking/LocationPreview';
import AdminWalkInRegistrationDialog from '@/components/admin/AdminWalkInRegistrationDialog';
import AdminWalkInDesk from '@/components/admin/AdminWalkInDesk';
import KaliContextPanel from '@/components/kali/KaliContextPanel';
import { useKaliContext } from '@/hooks/useKaliContext';
import { HIKE_TIME_OPTIONS, getGuideFeePerGuide, getHikeTypeLabel, isValidHikeTime, normalizeHikeType, type HikeType } from '@/lib/hikeSchedule';
import { officialRoutesForLocation } from '@/lib/officialRoutes';
import { guidePhotoForName } from '@/lib/guideDirectory';
import { getBookingSlotStatuses, type ScheduledBooking } from '@/lib/bookingCapacity';
import { haversineDistance } from '@/lib/map-data';
import { validateAge, validateEmail, validatePhone } from '@/lib/inputValidation';
import { withBookingRequestTimeout } from '@/lib/bookingRequest';
import {
  fetchKalisungan16DayForecast,
  normalizeForecastDays,
  type KalisunganDayWeather,
  interpretKalisunganWeather,
} from '@/lib/kalisunganWeather';

/* â”€â”€ Weather code â†’ human-readable label (Open-Meteo, tuned for Mt. Kalisungan, Laguna) â”€â”€ */
function weatherCodeToLabel(code: number): string {
  return interpretKalisunganWeather(code, 0, 28).condition;
}

/* â”€â”€â”€ Types â”€â”€â”€ */
interface WeatherSnapshot {
  maxTempC: number;
  minTempC: number;
  rainProbability: number;
  condition: string;
  sourceName?: string;
  sourceUrl?: string;
  fetchedAt?: number;
}

/* â”€â”€â”€ Draft persistence key â”€â”€â”€ */
const DRAFT_KEY = 'mt-kalisnugon-booking-draft';
const LAST_BOOKING_AGE_PREFIX = 'mt-kalisungan-last-booking-age:';
const LAST_BOOKING_PARTICIPANTS_PREFIX = 'mt-kalisungan-last-booking-participants:';

/* â”€â”€â”€ Constants â”€â”€â”€ */
const STEPS = [
  { id: 1, label: 'Schedule', icon: CalendarCheck },
  { id: 2, label: 'Details', icon: UserRound },
  { id: 3, label: 'Agreement', icon: Shield },
  { id: 4, label: 'Confirm', icon: ClipboardCheck },
];

const DEFAULT_MAX_CAPACITY = 100;

interface PublishedRouteRow {
  id: string;
  location_id: string | null;
  name: string;
  difficulty: string;
  elevation_meters: number;
  coordinates_json: unknown;
  recording_metadata: unknown;
  status: string;
  is_official: boolean;
  review_status: string;
}

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

/* â”€â”€â”€ City autocomplete (compact, used inline) â”€â”€â”€ */
function CityAutocomplete({ value, options, onPick, placeholder }: { value: string; options: string[]; onPick: (city: string, province: string) => void; placeholder?: string }) {
  const [q, setQ] = useState(value || '');
  const [picked, setPicked] = useState(!!value);
  useEffect(() => { setQ(value || ''); setPicked(!!value); }, [value]);
  const matches = q && !picked ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())).slice(0, 15) : [];
  return (
    <div className="relative">
      <Input
        value={q}
        placeholder={placeholder || 'Search city / municipalityâ€¦'}
        onChange={(e) => { setQ(e.target.value); setPicked(false); if (!e.target.value) onPick('', ''); }}
        className="text-sm"
      />
      {matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-44 overflow-y-auto rounded-xl border border-border/40 bg-card shadow-xl">
          {matches.map((loc) => (
            <button
              key={loc}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                const [c, p] = loc.split(', ');
                onPick(c, p || '');
                setQ(loc);
                setPicked(true);
              }}
            >
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* â”€â”€â”€ Helpers â”€â”€â”€ */

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

/* â”€â”€â”€ Component â”€â”€â”€ */
export default function BookingPage() {
  const { user, role } = useAuth();
  const { pricing } = usePricing();
  const maxPaxRatio = pricing?.maxPaxPerGuide || MAX_PAX_PER_GUIDE || 5;
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [adminWalkInOpen, setAdminWalkInOpen] = useState(false);

  // Scroll to top on step transition for mobile & desktop
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Floating minimalist Back to Top button state
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 280);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // â”€â”€ Step 1: Schedule
  const [date, setDate] = useState<Date | undefined>();
  const [hikeType, setHikeType] = useState<HikeType>('morning');
  const [hikeTime, setHikeTime] = useState('06:00 AM');
  const [groupSize, setGroupSize] = useState(1);

  /* Prefill from the global AI assistant redirect: /booking?date=&time=&pax=&type= */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const d = searchParams.get('date');
    const t = searchParams.get('time');
    const pax = searchParams.get('pax');
    const type = searchParams.get('type');
    if (!d && !t && !pax && !type) return;
    const applied: string[] = [];
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split('-').map(Number);
      const next = new Date(y, m - 1, day);
      if (!Number.isNaN(next.getTime())) { setDate(next); applied.push(format(next, 'MMM d, yyyy')); }
    }
    if (t) { setHikeTime(t); applied.push(t); }
    if (pax && Number(pax) >= 1) { setGroupSize(Math.min(30, Number(pax))); applied.push(`${pax} pax`); }
    if (type === 'morning' || type === 'day' || type === 'night' || type === 'overnight') {
      const nextType = normalizeHikeType(type);
      setHikeType(nextType);
      applied.push(`${getHikeTypeLabel(nextType)} hike`);
    }
    if (applied.length) toast.success(`Assistant applied: ${applied.join(' Â· ')}`);
    if (searchParams.get('ready') === '1') {
      setStep(2);
      toast.info('Review your details, then accept the reminders and agreements to finish.');
    }
    const remainingParams = new URLSearchParams(searchParams);
    ['date', 'time', 'pax', 'type', 'ready'].forEach((key) => remainingParams.delete(key));
    setSearchParams(remainingParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const [monthCapacity, setMonthCapacity] = useState<DayCapacityMap>({});
  const [scheduledBookings, setScheduledBookings] = useState<ScheduledBooking[]>([]);
  const [slotCapacityRequested, setSlotCapacityRequested] = useState(false);
  const [slotCapacityLoading, setSlotCapacityLoading] = useState(false);
  const slotCapacityRequestedRef = useRef(false);
  slotCapacityRequestedRef.current = slotCapacityRequested;
  const [slotCapacityError, setSlotCapacityError] = useState<string | null>(null);
  const [publishedRoute, setPublishedRoute] = useState<PublishedRouteContext | null>(null);
  const [smartGuideEnabled, setSmartGuideEnabled] = useState(true);
  const [groupComposition, setGroupComposition] = useState<GroupComposition | null>(null);
  const [weatherInsight, setWeatherInsight] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const weatherRequestId = useRef(0);

  // â”€â”€ Mt. Kalisungan 16-day weather forecast (Open-Meteo) â”€â”€
  const [kalisunganForecast, setKalisunganForecast] = useState<Record<string, KalisunganDayWeather>>({});
  const [kalisunganForecastLoading, setKalisunganForecastLoading] = useState(false);
  const forecastRef = useRef<Record<string, KalisunganDayWeather>>({});

  useEffect(() => {
    let active = true;
    const loadWeather = async () => {
      try {
        setKalisunganForecastLoading(true);
        const res = await fetchKalisungan16DayForecast();
        if (active) {
          const days = normalizeForecastDays(res?.days);
          forecastRef.current = days;
          setKalisunganForecast(days);
        }
      } catch (err) {
        console.warn('Could not load Mt. Kalisungan forecast:', err);
      } finally {
        if (active) setKalisunganForecastLoading(false);
      }
    };
    void loadWeather();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    forecastRef.current = kalisunganForecast;
  }, [kalisunganForecast]);

  const selectedKalisunganWeather = useMemo(() => {
    if (!date) return null;
    const key = format(date, 'yyyy-MM-dd');
    return kalisunganForecast[key] ?? null;
  }, [date, kalisunganForecast]);

  // â”€â”€ Step 2: Personal details
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
  const [cityPicked, setCityPicked] = useState(false);

  // â”€â”€ Multi-location: hiker picks where to start (Lamot 1, Lamot 2, etc.) â”€â”€
  const { locations: allLocations } = useLocations();
  const [startLocationId, setStartLocationId] = useState<string>('');
  const explicitStartLocation = useRef(false);
  // Scrape/filter jump-off locations to strictly Lamot 2, Lamot 1, and Sto. Tomas
  const jumpOffLocations = useMemo(() => {
    return allLocations
      .filter((loc) => {
        const text = `${loc.slug} ${loc.name}`.toLowerCase();
        return text.includes('lamot') || text.includes('tomas');
      })
      .sort((a, b) => {
        const aText = `${a.slug} ${a.name}`.toLowerCase();
        const bText = `${b.slug} ${b.name}`.toLowerCase();
        const score = (t: string) => (t.includes('lamot') && t.includes('2') ? 1 : t.includes('lamot') && t.includes('1') ? 2 : 3);
        return score(aText) - score(bText);
      });
  }, [allLocations]);

  const [dbGuides, setDbGuides] = useState<Array<{ id: string; full_name: string; location_id: string; per_trip_fee: number; referral_code?: string | null; photo_url?: string | null }>>([]);
  const [preferredGuideId, setPreferredGuideId] = useState<string>('');
  const bookingSubmitLock = useRef(false);
  const bookingAttemptId = useRef<string | null>(null);
  const referralParam = searchParams.get('referral') || searchParams.get('guide') || '';
  const referralGuideId = referralParam || String(user?.user_metadata?.referral_guide_id || '');
  const appliedReferralId = useRef<string | null>(null);
  const [referralCodeInput, setReferralCodeInput] = useState('');

  // â”€â”€ Guide dropdown options â”€â”€
  const [guideOptions, setGuideOptions] = useState<string[]>([]);

  // â”€â”€ Step 3: Sworn declaration â”€â”€
  const [agreedTruthful, setAgreedTruthful] = useState(false);
  const [showSwornPrompt, setShowSwornPrompt] = useState(false);
  const [minorAcknowledged, setMinorAcknowledged] = useState(false);
  const [committedMainAge, setCommittedMainAge] = useState('');
  const [committedCompanionAges, setCommittedCompanionAges] = useState<string[]>([]);

  // â”€â”€ Auto-detected minor status â”€â”€
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

  // â”€â”€ Step 4: Payment
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('onsite');
  const [onlinePayMethod, setOnlinePayMethod] = useState<OnlinePayMethod>('gcash');
  const [transactionRef, setTransactionRef] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);

  const phLocations = useMemo(() => getPHLocationOptions(), []);

  // â”€â”€ Step 3: Agreement
  const [agreedRules, setAgreedRules] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [hasScrolledRulesToEnd, setHasScrolledRulesToEnd] = useState(false);
  const [hasScrolledPrivacyToEnd, setHasScrolledPrivacyToEnd] = useState(false);
  const rulesRef = useRef<HTMLDivElement | null>(null);
  const privacyRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<SubmittedBooking | null>(null);

  /* â”€â”€ Restore form draft from localStorage â”€â”€ */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.date) setDate(new Date(d.date));
      if (d.hikeType) setHikeType(normalizeHikeType(d.hikeType));
      if (d.hikeTime && isValidHikeTime(normalizeHikeType(d.hikeType), d.hikeTime)) setHikeTime(d.hikeTime);
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

  /* â”€â”€ Save draft on every change â”€â”€ */
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

  /* â”€â”€ Fetch guides (real DB rows for fee + location scoping; also feeds dropdown names) â”€â”€ */
  useEffect(() => {
    const fetchGuides = async () => {
      const { data: gs } = await supabase
        .from('guides' as any)
        .select('id,full_name,location_id,per_trip_fee,referral_code,is_active,photo_url')
        .eq('is_active', true)
        .not('user_id', 'is', null);
      const list = ((gs as any[]) ?? []) as Array<{ id: string; full_name: string; location_id: string; per_trip_fee: number; referral_code?: string | null }>;
      setDbGuides(list);
      const names = list.map((g) => g.full_name).filter(Boolean);
      setGuideOptions(names.length ? names : ['Test Guide']);
    };
    void fetchGuides();
  }, []);

  /* â”€â”€ Auto-pick first active location if none chosen â”€â”€ */
  useEffect(() => {
    const pool = jumpOffLocations.length > 0 ? jumpOffLocations : allLocations;
    const livePool = pool.some((location) => !location.id.startsWith('loc-'))
      ? pool.filter((location) => !location.id.startsWith('loc-'))
      : pool;
    if ((!startLocationId || startLocationId.startsWith('loc-')) && livePool.length > 0) {
      const preferredEntry = livePool.find((location) => startLocationId && location.slug === startLocationId.replace(/^loc-/, ''))
        ?? livePool.find((location) => /lamot[- _]?2/i.test(`${location.slug} ${location.name}`));
      setStartLocationId((preferredEntry ?? livePool[0]).id);
    }
  }, [allLocations, jumpOffLocations, startLocationId]);

  const selectedLocation = useMemo(
    () => allLocations.find((l) => l.id === startLocationId) || null,
    [allLocations, startLocationId],
  );

  /* Load only the active entry point's published route for booking guidance. */
  useEffect(() => {
    let active = true;
    if (!startLocationId || startLocationId.startsWith('loc-')) {
      setPublishedRoute(null);
      return () => { active = false; };
    }

    const loadPublishedRoute = async () => {
      const { data, error } = await supabase
        .from('trail_zones')
        .select('id,location_id,name,difficulty,elevation_meters,coordinates_json,recording_metadata,status,is_official,review_status')
        .eq('location_id', startLocationId)
        .eq('status', 'active')
        .eq('is_official', true)
        .eq('review_status', 'approved')
        .order('created_at', { ascending: true })
        .limit(1);
      if (!active) return;
      if (error) {
        setPublishedRoute(null);
        return;
      }
      const routes = officialRoutesForLocation((data as unknown as PublishedRouteRow[] | null) ?? [], startLocationId);
      const route = routes[0];
      if (!route) {
        setPublishedRoute(null);
        return;
      }
      const points = route.coordinates_json as Array<{ lat: number; lng: number }>;
      let distanceKm = 0;
      for (let i = 1; i < points.length; i++) {
        distanceKm += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
      }
      const metadata = route.recording_metadata as { stationNames?: unknown; stations?: unknown } | null;
      const rawStations = Array.isArray(metadata?.stationNames)
        ? metadata.stationNames
        : Array.isArray(metadata?.stations)
          ? metadata.stations.map((station) => typeof station === 'object' && station !== null && 'name' in station ? station.name : station)
          : [];
      setPublishedRoute({
        id: route.id,
        name: route.name,
        locationName: selectedLocation?.name ?? 'Selected entry point',
        difficulty: route.difficulty,
        elevationMeters: Number(route.elevation_meters || 0) || undefined,
        distanceKm: distanceKm || undefined,
        stationNames: rawStations.filter((station): station is string => typeof station === 'string').slice(0, 8),
      });
    };
    void loadPublishedRoute();
    return () => { active = false; };
  }, [selectedLocation?.name, startLocationId]);

  const guidesAtLocation = useMemo(
    () => dbGuides.filter((g) => g.location_id === startLocationId),
    [dbGuides, startLocationId],
  );

  useEffect(() => {
    if (!referralGuideId || appliedReferralId.current === referralGuideId || !dbGuides.length) return;
    const cleanRef = referralGuideId.toLowerCase().trim();
    const isPublicReferral = Boolean(referralParam);
    const referredGuide = dbGuides.find((guide) =>
      (guide.referral_code || '').toLowerCase() === cleanRef ||
      (!isPublicReferral && guide.id.toLowerCase() === cleanRef)
    );
    if (!referredGuide) return;
    appliedReferralId.current = referralGuideId;
    if (referredGuide.location_id && referredGuide.location_id !== startLocationId) {
      if (explicitStartLocation.current) {
        toast.error(`This guide serves ${allLocations.find((location) => location.id === referredGuide.location_id)?.name ?? 'another trailhead'}. Choose a guide for your selected starting location.`);
        return;
      }
      setStartLocationId(referredGuide.location_id);
    }
    setPreferredGuideId(referredGuide.id);
    setPreferredGuide(referredGuide.full_name);
  }, [allLocations, dbGuides, preferredGuideId, referralGuideId, startLocationId]);

  const handleApplyReferralCode = () => {
    const raw = referralCodeInput.trim().toLowerCase();
    if (!raw) {
      toast.error('Please enter a guide referral code');
      return;
    }
    const matched = dbGuides.find((g) => (g.referral_code || '').toLowerCase() === raw);

    if (matched) {
      if (matched.location_id && matched.location_id !== startLocationId) {
        toast.error(`This guide serves ${allLocations.find((location) => location.id === matched.location_id)?.name ?? 'another trailhead'}. Choose a guide for your selected starting location.`);
        return;
      }
      setPreferredGuideId(matched.id);
      setPreferredGuide(matched.full_name);
      setReferralCodeInput('');
      toast.success(`Referral code applied! Guide ${matched.full_name} assigned.`);
    } else {
      toast.error('Guide referral code not found. The system will auto-assign your guide upon arrival.');
    }
  };


  /* â”€â”€ Capacity fetching â”€â”€ */
  const fetchSlotCapacity = useCallback(async (year: number, month: number) => {
    const start = format(new Date(year, month, 1), 'yyyy-MM-dd');
    const end = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');
    // The RPC returns aggregate slot counts only, so RLS never exposes another hiker's booking details.
    setSlotCapacityLoading(true);
    try {
      const { data: slotRows, error } = await supabase.rpc('get_booking_slot_capacity' as any, { p_start_date: start, p_end_date: end });
      if (error) throw error;
      setSlotCapacityError(null);
      const reservations = ((slotRows as Array<{ booking_date: string; hike_time: string; hike_type: string; group_count: number }> | null) ?? [])
        .flatMap((row) => Array.from({ length: Math.max(1, Number(row.group_count) || 1) }, (_, index) => ({
          id: `${row.booking_date}-${row.hike_time}-${index}`,
          booking_date: row.booking_date,
          status: 'confirmed',
          notes: JSON.stringify({ hikeTime: row.hike_time, hikeType: row.hike_type }),
        })));
      setScheduledBookings(reservations as ScheduledBooking[]);
    } catch (error) {
      console.warn('Live start-time availability check failed:', error);
      setScheduledBookings([]);
      setSlotCapacityError('Live capacity could not be verified. Refresh the page or contact the selected trailhead before booking.');
    } finally {
      setSlotCapacityLoading(false);
    }
  }, []);

  const fetchMonthCapacity = useCallback(async (year: number, month: number) => {
    const start = format(new Date(year, month, 1), 'yyyy-MM-dd');
    const end = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');
    // The initial fallback location IDs are display-only slugs; wait for the
    // locations query to resolve before using a value in this UUID column.
    if (!startLocationId || startLocationId.startsWith('loc-')) return;
    const { data, error } = await supabase
      .from('daily_capacity')
      .select('date,location_id,max_capacity,current_count,day_max_capacity,night_max_capacity,day_current_count,night_current_count')
      .gte('date', start)
      .lte('date', end)
      .or(`location_id.eq.${startLocationId},location_id.is.null`);
    if (error) {
      console.warn('Could not load daily trail capacity:', error);
      return;
    }
    if (data) {
      setMonthCapacity((prev) => {
        const map = { ...prev };
        [...data].sort((a, b) => Number(a.location_id === startLocationId) - Number(b.location_id === startLocationId)).forEach((row) => {
          map[row.date] = {
            max_capacity: row.max_capacity,
            current_count: row.current_count,
            day_max_capacity: row.day_max_capacity ?? undefined,
            night_max_capacity: row.night_max_capacity ?? undefined,
            day_current_count: row.day_current_count,
            night_current_count: row.night_current_count,
          };
        });
        return map;
      });
    }
  }, [startLocationId]);

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
          const row = payload.new as { date?: string; location_id?: string | null; max_capacity?: number; current_count?: number; day_max_capacity?: number | null; night_max_capacity?: number | null; day_current_count?: number; night_current_count?: number };
          if (row?.date && (row.location_id === startLocationId || row.location_id == null)) {
            setMonthCapacity((prev) => ({
              ...prev,
              [row.date]: {
                max_capacity: row.max_capacity ?? DEFAULT_MAX_CAPACITY,
                current_count: row.current_count ?? 0,
                day_max_capacity: row.day_max_capacity ?? undefined,
                night_max_capacity: row.night_max_capacity ?? undefined,
                day_current_count: row.day_current_count ?? 0,
                night_current_count: row.night_current_count ?? 0,
              },
            }));
          }
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        const now = new Date();
        void fetchMonthCapacity(now.getFullYear(), now.getMonth());
        if (slotCapacityRequestedRef.current) void fetchSlotCapacity(now.getFullYear(), now.getMonth());
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMonthCapacity, fetchSlotCapacity, startLocationId]);

  useEffect(() => {
    if (!startLocationId) return;
    setMonthCapacity({});
    const now = new Date();
    void fetchMonthCapacity(now.getFullYear(), now.getMonth());
  }, [fetchMonthCapacity, startLocationId]);

  useEffect(() => {
    if (!date || !slotCapacityRequested) {
      setScheduledBookings([]);
      setSlotCapacityError(null);
      setSlotCapacityLoading(false);
      return;
    }
    void fetchSlotCapacity(date.getFullYear(), date.getMonth());
  }, [date, fetchSlotCapacity, slotCapacityRequested]);

  useEffect(() => {
    if (!user) return;
    const metadata = user.user_metadata || {};
    if (metadata.full_name) setFullName(String(metadata.full_name));
    if (user.email) setEmailAddress(user.email);
    if (metadata.phone || metadata.phone_number) setPhoneNumber(String(metadata.phone || metadata.phone_number));
    if (metadata.age !== undefined && metadata.age !== null) setAge(String(metadata.age));
    if (metadata.sex === 'male' || metadata.sex === 'female' || metadata.sex === 'prefer_not_to_say') setSex(metadata.sex);

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, age')
        .eq('user_id', user.id)
        .single();

      if (data?.full_name) setFullName(data.full_name);
      if (data?.phone) setPhoneNumber(data.phone);
      if (data?.age !== null && data?.age !== undefined) setAge(String(data.age));
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

  /* â”€â”€ Derived slot count for selected date (Day vs Night Split) â”€â”€ */
  const slotsForDate = useMemo(() => {
    if (!date) return null;
    const dateStr = format(date, 'yyyy-MM-dd');
    const cap = monthCapacity[dateStr];
    const totalMax = cap?.max_capacity ?? DEFAULT_MAX_CAPACITY;
    if (hikeType === 'night' || hikeType === 'overnight') {
      const max = cap?.night_max_capacity ?? Math.max(0, totalMax - Math.ceil(totalMax * 0.65));
      const current = cap?.night_current_count ?? 0;
      return Math.max(0, max - current);
    } else {
      const max = cap?.day_max_capacity ?? Math.ceil(totalMax * 0.65);
      const current = cap?.day_current_count ?? 0;
      return Math.max(0, max - current);
    }
  }, [date, monthCapacity, hikeType]);

  const timeSlotStatuses = useMemo(() => {
    if (!date) return [];
    if (slotCapacityLoading) {
      return HIKE_TIME_OPTIONS[hikeType].map((option) => ({
        time: option.time,
        summitSlot: '',
        available: false,
        reason: 'capacity_check_failed' as const,
      }));
    }
    // Capacity is advisory in the calendar. If the aggregate RPC is
    // unavailable (for example on a newly opened future month), keep the
    // date and time selectable; the database trigger remains authoritative
    // when the booking is submitted.
    if (slotCapacityError) return getBookingSlotStatuses(format(date, 'yyyy-MM-dd'), HIKE_TIME_OPTIONS[hikeType], hikeType, []);
    return getBookingSlotStatuses(format(date, 'yyyy-MM-dd'), HIKE_TIME_OPTIONS[hikeType], hikeType, scheduledBookings);
  }, [date, hikeType, scheduledBookings, slotCapacityError, slotCapacityLoading]);

  const selectedTimeSlot = useMemo(
    () => timeSlotStatuses.find((slot) => slot.time === hikeTime),
    [timeSlotStatuses, hikeTime],
  );

  const fetchSmartWeather = useCallback(async (selectedDate: Date) => {
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const requestId = ++weatherRequestId.current;

    try {
      setWeatherLoading(true);
      setWeatherError(null);

      let dayWeather = forecastRef.current[formattedDate];
      if (!dayWeather) {
        const res = await fetchKalisungan16DayForecast();
        const days = normalizeForecastDays(res?.days);
        forecastRef.current = days;
        setKalisunganForecast(days);
        dayWeather = days[formattedDate];
      }

      if (!dayWeather) {
        setWeatherError('Forecast unavailable for this date. You can still continue with your booking.');
        return;
      }
      if (requestId !== weatherRequestId.current) return;
      setWeatherInsight({
        maxTempC: dayWeather.maxTempC,
        minTempC: dayWeather.minTempC,
        rainProbability: dayWeather.rainProbability,
        condition: dayWeather.condition,
        sourceName: dayWeather.sourceName,
        sourceUrl: dayWeather.sourceUrl,
        fetchedAt: dayWeather.fetchedAt,
      });
    } catch (err: unknown) {
      if (requestId === weatherRequestId.current) {
        setWeatherInsight(null);
        setWeatherError(err instanceof Error ? err.message : 'Unable to load weather insight');
      }
    } finally {
      if (requestId === weatherRequestId.current) setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!date) {
      weatherRequestId.current += 1;
      setWeatherInsight(null);
      setWeatherLoading(false);
      return;
    }
    setWeatherInsight(null);
    void fetchSmartWeather(date);
  }, [date, fetchSmartWeather]);

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

    const bestTime = highRain || weatherInsight.maxTempC >= 32
      ? (recommendedTimes[0] ?? HIKE_TIME_OPTIONS[hikeType][0].time)
      : HIKE_TIME_OPTIONS[hikeType].find((option) => option.recommended)?.time
        ?? recommendedTimes[0]
        ?? HIKE_TIME_OPTIONS[hikeType][0].time;

    return {
      bestTime,
      highHeat,
      highRain,
      groupMessage,
      recommendedTimes,
    };
  }, [smartGuideEnabled, date, weatherInsight, hikeTime, groupSize, hikeType]);

  const lastSavedAge = useMemo(() => {
    const metadataAge = user?.user_metadata?.age;
    if (metadataAge) return String(metadataAge);
    if (!user || typeof localStorage === 'undefined') return undefined;
    try { return localStorage.getItem(`${LAST_BOOKING_AGE_PREFIX}${user.id}`) || undefined; } catch { return undefined; }
  }, [user]);

  const savedParticipants = useMemo(() => {
    if (!user || typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`${LAST_BOOKING_PARTICIPANTS_PREFIX}${user.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [user]);

  const currentParticipants = useMemo(
    () => [
      { name: fullName, age: committedMainAge },
      ...companionDetails.map((companion, index) => ({
        name: companion.name || companions[index] || '',
        age: committedCompanionAges[index] ?? '',
      })),
    ],
    [fullName, committedMainAge, companionDetails, companions, committedCompanionAges],
  );

  const { insights: kaliInsights } = useKaliContext({
    role: role ?? 'guest',
    savedAge: lastSavedAge,
    currentAge: committedMainAge,
    currentAges: [committedMainAge, ...committedCompanionAges],
    savedParticipants,
    currentParticipants,
    selectedDate: date ? format(date, 'yyyy-MM-dd') : undefined,
    groupSize,
    weather: (weatherInsight || selectedKalisunganWeather)
      ? {
          condition: (weatherInsight || selectedKalisunganWeather)!.condition,
          rainProbability: (weatherInsight || selectedKalisunganWeather)!.rainProbability,
          maxTempC: (selectedKalisunganWeather || weatherInsight)?.maxTempC,
          minTempC: (selectedKalisunganWeather || weatherInsight)?.minTempC,
          precipitationMm: (selectedKalisunganWeather as any)?.precipitationMm ?? 0,
          trailImpact: selectedKalisunganWeather?.advisory?.trailImpact,
          safetyAdvice: selectedKalisunganWeather?.advisory?.safetyAdvice,
          headline: selectedKalisunganWeather?.advisory?.headline,
          badgeLabel: selectedKalisunganWeather?.advisory?.badgeLabel,
          category: selectedKalisunganWeather?.category,
          forecastDays: Object.values(normalizeForecastDays(kalisunganForecast)).map((d) => ({
            date: d.date,
            condition: d.condition,
            maxTempC: d.maxTempC,
            minTempC: d.minTempC,
            rainProbability: d.rainProbability,
            precipitationMm: d.precipitationMm,
            category: d.category,
            advisoryBadge: d.advisory?.badgeLabel,
            trailImpact: d.advisory?.trailImpact,
            safetyAdvice: d.advisory?.safetyAdvice,
          })),
          fetchedAt: (weatherInsight || selectedKalisunganWeather)!.fetchedAt ?? Date.now(),
          sourceName: 'Open-Meteo (Mt. Kalisungan coordinates)',
          sourceUrl: 'https://open-meteo.com/',
          locationCitation: 'Mt. Kalisungan, Laguna (14.1475Â°N, 121.3454Â°E Â· 760m)',
        }
      : null,
    selectedStartTime: date ? hikeTime : undefined,
    recommendedStartTime: smartRecommendations?.bestTime,
    hikeType,
  });

  /* â”€â”€ Hike type change â”€â”€ */
  const handleHikeTypeChange = (type: HikeType) => {
    setHikeType(type);
    if (date) setSlotCapacityRequested(true);
    const recommended = HIKE_TIME_OPTIONS[type].find((t) => t.recommended);
    if (recommended) setHikeTime(recommended.time);
  };

  /* â”€â”€ Validation â”€â”€ */
  const validateStep = () => {
    if (step === 1) {
      if (!date) return 'Please select a date on the calendar.';
      if (slotCapacityRequested && slotCapacityLoading) return 'Checking availability for this date. Please wait a moment.';
      if (groupSize < 1 || groupSize > 30) return 'Group size must be between 1 and 30.';
      if (slotsForDate !== null && groupSize > slotsForDate) {
        return `Only ${slotsForDate} slot${slotsForDate !== 1 ? 's' : ''} available on this date. Reduce group size or choose another date.`;
      }
      if (!hikeTime) return 'Please select a start time.';
      if (!isValidHikeTime(hikeType, hikeTime)) return `Please choose a start time within the ${getHikeTypeLabel(hikeType).toLowerCase()} hike window.`;
      if (selectedTimeSlot && !selectedTimeSlot.available) {
        return selectedTimeSlot.reason === 'already_booked'
          ? 'That start time is already reserved. Please choose the next available one-hour slot.'
          : 'The summit is at its five-group limit for that arrival window. Please choose another available start time.';
      }
    }
    if (step === 2) {
      if (!fullName.trim()) return 'Full name is required.';
      if (validateAge(age)) return validateAge(age)!;
      if (validateEmail(emailAddress)) return validateEmail(emailAddress)!;
      if (validatePhone(phoneNumber)) return validatePhone(phoneNumber)!;
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

  /* â”€â”€ Screenshot handler â”€â”€ */
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

  /* â”€â”€ Submit â”€â”€ */
  const handleBook = async () => {
    if (bookingSubmitLock.current) return;
    if (!user || !date) {
      toast.error('Sign in and choose a hike date before submitting.');
      return;
    }
    if (!startLocationId) {
      toast.error('Please choose a starting location.');
      return;
    }
    if (startLocationId.startsWith('loc-') || !selectedLocation) {
      toast.error('Trailhead details are still loading. Please wait a moment and select your starting location again.');
      return;
    }

    const selectedGuide = preferredGuideId ? dbGuides.find((guide) => guide.id === preferredGuideId) : undefined;
    if (preferredGuideId && (!selectedGuide || selectedGuide.location_id !== startLocationId)) {
      setPreferredGuideId('');
      setPreferredGuide('');
      toast.error('That guide is not assigned to the selected trailhead. Please choose a local guide or remove the referral.');
      return;
    }

    bookingSubmitLock.current = true;
    setLoading(true);
    let bookingSaved = false;

    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      // A retry after a network timeout checks the stable attempt id first so a
      // committed booking is recovered instead of creating a duplicate.
      const retrying = bookingAttemptId.current !== null;
      const attemptId = bookingAttemptId.current ?? crypto.randomUUID();
      bookingAttemptId.current = attemptId;
      if (retrying) {
        const { data: existingBooking, error: existingError } = await withBookingRequestTimeout(
          (signal) => supabase.from('bookings').select('*').eq('id', attemptId).abortSignal(signal).maybeSingle(),
          'Checking the previous booking attempt',
        );
        if (existingError) throw existingError;
        if (existingBooking) {
          setBooking({
            ...existingBooking,
            hikeTime, hikeType, fullName, age, emailAddress, phoneNumber, province, city,
            companions: companions.map((name) => name.trim()).filter(Boolean), sex, hasMinors,
            preferredGuide, paymentOption, totalFee: calculateFees(groupSize, { hikeType }).totalFee,
          });
          bookingAttemptId.current = null;
          toast.success('Your booking was already received.');
          return;
        }
      }

      // Per-guide quota is advisory; a temporary read failure must not freeze
      // the booking flow. The database still enforces the trailhead boundary.
      if (selectedGuide) {
        try {
          const { data: existing, error: quotaError } = await withBookingRequestTimeout(
            (signal) => supabase
              .from('booking_assignments' as any)
              .select('id,status,booking:bookings!inner(booking_date)')
              .eq('guide_id', selectedGuide.id)
              .in('status', ['pending', 'accepted'])
              .abortSignal(signal),
            'Checking guide availability',
            10000,
          );
          if (quotaError) throw quotaError;
          const sameDay = ((existing as any[]) ?? []).filter((row: any) => row.booking?.booking_date === dateStr).length;
          if (sameDay >= 5) {
            toast.error('This guide is already at the 5-booking quota for that date. Choose another date or remove the referral.');
            return;
          }
        } catch (error) {
          console.warn('Could not verify the optional guide quota:', error);
          toast.warning('Guide availability could not be refreshed. Your local trailhead admin will verify the assignment.');
        }
      }

      const qrData = `KALISUNGAN-${attemptId}`;
      const companionNames = companions.map((name) => name.trim()).filter(Boolean);
      const fees = calculateFees(groupSize, { hikeType });

      let screenshotUrl: string | undefined;
      let screenshotPath: string | undefined;
      if (paymentScreenshot) {
        setScreenshotUploading(true);
        let uploadTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            uploadPaymentScreenshot(paymentScreenshot, `${user.id.slice(0, 8)}-${dateStr}`),
            new Promise<never>((_, reject) => {
              uploadTimeout = setTimeout(() => reject(new Error('Screenshot upload timed out')), 15000);
            }),
          ]);
          if (result) {
            screenshotUrl = result.url;
            screenshotPath = result.path;
          } else {
            toast.warning('Screenshot storage is unavailable. Your booking will be submitted without the image.');
          }
        } catch {
          toast.warning('Screenshot upload did not finish. Your booking will be submitted without the image.');
        } finally {
          if (uploadTimeout !== undefined) clearTimeout(uploadTimeout);
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
        preferredGuide: selectedGuide?.full_name,
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
        baseFee: fees.totalFee,
        originalQuote: { total: fees.totalFee, capturedAt: new Date().toISOString() },
      });

      // Profile enrichment is best-effort and does not hold the reservation UI open.
      void Promise.all([
        supabase.from('profiles').upsert(
          {
            user_id: user.id,
            full_name: fullName.trim(),
            phone: phoneNumber.trim(),
            emergency_contact: companionNames[0] ? `${companionNames[0]} (companion)` : '',
            is_active: true,
          },
          { onConflict: 'user_id' },
        ),
        supabase.from('user_roles').upsert(
          {
            user_id: user.id,
            role: 'hiker',
          } as any,
          { onConflict: 'user_id,role' },
        ),
      ]).then((results) => results.forEach(({ error }) => {
        if (error) console.warn('Could not sync hiker profile details:', error.message);
      })).catch((profileError) => console.warn('Could not sync hiker profile details:', profileError));

      const { data, error } = await withBookingRequestTimeout(
        (signal) => supabase.from('bookings').insert({
          id: attemptId,
          user_id: user.id,
          booking_date: dateStr,
          group_size: groupSize,
          qr_code_data: qrData,
          emergency_contact_name: fullName,
          emergency_contact_phone: phoneNumber,
          notes: metaNotes,
          status: 'pending',
          location_id: startLocationId,
        } as any).select().abortSignal(signal).single(),
        'Booking submission',
      );
      if (error) throw error;
      if (!data) throw new Error('The booking was not saved. Please try again.');
      bookingSaved = true;

      if (selectedGuide) {
        try {
          const { error: assignmentError } = await withBookingRequestTimeout(
            (signal) => supabase.from('booking_assignments' as any).insert({
              booking_id: data.id,
              guide_id: selectedGuide.id,
              location_id: startLocationId,
              status: 'pending',
            } as any).abortSignal(signal),
            'Saving the referred guide request',
            10000,
          );
          if (assignmentError) throw assignmentError;
        } catch (assignmentError) {
          console.error('Booking saved but referred guide assignment failed:', assignmentError);
          toast.warning('Your booking was saved, but the requested guide was not attached. Your local trailhead admin will assign a guide.');
        }
      }

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
        preferredGuide: selectedGuide?.full_name ?? '',
        paymentOption,
        totalFee: fees.totalFee,
      });
      bookingAttemptId.current = null;
      // Clear saved draft on successful booking
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success('Booking submitted! Awaiting admin approval.');
      if (isFirebaseConfigured() && user?.id) {
        void createUserNotification(user.id, {
          title: 'Booking submitted',
          body: `Your booking for ${dateStr} is now pending admin approval.`,
          category: 'booking',
        }).catch(() => toast.warning('Booking saved. The in-app notification could not be delivered. Your booking remains available in My Bookings.'));
      }
      try { localStorage.setItem(`${LAST_BOOKING_AGE_PREFIX}${user.id}`, age); } catch { /* storage unavailable */ }
      try {
        localStorage.setItem(
          `${LAST_BOOKING_PARTICIPANTS_PREFIX}${user.id}`,
          JSON.stringify([
            { name: fullName, age },
            ...enrichedCompanions.map((companion) => ({ name: companion.name, age: companion.age ?? '' })),
          ].filter((participant) => participant.name.trim() && String(participant.age).trim())),
        );
      } catch { /* storage unavailable */ }
    } catch (error) {
      console.error('Booking submission failed:', error);
      const message = error instanceof Error ? error.message : 'Unexpected error while submitting your booking.';
      toast.error(bookingSaved
        ? 'Your booking was saved, but some follow-up details failed. Check My Bookings before retrying.'
        : `${message} Your form is still here; you can safely retry.`);
    } finally {
      setScreenshotUploading(false);
      setLoading(false);
      bookingSubmitLock.current = false;
    }
  };

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SUCCESS SCREEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
              Your reservation is pending admin approval. A booking confirmation email will follow once your guide accepts and your booking is confirmed.
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
                { label: 'Hike Type', value: `${booking.hikeType === 'overnight' || booking.hikeType === 'night' ? 'ðŸŒ™' : 'â˜€ï¸'} ${getHikeTypeLabel(booking.hikeType)} Hike` },
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

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ADMIN ON-SITE WALK-IN COUNTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  if (role === 'admin' || role === 'super_admin') {
    return (
      <AdminWalkInDesk
        locationId={startLocationId || null}
      />
    );
  }

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ HIKER ONLINE BOOKING FORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <div className="min-h-screen overflow-x-hidden pt-20 pb-24 md:pb-12 px-2 sm:px-4">
      <div className="container max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">
            Book Your <span className="text-gradient">Hike</span>
          </h1>
          <p className="text-muted-foreground">
            Complete the {STEPS.length}-step process to secure your slot at Mount Kalisungan.
          </p>
        </motion.div>

        {/* â”€â”€â”€ Step Indicator â”€â”€â”€ */}
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

        {/* â”€â”€â”€ Step Content â”€â”€â”€ */}
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

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STEP 1: SCHEDULE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                          { type: 'morning' as HikeType, Icon: Sun, label: 'Morning', desc: 'Summit by daylight' },
                          { type: 'night' as HikeType, Icon: Moon, label: 'Night', desc: 'Continue into evening' },
                          { type: 'overnight' as HikeType, Icon: Moon, label: 'Overnight', desc: 'Stay overnight on trail' },
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
                        onSelect={(nextDate) => {
                          setDate(nextDate);
                          if (nextDate) setSlotCapacityRequested(true);
                        }}
                        groupSize={groupSize}
                        monthCapacity={monthCapacity}
                        hikeType={hikeType}
                        onMonthChange={(year, month) => {
                          void fetchMonthCapacity(year, month);
                          void fetchSlotCapacity(year, month);
                        }}
                        weatherMap={kalisunganForecast}
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
                              <> â€” <strong>{slotsForDate}</strong> slot{slotsForDate !== 1 ? 's' : ''} available</>
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
                          <p className="text-[11px] text-muted-foreground">1–30 hikers (1 guide per {pricing.maxPaxPerGuide} pax · {formatPeso(getGuideFeePerGuide(hikeType))}/guide)</p>
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

                    {groupSize > maxPaxRatio && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary">
                        <Users className="h-4 w-4 shrink-0" />
                        <span>
                          Groups over {maxPaxRatio} hikers require <strong>{Math.ceil(groupSize / maxPaxRatio)} mountain guides</strong> ({formatPeso(getGuideFeePerGuide(hikeType))} per guide) for trail safety.
                        </span>
                      </div>
                    )}

                    {/* Start Time */}
                    <div className="space-y-2.5">
                      <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex flex-wrap items-center gap-1.5">
                        Preferred Start Time
                        <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/60">
                          â€” {getHikeTypeLabel(hikeType)} hike schedule
                        </span>
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {HIKE_TIME_OPTIONS[hikeType].map((opt) => (
                          (() => {
                            const slot = timeSlotStatuses.find((candidate) => candidate.time === opt.time);
                            const unavailable = !!slot && !slot.available;
                            return (
                          <button
                            key={opt.time}
                            onClick={() => !unavailable && setHikeTime(opt.time)}
                            disabled={unavailable}
                            aria-pressed={hikeTime === opt.time}
                            title={unavailable ? (slot?.reason === 'already_booked' ? 'Already reserved' : slot?.reason === 'summit_capacity' ? 'Summit group limit reached' : 'Availability check unavailable') : undefined}
                            className={cn(
                              'flex flex-col items-center px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all min-w-[76px]',
                              unavailable && 'opacity-40 cursor-not-allowed border-destructive/30 line-through',
                              hikeTime === opt.time
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
                                hikeTime === opt.time
                                  ? 'text-primary-foreground/70'
                                  : smartRecommendations?.recommendedTimes.includes(opt.time)
                                  ? 'text-amber-600 dark:text-amber-300'
                                  : opt.recommended
                                  ? 'text-amber-500'
                                  : 'opacity-55',
                              )}
                            >
                              {smartRecommendations?.recommendedTimes.includes(opt.time)
                                ? 'â­ Recommended'
                                : opt.recommended
                                ? 'â˜… Recommended'
                                  : opt.notSuggested
                                  ? `${opt.label}`
                                  : opt.label}
                            </span>
                          </button>
                            );
                          })()
                        ))}

                      </div>
                      {slotCapacityRequested && slotCapacityError && (
                        <p className="text-xs text-destructive" role="alert">{slotCapacityError}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">Start times use one-hour intervals. A reserved time is blocked, and no more than 5 groups may share the same summit arrival window across all entry points.</p>
                    </div>

                  </div>
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STEP 2: PERSONAL DETAILS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                          max={120}
                          step={1}
                          inputMode="numeric"
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
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
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
                            placeholder="Search PH city or municipalityâ€¦"
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
                                    <CityAutocomplete
                                      value={cd.city || ''}
                                      options={phLocations}
                                      onPick={(c) => updateCompanionDetail(idx, 'city', c)}
                                      placeholder="Search PH city/municipalityâ€¦"
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

                      {/* Minors â€” auto-detected from ages entered above */}
                      {hasMinors && (
                        <div id="minor-requirements" data-testid="minor-requirements" tabIndex={-1} className="space-y-3 sm:col-span-2 outline-none">
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
                              If a parent or guardian is NOT present onsite, the minor MUST carry a notarized parental consent letter and a photocopy of the parent's valid ID. Entry will be denied without these documents.
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

                      {/* Start Location (Lamot 1 / Lamot 2 / Main) â€” REQUIRED */}
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="startLocation" className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          Starting Location <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={startLocationId}
                          onValueChange={(v) => { explicitStartLocation.current = true; appliedReferralId.current = null; setStartLocationId(v); setPreferredGuideId(''); setPreferredGuide(''); }}
                        >
                          <SelectTrigger id="startLocation">
                            <SelectValue placeholder="Choose where you'll start hiking" />
                          </SelectTrigger>
                          <SelectContent>
                            {(jumpOffLocations.length > 0 ? jumpOffLocations : allLocations.filter(l => l.slug.includes("lamot") || l.slug.includes("tomas"))).map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}{loc.lgu ? ` â€” ${loc.lgu}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          This is the exact jump-off point where your hike starts and the matching route will appear on the map. Choose carefully between Lamot 1, Lamot 2, and Sto. Tomas based on the closest or most convenient entry point; each has its own admin and team.
                        </p>
                      </div>

                      {/* Map preview â€” shown BEFORE booking is confirmed so hikers see exactly where to go */}
                      {selectedLocation && (
                        <div className="sm:col-span-2">
                          <LocationPreview
                            name={selectedLocation.name}
                            lgu={selectedLocation.lgu}
                            lat={Number(selectedLocation.center_lat)}
                            lng={Number(selectedLocation.center_lng)}
                            description={selectedLocation.description}
                          />
                          <div className={cn(
                            'mt-2 rounded-lg border px-3 py-2 text-xs',
                            publishedRoute ? 'border-primary/25 bg-primary/5 text-foreground' : 'border-amber-400/30 bg-amber-500/5 text-muted-foreground',
                          )}>
                            {publishedRoute ? (
                              <>
                                <strong>Official route for this jump-off:</strong> {publishedRoute.name}
                                {publishedRoute.distanceKm ? ` Â· ${publishedRoute.distanceKm.toFixed(1)} km` : ''}
                                {publishedRoute.elevationMeters ? ` Â· ${publishedRoute.elevationMeters}m` : ''}
                                <span className="block text-[11px] text-muted-foreground">Synced from the approved trail map.</span>
                              </>
                            ) : (
                              'No approved route is published for this entry point yet. Staff will confirm the route before the hike.'
                            )}
                          </div>
                        </div>
                      )}

                      {/* Guide Assignment: Referral Code / System Auto-Assignment */}
                      <div className="space-y-3 sm:col-span-2 rounded-xl border border-border/60 bg-muted/20 p-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold flex items-center gap-1.5">
                            <Compass className="h-4 w-4 text-primary" />
                            Guide Assignment
                          </Label>
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            1 Guide : {pricing.maxPaxPerGuide} Hikers
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                          To uphold fair rotation and community livelihood, manual guide browsing is disabled.
                          Guides are <strong>automatically assigned by the system</strong> on rotation among accredited on-duty guides.
                        </p>

                        {/* Referral Code / Link Applied Card */}
                        {preferredGuide ? (
                          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                                {guidePhotoForName(preferredGuide, dbGuides.find((guide) => guide.id === preferredGuideId)?.photo_url) ? (
                                  <img src={guidePhotoForName(preferredGuide, dbGuides.find((guide) => guide.id === preferredGuideId)?.photo_url) ?? undefined} alt="" decoding="async" className="h-9 w-9 rounded-full object-cover" />
                                ) : (
                                  preferredGuide.charAt(0)
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-foreground">Referred Guide: {preferredGuide}</span>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  Applied via referral link or code
                                </span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPreferredGuideId('');
                                setPreferredGuide('');
                                setReferralCodeInput('');
                                toast.info('Referral removed. The system will auto-assign your guide.');
                              }}
                              className="text-xs text-muted-foreground hover:text-destructive h-8 px-2"
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label htmlFor="guideReferralCode" className="text-xs text-muted-foreground font-medium">
                              Have a guide referral code? (Optional)
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="guideReferralCode"
                              placeholder="Enter guide referral code"
                                value={referralCodeInput}
                                onChange={(e) => setReferralCodeInput(e.target.value)}
                                className="text-xs h-9"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleApplyReferralCode}
                                className="text-xs px-3 shrink-0"
                              >
                                Apply Code
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* System Auto-Assignment Notice */}
                        <div className="rounded-lg bg-background/50 border border-border/40 p-2.5 text-[11px] text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <Users className="h-3 w-3 text-primary" />
                            {groupSize > maxPaxRatio ? (
                              <span>Group of {groupSize} hikers requires {Math.ceil(groupSize / maxPaxRatio)} guides</span>
                            ) : (
                              <span>System Auto-Rotation Assignment</span>
                            )}
                          </div>
                          {groupSize > maxPaxRatio ? (
                            <p>
                              {preferredGuide ? (
                                <>
                                  Your referred guide <strong>{preferredGuide}</strong> will lead your trek. Because your group requires <strong>{Math.ceil(groupSize / maxPaxRatio)} guides</strong>, the additional guide(s) will be automatically assigned by the system upon station check-in.
                                </>
                              ) : (
                                <>
                                  Because your group size requires <strong>{Math.ceil(groupSize / maxPaxRatio)} guides</strong>, all guides are automatically assigned by the system rotation upon arrival.
                                </>
                              )}
                            </p>
                          ) : (
                            <p>
                              {preferredGuide ? (
                                <>Guide assigned: <strong>{preferredGuide}</strong> (subject to station check-in and daily limits).</>
                              ) : (
                                <>No referral code? No problem! The system automatically assigns an accredited local guide upon station check-in.</>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STEP 3: AGREEMENT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
                      <p className="mt-3 font-semibold text-destructive">8. LIABILITY WAIVER â€” IMPORTANT</p>
                      <p>By booking and participating in this activity, the hiker fully acknowledges that hiking involves inherent risks including but not limited to: physical injury, accidents, loss or damage of property, and adverse weather conditions. <strong>The Mt. Kalisungan community, the Local Government Unit (LGU) of Calauan, Barangay Lamot II, the Barangay Council, and any affiliated organization, corporation, or association are NOT liable and shall bear NO responsibility</strong> for any injury, accident, illness, death, loss of personal belongings, or damage to property occurring before, during, or after the hiking activity. ALL LIABILITY rests solely with the hiker and their group. Participation is entirely at the hiker's own risk.</p>
                      <p>9. For minors, the parent or guardian assumes full liability and responsibility. Failure to present required parental consent documents will result in denial of entry.</p>
                      <p>10. Payment of fees does not constitute insurance coverage. Hikers are strongly advised to secure their own personal accident and travel insurance.</p>
                      <p className="mt-3 font-semibold text-amber-600 dark:text-amber-400">11. DATE CHANGES &amp; CANCELLATION NOTICE POLICY (MANDATORY)</p>
                      <p className="text-amber-900 dark:text-amber-200 font-medium">To protect guide livelihoods and maintain daily trail capacity limits, <strong>any request for date adjustments, rescheduling, or booking cancellations must be submitted at least 1 to 3 days prior to your confirmed hike date</strong>. Same-day cancellations or no-shows are strictly non-refundable and forfeit assigned guide slots.</p>
                    </div>
                    {!hasScrolledRulesToEnd && (
                      <p className="text-xs text-amber-600 font-medium">Please scroll to the end of the rules (including 1â€“3 days cancellation policy) to enable agreement.</p>
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

                {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STEP 4: CONFIRM â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
                {step === 4 && (() => {
                  const { entryFee, envFee, guideFee, guidesNeeded, totalFee } = calculateFees(groupSize, { hikeType });
                  return (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Confirm Booking</h2>
                      <p className="text-sm text-muted-foreground mt-1">Review your details before submitting.</p>
                    </div>
                    <div className="space-y-3 p-5 rounded-2xl bg-primary/5 border border-primary/20">
                      {[
                        { label: 'Hike Date', value: date ? format(date, 'MMMM d, yyyy') : '' },
                        { label: 'Hike Type', value: `${hikeType === 'overnight' ? 'ðŸŒ™' : hikeType === 'night' ? 'ðŸŒ™' : 'â˜€ï¸'} ${getHikeTypeLabel(hikeType)} Hike` },
                        { label: 'Start Time', value: hikeTime },
                        { label: 'Group Size', value: `${groupSize} Pax` },
                        { label: 'Full Name', value: fullName },
                        { label: 'Age', value: age },
                        { label: 'Sex', value: sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : sex === 'prefer_not_to_say' ? 'Prefer not to say' : 'Not specified' },
                        { label: 'Minors in Group', value: hasMinors ? `Yes (${minorCount})` : 'No' },
                        { label: 'Email', value: emailAddress },
                        { label: 'Address', value: [city, province].filter(Boolean).join(', ') || 'Not provided' },
                        { label: 'Companions', value: companions.map((name) => name.trim()).filter(Boolean).join(', ') || 'None listed' },
                        { label: 'Guide Assignment', value: preferredGuide.trim() ? `${preferredGuide} (Referred)` : (groupSize > maxPaxRatio ? `${Math.ceil(groupSize / maxPaxRatio)} guides (Auto-Assigned)` : 'System Auto-Assigned') },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-border/10 last:border-0">
                          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{label}</span>
                          <span className="font-bold text-primary text-sm text-right max-w-[55%] truncate">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* â”€â”€ Payment Section â”€â”€ */}
                    <div className="space-y-4 p-5 rounded-2xl border border-border/20 bg-secondary/10">
                      <h3 className="font-semibold flex items-center gap-2 text-base">
                        <CreditCard className="h-4 w-4 text-primary" /> Payment Summary
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Registration / Entry Fee ({formatPeso(pricing.entryFee)} Ã— {groupSize} pax)</span>
                          <span className="font-semibold">{formatPeso(entryFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Environmental / DSPA Fee ({formatPeso(pricing.envFee)} Ã— {groupSize} pax)</span>
                          <span className="font-semibold">{formatPeso(envFee)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Mountain Guide Fee ({formatPeso(getGuideFeePerGuide(hikeType))} / guide · {guidesNeeded} {guidesNeeded > 1 ? 'guides' : 'guide'})
                          </span>
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
                            <p className="text-xs text-muted-foreground pt-1">Amount: <strong>{formatPeso(totalFee)}</strong> â€” use your booking name as reference.</p>
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
                              <Label htmlFor="amountPaid" className="text-xs">Amount Paid (â‚±)</Label>
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
                                <span className="text-[10px] font-normal text-amber-500">(Firebase not configured â€” admin will request manually)</span>
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
                            Online payment is optional â€” you may pay remaining balance onsite. Proof of payment may be required at check-in.
                          </p>
                        </motion.div>
                      )}

                      {paymentOption === 'onsite' && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/30 text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                          <span>You chose to pay onsite. Please prepare {formatPeso(totalFee)} in cash at the trailhead on your booking date.</span>
                        </div>
                      )}

                      {/* Prominent 1-3 Days Date Change / Cancellation Notice */}
                      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-1.5 animate-in fade-in">
                        <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>Important: 1â€“3 Days Notice for Date Changes or Cancellation</span>
                        </div>
                        <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                          To protect assigned mountain guide schedules and environmental carrying capacities, any <strong>schedule adjustment, date change, or booking cancellation must be communicated at least 1 to 3 days before your confirmed hike date</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* â”€â”€â”€ Navigation Buttons â”€â”€â”€ */}
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
                {screenshotUploading ? 'Uploadingâ€¦' : 'Confirm Reservation'}
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
                  {screenshotUploading ? 'Uploadingâ€¦' : 'Confirm'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Button type="button" className="fixed left-3 bottom-24 z-40 h-12 rounded-full shadow-lg sm:bottom-6" onClick={() => window.dispatchEvent(new Event('open-global-ai-assistant'))} aria-label="Ask Kali about your booking">
        Ask Kali
      </Button>
      <KaliContextPanel role={role ?? 'guest'} insights={kaliInsights} />

      {/* Floating AI Chat â€” left side */}
      <BookingAIChat
        date={date}
        groupSize={groupSize}
        hikeType={hikeType}
        hikeTime={hikeTime}
        publishedRoute={publishedRoute}
        weatherInsight={weatherInsight}
        groupComposition={groupComposition}
        onGroupCompositionSet={setGroupComposition}
        onApplySuggestion={(s) => {
          const applied: string[] = [];
          if (s.date) {
            const [y, m, d] = s.date.split('-').map(Number);
            const next = new Date(y, m - 1, d);
            if (!Number.isNaN(next.getTime())) { setDate(next); applied.push(format(next, 'MMM d, yyyy')); }
          }
          if (s.hikeType) { const nextType = normalizeHikeType(s.hikeType); setHikeType(nextType); applied.push(`${getHikeTypeLabel(nextType)} hike`); }
          if (s.hikeTime && isValidHikeTime(s.hikeType ? normalizeHikeType(s.hikeType) : hikeType, s.hikeTime)) { setHikeTime(s.hikeTime); applied.push(s.hikeTime); }
          if (typeof s.groupSize === 'number') { setGroupSize(s.groupSize); applied.push(`${s.groupSize} pax`); }
          if (applied.length) toast.success(`Applied: ${applied.join(' Â· ')}`);
          if (s.submit) {
            setStep(2);
            toast.info('Review your details, then accept the reminders and agreements to finish.');
          }
        }}
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

      {/* ── Minimalist Back to Top floating button (desktop & mobile) ── */}
      {showBackToTop && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-40 h-10 w-10 rounded-full shadow-lg border-border/60 bg-background/80 backdrop-blur-md hover:bg-primary hover:text-white transition-all duration-300"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}

    </div>
  );
}
