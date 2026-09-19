import { norm } from './stats';
import { computeMatchStats } from './stats';
import { computeGuessRateStats } from './guess-stats';
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
 * that match's own renames are applied) — the same real person using a
 * differently-spelled name in an unrelated match shows up as a separate
 * entry, since there's no cross-match identity linking.
 */
export function computeAllPlayerStats(matches: Match[]): PlayerSummary[] {
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
    const guessStats = computeGuessRateStats(match);
    const isErumode = guessStats.mode === 'Erumode';
    const answerTypeCount = guessStats.activeTypes.length;

    // Attacks/blocks, keyed by normalized username, only for NGMC matches.
    const attackMap = new Map<string, { taken: number; effTaken: number; blocked: number; effBlocked: number }>();
    if (!isErumode) {
      const matchStats = computeMatchStats(match);
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

export function findPlayerSummary(matches: Match[], uname: string): PlayerSummary | null {
  const all = computeAllPlayerStats(matches);
  return all.find((p) => norm(p.uname) === norm(uname)) ?? null;
}