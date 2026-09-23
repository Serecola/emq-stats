import { nanoid } from 'nanoid';
import { ensureSchema, getDb } from './db';
import { formatMatchTitle } from './match-title';
import { extractCatalogFromFiles } from './catalog';
import { MODES, SUBMODES_BY_MODE } from './types';
import { expectedRanksFor } from './player-ranks';
import type { Match, MatchInput, Mode, Region, SetRanks, Submode } from './types';

interface MatchRow {
  id: string;
  title: string;
  name: string;
  date: string;
  region: string;
  mode: string;
  submode: string;
  created_at: string;
  teams: string;
  files: string;
  renames: string;
  player_ranks: string;
}

function rowToMatch(row: MatchRow): Match {
  return {
    id: row.id,
    title: row.title,
    name: row.name,
    date: row.date,
    region: row.region as Region,
    mode: row.mode as Mode,
    submode: row.submode as Submode,
    createdAt: row.created_at,
    teams: JSON.parse(row.teams),
    files: JSON.parse(row.files),
    renames: row.renames ? JSON.parse(row.renames) : {},
    playerRanks: row.player_ranks ? JSON.parse(row.player_ranks) : {},
  };
}

const SELECT_COLUMNS =
  'id, title, name, date, region, mode, submode, created_at, teams, files, renames, player_ranks';

/**
 * Extracts every player/song referenced in a match's files and upserts
 * them into the global catalog tables — keyed by the game's own stable
 * IDs, not by display name, so this survives username typos/renames and
 * accumulates across every match rather than resetting.
 */
async function upsertCatalog(files: Match['files']): Promise<void> {
  const { players, songs } = extractCatalogFromFiles(files);
  const now = new Date().toISOString();
  const db = getDb();

  for (const p of players) {
    await db.execute({
      sql: `INSERT INTO players (id, name, first_seen, last_seen)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              last_seen = excluded.last_seen`,
      args: [p.id, p.name, now, now],
    });
  }
  for (const s of songs) {
    await db.execute({
      sql: `INSERT INTO songs (id, title, artist, vn, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              artist = excluded.artist,
              vn = excluded.vn,
              last_seen = excluded.last_seen`,
      args: [s.id, s.title, s.artist, s.vn, now, now],
    });
  }
}

export async function listMatches(): Promise<Match[]> {
  await ensureSchema();
  const res = await getDb().execute(
    `SELECT ${SELECT_COLUMNS} FROM matches ORDER BY date DESC, created_at DESC`
  );
  return res.rows.map((r) => rowToMatch(r as unknown as MatchRow));
}

export async function getMatch(id: string): Promise<Match | null> {
  await ensureSchema();
  const res = await getDb().execute({
    sql: `SELECT ${SELECT_COLUMNS} FROM matches WHERE id = ?`,
    args: [id],
  });
  if (!res.rows.length) return null;
  return rowToMatch(res.rows[0] as unknown as MatchRow);
}

