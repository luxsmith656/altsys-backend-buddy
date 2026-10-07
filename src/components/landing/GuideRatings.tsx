import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Award, Users, Search, ArrowRight } from 'lucide-react';
import { getTop3Guides, type GuideRating } from '@/lib/guideRatings';
import { supabase } from '@/integrations/supabase/client';
import { GUIDE_DIRECTORY, guidePhotoForName } from '@/lib/guideDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

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
  const navigate = useNavigate();
  const [guides, setGuides] = useState<GuideRating[]>([]);
  const [allGuidesOpen, setAllGuidesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const localRatings = getTop3Guides();
    const load = async () => {
      const { data } = await supabase.from('guides' as any).select('id,full_name,specialty,referral_code').eq('is_active', true).order('full_name').limit(60);
      const dbGuides = ((data as any[]) ?? []).map((guide) => ({
        guideId: guide.id,
        guideName: guide.full_name,
        trail: guide.specialty || 'Mt. Kalisungan local guide',
        totalRating: 0,
        reviewCount: 0,
        avgRating: 0,
        recentReviews: [],
        photoUrl: guidePhotoForName(guide.full_name),
        referralCode: guide.referral_code || null,
      } as GuideRating & { photoUrl?: string | null }));
      const source = dbGuides.length ? dbGuides : GUIDE_DIRECTORY.map((guide) => ({ guideId: guide.emailSlug, guideName: guide.name, trail: 'Mt. Kalisungan local guide', totalRating: 0, reviewCount: 0, avgRating: 0, recentReviews: [], photoUrl: guide.photoUrl }));
      setGuides(source.length ? source as GuideRating[] : localRatings);
    };
    void load();
  }, []);

  const top3Guides = useMemo(() => guides.slice(0, 3), [guides]);

  const filteredGuides = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return guides;
    return guides.filter(
      (g) => g.guideName.toLowerCase().includes(q) || g.trail.toLowerCase().includes(q)
    );
  }, [guides, searchQuery]);

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
            Our <span className="text-gradient">Top 3 Rated</span> Local Guides
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            These guides have earned the highest ratings from verified hikers. Rankings update automatically based on new reviews.
          </p>
        </motion.div>

        {/* Featured strictly top 3 guides */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {top3Guides.map((guide, i) => (
            <GuideCard
              key={guide.guideId}
              guide={guide}
              rank={i + 1}
              index={i}
              photoUrl={(guide as GuideRating & { photoUrl?: string | null }).photoUrl}
            />
          ))}
        </div>

        {/* View all guides button */}
        <div className="flex justify-center mt-10">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setAllGuidesOpen(true)}
            className="gap-2 px-6 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10 text-foreground shadow-sm"
          >
            <Users className="h-4 w-4 text-amber-500" />
            View All Accredited Guides ({guides.length})
          </Button>
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

      {/* Directory Modal */}
      <Dialog open={allGuidesOpen} onOpenChange={setAllGuidesOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Users className="h-5 w-5 text-primary" /> Accredited Local Guides Directory
            </DialogTitle>
            <DialogDescription>
              Meet our certified Mt. Kalisungan community guides. You may book directly with a guide's referral link or let the system auto-assign upon arrival.
            </DialogDescription>
          </DialogHeader>

          <div className="relative my-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search guides by name or specialty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs sm:text-sm h-9"
            />
          </div>

          <div className="overflow-y-auto space-y-2.5 pr-1 max-h-[50vh] mt-2">
            {filteredGuides.map((guide) => {
              const photo = (guide as any).photoUrl;
              return (
                <div
                  key={guide.guideId}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary font-black text-base">
                      {photo ? (
                        <img src={photo} alt={guide.guideName} className="h-11 w-11 rounded-full object-cover" />
                      ) : (
                        guide.guideName.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{guide.guideName}</p>
                      <p className="text-xs text-muted-foreground truncate">{guide.trail}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                          Accredited Guide
                        </Badge>
                        {guide.avgRating > 0 && (
                          <span className="text-xs font-semibold text-amber-500 flex items-center gap-0.5">
                            ★ {guide.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAllGuidesOpen(false);
                      const referralCode = (guide as GuideRating & { referralCode?: string | null }).referralCode;
                      if (referralCode) navigate(`/booking?referral=${encodeURIComponent(referralCode)}`);
                    }}
                    className="text-xs shrink-0 gap-1"
                  >
                    <span>Book with Referral</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {filteredGuides.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No guides found matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
