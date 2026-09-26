import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Award, Users } from 'lucide-react';
import { getTop3Guides, type GuideRating } from '@/lib/guideRatings';
import { supabase } from '@/integrations/supabase/client';
import { GUIDE_DIRECTORY, guidePhotoForName } from '@/lib/guideDirectory';

function StarDisplay({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className={`${cls} fill-amber-400 text-amber-400`} />
      ))}
      {half && <Star className={`${cls} fill-amber-400/50 text-amber-400`} />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className={`${cls} text-border`} />
      ))}
    </span>
  );
}

function GuideCard({ guide, rank, index, photoUrl }: { guide: GuideRating; rank: number; index: number; photoUrl?: string | null }) {
  const rankColors = ['text-amber-500', 'text-slate-400', 'text-amber-700'];
  const rankBg = ['bg-amber-500/10 border-amber-400/30', 'bg-slate-400/10 border-slate-400/30', 'bg-amber-700/10 border-amber-700/30'];
  const rankLabel = ['🥇 Top Guide', '🥈 2nd Best', '🥉 3rd Best'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="cinematic-card flex flex-col gap-4 p-6 relative overflow-hidden"
    >
      {/* Rank badge */}
      <div className={`absolute top-4 right-4 px-2.5 py-1 rounded-full border text-xs font-bold ${rankBg[rank - 1]} ${rankColors[rank - 1]}`}>
        {rankLabel[rank - 1]}
      </div>

      {/* Avatar + name */}
      <div className="flex items-center gap-4 pr-20">
        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-black text-2xl">
          {photoUrl ? <img src={photoUrl} alt={guide.guideName} className="h-14 w-14 rounded-full object-cover" /> : guide.guideName.charAt(0)}
        </div>
        <div>
          <p className="font-bold text-base leading-tight">{guide.guideName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{guide.trail}</p>
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-3">
        <StarDisplay rating={guide.avgRating} size="lg" />
        <div>
          <span className="text-2xl font-black text-amber-500">{guide.avgRating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground ml-1">/ 5</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {guide.reviewCount} reviews
        </span>
        <span className="flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 text-primary" />
          Licensed Local Guide
        </span>
      </div>

      {/* Top review snippet */}
      {guide.recentReviews[0] && (
        <div className="border-t border-border/10 pt-3 space-y-1">
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            &ldquo;{guide.recentReviews[0].comment}&rdquo;
          </p>
          <p className="text-[11px] text-muted-foreground/60">— {guide.recentReviews[0].hikerName}</p>
        </div>
      )}
    </motion.div>
  );
}

export default function GuideRatings() {
  const [guides, setGuides] = useState<GuideRating[]>([]);

  useEffect(() => {
    const localRatings = getTop3Guides();
    const load = async () => {
      const { data } = await supabase.from('guides' as any).select('id,full_name,specialty').eq('is_active', true).order('full_name').limit(60);
      const dbGuides = ((data as any[]) ?? []).map((guide) => ({
        guideId: guide.id,
        guideName: guide.full_name,
        trail: guide.specialty || 'Mt. Kalisungan local guide',
        totalRating: 0,
        reviewCount: 0,
        avgRating: 0,
        recentReviews: [],
        photoUrl: guidePhotoForName(guide.full_name),
      } as GuideRating & { photoUrl?: string | null }));
      const source = dbGuides.length ? dbGuides : GUIDE_DIRECTORY.map((guide) => ({ guideId: guide.emailSlug, guideName: guide.name, trail: 'Mt. Kalisungan local guide', totalRating: 0, reviewCount: 0, avgRating: 0, recentReviews: [], photoUrl: guide.photoUrl }));
      setGuides(source.length ? source as GuideRating[] : localRatings);
    };
    void load();
  }, []);

  if (guides.length === 0) return null;

  return (
    <section className="py-20 px-4 bg-background/50 relative">
      <div className="container max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-600 mb-3">
            <span className="h-px w-7 bg-amber-500/50" />
            Verified Hiker Ratings
            <span className="h-px w-7 bg-amber-500/50" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Our <span className="text-gradient">Top Rated</span> Local Guides
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            These guides have earned the highest ratings from verified hikers. Rankings update automatically based on new reviews.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {guides.map((guide, i) => (
            <GuideCard key={guide.guideId} guide={guide} rank={(i % 3) + 1} index={i} photoUrl={(guide as GuideRating & { photoUrl?: string | null }).photoUrl} />
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs text-muted-foreground/60 mt-8"
        >
          Rankings are based on verified post-hike ratings submitted by hikers who completed their trek. Updated in real-time.
        </motion.p>
      </div>
    </section>
  );
}
