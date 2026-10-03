'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { withBasePath } from '@/lib/base-path';

export default function ExcludeStatsToggle({
  id,
  title,
  excluded,
}: {
  id: string;
  title: string;
  excluded: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onToggle() {
    if (
      !confirm(
        excluded
          ? `Include "${title}" in stats?\n\nIts games will count towards stats again.`
          : `Exclude "${title}" from stats?\n\nIts games will no longer count towards any stats`
      )
    ) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(withBasePath(`/api/matches/${id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ excludeFromStats: !excluded }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      title={
        excluded
          ? 'Include this tournament in player stats again'
          : 'Exclude this tournament from player stats (tour stays visible)'
      }
      className={`disabled:opacity-50 ${
        excluded ? 'font-medium text-taken hover:text-taken' : 'text-textSub hover:text-text'
      }`}
    >
      {busy ? 'Saving…' : excluded ? 'Include in stats' : 'Exclude'}
      {failed ? ' (failed)' : ''}
    </button>
  );
}