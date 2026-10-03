# 2026-09-21 — Small cleanups batch

Branch `traci/styling/classic-view-overlay`, base HEAD `44583d88e`.

Four items carried in the session handoff as "known, diagnosed, unfixed". Each is
verified here from scratch (Rule #0.10: do not assert anything about a system you have
not just checked). Two handoff claims did not survive; one new latent defect was found.

## Learnings consulted (Rule #0.8)

- `LEARNINGS.md:147` — *"`i18n_generator.rb` is a static, single-line parser. Dynamic
  `{{t bound key=bound}}` keys are invisible to it."* Directly decided item 3.

---

## Item 1 — `table-reponsive` typo, two sites

**(a) Where is the value READ?** The class is consumed by the stylesheet, not by JS.
`.table-responsive` is defined in Bootstrap 3.4.1 at
`app/frontend/node_modules/bootstrap/dist/css/bootstrap.css:2540`, imported into the
build at `app/frontend/ember-cli-build.js:60`. **CONFIRMED.**

**(b) All shapes.** Two occurrences of the misspelling, both in one file:
`app/frontend/app/templates/user/log.hbs:199` and `:417`. Repo-wide grep for
`table-reponsive` returns exactly these two. The correct spelling is already used in
five other templates, so the intent is unambiguous. **CONFIRMED.**

**(c) Cross-file claim check.** The handoff said the tables "clip in the 901–1024px
band". **FALSIFIED as stated.** The base rule is `min-height: 0.01%; overflow-x: auto`
at *every* width (bootstrap.css:2540-2543); the `max-width: 767px` block
(bootstrap.css:2544) only adds border/margin. So the two tables can overflow their
container at any width, not just one band. The fix is the same; the claim was narrower
than the defect.

**Risk:** the only effect is that an overflowing table gains a horizontal scrollbar
instead of spilling. That is the intended behaviour and matches the five correct sites.

---

## Item 2 — routerless `user.device`

**(a) Where is the value READ?** `app/frontend/app/router.js:144`, `this.route('device')`
inside the `user` block opened at `router.js:128`. **CONFIRMED.**

**(b) All shapes / all writers.** No route, controller or template exists for it
(`find app/frontend/app/{routes,controllers,templates} -iname '*device*'` returns only
`controllers/device-settings.js`, `templates/login/device.hbs`,
`controllers/modals/external-device.js`, `controllers/login/device.js` — none of them
`user.device`). No `link-to` or `transitionTo` targets it. **CONFIRMED.**

**(c) Cross-file claims.**
- **There are TWO `this.route('device')` declarations, not one.** `router.js:67` is
  `login.device`, which is LIVE (`controllers/login/device.js`,
  `templates/login/device.hbs`). Deleting the wrong one breaks login. The handoff did
  not mention this. **CONFIRMED — hazard.**
- `user.device` at `components/stats/user-weeks.hbs:96-101` is a **data property** on a
  log record, not the route. Unrelated; must not be touched. **CONFIRMED.**
- `'user.device'` is a live entry in the `userSubRoutes` list at
  `controllers/application.js:2308` (`showBentoPageWithFooter`). Becomes dead on
  deletion. **CONFIRMED.**
- `controllers/user.js:85` carries a comment documenting the absence. Must be updated in
  the same change or it becomes a lie. **CONFIRMED.**

**Behaviour change:** `/:user_id/device` currently resolves to Ember's auto-generated
empty route (blank page inside the user shell). After deletion the URL is unrecognized.
`app/frontend/app/templates/error.hbs` and `controllers/error.js` exist, so the app has
error chrome. Exposure is bookmark-only — nothing in the app links there.

---

## Item 3 — missing `display_style_save_changes`

**(a) Where is the value READ?** `app/frontend/app/components/display-style.js:2013`,
`i18n.t('display_style_save_changes', "Save Changes")`. **CONFIRMED.**

**(b) All shapes.** Absent from all 13 files in `public/locales/`. **CONFIRMED.**
Renders the English default in every locale.

**(c) Cross-file claim check — this is where the item turned.**
A bare `ruby i18n_generator.rb` writes nothing (every write is gated on
`--generate`/`--merge`/`--confirm`; see the header comment in
`scripts/i18n_string_scanner.rb:6`). Dry run on this tree:
`TOTAL DUPS 0 / MISSING 0 / STRINGS 8632 / KEYLESS 0` — so the `dups > 0 || missing > 0`
gate at `i18n_generator.rb:284` would NOT block, and `--generate` would run.

