'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteMatchButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusy(true);
    await fetch(`/api/matches/${id}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={onDelete} disabled={busy} className="text-textDim hover:text-taken disabled:opacity-50">
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
