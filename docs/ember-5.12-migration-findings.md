# Ember 4.12 → 5.12 Migration — Findings Register

**Status:** Fixes applied (2026-07-09) · **Created:** 2026-07-09 · **Scope:** `app/frontend/` (whole app)

---

## ✅ Fix Status (2026-07-09) — all classes remediated; `ember build` green

**Class 4 — modal `opening()` (19 components):** Appended `self.send('opening')` to `didInsertElement` in all Tier‑1 (repairs, add‑tool, focus‑words, inbox, modeling‑ideas, speak‑menu, pick‑avatar, phrases, save‑snapshot, user‑status, remote‑model, badge‑image) and Tier‑2/3 (new‑board‑folder, edit‑unit, board‑privacy, confirm‑delete‑board, slice‑locales, eval‑status, tag‑board) modals. Verified each has a real `opening()` action and that modal.js's legacy `controller.opening()` no‑ops for these action‑only components (no double‑invoke). `save-snapshot` delegates to its top‑level `opening()` via the action — also wired.

**Class 3A — block‑param collisions (10 templates):** `application.hbs` (sidebar every page + followers), `organization/{people,lessons,rooms,extras}.hbs`, `troubleshooting.hbs`, `trends.hbs`, `start_codes.hbs`, `user-results.hbs` — dropped `this.` inside each `{{#each … as \|x\|}}`/`{{#let}}` block. **`user/board-alt/index.hbs` = DEAD** (route sets `templateName:'board/index'`/`controllerName:'board.index'`), so it renders through `board/index` — already fixed by `board: alias('model')`; no controller created.

**Class 3B — `app_state` alias (34 files):** Added `appState: service('app-state')` + `app_state: alias('appState')` to 22 route controllers, created 5 controllers for controller‑less routes (redeem_with_code, user/boards, user/extras, ambassadors, compare), and wired 7 components. Verified root cause: no global injection existed; the migration added the alias per‑controller (see `index.js:8‑12`) and simply missed these.

**Class 1 — array extensions (27 files):** Converted `sortBy`→native `.slice().sort()` (comparator preserved), `mapBy`→`.map(emberGet)`, `.compact()`→`.filter(x=>x!=null)`, `uniq()`→`[...new Set()]`, `pushObject`→`.push()` — only where the receiver was proven native; Ember‑array/`A()` receivers left as‑is. Both `utils/persistence.js` + `services/persistence.js` sync copies fixed. Dead `controllers/modals/*` skipped; live `components/*` equivalents fixed. `_stashes.js:425` (guarded) correctly left.

**Class 2 — `@each` in‑place (5 files):** Wrapped array at assignment site with `A()`: `user/preferences.js` (skin‑tone save), `setup.js` (setup skin), `inflections.js` (word_types), `components/new-goal.js` (`model.users.@each.add_goal` — confirmed checkbox mutation), `dashboard/authenticated-view.js` (5 `_fetchedBoards`/`_fetchedPreviewBoards` set sites — star toggle).

### Class 6 — Ember Data 5.x removed automatic `store` injection into controllers (found 2026-07-09 during UI verification)
Ember Data ≤4 auto‑injected `store` into every **controller**; 5.x removed it. Controllers that call `this.store.query/createRecord/peekRecord/...` without `store: service('store')` now hit `this.store === null` → **route fails to load** (first seen: `organization.extras` → "Cannot read properties of null (reading 'query')"). Routes are unaffected (they use the global `LingoLinq.store` or inherit `store` from `routes/index.js:15`); components already inject it.
**Fixed (6 live route controllers):** `organization/extras.js`, `organization.js`, `goals/goal.js`, `user/preferences.js`, `bulk_purchase.js`, `organization/rooms.js` — each got `store: service('store')`.
**Skipped (dead `modal.ModalController` twins, replaced by components):** `quick-assessment`, `switch-communicators`, `badge-awarded`, `new-goal`, `record-note`, `modals/program-nfc` — never instantiated, same policy as the Class‑1 dead‑modal skips.
**Grep to find the rest:** `grep -rlE "this\.store\b|_this\.store\b|get\(['\"]store['\"]\)" app/controllers app/components` then filter out files that inject `store`.

