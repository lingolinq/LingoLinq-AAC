# Unit 2 (main event) — unify the two primary pill-nav implementations

**Date:** 2026-09-21
**Branch:** `traci/styling/classic-view-overlay`
**Base:** `bbf23cf81` (tree clean)
**Discipline:** `/fix-proposal` — behaviour change in application code.

## Status

IN PROGRESS — current-state map established, evidence sweep delegated. **No code edited.**

## What is already done (verified at HEAD, not taken from the handoff)

The incoming handoff listed "Unit 2 — one nav component — not started". That is only half
right, and the prior working log
(`docs/task-management/2026-09-21-unit2-shared-nav-component.md`, dash form, gitignored)
records why: Traci changed direction mid-unit, and what shipped was **Unit 2A** —
retiring the ACCOUNT pill nav so the rail covers the account section
(`075152829`, fix `dddb608b9`, visual QA passed). That is done.

What was explicitly deferred there: *"Retiring `UserPillNav` is a LATER unit — it still
holds Caseload / Organizations / Boards / Extras, which the rail does not have."*

## Current-state architecture (CONFIRMED by reading HEAD)

There are **two navigational LAYERS** and **three implementations**.

**Layer 1 — account section: `components/account-rail.hbs`** (11 rows).
Rendered at `components/dashboard/authenticated-view.hbs:19` (home tab only),
`templates/user.hbs:11`, `templates/user.hbs:26`, `templates/user/index.hbs:84`.

**Layer 2 — top-level sections: the pill nav, in TWO implementations.**

| | implementation | rendered by |
|---|---|---|
| A | `components/dashboard/authenticated-view.hbs:28+` (bespoke) + its `.md-pillnav-dropdown` mirror at `:78+` | the modern dashboard |
| B | `components/user-pill-nav.hbs` (+ `.js`) + its own `.md-pillnav-dropdown--user` mirror at `:81+` | `templates/caseload.hbs:8`, `templates/organizations.hbs:5`, `templates/user/boards.hbs:27`, `templates/user.hbs:72` |

Both carry the same seven items: Home, Caseload, Organizations, Boards, Extras, Updates,
Account.

**They are kept in sync BY HAND.** `authenticated-view.hbs:30-33` says so outright:
*"Keep this order in sync with the `.md-pillnav-dropdown` mirror further down and with
`components/user-pill-nav.hbs` — the two navs render on different pages and must agree."*
A hand-maintained invariant across three templates is the defect this unit removes.

On the dashboard home tab BOTH layers render at once, and that is deliberate, not a bug
(`authenticated-view.hbs:14-17`): *"Here they are complementary, not duplicates: Boards,
Caseload, Organizations, Extras and Updates exist ONLY in the pill row."*

## THE CRUX — the same pill means two different things

`components/dashboard/authenticated-view.js`, the `goTab` action:

```js
if (tab === 'home') { ...router.transitionTo('user.home', uh)... }
this.set('activeTab', tab);       // <- everything else
```

So on the dashboard, **Boards / Reports / Extras are in-page tab switches that set a
component property and do NOT change the URL**. In implementation B the same labels are
`<LinkTo>`s to real routes (`user.boards`, `user.extras`). Home is the one item that
behaves the same in both, because goTab special-cases it into a real transition.

This is why the two cannot simply be swapped for one another, and it is the reason the
handoff's earlier framing ("pure de-duplication, no product decision") does not hold.
A router restructure that turned the dashboard tabs into routes was already REJECTED --
it would change URLs and break district bookmarks.

## The decision this unit needs before any code

Three shapes, and they differ in how much product change they carry. Carried to Traci.

1. **One component, two behaviours.** The shared component takes a mode: on the dashboard
   it emits `goTab`, elsewhere it renders `<LinkTo>`. Removes the hand-sync hazard with
   no user-visible change. Leaves "Boards means a tab here and a route there" intact.
2. **One component, routes everywhere.** The dashboard pills become real links. Uniform
   and bookmarkable, but changes dashboard behaviour and retires the in-page tab feel.
3. **Retire the pill nav; the rail absorbs it.** Traci's earlier stated intent (*"the
   userpillnav shouldn't exist anymore"*). Requires the rail to gain Caseload,
   Organizations, Boards, Extras and Updates-with-badge, which merges two navigational
   layers into one list — an information-architecture change, not a refactor.

---

# CORRECTION — my "in-page tabs" claim was WRONG

I wrote above that the dashboard's Boards/Reports/Extras "do NOT change the URL". **False,
and I told Traci so before catching it.** I had read `goTab` only from line 1360, saw the
`this.set('activeTab', tab)` fallthrough, and generalised from the tail of the function.

Read from the top (`components/dashboard/authenticated-view.js:1335-1375`), every tab
performs a real router transition:

```js
if (tab === 'reports') { ...transitionTo('user.stats',  u);  return; }
if (tab === 'boards')  { ...transitionTo('user.boards', ub); return; }
if (tab === 'extras')  { ...transitionTo('user.extras', ux); return; }
if (tab === 'home')    { ...transitionTo('user.home',   uh) unless already there; return; }
this.set('activeTab', tab);   // <- the fallthrough I mistook for the rule
```

The fallthrough is unreachable from the nav. So **both navs already go to the same
destinations**; they differ only in the MARKUP used to get there (`<button>` + action vs
`<LinkTo>`). That makes unification far more mechanical than I first described, and it
removes the "router restructure" question entirely — no URL changes at all.

Lesson for the archive: reading a function from the middle and generalising from its
fallthrough is the same error class as trusting a handoff claim. Read from the top.

# The divergences that MATTER (each re-verified by me, not taken from the agent)

**P1 — Account pill disappears in Focused View, but only on the dashboard. PRODUCT.**
Dashboard: `showAccountPill = !supporter_role && effectiveLayout !== 'focused'`
(`authenticated-view.js:134-136`). Shared: `{{#unless supporter_role}}`
(`user-pill-nav.hbs:65`). So a communicator in Focused View sees no Account pill on the
dashboard but does see one on Boards / Caseload / Organizations / Updates. CONFIRMED.

