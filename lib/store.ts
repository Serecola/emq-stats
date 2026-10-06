import { nanoid } from 'nanoid';
import type { InStatement } from '@libsql/client';
import { cached, markDataChanged } from './cache';
import { ensureSchema, getDb } from './db';
import { formatMatchTitle } from './match-title';
import { extractCatalogFromFiles } from './catalog';
import { MODES, SUBMODES_BY_MODE } from './types';
import { ALL_MATCH_FILTER, applyMatchFilter, type MatchFilter } from './match-filter';
import { computeAllPlayerStats, type PlayerSummary } from './player-stats';
import { computePlayerSynergy, type PlayerSynergyStats } from './player-synergy';
import { computePlayerMisses, type PlayerMissStats } from './player-misses';
import { computePlayerGameRecords, type PlayerGameRecord } from './results';
import { computePlayerRankRows, expectedRanksFor, recentExpectedRanksFor, recentVnExpectedRanksFor, type PlayerRankRow } from './player-ranks';
import { canonicalAliases, resolveAliasKey, withAliases, type PlayerAliases } from './player-aliases';
import { withAssumedZeroScores } from './schedule';
import { norm } from './stats';
import type {
  Match,
  MatchInput,
  MatchSummary,
  Mode,
  PlayerTag,
  Region,
  SetRanks,
  Submode,
  Team,
} from './types';

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
  substitutes?: string | null;
  player_ranks: string;
  file_count: number;
  exclude_from_stats?: number | null;
}

function rowToMatch(row: MatchRow, aliases: PlayerAliases = {}): Match {
  const teams: Team[] = JSON.parse(row.teams);
  const renames: Record<string, string> = row.renames ? JSON.parse(row.renames) : {};
  const substitutes: Record<string, string> = row.substitutes
    ? JSON.parse(row.substitutes)
    : {};
  return {
    id: row.id,
    title: row.title,
    name: row.name,
    date: row.date,
    region: row.region as Region,
    mode: row.mode as Mode,
    submode: row.submode as Submode,
    createdAt: row.created_at,
    teams,
    // The scores as entered, plus a 0 for any game only one side of which was
    // scored — a blank box means "scored nothing", not "didn't play" — see
    // withAssumedZeroScores. Done here, at the single point where stored files
    // become a Match, so every reader agrees (standings, bracket cards, the
    // admin form's own score boxes) and records saved before this rule existed
    // read the same as fresh ones, with no migration and no re-save. Global
    // aliases are folded under the match's own renames for this resolution —
    // a file whose raw JSON names its players through an alias still finds
    // its fixture — while the `renames` field itself stays exactly as stored:
    // aliases are global and are never baked into a match.
    files: withAssumedZeroScores(teams, JSON.parse(row.files), withAliases(renames, aliases), substitutes),
    renames,
    substitutes,
    playerRanks: row.player_ranks ? JSON.parse(row.player_ranks) : {},
    excludeFromStats: Number(row.exclude_from_stats ?? 0) === 1,
  };
}

function rowToMatchSummary(row: MatchRow): MatchSummary {
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
    renames: row.renames ? JSON.parse(row.renames) : {},
    substitutes: row.substitutes ? JSON.parse(row.substitutes) : {},
    playerRanks: row.player_ranks ? JSON.parse(row.player_ranks) : {},
    fileCount: Number(row.file_count ?? 0),
    excludeFromStats: Number(row.exclude_from_stats ?? 0) === 1,
  };
}

const SELECT_COLUMNS =
  'id, title, name, date, region, mode, submode, created_at, teams, files, renames, substitutes, player_ranks, file_count, exclude_from_stats';

// Tour display order: newest date first; tours sharing a date run in play
// order NA, then EU, then Asia (see REGION_ORDER in lib/types.ts); creation
// time breaks any remaining tie (same date + region).
const MATCH_ORDER_BY = `ORDER BY date DESC,
  CASE region WHEN 'NA' THEN 0 WHEN 'EU' THEN 1 WHEN 'Asia' THEN 2 ELSE 3 END ASC,
  created_at DESC`;

