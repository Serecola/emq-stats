'use client';

import { useEffect, useState } from 'react';

/**
 * "Back to top" button, bottom right of the match page — the counterpart to
 * the left-hand jump rail, for coming back up from the bottom of a long page
 * without scrolling the whole way.
 *
 * Fades in only once the page is scrolled far enough to be worth the space
 * (a short tournament's page stays clean), but stays mounted while hidden so
 * it can't shift the layout under the pointer as it appears. Hidden via
 * `invisible` rather than unmounted, which takes it out of both the tab order
 * and the accessibility tree without needing an aria-hidden on something
 * focusable.
 *
 * The scroll is a plain `scrollTo`, so `scroll-behavior` in globals.css
 * decides whether it's smooth or instant under `prefers-reduced-motion` —
 * passing `behavior` here would override that opt-out.
 */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      setShow(window.scrollY > 400);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0 })}
      aria-label="Back to top"
      className={`fixed bottom-4 right-4 z-20 rounded-full border border-border bg-surface/90 px-3 py-2 text-xs font-medium text-textSub shadow-lg backdrop-blur transition-opacity hover:border-textSub hover:text-text ${
        show ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
      }`}
    >
      ↑ Top
    </button>
  );
}
