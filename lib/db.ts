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

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb();
      await db.execute(
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
          player_ranks TEXT NOT NULL DEFAULT '{}'
        )`
      );
      // Migrate installs created before name/date/region/mode/submode/format/renames/player_ranks existed.
      for (const stmt of [
        "ALTER TABLE matches ADD COLUMN name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN date TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN region TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN mode TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN submode TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE matches ADD COLUMN format TEXT NOT NULL DEFAULT 'RoundRobin'",
        "ALTER TABLE matches ADD COLUMN renames TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE matches ADD COLUMN player_ranks TEXT NOT NULL DEFAULT '{}'",
      ]) {
        try {
          await db.execute(stmt);
        } catch {
          // Column already exists — fine.
        }
      }

      // Player/song catalog extracted from uploaded JSON — keyed by the
      // game's own stable IDs (the PlayerGuessInfos object key for
      // players, Song.Id for songs), not by display name. This is what
      // lets the same account be recognized across matches even if its
      // username changed or was misspelled in a later upload.
      await db.execute(
        `CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL
        )`
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS songs (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          vn TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          last_seen TEXT NOT NULL
        )`
      );

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