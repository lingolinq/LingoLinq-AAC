---
name: ember-upgrade-audit
description: Ember 3.28->5.12 upgrade-regression checklist for LingoLinq-AAC. Breakage-class catalog (arrays, reactivity, template codemod artifacts, modal lifecycle, removed APIs, Ember Data 5.x, build/tests) with detection greps, receiver-verification protocol, severity mapping, and the register finding schema. Preloaded by the ember-upgrade-auditor agent. Read-only.
---

# Ember 3.28 → 5.12 upgrade-regression audit checklist

Context: ember-source/cli `~5.12.0`, ember-data `~5.3.8`, Node 20,
`EXTEND_PROTOTYPES: false` (`config/environment.js`), `jquery-integration: false`
(`config/optional-features.json`). Frontend root: `app/frontend/app/`.
Deep background + references: `docs/ember-upgrade/KNOWN-ISSUES.md`.
Historical sweep + fix log (dedup against it): `docs/ember-5.12-migration-findings.md`.

**Prime directive: these bugs build green and often render.** You are hunting code that
*misbehaves when exercised*, not style debt. Classic classes, mixins, observers,
`this.get/set` are all still legal in 5.x — they are NOT findings by themselves.

## Slices (assigned by the orchestrator)
| Slice | Scope |
|-------|-------|
| `utils-services` | `app/frontend/app/utils/`, `app/frontend/app/services/` (remember the twin-file rule) |
| `components` | `app/frontend/app/components/` (+ their templates under `templates/components/`) |
| `controllers` | `app/frontend/app/controllers/` |
| `templates` | `app/frontend/app/templates/` (excluding `templates/components/`) |
| `data-layer` | `app/frontend/app/models/`, `adapters/`, `serializers/`, `transforms/`, store usage anywhere |
| `boot-routing` | `app/frontend/app/routes/`, `router.js`, `app.js`, `initializers/`, `helpers/`, `mixins/` |
| `build-tests` | `app/frontend/{package.json, ember-cli-build.js, config/, tests/}` |

## The breakage classes

### Class 1 — Ember array methods on native arrays (`EXTEND_PROTOTYPES: false`)
Native `[]` arrays no longer have Ember's extensions. Calling one **throws TypeError**;
reading `firstObject`/`lastObject` **returns undefined silently** (nastier: no console
error, just blank UI).
- Detect: `grep -rnE "\.(sortBy|mapBy|filterBy|findBy|uniq|uniqBy|compact|pushObject|pushObjects|removeObject|removeObjects|addObject|addObjects|insertAt|removeAt|objectAt|toArray|without|isAny|isEvery|invoke|setEach|getEach|any\(|firstObject|lastObject)" app/frontend/app/<slice>`
- Also templates: `{{#each foo.firstObject ...}}`, `{{get list "firstObject"}}` — in
  templates `firstObject` resolves ONLY on Ember arrays.
