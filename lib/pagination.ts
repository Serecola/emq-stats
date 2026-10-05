/**
 * Page-window slicing for the two long tournament lists — the public home page
 * and the Tour Manager — and the query-string plumbing around it.
 *
 * Both lists grow without bound (a tournament a week adds a card every time),
 * so they are shown a window at a time, ordered newest-first: page 1 holds the
 * most recent tournaments, and a higher page number is always older ones.
 *
 * Paging lives in the URL as `?page=`, like every other filter on these pages
 * (`?mode=`, `?submode=`, `?with=`): bookmarkable, shareable, and it resolves
 * server-side from `searchParams` with no client JS. `pageHref` rebuilds the
 * whole current query and swaps only the page number, so paging never drops the
 * mode or player filter — while changing a filter *does* reset to page 1,
 * because those links carry no `page=` of their own.
 *
 * Pure and framework-free so both pages (and any future one) slice identically.
 */

/** How many tournaments one page of Past tournaments holds. */
export const TOURS_PER_PAGE = 10;

/** One window of a longer list, plus what a nav needs to describe it. */
export interface Page<T> {
  /** The items on this page, in the order they were given. */
  items: T[];
  /** 1-based page actually shown — a request past the end clamps to the last. */
  page: number;
  /** Total pages, always at least 1 (so an empty list still has a "page 1"). */
  pageCount: number;
  /** How many items the whole list has. */
  total: number;
  /** 0-based index of this page's first item *in the unsliced list* — what the
   * week dividers need to find the row above the first one on the page. */
  offset: number;
  /** 1-based index of the first item shown (0 when there is none). */
  from: number;
  /** 1-based index of the last item shown. */
  to: number;
}

/**
 * Reads `?page=` out of a page's `searchParams`. Anything unusable — missing,
 * not a number, below 1 — reads as page 1, and `paginate` clamps the rest, so
 * a hand-edited or stale URL always resolves to a page that exists.
 */
export function parsePage(params: { page?: string }): number {
  const raw = Number(params.page);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/**
 * Slices `items` into the window `page` names, clamping a page number past
 * either end onto the first or last real page rather than rendering nothing.
 */
export function paginate<T>(items: T[], page: number, perPage: number = TOURS_PER_PAGE): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(Math.floor(page) || 1, 1), pageCount);
  const offset = (current - 1) * perPage;
  const window = items.slice(offset, offset + perPage);
  return {
    items: window,
    page: current,
    pageCount,
    total,
    offset,
    from: window.length ? offset + 1 : 0,
    to: offset + window.length,
  };
}

/**
 * The href for another page of the same list: every current query parameter is
 * kept, `page` is replaced, and page 1 drops the parameter entirely — the first
 * page is the plain filtered URL, matching how the filter queries omit
 * themselves when they select the default.
 */
export function pageHref(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page') continue;
    // Next.js types a repeated query param as an array; the filters here are
    // all single-valued, so the first occurrence is the whole of it.
    const single = Array.isArray(value) ? value[0] : value;
    if (single) params.set(key, single);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}