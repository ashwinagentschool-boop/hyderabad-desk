# Hyderabad Desk

A mobile-first lead and market dashboard for a Hyderabad real-estate agent.
Reddit buying-intent triage, a unified lead pipeline, project inventory, market
news, and a rule-based assistant that answers from the agent's own data.

**Live:** https://hyderabad-desk.vercel.app

**The Reddit slice is live.** Four adapters — Reddit, leads, settings and the
source heartbeat — run on Supabase, fed by a Python worker on a Raspberry Pi
that fetches Reddit and classifies every post with the Claude API. The other
four tabs (Projects, Twitter, News, Insta, Pad, Chat) are still on mock
adapters. Selection is per adapter and driven by `VITE_DATA_MODE`; with it
unset the whole app runs on mock exactly as the first phase did, which is what
keeps the current production deploy working until the environment variables are
added. See [worker/PI_SETUP.md](./worker/PI_SETUP.md) for the Pi, and
[NEXT.md](./NEXT.md) for the tabs still to migrate.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. No `.env` file is needed.

### Other scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the built `dist/` exactly as a static host would |
| `npm run typecheck` | Types only, no bundle |
| `npm run lint` | oxlint over `src/` |

Verify a release candidate the same way CI would:

```bash
npm run build && npm run preview
```

## The eight tabs

| Tab | What it does |
| --- | --- |
| **Reddit** | Triage queue of posts the worker classified with the Claude API. Each card leads with a one-sentence summary, a category chip and a lead-potential badge; filter by both. Save (opens a lead form pre-filled from the classifier), ignore, or open on Reddit. Editable subreddit watchlist the Pi obeys on its next run. |
| **Manual** | The unified pipeline — every lead, manual or Reddit-sourced. Filter by source and status, search, add/edit, quick status change. Overdue follow-ups pin to the top on a coral card. |
| **Projects** | Read-only inventory synced from the agent's sheet. Search plus area, budget-band and possession filters. |
| **Twitter** | Posts from a watched handle list. Best-effort, clearly labelled as not a live timeline. |
| **News** | Last 24 hours of Hyderabad property coverage. One tap saves a headline to the Pad. |
| **Insta** | Paste-to-save post links, plus best-effort account watching. |
| **Pad** | Scratchpad for links and notes with auto link detection, tagging, and search. |
| **Chat** | Asks questions of the real project and lead stores — area, budget, possession, lead status, overdue follow-ups, lead↔project matching, and side-by-side project comparison. |

The collapsible **System** strip in the header shows each source's last run and
whether it succeeded.

## Architecture

The UI never touches storage or the network. Everything goes through the
interfaces in `src/adapters/types.ts`:

```
src/
  adapters/
    types.ts          all entity + adapter interfaces (the backend contract)
    index.ts          picks each adapter from VITE_DATA_MODE (per adapter)
    mock/             the only frontend code allowed to touch localStorage
    supabase/         the live Reddit / leads / settings / status adapters
  components/         design-system primitives
  tabs/               one file per tab
  lib/                pure formatting helpers
  auth.ts             Supabase Auth session state (live mode only)
  store.ts            Zustand store — the sole consumer of the adapter layer

supabase/
  schema.sql          idempotent schema, run in the SQL editor
worker/               Python worker for the Pi (own README: PI_SETUP.md)
  fetch_reddit.py     the entrypoint the systemd timer runs
  lib/                classify.py (Claude) + db.py (supabase-py)
  systemd/            oneshot service + 2-hourly timer
```

Adapter selection is **per adapter**. In live mode the Reddit, leads,
settings and status adapters come from `src/adapters/supabase/`; everything
else stays mock. Live mode with missing or placeholder Supabase variables
falls back to mock with a console warning rather than white-screening.

Two rules keep the swap to a real backend mechanical:

1. **Components and tabs import only types from `adapters/`,** never an
   implementation. They read and write through `useStore`.
2. **`src/adapters/mock/_util.ts` is the only module that references
   `localStorage`.** Verify at any time:

   ```bash
   grep -rn "localStorage" src/ | grep -v "adapters/mock/_util.ts"   # → no output
   grep -rn "\bfetch(" src/components src/tabs                       # → no output
   ```

Mock adapters behave like a real backend: fetch-style calls take 400–900 ms and
fail about 5% of the time, so the loading and retry states are exercised in
normal use. User-owned data (leads, pad, Instagram saves, settings) is never
subject to simulated failure.

## The backend (Reddit slice)

A Raspberry Pi runs `worker/fetch_reddit.py` on a systemd timer every two
hours. Each run:

1. reads the watched subreddit list from the `settings` table (the agent
   edits it in the app; the Pi obeys on the next run, no redeploy);
2. fetches `/new.json` for each subreddit;
3. **dedupes against the database before classifying**, so every post costs
   exactly one Claude call in its lifetime;
4. classifies the genuinely-new posts with Claude Haiku into a category, a
   one-sentence summary, a lead-potential rating, and any areas / budget /
   property type it can extract;
