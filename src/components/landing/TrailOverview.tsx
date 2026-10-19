import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Route, TrendingUp, Clock, BarChart2 } from 'lucide-react';
import { MOUNTAIN_FACTS, MOUNTAIN_ELEVATION_LABEL } from '@/lib/mountainFacts';
import { haversineDistance } from '@/lib/map-data';
import { supabase } from '@/integrations/supabase/client';

type RouteStats = { count: number; shortestKm: number | null; longestKm: number | null };

const fallbackRouteStats: RouteStats = { count: 0, shortestKm: null, longestKm: null };

function routeDistanceKm(points: unknown): number | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1] as any;
    const current = points[i] as any;
    const lat1 = Number(previous?.lat ?? previous?.[0]);
    const lng1 = Number(previous?.lng ?? previous?.lon ?? previous?.[1]);
    const lat2 = Number(current?.lat ?? current?.[0]);
    const lng2 = Number(current?.lng ?? current?.lon ?? current?.[1]);
    if ([lat1, lng1, lat2, lng2].every(Number.isFinite)) total += haversineDistance(lat1, lng1, lat2, lng2);
  }
  return total > 0 ? total : null;
}

function buildTrailStats(stats: RouteStats) {
  const distance = stats.shortestKm === null
    ? 'Not published'
    : stats.shortestKm === stats.longestKm
      ? `${stats.shortestKm.toFixed(1)} km`
      : `${stats.shortestKm.toFixed(1)}–${stats.longestKm?.toFixed(1)} km`;
  return [
  {
    icon: Route,
    label: 'Trail Distance',
    value: distance,
    desc: stats.count ? `Measured from ${stats.count} published route${stats.count === 1 ? '' : 's'}.` : 'Published route distance is not available yet.',
  },
  {
    icon: TrendingUp,
    label: 'Summit Elevation',
    value: MOUNTAIN_ELEVATION_LABEL,
    desc: 'Official Mt. Kalisungan summit elevation.',
  },
  {
    icon: Clock,
    label: 'Typical Hiking Time',
    value: '2.5–4 hours',
    desc: 'Approximate summit time; actual pace varies by route and conditions.',
  },
  {
    icon: BarChart2,
    label: 'Difficulty Level',
    value: MOUNTAIN_FACTS.difficulty,
    desc: 'Route-specific details come from the published route.',
  },
  ];
}

export default function TrailOverview() {
  const [routeStats, setRouteStats] = useState<RouteStats>(fallbackRouteStats);

  useEffect(() => {
    let mounted = true;
    void supabase.from('trail_zones' as any)
      .select('coordinates_json,status,is_official,review_status')
      .eq('status', 'active').eq('is_official', true).eq('review_status', 'approved')
      .then(({ data }) => {
        if (!mounted || !Array.isArray(data)) return;
        const distances = data.map((route: any) => routeDistanceKm(route.coordinates_json)).filter((distance): distance is number => distance !== null);
        setRouteStats({
          count: distances.length,
          shortestKm: distances.length ? Math.min(...distances) : null,
          longestKm: distances.length ? Math.max(...distances) : null,
        });
      });
    return () => { mounted = false; };
  }, []);

  const trailStats = buildTrailStats(routeStats);
  return (
    <section className="py-24 px-4 relative overflow-hidden section-dot-pattern">
      {/* Subtle decorative blurs */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Trail <span className="text-gradient">Overview</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {trailStats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="cinematic-card p-7"
            >
              {/* Icon container – muted green square, light & dark */}
              <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-primary/20 flex items-center justify-center mb-5">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>

              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.15em] mb-2 font-semibold">
                {stat.label}
              </p>
              <p className="text-3xl font-black mb-3 tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">{stat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
