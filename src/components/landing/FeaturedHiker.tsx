import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mountain, Quote, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import hikerImage from '@/assets/gallery-hikers.jpg';

type FeaturedReview = {
  user_id?: string;
  photo_url?: string | null;
  reviewer_name: string;
  review_text: string;
  trail_name: string;
  rating: number;
  difficulty?: string | null;
};

const fallback: FeaturedReview = {
  reviewer_name: 'A fellow Kalisungan hiker',
  review_text: 'A memorable climb with clear trail guidance from the jump-off to the summit.',
  trail_name: 'Summit Trail',
  rating: 5,
  photo_url: null,
};

export default function FeaturedHiker() {
  const [review, setReview] = useState<FeaturedReview>(fallback);

  useEffect(() => {
    let active = true;
    void supabase
      .from('reviews' as any)
      // Keep the public landing page compatible until the optional feedback
      // columns are applied remotely. `*` returns them automatically later.
      .select('*')
      .eq('is_approved', true)
      .order('rating', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12)
      .then(async ({ data }) => {
        if (!active || !data) return;
        const row = Array.isArray(data)
          ? data.find((item: any) => !item.review_type || item.review_type === 'trail')
          : data;
        if (!row) return;
        const review = row as unknown as FeaturedReview;
        const { data: profile } = review.user_id
          ? await supabase.from('profiles').select('avatar_url').eq('user_id', review.user_id).maybeSingle()
          : { data: null };
        if (active) setReview({ ...review, photo_url: review.photo_url || profile?.avatar_url || null });
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="px-4 py-16" aria-labelledby="featured-hiker-title">
      <div className="container mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          className="grid overflow-hidden rounded-3xl border border-primary/15 bg-card/70 shadow-xl md:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="relative min-h-64 md:min-h-full">
            <img src={review.photo_url || hikerImage} alt={review.photo_url ? `${review.reviewer_name}'s profile` : 'Hikers on a Mount Kalisungan trail'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="absolute bottom-4 left-4 flex items-center gap-2 text-sm font-semibold text-white">
              <Mountain className="h-4 w-4" /> Trail community highlight
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4 p-7 md:p-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Quote className="h-4 w-4" /> Featured hiker
            </div>
            <h2 id="featured-hiker-title" className="text-2xl font-bold md:text-3xl">A trail story worth sharing</h2>
            <p className="text-base italic leading-7 text-muted-foreground">“{review.review_text}”</p>
            {review.difficulty && <p className="text-xs font-medium text-primary">Trail difficulty: {review.difficulty}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-sm">
              <div>
                <p className="font-semibold">{review.reviewer_name}</p>
                <p className="text-xs text-muted-foreground">{review.trail_name}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? 'fill-current' : 'text-border'}`} />)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
