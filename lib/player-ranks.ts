import { norm } from './stats';
import { computeAllPlayerStats } from './player-stats';
import { resolveAliasKey, type PlayerAliases } from './player-aliases';
import type { ExpectationLabel } from './expectation';
import { expectationFromDiff } from './expectation';
import type { Match, SetRanks } from './types';

/**
 * One row of the Player Manager table: what a player has actually played
 * like in a single gamemode + sub-mode, next to the rank the admin has
 * assigned them there.
 */
export interface PlayerRankRow {
  uname: string;
  // Normalized username — the key Set Ranks are stored/looked up under, and
  // the identity player stats aggregate by. Handed back to the client so
  // saving a rank requires no name re-normalization in the browser.
  playerKey: string;
  matchesPlayed: number; // tournaments matching this gamemode + sub-mode
  songs: number; // songs played in them
  guessRate: number; // %, those tournaments only
  // Expected Rank = the Performance those tournaments imply (songs-weighted
  // mean — see lib/player-stats.ts). Same number/scale as the rank a roster
  // is annotated with, which is what makes the two comparable.
  expectedRank: number;
  setRank: number | null; // admin-assigned rank for this gamemode + sub-mode
  // Expected Rank − Set Rank; null while no Set Rank exists to compare against.
  diff: number | null;
  expectation: ExpectationLabel | null;
}

/**
 * Builds the Player Manager's rows for one gamemode + sub-mode: the players
 * who have played it, their aggregated Performance as an Expected Rank, and
 * the admin's Set Rank for it with the resulting promotion verdict.
 *
 * The figures come *only* from tournaments in this exact gamemode + sub-mode.
 * A player's play in a sibling sub-mode is a different game, and its
 * Performance isn't on the same scale, so it is never substituted in as a
 * baseline: someone who hasn't played this sub-mode simply has no row, and
 * their Expected Rank waits until they do. Grading a draft against numbers
 * from a neighbouring sub-mode would quietly mis-draft every team.
 *
 * `submodeMatches` must be mode+sub-mode filtered (via applyMatchFilter) —
 * ranks, and therefore expectations, are stored per sub-mode, so these rows
 * are exactly what a tournament with the same mode + sub-mode is graded
 * against, and what autodraft uses.
 *
 * Players with no Set Rank still get a row (they're the ones the admin most
 * needs to rank) but carry no diff/expectation, since there's nothing to
 * compare their Expected Rank against.
 */
export function computePlayerRankRows(
  submodeMatches: Match[],
  setRanks: SetRanks,
  mode: string,
  submode: string,
  aliases: PlayerAliases = {}
): PlayerRankRow[] {
  const ranks = setRanks[mode]?.[submode] ?? {};
  const isErumode = mode === 'Erumode';

  const rows: PlayerRankRow[] = [];
  const seen = new Set<string>();

  const addRow = (
    uname: string,
    aggregate: { matchesPlayed: number; totalSongs: number; overallGuessRate: number; overallPerformance: number }
  ) => {
    const playerKey = norm(uname);
    if (seen.has(playerKey)) return;
    seen.add(playerKey);

    const setRank = ranks[playerKey] ?? null;
    const expectedRank = aggregate.overallPerformance;
    const diff = setRank === null ? null : expectedRank - setRank;

    rows.push({
      uname,
      playerKey,
      matchesPlayed: aggregate.matchesPlayed,
      songs: aggregate.totalSongs,
      guessRate: aggregate.overallGuessRate,
      expectedRank,
      setRank,
      diff,
      expectation: diff === null ? null : expectationFromDiff(diff),
    });
  };

  // Everyone who has played this exact gamemode + sub-mode, and no one else.
  for (const p of computeAllPlayerStats(submodeMatches, aliases)) {
    const aggregate = isErumode ? p.erumode : p.ngmc;
    if (aggregate.matchesPlayed === 0) continue;
    addRow(p.uname, aggregate);
  }

  // Best current form first; unranked-but-comparable rows keep their
  // Expected Rank order rather than being pushed to the bottom, since the
  // Expected Rank is computed from data in every case.
  const sorted = [...rows].sort(
    (a, b) => b.expectedRank - a.expectedRank || a.uname.localeCompare(b.uname)
  );
  return sorted;
}

