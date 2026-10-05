import { Fragment } from 'react';
import Link from 'next/link';
import { listMatchSummaries, listPlayerAliases } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import PlayerSearch from '@/components/PlayerSearch';
import { applyMatchFilter, matchFilterLabel, parseMatchFilter } from '@/lib/match-filter';
import {
  applyPlayerFilter,
  collectRosterNames,
  isEmptyPlayerFilter,
  parsePlayerFilter,
  playerFilterQuery,
} from '@/lib/tournament-search';
import { canonicalAliases } from '@/lib/player-aliases';
import { paginate, parsePage } from '@/lib/pagination';
import PaginationNav from '@/components/PaginationNav';
import { teamColor, teamColorBg } from '@/lib/team-colors';
import { weekRangeLabel, weekStart } from '@/lib/week';

export const dynamic = 'force-dynamic';

/**
 * How strongly a team's chip is tinted with its own color behind the names.
 * Kept as faint as the bracket's roster chips (BracketTeamRow) so the same
 * roster reads the same strength in both places, and so the light team colors
 * stay legible as text on the dark theme.
 */
const TEAM_CHIP_ALPHA = 0.18;

export default async function HomePage({
  searchParams,
}: {
  searchParams: {
    mode?: string;
    submode?: string;
    with?: string;
    without?: string;
    q?: string;
    add?: string;
    page?: string;
  };
}) {
  const filter = parseMatchFilter(searchParams);
  const playerFilter = parsePlayerFilter(searchParams);
  const page = parsePage(searchParams);

  const allMatches = await listMatchSummaries();
  // Fold the global aliases in before anything reads a name, so a player
  // entered under an old name in one tournament is the same filter as the name
  // their other tournaments use (see lib/player-aliases.ts).
  const aliases = canonicalAliases(await listPlayerAliases());
  // Both filters compose: the mode picks the tournaments, the player picks
  // which of those they were in.
  const matches = applyPlayerFilter(applyMatchFilter(allMatches, filter), playerFilter, aliases);
  const [current, ...past] = matches;
  // Only the past list is paginated — Current is a single card and the newest
  // tournament has to stay on screen whatever page is open. The slice is taken
  // after both filters, so `?page=` composes with them instead of paging a
  // list that is then narrowed (see pageHref, which keeps them in the link).
  const pastPage = paginate(past, page);
  const filterLabel = matchFilterLabel(filter);
  // Suggestions come from the roster of *all* tournaments, not the mode-
  // filtered ones, so a player who only ever played NGMC can still be found
  // while looking at Erumode.
  const names = collectRosterNames(allMatches, aliases);
  // Names the filter in the empty state, so "no tournaments" says which
  // player emptied the list rather than just "no matching tournaments".
  const playerFilterLabel = isEmptyPlayerFilter(playerFilter)
    ? ''
    : ` involving ${[
        ...playerFilter.with.map((k) => names.get(k)?.name ?? k),
        ...playerFilter.without.map((k) => `not ${names.get(k)?.name ?? k}`),
      ].join(', ')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <ModeToggle
          active={filter}
          basePath="/"
          allLabel="All tours"
          extraQuery={playerFilterQuery(playerFilter)}
        />
      </div>

      <PlayerSearch filter={playerFilter} names={names} />

      {!matches.length ? (
        <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm text-textMuted">
            {allMatches.length === 0
              ? 'No tournaments yet.'
              : `No ${filterLabel || 'matching'} tournaments${playerFilterLabel} yet.`}
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
            <section className="space-y-3">
              {/* Page nav above the heading: this is the long list, so the way
                  through it belongs at its top edge — and above the heading
                  rather than buried under 10 cards. */}
              <PaginationNav basePath="/" searchParams={searchParams} page={pastPage} />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                Past tournaments
              </h2>
              <div className="space-y-2">
                {pastPage.items.map((m, i) => {
                  // Same week grouping as the Tour Manager (see
                  // app/admin/page.tsx): tournaments come back ordered by
                  // their own date, so every tour of a given week is already
                  // contiguous. The row above is looked up in the *whole*
                  // filtered list — one for the Current card, plus this page's
                  // offset — rather than among the rendered rows, so a divider
                  // still appears wherever the week changes, including at the
                  // top of a later page where the row above isn't on screen.
                  const prev = matches[pastPage.offset + i];
                  const newWeek = weekStart(prev.date) !== weekStart(m.date);
                  return (
                    <Fragment key={m.id}>
                      {newWeek && (
                        <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-textMuted first:pt-0">
                          Week of {weekRangeLabel(m.date)}
                        </div>
                      )}
                      <MatchCard match={m} />
                    </Fragment>
                  );
                })}
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
  match: {
    id: string;
    title: string;
    createdAt: string;
    teams: string[][];
    // Uploads stored against the tournament, which is also its games-played
    // count — one export is one game. Labelled as games on the card; see the
    // note where it's rendered.
    fileCount: number;
    // Stats opt-out: excluded tours keep a red border + label so they never
    // read as silently missing from player aggregates.
    excludeFromStats?: boolean;
  };
  highlight?: boolean;
}) {
  const date = new Date(match.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const excluded = match.excludeFromStats === true;
  return (
    <Link
      href={`/matches/${match.id}`}
      className={`block rounded-lg border px-4 py-3 transition hover:border-textSub ${
        excluded
          ? 'border-taken/70 bg-surface hover:border-taken'
          : highlight
            ? 'border-accent/40 bg-surface'
            : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {match.title}
          {excluded && (
            <span
              title="Excluded from stats — this tournament feeds no player aggregates"
              className="ml-2 rounded-full border border-taken/50 px-1.5 py-0.5 align-middle text-[0.65rem] font-medium uppercase tracking-wide text-taken"
            >
              Excluded from stats
            </span>
          )}
        </span>
        <span className="text-xs text-textDim">{date}</span>
      </div>
      {/* Every player, grouped into one chip per team in that team's own color.
          The color is keyed by the team's position in `teams` (see
          lib/team-colors.ts), the same key Results, the Guess Rate table and
          the bracket use — so a player is this exact color here as on their
          tournament page, rather than a second palette just for this list. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
        {match.teams.map((team, teamIndex) =>
          // An empty team would render an empty chip — just the gap where one
          // should be, which reads as a rendering bug.
          team.length === 0 ? null : (
            <span
              key={teamIndex}
              style={{ background: teamColorBg(teamIndex, TEAM_CHIP_ALPHA) }}
              className="flex flex-wrap items-center gap-x-1.5 rounded px-1.5 py-0.5"
            >
              {team.map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  style={{ color: teamColor(teamIndex) }}
                  className="whitespace-nowrap"
                >
                  {name}
                </span>
              ))}
            </span>
          )
        )}
        {/* Games played, not uploads: one uploaded export is one game between
            two teams, which is how the rest of the app counts them (the match
            page's scope summary says "N games in scope", and
            `computeScheduleProgress` counts recorded games per pair). For a
            legal 4- or 6-team roster the numbers coincide exactly — 4 teams is
            a double round robin, so the 12 expected games and the 12 files
            are the same 12 — so `fileCount` is already the game count, and
            reading it as "12 files" only exposed the upload detail. */}
        <span className="text-textDim">
          · {match.fileCount} game{match.fileCount !== 1 ? 's' : ''}
        </span>
      </div>
    </Link>
  );
}