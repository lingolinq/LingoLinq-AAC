# Handoff continuation — button-set exposure, Categorize copy, a11y regressions

Branch: `traci/fix/restore-speak-options`. Picks up the STILL OPEN list in
`2026-09-04_adversarial-review-findings-and-proposals.md`.

Rule #0.12 applies: this file holds FACT SHEETS and PROPOSALS. No code is written until
the proposals have been adversarially reviewed.

---

## Session preconditions

- `ember serve` is RUNNING (pid 718418, started 00:46). Item 7 (full `ember test`) CANNOT be
  run until it is stopped — contention is what truncated every prior attempt. Not killed:
  it is the user's dev server. CONFIRMED by `ps aux`.
- Shell default node is **v16.20.2**; repo needs 22. `nvm use 22` resolves v22.23.2.
  CONFIRMED. Any test run must source nvm first (CLAUDE.md rule #0.10).

---

# UNIT A — Categorize panel copy (open item 2)

## Fact sheet

**(a) Where is the value READ?** CONFIRMED.
`controllers/user/board-detail.js:6570-6576` — `categorize_enabled` reads
`app_state.referenced_user.preferences.board_category_grouping.enabled`, i.e. the TOP LEVEL
of the user's preference hash, not a per-board entry. The write side agrees:
`_save_category_grouping` computes `next_enabled` from `all` (the user hash) at `:6608`, and
the comment at `:6606-6610` states `enabled` is PER-USER explicitly.
=> the switch is account-wide. The copy at `board-detail.hbs:3715` ("Organize **this
board's** buttons…") and `:3717` ("**This board's** buttons are shown…") is inverted.

**(b) What are ALL the shapes / who writes each?** CONFIRMED — call-site counts, which is
the fact the review said to check FIRST:
- `board_categorize_group_hint` — **1** call site (`board-detail.hbs:3715`).
- `board_categorize_group_hint_off` — **1** call site (`board-detail.hbs:3717`).
Both keys are present in all **13** locale files (`public/locales/*.json`).

This RESOLVES the hazard the review warned about. `i18n_generator.rb:27` starts
`strings = {}` EMPTY; `existing_english_strings` is loaded from `en.json` at `:76`. The
silent-revert branch at `:86-89` is guarded by `if strings[key] && …`, so it can only fire
when a key is recorded TWICE IN ONE RUN — i.e. two call sites with different English. With
one call site each, `strings[key]` is nil on the only call and the branch never runs.
**Editing the English in place is safe for these two keys.**

**(c) Claims about other files.** CONFIRMED, and one CORRECTS the review:
- `i18n.js:447-449` — a locale value is used only `if(lang_str && lang_str.substring(0,4) != '*** ')`,
  and the English tail is stripped by `.split(/\s\[\[\s/)[0]`. So `*** ` IS the untranslated
  marker and falls back to the template's English default. 170 such entries already exist in
  `es.json`, so the convention is established.
- **The review's stated mechanism does not work as described.** It said to *blank* the key so
  `--merge` rewrites it as `*** <english>`. The merge back-fill is
  `new_json[arr[0]] = json[arr[0]] || "*** #{…}"` (`i18n_generator.rb:349`) and the main path is
  `new_json[key] ||= string` (`:340`). **An empty string is TRUTHY in Ruby**, so a blanked key
  is PRESERVED as `""`, not rewritten. To get the `*** ` marker the key must be DELETED from
  the locale file, not blanked. (It would still fall back at runtime — `""` is falsy in JS at
  `i18n.js:448` — but it would leave 12 files holding a value that no translator will ever see
  flagged as needing work.)
- `controllers/user/board-detail.js:230` — `category_ordering_available: false`, and
  `board-detail.hbs:3740` / `:3856` gate the arrows on it. **The arrows never render**, so the
  hint's second sentence ("Use the arrows below to change the order") is false independently of
  the scope error. Both sentences must be fixed together.
- `i18n_generator.rb` with NO args prints only the dup/keyless report — a safe dry run.
  `--generate`/`--merge` abort wholesale if `dups > 0 || missing > 0` (`:284-285`).

## Candidate fixes — NOT YET IMPLEMENTED

**A — reword in the template, then run `ruby i18n_generator.rb --generate --merge`.**
The idiomatic route. Cost: `--generate` rewrites `en.json` in full and `--merge` rewrites all
12 other locales; blast radius is every key in the repo, and it aborts if ANY unrelated
duplicate exists. Requires a no-arg dry run first.

**B — reword in the template, hand-edit only the two keys.** Update the two values in
`en.json` to the new English, and replace the two values in the 12 non-English files with
`*** <new english>` (the marker the app already honours). Identical end state, blast radius of
exactly 26 lines, no generator run. Downside: bypasses the tool, so it is only correct BECAUSE
the call-site count is 1 (fact (b)) — with a shared key it would be wrong.

**C — reword only the template and leave locales stale.** REJECTED: 12 locales would keep
asserting the false per-board scope, which is the clinically significant half of the bug.

Leaning **B**, with A's no-arg dry run kept as the check that no unrelated dup exists.

**Open question for review:** the panel `aria-label` at `:3684` is "Categorize board"
(`board_categorize_panel`). The review listed it with the two hints. I am NOT convinced it is
wrong: the region genuinely contains per-board display sub-settings alongside the account-wide
switch, so "Categorize board" names the PANEL rather than claiming the switch's scope. Flagged,
not changed, pending the review's view.

## Test that must accompany it (RED FIRST) — TO BE DESIGNED
Weakest passing state to beat: a test that only asserts the key exists would pass against the
current false copy. Candidate: assert `en.json` and every locale value for both keys contains
no per-board phrasing AND that the on-state hint does not promise arrows while
`category_ordering_available` is false. Mutation that must make it fail: restore either
original string.

---

# UNIT B — cross-student button-set exposure (open item 1)
Trace delegated; awaiting result. Decides High vs blocker.

# UNIT C — two branch-introduced a11y regressions (open item 5)
Confirmation delegated; awaiting numbers.

---

# UNIT D — test hardening (open item 4)

## Fact sheet (all CONFIRMED)

`tests/unit/controllers/user-board-detail-category-per-user-test.js:135`:
```js
assert.notOk((written.boards || {})['user/a'] && written.boards['user/a'].enabled === true, …)
```
Seed (`:126-129`): `{ enabled: true, boards: { 'user/a': { enabled: true } } }`, then
`_save_category_grouping({ enabled: false })`.

**Weakest passing state (rule #0.14.2):** the assertion is a conjunction, so it passes if
`written.boards` is missing, if the `'user/a'` ENTRY is missing, or if the entry is present
without `enabled`. Only the third is the intended pass. A regression that dropped the whole
`boards` map — deleting every other board's display settings — would leave this test GREEN.
That is the defect, and it is not fixed by adding a second negative assertion.

**The exact shape the writer produces** for this seed, traced through
`controllers/user/board-detail.js:6605-6680`:
- `next_enabled` = `false` (`:6608`, `changes.enabled === false`).
- entry `next` (`:6617-6636`) = `{ order: normalize_order(undefined), show_category_names: true,
  vertical_scroll: true }` — no `enabled` key, and both display flags default TRUE because
  absent means true for them (`:6629`, `:6633`).
- `written` (`:6674-6680`) = `{ enabled: false, order: normalize_order(undefined),
  show_category_names: true, vertical_scroll: true, boards: { 'user/a': next } }`.
- `normalize_order(undefined)` returns `DEFAULT_CATEGORY_ORDER` verbatim
  (`utils/board_categories.js:703-712` — non-array input yields the full registry order,
  never empty), and that constant is already exported at `:279`.

## Candidate fixes — NOT YET IMPLEMENTED

**A — assert the pre-condition, then pin the whole written shape.** `assert.ok(written.boards
&& written.boards['user/a'], …)` first, then `assert.deepEqual(written, {…})` against the
shape above, importing `DEFAULT_CATEGORY_ORDER`. Kills every weak-pass route at once and
documents the contract. Cost: the test now fails on any deliberate shape change, which is
either the point or churn depending on how settled the shape is.

**B — pre-condition plus the two targeted assertions** (`entry` exists;
`assert.notStrictEqual(entry.enabled, true)`). Smaller, still closes the missing-entry hole,
does not pin `order`/display defaults. Does not catch a regression that silently changed a
display default.

**C — the review's other suggestion, a second negative assertion only.** REJECTED: it does not
address the conjunction's short-circuit, which is the actual hole.

Leaning **A**: the shape is the thing three of this file's five tests exist to protect, and it
is freshly settled on this branch, so pinning it now is cheap.

**Mutation that must make it fail:** in `_save_category_grouping`, change `boards[write_ref] =
next` to a no-op (entry never written) — A goes red on the pre-condition, B goes red, C stays
GREEN. Second mutation: restore `enabled: next_enabled` into `next` — all three go red.

### Unit A — generator feasibility, MEASURED

`ruby i18n_generator.rb` (no args, dry run) at HEAD:
```
TOTAL DUPS 0 / TOTAL MISSING 0 / TOTAL STRINGS 8454 / TOTAL KEYLESS 0
```
`git status --short` after the run: clean — the no-arg path writes nothing. CONFIRMED.

So option A would NOT hit the `dups > 0 || missing > 0` abort (`i18n_generator.rb:284-285`).
A is feasible; the choice between A and B is now purely blast radius (8454 keys rewritten
across 13 files vs 26 lines), not risk of failure.

---

# UNIT B — cross-student button-set exposure (open item 1) — SEVERITY RESOLVED

## The question the handoff posed
"Does the foreign image merely display, or does it reach `working_vocalization` and thus
sharing/logging?" **ANSWER: it is transmitted to the server under the wrong student.**
Traced by a subagent, then every load-bearing link re-verified by me directly in the files.

## Fact sheet

**(a) Where is the value READ?** CONFIRMED, re-verified.
`loaded_button_sets_beyond` (`utils/word_suggestions.js:1459-1477`) has exactly ONE consumer,
`word_suggestions.js:1537` (grep returns only the definition and that line). Its winner is
delivered as `button.image` — a **string URL** — at `:1516`.

**(b) What are ALL the shapes / who writes each?** Four call sites of
`attach_image_for_label`; each traced to its terminus:
- `utils/utterance.js:588` (typing + `:space`) — **REACHES THE SERVER.** The callback sets
  `suggestion_image` on `b` (`:589`); `utils/button.js:1694-1696` copies it into
  `altered.image`; `altered` enters `buttonList`, which is persisted by
  `stashesService.persist('working_vocalization', buttonList)` at **`utterance.js:314`**.
  All four lines read and confirmed.
- `controllers/user/board-detail.js:1266` -> `:8682` (prediction-rail tap) — **REACHES THE
  SERVER**, same terminus via `complete_word`.
- `controllers/user/board-detail.js:1589` (sentence chips) — **STOPS.** Writes only the
  controller-local `sentence_parts` mirror; nothing copies it back into `rawButtonList`.
  Negative result, and a real one.
- The classic board `:suggestion` rail (`controllers/board/index.js:1610-1641`) is fed from
  the SCOPED lookup only. **Not affected.**

**(c) Claims about other files.** CONFIRMED — I read each of these myself:
- `components/share-utterance.js:67-71` — `createRecord('utterance', { button_list:
  settings.utterance, …, user_id: app_state.get('referenced_user.id') })` then `u.save()`.
  The foreign URL is saved to a record **owned by Student B**.
- `app/models/utterance.rb:24` — `self.data['image_url'] ||= self.data['button_list']
  .map{|b| b['image'] }.compact.first`. The foreign symbol can become the **shared preview
  image** of Student B's sentence.
- `app/frontend/app/models/log.js:281-291` — the client scrubber nulls
  `events[idx].button.image` **only when it matches `/^data/`, and only on `button` events**.
  It never inspects `event.utterance.buttons[]` and never strips an `http` URL. **The scrubber
  does not catch this.**
- It travels as a **URL, never as a foreign `button_image_id`** — the activation object
  carries `image: <string>` only. So this is not a foreign server-side id landing in another
  student's record; it is a foreign **URL**.
- Protected images are already filtered by accident: `fix_image` stamps the CURRENT user's
  `protected_image_token`, so a foreign protected image 403s and
  `is_placeholder_image` (`:1513`) skips the candidate. The residue is foreign
  **non-protected uploads** and shared-library symbols.

**Severity.** Two distinct harms, and they do not need the same evidence:
1. **Clinical correctness — CONFIRMED unconditionally.** The wrong symbol is attached to an
   AAC user's utterance and stored in their log. True even when the image is a harmless
   shared-library symbol.
2. **Cross-student data exposure — CONFIRMED as a mechanism, frequency ASSUMED.** A foreign
   student's non-protected uploaded symbol URL can be written into Student B's log and share
   record. How often non-protected uploads occur is NOT traced and is NOT load-bearing: fix 1
   fixes 2.

## Candidate fixes

**D — revert the widened pass.** Delete `loaded_button_sets_beyond` and its call. Zero new
mechanism, provably closes both harms. Costs the symbol-coverage feature and deletes two
passing tests. Honest fallback; must be stated as a capability loss, not hidden.

**C — purge resident sets on speak-as change.** `unloadAll('buttonset')` when
`referenced_speak_mode_user` changes. Root-cause in spirit, but risks unloading a record a
live consumer holds, and forces a re-fetch on every switch-back.

**F' — stamp each set with its loading user context, read only matching sets.** The prior
review already showed the naive form is a partial fix: the store has at least four writers
including `Utils.all_pages('buttonset', {user_id})` (`components/button-suggestions.js:219`,
`controllers/button-suggestions.js:170`), and a stamp in `load_button_set`'s success branch
never fires for already-resident sets. Requires enumerating and stamping every writer.

**G — scope the widened pass to the current user's own board universe (NEW, PROPOSED).**
A buttonset's `id` IS its board id (`models/board.js:1357` peeks `'buttonset'` by board id).
The frontend user model already carries `stats.board_set_ids` (`models/user.js:377` `stats:
attr('raw')`; consumed at `services/app-state.js:3645`, `:3663`, `utils/edit_manager.js:2772`),
serialized at `lib/json_api/user.rb:507`. So `loaded_button_sets_beyond` can drop any set whose
id is not in `currentUser.stats.board_set_ids`.
- Uses `board_set_ids`, **NOT** `board_set_ids_including_supervisees` (`:514`) — the latter
  re-widens across students and would reintroduce the exact bug.
- `currentUser` is correct: `app-state.js:2601` sets `currentUser = speakModeUser` in speak
  mode, which is why the prior review's "switch to referenced_user" idea was refuted.
- **Fails CLOSED for free**: if `stats` or `board_set_ids` is absent the filter returns
  nothing, the widened pass yields nothing, and the code falls through to the generic word
  lookup it already has. No new failure branch to get wrong.
- No stamping (sidesteps what killed F), no unloading (sidesteps C's dangling reference),
  one module touched.

**Trade-off, stated plainly:** G NARROWS the feature. The widened pass exists for "a board
opened from the collection drawer [with] none of its tree in scope" (`:1451-1456`). Boards in
the user's own set stay covered; a PUBLIC LIBRARY board not in their set loses coverage. That
is a real capability reduction — smaller than D's, larger than zero.

**Leaning G, with D as the fallback if review finds `board_set_ids` unreliable.**

## Open questions I could NOT resolve (rule #0.13 — these are where a wrong fix hides)
1. `stats.board_set_ids` is gated on `permissions.view_detailed` (`lib/json_api/user.rb:506`).
   I have NOT verified it is populated on the speak-mode user record as loaded in practice.
   **ASSUMED, and it IS load-bearing for G's coverage** (not for its safety — absence fails
   closed). This must be checked before G is written.
2. Whether boards opened from the collection drawer are in `board_set_ids`. Decides how much
   of the feature G actually keeps. NOT traced.
3. Whether `data:` URIs can reach the share path. `assert_remote_urls`
   (`models/utterance.js:22-39`) converts local images back to remote before save, which may
   change the answer for shares vs logs. NOT traced.

## Test that must accompany it (RED FIRST, before the fix exists)
The prior review killed the earlier proposal's test as hollow: it asserted an outcome
`loaded_button_sets_beyond` excludes BY CONSTRUCTION (`searched` is filtered out at `:1461-1465`),
so it could never fail.
**Weakest passing state to beat:** a test asserting only that a foreign set is absent from the
return passes if the function returns `[]` always — i.e. against a total feature deletion.
So the test needs BOTH arms: seed two resident sets, one whose board id IS in
`currentUser.stats.board_set_ids` and one that is NOT, neither in `searched`, and assert the
in-set one IS returned and the foreign one is NOT. Only the correct filter passes both.
**Mutations that must make it fail:** (i) drop the filter -> foreign set returned -> red;
(ii) return `[]` -> in-set set missing -> red.

---

# UNIT C — two branch-introduced a11y regressions (open item 5)

Both delegated for confirmation, then every cited line re-read by me. Both CONFIRMED.
Contrast arithmetic below is mine, computed independently of the reviewer's — it reproduces
their figures to 4 decimal places.

## C1 — `.md-board-collection__locale-hint` fails AA in BOTH modes

**Fact sheet (CONFIRMED).**
- The only rule setting its colour: `app.scss:79209-79215`, declaration at **`:79214`**,
  `color: rgba($la-navy, 0.66)`. `font-size: 12px` (`:79211`), no bold anywhere on the chain
  => normal text => **4.5:1 required**.
- `$la-navy: #1B365D` (`_variables.scss:456`).
- Dark mode in this file is the shell class **`.md-board-detail--dark`** — not `[data-theme]`,
  not `prefers-color-scheme`. The dark parity block for this component runs
  `app.scss:80104-80170` and covers `__header`, `__back`, `__title`, `__body`, `__section`,
  `__section-label`, `__item`, `__item-icon`, `__item-count`. **`__locale-hint` is the one
  omission** — verified by grepping every occurrence of the class: `:79209`, `:79216`
  (text-align only), `:79220` (max-width only). No dark rule exists.
- Painting ancestor in dark: `.md-board-detail--dark .md-board-collection__header`
  `background: rgba(20,28,40,0.98)` (`:80109-80110`) over drawer `#1e2530` => **#141C28**.

**Measured (sRGB relative luminance):**

| mode | composited fg | bg | ratio | AA 4.5:1 |
|---|---|---|---|---|
| light | `#697A94` | `#FFFFFF` | **4.354** | FAIL |
| dark  | `#192D4B` | `#141C28` | **1.238** | FAIL — navy on navy, effectively invisible |

**Introduced on this branch** — the class does not exist in `origin/staging` at all.

**Candidate fixes.** Existing muted-text tokens, so the fix reuses a primitive rather than
inventing a value (rule #0.6):
- light: `$brand-slate-blue #5A6A85` = **5.476:1** — this is what the sibling
  `.md-board-collection__section-label` already uses (`app.scss:79860`). Alternative: bump the
  alpha to `0.70` = 4.884:1 (minimum passing change, keeps the exact hue).
- dark: `rgba(255,255,255,0.68)` = **8.442:1** — the value the sibling
  `.md-board-detail--dark .md-board-collection__section-label` already uses (`:80144`).
  Quieter alternative: `0.60` = 6.852:1.

**Where a fix edits (rule #0.7):** modify `app.scss:79214` in place for light, and add the
missing `.md-board-detail--dark .md-board-collection__locale-hint` entry INSIDE the existing
dark parity block (`:80104-80170`). The second is filling a documented gap in the authoritative
block, not stacking an override.

**Leaning:** reuse both `__section-label` values. One token per mode, already in the file,
already the design language for quiet secondary text in this component.

## C2 — `.md-speak-menu__title` clamp floor is below the AAC floor

**Fact sheet (CONFIRMED).**
- Authoritative rule `app.scss:18344-18372`; declaration at **`:18369`**,
  `font-size: clamp(16px, 2.45vw, 22px) !important;`. Verified as the ONLY rule setting
  font-size on this class (grep returns one hit).
- The competing `h2 { font-size: 25px !important }` (`app.scss:3613-3617`) loses: class (0,1,0)
  beats element (0,0,1) at equal `!important`. The in-file comment says the same and is correct.
- **On `origin/staging` the title rendered at 25px.** The staging rule was `font-size: 1.25rem`
  with NO `!important`, so it lost to the global `h2` — and root font-size here is 10px
  (bootstrap), so even had it won it would have been 12.5px. Two commits on this branch moved
  it: `562da8070` (1.25rem -> 22px, still no `!important`, so a no-op on screen), then
  `29de215c5` (added `!important` + the clamp). **`29de215c5` is where the rendered size
  actually changed: 25px -> 16-22px.**
- Where the floor binds: middle term `2.45vw`; `0.0245·W = 16` at **W = 653px**, `= 22` at
  **W = 898px**. At or below ~653px the title is pinned at 16px. Portrait tablets and phones —
  the common AAC form factor — sit below that, so **the floor binds in real use**.

**Correction to the reviewer's wording, which I am NOT repeating downstream:** "16px is 23%
below the plain web default" is false — 16px IS the plain web default. The 23% is correct
against the AAC-adjusted target: 16 x 1.3 = 20.8px, (20.8-16)/20.8 = 23.1%. Right number,
wrong label.

**Candidate fixes.**
- **A — raise the floor only:** `clamp(21px, 2.45vw, 22px)`. Minimal, but `2.45vw` does not
  reach 21px until W = 857px, so the fluid band collapses to 857-898px — a near-degenerate
  clamp that is really "21px below 857, 22px above".
- **B — raise the floor and widen the middle term:** e.g. `clamp(21px, 2.6vw, 25px)`. Restores
  the 25px ceiling that shipped on staging (the current 22px ceiling is itself a 12%
  reduction, though 22px still clears the 20.8px AAC target) and gives a real fluid band
  (21px below ~808px, 25px above ~962px).
- **C — drop the clamp, flat 25px `!important`** — exactly what staging rendered. Simplest and
  provably no regression, but discards whatever narrow-screen fitting the clamp was added for.

**Open question I cannot resolve from the file:** whether the 25px title actually overflowed on
a narrow screen — i.e. whether the clamp was solving a real layout problem or was cosmetic. The
commit message does not say. Without that answer I cannot choose between B and C, and I am not
guessing. This needs either a browser measurement at ~360px or Traci's recollection.

**Where a fix edits (rule #0.7):** `app.scss:18369` in place. Do NOT touch `h2` at `:3617` —
global blast radius, and the existing comment already explains why that was rejected.

---

# UNIT E — picker flip divergence (open item 3)

## Fact sheet (CONFIRMED)

`components/bound-select.js:261-265`:
```js
_panelSpaceNeeded(maxHeightCss, contentHeight) {
  const cap = parseFloat(maxHeightCss);
  if (!isNaN(cap) && cap > 0) { return cap; }
  return contentHeight;
}
```
called at `:277` with `window.getComputedStyle(list).maxHeight` and `list.scrollHeight`.

The two rules, verified in place and at EQUAL specificity (0,2,0 each), so source order decides:
- `.bound-select--grid .bound-select__list { … max-height: 360px; }` — `app.scss:90363-90369`
- `.bound-select--paged .bound-select__list { max-height: none; overflow-y: visible; }` —
  `app.scss:90389-90392`, LATER in source, so it wins for the year picker (which carries both
  classes).

=> month resolves `360px` and takes the cap branch (need **360**); year resolves `none`,
`parseFloat('none')` is NaN, so it falls to `scrollHeight` (need **349**). Two pickers with
identical trigger geometry, needs 11px apart, therefore flip thresholds ~11px apart. Measured
in a browser last session: they point OPPOSITE directions at vh 882-886.

## Candidate fixes
**A — declare the flip requirement explicitly.** Add `--bs-flip-need: 360px` to the EXISTING
`--grid` rule (`:90363`) and have `_panelSpaceNeeded` prefer it over `max-height`. Both pickers
then need 360 and agree. Keeps `max-height: none`/`overflow-y: visible` on `--paged`, which is
deliberate (paging exists so the list never scrolls). Edits the authoritative selector in place
per rule #0.7.
**B — put `max-height: 360px` on `--paged`.** REJECTED: under `overflow-y: visible` content
exceeding the cap would SPILL rather than scroll.
**C — accept the divergence, fix only the stale comment.** Cheapest and honest; knowingly ships
two adjacent controls disagreeing in an ~11px band.

**Severity is LOW** — a cosmetic disagreement in a narrow viewport band, not a correctness or
access defect. Leaning A, but this is the right thing to DEFER behind the blocker under rule
#0.15 (one coherent change per unit). Recording it fully so it is cheap to pick up.

**Note for whoever implements A:** `_panelSpaceNeeded` is a 2-arg pure function; check for
existing unit tests against that signature before changing it.

CHECKED: those tests exist — `tests/unit/components/bound-select-auto-flip-test.js:62-72`
pins the 2-arg signature in four assertions, including `_panelSpaceNeeded('none', 289) === 289`,
which is exactly the year picker's current behaviour. So option A must either take the custom
property as an added argument (leaving the four existing assertions valid) or resolve it in
`_measurePlacement` and keep `_panelSpaceNeeded` untouched. **The second is better** — it keeps
the pure function pure and its tests green, and puts the DOM read where the other DOM reads
already are (`:273-277`).

---

# UNIT B — OPEN QUESTIONS ANSWERED, and option G is in serious trouble

Answers traced by a subagent; the two load-bearing ones re-verified by me in the files.

## Q1 — is `stats.board_set_ids` populated in speak mode? MOSTLY, WITH ONE FATAL GAP

`lib/json_api/user.rb` has ONE serialization depth (no summary/detailed pair), and
`board_set_ids` is written at `:507` behind `permissions.view_detailed` (`:506`), inside an
`elsif` at `:487` that also requires not-`limited_identity`.

| Case | `currentUser.stats.board_set_ids` |
|---|---|
| speaking as self | populated — CONFIRMED |
| ordinary supervisor speaking as supervisee | populated — CONFIRMED |
| **modeling-only supporter speaking for a communicator** | **`undefined`** — CONFIRMED |
| public target, caller without view_detailed | `undefined` — CONFIRMED |
| valet ("model@") session | scope-dependent — ASSUMED, not traced |

`user.rb:69` grants a modeling-only supporter `view_existence` + `model` and deliberately
withholds `view_detailed` (every `view_detailed` grant carries `&& !user.modeling_only_for?(self)`).

**This is the rule #0.13(a) trap, exactly:** a guard keyed on a value that is null for a
meaningful share of the users it was written to protect. For those sessions G fails closed and
the widened pass is entirely dead.

## Q2 — do collection-drawer boards fall inside `board_set_ids`? MOSTLY NOT — this is the killer

`app/models/user.rb:2376-2424`, re-read by me. With NO options — and `lib/json_api/user.rb:503`
calls it with no options — `include_starred` and `include_supervisees` are both FALSE, so:

> **`board_set_ids` == { home board } ∪ { home board's `downstream_board_ids` }. Nothing else.**

Not owned boards generally, not starred, not public library boards.

The drawer (`components/board-collection.js`) lists strictly more than that: "My Boards" is
`store.query('board', {user_id})` — every board the user OWNS — and the brand sections
(CommuniKate, Quick Core, Sequoia, Vocal Flair, `:304-317`) are `{public: true}` boards owned by
OTHER accounts.

The widened pass's own comment (`word_suggestions.js:1451-1456`) names its use case as
"a board opened from the collection drawer can have none of its tree in scope at all".
**`board_set_ids` excludes most of exactly those boards.**

## Verdict on G — I am withdrawing it as the leading candidate

G is not a no-op, but it is much closer to option D than the proposal claimed: it deletes the
feature for the case it was written for, deletes it entirely for modeling-only supporters, and
keeps it only for boards inside the home tree that were not already in `lookup_board_ids`. That
is a fix that LOOKS principled and is mostly a disguised revert — worse than D, because D is at
least honest about what it costs.

**Correcting my own earlier framing:** I wrote that G "fails closed for free" and treated that
as a pure virtue. Fail-closed is the right SAFETY property, but I did not weigh what it closes
on, and Q1/Q2 show it closes on the majority of the feature. That was the load-bearing ASSUMED
fact flagged in the proposal, and checking it before writing code is the only reason this did
not ship.

Awaiting the two independent reviews before choosing. Live candidates are now **D (honest
revert, stated capability loss)** and whatever predicate reviewer 2 derives independently.

---

# NEW FINDING (not on the handoff list) — `assert_remote_urls` guards are strict no-ops, and the SHARE path does not strip `data:` URIs

Surfaced while answering Q3. **Separate from Unit B — do not batch it** (rule #0.15).

**CONFIRMED, re-read by me at `app/frontend/app/models/utterance.js:31` and `:35`:**
```js
if(this.get('image_url') && !LingoLinq.remote_url(!this.get('image_url'))) {   // :31
if(btn.image && !LingoLinq.remote_url(!btn.image)) {                           // :35
```
The argument is **negated**. `LingoLinq.remote_url = function(url) { return url && url.match(/^http/) && … }`
(`app/frontend/app/app.js:112-114`), so it receives `false`, short-circuits, and returns `false`;
`!false` is `true`. **The guard is true for every non-empty image, remote ones included** — the
"only convert local URLs" intent is not implemented. Benign today only because `find_remote`
passes unmatched values through unchanged (`:29`).

**The asymmetry that matters:** the LOG path destructively nulls any `data:` image before every
save (`models/log.js:287-289`), but the SHARE path has no stripping at all — only the
opportunistic `url_cache` reverse lookup above. The server-side repair
(`app/models/utterance.rb:333-338`) fires only when `original_image` is present, and
`utterance.js#add_button` sets `b.image` WITHOUT an `original_image` (the only `original_image`
write, `utterance.js:254`, is on the display copy, not the raw list that gets shared).

So a `data:` URI in `button_list[].image` is saved verbatim into `Utterance#data`, becomes
`data['image_url']` via `utterance.rb:24`, and is served by `lib/json_api/utterance.rb:18` to
anyone holding the share link. PLAUSIBLE severity: High. Needs its own diagnosis and its own
unit — recorded here, NOT fixed in this batch.

---

# UNIT B — INDEPENDENT REVIEW 2 (test-first, did not see the proposals doc)

Deliberately briefed WITHOUT the proposal so its predicate would be derived, not critiqued.
**It converged with my Q2 finding independently** — a `board_set_ids`-only predicate "would look
correct, pass a naively-written test, and silently kill the very case the widened pass exists
for". Two independent routes to the same conclusion is the strongest evidence available here
(rule #0.14.5), and it is why option G is dead.

## The piece I had missed

The drawer's "My Boards" is `store.query('board', {user_id: _subjectUserId()})`
(`components/board-collection.js:186-196`), and `_subjectUserId()` is
`setup_user.id || currentUser.id` (`:150-153`) — **boards the SUBJECT USER OWNS**, which the
component then background-warms into the store (`:228-238`). In speak mode the subject is the
communicator, so those boards' keys carry the communicator's own `user_name`.
=> **the drawer case is recoverable via an AUTHOR clause, not a board-set clause.** I had
concluded the drawer case was simply lost; that was wrong, and it was wrong because I only
asked what `board_set_ids` contained, never what the drawer actually lists.

## The proposed predicate — admit a resident set if ANY of

- **(a)** `bs.get('key')` starts with `currentUser.user_name + '/'` — the speaking user authored it.
- **(b)** any of `global_id` / `id` / a member of `board_ids` is in `currentUser.stats.board_set_ids`.
- **(c)** any of `global_id` / `id` / `key` / a member of `board_ids` is in
  `lookup_board_ids(appState, stashes)` — covers starred + sidebar, which (b) does NOT
  (`include_starred` is false at `lib/json_api/user.rb:503`).

## Claims I re-verified myself (rule #0.13(c))

| Claim | Verdict |
|---|---|
| buttonset `key` is the author-prefixed board key | **CONFIRMED** — `lib/json_api/button_set.rb:13`, `json['key'] = board.shallow_key` |
| Rails runs this same test itself, UNANCHORED | **CONFIRMED** — `button_set.rb:46`, `b['board_key'].match(/^#{user_name}/)`. So `sam` matches `samantha/…`. The `/` anchor is a real, necessary correction to Rails' own form. |
| no buttonset attribute identifies the communicator | **CONFIRMED** — `models/buttonset.js:23-40`: `_actual_id`, `global_id`, `key`, `root_url`, `buttons`, `remote_enabled`, `name`, `full_set_revision`, `encryption_settings`. None is a user. |
| `currentUser` IS the communicator in speak mode | **CONFIRMED** — `services/app-state.js:2601-2603` |
| all four callers thread `appState` | **CONFIRMED** — `utterance.js:593`, `board-detail.js:1592`, `:8686`, and `:1289` via `var ctx = {appState, stashes}` at **`:1229`**. My first grep looked for the literal `appState` in the call and found nothing; the variable is named `ctx`. The reviewer was right and my check was too literal. |
| `loaded_button_sets_beyond` has ONE call site | **CONFIRMED** — `word_suggestions.js:1537`. Threading `appState` in is a one-argument change at one site. |

## The warning that matters most — and it is BIGGER than the reviewer said

`tests/unit/utils/prediction-symbol-any-board-test.js` will go RED under any of these
predicates: its `buttonSet()` fixture returns `null` for `key` and `[]` for `board_ids`
(`:11-19`), and its appState stub is `EmberObject.create({ get: function() { return null; } })`
(`:75`, `:98`), so no fixture can match any clause.

**The reviewer named one test. There are TWO** (`:50` "an in-scope match that yields no symbol
still falls through to other loaded boards", and `:82` "a symbol on a loaded but out-of-scope
board is still found"). Both drive the widened pass.

Correct handling: **re-point the fixtures** so the borrowed-from set is the speaking user's
(give it a `key` matching the stub's `user_name`, or an id in `board_set_ids`), preserving each
test's actual intent — a loaded-but-out-of-scope board is still searched. Deleting them, or
quietly editing them to green, would destroy the coverage that documents why the widened pass
exists. This is a judgement call and should be made deliberately, in the open.

## Residual risks the reviewer named, which I am NOT treating as resolved

1. **Id-format agreement is PLAUSIBLE, not CONFIRMED.** `board_set_ids` comes from
   `downstream_board_ids`, which for shallow clones remaps to `"#{id}-#{sub_id}"`
   (`app/models/board.rb:136-145`), while a buttonset's ids are `shallow_id`. They SHOULD
   agree; nobody has run it. **If they disagree, clause (b) silently rejects everything.**
   This needs a runtime check against a real shallow-clone account before shipping.
2. **Modeling-only supporters lose clause (b) entirely** (my Q1). The predicate degrades to
   (a)+(c) for them. That must be a stated, deliberate choice.
3. It is a MEMBERSHIP test, not an identity test — it proves a set IS the speaking user's, and
   cannot prove one is not someone else's. That is the right question at this call site, but
   the guarantee should be described accurately.

**Still awaiting adversarial review 1 before choosing.** Nothing implemented.

---

# UNIT B — ADVERSARIAL REVIEW 1, AND THE DECISION

Two independent reviews now agree **option G must not be implemented**. They DISAGREED on the
decisive sub-question — which user to read — so I settled it in the code myself.

## The disagreement, and the answer (I verified every line below)

Reviewer 2 said `currentUser` is correct, citing `app-state.js:2601` (`currentUser =
speakModeUser` in speak mode). Reviewer 1 said that holds only for speak-AS, not for MODELING.
**Reviewer 1 is right:**

- `services/app-state.js:2325-2332` — `set_speak_mode_user` with `keep_as_self` (modeling)
  sets **`speakModeUser` to `null`** and persists `speak_mode_user_id: null`, while still
  setting `referenced_speak_mode_user` to the communicator. CONFIRMED, read directly.
- So the `:2601` branch does NOT fire, and `currentUser` stays the **supervisor**.
- But the log is attributed to the communicator: `services/stashes.js:801-805` —
  `user_id = speaking_user_id`, **overridden by `referenced_speak_mode_user_id`** when set.
  CONFIRMED.
- `referenced_user` (`app-state.js:3939-3950`) returns `currentUser` normally and
  `referenced_speak_mode_user` when modeling. CONFIRMED.

> **=> `referenced_user` is the correct reader in BOTH cases, and `currentUser` is wrong in
> exactly the modeling case.** A `currentUser`-keyed filter would scope the widened pass to the
> SUPERVISOR's boards while writing the result into the STUDENT's log — the same leak with the
> roles inverted. The prior session's "referenced_user would widen scope" refutation is correct
> for speak-as only; it does not generalise, and it is why this needed settling in code rather
> than by preferring one reviewer.

## Other confirmed findings from review 1

- **Key-space trap.** `board_set_ids` holds GLOBAL ids, but a buttonset's record `id` is
  whatever was REQUESTED — a board KEY for key-loaded sets. This is documented IN THE VERY FILE
  a fix would edit, `word_suggestions.js:713-726`, in a comment written to fix a previous
  instance of it. Any predicate must use `global_id || id` (as `:725` and `:1424` already do).
  CONFIRMED by reading that comment.
- **The classic board claim was too strong.** `controllers/board/index.js:1625` sets
  `vocalization: ':complete'` (or `':predict'`), which reaches `utterance.add_button` ->
  `attach_image_for_label`. CONFIRMED. The rail's *rendering* is genuinely scoped, but
  "not affected" was wrong: any caller of `attach_image_for_label` is affected.

## CORRECTION TO MY OWN FACT SHEET — I recorded a false mitigation as CONFIRMED

I wrote, under Unit B(c): *"Protected images are already filtered by accident: a foreign
protected image 403s and `is_placeholder_image` skips the candidate."* **That is FALSE.**
`word_suggestions.js:1307-1313` is a pure STRING test — it matches `blank.gif`, `square.svg`
and two mulberry paths, performs no fetch, and cannot observe a 403. A foreign protected image
yields an ordinary http url that is not a placeholder, so `deliver` fires and it IS persisted;
the 403 happens later in the `<img>`. `board-detail.js:1276-1288` preloads before swapping so
the DISPLAY path is protected, but `utterance.js:588-590` has no preload, so **the typing path
persists it**.

**Severity is therefore HIGHER than I reported, not lower** — foreign *protected* uploads are
in scope, not just non-protected ones.

Root cause of my error: I carried that claim forward from the previous session's proposals doc
without re-verifying it, and put it in the CONFIRMED column. It was inherited, not confirmed.
That is precisely the rule #0.13(c) failure ("is this claim about another file TRUE?") in the
same document that cites rule #0.13. Re-verified claims are now marked with who read them.

## Verdicts

| Option | Verdict |
|---|---|
| **G** — filter on `currentUser.stats.board_set_ids` | **DEAD.** Four independent defects: wrong key space, wrong reader (modeling), absent for modeling-only supporters, and it deletes the motivating case while keeping one the home set already covers. Both reviewers independently reached "do not implement". |
| **C** — `unloadAll` on speak-as change | **DO NOT IMPLEMENT.** It observes the wrong property — in modeling `speakModeUser` is *nulled*, so the observer never fires on the leaking path. Also `models/buttonset.js:21` holds a module-local `button_set_cache` that `unloadAll` does not touch. |
| **F'** — stamp every store writer | **DO NOT IMPLEMENT.** >=5 writers plus the already-resident hole. |
| **D** — revert the widened pass | **SAFE.** Zero new mechanism, provably closes both harms. The honest fallback. |
| **H** — provenance stamp in `load_vocabulary_button_sets`, keyed on `referenced_user.id` (NEW, from review 1) | **LEADING CANDIDATE, NOT YET REVIEWED.** |

## Why H looks right

Stamp the READER, not the store: `load_vocabulary_button_sets` is the single function that
decides "these sets are in scope for whoever is speaking now", and it has one caller
(`:1490`). Record each returned set's `global_id || id` against
`appState.get('referenced_user.id')`; `loaded_button_sets_beyond` then admits only residents
stamped for the current `referenced_user.id`.
- Beats F' — stamps nothing in the store, so the >=5 writers are irrelevant.
- Beats G — no `stats`, no `view_detailed`, no key-space question, and it reads the property
  that already owns the WRITE.
- **Keeps the motivating case**: a library board visited earlier in THIS user's session was
  `currentBoardState` then, so it was stamped and stays reachable. That is exactly the
  collection-drawer case G deletes.
- Fails closed to the existing generic-lookup fallback.

## H is NOT cleared to implement. Required first (rules #0.12/#0.13):
1. Its own three-fact sheet — H was AUTHORED by a reviewer, which is not the same as having
   been REVIEWED. No option has yet been attacked by someone who did not propose it.
2. The RED TEST first, which must include (a) a KEY-loaded set, (b) a `modeling_for_user` case
   where `currentUser` != `referenced_user`, and (c) the `stats`-absent path still resolving
   through the generic lookup rather than rejecting. Without all three it is hollow.
3. Decide the two existing tests in `prediction-symbol-any-board-test.js` deliberately: their
   fixtures return `null` key / `[]` board_ids and a null appState, so BOTH go red under any
   predicate. Re-point the fixtures; do not quietly green them.
4. The map must be cleared on logout/user-switch (`app-state.js:417-420`, `:2110-2112`).
5. Placement: the read must sit INSIDE the existing `try` at `:1465` — `get_app_state()`
   (`:1301`) falls back to a Proxy that returns `undefined` for every property, so an
   unguarded `appState.get(...)` throws and would kill the generic fallback at `:1543` too.

---

# UNIT B — OPTION H: FACT SHEET (rule #0.13), written BEFORE any fix

Traci chose H. This is the precondition, not a ceremony.

## (a) Where is the value READ? CONFIRMED

`loaded_button_sets_beyond` (`word_suggestions.js:1459-1477`), inside the `peekAll('buttonset')`
loop at `:1466-1473`, which is already wrapped in a `try/catch` at `:1465-1477`. One call site:
`:1537`, inside `attach_image_for_label`'s `.then`.

**The read must sit INSIDE that existing `try`.** `word_suggestions.get_app_state()` (`:1301`)
falls back to the `utils/app_state.js` Proxy, which returns `undefined` for every property when
`LingoLinq.appState` is unset; an unguarded `appState.get(...)` would throw, escape the
function, reject the `.then` chain, and take out the generic-word fallback at `:1543` too.
Threading `appState` from `:1537` avoids the Proxy entirely and is preferred.

**Where the STAMP is written:** `load_vocabulary_button_sets` (`:1378-1416`). It has **TWO
return paths** — the early `RSVP.resolve(warmed)` at `:1400-1402` and the async `return all` at
`:1414`. **Both must stamp**, or the common no-fetch-needed case never records anything.
(Review 1 said this function has "one caller (:1490)". That is WRONG — it has **three**:
`word_suggestions.js:1490`, `controllers/user/board-detail.js:3476`, `models/board.js:1522`.
All three pass a real appState, verified. Stamping inside the function body covers all three,
so the error does not change the design — but it would have if the stamp had been placed at
the call site.)

## (b) What are ALL the shapes, and who writes each? CONFIRMED

- `referenced_user.id`: a string normally; **null/undefined** when logged out, mid-transition,
  or under a test stub. Guard BOTH sides: do not stamp under a falsy key, and return `[]` from
  the reader when the key is falsy. Otherwise everything stamped under `undefined` becomes
  mutually visible — a leak wearing the fix's clothes.
- Buttonset id shapes: record `id` is whatever was REQUESTED — a board KEY for key-loaded sets
  — with the real id on `_actual_id`; `global_id` reconciles them (`models/buttonset.js:27-32`).
  Use `global_id || id` on BOTH the stamp and the read, matching `:725` and `:1424`.
  **Note H is structurally immune to the key-space trap that killed G**: G compared against an
  EXTERNAL list of global ids, whereas H compares against ids it recorded itself, so the two
  sides cannot disagree as long as they use the same accessor.
- The same board can be resident twice (once by key, once by id) — the dedupe comment at
  `:724` documents this. `global_id || id` collapses them.
- `load_vocabulary_button_sets` returns `warmed` (early) or `all` (async); both are arrays of
  buttonset records, possibly empty.

## (c) Claims about other files — CONFIRMED, each read by me

- `services/app-state.js:2325-2332` — modelling nulls `speakModeUser`; `referenced_speak_mode_user`
  is set to the communicator.
- `services/app-state.js:3939-3950` — `referenced_user` = `currentUser`, or
  `referenced_speak_mode_user` when modelling. **Correct in both cases; `currentUser` is wrong
  in the modelling case.**
- `services/stashes.js:801-805` — the log is attributed to `referenced_speak_mode_user_id`
  when set. The reader must match the WRITE target, and this is it.
- `app-state.js:415-420` (`reset`) and `:2103-2113` (`clear_user_state`) null the user records.
  **Correctness does NOT depend on clearing the map**, because it is keyed by user id and ids
  are globally unique — a stale bucket can never be read under a different user. Clearing is
  memory hygiene only. This is a simplification over review 1's requirement #4, and it removes
  a whole class of "cleared in the wrong place" bug.

## What H means, stated precisely

> A resident set is searchable by the widened pass iff it was in scope for THIS
> `referenced_user` at some earlier point in this session.

## Cost, stated honestly

- **KEPT:** any board that was `currentBoardState` earlier in this user's session — which is
  the collection-drawer case (opening a board from the drawer makes it the current board, so
  `lookup_board_ids` includes it and its set is loaded and stamped), and the parent-board case
  when navigation went parent -> sub-board.
- **LOST:** a set that is resident but was NEVER in scope for this user — a background
  PREFETCHED board never visited (`board-collection.js:228-238` warms these), and another
  communicator's board. The first is a real, narrow capability loss; the second is the bug.
- Slightly narrower on the first lookup after a reload, until the scoped loader has run once.

## Candidate variants
- **H1 — module-local map `{user_id: {set_id: true}}`.** Simple, no record mutation, survives
  store churn. Grows with session length (ids only).
- **H2 — stamp the RECORD** (e.g. `bs.set('_scoped_for', uid)`). REJECTED: mutating Ember Data
  records for bookkeeping risks dirtying them, and one record can legitimately be in scope for
  two users (a shared library board), which a single-valued stamp cannot express.

**Proposing H1.**

## The red test — WRITTEN FIRST, before any fix
`tests/unit/utils/prediction-symbol-user-scope-test.js`. Two stamping calls under ONE
supervisor for TWO communicators, then a lookup as the second communicator.
- Student A's set is depth 0 (wins the shallowest-first sort) and its record id is a board KEY
  with the real id on `global_id`.
- Student B's own set is depth 4 — deliverable only if A is excluded.

Weakest implementations this must kill, and why it does:
| Weakest impl | Outcome |
|---|---|
| current code (no filter) | A wins on depth -> `delivered === A_SYMBOL` -> RED |
| `return []` (feature deleted) | nothing delivered -> assertion 2 RED |
| keyed on `currentUser.id` | ONE supervisor for both students -> one bucket -> A admitted -> RED |
| stamp on only one of the two return paths | the early path never records -> B unstamped -> assertion 2 RED |

---

# UNIT B — ADVERSARIAL REVIEW OF H. Verdict: IMPLEMENT WITH CHANGES.

H's SHAPE survived; its KEY did not. Four of my own claims were wrong and are corrected below.

## F1 (CRITICAL) — `referenced_user.id` is the literal string `'self'`

CONFIRMED, re-read by me:
- `serializers/application.js:52-60` pins the session user's record id to the literal `'self'`
  and parks the real global id on `_actual_id`.
- `models/user.js:48-71` documents this at length and ends: **"Backend global_id regardless of
  which path loaded the record. Compare with this, not `id`."**

**CORRECTION TO MY OWN FACT SHEET.** I wrote (Unit B, H fact sheet (c)): *"correctness does NOT
depend on clearing the map, because it is keyed by user id and ids are globally unique."*
**FALSE as written** — `'self'` is the same string for every session user, so a logout/login as
a different user in one SPA session (`services/session.js:735-800`) shares one bucket.
Keying on `global_id` RESTORES the uniqueness property and makes the argument true again — but
the argument was being made about `id`, which was the wrong field. Fix: key on
`referenced_user.global_id`, and treat a resolved key of `'self'` as no-key (fail closed).

## F5 (my error) — the red test's key-space comment is FALSE

I wrote at the fixture: *"a fix that records only `id` cannot quietly agree with itself."*
Wrong, and it contradicts my own fact sheet three sections earlier, which correctly argued H is
**structurally immune** to the key-space trap because both sides use the same accessor. An
`id`-only scheme stamps A as `studenta/home` and reads `studenta/home` — it agrees with itself
and passes. To actually discriminate you need the same board resident TWICE for the current
user (one key-loaded, one id-loaded). Either add that case or delete the claim.

## F6 (my error) — the mutation table's "two return paths" row is backwards

Both stamping calls in the test resolve via the EARLY return (`:1401`): `peekRecord` finds each
set, `covered` is satisfied, `missing` is empty. So the test kills *async-only* stamping but
NOT *early-only* stamping — which is the likelier omission and the one that disables the cold
fetch path. Needs a third stamping call with non-empty `missing`.

## F3 — the stamp must guard `appState` itself, not just the user id

`tests/unit/utils/prediction-symbol-pairing-test.js:197` calls
`load_vocabulary_button_sets(null, null, ['1_99'])`. CONFIRMED. A bare
`appState.get('referenced_user…')` throws BEFORE the early `RSVP.resolve(warmed)`, turning a
resolved promise into a synchronous throw at `word_suggestions.js:1489` and `models/board.js:1522`.
`lookup_board_ids:1358` already guards with `if(appState && appState.get)`; the stamp must too.

## F1c — MY RED TEST WOULD REJECT THE CORRECT FIX

The `modelling_for()` stub answers only `'referenced_user.id'` and `'currentUser.id'`. An
implementation correctly reading `referenced_user.global_id` gets `null` at both sites, stamps
nothing, and fails assertion 2. **The test as written accepts ONLY the defective keying** — the
precise trap rule #0.12 exists to catch, in the test written to prove the fix. Must add
`'referenced_user.global_id'` to the stub and re-falsify.

## NOT CLOSED BY H — must be listed as "Not covered", not implied fixed

- **F2 (HIGH): the SCOPED pass leaks the same way.** `button_sets_for_board_ids:1325-1335`
  admits any resident set whose `board_ids` contains a lookup id, and `board_ids` spans the
  set's ENTIRE downstream tree (`models/buttonset.js:39-48`). If two communicators share a
  board RECORD, student A's whole set enters `warmed` for student B and is delivered by the
  scoped walk at `:1531`, never touching `loaded_button_sets_beyond`. Mechanism CONFIRMED, data
  condition PLAUSIBLE. **Separate unit, own diagnosis, own red test.**
- **F8 (MEDIUM): a memo replay that consults no button set at all.**
  `board-detail.js:1247` keys the resolved-url memo on `_suggestion_memo_scope(...)`, which
  under modelling resolves to the SUPERVISOR's home board (`:1139-1148`), so modelling for A
  then B without changing root yields an identical key and `:1257` replays A's url onto B's
  tile. Cleared only in `clear_sentence`, never on a `referenced_user` change. **Separate unit.**
- **F4:** `attach_image_for_label:1489` has an explicit no-appState branch; under H those
  callers lose the widened pass. Comment it so the decision is recorded.
- **F9:** under modelling `lookup_board_ids` pulls the SUPERVISOR's home/sidebar/starred, so
  those sets get stamped under the communicator; and outside speak mode a communicator's set
  gets stamped under the supervisor. Both are INSIDE H's stated invariant but were missing from
  my cost table.

## Blocking changes accepted before writing code
1. Key on `referenced_user.global_id` (fallback `id`); treat `'self'` as no-key, fail closed.
2. Add `'referenced_user.global_id'` to the test stub; re-falsify.
3. Guard `appState && appState.get` at the stamp.
4. Add an async-return-path (`:1414`) stamping case to the test.
5. Delete the false key-space comment (F5) or add the resident-twice case.
6. Add `_reset_scoped_sets()`; call in test `beforeEach` and from `clear_user_state`/`reset`.
7. Repair both tests in `prediction-symbol-any-board-test.js`, header comment included — its
   "or prefetched" clause becomes FALSE under H.

---

# UNIT B — H IMPLEMENTED (all 7 blocking review changes applied)

## What was written

`app/frontend/app/utils/word_suggestions.js`
- `scoped_set_ids` — module-local `{ <user global id>: { <set global id>: true } }`.
- `scope_key_for(appState)` — guards `appState && appState.get` (F3), prefers
  `referenced_user.global_id` over `.id` (F1), and **rejects the literal `'self'`** rather than
  using it as a bucket name, so a record caught before `_actual_id` resolves fails closed
  instead of joining a bucket shared by every session user.
- `record_scoped_sets(appState, sets)` — no key => records nothing; returns `sets` so it wraps
  a return expression without changing what callers see.
- `word_suggestions._reset_scoped_sets()` (F7).
- `load_vocabulary_button_sets` records on **both** return paths — the early
  `RSVP.resolve(...)` and the async one (F6).
- `loaded_button_sets_beyond(searched, appState)` admits only sets recorded for the current
  scope key, matching on `global_id || id`. The scope read sits **inside the existing `try`**,
  so an appState that cannot answer degrades to "nothing widened" instead of rejecting the
  promise chain and taking the generic word fallback with it (F3).
- The doc comment above it was rewritten: it claimed "Every button set already IN MEMORY",
  which is no longer what the code does, and it now states the cost (a PREFETCHED-but-never-
  visited board is no longer searched) rather than leaving a false statement behind (rule #0.14.3).
- The no-appState branch at `attach_image_for_label` carries a comment recording that it now
  gets the scoped pass only (F4).

`app/frontend/app/services/app-state.js` — `_reset_scoped_sets()` called from `reset` and
`clear_user_state` (F7), each with a note that this is hygiene, not a correctness dependency.

## Lint: zero new issues, MEASURED both files

Compared against a copy with the edits reverse-applied, not against memory (rule #0.11):
- `word_suggestions.js` — baseline `5 problems (3 errors, 2 warnings)`, after: **identical**.
- `app-state.js` — baseline `75 problems (56 errors, 19 warnings)`, after: **identical**.
All pre-existing (`ember/no-runloop`, `ember/no-string-prototype-extensions`), none in new code.

## Test: the three arms and what each kills

`tests/unit/utils/prediction-symbol-user-scope-test.js`
1. **modelling A then B under ONE supervisor** — kills the unscoped code AND any
   `currentUser`-keyed fix (one supervisor, one bucket, still leaks).
2. **two session users whose record ids are BOTH the string `'self'`** — kills an `id`-keyed
   fix. This is the arm the review's F1 demanded; without it the test accepted only the
   defective keying.
3. **a set recorded on the FETCH path** — kills a fix that records on the early return only,
   which was the omission my original mutation table had backwards (F6).

The false key-space comment (F5) was deleted rather than left to mislead the next reader.

---

# NEW FINDING (pre-existing, NOT fixed here) — `load_vocabulary_button_sets` discards every set it fetches

Found by a test failing for a reason I had not predicted, then traced. **Not mine, not on the
handoff list, and deliberately NOT fixed in this unit** (rule #0.15).

**CONFIRMED.** `RSVP.all_wait` (`app/frontend/app/utils/misc.js:147-173`) resolves with **no
value** — `resolve()`, never `resolve(resolutions)` — even though it accumulates a
`resolutions` array internally.

`word_suggestions.js` fetch path:
```js
return RSVP.all_wait(missing…map(id => LingoLinq.Buttonset.load_button_set(id)…))
  .then(function(loaded) {          // <- ALWAYS undefined
    warmed.concat(loaded || [])     // <- therefore always just `warmed`
```
So the loader **returns only the sets that were already resident**; every set it just fetched
is dropped from its own return value. The fetched sets do land in the store, so a LATER lookup
picks them up — which is why this has been invisible, and why
`prediction-symbol-pairing-test.js` passes: it asserts a fetch was REQUESTED, never that the
fetched set came back.

**Consequence for the symbol feature:** the first lookup after a fetch cannot see the board it
just fetched. That is a plausible contributor to "the symbol appears only after typing the word
a second time", which is worth checking against the prediction reports.

**Consequence for H:** none that is unsafe — a fetched set is simply recorded one lookup later,
when it is resident and in scope. H's test asserts the property H actually provides (the
RESIDENT subset is recorded on the async branch) rather than one the loader does not deliver.

**Why not fix it here:** changing `all_wait`'s contract touches every caller
(`grep -rn "all_wait"` before going near it), and making the loader return freshly-fetched sets
changes what the SCOPED pass sees on the fetch path — a behaviour change unrelated to scoping,
in the same commit as a privacy fix. Separate unit, own diagnosis, own red test.

**Blast radius, MEASURED** (so the next person does not have to): 51 `all_wait` usages in
`app/frontend/app/`. Only TWO name a resolved value — `word_suggestions.js` (which USES it, and
is therefore the only real victim) and `controllers/button-set.js:87`, which declares `res` and
never reads it. Every other caller uses `.then(function() {…})` and is indifferent. So the
minimal fix is local to `word_suggestions.js` (collect the loaded sets itself rather than
relying on `all_wait`'s resolution), and changing `all_wait`'s contract, while tempting, is the
larger and less necessary change.

## FALSIFICATION (rule #0.12) — every arm proven capable of failing

Three mutations, each applied to a copy-restored file, full `--filter "prediction symbol"` run
each time (14 tests). Restored from a hand-made copy, never `git checkout`; final file md5
verified identical to the pre-mutation state.

| Mutation | Tests that went RED |
|---|---|
| **A** — delete the scope filter in `loaded_button_sets_beyond` | **12 and 13** (both leak arms) |
| **B** — key on `referenced_user.id` instead of `.global_id` | **13 and 14** (the `'self'` collision arm) |
| **C** — drop the async-path `record_scoped_sets` | **14** (uniquely) |

Each mutation produces a DISTINCT failure signature, and every test fails under at least one.
No arm is hollow: in particular mutation B is the defect the first version of this test would
have shipped green, and mutation C is the one my original mutation table had backwards.

Green state: **14 tests, 14 pass, 0 fail** with the fix in place.

## Files changed in this unit
- `app/frontend/app/utils/word_suggestions.js` — the fix.
- `app/frontend/app/services/app-state.js` — two `_reset_scoped_sets()` calls (hygiene).
- `app/frontend/tests/unit/utils/prediction-symbol-user-scope-test.js` — NEW, 3 arms.
- `app/frontend/tests/unit/utils/prediction-symbol-any-board-test.js` — fixtures re-pointed so
  the borrowed-from board is put IN SCOPE first; header comment corrected (its "or prefetched"
  claim is now false by design).
- this log.

## NOT covered by this unit — must be carried into the PR body
- The **scoped** pass can expose a shared board record's whole set across communicators
  (`button_sets_for_board_ids:1325-1335` + `board_ids` spanning the full downstream tree).
- `board-detail.js:1247` memo replay keyed on a scope that resolves to the SUPERVISOR's home
  board under modelling.
- `models/utterance.js:31,35` negated-argument guards, and the SHARE path not stripping
  `data:` URIs.
- `load_vocabulary_button_sets` discarding freshly fetched sets (`all_wait` resolves no value).
- Callers with no appState get the scoped pass only (deliberate, commented in code).

---

# UNIT F — the loader discards fetched sets. CONFIRMED A DEFECT, and H unmasked it.

Asked to prove it is real before fixing. It is, and the proof turned up something worse:
**my own H change turned a masked latent defect into a user-visible regression.**

## The mechanism (CONFIRMED)

`RSVP.all_wait` has exactly ONE definition (`app/frontend/app/utils/misc.js:147`), and BOTH its
success exits are bare `resolve()` — `:149` for the empty case and `:161` for the normal one —
even though it accumulates a `resolutions` array it never passes on. `word_suggestions.js`
imports `./misc` (`:10`), so the patched version is the one in effect.

Therefore in `load_vocabulary_button_sets`:
```js
RSVP.all_wait(missing.map(id => load_button_set(id)...)).then(function(loaded) {  // undefined
  warmed.concat(loaded || [])                                                     // == warmed
```
`loaded` is ALWAYS `undefined`, the concat contributes nothing, and the whole async branch
reduces to re-deduplicating `warmed` — which `button_sets_for_board_ids` already deduplicated.
**The board it just fetched is absent from its own return value.** The intent is unambiguous
(`warmed.concat(loaded || [])` says exactly what it meant to do), so this is a defect, not a
design choice.

## Proof it is real, and proof of the regression — MEASURED, not reasoned

New test `tests/unit/utils/prediction-symbol-cold-fetch-test.js`: nothing resident, the board
must be fetched, the fetch SUCCEEDS and carries the symbol.

| | pre-H source | post-H source |
|---|---|---|
| `the loader returns the set it just fetched` | **FAIL** | **FAIL** |
| `a symbol on a freshly fetched board is paired with the word that triggered the fetch` | **PASS** | **FAIL** |

Read this table carefully, because it says two different things:
1. **The loader defect is real and PRE-EXISTING** — row 1 fails on both.
2. **Its user-visible effect was MASKED by the unscoped widened pass.** Pre-H, the fetched set
   was resident and therefore returned by `loaded_button_sets_beyond`, so the symbol still
   arrived by the back door. H scopes that pass to sets that were RECORDED — and a set that
   never appears in the loader's return value is never recorded. **Row 2 is a regression
   introduced by H**, i.e. by me.

This is precisely what rule #0.3 forbids ("never break existing, working functionality"), and
it was invisible to every test that existed, including the 14 I ran green. Fixing the loader
is therefore not optional cleanup — it is a precondition of H being shippable.

## Candidate fixes

**A — accumulate locally, keep `all_wait`.** Push each resolved set into a local array inside
the per-promise handler, then `warmed.concat(fetched)`. Zero contract change, zero blast
radius, and robust if someone later removes the per-promise error handler.

**C — use `RSVP.all` instead of `all_wait` at this one site.** Each mapped promise ALREADY has
its own rejection handler returning `null` (`:1403`), so no promise in the array can ever
reject — which means `all_wait`'s only distinctive behaviour (waiting through failures /
rejecting early outside tests) is unreachable here. `RSVP.all` is behaviourally identical at
this call site AND resolves with the results, in order. Smallest possible change. Risk: it
becomes wrong if a future edit removes that per-promise handler, so it needs a comment saying
why it is safe.

**B — fix `RSVP.all_wait` to resolve with its resolutions.** REJECTED for this unit. 51 usages
in `app/`; only two name a resolved value and only `word_suggestions.js` READS it
(`controllers/button-set.js:87` declares `res` and ignores it). But `resolutions` is pushed in
SETTLEMENT order, not input order, and excludes failures — so the array would be unordered and
possibly short, which is a worse contract than it looks. Shared-helper change, propose-first.
Worth raising separately as hygiene: a combinator that silently drops results is a trap.

**Leaning A** for robustness, C acceptable if review prefers minimalism.

## Falsification plan
Revert the chosen fix from a hand-made copy; both cold-fetch tests must go red, and the 14
existing prediction-symbol tests must stay green (proving the fix is additive, not a
behaviour swap).

## UNIT F — independent verification (agent briefed WITHOUT my write-up)

Reached the same verdict from the source alone: REAL DEFECT, user-visible. It also corrected my
severity DOWNWARD in one place and UPWARD in another.

**Corroboration that it is a mistake, not a contract (CONFIRMED by that agent):** `all_wait`
has resolved bare since the first public commit; of ~40 call sites repo-wide only THREE declare
a parameter (`controllers/button-set.js:87`, `models/user.js:1113`, and this one) and
**`word_suggestions.js` is the only place that READS it**. No comment defends the drop, and no
test asserts it — the two existing prediction tests take the EARLY return and never exercise
the fetch path at all.

**Severity is HIGHER than I wrote — it is not only symbols.** I verified this myself:
`word_suggestions.lookup:802` is `if(options.button_sets) { … } else if(options.board_ids) { … }`
— a **truthiness** test. An empty-but-truthy array takes the first branch, so the legacy
per-id `load_button_set` fallback at `:806-816` never runs. And
`collect_vocabulary_prefix_matches:1047` / `collect_vocabulary_next_words:1080` both do
`options.button_sets || []` with no store fallback. So an under-populated array silently
degrades **the predicted WORD LIST as well as the symbol pairing** — words that live only on
the just-fetched board do not appear as suggestions at all.

**Where the compensation is, and is not:**
- `board-detail.js:1218-1231` computes `sets_sig` from the SUMMED button count over
  `button_sets_for_board_ids`, and records a miss as `{miss: sets_sig}` (`:1262-1264`). When the
  fetched buttons arrive the sum changes, so the memo permits a retry rather than latching.
  Real, but **one keystroke late**, and local to `board-detail`.
- It does NOT reach the one-shot callers: `board-detail.js:8682` (tapping a predicted word) and
  `utterance.js:588` (`:space`/`:complete`). Those are single invocations with no retry, so a
  chip can permanently carry the placeholder for that utterance.

**And it independently confirmed the regression**: at HEAD the widened pass fully compensated
for the symbol path (the fetched set was resident and not in `sets`, so it landed in `widened`);
with the scoping change that route is closed too, because a set the loader never returns is
never recorded. "Each is survivable alone, together they close both routes to the symbol."

**Fix caution, independently reached and matching mine:** `all_wait` pushes resolutions in
COMPLETION order (`misc.js:167`), not input order, so a fix must not assume positional
correspondence with `missing`.

## UNIT F — REVIEW OUTCOME. Candidate C chosen; my argument for A was FALSE.

**CORRECTION TO MY OWN PROPOSAL (rule #0.11 — it was the argument being used to pick the fix).**
I justified candidate A as "robust if someone later removes the per-promise error handler."
**That is false.** `misc.js:157-163` rejects whenever `failures.length > 0`, in EVERY
configuration. Remove that handler and `all_wait` rejects, the `.then(function(loaded){…})`
success callback never runs, and A's local accumulator is never read. A and C fail identically
under that edit. A buys **zero** robustness, and I should not have asserted otherwise without
reading `done()` to its end.

**Candidate C's premise is true, and for a stronger reason than I gave.** Verified by me:
- `LingoLinq.all_wait` has **no writer anywhere in `app/`** — only in `tests/`
  (`tests/helpers/ember_helper.js:689`, `tests/utils/persistence-sync-test.js`, and
  `tests/helpers/sync-test-cleanup.js:211`). So `all_wait`'s distinctive wait-through-failures
  behaviour is unreachable in production **by construction**, not merely by the local
  no-rejection argument.
- Both mapped handlers are non-throwing and return non-thenables (`:1460`), so nothing in the
  array can reject.
- The per-promise error handler is **load-bearing, not decorative**: `load_button_set` returns
  `RSVP.reject()` for any id matching `/^b/` or `/^i/` (`models/buttonset.js:1261-1263`), which
  fires for real board KEYS beginning with "b" — and `lookup_board_ids` pushes keys (`:1358`).

**C also wins on determinism, which I had missed.** `_exact_button_candidates_for_label` sorts
by `depth` only (`:1499`) and `Array.prototype.sort` is stable, so array order is the tie-break
among equal-depth matches. A appends in **settlement order** (network timing) => the symbol
chosen between two depth-0 duplicates varies run to run. C appends in **input order**,
derived deterministically from `lookup_board_ids` => reproducible. For a fix whose entire point
is "which symbol does the user see", that matters.

**Severity correction (downward), also mine to make:** the regression is **self-healing after
one call** — on the next lookup the fetched record is resident, `covered` is satisfied, and the
early return stamps it. The damage is scoped to the word that triggered the fetch, on that one
lookup cycle. Still a real defect on the one-shot callers, but not a persistent lockout, and
the commit message must not overstate it.

**Red-test gap the review found (rule #0.14.2).** Weakest passing state for the two cold-fetch
tests: `return RSVP.resolve(loaded)` — **discarding `warmed` entirely** — is GREEN, because
`warmed` is empty in both. Nothing pinned the `concat`. The existing 14 tests cannot cover it
either: with everything resident they take the early return and never reach the async branch.
=> a third test is REQUIRED before the fix: one resident buttons-bearing set AND one id that
must be fetched, asserting BOTH come back, warmed first.

**Not bundled** (each needs its own unit and red test): aligning the `:1467` dedupe key to
`global_id || id` (first-wins would let a buttons-less `root_url`-only record shadow a full
one); the `lookup_board_ids` reads `currentUser` vs `scope_key_for` reads `referenced_user`
mismatch under modelling; synchronous-throw hardening of the `.map` body.

**PR body must state:** `models/board.js:1522` and `controllers/user/board-detail.js:3476` also
consume this return value and pass it to `lookup` as `button_sets`, so **word prediction results
change too**, not just symbol attachment.

## UNIT F — IMPLEMENTED (candidate C) AND FALSIFIED

`word_suggestions.js`: `RSVP.all_wait(...)` -> `RSVP.all(...)` at the single fetch call site,
with a comment giving the VERIFIED reasons (no writer for `LingoLinq.all_wait` in `app/`;
non-throwing non-thenable handlers; the `/^b/`-key rejection the error handler absorbs; and the
input-order tie-break). One token of behaviour change, ~18 lines of why.

**Green:** 18 tests, 18 pass, 0 fail across the whole `prediction symbol` filter.
**Lint:** `5 problems (3 errors, 2 warnings)` — identical to the pre-H baseline.

### Falsification (rule #0.12)

| Mutation | Red |
|---|---|
| **revertC** — put `all_wait` back | **5, 6, 7, 8** — all four cold-fetch arms |
| **dropWarmed** — `warmed.concat(loaded)` -> `loaded` only (the weakest passing state the review found) | **7** and **18** |

Two things this proves:
1. **The gap is closed.** `dropWarmed` is exactly the implementation that would have passed the
   first two cold-fetch tests, and arm 7 — added only because the review demanded it — catches
   it. Arm 18 (the scoping fetch-path test) catches it independently, which is a useful check
   that the two units' tests are not blind in the same direction.
2. **The fix is additive, not a behaviour swap.** Under `revertC` the 14 pre-existing
   prediction-symbol tests all stay GREEN and only the 4 new arms fail. If the change had
   altered established behaviour, some of those 14 would have moved.

File restored from a hand-made copy, md5 verified identical.

## Running state of the branch after Units B and F
- `app/frontend/app/utils/word_suggestions.js` — user scoping (H) + the loader fix (F).
- `app/frontend/app/services/app-state.js` — two `_reset_scoped_sets()` calls.
- `app/frontend/tests/unit/utils/prediction-symbol-user-scope-test.js` — NEW, 3 arms.
- `app/frontend/tests/unit/utils/prediction-symbol-cold-fetch-test.js` — NEW, 4 arms.
- `app/frontend/tests/unit/utils/prediction-symbol-any-board-test.js` — fixtures re-pointed.
- this log.

**Still not run: the FULL `ember test` suite** (handoff item 7). `ember serve` is still live,
and CLAUDE.md rule #0.10 is explicit that a full run under that contention is untrustworthy.
Nothing here should be called verified against the whole suite until that runs.

---

# FULL `ember test` SUITE — RUN AND COMPLETE (handoff item 7 closed)

Run with `ember serve` STOPPED (all four processes in its chain killed and verified gone),
which is what previous sessions could not do and why every prior attempt truncated.

```
NODE VERSION FOR THIS RUN: v22.23.2      <- checked BEFORE reading any output (rule #0.10)
# tests 2593
# pass  2554
# skip  38
# todo  1
# fail  0
Browser timeout exceeded: 0 occurrences
```

**Completeness checks, done before looking at any failure:**
- `# skip 38` — matches the near-constant baseline exactly. This is the reliable tell; a
  truncated run shows the same skip line with a much smaller total.
- Arithmetic reconciles: 2554 + 38 + 1 = **2593**. No tests unaccounted for.
- **Zero** `Browser timeout exceeded`, the signature of testem reaping a silent browser under
  load. Stopping `ember serve` removed the contention that caused it.

**A non-zero exit that is NOT a failure — worth recording, because it is rule #0.10's trap in
reverse.** The task reported "exited with code 1", but that is my WRAPPER script's status: its
final command was `grep -c 'Browser timeout exceeded'`, which exits 1 when it finds nothing.
`ember test`'s own status is the `EXIT=0` line in the output. A red-looking exit code, a green
run. Check what actually produced the code before reporting a failure.

**Total delta, stated honestly.** The last recorded complete run was 2412; this is 2593, i.e.
**+181**. Seven of those are mine (4 cold-fetch + 3 user-scope). The remaining ~174 are
consistent with the 25-commit staging merge (`1c2bb2333`), which landed AFTER the 2412 run and
for which no full suite had ever completed — but I have NOT audited that delta commit by
commit, so treat "the merge accounts for it" as reasoned, not verified.

**All new and repaired tests ran and passed** — confirmed by name in the output:
`1155-1158` (freshly fetched board x4), `1173-1175` (scoped to the speaking user x3), plus the
two re-pointed `from any loaded board` tests.

=> Units B and F are verified against the whole suite, not just a filter. No regression.

**`ember serve` is left STOPPED.** Restart when needed:
`cd app/frontend && npx ember server --port 8184 --proxy http://127.0.0.1:5000` (Node 22).
