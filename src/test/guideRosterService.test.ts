import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: db.update }) },
}));

import { updateGuideProfile } from '@/lib/guideRosterService';

beforeEach(() => {
  vi.clearAllMocks();
  db.update.mockReturnValue({ eq: db.eq });
  db.eq.mockReturnValue({ eq: db.eq, select: db.select });
  db.select.mockReturnValue({ maybeSingle: db.maybeSingle });
  db.maybeSingle.mockResolvedValue({ data: { id: 'guide-1' }, error: null });
});

describe('updateGuideProfile', () => {
  it('persists trimmed guide details scoped to their assigned location', async () => {
    await expect(updateGuideProfile('guide-1', 'lamot-1', {
      full_name: '  Ana Guide ', phone: ' 0917 ', specialty: ' River Trail ', per_trip_fee: 800, age: 32, sex: 'female',
    })).resolves.toEqual({ id: 'guide-1' });

    expect(db.update).toHaveBeenCalledWith({
      full_name: 'Ana Guide', phone: '0917', specialty: 'River Trail', per_trip_fee: 800, age: 32, sex: 'female',
    });
    expect(db.eq).toHaveBeenNthCalledWith(1, 'id', 'guide-1');
    expect(db.eq).toHaveBeenNthCalledWith(2, 'location_id', 'lamot-1');
  });

  it('rejects invalid values before sending a database update', async () => {
    await expect(updateGuideProfile('guide-1', 'lamot-1', {
      full_name: ' ', phone: '', specialty: '', per_trip_fee: 800, age: null, sex: null,
    })).rejects.toThrow('Guide name is required.');
    await expect(updateGuideProfile('guide-1', 'lamot-1', {
      full_name: 'Ana', phone: '', specialty: '', per_trip_fee: -1, age: null, sex: null,
    })).rejects.toThrow('Guide rate must be zero or more.');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('surfaces RLS or network failures and missing-row updates', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(updateGuideProfile('guide-1', 'lamot-1', {
      full_name: 'Ana', phone: '', specialty: '', per_trip_fee: 800, age: null, sex: null,
    })).rejects.toThrow('permission denied');

    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateGuideProfile('guide-1', 'lamot-1', {
      full_name: 'Ana', phone: '', specialty: '', per_trip_fee: 800, age: null, sex: null,
    })).rejects.toThrow('Guide details were not saved.');
  });
});
