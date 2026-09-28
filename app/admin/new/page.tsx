import MatchForm from '@/components/MatchForm';
import { listSetRanks, listRecentExpectedRanks } from '@/lib/store';

export default async function NewMatchPage() {
  // The autodrafter balances with the Player Manager's Set Ranks (and the
  // last-5-tournaments Expected Ranks) for the mode + sub-mode chosen in the
  // form, so it needs both tables up front.
  const savedRanks = await listSetRanks();
  const expectedRanks = await listRecentExpectedRanks();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">New tournament</h1>
      <MatchForm savedRanks={savedRanks} expectedRanks={expectedRanks} />
    </div>
  );
}
