import { MODES, SUBMODES_BY_MODE, type Mode } from './types';

/** 'all' keeps every mode; otherwise only that one. */
export type ModeFilter = 'all' | Mode;

/**
 * 'all' keeps every sub-mode of the selected mode; otherwise only that one.
 * Sub-modes are mode-specific strings — see SUBMODES_BY_MODE in types.ts.
 */
export type SubmodeFilter = 'all' | string;

/**
 * The two-level tournament filter shared by every list view: mode first
 * (NGMC / Erumode), then that mode's own sub-modes — NGMC splits into
 * Normal / Random, Erumode into Normal / Random / Balanced / No Vocal.
 *
 * A sub-mode is only meaningful *within* a mode ("Normal" means different
 * things in NGMC and Erumode), so it is ignored unless a mode is selected.
 */
export interface MatchFilter {
  mode: ModeFilter;
  submode: SubmodeFilter;
}

/**
 * The unfiltered filter — every mode, every sub-mode. Exported so callers
 * that need a cache key or a fallback lookup can name it without rebuilding
 * the literal (see `listPlayerStats` in lib/store.ts).
 */
export const ALL_MATCH_FILTER: MatchFilter = { mode: 'all', submode: 'all' };

/** Sub-mode options offered for a mode filter (empty while mode is 'all'). */
export function submodeOptions(mode: ModeFilter): string[] {
  return mode === 'all' ? [] : SUBMODES_BY_MODE[mode];
}

/**
 * Reads a filter out of a page's `searchParams`, dropping anything that
 * isn't a real mode/sub-mode for the selected mode — so a hand-edited URL
 * can't ask for an impossible combination (e.g. `?mode=NGMC&submode=Balanced`).
 */
export function parseMatchFilter(params: { mode?: string; submode?: string }): MatchFilter {
  const mode: ModeFilter = MODES.includes(params.mode as Mode) ? (params.mode as Mode) : 'all';
  if (mode === 'all') return ALL_MATCH_FILTER;
  const submode = SUBMODES_BY_MODE[mode].includes(params.submode ?? '')
    ? (params.submode as string)
    : 'all';
  return { mode, submode };
}

/**
 * Like parseMatchFilter, but never yields the mode-level catch-all — used by
 * views where "all sub-modes" is meaningless. With no sub-mode in the URL any
 * of `modes` is accepted and the first becomes the default; with none at all
 * (or an invalid one) the first entry of `modes` is used.
 */
export function parseSubmodeFilter(
  params: { mode?: string; submode?: string },
  modes: readonly Mode[] = MODES
): { mode: Mode; submode: string } {
  const mode: Mode = modes.includes(params.mode as Mode) ? (params.mode as Mode) : modes[0];
  const submodes = SUBMODES_BY_MODE[mode];
  const submode = submodes.includes(params.submode ?? '') ? (params.submode as string) : submodes[0];
  return { mode, submode };
}

/** Narrows a match list to a filter — same array back when nothing is filtered. */
export function applyMatchFilter<T extends { mode: Mode; submode: string }>(
  matches: T[],
  filter: MatchFilter
): T[] {
  if (filter.mode === 'all') return matches;
  return matches.filter(
    (m) => m.mode === filter.mode && (filter.submode === 'all' || m.submode === filter.submode)
  );
}

/**
 * Human-readable name for a filter — "NGMC", "NGMC Normal", or '' when
 * unfiltered. Used for empty-state copy and page summaries.
 */
export function matchFilterLabel(filter: MatchFilter): string {
  if (filter.mode === 'all') return '';
  return filter.submode === 'all' ? filter.mode : `${filter.mode} ${filter.submode}`;
}

/**
 * Serializes a filter into a query string ('' when unfiltered) so a link can
 * carry the active selection to another view, e.g. /players -> a player page.
 */
export function matchFilterQuery(filter: MatchFilter): string {
  if (filter.mode === 'all') return '';
  const params = new URLSearchParams({ mode: filter.mode });
  if (filter.submode !== 'all') params.set('submode', filter.submode);
  return `?${params.toString()}`;
}
