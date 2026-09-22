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
    { time: '04:00 AM', label: 'Very Early' },
    { time: '05:00 AM', label: 'Early Bird' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '07:00 AM', label: 'Morning' },
    { time: '08:00 AM', label: 'Late Start' },
  ],
};

export { GUIDE_FEE_BY_HIKE_TYPE, normalizeHikeType, getGuideFeePerGuide } from '../../supabase/functions/_shared/hike-fees';

export function isValidHikeTime(type: HikeType, time: string): boolean {
  if (type === 'day') return HIKE_TIME_OPTIONS.morning.some((option) => option.time === time);
  return HIKE_TIME_OPTIONS[type].some((option) => option.time === time);
}

export function getHikeTypeLabel(type?: string | null): string {
  if (type === 'night') return 'Night';
  if (type === 'overnight') return 'Overnight';
  return 'Morning';
}
