import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatch, listPlayerAliases, listPlayerTags } from '@/lib/store';
import { withAliases } from '@/lib/player-aliases';
import { computeMatchStats } from '@/lib/stats';
import type { MatchStats } from '@/lib/types';
import { computeGuessRateStats, type GuessRateStats } from '@/lib/guess-stats';
import {
  filesInStatsScope,
  generateRoundRobin,
  isFullScope,
  matchFilesToBracket,
  summarizeBracketFiles,
  type BracketAssignment,
  type StatsScope,
} from '@/lib/schedule';
import { computeMatchResults } from '@/lib/results';
import { computeMvpStats, type MvpStats } from '@/lib/mvp';
import { computeSynergyStats, type SynergyStats } from '@/lib/synergy';
import { hasAdminSession } from '@/lib/admin-session';
import StatsTable from '@/components/StatsTable';
import GuessRateTable from '@/components/GuessRateTable';
import ResultsSection from '@/components/ResultsSection';
import MvpSection from '@/components/MvpSection';
import SynergySection from '@/components/SynergySection';
import RoundRobinGrid from '@/components/RoundRobinGrid';
import MatchSectionNav, { type JumpSection } from '@/components/MatchSectionNav';
import BackToTop from '@/components/BackToTop';

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

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { rounds?: string; games?: string };
}) {
  const match = await getMatch(params.id);
  if (!match) notFound();

  // An admin viewing the public page gets a shortcut back into this
  // tournament's editor; a normal visitor isn't shown the control at all (the
  // session cookie is httpOnly, so only the server can answer this — and
  // answering it means hashing the secret, hence the await).
  const isAdmin = await hasAdminSession();

  // Global Player/Bot tags for the bot pills in the stats tables below.
  const playerTags = await listPlayerTags();
  // Global aliases, folded under this match's own renames so a player who
  // shows up here under an old name is credited to the same person the
  // cross-tournament views (and the Set Ranks) use. Match-level renames still
  // win — see withAliases.
  const renames = withAliases(match.renames, await listPlayerAliases());

  const date = new Date(match.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Treat matches saved before `mode` existed (empty string) as NGMC rather
  // than silently hiding NGMC-only sections — only an explicit "Erumode"
  // opts out.
  const isNgmc = match.mode !== 'Erumode';

  // Which uploaded file belongs to which bracket fixture — resolved here
  // because it needs each file's raw JSON (to detect the two teams playing),
  // and RoundRobinGrid is a client component: whatever it receives is
  // serialized into the page. It only renders scores, so only scores (and
  // labels) are handed over, keeping ~2 MB of raw exports out of the payload.
  const assignment = matchFilesToBracket(match.teams, match.files, match.renames);
  const bracketFiles = summarizeBracketFiles(assignment);

  // Stats scope from the round/game selector (see MatchStatsScope + the game
  // chips inside RoundRobinGrid): rounds as `?rounds=3,4,6`, games as a comma
  // list of slots like `?games=r5m0,r6m0`, anything unparseable treated as
  // absent. Scoping works by
  // swapping the file list every computation below reads, so scoped stats are
  // the exact numbers those files would produce on their own — not
  // post-filtered rows. Only files placed on the bracket participate; slot-
  // less uploads count towards the full view only.
  const scope: StatsScope = parseStatsScope(searchParams, assignment);
  const scopedFiles = filesInStatsScope(match.teams, match.files, match.renames, scope);
  const scopedMatch = { ...match, files: scopedFiles };
  const scopedLabel = scopeLabel(scope, match.teams);

  // Computed synchronously (not inside a nested async component) so a
  // thrown error is actually catchable here — Server Component children
  // can't be caught by a parent's try/catch once React starts awaiting
  // them, only errors raised in this same function body can.
  let guessStats: GuessRateStats | null = null;
  let guessError: unknown = null;
  try {
    guessStats = computeGuessRateStats({ ...scopedMatch, renames });
  } catch (err) {
    guessError = err;
  }

  let matchStats: MatchStats | null = null;
  let matchStatsError: unknown = null;
  if (isNgmc) {
    try {
      matchStats = computeMatchStats({ ...scopedMatch, renames });
    } catch (err) {
      matchStatsError = err;
    }
  }

  let results: ReturnType<typeof computeMatchResults> | null = null;
  let resultsError: unknown = null;
  try {
    results = computeMatchResults(scopedMatch);
  } catch (err) {
    resultsError = err;
  }

  // MVP stats ride on the guess-rate ratings (Performance per player), so
  // they can only be computed once those succeeded.
  let mvpStats: MvpStats | null = null;
  let mvpError: unknown = null;
  if (guessStats) {
    try {
      mvpStats = computeMvpStats(scopedMatch, guessStats);
    } catch (err) {
      mvpError = err;
    }
  }

  // Team synergy (who lands whose list) reads the same scoped files as the
  // tables above, so it narrows with the round/game selector too. Computed for
  // both modes — only the Attacks & Blocks table below is NGMC-only.
  let synergyStats: SynergyStats | null = null;
  let synergyError: unknown = null;
  try {
    synergyStats = computeSynergyStats({ ...scopedMatch, renames });
  } catch (err) {
    synergyError = err;
  }

  // Jump targets for the left-hand rail (MatchSectionNav). Listed in the order
  // they appear and gated on the same conditions that render each block, so a
  // link never points at a section that isn't on the page — the NGMC-only
  // Attacks & Blocks table and the synergy block (which hides itself when no
  // song in scope produced a chance) are both conditional. The MVP block sits
  // inside Results and isn't listed: it's part of that section, not a
  // destination of its own.
  const jumpSections: JumpSection[] = [
    { id: 'bracket', label: 'Bracket' },
    { id: 'results', label: 'Results' },
    { id: 'stats', label: 'Stats' },
    ...(isNgmc && matchStats ? [{ id: 'attacks-blocks', label: 'Attacks & Blocks', nested: true }] : []),
    ...(synergyStats?.hasData ? [{ id: 'team-synergy', label: 'Team Synergy', nested: true }] : []),
  ];

  return (
    <div className="space-y-8">
      <MatchSectionNav sections={jumpSections} />
      <BackToTop />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-xs text-textMuted hover:text-text">
            ← All tournaments
          </Link>
          {/* Admin-only way back into the editor. The editor's own Player view
              link (ShareMatchLink) points the other way, so an admin can move
              between managing and reading the same tournament from here. */}
          {isAdmin && (
            <Link
              href={`/admin/matches/${match.id}/edit`}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-textSub transition-colors hover:border-textSub hover:text-text"
            >
              Edit tournament
            </Link>
          )}
        </div>
        {/* Stats opt-out banner: the tour's own bracket/results/stats below read
            exactly as usual — only the cross-tournament aggregates (last-5 /
            all-time) skip it. Loud on purpose, so the exclusion never reads as
            silently missing stats. */}
        {match.excludeFromStats && (
          <div className="mt-3 rounded-lg border border-taken/50 bg-taken/5 px-4 py-2.5 text-sm">
            <span className="font-semibold text-taken">Excluded from stats</span>
            <span className="text-textSub">
              {' '}
              — this tournament does not count towards any player&apos;s last-5 or all-time stats.
            </span>
          </div>
        )}
        <h1 className="mt-2 text-lg font-semibold">{match.title}</h1>
        <p className="text-xs text-textDim">
          {date} · {match.files.length} file{match.files.length !== 1 ? 's' : ''}
        </p>
      </div>

      <section id="bracket" className="space-y-3 scroll-mt-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">Bracket</h2>
          {/* The scope is picked on the bracket itself (each round heading owns
              its own chip), so all that's left up here is the summary of it and
              the way back out. */}
          {!isFullScope(scope) && (
            <div className="flex items-center gap-2 text-xs text-textDim">
              <span>
                {scopedFiles.length} game{scopedFiles.length !== 1 ? 's' : ''} in scope
              </span>
              <Link
                href={`/matches/${match.id}`}
                scroll={false}
                className="text-textMuted hover:text-text"
              >
                Reset to all stats
              </Link>
            </div>
          )}
        </div>
        <RoundRobinGrid
          teams={match.teams}
          files={bracketFiles}
          scope={scope}
          matchPath={`/matches/${match.id}`}
        />
      </section>

      <section id="results" className="space-y-3 scroll-mt-16">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">
            Results{scopedLabel ? ` · ${scopedLabel}` : ''}
          </h2>
        </div>
        {resultsError ? (
          <ErrorBox label="Results" err={resultsError} />
        ) : results ? (
          <ResultsSection results={results} playerRanks={match.playerRanks} />
        ) : null}

        {mvpError ? (
          <ErrorBox label="MVP stats" err={mvpError} />
        ) : mvpStats ? (
          <MvpSection stats={mvpStats} />
        ) : null}
      </section>

      <section id="stats" className="space-y-5 scroll-mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-textSub">
          Stats{scopedLabel ? ` · ${scopedLabel}` : ''}
        </h2>

        {guessError ? (
          <ErrorBox label="Guess Rate stats" err={guessError} />
        ) : guessStats ? (
          <GuessRateTable
            stats={guessStats}
            teams={match.teams}
            playerRanks={match.playerRanks}
            playerTags={playerTags}
          />
        ) : null}

        {isNgmc &&
          (matchStatsError ? (
            <ErrorBox label="Attacks & Blocks" err={matchStatsError} />
          ) : matchStats ? (
            <div id="attacks-blocks" className="scroll-mt-16">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-textMuted">
                Attacks &amp; Blocks
              </h3>
              <StatsTable stats={matchStats} playerTags={playerTags} />
            </div>
          ) : null)}

        {synergyError ? (
          <ErrorBox label="Team synergy" err={synergyError} />
        ) : synergyStats?.hasData ? (
          <div id="team-synergy" className="scroll-mt-16">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-textMuted">
              Team Synergy
            </h3>
            <SynergySection stats={synergyStats} playerTags={playerTags} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Parses `?rounds=` / `?games=` from the stats-scope selector into the scope
 * the computed views aggregate over. `rounds` is a comma list of displayed
 * round numbers (Round 1..6); `games` is a comma list of bracket slot keys —
 * any number of individual games can be scoped at once, e.g. Round 5 Game 1
 * together with Round 6 Game 1 as `?games=<slot>,<slot>` (slot keys are the
 * persisted bracket fixtures, not display round numbers). Rounds and games
 * never mix: the selector
 * clears games when a round is checked and vice versa, so `games` is ignored
 * while rounds are present. Every entry is verified against this
 * tournament's own bracket — slots against its fixtures, round numbers
 * against its round list — so bookmarked/hand-edited URLs can't select
 * things that don't exist here.
 */
function parseStatsScope(
  searchParams: { rounds?: string; games?: string },
  assignment: BracketAssignment
): StatsScope {
  const rounds = String(searchParams.rounds ?? '')
    .split(',')
    .map((r) => Number(r.trim()))
    .filter((r) => Number.isInteger(r) && r >= 1)
    .filter((r, i, all) => all.indexOf(r) === i)
    .sort((a, b) => a - b);
  const bySlot = assignment.bySlot;
  const slots = Object.keys(bySlot);
  const games =
    rounds.length === 0 && typeof searchParams.games === 'string'
      ? searchParams.games
          .split(',')
          .map((s) => s.trim())
          .filter((s, i, all) => s !== '' && all.indexOf(s) === i && slots.includes(s))
      : [];
  return { rounds, games };
}

/**
 * One-line scope summary for the section headings: "Rounds 3, 4, 6" for round
 * picks, the fixtures' own bracket labels ("Round 5 Game 1, Round 6 Game 1")
 * for game picks, nothing for the full scope.
 */
function scopeLabel(scope: StatsScope, teams: Parameters<typeof generateRoundRobin>[0]): string {
  if (isFullScope(scope)) return '';
  if (scope.rounds.length > 0) {
    return `Round${scope.rounds.length > 1 ? 's' : ''} ${scope.rounds.join(', ')}`;
  }
  // Game picks are named by their bracket card label rather than the raw
  // slot key, so the heading matches what the card says. Slots were already
  // validated in parseStatsScope; the fallback only exists so a label
  // survives any future path that skips that check.
  const names = new Map<string, string>();
  for (const round of generateRoundRobin(teams)) {
    round.matchups.forEach((m, i) => {
      names.set(m.slot, `Round ${round.displayRound} Game ${i + 1}`);
    });
  }
  const labels = scope.games
    .map((slot) => names.get(slot))
    .filter((label): label is string => label !== undefined);
  if (labels.length > 0) return labels.join(', ');
  return `${scope.games.length} game${scope.games.length === 1 ? '' : 's'}`;
}