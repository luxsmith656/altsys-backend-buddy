import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, Check, ExternalLink, Info, MessageCircle, Send, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKaliRoleLabel, type KaliInsight, type KaliRole } from '@/lib/kaliContext';
import KaliAvatar from './KaliAvatar';
import { QRCodeSVG } from 'qrcode.react';

interface KaliContextPanelProps {
  role: KaliRole;
  insights: KaliInsight[];
}

const severityRank = { high: 0, medium: 1, info: 2 } as const;

function InsightIcon({ severity }: { severity: KaliInsight['severity'] }) {
  if (severity === 'high') return <ShieldAlert className="h-3.5 w-3.5 shrink-0" />;
  if (severity === 'medium') return <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
  return <Info className="h-3.5 w-3.5 shrink-0" />;
}

function severityClasses(severity: KaliInsight['severity']) {
  if (severity === 'high') return 'border-destructive/35 bg-destructive/10 text-destructive';
  if (severity === 'medium') return 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-primary/25 bg-primary/10 text-primary';
}

function followUpPrompt(insight: KaliInsight): string {
  if (insight.kind === 'minor-review') return 'Why does this booking need a minor safety check, and what documents should we bring?';
  if (insight.kind === 'age-review') return 'Why does this age change need verification before check-in?';
  if (insight.kind === 'weather') return 'What weather precautions and start time do you recommend for my selected booking date?';
  if (insight.kind === 'group-guidance') return 'Why are two guides needed for this group?';
  if (insight.kind === 'hike-type') return 'What is the difference between a night hike and an overnight hike, and what should I bring?';
  return 'What should I prepare for my confirmed booking?';
}

function thinkingLabel(insight: KaliInsight): string {
  if (insight.kind === 'weather') return 'Weather check';
  if (insight.kind === 'minor-review' || insight.kind === 'age-review') return 'Booking check';
  if (insight.kind === 'group-guidance') return 'Group plan check';
  if (insight.kind === 'hike-type') return 'Hike type advice';
  return 'Kali Assistant';
}

