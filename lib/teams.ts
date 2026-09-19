const norm = (s: string) => s.toLowerCase().trim();

/**
 * Parses a pasted team roster into an array of teams (each an array of
 * usernames, first = team label).
 *
 * Supports two formats:
 *
 * 1. Rank-annotated (as copy-pasted straight from the game client), e.g.
 *    "Tommy (11) JerryTheRisu (6) hopefortomorrow (5) = 22 ivesoundfan (9)
 *    wailing (6) KappuChinooo (6) = 21" — teams are delimited by the
 *    "= <total>" marker. The player's own parenthesized number is their
 *    rank — see parsePlayerRanks() to extract those.
 *
 * 2. Fallback: one team per line, usernames comma-separated
 *    ("Hyther, JESSMI2, Kirivert").
 */
export function parseTeamsBlob(text: string): string[][] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (/\(\s*\d+(?:\.\d+)?\s*\)/.test(trimmed)) {
    const segments = trimmed.split(/=\s*\d+(?:\.\d+)?/);
    const teams: string[][] = [];
    const playerRe = /([^\s()]+)\s*\(\s*\d+(?:\.\d+)?\s*\)/g;
    for (const seg of segments) {
      const names: string[] = [];
      let m: RegExpExecArray | null;
      playerRe.lastIndex = 0;
      while ((m = playerRe.exec(seg))) names.push(m[1]);
      if (names.length) teams.push(names);
    }
    if (teams.length) return teams;
  }

  return trimmed
    .split('\n')
    .map((line) => line.split(',').map((s) => s.trim()).filter(Boolean))
    .filter((t) => t.length > 0);
}

/**
 * Extracts each player's parenthesized rank number from a pasted roster
 * blob, keyed by normalized username. Only the rank-annotated format
 * carries this — the plain comma-separated fallback has no ranks, so this
 * returns {} for that.
 */
export function parsePlayerRanks(text: string): Record<string, number> {
  const trimmed = text.trim();
  const ranks: Record<string, number> = {};
  if (!trimmed) return ranks;

  const playerRe = /([^\s()]+)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = playerRe.exec(trimmed))) {
    ranks[norm(m[1])] = Number(m[2]);
  }
  return ranks;
}

/**
 * A player as listed in a `players.txt`-style paste.
 */
export interface ListedPlayer {
  name: string;
  // Letter tier from the parentheses, if the list carried one (e.g. "A-",
  // "None"). Kept for display; balancing uses ranks.
  grade?: string;
}

/**
 * Parses a `players.txt`-style list — players separated by commas and/or
 * newlines, each optionally annotated with a letter grade in parentheses,
 * e.g. "hopefortomorrow (C-), jessmi2 (A-), Tommy (A)". A trailing "(...)"
 * is treated as the grade; anything else is left as part of the name.
 */
export function parsePlayerList(text: string): ListedPlayer[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const players: ListedPlayer[] = [];
  for (const raw of trimmed.split(/[,\n]/)) {
    const entry = raw.trim();
    if (!entry) continue;

    const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(entry);
    if (!match) {
      players.push({ name: entry });
      continue;
    }
    const name = match[1].trim();
    if (!name) continue;
    const grade = match[2].trim();
    players.push(grade ? { name, grade } : { name });
  }
  return players;
}

/**
 * Parses a `ranks.txt`-style table — "<rank>: <player>, <player>, ...", one
 * rank per line — into a normalized-name -> rank map plus each name's
 * original casing. A later line wins if a name appears twice.
 */
export function parseRankList(text: string): {
  ranks: Record<string, number>;
  displayNames: Record<string, string>;
} {
  const ranks: Record<string, number> = {};
  const displayNames: Record<string, string> = {};

  for (const line of text.split('\n')) {
    const match = /^\s*(\d+(?:\.\d+)?)\s*[:=]\s*(.+)$/.exec(line);
    if (!match) continue;
    const rank = Number(match[1]);
    for (const raw of match[2].split(',')) {
      const name = raw.trim();
      if (!name) continue;
      const key = norm(name);
      ranks[key] = rank;
      displayNames[key] = name;
    }
  }

  return { ranks, displayNames };
}

/**
 * Inverse of parseTeamsBlob for prefilling the textarea when editing. When
 * ranks are available, reconstructs the rank-annotated format (with a
 * placeholder "= <sum>" boundary, which is discarded on re-parse anyway)
 * so a saved rank is still visible and editable next time.
 */
export function teamsToBlob(teams: string[][], ranks?: Record<string, number>): string {
  const hasRanks = ranks && Object.keys(ranks).length > 0;
  if (!hasRanks) {
    return teams.map((t) => t.join(', ')).join('\n');
  }

  return teams
    .map((team) => {
      const parts = team.map((name) => {
        const r = ranks![norm(name)];
        return r !== undefined ? `${name} (${r})` : name;
      });
      const total = team.reduce((sum, name) => sum + (ranks![norm(name)] ?? 0), 0);
      return `${parts.join(' ')} = ${total}`;
    })
    .join(' ');
}