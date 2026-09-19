'use client';

import { useState } from 'react';
import type { MatchStats, PlayerStats, TeamStats } from '@/lib/types';
import { SortableHeader, toggleSort, compareValues, type SortDir } from './SortableTable';

const TEAM_COLORS = ['#e0b152', '#4d8fe0', '#7ac97a', '#c97ac9', '#e08d4d', '#5fd1c9'];

type SortKey = 'uname' | 'correct' | 'taken' | 'blocked';

function accessor(m: PlayerStats, key: SortKey): number | string {
  switch (key) {
    case 'uname':
      return m.uname.toLowerCase();
    case 'correct':
      return m.correct;
    case 'taken':
      return m.taken;
    case 'blocked':
      return m.blocked;
  }
}

export default function StatsTable({ stats }: { stats: MatchStats }) {
  const [activePlayer, setActivePlayer] = useState<PlayerStats | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', (k) => setSortKey(k as SortKey), setSortDir);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceAlt text-left text-xs uppercase tracking-wide text-textMuted">
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <SortableHeader label="Player" sortKey="uname" activeKey={sortKey} dir={sortDir} onClick={onSort} align="left" />
            <SortableHeader label="Correct" sortKey="correct" activeKey={sortKey} dir={sortDir} onClick={onSort} className="w-20" />
            <SortableHeader
              label="Attacks"
              sortKey="taken"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onSort}
              className="w-24"
              title="Attacks / Effective attacks"
            />
            <SortableHeader
              label="Blocks"
              sortKey="blocked"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onSort}
              className="w-24"
              title="Blocks / Effective blocks"
            />
          </tr>
        </thead>
        <tbody>
          {stats.teams.map((team, ti) => (
            <TeamRows
              key={ti}
              team={team}
              color={TEAM_COLORS[ti % TEAM_COLORS.length]}
              onSelectPlayer={setActivePlayer}
              sortKey={sortKey}
              sortDir={sortDir}
            />
          ))}
          {stats.teams.every((t) => t.members.length === 0) && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-sm text-textMuted">
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {activePlayer && (
        <AttackModal player={activePlayer} onClose={() => setActivePlayer(null)} />
      )}
    </div>
  );
}

function TeamRows({
  team,
  color,
  onSelectPlayer,
  sortKey,
  sortDir,
}: {
  team: TeamStats;
  color: string;
  onSelectPlayer: (p: PlayerStats) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
}) {
  const members = sortKey
    ? [...team.members].sort((a, b) => compareValues(accessor(a, sortKey), accessor(b, sortKey), sortDir))
    : team.members;

  return (
    <>
      <tr className="border-b border-border bg-surfaceAlt/60">
        <td colSpan={5} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
            {team.label}&apos;s team
            <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}>
              ⚔ {team.taken}/{team.effTaken}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: 'rgba(77,143,224,0.1)', color: '#4d8fe0' }}>
              🛡 {team.blocked}/{team.effBlocked}
            </span>
            {team.missing.length > 0 && (
              <span className="font-normal normal-case tracking-normal text-textDim">
                absent: {team.missing.join(', ')}
              </span>
            )}
          </div>
        </td>
      </tr>
      {members.map((m, i) => (
        <tr
          key={m.uname}
          className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
        >
          <td className="px-3 py-2 text-xs text-textDim">{i + 1}</td>
          <td className="px-3 py-2">
            <button
              onClick={() => onSelectPlayer(m)}
              className="font-medium underline decoration-dotted decoration-textDim underline-offset-4 hover:text-text hover:decoration-textSub"
            >
              {m.uname}
            </button>
          </td>
          <td className="px-3 py-2 text-right text-textMuted">{m.correct}</td>
          <td className="px-3 py-2 text-right font-medium text-taken">
            {m.taken}<span className="opacity-60">/{m.effTaken}</span>
          </td>
          <td className="px-3 py-2 text-right font-medium text-blocked">
            {m.blocked}<span className="opacity-60">/{m.effBlocked}</span>
          </td>
        </tr>
      ))}
    </>
  );
}

function AttackModal({ player, onClose }: { player: PlayerStats; onClose: () => void }) {
  const sorted = [...player.attacks].sort(
    (a, b) => new Date(a.playedAt ?? 0).getTime() - new Date(b.playedAt ?? 0).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-12"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[calc(100vh-6rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{player.uname}</h2>
            <p className="text-xs text-textMuted">
              {player.attacks.length} attack{player.attacks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex-shrink-0 rounded-md border border-border text-sm text-textSub hover:border-textSub hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto py-1.5">
          {sorted.length === 0 && (
            <div className="px-5 py-7 text-center text-sm text-textMuted">
              No attacks recorded for this player.
            </div>
          )}
          {sorted.map((a, i) => (
            <div key={i} className="flex flex-col gap-1.5 border-b border-borderSub px-5 py-2.5 text-sm last:border-b-0">
              <div className="flex items-start gap-2.5">
                <div className="w-5 flex-shrink-0 pt-px text-xs text-textDim">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium [overflow-wrap:anywhere]">
                    {a.artist} - {a.title}
                  </div>
                  {a.vn && <div className="mt-0.5 text-xs text-textMuted">{a.vn}</div>}
                </div>
              </div>
              <div className="ml-[30px] flex flex-wrap gap-1.5">
                {a.effective && (
                  <span className="text-xs opacity-60" title="Effective attack">⚡</span>
                )}
                {a.teams.map((t, ti) => (
                  <span
                    key={ti}
                    className="flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: 'rgba(224,82,82,0.1)', color: '#e05252' }}
                  >
                    vs {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}