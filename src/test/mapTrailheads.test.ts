import { describe, expect, it } from 'vitest';
import { filterByTrailhead, getTrailheadIdentity, officialPublicTrailName, officialTrailName, officialTrailNameFromLocation, trailheadLabel, trailheadLabelFromLocation } from '@/lib/mapTrailheads';

describe('central map trailhead identity and scope', () => {
  it.each([
    ['lamot-1', 'Sitio Lamot 1', { code: 'L1', label: 'Lamot 1' }],
    ['lamot-2', 'Sitio Lamot 2', { code: 'L2', label: 'Lamot 2' }],
    ['sto-tomas', 'Sto. Tomas', { code: 'ST', label: 'Sto. Tomas' }],
  ] as const)('identifies %s from station metadata', (slug, name, expected) => {
    expect(getTrailheadIdentity(slug, name)).toEqual(expected);
  });

  it('does not mislabel generic or unknown trailheads', () => {
    expect(getTrailheadIdentity('mt-kalisungan', 'Mount Kalisungan')).toBeNull();
  });

  it('uses the official jump-off labels for admin-facing route names', () => {
    expect(trailheadLabel('lamot-2', 'Sitio Lamot 2')).toBe('Lamot 2');
    expect(trailheadLabel('sto-tomas', 'Sto. Tomas')).toBe('Sto. Tomas');
    expect(trailheadLabel('unknown', 'Unmapped route', 'Official route')).toBe('Official route');
  });

  it('resolves walk-in routes from the authoritative location id', () => {
    expect(trailheadLabelFromLocation('loc-lamot-1', 'generic-route', 'Mount Kalisungan')).toBe('Lamot 1');
    expect(trailheadLabelFromLocation('loc-lamot-2', '', '')).toBe('Lamot 2');
    expect(trailheadLabelFromLocation('loc-sto-tomas', '', '')).toBe('Sto. Tomas');
  });

  it('normalizes every route to the three official public names', () => {
    expect(officialTrailNameFromLocation('loc-lamot-2', '', '', 'Summit Trail (Official Route)')).toBe('Lamot 2 Trail');
    expect(officialTrailName('lamot-1', 'Sitio Lamot 1', 'Lamot 1 Classic Summit Trail')).toBe('Lamot 1 Trail');
    expect(officialTrailName('', 'Brgy. Sto. Tomas', 'Sto. Tomas Southern Traverse Trail')).toBe('Sto. Tomas Trail');
    expect(officialTrailName('', '', 'Unknown route', 'Assigned trail')).toBe('Assigned trail');
  });

  it('keeps legacy landing-page review labels within the official route set', () => {
    expect(officialPublicTrailName('Summit Trail')).toBe('Lamot 2 Trail');
    expect(officialPublicTrailName('Ridge Route')).toBe('Lamot 1 Trail');
    expect(officialPublicTrailName('Scenic Loop')).toBe('Sto. Tomas Trail');
  });

  it('shows all station records or only records assigned to the selected station', () => {
    const rows = [
      { location_id: 'lamot1', id: 'route-1' },
      { location_id: 'lamot2', id: 'route-2' },
      { location_id: 'sto', id: 'route-3' },
    ];
    expect(filterByTrailhead(rows, 'all')).toEqual(rows);
    expect(filterByTrailhead(rows, 'lamot2')).toEqual([rows[1]]);
  });
});
