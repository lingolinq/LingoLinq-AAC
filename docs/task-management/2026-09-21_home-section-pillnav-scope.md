# Scoping the pill nav to the Home section (2026-09-21)

Branch: `traci/styling/classic-view-overlay`. Baseline HEAD `0f1bb720d`.

## The request (verbatim, 2026-09-21)

> there's a caviat to my structure that we need to fix. the pillnav menu should only show
> when the Home button is selected on the left panel. If the user selects other buttons on
> the panel, the pillnav menu should be hidden on those pages. And the Home button on the
> pillnav menu should read Dashboard. So when you click Home -> it consists of all of the
> elements you need on your home page and the pillnav only persists when your are on the
> pillnav menu. Then if you select Updates, it shouldn't highlight the Logs item on the left
> panel because it was navigated from the pillnav menu.

Three requirements:

- **R1** The pill nav renders only on the Home destination and the destinations the pill nav
  itself offers. On a rail destination (Account, Goals, Logs-from-the-rail, Profile, Reports,
  Settings, Subscription, Supervising) it is hidden.
- **R2** The pill nav's Home item reads **Dashboard**.
- **R3** Arriving at Updates from the pill nav must not light the rail's **Logs** row.

## Consulted before diagnosing

`docs/task-management/LEARNINGS.md` and `learnings-archive/2026-09.md`, keywords pillnav /
account rail / chrome. The on-surface entry is **"Retiring the account pill nav for the
account rail (2026-09-21)"** (`learnings-archive/2026-09.md:1271`). Four of its lessons bear
directly on this change and are applied below:

- *A nav can announce one thing and highlight another, and only a browser will tell you.* The
  visible highlight is `<LinkTo @activeClass>`; `activeRow` only drives `aria-current`. Ten
  green unit tests missed the split. **Applied:** the fix moves the Home row off
  `@current-when` onto `activeRow` so both halves come from one value, and it is verified in a
  real browser, not only in QUnit.
- *`@current-when` cannot match a route that needs more dynamic segments than the link
  supplies.* **Applied:** ruled out widening `homeCurrentWhen` with `user.boards` / `user.extras`
  (the row supplies no model where those need one) — see "Rejected" below.
- *Two lists that must move together will not, unless a test makes them.* **Applied:** the
  route→pill map becomes ONE exported function used by both consumers, not a second list.
- *A nested PATH does not mean a nested ROUTE NAME.* **Applied:** every route name below was
  read from the running app, not inferred from its URL.

## Fact sheet

Measured with `app/frontend/scripts/home-section-nav-qa.mjs` against the running dev app
(ember 8184, user `marcus_williams_slp`, 1280x900), HEAD `0f1bb720d`. Raw run in
"Baseline measurement" below.

**(a) Where is the pill nav's visibility actually READ?**
**CONFIRMED** — nowhere. `app/frontend/app/templates/application.hbs:1566-1570` renders
`.ll-appshell__navbar` unconditionally inside `{{#if this.showGlobalChrome}}`, and
`showGlobalChrome` (`app/frontend/app/controllers/application.js:2256`) tests membership of
`CHROME_ROUTES` (`:6-12`), a 22-route list that includes every account page. There is no
per-route nav gate to modify; one has to be introduced. Measured: the nav renders on all five
account pages with **no active pill**.

**(b) What are ALL the shapes the "which pill is current" value can hold?**
**CONFIRMED** — `globalNavActive` (`controllers/application.js:2268-2281`) is the only writer
and returns exactly: `'home'` (`index`, `user.home`), `'caseload'`, `'organizations'`,
`'boards'` (`user.boards`), `'extras'` (`user.extras`), `'updates'` (`user.logs` **and**
`?nav=home` in `router.currentURL`), or `null`. That set is one-for-one with the pills
`components/user-pill-nav.hbs` renders, and `null` covers precisely the account-section
routes. So "is this a Home-section page" needs no new list: it is `globalNavActive != null`.

**(c) Cross-file claims, each checked:**

