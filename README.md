# EMQ Stats

Next.js app for tracking EMQ team-battle attack/block stats. Two sections:

- **Viewer** (`/`, `/matches/[id]`) — public, lists current + past matches and
  shows the full stats table (Correct / Attacks / Blocks / Effective
  variants), with a click-through modal per player listing every song they
  attacked on and which team it hit.
- **Admin** (`/admin`) — password-protected. Create/edit/delete matches:
  set the team rosters and paste or upload the raw EMQ song-history JSON
  export(s) for that match.

## Data layer

Matches are stored in a `matches` table via [libSQL](https://turso.tech)
(`lib/db.ts` / `lib/store.ts`). No Turso account is required for local dev —
if `TURSO_DATABASE_URL` isn't set, it falls back to a local SQLite file
(`./local.db`) automatically. The schema is created on first use.

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
