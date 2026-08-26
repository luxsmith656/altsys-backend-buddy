import { describe, it, expect } from 'vitest';
import type { DailyCapacity, GuestHikerSession } from '@/types';

describe('Day and Night Capacity Splitting Logic', () => {
  it('correctly calculates Day vs Night available slots from capacity record', () => {
    const cap: DailyCapacity = {
      id: 'cap-1',
      date: '2026-08-30',
      max_capacity: 100,
      current_count: 35,
      day_max_capacity: 70,
      night_max_capacity: 30,
      day_current_count: 25,
      night_current_count: 10,
    };

    const dayAvailable = (cap.day_max_capacity ?? 70) - (cap.day_current_count ?? 0);
    const nightAvailable = (cap.night_max_capacity ?? 30) - (cap.night_current_count ?? 0);
    const totalAvailable = cap.max_capacity - cap.current_count;

    expect(dayAvailable).toBe(45);
    expect(nightAvailable).toBe(20);
    expect(totalAvailable).toBe(65);
    expect(dayAvailable + nightAvailable).toBe(totalAvailable);
  });

  it('falls back gracefully to proportional split (65% day / 35% night) if specific split is omitted', () => {
    const cap: DailyCapacity = {
      id: 'cap-2',
      date: '2026-08-31',
      max_capacity: 120,
      current_count: 20,
    };

    const dayMax = cap.day_max_capacity ?? Math.round(cap.max_capacity * 0.65);
    const nightMax = cap.night_max_capacity ?? Math.max(1, cap.max_capacity - dayMax);

    expect(dayMax).toBe(78); // 120 * 0.65
    expect(nightMax).toBe(42); // 120 - 78
    expect(dayMax + nightMax).toBe(120);
  });
});

describe('Guest Companion QR Onboarding & Session Schema', () => {
  it('creates valid guest session data structure with all required beacon fields', () => {
    const bookingId = 'booking-uuid-1234';
    const guestName = 'Maria Santos';
    const now = new Date().toISOString();

    const guestSession: GuestHikerSession = {
      guestSessionId: `guest_${crypto.randomUUID()}`,
      bookingId,
      guestName,
      leadHikerName: 'Juan Dela Cruz',
      hikeDate: '2026-08-30',
      assignedGuide: 'Rodel Manalansan',
      assignedTrail: 'Summit Trail',
      joinedAt: now,
    };

    expect(guestSession.guestSessionId.startsWith('guest_')).toBe(true);
    expect(guestSession.guestName).toBe('Maria Santos');
    expect(guestSession.bookingId).toBe(bookingId);
    expect(guestSession.assignedGuide).toBe('Rodel Manalansan');
  });
});

describe('Offline GPS Timestamp & Inactivity Pausing', () => {
  it('identifies offline paused status when last GPS ping is older than 2 minutes', () => {
    const now = Date.now();
    const activePingTs = new Date(now - 30 * 1000).toISOString(); // 30s ago
    const offlinePingTs = new Date(now - 180 * 1000).toISOString(); // 3 mins ago

    const getIsOffline = (lastTs: string) => {
      const ageMin = (now - new Date(lastTs).getTime()) / 60000;
      return ageMin >= 2;
    };

    expect(getIsOffline(activePingTs)).toBe(false); // Live
    expect(getIsOffline(offlinePingTs)).toBe(true); // Offline paused
  });
});

describe('Cancellation & Reschedule 1-3 Day Window Validation', () => {
  it('verifies whether a cancellation or reschedule request meets the 1-3 day notice policy', () => {
    const isWithinNoticeWindow = (hikeDateStr: string, requestDate: Date = new Date()) => {
      const hikeDate = new Date(`${hikeDateStr}T00:00:00`);
      const diffMs = hikeDate.getTime() - requestDate.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays >= 1; // At least 1 day before
    };

    // 3 days in advance -> Valid
    const futureHike3Days = new Date();
    futureHike3Days.setDate(futureHike3Days.getDate() + 3);
    const dateStr3 = futureHike3Days.toISOString().split('T')[0];
    expect(isWithinNoticeWindow(dateStr3)).toBe(true);

    // Same day -> Fails 1-day notice
    const sameDay = new Date().toISOString().split('T')[0];
    // Passing current time on same day
    expect(isWithinNoticeWindow(sameDay, new Date())).toBe(false);
  });
});
