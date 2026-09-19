import { notFound } from 'next/navigation';
import { getMatch } from '@/lib/store';
import MatchForm from '@/components/MatchForm';

export const dynamic = 'force-dynamic';

export default async function EditMatchPage({ params }: { params: { id: string } }) {
  const match = await getMatch(params.id);
  if (!match) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold">Edit tournament</h1>
      <MatchForm existing={match} />
    </div>
  );
}
