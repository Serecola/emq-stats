import { withAliases, type PlayerAliases } from './player-aliases';
import { norm } from './stats';
import type { MatchSummary } from './types';

/**
 * Which tournaments the list is narrowed to by player: `with` are players a
 * tournament must contain (all of them), `without` are players it must contain
 * none of. Both are lists so the two can be combined — "tournaments karira and
 * patt both played" is just as useful as either alone.
 *
 * Stored as normalized keys, not display names: identity in this app is always
 * the normalized username (see lib/stats.ts), and matching on anything else
 * would make "Karira" and "karira" two different filters.
 */
export interface PlayerFilter {
  with: string[];
  without: string[];
}

/** Long enough for any real question, short enough to keep a URL sane. */
const MAX_NAMES = 25;

const parseNames = (raw: string | undefined): string[] => {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const key = norm(part);
    // A hand-edited URL can repeat a name or send an empty one; dedupe and
    // drop empties so a filter can't contradict itself.
    if (key && !seen.has(key)) seen.add(key);
    if (seen.size >= MAX_NAMES) break;
  }
  return [...seen];
};

/**
 * Reads the player filter out of a page's `searchParams`.
 *
 * `with` / `without` are the committed filters. `q` + `add` is a pending
 * addition — what the search form submits — folded in here rather than in JS,
 * so the form keeps working (and the filter stays bookmarkable) with client JS
 * unavailable. The component rewrites the URL to the committed form once
 * it's added, so `q` doesn't linger there.
 */
export function parsePlayerFilter(params: {
  with?: string;
  without?: string;
  q?: string;
  add?: string;
}): PlayerFilter {
  const withNames = parseNames(params.with);
  const withoutNames = parseNames(params.without);
  const pending = norm(params.q ?? '');
  if (pending) {
    // The same name on both sides would make the filter unsatisfiable, so the
    // pending addition wins and clears the opposite side.
    if (params.add === 'without') {
      return { with: withNames.filter((n) => n !== pending), without: [...withoutNames, pending] };
    }
    return { with: [...withNames, pending], without: withoutNames.filter((n) => n !== pending) };
  }
  return { with: withNames, without: withoutNames };
}

/** True when no player filter is active — the unfiltered case. */
export function isEmptyPlayerFilter(filter: PlayerFilter): boolean {
  return filter.with.length === 0 && filter.without.length === 0;
}

/** Serializes a filter into a query string ('' when unfiltered). */
export function playerFilterQuery(filter: PlayerFilter): string {
  const params = new URLSearchParams();
  if (filter.with.length) params.set('with', filter.with.join(','));
  if (filter.without.length) params.set('without', filter.without.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * A filter with `name` added to one side, or removed from it when it's already
 * there. Adding a name that's on the opposite side moves it rather than
 * producing a filter nothing can satisfy.
 */
export function togglePlayer(
  filter: PlayerFilter,
  name: string,
  side: 'with' | 'without'
): PlayerFilter {
  const key = norm(name);
  if (!key) return filter;
  if (filter[side].includes(key)) {
    return { ...filter, [side]: filter[side].filter((n) => n !== key) };
  }
  return {
    with: side === 'with' ? [...filter.with, key] : filter.with.filter((n) => n !== key),
    without:
      side === 'without' ? [...filter.without, key] : filter.without.filter((n) => n !== key),
  };
}

/**
 * Every player in a tournament's roster, as normalized keys.
 *
 * Names go through the same resolution the rest of the app uses: the match's
 * own `renames` (the admin correcting that tournament's paste) with the global
 * aliases folded underneath, then normalized. So filtering for a player finds
 * the tournaments where they were entered under an old name too, rather than
 * silently missing exactly the ones a rename was made to fix.
 *
 * The roster is the source rather than the uploaded files because it's what's
 * on the card and all the summary read gives us (a roster, no multi-megabyte
 * payloads), and because the roster is what an admin edits when fixing a
 * tournament. A player who played without being in the pasted roster isn't
 * listed here — the admin form surfaces those separately as unmatched names.
 */
export function participantsOf(summary: MatchSummary, aliases: PlayerAliases): Set<string> {
  const resolved = withAliases(summary.renames, aliases);
  const present = new Set<string>();
  for (const team of summary.teams) {
    for (const uname of team) {
      if (!uname) continue;
      present.add(norm(resolved[norm(uname)] ?? uname));
    }
  }
  return present;
}

/**
 * Narrows a tournament list to a player filter: keep a tournament when it
 * contains every `with` player and none of the `without` ones. Same array back
 * when nothing is filtered.
 */
export function applyPlayerFilter<T extends MatchSummary>(
  matches: T[],
  filter: PlayerFilter,
  aliases: PlayerAliases
): T[] {
  if (isEmptyPlayerFilter(filter)) return matches;
  // Normalized here too, not just in parsePlayerFilter: the keys come off
  // URLs, and matching normalized keys against normalized rosters means an
  // un-normalized one ("Karira") would silently match nothing rather than
  // everything it should.
  const withSet = new Set(filter.with.map(norm));
  const withoutSet = new Set(filter.without.map(norm));
  return matches.filter((m) => {
    const present = participantsOf(m, aliases);
    for (const key of withSet) if (!present.has(key)) return false;
    for (const key of withoutSet) if (present.has(key)) return false;
    return true;
  });
}

/**
 * Every player who appears in any of these tournaments' rosters, as normalized
 * key -> the name to show them by plus how many of the tournaments they were
 * in. Drives the search box's suggestions and the counts on its chips.
 *
 * The most common spelling of a name wins, so a player who appears as both
 * "Karira" and "karira" is offered as the one most of their tournaments use.
 * Names that resolve to the same key (through renames or aliases) are one
 * entry, shown under the resolved spelling — the canonical name the rest of
 * the app links to.
 */
export function collectRosterNames(
  matches: MatchSummary[],
  aliases: PlayerAliases
): Map<string, { name: string; count: number }> {
  const spellings = new Map<string, Map<string, number>>();
  const bump = (key: string, display: string) => {
    const variants = spellings.get(key) ?? new Map<string, number>();
    variants.set(display, (variants.get(display) ?? 0) + 1);
    spellings.set(key, variants);
  };

  for (const summary of matches) {
    const resolved = withAliases(summary.renames, aliases);
    const seen = new Set<string>();
    for (const team of summary.teams) {
      for (const uname of team) {
        if (!uname) continue;
        const key = norm(resolved[norm(uname)] ?? uname);
        // A player sits on one team — a repeated name mustn't inflate the
        // count or skew which spelling is "the" common one.
        if (seen.has(key)) continue;
        seen.add(key);
        bump(key, resolved[norm(uname)] ?? uname);
      }
    }
  }

  const out = new Map<string, { name: string; count: number }>();
  for (const [key, variants] of spellings) {
    // `count` is every tournament this player was in, so it's the sum over the
    // spellings — taking the largest single spelling would undercount a player
    // whose name is cased differently from one tournament to the next. The
    // label, on the other hand, is whichever spelling appears most often, so
    // they're tracked separately.
    let name = '';
    let best = 0;
    let count = 0;
    for (const [spelling, n] of variants) {
      count += n;
      if (n > best) {
        name = spelling;
        best = n;
      }
    }
    out.set(key, { name, count });
  }
  return out;
}
