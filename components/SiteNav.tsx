'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string };

const VIEWER_LINKS: NavLink[] = [
  { href: '/', label: 'Tournaments' },
  { href: '/players', label: 'Players' },
  { href: '/admin', label: 'Admin' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/admin', label: 'Tour Manager' },
  { href: '/admin/players', label: 'Player Manager' },
  { href: '/', label: 'Return to Player View' },
];

/**
 * Header navigation. The root layout renders it but layouts don't receive the
 * current URL, so this is a client component reading `usePathname()` to decide
 * which set of links to show: the viewer's sections (Tournaments / Players) or,
 * on `/admin`, the admin's own two sections plus the way back out to the
 * viewer. The login screen is deliberately excluded — it's the gate in front of
 * the admin panel rather than part of it, so it keeps the viewer links.
 */
export default function SiteNav() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const links = isAdmin ? ADMIN_LINKS : VIEWER_LINKS;

  return (
    <nav className="flex items-center gap-4 text-xs text-textMuted">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="hover:text-text">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
