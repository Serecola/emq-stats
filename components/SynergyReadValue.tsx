import type { SynergyRead } from '@/lib/synergy';

/**
 * Read heat: high green, mid yellow, low red — the scale a rate reads best on,
 * so the eye can rank a column without reading the numbers off it. The
 * percentages run 0–100, so the bands are simply thirds of the scale: 50%+ is
 * a pairing landing most of the list, anything under 25% is landing very little
 * of it, and the middle is the ordinary middle most pairings sit in.
 *
 * Deliberately *not* the scale a team's List Difficulty uses (see
 * `difficultyHeat` in components/SynergySection.tsx). That one is red-to-green
 * too but keyed to real List Difficulty values (which live in the 20–55% band),
 * so its thresholds sit much lower; reusing it here would paint a 45% read the
 * same colour as a 90% one.
 *
 * Uses the app's own red / gold / green tokens rather than raw CSS colours, so
 * the scale survives the theme flip — each has its own light and dark step (see
 * app/globals.css).
 */
export function readHeat(rate: number): string {
  if (rate >= 50) return 'text-promote';
  if (rate >= 25) return 'text-accent';
  return 'text-taken';
}

/**
 * A read as `12.5%` over `5/40`. No chances at all renders as an em dash
 * rather than `0.0%` — "nobody's list ever came up" and "they read it and
 * missed" are different facts, and only one of them is a 0% result.
 *
 * Lives in its own module rather than inside SynergySection so the match page's
 * Team Synergy tables and the player page's synergy ranking print a read the
 * same way; `readHeat` comes with it for the same reason. Both are pure
 * presentation over the `SynergyRead` type, so this needs no 'use client' of
 * its own and either table can import it.
 */
export default function ReadValue({ read, color }: { read: SynergyRead; color?: boolean }) {
  if (read.chances === 0) return <span className="text-textDim">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className={color ? `font-medium ${readHeat(read.rate)}` : 'text-text'}>
        {read.rate.toFixed(1)}%
      </span>
      <span className="ml-1 text-[0.68rem] tabular-nums text-textDim">
        {read.hits}/{read.chances}
      </span>
    </span>
  );
}