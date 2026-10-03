'use client';

import { useEffect, useState } from 'react';

/**
 * One jump target on the match page: the `id` of a rendered section and the
 * label the rail shows for it. `nested` marks a sub-table that sits inside a
 * section rather than being one of its own.
 */
export interface JumpSection {
  id: string;
  label: string;
  nested?: boolean;
}

/**
 * Jump rail down the left of the match page: one link per section, with the
 * current one highlighted as you scroll past it. Long match pages are mostly
 * bracket cards and wide stat tables, so re-finding the standings after
 * reading the stats means a lot of scrolling.
 *
 * Plain `#id` anchors rather than click handlers, so every jump is a real
 * link — keyboard reachable, middle-clickable, and a shareable/bookmarkable
 * URL, with the browser's own back/forward walking the jumps. Smoothness (and
 * the `prefers-reduced-motion` opt-out) is `scroll-behavior` in globals.css
 * rather than JS, so it covers every jump on the page the same way.
 *
 * The current section is the last one whose heading has passed a line near the
 * top of the viewport, so a section stays lit for as long as any part of it is
 * on screen — a heading-anchored observer would flicker between sections as
 * their contents crossed the boundary. Measured on scroll (rAF-throttled,
 * passive) rather than observed, so the answer is the same at the very bottom
 * of the page, where nothing is crossing anything.
 *
 * Hidden below `min-[1600px]`: the app is capped at max-w-7xl, so only a
 * viewport wide enough to leave a real gutter beside that (~1600px and up)
 * has room for the rail to sit without overlapping the tables.
 */
export default function MatchSectionNav({ sections }: { sections: JumpSection[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      // Where a heading counts as "passed" — roughly below the site's own
      // header, so the section you've scrolled into is the lit one.
      const line = 140;
      let current: string | null = null;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top - line <= 0) current = section.id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    // Sections are already in the DOM by the time this runs, so measure once
    // up front — otherwise a link into a deep section starts out unlit.
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  // One section is a page, not a menu.
  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Jump to section"
      className="fixed left-4 top-1/2 z-20 hidden -translate-y-1/2 min-[1600px]:block"
    >
      <ul className="space-y-0.5 rounded-lg border border-border bg-surface/80 p-1.5 backdrop-blur">
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={`block rounded px-2 py-1 transition-colors ${
                  section.nested ? 'pl-4 text-[0.65rem]' : 'text-xs'
                } ${
                  isActive
                    ? 'bg-accent/10 font-semibold text-accent'
                    : 'text-textMuted hover:bg-surfaceAlt hover:text-text'
                }`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
