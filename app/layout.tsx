import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'EMQ Stats',
  description: 'Attack/block stats viewer for EMQ team tournaments',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              EMQ Stats
            </Link>
            <nav className="flex items-center gap-4 text-xs text-textMuted">
              <Link href="/" className="hover:text-text">Tournaments</Link>
              <Link href="/players" className="hover:text-text">Players</Link>
              <Link href="/admin" className="hover:text-text">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}