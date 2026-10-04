import { getArtistNames, getArtists, getSongTitle, getSongs, getVNSource, norm } from './stats';
import { readAnswers, type SongAnswers } from './synergy';
import { withAliases, type PlayerAliases } from './player-aliases';
import type { Match } from './types';

/**
 * What ONE player fails most often — the VNs they can't name and the artists
 * they can't place, pooled across every tournament in view.
 *
 * Two rankings, one per answer type the game asks about a song: the **VN**
 * ranking counts `Mst` (main-title) answers grouped by the song's VN source,
 * and the **Artist** ranking counts `A` (artist) answers grouped by the
 * export's credited artists. Reading the answers through `readAnswers` — the
 * walk `lib/synergy.ts` already owns, so this view can't drift from the Guess
 * Rate table on what a song asked — gives exactly the questions the game put
 * to this player, and `misses` is the ones they got wrong.
 *
 * That choice keeps the rates on the same scale as the page's own numbers: a
 * row's `100 − rate` is this player's per-type guess rate over that VN or
 * artist, counted the way the events that asked it counted it. NGMC asks only
 * `Mst`, so there the artist ranking is simply empty and the section shows the
 * VN table alone; Erumode tournaments that never asked `A` likewise contribute
 * nothing to the artist side rather than a phantom 0%.
 *
 * It is deliberately *not* a re-derivation of the pooled figure on the card
 * above: that one weights each tournament by its songs, so a VN-only event
 * (which asks a single type) counts for as much as a five-column one, while
 * these rows pool questions. The question here is which VNs and artists drag
 * a player's rate down, not what the rate is.
 *
 * A question counts as missed unless the export flags it correct: the files
 * only carry `IsGuessCorrect` on the entries a player actually got right, so
 * "no flag" is the game's own way of saying wrong, and a skipped question looks
 * exactly like a wrong one. That is the same rule the Guess Rate table divides
 * by — no second definition of "missed" is invented here.
 *
 * VNs are grouped by the export's own `Sources[0].Id` (see `getVNSource`) and
 * artists by `Artists[i].Id` (see `getArtists`), not by title text — two
 * uploads that spell a VN or a singer differently are one row. A song with
 * several people on its artist line credits each of them, so a duet lands in
 * both singers' rows instead of fragmenting one of them across "A" and "A, B".
 * Songs naming no VN never reach the VN ranking, and songs crediting nobody
 * never reach the artist one, rather than listing a blank row.
 *
 * Only the focal player's own answers are read: no roster, no teammates, no
 * opponents, so unlike lib/synergy.ts there is no team to be missing and no
 * unrostered-name rule to apply. Renames and global aliases are still folded in
 * first (via `withAliases`), so a player whose name changed between uploads has
 * one history here instead of one per spelling.
 */

/**
 * How often a VN (or an artist's songs) must have come up before it can be
 * ranked. A VN the room drew exactly once and this player missed is a fact
 * about the draw, not about them — and with ask counts this small it would
 * otherwise take the top of the table with a "100%" that is one data point.
 *
 * Measured on *plays* (games the VN/artist came up in while they were in the
 * room) rather than on asks, so the floor means the same thing in both modes: an
 * Erumode play is five answers and an NGMC play is one, and a floor counted in
 * answers would let an Erumode song through on its first appearance while an
 * NGMC song had to come up twice. Same number the neighbouring "Most Played
 * VNs" table uses for its own floor (VN_MIN_PLAYS).
 */
export const MISS_MIN_PLAYS = 2;

/** Rows the table shows per ranking; past ten it is the same claim, further down. */
export const MISS_TOP_N = 10;

export interface MissRow {
  /** VN title, or artist name for the artist table */
  name: string;
  /**
   * Every missed song behind the row, most-missed first: "Artist — Song" on
   * the VN table, "VN — Song" on the artist table. Always non-empty — a row
   * only exists because at least one song was missed (see `rank`).
   */
  detail: string[];
  /** games the VN/artist came up in with that answer asked */
  plays: number;
  /** questions about it the game put to this player in those games */
  asks: number;
  /** of those questions, the ones they got wrong */
  misses: number;
  /** misses / asks as a percentage — 100 minus their guess rate over it */
  rate: number;
}

export interface PlayerMissStats {
  /** VNs, most-missed first, floor applied, cut to MISS_TOP_N */
  vns: MissRow[];
  /** the same for the artists behind those songs */
  artists: MissRow[];
  /** distinct VNs missed at least once in scope, before the floor */
  totalVns: number;
  /** VNs that cleared MISS_MIN_PLAYS, before the MISS_TOP_N cut */
  qualifiedVns: number;
  /** distinct artists behind the missed songs, before the floor */
  totalArtists: number;
  /** artists that cleared MISS_MIN_PLAYS, before the MISS_TOP_N cut */
  qualifiedArtists: number;
  /** false when the player missed nothing in scope, i.e. nothing to rank */
  hasData: boolean;
}

interface Accum {
  name: string;
  plays: number;
  asks: number;
  misses: number;
  /** per-song misses behind this row, keyed by the stable track id */
  songs: Map<string, { label: string; misses: number }>;
}

function accum(name: string): Accum {
  return { name, plays: 0, asks: 0, misses: 0, songs: new Map() };
}

/**
 * A track's stable identity, so per-song misses pool across repeat plays: the
 * export's own `Song.Id`, falling back to the normalized title for an export
 * that carries no id — the same rule `extractCatalog` files a song under.
 * Namespaced so a title can never collide with a numeric id.
 */