// Everything except `files`: one raw EMQ export is ~100 kB, a tournament
// ~2 MB, and list views only render the count — which `file_count` has held
// since it was written, so they never touch the payload at all.
const SUMMARY_COLUMNS =
  'id, title, name, date, region, mode, submode, created_at, teams, renames, substitutes, player_ranks, file_count, exclude_from_stats';

// A match feeds player aggregates (last-5 / all-time stats, rank rows,
// Expected Ranks for the autodrafter) only when it isn't opted out. Every
// derivation goes through this one filter; lists, the match page itself and
// exports keep reading the unfiltered rows.
function statsMatches(matches: Match[]): Match[] {
  return matches.filter((m) => !m.excludeFromStats);
}


// How many statements to send per batch when writing a match's catalog. A
// tournament with a full roster can contribute hundreds of players/songs,
// and as individual `execute` calls each one was its own round trip to the
// database engine — unnoticeable against a local file, but it adds up.
const CATALOG_BATCH_SIZE = 200;

async function runBatched(statements: InStatement[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < statements.length; i += CATALOG_BATCH_SIZE) {
    await db.batch(statements.slice(i, i + CATALOG_BATCH_SIZE));
  }
}

/**
 * Extracts every player/song referenced in a match's files and folds them
 * into the global catalog tables — keyed by the game's own stable IDs (the
 * PlayerGuessInfos key for players, Song.Id for songs), not by display name,
 * so this survives username typos/renames and accumulates across every match
 * rather than resetting.
 *
 * Returned as statements rather than executed, so a create/update can send
 * them in the same batch as the match row itself: one round trip instead of
 * one per player and per song.
 */
function catalogStatements(files: Match['files']): InStatement[] {
  const { players, songs } = extractCatalogFromFiles(files);
  const now = new Date().toISOString();

  return [
    ...players.map((p) => ({
      sql: `INSERT INTO players (id, name, first_seen, last_seen)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              last_seen = excluded.last_seen`,
      args: [p.id, p.name, now, now],
    })),
    ...songs.map((s) => ({
      sql: `INSERT INTO songs (id, title, artist, vn, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              artist = excluded.artist,
              vn = excluded.vn,
              last_seen = excluded.last_seen`,
      args: [s.id, s.title, s.artist, s.vn, now, now],
    })),
  ];
}

/**
 * Every match, raw file payloads included — the input every stats
 * computation needs. Cached for the life of the data version, because
 * deriving stats means walking all of this JSON; callers must treat the
 * returned objects as read-only (filter them, don't mutate them).
 */
export async function listMatches(): Promise<Match[]> {
  await ensureSchema();
  return cached('matches', async () => {
    const res = await getDb().execute(
      `SELECT ${SELECT_COLUMNS} FROM matches ${MATCH_ORDER_BY}`
    );
    // Read once here so score completion in rowToMatch can resolve a file
    // whose JSON only names players through a global alias.
    const aliases = await listPlayerAliases();
    return res.rows.map((r) => rowToMatch(r as unknown as MatchRow, aliases));
  });
}

/**
 * The same list without the raw file payloads, for the views that only
 * render a tournament's roster and file count. Reads a couple of kB per row
 * instead of megabytes, so it needs no caching to be cheap.
 */
export async function listMatchSummaries(): Promise<MatchSummary[]> {
  await ensureSchema();
  const res = await getDb().execute(
    `SELECT ${SUMMARY_COLUMNS} FROM matches ${MATCH_ORDER_BY}`
  );
  return res.rows.map((r) => rowToMatchSummary(r as unknown as MatchRow));
}

