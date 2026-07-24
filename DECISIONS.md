# Decisions and assumptions

Every judgement call made while building the frontend phase, and why. Nothing
here was confirmed with the user — these are the defaults I chose so the build
could finish autonomously.

## Architecture

**The Zustand store is the only consumer of the adapter layer.**
The brief says the UI must never read storage or fetch directly. Rather than
let each tab call adapters itself, all adapter access lives in `src/store.ts`.
Tabs read slices and call actions. This makes the invariant one grep instead of
a convention, and gives cross-tab reactivity for free — saving a Reddit post
updates the Manual pipeline because both read the same `leads` slice.

**`activeTab` persists through Zustand's `persist` middleware, not an adapter.**
The active tab is a UI preference, not user data destined for Supabase, so it
does not belong in the backend contract. `persist` also hydrates synchronously,
so a reload restores the tab with no flash of the wrong panel — an async adapter
read could not. This is the single deliberate exception to "storage only in the
adapter layer"; no application source file names `localStorage` (the middleware
does it internally), so the grep-proof check still passes.

**One `AdapterError` type, thrown only by fetch-style calls.**
User-data adapters (leads, pad, insta, settings) never fail randomly. Losing a
lead the agent just typed to a simulated 5% blip would be user-hostile, and the
brief asks for simulated failure specifically so error/retry UI is real — which
only applies to remote fetches.

**Adapters call each other for status reporting.**
`redditAdapter.refresh()` writes a `SourceStatus` through `statusAdapter` on
success only. A failed run leaves the previous "last synced" intact, which is
how a real worker heartbeat behaves. The alternative — having the store report
status — would put backend bookkeeping in the UI layer.

**`chatAdapter.ask()` retries the projects fetch once internally.**
Chat composes two adapter reads, so with a 5% failure rate one in twenty
questions would fail for reasons the user cannot act on. A server-side retry is
what a real endpoint would do. The single async call signature is unchanged, so
a live LLM endpoint drops in untouched.

**`VITE_DATA_MODE=live` falls back to mock with a console warning.**
The live adapters do not exist yet. Flipping the flag early logs a warning and
keeps working rather than white-screening.

## Data

**`manualLeadsAdapter` owns the whole pipeline, not just manual leads.**
The name comes from the brief, but the Reddit tab promotes posts through the
same adapter with `source: 'reddit'`. One table, one list, one set of filters.
Renaming it would have broken the specified file layout.

**Seed data appears only on genuinely first use.**
`readSeeded` distinguishes "key absent" from "key present but empty", so leads
the agent deletes stay deleted instead of reappearing on reload.

**Reddit triage state persists; project inventory does not.**
Triage is a user decision, so ignored and saved posts stay resolved across
reloads. Projects are read-only upstream data, served fresh from a constant.

**Prices are strings, parsed on demand.**
The models specify `priceFrom: string` ("2.4 Cr", "68 L"), matching a Google
Sheet. Budget filtering and chat parse these into lakhs at query time rather
than storing a parallel numeric field the backend contract does not define.

**Seed content is plausible, not real.**
Project names, builders, prices, headlines and Reddit posts are realistic for
the Hyderabad western corridor but invented. Nothing should be quoted to a
client.

**One seeded lead is deliberately overdue and one is due today.**
Otherwise the coral overdue card — a specified design element — would never
appear on a fresh install.

## Design system rewrite (taste-skill pass)

The visual layer was rebuilt against the `design-taste-frontend` skill.
Adapters, store, types and data models were not touched, so the backend
contract in NEXT.md still holds exactly.

**The skill puts dashboards out of scope, and I followed its own instruction
for that case.** Section 13 says landing pages and portfolios, not dashboards,
and tells the agent to say so and apply only the parts that fit. So the
typography, colour, materiality, interactive-state, accessibility, dark-mode
and anti-tell rules were applied in full. The landing-page furniture was not:
no hero, no bento grid, no marquee, no scroll hijack, no logo wall. An agent
checking overdue follow-ups between site visits does not need a scroll-pinned
hero, and Section 4.8's "even minimalist sites need real images" is a rule
about marketing pages, not a lead pipeline.

