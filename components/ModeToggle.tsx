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
 * Segmented toggle for the tournament lists.
 *
 * By default it is two-level: mode first (Erumode / NGMC, in that order), then
 * that mode's own sub-modes — Erumode into Normal / Random / Balanced / No Vocal,
 * NGMC into Normal / Random. The sub-mode row only appears once a mode is picked
 * and offers "All <mode>" unless `includeAllSubmodes` is false.
 *
 * Setting `includeAll={false}` and `includeAllSubmodes={false}` drops all catch-all
 * chips ("All", "All Erumode", "All NGMC"), leaving only concrete modes and concrete
 * sub-modes — used by `/admin/players` and `/players`.
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
}: {
  active: MatchFilter;
  basePath: string;
  allLabel?: string;
  includeAll?: boolean;
  includeAllSubmodes?: boolean;
  extraQuery?: string;
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

  // `matchFilterQuery` returns '' or a '?a=b' string, so the player filter's
  // own leading '?' has to become a '&' when both are present.
  const href = (query: string): string =>
    !extraQuery
      ? `${basePath}${query}`
      : `${basePath}${query ? `${query}&${extraQuery.slice(1)}` : `?${extraQuery.slice(1)}`}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modes.map((m) => {
          // When clicking a mode chip:
          // If includeAllSubmodes is false, default to the first submode of that mode.
          const modeHref =
            !includeAllSubmodes && m.value !== 'all'
              ? matchFilterQuery({ mode: m.value, submode: submodeOptions(m.value)[0] })
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
