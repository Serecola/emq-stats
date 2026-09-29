import { listMatchSummaries, listPlayerRankRows, listPlayerStats, listPlayerTags } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import PlayerListTable, { type PlayerRow } from '@/components/PlayerListTable';
import StatsRangeToggle from '@/components/StatsRangeToggle';
import { erumodeSplitStats, slicePlayerSummary } from '@/lib/player-stats';
import { norm } from '@/lib/stats';
import {
  applyMatchFilter,
  matchFilterLabel,
  parseSubmodeFilter,
  type MatchFilter,
} from '@/lib/match-filter';
import { parseStatsRange, playerViewQuery, RECENT_TOUR_COUNT, statsRangeFragment } from '@/lib/stats-range';

export const dynamic = 'force-dynamic';

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string; range?: string };
}) {
  // This view always works inside exactly one mode + sub-mode — same navigator
  // as the Player Manager: a mode row (Erumode / NGMC) plus the active mode's
  // concrete sub-modes, with no "all" chips at all. A bare visit defaults to
  // the first mode's first sub-mode (Erumode Normal).
  const { mode, submode } = parseSubmodeFilter(searchParams);
  const filter: MatchFilter = { mode, submode };
  // Which slice of each player's history the columns are built from: their last
  // RECENT_TOUR_COUNT tournaments (the default) or everything in this sub-mode.
  // Per player, never per tournament — a list of last-5-of-the-sub-mode would be
  // a different and much less useful set of numbers.
  const range = parseStatsRange(searchParams);
  const rangeLimit = range === 'recent' ? RECENT_TOUR_COUNT : undefined;
  const allMatches = await listMatchSummaries();
  const matches = applyMatchFilter(allMatches, filter);
  // Attacks and blocks only exist in NGMC exports, so those columns only make
  // sense inside an NGMC sub-mode — an Erumode selection gets none. The same
  // gate drives the Erumode-only split guess-rate columns below.
  const isErumode = filter.mode === 'Erumode';
  // listPlayerStats is the cached all-time read (one pass over the sub-mode's
  // raw JSON); the range is then arithmetic over each player's own rows, so
  // the all-time figures are never re-derived.
  const summaries = await listPlayerStats(filter);
  // The admin ladder's rows over the same range — Winrate, Expected Rank,
  // Set Rank and Expectation come from exactly the numbers Player Manager
  // shows, joined below by normalized username.
  const rankRows = await listPlayerRankRows(mode, submode, rangeLimit);
  const rankByKey = new Map(rankRows.map((r) => [r.playerKey, r]));
  const players: PlayerRow[] = summaries.map((summary) => {
    const player = range === 'recent' ? slicePlayerSummary(summary, RECENT_TOUR_COUNT) : summary;
    return {
      player,
      allTimeTournaments: summary.matchesPlayed,
      rank: rankByKey.get(norm(summary.uname)) ?? null,
      split: isErumode ? erumodeSplitStats(player.entries) : null,
    };
  });
  // Global Player/Bot tags — usernames tagged Bot get a pill next to their
  // name below (see PlayerTagBadge).
  const tags = await listPlayerTags();
  const filterLabel = matchFilterLabel(filter);
  const summary = `${players.length} player${players.length !== 1 ? 's' : ''} across ${
    matches.length
  } ${filterLabel ? `${filterLabel} ` : ''}tournament${matches.length !== 1 ? 's' : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Players</h1>
          <p className="text-xs text-textDim">{summary}</p>
        </div>
        <StatsRangeToggle
          range={range}
          hrefFor={(r) => `/players${playerViewQuery(filter, r)}`}
        />
      </div>

      <ModeToggle
        active={filter}
        basePath="/players"
        includeAll={false}
        includeAllSubmodes={false}
        extraQuery={statsRangeFragment(range)}
      />

      {players.length === 0 ? (
        <p className="text-sm text-textMuted">
          {allMatches.length === 0
            ? 'No player data yet.'
            : `No players in ${filterLabel} tournaments yet.`}
        </p>
      ) : (
        <PlayerListTable
          players={players}
          mode={mode}
          submode={submode}
          filterLabel={filterLabel}
          tags={tags}
          playerQuery={playerViewQuery(filter, range)}
        />
      )}
    </div>
  );
}
