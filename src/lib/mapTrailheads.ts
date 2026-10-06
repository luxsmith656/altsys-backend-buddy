export interface TrailheadIdentity {
  code: 'L1' | 'L2' | 'ST';
  label: 'Lamot 1' | 'Lamot 2' | 'Sto. Tomas';
}

export function getTrailheadIdentity(slug = '', name = ''): TrailheadIdentity | null {
  const value = `${slug} ${name}`.toLowerCase().replace(/[._]/g, ' ');
  if (/lamot[\s-]*1/.test(value)) return { code: 'L1', label: 'Lamot 1' };
  if (/lamot[\s-]*2/.test(value)) return { code: 'L2', label: 'Lamot 2' };
  if (/sto[\s-]*tomas|santo tomas/.test(value)) return { code: 'ST', label: 'Sto. Tomas' };
  return null;
}

export function filterByTrailhead<T extends { location_id?: string | null }>(
  rows: T[],
  selectedLocationId: string,
): T[] {
  return selectedLocationId === 'all'
    ? rows
    : rows.filter((row) => row.location_id === selectedLocationId);
}
