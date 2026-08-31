import { describe, expect, it } from 'vitest';
import { getScopedLocationId, hasAllLocationAccess } from '@/lib/locationScope';

describe('location access scope', () => {
  it('keeps a location-scoped admin on the assigned location', () => {
    expect(getScopedLocationId('admin', 'lamot-1')).toBe('lamot-1');
    expect(getScopedLocationId('admin', null)).toBeNull();
  });

  it('allows cross-location reads only for central and MDRRMO roles', () => {
    expect(hasAllLocationAccess('super_admin')).toBe(true);
    expect(hasAllLocationAccess('mdrrmo')).toBe(true);
    expect(hasAllLocationAccess('admin')).toBe(false);
    expect(hasAllLocationAccess('guide')).toBe(false);
  });
});
