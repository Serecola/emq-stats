'use client';

import { withBasePath } from '@/lib/base-path';

/**
 * The Tour Manager's "export everything" control.
 *
 * A plain link does the job — the route answers with a file, and the `download`
 * attribute is the whole trick — but it pulls *every* stored upload in one go,
 * ignores the mode/sub-mode filter sitting right above it, and on a
 * long-running database that is a large download to start by accident. So this
 * asks first, and says what it is about to do rather than just "are you sure".
 * The per-tournament Export in each row is small and expected, so it stays a
 * bare link.
 *
 * The confirm keeps the anchor's own behaviour: cancelling calls
 * `preventDefault`, confirming lets the browser follow the href — no
 * programmatic navigation, and the page stays where it is.
 */
export default function ExportAllButton({
  tournaments,
  files,
}: {
  tournaments: number;
  files: number;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const what = `${files} file${files === 1 ? '' : 's'} across ${tournaments} tournament${
      tournaments === 1 ? '' : 's'
    }`;
    if (
      !confirm(
        `Download every stored JSON?\n\nThat's ${what} — all of them, not just the ones the filter above is showing. It comes back as one archive.`
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <a
      href={withBasePath('/api/admin/export')}
      download
      onClick={onClick}
      className="rounded-md border border-border px-3 py-1.5 text-sm text-textSub transition-colors hover:border-textSub hover:text-text"
    >
      Export all JSONs
    </a>
  );
}
