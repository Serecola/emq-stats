import Link from 'next/link';
import { MODES } from '@/lib/types';
import {
  matchFilterQuery,
  submodeOptions,
  type MatchFilter,
  type ModeFilter,
  type SubmodeFilter,
} from '@/lib/match-filter';

const chipClass = (isActive: boolean): string =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    isActive
      ? 'bg-accent text-bg'
      : 'border border-border text-textMuted hover:border-textSub hover:text-text'
  }`;

/**
 * Two-level segmented toggle for the tournament lists: mode first
 * (NGMC / Erumode), then that mode's own sub-modes — NGMC splits into
 * Normal / Random, Erumode into Normal / Random / Balanced / No Vocal.
 *
 * The sub-mode row only appears once a mode is picked (a sub-mode only means
 * something inside its own mode) and offers "All <mode>" unless
 * `includeAllSubmodes` is false, for views that always work inside one
 * sub-mode (the Player Manager's ranks are per sub-mode).
 *
 * Backed by `?mode=`/`?submode=` query params through plain <Link>s, so the
 * active filter is resolved server-side (via `searchParams`), is
 * bookmarkable/shareable, and works without any client JS.
 *
 * - `active`: the currently-selected filter.
 * - `basePath`: the path to return to for the catch-all option (e.g. "/admin").
 * - `allLabel`: label for the catch-all option (e.g. "All matches").
 * - `includeAll`: set false on views where a catch-all selection makes no
 *   sense — the Player Manager's ranks are per-gamemode, so it offers only
 *   the concrete modes.
 * - `includeAllSubmodes`: set false to drop the "All <mode>" chip, leaving
 *   only the concrete sub-modes.
 */
export default function ModeToggle({
  active,
  basePath,
  allLabel = 'All',
  includeAll = true,
  includeAllSubmodes = true,
}: {
  active: MatchFilter;
  basePath: string;
  allLabel?: string;
  includeAll?: boolean;
  includeAllSubmodes?: boolean;
}) {
  const modes: { label: string; value: ModeFilter }[] = [
    ...(includeAll ? [{ label: allLabel, value: 'all' as ModeFilter }] : []),
    ...MODES.map((m) => ({ label: m, value: m })),
  ];
  const submodes: { label: string; value: SubmodeFilter }[] =
    active.mode === 'all'
      ? []
      : [
          ...(includeAllSubmodes
            ? [{ label: `All ${active.mode}`, value: 'all' as SubmodeFilter }]
            : []),
          ...submodeOptions(active.mode).map((sm) => ({ label: sm, value: sm })),
        ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modes.map((m) => (
          <Link
            key={m.value}
            href={`${basePath}${matchFilterQuery({ mode: m.value, submode: 'all' })}`}
            className={chipClass(m.value === active.mode)}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {submodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {submodes.map((sm) => (
            <Link
              key={sm.value}
              href={`${basePath}${matchFilterQuery({ mode: active.mode, submode: sm.value })}`}
              className={chipClass(sm.value === active.submode)}
            >
              {sm.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