**P2 — the shared nav points at TWO DIFFERENT PEOPLE at once. PRODUCT.**
Home / Boards / Extras use `@userName` (`user-pill-nav.hbs:7,30,46`), while Updates and
Account hardcode `currentUser.user_name` (`:61,66`). `templates/user/boards.hbs:27` and
`templates/user.hbs:72` pass `this.model.user_name` — the VIEWED user. So while viewing a
supervisee's boards, Home/Boards/Extras go to the supervisee and Updates/Account go to
you. CONFIRMED.

**P3 — accessibility differs.** The dashboard row never sets `aria-current` on any pill;
the shared row replaces the active pill with `<span ... aria-current="page">`. Screen
reader users are told which page they are on in one nav and not the other. CONFIRMED by
reading both files.

**P4 — narrow-screen menus differ.** Dashboard dropdown: a `<div>` toggled by an
`.is-open` class, every option has an icon, three options are `<button>`s (so they cannot
be opened in a new tab). Shared dropdown: a native `<details>`, no icons, all seven are
links. They are also styled by two SEPARATE sets of SCSS rules — `.is-open`-keyed vs
`[open]`-keyed and scoped to `--user` — so swapping the markup without the matching class
makes the menu silently never open.

# LIVE DEFECT found while mapping (not caused by this unit)

`utils/tours/home.js:284-300` assigns tour copy to pills **by position**:
`plain[0]`→"Home", `plain[1]`→"Boards", `plain[2]`→"Extras". The filter excludes
`--reports` and `--account` but NOT Caseload, Organizations or Updates. So for a
communicator (Home, Boards, Extras, Updates) it is correct, but for a **supporter who
manages an org** the visible order is Home, Caseload, Organizations, Boards, Extras,
Updates — and the tour points at **Caseload while saying "Boards"** and at
**Organizations while saying "Extras"**. CONFIRMED by reading the filter and both navs'
gate order. Pre-existing; must be fixed or re-anchored before any reordering.

---

# VERIFICATION — the Account pill vs the rail (Traci, 2026-09-21)

> "we have the left nav menu -> so the account button should [not] be there in either
> focused or gentle view anymore. on modern view, the account button on the home page
> should be gone - verify"

Probe: `app/frontend/scripts/account-pill-redundancy-qa.mjs` (new). Measures what is
actually VISIBLE (computed style + non-zero box), not merely present in the DOM.

Two accounts, because the gate turns on `supporter_role`:
`lingolinq_admin` (supporter) and `luna_garcia` (communicator, `role = 'communicator'`).

## Result — the home page

| user / layout | rail (Account row) | Account PILL |
|---|---|---|
| supporter, Gentle | present | absent |
| supporter, Focused | present | absent |
| **communicator, Gentle** | **present** | **PRESENT — both on screen** |
| communicator, Focused | present | absent |

**Traci's call is CONFIRMED CORRECT.** On the modern home page the rail renders in BOTH
layouts and always carries an Account row, so the Account pill adds nothing. In Gentle
view a communicator currently sees Account twice at once. Removing the pill from the home
page loses no access.

## BUT — the same pill also appears where there is NO rail

The rail only renders on the dashboard when `activeTab == "home"`
(`authenticated-view.hbs:18`), and `user.boards` is NOT in `accountRailContext`
(`controllers/user.js:87-92`). Measured as a communicator on `/luna_garcia/boards`:

- Account pill: **visible**
- rail: **absent**
- global navbar Account link: **in the DOM but NOT visible** (`inDom=1, visible=0`) — it
  lives inside a closed navbar dropdown / mobile drawer
  (`app-navbar-authenticated-inner.hbs:142,217`).

So on Boards — and equally on Extras and the Updates page, neither of which renders the
rail — **the Account pill is the only directly visible way to reach Account.** Deleting
it globally would put Account behind a dropdown on those pages.

MEASUREMENT NOTE: a first pass reported `visible=1` for the navbar and was WRONG — the
selector `a[href$="/account"]` also matches the PILL itself. Excluding
`.md-pillnav`/`.md-pillnav-dropdown` gives the real answer, `visible=0`. Recorded because
the naive selector makes a fallback look present when it is not.

## Second finding — a communicator cannot reach the dashboard directly

`/` and `/:u/home` both redirect a communicator who has a home board straight to that
board (`routes/index.js:131`, gated on `_index_login_entry && home_board_key &&
communicator_only`). The dashboard is only reachable by IN-APP navigation (clicking the
Home pill). The table above was produced that way. Anyone testing the communicator
dashboard by typing a URL will silently measure a board page instead.

## Local dev-data change

`luna_garcia`'s password had drifted from the seed value — `db/seeds.rb:650-652` creates
students `unless student` already exists, so re-seeding never resets it. Reset it to the
documented seed password (`demo2025!`) on the LOCAL dev DB only, to log in as a
communicator. Data only, no schema change, dev DB only.

---

# CHANGE 1 — Account pill removed from the dashboard HOME tab

Direction from Traci: *"for gentle view, modern view, the account pill needs to be gone"*,
following *"we have the left nav menu ... on modern view, the account button on the home
page should be gone"*.

## What changed

`components/dashboard/authenticated-view.js`, `showAccountPill`:

```js
// before
return !supporter_role && effectiveLayout !== 'focused';
// after
if (supporter_role) { return false; }
if (effectiveLayout === 'focused') { return false; }
return activeTab !== 'home';
```

`'activeTab'` added to the dependent keys.

## Why NOT a blanket `false`

This component renders TWO pages. On `user.extras`
(`templates/user/extras.hbs:13`, `@initialActiveTab="extras"`) `activeTab` is not
`'home'`, so the rail does not render. Measured there as a communicator: rail absent,
Account pill visible, and the global navbar's "My Account" present in the DOM but
**not visible** (it is inside a closed dropdown). Removing the pill globally would bury
Account behind a dropdown on Extras, for the users least likely to go looking. So the
suppression is scoped to the tab where the rail actually replaces it.

## Behaviour table — one cell changed, by design

| tab | layout | role | before | after |
|---|---|---|---|---|
| home | gentle | communicator | shown | **hidden** ← the change |
| home | focused | communicator | hidden | hidden |
| extras | gentle | communicator | shown | shown |
| extras | focused | communicator | hidden | hidden |
| any | any | supporter | hidden | hidden |

## Tests

`tests/unit/components/dashboard-account-pill-test.js` (new), 4 tests.
**Red first:** 1 fail / 3 pass — the single failure was the home+gentle case, and the
Extras guard already passed. After the fix: 4/4. The Extras case is pinned specifically
so a later "simplification" to `return false` fails instead of silently burying Account.

