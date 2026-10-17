'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { teamColor, teamColorBg } from '@/lib/team-colors';
import type { Team } from '@/lib/types';

/**
 * How strongly a roster chip is tinted with its own team's color. Kept low so
 * the chip still reads as a chip against the card behind it — and, more
 * importantly, because the tint *lightens* the surface the team's color has to
 * be read against: the name is text on its own chip, so every step of alpha
 * costs contrast. At 0.12 the weakest team hue still clears WCAG AA 4.5:1 in
 * the worst case (a winning row, where the card's `accent/10` wash stacks on
 * top of the chip tint). Raising this needs the palette in
 * lib/team-colors.ts re-checked, not just eyeballed.
 */
const TEAM_CHIP_ALPHA = 0.12;

/**
 * How strongly the hovered team's color washes over the cells it plays in. Kept
 * low because it is layered *on top of* whatever the cell already paints (win
 * tint, chip colors) rather than replacing it.
 */
const TEAM_HIGHLIGHT_ALPHA = 0.12;

/**
 * One team's half of a bracket matchup card — the whole roster as equally
 * emphasized chips in the team's own color, a result tag inline next to
 * them, the winner's row tinted, and a hover highlight so every cell that
 * team plays in (in every round) lights up together.
 *
 * The tag is `win` / `tie` for a round-robin pairing; a 3v3v3 card also
 * carries `2nd` / `3rd`, since every team in a three-way round has a place
 * worth showing (and it is the place its points come from).
 *
 * Shared by the two brackets that show the same fixtures: the read-only one on
 * the match page (`RoundRobinGrid`) and the score-entry one in the admin form
 * (`MatchForm`). Only the right-hand control differs — a score pill there, a
 * score input here — so it is passed in as `score`; the rest lives here to keep
 * the two brackets from drifting apart.
 *
 * On the read-only bracket each roster chip is also a link to that player's
 * profile (`profileLinks`); the admin form leaves it off, so a click in the
 * score-entry bracket can never navigate away from a half-edited tournament.
 */
export default function BracketTeamRow({
  members,
  teamIndex,
  result,
  highlighted,
  onHover,
  score,
  divider = false,
  profileLinks = false,
}: {
  members: Team;
  teamIndex: number;
  result: 'win' | 'tie' | '2nd' | '3rd' | null;
  highlighted: boolean;
  onHover: (teamIndex: number) => void;
  /** Right-hand control: a score pill (match page) or score input (admin form). */
  score: ReactNode;
  /**
   * Draw a rule under this row. Set it on every row but the LAST team of a
   * matchup, so the teams are split by rules without a trailing rule under
   * the final one. Without it the rosters run together and, on a card where
   * nobody won, nothing marks where one team ends and the other begins.
   * `borderSub` is the same rule the stats tables use between rows.
   */
  divider?: boolean;
  /**
   * Turn each roster chip into a link to that player's profile
   * (`/players/<name>`). Set on the match page's read-only bracket; the admin
   * form's chips stay inert — see the component doc above.
   */
  profileLinks?: boolean;
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
      } ${divider ? 'border-b border-borderSub' : ''}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        {members.map((name, i) => {
          // One chip either way — only the element changes, so a linked roster
          // still tints, truncates and emphasizes exactly like the inert one.
          const chipClass = `truncate rounded px-1 text-xs ${
            win
              ? 'font-semibold text-text'
              : tie
                ? 'font-medium text-text'
                : 'text-textSub'
          }${profileLinks ? ' hover:underline' : ''}`;
          return profileLinks ? (
            <Link
              key={`${name}-${i}`}
              href={`/players/${encodeURIComponent(name)}`}
              style={chipBg}
              className={chipClass}
              title={`View ${name}'s profile`}
            >
              {name}
            </Link>
          ) : (
            <span
              key={`${name}-${i}`}
              style={chipBg}
              className={chipClass}
            >
              {name}
            </span>
          );
        })}
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
