'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  compareValues,
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
 * How many of each answer type's rates get picked out. The five split columns
 * carry no heat shading — see the column definitions — so this is what makes
 * their leaders visible.
 */
const SPLIT_TOP_MARK = 3;

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
   * number, so a green WR means the same thing on both pages.
   */
  cellStyle?: (row: PlayerRow) => CSSProperties | undefined;
  /**
   * Per-cell classes, for the columns that mark individual rows out rather than
   * shading every figure — the answer-type columns flag their best three.
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
 * the admin Player Manager (SortableHeader / toggleSort / compareValues).
 * Nothing is sorted until a header is clicked, so the list still opens in the
 * order the data arrives in, exactly as it did before the columns became
 * clickable.
 *
 * Header labels are the short forms (Tours, WR, GR, Comp) because the Erumode
 * view carries a lot of columns; each header's hover title spells the label out.
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
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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

  // The answer-type columns flag their leaders instead of shading every cell:
  // the three best rates in each type. Players with no guesses of a type — or a
  // 0% there — are skipped, so a type nobody answered correctly marks nobody
  // rather than handing the top spot to a zero. Ties are broken by name, so the
  // flagged three stay the same however the list is sorted.
  const splitLeaders = new Map<string, Set<string>>();
  if (isErumode) {
    for (const t of SPLIT_TYPES) {
      const ranked = players
        .filter((r) => (r.split?.perType[t.type] ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.split?.perType[t.type] ?? 0) - (a.split?.perType[t.type] ?? 0) ||
            a.player.uname.localeCompare(b.player.uname)
        );
      splitLeaders.set(
        t.type,
        new Set(ranked.slice(0, SPLIT_TOP_MARK).map((r) => r.player.uname))
      );
    }
  }

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
        title: `${t.title} — % of guesses of this answer type that were correct (the three best are marked)`,
        accessor: (r) => r.split?.perType[t.type] ?? missing(),
        // No heat shading here: five shaded columns side by side read as one
        // wall of colour, so each type only marks its own best three rates.
        cellClassName: (r) =>
          splitLeaders.get(t.type)?.has(r.player.uname)
            ? 'bg-accent/15 font-medium text-accent'
            : '',
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
        title: '% of on-list (rig) guesses that were correct',
        accessor: (r) => r.split?.rigGr ?? missing(),
        cellStyle: (r) => percentHeat(r.split?.rigGr ?? null),
        render: (r) => {
          const value = r.split?.rigGr;
          return value == null ? <span className="text-textDim">—</span> : pct(value);
        },
      },
      {
        key: 'offlistGr',
        label: 'Offlist GR',
        title: '% of off-list guesses that were correct',
        accessor: (r) => r.split?.offlistGr ?? missing(),
        cellStyle: (r) => percentHeat(r.split?.offlistGr ?? null),
        render: (r) => {
          const value = r.split?.offlistGr;
          return value == null ? <span className="text-textDim">—</span> : pct(value);
        },
      }
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

  // No column has been clicked yet: the list is shown as it arrives, so opening
  // the page looks exactly like it did before the headers became clickable.
  const activeColumn = columns.find((c) => c.key === sortKey) ?? null;
  const sorted =
    sortKey === null || !activeColumn
      ? players
      : [...players].sort((a, b) =>
          compareValues(activeColumn.accessor(a), activeColumn.accessor(b), sortDir)
        );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {/* The Erumode column set is wide — five answer types plus the rig figures —
          so the table keeps a minimum width and scrolls rather than squeezing the
          numbers, and with them their heat shading, past reading size. */}
      <table
        className={`w-full border-collapse text-sm ${
          isErumode ? 'min-w-[1120px]' : 'min-w-[760px]'
        }`}
      >
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
                title={c.title}
                align={c.key === 'uname' ? 'left' : 'right'}
              />
            ))}
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
                  className={`px-3 py-2 ${
                    c.key === 'uname'
                      ? 'whitespace-nowrap font-medium'
                      : `text-right text-textMuted ${c.className ?? ''} ${c.cellClassName?.(r) ?? ''}`
                  }`}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
