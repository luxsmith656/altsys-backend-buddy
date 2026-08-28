export interface GuideReview {
  rating: number;
  comment: string;
  hikerName: string;
  date: string;
}

export interface GuideRating {
  guideId: string;
  guideName: string;
  trail: string;
  totalRating: number;
  reviewCount: number;
  avgRating: number;
  recentReviews: GuideReview[];
}

const GUIDE_RATINGS_KEY = 'kalisungan_guide_ratings_v2';

const SEED_RATINGS: GuideRating[] = [
  {
    guideId: 'test-guide-1',
    guideName: 'Test Guide',
    trail: 'Summit Trail',
    totalRating: 24.5,
    reviewCount: 5,
    avgRating: 4.9,
    recentReviews: [
      { rating: 5, comment: 'Very knowledgeable, friendly and patient. Best guide!', hikerName: 'Test Hiker', date: '2026-08-25' },
      { rating: 5, comment: 'Made the summit hike so much smoother.', hikerName: 'Maria S.', date: '2026-08-20' },
    ],
  },
];

export function loadGuideRatings(): GuideRating[] {
  try {
    const stored = localStorage.getItem(GUIDE_RATINGS_KEY);
    if (stored) return JSON.parse(stored) as GuideRating[];
  } catch { /* fallthrough */ }
  localStorage.setItem(GUIDE_RATINGS_KEY, JSON.stringify(SEED_RATINGS));
  return SEED_RATINGS;
}

export function getTop3Guides(): GuideRating[] {
  return [...loadGuideRatings()]
    .sort((a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount)
    .slice(0, 3);
}

export function addGuideRating(
  guideId: string,
  guideName: string,
  trail: string,
  rating: number,
  comment: string,
  hikerName: string,
): void {
  const ratings = loadGuideRatings();
  const guide = ratings.find((g) => g.guideId === guideId);
  if (guide) {
    guide.totalRating += rating;
    guide.reviewCount += 1;
    guide.avgRating = parseFloat((guide.totalRating / guide.reviewCount).toFixed(2));
    guide.recentReviews.unshift({ rating, comment, hikerName, date: new Date().toISOString().split('T')[0] });
    guide.recentReviews = guide.recentReviews.slice(0, 5);
  } else {
    ratings.push({
      guideId,
      guideName,
      trail,
      totalRating: rating,
      reviewCount: 1,
      avgRating: rating,
      recentReviews: [{ rating, comment, hikerName, date: new Date().toISOString().split('T')[0] }],
    });
  }
  localStorage.setItem(GUIDE_RATINGS_KEY, JSON.stringify(ratings));
}

export function renderStars(avg: number): string {
  return '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
}