export default function KaliContextPanel({ role, insights }: KaliContextPanelProps) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [dismissedInsightIds, setDismissedInsightIds] = useState<string[]>([]);
  const [adminMessageBookingId, setAdminMessageBookingId] = useState<string | null>(null);
  const previousInsightIds = useRef<string[]>([]);
  const sortedInsights = useMemo(
    () => [...insights].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [insights],
  );
  const visibleInsights = useMemo(
    () => sortedInsights.filter((item) => !dismissedInsightIds.includes(item.id)).slice(0, 2),
    [dismissedInsightIds, sortedInsights],
  );
  const insight = visibleInsights[0];
  const hasMinorRequirements = visibleInsights.some(
    (item) => item.kind === 'minor-review' && typeof document !== 'undefined' && Boolean(document.getElementById('minor-requirements')),
  );

  useEffect(() => {
    const nextIds = sortedInsights.map((item) => item.id);
    if (nextIds.length === 0) {
      setOpen(false);
      setDismissedInsightIds([]);
      previousInsightIds.current = [];
      return;
    }
    const hasNewInsight = nextIds.some((id) => !previousInsightIds.current.includes(id));
    setDismissedInsightIds((current) => current.filter((id) => nextIds.includes(id)));
    if (hasNewInsight) setOpen(true);
    previousInsightIds.current = nextIds;
  }, [sortedInsights]);

  useEffect(() => {
    const onBookingMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ bookingId?: string }>).detail;
      if (detail?.bookingId) {
        setAdminMessageBookingId(detail.bookingId);
        setOpen(true);
      }
    };
    window.addEventListener('booking-admin-message', onBookingMessage);
    return () => window.removeEventListener('booking-admin-message', onBookingMessage);
  }, []);

  if (!insight && !adminMessageBookingId) return null;

  const label = adminMessageBookingId ? 'Admin has a new booking message' : `${insight!.title}: ${insight!.message}`;
  const askKali = (prompt = insight ? followUpPrompt(insight) : 'I have a new booking message. Take me to the booking conversation.') => {
    setOpen(false);
    setReply('');
    window.dispatchEvent(
      new CustomEvent('open-global-ai-assistant', {
        detail: {
          prompt,
          guidance: visibleInsights.map(({ title, message }) => ({ title, message })),
        },
      })
    );
  };

  const openAdminMessage = () => {
    if (!adminMessageBookingId) return;
    window.dispatchEvent(new CustomEvent('open-booking-chat', { detail: { bookingId: adminMessageBookingId } }));
    setAdminMessageBookingId(null);
    setOpen(false);
  };

  const viewMinorRequirements = () => {
    const target = document.getElementById('minor-requirements');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const dismissCurrentInsights = () => {
    setDismissedInsightIds(sortedInsights.map((item) => item.id));
    setOpen(false);
  };

  const acknowledgeInsight = (id: string) => {
    setDismissedInsightIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+7rem)] z-[2050] flex justify-end px-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-0">
      {open && (
        <section
          aria-label="Kali context guidance"
          className="pointer-events-auto absolute bottom-14 right-0 w-[min(19rem,calc(100vw-1.5rem))] transform-gpu overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-xl backdrop-blur-md sm:bottom-14"
        >
          {/* Notification-style Compact Header */}
          <header className="flex items-center gap-2 border-b border-border/30 bg-muted/30 px-3 py-1.5">
            <KaliAvatar
              expression={adminMessageBookingId ? 'alert' : reply ? 'listening' : insight!.expression}
              activity={reply ? 'listening' : 'speaking'}
              size="sm"
              className="h-6 w-6"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-foreground truncate">{adminMessageBookingId ? 'New booking message' : thinkingLabel(insight!)}</span>
                <span className="text-[9px] px-1 rounded bg-primary/10 text-primary font-medium">{getKaliRoleLabel(role)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissCurrentInsights}
              aria-label="Dismiss Kali reminder"
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          {/* Compact Notification Body */}
          <div className="max-h-[22rem] space-y-2 overscroll-contain overflow-y-auto p-2.5 text-xs">
            {adminMessageBookingId && (
              <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2 text-primary">
                <BellRing className="h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold leading-tight">Admin has a message about your booking</p>
                  <p className="mt-0.5 text-xs leading-normal text-foreground">Open the booking conversation to read it. Kali will take you there without sending an AI request.</p>
                  <button type="button" onClick={openAdminMessage} className="mt-2 rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">Open message</button>
                </div>
              </div>
            )}
            {visibleInsights.map((item) => (
              <div key={item.id} className={cn('flex items-start gap-2 rounded-xl border p-2', severityClasses(item.severity))}>
                <InsightIcon severity={item.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold leading-tight">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-normal text-foreground">{item.message}</p>

                  {item.kind === 'booking-reminder' && Number(item.meta.daysUntil) === 0 && typeof item.meta.qrCode === 'string' && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-background/80 p-2">
                      <div className="rounded bg-white p-1">
                        <QRCodeSVG value={item.meta.qrCode} size={64} level="M" />
                      </div>
                      <p className="text-[10px] font-semibold leading-snug text-foreground">
                        Present this QR at the jump-off staff desk.
                      </p>
                    </div>
                  )}

                  {item.kind === 'weather' && (
                    <div className="mt-1.5 space-y-1 pt-1.5 border-t border-border/30">
                      <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium">
                        <span className="inline-flex items-center gap-0.5 rounded bg-background/80 px-1.5 py-0.5 border border-border/40 text-foreground">
                          🌧️ {Number(item.meta.rainProbability ?? 0)}% Rain
                        </span>
                        {item.meta.minTempC !== undefined && item.meta.maxTempC !== undefined && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-background/80 px-1.5 py-0.5 border border-border/40 text-foreground">
                            🌡️ {Math.round(Number(item.meta.minTempC))}°–{Math.round(Number(item.meta.maxTempC))}°C
                          </span>
                        )}
                        {Boolean(Number(item.meta.precipitationMm ?? 0) > 0) && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-background/80 px-1.5 py-0.5 border border-border/40 text-sky-600 dark:text-sky-400">
                            💧 {item.meta.precipitationMm} mm
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>Forecast Source:</span>
                        <a
                          href={String(item.meta?.sourceUrl || 'https://open-meteo.com/')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          <span className="truncate max-w-[130px]">{String(item.meta?.sourceName || 'Open-Meteo (Mt. Kalisungan coordinates)')}</span>
                          <ExternalLink className="h-2 w-2" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => acknowledgeInsight(item.id)}
                  aria-label={`Acknowledge ${item.title}`}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded border border-current/25 px-1.5 py-0.5 text-[9px] font-bold uppercase transition-colors hover:bg-background/50"
                >
                  <Check className="h-2.5 w-2.5" /> OK
                </button>
              </div>
            ))}

            {hasMinorRequirements && (
              <a
                href="#minor-requirements"
                onClick={viewMinorRequirements}
                aria-label="View minor requirements"
                className="block w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-center text-[11px] font-bold text-amber-700 underline decoration-amber-500/60 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                View required documents
              </a>
            )}

            {/* Quick Action Button */}
            <button
              type="button"
              onClick={() => askKali()}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Ask Kali in chat
            </button>

            {/* Compact Reply Form */}
            <form
              className="flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (reply.trim()) askKali(reply.trim());
              }}
            >
              <input
                aria-label="Reply to Kali reminder"
                placeholder="Ask Kali about this..."
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                disabled={!reply.trim()}
                aria-label="Send reply to Kali"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Floating Kali trigger button */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Toggle Kali guidance' : 'Open Kali guidance'}
        aria-expanded={open}
        title={label}
        className={cn(
          'pointer-events-auto relative grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-full border-2 border-primary-foreground/20 bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-95',
          open && 'ring-2 ring-primary/30',
        )}
      >
        <KaliAvatar
          expression={insight.expression}
          size="sm"
          className="h-9 w-9 sm:h-11 sm:w-11 rounded-full border border-primary-foreground/40 bg-primary/80"
        />
      </button>
    </div>
  );
}
