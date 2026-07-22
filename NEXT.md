# Backend integration checklist

What each adapter interface needs from the Supabase + Raspberry Pi backend.
Work through it adapter by adapter — the UI does not change.

## How the swap works

1. Create `src/adapters/supabase/` with one file per adapter, each implementing
   the matching interface from `src/adapters/types.ts`.
2. In `src/adapters/index.ts`, build a `liveAdapters` object and return it from
   `selectAdapters()` when `dataMode === 'live'` (the fallback and its warning
   come out at the same time).
3. Set `VITE_DATA_MODE=live`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   in the Vercel project, then redeploy.

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

## 1. `RedditAdapter`

`listPending()` · `refresh()` · `setTriageState(id, state)`

**Table `reddit_posts`**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `reddit_id` | text unique | dedupe key for the worker's upsert |
| `username` | text | |
| `snippet` | text | |
| `subreddit` | text | |
| `permalink` | text | |
| `posted_at` | timestamptz | |
| `matched_keywords` | text[] | |
| `triage_state` | text | `pending` \| `saved` \| `ignored`, default `pending` |

**Operations**
- `listPending` — `select * where triage_state = 'pending' order by posted_at desc`.
- `refresh` — the browser cannot scrape Reddit. Either (a) re-run `listPending`
  and let the Pi's schedule do the fetching, or (b) `POST` to a trigger endpoint
  on the Pi, wait, then re-select. Start with (a). Report a `SourceStatus` on
  success only, so a failed run does not overwrite "last synced".
- `setTriageState` — `update ... returning *`.

**Index** `(triage_state, posted_at desc)`.
**Worker** upserts on `reddit_id` so a re-crawl never resurrects a triaged post.
**Realtime** worthwhile — the pending badge in the tab strip updates live.

## 2. `ManualLeadsAdapter`

`list()` · `create()` · `update(id, patch)` · `delete(id)`

Owns the **entire** pipeline — manual entries and leads promoted from Reddit.

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

## 9. `StatusAdapter`

`list()` · `report(status)`

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