| Claim | Verdict |
|---|---|
| The rail's Home row highlight comes from `@current-when`, not `activeRow` | **CONFIRMED** `components/account-rail.hbs:33` — `@current-when={{this.homeCurrentWhen}} @activeClass="is-active"`, `activeRow` only sets `aria-current` |
| `homeCurrentWhen` is `'index user.home'` and cannot be widened to `user.boards`/`user.extras` | **CONFIRMED** `components/account-rail.js:20`; the row links `@route="index"` with no model, and those routes need `:user_id` — the documented `@current-when` arity failure (`account-rail.js:29-34`) |
| `user.logs?nav=home` currently lights the rail's Logs row | **CONFIRMED by measurement** — `lit=Logs aria=Logs` on `/USER/logs?type=note&nav=home` |
| `.ll-appshell .md-shell { padding-top: 112px }` applies on the account pages, so hiding the nav leaves dead clearance | **CONFIRMED by measurement** — `pad=112px` on all five account pages (`app/frontend/app/styles/app.scss:109692`) |
| The base `.md-shell` padding the 112px replaced is `3rem` | **CONFIRMED** `app/styles/app.scss:46347,46389` (`#content .ember-view > .md-shell, #content > .md-shell`) |
| A `dashboard` translation key already exists in every shipped locale | **CONFIRMED** — `public/locales/en.json:273` `"dashboard": "Dashboard"`, present in all 13 locale files |
| `nav=home` is a real query param on the logs controller, not an invented one | **CONFIRMED** `app/controllers/user/logs.js:32,62` |
| The `nav=home` regex exists in more than one place already | **CONFIRMED** — `controllers/application.js:2277` and `controllers/user.js:96-106` (`homeNavContext`) |
| Caseload's shell is unaffected by the 112px rule | **CONFIRMED by measurement** — `pad=0px` there; some `.md-shell--caseload` rule already wins. Caseload KEEPS the nav, so nothing changes for it either way |

**ASSUMED, and not load-bearing:** that lighting the rail's Home row on Caseload /
Organizations / Boards / Extras is what the user wants. The request states it only for
Updates. It follows from the same rule ("the pill nav belongs to Home"), it closes the
"rail is inert on four destinations" item from the previous handoff, and it is flagged for
the user rather than treated as settled. If it is wrong, the mapping is one `if`.

## Baseline measurement (HEAD 0f1bb720d, before any change)

```
HOME  home                /
    nav: SHOWN active=Home   rail: shown   lit=Home Page   aria=Home Page
    shell top=16 pad=112px firstContent=144
HOME  caseload            /caseload
    nav: SHOWN active=Caseload   rail: shown   lit=null   aria=null
    shell top=16 pad=0px firstContent=32
HOME  boards              /marcus_williams_slp/boards
    nav: SHOWN active=Boards   rail: shown   lit=null   aria=null
    shell top=26 pad=112px firstContent=178
HOME  extras              /marcus_williams_slp/extras
    nav: SHOWN active=Extras   rail: shown   lit=null   aria=null
    shell top=16 pad=112px firstContent=144
HOME  updates (from the pill) /marcus_williams_slp/logs?type=note&nav=home
    nav: SHOWN active=Updates   rail: shown   lit=Logs   aria=Logs        <-- R3 defect
    shell top=46 pad=112px firstContent=198   homenav pad=64px
ACCT  account             /marcus_williams_slp
    nav: SHOWN active=null   rail: shown   lit=Account   aria=Account     <-- R1 defect
ACCT  logs (from the rail)/marcus_williams_slp/logs
    nav: SHOWN active=null   rail: shown   lit=Logs   aria=Logs           <-- R1 defect
ACCT  goals               /marcus_williams_slp/goals
    nav: SHOWN active=null   rail: shown   lit=Goals   aria=Goals         <-- R1 defect
ACCT  reports             /marcus_williams_slp/stats
    nav: SHOWN active=null   rail: shown   lit=Reports   aria=Reports     <-- R1 defect
ACCT  settings            /marcus_williams_slp/preferences
    nav: SHOWN active=null   rail: shown   lit=Settings   aria=Settings   <-- R1 defect

pill labels: ["Home","Caseload","Boards","Extras","Updates"]
```

A nav with no active pill on five pages is the state R1 describes: it is not this section's
nav, and it does not even claim to be.

## Diagnosis

One cause behind all three symptoms: **the 2026-09-21 hoist mounted the pill nav as APP
chrome when it is SECTION chrome.** Mounted once above the outlet
(`templates/application.hbs:1566`), it inherited `showGlobalChrome`'s 22-route reach, which was
written for the RAIL — the rail genuinely does belong on all of them. The nav does not, and
the rail's row map was never told that a pill-nav arrival is still the Home section
(`components/account-rail.js:38,69` map every `user.logs*` route to the Logs row with no
regard for how the user got there).

