# Basic view: the account rail follows the whole section (2026-09-25)

Requested: "in basic mode, for each of the pages our account panel links to -> we need to
populate the content of the page with the link that is clicked - it needs to feel like a
single-page application and feel like a seamless load of the pages when the menu item is
clicked and it should show that button on the panel as the active button when clicked (the
exception is the account button on the panel for the account page itself, which already
carries a highlight by default) -> you created the same single-page application feel for me
on the home page of modern view -> use that for reference".

## The reference the request names

Modern's answer is recorded at `app/frontend/app/controllers/application.js:2267-2285`:

> mounted per-page, the chrome was destroyed and rebuilt on every transition -- measured 1/6
> hops kept the same DOM node -- and the rail was not rendered on four of the six
> destinations at all. Mounted once, it simply never unmounts, which is what makes the
> section feel like one app rather than six pages.

Two mechanisms, and the second is the load-bearing one here:
1. the rail is mounted ONCE above the outlet (`templates/application.hbs:1623`), so it is
   never torn down; and
2. it is gated on a route LIST covering the whole section, not on the one page it was built
   for (`showGlobalChrome` -> `CHROME_ROUTES`).

## Fact sheet

**(a) WHERE IS THE VALUE READ?**

- `showClassicAccountRail` is read at `app/frontend/app/templates/user.hbs:25`, the `{{#if}}`
  around `<Dashboard::ClassicAccountRail>`. **CONFIRMED.**
- It is defined at `app/frontend/app/controllers/user.js:22-30`, and line 29 is the whole
  defect: `return route === 'user.index' || route === 'user.account' || route === 'user.history';`
  Three route names, against a rail with eight destinations. **CONFIRMED.**
- The rail's mount point is INSIDE `templates/user.hbs`, which is the `user` route's own
  template. `user.goals`, `user.edit`, ... are children of `user`, so that template is not
  re-rendered on a hop between them: the mount point already has the persistence property
  Modern had to hoist the chrome to get. **CONFIRMED** -- by reading the template structure, and
  afterwards by measuring DOM-node identity across real hops (see the verification log; when
  this was first written the label was claimed against a probe that did not yet exist, which the
  adversarial review caught).
- Reports is the exception. `templates/user.hbs:1` branches on `bareUserOutletLayout`, whose
  `BARE_ROUTE_BASES` includes `'user.stats'` (`controllers/user.js:170-171`), and that branch
  renders `{{outlet}}` and nothing else. Reports brings its own shell
  (`templates/user/stats.hbs:5`), so no widening of `showClassicAccountRail` alone can reach
  it. **CONFIRMED.**

**(b) WHAT ARE ALL THE SHAPES THIS CAN HOLD?**

The input is the current route name. Every route the rail can be wanted on is one of the 16
in `accountRailContext` (`controllers/user.js:110-115`). Split by which branch of `user.hbs`
renders them:

| branch | routes |
|---|---|
| `.md-shell--user` (7 of the 8 destinations + detail pages) | `user.index`, `user.account`, `user.history`, `user.goals`, `user.goal`, `user.badges`, `user.lessons`, `user.recordings`, `user.edit`, `user.preferences`, `user.subscription`, `user.logs`, `user.log`, `user.supervision`, `user.focus` |
| bare, own shell | `user.stats` (Reports) |

Measured, before any change, at 1280 in Basic/Gentle as `example`, clicking each of the
rail's eight rows (`scratchpad/spa1.mjs`):

```
Reports           /example/stats         rail=ABSENT shell=false active=[] aria=[]
Goals             /example/goals         rail=ABSENT shell=true  active=[] aria=[]
Trainings         /example/lessons       rail=ABSENT shell=true  active=[] aria=[]
Recordings        /example/recordings    rail=ABSENT shell=true  active=[] aria=[]
Profile           /example/edit          rail=ABSENT shell=true  active=[] aria=[]
Settings          /example/preferences   rail=ABSENT shell=true  active=[] aria=[]
Subscription      /example/subscription  rail=ABSENT shell=true  active=[] aria=[]
Logs & Messages   /example/logs          rail=ABSENT shell=true  active=[] aria=[]
```

Eight of eight lose the nav. `shell=false` on exactly one row is the bare branch showing
itself, which is what makes Reports a second piece of work rather than a sixteenth entry in
a list.

