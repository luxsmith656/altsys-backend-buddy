import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop component:
 * 1. Resets window scroll position to (0, 0) whenever route changes (pathname or search changes).
 * 2. If a hash is provided (e.g. #guidelines), scrolls smoothly to the target element.
 * 3. Configures `history.scrollRestoration = 'manual'` so that refreshing / reloading a page
 *    starts cleanly at the top instead of preserving old scrolled offsets.
 */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // Disable browser automatic scroll restoration on reload
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (hash) {
      const id = hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    // Immediately reset scroll position to top
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, search, hash]);

  return null;
}
