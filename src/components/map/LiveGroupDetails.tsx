import type { ReactNode } from 'react';
import { Navigation } from 'lucide-react';
import { gpsPresentation, type LiveMapGroup } from '@/lib/liveMapPresentation';

export default function LiveGroupDetails({ group, now, onLocate, actions }: {
  group: LiveMapGroup;
  now: number;
  onLocate: () => void;
  actions?: ReactNode;
}) {
  const gps = gpsPresentation(group, now);
  return (
    <section className="live-map-details" role="region" aria-label="Selected group details">
      <div className="live-map-detail-heading">
        <h3>{group.lead}</h3>
        <button type="button" className="live-map-icon" aria-label="Locate selected group" title="Locate selected group"
          disabled={!gps.hasFix && !group.simulated} onClick={onLocate}><Navigation size={18} aria-hidden="true" /></button>
      </div>
      <dl>
        <div><dt>Lead</dt><dd>{group.lead}</dd></div>
        <div><dt>Guide</dt><dd>{group.guide || 'Not assigned'}</dd></div>
        <div><dt>Party</dt><dd>{group.pax == null ? 'Not recorded' : `${group.pax} pax`}</dd></div>
        <div><dt>Phase</dt><dd>{({ ascent: 'Ascent', peak: 'Peak', descent: 'Descent', completed: 'Completed' } as Record<string, string>)[group.phase ?? ''] ?? 'Not recorded'}</dd></div>
        {group.route && <div><dt>Route</dt><dd>{group.route}</dd></div>}
        <div><dt>{group.simulated ? 'Position' : 'Last GPS fix'}</dt><dd>{group.simulated ? 'Simulated, not live GPS' : gps.fixLabel}{!group.simulated && gps.ageLabel && <span className="live-map-muted live-map-block">{gps.ageLabel}</span>}</dd></div>
        {group.distanceKm != null && <div><dt>Recorded distance</dt><dd>{group.distanceKm.toFixed(2)} km</dd></div>}
        <div><dt>ETA</dt><dd>Unavailable<span className="live-map-muted live-map-block">No reliable route-relative pace</span></dd></div>
        {group.phone && <div><dt>Guide phone</dt><dd>{group.phone}</dd></div>}
        {group.emergencyContact && <div><dt>Emergency contact</dt><dd>{group.emergencyContact}</dd></div>}
        {group.medicalNotes && <div><dt>Medical notes</dt><dd>{group.medicalNotes}</dd></div>}
      </dl>
      <h4>Companions</h4>
      {group.companions.length ? <ul>{group.companions.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}</ul> : <p className="live-map-muted">None recorded</p>}
      {actions && <div className="live-map-actions">{actions}</div>}
    </section>
  );
}
