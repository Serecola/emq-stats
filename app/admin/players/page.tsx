import Link from 'next/link';
import AdminNav from '@/components/AdminNav';
import ModeToggle from '@/components/ModeToggle';
import PlayerRankTable from '@/components/PlayerRankTable';
import PlayerTagManager from '@/components/PlayerTagManager';
import {
  listMatchSummaries,
  listPlayerRankRows,
  listPlayerStats,
  listPlayerTags,
} from '@/lib/store';
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
      <Link
        href={`/admin/players${matchFilterQuery(filter)}`}
        className={tabChipClass(tab === 'ranks')}
      >
        Set Ranks
      </Link>
      <Link
        href={`/admin/players?tab=tags${matchFilterQuery(filter)}`}
        className={tabChipClass(tab === 'tags')}
      >
        Player Tags
      </Link>
    </div>
  );

  // ---- Player Tags tab ----------------------------------------------------
  // Tags are global (one label per username across every gamemode), so this
  // tab ignores the ModeToggle filter and lists everyone from every match.
  if (tab === 'tags') {
    const players = await listPlayerStats(ALL_MATCH_FILTER);
    const tags = await listPlayerTags();
    const taggedCount = Object.keys(tags).length;
    const botCount = Object.values(tags).filter((t) => t === 'Bot').length;
    const summary =
      `${players.length} username${players.length !== 1 ? 's' : ''} across every ` +
      `tournament · ${taggedCount} tagged · ${botCount} bot${botCount !== 1 ? 's' : ''}`;

    return (
      <div className="space-y-6">
        <AdminNav active="players" />

        <div>
          <h1 className="text-lg font-semibold">Player Manager</h1>
          <p className="text-xs text-textDim">{summary}</p>
        </div>

        {tabs}

        <PlayerTagManager
          players={players.map((p) => ({ uname: p.uname, matchesPlayed: p.matchesPlayed }))}
          tags={tags}
        />
        <p className="text-xs text-textDim">
          Tags are global — one label per username across every gamemode, stored under the
          same normalized-username identity as Set Ranks. A name tagged{' '}
          <span className="font-medium text-textMuted">Bot</span> gets a{' '}
          <span className="rounded-full border border-border bg-surfaceAlt px-1.5 py-0.5 text-[0.65rem] text-textMuted">
            bot
          </span>{' '}
          pill next to it on public player pages and stats tables. Click the active tag
          again to clear it.
        </p>
      </div>
    );
  }

  // ---- Set Ranks tab ------------------------------------------------------
  const matches = applyMatchFilter(allMatches, filter);
  // Everyone in this gamemode gets a row, so a sub-mode that has never been
  // played can still be ranked ahead of its first tournament (see
  // listPlayerRankRows, which also handles the gamemode-wide fallback).
  const rows = await listPlayerRankRows(mode, submode);

  const selection = `${mode} ${submode}`;
  const rankedCount = rows.filter((r) => r.setRank !== null).length;
  const gamemodeOnlyCount = rows.filter((r) => r.basis === 'gamemode').length;
  const summary =
    `${rows.length} player${rows.length !== 1 ? 's' : ''} in ${matches.length} ${selection} ` +
    `tournament${matches.length !== 1 ? 's' : ''} · ${rankedCount} with a Set Rank` +
    (gamemodeOnlyCount > 0 ? ` · ${gamemodeOnlyCount} without ${submode} data yet` : '');

  return (
    <div className="space-y-6">
      <AdminNav active="players" />

      <div>
        <h1 className="text-lg font-semibold">Player Manager</h1>
        <p className="text-xs text-textDim">{summary}</p>
      </div>

      {tabs}

      <ModeToggle
        active={filter}
        basePath="/admin/players"
        includeAll={false}
        includeAllSubmodes={false}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-textMuted">
          {allMatches.length === 0
            ? 'No players yet.'
            : `No one has played ${mode} yet.`}
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
            Expectation compares the two (Expected Rank − Set Rank).
          </p>
        </>
      )}
    </div>
  );
}