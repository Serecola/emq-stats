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
 */
export const TEAM_COLORS = ['#a78bfa', '#4d8fe0', '#7ac97a', '#c97ac9', '#e08d4d', '#5fd1c9'];

/**
 * Color for the team at `teamIndex`, wrapping around for rosters with more
 * teams than the palette holds colors.
 */
export function teamColor(teamIndex: number): string {
  return TEAM_COLORS[teamIndex % TEAM_COLORS.length];
}

/**
 * `teamColor` as an `rgba()` tint with the given alpha, for backgrounds. The
 * palette is deliberately light so it works as text on the dark theme, which
 * means it has to be faded this way to sit *behind* text instead.
 */
export function teamColorBg(teamIndex: number, alpha: number): string {
  const n = parseInt(teamColor(teamIndex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
