import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Image as ImageIcon, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { officialPublicTrailName } from '@/lib/mapTrailheads';

type ReviewFilter = 'pending' | 'published' | 'all';

interface TrailReview {
  id: string;
  reviewer_name: string;
  rating: number;
  trail_name: string;
  review_text: string;
  difficulty: string | null;
  photo_url: string | null;
  is_approved: boolean;
  created_at: string;
  booking_id: string | null;
  bookings?: { location_id?: string | null; booking_date?: string | null } | null;
}

interface TrailReviewModerationProps {
  locationId?: string | null;
  isCentralAdmin?: boolean;
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default function TrailReviewModeration({ locationId, isCentralAdmin = false }: TrailReviewModerationProps) {
  const [reviews, setReviews] = useState<TrailReview[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<TrailReview | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    if (!isCentralAdmin && !locationId) {
      // Do not briefly load another trailhead's queue while the local admin
      // scope is still being resolved.
      setReviews([]);
      setLoading(false);
      return;
    }
    try {
      let query = supabase
        .from('reviews' as any)
        .select('id, reviewer_name, rating, trail_name, review_text, difficulty, photo_url, is_approved, created_at, booking_id, bookings!inner(location_id, booking_date)')
        .eq('review_type', 'trail')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!isCentralAdmin && locationId) {
        query = query.eq('bookings.location_id', locationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReviews((data ?? []) as unknown as TrailReview[]);
    } catch (error: any) {
      console.warn('Could not load trail review moderation queue:', error);
      toast.error(`Could not load trail reviews: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [isCentralAdmin, locationId]);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  const visibleReviews = useMemo(() => reviews.filter((review) => {
    if (filter === 'pending') return !review.is_approved;
    if (filter === 'published') return review.is_approved;
    return true;
  }), [filter, reviews]);

  const pendingCount = reviews.filter((review) => !review.is_approved).length;

  const setVisibility = async (review: TrailReview, isApproved: boolean) => {
    setUpdatingId(review.id);
    const { error } = await supabase
      .from('reviews' as any)
      .update({ is_approved: isApproved } as any)
      .eq('id', review.id);
    setUpdatingId(null);

    if (error) {
      toast.error(`Could not update review: ${error.message}`);
      return;
    }
    setReviews((previous) => previous.map((item) => item.id === review.id ? { ...item, is_approved: isApproved } : item));
    toast.success(isApproved ? 'Trail review is now visible on the landing page.' : 'Trail review is hidden from the landing page.');
  };

  const deleteReview = async (review: TrailReview) => {
    if (!window.confirm('Delete this review permanently? It will be removed from the landing page and cannot be restored.')) return;
    setUpdatingId(review.id);
    const { error } = await supabase.rpc('delete_trail_review' as any, { _review_id: review.id });
    setUpdatingId(null);
    if (error) { toast.error(`Could not delete review: ${error.message}`); return; }
    setReviews((previous) => previous.filter((item) => item.id !== review.id));
    setSelectedPhoto((current) => current?.id === review.id ? null : current);
    toast.success('Review permanently deleted.');
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Trail Experience Reviews</h2>
          <p className="text-sm text-muted-foreground">
            {isCentralAdmin ? 'Moderate stories from every official trailhead.' : 'Moderate stories from this trailhead before they appear on the landing page.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadReviews()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Badge variant="outline" className="h-8 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            {pendingCount} pending
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Trail review filter">
        {([['pending', 'Pending'], ['published', 'Published'], ['all', 'All']] as const).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Card className="glass-card"><CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading trail reviews...</CardContent></Card>
      ) : visibleReviews.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-10 text-center text-sm text-muted-foreground">No {filter === 'all' ? '' : filter} trail reviews yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleReviews.map((review) => {
            const updating = updatingId === review.id;
            return (
              <Card key={review.id} className="glass-card overflow-hidden">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{review.reviewer_name || 'Mt. Kalisungan hiker'}</CardTitle>
                      <CardDescription>{formatReviewDate(review.created_at)} · {officialPublicTrailName(review.trail_name)}</CardDescription>
                    </div>
                    <Badge variant={review.is_approved ? 'default' : 'secondary'}>{review.is_approved ? 'Published' : 'Awaiting review'}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? 'fill-current' : 'text-muted-foreground/30'}`} />)}
                    {review.difficulty && <span className="ml-2 text-xs font-medium capitalize text-primary">{review.difficulty}</span>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{review.review_text}</p>
                  {review.photo_url && (
                    <button
                      type="button"
                      className="group relative block w-full overflow-hidden rounded-md border border-border/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => setSelectedPhoto(review)}
                      aria-label={`View full trail photo from ${review.reviewer_name || 'hiker'}`}
                    >
                      <img src={review.photo_url} alt="Submitted trail experience" loading="lazy" decoding="async" className="h-48 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Click to view full photo</span>
                    </button>
                  )}
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border/20 pt-3">
                    {review.photo_url && <Badge variant="outline" className="mr-auto gap-1"><ImageIcon className="h-3 w-3" /> Photo attached</Badge>}
                    {review.is_approved ? (
                      <Button size="sm" variant="outline" onClick={() => void setVisibility(review, false)} disabled={updating} className="gap-1.5">
                        {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />} Hide
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void setVisibility(review, true)} disabled={updating} className="gap-1.5">
                        {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Publish
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => void deleteReview(review)} disabled={updating} className="gap-1.5">
                      {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selectedPhoto)} onOpenChange={(open) => { if (!open) setSelectedPhoto(null); }}>
        <DialogContent className="max-h-[96dvh] max-w-[min(96vw,1400px)] gap-3 overflow-hidden p-3 sm:p-5">
          <DialogHeader>
            <DialogTitle>Trail photo</DialogTitle>
            <DialogDescription>
              {selectedPhoto?.reviewer_name || 'Hiker'} · {selectedPhoto ? formatReviewDate(selectedPhoto.created_at) : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedPhoto?.photo_url && (
            <img
              src={selectedPhoto.photo_url}
              alt="Full submitted trail experience"
              className="max-h-[calc(96dvh-7rem)] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
