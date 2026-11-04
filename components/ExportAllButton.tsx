'use client';

import { useCallback, useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

/**
 * The Tour Manager's "export everything" control.
 *
 * It pulls *every* stored upload in one go, ignores the mode/sub-mode filter
 * sitting right above it, and on a long-running database that is a large
 * download to start by accident. So this asks first, says what it is about to
 * do, and offers two ways to reshape the archive:
 *
 * - **Flat** — no `tournaments/<folder>/` directories, every JSON at the
 *   archive root.
 * - **Keep original filenames** — each JSON keeps the game's own export name
 *   instead of being renamed to its bracket fixture.
 *
 * The confirm keeps the anchor's own behaviour: cancelling calls
 * `preventDefault`, confirming navigates to the export route with the chosen
 * options, and the route's `Content-Disposition: attachment` header turns the
 * navigation into a download. The page stays where it is.
 */
export default function ExportAllButton({
  tournaments,
  files,
}: {
  tournaments: number;
  files: number;
}) {
  const [open, setOpen] = useState(false);
  const [flat, setFlat] = useState(false);
  const [keepNames, setKeepNames] = useState(false);

  const what = `${files} file${files === 1 ? '' : 's'} across ${tournaments} tournament${
    tournaments === 1 ? '' : ''
  }`;

  // Close on Escape, like the app's other dialogs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const exportUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (flat) params.set('flat', '1');
    if (keepNames) params.set('keepNames', '1');
    const query = params.toString();
    return withBasePath(`/api/admin/export${query ? `?${query}` : ''}`);
  }, [flat, keepNames]);

  function onDownload() {
    setOpen(false);
    window.location.href = exportUrl();
  }

  return (
    <>
      <a
        href={withBasePath('/api/admin/export')}
        download
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-textSub transition-colors hover:border-textSub hover:text-text"
      >
        Export all JSONs
      </a>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-12 sm:py-24"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="rounded-lg border border-border bg-surface p-6 max-w-md w-full">
            <h2 className="mb-2 text-base font-semibold">Export all JSONs</h2>
            <p className="mb-4 text-sm text-textMuted">
              Download every stored JSON? That's {what} — all of it, not just
              the ones the filter above is showing. It comes back as one
              archive.
            </p>
            <div className="space-y-2">
              <label
                className="flex cursor-pointer items-center gap-2 text-textSub hover:text-text"
              >
                <input
                  type="checkbox"
                  checked={flat}
                  onChange={(e) => setFlat(e.target.checked)}
                  className="h-3 w-3 accent-[var(--accent)] shrink-0"
                />
                Flat archive — no folders, every JSON at the archive root
              </label>
              <label
                className="flex cursor-pointer items-center gap-2 text-textSub hover:text-text"
              >
                <input
                  type="checkbox"
                  checked={keepNames}
                  onChange={(e) => setKeepNames(e.target.checked)}
                  className="h-3 w-3 accent-[var(--accent)] shrink-0"
                />
                Keep original JSON filenames instead of renaming to the match
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-textSub transition-colors hover:border-textSub hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg hover:bg-accent/90"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
