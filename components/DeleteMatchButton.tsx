'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Deletes one tournament. Confirms first, naming the tournament: this is the
 * only control in the app that destroys an entire record (roster, uploaded
 * exports, entered scores, tags) in a single irreversible request, and the
 * Delete buttons sit in a list where the wrong row is easy to hit.
 */
export default function DeleteMatchButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Delete "${title}"?\n\nThis removes the tournament and all its uploaded files. This can't be undone.`)) {
      return;
    }
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
