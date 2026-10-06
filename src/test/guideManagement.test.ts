import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  return { builder, from: vi.fn() };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: query.from },
}));

import { setGuideAccountActiveAtLocation } from '@/lib/guideManagement';

describe('guide activation controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.from.mockReturnValue(query.builder);
    query.builder.update.mockReturnValue(query.builder);
    query.builder.eq.mockReturnValue(query.builder);
    query.builder.select.mockReturnValue(query.builder);
    query.builder.maybeSingle.mockResolvedValue({ data: { id: 'guide-a' }, error: null });
  });

  it('changes only the explicitly selected guide and scopes the write to its trailhead', async () => {
    await setGuideAccountActiveAtLocation('guide-a', 'lamot-1', false);

    expect(query.from).toHaveBeenCalledWith('guides');
    expect(query.builder.update).toHaveBeenCalledWith({ is_active: false });
    expect(query.builder.eq).toHaveBeenNthCalledWith(1, 'id', 'guide-a');
    expect(query.builder.eq).toHaveBeenNthCalledWith(2, 'location_id', 'lamot-1');
  });

  it('does not report success when the scoped guide row was not updated', async () => {
    query.builder.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(setGuideAccountActiveAtLocation('guide-a', 'lamot-1', true))
      .rejects.toThrow('Guide status was not changed');
  });
});
