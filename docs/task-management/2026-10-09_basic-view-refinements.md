# Basic (Classic) home view refinements — 2026-10-09

Branch: `traci/fix/scots-review-fixes` (off `develop`)
Files: `app/frontend/app/styles/_classic-home.scss`, `_focused-view.scss`,
`app/frontend/app/components/dashboard/classic-view.{hbs,js}`,
`app/frontend/app/utils/tours/classic-home.js`, `public/locales/*.json`

## Goal
A sequence of requested refinements to the Basic home page. Styling and copy only — no change to
routes, actions, bindings, permissions or conditional rendering.

## What shipped
- Actions zone permanently compressed (`ch-compact-row` mixin, shared by the four main cards and
  the Extras drawer tiles) — one row each, no sub-buttons, arrow at the trailing edge.
- Extras toggle replaced by an Account `<LinkTo>`; drawer permanently visible; duplicate Account
  tile removed; drawer tiles match main-button width.
- Guided tour cut to four screens (welcome, rail, tabs, grid). It is a SEPARATE tour from
  Modern's — `utils/tours/classic-home.js`, not shared.
- Grid wraps to two columns at `<=1300px`, stays compressed at every width.
- Inner `.ch-tile__info` background and its divider removed on the four main cards; arrow ink
  darkened for Gentle.
- Getting Started card made far more compact; body and CTA at `clamp(14px…15px)`; icon given the
  shared `ch-glass-chip` treatment with the main cards' `rgba($brand-cool-steel, 0.30)` rim;
  copy reduced to "Take a quick guided tour."
- Rail arrows removed; silver drawer tiles whitened and given a bordered `›` badge instead of a
  bare arrow; their vertical padding tightened; rail footer gap 12px -> 8px.
- Account demoted to the drawer, Settings promoted to the fourth main card (routes and models
  travelled with the content); drawer tiles alphabetised by label.
- `<=1024px`: Getting Started keeps its DESKTOP shape. Only the CTA's trailing arrow is hidden.
- `>1024px` only: the four Actions cards carry their description line again as a subtitle, and
  the three stacked sections of the Actions tab sit further apart.
- `<=1024px`: silver drawer tiles 6px -> 2px vertical padding (68px -> 60px rendered); their row
  gap 12px -> 8px; the rail footer's gap below the divider 8px -> 4px.

### Subtitle: which element, and why not the other one
The card has TWO secondary strings. `.ch-tile__sub` is the action label in the CTA bar
("Start a session", "View progress") — the one explicitly asked to be removed earlier the same
day in favour of the bare arrow, and it stays hidden. `.ch-tile__more` is the descriptive line
under the title ("Open the communication board and speak instantly.") — that is what came back.
INTERPRETED, not stated: "subtitle" was read as the line under the title.

### Cascade structure of that change
`ch-compact-row` no longer decides the description's visibility at all. The hide moved to the two
CALL SITES, because the answer differs between them — Extras hides it at every width, the four
cards only below 1025px. The alternative (leave the mixin, re-reveal later) was rejected: it is
override-stacking, and a reveal written into the earlier `min-width: 1025px` block would compile
BEFORE the mixin application and silently lose to it at equal (0,4,0) specificity.

Spacing was delivered as margins on `.ch-card--intro` (+8px) and `.ch-grid--extras`
(margin-top 2->10px, padding-top 14->22px) plus `.ch-grid { gap: 12 -> 16px }`, NOT by raising
`.ch-tabpanel { gap }` — that gap is shared by all four tab panels and only the Actions tab was
in scope. The `border-top` section divider is untouched, which is the "modern sectioning" the
request asked to keep. Extras tile padding is also untouched, since it had just been tightened on
request; their breathing room is the grid gap.

## Lessons (distilled into learnings-archive/2026-10.md)
1. **`background` is one property, so a tint modifier REPLACES the base.** `.ch-tile--silver`
   declaring a tint-only `background` dropped `.ch-tile`'s white base, rendering `#E6EBF1` —
   darker than the page ground — which is why three "make it lighter" passes did nothing. Fix:
   layer the tint gradient OVER a white gradient in the same declaration.
