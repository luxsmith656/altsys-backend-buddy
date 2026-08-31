import { describe, expect, it } from 'vitest';
import { addHorseHelpRequest, HORSE_HELP_OPTIONS, getHorseHelpOption } from '@/lib/hikeSupport';

describe('guide horse-help options', () => {
  it('uses the fixed station-to-fee schedule', () => {
    expect(HORSE_HELP_OPTIONS).toEqual([
      { id: 'station-5-3', label: 'Station 5–3', fee: 1000 },
      { id: 'station-2-1', label: 'Station 2–1', fee: 500 },
    ]);
    expect(getHorseHelpOption('station-5-3')?.fee).toBe(1000);
    expect(getHorseHelpOption('station-2-1')?.fee).toBe(500);
  });

  it('appends an auditable request without removing existing booking metadata', () => {
    const next = addHorseHelpRequest(
      { fullName: 'Lead Hiker', guideStatus: 'accepted' },
      'station-5-3',
      'guide-1',
      '2026-08-31T10:00:00.000Z',
    );

    expect(next.fullName).toBe('Lead Hiker');
    expect(next.horseHelpRequests).toEqual([{
      station: 'station-5-3',
      stationLabel: 'Station 5–3',
      fee: 1000,
      requestedAt: '2026-08-31T10:00:00.000Z',
      requestedBy: 'guide-1',
      status: 'requested',
    }]);
  });
});
