import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import BookingAIChat, { type BookingSuggestion } from '@/components/booking/BookingAIChat';
import { Bot, CalendarCheck, QrCode, Download, X, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/** Human label + short description for each route so the assistant can answer page questions. */
const PAGE_INFO: Record<string, { label: string; blurb: string }> = {
  '/': { label: 'Home', blurb: 'the Mount Kalisungan landing page with the trail overview, gallery, guides and reviews' },
  '/map': { label: 'Trail Map', blurb: 'the live trail map with GPS tracking, offline tiles, weather and trail recording' },
  '/chat': { label: 'Trail Chat', blurb: 'the trail assistant chat page' },
  '/booking': { label: 'Book a Hike', blurb: 'the booking form' },
  '/profile': { label: 'Profile', blurb: 'the user profile and account settings page' },
  '/notifications': { label: 'Notifications', blurb: 'the notifications page' },
  '/hiker': { label: 'Hiker Dashboard', blurb: 'the hiker dashboard with bookings, QR check-in and hike history' },
  '/guide': { label: 'Guide Dashboard', blurb: 'the guide dashboard with assignments and schedules' },
  '/ranger': { label: 'Ranger Dashboard', blurb: 'the ranger dashboard with check-ins and monitoring' },
  '/admin': { label: 'Admin Dashboard', blurb: 'the admin dashboard for bookings, guides and monitoring' },
  '/central': { label: 'Central Dashboard', blurb: 'the multi-location central dashboard' },
};

/** Routes where the floating assistant should not appear. */
const HIDDEN_ROUTES = ['/booking', '/login', '/register', '/onboarding', '/ops-ai'];

export default function GlobalAIAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [actionsOpen, setActionsOpen] = useState(false);

  const hidden = HIDDEN_ROUTES.some((r) => location.pathname === r || location.pathname.startsWith(`${r}/`));

  const info = PAGE_INFO[location.pathname] ?? { label: 'this page', blurb: 'a page of the Mount Kalisungan app' };

  const greeting = useMemo(
    () =>
      `Hi! I'm **Kali**, your Mount Kalisungan assistant. 🏔️\n\n` +
      `You're on **${info.label}** — ${info.blurb}.\n\n` +
      `Ask me anything about this page, the trails, weather or safety — or tell me when you'd like to hike and I'll set up your booking for you.`,
    [info.label, info.blurb],
  );

  if (hidden) return null;

  const goToBooking = (s: BookingSuggestion) => {
    const params = new URLSearchParams();
    if (s.date) params.set('date', s.date);
    if (s.hikeTime) params.set('time', s.hikeTime);
    if (s.groupSize) params.set('pax', String(s.groupSize));
    if (s.hikeType) params.set('type', s.hikeType);
    if (s.submit) params.set('ready', '1');
    toast.success('Taking you to Book a Hike with these details');
    navigate(`/booking?${params.toString()}`);
  };

  const isAdmin = role === 'admin' || role === 'super_admin';
  const openAssistant = () => {
    setActionsOpen(false);
    window.dispatchEvent(new Event('open-global-ai-assistant'));
  };

  return (
    <>
      <div className="md:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-3 z-[2050] flex flex-col items-start gap-2">
        {actionsOpen && (
          <div className="flex flex-col-reverse items-start gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
            {/* Quick Check-In / QR Permit */}
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                if (isAdmin) {
                  navigate('/admin?tab=scan');
                } else {
                  navigate('/hiker');
                }
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-border/40 bg-card/95 text-foreground shadow-2xl backdrop-blur-md hover:bg-secondary/60 transition-all text-xs font-semibold"
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                <QrCode className="h-4 w-4" />
              </div>
              <span className="whitespace-nowrap">{isAdmin ? 'QR Check-in Scanner' : 'My QR Permit'}</span>
            </button>

            {/* Book a Hike / Walk-in */}
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                navigate('/booking');
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-border/40 bg-card/95 text-foreground shadow-2xl backdrop-blur-md hover:bg-secondary/60 transition-all text-xs font-semibold"
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <span className="whitespace-nowrap">{isAdmin ? 'Walk-In Desk' : 'Book a Hike'}</span>
            </button>

            {/* Ask Kali AI */}
            <button
              type="button"
              onClick={openAssistant}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-primary/30 bg-primary text-primary-foreground shadow-2xl hover:bg-primary/90 transition-all text-xs font-semibold"
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-white shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <span className="whitespace-nowrap">Ask Kali AI</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActionsOpen((open) => !open)}
          aria-label={actionsOpen ? 'Close quick actions' : 'Open quick actions'}
          title={actionsOpen ? 'Close quick actions' : 'Open quick actions'}
          aria-expanded={actionsOpen}
          className="grid h-13 w-13 p-3.5 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-95 border-2 border-primary-foreground/20"
        >
          {actionsOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        </button>
      </div>
    <BookingAIChat
      key={location.pathname}
      groupSize={1}
      hikeType="day"
      pageContext={`${info.label} — ${info.blurb}`}
      greeting={greeting}
      applyLabel="Book this now →"
      onApplySuggestion={goToBooking}
    />
    </>
  );
}
