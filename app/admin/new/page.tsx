import MatchForm from '@/components/MatchForm';

export default function NewMatchPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">New tournament</h1>
      <MatchForm />
    </div>
  );
}