export async function getMatch(id: string): Promise<Match | null> {
  await ensureSchema();
  return cached(`match:${id}`, async () => {
    const res = await getDb().execute({
      sql: `SELECT ${SELECT_COLUMNS} FROM matches WHERE id = ?`,
      args: [id],
    });
    if (!res.rows.length) return null;
    return rowToMatch(res.rows[0] as unknown as MatchRow, await listPlayerAliases());
  });
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
    substitutes: input.substitutes ?? {},
    playerRanks: input.playerRanks ?? {},
    excludeFromStats: input.excludeFromStats === true,
  };
  const insert: InStatement = {
    sql: `INSERT INTO matches (id, title, name, date, region, mode, submode, created_at, teams, files, renames, substitutes, player_ranks, file_count, exclude_from_stats)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(match.substitutes),
      JSON.stringify(match.playerRanks),
      match.files.length,
      match.excludeFromStats ? 1 : 0,
    ],
  };
  await runBatched([insert, ...catalogStatements(match.files)]);
  await markDataChanged();
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
    substitutes: input.substitutes ?? {},
    playerRanks: input.playerRanks ?? {},
    // The editor form no longer sends this (the toggle lives on the Tour
    // Manager row) — an undefined input keeps the stored flag, so a re-save
    // never silently re-includes an excluded tour.
    excludeFromStats:
      input.excludeFromStats === undefined ? existing.excludeFromStats : input.excludeFromStats === true,
  };
  const update: InStatement = {
    sql: `UPDATE matches
          SET title = ?, name = ?, date = ?, region = ?, mode = ?, submode = ?, teams = ?, files = ?, renames = ?, substitutes = ?, player_ranks = ?, file_count = ?, exclude_from_stats = ?
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
      JSON.stringify(updated.substitutes),
      JSON.stringify(updated.playerRanks),
      updated.files.length,
      updated.excludeFromStats ? 1 : 0,
      id,
    ],
  };
  await runBatched([update, ...catalogStatements(updated.files)]);
  await markDataChanged();
  return updated;
}

export async function deleteMatch(id: string): Promise<void> {
  await ensureSchema();
  await getDb().execute({ sql: 'DELETE FROM matches WHERE id = ?', args: [id] });
  await markDataChanged();
}

/**
 * Flips one tournament's stats opt-out flag without touching anything else.
 * Used by the Tour Manager row toggle (PATCH
 * /api/matches/[id]) — unlike updateMatch it never rewrites roster, uploads,
 * scores or renames, so it can't clobber an editor save.
 */
export async function setMatchExcluded(id: string, excluded: boolean): Promise<Match | null> {
  await ensureSchema();
  await getDb().execute({
    sql: 'UPDATE matches SET exclude_from_stats = ? WHERE id = ?',
    args: [excluded ? 1 : 0, id],
  });
  await markDataChanged();
  return getMatch(id);
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
  return cached('set-ranks', async () => {
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
  });
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
  return cached('expected-ranks', async () => {
    const allMatches = statsMatches(await listMatches());
    const aliases = await listPlayerAliases();
    const ranks: SetRanks = {};

    for (const mode of MODES) {
      if (!ranks[mode]) ranks[mode] = {};
      for (const submode of SUBMODES_BY_MODE[mode]) {
        const submodeMatches = allMatches.filter(
          (m) => m.mode === mode && m.submode === submode
        );
        const expected = expectedRanksFor(submodeMatches, mode, aliases);
        if (expected) {
          ranks[mode][submode] = expected;
        }
      }
    }

    return ranks;
  });
}

/**
 * Expected Ranks from each player's 5 most recent tournaments (rather than
 * their full history) — the autodrafter's "Expected (last 5)" rank source.
 * Same shape and caching as listSetRanks/listExpectedRanks; any mode or
 * sub-mode without performance data is simply left out, so the caller falls
 * back to Set Ranks there.
 */
export async function listRecentExpectedRanks(): Promise<SetRanks> {
  await ensureSchema();
  return cached('recent-expected-ranks', async () => {
    const allMatches = statsMatches(await listMatches());
    const aliases = await listPlayerAliases();
    const ranks: SetRanks = {};

    for (const mode of MODES) {
      if (!ranks[mode]) ranks[mode] = {};
      for (const submode of SUBMODES_BY_MODE[mode]) {
        const submodeMatches = allMatches.filter(
          (m) => m.mode === mode && m.submode === submode
        );
        const expected = recentExpectedRanksFor(submodeMatches, mode, 5, aliases);
        if (expected) {
          ranks[mode][submode] = expected;
        }
      }
    }

    return ranks;
  });
}

/**
 * VN-only Expected Ranks from each player's 5 most recent tournaments — the
 * autodrafter's "Expected (VN Only)" rank source. Same shape and caching as
 * listRecentExpectedRanks, but only Mst (main-title) answers feed it, so a
 * tournament that also ran extra GR columns contributes exactly its VN
 * numbers. Any mode/sub-mode without VN data is left out, so the caller
 * treats those players as unranked (no Set Rank fallback — same as the
 * old Pasted-table source this replaces).
 */
