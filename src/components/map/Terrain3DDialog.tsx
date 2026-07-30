import { lazy, Suspense } from 'react';
import type { LatLngTuple } from 'leaflet';
import { Box, Mountain, Route } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { RouteStation } from '@/lib/map-data';

const Terrain3DScene = lazy(() => import('@/components/map/Terrain3DScene'));

interface Terrain3DDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeName: string;
  routePath: LatLngTuple[];
  stations: RouteStation[];
}

export default function Terrain3DDialog({
  open,
  onOpenChange,
  routeName,
  routePath,
  stations,
}: Terrain3DDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[3500] flex h-[min(92dvh,52rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-lg p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-background px-4 py-3 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
            <Mountain className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">Mt. Kalisungan 3D Terrain</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Route className="h-3.5 w-3.5 text-sky-500" />
              {routeName}
            </span>
            <span className="inline-flex items-center gap-1">
              <Box className="h-3.5 w-3.5 text-emerald-500" />
              Demand-rendered for mobile
            </span>
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-[#dbe6df]">
          {open && (
            <Suspense
              fallback={(
                <div className="absolute inset-0 flex items-center justify-center bg-[#dbe6df]">
                  <div className="text-center">
                    <Mountain className="mx-auto h-8 w-8 animate-pulse text-primary" />
                    <p className="mt-2 text-sm font-medium text-slate-800">Loading terrain...</p>
                    <p className="text-xs text-slate-600">Preparing local elevation data</p>
                  </div>
                </div>
              )}
            >
              <Terrain3DScene routePath={routePath} stations={stations} />
            </Suspense>
          )}
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-end justify-between gap-2 text-[10px] text-slate-700">
            <span className="rounded bg-white/85 px-2 py-1 shadow">
              Drag to rotate, pinch or scroll to zoom
            </span>
            <span className="rounded bg-white/85 px-2 py-1 text-right shadow">
              Elevation: AWS Open Terrain DEM | Map: © OpenStreetMap contributors
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
