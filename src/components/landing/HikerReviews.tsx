import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Quote, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Review {
  id: string;
  reviewer_name: string;
  rating: number;
  trail_name: string;
  review_text: string;
  created_at: string;
  difficulty?: string | null;
  photo_url?: string | null;
}

const fallbackReviews: Review[] = [
  {
    id: '1',
    reviewer_name: 'Maria Santos',
    rating: 5,
    trail_name: 'Summit Trail',
    review_text: 'The trail was absolutely breathtaking! The AI assistant helped us prepare perfectly — it even warned us about the slippery section near the summit.',
    created_at: '2026-02-15',
  },
  {
    id: '2',
    reviewer_name: 'Juan Dela Cruz',
    rating: 5,
    trail_name: 'Ridge Route',
    review_text: 'As a first-time hiker, the offline AI guide was a lifesaver. Even without signal on the mountain, I could ask questions and get accurate answers.',
    created_at: '2026-01-20',
  },
  {
    id: '3',
    reviewer_name: 'Angela Reyes',
    rating: 4,
    trail_name: 'Scenic Loop',
    review_text: 'Beautiful sunrise hike! The booking system was smooth and the QR code made check-in super fast. My family felt safe knowing the ranger tracking was active.',
    created_at: '2025-12-10',
  },
  {
    id: '4',
    reviewer_name: 'Carlos Mendoza',
    rating: 5,
    trail_name: 'Summit Trail',
    review_text: "I've hiked Kalisungan many times but this tracking system changed everything. Real-time elevation profile and AI chatbot with offline mode — like a personal guide!",
    created_at: '2026-01-05',
  },
  {
    id: '5',
    reviewer_name: 'Patricia Villanueva',
    rating: 5,
    trail_name: 'Ridge Route',
    review_text: 'Brought a group of 8 friends and the group booking feature was perfect. The system even reminded us what to bring based on the weather forecast.',
    created_at: '2026-02-01',
  },
  {
    id: '6',
    reviewer_name: 'Roberto Aquino',
    rating: 4,
    trail_name: 'Scenic Loop',
    review_text: 'Great trail conditions info from ranger reports. The AI assistant gave me detailed info about nearby food spots even when offline. Very impressed.',
    created_at: '2025-11-25',
  },
];



function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function TrailBadge({ trail }: { trail: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-primary/40 text-primary bg-primary/5 whitespace-nowrap">
      {trail}
    </span>
  );
}


function ReviewCard({ review, index }: { review: Review; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="cinematic-card flex flex-col p-6 gap-3.5 relative overflow-hidden"
    >
      {/* Quote icon */}
      <Quote className="h-6 w-6 text-primary/20 rotate-180 mb-1" />

      {/* Review text */}
      <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">
        &ldquo;{review.review_text}&rdquo;
      </p>
      {review.photo_url && (
        <img src={review.photo_url} alt="Hiker trail feedback" loading="lazy" className="h-28 w-full rounded-xl object-cover" />
      )}
      {review.difficulty && <p className="text-xs font-medium text-primary">Trail difficulty: {review.difficulty}</p>}

      {/* Footer: name/date + trail badge */}
      <div className="flex items-center justify-between pt-3 border-t border-border/10 mt-1">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground tracking-tight">{review.reviewer_name}</p>
          <p className="text-[11px] text-muted-foreground/70 font-medium">{formatDate(review.created_at)}</p>
        </div>
        <TrailBadge trail={review.trail_name} />
      </div>
    </motion.div>
  );
}

export default function HikerReviews() {
  const [reviews, setReviews] = useState<Review[]>(fallbackReviews);

  const fetchReviews = async () => {
    const { data, error } = await supabase
      .from('reviews' as any)
      // `*` keeps this public read valid before the trail-feedback migration
      // is applied; new columns are included automatically afterward.
      .select('*')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data && data.length > 0) {
      const trailReviews = (data as any[]).filter((review) => !review.review_type || review.review_type === 'trail');
      setReviews((trailReviews as unknown as Review[]).slice(0, 6));
    }
  };

  useEffect(() => { fetchReviews(); }, []);

  return (
    <section className="py-24 px-4 relative overflow-hidden section-warm-overlay">
      {/* Decorative background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      <div className="container max-w-5xl mx-auto relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight">
            What Hikers Are <span className="text-gradient">Saying</span>
          </h2>
          <p className="text-base text-muted-foreground mb-6">
            Real experiences from adventurers who conquered Mount Kalisungan.
          </p>

          {/* Average rating display */}
          {(() => {
            const avg = reviews.length > 0
              ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
              : 0;
            return (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full cinematic-card">
                  <span className="text-2xl font-black text-amber-500">{avg.toFixed(1)}</span>
                  <div className="flex flex-col items-start">
                    <span className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${i < Math.round(avg) ? 'fill-amber-400 text-amber-400' : 'text-border'}`}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">{reviews.length} hiking experience reviews</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </motion.div>

        {/* Review grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {reviews.map((review, i) => (
            <ReviewCard key={review.id} review={review} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}
