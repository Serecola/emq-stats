import { Fragment } from 'react';
import { TABLE_ROW_CLASS, TABLE_ROW_NO_BORDER_CLASS } from '@/lib/table-row';
import { VN_MIN_PLAYS, VN_TOP_N, type VnPlayStats, type VnSongRow } from '@/lib/vn-plays';

/**
 * The VN name cell: a link to the VN's page on VNDB when the export carried
 * one, plain text when it didn't. A name that isn't a link can't be mistaken
 * for a broken one, and the row's real claim — the play count beside it —
 * doesn't depend on the link resolving.
 *
 * The link opens in a new tab so the tournament page (which people keep open
 * while comparing a VN to what was asked) isn't navigated away from, and
 * `rel="noreferrer"` keeps the visit off the referrer of the site we send it to.
 */
function VnName({ vn, url }: { vn: string; url: string | null }) {
  if (!url) return <span className="font-medium">{vn}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open this VN on VNDB" className="font-medium hover:underline">
      {vn}
    </a>
  );
}

/**
 * One song under its VN: `Artist - Song Name` then, only when the song was
 * asked more than once, its play count (`x2`), then the game(s) it was asked
 * in. A song played once still says where it came up — it just doesn't carry
 * a count that would only ever read "x1".
 */
function SongLine({ song }: { song: VnSongRow }) {
  return (
    <li className="[overflow-wrap:anywhere]">
      <span className="text-textSub">
        {song.artist} - {song.title}
      </span>
      {song.plays > 1 && <span className="ml-1 font-semibold text-accent">x{song.plays}</span>}
      {song.games.length > 0 && <span className="text-textDim"> ({song.games.join(', ')})</span>}
    </li>
  );
}

/**
 * Most Played VNs block for the match page's Stats section: the visual novels
 * this tournament drew from most, and how often — each row followed by the
 * songs behind its plays (`Artist - Song Name x2 (patt vs Tommy G2)`), so the
 * count is readable as "the same track twice" or "two different ones".
 *
 * Renders nothing when no VN in scope was played at least twice (VN_MIN_PLAYS)
 * — a list of every VN that came up exactly once is noise, not a ranking — and
 * the page gates the block on the same flag, so the heading never appears over
 * an empty table.
 *
 * A server component, unlike the sortable stats tables beside it: the rows are
 * a top-N cut of a single ranking, so a sort control could only reorder what the
 * "top 10" claim is about. Reads the same scoped files as the tables above, so
 * the round/game selector narrows it along with everything else.
 */
export default function VnPlaysSection({ stats }: { stats: VnPlayStats }) {
  if (!stats.hasData) return null;

  // "10 of 34 VNs played at least twice" — how much of the long tail the
  // MIN_PLAYS floor cut, and (when the TOP_N cut bit too) how many of the
  // survivors the table actually shows.
  const qualifiers = `${stats.qualified} of ${stats.totalVns} VN${
    stats.totalVns === 1 ? '' : 's'
  } played at least ${VN_MIN_PLAYS} times`;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-[0.75rem] sm:text-sm">
          <thead>
            <tr className="border-b border-border bg-surfaceAlt text-left text-[0.65rem] uppercase tracking-wide text-textMuted sm:text-xs">
              <th className="w-10 px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Visual Novel</th>
              <th
                className="px-3 py-2 text-right font-medium"
                title="Songs from this VN asked across the games in view"
              >
                Plays
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.rows.map((row, i) => (
              <Fragment key={row.vn}>
                {/* A VN with songs under it gives the closing border to the
                    song sub-row below, so the line wraps the VN *and* its
                    songs rather than splitting them off from the next VN. */}
                <tr className={row.songs.length > 0 ? TABLE_ROW_NO_BORDER_CLASS : TABLE_ROW_CLASS}>
                  <td className="px-3 py-2 font-medium text-textSub">{i + 1}</td>
                  <td className="px-3 py-2 [overflow-wrap:anywhere]">
                    <VnName vn={row.vn} url={row.url} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-accent">{row.plays}</td>
                </tr>
                {row.songs.length > 0 && (
                  <tr className={TABLE_ROW_CLASS}>
                    <td colSpan={3}>
                      <ul className="flex flex-col gap-0.5 pb-2 pl-14 text-[0.7rem] text-textDim sm:text-xs">
                        {row.songs.map((song, j) => (
                          <SongLine key={`${song.title}-${j}`} song={song} />
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-textDim">
        {qualifiers}
        {stats.qualified > VN_TOP_N ? `, showing the top ${VN_TOP_N}` : ''}
      </p>
    </div>
  );
}