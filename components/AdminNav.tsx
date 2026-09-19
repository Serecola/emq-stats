import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

const TABS = [
  { id: 'tours', href: '/admin', label: 'Tour Manager' },
  { id: 'players', href: '/admin/players', label: 'Player Manager' },
] as const;

export type AdminTab = (typeof TABS)[number]['id'];

const tabClass = (isActive: boolean): string =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    isActive
      ? 'bg-accent text-bg'
      : 'border border-border text-textMuted hover:border-textSub hover:text-text'
  }`;

/**
 * Tabs separating the two admin halves: Tour Manager (create/edit/delete
 * tournaments) and Player Manager (per-gamemode Set Ranks + expectations).
 * Server-rendered as plain <Link>s, like ModeToggle — the active tab is
 * passed down rather than derived, so each page states where it lives.
 *
 * The log-out control rides along here so every admin screen has it without
 * each page repeating the header markup.
 */
export default function AdminNav({ active }: { active: AdminTab }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => (
          <Link key={tab.id} href={tab.href} className={tabClass(tab.id === active)}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <LogoutButton />
    </div>
  );
}