import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ insert: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: db.getUser }, from: () => ({ insert: db.insert }) } }));
import { writeActivityLog } from '@/lib/activity-log';

beforeEach(() => {
  db.getUser.mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null });
  db.insert.mockResolvedValue({ error: null });
});

it('writes audit details using the actual admin_logs schema, preserving before and after state', async () => {
  await writeActivityLog({ action: 'guide_assigned', entity_type: 'booking', entity_id: 'booking-id', before_state: { guide: null }, after_state: { guide: 'guide-id' } });
  expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'admin-id', entity: 'booking', entity_id: 'booking-id', action: 'guide_assigned', metadata: { before_state: { guide: null }, after_state: { guide: 'guide-id' } } }));
  expect(db.insert.mock.calls.at(-1)?.[0]).not.toHaveProperty('after_state');
});