## Proposal

### A shared unit for "which pill is this page"

New `app/frontend/app/utils/primary_nav.js`:

- `pillForRoute(route, url)` → the pill name or `null`, lifted verbatim from `globalNavActive`.
- `isHomeNavArrival(route, url)` → the `user.logs` + `?nav=home` test, which the regex in
  `controllers/application.js:2277` and `controllers/user.js:104` each spell out today.

Three consumers read it: `controllers/application.js` (`globalNavActive`, and the new
`showPillNav`), `components/account-rail.js` (`activeRow`), `controllers/user.js`
(`homeNavContext`). This is the lesson "two lists that must move together will not" applied
before the fact rather than after.

### R1 — the nav renders only in the Home section

`controllers/application.js`: `showPillNav: !!globalNavActive`.
`templates/application.hbs`: wrap `.ll-appshell__navbar` in `{{#if this.showPillNav}}`, and put
`ll-appshell--no-nav` on `.ll-appshell` when it is false.

Layout, because the clearance is the nav's: `app/styles/app.scss:109692` becomes

```scss
.ll-appshell { --ll-nav-clearance: 112px; }
.ll-appshell--no-nav { --ll-nav-clearance: 3rem; }   /* the base .md-shell value */
.ll-appshell .md-shell { padding-top: var(--ll-nav-clearance) !important; }
```

