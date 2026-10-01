'use client';

import { Fragment, useState } from 'react';
import { teamColor } from '@/lib/team-colors';
import type { SynergyMatchup, SynergyMember, SynergyRead, SynergyStats, SynergyTeam } from '@/lib/synergy';
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

/**
 * Only the composite gets a verdict colour. The four raw reads are left in the
 * neutral text ramp on purpose: they're descriptive, and a red/amber/green on
 * each of them would be four more scores competing for an interpretation the
 * page already states once, in the Readability column.
 */
function heat(rate: number): string {
  if (rate >= 50) return 'text-[#f27676]';
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
 * Per-team summary, ranked toughest-lists-first. Ally synergy and the two
 * cross-team columns are each shown as a rate over the pooled counts behind
 * it; Readability is the mean of the first and third, and is the only column
 * that claims a direction is good.
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
              title="Ally synergy — songs this team's members correctly guessed that were on a teammate's list, over the teammate on-list songs they were present for. Higher means the team duplicates its own coverage."
            >
              Ally synergy
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Enemy reads — songs this team's members correctly guessed that were on another team's list."
            >
              Enemy reads
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Read by enemies — the same events seen from the other side: songs on this team's lists that a member of another team got right."
            >
              Read by enemies
            </th>
            <th
              className={`${DENSE_CELL_PAD} text-right font-medium`}
              title="Readability — the mean of Ally synergy and Read by enemies: how findable this team's coverage is, inside and out. Lower is a harder lineup to read."
            >
              Readability
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
                {team.readability === null ? (
                  <span className="text-textDim">—</span>
                ) : (
                  <span className={`font-medium ${heat(team.readability)}`}>
                    {team.readability.toFixed(1)}%
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
      <table className={`w-full border-collapse ${STATS_BODY_TEXT}`} style={{ minWidth: 760 }}>
        <thead>
          <tr className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}>
            <th className={`${DENSE_CELL_PAD} w-8 text-left font-medium`}>#</th>
            <th className={`${DENSE_CELL_PAD} text-left font-medium`}>Player</th>
            {header('Ally read', 'ally', 'Songs this player correctly guessed that were on a teammate’s list, over the teammate on-list songs they were present for')}
            {header('Enemy read', 'enemy', 'Songs this player correctly guessed that were on an opposing team’s list')}
            {header('Read by teammates', 'readAlly', 'Songs on this player’s list their own team got right')}
            {header('Read by enemies', 'readEnemy', 'Songs on this player’s list the other teams got right')}
            {header('Songs', 'songs', 'Songs this player appears in — the ceiling on any of their chances')}
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
                            .map((p) => `→ ${p.uname} ${p.read.rate.toFixed(1)}% (${p.read.hits}/${p.read.chances})`)
                            .join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className={`${DENSE_CELL_PAD} text-right`}>
                      <ReadValue read={m.vsEnemy} />
                      {m.enemyTeams.length > 0 && (
                        <span className="mt-0.5 block text-[0.68rem] text-textDim">
                          {m.enemyTeams
                            .map((e) => `vs ${teamLabels.get(e.teamIndex) ?? `Team ${e.teamIndex + 1}`} ${e.read.rate.toFixed(1)}% (${e.read.hits}/${e.read.chances})`)
                            .join(' · ')}
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
 * Cross-team reads as a square: rows read, columns are read. A row cell is
 * that team landing the column team's lists — which is also, read the other
 * way, how exposed the column team is to that row.
 *
 * The per-member split behind each cell rides on the cell's tooltip rather
 * than in the grid: a 4-team tournament has 12 cells here and the same 12
 * breakdowns one screen further up in the member table, so putting them in both
 * would say the same thing twice.
 */
function MatchupMatrix({ teams, matchups }: { teams: SynergyTeam[]; matchups: SynergyMatchup[] }) {
  const cell = new Map<string, SynergyMatchup>();
  for (const m of matchups) cell.set(`${m.teamIndex}:${m.againstTeamIndex}`, m);

  const tooltip = (m: SynergyMatchup | undefined): string | undefined =>
    m && m.members.length > 0
      ? m.members.map((x) => `${x.uname} ${x.read.rate.toFixed(1)}% (${x.read.hits}/${x.read.chances})`).join(' · ')
      : undefined;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className={`w-full border-collapse ${STATS_BODY_TEXT}`}>
        <thead>
          <tr className={`border-b border-border bg-surfaceAlt uppercase tracking-wide text-textMuted ${STATS_HEADER_TEXT}`}>
            <th className={`${DENSE_CELL_PAD} text-left font-medium`}>
              Reads <span className="font-normal normal-case tracking-normal">↓</span> / read{' '}
              <span className="font-normal normal-case tracking-normal">→</span>
            </th>
            {teams.map((owner) => (
              <th
                key={owner.teamIndex}
                className={`${DENSE_CELL_PAD} text-right font-medium`}
                title={`${owner.label}'s team — how much of their lists each team found`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: teamColor(owner.teamIndex) }} />
                  {owner.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((reader) => (
            <tr key={reader.teamIndex} className="border-b border-borderSub last:border-b-0">
              <th scope="row" className={`${DENSE_CELL_PAD} text-left font-medium`}>
                <TeamLabel team={reader} />
              </th>
              {teams.map((owner) => {
                if (reader.teamIndex === owner.teamIndex) {
                  return (
                    <td key={owner.teamIndex} className={`${DENSE_CELL_PAD} text-right text-textDim`}>
                      —
                    </td>
                  );
                }
                const m = cell.get(`${reader.teamIndex}:${owner.teamIndex}`);
                return (
                  <td key={owner.teamIndex} className={`${DENSE_CELL_PAD} text-right`} title={tooltip(m)}>
                    <ReadValue read={m?.read ?? { chances: 0, hits: 0, rate: 0 }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Team Synergy block for the match page's Stats section: how well each member
 * hits their teammate's list and the enemy team's.
 *
 * Three layers, coarsest first — team, member, then the team-vs-team square —
 * because the pooled number answers "which lineup is readable" while only the
 * per-member rows answer "who is doing the reading", and the matchup square is
 * the only view where a specific opponent's name is the row.
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
      <p className="max-w-3xl text-xs leading-relaxed text-textMuted">
        A <span className="text-textSub">chance</span> is a song that was on somebody&apos;s
        pre-made list, asked while the reader was in the room; a <span className="text-textSub">hit</span>{' '}
        is a chance the reader also got right. Every rate below is shown over the counts it came from.
        A player is never their own reader here — their own list&apos;s guess rate is Rig GR in the table
        above.
      </p>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Team Synergy <span className="font-normal normal-case tracking-normal text-textDim">· ranked toughest lists first</span>
        </h4>
        <TeamSummaryTable teams={stats.teams} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Member Reads <span className="font-normal normal-case tracking-normal text-textDim">· what each player hits on other people&apos;s lists</span>
        </h4>
        <MemberReadsTable teams={stats.teams} teamLabels={teamLabels} playerTags={playerTags} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
          Cross-Team Reads <span className="font-normal normal-case tracking-normal text-textDim">· hover a cell for the per-member split</span>
        </h4>
        <MatchupMatrix teams={stats.teams} matchups={stats.matchups} />
      </div>
    </div>
  );
}