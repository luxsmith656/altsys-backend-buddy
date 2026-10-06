export function validateCapacitySplit(total: number, day: number, night: number): string | null {
  if (!Number.isInteger(total) || total < 1) return 'Total carrying capacity must be at least 1.';
  if (!Number.isInteger(day) || !Number.isInteger(night) || day < 0 || night < 0) {
    return 'Day and night limits must be whole numbers of 0 or more.';
  }
  if (day + night > total) return 'Day and night limits cannot add up to more than the total carrying capacity.';
  return null;
}

export function validateCapacityAgainstReservations(total: number, day: number, night: number, currentTotal: number, currentDay: number, currentNight: number): string | null {
  const splitError = validateCapacitySplit(total, day, night);
  if (splitError) return splitError;
  if (total < currentTotal) return `Total capacity cannot be below the ${currentTotal} hikers already booked.`;
  if (day < currentDay) return `Day capacity cannot be below the ${currentDay} day hikers already booked.`;
  if (night < currentNight) return `Night capacity cannot be below the ${currentNight} night hikers already booked.`;
  return null;
}
