export function validateCapacitySplit(total: number, day: number, night: number): string | null {
  if (!Number.isInteger(total) || total < 1) return 'Total carrying capacity must be at least 1.';
  if (!Number.isInteger(day) || !Number.isInteger(night) || day < 0 || night < 0) {
    return 'Day and night limits must be whole numbers of 0 or more.';
  }
  if (day + night > total) return 'Day and night limits cannot add up to more than the total carrying capacity.';
  return null;
}
