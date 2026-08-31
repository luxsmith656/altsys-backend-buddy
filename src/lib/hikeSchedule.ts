export type HikeType = 'morning' | 'night' | 'overnight' | 'day';

export interface HikeTimeOption {
  time: string;
  label: string;
  recommended?: boolean;
  notSuggested?: boolean;
}

export const HIKE_TIME_OPTIONS: Record<HikeType, HikeTimeOption[]> = {
  morning: [
    { time: '02:00 AM', label: 'Very Early' },
    { time: '03:00 AM', label: 'Early Start' },
    { time: '04:00 AM', label: 'Pre-dawn' },
    { time: '05:00 AM', label: 'Early Bird' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '07:00 AM', label: 'Morning' },
    { time: '08:00 AM', label: 'Latest Suggested' },
    { time: '10:00 AM', label: 'Very Late / Not Suggested', notSuggested: true },
  ],
  night: [
    { time: '02:00 PM', label: 'Early Afternoon', recommended: true },
    { time: '03:00 PM', label: 'Afternoon' },
    { time: '04:00 PM', label: 'Late Afternoon' },
    { time: '05:00 PM', label: 'Latest Start' },
  ],
  overnight: [
    { time: '02:00 PM', label: 'Early Afternoon', recommended: true },
    { time: '03:00 PM', label: 'Afternoon' },
    { time: '04:00 PM', label: 'Latest Start' },
  ],
  day: [
    { time: '04:30 AM', label: 'Very Early' },
    { time: '05:00 AM', label: 'Early Bird' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '07:00 AM', label: 'Morning' },
    { time: '08:00 AM', label: 'Late Start' },
  ],
};

export const GUIDE_FEE_BY_HIKE_TYPE = {
  morning: 800,
  night: 1000,
  overnight: 1600,
} as const;

export function normalizeHikeType(value?: string | null): keyof typeof GUIDE_FEE_BY_HIKE_TYPE {
  if (value === 'night') return 'night';
  if (value === 'overnight') return 'overnight';
  return 'morning';
}

export function getGuideFeePerGuide(value?: string | null): number {
  return GUIDE_FEE_BY_HIKE_TYPE[normalizeHikeType(value)];
}

export function isValidHikeTime(type: HikeType, time: string): boolean {
  if (type === 'day') return HIKE_TIME_OPTIONS.morning.some((option) => option.time === time);
  return HIKE_TIME_OPTIONS[type].some((option) => option.time === time);
}

export function getHikeTypeLabel(type?: string | null): string {
  if (type === 'night') return 'Night';
  if (type === 'overnight') return 'Overnight';
  return 'Morning';
}
