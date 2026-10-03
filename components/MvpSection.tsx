import { teamColor } from '@/lib/team-colors';
import { formatMvpSummary, signed, type MvpStats } from '@/lib/mvp';
import CopyMvpButton from './CopyMvpButton';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * MVP stats block: every team's actual level (Σ of its members' Performance,
 * displayed to 1dp each) against the level its roster implies (Σ of their
 * Current Ranks), then the three players who most outplayed their rank.
 */
export default function MvpSection({ stats }: { stats: MvpStats }) {
  if (stats.teams.length === 0) return null;

  // Formatted here, on the server, so the button is handed a finished string
  // and both blocks below stay readable as markup.
  const summary = formatMvpSummary(stats);

  return (
    <div className="space-y-4">
      <div>
        {/* The copy covers both blocks — the heading it sits next to is just
            the one people look for first. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-textMuted">
            Team Expected vs Actual
          </h3>
          <CopyMvpButton text={summary} />
        </div>
        <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
          {stats.teams.map((team) => (
            <p key={team.teamIndex} className="text-sm leading-relaxed">
              {team.members.map((m) => (
                <span key={m.uname} className="mr-1.5 whitespace-nowrap">
                  <span style={{ color: teamColor(team.teamIndex) }}>{m.uname}</span>{' '}
                  <span className="text-textMuted">({m.playedLike.toFixed(1)})</span>
                </span>
              ))}
              <span className="font-semibold text-text">= {team.playedLike.toFixed(2)}</span>
              {team.hasRanks && (
                <span className="ml-1 whitespace-nowrap">
                  <span className={team.diff >= 0 ? 'text-promote' : 'text-taken'}>
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
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-textMuted">MVPs</h3>
        {stats.mvps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-textMuted">
            No player ranks in this roster — add a &quot;(N)&quot; next to each name in the team
            paste to compare players against their rank.
          </p>
        ) : (
          <div className="space-y-1 rounded-lg border border-border bg-surface px-3 py-2.5">
            {stats.mvps.map((p, i) => (
              <p key={p.uname} className="text-sm leading-relaxed">
                <span className="mr-1">{MEDALS[i]}</span>
                <span className="font-medium" style={{ color: teamColor(p.teamIndex) }}>
                  {p.uname}
                </span>
                <span className="text-textMuted">
                  : Played like{' '}
                  <span className="font-semibold text-accent">{p.playedLike.toFixed(2)}</span>{' '}
                  (Current Rank: {p.rank}, {' '}
                  <span className={p.diff >= 0 ? 'text-promote' : 'text-taken'}>
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
