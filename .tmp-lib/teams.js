"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTeamsBlob = parseTeamsBlob;
exports.parsePlayerRanks = parsePlayerRanks;
exports.parsePlayerList = parsePlayerList;
exports.parseRankList = parseRankList;
exports.teamsToBlob = teamsToBlob;
const norm = (s) => s.toLowerCase().trim();
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
function parseTeamsBlob(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return [];
    if (/\(\s*\d+(?:\.\d+)?\s*\)/.test(trimmed)) {
        const segments = trimmed.split(/=\s*\d+(?:\.\d+)?/);
        const teams = [];
        const playerRe = /([^\s()]+)\s*\(\s*\d+(?:\.\d+)?\s*\)/g;
        for (const seg of segments) {
            const names = [];
            let m;
            playerRe.lastIndex = 0;
            while ((m = playerRe.exec(seg)))
                names.push(m[1]);
            if (names.length)
                teams.push(names);
        }
        if (teams.length)
            return teams;
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
function parsePlayerRanks(text) {
    const trimmed = text.trim();
    const ranks = {};
    if (!trimmed)
        return ranks;
    const playerRe = /([^\s()]+)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g;
    let m;
    while ((m = playerRe.exec(trimmed))) {
        ranks[norm(m[1])] = Number(m[2]);
    }
    return ranks;
}
/**
 * Parses a `players.txt`-style list — players separated by commas and/or
 * newlines, each optionally annotated with a letter grade in parentheses,
 * e.g. "hopefortomorrow (C-), jessmi2 (A-), Tommy (A)". A trailing "(...)"
 * is treated as the grade; anything else is left as part of the name.
 */
function parsePlayerList(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return [];
    const players = [];
    for (const raw of trimmed.split(/[,\n]/)) {
        const entry = raw.trim();
        if (!entry)
            continue;
        const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(entry);
        if (!match) {
            players.push({ name: entry });
            continue;
        }
        const name = match[1].trim();
        if (!name)
            continue;
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
function parseRankList(text) {
    const ranks = {};
    const displayNames = {};
    for (const line of text.split('\n')) {
        const match = /^\s*(\d+(?:\.\d+)?)\s*[:=]\s*(.+)$/.exec(line);
        if (!match)
            continue;
        const rank = Number(match[1]);
        for (const raw of match[2].split(',')) {
            const name = raw.trim();
            if (!name)
                continue;
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
function teamsToBlob(teams, ranks) {
    const hasRanks = ranks && Object.keys(ranks).length > 0;
    if (!hasRanks) {
        return teams.map((t) => t.join(', ')).join('\n');
    }
    return teams
        .map((team) => {
        const parts = team.map((name) => {
            const r = ranks[norm(name)];
            return r !== undefined ? `${name} (${r})` : name;
        });
        const total = team.reduce((sum, name) => sum + (ranks[norm(name)] ?? 0), 0);
        return `${parts.join(' ')} = ${total}`;
    })
        .join(' ');
}
