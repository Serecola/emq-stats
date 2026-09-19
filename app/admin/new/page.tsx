import MatchForm from '@/components/MatchForm';
import AdminNav from '@/components/AdminNav';
import { listSetRanks } from '@/lib/store';

export default async function NewMatchPage() {
  // The autodrafter balances with the Player Manager's Set Ranks for the
  // mode + sub-mode chosen in the form, so it needs the saved table up front.
  const savedRanks = await listSetRanks();

  return (
    <div className="max-w-3xl space-y-4">
      <AdminNav active="tours" />
      <h1 className="text-lg font-semibold">New tournament</h1>
      <MatchForm savedRanks={savedRanks} />
    </div>
  );
}
