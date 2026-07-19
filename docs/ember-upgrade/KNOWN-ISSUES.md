# Ember 3.28 → 5.12 Known Issues Knowledge Base

**App context:** ember-source/cli `~5.12.0`, ember-data `~5.3.8` (umbrella package,
legacy mode), Node 22 (bumped from 20 on 2026-07-16 after empirical verification
below), `EXTEND_PROTOTYPES: false`, `jquery-integration: false`.
**Last researched:** 2026-07-16 (three parallel web-research agents: framework /
ember-data / build+addons; refresh prompts in the appendix). Entries marked
`(unverified)` need a source read or runtime probe before being cited as register
evidence.
**Consumers:** the `ember-upgrade-audit` skill embeds the *checklist* distilled from
this doc; this doc holds the *why*, the edge cases, and the references. The historical
one-shot sweep + fix log is `docs/ember-5.12-migration-findings.md` (Classes 1–6).

**Taxonomy** (how each issue manifests — drives severity and detection strategy):
- **A — runtime-SILENT:** build green, page renders, NO console error; UI is wrong/stale/blank.
- **B — lazy TypeError:** fires only when the code path is exercised; page survives, feature dies.
- **C — loud:** fails at build / module-eval / boot.
- **D — deprecated-but-working at 5.12:** removal lands at 6.0. LOW severity today, strategic debt.
- **E — still supported:** explicitly NOT findings. The false-positive guard.

The three nastiest classes for this app are all **A**: `firstObject`→undefined, `@each`
staleness, and codemod `this.` artifacts — nothing in the console, just wrong UI that an
AAC user cannot route around.

---

## Part 1 — Framework (ember-source) & templates

### A — Runtime-silent wrong rendering

**A1. `firstObject`/`lastObject` on native arrays → `undefined` silently.**
Properties of the `EmberArray` mixin; with `EXTEND_PROTOTYPES: false` they don't exist
on `[]`. No throw — blank labels/fields. Also in templates: `{{list.firstObject.x}}`
resolves only on real Ember arrays. NOTE: also silent-undefined on ember-data
`ManyArray`/`RecordArray` since 5.0 (Part 2, entry 7). Detect
`rg "\.(firstObject|lastObject)\b"` in JS *and* templates; trace receiver. Fix `arr[0]`
/ `.at(-1)` or `A()` at assignment. Refs: deprecate-array-prototype-extensions, RFC 848.

**A2. `@each` / `.[]` dependent keys silently stale over native arrays.**
Invalidation rides EmberArray KVO (`arrayContentDidChange`); native arrays emit none.
In-place element mutation (two-way `@checked`, `emberSet(item, ...)`) never recomputes;
wholesale re-`set` still notifies via the base key — hence intermittent, path-dependent.
Fix: `A()` at the assignment site, or migrate the path to `@tracked`/`TrackedArray`.
== migration-doc Class 2, with its verified-safe list.

**A3. `template-only-glimmer-components: true` — wrapper `<div>` vanishes; `{{this.x}}` in a template-only template is ALWAYS broken (`this` is null).**
Detect: templates under `templates/components/` with no twin JS file; grep them for
`{{this.`. CSS keyed on the old wrapper needs visual confirmation.

**A4. `application-template-wrapper: false` — root `div.ember-view` gone.**
CSS height chains / `querySelector('.ember-view')` measurement code silently die.
Board-sizing (`computeHeight`) exposure if it measured the wrapper. Check the flag in
`config/optional-features.json` before flagging.

**A5. Async-by-default observers (`default-async-observers`).**
Observers fire a tick after `set()` instead of synchronously — "works if I click
slowly", observer-after-destroy guard failures. Targeted revert:
`observer({ dependentKeys: [...], fn() {...}, sync: true })`. Only flag PROVEN
set-then-synchronous-read sequences. == audit Class 8.

**A6. Router-class `willTransition`/`didTransition` hooks dead after 4.0** `(failure mode unverified — possibly silent)`.
Replacement: RouterService `routeWillChange`/`routeDidChange`. Route-level
`actions.willTransition` is still valid — don't confuse the two.

**A7. jQuery-event → native-event divergence.** `event.originalEvent`, `.which` are
undefined on native events. Detect `rg 'originalEvent|\.which\b'`.

**A8. Codemod `this.` artifacts** (block-param collisions, missing injections, wrong
model paths). Ember renders unresolvable paths as empty string, so the page "works".
== audit Class 3 (the migration doc fixed 10 templates + 34 `app_state` files; hunt
strays + new code).

