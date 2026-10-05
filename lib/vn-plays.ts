import { getSongs, getVNSource } from './stats';
import type { GuessRateStats } from './guess-stats';
import type { Match } from './types';

/**
 * Most played VNs — which visual novels the room actually drew from, and how
 * often, over one tournament (or one scoped slice of it: the match page hands
 * this the same scoped file list every other stat reads, so these numbers move
 * with the round/game selector along with the rest of the Stats section).
 *
 * A "play" is one song from that VN appearing in a song history — i.e. one
 * game asking one song. The same song asked in three games is three plays,
 * because what's being ranked here is how often the VN came up, not how many of
 * its tracks exist. Plays are therefore comparable across VNs but not a
 * measure of how big any VN's catalogue is.
 *
 * Two rules keep the list about popularity rather than about long-tail noise:
 *
 *   MIN_PLAYS — a VN asked exactly once is a fact about the song draw, not a
 *               preference, so it never reaches the table. Ranking those would
 *               mean most of the list is "every other VN appeared exactly
 *               once", which says nothing.
 *   TOP_N     — the table stops at ten rows; everything past that is a longer
 *               tail of the same claim.
 *
 * Grouping is by the game's own VN id (`getVNSource`), not by title text, so
 * two songs of one VN are never split by a spelling or main-title difference
 * between exports. Songs with no VN source at all are skipped, the display name
 * is the first one seen — the export's own main title, the same string the
 * attack modal already shows for that VN — and each row carries the VN's VNDB
 * page for the name to link to.
 */
export const VN_MIN_PLAYS = 2;
export const VN_TOP_N = 10;

export interface VnPlayRow {
  /** VN name, as the export spells it — see getVNSource. */
  vn: string;
  /** songs from this VN asked across the files in scope */
  plays: number;
  /**
   * The VN's VNDB page, or null when the export carries no VNDB link for it —
   * the table links the name only when there is somewhere to go.
   */
  url: string | null;
}

export interface VnPlayStats {
  rows: VnPlayRow[];
  /** distinct VNs seen in scope, before the MIN_PLAYS filter */
  totalVns: number;
  /** VNs that cleared MIN_PLAYS, before the TOP_N cut */
  qualified: number;
  /** every song asked in scope, VN-sourced or not */
  totalSongs: number;
  /** false when nothing in scope reached MIN_PLAYS, i.e. nothing worth showing */
  hasData: boolean;
}

export function computeVnPlays(match: Pick<Match, 'files'>): VnPlayStats {
  const plays = new Map<string, { title: string; plays: number; url: string | null }>();
  let totalSongs = 0;

  for (const file of match.files) {
    for (const song of getSongs(file.data)) {
      totalSongs++;
      const source = getVNSource(song);
      if (!source) continue; // not a VN track
      const entry = plays.get(source.id);
      if (entry) {
        entry.plays++;
        // A song of a VN seen earlier carried no VNDB link — take the first one
        // that does rather than leaving the row unlinked because of file order.
        entry.url ??= source.url;
      } else {
        plays.set(source.id, { title: source.title, plays: 1, url: source.url });
      }
    }
  }

  const ranked = [...plays.values()]
    .filter((v) => v.plays >= VN_MIN_PLAYS)
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));

  return {
    rows: ranked.slice(0, VN_TOP_N).map((v) => ({ vn: v.title, plays: v.plays, url: v.url })),
    totalVns: plays.size,
    qualified: ranked.length,
    totalSongs,
    hasData: ranked.length > 0,
  };
}

/**
 * The Most Played VNs block plus the rig distribution as plain text, for
 * pasting into a Discord post or a sheet:
 *
 *   MOST PLAYED
 *   2 plays: D-EVE in you
 *   ...
 *   RIG DISTRIBUTION
 *   Aisu: 46 (41.1%) | 17 OPs, 17 EDs, 11 Ins, 1 OP/EDs
 *   ...
 *
 * The VN lines mirror the table's displayed rows (the top-N cut, in rank
 * order). The rig lines mirror the Guess Rate table's Rigs column — each
 * player's on-list count with its share of their songs at the same 1dp as the
 * table — plus the OP/ED/Ins/OP-ED split of that count. Each rigged song
 * counts once, typed by its primary source (Sources[0].SongTypes, the same
 * type the Guess Rate table grades it under); a song tagged both OP and ED
 * lands in the mixed bucket labelled OP/EDs. The rig lines are sorted by rig
 * count descending (ties by name) rather than the table's guess-rate order,
 * since this block ranks rigs.
 *
 * Labels stay plural even for a count of one (`1 OP/EDs`, `2 plays`), and a
 * bucket with no rigs is left off rather than printed as zero, so a player
 * with no multi-type rigs reads `13 OPs, 16 EDs, 9 Ins` with nothing after
 * it. A player with no rigs at all keeps just the head (`name: 0 (0.0%)`).
 *
 * `guess` is null when the Guess Rate stats failed to compute — then the copy
 * is just the MOST PLAYED section rather than nothing.
 */
export function formatVnCopySummary(vn: VnPlayStats, guess: GuessRateStats | null): string {
  const lines: string[] = ['MOST PLAYED'];
  for (const row of vn.rows) {
    lines.push(`${row.plays} plays: ${row.vn}`);
  }

  if (guess) {
    lines.push('RIG DISTRIBUTION');
    const rows = guess.mode === 'Erumode' ? guess.erumodeRows : guess.ngmcRows;
    const sorted = [...rows].sort((a, b) => b.rigCount - a.rigCount || a.uname.localeCompare(b.uname));
    for (const r of sorted) {
      const head =
        r.songs > 0
          ? `${r.uname}: ${r.rigCount} (${(((100 * r.rigCount) / r.songs).toFixed(1))}%)`
          : `${r.uname}: ${r.rigCount}`;
      const parts: string[] = [];
      if (r.rigOp > 0) parts.push(`${r.rigOp} OPs`);
      if (r.rigEd > 0) parts.push(`${r.rigEd} EDs`);
      if (r.rigIns > 0) parts.push(`${r.rigIns} Ins`);
      if (r.rigMixed > 0) parts.push(`${r.rigMixed} OP/EDs`);
      lines.push(parts.length > 0 ? `${head} | ${parts.join(', ')}` : head);
    }
  }

  return lines.join('\n');
}