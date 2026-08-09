import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Star, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Guide = { id: string; full_name: string; specialty?: string; photo_url?: string | null; facebook_url?: string | null };
type Review = { id: string; reviewer_name: string; rating: number; comment: string; created_at: string };

export default function GuideProfilePage() {
  const { guideId } = useParams();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guideId) return;
    const load = async () => {
      setLoading(true);
      const { data: guideData } = await supabase.from('guides' as any)
        .select('id,full_name,specialty,photo_url,facebook_url')
        .eq('id', guideId)
        .eq('is_active', true)
        .maybeSingle();
      setGuide((guideData as Guide | null) ?? null);
      const { data: reviewData } = await supabase.from('guide_reviews' as any)
        .select('id,reviewer_name,rating,comment,created_at')
        .eq('guide_id', guideId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(12);
      setReviews((reviewData as Review[] | null) ?? []);
      setLoading(false);
    };
    void load();
  }, [guideId]);

  const average = useMemo(() => reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null, [reviews]);
  if (loading) return <div className="min-h-screen pt-28 text-center text-muted-foreground">Loading guide profile...</div>;
  if (!guide) return <div className="min-h-screen pt-28 text-center text-muted-foreground">This guide profile is unavailable.</div>;

  return (
    <main className="min-h-screen px-4 pb-12 pt-24">
      <section className="mx-auto max-w-2xl space-y-5">
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              {guide.photo_url ? <img src={guide.photo_url} alt={guide.full_name} className="h-24 w-24 rounded-full object-cover border-2 border-primary/30" /> : <div className="grid h-24 w-24 place-items-center rounded-full bg-primary/15 text-3xl font-bold text-primary">{guide.full_name.slice(0, 1)}</div>}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">Mt. Kalisungan guide</p>
                <h1 className="text-2xl font-bold">{guide.full_name}</h1>
                {guide.specialty && <p className="mt-1 text-sm text-muted-foreground">{guide.specialty}</p>}
                {average !== null && <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {average.toFixed(1)} from {reviews.length} review{reviews.length === 1 ? '' : 's'}</p>}
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1"><Link to={`/booking?guide=${guide.id}`}><Users className="mr-2 h-4 w-4" /> Book with {guide.full_name.split(' ')[0]}</Link></Button>
              {guide.facebook_url && <Button asChild variant="outline" className="flex-1"><a href={guide.facebook_url} target="_blank" rel="noreferrer">Contact on Facebook</a></Button>}
            </div>
          </CardContent>
        </Card>
        <section>
          <h2 className="mb-3 text-lg font-bold">Hiker reviews</h2>
          {reviews.length ? <div className="space-y-3">{reviews.map((review) => <Card key={review.id} className="glass-card"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><span className="font-medium">{review.reviewer_name || 'Hiker'}</span><span className="inline-flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {review.rating}</span></div><p className="mt-2 text-sm text-muted-foreground">{review.comment}</p></CardContent></Card>)}</div> : <Card className="glass-card"><CardContent className="p-5 text-sm text-muted-foreground">No published reviews yet.</CardContent></Card>}
        </section>
      </section>
    </main>
  );
}
