/**
 * Promotion verdicts. Shared by the match Guess Rate table (a player's
 * single-tournament Performance measured against the rank they were listed
 * at) and the admin Player Manager (their aggregated Expected Rank measured
 * against the Set Rank the admin assigned) — both feed the same thresholds,
 * so the two views can never disagree about a player.
 */
export const EXPECTATION_LABELS = [
  'PROMOTE',
  'NEAR PROMOTE',
  'EXPECTED',
  'NEAR DEMOTE',
  'DEMOTE',
] as const;

export type ExpectationLabel = (typeof EXPECTATION_LABELS)[number];

/**
 * Turns a difference into a verdict. The difference is always
 * "played like − ranked at" (Expected Rank − Set Rank), so positive means
 * they played above their rank and negative means below it.
 */
export function expectationFromDiff(diff: number): ExpectationLabel {
  if (diff > 1) return 'PROMOTE';
  if (diff >= 0.7) return 'NEAR PROMOTE';
  if (diff >= -0.7) return 'EXPECTED';
  if (diff >= -1) return 'NEAR DEMOTE';
  return 'DEMOTE';
}

/**
 * Badge colors per verdict. PROMOTE/DEMOTE use a full green/red theme
 * (background + text); EXPECTED stays null so it renders as plain, neutral
 * text rather than a badge — it's meant to read as "nothing notable".
 *
 * A badge paints its text on a wash of its *own* hue, so the tint raises the
 * background under the text and eats the contrast a mid-tone color would have
 * on a bare surface — each theme therefore carries its own text step for the
 * washes (see the `--exp-*` variables in globals.css): lightened text on dark
 * surfaces, darkened text on white.
 */
export const EXPECTATION_STYLES: Record<ExpectationLabel, { bg: string; text: string } | null> = {
  PROMOTE: { bg: 'rgb(var(--exp-promote-bg) / 0.15)', text: 'rgb(var(--exp-promote-text))' }, // green
  'NEAR PROMOTE': { bg: 'rgb(var(--exp-near-promote-bg) / 0.12)', text: 'rgb(var(--exp-near-promote-text))' }, // light green
  EXPECTED: null, // normal — no badge
  'NEAR DEMOTE': { bg: 'rgb(var(--exp-near-demote-bg) / 0.12)', text: 'rgb(var(--exp-near-demote-text))' }, // light red
  DEMOTE: { bg: 'rgb(var(--exp-demote-bg) / 0.15)', text: 'rgb(var(--exp-demote-text))' }, // red — see note above
};
