# EMQ Stats

Next.js app for tracking EMQ team-battle attack/block stats. Two sections:

- **Viewer** (`/`, `/matches/[id]`) — public, lists current + past matches and
  shows the full stats table (Correct / Attacks / Blocks / Effective
  variants), with a click-through modal per player listing every song they
  attacked on and which team it hit.
- **Admin** (`/admin`) — password-protected, split into two sections:
  - **Tour Manager** (`/admin`) — create/edit/delete tournaments: set the team
    rosters and paste or upload the raw EMQ song-history JSON export(s) for
    that match.
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

## Local development

```bash
cp .env.example .env.local   # fill in ADMIN_PASSWORD / ADMIN_SESSION_SECRET
npm install
npm run dev
```

Visit `http://localhost:3000` for the viewer, `/admin` for the admin panel.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set the environment variables from `.env.example`
   (`ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`).
3. Deploy. `/admin` is gated by `middleware.ts` using the session cookie set
   at `/admin/login`.

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
- **Expected Rank** — what the player's results imply: the songs-weighted mean
  of their per-tournament Performance rating (`lib/guess-stats.ts`) across the
  selected gamemode + sub-mode. It uses the same scale as the `(N)` ranks a
  roster is annotated with, which is what makes the two numbers comparable.
  Anyone known in the gamemode gets a row even if they've never played that
  sub-mode (flagged `mode` in the table's **Data** column), so a brand-new
  sub-mode can be ranked before its first tournament — those rows take their
  Expected Rank from the whole gamemode as the closest available baseline.
- **Expectation** — `Expected Rank − Set Rank`, scored with the thresholds in
  `lib/expectation.ts` and shared with the match Guess Rate table's Expectation
  column, so the two views can never disagree about a player. Players without a
  Set Rank show `—` rather than a verdict.

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
   games to compute one from.
3. **Pasted table** — only a `rank: name, name` table pasted into the Ranks
   box (`11: karira, patt`), for one-off drafts outside the saved ladders.

Whichever source is selected, the Ranks box still works as a per-tournament
override on top of it, and only names actually listed can enter the draft
(see `mergeHiddenRanks` in `lib/balance.ts`).

Player identity is the normalized username (the same identity stats aggregate
by), reconciled by two layers of name mapping: a match's own `renames` map, which
fixes that one tournament's roster paste, and the global **aliases** above, which
reconcile the same person across every tournament. A match's renames win where
the two disagree — they're the more specific statement, made against that
match's raw JSON.

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