export async function listRecentVnExpectedRanks(): Promise<SetRanks> {
  await ensureSchema();
  return cached('recent-vn-expected-ranks', async () => {
    const allMatches = statsMatches(await listMatches());
    const aliases = await listPlayerAliases();
    const ranks: SetRanks = {};

    for (const mode of MODES) {
      if (!ranks[mode]) ranks[mode] = {};
      for (const submode of SUBMODES_BY_MODE[mode]) {
        const submodeMatches = allMatches.filter(
          (m) => m.mode === mode && m.submode === submode
        );
        const expected = recentVnExpectedRanksFor(submodeMatches, mode, 5, aliases);
        if (expected) {
          ranks[mode][submode] = expected;
        }
      }
    }

    return ranks;
  });
}

/**
 * Every player's aggregated stats across the tournaments matching `filter`
 * — the input to /players, /players/[uname] and the Player Manager. This is
 * the expensive read (it derives guess rates, attacks and blocks from every
 * matching match's raw JSON), so it is cached per filter for the life of
 * the data version instead of being recomputed per render.
 */
export async function listPlayerStats(filter: MatchFilter): Promise<PlayerSummary[]> {
  await ensureSchema();
  return cached(`player-stats:${filter.mode}:${filter.submode}`, async () => {
    const matches = applyMatchFilter(statsMatches(await listMatches()), filter);
    return computeAllPlayerStats(matches, await listPlayerAliases());
  });
}

/**
 * One player's aggregated stats under `filter`, or null when they don't
 * appear in it. A thin wrapper over the cached aggregate above, so looking
 * one player up costs no more than listing them all.
 */
export async function findPlayerStats(
  uname: string,
  filter: MatchFilter = ALL_MATCH_FILTER
): Promise<PlayerSummary | null> {
  const summaries = await listPlayerStats(filter);
  // Resolve the alias before matching, so a page opened under an old username
  // lands on the merged player rather than reporting "never played".
  const key = resolveAliasKey(uname, await listPlayerAliases());
  return summaries.find((p) => norm(p.uname) === key) ?? null;
}

/**
 * One player's synergy against every other player they have shared a tournament
 * with, under `filter` — the input to the player page's Synergy section.
 *
 * Scoped to `matchIds` rather than to the whole filter, because the page shows
 * one slice of a player's history at a time (see StatsRange): the caller hands
 * over the tournaments the stat cards and the history table are reading, so the
 * ranking can never report all-time numbers under a "last 5 of 12" heading.
 * Cached per player + filter + that exact set, which is what keeps the Recent /
 * All-Time switch from re-walking every raw export on each render — the same
 * trade `listPlayerStats` makes, one level narrower.
 *
 * Null when the name resolves to nobody in the slice, so the caller can leave
 * the section off rather than render an empty table.
 */
export async function findPlayerSynergy(
  uname: string,
  filter: MatchFilter,
  matchIds: string[]
): Promise<PlayerSynergyStats | null> {
  await ensureSchema();
  // Aliases resolved first, so a page reached under an old username ranks the
  // same player the rest of the page is about (see findPlayerStats).
  const key = resolveAliasKey(uname, await listPlayerAliases());
  const scope = matchIds.join(',');
  return cached(`player-synergy:${filter.mode}:${filter.submode}:${key}:${scope}`, async () => {
    const wanted = new Set(matchIds);
    const matches = applyMatchFilter(statsMatches(await listMatches()), filter).filter((m) =>
      wanted.has(m.id)
    );
    if (!matches.length) return null;
    return computePlayerSynergy(matches, uname, await listPlayerAliases());
  });
}

/**
 * One player's most-missed VNs and artists under `filter` — the input to the
 * player page's Most Missed section, and the same shape of read as
 * `findPlayerSynergy` above.
 *
 * Scoped to `matchIds` rather than to the whole filter, because the page shows
 * one slice of a player's history at a time (see StatsRange): the caller hands
 * over the tournaments the stat cards and the history table are reading, so a
 * "last 5 of 12" page can't report a career-long ranking. Cached per player +
 * filter + that exact set, which is what keeps the Recent / All-Time switch
 * from re-walking every raw export on each render.
 *
 * Null when the name resolves to nobody in the slice, so the caller can leave
 * the section off rather than render an empty table.
 */
