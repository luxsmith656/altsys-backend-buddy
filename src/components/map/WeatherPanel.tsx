import { useEffect, useState } from 'react';
import { Cloud, CloudRain, Wind, Thermometer, AlertTriangle, CheckCircle2, RefreshCw, ChevronDown } from 'lucide-react';
import { fetchWeather, adviseRoute, type WeatherSnapshot, type RouteAdvice } from '@/lib/weather';
import { Button } from '@/components/ui/button';

interface Props {
  lat: number;
  lng: number;
  /** Optional callback so MapPage can switch to safer trail. */
  onAdvice?: (advice: RouteAdvice) => void;
}

export default function WeatherPanel({ lat, lng, onAdvice }: Props) {
  const [w, setW] = useState<WeatherSnapshot | null>(null);
  const [advice, setAdvice] = useState<RouteAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const snap = await fetchWeather(lat, lng);
      const adv = adviseRoute(snap);
      setW(snap); setAdvice(adv);
      onAdvice?.(adv);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load weather');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 10 * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const tone =
    advice?.level === 'avoid' ? 'border-destructive/40 bg-destructive/10' :
    advice?.level === 'caution' ? 'border-amber-400/40 bg-amber-400/10' :
    'border-emerald-400/40 bg-emerald-400/10';

  return (
    <div className={`glass-card rounded-lg text-xs border ${tone} max-w-xs`}>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 flex items-center justify-center hover:bg-background/40 transition-colors"
          aria-label="Show weather routing"
        >
          {advice?.level === 'avoid' ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
           advice?.level === 'caution' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
           <Cloud className="h-4 w-4 text-emerald-500" />}
        </button>
      ) : (
      <div className="p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-semibold">
          {advice?.level === 'avoid' ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
           advice?.level === 'caution' ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
           <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          <span>Weather routing</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={load} disabled={loading} aria-label="Refresh weather">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCollapsed(true)} aria-label="Collapse weather">
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {err && <div className="text-destructive text-[11px]">{err}</div>}

      {w && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <div className="rounded bg-secondary/40 p-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><Thermometer className="h-3 w-3" />Temp</div>
              <div className="font-semibold">{Math.round(w.tempC)}°C</div>
            </div>
            <div className="rounded bg-secondary/40 p-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><Wind className="h-3 w-3" />Wind</div>
              <div className="font-semibold">{Math.round(w.windKmh)} km/h</div>
            </div>
            <div className="rounded bg-secondary/40 p-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><CloudRain className="h-3 w-3" />6h rain</div>
              <div className="font-semibold">{w.precipNext6hMm} mm</div>
            </div>
          </div>
          {advice && (
            <>
              <div className="font-medium mb-1">{advice.headline}</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {advice.reasons.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </>
          )}
        </>
      )}

      {!w && !err && <div className="flex items-center gap-1 text-muted-foreground"><Cloud className="h-3 w-3" /> Loading…</div>}
      </div>
      )}
    </div>
  );
}
