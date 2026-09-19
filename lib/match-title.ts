import type { Mode, Region, Submode } from './types';

/**
 * Composes the mandatory match title: "{date} {region} {mode} {submode}
 * {name}", e.g. "2026/12/31 NA NGMC Normal Winter Cup". `date` is expected
 * as YYYY-MM-DD (from a <input type="date">) and is rendered with slashes.
 */
export function formatMatchTitle(
  date: string,
  region: Region,
  mode: Mode,
  submode: Submode,
  name: string
): string {
  const [y, m, d] = date.split('-');
  const formattedDate = y && m && d ? `${y}/${m}/${d}` : date;
  return [formattedDate, region, mode, submode, name.trim()].filter(Boolean).join(' ');
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}