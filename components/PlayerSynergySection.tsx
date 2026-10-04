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
 * A partner's name, linked through to their own player page and carrying the
 * bot pill. The link carries the current mode + sub-mode filter, so the two
 * pages describe the same slice of each player rather than silently comparing a
 * filtered ranking against an unfiltered one.
 *
 * The bar under the name is the read rate (this player landing theirs) as a
 * share of the strongest read in the table, so the eye picks out the pairings
 * that stand out before reading a single number. It is drawn in the muted text
 * token rather than an accent colour, matching the neutral scale of the match
 * page's tables, and reserves a sliver even for the smallest non-zero bar so a
 * real-but-tiny rate doesn't render as nothing.
 */
function PartnerName({
  partner,
  top,
  filter,
  playerTags,
}: {
  partner: PartnerSynergy;
  top: number;
  filter: MatchFilter;
  playerTags?: Record<string, PlayerTag>;
}) {
  const width = top > 0 ? Math.max(3, Math.round((partner.read.rate / top) * 100)) : 0;
  return (
    <div className="min-w-0">
      <Link
        href={`/players/${encodeURIComponent(partner.uname)}${matchFilterQuery(filter)}`}
        className="font-medium hover:underline"
      >
        {partner.uname}
        <PlayerTagBadge uname={partner.uname} overrides={playerTags} className="ml-1.5" />
      </Link>
      {partner.read.chances > 0 && width > 0 && (
        <div className="mt-1 h-[3px] w-full max-w-[9rem] overflow-hidden rounded-full bg-surfaceAlt">
          <div className="h-full rounded-full bg-textSub" style={{ width: `${width}%` }} />
        </div>
      )}
    </div>
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

  const sorted = [...stats.partners].sort((a, b) =>
    compareValues(accessor(a), accessor(b), sortDir)
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Clamped rather than trusted: a shorter list (a narrower range, a mode
  // switch) can leave `page` past the end, and rendering nothing at all would
  // read as "no partners" instead of "you were on the last page".
  const current = Math.min(page, pageCount);
  const visible = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  // Shared by every bar in the table, so the strongest read fills its track and
  // the rest are read against it — a bar scaled to its own row would make 2/2
  // and 90/180 look identical. Taken over the whole list rather than the visible
  // page, so paging doesn't rescale the bars under the reader.
  const top = sorted.reduce((max, p) => Math.max(max, p.read.rate), 0);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className={`w-full border-collapse ${STATS_BODY_TEXT}`}>
          <thead>
            <tr
              className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}
            >
              <th className={`${DENSE_CELL_PAD} w-8 text-left font-medium`}>#</th>
              <th className={`${DENSE_CELL_PAD} text-left font-medium`}>Player</th>
              {header(
                'You read them',
                'read',
                'Songs this player correctly guessed that were on their list'
              )}
              {header(
                'They read you',
                'readBy',
                'Songs this player got right that were on your list'
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
                  <PartnerName partner={p} top={top} filter={filter} playerTags={playerTags} />
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