import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getLiveSystemSnapshot,
  getOfflineAnswer,
  matchSystemFaqOrLiveQuery,
  OFFICIAL_CLOTHING_FAQ_ANSWER,
  updateLiveSystemSnapshotPartial,
} from '@/lib/trail-offline-kb';

describe('System FAQs (FAQ-01 to FAQ-08) & Live System Offline Snapshot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('replaces FAQ-05 in AboutPage.tsx with the advisable clothing question and answer', () => {
    const aboutSource = readFileSync(resolve(process.cwd(), 'src/pages/AboutPage.tsx'), 'utf8');
    expect(aboutSource).toContain('What is advisable to wear during a hike at Mt. Kalisungan?');
    expect(aboutSource).toContain(OFFICIAL_CLOTHING_FAQ_ANSWER);
    expect(aboutSource).not.toContain('What are the available booking time slots?');
  });

  it.each([
    ['FAQ-01', 'Are there any river crossings on Mt. Kalisungan?', /zero|no river crossings/i],
    ['FAQ-02', 'Is a local guide mandatory for all hikers?', /mandatory|accredited local/i],
    ['FAQ-03', 'How does guide assignment work during booking?', /referral code|fair livelihood rotation|rotation/i],
    ['FAQ-04', 'What is the difficulty rating and summit elevation?', /760 MASL.*2,493 ft.*Moderate/is],
    ['FAQ-05', 'What is advisable to wear during a hike at Mt. Kalisungan?', /lightweight, breathable clothing.*waterproof jacket or raincoat/is],
    ['FAQ-06', 'Can we camp overnight at the summit?', /Overnight slots are available on the summit grassland.*Open bonfires are strictly prohibited/is],
    ['FAQ-07', 'What trailhead entry points can I choose from?', /Lamot 1.*Lamot 2.*Sto\. Tomas/is],
    ['FAQ-08', 'How do we get to the trailhead via commute?', /Sta\. Cruz, Laguna.*Buendia, Pasay, or Cubao.*Duck Junction.*tricycle/is],
  ])('answers %s (%s) accurately offline without saying it does not know', (_id, question, expectedPattern) => {
    const direct = matchSystemFaqOrLiveQuery(question);
    expect(direct).not.toBeNull();
    expect(direct).toMatch(expectedPattern);

    const offlineReply = getOfflineAnswer(question);
    expect(offlineReply).toMatch(expectedPattern);
    expect(offlineReply).not.toMatch(/can’t confirm|cannot confirm|can't confirm|don't know|do not know/i);
  });

  it('uses the latest synced live system snapshot when answering related schedule, fee, capacity, and route questions offline', () => {
    updateLiveSystemSnapshotPartial({
      syncedAt: '2026-11-09T15:30:00.000Z',
      schedule: {
        morning: ['04:00 AM', '05:30 AM', '07:00 AM'],
        night: ['02:00 PM', '04:00 PM'],
        overnight: ['02:00 PM', '03:30 PM'],
      },
      capacity: {
        mode: 'per_trailhead',
        sharedMaxGroups: 4,
        maxPeoplePerGroup: 5,
        holdPending: true,
        dailyLimit: 80,
      },
      routes: [
        {
          id: 'route-lamot2',
          name: 'Lamot 2 Official Summit Trail',
          locationName: 'Lamot 2',
          difficulty: 'Moderate',
          elevationMeters: 760,
          distanceKm: 3.4,
          stationNames: ['Station 1', 'Station 2', 'Summit'],
        },
      ],
    });

    const snap = getLiveSystemSnapshot();
    expect(snap.schedule.morning).toContain('05:30 AM');
    expect(snap.capacity.dailyLimit).toBe(80);

    const slotAnswer = getOfflineAnswer('What are the available booking time slots?');
    expect(slotAnswer).toContain('05:30 AM');
    expect(slotAnswer).toContain('03:30 PM');
    expect(slotAnswer).not.toMatch(/can’t confirm|cannot confirm/i);

    const routeAnswer = getOfflineAnswer('What trailhead entry points can I choose from?');
    expect(routeAnswer).toContain('Lamot 2 Official Summit Trail');
    expect(routeAnswer).toContain('3.4 km');

    const capAnswer = getOfflineAnswer('What is the daily capacity and group limit?');
    expect(capAnswer).toContain('80 hikers');
    expect(capAnswer).toContain('4 groups');
  });
});
