import { norm } from './stats';
import { computeMatchStats } from './stats';
import { computeGuessRateStats } from './guess-stats';
import { expectationFromDiff, type ExpectationLabel } from './expectation';
import { resolveAliasKey, withAliases, type PlayerAliases } from './player-aliases';
import type { Match } from './types';

export interface PlayerMatchEntry {
  matchId: string;
  matchTitle: string;
  date: string;
  mode: Match['mode'];
  songs: number;
  guessRate: number; // %
  // Performance = the mode/submode rating (see guess-stats.ts) — the number
  // the match Guess Rate table shows and rates players by.
  performance: number;
  // The "(N)" beside this player's name in *this tournament's* roster paste
  // (Match.playerRanks, keyed by normalized username) — the rank they were
  // listed at, which is what this tournament's Performance is graded against
  // (see entryExpectation). Absent when the roster wasn't annotated, which is
  // a different thing from a rank of zero.
  rank?: number;
  // VN-only (Mst) reading of an Erumode tournament, carried per entry so a
  // ranged view can pool VN Guess Rate (songs-weighted) and VN Expected Rank
  // (songs-weighted mean of these) exactly like the combined figures. Null
  // when that tournament never asked Mst.
  vnGuessRate?: number | null;
  vnPerformance?: number | null;
  // Per-answer-type guess rates (%) for that tournament, keyed by the raw
  // AnsType string — present only on Erumode entries, and only those types
  // that were active in that tournament.
  perType?: Record<string, number>;
  // The raw counts behind Rig GR / Offlist GR for that tournament, carried as
  // numerator/denominator so a ranged view can pool them exactly (sum the
  // counts, divide once) instead of averaging per-tournament percentages. See
  // erumodeSplitStats for the Erumode pooling and entryRigGr for the
  // single-tournament reading.
  //
  // `rigCount`/`rigHits` are set for both modes; the offlist pair only exists
  // for Erumode, which is the only mode that tracks guesses made off the list.
  rigCount?: number; // guesses on their list
  rigHits?: number; // of those, correct (once per active answer type, Erumode)
  offlistCount?: number; // guesses not on the list (same multiplicity)
  offlistHits?: number; // correct guesses not on the list
  // NGMC only:
  correct?: number;
  taken?: number;
  effTaken?: number;
  blocked?: number;
  effBlocked?: number;
}

/**
 * The promotion verdict for one tournament: their Performance in it against the
 * rank they were listed at in it, through the same thresholds the match Guess
 * Rate table uses (`expectationFromDiff`). Null when the roster carried no rank,
 * since there is nothing to compare against — the same rule that table applies,
 * so a tournament's history can't disagree with how that tournament scored it.
 */
export function entryExpectation(e: PlayerMatchEntry): ExpectationLabel | null {
  if (e.rank === undefined) return null;
  return expectationFromDiff(e.performance - e.rank);
}

/**
 * One tournament's Rig GR, or null when that tournament had nothing on the
 * player's list.
 *
 * Erumode asks one question per *active* answer type, so a rig hit is counted
 * once per type while the rig list itself is one per song — the denominator
 * carries that same multiplicity (see the note in erumodeSplitStats), or the
 * rate could exceed 100% on a multi-type event. NGMC asks a single question
 * per song, so there the denominator is just the list.
 */
export function entryRigGr(e: PlayerMatchEntry): number | null {
  const count = e.rigCount ?? 0;
  if (count === 0) return null;
  const attempts = e.mode === 'Erumode' ? count * Object.keys(e.perType ?? {}).length : count;
  return attempts > 0 ? (100 * (e.rigHits ?? 0)) / attempts : null;
}

/**
 * One tournament's Offlist GR, or null when it had no off-list opportunities.
 * The offlist counts already carry the per-answer-type multiplicity Erumode
 * applies, so they divide as they are. NGMC entries never carry them — that
 * mode doesn't track off-list guessing — which reads as null, i.e. "—".
 */
export function entryOfflistGr(e: PlayerMatchEntry): number | null {
  const count = e.offlistCount ?? 0;
  return count > 0 ? (100 * (e.offlistHits ?? 0)) / count : null;
}

