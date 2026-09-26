import Link from 'next/link';
import { listMatchSummaries } from '@/lib/store';
import ModeToggle from '@/components/ModeToggle';
import DeleteMatchButton from '@/components/DeleteMatchButton';
import LogoutButton from '@/components/LogoutButton';
import { applyMatchFilter, matchFilterLabel, parseMatchFilter } from '@/lib/match-filter';

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
          components/SiteNav.tsx) once you're inside /admin, so this page no
          longer repeats it — the log-out control moves into the title row. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Tour Manager</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg"
          >
            + New tournament
          </Link>
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
                <Link href={`/matches/${m.id}`} className="font-medium hover:underline">
                  {m.title}
                </Link>
                <div className="mt-0.5 text-xs text-textMuted">
                  {m.teams.map((t) => t[0]).join(' vs ')} · {m.fileCount} file
                  {m.fileCount !== 1 ? 's' : ''} ·{' '}
                  {new Date(m.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3 text-xs">
                <Link href={`/admin/matches/${m.id}/edit`} className="text-textSub hover:text-text">
                  Edit
                </Link>
                <DeleteMatchButton id={m.id} title={m.title} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
