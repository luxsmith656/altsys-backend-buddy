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
    center_lat: 14.1475,
    center_lng: 121.3454,
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
    center_lat: 14.1350,
    center_lng: 121.3500,
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
    _setActiveLocationId(id);
    if (id) localStorage.setItem('activeLocationId', id);
    else localStorage.setItem('activeLocationId', 'all');
  };

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const { data: locs } = await Promise.race([
        supabase.from('locations' as any).select('*').order('name'),
        new Promise<{ data: null }>((r) => setTimeout(() => r({ data: null }), 3000)),
      ]);

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
        const { data: maps } = await Promise.race([
          supabase.from('user_locations' as any).select('location_id').eq('user_id', user.id),
          new Promise<{ data: null }>((r) => setTimeout(() => r({ data: null }), 2500)),
        ]);

        if (version !== requestVersion.current) return;
        const ids = ((maps as any[] | null) ?? []).map((m) => m.location_id);
        setMyLocationIds(ids);

        // Choose default active location
        const stored = localStorage.getItem('activeLocationId');
        if (isAllLocationRole && stored === 'all') {
          _setActiveLocationId(null);
        } else if (isMappedLocationRole && stored && ids.includes(stored)) {
          _setActiveLocationId(stored);
        } else if (isAllLocationRole) {
          _setActiveLocationId(null);
        } else if (ids.length > 0) {
          _setActiveLocationId(ids[0]);
        } else {
          _setActiveLocationId(null);
        }
      } else {
        setMyLocationIds([]);
        if (list.length > 0) {
          _setActiveLocationId(list[0].id);
        }
      }
    } catch (err) {
      console.warn('Locations fetch warning:', err);
    } finally {
      resolvedIdentity.current = identity;
      setLoading(false);
    }
  }, [user, identity, isAllLocationRole, isMappedLocationRole]);

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
        loading: loading && locations.length === 0,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLocations() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocations must be used inside LocationsProvider');
  return ctx;
}
