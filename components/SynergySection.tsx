'use client';

import { Fragment, useState } from 'react';
import { teamColor } from '@/lib/team-colors';
import type { SynergyMember, SynergyRead, SynergyStats, SynergyTeam } from '@/lib/synergy';
import type { PlayerTag } from '@/lib/types';
import {
  DENSE_CELL_PAD,
  STATS_BODY_TEXT,
  STATS_HEADER_TEXT,
  SortableHeader,
  compareValues,
  toggleSort,
  type SortDir,
} from './SortableTable';
import PlayerTagBadge from './PlayerTagBadge';

type SortKey = 'uname' | 'ally' | 'enemy' | 'readAlly' | 'readEnemy' | 'songs';

const KEY_OF: Record<SortKey, (m: SynergyMember) => number | string> = {
  uname: (m) => m.uname.toLowerCase(),
  ally: (m) => m.vsAlly.rate,
  enemy: (m) => m.vsEnemy.rate,
  readAlly: (m) => m.readByAlly.rate,
  readEnemy: (m) => m.readByEnemy.rate,
  songs: (m) => m.songs,
};

function heat(rate: number): string {
  if (rate >= 50) return 'text-taken';
  if (rate >= 25) return 'text-accent';
  return 'text-textSub';
}

/**
 * A read as `12.5%` over `5/40`. No chances at all renders as an em dash
 * rather than `0.0%` — "nobody's list ever came up" and "they read it and
 * missed" are different facts, and only one of them is a 0% result.
 */
function ReadValue({ read, color }: { read: SynergyRead; color?: boolean }) {
  if (read.chances === 0) return <span className="text-textDim">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className={color ? `font-medium ${heat(read.rate)}` : 'text-text'}>
        {read.rate.toFixed(1)}%
      </span>
      <span className="ml-1 text-[0.68rem] tabular-nums text-textDim">
        {read.hits}/{read.chances}
      </span>
    </span>
  );
}

function TeamLabel({ team }: { team: SynergyTeam }) {
  return (
    <span className="flex items-center gap-2 font-medium">
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: teamColor(team.teamIndex) }} />
      {team.label}&apos;s team
    </span>
  );
}

/**
 * Per-team summary, ranked toughest-lists-first. Ally Offlist, Enemy Offlist
 * and Enemy Snipe are each shown as a rate over the pooled counts behind it;
 * List Difficulty is the mean of Ally Offlist and Enemy Snipe, and is the only
 * column that claims a direction is good.
 */
