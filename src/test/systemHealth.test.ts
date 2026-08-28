import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn().mockRejectedValue(new Error('database unavailable in isolated test environment')),
      })),
    })),
  },
}));

import { isReleaseHealthy, runFullSystemDiagnostics } from '@/lib/monitoring/systemHealthEngine';

describe('system health release gate', () => {
  it('marks a thrown database verification as a critical release failure', async () => {
    const report = await runFullSystemDiagnostics();
    const databaseCheck = report.items.find((item) => item.id === 'diag_db_connectivity');

    expect(databaseCheck?.status).toBe('failed');
    expect(report.status).toBe('critical');
    expect(isReleaseHealthy(report)).toBe(false);
  });
});
