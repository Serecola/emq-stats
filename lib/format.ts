/**
 * The rules that follow from a tournament's team count: which schedules are
 * legal, and what each legal one *is*.
 *
 * Three sizes exist:
 *
 *  - 4 teams — double round robin (every pair plays twice, 6 games per team)
 *  - 6 teams — single round robin (every pair plays once, 5 games per team)
 *  - 3 teams — no round robin at all: five rounds of 3v3v3, every team in
 *    every round. That is the 9-player format — three teams of three — and
 *    it scores by place (3 / 2 / 1 per round, summed) instead of by win.
 *
 * The choice is made once, from the team count, via `isThreeWayFormat`;
 * nothing downstream re-infers it from the games.
 */

/** The only legal team counts. */
export const VALID_TEAM_COUNTS = [3, 4, 6] as const;

/** Rounds in a 3-team tournament: five 3v3v3 games, all three teams in each. */
export const THREE_WAY_ROUNDS = 5;

/** Whether this team count is the 3v3v3 format rather than a round robin. */
export function isThreeWayFormat(teamCount: number): boolean {
  return teamCount === 3;
}

/** True when `teamCount` is one of the legal sizes (see VALID_TEAM_COUNTS). */
export function isValidTeamCount(n: number): boolean {
  return (VALID_TEAM_COUNTS as readonly number[]).includes(n);
}

/** The legal counts as a phrase for error messages: "3, 4 or 6". */
export function validTeamCountsPhrase(): string {
  const counts = [...VALID_TEAM_COUNTS];
  return `${counts.slice(0, -1).join(', ')} or ${counts[counts.length - 1]}`;
}

/**
 * Points a team earns for its place in one 3v3v3 round: 1st = 3, 2nd = 2,
 * 3rd = 1. Places are competition ranks (see computeMatchResults in
 * lib/results.ts) — teams level on score share a place — and a three-team
 * round can't finish below the podium, so nothing scores past 3rd.
 */
export function placementPoints(place: number): number {
  return place >= 1 && place <= 3 ? 4 - place : 0;
}
