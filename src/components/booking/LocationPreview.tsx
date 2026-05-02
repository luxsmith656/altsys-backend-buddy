import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  name: string;
  lgu?: string;
  lat: number;
  lng: number;
  description?: string;
}

/**
 * Small embedded Leaflet map shown to hikers BEFORE confirming a booking,
 * so they can see exactly where their selected start location (e.g. Lamot 1)
 * is on the mountain and avoid confusion at the trailhead.
 */
export default function LocationPreview({ name, lgu, lat, lng, description }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }
    mapRef.current.setView([lat, lng], 15);

    // Replace marker
    mapRef.current.eachLayer((layer) => {
      if ((layer as any).options?.icon) mapRef.current?.removeLayer(layer);
    });
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:hsl(var(--primary));width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(mapRef.current);

    return () => {
      // Don't destroy on rerender — only on unmount
    };
  }, [lat, lng]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

  return (
    <Card className="glass-card border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <h3 className="font-semibold">{name}</h3>
              {lgu && <Badge variant="outline" className="text-[10px]">{lgu}</Badge>}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          </div>
        </div>

        <div
          ref={ref}
          className="w-full h-[260px] rounded-lg overflow-hidden border border-border/30 bg-secondary/30"
          style={{ zIndex: 0 }}
        />

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="h-3.5 w-3.5 mr-1.5" /> Open in Google Maps
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={osmUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View on OSM
            </a>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          ⚠️ Please review this map carefully — this is exactly where your hike will start.
        </p>
      </CardContent>
    </Card>
  );
}