**Dials: `DESIGN_VARIANCE 4` / `MOTION_INTENSITY 3` / `VISUAL_DENSITY 6`.**
Reasoned from the read, not the 8/6/4 baseline. Low variance because
scannability beats surprise when the same screen is opened forty times a day.
Low motion because the skill's own guidance is to drop the dial and ship a
clean static page rather than half-build animation; transitions and press
states are the whole motion budget. Density 6 because the content is dense but
has to survive 375px.

**Colour law: the interface is achromatic, hue means something.**
Provenance badges (Reddit coral, Manual purple, Sheet teal), status pills and
the health dot carry the only colour in the app. Nothing is tinted for
decoration. This satisfies the Color Consistency Lock in a way a fourth
"brand accent" hue would not, and it is the right call for an operator tool:
if the agent sees colour, it means something.

**Typography: Geist + Geist Mono, self-hosted via `@fontsource-variable`.**
The skill discourages Inter as a default and bans linking Google Fonts in
production. Mono is applied only to values the agent compares down a column:
money, phone numbers, sqft ranges, counts. It is deliberately NOT applied to
relative times like "39m ago", where monospacing the word "ago" just stretches
prose. Tabular figures (`font-feature-settings: 'tnum'`) make prices align
across cards in the desktop grid.

**Shape law: three radii, documented and enforced.** Surfaces 14px, controls
10px, pills full. The previous build had a stray 4-value scale (9/11/12/full),
which the Shape Consistency Lock treats as broken.

**Icons: Phosphor, replacing 14 hand-rolled SVG paths.** Section 3.C bans
hand-rolled icon paths outright. One family, one weight, one wrapper component
with an unchanged call signature.

**Zero em-dashes.** Section 9.G is a binary ban and it was the single most
violated rule in the previous build (55 instances). All visible copy was
rewritten. The one surviving en-dash is inside a regex character class in
`chatAdapter`, which parses budget ranges the agent may have typed by hand; it
is never rendered. Rewriting copy mechanically introduced one broken sentence
("has nothing in Kokapet lands inside that budget"), caught by the skill's
Copy Self-Audit and fixed.

**The header is opaque, not frosted.** It was briefly `bg-bg/85` with
`backdrop-blur`. Section 5 calls glassmorphism inappropriate for dashboards,
and it is: it puts moving content behind small labels read in sunlight.

**Desktop header collapses to one row at 960px.** Brand, tabs and health share
a 61px bar, under the skill's 80px nav cap. Below 960px it stacks into two
rows, because eight tabs plus a brand plus a status label do not fit.

**Separators were removed from the lead card meta row.** At 375px that row
wraps, and a trailing middle-dot orphaned at the end of a line reads as a bug.
Weight and colour carry the hierarchy instead, which also reduces middle-dot
usage the skill rations.

**Chat suggestion chips were shortened.** "Compare Sattva Lakeridge and Vertex
Panache" wrapped to two lines inside its own pill, which the CTA Button Wrap
Ban treats as a fail. "Compare two projects" fits one line and still routes to
the compare branch, which answers by listing what is available to compare.

**Contrast was measured, not eyeballed.** Every text/background pair on every
tab was computed in both themes. Three real failures were found and fixed: the
faint tier failed on the coral overdue card (4.36:1), the overdue rule colour
failed against the card it sits on (4.15:1, darkened to `#b34e30`), and the
translucent header made header text unmeasurable. Two reported failures were
false positives from `oklab` alpha compositing and from measuring mid-transition.

## Design

**Base CSS lives in `@layer base`.**
Unlayered CSS outranks every Tailwind utility. An unlayered
`button { color: inherit }` silently beat `text-accent-ink` and painted primary
button labels black-on-black. Layering the resets fixes it at the root.

