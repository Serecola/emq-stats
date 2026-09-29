import { norm } from './stats';
import { computeMatchStats } from './stats';
import { computeGuessRateStats } from './guess-stats';
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
  // Per-answer-type guess rates (%) for that tournament, keyed by the raw
  // AnsType string — present only on Erumode entries, and only those types
  // that were active in that tournament.
  perType?: Record<string, number>;
  // Erumode only — the raw counts behind Rig GR / Offlist GR for that
  // tournament, carried as numerator/denominator so a ranged view can pool
  // them exactly (sum the counts, divide once) instead of averaging
  // per-tournament percentages. See erumodeSplitStats.
  rigCount?: number; // guesses on their pre-made list
  rigHits?: number; // of those, correct (once per active answer type)
  offlistCount?: number; // guesses not on the list (same multiplicity)
  offlistHits?: number; // correct guesses not on the list
  // NGMC only:
  correct?: number;
  taken?: number;
  effTaken?: number;
  blocked?: number;
  effBlocked?: number;
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

function emptyErumode(): ErumodeAggregate {
  return { matchesPlayed: 0, totalSongs: 0, overallGuessRate: 0, overallPerformance: 0 };
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

  // Accumulators first, as computeAllPlayerStats does too: the two rates hold
  // their weighted sums here and are turned into averages below.
  for (const e of entries) {
    sliced.matchesPlayed++;
    if (e.mode === 'Erumode') {
      sliced.erumode.matchesPlayed++;
      sliced.erumode.totalSongs += e.songs;
      sliced.erumode.overallGuessRate += e.guessRate * e.songs;
      sliced.erumode.overallPerformance += e.performance * e.songs;
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
  return sliced;
}

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
