/**
 * The rules that follow from a tournament's team count and format (`cycles`):
 * which schedules are legal, and what each legal one *is*.
 *
 * Team counts: any **even** number of teams, at least 2 — the autodrafter
 * enforces the same rule when it offers team sizes (a size must divide the
 * player count evenly *and* leave an even team count). The one legacy
 * exception is 3 teams, which is not a round robin at all: five rounds of
 * 3v3v3, every team in every round (the 9-player format — three teams of
 * three), scoring by place (3 / 2 / 1 per round, summed) instead of by win.
 * Existing 3-team tournaments keep working everywhere; new ones can still be
 * pasted together by hand, but the autodrafter never drafts one.
 *
 * The schedule shape is the stored `cycles` count — how many times each pair
 * of teams meets:
 *
 *  - 1 — "Round Robin Once": every pair plays once
 *  - 2 — "Round Robin Twice" (the default): every pair plays twice
 *  - 2–10 — with exactly 2 teams there is only one pair, so `cycles` reads
 *    as "Rounds N": the two teams play each other N times (minimum 2)
 *
 * Matches saved before `cycles` existed carry none, and fall back to the
 * historical inference in `defaultCycles` (4 teams were always double round
 * robin, 6 teams always single), so nothing needs migrating.
 */

/** Rounds in a 3-team tournament: five 3v3v3 games, all three teams in each. */
export const THREE_WAY_ROUNDS = 5;

/** "Rounds N" with 2 teams: how many games the pair plays. */
export const TWO_TEAM_ROUNDS_MIN = 2;
export const TWO_TEAM_ROUNDS_MAX = 10;

/** Whether this team count is the 3v3v3 format rather than a round robin. */
export function isThreeWayFormat(teamCount: number): boolean {
  return teamCount === 3;
}

/**
 * True when `teamCount` can hold a tournament: any even number of teams
 * (2, 4, 6, 8, ... — a round robin needs every team to have a partner to
 * play), plus the legacy 3-team 3v3v3 format described above.
 */
export function isValidTeamCount(n: number): boolean {
  return n === 3 || (n >= 2 && n % 2 === 0);
}

/** The team-count rule as a phrase for error messages. */
export function validTeamCountsPhrase(): string {
  return 'an even number of teams (at least 2)';
}

/**
 * The number of games per pairing a tournament of this size plays when it
 * carries no explicit `cycles` — the historical inference, kept so matches
 * saved before the format was editable (and form defaults) read exactly as
 * they always did: 4 teams were always double round robin, 6 teams always
 * single. Every other size defaults to Twice, per the autodrafter's default
 * (which also makes a fresh 2-team draft "Rounds 2").
 */
export function defaultCycles(teamCount: number): number {
  if (teamCount === 4) return 2;
  if (teamCount === 6) return 1;
  return 2;
}

/** Whether `cycles` is a legal pairing count for this team size. */
export function isValidCycles(teamCount: number, cycles: number): boolean {
  if (!Number.isInteger(cycles)) return false;
  if (teamCount === 2) return cycles >= TWO_TEAM_ROUNDS_MIN && cycles <= TWO_TEAM_ROUNDS_MAX;
  return cycles === 1 || cycles === 2;
}

/**
 * The cycles a tournament of this size actually runs with: the stored value
 * when it is legal for the count, the historical/default one otherwise. The
 * single resolver every schedule read goes through, so a stored-but-stale
 * value (teams edited after the format was picked) can never produce a
 * bracket the validation would have refused.
 */
export function resolveCycles(teamCount: number, cycles?: number | null): number {
  return cycles !== undefined && cycles !== null && isValidCycles(teamCount, cycles)
    ? cycles
    : defaultCycles(teamCount);
}

/** The legal `cycles` range for a size, as a phrase for error messages. */
export function validCyclesPhrase(teamCount: number): string {
  return teamCount === 2
    ? `${TWO_TEAM_ROUNDS_MIN} to ${TWO_TEAM_ROUNDS_MAX}`
    : '1 or 2';
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
