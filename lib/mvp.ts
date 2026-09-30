import { norm } from './stats';
import type { GuessRateStats } from './guess-stats';
import type { Match } from './types';

/**
 * MVP stats — the "Expected vs Actual" view. Both halves are built from the
 * same two numbers the Guess Rate table already exposes per player:
 *
 *   playedLike  = Performance (the mode/submode rating — see guess-stats.ts)
 *   currentRank = the "(N)" parsed from the pasted roster (playerRanks)
 *
 * A player who is ranked `currentRank` but played like `playedLike` performed
 * `playedLike − currentRank` above their rank this tournament; the MVPs are
 * simply the top three players by that margin.
 *
 * Teams are rated the same way, summed over the members who actually appear
 * in the match's files: the team's actual level (Σ playedLike) against the
 * level its roster implies (Σ currentRank). That baseline is what makes the
 * comparison fair — balanced rosters all sum to the same rank total, so the
 * delta is real over/under-performance rather than roster strength.
 */
export interface MvpPlayer {
  uname: string;
  teamIndex: number; // roster slot they played in — drives their team color
  playedLike: number;
  rank: number;
  diff: number; // playedLike − rank
}

export interface MvpTeamMember {
  uname: string;
  playedLike: number;
}

export interface MvpTeam {
  teamIndex: number;
  label: string;
  members: MvpTeamMember[]; // only members present in at least one file
  playedLike: number; // Σ members' Performance — the "actual" level
  expectedRank: number; // Σ members' Current Rank — the "expected" level
  hasRanks: boolean; // false when no member carries a rank to compare against
  diff: number; // playedLike − expectedRank
}

export interface MvpStats {
  teams: MvpTeam[]; // ranked teams by over-performance first
  mvps: MvpPlayer[]; // top 3 by diff (fewer if fewer ranked players played)
}

/** How many players get a medal. */
export const MVP_PODIUM_SIZE = 3;

export function computeMvpStats(
  match: Pick<Match, 'teams' | 'playerRanks'>,
  guessStats: GuessRateStats
): MvpStats {
  const ranks = match.playerRanks ?? {};
  const rows: { uname: string; performance: number; songs: number }[] =
    guessStats.mode === 'Erumode' ? guessStats.erumodeRows : guessStats.ngmcRows;

  const playedLike = new Map<string, number>();
  for (const row of rows) {
    if (row.songs === 0) continue; // no signal to rate them on
    playedLike.set(norm(row.uname), row.performance);
  }

  const teams: MvpTeam[] = [];
  const mvps: MvpPlayer[] = [];

  match.teams.forEach((team, teamIndex) => {
    const members: MvpTeamMember[] = [];
    let expectedRank = 0;
    let hasRanks = false;

    for (const uname of team) {
      const perf = playedLike.get(norm(uname));
      if (perf === undefined) continue; // never appears in a file — not part of this lineup
      members.push({ uname, playedLike: perf });

      const rank = ranks[norm(uname)];
      if (rank === undefined) continue;
      expectedRank += rank;
      hasRanks = true;
      mvps.push({ uname, teamIndex, playedLike: perf, rank, diff: perf - rank });
    }

    if (members.length === 0) return;
    const total = members.reduce((s, m) => s + m.playedLike, 0);
    teams.push({
      teamIndex,
      label: team[0],
      members,
      playedLike: total,
      expectedRank,
      hasRanks,
      diff: total - expectedRank,
    });
  });

  // Teams with a rank baseline are ordered by over-performance; any team
  // without one can't have a delta at all, so it sorts after them (by raw
  // played-like level) instead of being ranked on a bogus diff.
  const sortKey = (t: MvpTeam) => (t.hasRanks ? t.diff : -Infinity);
  teams.sort(
    (a, b) => sortKey(b) - sortKey(a) || b.playedLike - a.playedLike || a.label.localeCompare(b.label)
  );
  mvps.sort(
    (a, b) => b.diff - a.diff || b.playedLike - a.playedLike || a.uname.localeCompare(b.uname)
  );

  return { teams, mvps: mvps.slice(0, MVP_PODIUM_SIZE) };
}

/** "+4.56" / "-1.68" — always signed, two decimals, plain ASCII hyphen. */
export function signed(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`;
}

/**
 * Discord custom-emoji shortcodes, in podium order — the same order as the
 * medals MvpSection draws. The copied text is meant to land in a Discord post,
 * where these render as the real medals.
 *
 * Must stay at least as long as `MVP_PODIUM_SIZE`; `formatMvpSummary` falls
 * back to the last entry rather than printing `undefined` if that ever slips.
 */
const PODIUM_EMOJI = [':first_place:', ':second_place:', ':third_place:'];

/**
 * The whole block as plain text, for pasting into a Discord post or a sheet.
 *
 * Built off the same `signed()` the page draws with, at the same precision
 * (1dp per member, 2dp for every total), so a copy can never quote a different
 * number than the page shows. The `#` headings keep the block's structure once
 * it is pasted somewhere that isn't this app.
 *
 * A team with no rank baseline has no diff to report and is copied without
 * one, exactly as on the page. A tournament where nobody carries a rank has no
 * MVPs either, and the `# MVPs` heading is left off altogether rather than
 * copied as a heading with nothing under it.
 */
export function formatMvpSummary(stats: MvpStats): string {
  const lines: string[] = ['# Team Expected vs Actual'];

  for (const team of stats.teams) {
    const members = team.members
      .map((m) => `${m.uname} (${m.playedLike.toFixed(1)})`)
      .join(' ');
    const delta = team.hasRanks ? ` (${signed(team.diff)}, from ${team.expectedRank})` : '';
    lines.push(`${members} = ${team.playedLike.toFixed(2)}${delta}`);
  }

  if (stats.mvps.length > 0) {
    lines.push('# MVPs');
    stats.mvps.forEach((p, i) => {
      const medal = PODIUM_EMOJI[i] ?? PODIUM_EMOJI[PODIUM_EMOJI.length - 1];
      lines.push(
        `${medal} ${p.uname}: Played like ${p.playedLike.toFixed(2)} ` +
          `(Current Rank: ${p.rank}, ${signed(p.diff)})`
      );
    });
  }

  return lines.join('\n');
}
