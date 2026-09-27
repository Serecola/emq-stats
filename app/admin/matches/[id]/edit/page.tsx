import { notFound } from 'next/navigation';
import { getMatch, listSetRanks, listRecentExpectedRanks } from '@/lib/store';
import MatchForm from '@/components/MatchForm';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

export default async function EditMatchPage({ params }: { params: { id: string } }) {
  const match = await getMatch(params.id);
  if (!match) notFound();
  // Set Ranks and last-5 Expected Ranks for the form's autodrafter — see
  // app/admin/new/page.tsx.
  const savedRanks = await listSetRanks();
  const expectedRanks = await listRecentExpectedRanks();

  return (
    <div className="max-w-2xl space-y-4">
      <AdminNav active="tours" />
      <h1 className="text-lg font-semibold">Edit tournament</h1>
      <MatchForm existing={match} savedRanks={savedRanks} expectedRanks={expectedRanks} />
    </div>
  );
}
