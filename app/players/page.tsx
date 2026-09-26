import Link from 'next/link';
import { listMatchSummaries, listPlayerStats } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import {
  applyMatchFilter,
  matchFilterLabel,
  matchFilterQuery,
  parseSubmodeFilter,
  type MatchFilter,
} from '@/lib/match-filter';

export const dynamic = 'force-dynamic';

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string };
}) {
  // This view always works inside exactly one mode + sub-mode — same navigator
  // as the Player Manager: a mode row (Erumode / NGMC) plus the active mode's
  // concrete sub-modes, with no "all" chips at all. A bare visit defaults to
  // the first mode's first sub-mode (Erumode Normal).
  const { mode, submode } = parseSubmodeFilter(searchParams);
  const filter: MatchFilter = { mode, submode };
  const allMatches = await listMatchSummaries();
  const matches = applyMatchFilter(allMatches, filter);
  const players = await listPlayerStats(filter);
  const filterLabel = matchFilterLabel(filter);
  // Attacks and blocks only exist in NGMC exports, so those columns only make
  // sense inside an NGMC sub-mode — an Erumode selection gets none.
  const isErumode = filter.mode === 'Erumode';
  const summary = `${players.length} player${players.length !== 1 ? 's' : ''} across ${
    matches.length
  } ${filterLabel ? `${filterLabel} ` : ''}tournament${matches.length !== 1 ? 's' : ''}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Players</h1>
        <p className="text-xs text-textDim">{summary}</p>
      </div>

      <ModeToggle
        active={filter}
        basePath="/players"
        includeAll={false}
        includeAllSubmodes={false}
      />

      {players.length === 0 ? (
        <p className="text-sm text-textMuted">
          {allMatches.length === 0
            ? 'No player data yet.'
            : `No players in ${filterLabel} tournaments yet.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">Tournaments</th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title={`${filter.mode} guess rate`}
                >
                  Guess Rate
                </th>
                {!isErumode && (
                  <>
                    <th className="px-3 py-2 text-right font-medium">Attacks</th>
                    <th className="px-3 py-2 text-right font-medium">Blocks</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.uname} className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/players/${encodeURIComponent(p.uname)}${matchFilterQuery(filter)}`}
                      className="font-medium hover:underline"
                    >
                      {p.uname}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-textMuted">{p.matchesPlayed}</td>
                  <td className="px-3 py-2 text-right text-accent">
                    {isErumode
                      ? p.erumode.matchesPlayed
                        ? pct(p.erumode.overallGuessRate)
                        : '—'
                      : p.ngmc.matchesPlayed
                        ? pct(p.ngmc.overallGuessRate)
                        : '—'}
                  </td>
                  {!isErumode && (
                    <>
                      <td className="px-3 py-2 text-right font-medium text-taken">
                        {p.ngmc.matchesPlayed ? (
                          <>
                            {p.ngmc.totalTaken}
                            <span className="opacity-60">/{p.ngmc.totalEffTaken}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blocked">
                        {p.ngmc.matchesPlayed ? (
                          <>
                            {p.ngmc.totalBlocked}
                            <span className="opacity-60">/{p.ngmc.totalEffBlocked}</span>
                          </>
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
      )}
    </div>
  );
}