'use client';

import { useState, type CSSProperties } from 'react';
import type { ErumodeGuessRow, GuessRateStats, NgmcGuessRow } from '@/lib/guess-stats';
import type { PlayerTag, Team } from '@/lib/types';
import { expectationFromDiff } from '@/lib/expectation';
import { teamColor } from '@/lib/team-colors';
import { TABLE_ROW_CLASS } from '@/lib/table-row';
import ColumnVisibilityMenu from './ColumnVisibilityMenu';
import ExpectationBadge from './ExpectationBadge';
import PlayerTagBadge from './PlayerTagBadge';
import { SortableHeader, toggleSort, compareValues, DENSE_CELL_PAD, STATS_BODY_TEXT, STATS_HEADER_TEXT, type SortDir } from './SortableTable';

const norm = (s: string) => s.toLowerCase().trim();

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function num(n: number): string {
  return n.toFixed(2);
}

// Display labels for Erumode answer-type columns — internal keys (matching
// the raw JSON's AnsType strings) stay as-is; only the header text changes.
// The long staff credits are abbreviated so a tournament with several active
// answer types doesn't push the table out to ~1500px; answerTypeTitle keeps
// the full name available on hover.
const ANSWER_TYPE_LABELS: Record<string, string> = {
  Mst: 'VN',
  A: 'Artist',
  Mt: 'SN',
  Developer: 'Dev',
  Composer: 'Comp',
  Arranger: 'Arr',
  Lyricist: 'Lyr',
};
function answerTypeLabel(t: string): string {
  return ANSWER_TYPE_LABELS[t] ?? t;
}
// Full wording behind a short header, for its hover title. Only the types
// whose label is an initialism need one — Rigger, Developer, Composer,
// Arranger and Lyricist already read as themselves.
const ANSWER_TYPE_NAMES: Record<string, string> = {
  Mst: 'Main title',
  A: 'Artist',
  Mt: 'Song name',
};
function answerTypeTitle(t: string): string {
  return `${ANSWER_TYPE_NAMES[t] ?? t} guess rate`;
}

