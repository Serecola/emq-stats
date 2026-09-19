"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.norm = void 0;
exports.getSongs = getSongs;
exports.getSongTitle = getSongTitle;
exports.getArtistNames = getArtistNames;
exports.getVNName = getVNName;
exports.computeMatchStats = computeMatchStats;
exports.extractUsernames = extractUsernames;
const norm = (s) => s.toLowerCase().trim();
exports.norm = norm;
// ---- raw EMQ song-history JSON readers -----------------------------------
// The exported JSON's exact shape varies a bit (a plain object keyed by
// index, an array, or a `{ Quizzes: [...] }` wrapper), so these helpers stay
// defensive rather than assuming one exact schema.
function getSongs(data) {
    if (!data)
        return [];
    if (data.Quizzes) {
        return data.Quizzes.flatMap((q) => {
            const sh = q.SongHistories;
            return Array.isArray(sh) ? sh : Object.values(sh ?? {});
        });
    }
    if (Array.isArray(data))
        return data;
    return Object.values(data);
}
function getSongTitle(song) {
    const titles = song?.Song?.Titles ?? [];
    const main = titles.find((t) => t.IsMainTitle) ?? titles[0] ?? {};
    return main.LatinTitle || main.NonLatinTitle || 'Unknown song';
}
function getArtistNames(song) {
    const artists = song?.Song?.Artists ?? [];
    const vocalists = artists.filter((a) => (a.Roles || []).includes('Vocals'));
    const pool = vocalists.length ? vocalists : artists;
    const names = pool
        .map((a) => {
        const t = a.Titles && (a.Titles.find((x) => x.IsMainTitle) || a.Titles[0]);
        return t && (t.LatinTitle || t.NonLatinTitle);
    })
        .filter(Boolean);
    if (!names.length)
        return 'Unknown artist';
    if (names.length > 3)
        return `${names.slice(0, 3).join(', ')} & others`;
    return names.join(', ');
}
function getVNName(song) {
    const sources = song?.Song?.Sources ?? [];
    if (!sources.length)
        return '';
    const titles = sources[0].Titles ?? [];
    const main = titles.find((t) => t.IsMainTitle) ?? titles[0] ?? {};
    return main.LatinTitle || main.NonLatinTitle || '';
}
function emptyPlayer(uname) {
    return { uname, correct: 0, taken: 0, blocked: 0, effTaken: 0, effBlocked: 0, attacks: [] };
}
/**
 * Recomputes full match stats (per-player Correct/Attacks/Blocks/Effective
 * variants + per-attack detail) from a match's raw files + team roster.
 *
 * This is intentionally pure/stateless so it can run on the server (API
 * routes) or the client (e.g. a live admin preview) identically.
 */
function computeMatchStats(match) {
    const teams = match.teams;
    const renames = match.renames ?? {};
    // Resolves a raw JSON username to the name it should be treated as for
    // every purpose below — team lookup, stat bucketing, attendance — without
    // ever touching the underlying file data. `renames` is keyed by
    // norm(oldName) -> newName, same shape the admin form's rename panel uses.
    const resolve = (rawUsername) => renames[(0, exports.norm)(rawUsername)] || rawUsername;
    const normTeams = teams.map((t) => t.map(exports.norm));
    const teamOf = (u) => normTeams.findIndex((t) => t.includes(u));
    const stats = {};
    const init = (u) => {
        const k = (0, exports.norm)(u);
        if (!stats[k])
            stats[k] = emptyPlayer(u);
    };
    // Seed every rostered player so absent players still show up with zeros.
    for (const team of teams)
        for (const u of team)
            init(u);
    const seenBy = {}; // norm(username) -> set of file ids seen in
    let totalSongs = 0;
    for (const file of match.files) {
        const songs = getSongs(file.data);
        totalSongs += songs.length;
        // Only the teams whose players actually appear in THIS file are valid
        // "attack targets" for songs in this file — a roster can span more
        // teams/files than any single game actually involved.
        const participatingTeams = new Set();
        for (const song of songs) {
            const pgi = song.PlayerGuessInfos || {};
            for (const pd of Object.values(pgi)) {
                const e = pd[Object.keys(pd)[0]] || {};
                if (e.Username) {
                    const u = (0, exports.norm)(resolve(e.Username));
                    const ti = teamOf(u);
                    if (ti !== -1) {
                        participatingTeams.add(ti);
                        (seenBy[u] ?? (seenBy[u] = new Set())).add(file.id);
                    }
                }
            }
        }
        for (const song of songs) {
            const pgi = song.PlayerGuessInfos || {};
            const correct = [];
            const ngmc = {};
            for (const pd of Object.values(pgi)) {
                const e = pd[Object.keys(pd)[0]] || {};
                if (!e.Username)
                    continue;
                const resolvedUsername = resolve(e.Username);
                init(resolvedUsername);
                if (e.IsGuessCorrect) {
                    const u = (0, exports.norm)(resolvedUsername);
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
                    if (effective)
                        stats[u].effTaken++;
                    if (myTeam !== -1) {
                        const targetTeams = [...participatingTeams]
                            .filter((i) => i !== myTeam)
                            .map((i) => `${teams[i][0]}'s team`);
                        const record = {
                            title: getSongTitle(song),
                            artist: getArtistNames(song),
                            vn: getVNName(song),
                            playedAt: song?.Song?.PlayedAt ?? null,
                            teams: targetTeams,
                            effective,
                        };
                        stats[u].attacks.push(record);
                    }
                }
                else if (enemyGot && !teammateGot) {
                    stats[u].blocked++;
                    if (effective)
                        stats[u].effBlocked++;
                }
            }
        }
    }
    const teamStats = teams.map((team, ti) => {
        const members = team.map((u) => stats[(0, exports.norm)(u)] ?? emptyPlayer(u));
        const present = team.filter((u) => (seenBy[(0, exports.norm)(u)]?.size ?? 0) > 0);
        const missing = team.filter((u) => !(seenBy[(0, exports.norm)(u)]?.size ?? 0));
        const sum = (key) => members.reduce((a, m) => a + m[key], 0);
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
function extractUsernames(data) {
    const seen = new Set();
    const ordered = [];
    for (const song of getSongs(data)) {
        const pgi = song.PlayerGuessInfos || {};
        for (const pd of Object.values(pgi)) {
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