- **Receiver-verification protocol (mandatory):** trace to assignment.
  | Receiver | Ember array methods? | Verdict |
  |---|---|---|
  | `A(...)`-wrapped / computed returning `A()` | yes | safe |
  | `[]` literal, `.split()`, `.map()/.filter()/.concat()`, `JSON.parse`, `attr('raw')` payload, `Object.keys/values` | no | **finding** |
  | ember-data `hasMany` (`ManyArray`), `store.peekAll/findAll/query` results | **NO** — v5.3 made these native Proxies (verified against v5.3.8 source); methods throw, `firstObject` = silent undefined; `A()`-wrapping them is also unsupported | **finding** |
  | UNresolved async `hasMany` (`PromiseManyArray`) | only `length/links/meta/forEach/then/reload` survive; everything else | **finding** |
  | async `belongsTo` (`PromiseBelongsTo`) | still a full ObjectProxy — chained property access works | safe (don't over-flag) |
  Extra Class-7 trap: `store.peekAll/findAll/query` results REFUSE in-place mutation
  (`.sort()`, `.push()` assert) — copy with `.slice()` first. Ambiguous provenance ⇒
  `confidence: "low"` or skip.
- Fix recipe: native equivalent (`.slice().sort(cmp)`, `.map(f)`, `[...new Set(a)]`,
  `.filter(x => x != null)`, `.push()`, `arr[0]`) preserving comparator/key semantics,
  or `A()`-wrap at the assignment site.

### Class 2 — `@each` / `.[]` dependent keys over native arrays (silent-stale)
`computed`/`observer` keys like `foo.@each.bar` stop firing when `foo` is native and an
element is mutated **in place** (two-way `@checked={{item.prop}}`, `emberSet(item, ...)`)
with no wholesale re-`set`. Wholesale replacement still notifies (base key).
- Detect: `grep -rnE "@each|\.\[\]" app/frontend/app/<slice>` then, per hit: (a) is the
  array native at its assignment site? (b) is any element property mutated in place
  (search templates for two-way binds on the item, JS for `emberSet(item`/`set(item`)?
  Both yes ⇒ finding. In-place mutation absent or a manual trigger/bump exists ⇒ safe
  (see verified-safe list below).
- Fix recipe: `A()` at the assignment site (the computed's `return` / the `.set(...)`).

### Class 3 — Codemod template artifacts (`this.X`)
The 4→5 codemod prefixed `this.` onto names that aren't controller properties.
- **3A block-param collision:** `this.foo.bar` inside `{{#each ... as |foo|}}` /
  `{{#let ... as |foo|}}` — resolves against the controller (or an injected controller!)
  instead of the loop var. Detect: for each `{{#each ... as |x|}}` block in the slice,
  grep the block body for `this.x.`. Whole-row/whole-list blank UI ⇒ HIGH.
- **3B missing injection:** `this.app_state.*` (or any service path) in a template whose
  controller/component never injects it → all gated UI vanishes. Detect: grep template
  for `this.app_state`/`this.persistence`/`this.stashes` etc., then verify the backing
  JS has the injection or alias. Controller-less route templates need a controller file.
  Canonical fix: `appState: service('app-state')` + `app_state: alias('appState')`
  (mirror `controllers/application.js`).
- **3C wrong model path:** `this.foo` where siblings use `this.model.foo`.
- Reachability check first: several templates are DEAD (see the migration doc's dead
  list — e.g. `templates/footer.hbs`, `brief.hbs`, `button.hbs`). A dead-template hit
  is LOW (cleanup) at most.

### Class 4 — Converted-modal `opening()` never runs
Modal controllers rewritten as tagless components bind `this.onOpening` in
`didInsertElement`, but `modal-dialog` invokes the `opening` closure in its own
`didRender` — *before* the child's `didInsertElement`. Result: `opening()` silently
no-ops → empty modal or thrown action.
- Detect: in `components/` with a `modal-dialog`-rendered template: has an `opening()`
  action, binds `onOpening` in `didInsertElement`, and does NOT call
  `self.send('opening')` at the end of `didInsertElement` (nor bind in `init()`).
- 19 components were fixed 2026-07-09 (migration doc Class 4) — check for NEW modal
  components and REGRESSIONS (the call removed by later edits).

### Class 5 — Removed 3.x/4.x APIs
`this.$()`, `Ember.$`, `Ember.assign`, `Ember.merge`, `@ember/string` `.camelize()`
prototype ext, `getWithDefault`, `tryInvoke`, `sendAction`, `{{action}}`, `{{partial}}`,
`locationType: 'auto'`, `Ember.testing` (use `isTesting()` from `@ember/debug`),
`ObjectController`, `ArrayController`, `Ember.copy`, `.property()/.observes()` suffix
syntax, `component:` lookup of a route-driven controller.
- Detect: direct greps per API (list + exact patterns in KNOWN-ISSUES.md).
- `{{action}}` nuance (verified 2026-07-16): the modifier/helper is **deprecated in
  5.x (RFC 1006), removed in 6.0** — it still works in 5.12. A live usage is a LOW
  `removed-api-action-modifier` finding (6.0 blocker), not breakage. Known live usages:
  `templates/register.hbs:32,340,351` (modifier form); other `{{action` greps in
  `create-board-new.js:2088`, `board-detail-grid.hbs:45`, `button-settings.hbs:14` are
  comments — non-findings.
- One deliberate shim exists: `components/available-boards-section.js` local
  `sendAction` — not the removed API; not a finding.

### Class 6 — Ember Data 5.x removed automatic `store` injection into controllers
`this.store.query/createRecord/peekRecord` in a controller with no
`store: service('store')` → `this.store === null` → route fails to load.
- Detect: `grep -rlE "this\.store\b|_this\.store\b|get\(['\"]store['\"]\)" app/frontend/app/controllers app/frontend/app/components` then filter files that inject `store`.
  6 controllers fixed 2026-07-09; hunt the remainder + new code. Routes are unaffected
  (global `LingoLinq.store` / inherit from `routes/index.js`); components mostly inject.

### Class 7 — Ember Data 5.x relationship & store semantics
What legacy mode KEEPS at 5.3.8 (non-findings): adapters/serializers/transforms via the
umbrella package's auto-wired LegacyNetworkHandler; Model mutation surface
(`rollbackAttributes`, `deleteRecord`, `destroyRecord`, `changedAttributes`);
`record.errors`; async `belongsTo` proxying. What it REMOVED (findings): promise proxies
on `findRecord/findAll/query/save` returns (native Promises now — un-awaited results
bound to templates render nothing); `PromiseManyArray` methods beyond
`length/links/meta/forEach/then/reload`; ALL EmberArray methods on `ManyArray`/
`RecordArray` (see receiver table above); `.toArray()`; `A()`-wrapping ED arrays;
in-place mutation of `peekAll/findAll/query` results; `store.find`/`hasRecordForId`;
`Model.reopen(Class)`; static schema access without `store.modelFor`; `snapshot.type`;
`errorsHashToArray/ArrayToHash`; record lifecycle events/Evented (gone since 4.0);
`Model#toJSON`; implicit `hasMany/belongsTo` without `{async, inverse}` (5.0 assertion);
plus 5.3→6.0 deprecations (non-strict ids/types, remote-update-clearing-local-state,
ManyArray duplicates). Watch unload-then-repush flows (`persistence.js` sync) for the
known 4.x/5.x unload/notification regressions.
- Detect: greps in KNOWN-ISSUES.md §Ember-Data (per-API, 32 entries).

### Class 8 — Async observers & run-loop timing
Since 4.0 observers default to async (`default-async-observers`). An observer that
mutated state other code reads *synchronously after the set* now runs a tick later —
ordering bugs, "works when I click slowly".
- Detect: `observer(` sites in the slice whose observed key is set and then read back
  synchronously in the same call path. High-effort, low-volume: only flag proven
  sequences, `confidence` per strength of the trace.

### Class 9 — Build pipeline / addon compatibility
package.json addon version bands vs Ember 5.12, ember-auto-import v2/webpack, sass
pipeline, `optional-features.json` flag consequences, deprecation-workflow config,
Node-engine mismatches. (Node 20 is supported by ember-cli 5.12.) Checklist +
version-band table: KNOWN-ISSUES.md §Build.

### Class 11 — Two-way template binds to non-settable / mis-typed targets
Surfaced by staging fix #621 (2026-07-16, LEARNINGS entries). Two shapes:
- **`<Textarea @value={{this.x}}>` / `<Input @value={{this.x}}>` where `x` is a
  GET-ONLY computed** → every keystroke calls the missing setter →
  `Cannot read properties of undefined (reading 'call')` crash. Detect: for each
  `@value=`/`@checked=` bind in templates, resolve the target; a `computed(` with a
  single function (no `{get, set}` object) and no writable cache is a finding.
- **`<Input type="checkbox">` (HTML attr) instead of `@type="checkbox"` (component
  arg)** → renders as a TEXT FIELD silently. Detect:
  `grep -rn '<Input [^>]*type="' app/frontend/app --include=*.hbs` and flag `type=`
  without `@`. (Native `<input type=...>` elements are fine — only the `<Input>`
  component is affected.)
Also from the same fix: event-helper wrappers that `preventDefault` then drop the
event before `send` never let handlers `stopPropagation` — clicks bubble into
`modal-dialog` and controls look dead (see `bound-select` history; compare against
`modern-select` as the reference pattern).

### Class 10 — Test harness gaps
Tests passing while the app is broken: missing waiters, `Ember.testing` remnants,
legacy `moduleFor*`, DOM helpers, `settled()` misuse. Also: absence of tests over the
Class-1..4 fixed paths is itself a (LOW) finding — regressions here were only caught by
manual UI verification.

## Severity mapping (user-impact, AAC-first)
| Severity | Meaning here |
|----------|--------------|
| critical | Core communication path broken: speak mode, board grid render, utterance/sentence box, sync/offline persistence |
| high | Any user-facing feature inert/blank/throwing: modal dead, list empty, action errors, route fails to load |
| medium | Stale/degraded-but-usable UI; admin/org pages; data loads but doesn't refresh |
| low | Dead-file defects, deprecated-but-working (removed in 6.0), missing regression tests, cleanup |

## Register gotchas (findings get silently REFUSED otherwise)
- No dotted-quad tokens (`x.x.x.x`) anywhere in a finding — the merge's IP scrubber
  refuses the whole finding. Write versions as `3.28` / `5.12`, never 4-part.
- No `NNN_NNN` underscore-digit tokens (global_id scrubber) — if the ideal snippet line
  contains a numeric literal like `100_000`, cite a different line of the same defect.
- No emails, keys, tokens, URLs-with-credentials in any field.
- Snippet must exist VERBATIM at `auditedSha` (merge drops it otherwise): copy from
  `git show <auditedSha>:<file>`.

## Codebase gotchas (from the 2026-07-09 sweep — verify, don't assume)
- **Twin files — check BOTH:** `utils/persistence.js` ↔ `services/persistence.js`,
  `utils/_stashes.js` ↔ `services/stashes.js`; a defect fixed in one may live in the
  other. Also controller/component twins (`modeling-ideas`, `batch-recording`,
  `button-set`, `quick-assessment`, `copy-board`, `sidebar-button-settings`) — one twin
  may be dead; find which is instantiated before flagging.
- **Dead modal controllers:** `controllers/modals/*` largely replaced by components;
  defects there are LOW unless reachability is proven.
- **Verified-safe list (do NOT re-flag; migration doc "Deliberate skips" +
  "Verified-safe"):** e.g. `components/start-codes.js` sort path,
  `controllers/organization/rooms.js:25`, `utils/button.js:742`, `board/index.js:1003`
  `button_levels` (manual trigger), eval render-path arrays (wholesale set),
  `_stashes.js:425` (guarded). Full lists in the doc. Re-flag ONLY if the file changed
  after 2026-07-09 (`git log -1 --format=%cs -- <file>`).

## Finding schema (canonical; mirrors FINDINGS-EMBER.json)
```json
{
  "ruleKey": "arr-ext-sortby-native",
  "title": "sortBy() called on native array in utterance render path",
  "severity": "critical",
  "confidence": "high",
  "frameworks": [],
  "evidence": { "type": "code", "file": "app/frontend/app/utils/utterance.js",
                "line": 447, "snippet": "<verbatim line at auditedSha>",
                "sha": "<auditedSha>" },
  "remediation": { "options": "Replace with [...inline_actions].sort((a,b)=>a.index-b.index); receiver is a [] literal built at :430.",
                   "timeframe": "next-sprint" },
  "status": "open",
  "notes": "Class 1. Receiver provenance: inline_actions = [] at utterance.js:430, filled via .unshift; never A()-wrapped."
}
```
ruleKey prefixes by class: `arr-ext-*` (1), `each-stale-*` (2), `tpl-thisx-*` (3),
`modal-opening-*` (4), `removed-api-*` (5), `ed-store-inject-*` (6), `ed-*` (7),
`async-observer-*` (8), `build-*` (9), `test-gap-*` (10), `twoway-bind-*` (11),
`runtime-*` (crawler).
