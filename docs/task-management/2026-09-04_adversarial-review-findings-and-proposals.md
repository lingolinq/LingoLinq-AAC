# Fix proposals from the adversarial review — PROPOSALS ONLY, NO CODE WRITTEN

Rule #0.12: candidates written down and reviewed BEFORE any edit. Rule #0.13: every fact
labelled CONFIRMED (file:line) or ASSUMED; no ASSUMED fact may be load-bearing.

---

# UNIT 1 (BLOCKER) — the widened symbol pass searches every resident user's button sets

## Fact sheet

**(a) Where is the value READ?** CONFIRMED.
`word_suggestions.js:1536-1538`, inside `attach_image_for_label`'s `.then`: when the scoped
walk resolves nothing, `_exact_button_candidates_for_label(label, loaded_button_sets_beyond(sets))`
runs and its winner is passed to `deliver()` -> `on_image` -> painted into the prediction rail.
`loaded_button_sets_beyond` (`:1459-1477`) filters ONLY on "already in `searched`" and "has
buttons". There is no user scoping of any kind.

**(b) What are ALL the shapes / who writes each?** CONFIRMED.
The store is populated by `LingoLinq.Buttonset.load_button_set(id)` for whatever board is
opened, under whatever user context is active. `LingoLinq.store.unloadAll()` has exactly TWO
call sites, `services/session.js:760` and `:793`, BOTH inside `session.invalidate` (logout).
Supervisee switching (`app-state.js:562`, `:2332` set `referenced_speak_mode_user`) does NOT
clear the store. So resident sets accumulate across students within one login.

**(c) Claims about other files.** CONFIRMED.
- The buttonset model (`models/buttonset.js:23-39`) has NO user/owner attribute. `key` is
  `username/slug`, but PUBLIC LIBRARY boards legitimately carry another user's username, so
  filtering on the key's username prefix would break legitimate symbol lookup. **Owner
  filtering from the record alone is impossible.** This kills the obvious fix.
- `lookup_board_ids` (`:1478-1508`) is the LEGITIMATE scope (home board, current board,
  sidebar, starred). Note it reads `currentUser`, not `referenced_user`.
- `Buttonset.fix_image` rewrites protected URLs with the CURRENT user's
  `protected_image_token`, so a protected image 403s and the placeholder survives. Plain S3
  `best_url` uploads and `data:` URIs are NOT covered. ASSUMED (not traced by me): that
  non-protected uploads are common enough to matter. NOT load-bearing — the fix does not
  depend on it.

## Candidate fixes

**A — scope the widened pass to `lookup_board_ids`.** REJECTED: that IS the scoped pass
(`load_vocabulary_button_sets` is built from it), so this deletes the feature while pretending
to fix it.

**B — filter by owner on the buttonset record.** REJECTED: no such field exists (see (c)).

**C — purge resident button sets when the speak-as / modelled user changes.** Root-cause fix:
another student's data should not be resident at all. `LingoLinq.store.unloadAll('buttonset')`
on `referenced_speak_mode_user` change. Cost: re-fetch on switch-back; risk of unloading a
record another consumer holds a live reference to.

**D — revert the widened pass** (delete `loaded_button_sets_beyond` and its call). Safest for
privacy, zero new mechanism. Loses the symbol-coverage fix it was added for — the bug where a
word's symbol exists on a loaded-but-out-of-scope board.

**F — generation token (PROPOSED).** Tag each set with the user context that loaded it and have
`loaded_button_sets_beyond` return only sets from the CURRENT context. Keeps the feature within
one student, removes the cross-student path, unloads nothing, and touches one module.
Open question for review: where is the token stamped, given sets are created inside
`Buttonset.load_button_set` and not by this module?

**Risk I can see across all of these:** the widened pass is the fix for a real symbol-coverage
bug. C and F keep it; D removes it. If reviewers judge F's plumbing too invasive for the
severity, D is the honest fallback and should be stated as a capability loss, not hidden.

## Test that must accompany it (RED FIRST)

Two resident sets: one whose id is in `sets` (scoped), one loaded under a different user
context. Assert `loaded_button_sets_beyond` returns ONLY the same-context one. Mutation that
must make it fail: remove the context filter -> both returned.

---

# UNIT 2 — four scanning-reachable controls that are dead or destructive under switch access

## Fact sheet (all CONFIRMED)

