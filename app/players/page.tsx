import Link from 'next/link';
import { listMatches } from '@/lib/store';
import { computeAllPlayerStats } from '@/lib/player-stats';

export const dynamic = 'force-dynamic';

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export default async function PlayersPage() {
  const matches = await listMatches();
  const players = computeAllPlayerStats(matches);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Players</h1>
        <p className="text-xs text-textDim">
          {players.length} player{players.length !== 1 ? 's' : ''} across {matches.length}{' '}
          tournament{matches.length !== 1 ? 's' : ''}
        </p>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-textMuted">No player data yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">Tournaments</th>
                                <th className="px-3 py-2 text-right font-medium" title="NGMC guess rate">
                  NGMC GR
                </th>
                <th className="px-3 py-2 text-right font-medium" title="Erumode guess rate">
                  Erumode GR
                </th>
                <th className="px-3 py-2 text-right font-medium">Attacks</th>
                <th className="px-3 py-2 text-right font-medium">Blocks</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.uname} className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50">
                  <td className="px-3 py-2">
                    <Link href={`/players/${encodeURIComponent(p.uname)}`} className="font-medium hover:underline">
                      {p.uname}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-textMuted">{p.matchesPlayed}</td>
                                    <td className="px-3 py-2 text-right text-accent">
                    {p.ngmc.matchesPlayed ? pct(p.ngmc.overallGuessRate) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-accent">
                    {p.erumode.matchesPlayed ? pct(p.erumode.overallGuessRate) : '—'}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}