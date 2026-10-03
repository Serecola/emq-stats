/**
 * Week arithmetic for the views that group tournaments by the week they were
 * played in — the week dividers between tours on the player home page and in
 * the Tour Manager.
 *
 * Everything works off a tournament's `date`, stored as a plain `YYYY-MM-DD`
 * string and used as the tournaments' sort key (see `listMatchSummaries`).
 * Going through a `Date` parsed straight from that string would be a trap:
 * `new Date('YYYY-MM-DD')` reads it as UTC midnight, so local day methods on
 * that instant land on the previous day for anyone west of UTC and would drop
 * a Sunday into the wrong week. Splitting the parts and building a *local*
 * Date keeps the calendar day the admin picked as the calendar day the
 * grouping sees.
 *
 * Weeks run Monday–Sunday (ISO): two tournaments share a week exactly when
 * their `weekStart` keys are equal.
 */

/** Pads a month/day number the way a YYYY-MM-DD date writes it. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The Monday of the week `date` falls in, as `YYYY-MM-DD` — the grouping key
 * for the week dividers. A malformed date (the match form validates against
 * one, so this is belt and braces) comes back untouched, which strands it in a
 * group of its own instead of throwing mid-render.
 */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const local = new Date(y, m - 1, d);
  // getDay() counts Sunday = 0 … Saturday = 6; shift so Monday = 0.
  const sinceMonday = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - sinceMonday);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/**
 * The week containing `date` written as a readable range — `Mar 2 – Mar 8,
 * 2026`. The year sits at the end while the week lives inside one year, and
 * moves onto both ends when it straddles New Year (`Dec 29, 2025 – Jan 4,
 * 2026`) — the one case where either date could be misread without it.
 */
export function weekRangeLabel(date: string): string {
  const [y, m, d] = weekStart(date).split('-').map(Number);
  if (!y || !m || !d) return date;
  const monday = new Date(y, m - 1, d);
  const sunday = new Date(y, m - 1, d + 6);
  const fmt = (dt: Date, withYear: boolean) =>
    dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  const crossYear = monday.getFullYear() !== sunday.getFullYear();
  const start = fmt(monday, crossYear);
  const end = fmt(sunday, crossYear);
  return crossYear ? `${start} – ${end}` : `${start} – ${end}, ${sunday.getFullYear()}`;
}
