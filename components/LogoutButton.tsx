'use client';

import { useRouter } from 'next/navigation';

/**
 * Signs the admin out and sends them back to the login screen.
 *
 * Lives on the Tour Manager and Player Manager pages rather than in a shared
 * chrome component, so it's a plain control sitting next to each page's own
 * header row — the header nav (see components/SiteNav.tsx) already carries the
 * switch between the two admin sections and the way back to the viewer.
 */
export default function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <button onClick={onLogout} className="text-xs text-textDim hover:text-text">
      Log out
    </button>
  );
}