export interface TrailheadIdentity {
  code: 'L1' | 'L2' | 'ST';
  label: 'Lamot 1' | 'Lamot 2' | 'Sto. Tomas';
}

export type OfficialTrailName = 'Lamot 2 Trail' | 'Lamot 1 Trail' | 'Sto. Tomas Trail';

/** Keep legacy public review labels inside the three official route names. */
export function officialPublicTrailName(routeName = ''): OfficialTrailName {
  const value = routeName.toLowerCase().replace(/[._-]/g, ' ');
  if (/lamot\s*1|ridge/.test(value)) return 'Lamot 1 Trail';
  if (/sto\s*tomas|santo tomas|scenic|plantation/.test(value)) return 'Sto. Tomas Trail';
  return 'Lamot 2 Trail';
}

export function getTrailheadIdentity(slug = '', name = ''): TrailheadIdentity | null {
  const value = `${slug} ${name}`.toLowerCase().replace(/[._]/g, ' ');
  if (/lamot[\s-]*1/.test(value)) return { code: 'L1', label: 'Lamot 1' };
  if (/lamot[\s-]*2/.test(value)) return { code: 'L2', label: 'Lamot 2' };
  if (/sto[\s-]*tomas|santo tomas/.test(value)) return { code: 'ST', label: 'Sto. Tomas' };
  return null;
}

/** The three public jump-off names used throughout booking, dispatch, and maps. */
export function trailheadLabel(slug = '', name = '', fallback = 'Assigned trailhead'): string {
  return getTrailheadIdentity(slug, name)?.label ?? fallback;
}

/** Resolve the official public name even when only a database location id is available. */
export function trailheadLabelFromLocation(
  locationId: string | null | undefined,
  slug = '',
  name = '',
  fallback = 'Assigned trailhead',
): string {
  return trailheadLabel(`${locationId ?? ''} ${slug}`, name, fallback);
}

/**
 * Return the only public route names that may appear in booking, maps, and
 * operations. Route rows created before the naming standard are normalized by
 * their location first, so an old database name cannot leak into the UI.
 */
export function officialTrailName(
  slug = '',
  locationName = '',
  routeName = '',
  fallback = 'Assigned trail',
): OfficialTrailName | string {
  const identity = getTrailheadIdentity(`${slug} ${locationName}`, routeName);
  if (identity?.code === 'L1') return 'Lamot 1 Trail';
  if (identity?.code === 'ST') return 'Sto. Tomas Trail';
  if (identity?.code === 'L2') return 'Lamot 2 Trail';

  // The original published Lamot 2 row was simply called "Summit Trail".
  // Preserve its identity when older rows do not carry location metadata.
  if (/summit\s+trail/i.test(routeName)) return 'Lamot 2 Trail';
  return fallback;
}

export function officialTrailNameFromLocation(
  locationId: string | null | undefined,
  slug = '',
  locationName = '',
  routeName = '',
  fallback = 'Assigned trail',
): OfficialTrailName | string {
  return officialTrailName(`${locationId ?? ''} ${slug}`, locationName, routeName, fallback);
}

export function filterByTrailhead<T extends { location_id?: string | null }>(
  rows: T[],
  selectedLocationId: string,
): T[] {
  return selectedLocationId === 'all'
    ? rows
    : rows.filter((row) => row.location_id === selectedLocationId);
}
