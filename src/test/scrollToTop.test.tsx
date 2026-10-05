import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import ScrollToTop from '@/components/common/ScrollToTop';

describe('ScrollToTop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.scrollTo = vi.fn();
    Object.defineProperty(window.history, 'scrollRestoration', {
      writable: true,
      value: 'auto',
    });
  });

  it('configures history.scrollRestoration to manual on mount', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
      </MemoryRouter>,
    );

    expect(window.history.scrollRestoration).toBe('manual');
  });

  it('resets scroll position to (0, 0) on initial render and route transition', async () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/first']}>
        <ScrollToTop />
        <Routes>
          <Route path="/first" element={<Link to="/second">Go to Second</Link>} />
          <Route path="/second" element={<div>Second Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    vi.mocked(window.scrollTo).mockClear();

    fireEvent.click(getByText('Go to Second'));
    expect(await screen.findByText('Second Page')).toBeVisible();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});