The existing selector is edited in place, not overridden (Rule #0.7); `3rem` is the value the
base rule gives a shell with no floating nav over it, i.e. the pre-hoist geometry.

### R2 — the Home pill reads Dashboard

`components/user-pill-nav.hbs` (pill row `:5,:7`, dropdown `:89`) and the `activeLabel` case in
`components/user-pill-nav.js:67`: `{{t "Dashboard" key="dashboard"}}` /
`i18n.t('dashboard', "Dashboard")`. The `dashboard` key already exists in all 13 locales, so no
generator run is needed and no locale ships an English fallback. `home_nav` stays untouched at
its five other call sites in `templates/application.hbs` — those are the app navbar and
breadcrumbs, not this nav.

### R3 — a pill-nav arrival lights Home, not the page's own rail row

`components/account-rail.js`: `activeRow` returns `'home'` when `pillForRoute` names any pill,
and falls through to `ROW_FOR_ROUTE` otherwise. `account-rail.hbs:33` moves the Home row off
`@current-when`/`@activeClass` onto `{{if (is_equal this.activeRow "home") "is-active"}}`, the
same shape Goals and Logs already use — without this, `aria-current` would say Home while
nothing is lit, which is the documented inverse defect from the same surface, eight days old.

### Rejected alternatives

- **A second route list for the nav.** Rejected: `globalNavActive` already encodes exactly this
  set, and a parallel list is the failure the learnings entry names.
- **Widening `homeCurrentWhen` to the four pill destinations.** Rejected on the documented
  arity rule: the Home row supplies no model, `user.boards`/`user.extras` need one, so the
  match fails silently — the same trap `user.goal`/`user.log` fell into.
- **Hiding the nav with CSS (`display: none` per route).** Rejected: it leaves the component
  rendered and focusable by keyboard and screen reader, and the clearance problem remains.
- **Leaving the 112px clearance in place on nav-less pages.** Rejected: measured, it is 64px of
  empty space above every account page, against nothing.
- **Renaming the rail's "Home Page" row to Dashboard too.** Not requested; flagged instead.

### Risks

1. **`activeRow` gains a URL dependency.** It reads `router.currentURL`, which lags
   `currentRouteName` during a transition, so the Logs row could flicker on a rail→Updates hop.
   `globalNavActive` already carries the same dependency for the pill, so the two at least
   agree; verified by transition, not only by direct load.
2. **The `md-workspace--homenav` 64px** (`templates/user.hbs:26`, `app.scss:50298`) is a
   pre-hoist compensation for the nav rendering inside the page. It is out of scope here and
   measured separately; it is reported, not silently changed.
3. **Hiding the nav removes the collapsed `<details>` drawer** from account pages at narrow
   widths. Checked: that drawer only ever offered the Home-section destinations, and the rail
   reflows to a grid band below 900px, so those pages keep a primary nav.
4. **`showGlobalChrome` is unchanged**, so the rail's reach is untouched. Only the nav narrows.

### Tests, and the mutation that must make each fail

| Test | Mutation that must turn it red |
|---|---|
| `tests/unit/utils/primary-nav-test.js` — the pill for each route, and `user.logs` with and without `nav=home` | drop the `nav=home` branch → Updates case fails |
| `account-rail-active-row-test.js` — `user.logs` + `?nav=home` URL resolves to `home` | remove the `pillForRoute` branch in `activeRow` → returns `'logs'` |
| same file — `caseload`/`organizations`/`user.boards`/`user.extras` resolve to `home` | same mutation → returns `null` |
| same file — the existing 30+ assertions | must stay green untouched: no stub supplies `currentURL`, so every account route still resolves to its own row |
| `scripts/home-section-nav-qa.mjs` (browser) — nav absent on the five account pages, present on the five Home ones, `lit=Home Page` on Updates | any of the three changes reverted |

The browser probe is load-bearing, not decoration: the R3 half that unit tests cannot see is
the rendered `is-active` class.

## Adversarial review round 1 — reachability and regression

Reviewer B (independent, read-only). Its findings, each re-verified here before being accepted
or rejected. A review is evidence, not a verdict.

### ACCEPTED — Critical: the Updates round trip unmounts the nav mid-flow

Re-verified in code: `components/log-item.hbs:3,69,81` links a log entry with `@models` and
**no `@query`**, and `router.js:142` declares `log` as a SIBLING (`path: '/logs/:log_id'`). So
opening one update drops `nav=home`, `pillForRoute` returns `null` for `user.log`, and under
R1 the nav **unmounts** and the clearance drops 112px → 48px. Back restores both. Measured
today the nav merely loses its highlight there; the proposal would turn that into a 64px
content jump on the single most likely click on the Updates page. The reviewer is right that
the proposal's Risk #1 describes a different, smaller problem.

**Resolution (a second commit, not folded into the first):** carry the origin one hop.
`nav=home` exists precisely to record which menu the user arrived through and to survive a
reload, a bookmark and the Back button (`controllers/user/logs.js:23-31`) — extending it to the
detail page is that same idea, not a new one. `controllers/user/log.js` gains
`queryParams: ['nav'], nav: null`; `templates/user/logs.hbs:127` passes the current origin to
`<LogItem>`, which puts it on its links; `pillForRoute` answers `'updates'` for `user.log` with
`nav=home`. Kept as its own commit so it can be dropped without touching R1-R3.
Verified both paths stay coherent: from the RAIL's Logs row the param is absent, so the detail
page keeps no nav and `LOGS_ROUTES` lights Logs, exactly as now.

### ACKNOWLEDGED, NOT A DEFECT — High: Caseload/Organizations/Extras become two hops

Re-verified: the rail has no row for any of them (`account-rail.hbs`, `ROW_FOR_ROUTE` in
`account-rail.js:50-57`), and the app navbar's dropdown and mobile drawer do not carry them
either. So from an account page those three go from one hop to two (via Home).

This is not a defect to design around: it is the change the user asked for in plain words —
"If the user selects other buttons on the panel, the pillnav menu should be hidden on those
pages." The one-hop path exists today only because the nav renders where it does not belong,
with no active pill. Reported to the user as a consequence rather than silently accepted or
silently resisted.

### ACKNOWLEDGED — High: the pending-updates badge leaves the account pages

Re-verified: the badge is rendered only inside `<UserPillNav>` (`user-pill-nav.hbs:59,61`,
computed `user-pill-nav.js:46-51`), so hiding the nav takes the unread cue off Account, Goals,
Logs, Reports and Settings. Today it sits there on an inert pill. Inherent to R1, not fixable
without contradicting it; the honest home for it would be a rail affordance. Flagged for the
user, not smuggled in.

### PARTLY REJECTED — Medium: lighting Home on the four pill destinations

The reviewer asks for this to ship only behind explicit confirmation. Disagree on the framing:
leaving those four dark is not a neutral status quo — it is the open defect the previous
handoff already recorded ("the rail is inert on Caseload/Organizations/Boards/Extras"), and
under R1 a page whose nav is Home's sub-nav while the rail shows nothing lit tells the user
they are nowhere. Lighting Home is the coherent reading of the user's own model. Agreed on the
substance though: it is visible change on four pages nobody named, so it is called out
explicitly in the hand-back and is one `if` to revert.

### AGREED CLEAN

`user.lessons` / `user.focus` unaffected (neither is in the pill map nor in `ROW_FOR_ROUTE`,
deliberately). Role gating leaves every role at least three pills, so no role sees an empty
nav. The `dashboard` key and the `nav=home` duplication were both cited correctly.

## Unit 2 — the nav must sit in one place on every page (requested mid-session)

> on focused view, you need to measure on each page : dashboard, caseload, boards, extras,
> organizations, and updates (the one accessed from the pillnav menu) -> all pillnav menus
> need to show in the same place on the page. Fix this - they are varying all over the place
> on modern focused view

Measured first, with `app/frontend/scripts/pillnav-position-qa.mjs` (Modern + Focused set
through the View switcher, not by adding the body class, because `ll-layout-focused` is
re-applied from the preference on every transition and a hand-added class would vanish on the
next page — which would look exactly like the bug). User `lingolinq_admin`, 1280x900.

| page | nav top BEFORE | nav top AFTER |
|---|---|---|
| dashboard | 86 | 86 |
| caseload | 86 | 86 |
| boards | 96 | 86 |
| extras | 86 | 86 |
| organizations | 116 | 86 |
| updates | 116 | 86 |
| **spread** | **30px** | **0px** |

### Diagnosis (CONFIRMED, traced to the rule)

`.ll-appshell__navbar` was `position: sticky`, and sticky offsets from the SCROLL CONTAINER's
padding box, not the viewport. The scroll container is `#content`, whose `padding-top` is set
per page — dumped from the live stylesheets rather than inferred:

- `#within_ember #content { padding-top: calc(var(--topbar-height) + 3rem + var(--speak-bar-extra, 0px)) }` = **46px** (organizations, updates, every `user.*` page)
- `#within_ember #content.modern-dashboard, .home-page, .boards-page, .stats-page { padding-top: calc(var(--topbar-height) + 1rem) !important }` = **26px** (boards)
- `#within_ember:has(.page-footer) #content.index.with_user:has(.md-shell--layout-focused) { padding-top: var(--topbar-height) !important }` = **16px** (focused dashboard)

`--topbar-height` is 16px on an authenticated page. At rest the nav sits AT that padding edge,
so its screen position was the page's own top padding + 70. Every measured value is exactly
that sum: 16+70=86, 26+70=96, 46+70=116.

### The fix

`.md-acct-rail` — the nav's sibling in the same shell — has been
`position: fixed; top: max(var(--topbar-height, 70px), 70px); left: 0` since 2026-09-18, which
is why the rail never moved while the nav did. The nav now anchors to the same app frame,
above 900px only:

```scss
@media (min-width: 901px) {
  .ll-appshell__navbar {
    position: fixed;
    top: calc(max(var(--topbar-height, 70px), 70px) + 16px);
    left: 208px; right: 0;
    margin-bottom: 0;
  }
}
```

`+ 16px` is the gap the Dashboard already had (86 = 70 + 16), so the page this nav belongs to
does not move at all. `left: 208px; right: 0` is the same band `.ll-appshell__main` gave it.

**Nothing else moved, verified rather than assumed:** the whole `home-section-nav-qa` table is
byte-identical before and after — every `shell top`, `pad`, `firstContent` and `main` value
unchanged. In flow the nav took a 48px band and cancelled it with `margin-bottom: -48px`, a net
contribution of zero; fixed, it contributes zero too.

**Gentle style is aligned too** (86 on all six, spread 0), though its shell tops differ from
Focused's — the nav no longer follows them in either style.

### Deliberately NOT changed

- **Below 901px** the rail is an in-flow band and the pill row has given way to its collapsed
  drawer, so the nav belongs in the document there. Measured at 800px: tops 317/317/353/317/
  347/347, a 36px spread — unchanged by this fix, because the base rule is untouched. Say the
  word if the narrow layout should be aligned too; it is a different fix (the rail band's own
  height varies, so it is not the same one-line anchor).
- **Horizontal: a 2-3px difference remains** (dashboard left 390 width 707; every other page
  392/704). The nav is `width: fit-content` and centred, and the ACTIVE pill is a `<span>` with
  heavier styling than the `<LinkTo>` it replaces, so the row's total width depends on which
  pill is active. Eliminating it would mean making active and inactive pills identical widths.
- **The page CONTENT start still varies** (`shell top` 16/16/26/46/46 in Focused), because
  `#content`'s per-page padding is untouched. The nav no longer follows it, which is what was
  asked. Normalising the content start is a larger change: the account pages' clearance is
  derived from the same padding, so it cannot move without re-deriving that too.