### Deliberate skips (verified NOT broken, or too broad/unconfirmed to change safely)
- **`components/start-codes.js`** (Class 2): computed already uses native‑safe `.slice().sort()`; the only `disabled` mutation is immediately followed by `org_or_user.reload()` which wholesale‑replaces the array → fires the `.[]` dep. No user‑visible staleness; an `A()` on the sorted output wouldn't fix `@each` on the model's raw array anyway.
- **`controllers/organization/rooms.js:25`** (Class 2): `max_session_count` is read‑only in the template (passed to a child, never edited in place) and `units` is wholesale‑`set`; recomputes correctly. Not a real bug.
- **`utils/button.js:742`** (Class 2): `translations` is wholesale‑rebuilt in the `update_translations` observer and re‑`set`; entries aren't mutated in place. Not a real bug.
- **`models/board.js:452/455`** (Class 2, LOW): `buttons` is `set` in dozens of places across a shared model — wrapping all sites in `A()` for an unconfirmed staleness has too large a blast radius. Left as‑is.
- **`controllers/user/preferences.js:1254`** (Class 1): the pre‑migration `prior.uniq(fn)` called Ember's **arg‑less** `uniq()`, which ignored the key fn and deduped by **identity** even under 4.12. Restored exact behavior with `[...new Set(prior)]` rather than realizing the latent keyed intent (would be a behavior change, out of scope for a migration fix — flagged for a future intentional change).
- **Dead files not touched:** `controllers/modals/{assessment-settings,focus-words,modeling-ideas}.js` (no refs, no templates, modal system is component‑based).

---

## Why this exists