// Subtle per-tier row tints — T1..T4 only; anything beyond that (or
// players not on any team) gets no tint. Theme-aware: the hue comes from the
// team's own variable and the alpha stays faint, so the wash reads on white
// and on the dark surfaces alike.
const TIER_BG: Record<number, string> = {
  1: 'rgb(var(--taken) / 0.07)',
  2: 'rgb(var(--accent) / 0.10)',
  3: 'rgb(var(--blocked) / 0.07)',
  4: 'rgb(var(--promote) / 0.08)',
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
  defaultSortKey,
  defaultSortDir = 'desc',
  rowTier,
}: {
  columns: Column<T>[];
  rows: T[];
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  rowTier?: (row: T) => number | null;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  // Columns folded away with the toolbar's Columns popup — session view state
  // like the sort. The player name column is never offered: without it the
  // rows lose the one cell that says whose numbers these are.
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', setSortKey, setSortDir);
  }

  /** The popup's checkbox: fold one column in or out of the drawn set. */
  function toggleCol(key: string) {
    const hiding = !hiddenCols.has(key);
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Hiding the sorted column would leave the order with no visible arrow —
    // park back on the table's own default sort, the same reset the players
    // list performs when its sorted column disappears.
    if (hiding && sortKey === key) {
      setSortKey(defaultSortKey ?? null);
      setSortDir(defaultSortDir);
    }
  }

  const activeColumn = columns.find((c) => c.key === sortKey);
  const sortedRows = activeColumn
    ? [...rows].sort((a, b) => compareValues(activeColumn.accessor(a), activeColumn.accessor(b), sortDir))
    : rows;

  // What the table draws: every column minus the folded-away ones. The header
  // map, the body map and the empty-state colSpan all walk this list, so they
  // can't disagree about how wide the grid is.
  const shown = columns.filter((c) => !hiddenCols.has(c.key));
  const hideable = columns
    .filter((c) => c.key !== 'uname')
    .map((c) => ({ key: c.key, label: c.label }));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {/* The Columns popup sits over the table's top right, the same corner
          the players list gives its search — the panel itself is
          fixed-positioned (see ColumnVisibilityMenu) so this card's own
          horizontal scroll can't clip it. */}
      <div className="flex items-center justify-end border-b border-border px-2 py-2">
        <ColumnVisibilityMenu
          items={hideable}
          hidden={hiddenCols}
          onToggle={toggleCol}
          onShowAll={() => setHiddenCols(new Set())}
        />
      </div>
      {/* Dense type: the body sits just under the app's text-sm and the header
          just under that, so ~20 narrow stat columns stay legible without the
          rows growing taller — see STATS_BODY_TEXT / STATS_HEADER_TEXT. Those
          sizes and DENSE_CELL_PAD all tighten under `sm`, and the table carries
          no fixed min-width, so a narrower screen scales the grid down instead
          of forcing a horizontal scrollbar; the wrapper's `overflow-x-auto` is
          the fallback past the point the columns can't compress any further.
          The width goes with the columns, as on the players list: with every
          column shown the table fills the card, but `w-full` would hand the
          width of each folded-away column to the survivors and drift them
          apart — so once anything is hidden it drops to its content width and
          packs left instead. */}
      <table
        className={`border-collapse ${hiddenCols.size ? 'w-auto' : 'w-full'} ${STATS_BODY_TEXT}`}
      >
        <thead>
          <tr className={`border-b border-border bg-surfaceAlt text-left uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}>
            {shown.map((c) => (
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
                pad={DENSE_CELL_PAD}
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
            // The tier tint rides on a CSS variable rather than straight into
            // `style.backgroundColor`: an inline background-color outranks any
            // :hover class, so an inline tint used to keep the row's wash from
            // ever showing — tinted rows highlighted nowhere. As a class,
            // TABLE_ROW_CLASS's hover simply takes over while the pointer is
            // on the row, and the text-colour wash deepens the tint in both
            // themes (a `brightness-125` over a white page would push it the
            // wrong way, which is why the hover is a wash at all).
            return (
              <tr
                key={row.uname}
                style={bg ? ({ '--row-tint': bg } as CSSProperties) : undefined}
                className={`${TABLE_ROW_CLASS}${bg ? ' bg-[var(--row-tint)]' : ''}`}
              >
                {shown.map((c) => (
                  <td
                    key={c.key}
                    className={`${DENSE_CELL_PAD} ${c.key === 'uname' ? 'font-medium' : 'text-right text-textMuted tabular-nums'} ${
                      hoveredCol === c.key ? 'bg-text/5' : ''
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
              <td colSpan={shown.length} className="px-3 py-8 text-center text-sm text-textMuted">
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
      <PlayerTagBadge uname={r.uname} overrides={playerTags} className="ml-1.5" />
    </span>
  );

  const tierColumn = <T extends { uname: string }>(): Column<T> => ({
    key: 'tier',
    label: 'Tier',
    title: 'Tier — roster position within their team (1st listed = T1)',
    accessor: (r) => tierOf(r.uname) ?? Infinity,
    render: (r) => {
      const t = tierOf(r.uname);
      return t !== null ? `T${t}` : '—';
    },
  });
  const rankColumn = <T extends { uname: string }>(): Column<T> => ({
    key: 'rank',
    label: 'Rank',
    title: 'Current Rank — the number parsed from the "(N)" next to their name in the roster',
    accessor: (r) => rankOf(r.uname) ?? Infinity,
    render: (r) => rankOf(r.uname) ?? '—',
  });

  const performanceColumn = <T extends { uname: string; performance: number }>(): Column<T> => ({
    key: 'performance',
    label: 'Perf',
    title: 'Performance — computed rating for cross-tournament comparison',
    accessor: (r) => r.performance,
    render: (r) => <span className="font-medium text-textSub">{r.performance.toFixed(2)}</span>,
  });

  // Expectation = Performance − Current Rank, scored by the shared verdict
  // thresholds (lib/expectation.ts) so the admin Player Manager's
  // Expected-Rank-vs-Set-Rank verdicts can never drift from these. Only
  // meaningful when the player has a Current Rank to compare against.
  const expectationColumn = <T extends { uname: string; performance: number }>(): Column<T> => ({
    key: 'expectation',
    label: 'Expect.',
    title: 'Expectation — Performance − Current Rank',
    className: 'border-r border-border',
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

  // Off-list guess rate. Shared by both mode tables — lib/guess-stats.ts
  // derives it the same way for each (correct off-list hits over off-list
  // opportunities), so the column reads identically in either.
  const offlistGrColumn = <T extends { offlistGr: number }>(): Column<T> => ({
    key: 'offlistGr',
    label: 'Off GR',
    title: 'Offlist GR — % correct among guesses not on their list',
    accessor: (r) => r.offlistGr,
    render: (r) => pct(r.offlistGr),
  });

  // Trailing count columns, shared so their short labels and their tooltips
  // can't drift apart between the NGMC and Erumode tables.
  const rigCountColumn = <T extends { rigCount: number; songs: number }>(): Column<T> => ({
    key: 'rigCount',
    label: 'Rigs',
    title:
      'Rig Count — total guesses that were on their list; the percentage is that count over the songs they played',
    className: 'border-r border-border',
    accessor: (r) => r.rigCount,
    // The count with its share of the player's songs beside it — 26 (20.3%) —
    // so the density reads without eyeing the Songs column next door. rigCount
    // is per song (see computeGuessRateStats), so the ratio can't pass 100%;
    // a player with no songs has no percentage to divide into, so the count
    // stands alone there.
    render: (r) =>
      r.songs > 0 ? `${r.rigCount} (${pct((100 * r.rigCount) / r.songs)})` : `${r.rigCount}`,
  });
  const songsColumn = <T extends { songs: number }>(): Column<T> => ({
    key: 'songs',
    label: 'Songs',
    accessor: (r) => r.songs,
    render: (r) => r.songs,
  });
  const gamesColumn = <T extends { games: number }>(): Column<T> => ({
    key: 'games',
    label: 'Games',
    title: 'Games — number of game files their stats come from',
    accessor: (r) => r.games,
    render: (r) => r.games,
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
        label: 'GR',
        title: 'Guess Rate — % of their guesses that were correct',
        accessor: (r) => r.guessRate,
        render: (r) => <span className="text-accent">{pct(r.guessRate)}</span>,
      },
      ...stats.activeTypes.map((t) => ({
        key: `type:${t}`,
        label: answerTypeLabel(t),
        title: answerTypeTitle(t),
        accessor: (r: ErumodeGuessRow) => r.perType[t] ?? 0,
        render: (r: ErumodeGuessRow) => <span className="text-textSub">{pct(r.perType[t] ?? 0)}</span>,
      })),
      { key: 'rigGr', label: 'Rig GR', className: 'border-l border-border', accessor: (r) => r.rigGr, render: (r) => <span className="text-textSub">{pct(r.rigGr)}</span> },
      offlistGrColumn<ErumodeGuessRow>(),
      rigCountColumn<ErumodeGuessRow>(),
      songsColumn<ErumodeGuessRow>(),
      gamesColumn<ErumodeGuessRow>(),
    ];
    return (
      <GenericSortableTable
        columns={columns}
        rows={stats.erumodeRows}
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
      label: 'GR',
      title: 'Guess Rate — % of their guesses that were correct',
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
    offlistGrColumn<NgmcGuessRow>(),
    rigCountColumn<NgmcGuessRow>(),
    { key: 'correct', label: 'Correct', accessor: (r) => r.correct, render: (r) => r.correct },
    songsColumn<NgmcGuessRow>(),
    gamesColumn<NgmcGuessRow>(),
  ];
  return (
    <GenericSortableTable
      columns={columns}
      rows={stats.ngmcRows}
      defaultSortKey="guessRate"
      rowTier={(r) => tierOf(r.uname)}
    />
  );
}