export async function findPlayerMisses(
  uname: string,
  filter: MatchFilter,
  matchIds: string[]
): Promise<PlayerMissStats | null> {
  await ensureSchema();
  const key = resolveAliasKey(uname, await listPlayerAliases());
  const scope = matchIds.join(',');
  return cached(`player-misses:${filter.mode}:${filter.submode}:${key}:${scope}`, async () => {
    const wanted = new Set(matchIds);
    const matches = applyMatchFilter(statsMatches(await listMatches()), filter).filter((m) =>
      wanted.has(m.id)
    );
    if (!matches.length) return null;
    return computePlayerMisses(matches, uname, await listPlayerAliases());
  });
}

/**
 * One player's win / tie / loss over a slice of tournaments under `filter` —
 * the input to the player page's Winrate card, and the same shape of read as
 * `findPlayerMisses` above.
 *
 * Scoped to `matchIds` for the same reason: the page shows one slice of a
 * player's history at a time (see StatsRange), so a "last 5 of 12" page can't
 * report a career-long record. Cached per player + filter + that exact set, so
 * the Recent / All-Time switch doesn't re-walk every raw export on each render.
 *
 * Per *game*, not per tournament — `computePlayerGameRecords` credits each game
 * a player was actually in — and never null: a player with no scored game in
 * the slice simply comes back with zeros, which `winRatePct` reports as a dash.
 */
export async function findPlayerGameRecord(
  uname: string,
  filter: MatchFilter,
  matchIds: string[]
): Promise<PlayerGameRecord> {
  await ensureSchema();
  const aliases = await listPlayerAliases();
  const key = resolveAliasKey(uname, aliases);
  const scope = matchIds.join(',');
  return cached(`player-game-record:${filter.mode}:${filter.submode}:${key}:${scope}`, async () => {
    const wanted = new Set(matchIds);
    const matches = applyMatchFilter(statsMatches(await listMatches()), filter).filter((m) =>
      wanted.has(m.id)
    );
    const record: PlayerGameRecord = { wins: 0, ties: 0, losses: 0, games: 0 };
    for (const inMatch of Object.values(computePlayerGameRecords(matches, aliases)[key] ?? {})) {
      record.wins += inMatch.wins;
      record.ties += inMatch.ties;
      record.losses += inMatch.losses;
      record.games += inMatch.games;
    }
    return record;
  });
}

/**
 * The Player Manager's table for one gamemode + sub-mode. Cached per
 * combination — and per range, since the "Recent (5)" rows are a different
 * table from the all-time ones — because computing it walks every one of that
 * sub-mode's tournaments' raw JSON.
 */
export async function listPlayerRankRows(
  mode: Mode,
  submode: Submode,
  limit?: number
): Promise<PlayerRankRow[]> {
  await ensureSchema();
  return cached(`player-ranks:${mode}:${submode}:${limit ?? 'all'}`, async () => {
    const allMatches = statsMatches(await listMatches());
    // This sub-mode and nothing else — a sibling sub-mode's tournaments are a
    // different game, so they never contribute figures here.
    const matches = applyMatchFilter(allMatches, { mode, submode });
    const setRanks = await listSetRanks();
    return computePlayerRankRows(
      matches,
      setRanks,
      mode,
      submode,
      await listPlayerAliases(),
      limit
    );
  });
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
    await markDataChanged();
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
  await markDataChanged();
}

/**
 * Every global alias, as normalized alias -> canonical display name. Fed to
 * computeAllPlayerStats so the aliased names aggregate onto one player
 * everywhere (see lib/player-aliases.ts). Cached like the other derived reads;
 * every write below bumps the data version, so a change shows up immediately.
 */
export async function listPlayerAliases(): Promise<PlayerAliases> {
  await ensureSchema();
  return cached('player-aliases', async () => {
    const res = await getDb().execute('SELECT alias_key, display_name FROM player_aliases');
    const aliases: PlayerAliases = {};
    for (const row of res.rows as any[]) {
      const display = String(row.display_name);
      if (!display) continue;
      aliases[String(row.alias_key)] = display;
    }
    // Chained aliases are flattened once here, so every consumer sees a flat
    // map and the chain is walked at most once per request, not once per name.
    return canonicalAliases(aliases);
  });
}

