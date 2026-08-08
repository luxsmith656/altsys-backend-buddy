import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import BookingAIChat, { type BookingSuggestion } from '@/components/booking/BookingAIChat';

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
    toast.success('Taking you to Book a Hike with these details');
    navigate(`/booking?${params.toString()}`);
  };

  return (
    <BookingAIChat
      key={location.pathname}
      groupSize={1}
      hikeType="day"
      pageContext={`${info.label} — ${info.blurb}`}
      greeting={greeting}
      applyLabel="Book this now →"
      onApplySuggestion={goToBooking}
    />
  );
}
