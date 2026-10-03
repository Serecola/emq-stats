import { createClient, type Client } from '@libsql/client';

// In production, set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (from `turso db
// tokens create`) as Vercel env vars. Locally, if those aren't set, this
// falls back to a SQLite file on disk (./local.db) so `npm run dev` works
// with zero setup.
let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  client = createClient(
    authToken ? { url, authToken } : { url }
  );
  return client;
}

// Columns added after the first release, applied by name instead of by a
// blind ALTER-and-swallow-the-error loop: an up-to-date database then costs
// one statement (the pragma read) rather than one failed ALTER per column,
// and this runs on every new process.
const MATCH_COLUMN_MIGRATIONS: [column: string, statement: string][] = [
  ['name', "ALTER TABLE matches ADD COLUMN name TEXT NOT NULL DEFAULT ''"],
  ['date', "ALTER TABLE matches ADD COLUMN date TEXT NOT NULL DEFAULT ''"],
  ['region', "ALTER TABLE matches ADD COLUMN region TEXT NOT NULL DEFAULT ''"],
  ['mode', "ALTER TABLE matches ADD COLUMN mode TEXT NOT NULL DEFAULT ''"],
  ['submode', "ALTER TABLE matches ADD COLUMN submode TEXT NOT NULL DEFAULT ''"],
  ['format', "ALTER TABLE matches ADD COLUMN format TEXT NOT NULL DEFAULT 'RoundRobin'"],
  ['renames', "ALTER TABLE matches ADD COLUMN renames TEXT NOT NULL DEFAULT '{}'"],
  ['player_ranks', "ALTER TABLE matches ADD COLUMN player_ranks TEXT NOT NULL DEFAULT '{}'"],
  // Counted once at write time so list views can show "3 files" without
  // reading (and parsing) the `files` payload they don't render.
  ['file_count', 'ALTER TABLE matches ADD COLUMN file_count INTEGER NOT NULL DEFAULT 0'],
  // Per-tournament stats opt-out: the tour stays visible (lists, its own
  // page, exports) but feeds no player aggregates — last-5 nor all-time.
  // Stored INTEGER 0/1 (SQLite has no bool); read as boolean in
  // lib/store.ts rowToMatch/rowToMatchSummary.
  ['exclude_from_stats', 'ALTER TABLE matches ADD COLUMN exclude_from_stats INTEGER NOT NULL DEFAULT 0'],
];

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb();

      // Structure in one round trip: the table DDL, the shared cache stamp
      // (see lib/cache.ts) and the index the list views order by. Filtering
      // by mode/sub-mode happens in JS (applyMatchFilter), so the list order
      // is the only ordering SQL can index for.
      await db.batch([
        `CREATE TABLE IF NOT EXISTS matches (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL DEFAULT '',
          region TEXT NOT NULL DEFAULT '',
          mode TEXT NOT NULL DEFAULT '',
          submode TEXT NOT NULL DEFAULT '',
          format TEXT NOT NULL DEFAULT 'RoundRobin',
          created_at TEXT NOT NULL,
          teams TEXT NOT NULL,
          files TEXT NOT NULL,
          renames TEXT NOT NULL DEFAULT '{}',
          player_ranks TEXT NOT NULL DEFAULT '{}',
          file_count INTEGER NOT NULL DEFAULT 0,
          exclude_from_stats INTEGER NOT NULL DEFAULT 0
        )`,
        'CREATE INDEX IF NOT EXISTS idx_matches_date_created ON matches (date DESC, created_at DESC)',
        `CREATE TABLE IF NOT EXISTS data_version (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL
        )`,
        'INSERT OR IGNORE INTO data_version (id, version) VALUES (1, 0)',
      ]);

      // Migrate installs created before later columns existed — see
      // MATCH_COLUMN_MIGRATIONS.
      const matchColumns = await db.execute(
        "SELECT name FROM pragma_table_info('matches')"
      );
      const present = new Set(matchColumns.rows.map((row: any) => String(row.name)));
      for (const [column, statement] of MATCH_COLUMN_MIGRATIONS) {
        if (present.has(column)) continue;
        try {
          await db.execute(statement);
        } catch {
          // Another connection added it first — fine.
        }
      }

      // `file_count` is the one column that cannot be defaulted: it is
      // derived from `files`, which is exactly the payload the list views no
      // longer read. Backfill it once, for the databases that were old.
      if (!present.has('file_count')) {
        await db.execute('UPDATE matches SET file_count = json_array_length(files)');
      }

      // Player/song catalog extracted from uploaded JSON — keyed by the
      // game's own stable IDs (the PlayerGuessInfos object key for
      // players, Song.Id for songs), not by display name. This is what
      // lets the same account be recognized across matches even if its
      // username changed or was misspelled in a later upload.
      await db.batch([
        `CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS songs (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          vn TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL
        )`,
      ]);

      // Admin-assigned ladder ranks, one row per player per gamemode +
      // sub-mode (a player holds a separate rank in NGMC Normal, NGMC
      // Random, Erumode Normal, ...). The sub-mode is what teams are
      // autodrafted from, so ranks are kept per sub-mode rather than per
      // gamemode. Keyed by the normalized username — the same identity
      // player stats aggregate by (see lib/player-ranks.ts), since the
      // game's stable account IDs in the `players` catalog aren't linked to
      // the roster names.
      const createPlayerSetRanks = `CREATE TABLE IF NOT EXISTS player_set_ranks (
        player_key TEXT NOT NULL,
        mode TEXT NOT NULL,
        submode TEXT NOT NULL,
        rank REAL NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (player_key, mode, submode)
      )`;
      await db.execute(createPlayerSetRanks);

      // Bot decision override — one row per *global* username (normalized,
      // like player_set_ranks' player_key), because a bot is a bot in every
      // gamemode. Absent row is the common case: the automatic name rule in
      // lib/player-tags.ts answers for those usernames, so this table only
      // holds the admin's exceptions in either direction.
      await db.execute(
        `CREATE TABLE IF NOT EXISTS player_tags (
          player_key TEXT PRIMARY KEY,
          tag TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      );

      // An earlier build offered a "Player" tag next to "Bot" — an admin
      // label meaning "definitely a human". That role now belongs to absence,
      // since the name rule leaves ordinary players alone on its own. Those
      // rows aren't dead weight, though: a "Player" row on a name like
      // "RobotFan" was a deliberate correction of a false alarm, which is
      // exactly what the `NotBot` override means today. Idempotent — once the
      // rows are converted this matches nothing.
      await db.execute("UPDATE player_tags SET tag = 'NotBot' WHERE tag = 'Player'");

      // Global alternate-name map: a normalized username an admin has declared
      // to be "the same person as" a canonical one. This is the cross-match
      // identity link the per-match `renames` map can't be — those are scoped
      // to one tournament's roster paste, so the same person spelled two ways
      // in two unrelated tournaments still aggregates as two players. Here one
      // row is enough for the whole database, and it feeds the same
      // name-resolution path `renames` does, so stats, Expected Ranks and
      // autodraft all follow one identity. `display_name` is the canonical
      // name as it should be *shown* (its normalized form is the key), so
      // merged rows keep proper casing instead of going lowercase.
      await db.execute(
        `CREATE TABLE IF NOT EXISTS player_aliases (
          alias_key TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      );

      // Migrate a table created by an earlier build where ranks were stored
      // per gamemode only. Those rows have no sub-mode to map to, so they're
      // dropped (the admin re-assigns per sub-mode) and the table is rebuilt
      // with the 3-column key — an ALTER alone isn't enough, since the
      // ON CONFLICT (player_key, mode, submode) upserts need a matching
      // constraint, not just the extra column.
      const columns = await db.execute(
        "SELECT name FROM pragma_table_info('player_set_ranks')"
      );
      if (!columns.rows.some((row: any) => row.name === 'submode')) {
        await db.execute('ALTER TABLE player_set_ranks RENAME TO player_set_ranks_legacy');
        await db.execute(createPlayerSetRanks);
        await db.execute('DROP TABLE player_set_ranks_legacy');
      }
    })();
  }
  return schemaReady;
}