function TeamSummaryTable({ teams }: { teams: SynergyTeam[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={`w-full border-collapse ${STATS_BODY_TEXT}`}>
        <thead>
          <tr className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}>
            <th className={`${DENSE_CELL_PAD} w-8 text-left font-medium`}>#</th>
            <th className={`${DENSE_CELL_PAD} text-left font-medium`}>Team</th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Songs this team correctly guessed that were on a teammate's list."
            >
              Ally Offlist
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Songs this team's members correctly guessed that were on another team's list."
            >
              Enemy Offlist
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Songs on this team's lists that a member of another team got right."
            >
              Enemy Snipe
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="% of how free the team's list is for both ally and enemy teams."
            >
              List Difficulty
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, i) => (
            <tr
              key={team.teamIndex}
              className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
            >
              <td className={`${DENSE_CELL_PAD} text-textDim`}>{i + 1}</td>
              <td className={DENSE_CELL_PAD}>
                <TeamLabel team={team} />
                {team.missing.length > 0 && (
                  <span className="ml-4 block text-[0.68rem] text-textDim">
                    absent: {team.missing.join(', ')}
                  </span>
                )}
              </td>
              <td className={`${DENSE_CELL_PAD} text-right`}>
                <ReadValue read={team.allyRead} />
              </td>
              <td className={`${DENSE_CELL_PAD} text-right`}>
                <ReadValue read={team.enemyRead} />
              </td>
              <td className={`${DENSE_CELL_PAD} text-right`}>
                <ReadValue read={team.readByEnemies} />
              </td>
              <td className={`${DENSE_CELL_PAD} text-right`}>
                {team.listdifficulty === null ? (
                  <span className="text-textDim">—</span>
                ) : (
                  <span className={`font-medium ${heat(team.listdifficulty)}`}>
                    {team.listdifficulty.toFixed(1)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The per-member table — the question this section actually exists to answer:
 * how well does each person hit their teammate's list, and the enemy team's?
 *
 * Rows stay grouped by team (the sorting applies *within* a group, as in the
 * Attacks & Blocks table) because a player's two best columns only make sense
 * relative to who they were sitting with.
 *
 * The two reader columns carry a dim breakdown line: the ally cell splits per
 * individual teammate and the enemy cell per opposing team. A pooled number
 * alone can't tell you *which* teammate a player reads or which opponent walks
 * into their list, and both are the actionable part.
 */
function MemberReadsTable({
  teams,
  teamLabels,
  playerTags,
}: {
  teams: SynergyTeam[];
  teamLabels: Map<number, string>;
  playerTags?: Record<string, PlayerTag>;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>('ally');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const accessor = KEY_OF[sortKey ?? 'ally'];

  function onSort(key: string) {
    toggleSort(key, sortKey, sortDir, key === 'uname' ? 'asc' : 'desc', (k) => setSortKey(k as SortKey), setSortDir);
  }

  const header = (label: string, key: SortKey, title: string, extra?: string) => (
    <SortableHeader
      label={label}
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={onSort}
      title={title}
      pad={DENSE_CELL_PAD}
      className={extra}
    />
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={`w-full border-collapse ${STATS_BODY_TEXT}`}>
        <thead>
          <tr className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}>
            <th className={`${DENSE_CELL_PAD} w-8 text-left font-medium`}>#</th>
            <th className={`${DENSE_CELL_PAD} text-left font-medium`}>Player</th>
            {header('Ally Offlist', 'ally', 'Songs this player correctly guessed that were on a teammate’s list.')}
            {header('Enemy Offlist', 'enemy', 'Songs this player correctly guessed that were on an enemy team’s list')}
            {header('Team Snipe', 'readAlly', 'Songs on this player’s list their own team got right')}
            {header('Enemy Snipe', 'readEnemy', 'Songs on this team’s lists that a member of another team got right.')}
            {header('Songs', 'songs', 'Songs this player appears in')}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const members = [...team.members].sort((a, b) =>
              compareValues(accessor(a), accessor(b), sortDir)
            );
            return (
              <Fragment key={team.teamIndex}>
                <tr className="border-b border-border bg-surfaceAlt/60">
                  <td colSpan={7} className={DENSE_CELL_PAD}>
                    <div className={`flex flex-wrap items-center gap-2 font-semibold uppercase tracking-wide ${STATS_BODY_TEXT}`}>
                      <TeamLabel team={team} />
                    </div>
                  </td>
                </tr>
                {members.map((m, i) => (
                  <tr
                    key={`${team.teamIndex}-${m.uname}`}
                    className="border-b border-borderSub transition-colors last:border-b-0 hover:bg-surfaceAlt/50"
                  >
                    <td className={`${DENSE_CELL_PAD} text-textDim`}>{i + 1}</td>
                    <td className={DENSE_CELL_PAD}>
                      <span style={{ color: teamColor(m.teamIndex) }}>
                        {m.uname}
                        <PlayerTagBadge uname={m.uname} overrides={playerTags} className="ml-1.5" />
                      </span>
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right`}>
                      <ReadValue read={m.vsAlly} />
                      {m.allyPartners.some((p) => p.read.chances > 0) && (
                        <span className="mt-0.5 block text-[0.68rem] text-textDim">
                          {m.allyPartners
                            .filter((p) => p.read.chances > 0)
                            .map((p) => (
                              <span key={p.uname} className="block whitespace-nowrap">
                                vs {p.uname} {p.read.rate.toFixed(1)}% ({p.read.hits}/{p.read.chances})
                              </span>
                            ))}
                        </span>
                      )}
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right`}>
                      <ReadValue read={m.vsEnemy} />
                      {m.enemyTeams.length > 0 && (
                        <span className="mt-0.5 block text-[0.68rem] text-textDim">
                          {m.enemyTeams.map((e) => (
                            <span key={e.teamIndex} className="block whitespace-nowrap">
                              vs {teamLabels.get(e.teamIndex) ?? `Team ${e.teamIndex + 1}`} {e.read.rate.toFixed(1)}% ({e.read.hits}/{e.read.chances})
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right`}>
                      <ReadValue read={m.readByAlly} />
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right`}>
                      <ReadValue read={m.readByEnemy} />
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right tabular-nums text-textMuted`}>{m.songs}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
/**
 * The two readings of the same data, switched by a segmented control: the
 * per-team summary answers "which lineup is readable" while only the per-member
 * rows answer "who is doing the reading". They sit behind a toggle rather than
 * stacked so the section stays one screen tall, and the subtitle tracks the
 * active view.
 */
function SynergyViews({
  teams,
  teamLabels,
  playerTags,
}: {
  teams: SynergyTeam[];
  teamLabels: Map<number, string>;
  playerTags?: Record<string, PlayerTag>;
}) {
  const [view, setView] = useState<'team' | 'member'>('team');

  const options = [
    { id: 'team', label: 'Teams', title: 'Per-team summary, ranked toughest lists first' },
    { id: 'member', label: 'Members', title: 'Per-member breakdown of who reads whose list' },
  ] as const;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Team synergy view"
          className="flex overflow-hidden rounded-md border border-border text-xs font-medium"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.title}
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={`px-2.5 py-1 transition-colors ${
                view === option.id
                  ? 'bg-accent text-bg'
                  : 'bg-surfaceAlt text-textMuted hover:text-text'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {view === 'team' ? (
        <TeamSummaryTable teams={teams} />
      ) : (
        <MemberReadsTable teams={teams} teamLabels={teamLabels} playerTags={playerTags} />
      )}
    </div>
  );
}

/**
 * Team Synergy block for the match page's Stats section: how well each member
 * hits their teammate's list and the enemy team's.
 *
 * Two layers, coarsest first — team, then member — behind a toggle, because the
 * pooled number answers "which lineup is readable" while only the per-member
 * rows answer "who is doing the reading".
 *
 * Renders nothing when no song in scope produced a chance (an Erumode room
 * asked only answer types nobody had a list for, say) rather than a table of
 * em dashes.
 */
export default function SynergySection({
  stats,
  playerTags,
}: {
  stats: SynergyStats;
  /** Global Player/Bot tags — usernames tagged Bot get a pill by their name. */
  playerTags?: Record<string, PlayerTag>;
}) {
  if (!stats.hasData) return null;

  const teamLabels = new Map(stats.teams.map((t) => [t.teamIndex, t.label]));

  return (
    <div className="space-y-4">

      <SynergyViews teams={stats.teams} teamLabels={teamLabels} playerTags={playerTags} />
    </div>
  );
}