**Secondary text is darker than a typical "muted" grey.**
`--c-text-muted` and `--c-text-faint` were tuned until every piece of real text
clears WCAG AA (4.5:1) on white, on the sunken surface, and on the coral overdue
card, in both themes. Timestamps and card metadata are content, not decoration.
The `·` separators are the only sub-4.5 glyphs left, and they are marked
`aria-hidden` as pure decoration.

**Full-bleed rows and card grids declare `grid-cols-[minmax(0,1fr)]`.**
An implicit grid track grows to its widest item's min-content, so a full-bleed
chip row or a wide card pushed the whole page sideways. The explicit column
caps the track. `html { overflow-x: hidden }` is a second line of defence, not
the fix.

**The status pill is the quick status control.**
Showing a read-only pill *and* a separate status dropdown on the same lead card
displayed the same value twice. The pill is a styled `<select>` carrying the
status tint, so the colour coding survives and the card stays quiet.

**Dark mode is OS-driven only.**
The brief specifies `prefers-color-scheme`. A manual toggle would need its own
persisted preference and a third state ("follow system"), which is scope the
brief did not ask for.

**Tap targets are 44 px; chips and inline controls are 34 px.**
Strict 44 px everywhere would make filter-chip rows enormous on a 375 px screen.
Chips sit in scrollable rows with generous horizontal padding, and every
primary action — buttons, form fields, tab pills — meets 44 px.

**Destructive actions confirm inline, not in a dialog.**
Delete arms on first tap and commits on second, disarming after four seconds.
One-handed use makes a modal confirm for a routine action heavy, and a modal
would fight the card layout.

## Chat

**The rule engine is real, not canned.**
`chatAdapter.ask()` reads the live projects and leads stores and answers by
filtering them. It handles area, budget ceilings ("under 1.5 Cr"), possession,
RERA, lead status, overdue follow-ups, lead↔project area matching within budget,
and two-project comparison. Unrecognised questions return a capability list
rather than a wrong answer. Every count in every answer is computed, so it stays
correct as the agent's data changes.

**Chat history persists.**
Consistent with the pad and the pipeline, and it means the context line and
transcript survive a reload.

## Scope

**No routing library.**
Tab state is a single store value. Adding React Router for eight panels would
mean a dependency and a URL scheme the brief never asked for. `vercel.json`
still rewrites all routes to `/index.html` so a deep link or refresh cannot 404.

**No test suite.**
The brief lists acceptance criteria to verify, not tests to write. Verification
was done against a real headless browser: all eight tabs at 375/320/1280 px,
both colour schemes, contrast measured numerically, the cross-tab save flows,
persistence across reload, the simulated-failure retry path, and the production
build served statically.

**oxlint over ESLint.**
It came with the Vite scaffold, runs in ~10 ms, and reports zero warnings.

---

# Reddit backend milestone (Supabase + Pi + LLM classification)

Judgement calls made while taking the Reddit slice live. As above, nothing
here was confirmed with the user first.

## Layout

**The worker and schema live in this repository, not a sibling one.**
`worker/` and `supabase/` sit next to the frontend. They share one version
history with the adapter interfaces they implement, so a change to
`RedditPost` and the change to `reddit_posts` land in the same commit and
can never drift apart. Vite only bundles `src/`, and `tsconfig.app.json`
only includes `src/`, so neither directory touches the frontend build.
Vercel ignores them entirely. On the Pi, `git pull` updates the worker.

## Schema

**`settings` is key/value jsonb, not one wide row.**
The spec asked for it, and it earns its keep: adding a setting is an
insert, not a migration, and the worker reads exactly the one key it needs
rather than a row that grows every time the frontend does.

**Four settings keys are seeded, not two.**
The spec named `subreddits` and `keywords`. `twitter_handles` and
`insta_accounts` are seeded too, because the Twitter and Insta tabs are
still on mock adapters but read their watchlists through the same
`Settings` object. Without those rows, live mode would show two tabs with
empty watchlists for no reason the agent could see.

