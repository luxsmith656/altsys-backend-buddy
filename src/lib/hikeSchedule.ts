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
    { time: '04:00 AM', label: 'Pre-dawn' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '08:00 AM', label: 'Morning' },
    { time: '10:00 AM', label: 'Late Morning' },
  ],
  night: [
    { time: '02:00 PM', label: 'Early Afternoon' },
    { time: '04:00 PM', label: 'Late Afternoon' },
    { time: '06:00 PM', label: 'Sunset / Dusk' },
    { time: '08:00 PM', label: 'Evening Trek' },
    { time: '10:00 PM', label: 'Summit at Dawn', recommended: true },
    { time: '12:00 AM', label: 'Midnight Trek' },
  ],
  overnight: [
    { time: '02:00 PM', label: 'Early Afternoon', recommended: true },
    { time: '04:00 PM', label: 'Late Afternoon' },
    { time: '06:00 PM', label: 'Sunset Camp' },
    { time: '08:00 PM', label: 'Night Camp' },
    { time: '10:00 PM', label: 'Midnight Camp' },
  ],
  day: [
    { time: '04:00 AM', label: 'Pre-dawn' },
    { time: '06:00 AM', label: 'Most Popular', recommended: true },
    { time: '08:00 AM', label: 'Morning' },
    { time: '10:00 AM', label: 'Late Morning' },
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
