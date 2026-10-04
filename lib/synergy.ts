import { ANSWER_TYPES } from './guess-stats';
import { getSongs, norm } from './stats';
import type { Match } from './types';

/**
 * Team synergy — how well each player reads the *lists of the people around
 * them*, split by which side of the room those people are on.
 *
 * The unit of measurement is one "chance": a song that was on somebody's list,
 * asked while the reader was in the room. A "hit" is a chance the reader also
 * got right. Every number in this file is `hits / chances`, so a rate is only
 * ever shown next to the fraction it came from — 40% over 5
 * chances and 40% over 250 chances are not the same claim, and the counts are
 * what tell them apart.
 *
 * Two readings of the same event, per player:
 *
 *   vsAlly / vsEnemy     — this player as the *reader*: how much of their
 *                          teammates' lists they land, and how much of the
 *                          other teams' lists they land.
 *   readByAlly / readByEnemy
 *                        — this player as the *list owner*: how much of their
 *                          own list their teammates / the other teams find.
 *
 * A player is never their own reader here: self-reading is exactly the Rig GR
 * the Guess Rate table already shows, and counting it a third time would put
 * the same number on the page twice.
 *
 * Chances are counted per answer type, because that is how the game asks them:
 * NGMC asks one question per song ("Mst"), while Erumode asks one per *active*
 * answer type (VN, artist, song name, ...) and every player carries a separate
 * list for each. An Erumode song where the artist was on both players' lists
 * is therefore two chances, not one — which keeps pooled percentages on the
 * same 0–100 scale the Guess Rate table already uses.
 *
 * Only rostered players count. A name in the export that isn't on any team is
 * skipped entirely: without a team there is no way to tell whether the two of
 * them were allies or opponents that game, and guessing would silently skew
 * both buckets.
 */
export interface SynergyRead {
  /** songs that were on the list being read, asked while the reader was present */
  chances: number;
  /** of those chances, the ones the reader got right */
  hits: number;
  /** hits / chances as a percentage — 0 when there were no chances at all */
  rate: number;
}
/** One player's line: both of their readings, plus the breakdown behind each. */
export interface SynergyMember {
  uname: string;
  teamIndex: number;
  /** songs they appear in — the ceiling on any of their chances */
  songs: number;
  vsAlly: SynergyRead;
  vsEnemy: SynergyRead;
  readByAlly: SynergyRead;
  readByEnemy: SynergyRead;
  /** vsAlly split per individual teammate, in roster order. */
  allyPartners: { uname: string; read: SynergyRead }[];
  /** vsEnemy split per opposing team they actually met on list-bearing songs. */
  enemyTeams: { teamIndex: number; read: SynergyRead }[];
}

export interface SynergyTeam {
  teamIndex: number;
  label: string;
  members: SynergyMember[];
  /** rostered members who never appear in a file */
  missing: string[];
  /** pooled: the team's members landing each other's lists */
  allyRead: SynergyRead;
  /** pooled: the team's members landing the other teams' lists */
  enemyRead: SynergyRead;
  /** pooled: the other teams landing this team's lists — the mirror of the above */
  readByEnemies: SynergyRead;
  /**
   * The one opinionated number in here: the mean of `allyRead.rate` and
   * `readByEnemies.rate` — how findable this team's list coverage is,
   * internally (members duplicating each other's picks) and externally
   * (opponents finding the songs). Null when neither half has any evidence,
   * rather than showing a real-looking 0% for a team we know nothing about.
   */
  listdifficulty: number | null;
}

export interface SynergyStats {
  teams: SynergyTeam[];
  totalSongs: number;
  /** false when no song produced a single chance, i.e. nothing to show */
  hasData: boolean;
}

interface Cell {
  chances: number;
  hits: number;
}

/**
 * Running totals for one rostered player: their own attendance, the four
 * read buckets they take part in (as reader and as list owner, each split by
 * side of the room), and the per-teammate / per-opposing-team breakdowns the
 * UI puts under the pooled numbers.
 */
interface MemberAccum {
  uname: string;
  teamIndex: number;
  songs: number;
  ally: Cell;
  enemy: Cell;
  readAlly: Cell;
  readEnemy: Cell;
  allyPartners: Map<string, Cell>;
  enemyTeams: Map<number, Cell>;
}

function emptyCell(): Cell {
  return { chances: 0, hits: 0 };
}