**A9. `{{action}}`→`{{on}}` conversions that dropped `preventDefault`/`bubbles=false`.**
`{{action}}` prevented default and could stop propagation; `{{on}}` is bare
addEventListener. Symptom: double-firing clicks, forms that reload the page. Needs
old-vs-new diff review of converted templates.

**A10. `ArrayProxy` with native-array `content`** — degraded KVO `(unverified whether
5.x asserts)`. Fix: `A()`-wrap the content.

### B — Lazy TypeErrors (fire when the path is exercised)

**B1. Ember array methods on native arrays throw at call time.**
`sortBy mapBy filterBy findBy uniq(By) compact pushObject(s) removeObject(s)
addObject(s) insertAt removeAt objectAt toArray without isAny isEvery invoke setEach
getEach replace`. Fix-semantics traps: `sortBy` = *stable copying* sort with
`get()`-based keys; `filterBy('k')` = truthy match but `filterBy('k', v)` = `===`;
`uniq()` → `[...new Set(a)]` (identity, ignores any key fn — see migration-doc
preferences.js:1254 lesson); `compact()` → `.filter(x => x != null)` (nulls AND
undefined). Lint: `ember/no-array-prototype-extensions`. == audit Class 1.

**B2. `this.$()` / `Ember.$` removed (4.0).** Global `$` still fine when jQuery is
shipped as a lib (this app does). Fix: `this.element.querySelector(...)`.

**B3. `sendAction` removed (4.0).** Trap: 3.x `sendAction('x')` with no such closure
action was a silent no-op — the replacement must be `this.onX?.()` to preserve
optional-call semantics, or a no-op becomes a hard throw. Repo has one deliberate local
shim (`components/available-boards-section.js`) — not a finding.

**B4. Implicit injections removed (4.0, RFC 680).** `this.store`/`this.router`
undefined in controllers/components without explicit `service()`. == audit Class 6
(6 controllers fixed 2026-07-09; hunt the rest). `owner.inject` also dead (B14).

**B5. `getWithDefault` removed (4.0).** Trap: it defaulted ONLY `undefined`; `??` also
catches `null` — use `x !== undefined ? x : dflt` where null must pass through.

**B6. `tryInvoke` removed (4.0).** → `obj.method?.(...)`.

**B7. `Ember.assign` removed (5.0, RFC 750); `Ember.merge` removed (4.0).** → `Object.assign`/spread.

**B8. String prototype extensions removed (4.0).** `"x".camelize() .dasherize()
.capitalize() .underscore() .classify() .htmlSafe() .loc() .w()` throw. Fix: imports
from `@ember/string`; `htmlSafe` from `@ember/template`.

**B9. `@ember/string` extracted from ember-source at 5.0** — must be an explicit
package.json dependency or imports fail at build.

**B10. `window.Ember` global removed (4.0).** Breaks `index.html` inline scripts and
**Cordova/Electron bridge glue** touching `window.Ember` — packaged-app risk for this
repo. Module import still works (D26).

**B11. `Route#render`/`renderTemplate`/`disconnectOutlet` + named outlets removed (4.0).**
Fix: component composition / service-driven secondary content.

**B12. `this.attrs.foo` / `{{attrs.foo}}` removed (4.0).** → `this.foo` / `@foo`.

**B13. `Ember.Logger` (4.0), `Ember.copy`/`Copyable` (4.0), `@ember/error` (5.0) removed.**

**B14. `owner.inject()` removed** — initializer throws at boot. Detect in
`initializers/` + `instance-initializers/`.

**B15. `locationType: 'auto'` removed (5.0, RFC 711).** Packaged `file://` apps were
the real hash-fallback consumers. **Verified clean in this repo 2026-07-16:**
`config/environment.js:8` = `'history'` (`:41` `'none'` for tests), `router.js:19/21`
sets `'hash'`/`'history'` explicitly by capability. Non-finding here; re-check if boot
code changes.

### C — Loud at build/boot (for completeness; CI catches these)

**C16.** Function prototype extensions (`.property()`/`.observes()`/`.on()` *suffix*
forms) removed 4.0 — module-eval TypeError. `observer('key', fn)` import form is fine.
**C17.** computed `.volatile()` removed 4.0 — volatile CPs never notified; a plain
getter is close but verify `notifyPropertyChange` interplay.
**C18.** `{{partial}}` removed 4.0. Trap: partials saw enclosing scope, components
don't — conversion creates A8-style silent bugs.
**C19.** Implicit `this` fallback removed 4.0. **Runtime-compiled templates surface
this only at render** — audit any dynamic template-compile path separately.
**C20.** `{{hasBlock}}`/`{{hasBlockParams}}` → `(has-block)`/`(has-block-params)`.
**C21.** Globals resolver removed 4.0. Namespace-only globals (this repo's
`LingoLinq.store`) are fine — only resolver-dependent registration died.
**C22.** Built-in component reopen/extend (`TextField`/`Checkbox`/`TextArea`/
`LinkComponent`) + legacy positional `{{link-to}}` removed 4.0.

