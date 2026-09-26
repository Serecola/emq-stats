import { MODES, SUBMODES_BY_MODE, type Mode } from './types';

/** 'all' keeps every mode; otherwise only that one. */
export type ModeFilter = 'all' | Mode;

/**
 * 'all' keeps every sub-mode of the selected mode; otherwise only that one.
 * Sub-modes are mode-specific strings — see SUBMODES_BY_MODE in types.ts.
 */
export type SubmodeFilter = 'all' | string;

/**
 * The tournament filter shared by every list view: mode + sub-mode — NGMC
 * splits into Normal / Random, Erumode into Normal / Random / Balanced /
 * No Vocal. There is no "all" view on the player pages: they always work
 * inside exactly one mode + sub-mode, defaulting to the first mode's first
 * sub-mode (Erumode Normal).
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
 * Like parseMatchFilter, but never yields a catch-all — used by views where
 * "all modes" (or "all sub-modes") is meaningless. With no mode in the URL
 * the first entry of `modes` (Erumode) becomes the default, and with no valid
 * sub-mode for it the first sub-mode of that mode (Normal) does.
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
  if (filter.mode === 'all') {
    if (filter.submode === 'all') return matches;
    return matches.filter((m) => m.submode === filter.submode);
  }
  return matches.filter(
    (m) => m.mode === filter.mode && (filter.submode === 'all' || m.submode === filter.submode)
  );
}

/**
 * Whether a filter can match tournaments of `mode` at all.
 */
export function filterIncludesMode(filter: MatchFilter, mode: Mode): boolean {
  if (filter.mode !== 'all' && filter.mode !== mode) return false;
  return filter.submode === 'all' || SUBMODES_BY_MODE[mode].includes(filter.submode);
}

/**
 * Human-readable name for a filter — "Erumode", "Erumode Normal", or '' when
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
