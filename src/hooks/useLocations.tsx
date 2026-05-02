import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
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
  setActiveLocationId: (id: string | null) => void;
  isSuperAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LocationsContextValue | undefined>(undefined);

export function LocationsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [myLocationIds, setMyLocationIds] = useState<string[]>([]);
  const [activeLocationId, _setActiveLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = role === ('super_admin' as any);

  const setActiveLocationId = (id: string | null) => {
    _setActiveLocationId(id);
    if (id) localStorage.setItem('activeLocationId', id);
    else localStorage.removeItem('activeLocationId');
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: locs } = await supabase
      .from('locations' as any)
      .select('*')
      .order('name');

    const list = (locs as unknown as LocationRow[] | null) ?? [];
    setLocations(list);

    if (user) {
      const { data: maps } = await supabase
        .from('user_locations' as any)
        .select('location_id')
        .eq('user_id', user.id);
      const ids = ((maps as any[] | null) ?? []).map((m) => m.location_id);
      setMyLocationIds(ids);

      // Choose default active location
      const stored = localStorage.getItem('activeLocationId');
      if (stored && list.some((l) => l.id === stored)) {
        _setActiveLocationId(stored);
      } else if (!isSuperAdmin && ids.length > 0) {
        _setActiveLocationId(ids[0]);
      } else if (isSuperAdmin) {
        _setActiveLocationId(null); // All
      } else if (list.length > 0) {
        _setActiveLocationId(list[0].id); // Hikers default to first active location
      }
    } else {
      setMyLocationIds([]);
      if (list.length > 0) _setActiveLocationId(list[0].id);
    }
    setLoading(false);
  }, [user, isSuperAdmin]);

  useEffect(() => { void refresh(); }, [refresh]);

  const myLocations = locations.filter((l) => myLocationIds.includes(l.id));

  return (
    <Ctx.Provider value={{ locations, myLocations, activeLocationId, setActiveLocationId, isSuperAdmin, loading, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLocations() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocations must be used inside LocationsProvider');
  return ctx;
}
