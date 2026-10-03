import { norm } from '@/lib/stats';
import { teamColor } from '@/lib/team-colors';
import type { MatchResults, TeamResult } from '@/lib/results';
import { TABLE_ROW_CLASS } from '@/lib/table-row';

const PODIUM_STYLES = [
  { place: '1st', bg: 'bg-accent/10', border: 'border-accent/40', text: 'text-accent', order: 'sm:order-2' },
  { place: '2nd', bg: 'bg-silver/10', border: 'border-silver/40', text: 'text-silver', order: 'sm:order-1' },
  { place: '3rd', bg: 'bg-bronze/10', border: 'border-bronze/40', text: 'text-bronze', order: 'sm:order-3' },
];

export default function ResultsSection({
  results,
  playerRanks,
}: {
  results: MatchResults;
  playerRanks: Record<string, number>;
}) {
  // Each player's Current Rank — the "(N)" pasted next to their name in the
  // roster (parsed into playerRanks, see lib/teams.ts) — looked up by
  // normalized username, the same identity the MVP and Guess Rate tables use.
  const rankOf = (name: string): number | null => playerRanks[norm(name)] ?? null;

  if (!results.hasScores) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-8 text-center text-sm text-textMuted">
        No scores entered for this tournament yet — add them from the admin panel to see the podium
        and rankings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Every name on the podium carries its team's color, so the card ties
            back to the same player's row in the table below. */}
        {results.podium.map((team, i) => (
          <div
            key={team.teamIndex}
            className={`rounded-lg border p-4 text-center ${PODIUM_STYLES[i].bg} ${PODIUM_STYLES[i].border} ${PODIUM_STYLES[i].order}`}
          >
            <div className={`text-xs font-semibold uppercase tracking-wide ${PODIUM_STYLES[i].text}`}>
              {PODIUM_STYLES[i].place}
            </div>
            <div className="mt-1 truncate text-base font-semibold">
              <span style={{ color: teamColor(team.teamIndex) }}>{team.label}</span>&apos;s team
            </div>
            <div className="mt-1 text-xs text-textMuted">
              {team.members.map((name, j) => (
                <span key={`${name}-${j}`}>
                  {j > 0 && ', '}
                  <span style={{ color: teamColor(team.teamIndex) }}>{name}</span>
                </span>
              ))}
            </div>
            <div className="mt-2 text-sm text-textSub">
              {team.matchWins}-{team.matchLosses}-{team.matchTies} · {team.pts} pts
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-[0.75rem] sm:text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-[0.65rem] uppercase tracking-wide text-textMuted sm:text-xs">
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Participant</th>
              <th className="px-3 py-2 text-right font-medium">Match W-L-T</th>
              <th className="px-3 py-2 text-right font-medium" title="Game wins against opponents tied on Match W-L-T">
                TB
              </th>
              <th className="px-3 py-2 text-right font-medium">Set Wins</th>
              <th className="px-3 py-2 text-right font-medium">Set Ties</th>
              <th className="px-3 py-2 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {results.rankings.map((r: TeamResult) => (
              <tr
                key={r.teamIndex}
                className={`${TABLE_ROW_CLASS} ${r.rank <= 3 ? 'bg-accent/5' : ''}`}
              >
                <td className="px-3 py-2 font-medium text-textSub">{r.rank}</td>
                <td className="px-3 py-2 font-medium">
                  {r.members.map((name, i) => {
                    const rank = rankOf(name);
                    return (
                      <span key={`${name}-${i}`} className="whitespace-nowrap">
                        {i > 0 && <span className="text-textDim">, </span>}
                        <span style={{ color: teamColor(r.teamIndex) }}>{name}</span>
                        {rank !== null && (
                          <span className="ml-1 text-xs font-normal text-textDim">({rank})</span>
                        )}
                      </span>
                    );
                  })}
                </td>
                <td className="px-3 py-2 text-right text-textSub">
                  {r.matchWins} - {r.matchLosses} - {r.matchTies}
                </td>
                <td className="px-3 py-2 text-right text-textMuted">{r.tb}</td>
                <td className="px-3 py-2 text-right text-textMuted">{r.setWins}</td>
                <td className="px-3 py-2 text-right text-textMuted">{r.setTies}</td>
                <td className="px-3 py-2 text-right font-semibold text-accent">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}