export interface NgmcAggregate {
  matchesPlayed: number;
  totalSongs: number;
  totalCorrect: number;
  overallGuessRate: number; // % — totalCorrect / totalSongs
  // Songs-weighted mean of each match's Performance (see computePerformance
  // in guess-stats.ts). Weighted rather than a plain mean because
  // Performance is a per-tournament rating: players don't play the same
  // number of songs in every tournament, and a rating built on three songs
  // shouldn't count as much as one built on thirty.
  overallPerformance: number;
  totalTaken: number;
  totalEffTaken: number;
  totalBlocked: number;
  totalEffBlocked: number;
}

export interface ErumodeAggregate {
  matchesPlayed: number;
  totalSongs: number;
  // VN-only (Mst) pooled figures for the Erumode Normal VN columns:
  // vnGuessRate = songs-weighted mean of each tournament's Mst rate,
  // vnExpectedRank = songs-weighted mean of each tournament's VN-only
  // Performance. Null when no tournament in range asked Mst — 'never
  // measured' rather than a 0% that would read like a measurement.
  vnGuessRate: number | null;
  vnExpectedRank: number | null;
  // Guess rate here is a weighted average across matches — each match's
  // guess rate is normalized over (songs × active answer types), so a
  // straight unweighted mean would over-count matches with fewer active
  // types. Weighting by each match's own opportunity count keeps that
  // comparable.
  overallGuessRate: number; // %
  // Songs-weighted mean of each match's Performance — same rationale as the
  // NGMC aggregate above.
  overallPerformance: number;
}

export interface PlayerSummary {
  uname: string; // display name — first casing seen across matches
  matchesPlayed: number; // total across both modes
  ngmc: NgmcAggregate;
  erumode: ErumodeAggregate;
  entries: PlayerMatchEntry[]; // one per match, most recent first
}

function emptyNgmc(): NgmcAggregate {
  return {
    matchesPlayed: 0,
    totalSongs: 0,
    totalCorrect: 0,
    overallGuessRate: 0,
    overallPerformance: 0,
    totalTaken: 0,
    totalEffTaken: 0,
    totalBlocked: 0,
    totalEffBlocked: 0,
  };
}

export function emptyErumodeAggregate(): ErumodeAggregate {
  return { matchesPlayed: 0, totalSongs: 0, vnGuessRate: null, vnExpectedRank: null, overallGuessRate: 0, overallPerformance: 0 };
}

function emptyErumode(): ErumodeAggregate {
  return emptyErumodeAggregate();
}

/**
 * VN-only (Mst) pooled figures over a set of Erumode entries: songs-weighted
 * VN Guess Rate and songs-weighted VN Expected Rank (mean of each
 * tournament's VN-only Performance). Only tournaments that actually asked
 * Mst contribute — entries without an Mst reading are skipped, so a game
 * with extra GR columns still feeds exactly its VN numbers.
 *
 * Nulls mark "no Mst measured in this range" rather than a 0%.
 */
export function vnStatsOf(entries: PlayerMatchEntry[]): { vnGuessRate: number | null; vnExpectedRank: number | null } {
  let songs = 0;
  let grWeighted = 0;
  let perfWeighted = 0;
  for (const e of entries) {
    if (e.mode !== 'Erumode') continue;
    if (e.vnGuessRate == null || e.vnPerformance == null) continue;
    songs += e.songs;
    grWeighted += e.vnGuessRate * e.songs;
    perfWeighted += e.vnPerformance * e.songs;
  }
  if (songs === 0) return { vnGuessRate: null, vnExpectedRank: null };
  return { vnGuessRate: grWeighted / songs, vnExpectedRank: perfWeighted / songs };
}

/**
 * Aggregates every player's stats across every match in the database,
 * split into separate NGMC and Erumode totals (the two modes aren't
 * comparable — Erumode's guess rate is per answer-type, NGMC's is a single
 * correct/incorrect per song, and only NGMC has attacks/blocks at all). A
 * "player" is identified by normalized username *within* each match (after
 * that match's own renames are applied), then folded onto the canonical
 * identity by the global `aliases` — so the same real person using a
 * differently-spelled name in an unrelated tournament aggregates as one
 * player, which is what makes an alias a true cross-match identity link.
 *
 * Aliases ride the same name-resolution path the per-match renames already
 * use, so nothing downstream (Expected Ranks, autodraft, the player pages)
 * needs to know they exist.
 */
