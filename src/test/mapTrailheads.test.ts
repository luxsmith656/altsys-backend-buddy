import { describe, expect, it } from 'vitest';
import { filterByTrailhead, getTrailheadIdentity, trailheadLabel } from '@/lib/mapTrailheads';

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
