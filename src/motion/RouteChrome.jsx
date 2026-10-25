import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * What has to happen on every route change, regardless of animation:
 * scroll back to the top, move focus into the new page, and say its name.
 *
 * Mounted once per shell, outside the animated subtree.
 */
export function RouteChrome() {
  const { pathname, hash } = useLocation();
  const [announcement, setAnnouncement] = useState('');
  const firstRender = useRef(true);

  useEffect(() => {
    // On the very first paint the page is already where the user expects it,
    // and stealing focus would be rude.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    const main = document.getElementById('main');
    const heading = main?.querySelector('h1');
    const target = heading || main;

    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }

    setAnnouncement(heading?.textContent?.trim() || document.title);
  }, [pathname, hash]);

  return (
    <p aria-live="polite" className="sr-only" data-print="hide">
      {announcement}
    </p>
  );
}