function emptyAccum(uname: string, teamIndex: number): MemberAccum {
  return {
    uname,
    teamIndex,
    songs: 0,
    ally: emptyCell(),
    enemy: emptyCell(),
    readAlly: emptyCell(),
    readEnemy: emptyCell(),
    allyPartners: new Map(),
    enemyTeams: new Map(),
  };
}

/** Adds one (chance, hit) pair into a running cell held in a map. */
function bump<T>(map: Map<T, Cell>, key: T, hit: boolean): void {
  const cell = map.get(key) ?? emptyCell();
  cell.chances++;
  if (hit) cell.hits++;
  map.set(key, cell);
}

/** Same, for a cell held directly. */
function add(cell: Cell, hit: boolean): void {
  cell.chances++;
  if (hit) cell.hits++;
}

/**
 * Builds a read from its raw counts. Exported rather than kept private because
 * the player-page synergy ranking (lib/player-synergy.ts) accumulates the same
 * kind of cell across several tournaments and has to wrap its pooled totals in
 * the same type — one definition of "a rate is 0 when there were no chances"
 * rather than two that could disagree.
 */
export function synergyRead(chances: number, hits: number): SynergyRead {
  return { chances, hits, rate: chances > 0 ? (100 * hits) / chances : 0 };
}

function asRead(cell: Cell): SynergyRead {
  return synergyRead(cell.chances, cell.hits);
}

/**
 * A player's answers for one song, keyed by answer type.
 *
 * Reads defensively for the same reason lib/stats.ts does: exports vary. NGMC
 * asks once per song under "Mst", and older/third-party exports occasionally
 * carry that single entry unwrapped (the type's name as the only key), so a
 * missing "Mst" falls back to whatever entry is there rather than dropping the
 * song. Erumode walks ANSWER_TYPES, so only the types the room was actually
 * asked about produce chances.
 *
 * Exported so lib/player-synergy.ts reads a player's answers the exact same way
 * the match page's Team Synergy block does — the two views count the same
 * events, and a second copy of the walk is how they would stop agreeing.
 */
export interface SongAnswers {
  username: string;
  byType: Record<string, { correct: boolean; onList: boolean }>;
}

export function readAnswers(pd: any, isErumode: boolean): SongAnswers | null {
  const keys = Object.keys(pd ?? {});
  if (keys.length === 0) return null;
  const first = pd[keys[0]];
  const username: string | undefined = first?.Username;
  if (!username) return null;

  if (!isErumode) {
    const entry = pd['Mst'] ?? first;
    return {
      username,
      byType: {
        Mst: { correct: entry?.IsGuessCorrect === true, onList: entry?.IsOnList === true },
      },
    };
  }

  const byType: SongAnswers['byType'] = {};
  for (const type of ANSWER_TYPES) {
    const entry = pd[type];
    if (!entry) continue;
    byType[type] = { correct: entry.IsGuessCorrect === true, onList: entry.IsOnList === true };
  }
  return Object.keys(byType).length > 0 ? { username, byType } : null;
}

/**
 * Team synergy for one match — or one scoped slice of it: the match page hands
 * this the same scoped file list every other stat reads, so these numbers move
 * with the round/game selector along with the rest of the Stats section.
 */
