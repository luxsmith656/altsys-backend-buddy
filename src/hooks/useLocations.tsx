import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LocationRow {
  id: string;
  name: string;
  slug: string;
  lgu: string;
  region: string;
  address: string;
  center_lat: number;
  center_lng: number;
  status: string;
  entry_fee: number;
  default_guide_fee: number;
  currency: string;
  description: string;
}

interface LocationsContextValue {
  locations: LocationRow[];
  /** Locations the current user is mapped to (admin/staff/guide). Empty for super_admin or hikers. */
  myLocations: LocationRow[];
  /** Currently active location for filtering. null = "All locations" (super_admin only). */
  activeLocationId: string | null;
  activeLocation: LocationRow | null;
  setActiveLocationId: (id: string | null) => void;
  isSuperAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_LOCATIONS: LocationRow[] = [
  {
    id: 'loc-lamot-1',
    name: 'Sitio Lamot 1',
    slug: 'lamot-1',
    lgu: 'Calauan',
    region: 'Laguna',
    address: 'Sitio Lamot 1, Brgy. Lamot 1, Calauan, Laguna',
    center_lat: 14.147385047365747,
    center_lng: 121.32372794241525,
    status: 'active',
    entry_fee: 50,
    default_guide_fee: 600,
    currency: 'PHP',
    description: 'Main jump-off point for Mt. Kalisungan summit trail.',
  },
  {
    id: 'loc-lamot-2',
    name: 'Sitio Lamot 2',
    slug: 'lamot-2',
    lgu: 'Calauan',
    region: 'Laguna',
    address: 'Sitio Lamot 2, Brgy. Lamot 2, Calauan, Laguna',
    center_lat: 14.1420,
    center_lng: 121.3410,
    status: 'active',
    entry_fee: 50,
    default_guide_fee: 600,
    currency: 'PHP',
    description: 'Secondary jump-off with scenic plantation trails.',
  },
  {
    id: 'loc-sto-tomas',
    name: 'Brgy. Sto. Tomas',
    slug: 'sto-tomas',
    lgu: 'Calauan',
    region: 'Laguna',
    address: 'Brgy. Sto. Tomas, Calauan, Laguna',
    center_lat: 14.166631,
    center_lng: 121.339746,
    status: 'active',
    entry_fee: 50,
    default_guide_fee: 600,
    currency: 'PHP',
    description: 'Alternative southern route towards Mt. Kalisungan ridge.',
  },
];

function getInitialLocations(): LocationRow[] {
  if (typeof window === 'undefined') return DEFAULT_LOCATIONS;
  try {
    const raw = localStorage.getItem('cached_locations');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCATIONS;
}

const Ctx = createContext<LocationsContextValue | undefined>(undefined);

const userLocationsCacheKey = (userId: string) => `cached_user_locations:${userId}`;

function readCachedUserLocations(userId: string | undefined): string[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(userLocationsCacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function LocationsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [locations, setLocations] = useState<LocationRow[]>(getInitialLocations);
  const [myLocationIds, setMyLocationIds] = useState<string[]>([]);
  const [activeLocationId, _setActiveLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const resolvedIdentity = useRef<string | null>(null);
  const identity = `${user?.id || 'guest'}:${role || ''}`;

  const isSuperAdmin = role === 'super_admin';
  const isAllLocationRole = role === 'super_admin' || role === 'mdrrmo';
  const isMappedLocationRole = role === 'admin' || role === 'ranger' || role === 'guide';

  const setActiveLocationId = (id: string | null) => {
    // Trailhead staff can never widen their scope beyond their assigned station(s).
    if (isMappedLocationRole && (id === null || !myLocationIds.includes(id))) return;
    _setActiveLocationId(id);
    if (id) localStorage.setItem('activeLocationId', id);
    else localStorage.setItem('activeLocationId', 'all');
  };

  const chooseActive = useCallback((ids: string[]) => {
    const stored = localStorage.getItem('activeLocationId');
    if (isAllLocationRole) {
      _setActiveLocationId(stored && stored !== 'all' ? stored : null);
    } else if (stored && ids.includes(stored)) {
      _setActiveLocationId(stored);
    } else {
      _setActiveLocationId(ids[0] ?? null);
    }
  }, [isAllLocationRole]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const needsScope = Boolean(user) && isMappedLocationRole;

    // Use the last known station mapping immediately so the dashboard is scoped on first paint.
    if (user) {
      const cachedIds = readCachedUserLocations(user.id);
      if (cachedIds.length > 0) {
        setMyLocationIds(cachedIds);
        chooseActive(cachedIds);
      } else if (needsScope) {
        setLoading(true);
      }
    }

    try {
      const { data: locs } = await supabase.from('locations' as any).select('*').order('name');
      if (version !== requestVersion.current) return;

      const list = (locs as unknown as LocationRow[] | null) ?? [];
      if (list.length > 0) {
        setLocations(list);
        try {
          localStorage.setItem('cached_locations', JSON.stringify(list));
        } catch {
          /* ignore */
        }
      }

      if (user) {
        // No artificial timeout here: dropping a trailhead admin to "all locations" on a slow
        // network leaked other stations' routes and data into their dashboard.
        const { data: maps, error: mapsError } = await supabase
          .from('user_locations' as any)
          .select('location_id')
          .eq('user_id', user.id);

        if (version !== requestVersion.current) return;
        if (mapsError) throw mapsError;
        let ids = ((maps as any[] | null) ?? []).map((m) => m.location_id).filter(Boolean);

        // Fallback for local admins when user_locations row is not in DB yet (e.g., lamot2, lamot1, stotomas):
        if (ids.length === 0 && (role === 'admin' || isMappedLocationRole)) {
          const userEmail = user.email?.toLowerCase().trim() || '';
          let matchedLocKey: string | null = null;
          try {
            const raw = localStorage.getItem('mtk_managed_admins');
            if (raw) {
              const managed = JSON.parse(raw);
              if (Array.isArray(managed)) {
                const match = managed.find((a: any) => a.email?.toLowerCase() === userEmail || a.userId === user.id);
                if (match?.locationId) matchedLocKey = match.locationId;
              }
            }
          } catch { /* Keep resolving the location if optional local cache is invalid. */ }

          if (!matchedLocKey) {
            if (userEmail.includes('lamot2') || userEmail.includes('lamot 2')) matchedLocKey = 'lamot-2';
            else if (userEmail.includes('lamot1') || userEmail.includes('lamot 1')) matchedLocKey = 'lamot-1';
            else if (userEmail.includes('tomas')) matchedLocKey = 'sto-tomas';
          }

          if (matchedLocKey) {
            const targetLoc = (list.length > 0 ? list : DEFAULT_LOCATIONS).find((l) =>
              l.id === matchedLocKey ||
              l.slug === matchedLocKey ||
              l.slug.replace(/[^a-z0-9]/g, '') === matchedLocKey!.replace(/[^a-z0-9]/g, '') ||
              l.name.toLowerCase().includes(matchedLocKey!.toLowerCase())
            );
            if (targetLoc) ids = [targetLoc.id];
          }
        }

        setMyLocationIds(ids);
        try {
          localStorage.setItem(userLocationsCacheKey(user.id), JSON.stringify(ids));
        } catch {
          /* ignore */
        }
        chooseActive(ids);
      } else {
        setMyLocationIds([]);
        if (list.length > 0) {
          _setActiveLocationId(list[0].id);
        }
      }
    } catch (err) {
      console.warn('Locations fetch warning:', err);
    } finally {
      if (version === requestVersion.current) {
        resolvedIdentity.current = identity;
        setLoading(false);
      }
    }
  }, [user, identity, isMappedLocationRole, chooseActive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myLocations = locations.filter((l) => myLocationIds.includes(l.id));
  const activeLocation = locations.find((l) => l.id === activeLocationId) || null;

  return (
    <Ctx.Provider
      value={{
        locations,
        myLocations,
        activeLocationId,
        activeLocation,
        setActiveLocationId,
        isSuperAdmin,
        loading: loading || (Boolean(user) && resolvedIdentity.current !== identity),
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLocations() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      locations: DEFAULT_LOCATIONS,
      myLocations: [],
      activeLocationId: null,
      activeLocation: DEFAULT_LOCATIONS[0],
      setActiveLocationId: () => {},
      isSuperAdmin: false,
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
