import Link from 'next/link';
import { RECENT_TOUR_COUNT, type StatsRange } from '@/lib/stats-range';

const RANGES: { id: StatsRange; label: string; hint: string }[] = [
  {
    id: 'recent',
    label: `Recent (${RECENT_TOUR_COUNT})`,
    hint: `Only their ${RECENT_TOUR_COUNT} most recent tournaments`,
  },
  { id: 'all', label: 'All-Time', hint: 'Every tournament they played in this mode' },
];

/**
 * Switch between the two readings of a player's tournament history: their last
 * `RECENT_TOUR_COUNT` tournaments (the default) or all of them. It sits on the
 * player page only — the /players list has no per-player slice to show.
 *
 * Both sides are plain <Link>s carrying the whole URL, mode filter included, so
 * the active side is resolved server-side, the choice is bookmarkable and
 * shareable, and the switch works with JavaScript off — the same reason
 * ModeToggle's chips are links rather than click handlers.
 *
 * The thumb is one absolutely-positioned pill that slides between the halves
 * (left/right rather than a transform, so it tracks the track's own padding
 * exactly), and the two labels carry their own meaning, since only one of them
 * describes the current view.
 */
export default function StatsRangeToggle({
  range,
  hrefFor,
}: {
  range: StatsRange;
  /** The URL each side of the switch points at — the caller keeps the page path and mode filter. */
  hrefFor: (range: StatsRange) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-textMuted">Tour stats</span>
      <div
        role="group"
        aria-label="Tournament range"
        className="relative grid grid-cols-2 rounded-full border border-border bg-surfaceAlt p-0.5 text-xs font-medium"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0.5 rounded-full bg-accent transition-all duration-200 ease-out ${
            range === 'all' ? 'left-1/2 right-[0.125rem]' : 'left-[0.125rem] right-1/2'
          }`}
        />
        {RANGES.map((r) => (
          <Link
            key={r.id}
            href={hrefFor(r.id)}
            title={r.hint}
            aria-current={r.id === range ? 'true' : undefined}
            className={`relative z-10 rounded-full px-3 py-1 text-center transition-colors ${
              r.id === range ? 'text-bg' : 'text-textMuted hover:text-text'
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
