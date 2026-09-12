import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({ signUp: vi.fn(), signIn: vi.fn(), google: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signUp: state.signUp, signIn: state.signIn }) }));
vi.mock('@/lib/firebase-auth', () => ({ signInWithFirebaseGoogle: state.google }));
vi.mock('@/lib/firebase', () => ({ isFirebaseConfigured: () => true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import Register from '@/pages/Register';
import Login from '@/pages/Login';

function showRegister() {
  render(<MemoryRouter initialEntries={['/register?guide=guide-123&redirect=%2Fbook']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/register" element={<Register />} /><Route path="/login" element={<p>Login destination</p>} /><Route path="/onboarding" element={<p>Onboarding destination</p>} /></Routes>
  </MemoryRouter>);
}

function fillForm() {
  for (const [label, value] of [['Full Name', 'Juan Cruz'], ['Email', 'juan@example.com'], ['Mobile Number', '09123456789'], ['Password', 'secret123'], ['Confirm Password', 'secret123']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe('signup without application OTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.signUp.mockResolvedValue({ error: null, session: { user: { id: 'user-1' } } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No live sends allowed')));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('creates an account directly, preserving guide referral and removing OTP selectors', async () => {
    showRegister(); fillForm();
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    await waitFor(() => expect(state.signUp).toHaveBeenCalledExactlyOnceWith('juan@example.com', 'secret123', 'Juan Cruz', 'guide-123'));
    expect(screen.queryByText(/Verify Via|Send SMS OTP|Send Email OTP|Verify Identity/)).not.toBeInTheDocument();
    expect(await screen.findByText('Onboarding destination')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not claim sign-in is ready when hosted auth returns no session', async () => {
    state.signUp.mockResolvedValue({ error: null, session: null });
    showRegister(); fillForm();
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringMatching(/hosted.*confirmation|confirmation.*hosted/i)));
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('retains password matching validation', () => {
    showRegister(); fillForm();
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    expect(state.error).toHaveBeenCalledWith('Passwords do not match');
    expect(state.signUp).not.toHaveBeenCalled();
  });

  it('prevents duplicate account requests while signup is pending', async () => {
    let finish!: (value: unknown) => void;
    state.signUp.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    showRegister(); fillForm();
    const form = screen.getByLabelText('Email').closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(state.signUp).toHaveBeenCalledTimes(1);
    await act(async () => finish({ error: null, session: { user: { id: 'user-1' } } }));
  });

  it('surfaces signup failures and makes the form available again', async () => {
    state.signUp.mockRejectedValue(new Error('Auth unavailable'));
    showRegister(); fillForm();
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!);
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Auth unavailable'));
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
  });

  it('preserves the Google OAuth bridge and onboarding route', async () => {
    state.google.mockResolvedValue({ error: null, isNewUser: true });
    showRegister();
    fireEvent.click(screen.getByRole('button', { name: /Sign up with Google/ }));
    expect(await screen.findByText('Onboarding destination')).toBeInTheDocument();
    expect(state.google).toHaveBeenCalledTimes(1);
    expect(state.signUp).not.toHaveBeenCalled();
  });

  it('does not offer a signup-confirmation resend after a hosted auth rejection', async () => {
    state.signIn.mockResolvedValue({ error: new Error('Email not confirmed') });
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Email not confirmed'));
    expect(screen.queryByRole('button', { name: /Resend confirmation email/ })).not.toBeInTheDocument();
  });
});
