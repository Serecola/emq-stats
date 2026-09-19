import Link from 'next/link';
import { listMatches } from '@/lib/store';
import ModeToggle, { type ModeFilter } from '@/components/ModeToggle';
import DeleteMatchButton from '@/components/DeleteMatchButton';
import LogoutButton from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: { mode?: string } }) {
  const activeFilter: ModeFilter =
    searchParams.mode === 'NGMC' || searchParams.mode === 'Erumode' ? searchParams.mode : 'all';

  const allMatches = await listMatches();
  const matches =
    activeFilter === 'all' ? allMatches : allMatches.filter((m) => m.mode === activeFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Admin</h1>
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

      <ModeToggle active={activeFilter} basePath="/admin" allLabel="All tournaments" />

      {matches.length === 0 ? (
        <p className="text-sm text-textMuted">
          {activeFilter === 'all' ? 'No tournaments yet.' : `No ${activeFilter} tournaments yet.`}
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
                  {m.teams.map((t) => t[0]).join(' vs ')} · {m.files.length} file
                  {m.files.length !== 1 ? 's' : ''} ·{' '}
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
