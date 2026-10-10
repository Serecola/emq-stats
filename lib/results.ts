import { fileParticipants, fileRosterMembers, norm } from './stats';
import { isThreeWayFormat, placementPoints } from './format';
import { withAliases, type PlayerAliases } from './player-aliases';
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

/**
 * Which standings rules a tournament is ranked by. Decided once, from the
 * team count (see lib/format.ts) 窶・never re-inferred from the games:
 *
 *   roundRobin 窶・4 or 6 teams, ranked on wins with a head-to-head TB
 *   threeWay   窶・3 teams, five 3v3v3 rounds, ranked on summed placement
 *                points (3 / 2 / 1) with the number of rounds won as TB
 */
export type StandingsFormat = 'roundRobin' | 'threeWay';

export interface TeamResult {
  rank: number;
  teamIndex: number;
  label: string;
  members: Team;
  /**
   * Finishes by place across every game, competition-ranked (teams level on
   * score share a place). `firsts` is the 3v3v3 tiebreak and the number its
   * podium shows; the round-robin table doesn't read any of the three 窶・
   * there a win is already a 1st and the columns are W-L-T.
   */
  firsts: number;
  seconds: number;
  thirds: number;
  /**
   * Round robin: games won / lost / tied. 3v3v3: rounds finished 1st / 3rd /
   * 2nd 窶・the place counts, carried in the same fields so anything showing
   * a record shows "how the rounds went" for either format.
   */
  matchWins: number;
  matchLosses: number;
  matchTies: number;
  // Round robin: win = 1, tie = 0.5, loss = 0 窶・the primary sort key.
  // 3v3v3: the team's total placement points (equal to `pts`), same role.
  matchPoints: number;
  // Round robin: count of game wins against opponents tied on matchPoints.
  // 3v3v3: how many rounds the team won (finished 1st) 窶・the tiebreak on
  // equal points.
  tb: number;
  setWins: number;
  setLosses: number;
  setTies: number;
  // Round robin: sum of this team's own entered scores across every game.
  // 3v3v3: total points — 3 for a 1st, 2 for a 2nd, 1 for a 3rd, summed
  // over the five rounds (and displayed as the Pts column).
  pts: number;
  // 3v3v3: the raw sum of each team's own entered scores across every round.
  // Not a sort key on its own — always shadowed by Points — but the tiebreak
  // after points, so the team that also has more raw score finishes higher.
  totalScore: number;
}

