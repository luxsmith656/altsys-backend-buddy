/** Human-readable distance for live movement and trail summaries. */
export function formatDistanceM(meters: number | null | undefined): string {
  const value = Number(meters ?? 0);
  if (!Number.isFinite(value)) return '0 m';
  if (Math.abs(value) < 1000) return `${Math.max(0, Math.round(value))} m`;
  return `${(value / 1000).toFixed(2)} km`;
}
