import { describe, expect, it } from 'vitest';
import { buildKaliContext } from '@/lib/kaliContext';

describe('buildKaliContext', () => {
  it('does not flag an unfinished age field', () => {
    expect(buildKaliContext({ role: 'hiker', savedAge: 10, currentAge: '' })).toEqual([]);
  });

  it('flags an age change that crosses the minor boundary as review', () => {
    const [insight] = buildKaliContext({
      role: 'hiker',
      savedAge: 14,
      currentAge: 25,
      now: '2026-08-31T09:00:00+08:00',
    });

    expect(insight.kind).toBe('age-review');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('admin');
  });

  it('flags a same-name participant changing from minor to adult', () => {
    const [insight] = buildKaliContext({
      role: 'admin',
      savedParticipants: [{ name: 'Maria Santos', age: 10 }],
      currentParticipants: [{ name: 'Juan Santos', age: 30 }, { name: 'Maria Santos', age: 18 }],
    });

    expect(insight.id).toBe('age-review-1');
    expect(insight.message).toContain("Maria Santos's");
    expect(insight.meta.crossesMinorBoundary).toBe(true);
  });

  it('calls out a minor booking for adult and admin verification', () => {
    const [insight] = buildKaliContext({ role: 'hiker', currentAges: [14, 32], groupSize: 2 });

    expect(insight.kind).toBe('minor-review');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('responsible adult');
    expect(insight.meta.targetId).toBe('minor-requirements');
  });

  it('explains the difference between night and overnight bookings', () => {
    const [night] = buildKaliContext({ role: 'hiker', hikeType: 'night' });
    const [overnight] = buildKaliContext({ role: 'hiker', hikeType: 'overnight' });

    expect(night.kind).toBe('hike-type');
    expect(night.message).toContain('Night');
    expect(night.message).toContain('headlamp');
    expect(overnight.kind).toBe('hike-type');
    expect(overnight.message).toContain('overnight stay');
  });

  it('returns all simultaneous safety notices instead of dropping lower-priority notices', () => {
    const insights = buildKaliContext({
      role: 'hiker',
      currentAges: [14, 32],
      groupSize: 6,
      hikeType: 'night',
    });

    expect(insights.map((item) => item.kind)).toEqual([
      'minor-review',
      'group-guidance',
      'hike-type',
    ]);
  });

  it('explains two-guide coverage for groups above five', () => {
    const [insight] = buildKaliContext({ role: 'hiker', groupSize: 6 });

    expect(insight.kind).toBe('group-guidance');
    expect(insight.message).toContain('front and back');
  });

  it('escalates severe weather to avoid and marks an old forecast stale', () => {
    const [insight] = buildKaliContext({
      role: 'hiker',
      weather: {
        condition: 'Thunderstorm',
        rainProbability: 90,
        windKmh: 55,
        fetchedAt: '2026-08-30T03:00:00+08:00',
      },
      now: '2026-08-31T09:00:00+08:00',
    });

    expect(insight.kind).toBe('weather');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('resched');
    expect(insight.meta?.forecastStatus).toBe('stale');
  });

  it('adds an age-aware start-time suggestion to weather guidance', () => {
    const [insight] = buildKaliContext({
      role: 'hiker',
      currentAge: 36,
      selectedStartTime: '08:00 AM',
      recommendedStartTime: '06:00 AM',
      weather: { condition: 'Clear', rainProbability: 10, fetchedAt: '2026-08-31T08:00:00+08:00' },
      now: '2026-08-31T09:00:00+08:00',
    });

    expect(insight.kind).toBe('weather');
    expect(insight.message).toContain('06:00 AM');
    expect(insight.message).toContain('mid-30s');
  });

  it('uses role-aware copy for MDRRMO', () => {
    const [insight] = buildKaliContext({ role: 'mdrrmo', groupSize: 6 });

    expect(insight.message).toContain('response');
  });

  it('reminds a hiker about a confirmed booking within seven days', () => {
    const [insight] = buildKaliContext({
      role: 'hiker',
      booking: { status: 'confirmed', date: '2026-09-02' },
      now: '2026-08-31T09:00:00+08:00',
    });

    expect(insight.kind).toBe('booking-reminder');
    expect(insight.message).toContain('September 2');
  });
});