### D — Deprecated in 5.x, working at 5.12 (LOW severity; 6.0 blockers)

**D23. `{{action}}` modifier/helper** — deprecated 5.9 (RFC 1006), removed 6.0.
Verified live usages in this repo: `templates/register.hbs:32,340,351` (modifier form);
other greps are comments. Convert preserving A9 semantics.
**D24. Array-prototype-extensions deprecation (5.10)** fires only when
`EXTEND_PROTOTYPES` is true — NOT this app; we get hard breakage (A1/A2/B1) instead.
**D25. `component-template-resolving`** (5.10→6.0): runtime resolution of
`templates/components/foo.hbs` — **this app's dominant component layout**. At 6.0 every
such component blanks. Codemod: `ember-component-template-colocation-migrator`.
Strategic finding: one register entry, not per-file spam.
**D26. `import Ember from 'ember'` barrel** deprecated 5.10. Per-property scoped
replacements; `Ember.testing` → see Part 3 test section (source dispute, unverified).
**D27. `Route#transitionTo` / `Controller#transitionToRoute`** deprecated since 4.5,
still present in 5.12. RouterService conversion is NOT semantics-preserving from model
hooks (no implicit abort-retry; known bug emberjs/ember.js#20512: transitions abort
when the destination has `refreshModel` QPs with default values). Don't blind-convert.
**D28. Implicit route model** deprecated 5.3→6.0: a `:foo_id` route with no `model()`
hook auto-loads today, `undefined` at 6.0 — a future silent blank page. Statically
detectable now.

### E — Still supported at 5.12: NON-FINDINGS (false-positive guard)

**E29.** Classic classes, `EmberObject.extend`, **mixins**, `computed()`, `observer()`
(import form), `this.get`/`this.set` — zero 5.x deprecations. Never flag "uses classic
class/mixin/observer" as breakage by itself. (Caveats: A5 timing, A2 `@each` receivers,
C16 suffix forms.)
**E30.** `ObjectProxy`, `ArrayProxy`, `PromiseProxyMixin`, `Evented`, `A()`,
`EmberArray` all shipped and supported. `A()` is the sanctioned bridge under
`EXTEND_PROTOTYPES: false` — for PLAIN arrays only, never ED arrays (Part 2, entry 8).
**E31.** Classic `Ember.Component` with `tagName`/`classNames`/`didInsertElement`/
`didRender` supported. The parent-`didRender`-before-child-`didInsertElement` ordering
(audit Class 4 modal bug) is an app-level sequencing pattern, not a framework removal.

### Cross-cutting framework notes
- Receiver provenance is mandatory for every array finding (see the skill's table).
- Runtime-compiled templates escape ALL build-time template checks; category-C items go
  lazy there.
- Lint mapping: `no-implicit-this` (C19), `no-action` (D23), `no-partial` (C18),
  `ember/no-array-prototype-extensions` (A1/A2/B1), `ember/no-function-prototype-extensions`
  (C16), `ember/no-observers` (A5 candidates).
- Primary refs: blog.emberjs.com/ember-4-0-released + ember-5-0-released;
  deprecations.emberjs.com v3.x/v4.x/v5.x; emberjs/ember.js#19617 (4.0 cleanup master
  list); RFCs 848, 1006, 680, 750, 711, 674, 673, 705.

---

## Part 2 — Ember Data 3.28 → 5.3.8 (legacy mode via the `ember-data` umbrella)

"Removed in 5.0" = the 4.x deprecation shim is GONE at 5.3: hard failure or silent
undefined. Entries 5/7/9 were **verified against the emberjs/data v5.3.8 source**.

**1. Implicit `store` injection removed** (RFC 508/680, gone at ember-source 4.0).
`this.store` undefined in controllers/components without `store: service()`. == audit
Class 6. Routes here mostly use the global `LingoLinq.store`, so controllers/components
are the hot zone.

