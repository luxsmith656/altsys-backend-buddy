import { describe, expect, it } from 'vitest';
import { isReleaseHealthy, type SystemHealthReport } from '@/lib/monitoring/systemHealthEngine';

function report(status: SystemHealthReport['status'], failedCount = 0, warningCount = 0): SystemHealthReport {
  return {
    timestamp: '2026-08-27T00:00:00.000Z',
    overallScore: status === 'healthy' ? 100 : 80,
    status,
    passedCount: 1,
    warningCount,
    failedCount,
    totalCount: 1,
    items: [],
  };
}

describe('release health gate', () => {
  it('allows release only when every required health check is healthy', () => {
    expect(isReleaseHealthy(report('healthy'))).toBe(true);
    expect(isReleaseHealthy(report('warning', 0, 1))).toBe(false);
    expect(isReleaseHealthy(report('critical', 1))).toBe(false);
  });

  it('rejects a report that contains a failure even if its status is inconsistent', () => {
    expect(isReleaseHealthy(report('healthy', 1))).toBe(false);
  });
});
