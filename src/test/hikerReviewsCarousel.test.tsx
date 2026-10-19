import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HikerReviews from '@/components/landing/HikerReviews';

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};
chain.select.mockReturnValue(chain);
chain.eq.mockReturnValue(chain);
chain.order.mockReturnValue(chain);
chain.limit.mockResolvedValue({
  data: [
    { id: 'review-1', reviewer_name: 'Maria Santos', rating: 5, trail_name: 'Lamot 1 Trail', review_text: 'The trail was absolutely breathtaking', created_at: '2026-01-01', review_type: 'trail', is_approved: true, photo_url: 'https://example.com/maria.jpg' },
    { id: 'review-2', reviewer_name: 'Juan Dela Cruz', rating: 4, trail_name: 'Sto. Tomas Trail', review_text: 'A beautiful route', created_at: '2026-01-02', review_type: 'trail', is_approved: true, photo_url: null },
  ],
  error: null,
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => chain) },
}));

describe('HikerReviews carousel', () => {
  it('shows one trail story at a time and cycles with explicit controls', async () => {
    render(<HikerReviews />);

    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(/The trail was absolutely breathtaking/)).toBeInTheDocument();
    expect(screen.queryByText(/no photo|no uploaded/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next trail review/i }));

    await waitFor(() => expect(screen.getByText('2 of 2')).toBeInTheDocument());
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument());
  });
});
