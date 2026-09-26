/**
 * The stats-scope selector for one tournament: a "Scope" button opening a
 * popup (modal) listing this tournament's own rounds (Round 1..6 for a double
 * round robin, Round 1..5 for 6 teams) as checkboxes — checking a combination
 * keeps exactly those rounds' games — plus one "Reset to all stats" escape
 * hatch. The popup stays open while rounds are toggled (the checkboxes
 * re-render from the new server-derived scope in place) and closes on Done,
 * Escape or a backdrop click. Individual games are picked through the "Game"
 * chip on their bracket card (see RoundRobinGrid): each chip toggles its
 * game in a game-only selection, so any combination — Round 5 Game 1 together
 * with Round 6 Game 1, say — can be scoped at once in a single
 * `?games=<slot>,<slot>` list.
 *
 * Selections are plain `?rounds=` / `?games=` query params read server-side,
 * so they're bookmarkable/shareable and need no client JS of their own. All
 * scoping is by bracket *slot* (not by file label or order), verified against
 * the bracket that produced this selector — hand-edited URLs can't address a
 * fixture that isn't there. Every scope link passes `scroll={false}` so
 * changing the selection never jumps the page back to the top.
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { generateRoundRobin, type BracketFileSummary, type StatsScope } from '@/lib/schedule';

export function scopeQuery(scope: StatsScope): string {
  const params = new URLSearchParams();
  if (scope.rounds.length > 0) params.set('rounds', scope.rounds.join(','));
  else if (scope.games.length > 0) params.set('games', scope.games.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export default function MatchStatsScope({
  matchId,
  teams,
  files,
  scope,
  scopedGameCount,
}: {
  matchId: string;
  teams: Parameters<typeof generateRoundRobin>[0];
  files: Record<string, BracketFileSummary>;
  scope: StatsScope;
  scopedGameCount: number;
}) {
  const [open, setOpen] = useState(false);
  const scoped = scope.rounds.length > 0 || scope.games.length > 0;
  // One line whatever's checked — rounds and game picks never mix (checking a
  // round clears the games, picking a game clears the rounds) — so the current
  // slice is scannable next to the scope it produces in the tables below.
  const label = !scoped
    ? 'All stats'
    : scope.rounds.length > 0
      ? `Round${scope.rounds.length > 1 ? 's' : ''} ${scope.rounds.join(', ')}`
      : `${scope.games.length} game${scope.games.length > 1 ? 's' : ''}`;
  const basePath = `/matches/${matchId}`;

  // Which displayed rounds actually have at least one attached file — an
  // unchecked round with no files yet would scope to an empty slice, which is
  // never what the checkbox means. The bracket is generated once and reused
  // for both the checkbox list and this lookup.
  const generated = generateRoundRobin(teams);
  const roundNumbers = generated.map((r) => r.displayRound);
  const slotToRound = new Map<string, number>();
  for (const round of generated) {
    for (const m of round.matchups) slotToRound.set(m.slot, round.displayRound);
  }
  const playableRounds = new Set<number>();
  for (const [slot] of Object.entries(files)) {
    const displayRound = slotToRound.get(slot);
    if (displayRound !== undefined) playableRounds.add(displayRound);
  }

  function withRoundToggled(displayRound: number): StatsScope {
    const rounds = scope.rounds.includes(displayRound)
      ? scope.rounds.filter((r) => r !== displayRound)
      : [...scope.rounds, displayRound].sort((a, b) => a - b);
    // Rounds and game picks never mix (see scopeQuery's shape): checking a
    // round drops the game picks, just like picking a game drops the rounds.
    return { rounds, games: rounds.length > 0 ? [] : scope.games };
  }

  // Escape closes the popup while it's open — the usual dialog affordance,
  // alongside the Done button and backdrop click.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-textMuted transition-colors hover:border-textSub hover:text-text"
      >
        Scope: {label}
      </button>
      {open && (
        // Modal popup instead of an anchored dropdown: centered over a
        // dimmed backdrop so it can't be clipped by the section it sits in,
        // and it stays open across the link-driven re-renders below — toggling
        // several rounds in a row doesn't reopen it each time.
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Stats scope"
            className="relative w-56 rounded-lg border border-border bg-surface p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-textSub">
                Stats scope
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
            <div className="space-y-0.5">
              {roundNumbers.map((r) => {
                const playable = playableRounds.has(r);
                return (
                  <Link
                    key={r}
                    href={`${basePath}${scopeQuery(withRoundToggled(r))}`}
                    scroll={false}
                    aria-disabled={!playable}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                      playable
                        ? 'text-text hover:bg-surfaceAlt'
                        : 'cursor-not-allowed text-textDim opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={scope.rounds.includes(r)}
                      disabled={!playable}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Round {r}
                    {!playable && <span className="ml-auto text-[0.65rem]">no games</span>}
                  </Link>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <Link
                href={basePath}
                scroll={false}
                onClick={() => setOpen(false)}
                className="text-xs text-textMuted hover:text-text"
              >
                Reset to all stats
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-textMuted transition-colors hover:border-textSub hover:text-text"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {scoped && (
        <span className="text-xs text-textDim">
          {scopedGameCount} game{scopedGameCount !== 1 ? 's' : ''} in scope
        </span>
      )}
    </div>
  );
}