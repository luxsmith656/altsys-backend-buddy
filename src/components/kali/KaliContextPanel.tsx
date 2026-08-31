import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, Info, MessageCircle, ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKaliRoleLabel, type KaliInsight, type KaliRole } from '@/lib/kaliContext';
import KaliAvatar from './KaliAvatar';

interface KaliContextPanelProps {
  role: KaliRole;
  insights: KaliInsight[];
}

const severityRank = { high: 0, medium: 1, info: 2 } as const;

function InsightIcon({ severity }: { severity: KaliInsight['severity'] }) {
  if (severity === 'high') return <ShieldAlert className="h-4 w-4" />;
  if (severity === 'medium') return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
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
  return 'What should I prepare for my confirmed booking?';
}

export default function KaliContextPanel({ role, insights }: KaliContextPanelProps) {
  const [open, setOpen] = useState(false);
  const previousInsightIds = useRef<string[]>([]);
  const sortedInsights = useMemo(
    () => [...insights].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [insights],
  );
  const insight = sortedInsights[0];

  useEffect(() => {
    const nextIds = sortedInsights.map((item) => item.id);
    if (!insight) {
      setOpen(false);
      previousInsightIds.current = [];
      return;
    }
    if (nextIds.some((id) => !previousInsightIds.current.includes(id))) setOpen(true);
    previousInsightIds.current = nextIds;
  }, [insight, sortedInsights]);

  // Kali is intentionally absent until there is actionable context to surface.
  if (!insight) return null;

  const label = `${insight.title}: ${insight.message}`;
  const askKali = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('open-global-ai-assistant', { detail: { prompt: followUpPrompt(insight) } }));
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+7rem)] z-[2050] flex justify-end px-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:p-0">
      {open && (
        <section
          aria-label="Kali context guidance"
          className="pointer-events-auto absolute bottom-16 right-0 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl sm:bottom-16"
        >
          <header className="flex items-center gap-3 border-b border-border/30 px-4 py-3">
            <KaliAvatar expression={insight?.expression ?? 'happy'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Kali guidance</p>
              <p className="truncate text-[11px] text-muted-foreground">For {getKaliRoleLabel(role)}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Kali guidance" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 p-4">
            <div className={cn('flex items-start gap-2 rounded-2xl border p-3', severityClasses(insight.severity))}>
              <InsightIcon severity={insight.severity} />
              <div className="min-w-0">
                <p className="text-xs font-bold">{insight.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{insight.message}</p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <BellRing className="h-3 w-3" /> Context checked just now. Confirm details with the responsible staff member when needed.
            </p>
            <button
              type="button"
              onClick={askKali}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <MessageCircle className="h-4 w-4" /> Ask Kali in chat
            </button>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Toggle Kali guidance' : 'Open Kali guidance'}
        aria-expanded={open}
        title={label}
        className={cn(
          'pointer-events-auto relative grid h-14 w-14 place-items-center rounded-full border-2 border-primary-foreground/20 bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-95',
          open && 'ring-2 ring-primary/30',
        )}
      >
        <KaliAvatar expression={insight.expression} size="sm" className="h-11 w-11 rounded-full border border-primary-foreground/40 bg-primary/80" />
      </button>
    </div>
  );
}