**2. `DS` namespace dissolved; `ember-data/*` legacy import paths deprecated at 5.3**
(`deprecate-legacy-imports`, until 6.0) — EXCEPT `ember-data/store`, which MUST remain
the Store import on the umbrella package (it wires the legacy defaults: JSON:API cache,
LegacyNetworkHandler, schema service). Importing `Store` from `@ember-data/store`
while on the umbrella is a subtle misconfiguration.

**3. Promise proxies removed from `findRecord/findAll/query/queryRecord` returns (5.0).**
They return native Promises now. Un-awaited results bound to templates render nothing;
`result.get('length')` / `result.isPending` on the return value are dead. Fix: await /
resolve in the model hook; loading state from tracked flags, not proxy flags.

**4. `model.save()` / `model.reload()` return native Promises (5.0).** Proxy flags on
the *returned promise* are gone; `record.isSaving` on the record still works.

**5. Unresolved async `hasMany` = slimmed `PromiseManyArray`** (v5.3.8-source verified):
only `length links meta content then/catch/finally isPending-family forEach reload
destroy` survive, plus a `'[]'` notification shim. `{{#each}}` still works (forEach).
Indexing, `firstObject`, EmberArray methods, `.map()` — all gone on the UNresolved
proxy. Fix: `await record.children` then native ops, or
`record.hasMany('children').value()` / `.ids()` for sync access.

**6. Async `belongsTo` (`PromiseBelongsTo`) is the one proxy that SURVIVES.**
`record.get('user.user_name')` still proxies at 5.3 — do not over-flag. Only flag
array-ish use or identity comparison (`proxy === record` is false; compare `.content`).

**7. `ManyArray`/`RecordArray` are NO LONGER EmberArrays (5.0; v5.3.8-source verified).**
Both are native Proxies over real arrays: native methods only
(`map/filter/find/slice/forEach/...` + mutators `push/pop/shift/unshift/splice/sort` —
ManyArray only). NO `pushObject/sortBy/filterBy/objectAt/toArray`; `firstObject`/
`lastObject` = **silent undefined** (blank UI, no console error) — including in
templates. This RESOLVES the legacy-mode open question: relationship arrays are NOT
safe receivers for Ember array methods at 5.3.

**8. `.toArray()` removed; `A()`-wrapping ED arrays unsupported**
(`no-a-with-array-like`, 5.0) `(exact A() failure mode at 5.3 unverified)`. Use
`.slice()` for a mutable native copy. Never `A(record.children)`.

**9. RecordArray mutation assertion (v5.3.8-source verified).** `peekAll/findAll/query`
results refuse in-place mutators ("Mutating this array ... is not allowed";
`allowMutation` guard). In-place `.sort()` is the sneaky one — `.slice().sort()` first.

**10. `@each`/`.[]` over ED arrays** `(partially unverified)`: PromiseManyArray ships a
`'[]'` shim so some legacy chains invalidate, but per-element `@each.prop` reactivity
over ManyArray/RecordArray in classic computeds is not guaranteed. Flag at
`confidence: "medium"` pending a runtime probe; prefer converting to getters
(autotracking picks up the array signal).

**11. Relationships must declare explicit `{ async, inverse }` (5.0 assertion).**
`hasMany('employee')` bare form asserts at model registration/first use `(prod-build
behavior unverified)`. Trivially greppable in `app/frontend/app/models/`; restore 3.28
runtime behavior with `async: true` (the old default) + verified inverse (or null).

**12. Polymorphic relationships via inheritance/mixins need explicit config (5.0):**
abstract side `{ polymorphic: true, inverse: ... }`, every concrete side
`{ as: '<abstractType>', inverse: ... }`. Runtime detection through class hierarchies
is gone.

**13. Remote updates no longer clear local relationship changes**
(`deprecate-relationship-remote-update-clearing-local-state`, NEW at 5.3→6.0).
Behavioral, not greppable: flows that mutate a hasMany locally without saving and then
reload expecting server state to win. Check which mode the app runs:
`resetOnRemoteUpdate` on relationships / `deprecations:` block in `ember-cli-build.js`.
Offline-sync reconciliation (`persistence.js`) is the exposure here.

**14. Duplicate entries in hasMany deprecated at 5.3 (were silently de-duped).**
Guard `arr.push(record)` with `includes()`; fix server payloads emitting duplicate ids.

**15. `store.find` and `store.hasRecordForId` removed (5.0).** →
`findRecord` / `peekRecord(...) !== null`.

**16. Static model-class schema access removed (5.0):** `ImportedModel.relationshipsByName`
etc. must go through `store.modelFor('user')`.

**17. `Model.reopen` / `Model.reopenClass` removed (5.0).** Common 3.x pattern (incl.
from initializers). Move into the class body / shared base Model.

