import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatch } from '@/lib/store';
import { computeMatchStats } from '@/lib/stats';
import type { MatchStats } from '@/lib/types';
import { computeGuessRateStats, type GuessRateStats } from '@/lib/guess-stats';
import { computeMatchResults } from '@/lib/results';
import { computeMvpStats, type MvpStats } from '@/lib/mvp';
import StatsTable from '@/components/StatsTable';
import GuessRateTable from '@/components/GuessRateTable';
import ResultsSection from '@/components/ResultsSection';
import MvpSection from '@/components/MvpSection';
import RoundRobinGrid from '@/components/RoundRobinGrid';

export const dynamic = 'force-dynamic';

function ErrorBox({ label, err }: { label: string; err: unknown }) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return (
    <div className="rounded-lg border border-taken/40 bg-taken/5 p-4 text-sm">
      <p className="font-semibold text-taken">{label} failed to compute</p>
      <p className="mt-1 text-xs text-textSub">{message}</p>
      {stack && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[0.68rem] text-textDim">
          {stack}
        </pre>
      )}
    </div>
  );
}

export default async function MatchPage({ params }: { params: { id: string } }) {
  const match = await getMatch(params.id);
  if (!match) notFound();

  const date = new Date(match.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Treat matches saved before `mode` existed (empty string) as NGMC rather
  // than silently hiding NGMC-only sections — only an explicit "Erumode"
  // opts out.
  const isNgmc = match.mode !== 'Erumode';

  // Computed synchronously (not inside a nested async component) so a
  // thrown error is actually catchable here — Server Component children
  // can't be caught by a parent's try/catch once React starts awaiting
  // them, only errors raised in this same function body can.
  let guessStats: GuessRateStats | null = null;
  let guessError: unknown = null;
  try {
    guessStats = computeGuessRateStats(match);
  } catch (err) {
    guessError = err;
  }

  let matchStats: MatchStats | null = null;
  let matchStatsError: unknown = null;
  if (isNgmc) {
    try {
      matchStats = computeMatchStats(match);
    } catch (err) {
      matchStatsError = err;
    }
  }

  let results: ReturnType<typeof computeMatchResults> | null = null;
  let resultsError: unknown = null;
  try {
    results = computeMatchResults(match);
  } catch (err) {
    resultsError = err;
  }

  // MVP stats ride on the guess-rate ratings (Performance per player), so
  // they can only be computed once those succeeded.
  let mvpStats: MvpStats | null = null;
  let mvpError: unknown = null;
  if (guessStats) {
    try {
      mvpStats = computeMvpStats(match, guessStats);
    } catch (err) {
      mvpError = err;
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-xs text-textMuted hover:text-text">← All tournaments</Link>
        <h1 className="mt-2 text-lg font-semibold">{match.title}</h1>
        <p className="text-xs text-textDim">
          {date} · {match.files.length} file{match.files.length !== 1 ? 's' : ''}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">Bracket</h2>
        <RoundRobinGrid match={match} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">Results</h2>
        {resultsError ? (
          <ErrorBox label="Results" err={resultsError} />
        ) : results ? (
          <ResultsSection results={results} />
        ) : null}

        {mvpError ? (
          <ErrorBox label="MVP stats" err={mvpError} />
        ) : mvpStats ? (
          <MvpSection stats={mvpStats} />
        ) : null}
      </section>

      <section className="space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">Stats</h2>

        {guessError ? (
          <ErrorBox label="Guess Rate stats" err={guessError} />
        ) : guessStats ? (
          <GuessRateTable stats={guessStats} teams={match.teams} playerRanks={match.playerRanks} />
        ) : null}

        {isNgmc &&
          (matchStatsError ? (
            <ErrorBox label="Attacks & Blocks" err={matchStatsError} />
          ) : matchStats ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Attacks &amp; Blocks
              </h3>
              <StatsTable stats={matchStats} />
            </div>
          ) : null)}
      </section>
    </div>
  );
}