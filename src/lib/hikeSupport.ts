import type { BookingMeta } from '@/types';

export const HORSE_HELP_OPTIONS = [
  { id: 'station-5-3', label: 'Station 5–3', fee: 1000 },
  { id: 'station-2-1', label: 'Station 2–1', fee: 500 },
] as const;

export type HorseHelpStation = (typeof HORSE_HELP_OPTIONS)[number]['id'];

export function getHorseHelpOption(station: string | null | undefined) {
  return HORSE_HELP_OPTIONS.find((option) => option.id === station);
}

export function addHorseHelpRequest(
  meta: BookingMeta,
  station: string,
  requestedBy: string,
  requestedAt: string,
): BookingMeta {
  const option = getHorseHelpOption(station);
  if (!option) throw new Error('Choose a valid horse-help station.');
  return {
    ...meta,
    horseHelpRequests: [
      ...(meta.horseHelpRequests ?? []),
      {
        station: option.id,
        stationLabel: option.label,
        fee: option.fee,
        requestedAt,
        requestedBy,
        status: 'requested',
      },
    ],
  };
}