export function computeAllPlayerStats(
  matches: Match[],
  aliases: PlayerAliases = {}
): PlayerSummary[] {
  const players: Record<string, PlayerSummary> = {};
  // Weighted-average accumulators for Erumode guess rate, per player key.
  const erumodeOpportunities: Record<string, number> = {};
  const erumodeCorrectOpportunities: Record<string, number> = {};

  const getSummary = (uname: string): PlayerSummary => {
    const key = norm(uname);
    if (!players[key]) {
      players[key] = {
        uname,
        matchesPlayed: 0,
        ngmc: emptyNgmc(),
        erumode: emptyErumode(),
        entries: [],
      };
      erumodeOpportunities[key] = 0;
      erumodeCorrectOpportunities[key] = 0;
    }
    return players[key];
  };

  for (const match of matches) {
    // Global aliases first, this match's own renames on top — see withAliases.
    const renames = withAliases(match.renames, aliases);
    const guessStats = computeGuessRateStats({ ...match, renames });
    const isErumode = guessStats.mode === 'Erumode';
    const answerTypeCount = guessStats.activeTypes.length;

    // Attacks/blocks, keyed by normalized username, only for NGMC matches.
    const attackMap = new Map<string, { taken: number; effTaken: number; blocked: number; effBlocked: number }>();
    if (!isErumode) {
      const matchStats = computeMatchStats({ ...match, renames });
      for (const team of matchStats.teams) {
        for (const m of team.members) {
          attackMap.set(norm(m.uname), {
            taken: m.taken,
            effTaken: m.effTaken,
            blocked: m.blocked,
            effBlocked: m.effBlocked,
          });
        }
      }
    }

    if (isErumode) {
      for (const row of guessStats.erumodeRows) {
        if (row.songs === 0) continue;
        const summary = getSummary(row.uname);
        const key = norm(row.uname);

        summary.matchesPlayed++;
        summary.erumode.matchesPlayed++;
        summary.erumode.totalSongs += row.songs;
        summary.erumode.overallPerformance += row.performance * row.songs;

        const opportunities = row.songs * answerTypeCount;
        erumodeOpportunities[key] += opportunities;
        erumodeCorrectOpportunities[key] += (row.guessRate / 100) * opportunities;

        summary.entries.push({
          matchId: match.id,
          matchTitle: match.title,
          date: match.date,
          mode: match.mode,
          songs: row.songs,
          guessRate: row.guessRate,
          performance: row.performance,
          // The roster's own "(N)" for this player, if it was annotated — looked
          // up under the same normalized name the match Guess Rate table uses
          // (`playerRanks[norm(uname)]`), so this tournament's history shows the
          // same rank that tournament's own table graded them against.
          rank: match.playerRanks?.[key],
          vnGuessRate: row.vnGuessRate,
          vnPerformance: row.vnPerformance,
          perType: { ...(guessStats.activeTypes.length > 0 ? row.perType : {}) },
          rigCount: row.rigCount,
          rigHits: row.rigHits,
          offlistCount: row.offlistCount,
          offlistHits: row.offlistHits,
        });
      }
    } else {
      for (const row of guessStats.ngmcRows) {
        if (row.songs === 0) continue;
        const summary = getSummary(row.uname);
        const atk = attackMap.get(norm(row.uname));

        summary.matchesPlayed++;
        summary.ngmc.matchesPlayed++;
        summary.ngmc.totalSongs += row.songs;
        summary.ngmc.totalCorrect += row.correct;
        summary.ngmc.overallPerformance += row.performance * row.songs;
        if (atk) {
          summary.ngmc.totalTaken += atk.taken;
          summary.ngmc.totalEffTaken += atk.effTaken;
          summary.ngmc.totalBlocked += atk.blocked;
          summary.ngmc.totalEffBlocked += atk.effBlocked;
        }

        summary.entries.push({
          matchId: match.id,
          matchTitle: match.title,
          date: match.date,
          mode: match.mode,
          songs: row.songs,
          correct: row.correct,
          guessRate: row.guessRate,
          performance: row.performance,
          // Same lookup as the Erumode branch above, and the same one the match
          // Guess Rate table does: playerRanks keyed by normalized username.
          rank: match.playerRanks?.[norm(row.uname)],
          // NGMC asks one question per song and still has a list, so
          // the rig counts come along for Rigs / Rig GR in the player's history.
          // The offlist pair stays unset — NGMC doesn't track off-list guessing.
          rigCount: row.rigCount,
          rigHits: row.rigHits,
          ...(atk
            ? { taken: atk.taken, effTaken: atk.effTaken, blocked: atk.blocked, effBlocked: atk.effBlocked }
            : {}),
        });
      }
    }
  }

  const summaries = Object.values(players);
  for (const s of summaries) {
    const key = norm(s.uname);
    s.ngmc.overallGuessRate = s.ngmc.totalSongs ? (100 * s.ngmc.totalCorrect) / s.ngmc.totalSongs : 0;
    // The Performance accumulators hold Σ(performance × songs), so dividing
    // by the mode's own song count turns them into songs-weighted means.
    s.ngmc.overallPerformance = s.ngmc.totalSongs ? s.ngmc.overallPerformance / s.ngmc.totalSongs : 0;
    const opp = erumodeOpportunities[key] ?? 0;
    s.erumode.overallGuessRate = opp ? (100 * (erumodeCorrectOpportunities[key] ?? 0)) / opp : 0;
    s.erumode.overallPerformance = s.erumode.totalSongs
      ? s.erumode.overallPerformance / s.erumode.totalSongs
      : 0;
    // VN-only pooled figures over the same entries: regular Erumode games only
    // (entries are per-tournament already), Mst numbers alone even when the
    // tournament ran extra GR columns.
    const vn = vnStatsOf(s.entries);
    s.erumode.vnGuessRate = vn.vnGuessRate;
    s.erumode.vnExpectedRank = vn.vnExpectedRank;
    s.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  summaries.sort((a, b) => b.matchesPlayed - a.matchesPlayed || a.uname.localeCompare(b.uname));
  return summaries;
}

export function findPlayerSummary(
  matches: Match[],
  uname: string,
  aliases: PlayerAliases = {}
): PlayerSummary | null {
  const all = computeAllPlayerStats(matches, aliases);
  // Looked up by the name's canonical key, so a page reached through an alias
  // (an old username, a shared link) lands on the merged player instead of 404.
  const key = resolveAliasKey(uname, aliases);
  return all.find((p) => norm(p.uname) === key) ?? null;
}

/**
 * One player's numbers recomputed over just their `limit` most recent
 * tournaments, for the player page's "Recent" switch. The aggregates, the
 * per-tournament history and the match count all come from that slice, so the
 * cards and the table can never disagree about which tournaments are in view.
 * Returns the summary untouched when the window already covers their whole
 * history, so a player with five tournaments or fewer reads the same on both
 * sides of the switch.
 *
 * Deliberately *not* a re-run of computeAllPlayerStats over a filtered match
 * list: the slice is chosen by the player, not by their gamemode, so it
 * carries their whole history — every gamemode they have games in — and
 * narrowing the input by mode would cut a tournament out of the middle of that
 * set. The per-tournament rows carry every number the aggregates are built
 * from, so the recent view is the same arithmetic over fewer rows, and a
 * tournament they took no part in (no songs) is in neither — which is what makes
 * "the last 5" the last 5 they *played*.
 */
export function slicePlayerSummary(player: PlayerSummary, limit: number): PlayerSummary {
  const entries = player.entries.slice(0, limit);
  if (entries.length >= player.entries.length) return player;

  const sliced: PlayerSummary = {
    ...player,
    matchesPlayed: 0,
    ngmc: emptyNgmc(),
    erumode: emptyErumode(),
    entries,
  };

  // VN-only (Mst) accumulators over the same slice. Kept separate from the
  // combined songs count: the VN denominators must be Mst-measured songs.
  let vnSongs = 0;
  let vnGrWeighted = 0;
  let vnPerfWeighted = 0;

  // Accumulators first, as computeAllPlayerStats does too: the two rates hold
  // their weighted sums here and are turned into averages below.
  for (const e of entries) {
    sliced.matchesPlayed++;
    if (e.mode === 'Erumode') {
      sliced.erumode.matchesPlayed++;
      sliced.erumode.totalSongs += e.songs;
      sliced.erumode.overallGuessRate += e.guessRate * e.songs;
      sliced.erumode.overallPerformance += e.performance * e.songs;
      // VN-only (Mst) accumulators over the same slice — songs-weighted like
      // the combined figures. Entries without an Mst reading contribute
      // nothing, so a game with extra GR columns still feeds only VN numbers.
      // vnSongs tracks Mst-measured songs separately: the denominator must be
      // VN songs, not all songs (see the finals below).
      if (e.vnGuessRate != null && e.vnPerformance != null) {
        vnSongs += e.songs;
        vnGrWeighted += e.vnGuessRate * e.songs;
        vnPerfWeighted += e.vnPerformance * e.songs;
      }
    } else {
      sliced.ngmc.matchesPlayed++;
      sliced.ngmc.totalSongs += e.songs;
      sliced.ngmc.totalCorrect += e.correct ?? 0;
      sliced.ngmc.overallPerformance += e.performance * e.songs;
      sliced.ngmc.totalTaken += e.taken ?? 0;
      sliced.ngmc.totalEffTaken += e.effTaken ?? 0;
      sliced.ngmc.totalBlocked += e.blocked ?? 0;
      sliced.ngmc.totalEffBlocked += e.effBlocked ?? 0;
    }
  }

  // The same finals computeAllPlayerStats applies: NGMC's guess rate is exactly
  // totalCorrect / totalSongs, while Erumode's and both Performance means are the
  // songs-weighted mean of the per-tournament rates. Erumode's guess rate is the
  // one approximation here — the full aggregation normalizes each tournament's
  // rate over (songs × active answer types), which the rows don't carry, so
  // weighting by song count is the closest the same shape comes out of them.
  sliced.ngmc.overallGuessRate = sliced.ngmc.totalSongs
    ? (100 * sliced.ngmc.totalCorrect) / sliced.ngmc.totalSongs
    : 0;
  sliced.ngmc.overallPerformance = sliced.ngmc.totalSongs
    ? sliced.ngmc.overallPerformance / sliced.ngmc.totalSongs
    : 0;
  sliced.erumode.overallGuessRate = sliced.erumode.totalSongs
    ? sliced.erumode.overallGuessRate / sliced.erumode.totalSongs
    : 0;
  sliced.erumode.overallPerformance = sliced.erumode.totalSongs
    ? sliced.erumode.overallPerformance / sliced.erumode.totalSongs
    : 0;
  // VN-only finals over the sliced entries: songs-weighted means over
  // Mst-measured songs. A slice with no Mst readings keeps nulls ("never
  // measured") rather than a 0% that would read like a measurement.
  sliced.erumode.vnGuessRate = vnSongs > 0 ? vnGrWeighted / vnSongs : null;
  sliced.erumode.vnExpectedRank = vnSongs > 0 ? vnPerfWeighted / vnSongs : null;
  return sliced;
}

/**
 * The five Erumode answer types the split guess-rate columns are drawn from, in
 * column order: the raw `AnsType` key to read from `ErumodeSplitStats.perType`,
 * the short header label, and the full wording behind it on hover.
 *
 * One list, shared by the players list (`components/PlayerListTable.tsx`) and
 * the player page's ladder summary (`components/PlayerRankSummary.tsx`), so
 * "VN" / "Artist" / "SN" / "Dev" / "Comp" can't come to mean two different
 * columns in two places — the same rule ANSWER_TYPE_LABELS follows inside the
 * match Guess Rate table.
 *
 * The types are always drawn in this fixed order rather than "whatever the
 * tournament asked", so a table keeps its shape from event to event; a type no
 * tournament in range asked simply has no rate to print (see the `—` handling in
 * the components).
 */
export const SPLIT_TYPES = [
  { type: 'Mst', label: 'VN', title: 'Main title guess rate' },
  { type: 'A', label: 'Artist', title: 'Artist guess rate' },
  { type: 'Mt', label: 'SN', title: 'Song name guess rate' },
  { type: 'Developer', label: 'Dev', title: 'Developer guess rate' },
  { type: 'Composer', label: 'Comp', title: 'Composer guess rate' },
] as const;
/**
 * One player's Erumode split guess figures pooled over exactly the entries
 * handed in — the /players list's Erumode-only columns (per-answer-type GR,
 * Average Rig, Rig GR%, Offlist GR%), built from whatever range that page is
 * showing: the sliced entries for "Recent", the whole set for "All-Time".
 *
 * Everything is summed from raw counts and divided once at the end, never
 * averaged across tournaments — a three-song event must not outweigh a
 * thirty-song one. The per-type rates pool over the song counts of just the
 * tournaments where that answer type was active (a type absent from a
 * tournament contributes neither numerator nor denominator, rather than a
 * phantom 0%), which re-pools to exactly the rate computeGuessRateStats would
 * have produced over the same tournaments as one.
 *
 * Nulls mark "nothing in this range to divide by" (no rig at all, no
 * off-list opportunities) rather than a 0% that would read like a measurement.
 */
export interface ErumodeSplitStats {
  /** Pooled guess rate (%) per answer type, keyed by raw AnsType — only the
   * types active in at least one tournament of the range. */
  perType: Record<string, number>;
  /** Mean on-list (rig) guesses per tournament in the range, or null when
   * there were no tournaments to average over. */
  avgRig: number | null;
  /** Pooled % of on-list guesses that were correct, or null when nothing in
   * the range was on a list. */
  rigGr: number | null;
  /** Pooled % of off-list guesses that were correct, or null when there were
   * no off-list opportunities. */
  offlistGr: number | null;
}

export function erumodeSplitStats(entries: PlayerMatchEntry[]): ErumodeSplitStats {
  const typeSongs: Record<string, number> = {};
  const typeCorrect: Record<string, number> = {};
  let tournaments = 0;
  let rigCount = 0; // raw on-list count — the Avg Rig numerator
  let rigAttempts = 0; // × active answer types — the Rig GR% denominator
  let rigHits = 0;
  let offlistCount = 0;
  let offlistHits = 0;

  for (const e of entries) {
    if (e.mode !== 'Erumode') continue;
    tournaments++;
    // Each per-type rate's denominator is that tournament's own song count
    // (see computeGuessRateStats), so weighting by songs re-pools exactly.
    if (e.perType) {
      for (const [t, rate] of Object.entries(e.perType)) {
        typeSongs[t] = (typeSongs[t] ?? 0) + e.songs;
        typeCorrect[t] = (typeCorrect[t] ?? 0) + (rate * e.songs) / 100;
      }
    }
    // Rig hits are counted once per active answer type, but rigCount is per
    // song (see computeGuessRateStats) — the tournament's own rigGr divides
    // by rigCount × activeTypes.length, so the pool needs the same
    // multiplicity or a multi-type event would report hits over songs and
    // blow past 100%. perType's key count is exactly that active-type count.
    // The raw count stays separate: Avg Rig counts lists, not per-type hits.
    const typeCount = e.perType ? Object.keys(e.perType).length : 0;
    rigCount += e.rigCount ?? 0;
    rigAttempts += (e.rigCount ?? 0) * typeCount;
    rigHits += e.rigHits ?? 0;
    offlistCount += e.offlistCount ?? 0;
    offlistHits += e.offlistHits ?? 0;
  }

  const perType: Record<string, number> = {};
  for (const t of Object.keys(typeSongs)) {
    if (typeSongs[t] > 0) perType[t] = (100 * typeCorrect[t]) / typeSongs[t];
  }

  return {
    perType,
    avgRig: tournaments > 0 ? rigCount / tournaments : null,
    rigGr: rigAttempts > 0 ? (100 * rigHits) / rigAttempts : null,
    offlistGr: offlistCount > 0 ? (100 * offlistHits) / offlistCount : null,
  };
}
