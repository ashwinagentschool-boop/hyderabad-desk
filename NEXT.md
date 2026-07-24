# Backend integration checklist

What each adapter interface needs from the Supabase + Raspberry Pi backend.
Work through it adapter by adapter — the UI does not change.

## Status

**Done (this milestone).** Reddit, leads, settings and status are live on
Supabase, fed by the Pi worker in `worker/`. Their sections below are kept
for reference and marked **✅ built** — read `src/adapters/supabase/` for the
actual code and `DECISIONS.md` for where the build diverged from the plan
below (the two biggest: classification replaced keyword matching, and the
status adapter folds `fetch_logs` client-side instead of using a
`fetch_logs_latest` view).

**Still mock.** Projects, Twitter, News, Insta, Pad, Chat. Their sections are
the plan for when you migrate them.

## How the swap works

1. Add a file to `src/adapters/supabase/` implementing the matching interface
   from `src/adapters/types.ts` (the four live ones are there as a template).
2. In `src/adapters/index.ts`, add it to the object `selectAdapters()` returns
   in live mode. Selection is per adapter — the still-mock ones keep working.
3. The three `VITE_` variables are already in place once the Reddit slice is
   live; a newly-migrated adapter needs only its Supabase table.

Nothing in `src/components/`, `src/tabs/` or `src/store.ts` needs editing. The
store already treats every call as async and already handles loading, error and
retry for each slice.

### Contract rules to preserve

- Every method stays `async` and returns the same shapes.
- Timestamps are ISO 8601 strings (`created_at` → `createdAt`). `followUpDate`
  is a bare `YYYY-MM-DD` date, not a timestamp — overdue comparison is a string
  compare against local today.
- Optional fields must be `undefined` when absent, not `null`. Postgres returns
  `null`; map it at the adapter boundary or the "field is set" checks in the UI
  will render empty rows.
- Reject with an `Error` (ideally `AdapterError`) on failure. The store puts the
  message straight into the retryable error card, so it should be readable by a
  human.

### Cross-cutting

- **Auth.** Single-user today. Add a `user_id` column to every user-owned table
  now, defaulting to `auth.uid()`, so multi-device sync later is a migration and
  not a redesign.
- **RLS.** Enable row-level security on every table before going live; the anon
  key ships in the browser bundle.
- **Writer split.** The Pi worker writes source data (`reddit_posts`, `tweets`,
  `news_items`, `projects`, `fetch_logs`) with the service-role key. The browser
  writes user data (`leads`, `pad_entries`, `insta_entries`, `settings`) with
  the anon key. Grant accordingly.
- **Realtime.** Optional everywhere. Where it helps, subscribe and push into the
  existing store slice — the shapes already match.

---

## 1. `RedditAdapter` — ✅ built

`listPending()` · `refresh()` · `setTriageState(id, state)`
Live: `src/adapters/supabase/redditAdapter.ts`. Worker: `worker/`.

**What shipped differs from the original plan in one big way:**
classification replaced keyword matching. `matched_keywords` is gone; the
worker sends every new post to Claude, which files it into a `category`, a
one-sentence `summary`, a `lead_potential`, and any `areas` / `budget` /
`property_type` it can extract. The card leads with the summary and the
badge, not a list of matched words.

**Table `reddit_posts`** (as built — see `supabase/schema.sql`)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `reddit_id` | text unique | dedupe key; checked **before** classification |
| `username` | text | stored with the `u/` prefix |
| `title` / `body` | text | the raw post, shown behind a disclosure |
| `subreddit` | text | bare name, no `r/` |
| `permalink` | text | |
| `posted_at` / `fetched_at` | timestamptz | |
| `category` | text (check) | the six `RedditCategory` values |
| `summary` | text | the card's main line |
| `lead_potential` | text (check) | `hot` \| `warm` \| `cold` \| `none` |
| `areas` | text[] | pre-fills the lead form |
| `budget` / `property_type` | text | |
| `classified_at` | timestamptz | |
| `triage_state` | text (check) | `pending` \| `saved` \| `ignored`, default `pending` |

**How it actually works**
- `listPending` — `select ... where triage_state = 'pending' order by posted_at desc`.
- `refresh` — a re-read, not a crawl. The browser can't scrape Reddit; the
  Pi's timer owns fetching. It does **not** report a `SourceStatus` — only the
  worker writes `fetch_logs`.
- `setTriageState` — `update ... select single`.
- **Worker does a plain `insert`, never an upsert** — an upsert could
  overwrite `triage_state` on a saved/ignored post. Rows are new by
  construction because dedupe runs first.
- **Freshness** is a 60s poll while the tab is open, not realtime — see the
  reasoning in `DECISIONS.md`. Realtime is still a clean future swap: the
  shapes already match.

## 2. `ManualLeadsAdapter` — ✅ built

