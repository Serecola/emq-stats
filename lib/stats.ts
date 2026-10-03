import type {
  AttackRecord,
  Match,
  MatchFile,
  MatchStats,
  PlayerStats,
  Team,
  TeamStats,
} from './types';

export const norm = (s: string) => s.toLowerCase().trim();

// ---- raw EMQ song-history JSON readers -----------------------------------
// The exported JSON's exact shape varies a bit (a plain object keyed by
// index, an array, or a `{ Quizzes: [...] }` wrapper), so these helpers stay
// defensive rather than assuming one exact schema.

export function getSongs(data: any): any[] {
  if (!data) return [];
  if (data.Quizzes) {
    return data.Quizzes.flatMap((q: any) => {
      const sh = q.SongHistories;
      return Array.isArray(sh) ? sh : Object.values(sh ?? {});
    });
  }
  if (Array.isArray(data)) return data;
  return Object.values(data);
}

export function getSongTitle(song: any): string {
  const titles = song?.Song?.Titles ?? [];
  const main = titles.find((t: any) => t.IsMainTitle) ?? titles[0] ?? {};
  return main.LatinTitle || main.NonLatinTitle || 'Unknown song';
}

export function getArtistNames(song: any): string {
  const artists = song?.Song?.Artists ?? [];
  const vocalists = artists.filter((a: any) => (a.Roles || []).includes('Vocals'));
  const pool = vocalists.length ? vocalists : artists;
  const names = pool
    .map((a: any) => {
      const t = a.Titles && (a.Titles.find((x: any) => x.IsMainTitle) || a.Titles[0]);
      return t && (t.LatinTitle || t.NonLatinTitle);
    })
    .filter(Boolean);
  if (!names.length) return 'Unknown artist';
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} & others`;
  return names.join(', ');
}

/**
 * The VN a song comes from, as the identity, the name to show for it, and where
 * to look it up.
 *
 * Identity is the game's own `Sources[0].Id` — the same VN reached from two
 * different songs carries the same id, which is what lets a caller group by it
 * without trusting the title text. Exports that carry no id fall back to the
 * normalized title, so grouping still works on a hand-made or trimmed export.
 *
 * `url` is the source's VNDB page, picked out of its `Links` by `Type` rather
 * than by position or host — each source also carries a `SelfSource` link to the
 * quiz's own page plus Wikidata/EGS/VGMdb entries, and only the VNDB one is a
 * link *to the VN*. Null when this source has no VNDB link at all, so a caller
 * renders plain text rather than a dead link.
 *
 * Returns null when the song names no VN at all (a non-VN track), rather than
 * an entry with an empty title — callers skip those rather than listing a blank
 * row under a real VN's counts.
 */
export function getVNSource(song: any): { id: string; title: string; url: string | null } | null {
  const source = song?.Song?.Sources?.[0];
  if (!source) return null;
  const title = getVNName(song);
  if (!title) return null;
  // Namespaced so a title key can never collide with a numeric source id.
  const raw = source.Id;
  const id = raw === undefined || raw === null || raw === '' ? '' : String(raw);
  const links: any[] = Array.isArray(source.Links) ? source.Links : [];
  const vndb = links.find((l) => l?.Type === 'VNDB');
  const url = typeof vndb?.Url === 'string' && vndb.Url !== '' ? vndb.Url : null;
  return { id: id || `title:${norm(title)}`, title, url };
}

export function getVNName(song: any): string {
  const sources = song?.Song?.Sources ?? [];
  if (!sources.length) return '';
  const titles = sources[0].Titles ?? [];
  const main = titles.find((t: any) => t.IsMainTitle) ?? titles[0] ?? {};
  return main.LatinTitle || main.NonLatinTitle || '';
}

function emptyPlayer(uname: string): PlayerStats {
  return { uname, correct: 0, taken: 0, blocked: 0, effTaken: 0, effBlocked: 0, attacks: [] };
}

/**
 * Recomputes full match stats (per-player Correct/Attacks/Blocks/Effective
 * variants + per-attack detail) from a match's raw files + team roster.
 *
 * This is intentionally pure/stateless so it can run on the server (API
 * routes) or the client (e.g. a live admin preview) identically.
 */
export function computeMatchStats(
  match: Pick<Match, 'teams' | 'files'> & { renames?: Record<string, string> }
): MatchStats {
  const teams: Team[] = match.teams;
  const renames = match.renames ?? {};
  // Resolves a raw JSON username to the name it should be treated as for
  // every purpose below — team lookup, stat bucketing, attendance — without
  // ever touching the underlying file data. `renames` is keyed by
  // norm(oldName) -> newName, same shape the admin form's rename panel uses.
  const resolve = (rawUsername: string): string => renames[norm(rawUsername)] || rawUsername;

  const normTeams = teams.map((t) => t.map(norm));
  const teamOf = (u: string) => normTeams.findIndex((t) => t.includes(u));

  const stats: Record<string, PlayerStats> = {};
  const init = (u: string) => {
    const k = norm(u);
    if (!stats[k]) stats[k] = emptyPlayer(u);
  };
  // Seed every rostered player so absent players still show up with zeros.
  for (const team of teams) for (const u of team) init(u);

  const seenBy: Record<string, Set<string>> = {}; // norm(username) -> set of file ids seen in
  let totalSongs = 0;

  for (const file of match.files) {
    const songs = getSongs(file.data);
    totalSongs += songs.length;

    // Only the teams whose players actually appear in THIS file are valid
    // "attack targets" for songs in this file — a roster can span more
    // teams/files than any single game actually involved.
    const participatingTeams = new Set<number>();
    for (const song of songs) {
      const pgi = song.PlayerGuessInfos || {};
      for (const pd of Object.values(pgi) as any[]) {
        const e: any = pd[Object.keys(pd)[0]] || {};
        if (e.Username) {
          const u = norm(resolve(e.Username));
          const ti = teamOf(u);
          if (ti !== -1) {
            participatingTeams.add(ti);
            (seenBy[u] ??= new Set()).add(file.id);
          }
        }
      }
    }

    for (const song of songs) {
      const pgi = song.PlayerGuessInfos || {};
      const correct: string[] = [];
      const ngmc: Record<string, number> = {};
      for (const pd of Object.values(pgi) as any[]) {
        const e: any = pd[Object.keys(pd)[0]] || {};
        if (!e.Username) continue;
        const resolvedUsername = resolve(e.Username);
        init(resolvedUsername);
        if (e.IsGuessCorrect) {
          const u = norm(resolvedUsername);
          correct.push(u);
          ngmc[u] = e.NGMCGuessesCurrent;
        }
      }

      for (const u of correct) {
        stats[u].correct++;
        const myTeam = teamOf(u);
        const teammateGot = correct.some((o) => o !== u && teamOf(o) === myTeam);
        const enemyGot = correct.some((o) => teamOf(o) !== myTeam);
        const effective = (ngmc[u] || 0) > 0;

        if (!enemyGot) {
          stats[u].taken++;
          if (effective) stats[u].effTaken++;
          if (myTeam !== -1) {
            const targetTeams = [...participatingTeams]
              .filter((i) => i !== myTeam)
              .map((i) => `${teams[i][0]}'s team`);
            const record: AttackRecord = {
              title: getSongTitle(song),
              artist: getArtistNames(song),
              vn: getVNName(song),
              playedAt: song?.Song?.PlayedAt ?? null,
              teams: targetTeams,
              effective,
            };
            stats[u].attacks.push(record);
          }
        } else if (enemyGot && !teammateGot) {
          stats[u].blocked++;
          if (effective) stats[u].effBlocked++;
        }
      }
    }
  }

  const teamStats: TeamStats[] = teams.map((team, ti) => {
    const members = team.map((u) => stats[norm(u)] ?? emptyPlayer(u));
    const present = team.filter((u) => (seenBy[norm(u)]?.size ?? 0) > 0);
    const missing = team.filter((u) => !(seenBy[norm(u)]?.size ?? 0));
    const sum = (key: 'taken' | 'blocked' | 'effTaken' | 'effBlocked') =>
      members.reduce((a, m) => a + m[key], 0);
    return {
      teamIndex: ti,
      label: team[0] ?? `Team ${ti + 1}`,
      members: [...members].sort((a, b) => b.taken + b.blocked - (a.taken + a.blocked)),
      present,
      missing,
      taken: sum('taken'),
      blocked: sum('blocked'),
      effTaken: sum('effTaken'),
      effBlocked: sum('effBlocked'),
    };
  });

  return { teams: teamStats, totalSongs };
}

