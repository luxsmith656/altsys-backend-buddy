import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CHECKIN_TOKEN_PREFIX,
  isAdminAuthorizedSession,
  makeAdminCheckInToken,
} from '@/lib/tracking/sessionAuthorization';

describe('tracking session authorization', () => {
  it('accepts only admin check-in session tokens', () => {
    expect(isAdminAuthorizedSession(`${ADMIN_CHECKIN_TOKEN_PREFIX}booking:hiker:user:1`)).toBe(true);
    expect(isAdminAuthorizedSession('local-recorder-session')).toBe(false);
    expect(isAdminAuthorizedSession(null)).toBe(false);
  });

  it('creates role-specific check-in tokens for grouped sessions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    expect(makeAdminCheckInToken('booking-1', 'hiker-1', 'hiker')).toBe(
      'admin-checkin:booking-1:hiker:hiker-1:1234',
    );
    expect(makeAdminCheckInToken('booking-1', 'guide-1', 'guide')).toBe(
      'admin-checkin:booking-1:guide:guide-1:1234',
    );

    vi.restoreAllMocks();
  });
});
