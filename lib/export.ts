import { generateRoundRobin, matchFilesToBracket, type BracketMatchup } from './schedule';
import { withAliases, type PlayerAliases } from './player-aliases';
import type { Match } from './types';

/**
 * The export archive: one folder per tournament, the raw game export in every
 * file, and a manifest that carries everything the game export *doesn't*.
 *
 * A raw EMQ export is only the record of a game. The tournament around it — the
 * roster, the entered scores, the name fixes (`renames`), the substitutes who
 * filled roster slots (`substitutes`), the per-player ranks, and which bracket
 * slot each upload belongs to — lives in the app, so a pile of
 * JSONs on its own is not a backup. `manifest.json` is the half that makes the
 * archive restorable rather than merely readable, and it is also the only part
 * an importer would need to read first.
 *
 * Everything is named so the archive reads like the bracket the admin was
 * looking at while uploading: the folder is the tournament, the file is a
 * fixture. `tournaments/2026-09-27-eu-erumode-normal-sa--LZ3VjY4nNs/
 * r1m2-hyther-vs-serecola.json` says which tournament, which round, which match
 * and which two teams, without opening anything.
 *
 * The exports are re-serialised from the parsed JSON the database holds
 * (`JSON.stringify(data, null, 2)`, done by the caller): same data, tidied
 * formatting, not byte-identical to the file that was originally pasted. The
 * scores in the manifest are the *effective* ones — a game where only one side
 * was scored is recorded as 0 for the other, the same rule the table itself
 * reads with (`withAssumedZeroScores` in lib/schedule.ts) — so the archive
 * reproduces what the app showed and what the stats were computed from.
 */

export const EXPORT_FORMAT = 'emq-stats-export';
export const EXPORT_VERSION = 1;

export interface ExportedMatchFile {
  /** The app's own id for the upload, so a re-import can keep referring to it. */
  id: string;
  label: string;
  /** Bracket slot key ("r1m0"), when the upload was assigned to one. */
  slot?: string;
  scores?: Record<string, number>;
  /** Where this file's JSON sits inside the archive. */
  entry: string;
}

export interface ExportedMatch {
  id: string;
  title: string;
  name: string;
  date: string;
  region: string;
  mode: string;
  submode: string;
  createdAt: string;
  teams: string[][];
  renames: Record<string, string>;
  /** norm(JSON name) -> roster player they substituted for — see Match. */
  substitutes: Record<string, string>;
  playerRanks: Record<string, number>;
  excludeFromStats: boolean;
  fileCount: number;
  files: ExportedMatchFile[];
}

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  tournaments: ExportedMatch[];
}

export interface ExportFile {
  /** Forward-slash path inside the archive. */
  path: string;
  /** The parsed export, to be serialised by whoever writes the archive. */
  data: unknown;
}

/**
 * A filesystem- and ZIP-safe fragment of any admin-typed text: lowercase, every
 * run of anything else collapsed to a single dash, capped so a pasted title
 * can't blow the path budget. Empty in, `fallback` out — a tournament can
 * legitimately be named with characters that slug away to nothing.
 */
export function slug(value: string, fallback: string, maxLength = 60): string {
  const cleaned = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return cleaned || fallback;
}

/**
 * The tournament's folder: the date, region, mode and sub-mode first so the
 * archive reads the way a tournament is titled and sorts chronologically, then
 * the name so a human can find it, and the match id last because names repeat —
 * the same "Winter Cup" exists in several regions and sub-modes, and two of them
 * can even share a name and date. The id makes the path unique and keeps it that
 * way however the tournament is renamed later.
 */
export function tournamentPath(
  match: Pick<Match, 'id' | 'name' | 'date' | 'region' | 'mode' | 'submode'>
): string {
  // Each part is slugged on its own before they're joined, so a sub-mode with a
  // space or a slash in it ("No Vocal") can't break the path, and an empty
  // field (an older row with no region recorded) drops out instead of leaving a
  // stray double dash.
  const selection = [match.date, match.region, match.mode, match.submode]
    .map((part) => slug(part, ''))
    .filter(Boolean)
    .join('-');
  return `tournaments/${selection}-${slug(match.name, match.id)}--${match.id}`;
}

/** A bracket fixture, plus the match's position within its display round. */
type Fixture = BracketMatchup & { displayMatch: number };

/**
 * Every fixture of a tournament keyed by its slot, each tagged with the match's
 * 1-based position inside the round the screen shows. Built from the same
 * generated bracket the editor draws, so a file's round and match in the archive
 * are the ones the admin was looking at.
 */
