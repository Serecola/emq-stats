'use client';

import type { ReactNode } from 'react';
import { teamColor, teamColorBg } from '@/lib/team-colors';
import type { Team } from '@/lib/types';

/**
 * How strongly a roster chip is tinted with its own team's color. Kept low so
 * the chip still reads as a chip against the card behind it and the light text
 * on top stays legible.
 */
const TEAM_CHIP_ALPHA = 0.18;

/**
 * How strongly the hovered team's color washes over the cells it plays in. Kept
 * low because it is layered *on top of* whatever the cell already paints (win
 * tint, chip colors) rather than replacing it.
 */
const TEAM_HIGHLIGHT_ALPHA = 0.12;

/**
 * One team's half of a bracket matchup card — the whole roster as equally
 * emphasized chips in the team's own color, a `win` / `tie` tag inline next to
 * them, the winner's row tinted, and a hover highlight so every cell that team
 * plays in (in every round) lights up together.
 *
 * Shared by the two brackets that show the same fixtures: the read-only one on
 * the match page (`RoundRobinGrid`) and the score-entry one in the admin form
 * (`MatchForm`). Only the right-hand control differs — a score pill there, a
 * score input here — so it is passed in as `score`; the rest lives here to keep
 * the two brackets from drifting apart.
 */
export default function BracketTeamRow({
  members,
  teamIndex,
  result,
  highlighted,
  onHover,
  score,
}: {
  members: Team;
  teamIndex: number;
  result: 'win' | 'tie' | null;
  highlighted: boolean;
  onHover: (teamIndex: number) => void;
  /** Right-hand control: a score pill (match page) or score input (admin form). */
  score: ReactNode;
}) {
  const win = result === 'win';
  const tie = result === 'tie';
  // Roster chips always carry their own team's color instead of a flat grey, so
  // the same team reads the same in every card it appears in — a win never
  // overrides it. The win is shown on the cell (accent row background plus the
  // `win` tag) and on the score control instead.
  const chipBg = { background: teamColorBg(teamIndex, TEAM_CHIP_ALPHA) };
  // Hover highlight for this cell: a hairline ring in the team's own color plus
  // a faint wash of that same color. Both are inset shadows, which paint above
  // the cell's background but below its text — so highlighting composes with
  // whatever the cell already shows (the win tint, the chip colors) instead of
  // having to fight it for `background-color`, and the cell stays the team's
  // color while it is highlighted.
  const highlightStyle = highlighted
    ? {
        boxShadow: `inset 0 0 0 1px ${teamColor(teamIndex)}, inset 0 0 0 9999px ${teamColorBg(
          teamIndex,
          TEAM_HIGHLIGHT_ALPHA,
        )}`,
      }
    : undefined;

  return (
    <div
      onMouseEnter={() => onHover(teamIndex)}
      style={highlightStyle}
      className={`flex items-center justify-between gap-2 rounded px-1.5 py-0.5 transition-shadow ${
        win ? 'bg-accent/10' : ''
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        {members.map((name, i) => (
          <span
            key={`${name}-${i}`}
            style={chipBg}
            className={`truncate rounded px-1 text-xs ${
              win
                ? 'font-semibold text-text'
                : tie
                  ? 'font-medium text-text'
                  : 'text-textSub'
            }`}
          >
            {name}
          </span>
        ))}
        {result && (
          <span
            className={`flex-shrink-0 rounded px-1 text-[0.6rem] font-semibold uppercase tracking-wide ${
              win ? 'bg-accent/15 text-accent' : 'bg-surfaceAlt text-textMuted'
            }`}
          >
            {result}
          </span>
        )}
      </div>
      {score}
    </div>
  );
}
