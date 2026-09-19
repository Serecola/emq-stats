import Link from 'next/link';
import { MODES, type Mode } from '@/lib/types';

export type ModeFilter = 'all' | Mode;

/**
 * Segmented toggle for filtering the tournament list by mode (NGMC / Erumode).
 *
 * Backed by a `?mode=` query param through plain <Link>s, so the active filter
 * is resolved server-side (via `searchParams`), is bookmarkable/shareable, and
 * works without any client JS — same approach already used on the home page.
 *
 * - `active`: the currently-selected filter.
 * - `basePath`: the path to return to for the catch-all option (e.g. "/admin").
 * - `allLabel`: label for the catch-all option (e.g. "All matches").
 */
export default function ModeToggle({
  active,
  basePath,
  allLabel = 'All',
}: {
  active: ModeFilter;
  basePath: string;
  allLabel?: string;
}) {
  const filters: { label: string; value: ModeFilter }[] = [
    { label: allLabel, value: 'all' },
    ...MODES.map((m) => ({ label: m, value: m })),
  ];

  return (
    <div className="flex items-center gap-1.5">
      {filters.map((f) => {
        const href = f.value === 'all' ? basePath : `${basePath}?mode=${f.value}`;
        const isActive = f.value === active;
        return (
          <Link
            key={f.value}
            href={href}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-accent text-bg'
                : 'border border-border text-textMuted hover:border-textSub hover:text-text'
            }`}
          >
            {f.label}
          </Link>
        );
      })}
    </div>
  );
}
