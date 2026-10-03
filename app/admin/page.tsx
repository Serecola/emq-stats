import { Fragment } from 'react';
import Link from 'next/link';
import { listMatchSummaries } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import DeleteMatchButton from '@/components/DeleteMatchButton';
import ExcludeStatsToggle from '@/components/ExcludeStatsToggle';
import ExportAllButton from '@/components/ExportAllButton';
import LogoutButton from '@/components/LogoutButton';
import { applyMatchFilter, matchFilterLabel, parseMatchFilter } from '@/lib/match-filter';
import { withBasePath } from '@/lib/base-path';
import { weekRangeLabel, weekStart } from '@/lib/week';
import type { MatchSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { mode?: string; submode?: string };
}) {
  const filter = parseMatchFilter(searchParams);

  const allMatches = await listMatchSummaries();
  const matches = applyMatchFilter(allMatches, filter);
  const filterLabel = matchFilterLabel(filter);
  // Same Current / Past split as the player view (see app/page.tsx): the
  // newest tournament is Current, everything else is Past. Week dividers run
  // inside each section, so the first Past row compares against Current to
  // decide whether it opens a new week.
  const [current, ...past] = matches;

  return (
    <div className="space-y-6">
      {/* The Tour Manager / Player Manager switcher lives in the header (see
          components/SiteNav.tsx) once you're inside /admin, so this page doesn't
          repeat it — the log-out control sits in the title row instead. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tour Manager</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg"
          >
            + New tournament
          </Link>
          {/* Every stored upload in one archive — all of it, not just what the
              filter below is showing — so it asks first. A plain <a> rather than
              a <Link>: the route answers with a file, and the basePath is added
              by hand for the same reason the login form's fetch is. */}
          <ExportAllButton
            tournaments={allMatches.length}
            files={allMatches.reduce((n, m) => n + m.fileCount, 0)}
          />
          <LogoutButton />
        </div>
      </div>

      <ModeToggle active={filter} basePath="/admin" allLabel="All tournaments" />

      {matches.length === 0 ? (
        <p className="text-sm text-textMuted">
          {allMatches.length === 0
            ? 'No tournaments yet.'
            : `No ${filterLabel || 'matching'} tournaments yet.`}
        </p>
      ) : (
        <div className="space-y-8">
          {current && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-textMuted">Current</h2>
              <div className="divide-y divide-borderSub rounded-lg border border-border bg-surface">
                <TourRow match={current} />
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Past tournaments
              </h2>
              <div className="divide-y divide-borderSub rounded-lg border border-border bg-surface">
                {past.map((m, i) => {
                  // Tournaments come back ordered by their own date (see
                  // listMatchSummaries), so every tour of a given week is already
                  // contiguous and comparing against the row above is all it takes
                  // to know where a divider belongs — under the mode filter too,
                  // which keeps the order and only drops rows. The row above
                  // lives in `matches` at offset i — past[0]'s predecessor is
                  // the Current card — so the divider also appears when Past
                  // opens in a different week than Current.
                  const newWeek = weekStart(matches[i].date) !== weekStart(m.date);
                  return (
                    <Fragment key={m.id}>
                      {/* Week divider *between* tours: every later week opens with
                          a band naming the Mon–Sun range the tours below it sit
                          in. The container's divide-y rules the band off above
                          and the row below, so it reads as a label between two
                          tours rather than a row of its own. */}
                      {newWeek && (
                        <div className="bg-surfaceAlt px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                          Week of {weekRangeLabel(m.date)}
                        </div>
                      )}
                      <TourRow match={m} />
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

function TourRow({ match: m }: { match: MatchSummary }) {
  // Stats opt-out: the row keeps a red edge + red pill (same treatment as the
  // player-view card in app/page.tsx) so an excluded tour never reads as
  // silently missing from player aggregates. Tour stays fully manageable —
  // only the cross-tournament stats skip it (see `statsMatches`).
  const excluded = m.excludeFromStats === true;
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${excluded ? 'border-l-2 border-l-taken' : ''}`}>
      <div className="min-w-0">
        {/* The title opens the editor, not the player view: from here
            the admin is managing tournaments, and the controls on this
            page all act on the saved record (roster, uploads, scores,
            deletion), never on the public rendering — the row's own
            Player view link is the way to that. */}
        <Link href={`/admin/matches/${m.id}/edit`} className="font-medium hover:underline">
          {m.title}
        </Link>
        {excluded && (
          <span
            title="Excluded from stats — this tournament feeds no player aggregates"
            className="ml-2 rounded-full border border-taken/50 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-taken"
          >
            Excluded from stats
          </span>
        )}
        <div className="mt-0.5 text-xs text-textMuted">
          {m.teams.map((t) => t[0]).join(' vs ')} · {m.fileCount} file
          {m.fileCount !== 1 ? 's' : ''} · {new Date(m.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3 text-xs">
        {/* The title above opens the editor, so this column is what the
            editor no longer offers: a click straight to what players
            see (the editor's own ShareMatchLink only copies the URL).
            Keeps the public page reachable from here at all. */}
        <Link href={`/matches/${m.id}`} className="text-textSub hover:text-text">
          Player view
        </Link>
        {/* One tournament's own archive, for pulling a single set of
            exports without exporting the lot. Same route, same gate —
            see the header button for why it's an <a>. */}
        <a
          href={withBasePath(`/api/admin/export?id=${encodeURIComponent(m.id)}`)}
          download
          className="text-textSub hover:text-text"
        >
          Export
        </a>
        {/* Stats opt-out lives on the row, not in the editor: one click flips
            just the flag (PATCH), no roster/upload round-trip. The tour stays
            listed, viewable and exportable — only the aggregates skip it. */}
        <ExcludeStatsToggle id={m.id} title={m.title} excluded={excluded} />
        <DeleteMatchButton id={m.id} title={m.title} />
      </div>
    </div>
  );
}
