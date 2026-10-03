import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNav from '@/components/SiteNav';
import ThemeToggle from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'EMQ Stats',
  description: 'Stats Viewer for EMQ Tournaments',
};

/**
 * Pre-paint theme script. Runs before hydration so a stored `light` choice
 * takes effect without flashing the default dark theme; anything else
 * (including nothing stored) keeps `class="dark"` on <html>.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('emq-theme');if(t==='light'){document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        {/* One width for the whole app, wide enough that the stat grids use the
            screen instead of swimming in side margins. `max-w-7xl` is the cap
            that keeps the widest table from needing a horizontal scrollbar on a
            laptop, and the side padding steps up with the viewport so the edges
            never look cramped on a phone. */}
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              EMQ Stats
            </Link>
            <div className="flex items-center gap-3">
              <SiteNav />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}