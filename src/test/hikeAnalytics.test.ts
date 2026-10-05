import { describe, expect, it } from 'vitest';
import { summarizeHikeAnalytics, type AnalyticsBooking } from '@/lib/hikeAnalytics';

const booking = (notes: object, size = 3): AnalyticsBooking => ({ id: 'b1', status: 'completed', location_id: 'lamot2', group_size: size, notes: JSON.stringify(notes) });

describe('measured visitor and hike analytics', () => {
  it('counts actual nationalities without assuming missing companions are local', () => {
    const stats = summarizeHikeAnalytics([booking({ nationality: 'Filipino', companionDetails: [{ nationality: 'Japanese' }] }, 4)]);
    expect(stats).toMatchObject({ local: 1, foreign: 1, unknown: 2, groupSize: { count: 1, average: 4, median: 4 } });
  });
  it('uses recorded milestones, including early departure and midnight crossing', () => {
    const stats = summarizeHikeAnalytics([booking({ onsiteStartTime: '2026-10-03T22:00:00+08:00', peakReachedAt: '2026-10-04T01:00:00+08:00', descentStartedAt: '2026-10-04T01:30:00+08:00', hikeCompletedAt: '2026-10-04T03:30:00+08:00' })]);
    expect(stats.ascent.average).toBe(180);
    expect(stats.summit.average).toBe(30);
    expect(stats.descent.average).toBe(120);
  });
  it('does not fabricate durations or count cancelled/pending groups', () => {
    const stats = summarizeHikeAnalytics([booking({ peakReachedAt: 'invalid', descentStartedAt: '2026-10-04T02:00:00Z', hikeCompletedAt: '2026-10-04T01:00:00Z' }), { ...booking({}), status: 'cancelled' }, { ...booking({}), status: 'pending' }]);
    expect(stats.groupSize.count).toBe(1);
    for (const phase of [stats.ascent, stats.summit, stats.descent]) expect(phase).toEqual({ count: 0, average: null, median: null });
  });
  it('uses checked-in headcount and excludes stale excess companion details', () => {
    const stats = summarizeHikeAnalytics([booking({ checkinHeadcount: 1, nationality: 'PH', companionDetails: [{ nationality: 'Japanese' }] }), booking({}, 5)]);
    expect(stats).toMatchObject({ local: 1, foreign: 0, unknown: 5, groupSize: { average: 3, median: 3 } });
  });
});
