'use client';

import { useState } from 'react';

/**
 * The public, shareable address of a saved tournament: the page players and
 * spectators actually open, as opposed to this admin-only edit form.
 *
 * The base is hardcoded rather than derived from the current `window.location`
 * on purpose — the admin is editing on localhost during development, and a
 * link built from that would be useless to anyone who isn't on the admin's
 * machine. This component only ever renders for a match that already exists
 * (`existing.id`), so the id is always present.
 */
const PUBLIC_ORIGIN = 'http://serecola.com/emq-stats';

/**
 * The player-view link for a saved tournament, with a one-click copy button.
 *
 * Sharing a tournament is a separate job from editing it, and the link is the
 * one thing an admin needs when they're done here (posting results, asking for
 * feedback), so it sits at the very top of the form where it's reachable
 * without scrolling past the roster and uploads.
 */
export default function ShareMatchLink({ matchId }: { matchId: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `${PUBLIC_ORIGIN}/matches/${matchId}`;

  async function copyLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard — select the link and copy it.');
    }
  }

  return (
    <div className="rounded-md border border-border bg-surfaceAlt p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor="player-view-link"
          className="text-xs font-medium text-textSub"
        >
          Player view link
        </label>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-full border border-border px-2.5 py-0.5 text-[0.65rem] text-textMuted transition-colors hover:border-textSub hover:text-text"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <input
        id="player-view-link"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Player view link"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-textSub outline-none focus:border-textSub"
      />
      <p className="mt-1.5 text-xs text-textDim">
        Share this link with players to send them to the tournament&apos;s public page.
      </p>
      {error && <p className="mt-1.5 text-xs text-taken">{error}</p>}
    </div>
  );
}