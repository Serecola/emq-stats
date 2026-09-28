import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import { resolvePlayerTag } from '@/lib/player-tags';
import ModeToggle from '@/components/ModeToggle';
import PlayerRankTable from '@/components/PlayerRankTable';
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
import {
  ALL_MATCH_FILTER,
  applyMatchFilter,
  matchFilterQuery,
  parseSubmodeFilter,
  type MatchFilter,
} from '@/lib/match-filter';

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
function tabHref(tab: 'ranks' | 'tags', filter: MatchFilter): string {
  const filterQuery = matchFilterQuery(filter);
  return `/admin/players?tab=${tab}${filterQuery ? `&${filterQuery.slice(1)}` : ''}`;
}

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string; tab?: string };
}) {
  // Ranks are per gamemode *and* sub-mode (that's what a draft is balanced
  // at), so this view always works inside exactly one sub-mode — there is no
  // mode-level or "all sub-modes" rank. An unfiltered visit lands on the
  // first sub-mode of the first gamemode.
  const { mode, submode } = parseSubmodeFilter(searchParams);
  const filter: MatchFilter = { mode, submode };
  const tab = searchParams.tab === 'tags' ? 'tags' : 'ranks';

  const allMatches = await listMatchSummaries();

  // The mode/sub-mode selection survives a round trip through the Tags tab:
  // only `tab` is added/dropped, so coming back lands on the same ladder.
  const tabs = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={tabHref('ranks', filter)} className={tabChipClass(tab === 'ranks')}>
        Set Ranks
      </Link>
      <Link href={tabHref('tags', filter)} className={tabChipClass(tab === 'tags')}>
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
        <p className="text-xs text-textDim">
          <span className="font-medium text-textMuted">Aliases</span> merge two names for the same
          person everywhere: aggregated stats, player pages, Expected Ranks and the autodrafter all
          follow the alias, and the alias&apos;s Set Ranks move onto the player you add it to. Use one
          when someone turns up under a second username in a different tournament — a match&apos;s own
          renames only ever fix that single match. Removing an alias splits the names back apart;
          anything already moved to the canonical player stays there. The{' '}
          <span className="font-medium text-textMuted">✎</span> next to a username renames a
          player — the current name is kept as an alias of the new one, so tournaments that recorded
          the old name still count towards them, and a change of capitalisation counts too. The{' '}
          <span className="font-medium text-textMuted">⇄</span> on an alias swaps the two: it
          becomes the main name and the current one its alias.
        </p>
        <p className="text-xs text-textDim">
          Any username containing{' '}
          <span className="font-medium text-textMuted">Bot</span> is badged as a bot automatically,
          so ordinary players never need tagging. Click{' '}
          <span className="font-medium text-textMuted">Bot</span> on one of those to mark it as a
          real player when the name is a false alarm (RobotFan, Botanist) — it gets a{' '}
          <span className="font-medium text-textMuted">not a bot</span> override instead, and the{' '}
          <span className="font-medium text-textMuted">auto</span> button puts any override back
          under the name rule. Bots get a{' '}
          <span className="rounded-full border border-border bg-surfaceAlt px-1.5 py-0.5 text-[0.65rem] text-textMuted">
            bot
          </span>{' '}
          pill next to them on public player pages and stats tables. Both aliases and overrides are
          global — one per normalized username across every gamemode, stored under the same
          identity as Set Ranks.
        </p>
      </div>
    );
  }

  // ---- Set Ranks tab ------------------------------------------------------
  const matches = applyMatchFilter(allMatches, filter);
  // Only players who have actually played this gamemode + sub-mode get a row:
  // a sibling sub-mode's results are a different game, so they never stand in
  // for missing data here (see listPlayerRankRows).
  const rows = await listPlayerRankRows(mode, submode);

  const selection = `${mode} ${submode}`;
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
        <LogoutButton />
      </div>

      {tabs}

      <ModeToggle
        active={filter}
        basePath="/admin/players"
        includeAll={false}
        includeAllSubmodes={false}
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
            filterQuery={matchFilterQuery(filter)}
          />
          <p className="text-xs text-textDim">
            Set Rank is manual and stored per gamemode + sub-mode — it is the rank
            autodraft balances with for a {selection} tournament. Expected Rank is the
            player&apos;s songs-weighted Performance across these {selection} tournaments;
            Expectation compares the two (Expected Rank − Set Rank). Only {selection} games
            count towards either — another sub-mode is a different game, so its results are
            never used as a stand-in.
          </p>
        </>
      )}
    </div>
  );
}