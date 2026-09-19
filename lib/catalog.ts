import { getSongs, getSongTitle, getArtistNames, getVNName } from './stats';

export interface ExtractedPlayer {
  id: string; // the game's stable numeric UserId (as it appears as the PlayerGuessInfos key)
  name: string; // the Username seen alongside that id
}

export interface ExtractedSong {
  id: string; // Song.Id
  title: string;
  artist: string;
  vn: string;
}

/**
 * Walks a single raw song-history JSON blob and returns every distinct
 * player (by stable game ID) and song it references. Used to populate the
 * `players`/`songs` catalog tables when a match is created or updated.
 *
 * Player identity here is the PlayerGuessInfos object key itself, which is
 * the game's own numeric account ID (verified against PlayerSongStats.UserId
 * on the same entry) — stable across matches even if a username changes or
 * was misspelled on a later upload, unlike matching by display name.
 */
export function extractCatalog(data: unknown): { players: ExtractedPlayer[]; songs: ExtractedSong[] } {
  const players = new Map<string, ExtractedPlayer>();
  const songs = new Map<string, ExtractedSong>();

  for (const song of getSongs(data)) {
    const songId = song?.Song?.Id;
    if (songId !== undefined && songId !== null && !songs.has(String(songId))) {
      songs.set(String(songId), {
        id: String(songId),
        title: getSongTitle(song),
        artist: getArtistNames(song),
        vn: getVNName(song),
      });
    }

    const pgi = song?.PlayerGuessInfos ?? {};
    for (const [playerId, pd] of Object.entries(pgi) as [string, any][]) {
      if (players.has(playerId)) continue;
      const keys = Object.keys(pd);
      if (!keys.length) continue;
      const username = pd[keys[0]]?.Username;
      if (username) players.set(playerId, { id: playerId, name: username });
    }
  }

  return { players: [...players.values()], songs: [...songs.values()] };
}

/** Merges extractCatalog results across every file in a match. */
export function extractCatalogFromFiles(
  files: { data: unknown }[]
): { players: ExtractedPlayer[]; songs: ExtractedSong[] } {
  const players = new Map<string, ExtractedPlayer>();
  const songs = new Map<string, ExtractedSong>();
  for (const file of files) {
    const extracted = extractCatalog(file.data);
    for (const p of extracted.players) players.set(p.id, p);
    for (const s of extracted.songs) songs.set(s.id, s);
  }
  return { players: [...players.values()], songs: [...songs.values()] };
}