## Confirmed on screen (`scripts/account-pill-redundancy-qa.mjs`)

| page | rail | Account pill |
|---|---|---|
| home, gentle | present (Account row) | **gone** |
| home, focused | present (Account row) | gone |
| extras, gentle | absent | present (preserved) |
| boards, gentle | absent | present (shared nav, untouched) |

## ESLint re-anchoring

The explanatory comment made the file net **+12** lines, shifting 21 line-anchored
entries. Proven pure shifts BEFORE editing the baseline: every one of the 21 reported
findings matched an existing entry at exactly `line - 12` with identical rule, column and
severity (checked programmatically, 21/21 matched, 0 unmatched), and total findings stayed
1604. Re-anchored those 21 lines only, atomically — several shifted lines collide with
unshifted ones, so a sequential bump would have double-counted. Gate back to
1604 grandfathered / 0 new. NOT a regeneration.

## Still open (unchanged by this)

The Account pill remains on **Boards**, **Extras** and the **Updates** page — all served
without the rail. Whether the rail should extend to those pages, or the pill stays there,
or the navbar dropdown is accepted as the access point, is still Traci's call.

---

# CHANGE 2 — Account pill removed from the modern dashboard ENTIRELY

Direction from Traci: *"extras page (gentle and focused) should not show the account
pill"*, clarified *"on the modern view"*.

Since this component serves only two pages — the dashboard home tab and `user.extras` —
and both must now hide it, the conditional had nothing left to decide. So rather than
leave a computed that always returns false, the pill is **deleted**:

- `authenticated-view.hbs` — the `<LinkTo ... md-pillnav__pill--account>` in the pill row
  and the matching `<li>` in the collapsed dropdown mirror, each replaced by a comment
  recording the decision.
- `authenticated-view.js` — the `showAccountPill` computed removed (now unused; grep
  confirms zero remaining references in the component).

This supersedes CHANGE 1's `activeTab !== 'home'` gate, which lived for one step.

## Access preserved — checked before removing, not after

- **Navbar identity dropdown** carries "My Account"
  (`app-navbar-authenticated-inner.hbs:142`) plus the mobile-drawer twin (`:217`). The
  trigger is a visible control on every page, so Account is two clicks away everywhere.
- **Home tab** additionally keeps the rail's own Account row (`account-rail.hbs:58`).
- **Tour is safe:** `utils/tours/home.js:305` guards with `if (account) { pills.push(...) }`,
  so a missing pill drops that step rather than erroring. CONFIRMED by reading it.

## Confirmed on screen (communicator, `scripts/account-pill-redundancy-qa.mjs`)

| page | rail | Account pill |
|---|---|---|
| home, gentle | present | gone |
| home, focused | present | gone |
| **extras, gentle** | absent | **gone** ← this change |
| boards | absent | present (shared nav — untouched, separate decision) |

## Test

The QUnit unit test from CHANGE 1 asserted on `showAccountPill`, which no longer exists,
so it was replaced rather than deleted: `spec/templates/dashboard_account_pill_spec.rb`
pins that the modern dashboard template links to Account nowhere, that it still HAS a
pill row (so an emptied or moved file cannot pass), and that the SHARED nav keeps its own
Account pill — the last one so this guard can never be widened into the still-open
decision about Boards / Caseload / Organizations / Updates.

Rewriting the test is legitimate here under CLAUDE.md #14 only because the specification
itself changed by explicit instruction; recorded so that is auditable.

**Falsified:** re-inserted the pill from a self-made copy — guard went red naming
`authenticated-view.hbs:81`; restored → `spec/templates/` 12 examples, 0 failures.

## ESLint re-anchoring, done the hard way after a misstep

First attempt measured the shift with a nearest-match heuristic, which produced a
NONSENSE histogram (`-16 ×12, -12, -9, -4, +16 ×2, -13 ×2, -6, -3`) because
`lingolinq/no-orphaned-action` has many entries at the same column and "nearest" is
ambiguous. Discarded rather than acted on.

Correct method: restored `.eslint-todo` to HEAD (a file only I had dirtied), measured the
component's net change directly — `git diff --numstat` → **-4 lines** — then required an
EXACT match of file+rule+column+severity at `line + 4`. 21/21 matched, 0 unmatched.
Re-anchored those 21 only. Gate back to 1604 grandfathered / 0 new.

Second slip: the rewrite dropped the file's trailing newline, showing as a 22nd changed
line. Restored; diff is now exactly 21/21.

Both slips were caught by verification rather than by review, but they are two in one
unit — per Rule #0.13 this unit stops here rather than rolling on into the next change.

---

# UNIT 2 PROPER — one nav component (SPA continuity)

Traci: *"back to our work on the home page and making it a single page app experience to
navigate from home to Caseloads, Organizations (if those two exist for the user), Boards,
Extras, and Updates."*

Per the original proposal (`2026-09-20-pillnav-spa-continuity-proposal.md`), the app is
ALREADY an SPA — no path reloads the document. The defect is **perceived** continuity:
the nav is destroyed and rebuilt on every hop, so the menu you just clicked disappears
and re-appears. Unit 2 makes it ONE component; Unit 3 renders it once above the outlet.

## Item set — taken from Traci's own list

Home, Caseload (gated), Organizations (gated), Boards, Extras, Updates. **No Account** —
she omitted it, and the modern dashboard's Account pill was removed in CHANGE 2 above for
the same reason (the rail and the navbar identity dropdown carry it). So the unified nav
drops Account from the shared component too, which also makes the two navs' item sets
genuinely identical for the first time.

ASSUMPTION STATED: this removes the Account pill from Boards / Caseload / Organizations /
Updates, none of which render the rail. Account remains two clicks away via the navbar
identity dropdown on every page. Flagged to Traci rather than asked, because her item list
and the CHANGE 2 decision both point the same way.

## Survivor: `components/user-pill-nav`

It is already shared, already `<LinkTo>`-based, and already sets `aria-current="page"` on
the active item — the three things the dashboard's bespoke copy lacks.

## The button→LinkTo conversion is SAFE — both goTab side effects are now dead

`goTab` did two things beyond transitioning. Both verified gone:

