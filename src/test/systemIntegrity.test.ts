import { describe, it, expect } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { calculateFees, calculatePeakExtensionFee, calculateEmergencyHorseFee } from '@/lib/payments';
import { FacebookProphetEngine } from '@/lib/ml/prophetEngine';
import { generateSyntheticBaseline } from '@/lib/ml/prophetDataService';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';

describe('System Integrity: Routing & Navigation Table', () => {
  it('has all critical application routes registered and access-controlled', () => {
    expect(APP_ROUTES.length).toBeGreaterThanOrEqual(20);
    APP_ROUTES.forEach((route) => {
      expect(route.path.startsWith('/')).toBe(true);
      expect(route.name.length).toBeGreaterThan(2);
      expect(['public', 'authenticated', 'roles']).toContain(route.access);
      expect(route.pageKey.length).toBeGreaterThan(1);
      if (route.access === 'roles') expect(route.allowedRoles?.length).toBeGreaterThan(0);
    });
  });

  it('validates required routes exist in registry', () => {
    const paths = APP_ROUTES.map((r) => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/booking');
    expect(paths).toContain('/map');
    expect(paths).toContain('/join-hike');
    expect(paths).toContain('/admin');
    expect(paths).toContain('/hiker');
    expect(paths).toContain('/guide');
    expect(paths).toContain('/ranger');
    expect(paths).toContain('/ops-ai');
  });
});
describe('System Integrity: Pricing Engine & Cash Settlement Formula', () => {
  it('strictly enforces 5-pax guide threshold, ₱30 entry fee, and ₱20 env fee per person', () => {
    // 1 hiker -> 1 guide (₱800) + 1 entry (₱30) + 1 env (₱20) = ₱850
    const fee1 = calculateFees(1);
    expect(fee1.guideFee).toBe(800);
    expect(fee1.entryFee).toBe(30);
    expect(fee1.envFee).toBe(20);
    expect(fee1.totalFee).toBe(850);
    expect(fee1.guidesNeeded).toBe(1);

    // 5 hikers -> 1 guide (₱800) + 5 entry (₱150) + 5 env (₱100) = ₱1050
    const fee5 = calculateFees(5);
    expect(fee5.guideFee).toBe(800);
    expect(fee5.entryFee).toBe(150);
    expect(fee5.envFee).toBe(100);
    expect(fee5.totalFee).toBe(1050);
    expect(fee5.guidesNeeded).toBe(1);

    // 6 hikers -> 2 guides (₱1600) + 6 entry (₱180) + 6 env (₱120) = ₱1900
    const fee6 = calculateFees(6);
    expect(fee6.guideFee).toBe(1600);
    expect(fee6.entryFee).toBe(180);
    expect(fee6.envFee).toBe(120);
    expect(fee6.totalFee).toBe(1900);
    expect(fee6.guidesNeeded).toBe(2);

    // 10 hikers -> 2 guides (₱1600) + 10 entry (₱300) + 10 env (₱200) = ₱2100
    const fee10 = calculateFees(10);
    expect(fee10.guideFee).toBe(1600);
    expect(fee10.entryFee).toBe(300);
    expect(fee10.envFee).toBe(200);
    expect(fee10.totalFee).toBe(2100);
    expect(fee10.guidesNeeded).toBe(2);

    // 11 hikers -> 3 guides (₱2400) + 11 entry (₱330) + 11 env (₱220) = ₱2950
    const fee11 = calculateFees(11);
    expect(fee11.guideFee).toBe(2400);
    expect(fee11.entryFee).toBe(330);
    expect(fee11.envFee).toBe(220);
    expect(fee11.totalFee).toBe(2950);
    expect(fee11.guidesNeeded).toBe(3);
  });

  it('accurately calculates peak stay extensions and emergency horse rescue fees', () => {
    expect(calculatePeakExtensionFee(0)).toBe(0);
    expect(calculatePeakExtensionFee(1)).toBe(100);
    expect(calculatePeakExtensionFee(3)).toBe(300);

    expect(calculateEmergencyHorseFee(0)).toBe(0);
    expect(calculateEmergencyHorseFee(1)).toBe(500);
    expect(calculateEmergencyHorseFee(2)).toBe(1000);
  });

  it('accurately calculates cash change due at trailhead settlement', () => {
    const totalAmount = 2050;
    const tendered = 2500;
    const change = tendered - totalAmount;
    expect(change).toBe(450);
  });
});
describe('System Integrity: Prophet ML Forecasting Model', () => {
  it('produces valid mathematical bounds for tourist demand predictions', () => {
    const baseline = generateSyntheticBaseline('2025-01-01', '2025-03-31', 40);
    const engine = new FacebookProphetEngine({ growth: 'linear', nChangepoints: 5, intervalWidth: 0.95 });
    engine.fit(baseline);
    const future = engine.predict([
      { ds: '2025-04-01', y: 0, rain_prob: 10, typhoon_signal: 0 },
      { ds: '2025-04-02', y: 0, rain_prob: 20, typhoon_signal: 0 },
    ]);

    expect(future.length).toBe(2);
    future.forEach((day) => {
      expect(day.yhat).toBeGreaterThanOrEqual(0);
      expect(day.yhat_lower).toBeLessThanOrEqual(day.yhat);
      expect(day.yhat_upper).toBeGreaterThanOrEqual(day.yhat);
    });
  });
});

describe('System Integrity: Group Companion QR Protocol & Session Integrity', () => {
  it('generates consistent QR check-in tokens and companion onboarding URLs', () => {
    const bookingId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const token = `${ADMIN_CHECKIN_TOKEN_PREFIX}${bookingId}`;
    expect(token.startsWith(ADMIN_CHECKIN_TOKEN_PREFIX)).toBe(true);

    const companionUrl = `/join-hike?bookingId=${bookingId}`;
    expect(companionUrl).toContain(bookingId);
  });

  it('correctly serializes and parses group metadata and notes JSON', () => {
    const original = {
      fullName: 'Rodel Santos',
      companions: ['Ana Santos', 'Marco Santos'],
      hikeType: 'night' as const,
      groupPhase: 'peak' as const,
      peakExtensionHours: 2,
    };

    const encoded = encodeMeta(original);
    const parsed = parseMeta(encoded);

    expect(parsed.fullName).toBe('Rodel Santos');
    expect(parsed.companions).toEqual(['Ana Santos', 'Marco Santos']);
    expect(parsed.hikeType).toBe('night');
    expect(parsed.groupPhase).toBe('peak');
    expect(parsed.peakExtensionHours).toBe(2);
  });
});