Ran `--generate` against a file backup (no git command) and diffed the key sets. It
would **add 2 and remove 11**:

- Added: `display_style_save_changes` (wanted), `update_communication` — the latter is a
  legitimate rename already present in source at `templates/user/index.hbs:288`. Not a
  parse bug; I initially misread it as key truncation.
- Removed: 11 keys. Ten are genuinely unreferenced. **One is LIVE:**
  `display_style_layout_title`, used at `components/display-style.js:2061` via
  `this._decoratedTitle('display_style_layout_title', "Customize your dashboard")`.
  The scanner only matches the literal `i18n.t(` (`i18n_generator.rb:110`), so a key
  passed to a *wrapper* is invisible to it and gets pruned as dead.

**Conclusion: do NOT run `--generate` for this.** It would silently delete a string in
use — exactly the `LEARNINGS.md:147` failure class. en.json was restored from the
backup; `git status` on it is clean.

---

## Item 4 — `skip_scroll_to_top`

Read at `app/frontend/app/routes/application.js:179`, reset to `false` at `:184`. Zero
writers anywhere in `app/`, `lib/`, `spec/`. **CONFIRMED** — the guard is permanently
inert and `window.scrollTo(0, 0)` always runs. Revive-or-delete is a product call, not a
diagnosis; carried to Traci.

---

## New finding (not in the handoff)

`display_style_layout_title` is one `--generate` away from being deleted from all 13
locale files. The house pattern for this is a literal registration comment — see
`app/frontend/app/utils/dashboard_sections.js:77-80` and the note at
`app/frontend/app/utils/tours/home.js:36-40`. Adding one next to `_decoratedTitle` is a
comment-only change with no runtime effect that disarms the trap.

---

# Proposal (pre-review)

Four independent units, each its own commit and its own verification pass
(`/fix-proposal` §5: a batch shares one verification pass, so a mistake in item three
hides behind green earned by items one and two).

## Unit A — fix the `table-reponsive` typo

Change `table-reponsive` → `table-responsive` at `templates/user/log.hbs:199` and `:417`.

- **Alternative considered and rejected:** add a `.table-reponsive` rule to `app.scss`
  aliasing the correct one. Rejected — enshrines a typo, and Rule #0.7 says edit the
  original rather than stack a new rule.
- **Test:** rendering assertion that each wrapper carries `table-responsive`.
- **Mutation that must make it fail:** restore either misspelling.
- **Risk:** an overflowing table gains a horizontal scrollbar rather than spilling. That
  is the intent and matches the five already-correct sites.

## Unit B — delete the routerless `user.device`

1. Delete `router.js:144` (`this.route('device')` inside the `user` block **only** —
   `router.js:67` is `login.device` and is live).
2. Drop the now-dead `'user.device'` entry from `userSubRoutes`,
   `controllers/application.js:2308`.
3. Update the comment at `controllers/user.js:85`, which currently documents the
   declaration's existence.

- **Alternative considered and rejected:** build the missing route/controller/template.
  Rejected — nothing links to it and no product need is on record; that is a feature, not
  a cleanup.
- **Test:** assert the router has no `user.device` and still has `login.device`.
- **Mutation that must make it fail:** re-add the declaration.
- **Risk:** `/:user_id/device` goes from a blank auto-generated page to an unrecognized
  URL. Bookmark-only exposure.
- **UNRESOLVED QUESTION:** is any district bookmark or external doc pointing at
  `/:user_id/device`? Cannot be settled from the repo.

## Unit C — add `display_style_save_changes` by hand, and disarm the generator trap

1. Add `"display_style_save_changes": "Save Changes"` to `public/locales/en.json`.
2. Add `"display_style_save_changes": "*** Save Changes"` to the 12 other locales,
   matching what `--merge` writes (`i18n_generator.rb:337,349`).
3. Add a literal registration comment beside `_decoratedTitle` so
   `display_style_layout_title` survives a future `--generate`, following
   `utils/dashboard_sections.js:77-80`.

- **Alternative considered and rejected:** run `--generate` + `--merge`. Rejected — on
  this tree it deletes `display_style_layout_title`, which is live at
  `display-style.js:2061`. Evidence in the item 3 fact sheet above.
- **HONEST SCOPE:** this changes nothing a user sees today. `utils/i18n.js:448` ignores
  any value starting with `*** ` and renders the inline English default, so both before
  and after, every locale shows "Save Changes". The value of the change is that the key
  enters the translation pipeline (`extras:translate_ui_locales` translates `*** `
  values) and en.json carries the canonical English.