export async function createMatch(input: MatchInput): Promise<Match> {
  await ensureSchema();
  const match: Match = {
    id: nanoid(10),
    title: formatMatchTitle(input.date, input.region, input.mode, input.submode, input.name),
    name: input.name,
    date: input.date,
    region: input.region,
    mode: input.mode,
    submode: input.submode,
    createdAt: new Date().toISOString(),
    teams: input.teams,
    files: input.files,
    renames: input.renames ?? {},
    playerRanks: input.playerRanks ?? {},
  };
  await getDb().execute({
    sql: `INSERT INTO matches (id, title, name, date, region, mode, submode, created_at, teams, files, renames, player_ranks)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      match.id,
      match.title,
      match.name,
      match.date,
      match.region,
      match.mode,
      match.submode,
      match.createdAt,
      JSON.stringify(match.teams),
      JSON.stringify(match.files),
      JSON.stringify(match.renames),
      JSON.stringify(match.playerRanks),
    ],
  });
  await upsertCatalog(match.files);
  return match;
}

export async function updateMatch(
  id: string,
  input: MatchInput
): Promise<Match | null> {
  await ensureSchema();
  const existing = await getMatch(id);
  if (!existing) return null;
  const updated: Match = {
    ...existing,
    title: formatMatchTitle(input.date, input.region, input.mode, input.submode, input.name),
    name: input.name,
    date: input.date,
    region: input.region,
    mode: input.mode,
    submode: input.submode,
    teams: input.teams,
    files: input.files,
    renames: input.renames ?? {},
    playerRanks: input.playerRanks ?? {},
  };
  await getDb().execute({
    sql: `UPDATE matches
          SET title = ?, name = ?, date = ?, region = ?, mode = ?, submode = ?, teams = ?, files = ?, renames = ?, player_ranks = ?
          WHERE id = ?`,
    args: [
      updated.title,
      updated.name,
      updated.date,
      updated.region,
      updated.mode,
      updated.submode,
      JSON.stringify(updated.teams),
      JSON.stringify(updated.files),
      JSON.stringify(updated.renames),
      JSON.stringify(updated.playerRanks),
      id,
    ],
  });
  await upsertCatalog(updated.files);
  return updated;
}

export async function deleteMatch(id: string): Promise<void> {
  await ensureSchema();
  await getDb().execute({ sql: 'DELETE FROM matches WHERE id = ?', args: [id] });
}

export interface CatalogPlayer {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
}

export interface CatalogSong {
  id: string;
  title: string;
  artist: string;
  vn: string;
  firstSeen: string;
  lastSeen: string;
}

export async function listCatalogPlayers(): Promise<CatalogPlayer[]> {
  await ensureSchema();
  const res = await getDb().execute(
    'SELECT id, name, first_seen, last_seen FROM players ORDER BY name COLLATE NOCASE'
  );
  return res.rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}

export async function listCatalogSongs(): Promise<CatalogSong[]> {
  await ensureSchema();
  const res = await getDb().execute(
    'SELECT id, title, artist, vn, first_seen, last_seen FROM songs ORDER BY title COLLATE NOCASE'
  );
  return res.rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    vn: r.vn,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}

/**
 * Admin-assigned ladder ranks, keyed `mode -> sub-mode -> normalized
 * username -> rank` — one rank per player per gamemode *and* sub-mode
 * (NGMC Normal, NGMC Random, Erumode Balanced, ...), since that is the
 * granularity a draft is balanced at. See lib/balance.ts and
 * lib/player-ranks.ts for how the two halves consume this.
 */
export async function listSetRanks(): Promise<SetRanks> {
  await ensureSchema();
  const res = await getDb().execute(
    'SELECT player_key, mode, submode, rank FROM player_set_ranks'
  );
  const ranks: SetRanks = {};
  for (const row of res.rows as any[]) {
    const mode = String(row.mode);
    const submode = String(row.submode);
    // Ignore rows for a mode/sub-mode combination this build no longer knows
    // about (e.g. an option renamed after a rank was saved).
    if (!(SUBMODES_BY_MODE as Record<string, string[]>)[mode]?.includes(submode)) continue;
    if (!ranks[mode]) ranks[mode] = {};
    if (!ranks[mode][submode]) ranks[mode][submode] = {};
    ranks[mode][submode][row.player_key] = Number(row.rank);
  }
  return ranks;
}

/**
 * Expected Ranks for a given gamemode + sub-mode, computed from player
 * performance across all matches. Keyed `mode -> sub-mode -> normalized
 * username -> rank`, matching the shape of Set Ranks so they can be used
 * interchangeably as a fallback in autodraft.
 *
 * Returns null for any mode/sub-mode combination with no performance data.
 */
export async function listExpectedRanks(): Promise<SetRanks> {
  await ensureSchema();
  const allMatches = await listMatches();
  const ranks: SetRanks = {};

  for (const mode of MODES) {
    if (!ranks[mode]) ranks[mode] = {};
    for (const submode of SUBMODES_BY_MODE[mode]) {
      const submodeMatches = allMatches.filter(
        (m) => m.mode === mode && m.submode === submode
      );
      const gamemodeMatches = allMatches.filter((m) => m.mode === mode);
      const expected = expectedRanksFor(submodeMatches, gamemodeMatches, mode, submode);
      if (expected) {
        ranks[mode][submode] = expected;
      }
    }
  }

  return ranks;
}

/**
 * Sets (or, with `rank === null`, clears) one player's rank for a single
 * gamemode + sub-mode. Only that one row is touched, so ranking a roster for
 * one sub-mode never disturbs the player's rank in any other.
 */
export async function setPlayerSetRank(
  playerKey: string,
  mode: Mode,
  submode: Submode,
  rank: number | null
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  if (rank === null) {
    await db.execute({
      sql: 'DELETE FROM player_set_ranks WHERE player_key = ? AND mode = ? AND submode = ?',
      args: [playerKey, mode, submode],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO player_set_ranks (player_key, mode, submode, rank, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(player_key, mode, submode) DO UPDATE SET
            rank = excluded.rank,
            updated_at = excluded.updated_at`,
    args: [playerKey, mode, submode, rank, new Date().toISOString()],
  });
}