import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  signUp: state.signUp,
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} } }));
import { AuthProvider, useAuth } from '@/hooks/useAuth';
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each([null, { user: { id: 'user-1' }, access_token: 'test-session' }])('exposes the actual hosted signup session (%j) without inventing authentication', async (session) => {
  state.signUp.mockResolvedValue({ data: { user: { id: 'user-1' }, session }, error: null });
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    expect(await result.current.signUp('juan@example.com', 'secret123', 'Juan Cruz', 'guide-1')).toEqual({ error: null, session });
  });
  expect(state.signUp).toHaveBeenCalledWith({ email: 'juan@example.com', password: 'secret123', options: {
    data: { full_name: 'Juan Cruz', referral_guide_id: 'guide-1' }, emailRedirectTo: window.location.origin,
  } });
});
