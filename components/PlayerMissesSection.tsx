'use client';

import { useState } from 'react';
import { TABLE_ROW_CLASS } from '@/lib/table-row';
import { MISS_MIN_PLAYS, MISS_TOP_N, type MissRow, type PlayerMissStats } from '@/lib/player-misses';
import { readHeat } from './SynergyReadValue';

type MissTab = 'vns' | 'artists';

/**
 * Miss heat — `readHeat`'s bands read backwards.
 *
 * The bands themselves (green at 50%+, gold in the middle, red below 25%) are
 * one definition of "how good is this rate" that the synergy tables already own
 * and that the eye already reads: a *read* rate of 20% is bad there, and a
 * *miss* rate of 20% is good here, so the miss rate is painted by asking what
 * its complement would look like. Reusing the thirds this way keeps a 60% miss
 * the same gold a 40% read gets, instead of inventing a second scale that might
 * paint the two in different colours.
 */
function missHeat(rate: number): string {
  return readHeat(100 - rate);
}

/**
 * One ranking as a table: rank, name, how often it was missed, and the rate
 * behind that count.
 *
 * Same shape as the "Most Played VNs" block on the match page, and for the same
 * reason there is no sort control on it: the rows are a top-N cut of a single
 * ordering, so re-sorting the ten rows on screen would only ever reorder what
 * "most missed" is about. The footnote under the table says how much the floor
 * and the cut left behind.
 */
function MissTable({
  rows,
  total,
  qualified,
  noun,
  plural,
  floorNote,
  nameHeader,
  nameTitle,
}: {
  rows: MissRow[];
  /** missed entries before the floor — the "of M" in the footnote */
  total: number;
  /** entries that cleared the floor, before the top-N cut */
  qualified: number;
  /** 'VN' or 'artist', for that footnote */
  noun: string;
  /** footnote plural that reads naturally ("VNs" reads better than "VNS") */
  plural: string;
  /** why the floor is what it is, worded for this ranking */
  floorNote: string;
  nameHeader: string;
  nameTitle: string;
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-[0.75rem] sm:text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-[0.65rem] uppercase tracking-wide text-textMuted sm:text-xs">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium" title={nameTitle}>
                {nameHeader}
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Questions about it this player got wrong, of the questions they were asked"
              >
                Missed
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Missed / asked — the share of the questions about it this player got wrong"
              >
                Miss %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className={TABLE_ROW_CLASS}>
                <td className="px-3 py-2 font-medium text-textSub">{i + 1}</td>
                <td className="px-3 py-2 [overflow-wrap:anywhere]">
                  <div className="font-medium">{row.name}</div>
                  {row.detail.map((line) => (
                    <div key={line} className="mt-0.5 text-xs text-textMuted">
                      {line}
                    </div>
                  ))}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <span className="font-medium text-taken">{row.misses}</span>
                  <span className="text-textMuted opacity-60">/{row.asks}</span>
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${missHeat(row.rate)}`}>
                  {row.rate.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-textDim">
        {qualified} of {total} missed {qualified === 1 ? noun : plural} {floorNote}
        {qualified > MISS_TOP_N ? `, showing the top ${MISS_TOP_N}` : ''}
      </p>
    </div>
  );
}

/**
 * Most-missed block for the player page: the VNs this player can't name (Mst
 * answers) and the artists they can't place (A answers), over the tournaments
 * the rest of the page is showing (see lib/player-misses.ts for what a miss is
 * and why each ranking reads its own answer type).
 *
 * One table with a VNs / Artists switcher rather than two stacked tables: the
 * two rankings answer the same question — "what do I keep getting wrong" — at
 * different grains, and they share the unit, the floor, the cut and the table
 * shape, so a toggle reads as one section with two views rather than two
 * sections competing for the screen. The switcher defaults to VNs (every mode
 * asks Mst, so that table always has the fuller picture) and only renders when
 * both rankings have rows — with a single non-empty ranking there is nothing
 * to switch between, so the table shows alone.
 *
 * A client component for the switcher state, unlike the previous server
 * version: the rows of each ranking are still a top-N cut of a single ordering
 * each, so there is nothing to sort, filter or page beyond the tab itself.
 *
 * Renders nothing when the player missed nothing in scope, matching `hasData`:
 * the page gates its heading on the same flag, so a heading never appears over
 * an empty table.
 */
export default function PlayerMissesSection({ stats }: { stats: PlayerMissStats }) {
  const [tab, setTab] = useState<MissTab>('vns');
  if (!stats.hasData) return null;

  // NGMC asks Mst only, so its artist ranking is always empty — and an Erumode
  // slice whose tournaments never asked A lands in the same place. One table,
  // no switcher: there is no second view to offer.
  const showTabs = stats.vns.length > 0 && stats.artists.length > 0;
  const active: MissTab = !showTabs ? (stats.vns.length > 0 ? 'vns' : 'artists') : tab;

  return (
    <div className="space-y-2">
      {showTabs && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Most missed view">
          {(
            [
              { id: 'vns', label: 'VNs' },
              { id: 'artists', label: 'Artists' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={t.id === active}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                t.id === active
                  ? 'bg-accent text-bg'
                  : 'border border-border text-textMuted hover:border-textSub hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {active === 'vns' ? (
        <MissTable
          rows={stats.vns}
          total={stats.totalVns}
          qualified={stats.qualifiedVns}
          noun="VN"
          plural="VNs"
          floorNote={`came up at least ${MISS_MIN_PLAYS} times`}
          nameHeader="VN"
          nameTitle="The VN the song comes from — Mst answers only"
        />
      ) : (
        <MissTable
          rows={stats.artists}
          total={stats.totalArtists}
          qualified={stats.qualifiedArtists}
          noun="artist"
          plural="artists"
          floorNote={`came up at least ${MISS_MIN_PLAYS} times`}
          nameHeader="Artist"
          nameTitle="The singer the export credits — A answers only, a duet counts for everyone on it"
        />
      )}
    </div>
  );
}
