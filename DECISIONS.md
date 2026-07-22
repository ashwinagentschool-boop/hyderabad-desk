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
