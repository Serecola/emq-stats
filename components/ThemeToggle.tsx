/**
 * Header theme toggle: a sun/moon button that flips the `dark` class on
 * <html> (see layout.tsx) and remembers the choice in localStorage, so it
 * survives reloads. Dark is the default — the class ships on <html> and the
 * pre-paint script only removes it for a stored `light` choice.
 */
'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'emq-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  // The pre-paint script in the layout may already have flipped the class
  // before hydration — read the DOM rather than storage so the icon matches.
  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing etc. — the toggle still works for this visit.
    }
  };

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md border border-border px-2 py-1 text-xs text-textMuted transition-colors hover:border-textSub hover:text-text"
    >
      {isDark ? '☀ Light' : '🌙 Dark'}
    </button>
  );
}
