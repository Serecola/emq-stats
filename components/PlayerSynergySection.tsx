'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlayerSynergyStats, PartnerSynergy } from '@/lib/player-synergy';
import type { PlayerTag } from '@/lib/types';
import { matchFilterQuery, type MatchFilter } from '@/lib/match-filter';
import {
  DENSE_CELL_PAD,
  STATS_BODY_TEXT,
  STATS_HEADER_TEXT,
  SortableHeader,
  compareValues,
  toggleSort,
  type SortDir,
} from './SortableTable';
import ReadValue from './SynergyReadValue';
import PlayerTagBadge from './PlayerTagBadge';
import { resolvePlayerTag } from '@/lib/player-tags';
import { TABLE_ROW_CLASS } from '@/lib/table-row';

type SortKey = 'uname' | 'read' | 'readBy';

const KEY_OF: Record<SortKey, (p: PartnerSynergy) => number | string> = {
  uname: (p) => p.uname.toLowerCase(),
  read: (p) => p.read.rate,
  readBy: (p) => p.readBy.rate,
};

/**
 * Partners shown per page. A well-travelled player shares tournaments with a
 * few dozen people, and the tail of that list is a long column of single-digit
 * rates nobody scrolls to — the pager keeps the section one screen tall while
 * leaving every row reachable.
 */
const PAGE_SIZE = 10;

/**
 * Partners with fewer chances than this are noise on a rate: 1/1 reads as a
 * perfect 100% and would otherwise outrank a genuine 60% over 300 chances.
 *
 * Measured on `read.chances` — the songs on *their* list this player had the
 * chance to land — which is the evidence behind the column the table ranks by
 * default, so the floor and the ranking are always talking about the same
 * number. The counts sit in every row, so a reader who wants the thin pairings
 * back just turns the filter off.
 */
const MIN_CHANCES = 30;

/**
 * A partner's name, linked through to their own player page and carrying the
 * bot pill. The link carries the current mode + sub-mode filter, so the two
 * pages describe the same slice of each player rather than silently comparing a
 * filtered ranking against an unfiltered one.
 */
function PartnerName({
  partner,
  filter,
  playerTags,
}: {
  partner: PartnerSynergy;
  filter: MatchFilter;
  playerTags?: Record<string, PlayerTag>;
}) {
  return (
    <Link
      href={`/players/${encodeURIComponent(partner.uname)}${matchFilterQuery(filter)}`}
      className="min-w-0 font-medium hover:underline"
    >
      {partner.uname}
      <PlayerTagBadge uname={partner.uname} overrides={playerTags} className="ml-1.5" />
    </Link>
  );
}

/**
 * An on/off filter chip. `aria-pressed` carries the state so the toggle is
 * announced correctly, and the active state is filled rather than just bordered
 * — a filter you can't tell is on will silently cost you the rows it removed.
 */
function FilterToggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on
          ? 'border-accent bg-accent text-bg'
          : 'border-border text-textMuted hover:border-textSub hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The ranking itself: every other player this one has shared a tournament with,
 * strongest read first, sortable by either direction or by name.
 *
 * Both directions share one row rather than sitting in two separate tables —
 * the reference viewer splits them into "you synergize with them" and "they
 * synergize with you" — because they are the same relationship counted from
 * each end. Side by side, a lopsided pairing (you land their list, they never
 * land yours) is visible at a glance instead of having to be spotted by
 * comparing positions across two independently sorted lists.
 */