1. **Scroll reset** (`content.scrollTop = 0; window.scrollTo(0,0)` in the transition's
   `.then()`, `authenticated-view.js:1345-1349, 1357-1361`). Now **exactly duplicated** by
   the unconditional reset in `routes/application.js:188-190`, which this session made
   unconditional after proving the old guard never fired. Redundant.
2. **`showNewBoardForm: false`** (`:1367`). That property has a default and two writers
   and **ZERO readers anywhere** in `app/` or `tests/` — CONFIRMED by repo-wide grep. Dead
   state; losing the reset changes nothing.

`goTab` itself STAYS — the home grid's Reports card still calls it
(`authenticated-view.hbs:524`, `onGoTab "reports"`). Only the NAV stops using it.

## Divergences to carry across (from the evidence sweep, key ones re-verified by me)

- **`supervisors` → Extras active alias.** The dashboard lights Extras when
  `activeTab === 'supervisors'` (`authenticated-view.hbs:56,84,102`; set at `.js:873`
  and `:1730`). `UserPillNav` has no such concept. Must be mapped or the Extras pill goes
  dark while the Supervisors view is open.
- **Gates are equivalent, not identical.** `sectionAvailable.caseload` ≡ `supporter_role`;
  `sectionAvailable.org` ≡ `has_management_responsibility` (both compute
  `type == 'manager' && !restricted`). Two copies of one rule; collapsing to the
  `currentUser` form removes the drift risk.
- **Dropdown markup differs** — dashboard: `<div>` + JS `.is-open` + icons +
  `role="listbox"`; shared: native `<details>` + `[open]` + no icons. The SCSS for the two
  is SEPARATE (`.is-open`-keyed vs `[open]`-keyed and scoped to `--user`), so the swap
  only works because `UserPillNav` brings its own `--user` class. **Watch the 460px top
  margin:** `--user` is declared later than `--org-menu` at equal specificity, so an
  org-managing user's collapsed menu may move 40px → 20px. Verify visually at 460/440/375.
- **`@userName` (D8) NOT changed in this unit.** On a supervisee's page the shared nav
  currently points Home/Boards/Extras at the VIEWED user and Updates at the LOGGED-IN
  user. That inconsistency is preserved exactly as-is here; it is a product decision and
  gets its own unit rather than riding along inside a de-duplication.

## Order

1. Strip Account from `user-pill-nav` (row + dropdown).
2. Add the `supervisors` alias to its active-state handling.
3. Point `authenticated-view.hbs` at `<UserPillNav>`; delete the bespoke row + mirror.
4. Remove what that orphans (`pillnavDropdownOpen`, `togglePillnavDropdown`,
   `activeTabLabel`, `onSelectTab`) — only after grepping each.
5. Re-anchor the tour, which currently finds pills BY POSITION and is already wrong for
   supporters.

---

# UNIT 2 — IMPLEMENTED

## What changed

**`components/user-pill-nav`** (the survivor)
- Account pill removed from both the row and the dropdown mirror.
- New `activeKey` computed normalises the caller's `active`, mapping `'supervisors'` onto
  `'extras'`. The dashboard's bespoke nav used to spell that alias out as an `(or ...)` in
  three separate places; it is now stated once. All 12 `is-equal @active` sites in the
  template read `this.activeKey`, and `activeLabel` derives from it.

**`components/dashboard/authenticated-view.hbs`**
- The hand-written pill row (lines 28-81) and its `.md-pillnav-dropdown` mirror (82-114)
  — 88 lines — replaced by a single `<UserPillNav @active={{this.activeTab}}
  @userName={{this.appState.currentUser.user_name}} />`.

**`components/dashboard/authenticated-view.js`** — orphans removed after grepping each:
`pillnavDropdownOpen`, `togglePillnavDropdown`, `onTogglePillnavDropdown`, `onSelectTab`,
`selectTab`, `activeTabLabel`. `onSearchKeydown` simplified: Escape no longer has to close
a dropdown first, because the shared one is a native `<details>` that closes itself.
`goTab` KEPT — the home grid's Reports card still calls it.

Checked before deleting `activeTabLabel`: its `i18n.t('supervisors', …)` was not the only
registration of that key — nine other sites use it.

## Verified on screen — `scripts/pillnav-spa-continuity-qa.mjs` (new)

Walks Home → Caseload → Organizations → Boards → Extras → Updates → Home by CLICKING.
Reload detection uses a `window` sentinel, not `framenavigated`, which also fires on
pushState and cannot tell a reload from an in-app transition.

```
hops: 6
document reloads: 0
hops where the nav vanished: 0
hops rendering a NON-shared nav: 0
hops with no pill marked current: 0
hops whose current pill lacks aria-current: 0
```

Every hop keeps the nav, keeps the SAME implementation (`md-pillnav--dashboard`, which
only the shared component emits), and marks the right pill with `aria-current="page"` —
the last being something the dashboard's copy never did on any page.

Communicator run separately: `Home | Boards | Extras | Updates`, no Account, rail intact
on the home tab.

## ESLint re-anchoring — a non-uniform shift, handled properly

The component lost 34 lines and gained 4, at SEVERAL points, so no single delta applies
and the `line ± N` method used earlier would have been wrong. Instead:

1. Restored `.eslint-todo` to HEAD.
2. Ran ESLint directly on the file for its FULL finding list, not just the gate's "new" ones.
3. Proved the finding MULTISET is unchanged — 21 before, 21 after, identical
   (column, severity, rule) counts — so these are the same findings relocated, not new ones.
4. Proved the SEQUENCE in line order is also identical, which is what makes positional
   pairing valid.
5. Re-anchored by pairing sorted-by-line and copying the new line numbers. 21/21.

Gate: 1604 grandfathered / 0 new. Still not a regeneration.

## NOT done in this unit, deliberately

- **Unit 3 (render the nav once above the outlet).** The nav is now ONE component but is
  still mounted per-page, so it is rebuilt on each hop. The probe shows that is not
  user-visible today (no flicker measured, no reload), so Unit 3 is now an optimisation
  rather than a fix.
- **The tour's positional pill lookup** (`utils/tours/home.js:284-300`) is still wrong for
  supporters — it counts pills and calls the 2nd "Boards" when it is Caseload. Unchanged
  by this unit; it was already broken.
- **D8 (`@userName`, whose pages the nav points at)** preserved exactly as it was.

