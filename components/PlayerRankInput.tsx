'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Mode, Submode } from '@/lib/types';
import { withBasePath } from '@/lib/base-path';

/**
 * Inline editor for one player's admin-assigned Set Rank in one gamemode +
 * sub-mode. Saves on blur (or Enter, which just blurs) so ranking a whole
 * roster is type-then-tab — no per-row save button, and no form wrapping the
 * table.
 *
 * A saved rank feeds the Expectation column (Expected Rank − Set Rank) and is
 * the rank autodraft uses for tournaments with the same mode + sub-mode, so a
 * successful save calls router.refresh() to let the server recompute verdicts.
 * Clearing the field removes the rank entirely (no rank assigned).
 */
export default function PlayerRankInput({
  playerKey,
  mode,
  submode,
  rank,
  playerName,
}: {
  playerKey: string;
  mode: Mode;
  submode: Submode;
  rank: number | null;
  playerName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(rank === null ? '' : String(rank));
  const [saved, setSaved] = useState<number | null>(rank);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    const next = trimmed === '' ? null : Number(trimmed);

    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setStatus('error');
      setError('Rank must be a number of 0 or higher.');
      setValue(saved === null ? '' : String(saved));
      return;
    }
    if (next === saved) {
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      const res = await fetch(withBasePath('/api/admin/player-ranks'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey, mode, submode, rank: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not save rank.');
      }
      setSaved(next);
      setStatus('saved');
      router.refresh();
    } catch (err) {
      // Put the previous value back — the cell should never show a rank
      // that isn't what's stored.
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not save rank.');
      setValue(saved === null ? '' : String(saved));
    }
  }

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {status === 'saving' && <span className="text-[0.65rem] text-textDim">…</span>}
      {status === 'saved' && <span className="text-[0.65rem] text-textDim">saved</span>}
      {status === 'error' && (
        <span className="cursor-help text-[0.65rem] font-semibold text-taken" title={error ?? ''}>
          !
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder="—"
        aria-label={`Set Rank for ${playerName} in ${mode} ${submode}`}
        onChange={(e) => {
          setValue(e.target.value);
          if (status !== 'idle') {
            setStatus('idle');
            setError(null);
          }
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(saved === null ? '' : String(saved));
            setStatus('idle');
            setError(null);
          }
        }}
        className="w-14 rounded-md border border-border bg-surfaceAlt px-2 py-1 text-right text-sm text-text outline-none placeholder:text-textDim focus:border-accent"
      />
    </span>
  );
}