import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import type { HikeTracker } from '@/lib/tracking/HikeTracker';

export default function LocationPingControl({ tracker }: { tracker: HikeTracker | null }) {
  const map = useMap();
  const container = useMemo(() => document.createElement('div'), []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const control = new L.Control({ position: 'bottomright' });
    control.onAdd = () => container;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    control.addTo(map);
    return () => { control.remove(); };
  }, [container, map]);

  const ping = async () => {
    if (!tracker || saving) return;
    setSaving(true);
    try {
      const result = await tracker.pingLocation();
      toast.success('Location sent to your trailhead admin.', {
        description: result.queued
          ? 'Saved offline. It will sync automatically when your connection returns.'
          : 'The active map now has your latest GPS fix.',
      });
    } catch (error) {
      toast.error('Could not send your location.', { description: error instanceof Error ? error.message : 'Check location permission and try again.' });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <button
      type="button"
      disabled={!tracker || saving}
      onClick={() => void ping()}
      aria-label="Send current location to admin"
      title="Send current location to admin"
      className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LocateFixed className="h-4 w-4" />
      {saving ? 'Sending…' : 'Ping location'}
    </button>,
    container,
  );
}