2. **This file orders its media queries 1024 -> 550 -> 900.** A new `max-width: 900px` block
   placed by reading order sits BEFORE the existing one and loses every shared property to it.
   Merge into the existing block; never add a second one. Consequence already in the file: at
   `<=550px` only `justify-items` and `text-align` still reach `.ch-card--intro`, because the
   later `<=900px` block re-declares the rest.
3. **`display: contents` is load-bearing and easy to orphan.** `.ch-card__title` lives inside
   `.ch-intro__content` (`classic-view.hbs:894-897`), so `grid-area` on the heading is inert
   unless the wrapper is `display: contents`. When the `<=1024px` block that declared it was
   removed, the declaration had to be re-homed into `<=900px` — grep for the single declaration
   before deleting any block that contains one.
4. **`_focused-view.scss` contains an UNSCOPED shared base block** (`.ch-grid:not(.ch-grid--extras)`,
   ~:4400) that serves Basic AND Gentle despite the filename. Two user-reported bugs came from
   edits there leaking into Gentle. Check the scope, not the filename.
5. **`modern_landing_for` routes `tab === 'main' && place.extras` to `user.extras`.** When the
   Extras drawer became permanently visible, `_publish_basic_home_place` had to keep publishing
   `extras: false`, or every Basic -> Modern switch would land on the Extras page.
6. **Verify the compiler's status, not the pipe's.** `sass … | tail -4; echo $?` reports `tail`'s
   exit code and hid a real "Undefined variable" error. Capture `rc=$?` on the sass call itself
   and assert the output is EMPTY. In zsh, `status` is read-only — name the variable something
   else.
7. **Shepherd's last step needs `action: function() { return this.complete(); }`**, not
   `type: 'complete'`.
8. **`tests/test-helper.js` keeps an explicit import list of every test module.** Deleting a test
   file without removing its import fails the whole suite.

## Finding: the description ink was already set, by an unscoped rule in the wrong file
The first attempt set the subtitle to `$la-navy`, reasoning from `ch-compact-row`'s recorded
"Gentle title 5.46:1" measurement. A compiled-CSS audit showed that was wrong in two ways:
`_focused-view.scss:4465-4488` compiles with NO `body.ll-layout-focused`, so at (0,4,0) it
already paints these cards' label `#0F172A` and their description `#0D1B33` in BOTH schemes —
outranking both the `#334155` base (0,1,0) and the `$la-navy` label rule (0,2,0). So the title on
these cards is not navy, and `#0D1B33` is DARKER than `$la-navy` (Y 0.0111 vs 0.0366). Setting
navy would have LOWERED the subtitle's contrast. The override was dropped; the existing value,
already measured at 4.72-5.25:1 across the four fills, stands.

Lesson, recorded in learnings-archive/2026-10.md: reading the SCSS was not enough to know
what paints an element. The audit of the compiled output was.

## Verification
- `npx sass` exit 0, no output beyond the pre-existing `_caseload-compact.scss:276` `mix()`
  deprecation (unrelated, predates this branch).
- `npm run lint:hbs` exit 0.
- `ember test --filter "classic"` — 56 tests, 56 pass, 0 fail (Node 22).
- Compiled-CSS audit of `.ch-card--intro`: no `@media (max-width: 1024px)` rule touches its
  layout; 901-1024px resolves to the base three-column grid; `<=900px` carries the one-row shape
  and its own `display: contents`; `.ch-intro__cta-arrow { display: none }` still present at
  `<=1024px`.

## Not done / still open
- The five original handoff blockers from `traci/styling/classic-view-overlay` (run_eval crash,
  WCAG AA tile subheaders, missing `return` in the view-switcher transition, classic edit-mode
  loss).
