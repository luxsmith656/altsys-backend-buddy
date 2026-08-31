import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/integrations/supabase/client';
import { hasMDRRMOConsent, MDRRMO_CONSENT_TEXT, MDRRMO_CONSENT_VERSION, type MDRRMOBookingRecord } from '@/lib/mdrrmo';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Map, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';

type ConsentProfile = { mdrrmo_consent_at?: string | null; mdrrmo_consent_version?: string | null };

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

export default function MDRRMODashboard() {
  const { user } = useAuth();
  const { locations } = useLocations();
  const [profile, setProfile] = useState<ConsentProfile | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<MDRRMOBookingRecord[]>([]);
  const [date, setDate] = useState(manilaToday);
  const [locationId, setLocationId] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'directory' | 'map'>('directory');

  const consentAccepted = hasMDRRMOConsent(profile);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data, error: profileError } = await supabase
      .from('profiles' as any)
      .select('mdrrmo_consent_at,mdrrmo_consent_version')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) {
      setError(profileError.message);
      return;
    }
    setProfile((data as ConsentProfile | null) ?? {});
  }, [user]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const acceptConsent = async () => {
    if (!user || !consentChecked) return;
    setConsentLoading(true);
    const acceptedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles' as any)
      .update({ mdrrmo_consent_at: acceptedAt, mdrrmo_consent_version: MDRRMO_CONSENT_VERSION })
      .eq('user_id', user.id);
    if (updateError) {
      toast.error(`Unable to save agreement: ${updateError.message}`);
    } else {
      setProfile({ mdrrmo_consent_at: acceptedAt, mdrrmo_consent_version: MDRRMO_CONSENT_VERSION });
      setConsentChecked(false);
      await supabase.from('mdrrmo_access_logs' as any).insert({
        mdrrmo_user_id: user.id,
        access_type: 'consent_accepted',
        accessed_at: acceptedAt,
      });
      toast.success('Emergency access agreement accepted.');
    }
    setConsentLoading(false);
  };

  const loadDirectory = useCallback(async () => {
    if (!user || !consentAccepted) return;
    setLoading(true);
    setError(null);
    const { data, error: directoryError } = await supabase.rpc('mdrrmo_daily_booking_directory' as any, {
      p_date: date,
      p_location_id: locationId === 'all' ? null : locationId,
    });
    if (directoryError) {
      setError(directoryError.message);
      setRecords([]);
      setLoading(false);
      return;
    }
    const safeRecords = ((data as unknown as MDRRMOBookingRecord[] | null) ?? []);
    setRecords(safeRecords);
    void supabase.rpc('mdrrmo_log_access' as any, {
      p_booking_ids: safeRecords.map((record) => record.bookingId),
      p_location_id: locationId === 'all' ? null : locationId,
    });
    setLoading(false);
  }, [consentAccepted, date, locationId, user]);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => JSON.stringify(record).toLowerCase().includes(query));
  }, [records, search]);

  const getPeople = (record: MDRRMOBookingRecord) => record.people?.length ? record.people : [{ name: record.leadName, age: record.age, sex: record.sex, medicalNotes: record.medicalNotes }];

  const totalPeople = useMemo(
    () => visibleRecords.reduce((total, record) => total + Math.max(record.groupSize, getPeople(record).length), 0),
    [visibleRecords],
  );

  if (!consentAccepted) {
    return (
      <main className="min-h-screen px-4 pb-12 pt-24">
        <div className="mx-auto max-w-xl">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> MDRRMO emergency access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm leading-6 text-muted-foreground">{MDRRMO_CONSENT_TEXT}</p>
              {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <label className="flex items-start gap-3 rounded-md border border-border/50 p-3 text-sm">
                <Checkbox checked={consentChecked} onCheckedChange={(checked) => setConsentChecked(checked === true)} />
                <span>I understand and agree to use this information only for emergency response and safety operations.</span>
              </label>
              <Button className="w-full" disabled={!consentChecked || consentLoading} onClick={acceptConsent}>
                {consentLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept and continue
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 pb-24 pt-20 sm:px-4 sm:pt-24">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">MDRRMO <span className="text-gradient">Emergency View</span></h1>
            <p className="text-sm text-muted-foreground">Limited booking directory and active-location monitoring.</p>
          </div>
          <Badge variant="outline" className="w-fit gap-1.5 border-primary/30 text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Emergency use only</Badge>
        </header>

        <Card className="glass-card">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end">
            <div className="space-y-1.5"><Label htmlFor="mdrrmo-date">Date</Label><Input id="mdrrmo-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="mdrrmo-location">Location</Label><select id="mdrrmo-location" value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="mdrrmo-search">Search</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="mdrrmo-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, contact, medical note" /></div></div>
            <Button variant="outline" className="gap-2" onClick={() => void loadDirectory()} disabled={loading}><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</Button>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Badge variant="secondary" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {totalPeople} people</Badge><Badge variant="secondary">{visibleRecords.length} teams</Badge></div>
          <div className="flex rounded-md border border-border/50 p-1"><Button size="sm" variant={view === 'directory' ? 'secondary' : 'ghost'} onClick={() => setView('directory')}>Directory</Button><Button size="sm" variant={view === 'map' ? 'secondary' : 'ghost'} className="gap-1.5" onClick={() => setView('map')}><Map className="h-3.5 w-3.5" /> Live map</Button></div>
        </div>

        {view === 'map' ? (
          <div className="h-[calc(100dvh-16rem)] min-h-[30rem] overflow-hidden rounded-lg border border-border/30"><RealtimeMonitorMap locationId={null} canAddCheckpoints={false} /></div>
        ) : loading ? (
          <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading emergency directory</div>
        ) : error ? (
          <Card className="border-destructive/30"><CardContent className="p-5 text-sm text-destructive">Unable to load the emergency directory: {error}</CardContent></Card>
        ) : visibleRecords.length === 0 ? (
          <Card className="glass-card"><CardContent className="p-8 text-center text-muted-foreground">No bookings match this date and filter.</CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">{visibleRecords.map((record) => <Card key={record.bookingId} className="glass-card"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{record.leadName || 'Unnamed team'}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{record.locationName} · {record.bookingDate}</p></div><Badge variant="outline">{record.groupSize} people</Badge></div><p className="text-sm text-muted-foreground">Contact: <span className="text-foreground">{record.contactNumber || 'Not provided'}</span></p></CardHeader><CardContent className="space-y-3"><div className="space-y-2">{getPeople(record).map((person, index) => <div key={`${record.bookingId}-${person.name}-${index}`} className="rounded-md border border-border/40 bg-background/30 p-3"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium"><span>{person.name || 'Unnamed person'}</span>{person.age != null && <span className="text-muted-foreground">Age {person.age}</span>}{person.sex && <span className="text-muted-foreground">{person.sex}</span>}</div>{person.medicalNotes && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Medical: {person.medicalNotes}</p>}</div>)}</div></CardContent></Card>)}</div>
        )}
      </div>
    </main>
  );
}
