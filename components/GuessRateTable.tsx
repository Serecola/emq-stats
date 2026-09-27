'use client';

import { useState } from 'react';
import type { ErumodeGuessRow, GuessRateStats, NgmcGuessRow } from '@/lib/guess-stats';
import type { PlayerTag, Team } from '@/lib/types';
import { expectationFromDiff } from '@/lib/expectation';
import { teamColor } from '@/lib/team-colors';
import ExpectationBadge from './ExpectationBadge';
import PlayerTagBadge from './PlayerTagBadge';
import { SortableHeader, toggleSort, compareValues, type SortDir } from './SortableTable';

const norm = (s: string) => s.toLowerCase().trim();

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function num(n: number): string {
  return n.toFixed(2);
}

// Display labels for Erumode answer-type columns — internal keys (matching
// the raw JSON's AnsType strings) stay as-is; only the header text changes.
const ANSWER_TYPE_LABELS: Record<string, string> = {
  Mst: 'VN',
  A: 'Artist',
  Mt: 'SN',
};
function answerTypeLabel(t: string): string {
  return ANSWER_TYPE_LABELS[t] ?? t;
}

// Subtle per-tier row tints — T1..T4 only; anything beyond that (or
// players not on any team) gets no tint.
const TIER_BG: Record<number, string> = {
  1: 'rgba(224,82,82,0.07)', // light red
  2: 'rgba(224,196,82,0.07)', // light yellow
  3: 'rgba(77,143,224,0.07)', // light blue
  4: 'rgba(122,201,122,0.07)', // light green
};

