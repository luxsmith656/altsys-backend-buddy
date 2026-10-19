import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { enqueue } from '@/lib/offlineDb';
import { syncOnce } from '@/lib/tracking/syncEngine';

export default function StationReportControl({ sessionId, userId }: { sessionId: string; userId: string }) {
  const map = useMap();
  const container = useMemo(() => document.createElement('div'), []);
  const [station, setStation] = useState('1');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const control = new L.Control({ position: 'bottomright' });
    control.onAdd = () => container;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    control.addTo(map);
    return () => { control.remove(); };
  }, [container, map]);
  const report = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await enqueue({ kind: 'station', payload: {
        id: crypto.randomUUID(), session_id: sessionId, user_id: userId,
        station: Number(station), reported_at: new Date().toISOString(),
      } });
      toast.success(`${station === '6' ? 'Peak' : `Station ${station}`} report saved`, {
        description: 'Your report is stored on this device and will sync when connected.',
      });
      void syncOnce();
    } catch {
      toast.error('Could not save your station report. Please try again.');
    } finally { setSaving(false); }
  };
  return createPortal(<div className="flex w-[82px] max-w-[calc(100vw-24px)] flex-col items-stretch gap-1 rounded-md border bg-background p-1.5 text-foreground shadow-md">
    <select aria-label="Current station" className="min-h-12 w-full rounded border bg-background px-1 py-2 text-center text-xs" value={station} onChange={e => setStation(e.target.value)}>
      {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value === 6 ? 'Peak' : `Station ${value}`}</option>)}
    </select>
    <button type="button" disabled={saving} onClick={() => void report()} className="flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded bg-primary px-1 py-1 text-[10px] leading-tight text-primary-foreground disabled:opacity-50">
      <MapPin className="h-4 w-4" /><span>I'm here</span>
    </button>
  </div>, container);
}