Staging merged a major framework upgrade — **Ember 4.12 → 5.12** (`Feat/melissa ember 5.12 upgrade`, PR #490). The upgrade shipped **under‑migrated**: the automated codemods + turning on `EXTEND_PROTOTYPES: false` (`config/environment.js:14`) + several controller→component rewrites left **widespread latent breakage** that only manifests when a specific path is exercised at runtime (no build errors, usually no console errors — just wrong/blank UI or a thrown action).

The Full Eval was the **first thing to exercise** these paths, which is how we found it. The rest of this document is the result of a four‑agent sweep of the whole frontend, with each hit **verified** against the code (native‑array receivers confirmed, block‑param collisions confirmed, missing services confirmed).

> **This is a team‑wide issue, not specific to any one branch.** These bugs exist on `staging` today.

## Root‑cause classes (and the fix recipe for each)

| Class | Mechanism | Fix recipe |
|---|---|---|
| **1. Array prototype extensions** | With `EXTEND_PROTOTYPES:false`, Ember's array methods (`sortBy`, `mapBy`, `uniq`, `compact`, `pushObject`, `firstObject`, …) **no longer exist on native `[]` arrays** and throw `TypeError` (or return undefined). They DO still exist on Ember Data relationships (`hasMany`) and `A()`/`TrackedArray`. | Replace with the native equivalent (`.sort()`, `.map()`, `[...new Set()]`, `.filter(Boolean)`, `.push()`), OR wrap the array in `A()` from `@ember/array`. |
| **2. `@each` / `.[]` on native arrays** | `observer`/`computed` dependent keys like `foo.@each.prop` **stop firing** when `foo` is a native array whose element property is mutated **in place** (e.g. a two‑way `@checked={{item.prop}}` or `emberSet(item,'prop')`) with no wholesale re‑`set` and no manual trigger. Wholesale replacement (`this.set('foo', newArr)`) is safe — the base key still notifies. | Wrap the array in `A()` at its **assignment site** (the computed's `return` / the `.set(...)`), or convert to `TrackedArray`. |
| **3. Template `this.X`** | The codemod rewrote bare `{{foo.bar}}` → `{{this.foo.bar}}`. Where `foo` is **not a real instance property** it's now `undefined`. Two sub‑modes: **(A) block‑param collisions** — `this.` was prefixed onto an `{{#each … as \|foo\|}}` loop variable, so `this.foo` hits a controller prop (or nothing) instead of the item; **(B) missing `app_state`** — `this.app_state.*` where the controller/component never injected it. | (A) drop `this.` inside the block (use bare `foo.bar`). (B) add `app_state: alias('appState')` (and `appState: service('app-state')` if absent), mirroring `controllers/application.js:37`. Route templates with no controller need a new controller file. |
| **4. Converted‑modal `opening()` never runs** | Several modal **controllers** were rewritten as tagless **components** (`Component.extend({ tagName:'' })`). `modal-dialog` calls the `opening` closure inside its own `didRender`, which runs **before** the child component's `didInsertElement` — where these components bind `this.onOpening`. So the closure is `undefined` → `opening()` (which builds the modal's state) silently no‑ops → the modal renders empty or a later action throws (`"object in path 'settings' could not be found"`). | Append `self.send('opening');` at the end of `didInsertElement` (the fix already applied to `assessment-settings.js`), OR bind `this.onOpening` in `init()`. |
| **5. Misc removed 4.x APIs** | `this.$()`, `Ember.$`, `Ember.assign`, `@ember/error`, `@ember/string`, `.property()`/`.observes()`, `sendAction`, `locationType:'auto'`. | — |

**Class 5 is ✅ clean** — the sweep found **no live usages** of the misc removed APIs (staging migrated those). The one `sendAction` hit (`components/available-boards-section.js:91`) is a deliberate local shim, not the removed API.

## ⚠️ Gotchas when fixing

- **Duplicate modules — fix BOTH copies:** `utils/persistence.js` ↔ `services/persistence.js`, and `utils/_stashes.js` ↔ `services/stashes.js` are near‑duplicates. The `utils/*` copies are imported directly (persistence 124×); the `services/*` copies are injected via `service(...)`. A fix in one must be mirrored in the other.
- **Controller/component twins — one may already be migrated:** `modeling-ideas`, `batch-recording`, `button-set`, `quick-assessment`, `copy-board`, `sidebar-button-settings` all exist as both `controllers/*` and `components/*`. In several, one twin was already migrated (e.g. `components/modeling-ideas.js` uses `A(...)`/`.map()`) while the **other twin was missed**. Check both; fix only the un‑migrated one.
- **Verify at the assignment site, not the consumer** (Class 2): wrap the array where it's produced.

## ✅ Already fixed (on the eval branch — do not re‑do)

- `board: alias('model')` added to `controllers/board/index.js` (Class 3A — the eval board grid; every obf board).
- `self.send('opening')` in `didInsertElement` of `components/assessment-settings.js` (Class 4 — eval save).
- `A(pending_buttons)` in `utils/edit_manager.js:2080` (Class 2 — board button readiness).
- `list.sortBy('size')` → native sort in `utils/eval.js` (Class 1 — eval results charts).
- **Verified‑safe, no change needed** (Class 4): `modeling-intro`, `speak-mode-intro`, `beta-feedback-modal` (bind in `init`), `find-button` (defensive `didRender`).

---

# Findings

Legend: `[ ]` = to fix · **HIGH/MED/LOW** = confidence the code path breaks · impact noted where user‑facing.

## Class 1 — Array prototype extensions on native arrays

### `sortBy` → `[...arr].sort((a,b)=>…)`
- [ ] **HIGH** `utils/utterance.js:447` — `inline_actions.sortBy('index')` (built via `[]`/`.unshift`). **Speak/utterance render path.**
- [ ] **HIGH** `utils/profiles.js:436` — `data.categories.sortBy('manuals').reverse()` (`data.categories=[]`). **Profiles/report render.**
- [ ] **HIGH** `models/buttonset.js:891` — `resolve(list.sortBy('loc'))` (`list=[]`). Find‑a‑button word list.
- [ ] **HIGH** `controllers/modals/focus-words.js:70` — `list.sortBy('updated').reverse()` (`list=[]`).
- [ ] **HIGH** `components/stats/bar-breakdown.js:66` — `list.sortBy('index').reverse()` (`list=[]`).
- [ ] **HIGH** `controllers/modals/modeling-ideas.js:113` — `follow_ups.sortBy('timestamp')` (`follow_ups=[]`). *(Twin `components/modeling-ideas.js:78` already `A()`‑wrapped.)*

### `mapBy` → `.map(x=>x.key)` (+ `.compact()` → `.filter(Boolean)`)
- [ ] **HIGH** `models/log.js:132` — `(this.get('events')||[]).mapBy('id').compact()` (`events: attr('raw')` = plain array). **Log/report render.**
- [ ] **HIGH** `models/log.js:260` — `event['notes'].mapBy('id').compact()`.
- [ ] **HIGH** `controllers/button-set.js:170` **and** `components/button-set.js:375` — `sorted_filtered_buttons.mapBy('label').uniq()`. Download‑list action.
- [ ] **HIGH** `controllers/modals/modeling-ideas.js:209` — `(this.get('user_words')||[]).mapBy('word')`.
- [ ] **MED** `controllers/modals/modeling-ideas.js:85` **and** `:191` — `(this.get('model.users')||[]).mapBy('id')` (twin `components/modeling-ideas.js:149` already `.map()`).

### `uniq()` → `[...new Set(arr)]` (keyed uniq → manual dedupe)
- [ ] **HIGH** `utils/persistence.js:2656,2659,2677,2680` **and** `services/persistence.js:2640,2643,2662,2665` — `(…||[]).concat(…).uniq()`. **Live sync path.** Fix both copies.
- [ ] **HIGH** `components/sidebar-button-settings.js:259,267,277` **and** `controllers/sidebar-button-settings.js:197,205,215` — `ssids/places/times.uniq()` (from `.split(/,/)`).
- [ ] **HIGH** `components/copy-board.js:185,192` **and** `controllers/copy-board.js:129,136` — `sidebar_ids.concat(…).uniq()`.
- [ ] **HIGH** `controllers/board/index.js:1017` — `levels.uniq().sort(…)` (`levels=[]`).
- [ ] **HIGH** `components/icon-select.js:25` — `urls.uniq()` (`urls=[].concat(…)`).
- [ ] **HIGH** `controllers/organization/index.js:53` — `(…).map(…).uniq().length`.
- [ ] **HIGH** `components/modeling-ideas.js:117` **and** `controllers/modals/modeling-ideas.js:163` — `for_word.concat(…).uniq()`.
- [ ] **HIGH** `controllers/user/preferences.js:1249` — `prior.uniq(fn)` (keyed — needs manual dedupe by key). Sidebar‑board reorder/delete.

### `uniq().compact()` on `.map()` results
- [ ] **HIGH** `components/modeling-ideas.js:153` **and** `controllers/modals/modeling-ideas.js:199` — `(w.reasons||[]).map(…).uniq().compact()`.

### `pushObject` → `.push()`
- [ ] **HIGH** `components/quick-assessment.js:94` **and** `controllers/quick-assessment.js:45` — `tallies.pushObject(…)` (`set('tallies', [])`). **Eval/assessment path.**
- [ ] **HIGH** `controllers/modals/assessment-settings.js:82,97,101,105,111` — `res.pushObject(…)` (`res` = array literal). *(This is the OLD modal controller — verify it's still reachable; the component twin is `components/assessment-settings.js`.)*
- [ ] **HIGH** `controllers/organization/room.js:38,63` **and** `controllers/trends.js:52` — `res.get('words_by_frequency').pushObject(…)` (`words_by_frequency: []` on a plain EmberObject).
- [ ] **HIGH** `controllers/edit-board-details.js:124` — `sections.pushObject({})`.
- [ ] **HIGH** `controllers/batch-recording.js:65` — `repo.categories.pushObject(…)` (twin `components/batch-recording.js:107` uses `A([])`).
- [ ] **HIGH** `components/batch-recording.js:192` / `controllers/batch-recording.js:153` — `cat.phrases.pushObject(…)` (`phrases` = native `[]`).
- [ ] **HIGH** `components/batch-recording.js:379` / `controllers/batch-recording.js:327` — `category.phrases.pushObject(…)`.
- [ ] **MED** `components/map-with-geos.js:55` — `markers.pushObject(…)` (native unless parent passes `A()`).
- [ ] **MED** `services/stashes.js:459` — `list.pushObject(obj)` (`remembered_vocalizations: []`, **unguarded**; twin `utils/_stashes.js:425` is guarded with a `typeof` check).

## Class 2 — `@each` in‑place mutation (silent‑stale reactivity)

- [ ] **HIGH** `controllers/user/preferences.js:346` — `observer('current_skin.options.@each.checked')`. Skin‑tone checkboxes (`@checked={{option.checked}}`, `preferences.hbs:180`) mutate in place → **toggling a skin tone won't save.** Fix: `return A(res.options)` from the `current_skin` computed.
- [ ] **HIGH** `controllers/setup.js:188` — `observer('skin.options.@each.checked')`. Same skin pattern in setup. Fix: wrap `res.options` in `A()`.
- [ ] **HIGH** `controllers/inflections.js:171` **and** `:211` — `observer('word_types.@each.checked')` + `computed('word_types.@each.checked')`. Part‑of‑speech auto‑select goes stale. Fix: `return A(res)` from the `word_types` computed (`:133`).
- [ ] **HIGH** `components/start-codes.js:76` — `computed('org_or_user.start_codes.[]','…@each.disabled')`. `start_codes: attr('raw')`; `emberSet(code,'disabled',true)` (`:152`) in place → disable/re‑sort won't react. Fix: sort over `A(this.get('org_or_user.start_codes'))`.
- [ ] **MED** `components/dashboard/authenticated-view.js:946` (and `:961`) — `'_fetchedBoards.@each.starred_for_current_user'`. Dashboard board list won't reactively reflect a **star toggle** (star recomputes in place on the model). Fix: `A()` the `set('_fetchedBoards', …)` sites.
- [ ] **MED** `components/new-goal.js:120` **and** `controllers/new-goal.js:73` — `computed('model.users.@each.add_goal')`. Confirm the new‑goal template mutates `user.add_goal` in place (`@checked`); if so wrap `model.users` in `A()`.
- [ ] **MED** `controllers/organization/rooms.js:25` — `computed('units.@each.max_session_count')`. Confirm inline edit mutates in place; if so `A()` `units`.
- [ ] **MED/LOW** `utils/button.js:744` — `observer('translations.@each.label','…@each.vocalization')`. If the translations editor edits entries in place. Fix: `A()` `res` at `:742`.
- [ ] **LOW** `models/board.js:452` `levels` / `:455` `has_overrides` — `computed('buttons.@each.level_modifications')`. Wholesale‑replaced on load, but in‑place `level_modifications` edits (`clear_overrides`, `:458‑464`) may leave stale until re‑set. Defensive `A()` on `set('buttons', …)`.

**Verified‑safe (do NOT touch):** `controllers/board/index.js:1003 button_levels` and `user/board-detail.js:2663` (manual `levels_change` trigger via `edit_manager.js:1803`); `controllers/profile.js:25/37` (manual `answer_ts` bump); `sync-details` (`sync_log` wholesale‑rebuilt + `sync_log_rand`); `utterance.js` `rawButtonList`/`button_list` (wholesale‑replaced); all eval render‑path arrays (`eval-comprehensive-runner`, `eval-quick-item`, `eval-targeted-runner`, `eval-jump` — wholesale `set`).

## Class 3 — Template `this.X` with no backing property

### 3A — Block‑param collisions → drop `this.` inside the block

- [ ] **HIGH** `templates/application.hbs` — `this.board.image/name/…` (lines **1522‑1527, 1533, 1536, 1539, 1541**) inside `{{#each this.app_state.sidebar_boards as |board|}}` (1518); also `this.user.avatar_url` (**192**) inside `{{#each this.app_state.followers.active as |user|}}` (191). `application.js:38 board: inject('board.index')` → `this.board` is the injected controller, not the item. **Sidebar boards wrong on every page.** Note line **1532** already correctly uses bare `board.key`. Fix: `this.board.X`→`board.X`, `this.user.X`→`user.X`.
- [ ] **HIGH** `templates/user/board-alt/index.hbs` — `this.board.*` (**74,75,77,78,80,81,84,91**, 11×) inside `{{#let this.model as |board|}}` (73). **No `board-alt` controller** → whole alt‑board view blank. Fix: create `controllers/user/board-alt/index.js` extending Controller with `board: alias('model')` (+ `app_state: alias('appState')`, `appState: service('app-state')`) — the exact twin of `board/index`.
- [ ] **HIGH** `templates/organization/people.hbs` — `this.user.*` (**75‑85, 128‑137, 180‑183, 227‑229**, 19×) inside four `{{#each … as |user|}}` loops. Every org‑people row blank. Fix: drop `this.` in all four loops.
- [ ] **HIGH** `templates/organization/lessons.hbs` — `this.user.*` (**24‑25, 64‑65, 104‑105**) inside `{{#each …_with_lessons as |user|}}`.
- [ ] **HIGH** `templates/organization/rooms.hbs` — `this.user.user_name` (**105, 111**) inside `{{#each unit.supervisors/communicators as |user|}}`.
- [ ] **HIGH** `templates/organization/extras.hbs` — `this.gift.*` (**76‑88**, 28×) inside `{{#each this.gifts as |gift|}}` (73). Gift/bulk‑purchase table blank.
- [ ] **HIGH** `templates/troubleshooting.hbs` — `this.error.message/stack` (**220, 223**) inside `{{#each this.errors as |error|}}` (218).
- [ ] **HIGH** `templates/trends.hbs` — `this.access.name/percent` (**302, 307**) inside `{{#each this.access_methods as |access|}}`; `this.voice.name/percent` (**327, 332**) inside `{{#each this.voices as |voice|}}`.
- [ ] **HIGH** `templates/start_codes.hbs` — `this.user.id/avatar_url/user_name` (**70‑72**) inside `{{#each this.result.users as |user|}}` (68).
- [ ] **HIGH** `templates/user-results.hbs` — `this.user.*` (**9‑11**) inside `{{#each this.model.list as |user|}}` (8).

### 3B — Missing `app_state` service → add `app_state: alias('appState')` (+ `appState: service('app-state')` if absent)

Route templates **with** a controller (# = `this.app_state` refs):
- [ ] **HIGH** `templates/download.hbs` (14) ← `controllers/download.js` (empty controller — **all download‑store buttons gated → page shows no links**).
- [ ] **HIGH** `templates/user/preferences.hbs` (7) ← `controllers/user/preferences.js`.
- [ ] **HIGH** `templates/user/subscription.hbs` (5); `templates/user/stats.hbs` (5); `templates/user/index.hbs` (5 — controller already has `appState: service`, so only add the `app_state` alias).
- [ ] **HIGH** `templates/intro.hbs` (4).
- [ ] **HIGH** `templates/search.hbs` (3); `templates/user/edit.hbs` (3).
- [ ] **HIGH** (single/low‑impact gates each): `templates/about.hbs` (2), `goals/index.hbs` (2), `lesson.hbs` (2), `organization/room.hbs` (2), `troubleshooting.hbs` (2), `user/badges.hbs` (2), `user/goals.hbs` (2), `user/logs.hbs` (2), `board/history.hbs` (1), `goals/goal.hbs` (1), `organization/settings.hbs` (1), `pricing.hbs` (1), `user/recordings.hbs` (1), `utterance.hbs` (1).

Reachable routes with **no controller file** (create the controller with the injection/alias):
- [ ] **HIGH** `templates/ambassadors.hbs`, `templates/compare.hbs`, `templates/redeem_with_code.hbs`, `templates/user/boards.hbs`, `templates/user/extras.hbs`, `templates/user/board-alt/index.hbs` (also 3A‑A2).

Components (each gates real UI; none receive `app_state=` as an arg):
- [ ] **HIGH** `components/board-selection-tool` (JS injects `appState` → add `app_state` alias), `components/video-recorder` (alias), `components/board-preview` (alias).
- [ ] **HIGH** `components/inbox`, `components/about-lingolinq`, `components/remote-model`, `components/user-notification` (**no** injection → add `appState: service('app-state')` + alias).

### 3C — Wrong model path (MED)
- [ ] **MED** `templates/organization/room.hbs:292` — `{{else if this.logs.loading}}` should be `this.model.logs.loading` (siblings use `this.model.logs.data`).

### Dead/unreachable templates (LOW — no runtime impact; optional cleanup)
`templates/footer.hbs`, `brief.hbs`, `button.hbs`, `button-unbound.hbs`, `board-icon-without-link.hbs`, `setup-footer.hbs` — contain broken `this.*` refs but have no route/component backing.

## Class 4 — Converted‑modal `opening()` never runs → add `self.send('opening')` in `didInsertElement`

### Tier 1 — HIGH (`opening()` builds the modal's core content; modal renders empty / action throws)
- [ ] **HIGH** `components/repairs.js:135` (didInsert @373) — builds `buttons` (repair list); `done()` pushes `undefined` into utterance without it.
- [ ] **HIGH** `components/add-tool.js:74` (@140) — builds `tools`, `selected_tool`, `user_parameters` (async).
- [ ] **HIGH** `components/focus-words.js:280` (@550) — builds ~17 keys (`analysis`, `words`, `ideas`, `ai_*`…). Entire modal inert.
- [ ] **HIGH** `components/inbox.js:102` (@238) — builds `working_vocalization`, `alerts`, `fetched_inbox`.
- [ ] **HIGH** `components/modeling-ideas.js:197` (@356) — builds `activities`, `show_target_words`.
- [ ] **HIGH** `components/speak-menu.js:139` (@395) — builds `punctuation_menu`, `repeat_menu`, `rememberedUtterances`.
- [ ] **HIGH** `components/pick-avatar.js:109` (@203) — builds `editable`, `editing`, `model.user.avatar_url`.
- [ ] **HIGH** `components/phrases.js:138` (@206) — builds `sentence`, `user`, `current_category`.
- [ ] **HIGH** `components/save-snapshot.js:113` (@158) — builds `snapshot`, `saving`.
- [ ] **HIGH** `components/user-status.js:92` (@126) — builds `editing`, `status`, `status_note`.
- [ ] **HIGH** `components/remote-model.js:106` (@210) — builds `modeling_type`, `model.user`.
- [ ] **HIGH** `components/badge-image.js:50` (@96) — builds `loading`, `model.badge.image_url`.

### Tier 2 — MED (form flags / defaults only; degraded, not crashed)
- [ ] **MED** `components/new-board-folder.js:53` (@84) — `folderName`, `status`.
- [ ] **MED‑LOW** `components/edit-unit.js:45` (@98) — `error`, `saving`.

### Tier 3 — MED (init pre‑nulls the key so no throw, but the async data load inside `opening()` is skipped → data never loads)
- [ ] **MED‑HIGH** `components/board-privacy.js:67` — `hierarchy` (downstream board tree) never loads.
- [ ] **MED** `components/confirm-delete-board.js:93` — `hierarchy` (`.reload()`) skipped.
- [ ] **MED** `components/slice-locales.js:66` — `hierarchy` never loads.
- [ ] **MED** `components/eval-status.js:103` — user/status `.reload()` skipped.
- [ ] **MED** `components/tag-board.js:116` — `.reload()` skipped.

*(Verified effectively‑safe — `opening()` only re‑sets the same static values `init()` already sets: `external-device`, `assign-lesson`, `start-codes`, `gif`, `confirm-org-action`, `confirm-delete-user`, `choose-locale`, `big-button`, `board-intro`, `confirm-remove-goal`, `eval-jump`, `extra-colors-modal`, `supervision-settings`, `masquerade`, `speak-mode-pin`.)*

---

## Suggested fix order (highest blast radius first)
1. **Class 4 Tier 1** — 12 one‑liners; each restores a whole broken modal. Lowest risk / highest visible payoff.
2. **Class 3A** — `application.hbs` (every page) + `board-alt` (whole view) + the org tables; mechanical `this.`‑drops / one new controller.
3. **Class 1 live paths** — `persistence.js`+`services/persistence.js` sync `uniq`, `log.js` report `mapBy`, `utterance.js` speak `sortBy`, `quick-assessment` eval `pushObject`.
4. **Class 2 HIGH** — 4 `A()` wraps (skin‑tone, setup, inflections, start‑codes).
5. **Class 3B** — `app_state` aliases (bulk, low‑risk).
6. Remaining Class 1 UI actions, Class 2/3/4 MED/LOW.

## Verification per class
- Build + `ember-template-lint` catch syntax only — **not** these runtime issues. Each fix needs the actual UI path exercised (open the modal / render the page / toggle the checkbox / run the sync).
- Consider adding `EmberENV.RAISE_ON_DEPRECATION` or the `deprecate-array-prototype-extensions` assertion in dev to surface remaining native‑array extension calls at runtime.