function songTrack(song: any): string {
  const raw = song?.Song?.Id;
  const id = raw === undefined || raw === null || raw === '' ? '' : String(raw);
  return id ? `song:${id}` : `title:${norm(getSongTitle(song))}`;
}

/**
 * One song's "Artist — Song" label for the VN table: the artist line the same
 * way the attack modal prints it, then the song title.
 */
function artistSongLabel(song: any): string {
  return `${getArtistNames(song)} — ${getSongTitle(song)}`;
}

/**
 * One song's "VN — Song" label for the artist table: the VN's own main title,
 * then the song title. Falls back to just the song title when the song names
 * no VN — the artist was still asked about, so the miss still counts.
 */
function vnSongLabel(song: any): string {
  const source = getVNSource(song);
  return source ? `${source.title} — ${getSongTitle(song)}` : getSongTitle(song);
}

/** Records one missed question against its row's per-song breakdown. */
function missSong(acc: Accum, track: string, label: string): void {
  const entry = acc.songs.get(track) ?? { label, misses: 0 };
  entry.label = label;
  entry.misses++;
  acc.songs.set(track, entry);
}

/**
 * One player's most-missed songs and artists across `matches`.
 *
 * `matches` is whatever slice the caller wants read — the tournaments the page
 * is showing, not the whole mode — so the ranking narrows with the Recent /
 * All-Time switch like every other figure on the page (see `findPlayerMisses`).
 */
export function computePlayerMisses(
  matches: Pick<Match, 'files' | 'mode' | 'renames'>[],
  uname: string,
  aliases: PlayerAliases = {}
): PlayerMissStats {
  const selfKey = norm(uname);
  const vns = new Map<string, Accum>();
  const artists = new Map<string, Accum>();

  for (const match of matches) {
    const renames = withAliases(match.renames ?? {}, aliases);
    const isErumode = match.mode === 'Erumode';

    for (const file of match.files) {
      for (const song of getSongs(file.data)) {
        // This player's answers on this song, if they were in the room for it.
        // `readAnswers` returns null for an entry carrying no username, and the
        // player simply isn't in the export of a game they didn't play — which
        // is not a miss, so the song is skipped rather than counted as one.
        const pgi = song?.PlayerGuessInfos ?? {};
        let mine: SongAnswers | null = null;
        for (const pd of Object.values(pgi) as any[]) {
          const answers = readAnswers(pd, isErumode);
          if (!answers) continue;
          const key = norm(renames[norm(answers.username)] || answers.username);
          if (key !== selfKey) continue;
          mine = answers;
          break;
        }
        if (!mine) continue;

        // One ranking per answer type: the VN table reads the Mst (main-title)
        // answer grouped by the song's VN source, the artist table reads the A
        // answer grouped by the export's credited artists. Other columns (song
        // name, developer, …) belong to neither question, so they feed no row.
        // A song asked while the room had no VN source still counts its A
        // answer, and vice versa — the rankings are independent.
        const track = songTrack(song);
        const mst = mine.byType['Mst'];
        if (mst) {
          const source = getVNSource(song);
          if (source) {
            const acc = vns.get(source.id) ?? accum(source.title);
            acc.plays++;
            acc.asks++;
            if (!mst.correct) {
              acc.misses++;
              missSong(acc, track, artistSongLabel(song));
            }
            vns.set(source.id, acc);
          }
        }
        const a = mine.byType['A'];
        if (a) {
          for (const artist of getArtists(song)) {
            const acc = artists.get(artist.id) ?? accum(artist.name);
            acc.plays++;
            acc.asks++;
            if (!a.correct) {
              acc.misses++;
              missSong(acc, track, vnSongLabel(song));
            }
            artists.set(artist.id, acc);
          }
        }
      }
    }
  }

  const vnRanking = rank(vns);
  const artistRanking = rank(artists);

  return {
    vns: vnRanking.rows,
    artists: artistRanking.rows,
    totalVns: vnRanking.total,
    qualifiedVns: vnRanking.qualified,
    totalArtists: artistRanking.total,
    qualifiedArtists: artistRanking.qualified,
    hasData: vnRanking.rows.length > 0 || artistRanking.rows.length > 0,
  };
}

/**
 * Turns one accumulator map into its ranking: the entries this player actually
 * missed, floored on plays, most-missed first.
 *
 * A VN (or artist) they never missed is not a *missed* one and never reaches
 * the table — "songs I always land" sorted by misses is a bottom row nobody
 * asked for.
 *
 * Order is misses first, then the rate: how often they got it wrong is the
 * question, and among rows missed the same number of times the one they missed
 * a larger *share* of is the worse answer. The name breaks the remaining ties
 * so a re-render can't reshuffle two identical rows. Each row's subtitle lists
 * its missed songs most-missed first (same ordering rule, by name on ties), so
 * the first line under a row is always the song that cost the most.
 */
function rank(acc: Map<string, Accum>): { rows: MissRow[]; total: number; qualified: number } {
  const missed = [...acc.values()].filter((a) => a.misses > 0);
  const qualified = missed.filter((a) => a.plays >= MISS_MIN_PLAYS);
  qualified.sort(
    (a, b) =>
      b.misses - a.misses ||
      b.misses / b.asks - a.misses / a.asks ||
      a.name.localeCompare(b.name)
  );
  return {
    rows: qualified.slice(0, MISS_TOP_N).map((a) => ({
      name: a.name,
      detail: [...a.songs.values()]
        .sort((x, y) => y.misses - x.misses || x.label.localeCompare(y.label))
        .map((s) => s.label),
      plays: a.plays,
      asks: a.asks,
      misses: a.misses,
      rate: (100 * a.misses) / a.asks,
    })),
    total: missed.length,
    qualified: qualified.length,
  };
}
