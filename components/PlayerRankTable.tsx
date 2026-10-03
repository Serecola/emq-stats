'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { compareValues, percentHeat, SortableHeader, toggleSort, type SortDir } from '@/components/SortableTable';
import ExpectationBadge from '@/components/ExpectationBadge';
import PlayerRankInput from '@/components/PlayerRankInput';
import { TABLE_ROW_CLASS } from '@/lib/table-row';
import type { PlayerRankRow } from '@/lib/player-ranks';
import type { Mode, Submode } from '@/lib/types';

interface Column {
  key: string;
  label: string;
  title?: string;
  accessor: (row: PlayerRankRow) => number | string;
  render: (row: PlayerRankRow) => React.ReactNode;
  className?: string;
  /**
   * Per-cell inline background, for the columns that read better shaded than
   * printed (see percentHeat). Rendered on the <td> itself, so a tinted cell
   * keeps its colour through the row and column hover washes — those are
   * deliberately skipped on the shaded columns rather than fighting them.
   */
  cellStyle?: (row: PlayerRankRow) => CSSProperties | undefined;
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
  playerQuery,
}: {
  rows: PlayerRankRow[];
  mode: Mode;
  submode: Submode;
  // Query the player name links carry: the mode + sub-mode, plus the range the
  // table itself is showing (see playerViewQuery), so clicking through lands on
  // the same reading of that player's history rather than resetting to Recent.
  playerQuery: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>('expectedRank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  // VN columns for Erumode Normal — always visible, sitting right after
  // Expectation so the row reads ... | Expectation | VN GR | VN Expected
  // Rank. Both are Mst-only readings of the same range, and neither gets an
  // Expectation verdict: that compares Expected Rank to Set Rank, and the VN
  // figures deliberately aren't paired with one.
  const showVn = mode === 'Erumode' && submode === 'Normal';

  const columns: Column[] = [
    {
      key: 'uname',
      label: 'Player',
      accessor: (r) => r.uname.toLowerCase(),
      render: (r) => (
        <Link
          href={`/players/${encodeURIComponent(r.uname)}${playerQuery}`}
          className="font-medium hover:underline"
        >
          {r.uname}
        </Link>
      ),
    },
    {
      key: 'matchesPlayed',
      label: 'Tours',
      title: `Tournaments in ${mode} ${submode} — the range above decides how many`,
      accessor: (r) => r.matchesPlayed,
      // A trimmed row keeps its all-time count visible, so "5 / 12" is honest
      // about there being seven older tournaments behind the range.
      render: (r) =>
        r.matchesPlayedAllTime > r.matchesPlayed ? (
          <span title={`Last ${r.matchesPlayed} of ${r.matchesPlayedAllTime} tournaments`}>
            {r.matchesPlayed}
            <span className="opacity-60">/{r.matchesPlayedAllTime}</span>
          </span>
        ) : (
          r.matchesPlayed
        ),
    },
    {
      key: 'winRate',
      label: 'Winrate',
      // Stated on the header so the scoring doesn't have to be guessed at: a win
      // is a point, a tie half, a loss nothing, over the games played.
      title: `Winrate over the games they played — 1 point a win, 0.5 a tie, 0 a loss (${mode} ${submode}, the range above decides how many)`,
      accessor: (r) => r.winRate ?? (sortDir === 'asc' ? Infinity : -Infinity),
      cellStyle: (r) => percentHeat(r.winRate),
      render: (r) =>
        r.winRate === null ? (
          <span className="text-textDim">—</span>
        ) : (
          <span
            className="text-textSub"
            title={`${r.record.wins}W ${r.record.ties}T ${r.record.losses}L over ${r.record.games} game${
              r.record.games !== 1 ? 's' : ''
            }`}
          >
            {pct(r.winRate)}
          </span>
        ),
    },
    {
      key: 'guessRate',
      label: 'Guess Rate',
      accessor: (r) => r.guessRate,
      cellStyle: (r) => percentHeat(r.guessRate),
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
    // VN pair closing the row for Erumode Normal: ... | Expectation | VN GR |
    // VN Expected Rank. VN GR is the songs-weighted average of the range's
    // VN-only (Mst) Guess Rates; VN Expected Rank is the same songs-weighted
    // computation as Expected Rank but fed VN-only Performance alone (itself
    // derived from VN GR — see lib/guess-stats.ts). No Expectation verdict
    // for either: that compares Expected Rank to Set Rank, and the VN
    // figures deliberately aren't paired with one.
    ...(showVn
      ? [
          {
            key: 'vnGuessRate',
            label: 'VN GR',
            title: 'Average VN Guess Rate — Mst (main-title) answers only, songs-weighted over the range',
            accessor: (r: PlayerRankRow) => r.vnGuessRate ?? -1,
            cellStyle: (r: PlayerRankRow) => percentHeat(r.vnGuessRate),
            className: 'border-l border-border',
            render: (r: PlayerRankRow) =>
              r.vnGuessRate == null ? (
                <span className="text-textDim">—</span>
              ) : (
                <span className="text-accent">{pct(r.vnGuessRate)}</span>
              ),
          } as Column,
          {
            key: 'vnExpectedRank',
            label: 'VN Expected Rank',
            title: 'VN Expected Rank — same songs-weighted computation as Expected Rank, but from VN-only (Mst) Performance alone',
            accessor: (r: PlayerRankRow) => r.vnExpectedRank ?? -1,
            render: (r: PlayerRankRow) =>
              r.vnExpectedRank == null ? (
                <span className="text-textDim">—</span>
              ) : (
                <span className="font-medium text-text">{r.vnExpectedRank.toFixed(2)}</span>
              ),
          } as Column,
        ]
      : []),
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
      <table className="w-full border-collapse text-[0.75rem] sm:text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceAlt text-left text-[0.65rem] uppercase tracking-wide text-textMuted sm:text-xs">
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
              className={TABLE_ROW_CLASS}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  // The shaded columns keep their tint through a hover rather
                  // than washing it out: `hoveredCol` is skipped there, since
                  // an inline background outranks the class either way.
                  className={`px-3 py-2 ${
                    c.key === 'uname' ? 'font-medium' : 'text-right text-textMuted'
                  } ${hoveredCol === c.key && !c.cellStyle ? 'bg-text/5' : ''} ${c.className ?? ''}`}
                  style={c.cellStyle?.(row)}
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