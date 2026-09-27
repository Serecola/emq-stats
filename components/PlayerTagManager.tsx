'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { norm } from '@/lib/stats';
import type { PlayerTag } from '@/lib/types';

type Filter = 'all' | 'untagged' | PlayerTag;
type SaveStatus = 'saving' | 'saved' | 'error';

const TAGS: readonly PlayerTag[] = ['Player', 'Bot'];

/**
 * The Player Manager's "Player Tags" tab: one row per username known from
 * any uploaded tournament, with Player/Bot toggle buttons. Tags are global
 * (not per mode + sub-mode) — see player_tags in lib/db.ts — so this list
 * deliberately ignores the ModeToggle filter.
 *
 * Saving follows the PlayerRankInput pattern: PUT a single cell, keep the
 * result in local state for instant feedback, then router.refresh() so the
 * server-rendered badges on the public views catch up. Clicking the
 * already-active tag clears it (back to untagged).
 */
export default function PlayerTagManager({
  players,
  tags,
}: {
  /** Every username across every match, with tournament counts for context. */
  players: { uname: string; matchesPlayed: number }[];
  /** Current tags keyed by normalized username; absent = untagged. */
  tags: Record<string, PlayerTag>;
}) {
  const router = useRouter();
  // Local mirror so a click lands instantly; router.refresh() re-renders the
  // server props underneath, which match it after the save.
  const [localTags, setLocalTags] = useState<Record<string, PlayerTag>>(tags);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const counts = useMemo(() => {
    const c = { all: players.length, untagged: 0, Player: 0, Bot: 0 };
    for (const p of players) {
      const tag = localTags[norm(p.uname)];
      if (tag === undefined) c.untagged++;
      else c[tag]++;
    }
    return c;
  }, [players, localTags]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      const tag = localTags[norm(p.uname)];
      if (filter === 'untagged' && tag !== undefined) return false;
      if ((filter === 'Player' || filter === 'Bot') && tag !== filter) return false;
      if (q && !p.uname.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, localTags, query, filter]);

  async function save(uname: string, next: PlayerTag | null) {
    const key = norm(uname);
    setStatuses((prev) => ({ ...prev, [key]: 'saving' }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/player-tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey: key, tag: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Could not save tag.');
      }
      setLocalTags((prev) => {
        const copy = { ...prev };
        if (next === null) delete copy[key];
        else copy[key] = next;
        return copy;
      });
      setStatuses((prev) => ({ ...prev, [key]: 'saved' }));
      router.refresh();
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [key]: 'error' }));
      setErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Could not save tag.',
      }));
    }
  }

  const filterChip = (value: Filter, label: string, count: number): React.ReactNode => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        filter === value
          ? 'bg-accent text-bg'
          : 'border border-border text-textMuted hover:border-textSub hover:text-text'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search username…"
          aria-label="Search usernames"
          className="w-56 rounded-md border border-border bg-surfaceAlt px-3 py-1.5 text-sm outline-none placeholder:text-textDim focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChip('all', 'All', counts.all)}
          {filterChip('untagged', 'Untagged', counts.untagged)}
          {filterChip('Player', 'Player', counts.Player)}
          {filterChip('Bot', 'Bot', counts.Bot)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
              <th className="px-3 py-2 font-medium">Username</th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Tournaments this username has appeared in"
              >
                Tours
              </th>
              <th className="px-3 py-2 text-right font-medium">Tag</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const key = norm(p.uname);
              const tag = localTags[key];
              const status = statuses[key];
              return (
                <tr
                  key={key}
                  className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
                >
                  <td className="px-3 py-2 font-medium">{p.uname}</td>
                  <td className="px-3 py-2 text-right text-textMuted">{p.matchesPlayed}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-end gap-1.5">
                      {status === 'saving' && (
                        <span className="text-[0.65rem] text-textDim">…</span>
                      )}
                      {status === 'saved' && (
                        <span className="text-[0.65rem] text-textDim">saved</span>
                      )}
                      {status === 'error' && (
                        <span
                          className="cursor-help text-[0.65rem] font-semibold text-taken"
                          title={errors[key] || ''}
                        >
                          !
                        </span>
                      )}
                      {TAGS.map((t) => {
                        const active = tag === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            title={
                              active
                                ? `Clear ${p.uname}'s ${t} tag`
                                : `Tag ${p.uname} as ${t}`
                            }
                            onClick={() => save(p.uname, active ? null : t)}
                            className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium transition-colors ${
                              active
                                ? t === 'Bot'
                                  ? 'border-taken/50 bg-taken/10 text-taken'
                                  : 'border-accent/50 bg-accent/10 text-accent'
                                : 'border-border text-textMuted hover:border-textSub hover:text-text'
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-textMuted">
                  {players.length === 0
                    ? 'No usernames yet — upload a tournament first.'
                    : 'No usernames match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
