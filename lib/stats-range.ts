import type { MatchFilter } from './match-filter';
import { matchFilterQuery } from './match-filter';

/**
 * Which slice of a player's tournament history a view is showing: only their
 * most recent `RECENT_TOUR_COUNT` tournaments, or every tournament they have
 * played in the current gamemode + sub-mode.
 */
export type StatsRange = 'recent' | 'all';

/**
 * How many tournaments "Recent" covers. The same window the Expected Rank
 * source averages over (`recentExpectedRanksFor` in lib/player-ranks.ts), so a
 * player's Recent numbers here and the rank the autodrafter balances with are
 * talking about the same handful of tournaments.
 */
export const RECENT_TOUR_COUNT = 5;

/**
 * Reads the range out of a page's `searchParams`, falling back to Recent — the
 * default, so a bare visit (and a link in from /players, which carries only the
 * mode filter) shows current form rather than a full career. Anything that isn't
 * a known range counts as absent, so a hand-edited URL can't ask for a slice
 * that doesn't exist.
 */
export function parseStatsRange(params: { range?: string }): StatsRange {
  return params.range === 'all' ? 'all' : 'recent';
}

/**
 * A player page's full query: its mode + sub-mode with the range on top.
 *
 * The range rides *inside* the filter query rather than beside it, so it drops
 * back to the default (Recent) the moment the page is reached without it and
 * the mode/sub-mode are never duplicated.
 */
export function playerViewQuery(filter: MatchFilter, range: StatsRange): string {
  const query = matchFilterQuery(filter);
  if (range !== 'all') return query;
  return `${query}${query ? '&' : '?'}range=all`;
}

/**
 * The range as a query fragment *including* its leading '?', or '' for the
 * default — the shape `ModeToggle`'s `extraQuery` expects (it slices that '?'
 * off before appending the fragment to each chip, so a fragment without one
 * loses its own first character). Handing the mode chips their own correct
 * fragment is what keeps a sub-mode change from silently dropping the range.
 */
export function statsRangeFragment(range: StatsRange): string {
  return range === 'all' ? '?range=all' : '';
}

/**
 * How the range is worded under the player's name — "last 5 of 12 tournaments"
 * or just "12 tournaments", which is what tells the two readings apart once
 * they're both a click away. A player with fewer tournaments than the window
 * has nothing to trim, so it never claims a slice it can't show.
 */
export function statsRangeLabel(range: StatsRange, shown: number, total: number): string {
  const noun = `tournament${shown === 1 ? '' : 's'}`;
  return range === 'recent' && shown < total ? `last ${shown} of ${total} ${noun}` : `${shown} ${noun}`;
}