export function computeSynergyStats(
  match: Pick<Match, 'teams' | 'files' | 'mode'> & { renames?: Record<string, string> }
): SynergyStats {
  const isErumode = match.mode === 'Erumode';
  const renames = match.renames ?? {};
  const resolve = (rawUsername: string): string => renames[norm(rawUsername)] || rawUsername;

  // Roster first, so every row's displayed casing (and its team) comes from
  // the roster rather than from whatever the export happened to call them.
  const roster = new Map<string, { uname: string; teamIndex: number }>();
  match.teams.forEach((team, teamIndex) => {
    for (const uname of team) roster.set(norm(uname), { uname, teamIndex });
  });

  const acc = new Map<string, MemberAccum>();
  const accumFor = (key: string): MemberAccum | undefined => {
    const existing = acc.get(key);
    if (existing) return existing;
    const member = roster.get(key);
    if (!member) return undefined;
    const created = emptyAccum(member.uname, member.teamIndex);
    acc.set(key, created);
    return created;
  };
  // Seed the whole roster so a member who never played still appears, with
  // zeroes — the same treatment computeMatchStats gives an absent player.
  for (const key of roster.keys()) accumFor(key);

  let totalSongs = 0;

  for (const file of match.files) {
    for (const song of getSongs(file.data)) {
      totalSongs++;

      // Who is actually in this song, and how they answered each question asked.
      const pgi = song?.PlayerGuessInfos ?? {};
      const present: {
        key: string;
        teamIndex: number;
        answers: SongAnswers['byType'];
        acc: MemberAccum;
      }[] = [];
      for (const pd of Object.values(pgi) as any[]) {
        const answers = readAnswers(pd, isErumode);
        if (!answers) continue;
        const key = norm(resolve(answers.username));
        const member = accumFor(key);
        if (!member) continue; // not on any roster — no team, so no ally/enemy split
        member.songs++;
        present.push({ key, teamIndex: member.teamIndex, answers: answers.byType, acc: member });
      }

      for (const reader of present) {
        for (const owner of present) {
          if (reader.key === owner.key) continue; // self-reading is Rig GR's job
          const ally = reader.teamIndex === owner.teamIndex;

          for (const [type, readerAnswer] of Object.entries(reader.answers)) {
            const ownerAnswer = owner.answers[type];
            if (!ownerAnswer?.onList) continue; // not on their list — no chance at all
            const hit = readerAnswer.correct;

            if (ally) {
              add(reader.acc.ally, hit);
              add(owner.acc.readAlly, hit);
              bump(reader.acc.allyPartners, owner.key, hit);
            } else {
              add(reader.acc.enemy, hit);
              add(owner.acc.readEnemy, hit);
              bump(reader.acc.enemyTeams, owner.teamIndex, hit);
            }
          }
        }
      }
    }
  }

const finalize = (a: MemberAccum): SynergyMember => ({
    uname: a.uname,
    teamIndex: a.teamIndex,
    songs: a.songs,
    vsAlly: asRead(a.ally),
    vsEnemy: asRead(a.enemy),
    readByAlly: asRead(a.readAlly),
    readByEnemy: asRead(a.readEnemy),
    allyPartners: match.teams[a.teamIndex]
      .filter((u) => norm(u) !== norm(a.uname))
      .map((uname) => ({
        uname,
        read: asRead(a.allyPartners.get(norm(uname)) ?? emptyCell()),
      })),
    enemyTeams: match.teams
      .map((_, teamIndex) => teamIndex)
      .filter((teamIndex) => teamIndex !== a.teamIndex && a.enemyTeams.has(teamIndex))
      .map((teamIndex) => ({ teamIndex, read: asRead(a.enemyTeams.get(teamIndex)!) })),
  });

  const teams: SynergyTeam[] = match.teams.map((team, teamIndex) => {
    const members = team.map((uname) => finalize(acc.get(norm(uname))!));

    /**
     * Sums a member-level read across the whole roster, so a team number is an
     * actual pooled fraction rather than an average of averages — the latter
     * would weight a one-song pairing the same as a thirty-song one.
     */
    const pooled = (pick: (m: SynergyMember) => SynergyRead): SynergyRead => {
      let chances = 0;
      let hits = 0;
      for (const m of members) {
        const r = pick(m);
        chances += r.chances;
        hits += r.hits;
      }
      return synergyRead(chances, hits);
    };

    const allyRead = pooled((m) => m.vsAlly);
    const enemyRead = pooled((m) => m.vsEnemy);
    const readByEnemies = pooled((m) => m.readByEnemy);
    // Averaged over whichever halves have evidence, so a team that never met
    // an opponent on a list-bearing song isn't scored 0% exposure out of nothing.
    const parts = [allyRead, readByEnemies].filter((r) => r.chances > 0);

    return {
      teamIndex,
      label: team[0] ?? `Team ${teamIndex + 1}`,
      members,
      missing: members.filter((m) => m.songs === 0).map((m) => m.uname),
      allyRead,
      enemyRead,
      readByEnemies,
      listdifficulty: parts.length ? parts.reduce((s, r) => s + r.rate, 0) / parts.length : null,
    };
  });

  // Toughest lists first. The composite that blends internal overlap with
  // exposure is the only ordering here that means anything, and a team we have
  // no evidence for can't be ranked at all, so it sorts last.
  teams.sort(
    (a, b) => (a.listdifficulty ?? Infinity) - (b.listdifficulty ?? Infinity) || a.label.localeCompare(b.label)
  );

  const hasData = teams.some((t) => t.allyRead.chances > 0 || t.readByEnemies.chances > 0);

  return { teams, totalSongs, hasData };
}