/**
 * Per-team accent colors, indexed by a team's position in a match's `teams`
 * array. Shared by every view that lists players (Results, Guess Rate stats,
 * Attacks & Blocks stats) so one team always reads as one color — a player's
 * team stays recognizable wherever their name is shown, even in the sorted
 * stats tables where players from every team are interleaved.
 *
 * Kept in one place (rather than a local constant per table) so Results and
 * Stats can never drift out of sync on what color a team is.
 *
 * Hues are spread wide and deliberately leave out the theme's yellow win accent
 * (`accent`), so no team can ever be mistaken for a winner.
 *
 * Every hue is also a *text* color — a player's name is painted in their team's
 * color in the bracket, the podium, the standings and both stats tables — so
 * each theme carries its own step of the palette (see globals.css): lightened
 * for contrast on the dark surfaces, darkened a step for contrast on white.
 * Both are served through the same `--team-*` variables, so callers never
 * branch on the theme — the values return `rgb(var(--team-N))` and flip with
 * the `dark` class on <html> automatically.
 */
export const TEAM_COLORS = [0, 1, 2, 3, 4, 5].map((i) => `rgb(var(--team-${i}))`);

/**
 * Color for the team at `teamIndex`, wrapping around for rosters with more
 * teams than the palette holds colors.
 */
export function teamColor(teamIndex: number): string {
  const i = ((teamIndex % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length;
  return `rgb(var(--team-${i}))`;
}

/**
 * `teamColor` as a translucent wash with the given alpha, for backgrounds.
 * The palette is a text palette first, so it has to be faded this way to sit
 * *behind* text instead.
 */
export function teamColorBg(teamIndex: number, alpha: number): string {
  const i = ((teamIndex % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length;
  return `rgb(var(--team-${i}) / ${alpha})`;
}
