import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ emailPasswordReset: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/accountSecurity', () => ({ emailPasswordReset: mocks.emailPasswordReset }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { ResetPasswordDialog } from '@/components/auth/ResetPasswordDialog';

describe('ResetPasswordDialog', () => {
  it('uses the secure email recovery link and does not expose an OTP reset flow', async () => {
    mocks.emailPasswordReset.mockResolvedValue(undefined);
    render(<ResetPasswordDialog open onOpenChange={vi.fn()} defaultEmail="hiker@example.com" />);

    expect(screen.getByDisplayValue('hiker@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/phone|code|otp|recaptcha/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(mocks.emailPasswordReset).toHaveBeenCalledWith('hiker@example.com', window.location.origin));
    expect(mocks.success).toHaveBeenCalledWith(expect.stringMatching(/reset link sent/i));
  });
});
