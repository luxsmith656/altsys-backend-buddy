import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Mountain, Quote, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { officialPublicTrailName } from '@/lib/mapTrailheads';

type FeaturedReview = {
  id: string;
  reviewer_name: string;
  review_text: string;
  trail_name: string;
  rating: number;
  difficulty?: string | null;
  photo_url?: string | null;
};

const fallback: FeaturedReview = {
  id: 'featured-placeholder', reviewer_name: 'A fellow Kalisungan hiker',
  review_text: 'Published trail stories from the Kalisungan community will appear here.',
  trail_name: 'Lamot 2 Trail', rating: 5, photo_url: null,
};

export default function FeaturedHiker() {
  const [reviews, setReviews] = useState<FeaturedReview[]>([fallback]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const loadPublishedStories = () => supabase.from('reviews' as any)
      .select('id,reviewer_name,review_text,trail_name,rating,difficulty,photo_url,review_type,is_approved,created_at')
      .eq('is_approved', true).eq('review_type', 'trail').order('created_at', { ascending: false }).limit(12)
      .then(({ data }) => {
        if (!active) return;
        setReviews(Array.isArray(data) && data.length ? data as unknown as FeaturedReview[] : [fallback]);
        setIndex(0);
      });
    void loadPublishedStories();
    const channel = supabase.channel('published-trail-stories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, () => void loadPublishedStories())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);

  const review = reviews[index] || fallback;
  const previous = () => setIndex((current) => (current - 1 + reviews.length) % reviews.length);
  const next = () => setIndex((current) => (current + 1) % reviews.length);

  return (
    <section className="px-4 py-16" aria-labelledby="featured-hiker-title">
      <div className="container mx-auto max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} className="overflow-hidden rounded-3xl border border-primary/15 bg-card/70 shadow-xl">
          <AnimatePresence mode="wait">
            <div key={review.id} className="grid md:grid-cols-[0.9fr_1.1fr]">
              {review.photo_url ? (
                <div className="relative min-h-64 md:min-h-full">
                  <img src={review.photo_url} alt={`Published trail experience by ${review.reviewer_name}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex items-center gap-2 text-sm font-semibold text-white"><Mountain className="h-4 w-4" /> Trail community highlight</div>
                </div>
              ) : (
                <div className="flex min-h-64 items-center justify-center bg-primary/5 p-8 text-center text-sm text-muted-foreground md:min-h-full">No photo was uploaded for this published story.</div>
              )}
              <div className="flex flex-col justify-center gap-4 p-7 md:p-10">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Quote className="h-4 w-4" /> Featured hiker</div>
                <h2 id="featured-hiker-title" className="text-2xl font-bold md:text-3xl">A trail story worth sharing</h2>
                <p className="text-base italic leading-7 text-muted-foreground">“{review.review_text}”</p>
                {review.difficulty && <p className="text-xs font-medium text-primary">Trail difficulty: {review.difficulty}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-sm">
                  <div><p className="font-semibold">{review.reviewer_name}</p><p className="text-xs text-muted-foreground">{officialPublicTrailName(review.trail_name)}</p></div>
                  <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }).map((_, star) => <Star key={star} className={`h-4 w-4 ${star < review.rating ? 'fill-current' : 'text-border'}`} />)}</span>
                </div>
              </div>
            </div>
          </AnimatePresence>
          <div className="flex items-center justify-center gap-3 border-t border-border/30 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={previous} disabled={reviews.length < 2} aria-label="Previous featured hiker"><ChevronLeft className="h-4 w-4" /> Previous</Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground" aria-live="polite">{index + 1} of {reviews.length}</span>
            <Button type="button" variant="outline" size="sm" onClick={next} disabled={reviews.length < 2} aria-label="Next featured hiker">Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