**(c) IS EACH CROSS-FILE CLAIM TRUE?**

1. "`ROW_FOR_ROUTE` already covers the destinations, so `aria-current` needs no work" --
   **CONFIRMED**, `components/dashboard/classic-account-rail.js:22-32` maps all eight plus
   the `user.goal` / `user.log` / `user.badges` detail siblings. `user.supervision` and
   `user.focus` have NO entry, deliberately: neither has a row in this rail, and Modern
   makes the same choice for `user.lessons` / `user.focus` (`components/account-rail.js:71-77`)
   on the stated grounds that pointing a page at a row it does not belong to "would make the
   nav say something untrue, which is worse than saying nothing".
2. "the visual highlight already computes itself" -- **CONFIRMED**. Six rows carry
   `@activeClass="is-active"`; Goals and Logs take `is-active` from `activeRow` because their
   detail routes are router SIBLINGS; the identity card uses `@current-when`
   (`classic-account-rail.hbs:27,64-133`). Nothing in the highlight path is keyed to the
   three-route gate, so widening the gate is expected to light the rows with no further
   change. To be verified, not assumed.
3. "`accountRailContext` can simply be reused" -- **FALSE, and this is the trap.** That
   computed returns false whenever `homeNavContext` is true (`controllers/user.js:82`), which
   suppresses the rail on `/logs?nav=home` so Modern can show the HOME pill nav there
   instead. In Basic there is no pill nav to show: `showGlobalChrome` returns false for
   `is_classic` (`controllers/application.js:2309`) and the in-page pill row was retired
   2026-09-21. Reusing the computed whole would therefore give Basic one route with no nav at
   all.
   **CORRECTED AFTER REVIEW:** I first wrote that `components/log-item.js:24` was the only
   producer of `?nav=home`. There are THREE -- `components/user-pill-nav.hbs:92` (the Updates
   pill), `:135` (its collapsed-dropdown twin) and `components/log-item.js:24`. My grep pattern
   matched `nav=home` and `nav: 'home'` and so missed the double-quoted `nav="home"` in the
   template.
   THE CONCLUSION SURVIVES ON STRONGER GROUND. `nav` is a DECLARED query param
   (`controllers/user/logs.js:32`, `controllers/user/log.js:22`), so the URL survives a
   bookmark, a shared link, the Back button, and a Modern-to-Basic view switch made while
   standing on it. A Basic user really can arrive at `/x/logs?nav=home` -- so copying the gate
   would not merely be redundant, it would strip the only nav that page has. **CONFIRMED.**
4. "Reports' shell uses the same inner class name" -- **CONFIRMED**,
   `templates/user/stats.hbs:5-6` is `.md-shell.md-shell--reports-view.md-shell--stats` >
   `.md-workspace`, the same `> .md-workspace` child the existing rail rules target.
5. "the stats controller's `model` is the user, so it can feed `@user`" -- **CONFIRMED**,
   `routes/user/stats.js:8-12` returns `this.modelFor('user')`.
6. "no SCSS change is needed for the seven" -- **CONFIRMED** by the existing rule's own note
   (`styles/_classic-home.scss:4362-4365`): it is keyed on `:has(> .ch-rail)` rather than on
   the page, precisely so that "the day the rail follows the rest of the section no rule here
   has to change".

## Candidates

### A. Widen the route test in place
Replace line 28's three-name test with the section list.
- Rejected as written: it is a SECOND copy of the list `accountRailContext` already holds
  three lines below, and the learnings register already has this exact failure --
  "two lists that must move together will not, unless a test makes them"
  (`learnings-archive/2026-09.md`, cited from `utils/primary_nav.js:16`).

### B. Extract the list, share it, and give Reports the rail in its own shell (CHOSEN)
1. New `app/frontend/app/utils/account_section.js`: the route list plus
   `isAccountSectionRoute(route)`. One list, three readers.
2. `controllers/user.js`: `accountRailContext` keeps its `homeNavContext` precedence and asks
   the module for the rest; `showClassicAccountRail` asks the same module and does NOT take
   the `homeNavContext` gate, for the reason in fact (c)3.
