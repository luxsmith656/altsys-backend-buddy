export interface LiveMapGroup {
  id: string;
  lead: string;
  guide?: string;
  pax?: number;
  phase?: string;
  route?: string;
  lat?: number;
  lng?: number;
  timestamp?: string;
  distanceKm?: number;
  companions: string[];
  phone?: string;
  emergencyContact?: string;
  medicalNotes?: string;
  simulated?: boolean;
}

export function gpsPresentation(group: Pick<LiveMapGroup, 'lat' | 'lng' | 'timestamp'>, now: number) {
  const timestamp = group.timestamp ? Date.parse(group.timestamp) : NaN;
  const hasFix = typeof group.lat === 'number' && typeof group.lng === 'number'
    && Number.isFinite(group.lat) && Number.isFinite(group.lng)
    && Math.abs(group.lat) <= 90 && Math.abs(group.lng) <= 180 && Number.isFinite(timestamp);
  if (!hasFix) return { hasFix: false, fixLabel: 'Awaiting GPS', ageLabel: '', stale: false };
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const ageLabel = seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago`
    : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ago`;
  return {
    hasFix: true,
    fixLabel: `${new Date(timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} PHT`,
    ageLabel,
    stale: seconds >= 300,
  };
}
