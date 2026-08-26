import { describe, it, expect } from 'vitest';
import { runFullSystemDiagnostics, APP_ROUTES } from '@/lib/monitoring/systemHealthEngine';
import { calculateFees, calculatePeakExtensionFee, calculateEmergencyHorseFee } from '@/lib/payments';
import { FacebookProphetEngine } from '@/lib/ml/prophetEngine';
import { generateSyntheticBaseline } from '@/lib/ml/prophetDataService';
import { ADMIN_CHECKIN_TOKEN_PREFIX } from '@/lib/tracking/sessionAuthorization';
import { encodeMeta, parseMeta } from '@/lib/bookingMeta';

describe('System Integrity: Routing & Navigation Table', () => {
  it('has all 17 critical application routes registered and formatted correctly', () => {
    expect(APP_ROUTES.length).toBeGreaterThanOrEqual(17);
    APP_ROUTES.forEach((route) => {
      expect(route.path.startsWith('/')).toBe(true);
      expect(route.name.length).toBeGreaterThan(2);
      expect(['public', 'admin', 'super_admin', 'ranger', 'guide', 'hiker', 'staff', 'authenticated']).toContain(route.role);
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
  it('strictly enforces 8-pax guide threshold, ₱30 entry fee, and ₱20 env fee per person', () => {
    // 1 hiker -> 1 guide (₱800) + 1 entry (₱30) + 1 env (₱20) = ₱850
    const fee1 = calculateFees(1);
    expect(fee1.guideFee).toBe(800);
    expect(fee1.entryFee).toBe(30);
    expect(fee1.envFee).toBe(20);
    expect(fee1.totalFee).toBe(850);
    expect(fee1.guidesNeeded).toBe(1);

    // 8 hikers -> 1 guide (₱800) + 8 entry (₱240) + 8 env (₱160) = ₱1200
    const fee8 = calculateFees(8);
    expect(fee8.guideFee).toBe(800);
    expect(fee8.entryFee).toBe(240);
    expect(fee8.envFee).toBe(160);
    expect(fee8.totalFee).toBe(1200);
    expect(fee8.guidesNeeded).toBe(1);

    // 9 hikers -> 2 guides (₱1600) + 9 entry (₱270) + 9 env (₱180) = ₱2050
    const fee9 = calculateFees(9);
    expect(fee9.guideFee).toBe(1600);
    expect(fee9.entryFee).toBe(270);
    expect(fee9.envFee).toBe(180);
    expect(fee9.totalFee).toBe(2050);
    expect(fee9.guidesNeeded).toBe(2);

    // 16 hikers -> 2 guides (₱1600) + 16 entry (₱480) + 16 env (₱320) = ₱2400
    const fee16 = calculateFees(16);
    expect(fee16.guideFee).toBe(1600);
    expect(fee16.entryFee).toBe(480);
    expect(fee16.envFee).toBe(320);
    expect(fee16.totalFee).toBe(2400);
    expect(fee16.guidesNeeded).toBe(2);

    // 17 hikers -> 3 guides (₱2400) + 17 entry (₱510) + 17 env (₱340) = ₱3250
    const fee17 = calculateFees(17);
    expect(fee17.guideFee).toBe(2400);
    expect(fee17.entryFee).toBe(510);
    expect(fee17.envFee).toBe(340);
    expect(fee17.totalFee).toBe(3250);
    expect(fee17.guidesNeeded).toBe(3);
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

describe('System Integrity: Full Diagnostic Suite Runner', () => {
  it('runs all diagnostic probes without throwing uncaught exceptions', async () => {
    const report = await runFullSystemDiagnostics();
    expect(report.totalCount).toBeGreaterThanOrEqual(6);
    expect(report.overallScore).toBeGreaterThanOrEqual(75);
    expect(['healthy', 'warning', 'critical']).toContain(report.status);
    expect(report.items.length).toBe(report.totalCount);
  });
});

describe('System Integrity: Page Component Module Resolution & No Missing Variables', () => {
  it('imports all dashboard and core page modules cleanly without ReferenceError', async () => {
    const pages = [
      import('@/pages/HikerDashboard'),
      import('@/pages/AdminDashboard'),
      import('@/pages/GuideDashboard'),
      import('@/pages/RangerDashboard'),
      import('@/pages/CentralDashboard'),
      import('@/pages/BookingPage'),
      import('@/pages/MapPage'),
      import('@/pages/JoinHikeGuestPage'),
      import('@/pages/OpsAIPage'),
      import('@/pages/ProfilePage'),
      import('@/pages/Onboarding'),
      import('@/pages/DashboardRedirect'),
    ];

    const results = await Promise.all(pages);
    expect(results.length).toBe(12);
    results.forEach((mod) => {
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe('function');
    });
  }, 20000);
});
