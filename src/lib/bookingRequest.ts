export const BOOKING_REQUEST_TIMEOUT_MS = 20000;

export async function withBookingRequestTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  label: string,
  timeoutMs = BOOKING_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} took too long. Check your connection and try again.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(request(controller.signal)), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