/**
 * The Set Ranks for one gamemode + sub-mode as a normalized-name -> rank
 * map — exactly the shape the autodrafter balances with (and that pasted
 * `ranks.txt` tables parse into). Returns null when nothing has been ranked
 * for that combination yet, so callers can say "no saved ranks" rather than
 * build an empty table.
 */
export function savedRanksFor(setRanks: SetRanks, mode: string, submode: string): Record<string, number> | null {
  const ranks = setRanks[mode]?.[submode];
  return ranks && Object.keys(ranks).length > 0 ? ranks : null;
}

/**
 * Expected Ranks for players in one gamemode + sub-mode as a normalized-name
 * -> rank map, for use as a fallback in autodraft when a player has no Set
 * Rank. Computed from the songs-weighted mean of each player's Performance
 * across tournaments in this gamemode + sub-mode.
 *
 * Scoped to that sub-mode and no wider: another sub-mode's games are a
 * different game, so their Performance is never used as a stand-in for a
 * sub-mode that has no tournaments yet.
 *
 * Returns null when there's no data to compute Expected Ranks from, so callers
 * can distinguish "no ranks assigned yet" from "no performance data available".
 */
export function expectedRanksFor(
  submodeMatches: Match[],
  mode: string,
  aliases: PlayerAliases = {}
): Record<string, number> | null {
  const isErumode = mode === 'Erumode';
  const allStats = computeAllPlayerStats(submodeMatches, aliases);
  if (!allStats.length) return null;

  const ranks: Record<string, number> = {};
  for (const p of allStats) {
    const aggregate = isErumode ? p.erumode : p.ngmc;
    if (aggregate.matchesPlayed === 0) continue;
    const expectedRank = aggregate.overallPerformance;
    if (expectedRank > 0) {
      // Keyed by the canonical name so autodraft balances a merged identity as
      // one player, and so a Set Rank saved before the alias still lines up.
      ranks[resolveAliasKey(p.uname, aliases)] = expectedRank;
    }
  }
  return Object.keys(ranks).length > 0 ? ranks : null;
}

/**
 * Expected Ranks from recent form instead of full history: for each player,
 * the songs-weighted mean of their Performance over their `limit` (default 5)
 * most recent tournaments — the autodrafter's "Expected (last 5)" source, so
 * a player's current run counts more than tournaments from a year ago.
 *
 * Same scale as Set Rank / roster `(N)` ranks, and scoped to the one sub-mode
 * like `expectedRanksFor`: `submodeMatches` is the only input, so a sub-mode
 * with no tournaments of its own yields null and the caller falls back to Set
 * Ranks rather than borrowing a sibling sub-mode's numbers.
 */
export function recentExpectedRanksFor(
  submodeMatches: Match[],
  mode: string,
  limit = 5,
  aliases: PlayerAliases = {}
): Record<string, number> | null {
  const allStats = computeAllPlayerStats(submodeMatches, aliases);
  if (!allStats.length) return null;

  const ranks: Record<string, number> = {};
  for (const p of allStats) {
    // `entries` is one per tournament, most recent first (sorted in
    // computeAllPlayerStats), each carrying that tournament's Performance
    // and song count — enough to rebuild the songs-weighted mean over just
    // the latest few. The source slice is already this sub-mode only; the
    // mode check just keeps the two halves of the aggregate apart.
    const recent = p.entries.filter((e) => e.mode === mode).slice(0, limit);
    let weighted = 0;
    let songs = 0;
    for (const e of recent) {
      weighted += e.performance * e.songs;
      songs += e.songs;
    }
    if (songs === 0) continue;
    const expectedRank = weighted / songs;
    if (expectedRank > 0) {
      ranks[resolveAliasKey(p.uname, aliases)] = expectedRank;
    }
  }
  return Object.keys(ranks).length > 0 ? ranks : null;
}