/**
 * The standard body-row class, shared by every table in the app — the players
 * list, the player page's history, both Player Manager tabs and the match
 * page's stats tables — so a row feels like a row wherever you meet one.
 *
 * It lives in lib/ (outside any 'use client' boundary, the same reason
 * lib/percent-heat.ts exists) because two of its consumers are server
 * components: MatchHistoryTable on /players/[uname] and ResultsSection on
 * /matches/[id].
 *
 * The hover is a 7% wash of the *text* colour rather than a shade of
 * `surfaceAlt`, and the old half-opacity `surfaceAlt` hover is why this
 * exists: in the dark theme (the default) `surfaceAlt` sits just 6 RGB steps
 * above `surface` — halved further on hover — which read as no highlight at
 * all, and even in light it only ever hinted. A text wash lifts dark rows ~15
 * steps and darkens light rows to roughly full-strength surfaceAlt, so the
 * highlight lands in both themes. It is also the deepening the Guess Rate
 * table's tinted rows were always meant to use (see the note there on inline
 * backgrounds outranking hover classes).
 */
/**
 * Everything in TABLE_ROW_CLASS except its bottom border. For a body row that
 * is followed by a continuation row belonging to it (the Most Played VNs
 * table's per-song sub-rows), the border moves to the continuation row instead
 * — otherwise the line would fall between a row and its own songs and the
 * songs would read as attached to the *next* row.
 */
export const TABLE_ROW_NO_BORDER_CLASS = 'transition-colors hover:bg-text/[0.07]';

export const TABLE_ROW_CLASS = `border-b border-borderSub last:border-b-0 ${TABLE_ROW_NO_BORDER_CLASS}`;
