import { motion } from 'framer-motion';
import { Route, TrendingUp, Clock, BarChart2 } from 'lucide-react';
import { MOUNTAIN_FACTS, MOUNTAIN_ELEVATION_LABEL } from '@/lib/mountainFacts';

const trailStats = [
  {
    icon: Route,
    label: 'Trail Distance',
    value: '3 routes',
    desc: 'Distances come from each published route.',
  },
  {
    icon: TrendingUp,
    label: 'Elevation Gain',
    value: MOUNTAIN_ELEVATION_LABEL,
    desc: 'Official mountain elevation.',
  },
  {
    icon: Clock,
    label: 'Estimated Hiking Time',
    value: 'Published routes',
    desc: 'Timing comes from each published route record.',
  },
  {
    icon: BarChart2,
    label: 'Difficulty Level',
    value: MOUNTAIN_FACTS.difficulty,
    desc: 'Route-specific details come from the published route.',
  },
];

export default function TrailOverview() {
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
