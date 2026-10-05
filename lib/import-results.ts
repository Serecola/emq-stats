/**
 * Clipboard import for the admin form's score boxes: a results table copied
 * out of a spreadsheet (or wherever) is one row per game in four
 * tab-separated columns —
 *
 *   Team 1 <tab> Score 1 <tab> Team 2 <tab> Score 2
 *   patt (11) AisuBot (6) wailing (5) <tab> -1 <tab> Tommy (10) ... <tab> 14
 *
 * optionally under that same header. Team cells carry the members with
 * their "(rank)" annotations — exactly how a rank-annotated roster paste
 * lists them (see parseTeamsBlob in lib/teams.ts) — so the same copy-paste
 * that filled the roster matches here once the annotations are stripped.
 *
 * Everything below is deliberately pure (no React, no DB, no bracket
 * generation): the caller hands in the roster and the rounds it already
 * has, and does the score-state writes itself.
 */

const norm = (s: string) => s.toLowerCase().trim();

/** One parsed row: the raw team cells and their numeric scores. */
export interface ClipboardResultRow {
  team1: string;
  score1: number;
  team2: string;
  score2: number;
}

/**
 * The team cell as a comparable key: "(rank)" annotations stripped,
 * whitespace collapsed, lowercased — "patt (11) AisuBot (6) wailing (5)"
 * becomes "patt aisubot wailing". Roster teams go through the same
 * function, so a cell matches whether the roster was pasted
 * rank-annotated or comma-separated.
 */
export function clipboardTeamKey(cell: string): string {
  return norm(cell.replace(/\(\s*\d+(?:\.\d+)?\s*\)/g, ' ').replace(/\s+/g, ' '));
}

/**
 * Splits a clipboard table into rows. Tolerates the expected header row,
 * blank lines, \r\n line endings and stray whitespace around cells;
 * anything else that isn't four cells with two parseable numbers is
 * counted as `bad` rather than silently dropped — the caller reports it
 * so a half-garbled paste can't quietly import only part of its rows.
 */
export function parseResultsTsv(text: string): { rows: ClipboardResultRow[]; bad: number } {
  const rows: ClipboardResultRow[] = [];
  let bad = 0;
  const score = (raw: string): number | null => {
    const cell = raw.trim();
    return cell !== '' && !isNaN(Number(cell)) ? Number(cell) : null;
  };
  for (const rawLine of text.split('\n')) {
    const cells = rawLine.split('\t').map((c) => c.trim());
    if (cells.every((c) => c === '')) continue;
    // The "Team 1  Score 1  Team 2  Score 2" header (any column numbers).
    if (cells.slice(0, 4).some((c) => /^(team|score)\s*\d+$/i.test(c))) continue;
    if (cells.length < 4) {
      bad++;
      continue;
    }
    const [team1, s1, team2, s2] = cells;
    const score1 = score(s1);
    const score2 = score(s2);
    if (!team1 || !team2 || score1 === null || score2 === null) {
      bad++;
      continue;
    }
    rows.push({ team1, score1, team2, score2 });
  }
  return { rows, bad };
}

/** The slice of a bracket fixture the importer needs — structurally
 * satisfied by BracketMatchup (lib/schedule.ts) without importing it, so
 * this module stays dependency-free and verifiable on its own. */
export interface ImportableFixture {
  slot: string;
  teamAIndex: number;
  teamBIndex: number;
}

export interface ImportableRound {
  matchups: ImportableFixture[];
}

/** One fixture's scores, oriented to the fixture's own team order. */
export interface ImportedFixtureScore {
  slot: string;
  teamAIndex: number;
  teamBIndex: number;
  scoreA: number; // the score for teamAIndex
  scoreB: number; // the score for teamBIndex
}