/**
 * Points one username at another as "the same person", or with
 * `targetKey === null` removes that claim.
 *
 * This is a real identity merge, so it also carries the per-username data
 * that lives outside the recomputed-from-JSON stats: the alias's Set Ranks
 * move onto the canonical player, as does its bot/override row. Where the
 * canonical player already has its own value for a given mode + sub-mode, that
 * existing value wins and the alias's is dropped — the canonical name is the
 * one being kept, so its explicit choices shouldn't be overwritten by a name
 * that's about to stop existing.
 *
 * Removing an alias only stops the merging. Anything already migrated stays on
 * the canonical player rather than being handed back, since which name a past
 * rank was typed under isn't recoverable afterwards.
 */
export async function setPlayerAlias(
  aliasKey: string,
  targetKey: string | null,
  targetDisplay: string | null
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  if (targetKey === null) {
    await db.execute({ sql: 'DELETE FROM player_aliases WHERE alias_key = ?', args: [aliasKey] });
    await markDataChanged();
    return;
  }
  if (targetDisplay === null) throw new Error('A target name is required.');

  await db.execute({
    sql: `INSERT INTO player_aliases (alias_key, display_name, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(alias_key) DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = excluded.updated_at`,
    args: [aliasKey, targetDisplay, new Date().toISOString()],
  });

  // Move Set Ranks across, per mode + sub-mode. UPDATE OR IGNORE skips the
  // (mode, submode) pairs the canonical player is already ranked in — the
  // primary key rejects them — and the DELETE then clears whatever is left
  // under the old name.
  await db.batch([
    {
      sql: 'UPDATE OR IGNORE player_set_ranks SET player_key = ? WHERE player_key = ?',
      args: [targetKey, aliasKey],
    },
    { sql: 'DELETE FROM player_set_ranks WHERE player_key = ?', args: [aliasKey] },
    // Same rule for the bot/override row: the canonical player's own decision
    // wins, the alias's only fills a gap.
    {
      sql: 'UPDATE OR IGNORE player_tags SET player_key = ? WHERE player_key = ?',
      args: [targetKey, aliasKey],
    },
    { sql: 'DELETE FROM player_tags WHERE player_key = ?', args: [aliasKey] },
  ]);
  await markDataChanged();
}

/**
 * Every stored username->tag decision, keyed by normalized username — the
 * same identity stats and Set Ranks use. These are *overrides*, not a full
 * tag list: most usernames have no row because the automatic name rule in
 * lib/player-tags.ts already answers for them, and callers must go through
 * `resolvePlayerTag` rather than reading this map directly.
 *
 * Cached for the life of the data version like the other derived reads: the
 * table is tiny, but the Player Manager and the public badge lookups hit it
 * on every render.
 */
export async function listPlayerTags(): Promise<Record<string, PlayerTag>> {
  await ensureSchema();
  return cached('player-tags', async () => {
    const res = await getDb().execute('SELECT player_key, tag FROM player_tags');
    const tags: Record<string, PlayerTag> = {};
    for (const row of res.rows as any[]) {
      const tag = String(row.tag);
      // Only these two are ever written (the API validates), but a
      // hand-edited row shouldn't surface as a badge with garbage text.
      if (tag !== 'Bot' && tag !== 'NotBot') continue;
      tags[String(row.player_key)] = tag;
    }
    return tags;
  });
}

/**
 * Records (or, with `tag === null`, forgets) one username's decision. One row
 * per username — no mode/sub-mode dimension — so tagging a name anywhere tags
 * it everywhere. `null` removes the override, putting the name back under the
 * automatic rule.
 */
export async function setPlayerTag(
  playerKey: string,
  tag: PlayerTag | null
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  if (tag === null) {
    await db.execute({
      sql: 'DELETE FROM player_tags WHERE player_key = ?',
      args: [playerKey],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO player_tags (player_key, tag, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(player_key) DO UPDATE SET
              tag = excluded.tag,
              updated_at = excluded.updated_at`,
      args: [playerKey, tag, new Date().toISOString()],
    });
  }
  await markDataChanged();
}