3. Reports: render the rail as the first child of its own `.md-shell`
   (`templates/user/stats.hbs`), which is exactly what `templates/organizations.hbs` already
   does for the dashboard rail -- established pattern, not a new one. The flag is ALIASED from
   the `user` controller rather than recomputed, so the two mount points cannot disagree.
4. SCSS: widen the seven existing rail-layout selectors from
   `.md-shell--user:has(> .ch-rail)` to `.md-shell:has(> .ch-rail--account)`. Editing the
   original selector, per Rule #0.7 -- no override block. Specificity is unchanged (three
   classes + one type either way), and the dashboard/organizations rails are plain `.ch-rail`
   so they cannot be caught by the widened form.

### C. Hoist the Basic rail to `templates/application.hbs`, as Modern did
The closest analogue of the reference. Rejected: Modern's rail is positioned by
`.ll-appshell`, which Basic deliberately does not render, so this means a second app shell
and re-deriving the rail's placement from scratch -- the 80/44/48 insets, the 24px gutter and
the flush content edge that were each set by request over the last day. It buys node
persistence on ONE hop (account <-> Reports) at the price of re-opening every layout decision
in the feature. Not worth it; recorded as the option if Reports' hop turns out to flash
badly.

## Risks

- **The account <-> Reports hop crosses the `bareUserOutletLayout` branch**, so that one hop
  mounts a second rail instance instead of keeping the first. Whether that is VISIBLE is an
  empirical question -- `bareUserOutletLayout` deliberately goes true at the START of the
  transition, so there may be a railless loading frame. To be measured, and reported honestly
  either way rather than described as seamless.
- **`user.supervision` and `user.focus` will render the rail with nothing lit.** Accepted and
  matching Modern's own treatment (fact (c)1). Worth telling the user, because it is visible.
- **Reports' shell has its own padding rules** from earlier work today
  (`.md-shell.md-shell--stats { padding-top: 0 }` and the `min-width: 901px` Reports block in
  `app.scss`). The widened rail rules carry `!important` and should win, but the Reports page
  in Basic has to be looked at in both layouts rather than assumed.
- **Blast radius of the SCSS widening** is every `.md-shell` that has a `.ch-rail--account`
  direct child, which is only this component's two mount points. Verified by grep.

## Questions I could not resolve from the code

- Whether the user wants the rail on `user.supervision` (it has no row in the panel, so it
  would render unlit). Defaulting to "yes, render it" because a section page with no nav is
  the defect being fixed, and an unlit nav still navigates.

## Test, and the mutation that must make it fail

- `tests/unit/controllers/user-classic-account-rail-test.js`: `showClassicAccountRail` is true
  in Basic for every route in the section list, false in Modern for the same routes, false on
  a board route in Basic, and -- the case with teeth -- TRUE on `user.logs?nav=home` in Basic,
  which is the one assertion that fails if the `homeNavContext` gate is copied across from
  `accountRailContext`.
- `tests/unit/utils/account-section-test.js`: every route in the shared list either has a
  `ROW_FOR_ROUTE` entry in the classic rail or is on the stated exceptions list. This is the
  invariant Modern's `account-rail-active-row-test.js` pins for its own map.
- Mutations: restoring the three-name test must turn the first block red; adding the
  `homeNavContext` gate to `showClassicAccountRail` must turn the `?nav=home` assertion red;
  adding `user.supervision` to the rail's map without a row must turn the exceptions
  assertion red.

## Verification log

(filled in as the work lands)

### Before-baseline, Basic view, 1280 (scratchpad/base8.mjs)

Captured so a layout regression on the seven pages is a diff rather than an impression.
`shell` is `.md-shell`; `h1` is the first visible heading.

Gentle:
```
account       shell y=46 pt=80 dir=row     rail y=126 x=28 w=380   h1 y=154 "My Account"
stats         shell y=26 pt=30 dir=column  rail absent            h1 y=176 "Activity for example"
goals         shell y=46 pt=30 dir=column  rail absent            h1 y=191 "Communication Goals"
lessons       shell y=46 pt=30 dir=column  rail absent            h1 y=287 "Current Trainings"
recordings    shell y=46 pt=30 dir=column  rail absent            h1 y=191 "User Recordings"
edit          shell y=46 pt=30 dir=column  rail absent            h1 y=191 "User Profile for ..."
preferences   shell y=46 pt=30 dir=column  rail absent            h1 y=191 "General Preferences"
subscription  shell y=46 pt=30 dir=column  rail absent            h1 y=191 "Subscription Inform..."
logs          shell y=46 pt=30 dir=column  rail absent            h1 y=191 "Logs for example"
```

