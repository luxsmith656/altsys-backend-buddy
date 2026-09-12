export const GUIDE_FEE_BY_HIKE_TYPE = { morning: 800, night: 1000, overnight: 1600 } as const;
export function normalizeHikeType(value?: string | null): keyof typeof GUIDE_FEE_BY_HIKE_TYPE {
  return value === 'night' || value === 'overnight' ? value : 'morning';
}
export function getGuideFeePerGuide(value?: string | null): number {
  return GUIDE_FEE_BY_HIKE_TYPE[normalizeHikeType(value)];
}