- Focused View silently reverting to Gentle — diagnosed as needing a Network-tab check on the
  preference PUT; never confirmed.
- Reports-vs-Account teal hue collision (4.1 degrees apart).
- 13 dead SCSS rules targeting `.ch-tile--extras-toggle` / `.ch-tile__toggle-caret`.

## Three <=1024px compaction passes (same day), and the lever each one needed

All three were "make this tighter", and in each case the obvious property was the wrong one.

1. **Silver tile height.** `min-height: 56px` LOOKED like the control and was not: with
   `box-sizing: border-box` it floors the CONTENT box at 44px, while the real stack — tile
   padding 6+6, `.ch-tile__info` padding 6+6, 44px chip — already came to 68px, so the
   `min-height` was non-binding and editing it would have changed nothing. The tile's own
   vertical padding was the live lever (6 -> 2px). Floor kept as a safety net; 60px still clears
   the 44px WCAG 2.5.5 target, which matters because the tile IS the control.
2. **Space between silver tiles.** The only gap they had was `.ch-grid { gap: 12px }` — there was
   no extras-specific gap at any width. Used `row-gap` on `.ch-grid--extras`, not `gap` on
   `.ch-grid`: the request was vertical, the 12px between COLUMNS keeps two tiles on a row from
   reading as one wide button, and widening the net to `.ch-grid` would also have moved the four
   Actions cards, which wrap to two rows at this width.
3. **Rail footer links.** The divider IS `.ch-rail__footer`'s own `border-top`, so `margin-top`
   (above the rule) and `padding-top` (below it) are not interchangeable. "Move the links up,
   closer to the divider" is `padding-top` only; trimming `margin-top` would have carried the
   rule up with the links and left the gap the same width — the opposite of the request.

Each change was nested as a `@media (max-width: 1024px)` block INSIDE the existing rule rather
than written as a separate block later in the file. Both values for the property then sit
together, and it sidesteps this sheet's recurring source-order problem: a later block has to win
against the same-specificity original, which is how several earlier edits silently did nothing.

## Second unscoped-focused-view finding
`.ch-rail .ch-rail__footer { border-top-color: rgba(15,23,42,0.18) }` also compiles with NO
`body.ll-layout-focused` scope, at (0,2,0), so it overrides Gentle's own
`rgba($la-navy, 0.1)` (0,1,0) divider colour in BOTH schemes. Not touched — recorded because it
is the same class of defect as the `.ch-tile__more` ink finding above and suggests the unscoped
leakage in that file is systemic rather than isolated.

---

# Part 2 — tour handoff, side menus, and the Gentle grid

## Reload: a wrong revert, corrected
The rail's Reload called bare `location.reload()`. A reload has no `transition.from`, so
`routes/index.js:37` classified it as a login entry and the inherited `setupController`'s
`jump_to_speak` (:189 -> :247 -> :249) opened speak mode — re-landing the user elsewhere.
`auto_open_speak_mode` defaults TRUE (`app/models/user.rb:2009`), so this was the common case.

Fixed with a URL-keyed `sessionStorage` marker written only by the rail link
(`app/frontend/app/utils/reload_intent.js`), consumed at the single write of
`_index_login_entry`. Two review findings shaped it: `beforeModel` runs TWICE on the `/` path
(index -> `_land_on_default` -> `user.home`), so the marker latches rather than being consumed
on first read; and writing it from the ORG rail would leak it across a logout on a shared
device, so the writer is scoped to the Basic home rail only.

**I reverted this on a wrong conclusion** when the user reported a page error, then restored it.
The error was `ActiveRecord::PendingMigrationError` — two unrun migrations making Rails 500 on
every request. LESSON: a frontend change cannot produce a 500; read the console/network panel
before attributing a page error to the diff in front of you.