export interface MatchResults {
  format: StandingsFormat; // which rules produced the rankings below
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
 *   1. matchPoints (win = 1, tie = 0.5, loss = 0)
 *   2. TB — game wins against opponents who share the same matchPoints total
 *   3. Set Wins
 *   4. Set Ties
 *
 *   5. Pts — the sum of each team's own entered scores across every game
 *
 * 3v3v3 (3 teams, five rounds) —
 *
 *   1. Points — 3 for a 1st, 2 for a 2nd, 1 for a 3rd in each round, summed
 *   2. Total Score — raw sum of each team's own entered scores across every round
 *   3. TB — how many rounds the team won (a 1st-place finish)
 *   4. Seconds, then the team's name
 *
 * so `matchPoints` and `pts` both carry that total and `tb` the 1sts count.
 * Places are competition ranks: teams level on score share a place, so a tie
 * for 1st pays 3 to both (and the skipped place leaves the third team on its
 * 3rd-place 1).
 */
export function computeMatchResults(match: Pick<Match, 'teams' | 'files'>): MatchResults {
  const teams = match.teams;
  const format: StandingsFormat = isThreeWayFormat(teams.length) ? 'threeWay' : 'roundRobin';
  const games = match.files
    .map((f) => computeGameResult(f, teams))
    .filter((g): g is GameResult => g !== null);

  const wins: Record<number, number> = {};
  const losses: Record<number, number> = {};
  const ties: Record<number, number> = {};
  const totalScore: Record<number, number> = {};
  const firsts: Record<number, number> = {};
  const seconds: Record<number, number> = {};
  const thirds: Record<number, number> = {};
  const points: Record<number, number> = {}; // 3v3v3 placement points
  teams.forEach((_, i) => {
    wins[i] = 0;
    losses[i] = 0;
    ties[i] = 0;
    totalScore[i] = 0;
    firsts[i] = 0;
    seconds[i] = 0;
    thirds[i] = 0;
    points[i] = 0;
  });

  for (const game of games) {
    // Competition ranking by score: a team's place is 1 plus the number of
    // teams that scored strictly higher, so level scores share a place and
    // the next one is skipped.
    const placeOf = (e: { score: number }) =>
      1 + game.entries.filter((other) => other.score > e.score).length;

    for (const e of game.entries) {
      totalScore[e.teamIndex] += e.score;
      const place = placeOf(e);
      if (place === 1) firsts[e.teamIndex]++;
      else if (place === 2) seconds[e.teamIndex]++;
      else if (place === 3) thirds[e.teamIndex]++;
      if (format === 'threeWay') points[e.teamIndex] += placementPoints(place);

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
    // The round robins rank on wins; the 3v3v3 format ranks on the points
    // its rounds pay out 窶・the same total the table's Pts column shows.
    matchPoints[i] = format === 'threeWay' ? points[i] : wins[i] * 1 + ties[i] * 0.5;
  });

  const tb: Record<number, number> = {};
  teams.forEach((_, i) => (tb[i] = 0));
  if (format === 'threeWay') {
    // TB: rounds the team won 窶・the count that separates teams level on
    // points. A round two teams share at the top counts for each of them:
    // both finished 1st and both took the 3 for it.
    teams.forEach((_, i) => (tb[i] = firsts[i]));
  } else {
    // TB: game wins against opponents whose overall matchPoints match ours 窶・
    // counted per game (so beating the same tied opponent twice counts
    // twice), not deduplicated per opponent.
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
  }

  const rankings: TeamResult[] = teams.map((team, teamIndex) => ({
    rank: 0, // filled in after sorting
    teamIndex,
    label: team[0],
    members: team,
    firsts: firsts[teamIndex],
    seconds: seconds[teamIndex],
    thirds: thirds[teamIndex],
    matchWins: format === 'threeWay' ? firsts[teamIndex] : wins[teamIndex],
    matchLosses: format === 'threeWay' ? thirds[teamIndex] : losses[teamIndex],
    matchTies: format === 'threeWay' ? seconds[teamIndex] : ties[teamIndex],
    matchPoints: matchPoints[teamIndex],
    tb: tb[teamIndex],
    setWins: format === 'threeWay' ? firsts[teamIndex] : wins[teamIndex],
    setLosses: format === 'threeWay' ? thirds[teamIndex] : losses[teamIndex],
    setTies: format === 'threeWay' ? seconds[teamIndex] : ties[teamIndex],
    pts: format === 'threeWay' ? points[teamIndex] : totalScore[teamIndex],
    totalScore: totalScore[teamIndex],
  }));

  if (format === 'threeWay') {
    rankings.sort(
      (a, b) =>
        b.matchPoints - a.matchPoints ||
        b.totalScore - a.totalScore ||
        b.tb - a.tb ||
        b.seconds - a.seconds ||
        a.label.localeCompare(b.label)
    );
  } else {
    rankings.sort(
      (a, b) =>
        b.matchPoints - a.matchPoints ||
        b.tb - a.tb ||
        b.setWins - a.setWins ||
        b.setTies - a.setTies ||
        b.pts - a.pts ||
        a.label.localeCompare(b.label)
    );
  }
  rankings.forEach((r, i) => (r.rank = i + 1));

  return {
    format,
    rankings,
    podium: rankings.slice(0, 3),
    games,
    hasScores: games.length > 0,
  };
}

/** One player's record in a single tournament: how the games they played went. */
export interface PlayerGameRecord {
  wins: number;
  ties: number;
  losses: number;
  games: number;
}

/**
 * Per player, per tournament: the games they actually played and how each went.
 *
 * Keyed normalized-name -> match id -> record, so a caller can total a player
 * up over whichever tournaments it means to count (the Player Manager's
 * "Recent (5)" switch totals over a slice; the all-time view totals over
 * everything) without this having to know about ranges.
 *
 * Three things it deliberately gets right, all of which a naive "credit the
 * whole roster for the file's result" version gets wrong:
 *
 * - **Per game, not per tournament.** A bracket is a dozen files; the tally walks
 *   them one by one, so a team dropped out of the second half of a tournament
 *   stops winning.
 * - **Per player, not per team.** A team member who didn't play that game isn't
 *   in the file, so they neither win nor lose it (see fileRosterMembers in
 *   lib/stats.ts 窶・the same per-file participation the bracket itself uses).
 * - **Only decided games.** A file with no result 窶・unscored, or a single score
 *   where the other side couldn't be pinned to a fixture 窶・contributes nothing,
 *   rather than counting as a loss for whoever was in it.
 *
 * Global aliases ride the same name-resolution path the per-match renames
 * already use, so a merged identity is tallied as one player.
 *
 * Substitutes are credited too, under their *own* name: they were in the
 * room and the game's result is theirs to carry, while the roster player
 * they stood in for is (correctly) not present and therefore claims
 * nothing 窶・exactly the "per player, not per team" rule above, applied to
 * the slot being filled by someone else. A substitute whose key is itself a
 * roster member (a mis-recorded entry) skips this branch, since the roster
 * loop above already credited them for the team they actually played on.
 */
export function computePlayerGameRecords(
  matches: Match[],
  aliases: PlayerAliases = {}
): Record<string, Record<string, PlayerGameRecord>> {
  const records: Record<string, Record<string, PlayerGameRecord>> = {};

  for (const match of matches) {
    const renames = withAliases(match.renames, aliases);
    const substitutes = match.substitutes ?? {};
    const subEntries = Object.entries(substitutes);
    for (const file of match.files) {
      const result = computeGameResult(file, match.teams);
      if (!result) continue;
      const present = fileRosterMembers(file, match.teams, renames);
      // Who was in the room at all 窶・the only way to see a sub, who is by
      // definition not a roster key.
      const inRoom = subEntries.length > 0 ? fileParticipants(file, renames) : null;

      const credit = (key: string, teamIndex: number) => {
        const perMatch = (records[key] ??= {});
        const record = (perMatch[match.id] ??= { wins: 0, ties: 0, losses: 0, games: 0 });
        const outcome: keyof Omit<PlayerGameRecord, 'games'> = result.isTie
          ? 'ties'
          : result.entries.find((e) => e.teamIndex === teamIndex)?.isWinner
            ? 'wins'
            : 'losses';
        record[outcome]++;
        record.games++;
      };

      for (const entry of result.entries) {
        // One outcome per team in the game, credited to each of its members who
        // was actually in that game.
        for (const name of match.teams[entry.teamIndex]) {
          const key = norm(name);
          if (!present.has(key)) continue;
          credit(key, entry.teamIndex);
        }
        // Plus whoever filled in for one of its players, if they were in the
        // room for this game.
        if (inRoom) {
          const teamKeys = match.teams[entry.teamIndex].map(norm);
          for (const [subKey, target] of subEntries) {
            if (!teamKeys.includes(norm(target))) continue;
            if (present.has(subKey) || !inRoom.has(subKey)) continue;
            credit(subKey, entry.teamIndex);
          }
        }
      }
    }
  }

  return records;
}

/**
 * Games a player must have played in range before a win rate is quoted at all.
 *
 * One game is a 100% or a 0% with nothing in between, two games are 100/50/0,
 * three are already all-or-nothing 窶・small samples swing so hard they read as
 * form when they are really sample size. Four games is where the number starts
 * saying something about the player, so below it every win rate in the app
 * prints a dash rather than a figure nobody should act on.
 *
 * Counted over *games*, the same denominator `winRatePct` divides by 窶・so this
 * gate asks "enough games to quote a per-game rate?", not "enough games to have
 * played any?".
 */
export const MIN_GAMES_FOR_WINRATE = 4;

/**
 * A record as a win percentage: a win is worth a point, a tie half, a loss
 * nothing, over the games played 窶・so 2 wins, 1 tie and 3 losses is
 * (2 + 0.5) / 6 = 41.7%. Null when there's no game to divide by, or when the
 * record is short of MIN_GAMES_FOR_WINRATE, so a caller can print a dash
 * instead of a 0% that reads like a loss streak 窶・or a 100% off one game.
 */
export function winRatePct(record: PlayerGameRecord | undefined): number | null {
  if (!record || record.games < MIN_GAMES_FOR_WINRATE) return null;
  return (100 * (record.wins + 0.5 * record.ties)) / record.games;
}
