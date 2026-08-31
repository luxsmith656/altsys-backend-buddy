import { describe, expect, it } from 'vitest';
import { buildKaliContext } from '@/lib/kaliContext';

describe('buildKaliContext', () => {
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

  it('calls out a minor booking for adult and admin verification', () => {
    const [insight] = buildKaliContext({ role: 'hiker', currentAges: [14, 32], groupSize: 2 });

    expect(insight.kind).toBe('minor-review');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('responsible adult');
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