**`keywords` is seeded empty and has no UI.**
Classification replaced keyword matching outright: every new post goes to
the model, which reads intent rather than matching words. The column stays
because the spec asked for it, but a keyword editor in the app would imply
the worker uses it, which it does not. The Reddit settings panel now says
so in one line.

**`revoke all ... from anon` on top of RLS.**
RLS with no anon policy already returns zero rows, but a `revoke` fails
loudly instead of silently returning `[]`. When the anon key ships inside
a public JavaScript bundle, "loud" is the property worth having.

**No `fetch_logs_latest` view.**
NEXT.md proposed one because Postgrest has no `distinct on`. The adapter
reads the newest 50 rows and folds them to one per source instead. That is
exact while only one source writes, stays cheap when more do, and avoids a
view whose security semantics (definer vs invoker) are another thing to
get right under RLS.

**`updated_at` moves via a database trigger, not the client.**
The pipeline sorts on it. A browser clock that is a few minutes fast would
pin an old lead to the top of the list forever.

## Worker

**Dedupe strictly before classification.**
The single most important ordering decision in the worker. Reddit ids are
collected, checked against the table, and only genuinely new posts reach
the model. Every post therefore costs exactly one LLM call in its
lifetime, no matter how often the timer fires or how far back `/new.json`
reaches.

**Plain `insert`, never `upsert`.**
An upsert would be the obvious way to make a re-crawl idempotent, and it
would be wrong: it could overwrite `triage_state` on a post the agent had
already saved or ignored. Rows are new by construction after the dedupe
step, and `reddit_id` is unique, so a genuine race surfaces as an error
rather than as silent data loss.

**A failed classification is stored, not dropped.**
After one retry, a post is written with `category='other'`,
`summary=title`, `lead_potential='none'`. An unclassified lead sitting in
the queue is recoverable by a human in two seconds; a silently discarded
one is gone. The run message reports how many fell back.

**Enum values are validated client-side before insert.**
The columns have CHECK constraints, so one hallucinated `category` would
reject the entire insert batch. `_coerce` clamps every enum to a legal
value and degrades the rest, so one bad item costs one item.

**`market_discussion` and `other` are forced to `lead_potential='none'`.**
The prompt says so, but the code enforces it. A post about price trends is
not a person to call, and the agent should never see a "Hot" badge on one.

**Haiku 4.5 at temperature 0.**
Short structured extraction against a fixed rubric, not a reasoning
problem. Temperature 0 so the same post classifies the same way twice, and
the cheapest current model because this runs on every new post forever.
Batching ten posts per call amortises the system prompt, which is longer
than most of the posts.

**Exactly one `fetch_logs` row per run, written in a `finally`.**
The heartbeat is the only evidence the Pi is alive. A run that throws
still logs, with the exception type and message, because "the worker
crashed" and "the worker never started" look identical from the app
otherwise.

**`--dry-run` works before the credentials exist.**
With no `SUPABASE_URL`, a dry run warns and falls back to a built-in
subreddit list rather than failing. That makes the smoke test in
PI_SETUP.md runnable the moment the repo is cloned, which is when it is
most useful. A real run without credentials still exits 1.

**Retention deletes ignored posts at 30 days and pending at 60.**
Saved posts are never auto-deleted: the agent kept them on purpose, and a
lead may still point back at one.

**Subreddits are stored bare, without the `r/` prefix.**
The settings row, the API path and the database column all agree; only the
UI adds `r/`. The worker still tolerates a hand-typed `r/hyderabad` so a
manual edit does not produce silent 404s.

## Frontend

**Adapter selection is per adapter, not all-or-nothing.**
`selectAdapters()` returns the mock set with four entries replaced. The
still-mock tabs keep working unchanged, and moving the next source is a
one-line edit in one file.

**Live mode with missing credentials falls back to mock, loudly.**
`liveEnabled` requires both `VITE_DATA_MODE=live` and a real-looking URL
and key. A half-configured deploy is then a working demo with a console
warning, not a white screen. This is also what keeps the current Vercel
production deploy unaffected until the three variables are added.