Focused: identical shell figures; headings at 221 (account) / 96 (stats) / 171 (the rest,
267 on lessons).

TWO THINGS THIS BASELINE SETTLES IN ADVANCE.

- **The account page's own highlight is NOT a `.ch-row`.** `active=[]` on the account page as
  well as everywhere else, because that row is the identity card and it lights through
  `@current-when`, not `is-active`. That matches the request's own parenthesis ("the exception
  is the account button ... which already carries a highlight by default") and means the
  `.ch-row.is-active` path has never yet been exercised on a real page -- so its visibility is
  something to look at, not to assume.
- **The seven pages will MOVE, and predictably.** Their content currently sits at h1 y=191
  (Gentle) because `#content:has(.md-shell--user):not(:has(.md-hero--dashboard-user))` in
  app.scss gives them a 3rem inset, while the account page sits at 154 because the rail rules
  zero the workspace and `.md-main--user` insets wherever `:has(> .ch-rail)` is true. Widening
  the gate makes that `:has()` true on all seven, so they adopt the account page's spacing --
  i.e. the section becomes consistent, which is the point, but it is a visible change and has
  to be looked at rather than inferred.

### Red test, before the fix

`tests/unit/controllers/user-classic-account-rail-test.js`, `ember test --filter "user
showClassicAccountRail"`: **3 fail, 3 pass, 0 skip.** The three failures are exactly the three
positive blocks -- the eight destinations, the six detail pages, and the `?nav=home` case -- and
the three negative blocks (Modern, board routes, email landings) pass. So the test discriminates
rather than merely failing.

---

## What the adversarial review changed

`/adversary-review` on the proposal, before any edit. It could not falsify the design, and B
shipped as written, but six of its findings changed the work and three of its corrections are
folded into the fact sheet above rather than left as errata:

1. **Three producers of `?nav=home`, not one** (fact (c)3, corrected above). My grep pattern
   missed the double-quoted form in a template. The decision was right for a weaker reason than
   I gave; it is now recorded with the real one.
2. **Five wrong `file:line` citations** (user.js:29 not :28, :170-171 not :160,
   application.js:2309 not :2305, :110-115 not :110-114, seven selectors not six). All five
   corrected above; each was re-read before correcting rather than taken on the review's word.
3. **An unearned CONFIRMED label.** I marked the mount point's persistence "CONFIRMED by browser
   probe (node identity, below)" when no such probe existed. It does now, with a control -- see
   below -- and the label is re-earned rather than deleted.
4. **The collapsed rail's active state was half-invisible.** `.ch-row__title` lives inside
   `.ch-row__body`, which the collapsed rail CLIPS, so the weight half of `is-active` showed
   nothing exactly when the rail is narrowest. The rail auto-collapses at <=1024 and shares its
   collapse state with the dashboard rail, so this is a common state, not an edge case. Fixed in
   place by extending the existing rule to `.ch-row__short`, the label that is actually on screen
   there. I would not have found this: every check I had planned was at the expanded width.
5. **A content-width risk on four newly-railed pages** (`history`, `log`, `preferences`, `goal`),
   which the risk list had missed entirely. Measured, and it did not materialise -- see below.
6. **The second proposed test could not be written as described.** `ROW_FOR_ROUTE` is
   module-private. Resolved by exporting `ACCOUNT_SECTION_ROUTES` instead and asserting through
   `activeRow` on a real instance, which is how the Modern rail's own test does it -- so the test
   reads the REAL list and a route added without a row turns it red.

It also predicted a railless/full-width frame on the Reports hop. Measured: it does not happen
(below). Recorded because a review finding is evidence to check, not a verdict.

## Verification log

