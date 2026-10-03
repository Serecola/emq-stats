'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  compareValues,
  DENSE_CELL_PAD,
  percentHeat,
  SortableHeader,
  toggleSort,
  type SortDir,
} from '@/components/SortableTable';
import ExpectationBadge from '@/components/ExpectationBadge';
import PlayerTagBadge from '@/components/PlayerTagBadge';
import type { PlayerTagOverrides } from '@/lib/player-tags';
import type { ErumodeSplitStats, PlayerSummary } from '@/lib/player-stats';
import type { PlayerRankRow } from '@/lib/player-ranks';
import type { Mode, Submode } from '@/lib/types';

/**
 * One row of the public players list: the player's numbers over the range on
 * screen, plus their all-time tournament count so a trimmed row can read
 * "5 / 12" instead of quietly dropping the older tournaments behind the range.
 *
 * `rank` is the same cached row the admin Player Manager renders (see
 * listPlayerRankRows) — read-only here, since Set Rank is the admin's to edit,
 * but joined by normalized name so the two views can never disagree about a
 * player's Winrate, Expected Rank or Expectation. `split` is the Erumode-only
 * pooled guess figures (see erumodeSplitStats); both are null when the player
 * has no row in this sub-mode, and the cells print "—" rather than guessing.
 */
export interface PlayerRow {
  player: PlayerSummary;
  allTimeTournaments: number;
  rank: PlayerRankRow | null;
  split: ErumodeSplitStats | null;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * The Erumode split guess-rate columns: a fixed set of five answer types
 * rather than the match Guess Rate table's "whatever this tournament ran", so
 * the list keeps the same shape from event to event. Labels and hover titles
 * mirror ANSWER_TYPE_LABELS / ANSWER_TYPE_NAMES in components/GuessRateTable.tsx
 * (same wording, so VN here and VN there mean the same number).
 */
const SPLIT_TYPES: { type: string; label: string; title: string }[] = [
  { type: 'Mst', label: 'VN', title: 'Main title guess rate' },
  { type: 'A', label: 'Artist', title: 'Artist guess rate' },
  { type: 'Mt', label: 'Song', title: 'Song name guess rate' },
  { type: 'Developer', label: 'Dev', title: 'Developer guess rate' },
  { type: 'Composer', label: 'Comp', title: 'Composer guess rate' },
];

/**
 * How many rates get a medal. Every rate column in the Erumode block flags its
 * best three this way rather than shading every cell — see MEDAL_CLASSES.
 */
const MEDAL_COUNT = 3;

/**
 * Gold, silver, bronze for the best three, as cell classes. Gold is the
 * palette's own accent, so the top rate reads like every other "best" in the
 * app; silver and bronze are their own tokens (tailwind.config.ts). Ties are
 * broken by name, so each medal has exactly one owner.
 */
const MEDAL_CLASSES = [
  'bg-accent/15 font-medium text-accent',
  'bg-silver/15 font-medium text-silver',
  'bg-bronze/15 font-medium text-bronze',
];

/**
 * The rate columns that medal their best three, each with the accessor that
 * reads it: the five answer types plus the two rig figures. One list, so the
 * columns and the medals they draw can never fall out of step.
 */
const MEDALLED_RATES: { key: string; value: (row: PlayerRow) => number | undefined }[] = [
  ...SPLIT_TYPES.map((t) => ({
    key: t.type,
    value: (row: PlayerRow) => row.split?.perType[t.type],
  })),
  { key: 'rigGr', value: (row) => row.split?.rigGr ?? undefined },
  { key: 'offlistGr', value: (row) => row.split?.offlistGr ?? undefined },
];

interface Column {
  key: string;
  label: string;
  title?: string;
  accessor: (row: PlayerRow) => number | string;
  render: (row: PlayerRow) => React.ReactNode;
  /** Extra body-cell classes: text colour and the group-separating border. */
  className?: string;
  /**
   * Per-cell inline background, for the columns that read better shaded than
   * printed (see percentHeat) — the same tint the admin table gives the same
   * number, so a green WR means the same thing on both pages. The rate columns
   * don't use it: they medal their best three instead (see MEDAL_CLASSES).
   */
  cellStyle?: (row: PlayerRow) => CSSProperties | undefined;
  /**
   * Per-cell classes, for the columns that mark individual rows out rather than
   * shading every figure — the rate columns hand gold, silver and bronze to
   * their best three (see MEDAL_CLASSES).
   */
  cellClassName?: (row: PlayerRow) => string;
  /** Body-cell tooltip that varies per row — the Tours "last 5 of 12" hint. */
  cellTitle?: (row: PlayerRow) => string;
}

/**
 * The public players list table: one row per player who has played the selected
 * gamemode + sub-mode, with their numbers over the range on screen plus the
 * ladder figures joined from the admin rows.
 *
 * Every header sorts the list on click, using the same client-side machinery as
 * the admin Player Manager (SortableHeader / toggleSort / compareValues), and
 * the list opens on Set Rank descending — the highest number down, with anyone
 * the admin hasn't ranked yet parked at the bottom.
 *
 * Header labels are the short forms (Tours, WR, GR, Comp, Off GR) because the
 * Erumode view carries a lot of columns; each header's hover title spells the
 * label out, and every header stays on one line. The row is set small on
 * purpose — 0.65rem headers, xs figures, halved side padding — because fifteen
 * columns of short numbers leave nothing to gain from generous type, and the
 * width saved is width the figures get instead.
 */
export default function PlayerListTable({
  players,
  mode,
  submode,
  filterLabel,
  tags,
  playerQuery,
}: {
  players: PlayerRow[];
  mode: Mode;
  submode: Submode;
  /** "Erumode Normal" — how the Tours tooltip names the selection. */
  filterLabel: string;
  /** Stored Player/Bot tag decisions for the name cell's badge. */
  tags?: PlayerTagOverrides;
  /** Query the player name links carry (mode + sub-mode + range). */
  playerQuery: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>('setRank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Collapsed VN group for Erumode Normal — same Mst-only figures as the
  // Player Manager's VN columns. One "VN ▸ / ▾" toggle header that expands
  // into VN Guess Rate + VN Expected Rank; a plain <th> so it never sorts.
  const showVn = mode === 'Erumode' && submode === 'Normal';
  const [vnOpen, setVnOpen] = useState(false);

  // VN-only (Mst) figures over the same range the row's other stats use:
  // rank-row values when the player has a ladder row, else the sliced
  // aggregate straight from the entries. Null when no Mst was measured.
  const vnGrOf = (r: PlayerRow): number | null =>
    isErumode ? (r.rank?.vnGuessRate ?? r.player.erumode.vnGuessRate) : null;
  const vnExpOf = (r: PlayerRow): number | null =>
    isErumode ? (r.rank?.vnExpectedRank ?? r.player.erumode.vnExpectedRank) : null;
  const isErumode = mode === 'Erumode';

  // A cell with no figure over the range sorts last in *both* directions —
  // parked at Infinity ascending and -Infinity descending, the admin table's
  // trick — so "who is missing a number" never floats to the top.
  const missing = () => (sortDir === 'asc' ? Infinity : -Infinity);

  // The Guess Rate on display is whichever half of the aggregate this sub-mode
  // is: the two modes' rates aren't comparable, so only one is ever shown.
  const grOf = (r: PlayerRow): number | null => {
    const aggregate = isErumode ? r.player.erumode : r.player.ngmc;
    return aggregate.matchesPlayed > 0 ? aggregate.overallGuessRate : null;
  };

  // Each rate's best three take gold, silver and bronze instead of the column
  // being shaded: with five answer types plus two rig figures side by side,
  // gradients read as one wall of colour, and the top of a column is what
  // anyone actually looks for. Players with no guesses of a rate — or a 0%
  // there — are skipped, so a rate nobody answered correctly medals nobody
  // rather than handing gold to a zero. Ties are broken by name, so a medal
  // stays on the same player however the list is sorted.
  const medals = new Map<string, Map<string, string>>();
  if (isErumode) {
    for (const rate of MEDALLED_RATES) {
      const ranked = players
        .filter((r) => (rate.value(r) ?? 0) > 0)
        .sort(
          (a, b) =>
            (rate.value(b) ?? 0) - (rate.value(a) ?? 0) ||
            a.player.uname.localeCompare(b.player.uname)
        );
      medals.set(
        rate.key,
        new Map(
          ranked
            .slice(0, MEDAL_COUNT)
            .map((r, i) => [r.player.uname, MEDAL_CLASSES[i]] as [string, string])
        )
      );
    }
  }

  /** The medal this player earned in this rate column, as a cell class. */
  const medalFor = (key: string, row: PlayerRow) => medals.get(key)?.get(row.player.uname) ?? '';

  const columns: Column[] = [
    {
      key: 'uname',
      label: 'Player',
      accessor: (r) => r.player.uname.toLowerCase(),
      render: (r) => (
        <>
          <Link
            href={`/players/${encodeURIComponent(r.player.uname)}${playerQuery}`}
            className="font-medium hover:underline"
          >
            {r.player.uname}
          </Link>
          <PlayerTagBadge uname={r.player.uname} overrides={tags} className="ml-1.5" />
        </>
      ),
    },
    // The ladder trio rides straight behind the name: it describes the player
    // rather than the range on screen, and it's the first thing anyone scans a
    // row for. Set Rank leads, the figure it is measured against follows, and a
    // left border fences the group off from the name as in the Player Manager.
    // All three are read-only here — Set Rank is the admin's to edit.
    {
      key: 'setRank',
      label: 'Set Rank',
      title: `Admin-assigned rank for ${mode} ${submode} — read-only here, edit it in the Player Manager`,
      className: 'border-l border-border',
      // Unset ranks sort last (up from Infinity, down from -Infinity) instead
      // of being treated as 0.
      accessor: (r) => r.rank?.setRank ?? missing(),
      render: (r) =>
        r.rank?.setRank == null ? (
          <span className="text-textDim">—</span>
        ) : (
          <span className="font-medium text-textSub">{r.rank.setRank}</span>
        ),
    },
    {
      // Shortened to fit beside Set Rank; the hover title still spells it out.
      key: 'expectedRank',
      label: 'Exp. Rank',
      title: `Expected Rank — songs-weighted ${mode} ${submode} Performance across their tournaments`,
      accessor: (r) => r.rank?.expectedRank ?? missing(),
      render: (r) =>
        r.rank ? (
          <span className="font-medium text-textSub">{r.rank.expectedRank.toFixed(2)}</span>
        ) : (
          <span className="text-textDim">—</span>
        ),
    },
    {
      key: 'expectation',
      label: 'Expectation',
      title: 'Exp. Rank − Set Rank',
      className: 'border-l border-border',
      accessor: (r) => r.rank?.diff ?? missing(),
      render: (r) =>
        r.rank?.expectation ? (
          <ExpectationBadge label={r.rank.expectation} />
        ) : (
          <span className="text-textDim">—</span>
        ),
    },
    {
      key: 'matchesPlayed',
      label: 'Tours',
      title: `Tournaments in ${mode} ${submode} — the range above decides how many`,
      accessor: (r) => r.player.matchesPlayed,
      cellTitle: (r) =>
        r.allTimeTournaments > r.player.matchesPlayed
          ? `Last ${r.player.matchesPlayed} of ${r.allTimeTournaments} tournaments`
          : `${r.player.matchesPlayed} tournament${r.player.matchesPlayed !== 1 ? 's' : ''} in ${filterLabel}`,
      // A trimmed row keeps its all-time count visible, so "5 / 12" is honest
      // about the older tournaments sitting behind the range.
      render: (r) =>
        r.allTimeTournaments > r.player.matchesPlayed ? (
          <>
            {r.player.matchesPlayed}
            <span className="opacity-60">/{r.allTimeTournaments}</span>
          </>
        ) : (
          r.player.matchesPlayed
        ),
    },
    {
      key: 'winRate',
      label: 'WR',
      // Stated on the header so the scoring doesn't have to be guessed at: a win
      // is a point, a tie half, a loss nothing, over the games played.
      title: `Winrate over the games they played — 1 point a win, 0.5 a tie, 0 a loss (${mode} ${submode}, the range above decides how many)`,
      accessor: (r) => r.rank?.winRate ?? missing(),
      cellStyle: (r) => percentHeat(r.rank?.winRate ?? null),
      render: (r) =>
        r.rank?.winRate == null ? (
          <span className="text-textDim">—</span>
        ) : (
          <span
            className="text-textSub"
            title={`${r.rank.record.wins}W ${r.rank.record.ties}T ${r.rank.record.losses}L over ${
              r.rank.record.games
            } game${r.rank.record.games !== 1 ? 's' : ''}`}
          >
            {pct(r.rank.winRate)}
          </span>
        ),
    },
    {
      key: 'guessRate',
      label: 'GR',
      title: `Guess Rate — the share of their guesses that were correct in ${mode} ${submode}`,
      accessor: (r) => grOf(r) ?? missing(),
      cellStyle: (r) => percentHeat(grOf(r)),
      render: (r) => {
        const gr = grOf(r);
        return gr === null ? (
          <span className="text-textDim">—</span>
        ) : (
          <span className="text-accent">{pct(gr)}</span>
        );
      },
    },
  ];

  // Erumode's split guess figures: the five answer-type rates plus the rig
  // figures behind them. NGMC has no answer types and no lists at all, so none
  // of these columns exist there.
  if (isErumode) {
    columns.push(
      ...SPLIT_TYPES.map<Column>((t) => ({
        key: `split-${t.type}`,
        label: t.label,
        title: `${t.title} — % of guesses of this answer type that were correct (gold, silver and bronze go to the best three)`,
        accessor: (r) => r.split?.perType[t.type] ?? missing(),
        // No heat here: the medal says more than a shade across five columns
        // that would otherwise all look alike.
        cellClassName: (r) => medalFor(t.type, r),
        render: (r) => {
          const value = r.split?.perType[t.type];
          return value === undefined ? <span className="text-textDim">—</span> : pct(value);
        },
      })),
      {
        key: 'avgRig',
        label: 'Avg Rig',
        title: 'Mean on-list (rig) guesses per tournament over the range',
        accessor: (r) => r.split?.avgRig ?? missing(),
        render: (r) => {
          const value = r.split?.avgRig;
          return value == null ? <span className="text-textDim">—</span> : value.toFixed(1);
        },
      },
      {
        key: 'rigGr',
        label: 'Rig GR',
        title: '% of on-list (rig) guesses that were correct (gold, silver and bronze go to the best three)',
        accessor: (r) => r.split?.rigGr ?? missing(),
        // Medalled like the answer types, not shaded: it is the same kind of
        // number and should be read the same way.
        cellClassName: (r) => medalFor('rigGr', r),
        render: (r) => {
          const value = r.split?.rigGr;
          return value == null ? <span className="text-textDim">—</span> : pct(value);
        },
      },
      {
        key: 'offlistGr',
        // Short enough to sit on one line beside Rig GR; the hover title still
        // spells the metric out.
        label: 'Off GR',
        title: '% of off-list guesses that were correct (gold, silver and bronze go to the best three)',
        accessor: (r) => r.split?.offlistGr ?? missing(),
        cellClassName: (r) => medalFor('offlistGr', r),
        render: (r) => {
          const value = r.split?.offlistGr;
          return value == null ? <span className="text-textDim">—</span> : pct(value);
        },
      },
      // Collapsed VN group for Erumode Normal: Mst answers only, pooled over
      // the same range as every other figure (songs-weighted VN Guess Rate,
      // songs-weighted mean of each tournament's VN-only Performance).
      ...(showVn && vnOpen
        ? [
            {
              key: 'vnGuessRate',
              label: 'VN GR',
              title: 'VN Guess Rate — Mst (main-title) answers only, pooled songs-weighted over the same range',
              accessor: (r: PlayerRow) => vnGrOf(r) ?? missing(),
              cellStyle: (r: PlayerRow) => percentHeat(vnGrOf(r)),
              render: (r: PlayerRow) => {
                const gr = vnGrOf(r);
                return gr == null ? <span className="text-textDim">—</span> : pct(gr);
              },
            } as Column,
            {
              key: 'vnExpectedRank',
              label: 'VN Exp',
              title: 'VN Expected Rank — songs-weighted mean of each tournament\u2019s VN-only Performance (same rating curve, Mst rate in)',
              accessor: (r: PlayerRow) => vnExpOf(r) ?? missing(),
              render: (r: PlayerRow) => {
                const exp = vnExpOf(r);
                return exp == null ? <span className="text-textDim">—</span> : exp.toFixed(2);
              },
            } as Column,
          ]
        : []),
    );
  }

  // Attacks and blocks only exist in NGMC exports, so those columns only make
  // sense inside an NGMC sub-mode. They sit last, after the ladder columns,
  // because nothing else in the table is a count of things done to other
  // players.
  if (!isErumode) {
    columns.push(
      {
        key: 'attacks',
        label: 'Attacks',
        title: 'Songs taken from other players (with the effective count behind it)',
        accessor: (r) => r.player.ngmc.totalTaken,
        render: (r) => (
          <>
            <span className="font-medium text-taken">{r.player.ngmc.totalTaken}</span>
            <span className="opacity-60">/{r.player.ngmc.totalEffTaken}</span>
          </>
        ),
      },
      {
        key: 'blocks',
        label: 'Blocks',
        title: 'Songs defended against other players (with the effective count behind it)',
        accessor: (r) => r.player.ngmc.totalBlocked,
        render: (r) => (
          <>
            <span className="font-medium text-blocked">{r.player.ngmc.totalBlocked}</span>
            <span className="opacity-60">/{r.player.ngmc.totalEffBlocked}</span>
          </>
        ),
      }
    );
  }

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', setSortKey, setSortDir);
  }

  // The table opens on Set Rank descending (see the state above), so this only
  // has to re-sort when a header is clicked.
  const activeColumn = columns.find((c) => c.key === sortKey) ?? null;
  const sorted =
    sortKey === null || !activeColumn
      ? players
      : [...players].sort((a, b) =>
          compareValues(activeColumn.accessor(a), activeColumn.accessor(b), sortDir)
        );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {/* No fixed floor under the columns: without one they shrink to their
          content, so the table scales down with the viewport instead of forcing
          a horizontal scrollbar — which is what lets the wide Erumode column
          set fit a laptop screen, and a phone below that. The type steps down
          under `sm` on top of that (a smaller grid needs less width), and the
          wrapper keeps its own `overflow-x-auto` as the fallback for the point
          the numbers themselves can't compress any further. */}
      <table className="w-full border-collapse text-[0.7rem] sm:text-xs">
        <thead>
          <tr className="border-b border-border bg-surfaceAlt text-left text-[0.6rem] uppercase tracking-wide text-textMuted sm:text-[0.65rem]">
            {columns.map((c) => (
              <SortableHeader
                key={c.key}
                label={c.label}
                sortKey={c.key}
                activeKey={sortKey}
                dir={sortDir}
                onClick={onSort}
                title={c.title}
                align={c.key === 'uname' ? 'left' : 'right'}
                pad={DENSE_CELL_PAD}
              />
            ))}
            {showVn && (
              <th
                key="vn-toggle"
                title={vnOpen ? 'Collapse VN columns' : 'Expand: VN Guess Rate + VN Expected Rank (Mst answers only)'}
                className={`cursor-pointer select-none whitespace-nowrap ${DENSE_CELL_PAD} text-right font-medium hover:text-textSub`}
                onClick={() => {
                  if (vnOpen && (sortKey === 'vnGuessRate' || sortKey === 'vnExpectedRank')) {
                    setSortKey('setRank');
                    setSortDir('desc');
                  }
                  setVnOpen((v) => !v);
                }}
              >
                <span className="inline-flex items-center gap-0.5">
                  VN
                  <span className="w-2 text-[0.6rem] text-textDim">{vnOpen ? '▾' : '▸'}</span>
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.player.uname}
              className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={c.cellStyle?.(r)}
                  title={c.cellTitle?.(r)}
                  className={`${DENSE_CELL_PAD} ${
                    c.key === 'uname'
                      ? 'whitespace-nowrap font-medium'
                      : `text-right text-textMuted ${c.className ?? ''} ${c.cellClassName?.(r) ?? ''}`
                  }`}
                >
                  {c.render(r)}
                </td>
              ))}
              {showVn && !vnOpen && (
                <td
                  key="vn-collapsed"
                  className={`${DENSE_CELL_PAD} text-right text-textDim`}
                  title="Expand VN for VN Guess Rate + VN Expected Rank (Mst answers only)"
                >
                  —
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