/**
 * Returns the distinct set of usernames that appear anywhere in a raw
 * song-history JSON blob, in order of first appearance. Used by the admin
 * form to detect players in an uploaded file that don't match anyone in
 * the pasted team roster (typos, casing, or renamed accounts).
 */
export function extractUsernames(data: unknown): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const song of getSongs(data)) {
    const pgi = song.PlayerGuessInfos || {};
    for (const pd of Object.values(pgi) as any[]) {
      for (const key of Object.keys(pd)) {
        const username = pd[key]?.Username;
        if (username && !seen.has(username)) {
          seen.add(username);
          ordered.push(username);
        }
      }
    }
  }
  return ordered;
}

/**
 * Which roster members actually appear in one raw song-history file, as
 * normalized usernames with the match's own renames applied.
 *
 * Per *file*, not per tournament: an uploaded bracket carries a dozen games and
 * a player on the roster doesn't necessarily play all of them, so anything that
 * credits someone for a game has to ask about that game. Two callers share this
 * walk rather than repeating it — the bracket's file→fixture placement (via
 * `fileParticipantIndices` in lib/schedule.ts) and the per-player win/loss/tally
 * (via `computePlayerGameRecords` in lib/results.ts) — since both must agree on
 * who was in the room.
 *
 * Returns roster keys only: a name in the export that isn't on any team is
 * dropped here, and the admin form surfaces those separately as unmatched names.
 */
export function fileRosterMembers(
  file: Pick<MatchFile, 'data'>,
  teams: Team[],
  renames: Record<string, string> = {}
): Set<string> {
  const roster = new Set<string>();
  for (const team of teams) for (const name of team) roster.add(norm(name));

  const present = new Set<string>();
  for (const username of extractUsernames(file.data)) {
    const key = norm(renames[norm(username)] || username);
    if (roster.has(key)) present.add(key);
  }
  return present;
}