- `modal.js:276` `scannable_targets` selects `.md-speak-menu__bottom-btn` and
  `.md-speak-menu__phrase-page-btn`, and does NOT filter `[disabled]`.
- `scanner.js:830-833`: for `.md-speak-menu__bottom-btn` it dispatches `speakmenuselect` with
  `e.button_id = dom.attr('id')`.
- `speak-menu.js:604`: the known-list guard is `if (button && ...)`, so an `undefined` id skips
  it; `:611` `if (button !== 'menu_repeat_button') { modal.close(); }` then CLOSES THE MENU and
  no branch matches.
- Four buttons carry the class with NO `id`: `speak-menu.hbs:452` (Save Phrase), `:459` (Send
  Reply), `:467` (Done Inserting Text), `:472` (Un-Flip Text). The sibling at `:247` HAS
  `id="menu_remembered_{{index}}"` — the same branch fixed one and left four.
- `speak-menu.hbs:280,289` use `disabled={{...}}`, which `repairs.hbs:47-49` explicitly argues
  against for this exact selector.

## Candidate fixes

**A — give the four buttons ids and add them to the known list (PROPOSED).** Mirrors the
already-shipped fix at `:247`. Each id must be routed in `button_event` to the same action its
`{{on "click"}}` calls, or scanning will close the menu and do nothing — the current bug.

**B — make `pick_elem` fall back to clicking the element when it has no id.** Broader: fixes
this class everywhere, including future buttons. Riskier: changes scanner behaviour for every
scannable control, and a double-dispatch (synthetic click + `speakmenuselect`) would fire two
actions.

**C — for the pager: drop `disabled`, dim instead** (matching `repairs.hbs`). `phrase_page_move`
already clamps, so the attribute buys nothing.

Proposing A + C. B is the more general fix and should be considered on its merits by the
review — if B is right, A is wasted work.

## Test (RED FIRST)

A test that renders the speak menu, enumerates `modal.scannable_targets()`, and asserts every
match either has an `id` present in `button_event`'s routing OR is not a `bottom-btn`. Mutation:
remove one id -> red. This is the test that would have caught all four at once.

---

# UNIT 3 — the Categorize panel describes an account-wide switch as per-board

## Fact sheet (CONFIRMED)

`board-detail.hbs:3715` "Organize **this board's** buttons..." (`board_categorize_group_hint`)
and `:3717` "**This board's** buttons are shown in their original order."
(`board_categorize_group_hint_off`), plus `aria-label` "Categorize board" at `:3684`.
The switch now writes account-wide (`board-detail.js` `categorize_enabled` / `next_enabled`).
The genuinely per-board sub-settings below it read generically — the copy is exactly inverted.
`feature_flags.rb:130` states grouping MOVES vocabulary out of cells a communicator has motor
memory for, so wrong scope here is clinical.

**Fix:** reword both strings + the aria-label to say the setting applies to all of this user's
boards. New i18n keys are needed (changing a key's TEXT in place leaves 12 locales with a
translation of the OLD, now-false meaning). Requires `i18n_generator.rb --generate --merge`.

**Risk:** this is user-facing copy in 13 locales; the generator run is the part most likely to
go wrong (a duplicate key blocks generation).

---

# UNIT 4 — my own errors from this session

1. `bound-select.js` comment claims month and year share one 360px cap. FALSE at HEAD:
   `.bound-select--paged .bound-select__list { max-height: none }` (`app.scss:90389`) beats
   `.bound-select--grid`'s `360px` (`:90363`) — equal specificity, later in source. Fix the
   comment AND re-verify flip agreement in a browser, since my earlier verification predates
   paging.
2. `user-board-detail-category-per-user-test.js:135` — `assert.notOk(entry && entry.enabled === true)`
   passes when the entry is absent for ANY reason. Split into `assert.ok(entry)` +
   `assert.notStrictEqual(entry.enabled, true)`.
3. Stale citations: `speak_section_visible_session` cited at `:4303`, actually `:4321` (4 files);
   `portrait_overlay_eligible` cited at `:4751`, actually `:4872`.
