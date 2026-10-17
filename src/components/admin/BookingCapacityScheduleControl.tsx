import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import {
  SCHEDULE_KINDS,
  defaultCapacityControl,
  draftFromServer,
  generateScheduleSlots,
  normalizeScheduleDraft,
  parseTimeMinutes,
  toCapacityControlPayload,
  type BookingScheduleDraft,
  type CapacityControlDraft,
  type ScheduleKind,
} from '@/lib/bookingControl';

type AvailabilityRow = {
  booking_date: string;
  hike_type: string;
  hike_time: string;
  location_id: string | null;
  group_count: number;
  people_count: number;
  max_groups: number;
  max_people: number;
  available_groups: number;
  available_people: number;
  using_trailheads: string[];
};

type AuditRow = {
  id: string;
  created_at: string;
  changed_by: string | null;
  old_config: Record<string, any>;
  new_config: Record<string, any>;
};

type Impact = { flaggedCount: number; removedStartTimes: number; error?: string };

const DATA_LOAD_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = DATA_LOAD_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

const dateToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const scheduleKindLabels: Record<ScheduleKind, string> = {
  morning: 'Morning hike',
  night: 'Night hike',
  overnight: 'Overnight hike',
};

function scheduleText(schedule: BookingScheduleDraft, kind: ScheduleKind) {
  return schedule.slots[kind].join(', ');
}

function parseCustomSlots(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function previewSlots(schedule: BookingScheduleDraft, kind: ScheduleKind) {
  try {
    return schedule.mode === 'interval'
      ? generateScheduleSlots(schedule.windows, schedule.intervalMinutes)[kind]
      : schedule.slots[kind];
  } catch {
    return [];
  }
}

function validateSchedule(schedule: BookingScheduleDraft) {
  if (schedule.mode === 'interval') {
    generateScheduleSlots(schedule.windows, schedule.intervalMinutes);
    return;
  }
  SCHEDULE_KINDS.forEach((kind) => {
    if (!schedule.slots[kind].length || schedule.slots[kind].some((slot) => parseTimeMinutes(slot) === null)) {
      throw new Error(`Enter valid ${scheduleKindLabels[kind].toLowerCase()} times.`);
    }
  });
}

function validateDraft(draft: CapacityControlDraft) {
  if (!Number.isInteger(draft.sharedMaxGroups) || draft.sharedMaxGroups < 1 || draft.sharedMaxGroups > 50) return 'Groups allowed per start time must be between 1 and 50.';
  if (!Number.isInteger(draft.maxPeoplePerGroup) || draft.maxPeoplePerGroup < 1 || draft.maxPeoplePerGroup > 500) return 'Maximum hiker per group must be between 1 and 500.';
  if (draft.maxPeoplePerSlot !== null && (!Number.isInteger(draft.maxPeoplePerSlot) || draft.maxPeoplePerSlot < 1 || draft.maxPeoplePerSlot > 5000)) return 'An existing per-start-time hiker limit is invalid. Ask Central Admin to review the server setting.';
  validateSchedule(draft.schedule);
  draft.scheduleOverrides.forEach((row) => validateSchedule(row.schedule));
}

function describeChange(draft: CapacityControlDraft) {
  const hikers = draft.sharedMaxGroups * draft.maxPeoplePerGroup;
  const scope = draft.mode === 'shared' ? 'all trailheads share the limit' : 'each trailhead has its own limit';
  return `${draft.sharedMaxGroups} groups per start time, ${scope}, and up to ${draft.maxPeoplePerGroup} hikers per group (${hikers} hikers at once).`;
}

function formatAuditDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Stepper({ label, value, min, max, readOnly, onChange }: { label: string; value: number; min: number; max: number; readOnly: boolean; onChange: (value: number) => void }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/15 p-4">
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        <Input
          aria-label={label}
          className="h-11 w-28 text-center text-lg font-bold tabular-nums"
          type="number"
          min={min}
          max={max}
          step="1"
          value={value}
          disabled={readOnly}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, Math.trunc(parsed))));
          }}
        />
        <span className="text-xs text-muted-foreground">per start time</span>
      </div>
    </div>
  );
}

