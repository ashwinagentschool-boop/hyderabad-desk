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
