'use client';

import { useState } from 'react';

/**
 * Generic Copy button — the numbers people actually want to quote somewhere
 * (a Discord post about the tournament, a sheet), which the page otherwise
 * only offers as something you retype by eye.
 *
 * Takes the finished text as a prop rather than the stats, so the formatting
 * stays on the server side next to the block it copies (e.g.
 * `formatMvpSummary` in lib/mvp.ts): this component never has to know what a
 * "played like" is, and the button can't drift out of step with the block it
 * sits next to.
 *
 * The clipboard write is the same one the admin's share-link button uses, and
 * fails the same way — on an insecure origin or a denied permission there is
 * no `navigator.clipboard` to reach, so the label flips to Failed and the
 * reason sits in the tooltip rather than silently doing nothing.
 */
export default function CopyButton({
  text,
  label = 'Copy these results as plain text',
  ariaLabel = 'Copy results as plain text',
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={
        failed
          ? 'Could not reach the clipboard — select the text and copy it manually.'
          : label
      }
      aria-label={ariaLabel}
      aria-live="polite"
      className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        failed
          ? 'border-taken/40 text-taken'
          : 'border-border text-textMuted hover:border-textSub hover:text-text'
      }`}
    >
      {copied ? 'Copied' : failed ? 'Failed' : 'Copy'}
    </button>
  );
}

/**
 * Backwards-compatible alias: the MVP block was the first caller, and keeps
 * importing `CopyMvpButton`. Same button, same behaviour — new callers import
 * `CopyButton` directly.
 */
export function CopyMvpButton({ text }: { text: string }) {
  return (
    <CopyButton
      text={text}
      label="Copy these results as plain text"
      ariaLabel="Copy expected vs actual results as plain text"
    />
  );
}