export default function BookingCapacityScheduleControl({ readOnly: requestedReadOnly = false }: { readOnly?: boolean }) {
  const { role } = useAuth();
  const { locations } = useLocations();
  const trailheads = useMemo(() => (locations ?? []).filter((location) => location.status === 'active'), [locations]);
  const locationIds = useMemo(() => trailheads.map((location) => location.id), [trailheads]);
  const readOnly = requestedReadOnly || Boolean(role && role !== 'super_admin');
  const [draft, setDraft] = useState<CapacityControlDraft>(() => defaultCapacityControl());
  const [savedDraft, setSavedDraft] = useState<CapacityControlDraft>(() => defaultCapacityControl());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState(dateToday);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customizingLocation, setCustomizingLocation] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<CapacityControlDraft | null>(null);
  const [reviewImpact, setReviewImpact] = useState<Impact | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditNames, setAuditNames] = useState<Record<string, string>>({});
  const [showAllHistory, setShowAllHistory] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedDraft), [draft, savedDraft]);
  const derivedHikers = draft.sharedMaxGroups * draft.maxPeoplePerGroup;

  useEffect(() => {
    const withLocations = (current: CapacityControlDraft) => ({
      ...current,
      perTrailhead: locationIds.map((locationId) => current.perTrailhead.find((row) => row.locationId === locationId) ?? { locationId, maxGroups: current.sharedMaxGroups }),
    });
    setDraft(withLocations);
    setSavedDraft(withLocations);
  }, [locationIds]);

  const loadHistory = useCallback(async () => {
    // SupabaseClient.from uses its client context internally (this.rest).
    // Keep that context when the helper is passed around below.
    const from = (supabase as any).from.bind(supabase);
    if (typeof from !== 'function') return;
    try {
      let query = from('booking_capacity_audit').select('id,created_at,changed_by,old_config,new_config');
      if (typeof query.order === 'function') query = query.order('created_at', { ascending: false });
      if (typeof query.limit === 'function') query = query.limit(showAllHistory ? 50 : 10);
      const { data, error } = await query;
      if (error || !data) return;
      const rows = data as AuditRow[];
      setAuditRows(rows);
      const ids = [...new Set(rows.map((row) => row.changed_by).filter(Boolean))];
      if (!ids.length) return;
      const profiles = await from('profiles').select('user_id,full_name').in('user_id', ids);
      if (!profiles.error && profiles.data) setAuditNames(Object.fromEntries(profiles.data.map((profile: any) => [profile.user_id, profile.full_name || 'Central administrator'])));
    } catch {
      // History is supplementary; the editor remains usable if it is unavailable.
    }
  }, [showAllHistory]);

  useEffect(() => {
    let active = true;
    const rpc = (supabase as any).rpc.bind(supabase);
    if (typeof rpc !== 'function') {
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(rpc('get_booking_capacity_control')),
          'Capacity settings took too long to load. Showing local defaults instead.',
        );
        if (!active) return;
        if (error) {
          toast.error(error.message || 'Could not load capacity settings. Showing local defaults.');
        } else if (data) {
          const next = draftFromServer(data, locationIds);
          setDraft(next);
          setSavedDraft(next);
        }
      } catch (error: any) {
        if (active) toast.error(error?.message || 'Could not load capacity settings. Showing local defaults.');
      } finally {
        if (active) {
          setLoading(false);
          void loadHistory();
        }
      }
    })();
    return () => { active = false; };
  }, [locationIds, loadHistory]);

  const loadAvailability = useCallback(async () => {
    const rpc = (supabase as any).rpc.bind(supabase);
    if (typeof rpc !== 'function') return;
    setAvailabilityLoading(true);
    try {
      const locationsToRead = draft.mode === 'per_trailhead' && trailheads.length ? trailheads : [null];
      const results = await withTimeout(
        Promise.all(locationsToRead.map((location) => rpc('get_booking_slot_availability', { p_start_date: availabilityDate, p_end_date: availabilityDate, p_location_id: location?.id ?? null }))),
        'Schedule data took too long to load.',
      );
      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;
      setAvailability(results.flatMap((result) => (result.data ?? []) as AvailabilityRow[]));
    } catch (error: any) {
      setAvailability([]);
      toast.error(error?.message || 'Could not load automatic availability.');
    } finally {
      setAvailabilityLoading(false);
    }
  }, [availabilityDate, draft.mode, trailheads]);

  useEffect(() => {
    if (!loading) void loadAvailability();
  }, [availabilityDate, draft.mode, loading, loadAvailability]);

  const updateSchedule = (update: Partial<BookingScheduleDraft>) => setDraft((current) => ({ ...current, schedule: { ...current.schedule, ...update } }));
  const setScheduleWindow = (kind: ScheduleKind, key: 'start' | 'end', value: string) => setDraft((current) => ({ ...current, schedule: { ...current.schedule, windows: { ...current.schedule.windows, [kind]: { ...current.schedule.windows[kind], [key]: value } } } }));
  const setTrailheadScheduleWindow = (locationId: string, kind: ScheduleKind, key: 'start' | 'end', value: string) => setDraft((current) => ({
    ...current,
    scheduleOverrides: current.scheduleOverrides.map((row) => row.locationId === locationId
      ? { ...row, schedule: { ...row.schedule, mode: 'interval', windows: { ...row.schedule.windows, [kind]: { ...row.schedule.windows[kind], [key]: value } } } }
      : row),
  }));
  const setCustomSlots = (kind: ScheduleKind, value: string) => setDraft((current) => ({ ...current, schedule: { ...current.schedule, slots: { ...current.schedule.slots, [kind]: parseCustomSlots(value) } } }));

  const estimateImpact = async (next: CapacityControlDraft): Promise<Impact> => {
    const from = (supabase as any).from.bind(supabase);
    if (typeof from !== 'function') return { flaggedCount: 0, removedStartTimes: 0, error: 'The server will calculate the final impact when you save.' };
    try {
      const result = await from('bookings').select('booking_date,requested_new_date,status,group_size,location_id,notes');
      if (result.error) throw result.error;
      const holds = new Set(['confirmed', 'accepted', 'active', 'adjustment_pending']);
      if (next.holdPending) holds.add('pending');
      const schedules = (locationId: string | null) => next.scheduleOverrides.find((row) => row.locationId === locationId)?.schedule ?? next.schedule;
      const counts = new Map<string, { groups: number; people: number }>();
      let removedStartTimes = 0;
      let flaggedCount = 0;
      for (const booking of result.data ?? []) {
        if (!holds.has(booking.status)) continue;
        let meta: Record<string, any> = {};
        try { meta = typeof booking.notes === 'string' ? JSON.parse(booking.notes) : booking.notes ?? {}; } catch { meta = {}; }
        const date = booking.status === 'adjustment_pending' && booking.requested_new_date ? booking.requested_new_date : booking.booking_date;
        const time = String(meta.adjustedTime || meta.hikeTime || '').toUpperCase();
        const kind = String(meta.hikeType || 'morning').toLowerCase() as ScheduleKind;
        const published = previewSlots(schedules(booking.location_id), kind);
        if (!published.includes(time)) { removedStartTimes += 1; flaggedCount += 1; continue; }
        const key = `${date}|${time}|${next.mode === 'shared' ? 'shared' : booking.location_id}`;
        const current = counts.get(key) ?? { groups: 0, people: 0 };
        current.groups += 1;
        current.people += Number(booking.group_size) || 0;
        counts.set(key, current);
        const groupLimit = next.mode === 'shared' ? next.sharedMaxGroups : (next.perTrailhead.find((row) => row.locationId === booking.location_id)?.maxGroups ?? next.sharedMaxGroups);
        if ((Number(booking.group_size) || 0) > next.maxPeoplePerGroup || current.groups > groupLimit || (next.maxPeoplePerSlot !== null && current.people > next.maxPeoplePerSlot)) flaggedCount += 1;
      }
      return { flaggedCount, removedStartTimes };
    } catch {
      return { flaggedCount: 0, removedStartTimes: 0, error: 'The server will calculate the final impact when you save.' };
    }
  };

  const openReview = async (nextDraft = draft) => {
    let next = nextDraft;
    try {
      if (next.schedule.mode === 'interval') next = { ...next, schedule: { ...next.schedule, slots: generateScheduleSlots(next.schedule.windows, next.schedule.intervalMinutes) } };
      validateDraft(next);
    } catch (error: any) {
      toast.error(error?.message || 'Check the capacity and schedule values.');
      return;
    }
    setReviewDraft(next);
    setReviewImpact(null);
    setShowReview(true);
    setReviewImpact(await estimateImpact(next));
  };

  const save = async () => {
    if (!reviewDraft || readOnly) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('save_booking_capacity_control', { p_payload: toCapacityControlPayload(reviewDraft) });
      if (error) throw error;
      setDraft(reviewDraft);
      setSavedDraft(reviewDraft);
      setShowReview(false);
      setReviewDraft(null);
      await loadHistory();
      await loadAvailability();
      toast.success(data?.changed === false ? 'No changes to save.' : `Capacity and schedule saved. ${data?.flaggedBookingCount ?? reviewImpact?.flaggedCount ?? 0} existing booking(s) flagged for review.`);
    } catch (error: any) {
      toast.error(error?.message || 'Could not save capacity and schedule.');
    } finally {
      setSaving(false);
    }
  };

  const resetToRecommended = () => {
    const recommended = defaultCapacityControl(locationIds);
    setDraft((current) => ({ ...recommended, maxPeoplePerSlot: current.maxPeoplePerSlot }));
  };

  const toggleTrailheadCustomize = (locationId: string) => {
    const existing = draft.scheduleOverrides.find((row) => row.locationId === locationId);
    if (existing) {
      setDraft((current) => ({ ...current, scheduleOverrides: current.scheduleOverrides.filter((row) => row.locationId !== locationId) }));
      setCustomizingLocation(null);
      return;
    }
    setDraft((current) => ({ ...current, scheduleOverrides: [...current.scheduleOverrides, { locationId, schedule: normalizeScheduleDraft(current.schedule) }] }));
    setCustomizingLocation(locationId);
  };

  if (loading) return <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading capacity and schedule controls...</CardContent></Card>;

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Booking Capacity &amp; Hike Schedule</CardTitle><CardDescription className="text-sm leading-6">Set how many groups can start together and when hikes can begin. The booking page uses these same published settings.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 md:grid-cols-2" aria-label="Capacity mode">{(['shared', 'per_trailhead'] as const).map((mode) => <button key={mode} type="button" disabled={readOnly} aria-pressed={draft.mode === mode} onClick={() => setDraft((current) => ({ ...current, mode }))} className={`min-h-20 rounded-xl border p-4 text-left transition ${draft.mode === mode ? 'border-primary bg-primary/10 shadow-sm' : 'border-border/50 hover:border-primary/50'} disabled:cursor-default disabled:opacity-80`}><p className="text-sm font-semibold">{mode === 'shared' ? 'Shared pool' : 'Separate trailhead pools'}</p><p className="mt-1 text-xs text-muted-foreground">{mode === 'shared' ? 'All three trailheads use one automatic limit.' : 'Each trailhead uses its own automatic limit.'}</p></button>)}</section>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Main capacity settings"><Stepper label="Groups allowed per start time" value={draft.sharedMaxGroups} min={1} max={50} readOnly={readOnly} onChange={(value) => setDraft((current) => ({ ...current, sharedMaxGroups: value }))} /><Stepper label="Maximum hiker per group" value={draft.maxPeoplePerGroup} min={1} max={500} readOnly={readOnly} onChange={(value) => setDraft((current) => ({ ...current, maxPeoplePerGroup: value }))} /></section>
        <p className="-mt-3 text-sm font-medium text-primary">Capacity per start: {derivedHikers} hikers.</p>

        <section className="space-y-4 rounded-xl border border-border/50 p-4" aria-label="Published start times"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-semibold"><Clock3 className="h-4 w-4 text-primary" /> Start times</h3><p className="mt-1 text-sm text-muted-foreground">These are the real hike types used by booking: morning, night, and overnight.</p></div><div className="grid min-w-[260px] grid-cols-2 rounded-lg border border-border/50 p-1"><Button type="button" size="sm" variant={draft.schedule.mode === 'interval' ? 'default' : 'ghost'} disabled={readOnly} onClick={() => updateSchedule({ mode: 'interval' })}>Repeat automatically</Button><Button type="button" size="sm" variant={draft.schedule.mode === 'custom' ? 'default' : 'ghost'} disabled={readOnly} onClick={() => updateSchedule({ mode: 'custom' })}>Pick exact times</Button></div></div>
          {draft.schedule.mode === 'interval' ? <><div className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/20 p-3"><Input className="h-11 w-24" aria-label="Start time interval in minutes" type="number" min="15" max="180" step="15" value={draft.schedule.intervalMinutes} disabled={readOnly} onChange={(event) => updateSchedule({ intervalMinutes: Number(event.target.value) || 60 })} /><span className="text-sm">minute interval. Choose the start and end for each hike type below.</span></div><div className="grid gap-3 md:grid-cols-3">{SCHEDULE_KINDS.map((kind) => <div key={kind} className="rounded-lg border border-border/40 bg-secondary/15 p-3"><p className="text-sm font-semibold">{scheduleKindLabels[kind]}</p><div className="mt-2 grid grid-cols-2 gap-2"><Input aria-label={`${kind} start`} value={draft.schedule.windows[kind].start} disabled={readOnly} onChange={(event) => setScheduleWindow(kind, 'start', event.target.value)} /><Input aria-label={`${kind} end`} value={draft.schedule.windows[kind].end} disabled={readOnly} onChange={(event) => setScheduleWindow(kind, 'end', event.target.value)} /></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{previewSlots(draft.schedule, kind).length} start times: {previewSlots(draft.schedule, kind).join(', ') || 'Enter a valid start and end time.'}</p></div>)}</div></> : <div className="grid gap-3 md:grid-cols-3">{SCHEDULE_KINDS.map((kind) => <label key={kind} className="space-y-2 text-sm font-semibold"><span>{scheduleKindLabels[kind]}</span><Input value={scheduleText(draft.schedule, kind)} disabled={readOnly} onChange={(event) => setCustomSlots(kind, event.target.value)} placeholder="06:00 AM, 08:00 AM" /><span className="block text-xs font-normal leading-5 text-muted-foreground">Enter exact 12-hour times separated by commas.</span></label>)}</div>}
        </section>

        <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-xl border border-border/50">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
            <span>Advanced: trailhead start and end times</span>
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </summary>
          <div className="space-y-4 border-t border-border/40 p-4">
            <p className="text-xs text-muted-foreground">Customize the published time window for a trailhead. Capacity follows the selected pool automatically.</p>
            <div className="grid gap-3 md:grid-cols-3">
              {trailheads.map((location) => {
                const override = draft.scheduleOverrides.find((row) => row.locationId === location.id);
                const schedule = override?.schedule ?? draft.schedule;
                const isCustom = Boolean(override);
                return (
                  <div key={location.id} className="rounded-lg border border-border/40 bg-secondary/15 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{location.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{isCustom ? 'Custom time window' : 'Uses shared times'}</p>
                      </div>
                      <Badge variant={isCustom ? 'default' : 'outline'}>{isCustom ? 'Custom' : 'Shared'}</Badge>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11 w-full" disabled={readOnly} onClick={() => toggleTrailheadCustomize(location.id)}>{isCustom ? 'Use shared times' : 'Customize times'}</Button>
                    {isCustom && customizingLocation === location.id && <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                      {SCHEDULE_KINDS.map((kind) => <div key={kind} className="space-y-1"><p className="text-xs font-semibold">{scheduleKindLabels[kind]}</p><div className="grid grid-cols-2 gap-2"><Input aria-label={`${location.name} ${kind} start`} value={schedule.windows[kind].start} disabled={readOnly} onChange={(event) => setTrailheadScheduleWindow(location.id, kind, 'start', event.target.value)} /><Input aria-label={`${location.name} ${kind} end`} value={schedule.windows[kind].end} disabled={readOnly} onChange={(event) => setTrailheadScheduleWindow(location.id, kind, 'end', event.target.value)} /></div></div>)}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        </details>

        <section className="space-y-3 rounded-xl border border-border/50 p-4" aria-label="Published schedule calendar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarCheck className="h-4 w-4 text-primary" /> Calendar preview</h3>
              <p className="mt-1 text-xs text-muted-foreground">Review each trailhead's date, start/end windows, capacity, and the shared fare board before publishing.</p>
            </div>
            <Input className="h-11 w-44" type="date" value={availabilityDate} onChange={(event) => setAvailabilityDate(event.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {trailheads.map((location) => {
              const override = draft.scheduleOverrides.find((row) => row.locationId === location.id);
              const schedule = override?.schedule ?? draft.schedule;
              const rows = availability.filter((row) => row.location_id === location.id || (draft.mode === 'shared' && row.location_id === null));
              const groupLimit = draft.mode === 'shared' ? draft.sharedMaxGroups : (draft.perTrailhead.find((row) => row.locationId === location.id)?.maxGroups ?? draft.sharedMaxGroups);
              return <div key={location.id} className="rounded-lg border border-border/40 bg-secondary/15 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{location.name}</p><Badge variant="outline">{groupLimit} groups</Badge></div><p className="mt-1 text-xs text-muted-foreground">{derivedHikers} hikers per start · shared official fares</p><div className="mt-3 space-y-2">{SCHEDULE_KINDS.map((kind) => <div key={kind} className="flex items-center justify-between gap-2 text-xs"><span className="font-medium">{scheduleKindLabels[kind]}</span><span className="text-right text-muted-foreground">{schedule.windows[kind].start}–{schedule.windows[kind].end}</span></div>)}</div>{availabilityLoading ? <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading date…</p> : rows.length > 0 && <p className="mt-3 border-t border-border/30 pt-2 text-xs text-muted-foreground">{rows.reduce((sum, row) => sum + (Number(row.group_count) || 0), 0)} groups booked on {availabilityDate}.</p>}</div>;
            })}
          </div>
          <p className="text-xs text-muted-foreground">Official fares are maintained once in the fare board above and apply to all trailheads.</p>
        </section>

        {dirty && !readOnly && <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-xl border border-primary/40 bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">You have unsaved changes.</p><div className="flex gap-2"><Button type="button" variant="ghost" className="min-h-11" onClick={() => setDraft(savedDraft)}>Discard</Button><Button type="button" className="min-h-11 gap-2" onClick={() => void openReview()}><Save className="h-4 w-4" /> Review &amp; save</Button></div></div>}

        <section className="space-y-3 rounded-xl border border-border/50 p-4" aria-label="Recent changes"><div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-semibold"><History className="h-4 w-4 text-primary" /> Recent changes</h3><p className="mt-1 text-sm text-muted-foreground">The latest saved capacity and schedule changes.</p></div>{auditRows.length > 0 && <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setShowAllHistory((current) => !current)}>{showAllHistory ? 'Show less' : 'Show more'}</Button>}</div>{auditRows.length === 0 ? <p className="text-sm text-muted-foreground">No saved changes recorded yet.</p> : <div className="space-y-2">{auditRows.map((row) => <div key={row.id} className="rounded-lg bg-secondary/15 p-3"><p className="text-sm font-medium">Central changed the settings to {describeChange(draftFromServer(row.new_config, locationIds))}</p><p className="mt-1 text-xs text-muted-foreground">{formatAuditDate(row.created_at)} · {row.changed_by ? (auditNames[row.changed_by] ?? 'Central administrator') : 'Central administrator'}</p></div>)}</div>}</section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/30 pt-4"><Button type="button" variant="outline" className="min-h-11 gap-2" disabled={readOnly || saving} onClick={resetToRecommended}><RotateCcw className="h-4 w-4" /> Reset to recommended</Button>{!dirty && <Button type="button" className="min-h-11 gap-2" disabled><Save className="h-4 w-4" /> Review &amp; save</Button>}</div>
        {readOnly && <p className="text-sm text-muted-foreground">Read-only view. Central Admin manages capacity and published start times.</p>}
      </CardContent>

      {showReview && reviewDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="capacity-review-title"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-border bg-background p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="capacity-review-title" className="text-lg font-bold">Review your changes</h2><p className="mt-1 text-sm text-muted-foreground">Existing bookings are never moved or cancelled.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Close review" onClick={() => setShowReview(false)}>×</Button></div><div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border/40 p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Before</p><p className="mt-2 text-sm leading-6">{describeChange(savedDraft)}</p></div><div className="rounded-xl border border-primary/40 bg-primary/10 p-4"><p className="text-xs font-semibold uppercase text-primary">After</p><p className="mt-2 text-sm leading-6">{describeChange(reviewDraft)}</p></div></div><div className="mt-4 rounded-xl bg-secondary/20 p-4"><p className="text-sm font-semibold">Why this matters</p><p className="mt-1 text-sm leading-6 text-muted-foreground">The booking page will only offer the published start times. Existing confirmed bookings that no longer fit will stay in place and be flagged for staff review.</p>{reviewImpact ? <p className="mt-3 text-sm font-medium">Estimated impact: {reviewImpact.flaggedCount} existing booking(s) may be flagged{reviewImpact.removedStartTimes ? `, including ${reviewImpact.removedStartTimes} on a removed start time` : ''}.</p> : <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking existing bookings...</p>}{reviewImpact?.error && <p className="mt-2 text-xs text-muted-foreground">{reviewImpact.error}</p>}</div><p className="mt-4 text-sm text-muted-foreground">All local administrators and guides will receive one plain-language notification after saving.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={() => setShowReview(false)}>Keep editing</Button><Button type="button" className="min-h-11" disabled={saving || !reviewImpact} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm and save</Button></div></div></div>}
    </Card>
  );
}