5. inserts them (it never touches `triage_state` — triage is the browser's);
6. writes one `fetch_logs` heartbeat row.

The browser only reads what the worker wrote and writes back triage
decisions. It never scrapes Reddit and never writes the heartbeat, so
"synced 12m ago" always means the Pi actually ran. New posts appear without
a manual refresh via a 60-second poll while the Reddit tab is open.

### Reddit access (no credentials)

The worker fetches the **public** `https://www.reddit.com/r/{sub}/new.json`
endpoint — no Reddit account, no API key, no OAuth. Every request goes
through one shared session carrying a descriptive User-Agent, because
Reddit 403s the default python-requests / curl / PowerShell User-Agents.
A 403 on `www.reddit.com` retries once on `old.reddit.com`; a 429 honours
`Retry-After` then backs off 30s and 60s before skipping that subreddit.

**Verify connectivity on a new machine** before scheduling anything. First
the raw request, which should print JSON (not a block page):

```powershell
# Windows / PowerShell
Invoke-RestMethod -Uri "https://www.reddit.com/r/hyderabadrealestate/new.json?limit=5&raw_json=1" -UserAgent "hyderabad-desk/1.0 (personal dashboard)"
```
```bash
# Raspberry Pi / bash
curl -s -A "hyderabad-desk/1.0 (personal dashboard)" "https://www.reddit.com/r/hyderabadrealestate/new.json?limit=5&raw_json=1" | head -c 500
```

Then the worker's own path, which is the check that actually matters (it
uses the exact session and User-Agent the scheduled run uses):

```bash
python fetch_reddit.py --test-fetch          # prints HTTP status, post count, first title
```

`--test-fetch` touches no database and makes no LLM call. A `200 OK` with a
post count means the scheduled runs will fetch fine on that machine. A 403
here (with the User-Agent set) means an IP-level or TLS-fingerprint block,
not a code problem — the message says so.

Live mode is gated behind Supabase Auth (email + password). The single user
is created by hand in the Supabase dashboard; there is no signup in the app.

Full setup is in [worker/PI_SETUP.md](./worker/PI_SETUP.md); the schema is
[supabase/schema.sql](./supabase/schema.sql).

### The service_role key

The worker authenticates with the Supabase `service_role` key, which
bypasses row-level security. It lives only in `worker/.env` on the Pi. It
must never appear in the frontend, in a `VITE_*` variable, or in the Vercel
project — the browser uses the public `anon` key, and RLS is what protects
the data.

## Deploying to Vercel

The app is a static SPA. `vercel.json` rewrites every route to `/index.html`, so
refreshes and deep links never 404.

### Path A — Vercel CLI

```bash
npm i -g vercel
vercel login

vercel          # first run links the project, then deploys
vercel --prod   # subsequent production deploys
```

> **Project name.** Vercel derives it from the directory name and rejects
> uppercase. This repo lives in `C:\July21`, so `vercel` fails with a 400 until
> the project is linked with an explicit lowercase name:
>
> ```bash
> vercel link --yes --project hyderabad-desk
> ```

On the first `vercel` run, accept the detected settings:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

> **Deployment Protection.** On a team with Vercel Authentication enabled, the
> generated `*-<hash>-<team>.vercel.app` deployment URLs sit behind an SSO login
> and will look "broken" to anyone not signed in. The clean project alias —
> `hyderabad-desk.vercel.app` — is public and is the URL to share. To open up
> the per-deployment URLs too, turn off Settings → Deployment Protection.

### Path B — Git + the Vercel dashboard

1. Push this repository to GitHub:

   ```bash
   git remote add origin git@github.com:<you>/hyderabad-desk.git
   git push -u origin main
   ```

2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Confirm the settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy. Every later push to `main` ships to production; pull requests get
   their own preview URLs.

### Environment variables

Three, all public and `VITE_`-prefixed. Leave them unset and the app runs on
mock adapters, which is what the current production deploy does.

| Variable | Value |
| --- | --- |
| `VITE_DATA_MODE` | `live` to use Supabase for the Reddit slice; unset (or anything else) means mock |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → anon / publishable |

To go live: add all three in the Vercel project (Settings → Environment
Variables) and redeploy. No code changes — `src/adapters/index.ts` selects
each adapter from `VITE_DATA_MODE`, falling back to mock if the Supabase
variables are missing.

> **Never** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel or any `VITE_`
> variable. It bypasses row-level security and belongs only on the Pi.

Locally, copy `.env.example` to `.env.local` and fill in the same three
values. Both real env files (`.env.local`, `worker/.env`) are gitignored;
their `.example` counterparts are tracked.

## Phone home screen

The app ships a manifest, maskable icons, a theme colour that follows light and
dark mode, and `apple-mobile-web-app-capable`. "Add to Home Screen" on iOS or
Android gives a full-screen, chrome-free app.

## Notes

- Dark mode follows the OS (`prefers-color-scheme`). There is no manual toggle.
- Layout targets 375 px one-handed use; 320 px is supported and the card grid
  goes multi-column at 700 px.
- Assumptions and trade-offs are recorded in [DECISIONS.md](./DECISIONS.md).