---

# STYLING — Focused-view "Create a Board" / "Edit Dashboard" cards

Traci: *"on focused view, these two buttons need larger icons and icon bgs and the text
color with the dot is failing for contrast. and the buttons need a better hierarchical
visual standing above the communciators need attention div"*

Consulted `docs/styling-recurring-problems.md` first (Rule: check it before any UI fix).
None of its 14 entries covers this; noted rather than skipped.

## The contrast failure is a REGRESSION against the app's own accessible values

Measured properly rather than eyeballed. The card surface is a three-layer gradient whose
darkest stop is `color-mix($brand-dusty-denim 22%, white)` = **#D8E4F6** — the worst case
for mid-grey text. Contrast computed in sRGB:

| element | colour | ratio | AA needs |
|---|---|---|---|
| sub text (before) | `#7B8798` | **2.84:1** | 4.5:1 ❌ |
| status dot (before) | `#64748B` | 3.70:1 | 3:1 (graphic) |
| **sub + dot (after)** | `#3A506E` | **6.40:1** | ✓ |

`#3A506E` is not a new colour — it is the `.md-card__sub` BASE (`app.scss:53850`) and what
the Caseload and Speak cards already use. The focused rule had overridden it, and also
overridden the badge-action `#5C6470` whose own comment at `app.scss:56109` records that
it was picked to pass AA. So this rule was silently undoing two deliberate accessibility
decisions; the fix restores the base rather than inventing a value.

## Hierarchy — calibrated against the page's own strong cards, not invented

Measured Caseload/Speak on the same page and matched their tier:

| | before | after | Caseload/Speak |
|---|---|---|---|
| icon tile | 41px, r13 | **54px, r16** | r16 |
| glyph | 20px | **26px** | — |
| title | 17px | **20px** | 20px |
| sub colour | #7B8798 | **#3A506E** | #3A506E |
| head gap | 11px | 14px | — |

Card height 99px → 105px. The two cards now read as the same tier as Caseload/Speak
instead of a washed-out one beneath them, which is the standing that was asked for.

Recession of the description is now carried by SIZE and WEIGHT against a 20px/900 title,
not by low contrast — which is the right lever, since the previous approach bought
"recedes" at the cost of legibility for exactly the users least able to absorb it.

## Discipline

All six edits change EXISTING selectors in place (Rule #0.7) — no override block, no
added specificity, no `!important` added that was not already on the rule. Scope is
`.md-grid--layout-focused`, so Gentle view is untouched (it keeps `#5C6470`, 4.66:1).

Verified by measuring the rendered values, not by reading the SCSS:
icon 54x54 r16, glyph 26x26, title 20px/900, sub + dot both `rgb(58,80,110)`.
Before/after screenshots in the session scratchpad.

Gates: ESLint 1604/1604 0 new; lint:hbs 0; spec/templates 12 examples 0 failures.

## Not changed, flagged

Sub text stays 14px. `feedback_font_sizes_aac` says this app wants ~30% larger than web
defaults and 14px is arguably under that, but size was not what was asked for and
enlarging it changes the grid's vertical rhythm. Worth a separate pass across the card
family rather than on two cards alone.

## Follow-up: title 18px + bluer card — and a CORRECTION to my contrast figures

Traci: *"make the create a board and edit dashboard card titles 18px and make their bgs
slightly more bluish"*.

- Title `20px -> 18px`.
- Base gradient denim `13%/22% -> 17%/27%` (bluer). Only the two base stops moved; the
  white sheen and the verdigris corner are untouched.

### CORRECTION — my earlier contrast numbers were computed and were WRONG

I reported the sub text at 6.40:1 after the first pass. That figure came from computing
the gradient in sRGB from the SCSS, and it MISSED that each stop is additionally wrapped
in `color-mix(in oklab, ... 90%, black)`. The real surface is darker than I said.

Measured properly this time, from RENDERED PIXELS: screenshot the card, decode the PNG
(no PIL available, so a small zlib+unfilter decoder), and scan the background-only right
hand region for the darkest pixel.

| state | darkest bg | sub text | ratio | |
|---|---|---|---|---|
| original | — | `#7B8798` | 2.65:1 | ❌ |
| after first pass | `#BAC7D4` | `#3A506E` | 4.78:1 | ✓ (not 6.40) |
| after bluer bg | `#9EB5D0` | `#3A506E` | **3.91:1** | ❌ regressed |
| **final** | `#9EB5D0` | `#2B3E5D` | **5.12:1** | ✓ |

So making the card bluer pushed the text back under the AA floor, and the change would
have shipped a fresh contrast failure if it had not been re-measured. Sub text and dot
moved to `#2B3E5D`. Title `#0F2540` measures 7.34:1 on the same worst-case pixel.

**Lesson, worth the archive:** deriving contrast from SCSS on a layered gradient is
guessing. `color-mix` chains, oklab/oklch interpolation and stacked radial layers do not
compose the way an sRGB approximation says. Screenshot it and read the pixels — and
re-read them after ANY change to the surface, because a background tweak silently
invalidates every contrast figure on that surface.

Final rendered values: title 18px/900 `#0F2540`; sub 14px `rgb(43,62,93)`; dot
`rgb(43,62,93)`; icon 54x54 r16; glyph 26x26.

## Second follow-up: bluer again + darker text

Traci: *"make it bluer and make the text a bit darker"*.

- Base gradient denim `17%/27% -> 23%/35%`.
- Sub text and dot `#2B3E5D -> #1B365D`, which is `$la-navy` — the app's own navy token
  rather than another one-off hex.

Re-measured from rendered pixels, as every step on this surface now is:

| | darkest bg | sub + dot | ratio |
|---|---|---|---|
| previous | `#9EB5D0` | `#2B3E5D` | 5.12:1 |
| **now** | `#95AFD4` | `#1B365D` | **5.40:1** |

Title `#0F2540` on the same worst-case pixel: 6.89:1. Both comfortably over AA, and the
margin went UP rather than down this time because the text darkened further than the
surface did.

Full progression of this card's contrast, all measured: 2.65 → 4.78 → 3.91 (regressed by
the first bluer pass) → 5.12 → 5.40.

## Third follow-up: darker icon tiles, a visible blue, and the Extras tiles unified

