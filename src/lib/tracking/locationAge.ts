export function getLocationAgeLabel(ageMinutes: number | null | undefined): string {
  if (ageMinutes == null || !Number.isFinite(ageMinutes)) return 'Last seen time unavailable';
  if (ageMinutes < 5) return 'LIVE';
  if (ageMinutes < 10) return 'Last seen 5 min ago';
  if (ageMinutes < 25) return 'Last seen 10 min ago';
  if (ageMinutes < 50) return 'Last seen 25 min ago';
  return 'Last seen 50+ min ago';
}
