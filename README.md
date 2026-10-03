# EMQ Stats

Next.js app for tracking EMQ team-battle attack/block stats. Two sections:

- **Viewer** (`/`, `/matches/[id]`) — public, lists current + past matches and
  shows the full stats table (Correct / Attacks / Blocks / Effective
  variants), with a click-through modal per player listing every song they
  attacked on and which team it hit.
- **Admin** (`/admin`) — password-protected, split into two sections:
  - **Tour Manager** (`/admin`) — create/edit/delete tournaments: set the team
    rosters and paste or upload the raw EMQ song-history JSON export(s) for
    that match, and export every stored export back out as an archive (see
    [Backing up and exporting the data](#backing-up-and-exporting-the-data)).
  - **Player Manager** (`/admin/players`) — per-gamemode ladder management:
    assign each player's **Set Rank** and compare it against their computed
    **Expected Rank** and promotion **Expectation**; a second tab tags
    usernames globally as **Player** or **Bot**.

## Data layer

Matches are stored in a `matches` table via [libSQL](https://turso.tech)
(`lib/db.ts` / `lib/store.ts`). No Turso account is required for local dev —
if `TURSO_DATABASE_URL` isn't set, it falls back to a local SQLite file
(`./local.db`) automatically. The schema is created on first use.

Reads are shaped around the fact that one tournament's raw JSON is ~2 MB:

- List views (`/`, `/admin`, `GET /api/matches`) read a **summary** row —
  every column except `files`, with the file count coming from the
  `file_count` column written alongside it at save time — so they never
  fetch the payload at all.
- `/matches/[id]` resolves the bracket's file-to-fixture assignment on the
  server and hands its client components only labels and scores, so the raw
  exports aren't serialized into the page response.
- `lib/cache.ts` memoizes the expensive derived reads in `lib/store.ts`
  (`listMatches`, `listPlayerStats`, `listPlayerRankRows`, `listSetRanks`,
  `listExpectedRanks`, `listRecentExpectedRanks`, `listPlayerTags`) per process, since deriving them means walking every
  matching match's JSON. Every write bumps a `data_version` row, so a save is
  visible immediately in the process that made it and within a second to any
  other (the stamp is polled at most once per second).

The `file_count` column and the `data_version` table are added by
`ensureSchema()` on first use, and existing rows get their `file_count`
backfilled from the JSON at that point — no manual migration step.

To deploy against a real Turso database:

```bash
turso db create emq-stats
turso db show emq-stats --url        # -> TURSO_DATABASE_URL
turso db tokens create emq-stats     # -> TURSO_AUTH_TOKEN
```

Set both as environment variables on Vercel (Project Settings → Environment
Variables) — no schema migration step needed, it's created automatically the
first time the app queries the database.

## The app is served under `/emq-stats`

`next.config.mjs` sets `basePath: '/emq-stats'`, because the app shares a host
with another site. Every route therefore lives under that prefix in production:

| Route                        | Production URL                              |
| ---------------------------- | ------------------------------------------- |
| Viewer                       | `https://serecola.com/emq-stats`            |
| Admin                        | `https://serecola.com/emq-stats/admin`      |
| Admin login                  | `https://serecola.com/emq-stats/admin/login`|

Hitting the domain root (`https://serecola.com/admin/...`) returns nginx's
**404 Not Found** — there is no route there, so the request never reaches the
app.

Next.js adds the prefix for you when you use `<Link href>` or
`router.push()` / `router.replace()`. It does **not** for a URL you build by
hand, so those need `withBasePath()` from `lib/base-path.ts`:

- `fetch()` calls in client components (login, logout, the Player Manager
  writes, the match form's save, match delete)
- a native `<form action>` — a no-JS submit is a plain browser navigation
- the login redirect in `middleware.ts` (built from `req.nextUrl.clone()`, which
  re-adds the prefix on serialize)

`next.config.mjs` exports the value as `NEXT_PUBLIC_BASE_PATH` so
`lib/base-path.ts` reads it rather than repeating the string.

## Local development

```bash
cp .env.example .env.local   # fill in ADMIN_PASSWORD / ADMIN_SESSION_SECRET
npm install
npm run dev
```

The prefix applies here too, so visit `http://localhost:3000/emq-stats` for the
viewer and `/emq-stats/admin` for the admin panel.

## Light / dark mode

The header has a theme toggle (☀ Light / 🌙 Dark) next to the nav. **Dark is
the default** — the root layout ships `class="dark"` on `<html>`, and a
pre-paint script removes it before first paint only when `localStorage` holds
a `light` choice, so there's no theme flash on reload. The choice is
remembered per browser under the `emq-theme` key.

Implementation lives in three places:

- `components/ThemeToggle.tsx` — the client button: flips the class, persists
  the choice, and reads the DOM (not storage) on mount so its icon matches
  whatever the pre-paint script already did.
- `tailwind.config.ts` + `app/globals.css` — every palette color is an RGB
  triplet CSS variable (`rgb(var(--x) / <alpha-value>)`), with light values on
  `:root` and dark values under `.dark`. Class-driven theming
  (`darkMode: 'class'`), so the same tokens (`bg-surface`, `text-taken`, …)
  work in both themes including opacity modifiers (`bg-accent/15`, …).
- `lib/team-colors.ts`, `lib/expectation.ts`, `lib/percent-heat.ts` — the
  non-Tailwind colors (team hues, verdict badges, cell heat) read the same
  variables or an `hsl()` that survives both backgrounds, rather than hardcoded
  hexes.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set the environment variables from `.env.example`
   (`ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`).
3. Deploy. `/admin` is gated by `middleware.ts` using the session cookie set
   at `/admin/login`.

## Serving behind nginx

Production is a `next start` process behind nginx on the same host, so the
proxy's limits apply on top of the app's:

- **`client_max_body_size`** — nginx defaults to **1 MB**, but a tournament is
  saved as a *single* request carrying every raw export attached to it (~2 MB
  for one export, several times that for a bracket with half a dozen). Over the
  limit nginx answers **413 Request Entity Too Large** while it is still
  reading the body, so the request never reaches Next and the admin form can
  only report that the save failed. Raise it on the server that fronts the app:

  ```nginx
  server {
    client_max_body_size 64m;

    location /emq-stats {
      proxy_pass http://127.0.0.1:3000;

      # Hand the app the address the visitor actually used — see the Host
      # bullet below for what goes wrong without these. `$host` is the
      # requested hostname; use `$http_host` if the site is on a non-standard
      # port and the port has to survive.
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Host $host;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
  }
  ```

  Vercel has the same shape of limit (~4.5 MB per request body) and no way to
  raise it, which is one reason production runs behind nginx. The app itself
  puts no cap of its own on the body: `POST`/`PUT /api/matches` streams it
  through `req.json()`.

- **`proxy_read_timeout`** — a save also walks the tournament's JSON to rebuild
  the player/song catalog before it responds, which on a large bracket can pass
  nginx's 60s default. Give the proxy headroom (`proxy_read_timeout 300s;`).

- **`Host` / `X-Forwarded-*`** — the proxy has to tell the app which address the
  *visitor* used, because Next builds every absolute URL out of the headers it
  receives: the protocol from `X-Forwarded-Proto` when set (otherwise the
  socket), the host from `X-Forwarded-Host`, else `Host` — `base-server.js`'s
  `req.headers["x-forwarded-host"] ??= req.headers["host"]`, which is why an
  upstream `X-Forwarded-Proto` is honoured while a missing `X-Forwarded-Host`
  silently falls back to whatever `Host` the proxy sent. nginx's default is *its
  own* upstream address (the host in `proxy_pass`), so with the headers missing
  the app believes it is serving `localhost:3000`, and hitting `/admin` bounces
  the visitor to `https://localhost:3000/emq-stats/admin/login?from=%2Fadmin` —
  off the domain, with the `https` that the proxy's `X-Forwarded-Proto` supplied
  next to the `localhost` that `Host` supplied. That redirect is
  `middleware.ts`'s admin gate, and it is the only absolute URL the app hands a
  browser of its own accord; everything else (asset paths, `<Link>`, the
  login form's `fetch`, the post-login `router.push`) is path-relative or
  basePath-prefixed precisely so a proxy can't misplace it. The host Next saw is
  what the URL names — `localhost:3000` means the config forwards a
  `proxy_pass http://localhost:3000;` address rather than a `Host` header.

  Verify from outside with `curl -sSI https://<domain>/emq-stats/admin`: the
  `Location` should be `/emq-stats/admin/login?from=%2Fadmin` (a path the
  browser resolves against the domain, as in this repo's Next 14.2.35), or at
  worst an absolute URL naming that same domain — never `localhost`. The live
  host config (this location, the HTTP → HTTPS redirect, the certbot SSL lines)
  lives on the server, not in this repo — the snippet above is what it must
  contain.

## Backing up and exporting the data

Every uploaded game export lives in the database — one `matches` row per
tournament, the raw JSON included — so "copy the database" has been the whole
backup story. **Export all JSONs** at the top of the Tour Manager, or **Export**
on a single tournament's row, downloads it all as one archive:

```
emq-stats-export-2026-09-30.zip
├─ manifest.json
└─ tournaments/
   └─ 2026-12-31-na-erumode-normal-winter-cup--9f3a2b/
      ├─ r1m0.json
      └─ …
```

- One folder per tournament, `<date>-<region>-<mode>-<sub-mode>-<name>--<match
  id>`, so the archive mirrors how a tournament is titled and sorts
  chronologically. The id is what makes the path unique (there is more than one
  "Winter Cup") and keeps it that way if the tournament is renamed later.
- One JSON per upload, named for the fixture it belongs to: round and match as
  the bracket shows them, then the two teams that played —
  `r1m2-hyther-vs-serecola.json`, which sorts into bracket order and says who was
  in the game without opening anything. A file the bracket couldn't place (no
  slot, and the teams in its JSON don't map onto one fixture) falls back to the
  game's own export name, which carries the play timestamp.
- `manifest.json` is the half a pile of exports can't give you: the roster, the
  entered scores, the renames, the per-player ranks, the slot assignments and the
  archive version, which is everything a restore needs.

The exports are re-serialised from the parsed JSON the app holds
(`JSON.stringify(data, null, 2)`), so they are the same data in tidier formatting
rather than byte-identical to the file that was pasted. The manifest's scores are
the *effective* ones — a game scored on one side only reads 0 for the other, the
same rule the table applies (`withAssumedZeroScores`) — so an archive reproduces
what the app showed and what the stats were computed from.

`GET /api/admin/export?id=<match id>` exports one tournament and
`?format=json` skips the archive, returning the same content as a single JSON
document for scripting. The whole route sits behind the admin session cookie
(`middleware.ts` matches `/api/admin/:path*`) and answers `Cache-Control:
private, no-store`, so nothing between the proxy and the browser holds on to an
archive of every upload. Worth running before a risky edit or a database
migration. The archive is assembled by `lib/zip.ts` — a hand-rolled deflate ZIP
over Node's own `zlib`, so no new dependency — and the layout and manifest come
from `lib/export.ts`, which an importer would read the same way.

## Searching tournaments by player

The tournament list (`/`) has a player search above the cards: type a name and
choose **Include** or **Exclude** to keep only the tournaments that player was
in, or to hide the ones they were. Both sides hold as many names as you like
and combine, so "tournaments karira and patt both played, but not tom" is one
filter. Applied names appear as chips you can remove individually or clear all
at once.

The state lives in the URL (`?with=karira&without=tom`), so a filtered list is
bookmarkable and shareable, and it composes with the mode/sub-mode pills above
it — switching gamemode keeps the player filter rather than dropping it. The
form also works with JavaScript disabled: it submits `?q=&add=` to itself and
the server applies that pending name (`parsePlayerFilter` in
`lib/tournament-search.ts`).

Names are matched through the same resolution the rest of the app uses — a
match's own `renames` with the global aliases folded underneath — so filtering
for someone also finds the tournaments where they were entered under an old
name, rather than missing exactly the ones a rename was made to fix. The
suggestions are the players in the tournament rosters, which is the same set
the filter matches; each shows how many tournaments they were in.

The roster is the source, not the uploaded files: it's what the summary read
returns (no multi-megabyte payloads) and what an admin edits when fixing a
tournament. A player who played but isn't in the pasted roster isn't matched
here — the admin form surfaces those separately as unmatched names.

### Recent (5) vs All-Time

Three views read a player's tournament history one of two ways, switched by the
same slider (`components/StatsRangeToggle.tsx`) and carried in the URL as
`?range=all`, so the choice is bookmarkable, shareable and survives the mode
sub-mode, the sub-tab and the links between them:

- **Recent (5)** — the default, and what a bare visit gets: only each player's
  five most recent tournaments in the current gamemode + sub-mode.
- **All-Time** — every tournament they played in that mode + sub-mode.

| View | What the range covers |
| --- | --- |
| `/players/<name>` | The stat cards, the tournament history table and the count under the name, all from that one slice — so they can't disagree about which tournaments are in view. The count reads "last 5 of 12 tournaments" when the window trims anything. |
| `/players` | Every per-player figure in the table — Tournaments, Winrate, Guess Rate, the Erumode split guess-rate columns and the Expected Rank / Expectation that follow them — joined from the same cached rows the admin view reads. Set Rank itself is never ranged. |
| `/admin/players` → Set Ranks | The Expected Rank each row is graded on, and with it the played figures and the Expectation that follows. Set Rank itself is never ranged — it's the admin's, not a measurement. |

The Player Tags tab has no switch: aliases and bot overrides are global per
username rather than per tournament, so there is no history to slice.

"Recent" is exactly what *tours they participated in* means here: a tournament
they were uploaded in but didn't play a song in is in neither count, and a
player with five tournaments or fewer is identical on both sides. The window
also matches the Expected Rank source's (`recentExpectedRanksFor`), so the
numbers on a Recent page and the rank the autodrafter balances with describe
the same handful of tournaments.

The slice is recomputed from the per-tournament rows (`slicePlayerSummary` in
`lib/player-stats.ts`, reached from `computePlayerRankRows` for the ladder)
rather than by re-running the whole aggregation over a trimmed match list: the
slice follows the *player*, not their gamemode, so it spans their whole history,
and narrowing the input by mode could cut a tournament out of the middle of it.
A trimmed row keeps its all-time count beside the ranged one ("5 / 12") instead
of quietly dropping the rest, and nothing is written either way — the switch
changes what a view reads, never what's stored.

### The player page

`/players/<name>` shows one player's stat cards and tournament history, and it
reads them inside exactly one gamemode + sub-mode — the same slice
`findPlayerStats` is given, so every figure on the page describes one game
rather than a blend of several. The mode/sub-mode chips
(`components/ModeToggle.tsx`, with `includeAll={false}` /
`includeAllSubmodes={false}` like `/players`) switch that slice with concrete
modes and sub-modes only; there is no "All" here because a catch-all would mix
scales (Erumode's Performance is scored differently from NGMC's) and there is no
single history to show. The chips carry the range along as well, so changing
mode keeps the Recent / All-Time choice instead of dropping back to the default
window.

A player who simply never played the selected mode (the page's empty state) is
not a 404: their unfiltered name still resolves, and the same chips stay on
screen so the way forward is to pick a mode where they do have tournaments. Only
a name that matches nobody at all 404s.

## Player Manager ranks

`/admin/players` works inside one gamemode **and** sub-mode at a time (e.g.
NGMC Random, Erumode Balanced) — there is no mode-level rank, because that's
the granularity a draft is balanced at and each sub-mode has its own ladder
(Erumode's Performance is also scored on a different scale).

- **Set Rank** — the admin's own rank for a player in that gamemode + sub-mode.
  Edited inline in the table (saves on blur/Enter via
  `PUT /api/admin/player-ranks`) and stored in the `player_set_ranks` table,
  one row per player per mode *and* sub-mode, keyed by normalized username.
  Clearing the field removes the rank.
- **Winrate** — how the games they actually played went: a win is worth 1 point,
  a tie 0.5 and a loss nothing, over the games played, so 2 wins / 1 tie / 3
  losses reads 41.7% (`winRatePct` in `lib/results.ts`). Counted per *game*
  rather than per tournament and per *player* rather than per team
  (`computePlayerGameRecords`), so a squad dropped out of the second half of a
  bracket stops winning, and a team member who sat a game out is neither up nor
  down for it. A game with no result — unscored, or a lone score that can't be
  pinned to a fixture — counts for nobody, and a player with no counted game
  shows `—` rather than a 0% that would read like a losing streak. The
  "Recent (5)" switch applies to it like every other figure in the table.
  Winrate and Guess Rate are shaded on the cell itself — a straight gradient from
  red at 0% through yellow at 50% to green at 100% (`percentHeat` in
  `lib/percent-heat.ts`, shared by this table and the `/players` list, which
  walks the hue the long way round, red → yellow → green, so the middle of the
  scale never goes muddy).
- **Expected Rank** — what the player's results imply: the songs-weighted mean
  of their per-tournament Performance rating (`lib/guess-stats.ts`) across the
  selected gamemode + sub-mode. It uses the same scale as the `(N)` ranks a
  roster is annotated with, which is what makes the two numbers comparable.
  Only that one sub-mode's games count: a sibling sub-mode is a different game,
  so its results are never substituted in as a baseline, and a player who hasn't
  played this sub-mode simply has no row until they do.
- **Expectation** — `Expected Rank − Set Rank`, scored with the thresholds in
  `lib/expectation.ts` and shared with the match Guess Rate table's Expectation
  column, so the two views can never disagree about a player. Players without a
  Set Rank show `—` rather than a verdict.

### The public players list

`/players` shows the same ladder read-only: **Set Rank / Exp. Rank /
Expectation** open the row, right behind the player's name, because they
describe the player itself rather than the range on screen. All three are joined
(by normalized username) straight from the cached `listPlayerRankRows` the admin
table renders, so the public view and the Player Manager can never disagree
about a player. Set Rank is displayed, not edited — the inline input stays
admin-only — and a figure with nothing to compute shows `—` rather than a guess.
Heading it **Exp. Rank** keeps the row narrow; the hover title still spells the
figure out.

Header labels are the short forms — **Tours / WR / GR / Comp / Off GR** — for
the same reason, and every one of them is a sort key (`SortableHeader` /
`toggleSort` / `compareValues`, the machinery the admin tables use). The list
opens on **Set Rank descending — the highest number first**, anyone the admin
hasn't ranked yet parked at the bottom — and a cell with no figure sorts last in
*both* directions instead of taking a 0 it never earned. The row is
set compactly on top of that: every header on one line, 0.65rem, xs figures,
half-width gutters (`DENSE_CELL_PAD`). Fifteen columns of short numbers gain
nothing from generous type, and the shortened labels do the width saving that a
second header line would otherwise have to do — which is what keeps the Erumode
table from scrolling on a laptop.

Erumode selections gain the split guess-rate columns: **VN / Artist / Song /
Dev / Comp**, **Avg Rig**, **Rig GR%** and **Off GR%**, pooled over
the same range as the rest of the row (`erumodeSplitStats` in
`lib/player-stats.ts`). Everything is summed from raw counts and divided once —
per-type rates weighted by each tournament's song count and counting only
tournaments where that answer type was active, rig and off-list rates over
their own numerators and denominators — so a three-song event never outweighs a
thirty-song one, and the pooled rates match what the match Guess Rate table
would compute over the same tournaments. Avg Rig is the mean on-list (rig)
guess count per tournament in view; the other three are percentages, `—` while
the range has nothing to divide.

In Erumode Normal **VN Exp** (VN Expected Rank) folds in and out from the VN
column itself: the **VN** header sorts like every other column, while
clicking the column's cells opens VN Exp directly beside VN — between **GR**
and **Artist** — and clicks it shut again. VN GR stays out of the expansion
because the VN column already shows that number.

Every rate column in the Erumode block — the five answer types plus **Rig GR**
and **Off GR** — medals its best three rather than shading them all: gold to the
highest, silver to the next, bronze to the third (`MEDAL_CLASSES` /
`MEDAL_COUNT` in `components/PlayerListTable.tsx`; gold is the palette's
`accent`, silver and bronze are their own tokens in `tailwind.config.ts`). Seven
shaded columns side by side read as a single wall of colour, and the top of a
column is the part anyone actually looks for. 0% and players with no guesses of
that rate are skipped, so a rate nobody answered correctly medals nobody rather
than handing gold to a zero; ties are broken by name and the medals are computed
from the unsorted rows, so sorting the list never moves one. Winrate and Guess
Rate keep the `percentHeat` gradient — the two figures the admin table shades
the same way.

A **search box** across the card's top right narrows the list to the usernames
containing what was typed — a case-insensitive substring match, the same rule
the Player Manager's list filters with. It runs client-side like the sorting,
so typing never re-renders the server page, and a count beside it shows how
much of the list is left while a search is active. The search only ever hides
rows: medals are still computed over every player, so a search can never move
one.

The table's **Columns** popup (the toolbar's right edge, beside the search)
folds any column but the player's name out of the view: a checklist that is
session state like the sort, and which parks the list on its default sort if
the column it was sorting by disappears. The match page's Guess Rate table
carries the same popup over its own toolbar. Hiding never spreads what's left:
the table drops its full width and packs left at its natural column widths, so
a column going off reads as *removed*, not as the survivors drifting apart.

### Player Tags tab

Holds the two global, per-username facts that aren't a rank: who is a bot, and
which names are the same person.

**Bots.** Any username containing **"Bot"** (case-insensitive) is badged
automatically, so AisuBot and KreiBot need no admin work and ordinary players are
never tagged. The rule lives in `lib/player-tags.ts`, and
`resolvePlayerTag(name, overrides)` is the single function every view calls, so
the Player Manager and the public badges can never disagree.

**Aliases.** The cross-match identity link, in the `player_aliases` table via
`PUT /api/admin/player-aliases`. A match's own `renames` map only ever fixes that
one tournament's roster paste, so the same person spelling their name two ways
across two tournaments still aggregated as two separate players. An alias is
global and retroactive: it feeds the *same* name-resolution path `renames` does
(`withAliases` in `lib/player-aliases.ts`), so once one is set

- both names' tournaments aggregate into a single player on `/players` and
  `/players/[uname]`, and their per-match rows credit the canonical name;
- Expected Ranks and the autodrafter's "Expected (last 5)" treat them as one
  ladder entry, keyed by the canonical name;
- a Set Rank saved under the old name moves onto the canonical player, as does
  its bot/override row (the canonical player's own value wins on conflict, so
  nothing it was explicitly set to gets clobbered).

Chains are flattened (`Aisu → aisu → AisuBot` resolves to `AisuBot`) and cycles
are refused rather than followed. Adding an alias is a deliberate merge, not a
rename you can undo one field at a time: removing it splits the names back
apart, but anything already migrated to the canonical player stays there.

Both kinds of row are *global* — one per normalized username across every
gamemode — and both ignore the ModeToggle filter, so the tab lists every
username from every tournament. A resolved bot gets a `bot` pill next to it on
the public player pages and in the match stats tables; nothing filters stats or
autodraft on the tag itself.

### Autodraft rank sources

The match form's autodrafter (`components/TeamDrafter.tsx`) balances with one
of three rank sources, picked with the pills above the players box:

1. **Set Ranks** (default) — the saved Set Ranks for the tournament's own
   mode + sub-mode, so a new tournament only needs the players list pasted in.
   A player without a Set Rank is shown with an inline input so the admin can
   type a rank on the spot (draft-only — save it in the Player Manager to
   keep it); until then they sit out the draft.
2. **Expected (last 5)** — each player's Expected Rank computed from only
   their 5 most recent tournaments in that mode + sub-mode (songs-weighted
   mean of those tournaments' Performance — `recentExpectedRanksFor` in
   `lib/player-ranks.ts`), falling back to their Set Rank when they have no
   games to compute one from. These are the only ranks the app derives rather
   than the admin entering, so they're the only ones rounded — to a single
   decimal place, up or down to the nearest tenth (`roundToTenth` in
   `lib/teams.ts`) — before they're balanced, drafted and written back into the
   Teams box. Ranks you assign or paste are used exactly as given.
3. **Expected (VN Only)** — the same last-5-tournaments computation but from
   VN-only (Mst answers) Performance alone (`recentVnExpectedRanksFor` in
   `lib/player-ranks.ts`), with **no Set Rank fallback**: a player with no VN
   data has no rank here and sits out the draft (or gets a rank typed inline)
   — the same unranked semantics the old Pasted-table source had. Rounding
   works as above.

Whichever source is selected, the Ranks box still works as a per-tournament
override on top of it — a `rank: name, name` table pasted in there
(`11: karira, patt`) is how a one-off draft outside the saved ladders is
balanced — and only names actually listed can enter the draft (see
`mergeHiddenRanks` in `lib/balance.ts`).

Player identity is the normalized username (the same identity stats aggregate
by), reconciled by two layers of name mapping: a match's own `renames` map, which
fixes that one tournament's roster paste, and the global **aliases** above, which
reconcile the same person across every tournament. A match's renames win where
the two disagree — they're the more specific statement, made against that
match's raw JSON.

## Entering game scores

The admin form's bracket takes a score per fixture, per team — a game's two
sides, not the whole roster, so only the two teams in that fixture have boxes.
A blank box means that team scored nothing: a score typed on one side only
reads as that team winning by it with the other side on 0 (`12–0`), which is
what lets the game decide its fixture, count in the standings and earn points.
Read literally it would be dropped instead (`computeGameResult` needs two
scored teams), which is why a single-sided game used to show up nowhere.

That assumption is applied when a match is *read*, not when it's saved:
`withAssumedZeroScores` in `lib/schedule.ts` is called from `rowToMatch` in
`lib/store.ts`, the one point where stored files become a `Match`, so every
reader agrees (standings, bracket cards, the admin form's own score boxes) and
a tournament saved with a single-sided game counts the same as one entered with
both numbers — no migration and no re-save. The database keeps exactly what was
typed. A file with no score at all stays unplayed (nothing invents a `0–0`),
and a file that can't be pinned to one fixture — no slot, and its raw JSON
names no two roster teams — is left exactly as entered.

## How stats are computed

`lib/stats.ts` ports the original single-file HTML tool's logic:

- A player's correct guess counts as an **attack** if no member of any other
  participating team also got it right that song, and a **block** if an
  opposing team also got it right but no teammate did.
- **Effective** attacks/blocks are the subset where `NGMCGuessesCurrent > 0`
  for that guess.
- "Participating teams" for attack attribution are scoped **per uploaded
  file** — since one match file usually only involves 2 of the teams in a
  larger roster, only the team(s) whose players actually appear in that file
  are listed as attack targets.
