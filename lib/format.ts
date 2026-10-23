/**
 * The rules that follow from a tournament's team count and format:
 * which schedules are legal, and what each legal one *is*.
 *
 * Team counts: any number of teams, at least 2 — the autodrafter enforces
 * the same rule when it offers team sizes (a size must divide the player
 * count evenly *and* leave at least 2 teams). Even counts of 4 or more can
 * run a pairwise Round Robin; 2-team and odd counts (3, 5, 7, ...) play
 * "Rounds N" — all teams in one match each round — only.
 *
 * Two format modes, picked with the Format pills in the match form (see
 * components/MatchForm.tsx) and stored on the match as `formatType`:
 *
 *  - `pairwise` — Round Robin: teams play in pairs each match, every pair
 *    meeting `cycles` times — 1 to 10 (1 is a single round robin; the
 *    default 2 is a double one). Even team counts of 4 or more only — odd
 *    counts (3, 5, 7, ...) and 2-team tournaments play "Rounds N" instead,
 *    where every team meets in one match each round and scoring is by
 *    placement.
 *  - `allteams` — "Rounds N": every team plays in every round in one match
 *    (1v1, 3v3v3, 5v5v5v5v5, 4v4v4v4, ...), `cycles` rounds in all, 2 to 10
 *    — the only shape for 2-team and odd team counts. Scoring is by place
 *    (3 / 2 / 1 per round, summed) instead of by win — the way the 3-team
 *    format has always worked, generalized to any team count.
 *
 * Matches saved before `formatType` existed carry none, and read through
 * the historical inference in `isAllTeamsFormat` (2 teams and odd counts
 * read as `allteams`, everything else as `pairwise`); matches saved before
 * `cycles` existed carry none either, and fall back to `defaultCycles`
 * (2 — the form's default for every size). Nothing needs migrating.
 */
export type FormatType = 'pairwise' | 'allteams';

/** Legacy default round count for 3-team tournaments (five 3v3v3 rounds). */
export const THREE_WAY_ROUNDS = 5;

/** The rounds range the Rounds input accepts (`cycles`) for every shape. */
export const ROUNDS_MIN = 2;
export const ROUNDS_MAX = 10;
/** Legacy aliases — prefer ROUNDS_MIN/MAX for new code. */
export const TWO_TEAM_ROUNDS_MIN = ROUNDS_MIN;
export const TWO_TEAM_ROUNDS_MAX = ROUNDS_MAX;

/**
 * Whether this uses the all-teams-in-one-match format (placement-based).
 * Without a stored `formatType` the historical inference applies: 2 teams
 * (a 1v1 series) and odd counts (3, 5, 7, ...) read as `allteams`,
 * anything else as a pairwise Round Robin.
 */
export function isAllTeamsFormat(teamCount: number, formatType?: FormatType | null): boolean {
  if (teamCount === 2 || teamCount % 2 === 1) return true;
  if (formatType === 'allteams') return true;
  if (formatType === 'pairwise') return false;
  return false;
}

/**
 * The mode a tournament actually runs in: the stored pick when there is
 * one, otherwise the same inference isAllTeamsFormat falls back to. This
 * is the resolved `formatType` to pass down alongside `cycles` wherever a
 * "which schedule" question is asked.
 */
export function resolveFormatType(teamCount: number, formatType?: FormatType | null): FormatType {
  if (teamCount === 2 || teamCount % 2 === 1) return 'allteams';
  if (formatType === 'allteams' || formatType === 'pairwise') return formatType;
  return 'pairwise';
}

/** True when team count is valid for tournament. */
export function isValidTeamCount(n: number): boolean {
  return n >= 2;
}

export function validTeamCountsPhrase(): string {
  return 'any team count of 2 or more';
}

/**
 * The form's default rounds for every size — a double round robin, two
 * games of a 2-team series, two 3v3v3 rounds — and the read-time fallback
 * for matches saved before the format was editable.
 */
export function defaultCycles(teamCount: number): number {
  return 2;
}

/**
 * Whether `cycles` is a legal schedule for this shape:
 *
 *  - "Rounds N" (all teams in one match): cycles 2–10 for any team count.
 *  - Round Robin: cycles 1–10 (1 = a single round robin, the old "Round
 *    Robin Once"; 2 = a double one, the default) — even team counts of 4
 *    or more only. Odd counts and 2-team tournaments play Rounds N instead,
 *    so `pairwise` there reads as all-teams (and is not valid).
 */
export function isValidCycles(teamCount: number, cycles: number, formatType?: FormatType | null): boolean {
  if (!Number.isInteger(cycles)) return false;
  if (teamCount === 2 || teamCount % 2 === 1) {
    return formatType !== 'pairwise' && cycles >= ROUNDS_MIN && cycles <= ROUNDS_MAX;
  }
  if (isAllTeamsFormat(teamCount, formatType)) {
    return cycles >= ROUNDS_MIN && cycles <= ROUNDS_MAX;
  }
  return cycles >= 1 && cycles <= ROUNDS_MAX;
}

/**
 * The lowest legal `cycles` for a shape — the Rounds input's `min`.
 * Mirrors isValidCycles: Round Robin bottoms out at 1 once there are pairs
 * to rotate (even counts of 4+), while every "Rounds N" (every 2-team and
 * odd-count tournament) starts at ROUNDS_MIN.
 */
export function cyclesMin(teamCount: number, formatType?: FormatType | null): number {
  if (teamCount === 2 || teamCount % 2 === 1 || isAllTeamsFormat(teamCount, formatType)) return ROUNDS_MIN;
  return 1;
}

export function resolveCycles(teamCount: number, cycles?: number | null, formatType?: FormatType | null): number {
  if (cycles !== undefined && cycles !== null && isValidCycles(teamCount, cycles, formatType)) {
    return cycles;
  }
  return defaultCycles(teamCount);
}

/** The legal `cycles` range for a shape, as a phrase for error messages. */
export function validCyclesPhrase(teamCount: number, formatType?: FormatType | null): string {
  if (teamCount === 2 || teamCount % 2 === 1 || isAllTeamsFormat(teamCount, formatType)) {
    return `${ROUNDS_MIN} to ${ROUNDS_MAX}`;
  }
  return `1 to ${ROUNDS_MAX}`;
}

/**
 * Points a team earns for its place in one all-teams round: 1st = 3,
 * 2nd = 2, 3rd = 1, and nothing past the podium (a 4th team of a
 * 4v4v4v4 scores 0). Places are competition ranks (see computeMatchResults
 * in lib/results.ts) — teams level on score share a place.
 */
export function placementPoints(place: number): number {
  if (place >= 1 && place <= 3) return 4 - place;
  return 0;
}