## Diagnosis correction worth keeping
`routes/user/home.js:23` defines its OWN `afterModel` and never calls `this._super`, so
`routes/index.js#afterModel` DOES NOT RUN on `/:user_name/home`. Three of the four
`_index_login_entry` consumers (:131, :143, :395) are dead on the Basic home page; only
`setupController`'s :189 is live. Two independent reviewers found this; the first diagnosis
named :131 as the culprit and was wrong.

## Board-picker tour never opened after the home tour
Two handoffs to the same destination, asymmetric: `onPickBoard` (:1119) set
`board_picker_tour_pending` before transitioning; `_startHomeAutoOpen`'s handoff (:790) did not.
The auto-open path is the one a newly-registered user takes, so they landed tour-less.
Armed on `complete` ONLY — `afterComplete` fires on cancel too, and arming there would open a
tour for someone who just skipped one (a defect this file already records). The guard shared by
both handoff branches was extracted rather than copied a third time.

## Side menus: the two mechanisms
- MODERN: `CHROME_ROUTES` in `controllers/application.js`. The rail lives in the app shell
  WRAPPING THE OUTLET, so a page needs no `md-shell` of its own to receive it.
- BASIC: `showGlobalChrome` returns false by design, so each page mounts its own `ch-` rail.

Audit result: added `board-picker`, `create-board-new`, `search`, `offline_boards` to
CHROME_ROUTES (none maps to a pill, so no double nav). Basic was complete except
`system-settings.emails` — NOT done: `.app-shell` is a shared global class (`display: grid`),
the page is admin-gated, and restructuring it would reach far beyond this request.

## Gentle grid: no full-row buttons
`extraFull` made Speak (and Extras for communicators) full-width rows, and a lone trailing small
card emitted `'X X'`. Now `extraFull = []`, a lone card emits `'X .'`, and Speak+Extras are a
NAMED PAIR so Speak is always the left cell.

**The constraint that shaped it:** `focusedLayout` reads the same `*_DEFAULT_ORDER` constants,
so moving `extras` in place would have reordered Focused too — which the file explicitly records
as having happened once before. Done as a derivation (`extrasBesideSpeak`) applied at the two
Gentle-only seams, mirroring `editBesideCreate`. Focused tests confirm it stayed untouched.

"Compact them" needed no CSS: the wide Speak variant is hidden unconditionally
(`app.scss:57136-57143`) and the fullspan rules were what inflated the icon, so dropping
fullspan reverts it to the base size.

Four tests encoded the OLD layout and were updated — a spec change the user requested, not a
weakening. One comment in them asserted the opposite of the new behaviour and was corrected.

## Open
- `system-settings.emails` basic rail (above).
- **Idle-session token bug.** After the inactivity window `Device#clean_old_keys` marks a browser
  key `needs_refresh` (`app/models/device.rb:291-296`), every API call 400s, and NO frontend code
  calls any refresh endpoint — `grep "token/refresh"` across `app/frontend/app/` returns nothing.
  The only endpoint (`session#oauth_token_refresh`, `routes.rb:86`) serves INTEGRATION tokens
  only. Intended behaviour is a clean logout (`is_logout_worthy_auth_error` already lists the
  error) but the failing queries trip the route's error substate first, so the user sees
  "Failed to load" instead of the login screen. Needs its own fact sheet + red test.
- Dead CSS: `md-grid--fullspan-{speak,extras,account,createboard,reports,editdashboard}` rules
  (`app.scss:48206-48306`) can no longer match. Left in place rather than deleting a 100-line
  range at the end of a long session.

## HOME BOARD badge -> green home glyph on the name

Five badge sites, three components: `available-boards-section.hbs` x2, `board-picker.hbs` x2,
`dashboard/authenticated-view.hbs` x1. All removed; a solid green home glyph now sits at the
START of the board name instead.

**The useful find:** `BoardIcon` already had a `flag_home` argument rendering an absolutely
positioned grey glyphicon — and NOTHING passed it, so that was dead code. Rather than add a
second home indicator beside it, the dead argument was made live and repointed at the name.
Four of the five sites therefore needed no new condition: each passes the SAME comparison it
already used to decide whether to draw the badge, so WHICH boards read as "home" is unchanged.

