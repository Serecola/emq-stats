import { norm } from './stats';
import { computeAllPlayerStats } from './player-stats';
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
  // Which slice the stats/Expected Rank came from. 'submode' rows have played
  // this exact gamemode + sub-mode; 'gamemode' rows haven't yet and fall back
  // to their play across the whole gamemode, so a brand-new sub-mode can still
  // be ranked before its first tournament (the table flags these rows).
  basis: 'submode' | 'gamemode';
}

/**
 * Builds the Player Manager's rows for one gamemode + sub-mode: the players
 * who have played it, their aggregated Performance as an Expected Rank, and
 * the admin's Set Rank for it with the resulting promotion verdict.
 *
 * Everyone who has played *anything* in this gamemode also gets a row, even
 * without a tournament in this sub-mode, so a new sub-mode's ladder can be
 * filled in before it's been played — those rows are marked `basis:
 * 'gamemode'` and take their Expected Rank from the whole gamemode as the
 * closest available baseline.
 *
 * `submodeMatches` must be mode+sub-mode filtered and `gamemodeMatches` mode
 * filtered (both via applyMatchFilter) — ranks, and therefore expectations,
 * are stored per sub-mode, so the submode rows are exactly what a tournament
 * with the same mode + sub-mode is graded against, and what autodraft uses.
 *
 * Players with no Set Rank still get a row (they're the ones the admin most
 * needs to rank) but carry no diff/expectation, since there's nothing to
 * compare their Expected Rank against.
 */
export function computePlayerRankRows(
  submodeMatches: Match[],
  gamemodeMatches: Match[],
  setRanks: SetRanks,
  mode: string,
  submode: string
): PlayerRankRow[] {
  const ranks = setRanks[mode]?.[submode] ?? {};
  const isErumode = mode === 'Erumode';

  const rows: PlayerRankRow[] = [];
  const seen = new Set<string>();

  const addRow = (
    uname: string,
    aggregate: { matchesPlayed: number; totalSongs: number; overallGuessRate: number; overallPerformance: number },
    basis: 'submode' | 'gamemode'
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
      basis,
    });
  };

  // Primary rows: played this exact gamemode + sub-mode.
  for (const p of computeAllPlayerStats(submodeMatches)) {
    const aggregate = isErumode ? p.erumode : p.ngmc;
    if (aggregate.matchesPlayed === 0) continue;
    addRow(p.uname, aggregate, 'submode');
  }
  // Fallback rows: known in this gamemode, but not in this sub-mode yet.
  for (const p of computeAllPlayerStats(gamemodeMatches)) {
    const aggregate = isErumode ? p.erumode : p.ngmc;
    if (aggregate.matchesPlayed === 0) continue;
    addRow(p.uname, aggregate, 'gamemode');
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
 * across tournaments in this gamemode + sub-mode (or the whole gamemode as a
 * baseline for players who haven't played this sub-mode yet).
 *
 * Returns null when there's no data to compute Expected Ranks from, so callers
 * can distinguish "no ranks assigned yet" from "no performance data available".
 */
export function expectedRanksFor(
  submodeMatches: Match[],
  gamemodeMatches: Match[],
  mode: string,
  submode: string
): Record<string, number> | null {
  const isErumode = mode === 'Erumode';
  const allStats = computeAllPlayerStats(submodeMatches.length ? submodeMatches : gamemodeMatches);
  if (!allStats.length) return null;

  const ranks: Record<string, number> = {};
  for (const p of allStats) {
    const aggregate = isErumode ? p.erumode : p.ngmc;
    if (aggregate.matchesPlayed === 0) continue;
    // Use the submode aggregate when available, otherwise the gamemode aggregate.
    const expectedRank = aggregate.overallPerformance;
    if (expectedRank > 0) {
      ranks[norm(p.uname)] = expectedRank;
    }
  }
  return Object.keys(ranks).length > 0 ? ranks : null;
}