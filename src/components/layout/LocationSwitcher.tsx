import { useLocations } from '@/hooks/useLocations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin } from 'lucide-react';

interface Props {
  /** When true, allow "All locations" (super_admin overview). */
  allowAll?: boolean;
  /** Constrain to user's mapped locations. */
  scope?: 'all' | 'mine';
  className?: string;
}

export default function LocationSwitcher({ allowAll = false, scope = 'all', className }: Props) {
  const { locations, myLocations, activeLocationId, setActiveLocationId, isSuperAdmin } = useLocations();

  const list = (scope === 'mine' && !isSuperAdmin ? myLocations : locations)
    .filter((loc) => !loc.name.toLowerCase().includes('mount kalisungan') && loc.slug !== 'mt-kalisungan');

  return (
    <div className={`flex min-w-0 max-w-full flex-1 items-center gap-2 sm:flex-initial ${className || ''}`}>
      <MapPin className="h-4 w-4 shrink-0 text-primary" />
      <Select
        value={activeLocationId ?? '__all__'}
        onValueChange={(v) => setActiveLocationId(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[220px] sm:flex-none">
          <SelectValue placeholder="Select location" />
        </SelectTrigger>
        <SelectContent className="z-[3100]">
          {allowAll && isSuperAdmin && (
            <SelectItem value="__all__">All locations (LGU view)</SelectItem>
          )}
          {list.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}{loc.lgu ? ` — ${loc.lgu}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
