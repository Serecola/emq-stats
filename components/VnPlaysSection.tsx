import { TABLE_ROW_CLASS } from '@/lib/table-row';
import { VN_MIN_PLAYS, VN_TOP_N, type VnPlayStats } from '@/lib/vn-plays';

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
 * Most Played VNs block for the match page's Stats section: the visual novels
 * this tournament drew from most, and how often.
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
              <tr key={row.vn} className={TABLE_ROW_CLASS}>
                <td className="px-3 py-2 font-medium text-textSub">{i + 1}</td>
                <td className="px-3 py-2 [overflow-wrap:anywhere]">
                  <VnName vn={row.vn} url={row.url} />
                </td>
                <td className="px-3 py-2 text-right font-semibold text-accent">{row.plays}</td>
              </tr>
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