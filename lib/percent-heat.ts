import type { CSSProperties } from 'react';

/**
 * Cell shading for a percentage: green at the top of the scale, yellow halfway
 * up, red at the bottom — one straight walk round the hue ring, red → yellow →
 * green, rather than a straight red-to-green blend, which would pass through a
 * muddy brown right where yellow should be. The piecewise ramp is linear in the
 * value in each half, so 0% is exactly red, 50% exactly yellow and 100% exactly
 * green. Everything is kept deliberately faint — a low-alpha tint that reads as
 * a wash over either theme's surfaces and never fights the number sitting on
 * it — with full lightness so the hue survives on white as well as on dark.
 *
 * Values are clamped, so an impossible figure can't wrap the colour around, and
 * anything that isn't a number (the winrate dash) gets no style at all. Shared
 * by the admin Player Manager and the viewer player pages so the same number is
 * the same colour everywhere.
 *
 * Lives in lib/ rather than a `'use client'` component so the server-rendered
 * /players list can call it directly — a function exported from a client
 * module is only a client reference on the server, not a callable.
 */
export function percentHeat(value: number | null | undefined): CSSProperties | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const t = Math.min(100, Math.max(0, value)) / 100;
  const hue = t <= 0.5 ? t * 120 : 60 + (t - 0.5) * 160; // 0° red, 60° yellow, 140° green
  return { backgroundColor: `hsl(${hue.toFixed(0)} 75% 55% / 0.22)` };
}