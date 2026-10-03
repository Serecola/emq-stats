import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findPlayerStats, listPlayerTags } from '@/lib/store';
import PlayerTagBadge from '@/components/PlayerTagBadge';
import ModeToggle from '@/components/ModeToggle';
import StatsRangeToggle from '@/components/StatsRangeToggle';
import { slicePlayerSummary, type PlayerMatchEntry } from '@/lib/player-stats';
import { TABLE_ROW_CLASS } from '@/lib/table-row';
import {
  matchFilterLabel,
  matchFilterQuery,
  parseSubmodeFilter,
} from '@/lib/match-filter';
import {
  parseStatsRange,
  playerViewQuery,
  RECENT_TOUR_COUNT,
  statsRangeFragment,
  statsRangeLabel,
} from '@/lib/stats-range';

export const dynamic = 'force-dynamic';

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { uname: string };
  searchParams: { mode?: string; submode?: string; range?: string };
}) {
  const uname = decodeURIComponent(params.uname);
  // Like /players, this view always works inside exactly one mode + sub-mode
  // (default Erumode Normal) — links in from /players already carry one, so
  // parseSubmodeFilter only has to clean up hand-edited URLs.
  const filter = parseSubmodeFilter(searchParams);
  // Which slice of the player's history this page shows: their last
  // RECENT_TOUR_COUNT tournaments, unless the URL asks for all of them.
  const range = parseStatsRange(searchParams);
  const player = await findPlayerStats(uname, filter);
  const filterLabel = matchFilterLabel(filter);
  // Global Player/Bot tag for the header pill (see PlayerTagBadge).
  const tags = await listPlayerTags();

  // A valid player can be missing from a filtered view simply because they
  // never played that mode/sub-mode — offer their unfiltered page instead of
  // 404ing, and only 404 when the name matches nobody at all.
  if (!player) {
    const overall = await findPlayerStats(uname);
    if (!overall) notFound();
    return (
      <div className="space-y-4">
        <Link
          href={`/players${matchFilterQuery(filter)}`}
          className="text-xs text-textMuted hover:text-text"
        >
          ← All players
        </Link>
        <h1 className="text-lg font-semibold">
          {overall.uname}
          <PlayerTagBadge uname={overall.uname} overrides={tags} className="ml-2" />
        </h1>
        {/* The mode + sub-mode chips matter most here: the player exists, just
            not in this slice, so the way out is to pick a mode where they do
            have tournaments. Same concrete-only chips as the normal view below
            (see the comment there). */}
        <ModeToggle
          active={filter}
          basePath={`/players/${encodeURIComponent(overall.uname)}`}
          includeAll={false}
          includeAllSubmodes={false}
          extraQuery={statsRangeFragment(range)}
        />
        <p className="text-sm text-textMuted">
          No {filterLabel || 'matching'} tournaments played.{' '}
          <Link
            href={`/players/${encodeURIComponent(overall.uname)}${playerViewQuery(filter, range)}`}
            className="text-accent underline"
          >
            Show every tournament
          </Link>
        </p>
      </div>
    );
  }

  // "Recent" numbers everything below — the stat cards, the history table and
  // the header count — from the player's last RECENT_TOUR_COUNT tournaments.
  // The all-time total stays on hand so the header can say which slice is on
  // screen ("last 5 of 12 tournaments").
  const view = range === 'recent' ? slicePlayerSummary(player, RECENT_TOUR_COUNT) : player;
  const totalTournaments = player.entries.length;

  const ngmcEntries = view.entries.filter((e) => e.mode !== 'Erumode');
  const erumodeEntries = view.entries.filter((e) => e.mode === 'Erumode');
  // Under a concrete mode + sub-mode filter every entry is that mode's, but
  // splitting defensively keeps both sections honest for any future caller.
  const showErumode = filter.mode === 'Erumode' || erumodeEntries.length > 0;
  const showNgmc = filter.mode !== 'Erumode' || ngmcEntries.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/players${matchFilterQuery(filter)}`}
            className="text-xs text-textMuted hover:text-text"
          >
            ← Players
          </Link>
          <StatsRangeToggle
            range={range}
            hrefFor={(r) => `/players/${encodeURIComponent(player.uname)}${playerViewQuery(filter, r)}`}
          />
        </div>
        <h1 className="mt-2 text-lg font-semibold">
          {player.uname}
          <PlayerTagBadge uname={player.uname} overrides={tags} className="ml-2" />
        </h1>
        <p className="text-xs text-textDim">
          {filterLabel ? `${filterLabel} · ` : ''}
          {statsRangeLabel(range, view.entries.length, totalTournaments)}
        </p>
      </div>

      {/* The same mode + sub-mode chips as /players and the Player Manager:
          concrete modes and sub-modes only (no "all"), because this page always
          works inside exactly one mode + sub-mode — the very slice
          findPlayerStats was given above. Switching keeps the Recent /
          All-Time choice (the range rides in extraQuery), so changing mode
          never silently drops back to the default window. */}
      <ModeToggle
        active={filter}
        basePath={`/players/${encodeURIComponent(player.uname)}`}
        includeAll={false}
        includeAllSubmodes={false}
        extraQuery={statsRangeFragment(range)}
      />

      {/* Mode priority: Erumode's section is shown before NGMC's everywhere a
          mode is listed (see MODES in lib/types.ts). */}
      {showErumode && view.erumode.matchesPlayed > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">Erumode</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Guess Rate" value={pct(view.erumode.overallGuessRate)} />
            <StatCard label="Songs" value={String(view.erumode.totalSongs)} />
          </div>
          <MatchHistoryTable entries={erumodeEntries} showAttacksBlocks={false} />
        </section>
      )}

      {showNgmc && view.ngmc.matchesPlayed > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">NGMC</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Guess Rate" value={pct(view.ngmc.overallGuessRate)} />
            <StatCard label="Songs" value={String(view.ngmc.totalSongs)} />
            <StatCard
              label="Attacks"
              value={
                <>
                  {view.ngmc.totalTaken}
                  <span className="text-textMuted opacity-60">/{view.ngmc.totalEffTaken}</span>
                </>
              }
              accent="taken"
            />
            <StatCard
              label="Blocks"
              value={
                <>
                  {view.ngmc.totalBlocked}
                  <span className="text-textMuted opacity-60">/{view.ngmc.totalEffBlocked}</span>
                </>
              }
              accent="blocked"
            />
          </div>
          <MatchHistoryTable entries={ngmcEntries} showAttacksBlocks />
        </section>
      )}

      {showErumode &&
        showNgmc &&
        view.ngmc.matchesPlayed === 0 &&
        view.erumode.matchesPlayed === 0 && (
          <p className="text-sm text-textMuted">No tournament data for this player yet.</p>
        )}
    </div>
  );
}

function MatchHistoryTable({
  entries,
  showAttacksBlocks,
}: {
  entries: PlayerMatchEntry[];
  showAttacksBlocks: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
            <th className="px-3 py-2 font-medium">Tournament</th>
            <th className="px-3 py-2 text-right font-medium">Guess Rate</th>
            <th className="px-3 py-2 text-right font-medium">Songs</th>
            {showAttacksBlocks && (
              <>
                <th className="px-3 py-2 text-right font-medium">Attacks</th>
                <th className="px-3 py-2 text-right font-medium">Blocks</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.matchId} className={TABLE_ROW_CLASS}>
              <td className="px-3 py-2">
                <Link href={`/matches/${e.matchId}`} className="font-medium hover:underline">
                  {e.matchTitle}
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-accent">{pct(e.guessRate)}</td>
              <td className="px-3 py-2 text-right text-textMuted">{e.songs}</td>
              {showAttacksBlocks && (
                <>
                  <td className="px-3 py-2 text-right text-textMuted">
                    {e.taken !== undefined ? (
                      <span className="font-medium text-taken">
                        {e.taken}
                        <span className="opacity-60">/{e.effTaken}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-textMuted">
                    {e.blocked !== undefined ? (
                      <span className="font-medium text-blocked">
                        {e.blocked}
                        <span className="opacity-60">/{e.effBlocked}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: 'taken' | 'blocked';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="text-xs text-textMuted">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold ${
          accent === 'taken' ? 'text-taken' : accent === 'blocked' ? 'text-blocked' : 'text-text'
        }`}
      >
        {value}
      </div>
    </div>
  );
}