interface Column<T> {
  key: string;
  label: React.ReactNode;
  title?: string;
  accessor: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

function GenericSortableTable<T extends { uname: string }>({
  columns,
  rows,
  minWidth,
  defaultSortKey,
  defaultSortDir = 'desc',
  rowTier,
}: {
  columns: Column<T>[];
  rows: T[];
  minWidth: number;
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  rowTier?: (row: T) => number | null;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', setSortKey, setSortDir);
  }

  const activeColumn = columns.find((c) => c.key === sortKey);
  const sortedRows = activeColumn
    ? [...rows].sort((a, b) => compareValues(activeColumn.accessor(a), activeColumn.accessor(b), sortDir))
    : rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
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
          {sortedRows.map((row) => {
            const tier = rowTier?.(row) ?? null;
            const bg = tier !== null ? TIER_BG[tier] : undefined;
            return (
              <tr
                key={row.uname}
                style={bg ? { backgroundColor: bg } : undefined}
                className={`border-b border-borderSub transition-colors last:border-b-0 ${
                  bg ? 'hover:brightness-125' : 'hover:bg-surfaceAlt/50'
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.key === 'uname' ? 'font-medium' : 'text-right text-textMuted'} ${
                      hoveredCol === c.key ? 'bg-white/5' : ''
                    } ${c.className ?? ''}`}
                    onMouseEnter={() => setHoveredCol(c.key)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
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

export default function GuessRateTable({
  stats,
  teams,
  playerRanks,
  playerTags,
}: {
  stats: GuessRateStats;
  teams: Team[];
  playerRanks: Record<string, number>;
  /** Global Player/Bot tags — usernames tagged Bot get a pill by their name. */
  playerTags?: Record<string, PlayerTag>;
}) {
  // Tier = ordinal position within the player's team (1st listed = T1, 2nd
  // = T2, ...), derived purely from roster order — never stored. Rank =
  // whatever number was parsed from "(N)" next to their name in the
  // pasted roster, independent of team position.
  const tierOf = (uname: string): number | null => {
    const key = norm(uname);
    for (const team of teams) {
      const idx = team.findIndex((p) => norm(p) === key);
      if (idx !== -1) return idx + 1;
    }
    return null;
  };
  const rankOf = (uname: string): number | null => playerRanks[norm(uname)] ?? null;

  // Which team the player belongs to (index into `teams`), or -1 when they're
  // on none. Their name is tinted with that team's shared color (see
  // lib/team-colors) so a player's team is identifiable in this table's
  // cross-team ordering and matches the Results / Attacks & Blocks views.
  const teamIndexOf = (uname: string): number => {
    const key = norm(uname);
    return teams.findIndex((team) => team.some((p) => norm(p) === key));
  };
  const colorOf = (uname: string): string | undefined => {
    const ti = teamIndexOf(uname);
    return ti === -1 ? undefined : teamColor(ti);
  };

  // Shared name cell for both mode tables: team tint plus the bot pill when
  // the username is tagged (see PlayerTagBadge).
  const nameRender = (r: { uname: string }): React.ReactNode => (
    <span style={{ color: colorOf(r.uname) }}>
      {r.uname}
      <PlayerTagBadge tag={playerTags?.[norm(r.uname)]} className="ml-1.5" />
    </span>
  );

  const tierColumn = <T extends { uname: string }>(): Column<T> => ({
    key: 'tier',
    label: 'Tier',
    accessor: (r) => tierOf(r.uname) ?? Infinity,
    render: (r) => {
      const t = tierOf(r.uname);
      return t !== null ? `T${t}` : '—';
    },
  });
  const rankColumn = <T extends { uname: string }>(): Column<T> => ({
    key: 'rank',
    label: 'Current Rank',
    accessor: (r) => rankOf(r.uname) ?? Infinity,
    render: (r) => rankOf(r.uname) ?? '—',
  });

  const performanceColumn = <T extends { uname: string; performance: number }>(): Column<T> => ({
    key: 'performance',
    label: 'Performance',
    title: 'Computed rating for cross-tournament comparison',
    accessor: (r) => r.performance,
    render: (r) => <span className="font-medium text-textSub">{r.performance.toFixed(2)}</span>,
  });

  // Expectation = Performance − Current Rank, scored by the shared verdict
  // thresholds (lib/expectation.ts) so the admin Player Manager's
  // Expected-Rank-vs-Set-Rank verdicts can never drift from these. Only
  // meaningful when the player has a Current Rank to compare against.
  const expectationColumn = <T extends { uname: string; performance: number }>(): Column<T> => ({
    key: 'expectation',
    label: 'Expectation',
    title: 'Performance − Current Rank',
    className: 'border-r border-border min-w-[110px]',
    accessor: (r) => {
      const rank = rankOf(r.uname);
      return rank === null ? -Infinity : r.performance - rank;
    },
    render: (r) => {
      const rank = rankOf(r.uname);
      if (rank === null) return '—';
      return <ExpectationBadge label={expectationFromDiff(r.performance - rank)} />;
    },
  });

  if (stats.mode === 'Erumode') {
    const columns: Column<ErumodeGuessRow>[] = [
      tierColumn<ErumodeGuessRow>(),
      {
        key: 'uname',
        label: 'Player',
        accessor: (r) => r.uname.toLowerCase(),
        render: nameRender,
      },
      rankColumn<ErumodeGuessRow>(),
      performanceColumn<ErumodeGuessRow>(),
      expectationColumn<ErumodeGuessRow>(),
      {
        key: 'guessRate',
        label: 'Guess Rate',
        accessor: (r) => r.guessRate,
        render: (r) => <span className="text-accent">{pct(r.guessRate)}</span>,
      },
      ...stats.activeTypes.map((t) => ({
        key: `type:${t}`,
        label: answerTypeLabel(t),
        accessor: (r: ErumodeGuessRow) => r.perType[t] ?? 0,
        render: (r: ErumodeGuessRow) => <span className="text-textSub">{pct(r.perType[t] ?? 0)}</span>,
      })),
      { key: 'rigGr', label: 'Rig GR', className: 'border-l border-border', accessor: (r) => r.rigGr, render: (r) => <span className="text-textSub">{pct(r.rigGr)}</span> },
      { key: 'rigCount', label: 'Rig Count', className: 'border-r border-border', accessor: (r) => r.rigCount, render: (r) => r.rigCount },
      { key: 'songs', label: 'Songs', accessor: (r) => r.songs, render: (r) => r.songs },
      { key: 'games', label: 'Games', accessor: (r) => r.games, render: (r) => r.games },
    ];
    return (
      <GenericSortableTable
        columns={columns}
        rows={stats.erumodeRows}
        minWidth={780 + stats.activeTypes.length * 90}
        defaultSortKey="guessRate"
        rowTier={(r) => tierOf(r.uname)}
      />
    );
  }

  const columns: Column<NgmcGuessRow>[] = [
    tierColumn<NgmcGuessRow>(),
    {
      key: 'uname',
      label: 'Player',
      accessor: (r) => r.uname.toLowerCase(),
      render: nameRender,
    },
    rankColumn<NgmcGuessRow>(),
    performanceColumn<NgmcGuessRow>(),
    expectationColumn<NgmcGuessRow>(),
    {
      key: 'guessRate',
      label: 'Guess Rate',
      accessor: (r) => r.guessRate,
      render: (r) => <span className="text-accent">{pct(r.guessRate)}</span>,
    },
    {
      key: 'avgDiff',
      label: 'Avg Diff',
      title: 'Average CorrectPercentage of songs they got right',
      accessor: (r) => r.avgDiff,
      render: (r) => num(r.avgDiff),
    },
    {
      key: 'erigs',
      label: 'Erigs',
      title: 'Songs only they got right',
      accessor: (r) => r.erigs,
      render: (r) => r.erigs,
    },
    {
      key: 'avgOf8',
      label: 'Avg /8',
      title: 'Average # of people who also got their correct songs',
      accessor: (r) => r.avgOf8,
      render: (r) => num(r.avgOf8),
    },
    { key: 'opGr', label: 'OP GR', accessor: (r) => r.opGr, render: (r) => pct(r.opGr) },
    { key: 'edGr', label: 'ED GR', accessor: (r) => r.edGr, render: (r) => pct(r.edGr) },
    { key: 'insGr', label: 'INS GR', accessor: (r) => r.insGr, render: (r) => pct(r.insGr) },
    {
      key: 'rigGr',
      label: 'Rig GR',
      title: '% of their on-list guesses that were correct',
      className: 'border-l border-border',
      accessor: (r) => r.rigGr,
      render: (r) => pct(r.rigGr),
    },
    { key: 'rigCount', label: 'Rig Count', className: 'border-r border-border', accessor: (r) => r.rigCount, render: (r) => r.rigCount },
    {
      key: 'offlistGr',
      label: 'Offlist GR',
      title: '% correct among guesses not on their pre-made list',
      accessor: (r) => r.offlistGr,
      render: (r) => pct(r.offlistGr),
    },
    { key: 'correct', label: 'Correct', accessor: (r) => r.correct, render: (r) => r.correct },
    { key: 'songs', label: 'Songs', accessor: (r) => r.songs, render: (r) => r.songs },
    { key: 'games', label: 'Games', accessor: (r) => r.games, render: (r) => r.games },
  ];
  return (
    <GenericSortableTable
      columns={columns}
      rows={stats.ngmcRows}
      minWidth={1100}
      defaultSortKey="guessRate"
      rowTier={(r) => tierOf(r.uname)}
    />
  );
}