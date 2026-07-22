# Hyderabad Desk

A mobile-first lead and market dashboard for a Hyderabad real-estate agent.
Reddit buying-intent triage, a unified lead pipeline, project inventory, market
news, and a rule-based assistant that answers from the agent's own data.

**This phase is frontend-only.** Every screen runs on mock adapters with
`localStorage` persistence. No backend, no API keys, no environment variables.
A Python worker on a Raspberry Pi plus Supabase arrives later and swaps in
behind the same interfaces — see [NEXT.md](./NEXT.md).

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
| **Reddit** | Triage queue of buying-intent posts. Save as a lead, ignore, or open on Reddit. Editable subreddit + keyword watchlist. |
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
    index.ts          picks the adapter set from VITE_DATA_MODE
    mock/             the only code allowed to touch localStorage
  components/         design-system primitives
  tabs/               one file per tab
  lib/                pure formatting helpers
  store.ts            Zustand store — the sole consumer of the adapter layer
```

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

## Deploying to Vercel

The app is a static SPA. `vercel.json` rewrites every route to `/index.html`, so
refreshes and deep links never 404.

### Path A — Vercel CLI

```bash
npm i -g vercel

vercel          # first run: links the project, then deploys a preview
vercel --prod   # promote to production
```

On the first `vercel` run, accept the detected settings:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

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

**None are required, now or for this deploy.** Leave `VITE_DATA_MODE` unset —
unset means `mock`, which is what this phase ships.

When the backend lands, going live is configuration only:

1. In the Vercel project, add `VITE_DATA_MODE=live` plus the Supabase variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
2. Redeploy.

No code changes — `src/adapters/index.ts` selects the adapter set from that
flag. The Supabase implementations are specified in [NEXT.md](./NEXT.md).

## Phone home screen

The app ships a manifest, maskable icons, a theme colour that follows light and
dark mode, and `apple-mobile-web-app-capable`. "Add to Home Screen" on iOS or
Android gives a full-screen, chrome-free app.

## Notes

- Dark mode follows the OS (`prefers-color-scheme`). There is no manual toggle.
- Layout targets 375 px one-handed use; 320 px is supported and the card grid
  goes multi-column at 700 px.
- Assumptions and trade-offs are recorded in [DECISIONS.md](./DECISIONS.md).
