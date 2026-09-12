import { describe, expect, it } from 'vitest';
import { officialRoutesForLocation, selectAssignedOfficialRoute } from '@/lib/officialRoutes';

const official = { id: 'published', status: 'active', is_official: true, review_status: 'approved', location_id: 'lamot2', coordinates_json: [{ lat: 14.1, lng: 121.2 }, { lat: 14.2, lng: 121.3 }] };
describe('official route assignment', () => {
  it('never substitutes another location or a named draft when no approved route exists', () => {
    expect(officialRoutesForLocation([official], 'lamot1')).toEqual([]);
    expect(officialRoutesForLocation([{ ...official, status: 'draft' }, { ...official, is_official: false }, { ...official, review_status: 'pending' }], 'lamot2')).toEqual([]);
  });
  it('excludes placeholder geometry and accepts a reviewed recorded path', () => {
    expect(officialRoutesForLocation([{ ...official, coordinates_json: [] }, { ...official, coordinates_json: [{ lat: 95, lng: 120 }, { lat: 14, lng: 120 }] }, official], 'lamot2')).toEqual([official]);
  });
  it('requires an explicit selection for multiple routes and never changes an invalid assignment silently', () => {
    expect(selectAssignedOfficialRoute([official])).toEqual(official);
    expect(selectAssignedOfficialRoute([official, { ...official, id: 'second' }])).toBeNull();
    expect(selectAssignedOfficialRoute([official], 'removed-route')).toBeNull();
  });
});
