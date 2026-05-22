import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { OfflineTileLayer } from '@/lib/tracking/tileCache';

interface Props {
  url: string;
  maxZoom?: number;
  attribution?: string;
}

/** Drop-in replacement for <TileLayer/> that caches tiles in IndexedDB. */
export default function OfflineLayer({ url, maxZoom = 19, attribution }: Props) {
  const map = useMap();
  useEffect(() => {
    const layer = new (OfflineTileLayer as any)(url, { maxZoom, attribution }) as L.TileLayer;
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, url, maxZoom, attribution]);
  return null;
}
