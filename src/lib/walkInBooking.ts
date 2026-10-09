export function isMissingTotalAmountColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === 'PGRST204'
    && typeof candidate.message === 'string'
    && /total_amount.*bookings|bookings.*total_amount/i.test(candidate.message);
}

export function withoutTotalAmount<T extends Record<string, unknown>>(
  payload: T,
): Omit<T, 'total_amount'> {
  const { total_amount: _totalAmount, ...legacyPayload } = payload;
  return legacyPayload;
}
