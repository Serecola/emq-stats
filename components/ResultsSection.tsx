import type { MatchResults, TeamResult } from '@/lib/results';

const PODIUM_STYLES = [
  { place: '1st', bg: 'bg-[#e0b152]/10', border: 'border-[#e0b152]/40', text: 'text-[#e0b152]', order: 'sm:order-2' },
  { place: '2nd', bg: 'bg-[#c4c4c4]/10', border: 'border-[#c4c4c4]/40', text: 'text-[#c4c4c4]', order: 'sm:order-1' },
  { place: '3rd', bg: 'bg-[#c97a4d]/10', border: 'border-[#c97a4d]/40', text: 'text-[#c97a4d]', order: 'sm:order-3' },
];

export default function ResultsSection({ results }: { results: MatchResults }) {
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
        {results.podium.map((team, i) => (
          <div
            key={team.teamIndex}
            className={`rounded-lg border p-4 text-center ${PODIUM_STYLES[i].bg} ${PODIUM_STYLES[i].border} ${PODIUM_STYLES[i].order}`}
          >
            <div className={`text-xs font-semibold uppercase tracking-wide ${PODIUM_STYLES[i].text}`}>
              {PODIUM_STYLES[i].place}
            </div>
            <div className="mt-1 truncate text-base font-semibold">{team.label}&apos;s team</div>
            <div className="mt-1 text-xs text-textMuted">{team.members.join(', ')}</div>
            <div className="mt-2 text-sm text-textSub">
              {team.matchWins}-{team.matchLosses}-{team.matchTies} · {team.pts} pts
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
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
                className={`border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50 ${
                  r.rank <= 3 ? 'bg-accent/5' : ''
                }`}
              >
                <td className="px-3 py-2 font-medium text-textSub">{r.rank}</td>
                <td className="px-3 py-2 font-medium">{r.members.join(', ')}</td>
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