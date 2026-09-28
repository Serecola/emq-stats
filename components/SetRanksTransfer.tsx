'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatRankList, parseRankList } from '@/lib/teams';
import type { Mode, Submode } from '@/lib/types';
import { withBasePath } from '@/lib/base-path';

/**
 * Bulk transfer of one gamemode + sub-mode's Set Ranks, as a plain
 * `rank: name, name` table — the same shape the autodrafter's pasted ranks box
 * takes, so a ladder can be handed over between accounts, drafted elsewhere
 * and pasted straight back in.
 *
 * Lives behind a button above the ladder table: the page is a ranking table,
 * and two textareas pushed into the middle of it would bury the thing they're
 * for. The panels mount only while the popup is open, so the button carries
 * the only context the page needs — which gamemode + sub-mode the ladder it
 * opens belongs to.
 *
 * Export is generated from the stored ranks (keyed by normalized username), with
 * proper casing supplied by the caller from the names actually seen in play,
 * plus whatever capitalization an import pasted in (see `typedNames`).
 * Import goes through the same `PUT /api/admin/player-ranks` endpoint the inline
 * Set Rank cells use, one request per player, so validation and storage stay in
 * one place and a paste can't bypass them.
 *
 * A paste only *adds* ranks by default. "Replace the whole ladder" is opt-in,
 * because clearing ranks the paste happens not to mention is the one
 * destructive thing this control can do, and an accidental paste should never
 * do it silently.
 */
export default function SetRanksTransfer({
  mode,
  submode,
  ranks,
  displayNames,
}: {
  mode: Mode;
  submode: Submode;
  /** This mode + sub-mode's Set Ranks: normalized username -> rank. */
  ranks: Record<string, number>;
  /** Normalized username -> the casing to show it under. */
  displayNames: Record<string, string>;
}) {
  const router = useRouter();
  const [importText, setImportText] = useState('');
  const [replace, setReplace] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  // The capitalization as typed into the import box, kept for the session.
  // Set Ranks are stored keyed by *normalized* username, so the casing the
  // admin typed lives nowhere else — and for a player who hasn't played this
  // sub-mode there isn't even a table row to read a proper name off, so
  // without this their entry would silently export as `shirosora`. Names the
  // server already knows win, since those are the canonical spelling.
  const [typedNames, setTypedNames] = useState<Record<string, string>>({});
  const names = useMemo(() => ({ ...typedNames, ...displayNames }), [typedNames, displayNames]);

  const exportText = useMemo(() => formatRankList(ranks, names), [ranks, names]);
  const parsed = useMemo(() => parseRankList(importText), [importText]);

  // What the paste would actually change: ranks that differ from what's stored,
  // plus (only when replacing) stored ranks the paste doesn't mention. Anything
  // already correct is skipped so a re-import of an unedited ladder writes
  // nothing at all.
  const setChanges = Object.entries(parsed.ranks).filter(([key, rank]) => ranks[key] !== rank);
  const clearChanges = replace
    ? Object.keys(ranks).filter((key) => parsed.ranks[key] === undefined)
    : [];
  const changeCount = setChanges.length + clearChanges.length;

  // Escape closes the popup while it's open — the usual dialog affordance,
  // alongside the × button and the backdrop click.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function runImport() {
    if (changeCount === 0) return;
    setStatus('saving');
    setError(null);
    // Sequential rather than parallel: each write bumps the data version, and a
    // ladder can be dozens of players. The counter keeps a long paste honest
    // about what it's doing.
    const writes: { key: string; rank: number | null }[] = [
      ...setChanges.map(([key, rank]) => ({ key, rank })),
      ...clearChanges.map((key) => ({ key, rank: null })),
    ];
    try {
      for (let i = 0; i < writes.length; i++) {
        setProgress({ done: i, total: writes.length });
        const { key, rank } = writes[i];
        const res = await fetch(withBasePath('/api/admin/player-ranks'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerKey: key, mode, submode, rank }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          // Name the player — "import failed" is useless on a 40-name ladder.
          const who = names[key] ?? key;
          throw new Error(`${who}: ${body?.error ?? 'could not save rank'}`);
        }
      }
      setProgress(null);
      setImportText('');
      // Hold on to the capitalization this paste used, so the export above
      // shows the same names back rather than the normalized keys.
      setTypedNames((prev) => ({ ...prev, ...parsed.displayNames }));
      setStatus('saved');
      router.refresh();
    } catch (err) {
      setProgress(null);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not import ranks.');
    }
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard — select the text and copy it.');
    }
  }

  const panelClass = 'rounded-md border border-border bg-surfaceAlt p-3';
  const textareaClass =
    'w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs outline-none placeholder:text-textDim focus:border-accent';

  return (
    <>
      {/* Just the trigger, right-aligned above the table — the panels themselves
          only exist while the popup is open, so the ladder view isn't pushed
          down by them. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-textSub transition-colors hover:border-textSub hover:text-text"
        >
          Import / export Set Ranks
          <span className="ml-1.5 text-textDim">
            {mode} {submode}
          </span>
        </button>
      </div>

      {open && (
        // Centered over a dimmed backdrop rather than anchored to the button, so
        // it can't be clipped by the table it sits above, and it stays open
        // across the import's own re-renders.
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Set Ranks for ${mode} ${submode}`}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-textSub">
                Set Ranks · {mode} {submode}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded px-1 text-sm leading-none text-textDim hover:bg-surfaceAlt hover:text-text"
              >
                ×
              </button>
            </div>
            <p className="mb-3 text-xs text-textDim">
              One rank per line, names after a colon, shared ranks comma-separated — the same
              text the autodrafter&apos;s ranks box takes, so it works in both places.
            </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={panelClass}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-textSub">Export</span>
            <button
              type="button"
              onClick={copyExport}
              disabled={exportText === ''}
              className="rounded-full border border-border px-2.5 py-0.5 text-[0.65rem] text-textMuted transition-colors hover:border-textSub hover:text-text disabled:opacity-60"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            readOnly
            value={exportText}
            rows={6}
            spellCheck={false}
            placeholder="No Set Ranks for this gamemode yet."
            aria-label={`Set Ranks for ${mode} ${submode}`}
            className={`${textareaClass} text-textSub`}
          />
        </div>
        <div className={panelClass}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-textSub">Import</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[0.65rem] text-textMuted">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              Replace the whole ladder
            </label>
          </div>
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
                setError(null);
              }
            }}
            rows={6}
            spellCheck={false}
            placeholder={'11: karira, patt\n10: Shirosora, shiro206\n9: Hyther, Tommy'}
            aria-label={`Paste Set Ranks for ${mode} ${submode}`}
            className={textareaClass}
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.65rem] text-textDim">
              {importText.trim() === ''
                ? 'Nothing to import yet.'
                : `${setChanges.length} to set, ${clearChanges.length} to clear`}
              {progress && ` · ${progress.done}/${progress.total}`}
            </span>
            <button
              type="button"
              onClick={runImport}
              disabled={changeCount === 0 || status === 'saving'}
              className="rounded-md bg-accent px-2.5 py-1 text-[0.65rem] font-semibold text-bg disabled:opacity-60"
            >
              {status === 'saving' ? 'Importing…' : changeCount > 0 ? `Import ${changeCount}` : 'Import'}
            </button>
          </div>
        </div>
      </div>

            {status === 'saved' && (
              <p className="mt-3 text-xs text-textMuted">
                Imported — the table behind this is up to date.
              </p>
            )}
            {status === 'error' && error && <p className="mt-3 text-xs text-taken">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
