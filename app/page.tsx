import Link from 'next/link';
import { listMatchSummaries } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import { applyMatchFilter, matchFilterLabel, parseMatchFilter } from '@/lib/match-filter';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string };
}) {
  const filter = parseMatchFilter(searchParams);

  const allMatches = await listMatchSummaries();
  const matches = applyMatchFilter(allMatches, filter);
  const [current, ...past] = matches;
  const filterLabel = matchFilterLabel(filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <ModeToggle active={filter} basePath="/" allLabel="All tours" />
      </div>

      {!matches.length ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-textMuted">
            {allMatches.length === 0
              ? 'No tournaments yet.'
              : `No ${filterLabel || 'matching'} tournaments yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {current && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-textMuted">Current</h2>
              <MatchCard match={current} highlight />
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-textMuted">Past tournaments</h2>
              <div className="space-y-2">
                {past.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  highlight,
}: {
  match: { id: string; title: string; createdAt: string; teams: string[][]; fileCount: number };
  highlight?: boolean;
}) {
  const date = new Date(match.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <Link
      href={`/matches/${match.id}`}
      className={`block rounded-lg border px-4 py-3 transition hover:border-textSub ${
        highlight ? 'border-accent/40 bg-surface' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{match.title}</span>
        <span className="text-xs text-textDim">{date}</span>
      </div>
      <div className="mt-1 text-xs text-textMuted">
        {match.teams.map((t) => t[0]).join(' vs ')} · {match.fileCount} file
        {match.fileCount !== 1 ? 's' : ''}
      </div>
    </Link>
  );
}