- **Test:** spec asserting the key is present in all 13 locale files, non-English values
  being exactly `*** ` + the English.
- **Mutation that must make it fail:** remove the key from any one locale file.
- **Risk:** low. Adding keys never overwrites (`json[key] || "*** ..."`).

## Unit D — `skip_scroll_to_top`

No code change proposed. Revive-or-delete is a product decision; carried to Traci.

---

# Post-review corrections (all independently re-verified by me)

Adversarial reviewer #1 returned two HIGH findings on Unit B. Both CONFIRMED by my own
read; the first falsifies a claim I made above.

## CORRECTION 1 — Unit B's stated behaviour change was WRONG

I wrote that `/:user_id/device` becomes "an unrecognized URL" after deletion and that
`error.hbs` would render. **False.** `router.js:163` declares

```js
this.route('board', { resetNamespace: true, path: '/*key'}, function() {
```

a globstar matching any path. route-recognizer prefers fewer stars, so today the
0-star `/:user_id/device` wins over the 1-star `/*key`; after deletion only `/*key`
matches and the URL loads the **board** route with key `<user_id>/device`. `error.hbs`
is irrelevant. **CONFIRMED** at `router.js:163`.

**Consequence I had missed entirely:** board keys are `username/boardname`
(`app/models/board.rb:112`). So the routerless `user.device` currently **shadows** any
board a user names "device", making it unreachable at its canonical URL. Deleting the
declaration is therefore a small genuine **bug fix**, not only a cleanup. No such board
exists in the dev DB (`select key from boards where key like '%/device'` → 0 rows);
whether one exists in staging is unverified.

Every other `user.*` sub-route shadows board names too, but each of those is a real page
so the shadowing is intentional. `device` is the only one shadowing for no reason.

## CORRECTION 2 — Unit B has a FOURTH edit site

`app/frontend/app/index.html:525`, the pre-boot skeleton's `LL_USER_SUB` array, contains
`'device'`. The governing comment at `index.html:511` states the invariant: *"Classification
mirrors router.js."* Leaving `'device'` there after deleting the route is exactly the
drift that comment forbids — the skeleton would paint dashboard chrome for a URL that is
now board context. Effect is cosmetic (`is-board-context` swaps skeleton shapes,
`index.html:142-153`), but the edit site is real. **CONFIRMED.**

## CORRECTION 3 — Unit A citation

The build imports `bootstrap.min.css`, not `bootstrap.css` (`ember-cli-build.js:60`). The
min file does carry `.table-responsive{min-height:.01%;overflow-x:auto}`, so the
conclusion stands, but my CONFIRMED citation pointed at the non-imported twin.

Also: `log.hbs` has a **third** table wrapper at `:453` already spelled correctly — so
the correct spelling is precedent inside this very file, not just in five others.

## CORRECTION 4 — Unit C must warn about `--merge` too

`i18n_generator.rb:283` is `elsif ARGV.index('--generate') || ARGV.index('--merge')`, and
the branch rewrites `en.json` unconditionally at `:302-305` before merging. So `--merge`
alone is equally destructive. The instruction is **do not run `--generate` OR `--merge`**
until the registration comment lands.

The registration comment's default string must be byte-identical to
`"Customize your dashboard"` (`en.json:2235`), or the next `--generate` silently rewrites
the English in all 13 files.

## CORRECTION 5 — the prior session's clipping citation

`2026-09-21-unit2-shared-nav-component.md` blamed `app.scss:65805-65812` for clipping the
tables in the 901–1024px band. Those lines are
`.md-shell:not(.md-shell--create-board-new) { padding-top: 0 !important; }` — padding, not
overflow. Reviewer #1 independently found no `overflow`/`max-width` rule on
`.md-eval-report` or its ancestors (`app.scss:64046-64097`), so there is no pre-existing
scroll container and no double-scrollbar risk. The typo fix has a real effect.

## Unit D — strengthened

`git log --all -p -S skip_scroll_to_top` over all history returns only two added lines
ever: the read at `routes/application.js:179` and the reset-to-`false` at `:184`. **No
writer setting it true has ever existed in this repo.** The guard was born dead in
`9aa0007c0`; it has never suppressed a scroll on any page. (Wording fix: `:184` is a
write; the accurate statement is "no writer ever sets it true".)

## Pre-existing oddity noted, NOT in scope

`LL_USER_SUB` (`index.html:525`) omits `supervision`, which IS a real route
(`router.js:136`). By the skeleton's own rule a 2-segment `/:user/supervision` is
therefore classified as board context. Cosmetic skeleton-only effect. Flagged, not fixed.

