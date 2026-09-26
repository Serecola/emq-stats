import { getDb } from './db';

/**
 * Process-local read cache for the data every page derives from the whole
 * match table — parsed matches and the stats aggregated out of them.
 *
 * The database itself is fast (a full 3 MB read of `local.db` takes a few
 * ms), but the *page work* is not: a single `/players` render re-parses
 * every match's raw JSON and recomputes guess rates, attacks and blocks.
 * Caching that per process turns "recompute on every request" into
 * "recompute once, then re-serve" — see `cached()`.
 *
 * Invalidation is two-layered, because a write may happen in another
 * process (dev server vs. `next start`, or two serverless instances):
 *
 *   1. `markDataChanged()` — called by every write in lib/store.ts — bumps
 *      the local epoch immediately, so the writer's own process is never
 *      stale.
 *   2. A `data_version` row in the database is the shared stamp. Each
 *      process re-reads it at most once per `STAMP_POLL_MS` and drops its
 *      cache when the stamp moved, so a write is visible to other processes
 *      within that window without a query per read.
 *
 * The stamp read is one tiny SELECT on a single-row table — cheaper than
 * re-deriving anything it guards.
 */
const STAMP_POLL_MS = 1000;

type Entry = { epoch: number; value: Promise<unknown> };

const entries = new Map<string, Entry>();

let epoch = 0;
let lastStamp: number | null = null;
let lastCheckedAt = 0;

async function readStamp(): Promise<number | null> {
  try {
    const res = await getDb().execute('SELECT version FROM data_version WHERE id = 1');
    if (!res.rows.length) return null;
    return Number(res.rows[0].version);
  } catch {
    // Schema not created yet (or the table is missing on an older
    // install) — treat it as "unchanged" rather than failing the read.
    return null;
  }
}

/** Returns the epoch to key this read on, dropping stale entries first. */
async function syncedEpoch(): Promise<number> {
  const now = Date.now();
  if (lastStamp !== null && now - lastCheckedAt < STAMP_POLL_MS) return epoch;
  lastCheckedAt = now;

  const stamp = await readStamp();
  if (stamp === null) return epoch;
  if (lastStamp === null) {
    // First look in this process — adopt it without throwing anything away.
    lastStamp = stamp;
    return epoch;
  }
  if (stamp !== lastStamp) {
    lastStamp = stamp;
    epoch++;
    entries.clear();
  }
  return epoch;
}

/**
 * Memoizes `compute()` for as long as the data version is unchanged. The
 * in-flight promise is cached too, so concurrent requests share one
 * computation instead of racing; a rejection is not cached.
 */
export async function cached<T>(key: string, compute: () => T | Promise<T>): Promise<T> {
  const current = await syncedEpoch();
  const hit = entries.get(key);
  if (hit && hit.epoch === current) return hit.value as Promise<T>;

  const value = Promise.resolve().then(compute);
  entries.set(key, { epoch: current, value });
  try {
    return await value;
  } catch (err) {
    // Don't let a transient failure poison the cache.
    if (entries.get(key)?.value === value) entries.delete(key);
    throw err;
  }
}

/**
 * Announces that the stored data changed: bumps the shared stamp so other
 * processes drop their caches, and clears this process's cache right away.
 * Called by every write in lib/store.ts.
 */
export async function markDataChanged(): Promise<void> {
  try {
    await getDb().execute('UPDATE data_version SET version = version + 1 WHERE id = 1');
  } catch {
    // Stamp bump is best-effort; a write must never fail because of it.
  }
  epoch++;
  entries.clear();
  // Re-read the stamp we just wrote, so another process writing later is
  // still detected as a change on the next poll (see module docs).
  lastStamp = await readStamp();
  lastCheckedAt = Date.now();
}