4. My pager disables the focused button (see UNIT 2's class — same bug, my code).

---

# Explicitly OUT of scope for this batch, and why

The stylesheet findings (Big Button `vmin` collapse, Speak Options title 25px->16px, share-tile
AA contrast, dark-mode drawer hint) are DESIGN decisions with visual trade-offs, not defects
with a single correct fix. They need Traci's eye on a device, not a unilateral edit. Same for
the `/generate` retry storm and the prefetch `root_only` poisoning — both are real, both are
pre-existing branch work, and both deserve their own diagnosis rather than being batched into
a fix pass for unrelated defects (Rule #0.15).

---

# ADDENDUM (measured after the proposal was sent for review) — UNIT 4.1 is a REAL defect, not just a false comment

I re-measured in a browser instead of trusting either the comment or the reviewer. Puppeteer
against the running dev server, 1280 wide, sweeping viewport height:

```
vh=874   month{flip:true,  max:360px, sh:287}   year{flip:true,  max:none, sh:349}   AGREE=true
vh=878   month{flip:true,  max:360px, sh:287}   year{flip:true,  max:none, sh:349}   AGREE=true
vh=882   month{flip:true,  max:360px, sh:287}   year{flip:false, max:none, sh:349}   AGREE=FALSE
vh=886   month{flip:true,  max:360px, sh:287}   year{flip:false, max:none, sh:349}   AGREE=FALSE
vh=890   month{flip:false, max:360px, sh:287}   year{flip:false, max:none, sh:349}   AGREE=true
```

CONFIRMED: the month picker resolves `max-height: 360px` and the year resolves `none`
(because `.bound-select--paged` at `app.scss:90389` overrides `.bound-select--grid` at
`:90363`), so `_panelSpaceNeeded` returns **360 for month and 349 for year**. Identical trigger
geometry, two different needs, therefore two different flip thresholds ~11px apart. In that
band the two pickers sit side by side pointing OPPOSITE directions.

So the comment is not merely inaccurate — the property it asserts genuinely fails.

## Candidate fixes for 4.1 — REVIEW NEEDED, I have not chosen

**A — give `.bound-select--paged .bound-select__list` an explicit `max-height: 360px`.** Restores
the shared cap, making the existing comment true. But `--paged` sets `overflow-y: visible`
deliberately (paging exists so the list never scrolls); a cap that content could one day exceed
would spill rather than scroll, and it uses `max-height` as a measurement anchor rather than a
layout constraint — a latent trap if `pageSize` or row height changes.

**B — stop using `max-height` as the basis: measure content height for both.** Then month=287,
year=349 — still different, and further apart. Makes it worse. REJECTED unless review disagrees.

**C — accept the divergence and fix only the comment**, documenting the ~8px band. Cheapest,
honest, no new mechanism — but knowingly ships two controls that disagree in a narrow window.

**D — coordinate the pair explicitly** (a shared flip decision for a row of pickers). Correct in
principle; needs cross-component coordination that the earlier proposal already judged
impossible without rendering the sibling's panel to measure it.

I lean A with an assertion that content never exceeds the cap, but I am explicitly NOT
implementing until the review weighs A against C. The measurement above should be treated as
the ground truth, not the original comment.

---

# OUTCOME OF THE PROPOSAL REVIEW (two independent reviewers + a third on the deferrals)

Renamed to the underscore form so git tracks it — the dash-dated original was gitignored and
would have been invisible to anyone picking this up.

## What the review overturned

- **UNIT 2 fix A was a NO-OP.** The four buttons sit OUTSIDE both `<ButtonListener>` regions
  (`speak-menu.hbs` 22-52 and 56-299; the bottom bar opens at :430), so `speakmenuselect` has
  no handler at all — `button_event` is never entered and `modal.close()` never runs. The
  original diagnosis ("menu closes, nothing happens") was WRONG; the press is swallowed
  entirely. Adding ids would have shipped a believed-fixed, still-dead control.
- **UNIT 1 option F was a partial fix labelled complete.** The store has at least four writers,
  including `Utils.all_pages('buttonset', {user_id})` (`components/button-suggestions.js:219`,
  `controllers/button-suggestions.js:170`) which bulk-loads EVERY set for a user. A stamp at
  `load_button_set`'s success branch never fires for already-resident sets — the exact
  rule-13(a) trap.
- **Both proposed tests were hollow.** UNIT 2's weakest passing state is deleting the class
  from `scannable_targets` (green test, every switch user loses the bottom row). UNIT 1's
  asserts an impossible outcome, because `loaded_button_sets_beyond` excludes `searched` by
  construction.
- **The `lookup_board_ids` reads-`currentUser` hypothesis is REFUTED.** `app-state.js:2601`
  sets `currentUser = speakModeUser` in speak mode, so the scoped pass is already correctly
  student-scoped; switching to `referenced_user` would WIDEN scope during modeling.
- **Two deferred stylesheet findings are refuted with numbers.** Big Button `vmin` governs
  font-size only — hit targets are sized at `app.scss:40124-40131` and compute to 538-794px,
  22x the WCAG 2.5.8 requirement. Share-tile contrast is already engineered in-file: all tiles
  measure 5.28-7.79:1, including a per-tile remedy at `:39730` for the one that would have
  failed. CLOSE both; do not spend Traci's time on them.
- **`root_only` "poisoning" is refuted as stated.** `boards_controller.rb:432-459` shows
  `root_only` gates the descendants array only; the root payload is byte-identical. The real
  residual is perf-only: a `set(merged, {force:true})` with no `root_only` key clears a stale
  mark, costing a round-trip on the next folder tap. Downgrade or close.

## What was IMPLEMENTED (commit 65130c2c2)

The scanner routing fix, derived from the review rather than from the original proposal:
`pick_elem` now requires an `id` to take the `speakmenuselect` branch, so id-less controls fall
to the pass-through click already at `scanner.js:859-862`.

Measured before changing: 0 id-less controls inside a listener, **14** outside (including
`set_speak_mode_user` x4 and `pick_speak_mode_user` x4), 0 with-id outside.

A self-inflicted defect was caught by regression, not by reasoning: putting the id test FIRST
evaluated `attr` on every scanned element and broke `scanner-test.js:1153`, whose stub has
`hasClass` but no `attr`. The class tests must come first so they short-circuit.

## STILL OPEN — nothing below has code written

1. **Cross-student button-set exposure** (`word_suggestions.js:1459-1476`). Reviewers split on
   severity. PREREQUISITE, ~30 min, no code: trace whether the foreign image reaches
   `working_vocalization` via `utterance.js:588` -> `button.js:1694`, and whether that feeds
   share-utterance / LogSession. That answer decides High vs blocker. Then: option F with the
   stamp placed ABOVE `models/buttonset.js:1257` and `loaded_button_sets_beyond` failing
   CLOSED (dropping unstamped sets), or fall back to option D (revert the widened pass) as a
   stated capability loss that also deletes two passing tests.
2. **Categorize panel copy** (`board-detail.hbs:3684`, `:3715`, `:3717`) still says "this
   board's" for what is now an account-wide, clinically significant switch. Reviewer 2 showed
   NEW KEYS ARE NOT NEEDED: blank the key in the 12 non-English locales so `--merge` rewrites
   them as `*** <english>`, which `i18n.js:448` falls back on. Check call-site count first —
   `i18n_generator.rb:86-89` silently reverts English on a shared key, and `:284` aborts on
   duplicates. Same string also promises arrows that `category_ordering_available: false`
   never renders — fix both sentences together.
3. **Flip-agreement divergence** (measured: month flips, year does not, at vh 882-886). Take
   the custom-property form (a `--bs-flip-need` declared in the EXISTING `--grid` rule and read
   by `_panelSpaceNeeded`) rather than putting a cap on `--paged`, which would spill under
   `overflow-y: visible`. Pair with a test asserting a full page's `scrollHeight` stays under
   the cap.
4. **Test hardening** `user-board-detail-category-per-user-test.js:135`. Reviewers disagreed:
   assert the seed pre-condition and pin the whole written shape, rather than adding a second
   negative assertion.
5. **Two confirmed, branch-introduced accessibility regressions**, both token-sized:
   `.md-board-collection__locale-hint` has no dark override and measures **1.24:1** in dark
   (4.35:1 in light — also under AA); and `.md-speak-menu__title`'s clamp floor of 16px is 23%
   BELOW the plain web default on a page whose house rule is 30% above it. Raise the floor to
   >=21px. These are NOT design decisions and should not have been deferred as such.
6. **`/generate` retry storm.** Deferral defensible, but record that branch commit `5d902a8ff`
   turned a latent path live. Two one-line fixes: a negative-result memo in
   `load_vocabulary_button_sets`, and `buttonset.js:1418` 30s -> >=60s to close the dedupe gap
   against the 60s work timeout.
7. **Full `ember test` has not completed** for `4201a31fb`, the staging merge `1c2bb2333`, or
   `65130c2c2`. Run it with `ember serve` STOPPED — contention is what stretched it past 20
   minutes — and check `# skip 38` alongside `# fail 0`.
