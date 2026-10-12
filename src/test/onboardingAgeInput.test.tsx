import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);
  profileQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  profileQuery.upsert.mockResolvedValue({ error: null });
  return { profileQuery, toast: { success: vi.fn(), error: vi.fn() } };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'hiker-1', user_metadata: { full_name: 'Juan Cruz' } }, loading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => mocks.profileQuery) },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import Onboarding from '@/pages/Onboarding';

describe('onboarding age input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  it('accepts typed digits without browser spinner controls and filters non-numeric input', async () => {
    render(<MemoryRouter initialEntries={['/onboarding']}><Onboarding /></MemoryRouter>);
    const age = await screen.findByLabelText('Age');

    expect(age).toHaveAttribute('type', 'text');
    expect(age).toHaveAttribute('inputmode', 'numeric');
    expect(age).not.toHaveAttribute('min');
    expect(age).not.toHaveAttribute('step');

    fireEvent.change(age, { target: { value: '24abc' } });
    expect(age).toHaveValue('24');
    await waitFor(() => expect(mocks.profileQuery.maybeSingle).toHaveBeenCalled());
  });
});
