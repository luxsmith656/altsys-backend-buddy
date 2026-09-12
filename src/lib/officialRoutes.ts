export interface OfficialRouteCandidate {
  id: string;
  location_id?: string | null;
  status?: string;
  is_official?: boolean;
  review_status?: string;
  coordinates_json?: unknown;
}

export function officialRoutesForLocation<T extends OfficialRouteCandidate>(routes: T[], locationId?: string | null): T[] {
  return routes.filter((route) => {
    if (route.status !== 'active' || route.is_official !== true || route.review_status !== 'approved') return false;
    if (locationId && route.location_id !== locationId) return false;
    if (!Array.isArray(route.coordinates_json) || route.coordinates_json.length < 2) return false;
    return route.coordinates_json.every((point: unknown) => {
      if (!point || typeof point !== 'object' || !('lat' in point) || !('lng' in point)) return false;
      const { lat, lng } = point;
      return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
        && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    });
  });
}

export function selectAssignedOfficialRoute<T extends OfficialRouteCandidate>(routes: T[], assignedId?: string | null): T | null {
  if (assignedId) return routes.find((route) => route.id === assignedId) ?? null;
  return routes.length === 1 ? routes[0] : null;
}