function fixturesBySlot(match: Pick<Match, 'teams'>): Map<string, Fixture> {
  const index = new Map<string, Fixture>();
  for (const round of generateRoundRobin(match.teams)) {
    round.matchups.forEach((matchup, i) => {
      index.set(matchup.slot, { ...matchup, displayMatch: i + 1 });
    });
  }
  return index;
}

/**
 * The file name for one upload inside its tournament: which round and match it
 * was, and the two teams that matchup is between —
 * `r1m2-hyther-vs-serecola.json`.
 *
 * Round is `displayRound`, the number the round headings show, and the match is
 * its 1-based position in that round. Both are 1-based on purpose: these names
 * are read by people, unlike the `slot` key (`r1m2` there is the legacy
 * cycle-major sequence, which is a different number entirely and stays in the
 * manifest for anything that needs to address the file). The teams are the
 * roster labels — each team's identifying first player, the same two names the
 * bracket card and the roster line show.
 *
 * A file the bracket couldn't place (no slot, and the two teams in its raw JSON
 * don't map onto one fixture) has no round or matchup to report, so it falls
 * back to the admin's own label — which is the game's export name, and so still
 * carries the play timestamp.
 */
function uploadFileName(
  file: Match['files'][number],
  fixture: Fixture | undefined
): string {
  if (fixture) {
    const teams = [slug(fixture.labelA, '', 24), slug(fixture.labelB, '', 24)].filter(Boolean);
    const where = `r${fixture.displayRound}m${fixture.displayMatch}`;
    return teams.length ? `${where}-${teams.join('-vs-')}.json` : `${where}.json`;
  }
  return `${slug(file.label, file.id)}.json`;
}

export function buildExport(
  matches: Match[],
  exportedAt: Date = new Date(),
  aliases: PlayerAliases = {}
): { manifest: ExportManifest; files: ExportFile[] } {
  const files: ExportFile[] = [];
  const tournaments: ExportedMatch[] = [];

  for (const match of matches) {
    const folder = tournamentPath(match);
    const used = new Set<string>();
    const exported: ExportedMatchFile[] = [];

    // Which fixture each upload belongs to, resolved the same way the bracket
    // resolves it: an explicit slot wins, the rest are matched by the teams
    // detected in their raw JSON. A file that lands nowhere stays unplaced and
    // is named after its label instead. The global aliases are folded under the
    // match's own renames for that detection (a JSON naming a player through
    // their alias still finds its two teams); the manifest's own `renames`
    // further down stay raw — aliases are global, never part of a match.
    const renames = withAliases(match.renames, aliases);
    const fixtures = fixturesBySlot(match);
    const fixtureByFileId = new Map<string, Fixture>();
    for (const [slot, file] of Object.entries(
      matchFilesToBracket(match.teams, match.files, renames, match.substitutes).bySlot
    )) {
      const fixture = fixtures.get(slot);
      if (fixture) fixtureByFileId.set(file.id, fixture);
    }

    for (const file of match.files) {
      let name = uploadFileName(file, fixtureByFileId.get(file.id));
      for (let suffix = 2; used.has(name); suffix++) {
        name = `${name.replace(/\.json$/, '')}-${suffix}.json`;
      }
      used.add(name);

      const entry = `${folder}/${name}`;
      files.push({ path: entry, data: file.data });
      exported.push({
        id: file.id,
        label: file.label,
        ...(file.slot ? { slot: file.slot } : {}),
        ...(file.scores ? { scores: file.scores } : {}),
        entry,
      });
    }

    tournaments.push({
      id: match.id,
      title: match.title,
      name: match.name,
      date: match.date,
      region: match.region,
      mode: match.mode,
      submode: match.submode,
      createdAt: match.createdAt,
      teams: match.teams,
      renames: match.renames,
      substitutes: match.substitutes ?? {},
      playerRanks: match.playerRanks,
      excludeFromStats: match.excludeFromStats ?? false,
      fileCount: match.files.length,
      files: exported,
    });
  }

  return {
    manifest: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: exportedAt.toISOString(),
      tournaments,
    },
    files,
  };
}

/** The download's filename, dated so a folder of exports sorts itself. */
export function exportFilename(at: Date = new Date(), suffix?: string): string {
  const date = Number.isNaN(at.getTime()) ? new Date() : at;
  const stamp = date.toISOString().slice(0, 10);
  return suffix
    ? `emq-stats-export-${suffix}-${stamp}.zip`
    : `emq-stats-export-${stamp}.zip`;
}
