import Link from 'next/link';
import { listMatchSummaries } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import DeleteMatchButton from '@/components/DeleteMatchButton';
import ExportAllButton from '@/components/ExportAllButton';
import LogoutButton from '@/components/LogoutButton';
import { applyMatchFilter, matchFilterLabel, parseMatchFilter } from '@/lib/match-filter';
import { withBasePath } from '@/lib/base-path';

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
        <div className="divide-y divide-borderSub rounded-lg border border-border bg-surface">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {/* The title opens the editor, not the player view: from here
                    the admin is managing tournaments, and the controls on this
                    page all act on the saved record (roster, uploads, scores,
                    deletion), never on the public rendering — the row's own
                    Player view link is the way to that. */}
                <Link href={`/admin/matches/${m.id}/edit`} className="font-medium hover:underline">
                  {m.title}
                </Link>
                <div className="mt-0.5 text-xs text-textMuted">
                  {m.teams.map((t) => t[0]).join(' vs ')} · {m.fileCount} file
                  {m.fileCount !== 1 ? 's' : ''} ·{' '}
                  {new Date(m.createdAt).toLocaleDateString()}
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
                <DeleteMatchButton id={m.id} title={m.title} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
