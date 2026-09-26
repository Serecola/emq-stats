import AdminNav from '@/components/AdminNav';
import ModeToggle from '@/components/ModeToggle';
import PlayerRankTable from '@/components/PlayerRankTable';
import { listMatchSummaries, listPlayerRankRows } from '@/lib/store';
import {
  applyMatchFilter,
  matchFilterQuery,
  parseSubmodeFilter,
  type MatchFilter,
} from '@/lib/match-filter';

export const dynamic = 'force-dynamic';

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string };
}) {
  // Ranks are per gamemode *and* sub-mode (that's what a draft is balanced
  // at), so this view always works inside exactly one sub-mode — there is no
  // mode-level or "all sub-modes" rank. An unfiltered visit lands on the
  // first sub-mode of the first gamemode.
  const { mode, submode } = parseSubmodeFilter(searchParams);
  const filter: MatchFilter = { mode, submode };

  const allMatches = await listMatchSummaries();
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