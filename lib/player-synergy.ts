import { getSongs, norm } from './stats';
import { readAnswers, synergyRead, type SongAnswers, type SynergyRead } from './synergy';
import { withAliases, type PlayerAliases } from './player-aliases';
import type { Match } from './types';

/**
 * Pairwise synergy for ONE player against everyone else they have shared a
 * tournament with — the player-page companion to the match page's Team Synergy
 * block (lib/synergy.ts), which asks the same question about a single room.
 *
 * Everything here counts the same event lib/synergy.ts counts, on purpose:
 * a "chance" is a song that was on somebody's list, asked while the reader was
 * in the room, and a "hit" is a chance the reader also got right.
 * `readAnswers` is imported rather than reimplemented so the two views cannot
 * drift apart on what a song counted — in particular on the Erumode detail that
 * one song asked per *active answer type* is several chances, which is what
 * keeps the rates on the same 0–100 scale the Guess Rate table uses.
 *
 * The difference is scope and shape. The match page pools a whole room and
 * splits ally from enemy; this pools many tournaments for one player, so:
 *
 *   read     — this player landing *their* list ("you synergize with them")
 *   readBy   — them landing *this player's* list ("they synergize with you"),
 *              the same relationship counted from the other end
 *
 * Both directions are kept because either can be the interesting one: the
 * person whose list you keep walking into, and the person who keeps walking
 * into yours. A third, "self" reading is deliberately absent — a player's own
 * correct guesses on their own list are exactly their Rig GR, which the player
 * page already shows per tournament.
 *
 * Ally/enemy is not a meaningful split here the way it is within one room: the
 * same two players are teammates in one tournament and opponents in the next,
 * so both are pooled and the tournament count is carried instead.
 *
 * Only rostered players count, for the same reason as lib/synergy.ts: a name
 * that appears in the export without a team has no verifiable identity across
 * tournaments, and the player's own page may not even list them.
 */
export interface PartnerSynergy {
  uname: string;
  /** this player landing this partner's list */
  read: SynergyRead;
  /** this partner landing this player's list */
  readBy: SynergyRead;
}

export interface PlayerSynergyStats {
  /** the player the page is about */
  uname: string;
  /**
   * Every partner with at least one chance in either direction, strongest read
   * first. A pair is one row whichever way the arrow points — the two numbers
   * are the same relationship seen from each end, not two separate pairs.
   */
  partners: PartnerSynergy[];
  /** matches walked */
  totalMatches: number;
  /** false when no song produced a single chance, i.e. nothing to rank */
  hasData: boolean;
}

interface Cell {
  chances: number;
  hits: number;
}

interface PartnerAccum {
  uname: string;
  read: Cell;
  readBy: Cell;
}

function emptyCell(): Cell {
  return { chances: 0, hits: 0 };
}

function add(cell: Cell, hit: boolean): void {
  cell.chances++;
  if (hit) cell.hits++;
}
/**
 * The focal player's synergy against every other player across `matches`.
 *
 * `matches` is whatever slice the caller wants read — the whole filter, or just
 * the tournaments a Recent-ranged player page is showing — so the ranking
 * narrows with the rest of the page rather than quietly reporting all-time
 * numbers on a page titled "last 5 of 12".
 *
 * `aliases` are folded under each match's own renames by `withAliases`, so a
 * player who appears here under an old name is the same person the rest of the
 * page is about, and each match's renames still win where both name them.
 */
export function computePlayerSynergy(
  matches: Pick<Match, 'teams' | 'files' | 'mode' | 'renames' | 'substitutes'>[],
  uname: string,
  aliases: PlayerAliases = {}
): PlayerSynergyStats {
  const partners = new Map<string, PartnerAccum>();
  const selfKey = norm(uname);

  const partnerFor = (key: string, display: string): PartnerAccum => {
    const existing = partners.get(key);
    if (existing) return existing;
    const created: PartnerAccum = {
      uname: display,
      read: emptyCell(),
      readBy: emptyCell(),
    };
    partners.set(key, created);
    return created;
  };

  for (const match of matches) {
    const renames = withAliases(match.renames ?? {}, aliases);
    const isErumode = match.mode === 'Erumode';

    // Roster first, so every displayed name (and the decision to count someone
    // at all) comes from the roster rather than from the export's own casing.
    // Substitutes join under their own key — they're a different person, so
    // their pairs are their own — but only when the player they stood in for
    // is actually on this roster; an entry pointing nowhere is unreconciled,
    // not a substitute. Their displayed casing is fixed on first appearance
    // (the export's own spelling), same as the match page's synergy block.
    const roster = new Map<string, string>();
    match.teams.forEach((team) => {
      for (const name of team) roster.set(norm(name), name);
    });
    const subKeys = new Set<string>();
    for (const [subKey, target] of Object.entries(match.substitutes ?? {})) {
      const key = norm(subKey);
      if (roster.has(key) || !roster.has(norm(target))) continue;
      roster.set(key, key); // placeholder until the export supplies casing
      subKeys.add(key);
    }

    for (const file of match.files) {
      for (const song of getSongs(file.data)) {
        // Who is in this song, and how they answered each question asked.
        const pgi = song?.PlayerGuessInfos ?? {};
        const present: { key: string; answers: SongAnswers['byType'] }[] = [];
        for (const pd of Object.values(pgi) as any[]) {
          const answers = readAnswers(pd, isErumode);
          if (!answers) continue;
          const key = norm(renames[norm(answers.username)] || answers.username);
          if (!roster.has(key)) continue; // no roster, no identity across tours
          // First appearance fixes a sub's displayed casing — the placeholder
          // key only survives until the export spells the name once.
          if (subKeys.has(key) && roster.get(key) === key) roster.set(key, answers.username);
          present.push({ key, answers: answers.byType });
        }

        const me = present.find((p) => p.key === selfKey);
        // Not in this song means no chance in either direction — the pair simply
        // doesn't exist yet, which is different from existing with a 0% rate.
        if (!me) continue;

        for (const other of present) {
          if (other.key === selfKey) continue; // self-reading is Rig GR's job
          const partner = partnerFor(other.key, roster.get(other.key)!);

          for (const [type, myAnswer] of Object.entries(me.answers)) {
            const theirAnswer = other.answers[type];
            // Not on their list — no chance for me to land it at all.
            if (!theirAnswer?.onList) continue;
            add(partner.read, myAnswer.correct);
          }
          for (const [type, theirAnswer] of Object.entries(other.answers)) {
            const myAnswer = me.answers[type];
            if (!myAnswer?.onList) continue;
            add(partner.readBy, theirAnswer.correct);
          }
        }
      }
    }
  }

  const list: PartnerSynergy[] = [...partners.values()]
    .map((a) => ({
      uname: a.uname,
      read: synergyRead(a.read.chances, a.read.hits),
      readBy: synergyRead(a.readBy.chances, a.readBy.hits),
    }))
    // A partner both players shared a roster with but never met on a
    // list-bearing song has nothing to rank on either side; keeping them would
    // pad the table with rows of em dashes.
    .filter((p) => p.read.chances > 0 || p.readBy.chances > 0);

  // Strongest read first, with the chance count as the tie-break: two players
  // at the same rate over very different sample sizes aren't equally
  // informative, and the counts are right there in the row to say so.
  list.sort(
    (a, b) =>
      b.read.rate - a.read.rate ||
      b.read.chances - a.read.chances ||
      a.uname.toLowerCase().localeCompare(b.uname.toLowerCase())
  );

  return { uname, partners: list, totalMatches: matches.length, hasData: list.length > 0 };
}