export interface ImportMatchResult {
  /** One entry per row that found a fixture slot, in row order. */
  applied: ImportedFixtureScore[];
  /** Every team cell that matched no roster team (duplicates kept — the
   * caller dedupes for display, this side counts rows). */
  unknownTeams: string[];
  /** Rows contributing at least one unknown team cell. */
  unknownTeamRows: number;
  /** Rows with no fixture slot left to fill — a pairing already full, or a
   * degenerate row like the same team on both sides. */
  extraRows: number;
}

/**
 * Matches parsed rows to bracket fixtures and orients their scores.
 *
 * Teams are looked up by their stripped cell key — first as an ordered
 * match ("patt aisubot wailing"), then by sorted members as a fallback for
 * a cell that lists the same team in a different order (that key is only
 * registered when it's unique, so an ambiguous one can't match the wrong
 * team).
 *
 * For a pairing that plays twice (the 4-team double round robin) both
 * fixtures hold the same two teams, so rows are assigned by occurrence:
 * the first row mentioning a pair fills that pair's first fixture in
 * bracket order, the second row its rematch — the same convention
 * matchFilesToBracket uses when placing uploads into an empty slot of the
 * pair. A row's columns may list the sides either way round (a rematch
 * often flips them); scores are oriented by which column holds the
 * fixture's teamAIndex.
 */
export function matchResultsToFixtures(
  rows: ClipboardResultRow[],
  teams: string[][],
  rounds: ImportableRound[]
): ImportMatchResult {
  const ordered = new Map<string, number>();
  const sorted = new Map<string, number>();
  const ambiguous = new Set<string>();
  teams.forEach((team, index) => {
    const key = clipboardTeamKey(team.join(' '));
    if (!ordered.has(key)) ordered.set(key, index);
    const sortedKey = key.split(' ').slice().sort().join(' ');
    if (sorted.has(sortedKey)) ambiguous.add(sortedKey);
    else sorted.set(sortedKey, index);
  });
  for (const key of ambiguous) sorted.delete(key);

  const lookup = (cell: string): number | null => {
    const key = clipboardTeamKey(cell);
    return ordered.get(key) ?? sorted.get(key.split(' ').slice().sort().join(' ')) ?? null;
  };

  // Fixtures grouped per pairing, in bracket order (1 entry per cycle).
  const pairKey = (i: number, j: number) => `${Math.min(i, j)},${Math.max(i, j)}`;
  const fixturesByPair = new Map<string, ImportableFixture[]>();
  for (const round of rounds) {
    for (const m of round.matchups) {
      const key = pairKey(m.teamAIndex, m.teamBIndex);
      const list = fixturesByPair.get(key);
      if (list) list.push(m);
      else fixturesByPair.set(key, [m]);
    }
  }

  const consumed = new Map<string, number>();
  const applied: ImportedFixtureScore[] = [];
  const unknownTeams: string[] = [];
  let unknownTeamRows = 0;
  let extraRows = 0;

  for (const row of rows) {
    const i1 = lookup(row.team1);
    const i2 = lookup(row.team2);
    if (i1 === null || i2 === null) {
      unknownTeamRows++;
      if (i1 === null) unknownTeams.push(row.team1);
      if (i2 === null) unknownTeams.push(row.team2);
      continue;
    }
    if (i1 === i2) {
      // The same team on both sides isn't a fixture this bracket has.
      extraRows++;
      continue;
    }
    const key = pairKey(i1, i2);
    const fixtures = fixturesByPair.get(key);
    const used = consumed.get(key) ?? 0;
    if (!fixtures || used >= fixtures.length) {
      extraRows++;
      continue;
    }
    consumed.set(key, used + 1);
    const fixture = fixtures[used];
    const teamAFirst = i1 === fixture.teamAIndex;
    applied.push({
      slot: fixture.slot,
      teamAIndex: fixture.teamAIndex,
      teamBIndex: fixture.teamBIndex,
      scoreA: teamAFirst ? row.score1 : row.score2,
      scoreB: teamAFirst ? row.score2 : row.score1,
    });
  }

  return { applied, unknownTeams, unknownTeamRows, extraRows };
}
