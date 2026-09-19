import type { MvpStats } from '@/lib/mvp';

const MEDALS = ['🥇', '🥈', '🥉'];

/** "+4.56" / "−1.68" — always signed, two decimals. */
function signed(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`;
}

/**
 * MVP stats block: every team's actual level (Σ of its members' Performance,
 * displayed to 1dp each) against the level its roster implies (Σ of their
 * Current Ranks), then the three players who most outplayed their rank.
 */
export default function MvpSection({ stats }: { stats: MvpStats }) {
  if (stats.teams.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Team Expected vs Actual
        </h3>
        <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
          {stats.teams.map((team) => (
            <p key={team.teamIndex} className="text-xs leading-relaxed">
              {team.members.map((m) => (
                <span key={m.uname} className="mr-1.5 whitespace-nowrap">
                  <span className="text-textSub">{m.uname}</span>{' '}
                  <span className="text-textMuted">({m.playedLike.toFixed(1)})</span>
                </span>
              ))}
              <span className="font-semibold text-text">= {team.playedLike.toFixed(2)}</span>
              {team.hasRanks && (
                <span className="ml-1 whitespace-nowrap">
                  <span className={team.diff >= 0 ? 'text-[#22c55e]' : 'text-taken'}>
                    ({signed(team.diff)}
                  </span>
                  <span className="text-textDim">, from {team.expectedRank})</span>
                </span>
              )}
            </p>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">MVPs</h3>
        {stats.mvps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2.5 text-xs text-textMuted">
            No player ranks in this roster — add a &quot;(N)&quot; next to each name in the team
            paste to compare players against their rank.
          </p>
        ) : (
          <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
            {stats.mvps.map((p, i) => (
              <p key={p.uname} className="text-xs leading-relaxed">
                <span className="mr-1">{MEDALS[i]}</span>
                <span className="font-medium text-text">{p.uname}</span>
                <span className="text-textMuted">
                  : Played like{' '}
                  <span className="font-semibold text-accent">{p.playedLike.toFixed(2)}</span>{' '}
                  (Current Rank: {p.rank}, {' '}
                  <span className={p.diff >= 0 ? 'text-[#22c55e]' : 'text-taken'}>
                    {signed(p.diff)}
                  </span>
                  )
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