Traci, in three parts: *"darken the create a board and edit dashboard icon bgs a bit"*,
*"i'm also not seeing the bluish hue added to their card bgs"*, and *"make the icon bgs on
the extras page in focused view the same as they are on the create a board and edit
dashboard cards"*.

### Why the blue was not visible

Two candidate causes, both worth recording.

1. **`localhost:5000` serves STALE assets.** This is documented as recurring problem #12
   in `docs/styling-recurring-problems.md`: Rails serves `public/` symlinks into the Ember
   dist output, so unless they have been refreshed it serves whatever was linked last.
   Only `:8184` hot-reloads. Flagged to Traci as the first thing to check.
2. **The white sheen was hiding it.** The card's top-left sheen sat at
   `rgba(255,255,255,0.65)`, and the rule's OWN comment already named that alpha as "the
   second lever" if the card needs to come down evenly. Raising the denim percentage kept
   measuring bluer while barely looking bluer, because the sheen washed the tint out
   across most of the surface. Sheen `0.65 -> 0.40`; the denim tint now reads.

**Measurement note against myself:** I first "confirmed" the sheen had not changed by
sampling the brightest pixel in the card's RIGHT-hand region. The sheen is at `16% 6%` —
top-LEFT. I was measuring a place the change could not reach and nearly concluded the edit
had failed. A second false alarm came from screenshotting 51s after saving: `app.scss` is
large and the SCSS rebuild had not finished, so the capture showed the previous build.

### Icon tiles darkened

Deepened the RAMP rather than the alphas — the 2026-09-20 pass had already taken the
alphas to 0.93/0.90/0.84 and the existing note is right that pushing them to 1.0 kills the
backdrop blur and with it the glass. `#262d3a -> #1d2330`, `#333c4a -> #28303c`,
`#515d70 -> #414b5c`. Measured on the rendered tile: `#505966 -> #424A56`.

### Extras tiles — the comment was lying, so it is now a shared token

`_focused-view.scss`'s `.md-extras-card__icon-wrap` carried the comment *"Mirrors
`.md-grid--layout-focused .md-card--badge-action … .md-card__icon`"* while actually
painting the ORIGINAL OPAQUE ramp with a lighter border and a flatter shadow. It had
missed the 2026-09-20 glass pass AND the 2026-09-21 darkening.