**18. `snapshot.type` / `snapshotRecordArray.type` removed (5.0)** in adapters/
serializers. → `snapshot.modelName`, `store.modelFor(snapshot.modelName)`.

**19. `errorsHashToArray`/`errorsArrayToHash`/`normalizeModelName` removed (5.0);**
`record.errors` still exists but the cache only understands JSON:API error objects with
`source.pointer: '/data/attributes/<name>'` via `InvalidError` — non-JSON:API error
payloads silently stop populating per-attribute validation messages. Review adapter
`handleResponse` / serializer `extractErrors`.

**20. v1 cache (`RecordData`) removed (5.0) — addon killer.** e.g.
`ember-data-model-fragments` only worked through ED 4.12. Grep `RecordData|
createRecordDataFor` + audit addons pinned to ED internals.

**21. Adapters/serializers still supported at 5.3 legacy mode** — REST/JSONAPI
adapters, `normalizeResponse`, transforms, `buildURL` all function via the umbrella
package's auto-wired `LegacyNetworkHandler` `(no-runtime-deprecation claim unverified)`.
Non-finding; only flag à-la-carte `@ember-data/*` setups missing the handler.

**22. `ember-inflector` and `@ember/string` no longer ED dependencies (5.3).**
Custom adapters' `pathForType` importing `ember-inflector` need it as a direct
package.json dependency (not hoisted-by-luck). Irregular-plural rules registered
against ED's bundled inflector may no longer apply `(unverified)`.

**23. Non-strict (numeric) ids deprecated (5.3→6.0).** Identity-map misses when `1` vs
`'1'` mix — duplicated/missing records. Rails serializing integer ids is the classic
source: check `lib/json_api/` output. `String(id)` at store-call boundaries.

**24. Non-strict types deprecated (5.3→6.0).** `type` must be singular + dasherized,
exactly matching the model path; normalization is going away. Normalize once in the
serializer boundary.

**25. `findAll`/`peekAll` = LIVE arrays; `query` = static Collection refreshed via
`.update()`** (concept unchanged, classes changed at 5.0): ArrayProxy-specific access
(`.content`, `objectAt`, `arrangedContent`) is gone. `reload`/`backgroundReload`
adapter hooks retained in legacy mode `(edges unverified)`.

**26. Record lifecycle events / Evented removed at 4.0:** `didLoad didCreate didUpdate
didDelete becameInvalid becameError ready rolledBack`, `record.on/one/trigger` — never
fire. Move logic to call sites or state flags.

**27. `Model#toJSON` removed (4.0); no default adapter fallback; `defaultSerializer`
ignored.** Explicit `adapters/application.js` + `serializers/application.js` required;
`record.serialize()` or hand-built POJOs replace `toJSON` (plain-object `.toJSON()`
receivers are fine — trace before flagging).

**28. Custom transforms (`attr('raw')`) still supported** — only the import path
matters (`@ember-data/serializer/transform`). IMPORTANT INTERACTION: `attr('raw')`
payloads are plain JSON — arrays inside them are NATIVE, so EmberArray methods on them
are Class-1 findings independent of ED (e.g. `start_codes`, `log.events`).

**29. `rollbackAttributes`/`deleteRecord`/`destroyRecord`/`changedAttributes` retained**
in 5.3 legacy mode — non-findings. Second-order trap only: `destroyRecord()` returns a
plain Promise (entry 4), and unload-then-repush hits entry 30.

