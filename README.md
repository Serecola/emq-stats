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
- nothing: the admin login bounce is a `redirect()` from `requireAdminPage`
  (lib/admin-session.ts), which — like `<Link>` and the router — applies the
  basePath itself, so it takes the unprefixed `/admin/login`

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
3. Deploy. `/admin` is gated per page and per route handler by the session
   cookie set at `/admin/login` (see [Admin authentication](#admin-authentication)).

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
  `req.headers["x-forwarded-host"] ??= req.headers["host"]`. Set them anyway:
  nginx's default is *its own* upstream address (the host in `proxy_pass`), so
  with the headers missing the app believes it is serving `localhost:3000` and
  any absolute URL it builds would point off the domain. The admin path builds
  none — the login bounce is a `redirect()` to a basePath-prefixed *path*, which
  the browser resolves against whatever domain it used — but the headers are one
  line each, and every future absolute URL depends on them.

  Verify from outside with `curl -sSI https://<domain>/emq-stats/admin`: the
  `Location` should be `/emq-stats/admin/login?from=%2Fadmin` — a path, never a
  URL naming some other host. The live host config (this location, the HTTP →
  HTTPS redirect, the certbot SSL lines) lives on the server, not in this repo —
  the snippet above is what it must contain.

## Admin authentication

One shared password, one session secret, no user accounts.
`ADMIN_PASSWORD` is the only credential ever compared at the login door; it
lives in the server's env and nowhere else.

`ADMIN_SESSION_SECRET` is **required**, and the session cookie's value is
**not** the secret itself — it is `SHA-256(secret + ':' + window)`, where
*window* is the current 90-day period (`sessionWindow` in `lib/auth.ts`). Three
things follow:

- **Sessions expire on their own every 90 days.** The admin signs back in with
  the same password — the cheapest re-auth there is for a single admin, and it
  needs no cron job, no stored counter and no restart, because the window is
  derived from the clock on the writer (the login route) and on the checker
  (`hasAdminSession`) alike, so they cannot disagree about which generation a
  request is in.
- **A captured cookie can't be extended.** The cookie carries the hash, not the
  secret, so whoever holds one cannot mint a cookie for a later window — which
  is what would otherwise make the automatic rotation cosmetic. It stays valid
  at most until its own window ends.
- **To expire everything immediately** (a suspected leak): change
  `ADMIN_SESSION_SECRET` and restart the server process. Nothing else — the gate
  reads the env per request in the same runtime that mints the cookie, so there
  is no second, build-time copy to rebuild and no window to reason about.

The cookie's own `maxAge` is 30 days, so in practice a session ends there
first; the 90-day window is the server-side ceiling that still holds if that TTL
is ever raised, or if a cookie is restored from a browser backup.

The gate lives in the Node runtime, in each admin page (`requireAdminPage`) and
each admin route handler (`hasAdminSession`, answering 401) — not in
`middleware.ts`, which used to do it. The Edge middleware compiles `process.env`
to a runtime lookup that resolves to nothing in its sandbox, so a check there
compared the cookie against `undefined` and bounced *every* admin request,
cookie or not; the Node runtime reads the same env correctly (the login route
mints valid cookies from it). One runtime, one comparison, and no build-time
coupling to trip over when the secret changes.

There is deliberately **no `ADMIN_PASSWORD` fallback**: a deployment missing
`ADMIN_SESSION_SECRET` denies the admin area outright — every admin page bounces
to the login screen and the login route answers 500 — rather than quietly
treating the password as the cookie, which would make a guessed, reused or
leaked password a valid session too.

`POST /api/admin/login` is throttled per client address: **5 wrong passwords
within 10 minutes** and that address gets `429` with a `Retry-After` until the
window rolls over; a successful login clears the tally. The counter is
in-process (a `Map` in the route), which matches the single `next start` behind
nginx — a restart clears it, and behind several instances each process keeps
its own tally. nginx can rate-limit the path itself for defence in depth, which
also covers a restart or extra instance:

```nginx
# in the http block
limit_req_zone $binary_remote_addr zone=emq_login:10m rate=10r/m;

server {
  location /emq-stats/api/admin/login {
    limit_req zone=emq_login burst=5 nodelay;
    proxy_pass http://127.0.0.1:3000;
    # ...plus the same proxy_set_header lines as the app location above
  }
}
```

The address the app throttles on is the **last** `X-Forwarded-For` entry:
nginx's `$proxy_add_x_forwarded_for` appends the real peer to whatever the
client sent, so the first entry is attacker-controlled and must not be
trusted.

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
(the handler asks `hasAdminSession` and answers 401) and answers `Cache-Control:
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

The per-tournament history table carries the same figures that tournament's own
Guess Rate table shows for that player, one row per tournament: **Rank** (the
"(N)" beside their name in that tournament's roster), **Perf** (their Performance
there), **Expect** (the promotion verdict from Perf − Rank, through the shared
`expectationFromDiff` thresholds, so this table can never disagree with how that
tournament scored them), **GR**, then **VN / Artist / SN / Dev / Comp**,
**Rig GR**, **Off GR**, **Rigs** and **Songs** — plus the NGMC-only
Attacks/Blocks pair in the NGMC table. The five answer-type columns come from one
shared list, `SPLIT_TYPES` in `lib/player-stats.ts`, also used by `/players`, so
"VN" and "Artist" can't come to mean two different columns in two places.

A `—` means "not measured in that tournament", never a zero, and each column has
its own reason for it:

- **Rank / Expect** — that tournament's roster carried no "(N)" next to this
  player's name, so there's nothing to grade Performance against;
- **VN** — an Erumode tournament that never asked Mst;
- **Artist / SN / Dev / Comp** — an answer type that tournament didn't ask: a
  Normal event that ran only Mst + Artist has no Composer column to report, and
  says so rather than printing 0% (the "VN only" tournaments here dash out four
  of the five);
- **Off GR** — NGMC, which doesn't track off-list guessing at all;
- **Rig GR** — nothing was on their list that tournament. **Rigs** still
  prints its `0` there: an empty list is a fact, a 0% rate over no guesses is
  not a measurement.

The per-tournament rig rates come from `entryRigGr` / `entryOfflistGr`, which
reproduce the per-mode denominators: Erumode counts a rig hit once per active
answer type (so its denominator carries that multiplicity and the rate can't
exceed 100%), while NGMC asks one question per song and divides by the list
itself.

### Player synergy

Under the per-mode sections, `/players/<name>` gains a **Synergy** section: every
other player this one has shared a tournament with, ranked by how much of whose
list they land. It is the player-page companion to the match page's **Team
Synergy** block, and it counts the same event — `lib/player-synergy.ts` imports
`readAnswers` from `lib/synergy.ts` rather than re-walking the exports, so the
two views cannot drift on what a song counted:

- a **chance** is a song that was on somebody's list, asked while the reader was
  in the room;
- a **hit** is a chance the reader also got right;
- every rate is `hits / chances`, printed beside its own counts.

Each pairing carries both directions on one row — **You snipe them** (songs this
player got right that were on their list) and **They snipe you** (the same
relationship counted from the other end) — rather than two independently sorted
lists, so a lopsided pairing is visible at a glance instead of having to be
spotted by comparing positions across tables. Columns are sortable by either
direction or by name, and rates are coloured by `readHeat`
(`components/SynergyReadValue.tsx`) — 50%+ green, 25–50% gold, under 25% red, so
the column can be ranked without reading the numbers off it.

Two filters sit above the table, both on by default, because a ranking whose top
row is a bot or a 100% off two songs is not a ranking:

- **Hide bots** — drops partners tagged `Bot`, resolved through
  `resolvePlayerTag` (`lib/player-tags.ts`), the one rule every view uses, so
  this table can't disagree with the pill it would otherwise be hiding.
- **Min 30 songs** — drops partners with fewer than `MIN_CHANCES` (30) chances
  on *their* list, measured on `read.chances`, the evidence behind the column the
  table ranks by default. 1/1 would otherwise read as a perfect 100% and outrank
  a genuine 60% over 300 chances.

Both are one click from off, and while either is costing rows the chip row says
so — "12 of 19 partners shown" — so a filtered list can't be mistaken for a
short one. When the filters leave nothing behind the table is replaced by a
"no partners match these filters" note rather than an empty frame.

The table is **paginated 10 rows at a time** (`PAGE_SIZE`). A well-travelled
player shares tournaments with a few dozen people and the tail of that list is a
long column of single-digit rates nobody scrolls to; the pager keeps the section
one screen tall while leaving every row reachable. Rank numbers run across the
whole list (page two starts at 11) rather than restarting each screen, the
"showing 11–20 of 34" line says where you are, and re-sorting or flipping a
filter jumps back to page 1 — the old page number would otherwise point at a
different slice of the new order. Filtering happens before sorting and paging,
so the rank numbers, the pager and the "of 34" all count the same rows.

Three things are deliberately *not* here:

- **No self row.** A player's own correct guesses on their own list are exactly
  their Rig GR, which the tournament history above already shows per tournament.
- **No tournaments-shared count.** The chance count printed beside each rate is
  already the evidence a pairing rests on; a second count would say less.
- **No ally/enemy split.** That is meaningful within one room, where two players
  are unambiguously teammates or opponents. Across tournaments the same two are
  teammates one week and opponents the next, so both directions are pooled
  instead.
- **No unrostered names.** A name that appears in an export without a team has
  no verifiable identity across tournaments — the same rule `lib/synergy.ts`
  applies.

The ranking is scoped to the tournaments the rest of the page is showing, by
match id rather than by the whole mode filter, so it narrows with the Recent /
All-Time switch like every other figure there: a player whose Recent slice
covers five tournaments is ranked over those five, not their whole career
(`findPlayerSynergy` in `lib/store.ts`, cached per player + filter + that exact
set). The section is gated on `hasData`, so a slice whose tournaments produced
no list-bearing chance shows no heading at all rather than a heading over an
empty table — the same treatment the match page gives its synergy block.

### Most missed VNs and artists

Under the synergy block, `/players/<name>` gains a **Most Missed** section: the
VNs this player can't name and the artists they can't place, as one table with
a VNs / Artists switcher. It reads the same slice as everything else on the
tournaments the stat cards and the history table are showing — so it narrows
with the Recent / All-Time switch and the mode chips too (`findPlayerMisses` in
`lib/store.ts`, cached per player + filter + that exact set of match ids).

The unit is one **question of the relevant answer type**, which is how the game
asks: the VN table counts `Mst` (main-title) answers grouped by the song's VN
source, the artist table counts `A` (artist) answers grouped by the export's
credited artists — read through the same `readAnswers` walk the Guess Rate
table and Team Synergy use (`lib/synergy.ts`), so the three can't drift on
what a song asked. Other columns (song name, developer, …) feed neither table.
A row's **Missed** count is therefore `Mst (or A) answers they got wrong /
Mst (or A) answers they were asked`, and `100 − Miss %` is this player's
per-type guess rate over that VN or artist. It is deliberately *not* a
re-derivation of the pooled figure on the card above: that one weights each
tournament by its songs, so a VN-only event (one asked type) counts for as much
as a five-column one, while these rows pool questions.

The exports only carry `IsGuessCorrect` on the answers a player got *right*, so
"no flag" is the game's own way of saying wrong — a skipped question reads the
same as a wrong one, and no second definition of "missed" is invented here.

NGMC asks `Mst` only, so there the artist ranking is always empty and the
section shows the VN table with no switcher; an Erumode slice whose tournaments
never asked `A` lands in the same place. A song asked while the room had no VN
source still counts its `A` answer (and vice versa) — the rankings are
independent. The switcher defaults to VNs, since every mode asks `Mst`.

Both rankings are floored and cut:

- **At least 2 plays** (`MISS_MIN_PLAYS`). A VN the room drew once and this
  player missed is a fact about the draw, not about them. The floor is counted
  in *plays* — games the VN/artist came up in (with that answer asked) while
  they were in the room — rather than in questions, so it means the same thing
  in both modes. Same floor the match page's **Most Played VNs** table
  uses (`VN_MIN_PLAYS`).
- **Top 10** (`MISS_TOP_N`), the same cut as that table. The footnote under the
  table says how much the two left behind — "10 of 313 missed VNs came up at
  least 2 times".

VNs are grouped by the export's own `Sources[0].Id` and artists by
`Artists[i].Id` (`getVNSource` / `getArtists` in `lib/stats.ts`) rather than by
name, so a VN or a singer spelled two ways across uploads is still one row. A song whose artist line credits several people counts
for each of them, so a duet lands in both singers' rows instead of fragmenting
into "A" and "A, B". Each row lists every missed song behind it, most-missed
first: "Artist — Song" on the VN table, "VN — Song" on the artist table.

Rows are ordered by misses first and Miss % second: how often they get it wrong
is the question, and among rows missed the same number of times the one they
missed a larger share of is the worse answer. The rate is coloured by `readHeat`
(`components/SynergyReadValue.tsx`) read backwards — the same thirds the synergy
tables use — so a performance that is 50% right is one colour across the page
instead of green here and red there.

A VN (or artist) they never missed is not a *missed* one and never reaches the
table, and the whole section is gated on `hasData` like the synergy block, so a slice in
which nothing was missed shows no heading at all rather than a heading over an
empty table. The block is a client component for its VNs / Artists switcher
(`components/PlayerMissesSection.tsx`): the rows of each ranking are still a
top-N cut of a single ordering each, so there is nothing to sort, filter or
page beyond the tab itself.

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
Entering a score on one side decides the fixture without filling the other
box: the blank box is read as 0 for the result, so typing `12` immediately
shows the game as `12–0` with the winner highlighted and the card solid —
the boxes stay exactly as typed and no `0` appears in them. On save, a
fixture with one side scored gets an actual `0` written for the blank
opponent, so the stored record shows the same effective score; both boxes
blank stays unplayed (nothing invents a game nobody scored). A blank box
still means that team scored nothing: a game saved with a score on one side
only reads as that team winning by it with the other side on 0 (`12–0`),
which is what lets it decide its fixture, count in the standings and earn
points — read literally it would be dropped instead (`computeGameResult`
needs two scored teams), which is why a single-sided game used to show up
nowhere.

The same assumption also still applies when a match is *read*:
`withAssumedZeroScores` in `lib/schedule.ts` is called from `rowToMatch` in
`lib/store.ts`, the one point where stored files become a `Match`, so every
reader agrees (standings, bracket cards, the admin form's own score boxes) and
a tournament carrying a single-sided game — one saved before the form wrote
the missing 0, or entered any other way — counts the same as one entered with
both numbers, with no migration and no re-save. The database keeps exactly
what was typed (or the `0` the form wrote for a blank opponent at submit). A
file with no score at all stays unplayed (nothing invents a `0–0`), and a
file that can't be pinned to one fixture — no slot, and its raw JSON names no
two roster teams — is left exactly as entered.

**Import Results** (above the bracket) fills every fixture's score boxes from
a clipboard table in the same shape the roster is pasted in: one game per
line, tab-separated — `Team 1  Score 1  Team 2  Score 2`, optionally under
that header. Team cells are matched to the current roster with their `(rank)`
annotations stripped; for a pairing that plays twice (the 4-team double
round robin) the first row for that pair fills its first fixture in bracket
order and the second row the rematch. Scores already entered are only
replaced after a confirmation, and nothing is persisted until the tournament
is saved — the import just types into the same boxes. Where the browser
blocks reading the clipboard, the button falls back to a paste prompt.

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
## Most played VNs

The Stats section ends with **Most Played VNs**: the visual novels a tournament
drew from most, as a ranked table of plays. It reads the same scoped files as
everything else on that page, so the round/game selector narrows it like the
rest — select one game and it answers "which VNs came up *in that game*".

A **play** is one song from that VN appearing in a song history — one game
asking one song — so the same track asked in three games is three plays. Plays
are therefore comparable between VNs, but the count says nothing about how large
a VN's catalogue is: three one-song entries can outrank a single three-track
entry.

Two rules keep the list about popularity rather than long-tail noise:

- **At least 2 plays** (`VN_MIN_PLAYS` in `lib/vn-plays.ts`). A VN that came up
  exactly once is a fact about the song draw, not a preference, and ranking
  those would make most of the table read "every other VN appeared once". The
  footnote under the table says how many VNs the floor cut.
- **Top 10** (`VN_TOP_N`), which is the whole point of the section — anything
  past ten rows is the same claim, further down.

When nothing in scope cleared the floor the block is left off the page entirely
— table, heading and jump-rail entry together — rather than shown empty.

VNs are grouped by the game's own source id (`Sources[0].Id`, read by
`getVNSource` in `lib/stats.ts`) rather than by title text, so two songs of one
VN can't split across rows over a spelling or main-title difference between
uploads; an export carrying no id falls back to grouping on the title. The name
shown is the export's own main title, which is the same string the attack modal
in Attacks & Blocks already prints for that VN — both read `getVNName`.

The name links to the VN's page on VNDB, taken from that song source's `Links`
by `Type: "VNDB"` — the same array also holds a `SelfSource` link back to the
quiz's own page plus Wikidata/EGS/VGMdb entries, and only the VNDB one is a link
*to the VN*. It opens in a new tab (`rel="noreferrer"`) so the tournament page
stays put, and a VN whose source carries no VNDB link renders as plain text
rather than a dead link.

A **Copy** button sits next to the heading. It copies the table plus the rig
distribution (`formatVnCopySummary` in `lib/vn-plays.ts`) as plain text:

```text
MOST PLAYED
2 plays: D-EVE in you
...
RIG DISTRIBUTION
Aisu: 46 (41.1%) | 17 OPs, 17 EDs, 11 Ins, 1 OP/EDs
...
```

The VN lines are the table's displayed rows. The rig lines are each player's
Rigs count from the Guess Rate table — with its share of their songs at the
same 1dp — plus that count split into OP / ED / Ins / OP-ED, sorted by rig
count (ties by name). Each rigged song counts once, typed by its primary
source (`Sources[0].SongTypes`, the same type the Guess Rate table grades it
under); a song tagged both OP and ED lands in the mixed bucket labelled
`OP/EDs`. Labels stay plural even for one (`1 OP/EDs`), and an empty bucket is
left off rather than printed as zero. Both halves read the same scoped files
as the page, so the copy narrows with the round/game selector like everything
else.
