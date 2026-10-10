import Link from 'next/link';
import { MODES, type Mode } from '@/lib/types';
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
 * Segmented toggle for the tournament lists.
 *
 * By default it is two-level: mode first (Erumode / NGMC / Custom, in that
 * order), then that mode's own sub-modes — Erumode into Normal / Random /
 * Balanced / No Vocal, NGMC into Normal / Random, and Custom into nothing (it
 * has no sub-modes, so it never gets a sub-mode row). The sub-mode row only
 * appears once a mode with sub-modes is picked and offers "All <mode>" unless
 * `includeAllSubmodes` is false.
 *
 * Setting `includeAll={false}` and `includeAllSubmodes={false}` drops all catch-all
 * chips ("All", "All Erumode", "All NGMC"), leaving only concrete modes and concrete
 * sub-modes — used by `/admin/players` and `/players`.
 *
 * `modes` narrows the mode row itself (default: every mode in MODES).
 * `/admin/players` passes LADDER_MODES, so Custom — which can hold no rank —
 * is not offered there; every other view keeps the full list.
 *
 * Backed by `?mode=`/`?submode=` query params through plain <Link>s, so the
 * active filter is resolved server-side (via `searchParams`), is
 * bookmarkable/shareable, and works without any client JS.
 *
 * `extraQuery` is appended to every chip's href, so another filter living in
 * the URL (the player search's `?with=`) survives a change of mode instead of
 * being silently dropped. Pass '' for none.
 */
export default function ModeToggle({
  active,
  basePath,
  allLabel = 'All',
  includeAll = true,
  includeAllSubmodes = true,
  extraQuery = '',
  modes = MODES,
}: {
  active: MatchFilter;
  basePath: string;
  allLabel?: string;
  includeAll?: boolean;
  includeAllSubmodes?: boolean;
  extraQuery?: string;
  // Which gamemodes the mode row offers — every mode everywhere by default.
  // The Player Manager passes LADDER_MODES instead: Custom has no sub-mode
  // bucket to store a rank in, so it is never a ladder that view can offer
  // (see lib/types.ts).
  modes?: readonly Mode[];
}) {
  const modeChips: { label: string; value: ModeFilter }[] = [
    ...(includeAll ? [{ label: allLabel, value: 'all' as ModeFilter }] : []),
    ...modes.map((m) => ({ label: m, value: m })),
  ];
  const submodes: { label: string; value: SubmodeFilter }[] =
    active.mode === 'all' || submodeOptions(active.mode).length === 0
      ? []
      : [
          ...(includeAllSubmodes
            ? [{ label: `All ${active.mode}`, value: 'all' as SubmodeFilter }]
            : []),
          ...submodeOptions(active.mode).map((sm) => ({ label: sm, value: sm })),
        ];

  // `matchFilterQuery` returns '' or a '?a=b' string, so the player filter's
  // own leading '?' has to become a '&' when both are present.
  const href = (query: string): string =>
    !extraQuery
      ? `${basePath}${query}`
      : `${basePath}${query ? `${query}&${extraQuery.slice(1)}` : `?${extraQuery.slice(1)}`}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modeChips.map((m) => {
          // When clicking a mode chip with includeAllSubmodes off, default to
          // that mode's first concrete sub-mode. Custom has none, so it falls
          // back to 'all' — which matchFilterQuery serializes as no submode
          // param at all, never a literal "submode=undefined".
          const modeHref =
            !includeAllSubmodes && m.value !== 'all'
              ? matchFilterQuery({ mode: m.value, submode: submodeOptions(m.value)[0] ?? 'all' })
              : matchFilterQuery({ mode: m.value, submode: 'all' });

          return (
            <Link key={m.value} href={href(modeHref)} className={chipClass(m.value === active.mode)}>
              {m.label}
            </Link>
          );
        })}
      </div>

      {submodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {submodes.map((sm) => (
            <Link
              key={sm.value}
              href={href(matchFilterQuery({ mode: active.mode, submode: sm.value }))}
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