**30. unload/notification regressions in the 4.x/5.x line (ecosystem watch):**
`unloadAll()` (typeless) destroying the notification manager (fixed #8684);
relationships not cleared unloading NEW records (fixed #8791); push immediately after
`unloadRecord` leaving `isDestroying=true` (#5638); `unloadRecord` triggering refetch
(#7192). Every `unloadAll(|unloadRecord(` hit deserves a behavioral check — especially
sync/offline flows in `persistence.js`. Stay at the 5.3.x tip.

**31. Upgrade-path context:** ED 4.12 is the special LTS bridging 3.28→5.x. Skipping
its deprecation pass means every 4.x deprecation above lands as a hard 5.x error at
once — which is this app's situation; there is no runtime shim left at 5.3.

**32. WarpDrive context (orientation):** `ember-data@5.3` = legacy umbrella over
`@ember-data/*`; project rebranded WarpDrive; `RequestManager`/`Cache` are the forward
path and `@ember-data/model` is the supported legacy presentation layer. Adapter/
serializer/Model code is *legacy but supported* — findings are the removed sub-APIs
above, never the paradigm itself.

Highest-yield greps for this codebase: entry 1 (Class 6 continuation), entry 7
(silent-undefined `firstObject` on relationship/store arrays), entry 11 (bare
`hasMany('x')` in models — trivially greppable), entry 3 (un-awaited store calls bound
to templates).

Refs: deprecations.emberjs.com/ember-data v4.x + v5.x; RFCs 846 (proxies), 745
(PromiseManyArray), 395 (packages), 508/680 (injections); emberjs/data v5.3.8 source
(`many-array.ts`, `identifier-array.ts`, `promise-many-array.ts`); EmberData 4.12
special-LTS + 5.x update blog posts; emberjs/data #5638 #7192 #8684 #8791.

---

## Part 3 — Build pipeline, Node, addons, tests

### Node & core pipeline
- **Node matrix (verified from ember-cli docs/node-support.md):** ember-cli 5.12
  declares `engines: node >= 18`; CI-tested = Node **18 + 20**. Node 22 enters the
  matrix at ember-cli **6.2**; Node 24 at **6.7** (6.7 also drops Node 18). Node
  support drops on the LTS schedule WITHOUT an ember-cli major (Node 16 died mid-5.x
  at 5.3.0). This repo moved `.nvmrc` 20 → 22 on 2026-07-16 (empirical verification
  below; Node 22 LTS maintenance runs to 2027-04). (An externally-circulated map
  "Node 18→Ember 3.12 / 20→3.16 / 22→4.4 / 24→5.3" is WRONG — discard it.)
- **Official vs realistic Node support.** "Supported" in the matrix means *in
  ember-cli's CI*, nothing more: the toolchain is almost entirely pure JS, the app's
  `engines` field only warns (no `engine-strict`), and Node only touches build/test —
  the shipped app runs in browsers/Cordova/Electron regardless. The real gates on a
  Node major jump are (a) native modules recompiling against the new ABI and (b) the
  npm major bundled with the new Node being stricter about peers. **Empirical
  verification for THIS app on Node v22.22 (2026-07-16, this repo, ember-cli 5.12):**
  `npm ci` exit 0 (2,121 packages), `sqlite3` 4.2.0 compiled from source and its
  binding loads and runs, and `ember build --environment production` exit 0 with full
  dist output. No testem/broccoli Node-22 breakage reports found in community searches
  (absence-of-complaints evidence, not proof — run `ember test` once before switching
  CI). **Node 24: NOT yet empirically tested for this app**, and official support only
  lands at ember-cli 6.7 — treat as "probably fine, verify with the same three-step
  test (npm ci → sqlite3 load → prod build) before adopting" `(unverified)`.
- **This app's only ABI-sensitive dependency:** `indexeddbshim` → `websql` →
  **`sqlite3` 4.2.0** (2020-era NAN-based native module, no prebuilts for modern ABIs —
  compiles from source on EVERY Node major jump; ~2-min compile in CI). It survived
  Node 22. It is the single most likely thing to break on a future Node major (NAN vs
  new V8), so re-run the load test on every jump; if it ever fails, options are pinning
  Node, upgrading the `indexeddbshim` chain, or dropping the websql path (it serves
  Node-side IndexedDB shimming — check whether the frontend's dbman/SQLite path even
  uses it in the packaged apps before investing).
- **Where Node is pinned in this repo (update together — all bumped to 22 on
  2026-07-16):** `/.nvmrc` + `app/frontend/.nvmrc`, `app/frontend/package.json`
  `engines: >= 22`, `.github/workflows/ci.yml:75` + `:177`, `Dockerfile:4`
  (`node:22-bullseye`, tag existence verified on Docker Hub) + `Dockerfile:43`
  (`setup_22.x`; the `npm@10` pin retained), `bin/ember-server` (nvm install/use/which
  22). Render builds follow `.nvmrc` via `bin/render-build.sh`.
- **OpenSSL 3 md4 crash** (`error:0308010C` / `ERR_OSSL_EVP_UNSUPPORTED`): webpack 4
  remnants (ember-auto-import v1 era). `NODE_OPTIONS=--openssl-legacy-provider` in CI
  is the tell. Fix: auto-import ^2 + webpack ^5; remove the stopgap.
- **ember-auto-import v2 is effectively mandatory** (v2 addons assert it; ember-qunit
  ≥6 and power-select ≥8 force it) and **the app must own `webpack ^5`** in
  devDependencies (deliberately not a peer).
- **auto-import v2 emits `chunk.*.{js,css}`** wired into index.html. Deployment/
  packaging that hardcodes app.js/vendor.js white-screens in production only.
  **LingoLinq-specific:** audit `bin/deploy_prep`, `rake extras:mobile`,
  `rake extras:desktop` for hardcoded asset lists — copy ALL of `dist/`.
- **`fingerprint.prepend` without `autoImport.publicAssetURL`** → chunks 404/wrong
  origin in production.
- **ember-cli-babel 8 peers `@babel/core`** — the app must declare `@babel/core ^7.25`
  (hoisting can mask the omission).
- **ember-cli-htmlbars band ^6.3**; `ember-cli-htmlbars-inline-precompile` obsolete
  (`hbs` imports from `ember-cli-htmlbars`).
- **CSS minification needs `ember-cli-clean-css`** (blueprint ^3.0.0) — hand-upgraded
  apps miss it. This repo intentionally disables Rails-side CSS compression; the audit
  question is documented intent, not absence.
- **ember-cli-terser frozen at 4.0.2 (2021)** — normal; classic-build only. Stale
  `uglify:` option keys (vs `terser:`) are silently ignored.
- **Broccoli core unchanged (^3.5.2)** — risk is in plugins/custom `treeFor*` code,
  not broccoli itself.
- **npm ERESOLVE peer hell:** peer clusters must move together — (ember-qunit +
  @ember/test-helpers + qunit) and (power-select + basic-dropdown + concurrency).
  `.npmrc` `legacy-peer-deps=true` is a smell that hides real incompatibilities.

### optional-features / EmberENV semantics (what silently changes per flag)
- `jquery-integration: false` — `this.$()` dead; framework events native. Plain
  `import $ from 'jquery'` stays fine (this repo's pattern). `@ember/jquery` should be
  GONE from package.json.
- `application-template-wrapper: false` — root `div.ember-view` removed (Part 1 A4).
- `template-only-glimmer-components: true` — rewrites DOM/`this` of every JS-less
  component (Part 1 A3).
- `default-async-observers: true` — observer timing change (Part 1 A5). Observer-heavy
  utils (`app_state`, `persistence`) are the exposure.
- `EXTEND_PROTOTYPES` left ON is itself deprecated at 5.10, removed 6.0 — this repo is
  already `false` (hence hard breakage instead of deprecation noise).
- **Deprecation surfacing:** ember-cli-deprecation-workflow **v4** (supports 3.28→6.10):
  `setupDeprecationWorkflow({ throwOnUnhandled: true, workflow: [...] })` in `app.js`,
  baseline via `deprecationWorkflow.flushDeprecations()`; `RAISE_ON_DEPRECATION` for
  CI-only configs. This repo BANS silencing via `registerDeprecationHandler`.
- **Embroider is NOT required for 5.12** — blueprint gates `@embroider/*` behind an
  opt-in flag; classic build is the sanctioned configuration here.

### Addon compatibility bands (Ember 5.12)
| Addon | Band / status | Note |
|---|---|---|
| ember-fetch | README: "no longer needed"; still in the 5.12 blueprint | migrate to native fetch + @ember/test-waiters, then drop |
| ember-ajax | npm-deprecated, dead (5.1.2, 2022) | replace with fetch/service |
| ember-cli-sass | frozen 11.0.1 (2022); works with classic builds | dart-sass only; purge node-sass from the lockfile |
| ember-modal-dialog | ^5.0.0 works; animated+tether variant DEAD on Ember ≥4 (liquid-tether incompatible); maintainers sunsetting | native `<dialog>` long-term; this repo's `utils/modal.js` is the single migration seam |
| liquid-fire | ~0.37.1 (May 2025) maintenance band | peer velocity-animate ^1.5.2 |
| ember-cli-content-security-policy | stale 2.0.3 (2022), untested on ember-cli 5 | CSP truth belongs in Rails/edge headers |
| ember-power-select | 8.x spans 3.28→5.x (safe target); 9.x drags the test-helpers-5 peer cluster | upgrade clusters together |
| ember-qunit | ^8.1 + @ember/test-helpers ^3.3 + qunit ^2.22 + qunit-dom ^3.2 (blueprint quartet) | `moduleFor*` removed at ember-qunit 5; ember-cli-qunit dead |
| ember-exam | ^9/^10 (ember-cli ≥ 4.8, Node ≥ 18) | `start` now imports from 'ember-exam/test-support' |

### Test-harness gaps (audit Class 10 feeders)
- **`settled()` blindness:** it tracks runloop + registered waiters + legacy jQuery
  AJAX. Native `fetch`/XHR/`setTimeout` chains are INVISIBLE → tests pass while the app
  is broken, or assertions race data loads. Exposure here: `persistence.sync`,
  `speecher`, log uploads (unawaited fetches). Fix: `@ember/test-waiters`
  (`waitForPromise`/`buildWaiter`) in app code; `waitFor`/`waitUntil` in tests — never
  arbitrary timeouts.
- **`Ember.testing` / `'ember'` barrel** on the way out (5.10 deprecations).
  UNRESOLVED SOURCE DISPUTE: repo CLAUDE.md says `isTesting()` from `@ember/debug`;
  research says the supported import may be `@embroider/macros` — verify against the
  5.12 API docs before emitting any finding on this.
- **Sourcemaps are configured in TWO places:** classic `sourcemaps:{}` in
  ember-cli-build.js vs webpack `autoImport.webpack.devtool` — set both or coverage is
  mismatched.

---

## Part 4 — This-codebase verified facts (2026-07-16, branch claude/ember-upgrade-audit-system-9xk3zo)

- Residual greps: `this.get(` 500 files / `this.set(` 387 / observers 152 /
  `.extend(`+Mixin 666 / jQuery imports 95 / `Ember.` globals 6 / `{{partial` 0 —
  ALL category-E legal at 5.12; hunt behavior, not style.
- `{{action` matches 4 files: `templates/register.hbs:32,356,367` (lines shifted by
  staging #616; originally 32,340,351) = live `{{action}}` MODIFIER usages (D23, LOW);
  `create-board-new.js:2088`, `board-detail-grid.hbs:45`, `button-settings.hbs:14` =
  comments (non-findings).
- **New breakage patterns from staging fix #621 (2026-07-16), now audit Class 11:**
  (a) `<Textarea @value>`/`<Input @value>` bound to a get-only computed → crash on
  keystroke (`Cannot read properties of undefined (reading 'call')`); fix = writable
  computed with an edit cache. (b) `<Input type="checkbox">` without `@type=` renders
  as a TEXT field silently. (c) event-helper wrappers that pop the event before `send`
  break `stopPropagation` → clicks bubble into `modal-dialog`, selects look dead
  (`bound-select`, fixed to match `modern-select`). Full stories: LEARNINGS.md
  2026-07-16 entries + `docs/task-management/2026-07-16-org-home-board-key-lines.md`.
- Staging #616 (EU AI consent) added a new modal `components/eu-ai-parental-consent.js`
  — its `didInsertElement` binds `onOpening` (Class-4 shape) but `opening()` is empty,
  so verified benign (2026-07-19). New surface for the next audit sweep:
  `ai_feature_gate.js`, rewritten `controllers/register.js`, `serializers/user.js`.
- `locationType` clean (B15 verified non-finding): environment.js:8 `'history'`,
  `:41` `'none'` (tests), router.js:19/21 `'hash'`/`'history'` by capability.
- Twin/duplicate modules (fix BOTH; one twin may be dead): `utils/persistence.js` ↔
  `services/persistence.js`, `utils/_stashes.js` ↔ `services/stashes.js`;
  controller/component twins listed in the migration doc §Gotchas.
- Dominant component layout is `templates/components/*.hbs` (separate-template
  resolution) → D25 `component-template-resolving` is a strategic 6.0 blocker for this
  app (one register finding, not per-file spam).
- Prior sweep (2026-07-09) fixed: 19 modal `opening()` components, 10 block-param
  templates, 34 `app_state` alias files, 27 array-extension files, 5 `@each` wraps,
  6 store-injection controllers. Full lists + verified-safe entries:
  `docs/ember-5.12-migration-findings.md`. Dedup against it before emitting.

---

## Appendix — Research refresh prompts

When `Last researched` is > 90 days old (checked by `/ember-audit-run` preflight),
re-run three parallel web-research agents with these scopes and merge deltas into this
doc (update the header date):
1. **Framework:** ember-source 4.0/5.0 removals + v5/v6 deprecation guides + runtime-
   silent breakage patterns + GitHub issue regressions. Emphasize anything NEW since
   the header date (6.x deprecation guides matter as this app approaches 6.0).
2. **Ember Data:** emberjs/data release notes ≥ 5.3.8, WarpDrive migration guidance,
   unload/notification regression fixes, legacy-mode support status.
3. **Build/addons:** ember-cli node-support.md drift, addon band updates for the table
   above, deprecation-workflow major bumps.
Each entry needs: Symptom / Mechanism / Detection (grep) / Fix recipe / Refs, with
`(unverified)` marking anything not source-confirmed.
