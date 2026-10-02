import MatchForm from '@/components/MatchForm';
import { listSetRanks, listRecentExpectedRanks, listRecentVnExpectedRanks } from '@/lib/store';

export default async function NewMatchPage() {
  // The autodrafter balances with the Player Manager's Set Ranks (and the
  // last-5-tournaments Expected Ranks, plus the VN-only variant) for the mode
  // + sub-mode chosen in the form, so it needs all three tables up front.
  const savedRanks = await listSetRanks();
  const expectedRanks = await listRecentExpectedRanks();
  const vnExpectedRanks = await listRecentVnExpectedRanks();

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">New tournament</h1>
      <MatchForm savedRanks={savedRanks} expectedRanks={expectedRanks} vnExpectedRanks={vnExpectedRanks} />
    </div>
  );
}
