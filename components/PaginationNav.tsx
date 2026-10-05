import Link from 'next/link';
import { pageHref, type Page } from '@/lib/pagination';

/**
 * Page navigation for the tournament lists, placed above the Past tournaments
 * heading: where you are in the list ("Page 3 of 6 · showing 41–60 of 112")
 * beside the two ways out of it.
 *
 * The lists are newest-first, so the lower page number is the newer one —
 * hence "Newer"/"Older" rather than bare arrows. Both are plain `<Link>s to
 * the same route with `?page=` swapped (see `pageHref`), so paging keeps the
 * active mode/player filter, is bookmarkable, and works without client JS.
 *
 * Renders nothing for a single page: a list that fits needs no nav, and a
 * disabled pair of buttons would just be furniture.
 */
export default function PaginationNav<T>({
  basePath,
  searchParams,
  page,
}: {
  basePath: string;
  /** The page's own `searchParams` — every filter in them is carried over. */
  searchParams: Record<string, string | string[] | undefined>;
  page: Page<T>;
}) {
  const { page: current, pageCount, from, to, total } = page;
  if (pageCount <= 1) return null;

  const linkClass =
    'rounded-md border border-border px-2.5 py-1 text-xs font-medium text-textSub transition-colors hover:border-textSub hover:text-text';
  return (
    <nav
      aria-label="Tournament pages"
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <span className="text-xs text-textMuted">
        Page {current} of {pageCount}
        {total > 0 && (
          <span className="text-textDim">
            {' '}
            · showing {from}–{to} of {total}
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5">
        {current > 1 && (
          <Link href={pageHref(basePath, searchParams, current - 1)} className={linkClass}>
            ← Newer
          </Link>
        )}
        {current < pageCount && (
          <Link href={pageHref(basePath, searchParams, current + 1)} className={linkClass}>
            Older →
          </Link>
        )}
      </div>
    </nav>
  );
}