---

# Reviewer #2 (independent) — convergence and new findings

Reviewer #2 reached the **globstar blocker independently**, without seeing reviewer #1's
report. Independent convergence on the same falsification is the strongest evidence
available, so CORRECTION 1 above is settled.

## VERIFIED NEW DEFECT — live, shipped, affects 12 locales

`app/frontend/app/utils/eval.js:515` puts two `i18n.t(` calls on ONE line with MIXED
quote styles:

```js
name: evaluation.i18n.t('introduction', 'Introduction'),
description: evaluation.i18n.t('brief_introduction', "A short introduction, including instructions, for the evaluation tool")
```

The generator reads the key `introduction`, then scans forward for a `"`
(`i18n_generator.rb:136-140` only accepts a DOUBLE-quoted default), skips the
single-quoted `'Introduction'`, and captures the NEXT call's string. Shipped result,
**CONFIRMED by direct read**:

- `public/locales/en.json:3302` → `"introduction": "A short introduction, including
  instructions, for the evaluation tool"` — wrong; should be `"Introduction"`.
- `public/locales/en.json:3303` → `"find_targets"` likewise carries a shifted value.
- `brief_introduction` is absent from en.json entirely (grep count 0).
- Machine-translated into every locale: `public/locales/fr.json:2349-2350` carries the
  French of the WRONG string.

English users are unaffected — `initializers/attempt_lang.js:37-41` returns early for
`en` and never loads en.json into `i18n.langs`. **Non-English users see a long
description where the section name "Introduction" belongs.**

This is the CLAUDE.md quoting convention (user-facing strings double-quoted, all others
single) being load-bearing for the generator, exactly as the convention warns. Separate
bug, separate PR — recorded here so it is not lost.

## Corrections to my own fact sheet from reviewer #2

- **"TOTAL MISSING 0" does NOT mean "no keys are missing from en.json".** The counter at
  `i18n_generator.rb:150` increments for a malformed `i18n.t(` call with no parseable
  default. It never checks whether a key reached the locale files. My item-3 fact sheet
  quoted that number in a way that implies more than it means.
- **The scale of the class:** 115 further JS keys use a single-quoted default (e.g.
  `controllers/system-settings/app-defaults.js:75`) and are therefore invisible to the
  generator and absent from en.json. Unit C fixes 1 instance of a ~117-instance class.
  Stating that plainly here so the worklog does not read as if the class was handled.

## Test-strategy rulings accepted

- **Unit A:** a render test is not feasible at sensible cost — `templates/user/log.hbs:1`
  wraps everything in `<OpeningObserver>`, `:199` sits under
  `{{#if this.processed_assessment.*}}` gates, and the model comes from
  `routes/user/log.js:11-33`. Use a static RSpec source guard modelled on
  `spec/templates/signup_consent_contract_spec.rb:12`, written as the CLASS (near-miss of
  a Bootstrap utility class) rather than a one-off pin.
- **Unit B:** needs a test; nothing in this repo pins route existence (zero hits for
  `recognize(`, `router:main`, `_routerMicrolib` under `app/frontend/tests/`). Use
  `RouterService#recognize`: `/someone/device` is the red assertion, `/login/device`
  stays `login.device` as the hazard guard, plus an assertion encoding the corrected
  board-glob resolution.
