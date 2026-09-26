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
        {modes.map((m) => {
          // When clicking a mode chip:
          // If includeAllSubmodes is false, default to the first submode of that mode.
          const href =
            !includeAllSubmodes && m.value !== 'all'
              ? `${basePath}${matchFilterQuery({ mode: m.value, submode: submodeOptions(m.value)[0] })}`
              : `${basePath}${matchFilterQuery({ mode: m.value, submode: 'all' })}`;

          return (
            <Link
              key={m.value}
              href={href}
              className={chipClass(m.value === active.mode)}
            >
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
