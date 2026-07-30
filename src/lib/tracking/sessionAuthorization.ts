export const ADMIN_CHECKIN_TOKEN_PREFIX = 'admin-checkin:';

export function isAdminAuthorizedSession(clientSessionId: string | null | undefined) {
  return clientSessionId?.startsWith(ADMIN_CHECKIN_TOKEN_PREFIX) ?? false;
}

export function makeAdminCheckInToken(
  bookingId: string,
  userId: string,
  participantRole: 'hiker' | 'guide',
) {
  return `${ADMIN_CHECKIN_TOKEN_PREFIX}${bookingId}:${participantRole}:${userId}:${Date.now()}`;
}
