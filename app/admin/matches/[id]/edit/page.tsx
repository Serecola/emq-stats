import { notFound } from 'next/navigation';
import { getMatch, listSetRanks, listRecentExpectedRanks, listRecentVnExpectedRanks } from '@/lib/store';
import { requireAdminPage } from '@/lib/admin-session';
import MatchForm from '@/components/MatchForm';

export const dynamic = 'force-dynamic';

export default async function EditMatchPage({ params }: { params: { id: string } }) {
  // Admin gate (see lib/admin-session.ts — the Edge middleware cannot read the
  // secret, so the check that matters lives here in the Node runtime).
  await requireAdminPage(`/admin/matches/${params.id}/edit`);

  const match = await getMatch(params.id);
  if (!match) notFound();
  // Set Ranks and last-5 Expected Ranks (plus the VN-only variant) for the
  // form's autodrafter — see app/admin/new/page.tsx.
  const savedRanks = await listSetRanks();
  const expectedRanks = await listRecentExpectedRanks();
  const vnExpectedRanks = await listRecentVnExpectedRanks();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">Edit tournament</h1>
      <MatchForm existing={match} savedRanks={savedRanks} expectedRanks={expectedRanks} vnExpectedRanks={vnExpectedRanks} />
    </div>
  );
}