`list()` · `create()` · `update(id, patch)` · `delete(id)`
Live: `src/adapters/supabase/manualLeadsAdapter.ts`.

Owns the **entire** pipeline — manual entries and leads promoted from Reddit.
Built as specified below. `updated_at` is bumped by a database trigger
(`leads_set_updated_at`), not the client; `follow_up_date` is a bare date and
is sliced to `YYYY-MM-DD` at the adapter boundary; optional fields map `null`
to `undefined` on read and empty-string to `null` on write.

**Table `leads`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `source` | text | `reddit` \| `manual` |
| `name` | text not null | |
| `phone` | text | |
| `requirement` | text not null | |
| `budget` | text | display string, e.g. `1.3 - 1.5 Cr` |
| `area` | text | |
| `status` | text not null | the six `LeadStatus` values |
| `follow_up_date` | date | **date, not timestamptz** |
| `notes` | text | |
| `reddit_permalink` | text | |
| `subreddit` | text | |
| `created_at` / `updated_at` | timestamptz | |

**Operations**
- `list` — `order by updated_at desc`. Overdue pinning and filtering happen
  client-side; the working set is small.
- `create` — return the inserted row; the store prepends it optimistically.
- `update` — must bump `updated_at` (trigger or explicit set) and return the row.
- `delete` — hard delete. Add `deleted_at` instead if the agent should be able
  to undo; the UI's confirm step assumes deletion is final.

**Constraints** check `status` and `source` against their allowed values.
**Index** `(status)`, `(follow_up_date)`.
**Realtime** optional — single user, single device today.

## 3. `ProjectsAdapter`

`list()` · `sync()`

**Table `projects`** — read-only to the browser.

| Column | Type |
| --- | --- |
| `id` | uuid pk |
| `name` | text |
| `builder` | text |
| `area` | text |
| `type` | text |
| `price_from` / `price_to` | text |
| `sqft_range` | text |
| `possession` | text |
| `rera` | boolean |
| `notes` | text |

**Operations**
- `list` — plain select.
- `sync` — trigger the Pi's sheet import, then re-select and report a
  `SourceStatus` for `sheet`. If the import is slow, return the current rows
  immediately and let realtime deliver the update.

**Note** `possession` is matched with `/ready/i` for the "Ready to move"
filter and in chat. Keep the vocabulary stable — free text like `Ready to move`
or `Dec 2027`. If the sheet's wording drifts, add a `possession_status` enum
column and switch the filter to it.

**Grants** select-only for anon; the worker writes with the service key.

## 4. `TwitterAdapter`

`list()` · `fetch(handles)`

**Table `tweets`**: `id`, `handle`, `text`, `posted_at`, `url`, `fetched_at`.

- `list` — most recent first, capped (100 is plenty).
- `fetch(handles)` — filter by the passed handle list, which comes from
  `settings.twitterHandles`. Compare case-insensitively with `@` stripped; the
  UI stores handles with a leading `@`.
- Report a `SourceStatus` for `twitter`.

Scraping is best-effort and the UI says so permanently. Surface a rate-limit
failure as an `error` status with a message — the header strip renders it.
**Dedupe** on tweet id.

## 5. `NewsAdapter`

`list()` · `fetch()`

**Table `news_items`**: `id`, `headline`, `source`, `url`, `published_at`.

- `list` — `where published_at > now() - interval '24 hours' order by published_at desc`.
  The 24-hour window is the tab's stated contract.
- `fetch` — same as `list` plus a `SourceStatus` report for `news`.
- **Dedupe** on `url` — the same story appears across outlets.

The Save-to-pad button writes through `PadAdapter`, so nothing extra is needed
here. The UI dedupes by comparing `PadEntry.content` to the item URL, so pad
entries created from news must store the bare URL as `content`.

## 6. `InstaAdapter`

`list()` · `create()` · `delete(id)` · `fetchAccounts(accounts)`

Two different things behind one interface:

**Table `insta_entries`** (user data, browser writes): `id`, `url`, `account`,
`note`, `saved_at`.
- `list` / `create` / `delete` map directly. This is the reliable half and must
  never fail because a scrape failed.

**`fetchAccounts(accounts)`** (worker data): best-effort scrape results for the
accounts in `settings.instaAccounts`. Either a separate `insta_discovered`
table or a `discovered boolean` flag on the same table. Results are transient —
the UI holds them in a separate slice and only persists what the agent
explicitly saves. Report a `SourceStatus` for `insta`.

Instagram actively blocks automation. Returning an empty array is a normal
outcome and the UI has an empty state for it.

## 7. `PadAdapter`

`list()` · `create()` · `update(id, patch)` · `delete(id)`

**Table `pad_entries`**: `id`, `content` (text), `is_link` (boolean), `note`,
`tag` (`lead` \| `project` \| `news` \| `idea`, nullable), `created_at`.

