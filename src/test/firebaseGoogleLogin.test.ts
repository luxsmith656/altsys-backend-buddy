import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ popup: vi.fn(), signOut: vi.fn(), verifyOtp: vi.fn(), fetch: vi.fn() }));
vi.mock('firebase/auth', () => ({ GoogleAuthProvider: class {}, getAuth: () => ({}), signInWithPopup: mocks.popup, signOut: mocks.signOut }));
vi.mock('@/lib/firebase', () => ({ getFirebaseApp: () => ({}), isFirebaseConfigured: () => true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { verifyOtp: mocks.verifyOtp } } }));
import { signInWithFirebaseGoogle } from '@/lib/firebase-auth';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.popup.mockResolvedValue({ user: { getIdToken: async () => 'firebase-token' } });
  mocks.signOut.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ token_hash: 'bridge-token', email: 'test@example.com' }) });
});
it('shares double clicks and keeps Firebase signed in until Supabase establishes the session', async () => {
  let finish!: (value: { error: null }) => void;
  mocks.verifyOtp.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = signInWithFirebaseGoogle();
  const second = signInWithFirebaseGoogle();
  await vi.waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalled());
  expect(mocks.popup).toHaveBeenCalledTimes(1);
  expect(mocks.signOut).not.toHaveBeenCalled();
  finish({ error: null });
  expect((await first).error).toBeNull();
  expect((await second).error).toBeNull();
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
});
it('explains a blocked popup and allows a later attempt', async () => {
  mocks.popup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });
  expect((await signInWithFirebaseGoogle()).error?.message).toContain('Allow pop-ups');
  mocks.verifyOtp.mockResolvedValue({ error: null });
  expect((await signInWithFirebaseGoogle()).error).toBeNull();
});