**A mistake worth recording.** `available-boards-section.hbs` has THREE `<BoardIcon @board=...>`
call sites but only TWO had badges. A blanket string replace added `@flag_home` to all three,
including the orphan-clusters list that never had a badge. Caught by counting the matches after
the fact and reverted. This is exactly what the enumerate-before-substituting rule exists for,
and the count (3 vs 2) was printed by the same script that made the edit — the signal was there
to read.

Also corrected a comment in `board-picker.hbs` that described the tile as getting a "floating
HOME BOARD pill", which the change made false.

Icon: solid single-path home at 17-18px in `$brand-verdigris-aa` (#1A7B7A, 5.05:1 on white —
non-text indicators need 3:1 under WCAG 1.4.11). The badge's visible text was the only
accessible name for the state, so each glyph carries `aria-label`/`title` on the same
`home_board` key; the key stays live, so no locale regeneration was needed.

Dead CSS left in place (not deleted at the end of a long session): the three badge rules
`.ub-boards-page__board-item-home-badge`, `.board-picker__home-badge`, `.md-strip__home-badge`
and their breakpoint variants. One live rule still references a badge class inside a `:not()`
(`app.scss:5922`), which is harmless but means a cleanup must read before deleting.

## Idle-session token bug — fixed in the ajax layer, NOT where I first proposed

**Cause.** After the inactivity window `Device#clean_old_keys` marks a browser key `needs_refresh`
(`app/models/device.rb:285-297`), `valid_token?` returns false (`:412`), and every request answers
400 + `{error: "Token needs refresh", invalid_token: true}`. There is NO browser refresh path —
the only endpoint is integration-only (`config/routes.rb:86`) — so a clean logout is the intended
end state, and nothing performed it.

**My first proposal was wrong twice, and two independent reviews caught both.**
1. Its predicate matched the message `"Not authorized"`, which is this API's UNIVERSAL permission
   denial (`application_controller.rb:282`, 238 `allowed?` call sites). It would have logged a
   healthy user out for opening an org page or a shared utterance they lacked rights to.
2. It put the guard in `routes/application.js#error`, which NEVER receives this error on the
   routes that matter: `routes/user.js:108-110` intercepts 400 and returns false, and
   `routes/index.js:65-67` swallows the rejection outright. I rejected a candidate in that same
   proposal for being "a guard placed where it cannot fire" and then committed exactly that.

**The fix.** `session.dead_session_response(xhr)` keys on `invalid_token` — set ONLY by the token
check (`device.rb:350`), never by `allowed?`, which uses `unauthorized: true` — so a dead session
and a permission denial can never be confused. It is called from the ajax layer's FAILURE
continuation (`utils/extras.js`), the one choke point every caller crosses, so it covers the
routes that swallow a rejection and the routes that intercept it alike. Guarded `!speak_mode`,
mirroring the sibling check at `:297`, because throwing an AAC user to a login screen mid-sentence
is worse than a stale page; and guarded on `session.invalid_token` so several simultaneous 400s
do not stack force-logout modals.

**A defect found in my own fix before shipping.** `utils/session.js` is a Proxy returning
`undefined` for every property until `app-state` assigns the service, so calling
`session.dead_session_response(...)` bare would have thrown a TypeError inside the error handler
on any boot-time 400. Guarded with `typeof` checks, the same defence `app-state.js:585` uses.

**Where I disagreed with a review:** it claimed `app-state.js:587`'s `is_timeout` blocks the
logout. It does not — `:592` reads `if(do_logout || (last_try && !is_timeout))`, so `do_logout`
short-circuits.

The classifier was also taught the `{fakeXHR, result}` shape (keyed on `invalid_token`, not the
message, unlike its older branches whose message list is pinned by existing tests), which lights
up the second logout site at `app-state.js:585`.