**The browser never writes `fetch_logs`.**
`refresh()` in the live Reddit adapter is a re-read, not a crawl — the
browser cannot scrape Reddit, and the Pi's timer owns fetching. The live
status adapter's `report()` is a no-op for Reddit. If the browser could
write the heartbeat, "synced 2m ago" would mean "someone opened the app",
which is exactly the thing the strip exists to distinguish.

**The status strip merges live and mock sources.**
Reddit reads real `fetch_logs`; the other four still read the mock status
store, because their adapters are still mock and still report there. A
live source with no row yet shows "never run" rather than borrowing a mock
entry — the strip may never claim the Pi is healthy when it has not run.

**60-second polling, not Supabase realtime.**
The worker writes every two hours, so a one-minute poll is never
meaningfully behind. It is one cheap indexed select against a short list,
with no websocket to keep alive, no `supabase_realtime` publication to
remember to add to the schema, and no dropped-connection failure mode that
looks like "nothing is happening". Polling only runs while the Reddit tab
is visible, and fires immediately when the tab is returned to.

**The background poll never sets `loading` or `error`.**
`pollReddit` writes items straight into the slice. A poll that flashed a
skeleton over a list mid-triage, or replaced it with a retry card on one
dropped packet, would be worse than not polling. The explicit Refresh
button still surfaces failures.

**"Save lead" opens the form pre-filled; it does not save immediately.**
The classifier supplies name, requirement, budget, area and property type,
and it can be wrong. A review step costs one tap and keeps a hallucinated
budget out of the pipeline. Extra areas beyond the first go into the notes
field rather than being dropped.

**The lead form moved to `components/LeadModal.tsx`.**
Both the Pipeline tab and the Reddit tab open it. The Reddit tab passes a
prefill and its own `onSubmit`, so saving also marks the post triaged in
the same action. Provenance (`source`, `redditPermalink`, `subreddit`) is
set by the store, not by the form, so the form cannot be used to fake a
Reddit-sourced lead.

**The summary is the card; the original post is one tap away.**
The classifier writes one sentence for exactly this reading situation. The
raw title and body sit behind a disclosure, because the summary can be
wrong and the agent needs the author's own words before making a call.

**`lead_potential: 'none'` renders no badge at all.**
It is the majority of a busy feed. A badge on half the cards saying "not a
lead" is noise; absence says it just as clearly.

**Coral means "hot" in this tab.**
Every post here came from Reddit, so there is no provenance badge
competing for coral, and temperature is the one judgement worth reading at
arm's length. True red stays reserved for a lost lead. The category chip
is deliberately achromatic — it names a kind, it does not rank urgency.

**The mock Reddit store key moved to `reddit-posts-v2`.**
The row shape changed. Reusing the key would have rendered cards with no
summary for anyone with the old data in localStorage.

**Auth is a login gate with no signup.**
The single account is created by hand in the Supabase dashboard, so a
public anon key cannot be used to mint new ones. `supabase-js` owns the
session in browser storage; no application module names `localStorage`, so
the original grep-proof invariant still passes.

**The bundle grew from ~380 kB to ~530 kB raw (~150 kB gzipped).**
That is `@supabase/supabase-js`. Worth it for auth plus a typed Postgrest
client; if it ever matters, the login screen is the obvious split point.

## Found during live verification

**A run where every subreddit fails now logs `error`, not `ok`.**
Live testing caught this: with all three subreddits returning 403, the
worker fetched nothing but still wrote `status: ok`, so the health dot went
green and the strip said "synced just now" when the worker had reached
nothing. A partial failure (some subs worked) is still a healthy run and
stays `ok`; only an all-subreddits failure flips to `error`. The process
still exits 0 in that case, so systemd does not restart-loop over what is
usually transient rate-limiting — the `fetch_logs` error row carries the
signal, matching the "don't spam the journal" note in the service unit.
