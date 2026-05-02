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

  const list = scope === 'mine' && !isSuperAdmin ? myLocations : locations;

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <MapPin className="h-4 w-4 text-primary" />
      <Select
        value={activeLocationId ?? '__all__'}
        onValueChange={(v) => setActiveLocationId(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[220px] h-9">
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
