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
 */
export const EXPECTATION_STYLES: Record<ExpectationLabel, { bg: string; text: string } | null> = {
  PROMOTE: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' }, // green
  'NEAR PROMOTE': { bg: 'rgba(134,239,172,0.12)', text: '#86efac' }, // light green
  EXPECTED: null, // normal — no badge
  'NEAR DEMOTE': { bg: 'rgba(252,165,165,0.12)', text: '#fca5a5' }, // light red
  DEMOTE: { bg: 'rgba(224,82,82,0.15)', text: '#e05252' }, // red
};
