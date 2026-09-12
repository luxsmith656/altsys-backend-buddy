import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ auth: { user: null as { id: string } | null, role: null as string | null }, order: vi.fn(), mappings: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => ({ select: () => table === 'locations' ? { order: state.order } : { eq: state.mappings } }) } }));
import { LocationsProvider, useLocations } from '@/hooks/useLocations';

function Probe() { const { activeLocationId, loading } = useLocations(); return <div>{loading ? 'loading' : activeLocationId}</div>; }

it('ignores a delayed guest location response after an admin has signed in', async () => {
  let finishGuest!: (data: { data: { id: string }[] }) => void;
  state.order.mockReturnValueOnce(new Promise((resolve) => { finishGuest = resolve; })).mockResolvedValue({ data: [{ id: 'lamot2' }] });
  state.mappings.mockResolvedValue({ data: [{ location_id: 'lamot2' }] });
  const view = render(<LocationsProvider><Probe /></LocationsProvider>);
  state.auth = { user: { id: 'lamot2-admin' }, role: 'admin' };
  view.rerender(<LocationsProvider><Probe /></LocationsProvider>);
  await waitFor(() => expect(screen.getByText('lamot2')).toBeInTheDocument());
  await act(async () => finishGuest({ data: [{ id: 'generic' }] }));
  expect(screen.getByText('lamot2')).toBeInTheDocument();
});
