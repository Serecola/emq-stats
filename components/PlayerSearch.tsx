'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { MatchFilter } from '@/lib/match-filter';
import { togglePlayer, type PlayerFilter } from '@/lib/tournament-search';
import { withBasePath } from '@/lib/base-path';

const norm = (s: string) => s.toLowerCase().trim();

/**
 * Player search for the tournament list: type a name to keep only the
 * tournaments they were in, or to hide the ones they weren't.
 *
 * A box first (a name, then "Include" / "Exclude"), with the applied names
 * kept as removable chips below — the same shape as the mode pills above it, so
 * the two read as one filter. Names are added by submit or by picking a
 * suggestion, never per-keystroke: this list is server-rendered, so filtering
 * as you type would re-render the page on every character.
 *
 * State lives in the URL (`?with=karira&without=patt`), so a filtered list is
 * bookmarkable and shareable, and the mode/sub-mode selection is carried along
 * on every change — filtering by player and then switching gamemode keeps both,
 * which is the point of stacking them.
 *
 * The form falls back to posting `?q=&add=` to itself, which the server applies
 * as a pending name, so submitting still filters the list with JS unavailable;
 * the router then rewrites the URL to the committed `?with=` form. Suggestions
 * come from the same roster the filter matches, so the two can't drift apart
 * and no extra query is needed to build them.
 */
export default function PlayerSearch({
  filter,
  names,
  basePath = '/',
}: {
  filter: PlayerFilter;
  /** Normalized key -> { name, count }, from collectRosterNames. */
  names: Map<string, { name: string; count: number }>;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<'with' | 'without'>('with');
  // A <datalist> has to be rendered from a plain array for the browser to
  // offer it, and it only changes when the underlying data does.
  const suggestions = [...names.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const listId = 'player-suggestions';
  const committed = useRef(false);


  // Once a name has been added, clear the box and move the URL off the pending
  // `?q=` form — otherwise the name would still be in the input after a reload.
  useEffect(() => {
    if (!committed.current) return;
    committed.current = false;
    setQuery('');
    const next = new URLSearchParams(searchParams.toString());
    next.delete('q');
    next.delete('add');
    const qs = next.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }, [searchParams, router, basePath]);

  /** Navigate to the list with `next` as the player filter, keeping the rest. */
  function go(next: PlayerFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    params.delete('add');
    if (next.with.length) params.set('with', next.with.join(','));
    else params.delete('with');
    if (next.without.length) params.set('without', next.without.join(','));
    else params.delete('without');
    const qs = params.toString();
    // scroll:false — filtering shouldn't throw away where you were reading.
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const key = norm(query);
    if (!key) return;
    // A name in no roster would silently match nothing, so refuse it here
    // rather than dropping the list to empty with no explanation.
    if (!names.has(key)) {
      setQuery('');
      return;
    }
    committed.current = true;
    go(togglePlayer(filter, key, side));
  }

  const chips = [
    ...filter.with.map((key) => ({ key, side: 'with' as const })),
    ...filter.without.map((key) => ({ key, side: 'without' as const })),
  ];

  return (
    <div className="space-y-2">
      {/* method="get" so the form still works with JS off: the server reads the
          same q/add params out of the URL (see parsePlayerFilter). The action
          needs the basePath added by hand — a native form submit is a plain
          browser navigation, so unlike router.push() it gets no prefix. */}
      <form
        onSubmit={submit}
        method="get"
        action={withBasePath(basePath)}
        className="flex flex-wrap items-center gap-1.5"
      >
        <label htmlFor="player-search" className="sr-only">
          Search tournaments by player
        </label>
        <input
          id="player-search"
          name="q"
          list={listId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player…"
          autoComplete="off"
          spellCheck={false}
          className="w-44 rounded-md border border-border bg-surfaceAlt px-2.5 py-1.5 text-xs text-text outline-none placeholder:text-textDim focus:border-textSub"
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s.key} value={s.name}>
              {s.count} tournament{s.count !== 1 ? 's' : ''}
            </option>
          ))}
        </datalist>
        {/* Which way the next name filters, as a toggle beside the box rather
            than two submit buttons — so adding several names in a row doesn't
            need re-picking a button each time; the mode carries over. */}
        <input type="hidden" name="add" value={side} />
        <div className="flex overflow-hidden rounded-md border border-border">
          {(
            [
              { id: 'with', label: 'Include', title: 'Only tournaments this player was in' },
              { id: 'without', label: 'Exclude', title: 'Hide tournaments this player was in' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.title}
              aria-pressed={side === option.id}
              onClick={() => setSide(option.id)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                side === option.id
                  ? 'bg-accent text-bg'
                  : 'bg-surfaceAlt text-textMuted hover:text-text'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-textMuted transition-colors hover:border-textSub hover:text-text disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => {
            const info = names.get(chip.key);
            // A name that came from a hand-edited URL isn't in the roster, so
            // fall back to the key itself rather than rendering nothing.
            const label = info?.name ?? chip.key;
            const isWith = chip.side === 'with';
            return (
              <span
                key={`${chip.side}-${chip.key}`}
                className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-[0.65rem] ${
                  isWith
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-taken/40 bg-taken/10 text-taken'
                }`}
              >
                <span>
                  {isWith ? '' : '−'}
                  {label}
                  {info ? ` (${info.count})` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => go(togglePlayer(filter, chip.key, chip.side))}
                  title={`Remove ${label}`}
                  aria-label={`Remove ${label} from the filter`}
                  className="rounded-full px-1 opacity-60 transition-opacity hover:opacity-100"
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => go({ with: [], without: [] })}
            className="text-[0.65rem] text-textDim underline-offset-2 hover:text-text hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
