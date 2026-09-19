import { norm } from './stats';
import type { Match, MatchFile, Team } from './types';

export interface GameResult {
  fileId: string;
  fileLabel: string;
  entries: {
    teamIndex: number;
    label: string;
    score: number;
    isWinner: boolean; // strictly highest score in this game (false if tied for first)
  }[];
  isTie: boolean; // every scored participant tied for first
}

export interface TeamResult {
  rank: number;
  teamIndex: number;
  label: string;
  members: Team;
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  matchPoints: number; // win = 1, tie = 0.5, loss = 0 — the primary sort key
  tb: number; // count of game wins against opponents tied on matchPoints
  setWins: number;
  setLosses: number;
  setTies: number;
  pts: number; // sum of this team's own entered scores across every game
}

export interface MatchResults {
  rankings: TeamResult[]; // sorted, rank 1..N
  podium: TeamResult[]; // top 3 (or fewer, if <3 teams have scores)
  games: GameResult[]; // every scored file, in file order
  hasScores: boolean; // false if no file has any scores entered yet
}

/** Result for every team that has a score in `file`. */
export function computeGameResult(file: MatchFile, teams: Team[]): GameResult | null {
  const scores = file.scores;
  if (!scores || Object.keys(scores).length === 0) return null;

  const entries = teams
    .map((team, teamIndex) => {
      const key = norm(team[0]);
      const score = scores[key];
      return score === undefined ? null : { teamIndex, label: team[0], score };
    })
    .filter((e): e is { teamIndex: number; label: string; score: number } => e !== null);

  if (entries.length < 2) return null; // need at least 2 scored teams to have a result

  const maxScore = Math.max(...entries.map((e) => e.score));
  const winners = entries.filter((e) => e.score === maxScore);
  const isTie = winners.length > 1;

  return {
    fileId: file.id,
    fileLabel: file.label,
    entries: entries.map((e) => ({ ...e, isWinner: !isTie && e.score === maxScore })),
    isTie,
  };
}

/**
 * Turns per-game team scores into full tournament standings.
 *
 * Every scored file is its own independent match — there is no grouping
 * of repeat matchups into a single best-of-N result. "Match" and "Set"
 * are therefore the same underlying per-game record; both are exposed
 * since the standings table displays them as separate columns.
 *
 * Ranking priority:
 *   1. matchPoints (win = 1, tie = 0.5, loss = 0)
 *   2. TB — game wins against opponents who share the same matchPoints total
 *   3. Set Wins
 *   4. Set Ties
 *   5. Pts — the sum of each team's own entered scores across every game
 */
export function computeMatchResults(match: Pick<Match, 'teams' | 'files'>): MatchResults {
  const teams = match.teams;
  const games = match.files
    .map((f) => computeGameResult(f, teams))
    .filter((g): g is GameResult => g !== null);

  const wins: Record<number, number> = {};
  const losses: Record<number, number> = {};
  const ties: Record<number, number> = {};
  const totalScore: Record<number, number> = {};
  teams.forEach((_, i) => {
    wins[i] = 0;
    losses[i] = 0;
    ties[i] = 0;
    totalScore[i] = 0;
  });

  for (const game of games) {
    for (const e of game.entries) {
      totalScore[e.teamIndex] += e.score;
      if (game.isTie) {
        ties[e.teamIndex]++;
      } else if (e.isWinner) {
        wins[e.teamIndex]++;
      } else {
        losses[e.teamIndex]++;
      }
    }
  }

  const matchPoints: Record<number, number> = {};
  teams.forEach((_, i) => {
    matchPoints[i] = wins[i] * 1 + ties[i] * 0.5;
  });

  // TB: game wins against opponents whose overall matchPoints match ours —
  // counted per game (so beating the same tied opponent twice counts
  // twice), not deduplicated per opponent.
  const tb: Record<number, number> = {};
  teams.forEach((_, i) => (tb[i] = 0));
  for (const game of games) {
    if (game.isTie) continue;
    const winner = game.entries.find((e) => e.isWinner);
    if (!winner) continue;
    for (const e of game.entries) {
      if (e.teamIndex === winner.teamIndex) continue;
      if (matchPoints[e.teamIndex] === matchPoints[winner.teamIndex]) {
        tb[winner.teamIndex]++;
      }
    }
  }

  const rankings: TeamResult[] = teams.map((team, teamIndex) => ({
    rank: 0, // filled in after sorting
    teamIndex,
    label: team[0],
    members: team,
    matchWins: wins[teamIndex],
    matchLosses: losses[teamIndex],
    matchTies: ties[teamIndex],
    matchPoints: matchPoints[teamIndex],
    tb: tb[teamIndex],
    setWins: wins[teamIndex],
    setLosses: losses[teamIndex],
    setTies: ties[teamIndex],
    pts: totalScore[teamIndex],
  }));

  rankings.sort(
    (a, b) =>
      b.matchPoints - a.matchPoints ||
      b.tb - a.tb ||
      b.setWins - a.setWins ||
      b.setTies - a.setTies ||
      b.pts - a.pts ||
      a.label.localeCompare(b.label)
  );
  rankings.forEach((r, i) => (r.rank = i + 1));

  return {
    rankings,
    podium: rankings.slice(0, 3),
    games,
    hasScores: games.length > 0,
  };
}