**Unit tests** (targeted `--filter` runs; the full suite is CI's job).

| suite | result |
|---|---|
| `user showClassicAccountRail` (new, 6 tests) | 6 pass |
| `classic-account-rail activeRow` (new, 3 tests) | 3 pass |
| `user nav context` (existing, 6 tests) | 6 pass -- Modern's gate provably unchanged by the list extraction |

**Falsification.** Each mutation applied alone, from a copy of the file made by hand (never
`git checkout`), then restored and diffed back to byte-identical:

| mutation | result |
|---|---|
| restore the three-name route test | 3 fail / 3 pass -- exactly the three positive blocks |
| copy `homeNavContext` onto the Basic flag | 1 fail -- exactly the `?nav=home` assertion |
| delete `'user.recordings'` from `ROW_FOR_ROUTE` | 1 fail -- "user.recordings lights a row (null)" |

So each test fails for its own reason and nothing passes by accident.

**Browser, Basic view, 13 pages x 3 widths x both layouts** (`scratchpad/verify.mjs`):
`rails=1` and `shells=1` on every page -- no double mount anywhere, including Reports, where the
two mount points are mutually exclusive by construction. `dir=row` at 1280/1024, `column` at 900.
Rail at y=126/90/94, the same insets the account page already had. Active row correct on all
eight destinations; `badges` lights Goals; `history` lights the identity card; `focus` and
`supervision` light nothing, as stated. `docOverflow=0` at every width in both layouts.

**Node identity across hops** (`scratchpad/hop.mjs`), the SPA claim, with controls:

```
logs -> /goals         S820(pre)  S820x100      <- same DOM node kept for 100 frames
goals -> /preferences  S820(pre)  S820x100
logs -> /stats         S820(pre)  n820x100      <- rebuilt, but never absent, width constant
stats -> /logs         S820(pre)  n820x100
```

The two `S` rows are the control: they prove the probe can tell a kept node from a new one, which
is what makes the `n` on the Reports hop meaningful rather than an artefact. No frame in any hop
reported `_` (no rail) and `.md-workspace` never changed width -- so the predicted reflow and
railless frame do not occur, even though the Reports hop does cross the template branch.

**The four width-risk pages.** `preferences` and `edit` show a 15px overflow on `.md-pref-box` at
900. NOT MINE: measured with and without the shell's 28px side padding, the only width variable
this change introduces at that breakpoint, and it is 15px either way. Pre-existing, reported, not
touched. The other overflow entries are the rail's own clipped elements (`.ch-row__short`,
`.ch-rail__identity-text`, `.sr-only`), which are `clip: rect(0,0,0,0)` by design.

**Collapsed active state**, after the fix, both layouts at 1024: `border-left: 4px solid
rgb(42,157,143)` and `.ch-row__short` computed `font-weight: 700` (it was 650). Confirmed by
screenshot as well as computed style.

**Lint.** `lint:hbs` clean. `lint:js:ci` exits 1 on 75 pre-existing findings in
`authenticated-view.js`, `create-board-new.js`, `application.js` and `user-select.js` -- none in
any file this change touches. Verified per-file: `controllers/user.js` and both new test files are
clean, and `controllers/user/stats.js` reports findings at exactly lines 25/140/152/185/282/344,
byte-identical to its `.eslint-todo` anchors, because the new import was folded into line 1
(`import Controller, { inject as injectController }`) rather than added as a new line. My first
draft of the invariant test DID add two real findings (`qunit/no-conditional-assertions`); they
were fixed by restructuring the assertion, not suppressed.

## Known, reported, not fixed

- **The rail sits 20px higher on Reports at 1280** (y=106 against 126), and 6px lower at 1024/900.
  The cause is `#content`'s own `padding-top` -- 26 against 46 at 1280 -- which differs between
  the bare and non-bare layouts and pre-dates this change; the shell's own padding is identical
  (80/44/48) on every page. Left alone deliberately: correcting it means moving Reports' whole
  page, and page spacing in this view is being set by hand, request by request. One line if wanted.
- **`user.supervision` and `user.focus` render the rail with nothing lit**, matching Modern's
  stated treatment of a page with no row. Pinned by the invariant test so it stays a decision.
- **`.md-pref-box` overflows its box by 15px at 900** on `preferences` and `edit`. Pre-existing.
- **`templates/user.hbs:31` and `supervision.hbs:5` still reference `.md-shell--user-rail`**,
  which `app.scss:50293` records as dead. Out of scope here; worth its own sweep.
