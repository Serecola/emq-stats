import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import { resolvePlayerTag } from '@/lib/player-tags';
import ModeToggle from '@/components/ModeToggle';
import PlayerRankTable from '@/components/PlayerRankTable';
import StatsRangeToggle from '@/components/StatsRangeToggle';
import SetRanksTransfer from '@/components/SetRanksTransfer';
import PlayerTagManager from '@/components/PlayerTagManager';
import {
  listMatchSummaries,
  listPlayerAliases,
  listPlayerRankRows,
  listPlayerStats,
  listPlayerTags,
  listSetRanks,
} from '@/lib/store';
import { savedRanksFor } from '@/lib/player-ranks';
import { requireAdminPage } from '@/lib/admin-session';
import {
  ALL_MATCH_FILTER,
  applyMatchFilter,
  matchFilterQuery,
  parseSubmodeFilter,
  type MatchFilter,
} from '@/lib/match-filter';
import { parseStatsRange, playerViewQuery, RECENT_TOUR_COUNT, statsRangeFragment, type StatsRange } from '@/lib/stats-range';

export const dynamic = 'force-dynamic';

// Sub-tabs inside the Player Manager — same chip styling as ModeToggle, and
// server-rendered as plain <Link>s so the active tab resolves from `?tab=`
// server-side: bookmarkable, shareable, no client JS.
const tabChipClass = (isActive: boolean): string =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    isActive
      ? 'bg-accent text-bg'
      : 'border border-border text-textMuted hover:border-textSub hover:text-text'
  }`;

/**
 * Href for one of the sub-tabs, carrying the active mode + sub-mode across
 * (see `tabs`). `matchFilterQuery` already returns a leading "?", so the tab
 * param is written first and the filter is then joined with "&" — gluing the
 * filter straight onto "?tab=tags" would nest a second "?" inside the tab's
 * own value ("tab=tags?mode=Erumode"), which then fails the `=== 'tags'`
 * check in this page and silently re-renders the Ranks tab. Appending
 * `tab` after the filter is no better: "?mode=…&tab=…" is a second "?" too.
 */
function tabHref(tab: 'ranks' | 'tags', filter: MatchFilter, range: StatsRange): string {
  const filterQuery = matchFilterQuery(filter);
  return `/admin/players?tab=${tab}${filterQuery ? `&${filterQuery.slice(1)}` : ''}${
    range === 'all' ? '&range=all' : ''
  }`;
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string; tab?: string; range?: string };
}) {
  // Admin gate (see lib/admin-session.ts — the Edge middleware cannot read the
  // secret, so the check that matters lives here in the Node runtime).
  await requireAdminPage('/admin/players');

  // Ranks are per gamemode *and* sub-mode (that's what a draft is balanced
  // at), so this view always works inside exactly one sub-mode — there is no
  // mode-level or "all sub-modes" rank. An unfiltered visit lands on the
  // first sub-mode of the first gamemode.
  const { mode, submode } = parseSubmodeFilter(searchParams);
  const filter: MatchFilter = { mode, submode };
  const tab = searchParams.tab === 'tags' ? 'tags' : 'ranks';
  // What the ladder's Expected Ranks are read over: each player's last
  // RECENT_TOUR_COUNT tournaments in this sub-mode (the default) or their whole
  // history here. Lives in the URL, so the switch is bookmarkable and survives
  // the sub-mode, tab and player-page links below.
  const range = parseStatsRange(searchParams);
  const rangeLimit = range === 'recent' ? RECENT_TOUR_COUNT : undefined;

  const allMatches = await listMatchSummaries();

  // The mode/sub-mode selection survives a round trip through the Tags tab:
  // only `tab` is added/dropped, so coming back lands on the same ladder.
  const tabs = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={tabHref('ranks', filter, range)} className={tabChipClass(tab === 'ranks')}>
        Set Ranks
      </Link>
      <Link href={tabHref('tags', filter, range)} className={tabChipClass(tab === 'tags')}>
        Player Tags
      </Link>
    </div>
  );

  // ---- Player Tags tab ----------------------------------------------------
  // Aliases and bot overrides are both global (one per username across every
  // gamemode), so this tab ignores the ModeToggle filter and lists everyone
  // from every match.
  if (tab === 'tags') {
    const players = await listPlayerStats(ALL_MATCH_FILTER);
    const tags = await listPlayerTags();
    const aliases = await listPlayerAliases();
    // Counted through the shared resolver, so the summary agrees with the bot
    // pills on the public views — most of these are automatic, not stored.
    const botCount = players.filter((p) => resolvePlayerTag(p.uname, tags) === 'Bot').length;
    const overrideCount = Object.keys(tags).length;
    const aliasCount = Object.keys(aliases).length;
    const summary =
      `${players.length} username${players.length !== 1 ? 's' : ''} across every ` +
      `tournament · ${botCount} bot${botCount !== 1 ? 's' : ''}` +
      (aliasCount > 0 ? ` · ${aliasCount} alias${aliasCount !== 1 ? 'es' : ''}` : '') +
      (overrideCount > 0 ? ` · ${overrideCount} override${overrideCount !== 1 ? 's' : ''}` : '');

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Player Manager</h1>
            <p className="text-xs text-textDim">{summary}</p>
          </div>
          <LogoutButton />
        </div>

        {tabs}

        <PlayerTagManager
          players={players.map((p) => ({ uname: p.uname, matchesPlayed: p.matchesPlayed }))}
          tags={tags}
          aliases={aliases}
        />
      </div>
    );
  }

  // ---- Set Ranks tab ------------------------------------------------------
  const matches = applyMatchFilter(allMatches, filter);
  // Only players who have actually played this gamemode + sub-mode get a row:
  // a sibling sub-mode's results are a different game, so they never stand in
  // for missing data here (see listPlayerRankRows). `rangeLimit` narrows each
  // row to that player's most recent tournaments for the "Recent" switch.
  const rows = await listPlayerRankRows(mode, submode, rangeLimit);

  const selection = `${mode} ${submode}`;
  // Spelled out in the copy under the table, so it says which tournaments the
  // Expected Ranks were read over instead of leaving that to the switch alone.
  const rangePhrase =
    range === 'recent'
      ? `their last ${RECENT_TOUR_COUNT} ${selection} tournaments`
      : `every ${selection} tournament they have played`;
  const rankedCount = rows.filter((r) => r.setRank !== null).length;
  const summary =
    `${rows.length} player${rows.length !== 1 ? 's' : ''} in ${matches.length} ${selection} ` +
    `tournament${matches.length !== 1 ? 's' : ''} · ${rankedCount} with a Set Rank`;

  // The whole ladder for this mode + sub-mode (not just the rows above — a rank
  // can exist for someone who hasn't played it yet), plus the proper casing
  // each name is known by, so the export round-trips readably.
  const ladder = savedRanksFor(await listSetRanks(), mode, submode) ?? {};
  const displayNames: Record<string, string> = {};
  for (const r of rows) displayNames[r.playerKey] = r.uname;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Player Manager</h1>
          <p className="text-xs text-textDim">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Reached only on the Ranks tab (the Tags tab returns above): the
              href goes through tabHref rather than playerViewQuery, because
              `?tab=ranks` already holds a '?' of its own. */}
          <StatsRangeToggle range={range} hrefFor={(r) => tabHref('ranks', filter, r)} />
          <LogoutButton />
        </div>
      </div>

      {tabs}

      <ModeToggle
        active={filter}
        basePath="/admin/players"
        includeAll={false}
        includeAllSubmodes={false}
        extraQuery={statsRangeFragment(range)}
      />

      {/* Above the table, and outside the empty-state branch on purpose:
          importing a ladder is exactly how you fill in a sub-mode nobody has
          played yet, so the control has to exist when there are no rows. */}
      <SetRanksTransfer
        mode={mode}
        submode={submode}
        ranks={ladder}
        displayNames={displayNames}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-textMuted">
          {allMatches.length === 0
            ? 'No players yet.'
            : `No one has played ${selection} yet.`}
        </p>
      ) : (
        <>
          <PlayerRankTable
            rows={rows}
            mode={mode}
            submode={submode}
            playerQuery={playerViewQuery(filter, range)}
          />
        </>
      )}
    </div>
  );
}