function PartnerTable({
  stats,
  filter,
  playerTags,
}: {
  stats: PlayerSynergyStats;
  filter: MatchFilter;
  playerTags?: Record<string, PlayerTag>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('read');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  // Both default to on: a ranking whose top row is a bot, or a 100% off two
  // songs, is not a ranking. They're one click apart from showing everything,
  // which is the escape hatch for anyone who wants the raw list.
  const [hideBots, setHideBots] = useState(true);
  const [hideThin, setHideThin] = useState(true);
  const accessor = KEY_OF[sortKey];

  function onSort(key: string) {
    toggleSort(
      key,
      sortKey,
      sortDir,
      key === 'uname' ? 'asc' : 'desc',
      (k) => setSortKey(k as SortKey),
      setSortDir
    );
    // Sorting reorders the list underneath the pager, so the old page number
    // now points at a different slice — back to the top, where the new
    // strongest rows are.
    setPage(1);
  }

  const header = (label: string, key: SortKey, title: string) => (
    <SortableHeader
      label={label}
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={onSort}
      align="right"
      title={title}
      pad={DENSE_CELL_PAD}
    />
  );

  // Filtered before sorting, so the ranking, the ranks and the pager all count
  // the same rows — and so a row that survives can't be pushed onto a later
  // page by a partner hidden underneath it.
  //
  // Bot status goes through `resolvePlayerTag`, the one rule every view uses, so
  // this table can't disagree with the pill it would otherwise be hiding or the
  // Player Manager about who counts as a bot.
  const shown = stats.partners.filter((p) => {
    if (hideBots && resolvePlayerTag(p.uname, playerTags) === 'Bot') return false;
    if (hideThin && p.read.chances < MIN_CHANCES) return false;
    return true;
  });

  const sorted = [...shown].sort((a, b) =>
    compareValues(accessor(a), accessor(b), sortDir)
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Clamped rather than trusted: a shorter list (a narrower range, a mode
  // switch, a filter flipped on) can leave `page` past the end, and rendering
  // nothing at all would read as "no partners" instead of "you were on the last
  // page".
  const current = Math.min(page, pageCount);
  const visible = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="space-y-2">
      {/* Filters sit above the table rather than in it: they change which rows
          exist, not how a row is displayed, and a header control that removes
          rows would re-order under the reader's cursor. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterToggle
          on={hideBots}
          onClick={() => {
            setHideBots((v) => !v);
            setPage(1);
          }}
          title="Hide partners tagged as a bot — accounts that guess by lookup rather than by reading each other"
        >
          Hide bots
        </FilterToggle>
        <FilterToggle
          on={hideThin}
          onClick={() => {
            setHideThin((v) => !v);
            setPage(1);
          }}
          title={`Hide partners with fewer than ${MIN_CHANCES} chances to land — too little evidence for the rate to mean anything`}
        >
          Min {MIN_CHANCES} songs
        </FilterToggle>
        {/* A filter that quietly removes rows reads as a smaller list rather
            than a filtered one, so the row count is stated next to the chips
            and only when the filters are actually costing something. */}
        {shown.length < stats.partners.length && (
          <span className="text-xs text-textDim">
            {shown.length} of {stats.partners.length} partners shown
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-6 text-center text-sm text-textMuted">
          No partners match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className={`w-full border-collapse ${STATS_BODY_TEXT}`}>
          <thead>
            <tr
              className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}
            >
              <th className={`${DENSE_CELL_PAD} w-8 text-left font-medium`}>#</th>
              <th className={`${DENSE_CELL_PAD} text-left font-medium`}>Player</th>
              {header(
                'You snipe them',
                'read',
                'Songs you got right that were on their list'
              )}
              {header(
                'They snipe you',
                'readBy',
                'Songs they got right that were on your list'
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => (
              <tr key={p.uname} className={TABLE_ROW_CLASS}>
                {/* Ranked across the whole list, not the page: page two starts at
                    11, so the number still means "this player's placing overall"
                    rather than restarting on every screen. */}
                <td className={`${DENSE_CELL_PAD} text-textDim`}>
                  {(current - 1) * PAGE_SIZE + i + 1}
                </td>
                <td className={DENSE_CELL_PAD}>
                  <PartnerName partner={p} filter={filter} playerTags={playerTags} />
                </td>
                <td className={`${DENSE_CELL_PAD} text-right`}>
                  <ReadValue read={p.read} color />
                </td>
                <td className={`${DENSE_CELL_PAD} text-right`}>
                  <ReadValue read={p.readBy} color />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Pager
        shown={visible.length}
        total={sorted.length}
        current={current}
        pageCount={pageCount}
        onChange={setPage}
      />
    </div>
  );
}

/**
 * Page controls under the ranking: previous / next plus "showing 11–20 of 34",
 * so the reader can tell where they are in the list rather than only that there
 * is more of it.
 *
 * Renders nothing when everything already fits — a pager offering a single page
 * is a dead control, and for most players this table never gets past one.
 */
function Pager({
  shown,
  total,
  current,
  pageCount,
  onChange,
}: {
  /** how many partners are on screen right now */
  shown: number;
  total: number;
  current: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const from = (current - 1) * PAGE_SIZE + 1;
  const to = (current - 1) * PAGE_SIZE + shown;

  const button = (label: string, target: number, disabled: boolean) => (
    <button
      type="button"
      onClick={() => onChange(target)}
      disabled={disabled}
      className={`rounded-md border border-border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        disabled ? '' : 'text-textSub hover:border-textSub hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-textDim">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        {button('← Prev', current - 1, current <= 1)}
        <span className="text-xs text-textMuted">
          Page {current} of {pageCount}
        </span>
        {button('Next →', current + 1, current >= pageCount)}
      </div>
    </div>
  );
}

/**
 * Synergy block for the player page: how this player reads everyone else they
 * have played with, and how everyone else reads them.
 *
 * The same event the match page's Team Synergy block counts (lib/synergy.ts),
 * pooled across every tournament in view rather than one room — see
 * lib/player-synergy.ts for what a chance is and why both directions are kept.
 *
 * Renders nothing when no song in scope produced a chance, matching
 * `hasData`: the page gates its heading on the same flag, so a heading never
 * appears over an empty table.
 */
export default function PlayerSynergySection({
  stats,
  filter,
  playerTags,
}: {
  stats: PlayerSynergyStats;
  /** the page's mode + sub-mode, carried through to each partner's link */
  filter: MatchFilter;
  /** Global Player/Bot tags — usernames tagged Bot get a pill by their name. */
  playerTags?: Record<string, PlayerTag>;
}) {
  if (!stats.hasData) return null;

  const noun = `tournament${stats.totalMatches === 1 ? '' : 's'}`;

  return (
    <div className="space-y-2">
      <PartnerTable stats={stats} filter={filter} playerTags={playerTags} />
    </div>
  );
}