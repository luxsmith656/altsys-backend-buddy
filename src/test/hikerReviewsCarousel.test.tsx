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
chain.limit.mockResolvedValue({ data: null, error: { message: 'offline' } });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => chain) },
}));

describe('HikerReviews carousel', () => {
  it('shows one trail story at a time and cycles with explicit controls', async () => {
    render(<HikerReviews />);

    expect(await screen.findByText('1 of 6')).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next trail review/i }));

    await waitFor(() => expect(screen.getByText('2 of 6')).toBeInTheDocument());
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument());
  });
});