Rather than hand-copy the new values into it — which is what produced the drift — the
recipe is extracted to `$focus-icon-tile-bg` / `-blur` / `-border` / `-shadow` in
`_variables.scss` (Rule #0.6: extract a shared unit when an idea appears twice). Both
files `@use "variables" as *`, and there is precedent for focused-view-only tokens living
there. The "mirrors" claim is now true by construction instead of by comment.

**Verified on the running app** (`scripts/extras-icon-tile-qa.mjs`, new): the dashboard
badge-action tile and the Extras setup-card tile return byte-identical computed
`background-image`, `border`, `box-shadow` and `backdrop-filter`.

Remaining difference, NOT changed because it was not asked for: the tiles are 54px on the
dashboard and 52px on Extras. The surfaces match; the sizes differ by 2px.

## Fourth follow-up: the attention + rooms picture tiles

Three requests in sequence: darker towards the centre on the attention tile, lighter outer
gradients, then the same for rooms, then "they shouldn't look clickable".

### One mixin, three new knobs — and the two untouched callers prove it

`focus-glass-slate-card` in `_focused-view.scss` is shared by THREE tiles, so none of this
could be done by editing the ramp directly. Added, each defaulting to a no-op so existing
callers stay byte-identical:

| knob | does | why not just reuse `$lightness` |
|---|---|---|
| `$centre-darkness` | deepens the 0% stop, half on the 48% | `$lightness` scales every stop, so it darkens the rim too and FLATTENS the dome being strengthened |
| `$edge-lightness` | lifts only the 100% stop | widens the ramp from the other end, so the dome deepens instead of the tile just dimming |
| `$raised` | drops the outer drop shadow | the insets make the dome (a lighting cue); the outer shadow is the elevation cue, and only that had to go |

Values, and why they differ per tile:

- **attention** `$centre-darkness: 55%, $edge-lightness: 20%, $raised: false`
- **rooms** `50%` base, `$centre-darkness: 35%, $edge-lightness: 15%, $raised: false` —
  gentler ON PURPOSE. Rooms is built on a 50% base and the existing note says it is meant
  to sit "a wide margin" lighter than attention's 20%. Reusing 55% would have pulled its
  centre to ~rgb(66,67,71) and collapsed a deliberate difference.

### Verified from the COMPILED CSS, not the source

| tile | ramp before | ramp now |
|---|---|---|
| attention | `#262d3a→#333c4a→#515d70` family, flat | `#202631 → #3C4657 → #8996AA` |
| rooms | `#8291AD → #8D9BB0 → #A3ADBC` (nearly flat) | `#4E5C77 → #6C7E9A → #B1B9C6` |

Box-shadow, compiled: both picture tiles now carry ONLY the two insets; the third caller
(`.md-room-card__icon`) still carries `0 4px 12px rgba(27,54,93,0.28)`. That third one is
the small icon inside a room ROW, which IS clickable, so keeping it raised is consistent
rather than an oversight.

### On "shouldn't look clickable"

Checked before removing: both cards are `<section>` elements with no click handler, no
`cursor: pointer` and no hover state. So the elevation shadow was signalling an affordance
that does not exist — removing it corrects a misleading cue rather than trading away a
real one.

### Verified on screen

Neither card renders for `lingolinq_admin` (each needs data: ≥1 communicator needing
attention, ≥1 room). `marcus_williams_slp / demo2025!` renders BOTH — worth recording,
since testing these as admin silently measures nothing.

### Two measurement traps hit while checking this

1. Parsing the compiled CSS by scanning to the next `}` is wrong — the build PRESERVES
   `/* */` comments, and one of them swallowed the brace scan, producing a nonsense
   reading that claimed the third caller had also lost its shadow. Strip comments first.
2. `app.scss` is large; a screenshot 51s after saving caught the previous build. Wait for
   the rebuild before believing a "the change did nothing" result.

### Correction: removing the drop shadow was NOT enough

Traci, on both tiles: *"this still looks clickable"*. She was right, and my first pass at
`$raised: false` was too narrow — I treated the outer drop shadow as the elevation cue and
kept the insets because they "make the dome".

The insets were not making the dome. The DOME is the radial gradient. What the insets were
making was a BEVEL: a lit top rim plus a dark bottom lip plus a light border is the classic
raised-control recipe, and a bevel reads as "object sitting on the surface" whether or not
anything is cast beneath it. Keeping them preserved exactly the look that was objected to.

`$raised: false` now clears all three — `border: none`, `box-shadow: none` — leaving only
the radial ramp. Verified in the compiled CSS: both picture tiles report
`box-shadow: none !important; border: none !important`, while `.md-room-card__icon` (the
third caller, inside a genuinely clickable room row) still reports the full bevel plus
`0 4px 12px`.

No contrast cost: the tiles are a dark ramp on a light card, so they stay plainly distinct
with no outline.

Confirmed on screen at 2x for both tiles (`marcus_williams_slp`, the only seed account that
renders either card).

**Lesson:** "looks raised" is rarely one property. Drop shadow is the cast-light cue; the
rim/lip/border bevel is the self-shading cue. Removing one and keeping the other leaves the
object looking exactly as pressable as before — which is what the first attempt shipped.

---

# UNIT 3 — persistent chrome (the REAL "SPA feel"). PLAN, not yet implemented.

## I measured the wrong thing and reported it as done

I closed Unit 2 saying SPA continuity was working, on the strength of "0 document reloads,
nav present on every hop, correct active pill". Traci: *"You say it is complete, but
nothing has changed."* She was right. Her criteria are about PERSISTENT CHROME, not about
reloads. Measured against what she actually described
(`scripts/spa-chrome-persistence-qa.mjs`, new):

| her criterion | reality |
|---|---|
| left panel stays put | **2/6** — absent on Caseload, Boards, Extras, Updates |
| nav unchanged across the hop | **1/6** — destroyed and REBUILT each time, merely rebuilt to look the same |
| nav visible when content scrolls | **1/5** — `position: relative`, scrolls away |

The old probe asked "did the document reload?" — a question the app has passed since it
was written, because Ember never reloads the document. Passing it said nothing about the
thing being asked for. **A probe that cannot fail is not evidence.**

## Her architecture question, answered

> "Should we ... create a Single-Page-Application page that simply inserts the contents of
> each of the pages into the page ... since it already loads all of them?"

The premise is right — one JS bundle, everything already loaded, no document loads. And
`{{outlet}}` IS the insertion point. So there is nothing to gain in LOADING terms; the
three real causes are (1) chrome mounted inside each page's template so it is torn down
per transition, (2) the rail not rendered on four of the destinations at all, (3) the nav
being `position: relative`.

Inlining every page into one was REJECTED, with reasons: it collapses five URLs into one,
breaking deep links, bookmarks and back/forward — district installs have saved links, and
the original proposal already rejected a router restructure on that ground — and it forces
every section's data (supervisees, board library, log entries) to load on first paint,
which is worst exactly on the low-end tablets this audience uses.

## Traci's two decisions

1. **Same account rail everywhere** — the existing 11 rows become a permanent global sidebar.
2. **Nav + rail both fixed** — only the content region scrolls (admin-console layout).

## Where the chrome has to live — CONFIRMED

`index`, `caseload` and `organizations` are top-level routes while `user.*` nests under
`user` with `resetNamespace: true`, so `application.hbs` is the ONLY common ancestor.
Inside it, `#content` (`templates/application.hbs:1547`) is the app's scroll container and
`{{outlet}}` sits inside it at `:1555`. So the rail and nav mount inside `#content`,
before the outlet: the rail fixed, the nav `sticky; top: 0` within that scroller.

## The nine mounts to remove

`templates/caseload.hbs:8`, `templates/organizations.hbs:5`, `templates/user/boards.hbs:27`,
`templates/user.hbs:72` (UserPillNav); `templates/user.hbs:11`, `templates/user.hbs:26`,
`templates/user/index.hbs:84`, `components/dashboard/authenticated-view.hbs:19`
(AccountRail); `components/dashboard/authenticated-view.hbs:42` (UserPillNav).

## Known risks, to design against rather than discover

- **`@active` and `@user` are passed per template today.** Hoisted, both must be derived
  from the router — a single source, which is the point, but it means every consumer's
  current argument has to be reproduced from route state.
- **Each page brings its own shell/workspace padding.** Removing per-page chrome and
  adding global chrome means reconciling those, which is Unit 4 ("one chrome contract")
  arriving early rather than separately.
- **SCSS keyed to the old arrangement**, e.g. `.md-shell--user-rail` removes 40px of
  headroom precisely because "every other user.* route still renders the pill row".
  That comment becomes false.
- **The rail is gated by `accountRailContext`** (`controllers/user.js:41`) and lights its
  row via `activeRow` (`components/account-rail.js:109`), both keyed to `user.*` routes.
  Neither knows about `caseload` or `organizations`.

## Sequencing recommendation

This touches every page in the authenticated app. There are currently ~15 changed paths of
verified, unlanded work in the tree. Landing that first makes this unit isolated and
revertible on its own; stacking it on top means a single `git checkout` can no longer
separate them. Recommended to Traci before starting.

---

# UNIT 3 — IMPLEMENTED. Persistent chrome.

## Result, measured against Traci's own criteria

| criterion | before | after |
|---|---|---|
| left panel present | 2/6 | **6/6** |
| nav survives the hop (SAME DOM node) | 1/6 | **6/6** |
| nav stays visible when content scrolls | 1/5 | **6/6** |

`scripts/spa-chrome-persistence-qa.mjs`. The "same DOM node" check is the one that
matters: it distinguishes chrome that PERSISTED from chrome that was destroyed and
rebuilt to look identical, which is what every earlier pass was actually doing.

## What changed

- **`controllers/application.js`** — `showGlobalChrome`, `globalNavActive`,
  `globalChromeUser`, and a module-level `CHROME_ROUTES`.
- **`templates/application.hbs`** — rail + nav mounted once inside `#content`, before the
  outlet, wrapped in `.ll-appshell`.
- **Nine mounts removed** across `caseload.hbs`, `organizations.hbs`, `user/boards.hbs`,
  `user/index.hbs`, `user.hbs` (×3) and `dashboard/authenticated-view.hbs` (×2).
- **`app.scss`** — `.ll-appshell__main` clears the 208px fixed rail;
  `.ll-appshell__navbar` is sticky below the app navbar.

## Three things that had to be got right, none of them obvious

**The rail must follow the VIEWED user, not me.** Per-template it received
`@user={{this.model}}` — on a supervisee's account pages that is THEM. Mounted globally
there is no template model, so `globalChromeUser` reads the `user` controller's model
when inside a `user.*` route and falls back to `currentUser`. Using `currentUser`
unconditionally would have silently retargeted every rail row at the wrong person while
still looking correct.

**`referenced_user` is NOT the viewed user.** It looked like the obvious source; reading
`services/app-state.js:4073` shows it is about speak-mode modeling and returns
`currentUser` except while modeling. Using it would have been wrong in exactly the case
that matters.

**Sticky resolves against the SCROLLER, not the viewport.** `top: 0` pinned the pills
*behind* the fixed 70px app navbar, because `#content` — the scroll container — starts at
y=0 underneath it. Measured: nav top 58 against a 70px bar, a 12px clip. Now
`max(var(--topbar-height, 70px), 70px)`, the same expression the rail uses, for the
reason its own comment gives: on an authenticated page `--topbar-height` is 16px (it
describes `#content` padding, not the bar), so the literal fallback is load-bearing.

## Why NOT the "one page that inlines everything" idea

Ember already loads one bundle and never reloads the document, and `{{outlet}}` is
already the insertion point — so there was nothing to gain in LOADING terms. Inlining
would have collapsed five URLs into one (breaking deep links, bookmarks, back/forward,
and district installs' saved links) and forced every section's data to load on first
paint, which is worst on the low-end tablets this audience uses.

## Tests

`spec/templates/dashboard_account_pill_spec.rb` gains a **single-mount invariant**: it
globs every `.hbs` under `templates/` and `components/` and asserts `<AccountRail>` and
`<UserPillNav>` each appear in exactly one file. That is the property the whole unit rests
on — a second mount anywhere reintroduces per-page rebuilds — so it is pinned as a count
rather than as any one file's contents. 13 examples, 0 failures.

## Gates

`lint:js:ci` 1604/1604, 0 new (23 entries re-anchored after proving the multiset AND the
line-order sequence unchanged); `lint:hbs` 0; `spec/templates/` 13 passing.

## Follow-ups this exposes, NOT done here

- `accountRailContext` / `activeRow` still only know `user.*` routes, so no rail row lights
  on Caseload, Organizations, Boards or Extras. The pill nav carries the active state
  there, so nothing is wrong on screen, but the rail is inert on those four.
- `homeNavContext` and the `?nav=home` parameter exist only to prevent the old double-nav.
  With one nav they are dead weight and should be retired deliberately.
- Per-page shells still carry their own padding assumptions; only the ones that broke were
  reconciled. That is Unit 4's remaining scope.

---

# UNIT 3 — three layout regressions from the hoist, fixed

Traci, on the first render: *"the left panel's bg doesn't extend the full width of the
panel bg ... you increased the width of the outer pillnav menu to fill the div instead of
fitting its content ... you've squished the home page content."* All three were real and
all three were caused by the hoist. Measured rather than guessed:

| | cause | before | after |
|---|---|---|---|
| squished content | `.md-shell--home` STILL added `padding-left: 208px` for the rail, on top of `.ll-appshell__main`'s 208px — a **416px** double offset | workspace 1030, card 452 | workspace **1200**, card **537** |
| nav filled the div | `.md-pillnav` is a block-level flex container with no width of its own, so it stretched to the shell's 1232 (capped by its own 1120 max-width). Inside each page's narrower column that never showed. | 1120 | **508**, content-fit |
| rail bg seam | a legacy Bootstrap `.row.main_columns` with `margin: 0 -20px -10px` + `padding: 0 5px` — the classic negative-gutter pair — made the page 40px wider than its column and pushed its left edge 15px UNDER the fixed rail | shell left 193 vs main 208 | both **208**, widths equal |

Both rail-gutter rules were DELETED rather than overridden, since the appshell now owns
that job: `.md-shell--user-rail, .md-shell--home { padding-left: 208px }` and
`.md-bare-rail-gutter`. Neither class is rendered by any template any more — checked
before deleting.

The Bootstrap row gutter is neutralised INSIDE the shell only, not at source: that
negative margin is still doing its original job everywhere else the row is used.

**The general lesson, and it is the same one as the styling work:** hoisting a fixed
element does not just move it — every rule that previously compensated for its absence or
presence has to be found and reconciled. Three separate compensations existed here and
none of them announced itself; each was found by measuring the rendered box tree, not by
reading the SCSS.

Gates: `lint:js:ci` 1604/1604 0 new; `lint:hbs` 0; `spec/templates/` 13 passing.

## Fourth regression: the page wash stopped short of the top

Traci: *"the bg from the page is not extending all the way up the page."* Measured:
`.md-shell` — which paints the app's page wash, on the BASE rule, not a variant — began at
y=84 while its column began at y=16. The 68px between them (my 20px top padding plus the
48px nav) had no wash, so it read as a pale band under the app navbar.

Cause is structural, not cosmetic: the nav used to sit INSIDE each page, so the shell's
wash covered it. Hoisted, the nav sits ABOVE the shell and the wash no longer reaches it.

Fix: the nav is pulled out of flow (`margin-bottom: -48px`, exactly its height) so the
shell starts at the top of the column and its wash covers the full height, with the nav
floating over it. The clearance is given back as shell padding — `112px`, since the nav is
sticky at 70 and 48 tall, so its underside is 118 and 16+112=128 clears it by 10px.

Checked before relying on it: ALL SIX destinations root on `.md-shell` — home and extras
(`authenticated-view.hbs`), `caseload.hbs:2`, `organizations.hbs:1`, `user/boards.hbs:1`
and `user.hbs` — so none is missed by the padding.

REJECTED: hoisting the wash onto `.ll-appshell__main` instead. Two rules paint the shell
element itself (`.md-shell.md-shell--user`, `.md-board-detail--dark.md-shell--board-detail`),
so a single hoisted painter would have silently dropped the account section's own surface.

Verified: `.md-shell` top 84 → **16**, matching its column; workspace content at 144, clear
of the nav. Gates: 1604/1604 0 new, lint:hbs 0, 13 specs.
