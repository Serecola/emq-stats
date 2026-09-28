'use client';

import Link from 'next/link';
import { useState } from 'react';
import { compareValues, SortableHeader, toggleSort, type SortDir } from '@/components/SortableTable';
import ExpectationBadge from '@/components/ExpectationBadge';
import PlayerRankInput from '@/components/PlayerRankInput';
import type { PlayerRankRow } from '@/lib/player-ranks';
import type { Mode, Submode } from '@/lib/types';

interface Column {
  key: string;
  label: string;
  title?: string;
  accessor: (row: PlayerRankRow) => number | string;
  render: (row: PlayerRankRow) => React.ReactNode;
  className?: string;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * The Player Manager table: one row per player who has played the selected
 * gamemode + sub-mode, with their stats, the Expected Rank their play in *that
 * sub-mode* implies, and an editable Set Rank. Rows are sorted client-side like
 * the match Guess Rate table — `expectedRank` descending by default, which is
 * the order the ranking decisions are usually made in.
 *
 * A player who has only ever played a sibling sub-mode has no row here at all:
 * their figures would be on a different scale, so they are never mixed in.
 *
 * Set Rank is edited per row (PlayerRankInput) and scoped to this mode +
 * sub-mode, so the value stored here is exactly the one autodraft uses for a
 * tournament with the same mode + sub-mode. Unset rows sort last on that
 * column so "who still needs a rank" is one click away.
 */
export default function PlayerRankTable({
  rows,
  mode,
  submode,
  filterQuery,
}: {
  rows: PlayerRankRow[];
  mode: Mode;
  submode: Submode;
  filterQuery: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>('expectedRank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  const columns: Column[] = [
    {
      key: 'uname',
      label: 'Player',
      accessor: (r) => r.uname.toLowerCase(),
      render: (r) => (
        <Link
          href={`/players/${encodeURIComponent(r.uname)}${filterQuery}`}
          className="font-medium hover:underline"
        >
          {r.uname}
        </Link>
      ),
    },
    {
      key: 'matchesPlayed',
      label: 'Tours',
      title: `Tournaments in ${mode} ${submode}`,
      accessor: (r) => r.matchesPlayed,
      render: (r) => r.matchesPlayed,
    },
    { key: 'songs', label: 'Songs', accessor: (r) => r.songs, render: (r) => r.songs },
    {
      key: 'guessRate',
      label: 'Guess Rate',
      accessor: (r) => r.guessRate,
      render: (r) => <span className="text-accent">{pct(r.guessRate)}</span>,
    },
    {
      key: 'expectedRank',
      label: 'Expected Rank',
      title: `Songs-weighted ${mode} ${submode} Performance across their tournaments`,
      className: 'border-l border-border',
      accessor: (r) => r.expectedRank,
      render: (r) => <span className="font-medium text-textSub">{r.expectedRank.toFixed(2)}</span>,
    },
    {
      key: 'setRank',
      label: 'Set Rank',
      title: `Admin-assigned rank for ${mode} ${submode} — the rank autodraft uses`,
      // Unset ranks sort last (up from Infinity, down from -Infinity) instead
      // of being treated as 0.
      accessor: (r) => r.setRank ?? (sortDir === 'asc' ? Infinity : -Infinity),
      render: (r) => (
        <PlayerRankInput
          playerKey={r.playerKey}
          mode={mode}
          submode={submode}
          rank={r.setRank}
          playerName={r.uname}
        />
      ),
    },
    {
      key: 'expectation',
      label: 'Expectation',
      title: 'Expected Rank − Set Rank',
      className: 'border-l border-border',
      accessor: (r) => r.diff ?? (sortDir === 'asc' ? Infinity : -Infinity),
      render: (r) =>
        r.expectation ? <ExpectationBadge label={r.expectation} /> : <span className="text-textDim">—</span>,
    },
  ];

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', setSortKey, setSortDir);
  }

  const activeColumn = columns.find((c) => c.key === sortKey);
  const sortedRows = activeColumn
    ? [...rows].sort((a, b) => compareValues(activeColumn.accessor(a), activeColumn.accessor(b), sortDir))
    : rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
            {columns.map((c) => (
              <SortableHeader
                key={c.key}
                label={c.label}
                sortKey={c.key}
                activeKey={sortKey}
                dir={sortDir}
                onClick={onSort}
                align={c.key === 'uname' ? 'left' : 'right'}
                title={c.title}
                className={c.className}
                highlighted={hoveredCol === c.key}
                onMouseEnter={() => setHoveredCol(c.key)}
                onMouseLeave={() => setHoveredCol(null)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.playerKey}
              className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${
                    c.key === 'uname' ? 'font-medium' : 'text-right text-textMuted'
                  } ${hoveredCol === c.key ? 'bg-white/5' : ''} ${c.className ?? ''}`}
                  onMouseEnter={() => setHoveredCol(c.key)}
                  onMouseLeave={() => setHoveredCol(null)}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-textMuted">
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}