- **Unit C:** `privacy_locale_english_pins_spec.rb` is the WRONG model — it pins `*** `
  English permanently, so the first real translation turns it red and someone edits the
  test to pass (CLAUDE.md #14). Adding to `WordData::ENGLISH_PINNED_LOCALE_KEYS` would be
  actively harmful: `app/models/word_data.rb:724` folds that list into `nopes`, so
  `extras:translate_ui_locales` would permanently SKIP the key — defeating the only thing
  unit C achieves. Drop the proposed "present in all 13 as `*** `" assertion too; it
  guards nothing and rots on first translation.
  The right test is a scoped completeness spec: every key passed to
  `i18n.t('key', "double-quoted default")` under `app/frontend/app/**/*.js` exists in
  en.json. Measured against this tree it fails on exactly 2 keys —
  `display_style_save_changes` and `brief_introduction` — so it is red for the right
  reason. It requires adding `brief_introduction` in the same commit.
- **C3 (registration comment) splits into its own commit** and lands FIRST, since it is
  the only change that disarms a live trap.

---

# What landed (uncommitted — awaiting Traci's approval to commit)

## Unit A — COMPLETE, red→green

1. `spec/templates/bootstrap_class_typos_spec.rb` (new). Written as the CLASS per
   reviewer #2: scans every `.hbs` under `app/frontend/app/{templates,components}` for
   known near-misses of Bootstrap utility classes, seeded with `table-reponsive`.
   Modelled on `spec/templates/signup_consent_contract_spec.rb:12`. Includes a
   glob-sanity example so a silently empty scan cannot pass.
2. `app/frontend/app/templates/user/log.hbs:199,417` — `table-reponsive` →
   `table-responsive`. Line `:453` was already correct; all three wrappers now agree.

**Falsification:** the spec was run BEFORE the fix and failed naming exactly
`log.hbs:199` and `log.hbs:417`; after the fix, `3 examples, 0 failures`.

## C3 — COMPLETE (split out of Unit C per reviewer #2, landed first)

`app/frontend/app/components/display-style.js:2061` — literal i18n registration comment
above the `_decoratedTitle` call, following `utils/dashboard_sections.js:77-80`. Default
string verified byte-identical to `en.json:2235`.

**Verified disarmed:** re-ran `--generate` against a backup. `display_style_layout_title`
is no longer in the removal set; the remaining 10 removals are the keys both reviewers
independently confirmed dead. en.json restored, `git status` clean.

## Gates

- `npm run lint:js:ci` → `filesScanned=1204 findings=1604 baseline=1604 new=0`. The one
  `.eslint-todo` entry for display-style.js is at line 1460, ABOVE the 2061 insertion, so
  no line-anchor shift occurred.
- `npm run lint:hbs` → exit 0.
- Node 22 confirmed (`v22.23.2`) before both runs.
- Full Ember suite NOT run (standing instruction; CI covers it). ESLint parsed
  display-style.js successfully, which proves the comment insertion is syntactically
  valid; `lint:hbs` parsed log.hbs, which proves the template still compiles.

## Still open

- **Unit B** — investigation complete, blocked on Traci's go. Four edit sites, not three.
- **Unit C** — blocked on a scope call: the correct completeness spec also requires
  adding `brief_introduction`, a second unplanned key.
- **Unit D** — product call.
- **`utils/eval.js:515` scanner desync** — separate PR.

---

# Round 2 — Traci's decisions

- **Unit B: keep the route.** Only the comment work proceeds. NOTE: the comment at
  `controllers/user.js:85` is ALREADY accurate ("declared in the router with no route,
  controller or template"), so there is nothing to correct. What is worth adding is the
  board-shadowing fact, which was not previously known.
- **Unit C: both keys + completeness spec.** Done, below.
- Scroll guard and eval.js: explanation requested before deciding.

## Unit C — COMPLETE, red→green

1. `spec/templates/i18n_key_completeness_spec.rb` (new). Asserts every key passed to
   `i18n.t('key', "double-quoted default")` under `app/frontend/app/**/*.js` exists in
   en.json. Scoped to the double-quoted form deliberately, with the reason in the header:
   ~115 keys use a single-quoted default, are invisible to the generator
   (`i18n_generator.rb:136-140`), and scanning for them would make the spec red on ~117
   keys so it could never land. Includes an empty-scan guard.
   Per reviewer #2 it does NOT assert the `*** ` shape across the other 12 files — that
   guards nothing (`utils/i18n.js:447-448` treats a `*** ` value and a missing key
   identically) and would rot on first translation.
2. Both keys added to all 13 locale files: `display_style_save_changes` ("Save Changes")
   and `brief_introduction`. English gets the real string, the other 12 get
   `*** ` + English, matching `--merge` (`i18n_generator.rb:337,349`).

**Round-trip safety proven first:** all 13 files re-serialise byte-identically under
`JSON.pretty_generate` with no trailing newline, so `git diff --numstat` is exactly
`2 0` per file — no reformatting churn.

**`ENGLISH_PINNED_LOCALE_KEYS` deliberately NOT used.** `app/models/word_data.rb:724`
folds that list into `nopes`, so `extras:translate_ui_locales` would permanently skip the
keys — the opposite of the goal. Verified by read.

**Falsification:** spec run BEFORE the keys were added, failing on exactly
`display_style_save_changes (display-style.js:2013)` and
`brief_introduction (utils/eval.js:515)` — matching reviewer #2's independent
measurement. After: `spec/templates/` → `8 examples, 0 failures`.

**KNOWN INSTABILITY, by design:** a future `--generate` would prune `brief_introduction`
again, because the `introduction` call on the same line still swallows its string. The
new completeness spec is exactly the detector for that. `display_style_save_changes` is
stable (verified: absent from the removal set).

## The eval.js defect, fully characterised

`utils/eval.js:515-518`. Each line has TWO `i18n.t(` calls: a `name:` with a
SINGLE-quoted default and a `description:` with a DOUBLE-quoted one. The scanner reads
the name's KEY, then scans forward for a `"` (`i18n_generator.rb:136-140` accepts only a
double-quoted default), skips the single-quoted name text, and captures the
DESCRIPTION's string. Four keys hold the wrong value in en.json:

| key | en.json value (WRONG) | should be |
|---|---|---|
| `introduction` | "A short introduction, including instructions, for the evaluation tool" | "Introduction" |
| `find_targets` | "Find a target in a grid of empty buttons" | "Find Targets" |
| `differentiate_targets` | "Find a target in a grid of populated buttons" | "Differentiate Targets" |
| `alternate_symbols` | "Find targets using different symbol libraries" | "Alternate Symbol Libraries" |

Why only `brief_introduction` went missing while the other three description keys are
present: `find_target_level`, `diff_target_level` and `symbols_level` each have a SECOND,
standalone call at `eval.js:767-769` where the scanner does see them.
`brief_introduction` has no second site. **CONFIRMED by grep.**

All four wrong values were then machine-translated into every locale, e.g.
`es.json` `"introduction": "Una breve introducción, incluidas las instrucciones, para la
herramienta de evaluación…"`.

English is unaffected: `initializers/attempt_lang.js:38` early-returns for `^en` and
never loads en.json into `i18n.langs`, so English renders the inline defaults.
**Non-English users see four eval-tool section NAMES replaced by their descriptions.**

Root cause is the CLAUDE.md quoting convention being violated on those four lines
(user-facing strings must be double-quoted). The minimal source fix is to double-quote
the four name defaults; the locale VALUES then also need correcting in 13 files, and the
12 machine translations reset to `*** ` so the rake retranslates them.

---

# Unit D — scroll guard DELETED (Traci: delete, conditional on verifying app-wide behaviour)

`routes/application.js:179-184`. Traci's condition was "each page should scroll to the
top when the user navigates there, so if it already does it, then we can delete this,
but verify that the app already does this app-wide."

**Verified two ways.**

1. **Static.** No writer setting the flag true has ever existed
   (`git log --all -S skip_scroll_to_top`), so the guard was always falsy and the branch
   always ran. Deleting it therefore cannot change behaviour — this is a provable no-op.
2. **Observed on the running app.** New probe
   `app/frontend/scripts/scroll-to-top-qa.mjs` drives real in-app navigation (never
   `page.goto` between steps) and measures the window, `#content`, and any overflowing
   inner element. Result **3/3 conclusive, all RESET-TO-TOP**, covering a same-route
   query-param filter link (Logs → "Show Only Messages") and two cross-route moves.
   Re-run AFTER the deletion: **identical, 3/3**.

First probe run was 1/3 conclusive because it assumed `#content` was the scroller; the
app uses different scrollers per route, so the probe now discovers the real one. Recorded
because assuming a single scroller would have produced a false "inconclusive".

The other `scrollTo(0,0)` sites (`controllers/application.js:1772,1825`,
`dashboard/authenticated-view.js:1346-1412`, `search.js:387`, `guided-tour.js:268`) are
NOT competing app-wide handlers — each is a targeted supplement for one action or for a
nested container. The application route's `didTransition` is the only app-wide one.

**ESLint re-anchoring.** The replacement comment made the file net +6 lines and the
gate reported 2 "new" findings. Proven pure line shift before touching the baseline:
`ember/no-runloop|185|7|2|5addc2170315` → reported at `191:7`, and
`lingolinq/no-orphaned-action|205|5|1|492ba5da3bab` → reported at `211:5` — identical
rule, column, severity and hash, both delta exactly +6, matching the file's net delta,
while the third entry (line 74, above the edit) was untouched. Re-anchored those two
lines only; total findings unchanged at 1604. NOT a regeneration.

---

# Unit E — eval.js i18n desync FIXED (Traci: "fix it in the best way that won't cause regressions")

## Scope correction: it is NINE keys, not four

My earlier report said four. Wrong — a systematic scan for the corrupting shape found
**nine**, the entire evaluation section list, `utils/eval.js:515-523`. All nine name keys
held their own description's text in en.json, machine-translated into all 12 non-English
locales.

## Why this shape and no other

A scan for "line contains an `i18n.t` with a single-quoted default followed by another
`i18n.t`" returns 12 lines, but 3 are false positives:
`components/sidebar-button-settings.js:118`, `controllers/sidebar-button-settings.js:75`
and `controllers/setup.js:379` have ALL defaults single-quoted, so no double-quoted
string follows and nothing is misfiled — those keys (`am`, `pm`) are simply never
extracted and are absent from every locale file. Different symptom, same convention
violation, ~115 keys in total, out of scope and logged.

The precise corrupting shape is **a single-quoted default followed on the same line by a
double-quoted string**, which matches exactly the 9 eval.js lines and nothing else.

## Fix chosen, and the alternative rejected

**Chosen: give the nine name defaults double quotes.** This is the CLAUDE.md convention
(user-facing strings double-quoted) and is a pure no-op at runtime — `'X'` and `"X"` are
the same JS string. It makes the generator read each key with its own default.

**Rejected: split each `res.push` across multiple lines.** Also works, since the scanner
is line-based, but it is a much larger diff, churns code that is otherwise fine, and
leaves the convention violation in place so the next single-line edit reintroduces the
bug.

## Regression check before touching locale data

All nine name keys have **zero other consumers** — each is read at exactly one site,
`eval.js:515-523`. Verified by grep for `i18n.t('<key>'` and `key='<key>'`. So correcting
their en.json values cannot affect any other screen.

A repo-wide "en.json value equals source default" check was considered as the test and
**rejected**: 68 keys legitimately differ because `record_string`
(`i18n_generator.rb:86-95`) deliberately preserves an existing English value over the
inline default (e.g. `dark_skin_tone` is "Dark" in en.json vs "Dark Skin Tone" in
source). Pinning the corrupting SHAPE is unambiguous; pinning values is not.

## What changed

1. `app/frontend/app/utils/eval.js:515-523` — nine name defaults single → double quotes.
2. `public/locales/en.json` — nine name keys corrected to their true values.
3. The 12 non-English files — those nine keys reset to `*** ` + correct English, matching
   what `--merge` writes, so `utils/i18n.js:448` falls back to the correct English default
   and `extras:translate_ui_locales` retranslates them (it walks the locale file's own
   keys, `word_data.rb:726`, so the key must be present to be picked up).

## Tests

`spec/templates/i18n_mixed_quote_desync_spec.rb` (new) pins the corrupting shape, with a
header stating why it is not a value-equality check.

**Red before:** named all 9 lines and nothing else. **Green after.**
**Falsified:** reverted `:515` alone from a self-made copy (not `git checkout`) — spec
went red naming exactly `eval.js:515`; restored → `spec/templates/` 9 examples, 0 failures.

## Strongest evidence the root cause is gone

Ran `--generate` against a backup after the fix. All 12 relevant keys — the nine names,
`brief_introduction`, `display_style_save_changes`, `display_style_layout_title` —
came back **STABLE**: regeneration now reproduces exactly what was hand-written, and
`brief_introduction` has dropped off the prune list (it was on it before this fix).
Generator dry run: `DUPS 0 / MISSING 0 / STRINGS 8634 / KEYLESS 0`.

## Gates

`lint:js:ci` 1604/1604 grandfathered, **0 new**; `lint:hbs` exit 0. Full Ember suite not
run (standing instruction). The eval.js change is quote-style only and ESLint parsed the
file, which proves syntactic validity; the strings contain no double-quote characters.

---

# Unit F — the 117 untranslatable keys (Traci: "fix it now in this batch")

## Measured scope

284 JS calls passed a single-quoted default. 145 of their keys were already in en.json
(quote fix only, no data change); 139 calls / **117 distinct keys** were absent from every
locale file. 68 files touched. **Zero keys had conflicting defaults across sites**, so the
conversion was unambiguous. Only 2 defaults contained a double quote and **none contained
a backslash**, so escaping was trivial and `\'` / `\\` parity issues could not arise.

Checked before converting: `app/frontend/.eslintrc.js` has **no `quotes` rule**, so
double-quoting could not create 284 lint errors.

## Two more shipped corruptions, found BY the fix

`generate_board_labels_placeholder` and `labels_required`
(`components/generate-board.js:134,256`) were stored in all 13 locale files as
`"Generate with AI"`. Their single-quoted defaults contain a NESTED double-quoted
fragment (`... click "Generate with AI" to fill ...`), and the scanner's forward hunt for
a `"` landed inside the string and captured just that fragment.

So a Spanish user who tried to create a board without labels got the error
`"Generar con IA"` instead of "Please add labels before creating the board…". Same
root cause as the eval.js nine, different manifestation. Both corrected across 13 files.

Also added `update_communication` (`templates/user/index.hbs:288`), missing while its
superseded twin `update_communication_profile` lingered. It is a TEMPLATE key, which is
why the JS-only completeness spec never flagged it.

## Why hand-added, not generated

Established by test first that `--generate` changes **zero** existing English values
(8641 common keys, 0 changed) because `record_string` preserves them
(`i18n_generator.rb:86-95`). So hand-adding writes exactly what the tool would.

Rejected running it anyway for two reasons: it reorders ~7590 of 8638 keys, which would
bury a 117-key addition in an unreviewable 8600-line diff; and it prunes 10 dead keys,
which is correct hygiene but a separate decision that was not asked for.

17 of the 117 already had real translations in the non-English files while being absent
from en.json (e.g. `sessions` → `"Sesiones [[ Sessions"` in es). Those were kept, which
is also `--merge` behaviour (`json[key] || "*** ..."`).

## Verification

**The strongest check available:** after the fix, `--generate` against a copy reports
**remove 10 / add 0 / change 0** — the 10 being the pre-existing dead keys, deliberately
untouched. Source and locale data now agree exactly. Dry run
`DUPS 0 / MISSING 0 / KEYLESS 0 / STRINGS 8751`.

The completeness spec was **widened** from the double-quoted form to both forms; the
scoping caveat in its header existed only because these 117 keys made a total scan
impossible. Red on 115 before, green after. `lint:js:ci` 1604/1604 grandfathered, 0 new
(no line counts changed, so no anchor shift). `lint:hbs` exit 0.

---

# Commits (6)

| SHA | Unit |
|---|---|
| `0577619d1` | A — table-responsive typo + class-level guard spec |
| `6ff81c4db` | C3 — register display_style_layout_title for the scanner |
| `6192c1687` | C — two missing keys + completeness spec |
| `9bc2e85c3` | D — delete the scroll guard that never fired |
| `dab9e1ef0` | E — nine eval section names holding their descriptions |
| `17d40e909` | F — 117 untranslatable keys + two more corruptions |

# Still open, deliberately

- **`user.device`** — Traci chose to keep the route. Its comment at
  `controllers/user.js:85` is already accurate, so nothing was edited. NEW fact worth
  recording: the declaration **shadows** any board keyed `<username>/device`
  (`router.js:163` is a `/*key` globstar; board keys are `username/boardname`,
  `app/models/board.rb:112`), making such a board unreachable at its canonical URL.
- **10 dead locale keys** (`launch_setup`, `view`, `display_style_back`, …) — a future
  `--generate` prunes them. Verified unreferenced by two independent reviewers. Not
  pruned here because it was not asked for.
- **`LL_USER_SUB` omits `supervision`** (`app/frontend/app/index.html:525`) while
  `supervision` IS a real route (`router.js:136`), so the pre-boot skeleton classifies
  `/:user/supervision` as board context. Cosmetic, skeleton-only.

---

# Translation rake — DEFERRED by Traci (2026-09-21). Do not run it to "finish" this work.

The 128 `*** ` entries added today are **complete as they stand**. They render correct
English via the `*** ` fallback (`utils/i18n.js:448`), and Traci's decision was to leave
them that way for now. This is a finished state, not a loose end.

**Why it is not a quick follow-up.** `extras:translate_ui_locales` translates EVERY
`*** ` value in a locale file; it cannot be scoped to the keys added today. Measured:

| | keys |
|---|---|
| `*** ` entries from this batch | ~128 |
| pre-existing backlog | ~5,336 |
| **total the rake would translate** | **5,464** across 12 locales |

Spanish alone is 460 `*** ` entries, only 114 of them from this batch. So running it
machine-translates several thousand strings into 12 files in one unreviewed diff and
spends the Google Translate budget accordingly. That is a deliberate product decision,
not housekeeping.

**Blocked on auth anyway.** `op` has the account configured (`lingolinqllc`) but was not
signed in, and `GOOGLE_TRANSLATE_TOKEN` exists only as an `op://` reference in
`.env.op.local` (commented out in `.env`). `op signin` is interactive. Note a plain
session token will NOT carry into an agent's Bash calls, which do not inherit shell
state — the desktop-app integration or `OP_SERVICE_ACCOUNT_TOKEN` is needed for that.

The three pinned privacy keys are safe from the rake regardless:
`WordData::ENGLISH_PINNED_LOCALE_KEYS` folds into `nopes` (`app/models/word_data.rb:724`).