- `list` — `order by created_at desc`.
- `update` is used only to attach a tag right after creation.
- Link detection stays client-side (`looksLikeLink` in `src/lib/format.ts`); the
  adapter just stores the `is_link` flag it is given.

**Constraint** check `tag` against the four values, allowing null.

## 8. `ChatAdapter`

`history()` · `ask(question)` · `clear()`

The one adapter whose live version is a genuine rewrite rather than a mapping.

**Table `chat_messages`**: `id`, `role` (`user` \| `assistant`), `text`,
`created_at`.

- `history` — `order by created_at asc`.
- `ask(question)` — call the LLM endpoint (Supabase Edge Function, or the Pi),
  persist both the user message and the reply, and **return the assistant
  message only**. The store appends the user message optimistically before the
  call, so returning both would duplicate it.
- `clear` — delete the user's messages.

**Give the model real context.** The mock answers by filtering the actual
projects and leads. The live version should do retrieval — pass the project list
and open leads into the prompt, or expose them as tools — otherwise the
assistant gets *less* useful than the mock it replaced. Worth keeping
`src/adapters/mock/chatAdapter.ts` as a deterministic fallback when the endpoint
is down.

**Latency.** The store shows a "Thinking…" bubble for the whole call and has no
timeout. Add one (~30 s) in the adapter and reject with a readable message.

## 9. `StatusAdapter` — ✅ built (Reddit source only)

`list()` · `report(status)`
Live: `src/adapters/supabase/statusAdapter.ts`.

Built, but as a **hybrid**: Reddit reads the Pi's real `fetch_logs`; the other
four sources still read the mock status store, because their adapters are still
mock. When a source moves to the worker, delete it from the adapter's
`MOCK_SOURCES` list and it starts reading `fetch_logs`. Two divergences from
the plan below: there is **no `fetch_logs_latest` view** (the adapter reads the
newest 50 rows and folds to one per source client-side — `distinct on` isn't
reachable through Postgrest), and the browser's `report()` is a **no-op for
Reddit** (only the worker writes the heartbeat). The columns shipped as
`items_fetched` + `items_classified` rather than a single `items_count`.

## `SettingsAdapter` — ✅ built

Live: `src/adapters/supabase/settingsAdapter.ts`. Section 10 below is the plan;
what shipped uses a key/value `jsonb` table (one row per key), seeds all four
keys in `schema.sql`, and keeps patch semantics via an upsert of only the keys
the caller sent. `keywords` is seeded empty and has no UI — classification
replaced it.

**Table `fetch_logs`** — the Pi's heartbeat, and the reason this adapter exists.

| Column | Type |
| --- | --- |
| `id` | bigserial pk |
| `source` | text (`reddit` \| `news` \| `sheet` \| `twitter` \| `insta`) |
| `status` | text (`ok` \| `error`) |
| `ran_at` | timestamptz |
| `items_count` | int |
| `message` | text |

- `list` — **latest row per source**, not every row:

  ```sql
  select distinct on (source) *
  from fetch_logs
  order by source, ran_at desc;
  ```

  Expose it as a view (`fetch_logs_latest`) so the adapter is a plain select.
- `report` — insert a row. The worker inserts on every run; the browser inserts
  when the user triggers a manual sync. Keep it append-only and let history
  accumulate — it is the only record of whether the Pi is alive.

**Retention** a cron delete beyond 30 days keeps the table small.
**Realtime** the nicest win in the app — the header dot goes red the moment the
Pi fails, with no refresh.

## 10. `SettingsAdapter`

`get()` · `update(patch)`

**Table `settings`** — a single row (`id = 1`, or one row per `user_id`):
`subreddits text[]`, `keywords text[]`, `twitter_handles text[]`,
`insta_accounts text[]`.

- `get` — return the row, or seed defaults on first read so the app is never
  configuration-less.
- `update` — patch semantics: merge the provided keys, leave the rest alone.
  The UI sends one key at a time (`{ subreddits }`).

**This is also the worker's config.** The Pi reads the same row to decide what
to crawl, which is why editing the list in the Reddit tab says "the worker reads
this on its next run". Both sides must agree on normalisation: subreddits are
stored **without** the `r/` prefix, handles and Instagram accounts **with** a
leading `@` (see `normalize` in each `ListEditor` call site).

---

## Suggested order

1. **`settings`** — smallest surface, and the worker needs it before it can
   crawl anything.
2. **`fetch_logs` + `StatusAdapter`** — makes every later step observable.
3. **`projects`** — read-only, no write path to get wrong.
4. **`leads` + `reddit_posts`** — the core loop and the highest-value pair.
5. **`pad_entries` + `insta_entries`** — straightforward user data.
6. **`news_items` + `tweets`** — best-effort sources.
7. **`chat`** — last, since it is worth doing properly and the mock keeps
   working until then.
