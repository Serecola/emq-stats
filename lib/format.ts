/**
 * The rules that follow from a tournament's team count and format (`cycles`):
 * which schedules are legal, and what each legal one *is*.
 *
 * Team counts: any **even** number of teams, at least 2 — the autodrafter
 * enforces the same rule when it offers team sizes (a size must divide the
 * player count evenly *and* leave an even team count), except that exactly
 * 3 is also allowed. 3 teams is not a round robin at all: N rounds of
 * 3v3v3, every team in every round (the 9-player format — three teams of
 * in every round (the 9-player format — three teams of three), scoring by
 * place (3 / 2 / 1 per round, summed) instead of by win. Existing 3-team
 * tournaments keep working everywhere; new ones can still be pasted together
 * by hand, but the autodrafter never drafts one.
 *
 * The schedule shape is the stored `cycles` count — how many times each pair
 * of teams meets:
 *
 *  - 1 — "Round Robin Once": every pair plays once (team counts ≥ 3 only)
 *  - 2 — "Round Robin Twice" (the default): every pair plays twice (team
 *    counts ≥ 3 only)
 *  - 2–10 — "Rounds N": with exactly 2 teams there is only one pair, so
 *    `cycles` reads as the two teams playing each other N times. With exactly
 *    3 teams every round holds all three teams, so `cycles` reads as that
 *    many 3v3v3 rounds. For team counts ≥ 3 the same 2–10 range is offered
 *    as "Rounds N" alongside the round-robin pills, but the default is
 *    always Round Robin Twice (cycles 2).
 *
 * Matches saved before `cycles` existed carry none, and fall back to the
 * inference in `defaultCycles` (now Round Robin Twice for every size), so
 * nothing needs migrating.
 */

/** Legacy default round count for 3-team tournaments (five 3v3v3 rounds).
 * Kept as a constant for reference; new tournaments now default to cycles 2
 * (Round Robin Twice) via defaultCycles like every other size.
 */
export const THREE_WAY_ROUNDS = 5;

/** "Rounds N" with 2 or 3 teams: how many games the tournament runs. */
export const ROUNDS_MIN = 2;
export const ROUNDS_MAX = 10;
/** Legacy aliases — prefer ROUNDS_MIN/MAX for new code. */
export const TWO_TEAM_ROUNDS_MIN = ROUNDS_MIN;
export const TWO_TEAM_ROUNDS_MAX = ROUNDS_MAX;

/** Whether this team count is the 3v3v3 format rather than a round robin. */
export function isThreeWayFormat(teamCount: number): boolean {
  return teamCount === 3;
}

/**
 * True when `teamCount` can hold a tournament: any even number of teams
 * (2, 4, 6, 8, ... — a round robin needs every team to have a partner to
 * play), plus exactly 3 for the 3v3v3 format described above.
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
 * carries no explicit `cycles` — the form default for new tournaments and
 * the read-time inference for matches saved before the format was editable.
 * Round Robin Twice (cycles 2) is the default for every size: a 2-team draft
 * reads this as "Rounds 2", a 3-team draft as two 3v3v3 rounds, and 4+ teams
 * as a double round robin. The old size-specific inference (4 → double, 6 →
 * single, 3 → five rounds) is replaced by this single default.
 */
export function defaultCycles(teamCount: number): number {
  return 2;
}

/**
 * Whether `cycles` is a legal schedule for this team size:
 *
 *  - 2 teams: cycles 2–10 ("Rounds N") — one pair playing N times
 *  - team counts ≥ 3: cycles 1–10 (Round Robin Once at 1, Round Robin
 *    Twice/Rounds 2 at 2, "Rounds N" at 3–10)
 */
export function isValidCycles(teamCount: number, cycles: number): boolean {
  if (!Number.isInteger(cycles)) return false;
  if (teamCount === 2) return cycles >= ROUNDS_MIN && cycles <= ROUNDS_MAX;
  if (teamCount >= 3) return cycles >= 1 && cycles <= ROUNDS_MAX;
  return false;
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
    ? `${ROUNDS_MIN} to ${ROUNDS_MAX}`
    : teamCount >= 3
    ? `1 to ${ROUNDS_MAX}`
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
