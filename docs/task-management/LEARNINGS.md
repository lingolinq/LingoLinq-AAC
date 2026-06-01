# Learnings

Durable patterns, root-cause families, and codebase gotchas distilled from
completed tasks. Skim this before starting any new task; append to it on
successful completion of one. Per-task working logs live alongside this
file (see [README.md](README.md)).

> Keep entries short and self-contained. One paragraph + a code/file
> reference is usually right. If something grows past a few paragraphs,
> move it to its own doc and link to it here.

> **Related doc** — [`docs/pre-merge-audit-checklist.md`](../pre-merge-audit-checklist.md)
> is the operational layer that turns these patterns into a per-PR
> checklist. This file is the *knowledge* (the patterns and why they
> matter); the checklist is the *action* (the grep/command to run
> before opening a PR). When a pattern here grows a mechanical check,
> add it to §2.10 of the checklist. When a recurring blocker arrives
> from PR review (Scot-style finding), distill the pattern here first,
> then operationalize it there.

## Index

- [Pattern: phased board prefetch — shared planner, dual persistence files](#pattern-phased-board-prefetch--shared-planner-dual-persistence-files)
- [Pattern: `find_all_by_global_id` does not preserve input order](#pattern-find_all_by_global_id-does-not-preserve-input-order)
- [Pattern: HTML5 drag-and-drop suppressed by nested `<button>` children](#pattern-html5-drag-and-drop-suppressed-by-nested-button-children)
- [Pattern: "It's broken" symptoms that vanish on re-test = stale Ember dev bundle](#pattern-its-broken-symptoms-that-vanish-on-re-test--stale-ember-dev-bundle)
- [Pattern: SVG gradient ID refs inside CSS data URIs mangled by Rails Sprockets in production](#pattern-svg-gradient-id-refs-inside-css-data-uris-mangled-by-rails-sprockets-in-production)
- [Pattern: app.scss contains byte-identical duplicate rules — the LATER copy wins](#pattern-appscss-contains-byte-identical-duplicate-rules--the-later-copy-wins)
- [Pattern: Speak-mode vs edit-mode right-panel selectors look near-identical](#pattern-speak-mode-vs-edit-mode-right-panel-selectors-look-near-identical)
- [Pattern: Atmospheric depth surface formula — replace hard 1px borders with layered shadows + glass veil](#pattern-atmospheric-depth-surface-formula--replace-hard-1px-borders-with-layered-shadows--glass-veil)
- [Pattern: `__label-collapsed` is a multi-role class — scope by parent before styling](#pattern-__label-collapsed-is-a-multi-role-class--scope-by-parent-before-styling)
- [Pattern: "Shrink to fit" is a per-label content-aware problem, not container-scaling — reach for capabilities.fit_text](#pattern-shrink-to-fit-is-a-per-label-content-aware-problem-not-container-scaling--reach-for-capabilitiesfit_text)
- [Pattern: board-detail label surface has TWO elements — `__label` (span) and `__label-input` (input)](#pattern-board-detail-label-surface-has-two-elements--__label-span-and-__label-input-input)
- [Pattern: `organizations.admin` is a singleton boolean, not a normal flag](#pattern-organizationsadmin-is-a-singleton-boolean-not-a-normal-flag)
- [Pattern: settings-backed API flags should be cast before Ember consumes them](#pattern-settings-backed-api-flags-should-be-cast-before-ember-consumes-them)
- [Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active](#pattern-duplicate-selectors-in-appscss-can-leave-stale-layout-constraints-active)
- [Pattern: RESERVED_ROUTES blocks intended system usernames in seeds](#pattern-reserved_routes-blocks-intended-system-usernames-in-seeds)
- [Pattern: Touch-device parity for hover-only affordances — thread context through the existing modal path](#pattern-touch-device-parity-for-hover-only-affordances--thread-context-through-the-existing-modal-path)
- [Pattern: Pass-through actions silently truncate args when the wrapper's signature has fewer named params](#pattern-pass-through-actions-silently-truncate-args-when-the-wrappers-signature-has-fewer-named-params)
- [Pattern: Custom-JS drag works on desktop but not in touch emulation — root cause is `touch-action`, not the JS](#pattern-custom-js-drag-works-on-desktop-but-not-in-touch-emulation--root-cause-is-touch-action-not-the-js)
- [Pattern: `!supporter_role` is the canonical communicator gate — never invent a `communicator_role` boolean](#pattern-supporter_role-is-the-canonical-communicator-gate--never-invent-a-communicator_role-boolean)
- [Pattern: Removing a UI feature is incomplete until every coupled site is removed](#pattern-removing-a-ui-feature-is-incomplete-until-every-coupled-site-is-removed)
- [Pattern: "Silent wrong behavior" is the modal failure mode in this codebase — assume it, probe for it](#pattern-silent-wrong-behavior-is-the-modal-failure-mode-in-this-codebase--assume-it-probe-for-it)
- [Pattern: `i18n_generator.rb` is a static parser — dynamic `{{t bound.prop key=bound.prop}}` keys are invisible to it](#pattern-i18n_generatorrb-is-a-static-parser--dynamic-t-boundprop-keyboundprop-keys-are-invisible-to-it)
- [Pattern: Feature-flag-gated mutating actions need BOTH a template gate AND a JS action gate (defense-in-depth)](#pattern-feature-flag-gated-mutating-actions-need-both-a-template-gate-and-a-js-action-gate-defense-in-depth)
- [Pattern: Canvas drawing has different constraints than CSS — translate the design language, don't import it](#pattern-canvas-drawing-has-different-constraints-than-css--translate-the-design-language-dont-import-it)
- [Pattern: `context.roundRect` is a Cordova-WebView landmine — use path-based rounded-rect tracing](#pattern-contextroundrect-is-a-cordova-webview-landmine--use-path-based-rounded-rect-tracing)
- [Pattern: Every `belongs_to`/`has_one` access in a `JsonApi::*` serializer is a potential N+1 — eager-load it at the list-endpoint controller](#pattern-every-belongs_tohas_one-access-in-a-jsonapi-serializer-is-a-potential-n1--eager-load-it-at-the-list-endpoint-controller)
- [Pattern: Query-count specs must be verified to FAIL against the broken state — otherwise they're no-ops](#pattern-query-count-specs-must-be-verified-to-fail-against-the-broken-state--otherwise-theyre-no-ops)
- [Pattern: For component tests in this codebase, use legacy Jasmine — not `setupApplicationTest` + Mirage (which hangs)](#pattern-for-component-tests-in-this-codebase-use-legacy-jasmine--not-setupapplicationtest--mirage-which-hangs)
- [Pattern: Canvas component tests use a context-recorder stub, not pixel inspection](#pattern-canvas-component-tests-use-a-context-recorder-stub-not-pixel-inspection)
- [Pattern: Installing a v2-format Ember addon on Ember 3.28 requires ember-auto-import + a jquery externals shim](#pattern-installing-a-v2-format-ember-addon-on-ember-328-requires-ember-auto-import--a-jquery-externals-shim)
- [Pattern: Same-named computeds defined across model/component/controller are widespread and often diverge — gate visibility-dependent code on DOM presence](#pattern-same-named-computeds-defined-across-modelcomponentcontroller-are-widespread-and-often-diverge--gate-visibility-dependent-code-on-dom-presence)
- [Pattern: `!important` does not beat source order at equal specificity — bump specificity with a compound selector instead](#pattern-important-does-not-beat-source-order-at-equal-specificity--bump-specificity-with-a-compound-selector-instead)
- [Pattern: Third-party CSS — import the default first, then override; the structural rules and the decorative ones ship together](#pattern-third-party-css--import-the-default-first-then-override-the-structural-rules-and-the-decorative-ones-ship-together)
- [Pattern: `session.override()` does a full page reload — in-memory appState set in register flow doesn't survive](#pattern-sessionoverride-does-a-full-page-reload--in-memory-appstate-set-in-register-flow-doesnt-survive)
- [Pattern: This codebase ships `and` and `or` template helpers but NOT `not` — pre-compute negations](#pattern-this-codebase-ships-and-and-or-template-helpers-but-not-not--pre-compute-negations)
- [Pattern: Cross-context CSS classes need scoped overrides — `.la-about-glass-card` is dark-landing AND light-modal](#pattern-cross-context-css-classes-need-scoped-overrides--la-about-glass-card-is-dark-landing-and-light-modal)
- [Pattern: Modern checkboxes split into two families — pick by surface type, not aesthetic preference](#pattern-modern-checkboxes-split-into-two-families--pick-by-surface-type-not-aesthetic-preference)
- [Pattern: `/api/v1/boards?user_id=X` returns every owned board including sub-board copies — visible-tile counts need root clustering](#pattern-apiv1boardsuser_idx-returns-every-owned-board-including-sub-board-copies--visible-tile-counts-need-root-clustering)
- [Pattern: create-board-new preview URLs stripped by process_buttons whitelist](#pattern-create-board-new-preview-urls-stripped-by-process_buttons-whitelist)
- [Pattern: OpenSymbols search returns nested license objects — pick_preview must normalize](#pattern-opensymbols-search-returns-nested-license-objects--pick_preview-must-normalize)
- [Pattern: Speak+light surface overrides shadow speak+light from the base — delete the override, don't fork it](#pattern-speaklight-surface-overrides-shadow-speaklight-from-the-base--delete-the-override-dont-fork-it)
- [Pattern: Bidirectional view-switch overlay — extract to a util and parameterize, don't inline a second copy](#pattern-bidirectional-view-switch-overlay--extract-to-a-util-and-parameterize-dont-inline-a-second-copy)
- [Pattern: Board-card click navigation has TWO surfaces — board-icon `pick_board` default branch + board-preview `visit`; everything else delegates](#pattern-board-card-click-navigation-has-two-surfaces--board-icon-pick_board-default-branch--board-preview-visit-everything-else-delegates)
- [Pattern: Signup default library boards — copy via Progress, not copy_to_home_board](#pattern-signup-default-library-boards--copy-via-progress-not-copy_to_home_board)

---
- [Pattern: ember-shepherd tour chrome and scoped overlay blur](#pattern-ember-shepherd-tour-chrome-and-scoped-overlay-blur)
- [Pattern: Viewport-conditional board-detail UI (orientation gate + immersive tool consolidation)](#pattern-viewport-conditional-board-detail-ui-orientation-gate--immersive-tool-consolidation)
- [Pattern: Dashboard card order is driven by grid-template-areas per breakpoint × variant — reorder there, never the DOM](#pattern-dashboard-card-order-is-driven-by-grid-template-areas-per-breakpoint--variant--reorder-there-never-the-dom)
- [Pattern: board-picker is shared (setup + /search/home); reusing boards-page tab classes hits a ≤640px hide rule](#pattern-board-picker-is-shared-setup--searchhome-reusing-boards-page-tab-classes-hits-a-640px-hide-rule)
- [Pattern: dual wide-only/narrow-only markups share a base class — `querySelector(base)` grabs the hidden one](#pattern-dual-wide-onlynarrow-only-markups-share-a-base-class--querySelectorbase-grabs-the-hidden-one)
- [Pattern: sidebar "pin open" state lives in the `quick_sidebar` pref via `stickSidebar` — reuse it, don't add a second flag](#pattern-sidebar-pin-open-state-lives-in-the-quick_sidebar-pref-via-sticksidebar--reuse-it-dont-add-a-second-flag)
- [Pattern: async store/query callbacks must guard `isDestroyed`/`isDestroying` before `set`](#pattern-async-storequery-callbacks-must-guard-isdestroyedisdestroying-before-set)
- [Pattern: per-element responsive show/hide rules must sit AFTER that element's base `display` rule — don't consolidate when bases are scattered](#pattern-per-element-responsive-showhide-rules-must-sit-after-that-elements-base-display-rule--dont-consolidate-when-bases-are-scattered)
- [Pattern: a glow/halo `::before` that "leaks to the whole container" at one breakpoint = the host lost `position` (static re-anchors the absolute pseudo)](#pattern-a-glowhalo-before-that-leaks-to-the-whole-container-at-one-breakpoint--the-host-lost-position-static-re-anchors-the-absolute-pseudo)

## Pattern: phased board prefetch — shared planner, dual persistence files

**Surface:** session navigation cache (`board_detail_cache.js`) and offline IndexedDB sync (`sync_boards`).

**Approach:** [`board_prefetch_planner.js`](../../app/frontend/app/utils/board_prefetch_planner.js) enumerates roots in priority order (home → liked → owned → public). Session cache runs `/tree` per root via `_run_prefetch_pipeline`; offline sync seeds the BFS queue with the same lookups via `lookupsToSyncSeeds`.

**Gotcha:** `sync_boards` exists in **both** [`app/utils/persistence.js`](../../app/frontend/app/utils/persistence.js) and [`app/services/persistence.js`](../../app/frontend/app/services/persistence.js). Runtime sync uses `window.persistence` (the service). Any offline-sync change must be applied to **both** files or offline behavior won't match.

**Flags:** Phase 1 (home) is unconditional; phases 2–4 run when `background_board_prefetch` is enabled (shipped in `ENABLED_FRONTEND_FEATURES`). Phase 4 also honors legacy `catalog_board_prefetch`.

**First seen in:** [2026-05-30-phased-online-board-caching.md](./2026-05-30-phased-online-board-caching.md)

## Pattern: HTML5 drag-and-drop suppressed by nested `<button>` children

**Surface:** any tile that wraps an interactive card in
`<div draggable="true">` — most prominently the board cards on
`/u/<user>/boards` and inside the My Boards picker.

**Symptom:** The user starts a drag from a board card and **nothing
happens** — no drag-ghost, no `dragstart` event, the cursor just stays
as the grab cursor. Drop targets are correctly wired, but the drag
itself never initiates.

**Root cause:** In Chrome/Webkit, a `mousedown` that lands on a real
`<button>` descendant of a `draggable="true"` parent is treated as a
form-control gesture-capture and **never escalates to the parent's
drag-initiation**. The parent's `dragstart` handler never fires.
Native `<img>` has the inverse problem (it tries to drag itself);
that's solved separately with `draggable="false"` on the img.

**Fix recipe:**

1. The card-body click target (the area the user grabs) should be a
   `<div role="button" tabindex="0">` with a keydown handler that maps
   Enter/Space to the same action — NOT a real `<button>`. See
   `templates/components/board-icon.hbs:31-36` and the explicit
   comment block above it.
2. Any `<img>` inside the draggable card must have `draggable="false"`
   (see board-icon.hbs:110, 112).
3. **Do NOT** use CSS `-webkit-user-drag: none` on inner children to
   try to "let the parent take the drag". That's a known Chrome quirk:
   user-drag:none on a child blocks the BROWSER's drag initiation on
   any ancestor too. The right tool is the HTML `draggable="false"`
   attribute, not CSS. See the comment at `app.scss:54208-54231`.
4. Remaining real `<button>` chrome elements absolutely-positioned on
   top of the card (e.g. `.info` PREVIEW pill, `.board-icon__info`
   chip, `.board_action` delete X) will still suppress drag if the
   user happens to grab directly on them. They're small targets so
   most drags initiate fine, but if you ever extend a button's surface
   area, give it `draggable="false"` as well.

**Evidence:** commits 0de5697ce (introduced the regression by making
`.board-icon__pick` a real `<button>` for WCAG) and 72a77dd1c
(reverted it to `<div role="button">` with an inline comment
documenting the Chrome quirk).

**First seen in:** [2026-05-24-my-boards-drag-drop-folder-create.md](./2026-05-24-my-boards-drag-drop-folder-create.md)

---

## Pattern: "It's broken" symptoms that vanish on re-test = stale Ember dev bundle

**Surface:** Any frontend bug reported on `localhost:8184` (Ember dev
server) that suddenly works when you re-test without changing code.

**Symptom:** A feature behaves wrong, user reports it, you investigate,
and by the time you ask them to verify a specific repro detail the
problem has self-resolved.

**Root cause:** The Ember CLI dev server (`ember serve`) rebuilds
incrementally on each save, but mid-refactor commits can leave the
served bundle temporarily inconsistent with the source tree. The
browser sees the stale bundle until the next compile pass settles AND
the page is reloaded (or hot-reload picks up the new bundle). Cached
app.css / app.js exacerbate this — a hard-reload (Ctrl+Shift+R) shakes
it loose. The Rails server on `:5000` has a related issue with stale
symlinks; see styling-recurring-problems.md #12.

**Fix recipe (in order):**

1. Before investigating, ask the user to hard-reload (Ctrl+Shift+R) and
   verify the symptom persists.
2. If it still repros, capture concrete evidence at the moment of
   failure: the rendered DOM attribute, the browser console, the exact
   click location. Per Rule #0.1, don't fix without evidence — and a
   self-resolving symptom is the loudest possible signal that the
   "fix" is unnecessary.
3. If it doesn't repro, document the working state, note the suspected
   stale-cache cause, and move on. Don't apply a precautionary fix on
   top of a working system.

**First seen in:** [2026-05-24-my-boards-drag-drop-folder-create.md](./2026-05-24-my-boards-drag-drop-folder-create.md)

---

## Pattern: SVG gradient ID refs inside CSS data URIs mangled by Rails Sprockets in production

**Surface:** any CSS rule shipping a `background-image:
url("data:image/svg+xml,...")` data URI whose embedded SVG uses
`fill="url(#someId)"` (or `stroke="url(#someId)"`) fragment refs to
its own `<linearGradient>` / `<radialGradient>` defs.

**Symptom:** the SVG renders **with all solid-color fills present
and every gradient-filled element invisible**, in production /
deployment only. Local Ember dev server (`localhost:8184`) is
fine. Classic shape on this codebase: an avatar silhouette where
the head (solid color) renders but the body (gradient fill) is
transparent — "hollow shell" look.

**Root cause:** Rails Sprockets / the production asset pipeline
runs every `url(...)` reference in CSS through `asset_path` for
URL normalization. It doesn't special-case fragment refs
(`url(#xxx)`) inside `data:` URIs. The source SVG's
`fill='url(%23m)'` (encoded `url(#m)`, a same-document fragment
ref) gets rewritten to `fill='url(/%23m)'` — a path-rooted URL
with fragment `#m`, which doesn't resolve to a gradient definition
inside the SVG. Per the SVG spec the fill then becomes `none` →
transparent. The Ember dev server doesn't run Sprockets, which is
why local was unaffected.

**The same family includes** the older bug at
[app.scss:2473-2479](app/frontend/app/styles/app.scss#L2473-L2479)
where inline `<svg>` in HTML templates had the same gradient-ref
mangling at a different layer of the build. Moving to a CSS data
URI fixed THAT site but landed in this one. There may be other
sites with the same pattern.

**Fix recipe:**

1. **Do not use `url(#id)` refs inside any SVG that ships through
   the production CSS pipeline as a data URI.** Strip the `<defs>`
   block. Replace every `fill="url(#X)"` and `stroke="url(#X)"`
   with a solid hex color picked from the gradient's palette
   (a midpoint, or a brand-anchored endpoint).
2. If the gradient effect is essential to the design, layer the
   gradient via the CSS `background:` property
   (`linear-gradient(...)`) instead of inside the SVG — CSS
   gradients don't go through Sprockets URL normalization. You can
   stack a CSS gradient *under* an SVG that only contains
   solid-color elements.
3. Pin the constraint with a code comment so the next person who
   tries to "improve" the design by reintroducing a gradient knows
   why it'll break.

**How to detect this in the wild:** grep CSS source for
`data:image/svg.*url\(%23` — any match is a candidate for
production breakage. Compare the SOURCE data URI vs the DEPLOYED
data URI (DevTools → Computed styles → background-image value): if
you see `/` prepended to fragment refs in deployment, you have the
bug.

**First seen in:** [2026-05-24-identity-dropdown-avatar-hollow-shell.md](./2026-05-24-identity-dropdown-avatar-hollow-shell.md)


---

## Pattern: app.scss contains byte-identical duplicate rules — the LATER copy wins

`app/frontend/app/styles/app.scss` is a >86k-line file and several
dark-mode rules have been copy-pasted into multiple locations. Editing
only the first occurrence appears to do nothing because the later
occurrence wins the cascade (same selector, same specificity → source
order decides).

**Examples observed (2026-05-25):**
- `.md-board-detail--dark .md-board-edit-panel` exists at ~80105 AND ~82668
- `.md-board-detail--dark .md-board-edit-right-panel` exists at ~81409 AND ~84509
- `.md-board-detail--dark .md-board-detail-edit-toolbar` exists at ~63823 AND ~68371

**Detection:** before editing any dark-mode rule in `app.scss`, run
`grep -n "<exact selector>"` against the file. If you see >1 match,
either edit both (use `Edit` with `replace_all` after confirming the
two blocks are byte-identical) or pick the later one — never edit
only the earlier copy and assume it took.

**Why the duplicates exist:** mostly historical — multiple feature
branches merged in styles that happened to redefine the same dark-mode
chrome. Consolidating them is a separate refactor; for now the rule is
"update every copy in lockstep" so the cascade winner always sees your
change.

**First seen in:** [2026-05-25-board-detail-edit-dark-mode-panel-tiers.md](./2026-05-25-board-detail-edit-dark-mode-panel-tiers.md)

---

## Pattern: Speak-mode vs edit-mode right-panel selectors look near-identical

The board-detail page has TWO right panels with very similar class
names — one for each mode of the page:

- `.md-board-detail-right-panel` — used in SPEAK mode (the
  non-edit board-detail layout). Transparent by default in dark
  mode; sits over the page canvas.
- `.md-board-edit-right-panel` — used in EDIT mode. Has its own
  gradient fill + shadow chrome (it is one of the three "rail"
  surfaces flanking the center board stage).

They differ by a single hyphen-segment (`detail` vs `edit`) and it is
extremely easy to grab the wrong one when fixing edit-mode styling.

**How to confirm you have the right one:** the edit-mode element only
renders when the shell carries `.md-shell--board-detail-edit`. Search
the `.hbs` template for the class name first — `app/frontend/app/
templates/user/board-detail.hbs` will use one or the other depending
on the `editing` branch.

**Same gotcha lives on the left side:** `.md-board-edit-panel` is the
edit-mode left rail; there is no symmetric speak-mode counterpart at
that path (the speak-mode left is `.md-board-detail-sidebar`). So the
`*-edit-*` prefix is the reliable signal that you are looking at an
edit-mode chrome element.

**First seen in:** [2026-05-25-board-detail-edit-dark-mode-panel-tiers.md](./2026-05-25-board-detail-edit-dark-mode-panel-tiers.md)


---

## Pattern: Atmospheric depth surface formula — replace hard 1px borders with layered shadows + glass veil

**Surface:** any chrome panel / card / toolbar on the app that's still
relying on `border: 1px solid rgba(...)` for visual separation. The
boards page already uses an "atmospheric" technique that reads as
premium-SaaS; other pages (board-detail edit, modals, etc.) still
have a 2010s-era hard-edge look until they're transitioned.

**The four-ingredient recipe** (replace ALL of `border: 1px solid
rgba(x, .10–.22)` with these in combination):

1. **Hairline border** — `border: 1px solid rgba(navy-or-white, .04–.08)`.
   At this alpha the border is below the perception threshold for
   "stroke" but still anchors the rounded corners cleanly. Don't drop
   the border entirely or radius corners go soft.
2. **Translucent glass veil (dark mode only)** — layer
   `linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015))`
   ABOVE the existing panel-surface gradient using CSS multi-layer
   `background:`. Reads as ambient light catching the surface from
   above; solid gradients alone can't produce this quality.
3. **Three-tier shadow stack** — close + mid + broad. The mid is the
   existing convention (`0 8px 24px @ low alpha`); the new ingredient
   is the **broad ambient haze**: `0 24px 60px rgba(x, .06–.30)` (or
   `0 16px 40px` for thinner surfaces like toolbars). This is what
   creates the "fade into the canvas" haze you can't get from a stroke.
4. **Inset top-edge highlight** — `inset 0 1px 0 rgba(255,255,255, A)`.
   Bright in light mode (A=.65–.95); subtle in dark mode (A=.05–.10).
   Pairs with the outer broad shadow to create directional lighting:
   bright above, dark below.

**Light-mode rail template:**
```scss
background: linear-gradient(180deg, #ffffff 0%, #f1f4f8 100%);
border: 1px solid rgba($la-navy, 0.06);
box-shadow:
  0 1px 2px  rgba($la-navy, 0.04),
  0 8px 24px rgba($la-navy, 0.07),
  0 24px 60px rgba($la-navy, 0.06),
  inset 0 1px 0 rgba(255, 255, 255, 0.65);
```

**Dark-mode rail template** (layer over your existing panel-surface base):
```scss
background:
  linear-gradient(180deg, rgba(255,255,255, 0.04), rgba(255,255,255, 0.015)),
  linear-gradient(180deg, <panel-base-1> 0%, <panel-base-2> 100%);
border-color: rgba(255, 255, 255, 0.06);
box-shadow:
  0 1px 2px  rgba(0, 0, 0, 0.20),
  0 8px 24px rgba(0, 0, 0, 0.22),
  0 24px 60px rgba(0, 0, 0, 0.30),
  inset 0 1px 0 rgba(255, 255, 255, 0.06);
```

**For recessed wells** (a panel that should read as INSET, not raised
— e.g. the live-preview region above a board grid): keep the
hairline border at .04–.06 alpha, but invert the shadow direction —
use `inset 0 2px 8px rgba(0, 0, 0, .35)` (inward) instead of an outer
ambient haze. A subtle outer haze underneath the well is fine to
ground it on the page.

**Anti-pattern to avoid:** dropping the border entirely and trying to
delineate purely with shadow. The rounded corners lose definition and
look "un-resolved" at certain zoom levels. The .04–.08 hairline is
load-bearing even when imperceptible.

**Don't apply this everywhere:** chip-style pill buttons (e.g.
toolbar tap-targets at `border-radius: 999px`) genuinely need a
visible 1px border for affordance. Only swap chrome surfaces —
panels, rails, toolbars, sections — not interactive controls.

**First seen in:** [2026-05-25-board-detail-edit-atmospheric-depth.md](./2026-05-25-board-detail-edit-atmospheric-depth.md)

---

## Pattern: `__label-collapsed` is a multi-role class — scope by parent before styling

On the board-detail edit panels (`md-board-edit-panel`), the same
`__label-collapsed` class is used in two distinct contexts that
visually want **different** treatments:

1. **Panel header caption** ("ACTIONS") — lives inside
   `.md-board-edit-panel__header`. Should match SETTINGS
   (`__title-collapsed`) typography: 10px / 700 / inherited body
   color.
2. **Sub-label captions** ("BOARDS", "SEARCH", "COPY", …) — live
   inside `__filter-toggle`, `__search`, `__tile`. Should sit quieter
   than the header: 9px / 500 / reduced alpha.

Targeting `.md-board-edit-panel--collapsed .md-board-edit-panel__label-collapsed`
alone catches BOTH roles. Always scope by parent:

```scss
/* Header ACTIONS — louder */
.md-board-edit-panel--collapsed .md-board-edit-panel__header .md-board-edit-panel__label-collapsed { ... }

/* Sub-labels — quieter, EXCLUDED from header via specificity */
.md-board-edit-panel--collapsed .md-board-edit-panel__label-collapsed { ... }
```

The 3-class header selector (specificity 0,3,0) beats the 2-class
sub-label selector (0,2,0) without needing `!important`. The same
pattern applies symmetrically to the right rail (`__title-collapsed`
vs `__section-label-collapsed`), but those classes are already
distinct so the parent-scoping trick isn't needed there.

**First seen in:** [2026-05-25-board-detail-edit-collapsed-left-panel-spacing.md](./2026-05-25-board-detail-edit-collapsed-left-panel-spacing.md)

## Pattern: "Shrink to fit" is a per-label content-aware problem, not container-scaling — reach for capabilities.fit_text

**Surface:** any label-fit feature on board buttons (the "Shrink labels
to fit" preference on the board-detail page; the same intent might
surface later on create-board-new or the classic board).

**Symptom:** Reaching for `clamp()` / `min(cqw, pref)` / container
queries to "shrink labels" produces uniform card-width-driven scaling
— every label on a card shrinks together, including 2-character words
that already fit. The toggle either has no visible effect (when the
clamp's preferred value exceeds the user-pref upper bound on typical
card sizes) or shrinks short labels needlessly.

**Root cause:** CSS sees container size, not text length. "Shrink
labels to fit" is a **per-label** problem: only labels whose text
would overflow at the chosen size need to shrink, and each one needs
its OWN measurement. CSS alone can't see how long a given label is.

**Resolution:** The codebase has `capabilities.fit_text(str, font, w,
h, min)` at
[`app/frontend/app/utils/capabilities.js:1815`](../../app/frontend/app/utils/capabilities.js#L1815) —
an offscreen-canvas measurer that walks the font down from a starting
upper bound to a floor and returns the first size where the rendered
text fits within `width * 0.9` (with a height ratio check). Already
used by the legacy classic board at
[`utils/button.js:459`](../../app/frontend/app/utils/button.js#L459)
and the find-a-button suggestions at
[`models/board.js:1519`](../../app/frontend/app/models/board.js#L1519).
For wrapped labels (multi-line spans) DOM measurement is needed
instead — see
[`app/frontend/app/utils/label_fit.js`](../../app/frontend/app/utils/label_fit.js)
for the wrap-aware implementation.

**Transition gotcha:** when label_fit drives inline `font-size` and
the label also has a CSS `transition: font-size`, the iterative
measure loop will visibly flicker through every intermediate size
unless the transition is disabled for the duration of the measure
(see `fitWrapped` for the pattern: set `style.transition = 'none'`
before the measure loop, restore after — the final caller-applied
size still animates).

**First seen in:**
[2026-05-26-shrink-labels-to-fit.md](./2026-05-26-shrink-labels-to-fit.md)

## Pattern: board-detail label surface has TWO elements — `__label` (span) and `__label-input` (input)

**Surface:** the board-detail grid (and any new label feature added to
it).

**Symptom:** A new CSS rule scoped to `.md-board-detail-symbol-card__label`
works in speak/view mode but is silently a no-op in edit mode (or
vice versa). The "live preview" on the edit page doesn't reflect the
new treatment even though the toggle is wired correctly.

**Root cause:** The grid renders the label as TWO different elements
depending on `editMode`:

- `editMode === false` (speak/view): the label is a `<span class="md-board-detail-symbol-card__label">`
  rendered at
  [`templates/components/board-detail-grid.hbs:201`](../../app/frontend/app/templates/components/board-detail-grid.hbs#L201).
- `editMode === true` (edit live-preview): the label is a `label-field`
  component (rendered as `<input class="md-board-detail-symbol-card__label-input">`)
  at
  [`templates/components/board-detail-grid.hbs:195`](../../app/frontend/app/templates/components/board-detail-grid.hbs#L195).

Any styling treatment that affects the label MUST cover both selectors
(or split them — span gets `-webkit-line-clamp`-style multi-line
behaviour, input is intrinsically single-line). The generic
`.md-board-detail-symbol-card__label, .md-board-detail-symbol-card__label-input`
font-family + font-size rules at
[`app.scss:63468`-ish](../../app/frontend/app/styles/app.scss) are the
canonical example of this pairing.

**First seen in:**
[2026-05-26-shrink-labels-to-fit.md](./2026-05-26-shrink-labels-to-fit.md)

---

## Pattern: `organizations.admin` is a singleton boolean, not a normal flag

**Surface:** scripts or seeds that create demo/admin `Organization` rows by hard-coding `admin: true` or `admin: false`.

**Symptom:** Postgres raises `PG::UniqueViolation` on `index_organizations_on_admin`, often with `Key (admin)=(f) already exists` or `Key (admin)=(t) already exists`.

**Root cause:** `db/schema.rb` defines a unique index on `organizations.admin`, so this column behaves like a two-slot singleton marker, not a reusable boolean category. In practice the repo treats `admin: true` as the site admin org and `admin: false` as the demo district org; additional organizations should generally leave `admin` as `NULL`.

**Fix recipe:**

1. Reuse the singleton row with `Organization.find_by(admin: true/false) || Organization.new` instead of blindly inserting a new record.
2. If the script also grants premium supervisors, make sure the org settings include `total_supervisor_licenses`; otherwise `Organization#add_supervisor(..., premium=true)` will raise even after the unique-index issue is fixed.
3. For rerunnable setup scripts, guard relationship grants such as `add_supervisor` with `supervisor?(user)` or the appropriate membership check.

**Evidence:** `db/schema.rb` unique index on `organizations.admin`, `db/seeds.rb` reuse pattern for `admin: false`, and `scripts/create_users.rb` fix on 2026-05-26.

**First seen in:** [2026-05-26-create-users-demo-org-reuse.md](./2026-05-26-create-users-demo-org-reuse.md)

---

## Pattern: settings-backed API flags should be cast before Ember consumes them

**Surface:** Rails JSON serializers that expose values from `settings` or other
schemaless payloads and Ember templates that branch on them with `{{#if ...}}`.

**Symptom:** The UI shows a truthy state such as "Requested" even when the
stored value is the string `'false'`.

**Root cause:** Ruby will happily pass through string values from schemaless
storage, and Ember treats any non-empty string as truthy in template
conditionals. A write path may normalize new records correctly, but legacy or
manually inserted records can still surface string booleans.

**Fix:** In the serializer, cast the flag with
`ActiveModel::Type::Boolean.new.cast(...)` before returning JSON to the
frontend. See `lib/json_api/beta_feedback.rb` for the beta feedback admin case.

**First seen in:** [2026-05-26-beta-feedback-request-virtual-meeting-boolean](./2026-05-26-beta-feedback-request-virtual-meeting-boolean.md)

---

## Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active

**Surface:** large page-specific layout bugs where a component appears to ignore the "current" style block in `app/frontend/app/styles/app.scss`.

**Symptom:** the rendered page keeps an old width, margin, or sizing behavior even though a later selector with the same name looks correct.

**Root cause:** `app.scss` is large enough that the same selector can be defined twice in distant sections. If the earlier block sets a layout property like `width`, a later duplicate block that restyles typography but does not reset that property will still inherit the earlier constraint.

**Fix recipe:** search for all occurrences of the selector before patching, then remove or update the original authoritative rule instead of stacking on a more specific override. For the beta feedback inbox, the first `.la-beta-feedback-admin__body` block set `width: 160px`, while the later block only changed text styles.

**Evidence:** `app/frontend/app/styles/app.scss` duplicate `.la-beta-feedback-admin__body` blocks found on 2026-05-26.

**First seen in:** [2026-05-26-beta-feedback-admin-table-width.md](./2026-05-26-beta-feedback-admin-table-width.md)

---

## Pattern: RESERVED_ROUTES blocks intended system usernames in seeds

**Surface:** `db/seeds.rb` creating users with `User.process_new`, especially the official `lingolinq` vocabulary account.

**Symptom:** Seed creates `lingolinq_1` instead of `lingolinq`; re-running seeds creates duplicate users because `User.find_by(user_name: 'lingolinq')` never matches. Default sidebar board key `lingolinq/yesno` never resolves.

**Root cause:** `LingoLinq::RESERVED_ROUTES` (`config/routes.rb`) is checked in `Processable#generate_unique_key`; reserved names get suffixed. The `example` seed user works because `example` is not reserved.

**Fix:** Remove the username from `RESERVED_ROUTES` only when no dedicated app route needs that path (there is no `get 'lingolinq'` — `/lingolinq` is handled by the generic user profile route). Harden seeds with email fallback and `rename_to` for legacy `lingolinq_*` accounts.

**First seen in:** [2026-05-26-lingolinq-seed-username.md](./2026-05-26-lingolinq-seed-username.md)

---

## Pattern: Touch-device parity for hover-only affordances — thread context through the existing modal path

**Surface:** any UI element that only appears on `:hover` of its
parent — e.g. `.board_with_action:hover .board_action` (the
tile-level remove button on `/u/<user>`). AAC users skew heavily
toward tablets and have no hover state, so any feature reachable
only on hover is unreachable for them.

**Symptom:** A power-user can perform an action (delete a board,
unlike, unshare, untag) but a touch-device user cannot find or
trigger it.

**Fix recipe — DON'T duplicate the action site on the tile; thread
it into an existing modal:**

1. Find a modal the user already has a touch-friendly path to. For
   board cards, that's the Preview modal (`modal.board_preview`)
   reached by tapping the visible Preview chip.
2. Plumb the action's context (label, icon, type, callback) through
   the existing modal-open path. The codebase pattern is to **stash
   on the board model** (`board.preview_locale`, `board.preview_option`)
   — extend with `board.preview_remove = {…}` in the same idiom so
   `modal.board_preview` forwards it as `model.remove`. See
   [board-icon.js:201](app/frontend/app/components/board-icon.js#L201).
3. The parent template that owns the context (here:
   `available-boards-section.hbs`) passes a closure action through
   the component as `removeCallback=(action "remove_board" …
   target=this.boardsCtrl)`. Gate it with `(if permissions.edit …)`
   so contexts without permission yield `undefined` and the modal
   button silently hides.
4. The modal controller's new action just closes itself, then invokes
   the callback. The existing confirm-flow (`confirm-delete-board` /
   `confirm-remove-board`) runs unchanged — no duplication of
   confirmation UX.
5. Keep the hover affordance on the tile. Adding the modal path is
   ADDITIVE — removing the hover button would regress desktop
   power-user workflow.

**Why this works:** the `remove_board` handler already branches on
`remove_type` (`delete` / `unstar` / `unlink` / `untag`) — see
[user/index.js:1310](app/frontend/app/controllers/user/index.js#L1310).
Threading the same `remove_type` through means all four contextual
variants Just Work; you don't have to special-case "delete vs
unlike" anywhere in the modal-side code.

**Anti-pattern to avoid:** Don't reach for `modal.board_preview` from
the boards page and bypass the `board.preview_*` stash. The board
record is already the shared bus between the tile and the modal —
keeping the convention consistent means the modal can be opened from
any board-icon source (board-icon → tile, board-icon → search result,
board-icon → style picker) and the modal correctly shows or hides
the button without each call-site re-wiring it.

**First seen in:** [2026-05-26-preview-modal-delete-button.md](./2026-05-26-preview-modal-delete-button.md)

---

## Pattern: Pass-through actions silently truncate args when the wrapper's signature has fewer named params

**Surface:** any Ember component that acts as a pass-through between
two layers — a child component fires an action with N args, and the
intermediate component re-emits it to a parent. Specifically hit in
[board-detail-grid.js#button_event](app/frontend/app/components/board-detail-grid.js)
which sat between `button-listener` (the source) and the board-detail
controller (the consumer).

**Symptom:** Some pass-through actions work (the ones that happen to
fire with ≤ N args), others silently break in a way that LOOKS like
a state-management bug — UI shows a hint that something happened,
but the actual mutation never runs. Specifically: drag-and-drop on
board-detail showed the swap visual hint during drag, then snapped
back on release. No error in the console; the inner code just hit a
"can't find target" branch and returned silently.

**Root cause anti-pattern:**

```js
// Pass-through wrapper — looks innocent but truncates
button_event(button, event) {
  var action = this.get('buttonEvent');
  if(action) { action(button, event); }   // only forwards 2 args
}
```

When the source fires `('rearrangeButtons', dragId, dropId)`, the
3rd arg disappears at the wrapper. Downstream gets `dropId =
undefined`, `find_button(undefined)` returns null, and the swap is
silently aborted.

**The classic-board sibling [board/index.js:1529](app/frontend/app/controllers/board/index.js#L1529)
had the same wrapper shape but correctly declared 3 params** — so the
exact same drag pipeline worked on classic boards and broke on the
modern intermediate-component path. Side-by-side comparison was what
exposed it.

**Fix recipe:**

```js
// Forward EVERYTHING — use rest args or `arguments`
button_event() {
  var action = this.get('buttonEvent');
  if(action) { action.apply(null, arguments); }
}
```

**Why this is a recurring trap:** Ember closure actions, jQuery
event handlers, and ES function signatures all silently accept too
many args without warning. A pass-through that "looks right" because
it works for the 80% of callers passing 2 args will silently break
the 20% that need 3. There's no compile-time check.

**Anti-pattern to avoid:** Don't declare named params on a wrapper
that's meant to forward arbitrary args. Either match the source's
exact arity (and keep the two in sync forever) or just spread with
`arguments` / rest. The intermediate name `button_event(button,
event)` made it LOOK like it knew what kind of event it was
forwarding — but it's actually forwarding 7+ different action
shapes from button-listener (`buttonSelect`, `buttonPaint`,
`symbolSelect`, `actionSelect`, `rearrangeButtons`, `clear_button`,
`stash_button`). The descriptive param names were a lie about the
contract.

**Diagnostic shortcut for "drag/drop UI hints work but nothing
commits":** the visual hint usually means the source side fired
correctly. The commit-side actions are dispatched through a chain.
Walk the chain end-to-end and check each link's arity. The first
wrapper that truncates is the bug.

**First seen in:** [2026-05-26-board-detail-drag-drop-revert.md](./2026-05-26-board-detail-drag-drop-revert.md)

---

## Pattern: Custom-JS drag works on desktop but not in touch emulation — root cause is `touch-action`, not the JS

**Surface:** any custom pointer-tracking drag system that listens to
`touchstart`/`touchmove` (vs HTML5 native drag) — in this repo, the
`raw_events.js` tracker that powers board-detail edit-mode tile
swaps. Symptom: drag works fine with mouse on desktop, but in
Chrome DevTools device-toolbar with touch ON (or on a real phone),
dragging a tile does nothing — no drag clone, no swap, often the
page just scroll-pans instead.

**Root cause:** modern Chrome (≥ v56) registers document-level
`touchstart`/`touchmove` listeners as **passive by default** unless
explicitly opted out with `{passive: false}`. jQuery's
`.on('touchmove', …)` does *not* set `{passive: false}` for
delegated multi-type bindings (the project uses jQuery 3.7.1). So
`event.preventDefault()` inside the touchmove handler is silently
ignored, and the browser claims the touch as a scroll/pan gesture
before the JS drag pipeline gets a chance to start. The drag clone
never appears.

The fix is **declarative, not procedural**: set
`touch-action: none` (or `touch-action: manipulation`) on the
draggable element in CSS. That tells the browser "do not interpret
touches on this element as scroll/pan/zoom — let JS handle them
entirely." The browser never tries to claim the gesture, so the
passive-vs-non-passive listener question never matters.

**Where to add the rule:** scope it to the element that has
`draggable="true"`, NOT to a parent edit-mode container. In
board-detail-grid the cell template flips
`draggable={{if this.editMode "true" "false"}}`, so
`.md-board-detail-grid__cell[draggable="true"]` is automatically a
free edit-mode selector — speak-mode cells (`draggable="false"`)
still get the browser default `touch-action: auto`, preserving
long-press, dwell, and gaze gestures that *need* the default. The
existing edit-mode-only rule at
[app.scss:68041](app/frontend/app/styles/app.scss#L68041) is the
right home; add `touch-action: none` into it, don't stack a new
selector.

**Diagnostic shortcut:** when "X works on desktop but not in touch
emulation," check `touch-action` first. Run
`grep -rn "touch-action" app/frontend/app/styles/` — if it returns
zero matches across the whole project, every gesture on every
element is at the mercy of the browser default. That alone is
usually the bug.

**Anti-pattern to avoid:** do NOT try to fix this in JS by
monkey-patching jQuery's special event opts or by replacing the
delegated `.on('touchmove', …)` binding with raw
`addEventListener('touchmove', …, {passive: false})`. The CSS
escape hatch is a single declarative line, scoped exactly to where
it's needed, and survives jQuery upgrades.

**First seen in:** [2026-05-27-board-detail-drag-touch-emulation.md](./2026-05-27-board-detail-drag-touch-emulation.md)

---

## Pattern: `!supporter_role` is the canonical communicator gate — never invent a `communicator_role` boolean

**Surface:** any UI flow that needs to show/hide based on whether
the current user is a *supporter* (parent/therapist/teacher building
boards for someone else) vs a *communicator* (the AAC user
themselves). The mistake pattern is reaching for a
`currentUser.communicator_role` boolean or a `(eq role "communicator")`
check — those don't reliably catch the case.

**Why it's a trap:** the canonical role check on the User model is
`preferences.role == 'supporter'` exposed as the
`sessionUser.supporter_role` boolean computed property. Communicators
AND users who haven't picked a role yet (`role == null` or
`'unspecified'`) both fall into the `!supporter_role` branch — this
matches how the backend treats unspecified-as-communicator
(`User#supporter_registration?`). A `communicator_role` label string
exists in some surfaces ([caseload.hbs:202](app/frontend/app/templates/caseload.hbs#L202))
but is *not* the canonical guard — gating on it misses the
unspecified-role population entirely.

**How to apply:**

```hbs
{{!-- Hide from communicators (incl. unspecified-role users) --}}
{{#if this.appState.sessionUser.supporter_role}}
  ... supporter-only UI ...
{{/if}}

{{!-- Compound: only show when supporter AND has supervisees --}}
{{#if (and this.show_user_options this.appState.sessionUser.supporter_role)}}
  ... supporter-with-supervisees UI ...
{{/if}}
```

In JS / controllers:

```js
if(this.appState.get('sessionUser.supporter_role')) { ... }
```

**Why `sessionUser` not `currentUser` in early-boot components:**
in components mounted before full hydration (e.g.
`create-board-new`), `appState.currentUser` can be `undefined`
during boot while `appState.sessionUser` is the source the
supporter-default observers watch ([create-board-new.js:88-94](app/frontend/app/components/create-board-new.js#L88-L94)).
Components that already use `sessionUser` elsewhere should stay
consistent and use `sessionUser.supporter_role` for the gate too.
For dashboard / settled-route components,
`currentUser.supporter_role` is fine and is the more common pattern
elsewhere in the codebase.

**Compound gates: prefer inline `(and …)` over a new computed**
when the condition is two-property and the semantics are obvious at
the call site. A new `show_for_supporter_prompt` computed adds a
property to maintain and hides intent behind a name; `(and
this.show_user_options
this.appState.sessionUser.supporter_role)` is self-documenting and
matches the existing codebase convention
([organization.hbs:7,11](app/frontend/app/templates/organization.hbs#L7),
[application.hbs:10](app/frontend/app/templates/application.hbs#L10)).

**Diagnostic shortcut:** when reviewing a "hide-from-communicators"
ask, the question is NOT "does a communicator flag exist?" — it's
"is the existing supporter check in place?" If the surface is
ungated or uses a different check, the unspecified-role case is
almost certainly leaking through.

**First seen in:** [2026-05-27-create-board-communicator-for-someone-else.md](./2026-05-27-create-board-communicator-for-someone-else.md)

---

## Pattern: Removing a UI feature is incomplete until every coupled site is removed

**Surface:** any "remove feature X from page Y" task, whether the
feature is a form input, a button, a modal, or an entire route. The
failure mode is identical across all of them — the obvious
visible-site removal lands, but coupled debris stays behind, gets
caught in code review, and re-opens the PR.

**The coupled sites to check** (a UI removal is incomplete until
every applicable one is addressed):

1. **The control / input / button itself.** The obvious site.
2. **Preview / hint / help-text mentions of the control elsewhere
   on the same page.** Collapsed-toggle previews, helper bullets,
   "this section includes…" lists, onboarding tips, empty-state
   copy. Removing the control without removing its description
   leaves the description lying about what the page contains. The
   create-board-new License removal had one of these
   ([create-board-new.hbs:1152 "advanced_hint_license"](app/frontend/app/templates/components/create-board-new.hbs)) —
   easy to miss because it lives 40 lines away from the actual
   control.
3. **Conditional render blocks gated on the removed control's
   state.** A sub-form, follow-up question, or "if X then show Y"
   block that only appeared when the user picked a non-default
   value. With the control gone, the user can't change the
   default, so the conditional becomes dead template code that
   will never render but still ships in the bundle. The
   create-board-new License removal had one of these
   (`{{#if this.attributable_license_type}}` block for Author /
   Author URL fields).
4. **Controller / component members reachable only from the
   removed UI.** Computeds, actions, options arrays, helper
   methods whose sole consumer is the deleted template. Leaving
   them in place is exactly the failure pattern Scot flagged on
   PR #284 as a *Critical* finding — orphaned `boardPicker` state
   and tests after the entry-point UI was removed. The fact that
   these members "do nothing" because nothing observes them does
   not exempt them: they are dead code, and reviewers will (rightly)
   refuse to merge a PR that ships dead state described as removed.
5. **Tests that exercised the removed flow.** Specs that asserted
   on the now-gone behavior should be deleted (if the behavior is
   gone) or rewritten (if the behavior moved). Tests that still
   reference the removed identifier are a stronger signal of
   incomplete removal than the production code itself, because
   tests rarely error noisily — they just silently pass against
   the wrong thing or get skipped. The `boardPicker` cleanup is
   the canonical example: two full `describe('openBoardPicker', …)`
   blocks in [application-test.js](../app/frontend/tests/controllers/application-test.js)
   asserted on `boardPickerBoards` / `boardPickerLoading` state
   that the controller no longer holds. CI was green; the tests
   were neither failing nor catching regressions — they were just
   no-op'ing past the missing action and timing out or passing on
   a Jasmine `waitsFor` quirk. Deleted in #2 cleanup. When the
   behavior moved (favorites-first sort moved into
   `user/index.js`'s "Mine-tab sort"), the *equivalent* coverage
   for the new code site is a separate concern — do not
   silently widen the orphan-cleanup PR to also write replacement
   tests; flag the coverage gap and let it land in its own scope.
6. **Default model state when the field is no longer user-
   editable.** If the user could previously change a field but
   now can't, the model's init-time default becomes the field's
   permanent value. Verify (a) the default is sane (privacy-safe,
   backend-accepted), and (b) any save-flow code that consumed
   the field still does sensible work with the locked value. In
   the License case, `license: {type: 'private'}` at init keeps
   every new board on the private default and the
   `copyright_notice_url` stamping at save time still produces a
   valid private-license URL.
7. **Comments that name the removed identifiers.** Well-intentioned
   "this used to live here" documentation that lists the orphan
   names (e.g. `// removed: boardPickerVisible, boardPickerTab,
   boardPickerBoards, openBoardPicker, …`) is grep-bait. A
   reviewer auditing with `grep -rn "boardPicker"` cannot
   distinguish documentation-of-removal from leftover-state, and
   will (rightly) flag it as Critical even when the comment is
   technically harmless. Two safe options: (a) delete the comment
   entirely — git history preserves the archaeology of the
   removal at the original PR; (b) rewrite the comment to
   describe the architectural change without naming the specific
   orphan identifiers (e.g. "this controller previously owned a
   parallel My Boards modal implementation; replaced 2026-05-23
   by a route transition"). The `boardPicker` cleanup did (a) for
   the large block comment and (b) for the smaller docstring on
   `openMyBoards` — the architectural docstring was worth
   preserving with sanitized wording; the long inventory comment
   was pure grep-noise and got removed entirely.

**Tension with the "don't refactor" rule resolved:** CLAUDE.md says
"don't introduce abstractions beyond what the task requires" — but
deleting orphaned controller code that survives a UI removal is
COMPLETING the removal, not refactoring. The mental check: "if I
ran `grep` for the removed identifier across the codebase RIGHT
NOW, would any results come back?" If yes, the removal is not
done. If they're in another consumer (e.g. the legacy `new-board.js`
also has a `setLicenseType` action — different component, separate
flow), that's a different scope and stays untouched.

**Naming-overload trap:** When grepping for the removed identifier,
watch for sibling identifiers that are similar but distinct and
SHOULD survive. The `boardPicker` cleanup had three overlapping
spellings: `boardPicker` (camelCase, on application controller,
removed) ≠ `board-picker` (kebab-case Ember component, kept,
used by onboarding) ≠ `open_board_picker` (snake_case action on
board-detail, kept, opens an in-page modal via a different code
path). All three would match a careless `grep -i "boardpicker"`.
Disambiguate before deleting; running the same grep with the
exact original casing of the removed identifier ONLY is the
fastest way.

**Diagnostic shortcut** before declaring a removal complete: grep
for the removed UI's specific identifiers (the CSS class, the
action name, the i18n key, the computed name) across the whole
repo. If you find references in:
- The same file → those are sites #2 or #3 — remove them.
- The component's JS controller → site #4 — remove.
- Tests in `app/frontend/tests/` → site #5 — update or remove.
- Comments anywhere → site #7 — remove or sanitize.
- Other components / templates with DIFFERENT casing of a
  similar name → those are likely separate consumers (see
  naming-overload trap above), leave them.

**First seen in:**
- [2026-05-27-create-board-remove-license.md](./2026-05-27-create-board-remove-license.md) — License removal from create-board-new (3 template sites + 4 controller members)
- [2026-05-27-application-boardpicker-orphan-cleanup.md](./2026-05-27-application-boardpicker-orphan-cleanup.md) — boardPicker orphan cleanup (2 test `describe` blocks + 3 comment blocks in 3 different files); also surfaced sub-lesson #7 (comments-as-grep-bait) and the naming-overload trap

---

## Pattern: "Silent wrong behavior" is the modal failure mode in this codebase — assume it, probe for it

**Surface:** every class of code change in this repo. This is a
meta-pattern observed across the LEARNINGS doc itself: **eleven**
separate pattern entries describe failure modes whose defining
characteristic is "the code runs without error but does the wrong
thing":

- Pass-through actions silently truncate args
- Touchmove preventDefault silently ignored when listener is passive
- Settings-backed API flags silently truthy-evaluate string "false"
- Duplicate selectors in app.scss silently let the later copy win
- `__label-collapsed` silently styles wrong when scoping isn't tightened
- Tests rarely error noisily — they silently pass against the wrong code path
- Stale Ember dev bundle silently serves yesterday's behavior
- HTML5 drag silently no-ops when nested `<button>` children intercept
- SVG gradient IDs silently mangled by Sprockets in production but not dev
- "Couldn't find a button!" silently aborts swap on undefined drop_id
- Removing a UI feature silently leaves orphan refs in JS/tests

**Why it's a trap:** every one of these passes a green build. CI is
green, the dev server reloads cleanly, the manual smoke test works
in the obvious case. The failure only shows up in (a) a less-obvious
case, (b) production, (c) review, or (d) months later when someone
else maintains the code. There is no audible signal — the code is
running, just not doing what the author thought.

**How to apply** — when reviewing your own code (the [Tier 3
adversarial sweep](../pre-merge-audit-checklist.md#tier-3--adversarial-sweep-red-team-your-own-pr)
is built around this), the question is not "does this look right?"
but "**if this were doing the wrong thing right now, what would I
see?**" Often the answer is "nothing" — and that's the finding.
Specific probe techniques:

1. **Test for the negative case, not just the positive.** A test
   that asserts `expect(result).toEqual(expected)` doesn't catch
   "result happened to equal expected for an unrelated reason."
   Run the test against `main` before applying your change — if
   it passes both ways, it isn't testing your change.
2. **`console.log` the actual values at every joint.** When you
   suspect silent wrong behavior, instrument the joins
   (function entry, function exit, action dispatch, observer
   fire) and watch what *actually* flows through. Often the
   stated parameter name and the actual passed value diverge.
3. **Production-build before merging visual changes.** SVG, CSS
   data URIs, dynamic class names — run `ember build
   --environment=production` and inspect the artifact, not just
   the dev-mode rendering.
4. **Read the deleted code as carefully as the added code.** A
   silent-wrong-behavior class hides in implicit guarantees that
   used to exist (see [Removing a UI feature is incomplete](#pattern-removing-a-ui-feature-is-incomplete-until-every-coupled-site-is-removed)
   pattern).
5. **Trust the codebase's conventions over plausible-sounding
   alternative APIs.** Many of the silent failures came from
   using `appState.currentUser` where `appState.sessionUser` was
   correct, or `communicator_role` where `!supporter_role` was
   correct, or `function(button, event)` where
   `function() { ...arguments }` was correct. The wrong API
   reads sensibly until you trace why nothing happens.

**Diagnostic shortcut:** when something "doesn't work" in this
codebase, do not assume it errored and you missed the error.
Assume it ran successfully against the wrong inputs/state and
produced the wrong outputs. Probe accordingly.

**Maintenance note:** as new "silent wrong behavior" patterns get
distilled into individual LEARNINGS entries, the bullet list at
the top of this pattern should be updated to keep an accurate
count. The list is itself the evidence that this meta-pattern is
real and recurring.

**First seen in:** distilled while writing [`docs/pre-merge-audit-checklist.md`](../pre-merge-audit-checklist.md)
Tier 3 (adversarial sweep) — the §3.0 mindset shift section names
this as the dominant failure-mode class.

---

## Pattern: `i18n_generator.rb` is a static parser — dynamic `{{t bound.prop key=bound.prop}}` keys are invisible to it

**Surface:** any catalog-driven UI that renders rows from a JS
constant via dynamic i18n bindings — Customize Menu, accessibility
preferences, language switchers, anything with a `SOME_ITEMS = [{
default_label, label_key }, ...]` shape and a template loop using
`{{t default_label key=label_key}}`. The mistake pattern is
assuming the runtime-correct dynamic resolution also means the
keys ship to non-English locales.

**Why it's a trap:** the dynamic helper renders cleanly at runtime
(the `t` helper looks up `label_key` against `app_state.i18n_strings`,
which DOES have the key when the key is present elsewhere in
en.json from a different literal-reference). So the UI looks right
in English. The keys missing from en.json silently fall through to
their default-label string. Non-English locales never get the
translated string because `i18n_generator.rb` couldn't see the key
to add it to `en.json` in the first place.

**Root cause** (verified in [`i18n_generator.rb:148-180`](../i18n_generator.rb)):
the parser walks `{{t ` or `(t ` then expects a QUOTED literal as
the default label (line 154: `line.index(/\"|\'/, idx)`). When the
next token is `group.section.default_label` (a bound property, not
a quoted string), `line.index` returns `nil`; the whole extraction
branch is skipped. Same for the `key=...` lookup at line 172 —
must be a literal `key='...'` or `key="..."`.

**How to apply** — when adding a catalog-driven dynamic-i18n UI:

1. Build the catalog of `{ id, label_key, default_label }` rows as
   normal.
2. Render via `{{t default_label key=label_key}}` as normal — this
   is correct at runtime.
3. **ALSO** add a no-op extractor function in the SAME JS file as
   the catalog constants, listing one literal `i18n.t('key', "Default")`
   call per row. The function is never called at runtime; it exists
   purely for the parser. Convention adopted in
   [`board-detail.js#L73-L113`](../app/frontend/app/controllers/user/board-detail.js)
   for the Customize Menu — the function is named
   `_<feature>_i18n_extractor_no_op` and carries a comment
   explaining its purpose.
4. Add a `// eslint-disable-next-line no-unused-vars` directive so
   the function doesn't trigger lint warnings.
5. When you add a new row to the catalog, ALSO add a matching
   `i18n.t(...)` line to the extractor function. The rule to write
   in CLAUDE.md / PR description: "if you touch SOME_ITEMS, touch
   the extractor too."

**Diagnostic shortcut:** if a catalog-driven UI works fine in
English but a non-English locale shows the English default-label
string instead of the localized one, suspect the dynamic-key
extraction failure first. Run `ruby i18n_generator.rb` and check
its output for missing strings — TOTAL MISSING is the parser's
own count of keys it found but couldn't pair with a string.

**Important: `ruby i18n_generator.rb` without `--generate` only
scans and reports; it does NOT modify `en.json`.** To actually
write extracted strings to en.json, pass `--generate` — but the
generator refuses to write when ANY duplicates exist in the
extracted strings hash (see [`i18n_generator.rb:266-267`](../i18n_generator.rb)).
If there's a pre-existing duplicate in the repo (e.g. one team
added `loading_board_preview` with "Loading board preview..." in
one template, another added it with "Loading Board Preview..." in
another), `--generate` is blocked for everyone until the dup is
resolved. Workaround: hand-add the missing keys to `en.json`
directly in the correct group; document the workaround in the
task log; flag the pre-existing dup for whoever owns that surface.

**First seen in:** [2026-05-27-customize-menu-flag-and-i18n.md](./2026-05-27-customize-menu-flag-and-i18n.md)
— the Customize Menu (PR #284) shipped with 17 menu-item keys + 6
section-header keys all behind dynamic bindings. ~20 keys happened
to be present in en.json from literal references elsewhere, so the
English UI looked right. 3 keys (`translate`, `switch_language`,
`share_and_print`) AND 5 customize-panel-specific UI strings
(`customize_menu`, `customize_menu_hint`, `menu_short`,
`hidden_word`, `shown_word`) were missing. Scot's #4 pre-merge
finding.

---

## Pattern: Feature-flag-gated mutating actions need BOTH a template gate AND a JS action gate (defense-in-depth)

**Surface:** any new feature where a `{{#if app_state.feature_flags.X}}`
in the template hides a UI control that triggers a mutating action
(persists to user.preferences, mutates app state, writes to the
server). Common shapes: new toggles in a preferences panel, new
options in a customize / settings dialog, new buttons on board-edit.

**Why a template gate alone is insufficient:** the `{{#if}}` hides
the UI control from view but does NOT make the underlying action
unreachable. The action remains:
- Callable via the browser dev console: `App.lookup('controller:user/board-detail').send('set_speak_menu_item_hidden', 'my_boards', true)`
- Callable via a custom client (anyone running their own Ember
  app pointing at the same backend, or replaying an XHR captured
  earlier)
- Callable via action chaining from a different code path that
  IS exposed to the user

For pure-UI features (e.g. a new chart that doesn't write back),
the template gate is enough — there's no action to bypass. But
for ANY action that mutates state, you need BOTH gates.

**How to apply** — when adding a flag-gated mutating feature:

1. **Template gate** — `{{#if this.app_state.feature_flags.X}}…{{/if}}` around the UI control AND any visual indicator that the feature is in play.
2. **JS action gate** — at the very top of the action handler, before any mutation:
   ```js
   set_X: function(...) {
     if(!this.get('app_state.feature_flags.X')) { return; }
     // ... rest of handler
   }
   ```
3. **Comment the JS gate** to point at the template gate — future maintainers should not "clean up" the JS gate thinking it's redundant. The convention used in [`board-detail.js#L6280-L6286`](../app/frontend/app/controllers/user/board-detail.js):
   ```js
   // Defense-in-depth alongside the template gate at
   // templates/user/board-detail.hbs ({{#if app_state.feature_flags.customize_menu}}).
   // Template gate hides UI but doesn't make the action unreachable
   // (debug console, custom client, action chaining). Both gates needed.
   // Per pre-merge audit §3.5 (Trust boundary analysis).
   if(!this.get('app_state.feature_flags.customize_menu')) { return; }
   ```
4. **Server-side gate** (when the action persists to the server and the
   action's effect would be sensitive or visible to other users) —
   the controller / model accepting the persist call should ALSO
   verify the feature is enabled for the calling user. For things
   like `user.preferences.X` writes, the action's effect is
   self-only (the user mutating their own preferences), so the
   server-side gate is less critical — but it's a third line of
   defense and removes the bypass path entirely.

**Per the new pre-merge audit doc** [§3.5 Trust boundary analysis](../pre-merge-audit-checklist.md#35-trust-boundary-analysis):
"a hidden UI doesn't mean the action is unreachable. Server-side
enforcement is the only line that matters when the bypass is
worth attempting." For feature-flag-controlled UX features the
threat is low (flag bypass = user opts into beta UX they could
opt into anyway via per-user flag), but the defense-in-depth
discipline matters for the cases where it IS the security boundary.

**First seen in:** [2026-05-27-customize-menu-flag-and-i18n.md](./2026-05-27-customize-menu-flag-and-i18n.md)
— Scot #1 pre-merge finding called out Customize Menu shipping
"enabled-for-all with no feature flag." The fix added both the
template gate AND the JS action gate. The JS gate is the part
that's easy to omit because "the UI doesn't show, so the action
won't fire" feels true — but isn't.

---

## Pattern: Canvas drawing has different constraints than CSS — translate the design language, don't import it

**Surface:** any UI rendered into a `<canvas>` element via the 2D
context API instead of being styled with CSS. In this repo, the
board preview canvas ([board-preview-canvas.js](../app/frontend/app/components/board-preview-canvas.js))
is the primary instance — it draws the entire board grid pixel-by-pixel
including any UI affordances on top (offline badge, missing-image
fallback, etc.).

**Why it's a trap:** the rest of the app uses the modern design
language documented in [Atmospheric depth surface formula](#pattern-atmospheric-depth-surface-formula--replace-hard-1px-borders-with-layered-shadows--glass-veil)
— hairline border + glass veil + three-tier shadow + inset top
highlight, expressed as CSS `background:`, `border:`, `box-shadow:`,
and pseudo-element layers. Canvas has **none of these properties
as direct primitives.** The instinct is to either skip the modern
styling (canvas UI ends up looking 2010s) or to import a heavy
3D-graphics-library to fake it. Both wrong.

**How to translate** (one column per CSS feature):

| CSS feature | Canvas equivalent | Notes |
|---|---|---|
| `border-radius: 999px` | `trace_rounded_rect(ctx, x, y, w, h, h/2)` using moveTo + arc + lineTo | Path-based, not `roundRect` (see Cordova-WebView pattern below) |
| `background: linear-gradient(180deg, top, bottom)` | `var g = ctx.createLinearGradient(x, y, x, y+h); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fill();` | Same syntax shape, same gradient direction conventions |
| `border: 1px solid rgba(…)` | After fill: `ctx.lineWidth = 2; ctx.strokeStyle = rgba; ctx.stroke();` | Remember 2× DPI — 1 CSS-px = 2 canvas-internal-px |
| `box-shadow: 0 1px 2px, 0 8px 24px, 0 24px 60px` (three-tier stack) | **Cannot stack.** `ctx.shadowBlur` only supports ONE shadow per drawing op. Approximate by picking the broadest tier (the ambient haze): `ctx.shadowOffsetY = h * 0.18; ctx.shadowBlur = h * 0.75; ctx.shadowColor = rgba; ctx.fill();` then reset shadow to `'rgba(0,0,0,0)'` before stroking | This is the biggest gotcha. Don't try to call `fill()` three times with different shadows — they layer additively and look muddy |
| `inset 0 1px 0 rgba(255,255,255, .6)` (inset top highlight) | Trace a path along the top edge (or top arc for pills) 2px inside the border and stroke at low alpha | The "inset" is conceptual on canvas — you're just drawing a shorter stroke inside the border path |
| `font-weight: 600` + system font stack | `ctx.font = '600 ' + px + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';` | Quote-wrap any family names with spaces |
| Light/dark mode | Branch your palette at the top of the draw function, pass the right palette to each draw helper | Mirrors the existing `palette = dark ? {…} : {…}` pattern in this file |

**Order of operations matters.** Canvas drawing is destructive
(later operations overwrite earlier ones in their pixel region).
For overlays / badges drawn on top of dynamically-loaded content
(e.g. cell images that arrive via `img.onload` AFTER the badge would
normally be drawn), you must draw the overlay AFTER all async draws
have settled. The board-preview-canvas does this via the
`maybe_emit_canvas_ready` gate: draw the badge IN that handler so
it fires only when `pending == 0`.

**Diagnostic shortcut:** if your canvas UI looks "flat" or "2010s"
compared to the rest of the app, you skipped the glass-veil gradient
+ inset highlight + shadow steps. The hairline border alone is
load-bearing for the rounded-corner definition but doesn't carry
the depth feel.

**First seen in:** [2026-05-27-board-preview-offline-indicator.md](./2026-05-27-board-preview-offline-indicator.md)
— offline badge + per-cell image fallback for Scot #5 review.

---

## Pattern: `context.roundRect` is a Cordova-WebView landmine — use path-based rounded-rect tracing

**Surface:** any canvas drawing code that wants rounded corners.
The 2D context API has `context.roundRect(x, y, w, h, radii)` as
of Chrome 99 / Safari 16, which is what you'd reach for first.

**Why it's a trap:** the installed iOS/Android app ships via
Cordova, which uses the system WebView. Older Android devices
and locked-down iOS WKWebView versions still in the wild don't
have `roundRect`. Production crashes with `TypeError:
context.roundRect is not a function` or just silently renders no
shape (depending on the WebView's error-recovery mode). Looks
fine in dev (modern Chrome), breaks in the installed app — the
same shape as the [SVG gradient IDs mangled by Sprockets](#pattern-svg-gradient-id-refs-inside-css-data-uris-mangled-by-rails-sprockets-in-production)
trap, just shifted from build pipeline to runtime browser.

**How to apply** — use a path-based helper. The canonical recipe
in this repo (extracted to a helper inside
[board-preview-canvas.js](../app/frontend/app/components/board-preview-canvas.js)):

```js
var trace_rounded_rect = function(ctx, rx, ry, rw, rh, r) {
  r = Math.min(r, rw / 2, rh / 2);
  ctx.beginPath();
  ctx.moveTo(rx + r, ry);
  ctx.lineTo(rx + rw - r, ry);
  ctx.arc(rx + rw - r, ry + r, r, -Math.PI / 2, 0);
  ctx.lineTo(rx + rw, ry + rh - r);
  ctx.arc(rx + rw - r, ry + rh - r, r, 0, Math.PI / 2);
  ctx.lineTo(rx + r, ry + rh);
  ctx.arc(rx + r, ry + rh - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(rx, ry + r);
  ctx.arc(rx + r, ry + r, r, Math.PI, 1.5 * Math.PI);
  ctx.closePath();
};
```

Caller follows with `ctx.fill()` or `ctx.stroke()` as needed.
For full-pill shapes pass `r = h / 2` (the helper clamps to half
of the shortest edge anyway).

**Diagnostic shortcut:** any new canvas drawing PR should test in
production-mode Cordova build (`rake extras:mobile`) on a real
device or a sufficiently old WebView emulator, NOT just in dev
Chrome. The §3.9 pre-merge audit check covers this category of
trap; this is the most common instance.

**First seen in:** [2026-05-27-board-preview-offline-indicator.md](./2026-05-27-board-preview-offline-indicator.md)
— used for both the offline-badge pill and the per-cell missing-image
placeholder.

---

## Pattern: Every `belongs_to`/`has_one` access in a `JsonApi::*` serializer is a potential N+1 — eager-load it at the list-endpoint controller

**Surface:** any list endpoint (`#index`, `#search`, paginated feeds)
that renders via `JsonApi::*.paginate(...)`. The serializer's
`build_json(record, args)` is a flat method that touches whatever
record properties a single-record response needs; it doesn't
distinguish "one record" from "list-of-25-records." So the LIST
controller is solely responsible for pre-loading every association
the per-record `build_json` touches.

**Why it's a trap:** the serializer change in PR N is often a
one-line addition (`json['parent_board_key'] = board.parent_board.key`)
that works correctly for the show endpoint where the controller does
`Board.find(...).parent_board` once. But the index endpoint pages
through 25 boards and calls `build_json` for each — without
`.includes(:parent_board)` that's 25 extra SELECTs. The N+1 doesn't
show up in feature tests (response body is correct, status is 200,
no error logs); it shows up in production tail latency, in Resque
worker time, and in slow-query log warnings. Often silent for
months before someone notices.

**Diagnostic recipe** (verified on Scot #6's `board.parent_board`
N+1):

1. **Read every `build_json` access pattern.** Inside the
   serializer's main method, list every `record.<association>` and
   `record.<method_that_queries>`. Build a small whitelist of
   "this is a database round-trip per record" vs "this is a column
   read."
2. **Check the controller's `.includes(...)` covers every
   association in the whitelist.** Anything in the whitelist that
   isn't in the includes is a guaranteed N+1.
3. **Lock it in with a query-count regression spec.** See the
   companion pattern below — without the spec, the regression can
   silently re-land in a future PR.

**Anti-pattern to avoid:** "I'll just eager-load `:everything`" via
nested includes (`Board.includes(parent_board: { user: :supervisors }).all`).
The actual `build_json` typically only needs 1-2 associations; over-
including loads unnecessary rows into memory + slows the LEFT OUTER
JOIN. Walk the serializer methodically and include only what's
actually touched.

**Diagnostic shortcut for "is my list endpoint N+1ing?":**

```ruby
# In Rails console (or rails server with logger), tail SQL while
# hitting the endpoint manually:
ActiveRecord::Base.logger = Logger.new(STDOUT)
# Then make the request. Count repeated `SELECT * FROM "boards"
# WHERE "boards"."id" = X` or similar single-row lookups.
# 1-2 is fine (joins, auth). 10+ is an N+1.
```

**First seen in:** [2026-05-27-boards-index-n-plus-one.md](./2026-05-27-boards-index-n-plus-one.md)
— Scot #6 review caught `boards_controller#index` missing
`.includes(:parent_board)` while `lib/json_api/board.rb:91` accessed
`board.parent_board` unconditionally. ~25 extra SELECTs per paginated
response at default per_page=25.

---

## Pattern: Query-count specs must be verified to FAIL against the broken state — otherwise they're no-ops

**Surface:** any test that asserts an upper bound on number of
queries / API calls / external side-effects. The pattern with the
most regression-prevention value but the highest write-only-and-
forget risk.

**Why it's a trap:** A query-count spec that "expects `count <= 4`"
is mechanically meaningless if the broken code would ALSO produce
`count <= 4`. The author writes the spec to lock in the fix, the
spec stays green in CI forever, but the spec actually doesn't
test what it claims. The threshold was set wrong, OR the subject
matter is so trivial it never hits the bound, OR a different
unrelated thing happens to keep the count low.

**This is a specific instance of [Silent wrong behavior](#pattern-silent-wrong-behavior-is-the-modal-failure-mode-in-this-codebase--assume-it-probe-for-it)
applied to the test suite.** Tests pass for the wrong reason.

**How to apply** — verify the spec ACTUALLY catches the regression:

1. **Land the fix.**
2. **Land the spec.**
3. **`git stash push -- <the fix file>`** to temporarily revert just
   the fix (NOT the spec).
4. **Run the spec.** Expected: it should FAIL with the count above
   the threshold.
5. **`git stash pop`** to restore the fix.
6. **Re-run the spec.** Expected: it should PASS.

If step 4 doesn't fail, the spec is a no-op. Either the threshold
is too loose (raise it until step 4 fails, then nudge down by 1 for
headroom), or the test data isn't triggering the broken path (add
more records / hit the right code path).

**Document the verification in the task log** so future maintainers
can re-verify when refactoring nearby code. The task log should
record:
- Pre-fix count (e.g. "6 queries without eager-load")
- Post-fix count (e.g. "3 queries with eager-load")
- Threshold chosen (e.g. "≤ 4, one query of headroom")

**First seen in:** [2026-05-27-boards-index-n-plus-one.md](./2026-05-27-boards-index-n-plus-one.md)
— Scot #6 regression spec for boards_controller#index. Threshold
of 4 catches the 6-query broken state while tolerating slight
variation across Rails versions / auth-lookup query count.

---

## Pattern: For component tests in this codebase, use legacy Jasmine — not `setupApplicationTest` + Mirage (which hangs)

**Surface:** any new `app/frontend/tests/**/*-test.js` file. The
codebase has two test styles in use; ONE of them works reliably
right now and the OTHER has open infrastructure issues.

**The two styles:**

1. **Legacy Jasmine** (USE THIS) — wraps QUnit via
   [`tests/helpers/jasmine.js`](../app/frontend/tests/helpers/jasmine.js).
   Test files start with:
   ```js
   import { describe, it, expect, beforeEach, afterEach,
            waitsFor, runs, stub } from 'frontend/tests/helpers/jasmine';
   import 'frontend/tests/helpers/ember_helper';
   import EmberObject from '@ember/object';

   describe('SomeController', 'controller:foo/bar', function() {
     var testOwner;
     beforeEach(function() { testOwner = this.owner; });
     it('does the thing', function() {
       var c = testOwner.lookup('controller:foo/bar');
       c.set('foo', 'bar');
       expect(c.get('foo')).toEqual('bar');
     });
   });
   ```
   ~99% of existing tests use this style. Works.

2. **Modern Ember+QUnit** (AVOID for now) —
   ```js
   import { setupApplicationTest } from 'ember-qunit';
   import { setupMirage } from 'ember-cli-mirage/test-support';
   import { visit } from '@ember/test-helpers';
   QUnit.module('Acceptance | foo', function(hooks) {
     setupApplicationTest(hooks);
     setupMirage(hooks);
     QUnit.test('thing', async function(assert) { await visit('/'); ... });
   });
   ```
   The newer file [`tests/acceptance/board-detail-empty-state-test.js`](../app/frontend/tests/acceptance/board-detail-empty-state-test.js)
   uses this — but its own TODO comment says tests **hang on `visit()`**
   because the app's auth/session bootstrap doesn't complete under
   Mirage's defaults. Three of the four tests in that file are
   `QUnit.skip(...)`.

**How to apply:**

- For component tests: `testOwner.factoryFor('component:my-component').create()`
  returns an instance you can `.set()` properties on and call methods on.
- For controller tests: `testOwner.lookup('controller:user/foo')`.
- For async assertions: `waitsFor(function() { return done; })` followed
  by `runs(function() { expect(...) })`.
- For service stubs: `controller.set('persistence', EmberObject.create({...}))`.

**When to revisit the modern style:** when someone writes a
`setupAuthenticated(hooks)` helper or stubs session/auth in Mirage
config so `visit()` resolves. Until then, sticking with the legacy
style is not a stylistic preference — it's the only style that runs.

**First seen in:** [2026-05-27-pr281-test-coverage.md](./2026-05-27-pr281-test-coverage.md)
— Scot #3 test-coverage backfill added 4 new test files, all using
the legacy Jasmine style.

---

## Pattern: Canvas component tests use a context-recorder stub, not pixel inspection

**Surface:** any Ember component that draws to a `<canvas>` via the
2D context API. In this repo, [`board-preview-canvas.js`](../app/frontend/app/components/board-preview-canvas.js)
is the primary instance. Future canvas components (audio visualizers,
custom chart renders, etc.) face the same testing challenge.

**The pitfall:** trying to assert on actual rendered pixels is
fragile (rendering varies across browsers, font availability, GPU
versions) and slow (requires real DOM + canvas). Most assertions of
the form "this component draws X" can be expressed as "this
component calls `ctx.method(args)` with the right args."

**The recorder pattern** — replace the canvas's 2D context with a
stub that records every method call + every property assignment.
Then assert on what got recorded:

```js
function buildContextStub() {
  var calls = [];
  var styles = [];
  var record = function(name) {
    return function() {
      calls.push({ name: name, args: Array.prototype.slice.call(arguments) });
    };
  };
  var stub = {
    calls: calls,
    styles: styles,
    save: record('save'),
    restore: record('restore'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    // ... add every method your component invokes ...
    measureText: function(t) { return { width: (t || '').length * 7 }; },
    createLinearGradient: function() {
      return { addColorStop: function() {} };
    }
  };
  // Property-setter recording for style assignments.
  ['fillStyle', 'strokeStyle', 'lineWidth', 'shadowBlur',
   'shadowColor', 'font'].forEach(function(prop) {
    var current = null;
    Object.defineProperty(stub, prop, {
      configurable: true,
      get: function() { return current; },
      set: function(v) { current = v; styles.push({ prop: prop, value: v }); }
    });
  });
  return stub;
}
```

Then wire it into the component:

```js
component.set('element', {
  getElementsByTagName: function(tag) {
    return tag === 'canvas' ? [{
      getContext: function() { return ctxStub; },
      setAttribute: function() {},
      getBoundingClientRect: function() { return { width: 400, height: 300 }; }
    }] : [];
  }
});
```

Now assertions like:

```js
var offlineDraw = ctxStub.calls.find(c => c.name === 'fillText' && c.args[0] === 'Offline');
expect(offlineDraw).not.toEqual(undefined);
```

work synchronously and deterministically. Reference implementation in
[`tests/components/board-preview-canvas-test.js`](../app/frontend/tests/components/board-preview-canvas-test.js).

**Bonus diagnostic — refuse forbidden APIs:** override the stub's
forbidden methods (e.g. `roundRect` per the Cordova-WebView pattern)
to throw. The test then catches any future use of the forbidden API
automatically:

```js
ctxStub.roundRect = function() {
  throw new Error('context.roundRect must not be used — older WebViews lack it');
};
expect(() => component.render_canvas()).not.toThrow();
```

**First seen in:** [2026-05-27-pr281-test-coverage.md](./2026-05-27-pr281-test-coverage.md)
— Scot #3 + Scot #5 test coverage for the offline-indicator + per-cell
fallback added to board-preview-canvas.

---

## Pattern: Installing a v2-format Ember addon on Ember 3.28 requires ember-auto-import + a jquery externals shim

**Surface:** any future Ember addon install on this codebase
(Ember 3.28, `jquery-integration: false`, Bootstrap JS vendor-loaded
via `app.import` in
[`ember-cli-build.js`](../../app/frontend/ember-cli-build.js)).

**Symptom (round 1):** build fails with
`<app> needs to depend on ember-auto-import in order to use
<addon-name>`. **Symptom (round 2, after fixing round 1):** app loads
the chrome but every Bootstrap jQuery plugin call dies with
e.g. `(0, _jquery.default)(...).popover is not a function`,
`...dropdown is not a function`, etc. — most visible at
[`app-state.js:2282`](../../app/frontend/app/services/app-state.js#L2282)
which calls `$('#speak_mode').popover('destroy')` from
`dom_changes_on_board_state_change` during route setup, leaving the
whole index route blank.

**Detection shortcut before installing:**
`grep -l "addon-main.cjs" node_modules/<addon>/package.json` — if
found, the addon is v2-format and mandates ember-auto-import. The
addon's published `peerDependencies` entry `^3.28.0 || >= 4.0.0`
is a MINIMUM, not a maximum — it doesn't tell you about the legacy
jQuery pipeline collision.

**Root cause:** v2 addons declare their app-js manifest through
`addon-main.cjs`, which only resolves when `ember-auto-import` is
installed. Installing ember-auto-import then turns on its global
import scanner — it sees `import $ from 'jquery'` in app code (10+
files in this repo) and bundles the npm jquery as a SEPARATE ES
module. The vendor-concat `bootstrap.min.js` extended the LEGACY
`window.jQuery` with `.popover` / `.dropdown` / `.tooltip` plugins;
the npm-bundled instance has none of them. Two jQuery instances,
one with plugins, one without.

**Fix recipe:**

1. Install ember-auto-import directly: `npm install --save-dev
   ember-auto-import@^2`. `ember install <addon>` adds it for you;
   plain `npm install <addon>` does not.
2. Add the externals shim from ember-auto-import's own README
   ([line 351-364](../../app/frontend/node_modules/ember-auto-import/README.md))
   to [`ember-cli-build.js`](../../app/frontend/ember-cli-build.js):
   ```js
   autoImport: {
     webpack: {
       externals: { jquery: 'jQuery' }
     }
   }
   ```
   This tells webpack to leave `import $ from 'jquery'` resolving
   to the global `window.jQuery` rather than re-bundling.
3. Static verification after the fix:
   `grep "jQuery JavaScript Library" dist/assets/*.js` should
   match ONLY `vendor.js` — never `frontend.js` or an
   auto-import chunk. If it matches a second file, you have two
   jQuery instances again.

**Anti-pattern to avoid:** don't claim "compatible with Ember 3.28"
based on the addon's peerDeps alone. Validate the broader install
path against THIS codebase's actual build config first:
[`config/optional-features.json`](../../app/frontend/config/optional-features.json)
(jquery-integration), `ember-cli-build.js` vendor concats, anything
in `vendor/`. The peer-dep line is a minimum; this codebase's
legacy pipeline is the maximum.

**First seen in:** [2026-05-27-shepherd-home-tour-spike.md](./2026-05-27-shepherd-home-tour-spike.md)

---

## Pattern: Same-named computeds defined across model/component/controller are widespread and often diverge — gate visibility-dependent code on DOM presence

**Surface:** any code that needs to mirror a visibility / availability
state already computed by another part of the app — tours, onboarding
flows, modals that target conditionally-rendered elements, or any
"is the X card showing right now?" check.

**Symptom:** the dependent code "silently does nothing" or skips a
step when the source-of-truth check passes — e.g. a tour step skips
even though the target element is rendered on the page; a modal
fires its callback but the action no-ops because the gate evaluated
differently than what the user can see.

**Root cause:** the codebase has 357 distinct computed-property
names defined in 2+ files, 40+ of them spanning multiple layer
types (model + component, component + controller). Spot-checks
confirm divergent logic is the norm, not the exception:
- **`has_management_responsibility`** —
  [`user.js:124`](../../app/frontend/app/models/user.js#L124)
  returns `managed_orgs.length > 0`;
  [`dashboard/authenticated-view.js:487`](../../app/frontend/app/components/dashboard/authenticated-view.js#L487)
  returns `managed_orgs.length > 0 || supporter_role`. The dashboard
  card shows for supporters even without managed orgs; the model
  computed says they have no management responsibility.
- **`has_supervisees`** — 6 definitions, 4 different logical
  interpretations (some include `known_supervisees`, some include
  `managed_orgs`, some neither).
- **`needs_sync`** — 3 definitions, 3 different algorithms.
- **`managed_orgs`** — 3 definitions with identical filter logic
  but different sources (`appState.currentUser.organizations` vs
  `app_state.currentUser.organizations` (legacy alias) vs the
  model's raw `organizations`).

Calling the wrong one passes type-check, doesn't error, and returns
a misleading value. This is a special case of the "silent wrong
behavior" meta-pattern above, with a specific remedy.

**Fix recipe for visibility-gated code:** gate on the actual
rendered DOM, not on a computed property:

```js
// WRONG — duplicates business logic, drifts when the source
// component's gate changes, and may call the wrong definition.
var manager = !!this.get('appState.sessionUser.has_management_responsibility');
if (manager) { steps.push({ attachTo: { element: '.md-card--org-management', ... }, ... }); }

// RIGHT — gate directly on whether the target is on the page.
// Self-correcting if the source component's visibility logic
// changes; impossible to get wrong because the anchor must
// exist for the tour step to attach anyway.
var orgCardVisible = !!document.querySelector('.md-card--org-management');
if (orgCardVisible) { steps.push({ attachTo: { element: '.md-card--org-management', ... }, ... }); }
```

**For non-visibility code** (e.g. business-logic decisions that
aren't about "is this element shown?"): grep the property name
before calling it. If multiple definitions exist, READ all of them
and either pick the right one with eyes open, or rename your local
version to disambiguate.

**Detection shortcut** (run from `app/frontend/`):
```bash
grep -rEn "^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*computed\(" \
  app/components app/controllers app/models app/services app/routes \
  | sed -E 's|.*:[0-9]+:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*computed.*|\1|' \
  | sort | uniq -c | awk '$1 > 1' | sort -rn
```
Names with high counts that are obvious UI primitives
(`elem_style`, `num_style`, `text_class`) are usually benign per-
component repetition. Names with 2-4 hits that look semantically
meaningful (`has_*`, `*_options`, `is_*`) are the high-risk ones.

**Why a global fix isn't right today:** consolidating these into
mixins/services or adding an ESLint rule needs architectural
decisions about which definition is canonical — that's a team-level
discussion, not a unilateral refactor. The DOM-presence pattern
above is the per-task remedy that doesn't require touching shared
business logic.

**First seen in:** [2026-05-27-shepherd-home-tour-spike.md](./2026-05-27-shepherd-home-tour-spike.md)
— first hit at `has_management_responsibility`, audit run from the
same session confirmed the breadth.

---

## Pattern: `!important` does not beat source order at equal specificity — bump specificity with a compound selector instead

**Surface:** any attempt to override a rule in `app.scss` that
already carries `!important`. Most common when targeting an element
that's already styled by a broad selector with `!important` (e.g.
`.md-hero`, `.md-card`, `.md-btn`) and you want a variant-specific
override.

**Symptom:** your override is the LATER rule in source, both have
`!important`, and your styles silently don't take effect. DevTools
shows your rule struck through; the broader rule wins.

**Root cause:** CSS cascade resolution at equal specificity falls
back to source order — the later rule wins. `!important` only
elevates a declaration into the "important" cascade origin; it does
NOT compete with source order within that origin. When BOTH rules
have `!important` AND equal specificity, source order STILL
decides. If your override is EARLIER in `app.scss` than the rule
you're trying to beat, you lose regardless of `!important`.

Concrete example from this spike: `.md-hero--dashboard
{ position: relative !important; }` at line ~27688 lost to
`.md-hero { position: static !important; }` at line ~38413, because
both are `0,1,0` specificity and the `.md-hero` rule comes later.
DevTools showed `position: BODY` (the absolutely-positioned child's
offsetParent fell through to `<body>`), not `.md-hero--dashboard`
as intended.

**Fix recipe:** bump specificity instead of source order. The
two-class compound selector `.md-hero.md-hero--dashboard` is `0,2,0`
specificity and beats the single-class `.md-hero` (`0,1,0`)
regardless of which is later in the file:

```scss
/* WRONG — equal specificity, broader rule wins via source order */
.md-hero--dashboard {
  position: relative !important;  /* silently overridden */
}

/* RIGHT — compound selector raises specificity to 0,2,0 */
.md-hero.md-hero--dashboard {
  position: relative !important;
}
```

The compound-selector trick generalizes: any time you need to beat
a broader rule that's later in source AND has `!important`, chain
two of the element's existing classes (or add an ancestor
selector) rather than reaching for `!important` you already have.

**Related** to the duplicate-selectors-in-app.scss pattern above —
both stem from the file's size making source-order reasoning
unreliable. Detection shortcut: when DevTools shows a property
struck through despite `!important`, look at which rule is
WINNING and check its specificity. If specificity is the same as
yours, source order is the issue; bump specificity, don't add a
second `!important`.

**First seen in:** [2026-05-27-shepherd-home-tour-spike.md](./2026-05-27-shepherd-home-tour-spike.md)

---

## Pattern: Third-party CSS — import the default first, then override; the structural rules and the decorative ones ship together

**Surface:** any new vendor JS library added to the codebase that
also ships CSS (Shepherd, Bootstrap, jquery-minicolors, etc. — see
the `app.import('node_modules/.../dist/css/...')` chain in
[`ember-cli-build.js`](../../app/frontend/ember-cli-build.js)).

**Symptom:** the library renders something on screen, but it's
visually broken in non-obvious ways — modal overlays don't cover
the page, dropdowns position outside their parents, headers
collapse onto their cancel icons, popover arrows render at the
wrong edge. Your custom theme overrides "look like" they should be
enough, but the layout is missing fundamentals.

**Root cause:** vendor CSS files typically ship TWO kinds of rules
mixed together:
- **Structural** — `position: fixed`, `width: 100vw`, `display:
  flex`, `box-sizing: border-box`, `z-index: 9997`. These set up
  the geometry the library's JS depends on.
- **Decorative** — colors, fonts, shadows, border-radius. The
  surface treatment you want to replace.

Skipping the default import to "write our own styling from
scratch" silently loses BOTH categories. The library's JS still
runs, but its DOM has no geometry — the modal overlay defaults to
`height: 0` (literally invisible); the header has no flex layout
(title and cancel icon collide); the arrow has no positioning
(floats inside the popover body).

Concrete example from this spike: Shepherd.js's default
`shepherd.css` was skipped. The popover rendered with my visual
overrides applied, but the modal overlay didn't dim the page
(default rule `.shepherd-modal-overlay-container.shepherd-modal-is-
visible { height: 100vh }` was missing), the cancel × icon
overlapped the title (default `.shepherd-header { display: flex;
justify-content: flex-end }` was missing), and the arrow was
mispositioned. Fix was to add ONE line:
`app.import('node_modules/shepherd.js/dist/css/shepherd.css');`
next to the existing Bootstrap CSS import.

**Fix recipe:**

1. Import the default CSS via `app.import` matching the existing
   vendor-CSS convention in `ember-cli-build.js`.
2. Write your brand overrides in `app.scss`. Source-order does the
   layering for you — `app.css` (your overrides) is concatenated
   AFTER `vendor.css` (the default), so your decorative rules win
   while the structural rules from the default still apply.
3. If you genuinely want to drop a specific default rule, override
   it explicitly in your CSS rather than skipping the whole file.

**Anti-pattern to avoid:** assuming "the library's JS handles
positioning, the CSS is just visual." For libraries that use
Popper.js or Floating UI for positioning (Shepherd, Tippy, modern
dropdowns), the JS sets inline `transform: translate(x, y)` but
the host element still needs CSS for `position: absolute`,
`z-index`, and `box-sizing` — those come from the default
stylesheet.

**Detection shortcut:** if a vendor component looks "almost right
but the layout is off," check whether the default CSS got
imported. Run `grep -l "node_modules/<library>/dist/css"
ember-cli-build.js` — if it returns nothing, you skipped it.

**First seen in:** [2026-05-27-shepherd-home-tour-spike.md](./2026-05-27-shepherd-home-tour-spike.md)

## Pattern: `session.override()` does a full page reload — in-memory appState set in register flow doesn't survive

After a successful registration, [`routes/register.js`](../../app/frontend/app/routes/register.js)
calls `session.override(meta)` to write the new access token into the
session. Under the hood, [`services/session.js#override`](../../app/frontend/app/services/session.js)
calls `this.reload('/')`, which does `location.href = '/'` — **a hard
browser navigation, not an Ember route transition**. Every in-memory
property on app-state, every controller, every component instance is
wiped. The app boots fresh from `/` with the persisted access token.

**Trap:** if you need to signal something post-register (e.g.
"auto-fire the home tour on first dashboard mount"), setting it on
`appState` right before `session.override()` looks correct but is
silently erased a few ms later. The downstream component reads
`false` on mount and never fires.

**Solution:** stash the signal in `sessionStorage` (or
`localStorage`), then read + clear it atomically on the receiving
side:

```js
// register.js save_done
try { sessionStorage.setItem('ll_auto_open_home_tour', '1'); } catch (e) {}
appState.set('auto_open_home_tour', true); // SPA fast-path
session.override(meta);                    // triggers hard reload

// home-tour.js didInsertElement
try {
  if (sessionStorage.getItem('ll_auto_open_home_tour') === '1') {
    sessionStorage.removeItem('ll_auto_open_home_tour');
    this._scheduleAutoOpen();
  }
} catch (e) {}
```

Always wrap in try/catch — Safari private mode and disabled-storage
browsers throw on access.

**Detection shortcut:** if a "set flag on appState → check flag on
the next route's component" pattern silently fails after registration
or any other place that calls `session.override()` / `session.invalidate()`,
grep that path for `location.href` or `location.reload()` to confirm
a hard reload is in play.

**First seen in:** post-registration home-tour auto-open work, traci/styling/styling-updates branch (2026-05-27)

## Pattern: This codebase ships `and` and `or` template helpers but NOT `not` — pre-compute negations

The codebase has `app/frontend/app/helpers/and.js` and
`app/frontend/app/helpers/or.js` but no `not.js`, and
`package.json` does NOT depend on `ember-truth-helpers`. Using
`(not x)` in a template silently fails at render time — and on Ember
3.28 the failure surfaces as a re-render loop with the cryptic
"Attempted to rerender, but the Ember application has had an
unrecoverable error" warning (often hundreds of times until the app
becomes unresponsive). No stack trace, no source line.

**Rule of thumb:** for template conditionals that need negation, do
NOT reach for `(not x)`. Either:
1. Add a `show_X` / `is_X_visible` computed property on the
   controller/component that performs the negation in JS, then use
   the simple `{{#if this.show_X}}` form in templates.
2. Restructure with `{{#unless x}}…{{/unless}}` (built-in to Ember,
   always available).

Approach 1 is preferred when the same condition is consumed in
multiple templates (single source of truth) or when the negation is
combined with other conditions.

**Detection shortcut:** if the page renders blank with "Loading…"
and DevTools shows a flood of "Attempted to rerender" warnings, grep
your recent template diffs for `(not ` — that's the most common
culprit. Also worth checking: any custom helper used in a template
that doesn't exist in `app/helpers/` (e.g. `(eq …)`, `(gt …)` —
those aren't here either unless someone adds them).

**First seen in:** [2026-05-27-subscribe-modal-modernization.md](./2026-05-27-subscribe-modal-modernization.md) (welcome-notice dismiss work)

## Pattern: Cross-context CSS classes need scoped overrides — `.la-about-glass-card` is dark-landing AND light-modal

Some "modern" component classes (e.g. `.la-about-glass-card`,
`.la-pricing-card`) are shared between two very different surfaces:
the **public landing/pricing pages** (dark gradient bg, glass cards
with light text on a translucent white pane) and the
**subscribe modal** (white modal bg, where those same classes would
render with washed-out light text + glass-on-white blur). The base
definitions are tuned for the dark surface.

**Rule of thumb:** if you find a shared class rendering wrong in the
light-mode surface, do NOT retune the base — that flips the public
landing page. Instead add a scoped override under the modal/dashboard
container:

```scss
.subscription-form-cards .la-about-glass-card {
  background: linear-gradient(180deg, #fff, $surface-100);
  backdrop-filter: none;
  border: 1px solid var(--md-line);
  color: var(--md-ink);
  /* …light-bg variant of the same composition… */
}
```

The override wins on specificity (2 classes vs 1), no `!important`
needed. The base styling continues to serve the dark-landing
context unchanged.

**Detection shortcut:** if a card pulled from the public landing page
"works but looks washed out" inside a modal, grep the class in
app.scss — if the base rule references rgba(255,255,255,…) or
backdrop-filter, you're seeing the dark-bg variant leak into a
light-bg surface.

**First seen in:** [2026-05-27-subscribe-modal-modernization.md](./2026-05-27-subscribe-modal-modernization.md)

## Pattern: Modern checkboxes — filled family is canonical; pick the fill color from the brand palette per surface

When modernizing a checkbox cluster, the codebase has two visual
families but the **filled family is the canonical "modern" look**.
The white-on-white "form pattern" exists historically on
`.md-edit-profile__form` and `.md-preferences__form` but it's NOT
what to copy on new modernization passes — confirmed in
[2026-05-27-register-checkboxes-modern.md](./2026-05-27-register-checkboxes-modern.md)
when the white-on-white attempt was rejected for being inconsistent.

| Family | Where used | Visual signature | When to pick |
|---|---|---|---|
| **Filled (canonical)** | `.md-modal-check` (`$brand-charcoal-blue`), `.la-board-privacy-boards` (`$brand-verdigris`), `.new-board--modern` (`$brand-stormy-teal`), `.register-checkboxes` (`$brand-slate-blue`) | 18–22px, hairline border at rest, filled brand-color bg on `:checked`, white rotated-rectangle tick | Default — any new "modern this checkbox" task |
| **White-on-white (legacy form)** | `.md-edit-profile__form`, `.md-preferences__form` | 18×18, white bg even when checked, charcoal-blue tick on white | Don't copy. If you touch those forms, consider migrating them to the filled family too. |

**Picking the fill color:** match the surface tone. Slate-blue for
neutral account/auth forms (register). Charcoal-blue for modals and
neutral overlays. Verdigris for permission/privacy toggles. Stormy-teal
for the new-board wizard. The shape (18×18, 4px radius, hairline
border, white tick at `top:2px;left:5px;w:5px;h:10px;rotate(45deg)`)
is identical across all of them.

**Trap:** the Bootstrap-era `.big_checkbox` rule at
[`app.scss:6942`](../../app/frontend/app/styles/app.scss#L6942) uses
`position: absolute` + a 24px box hung off `left: 20px` inside its
wrapper. Modern checkboxes use `position: relative` inside the label
inline. Override BOTH (positioning + visuals) and zero out the
wrapper's `padding-left: 30px` (which only made sense for the
absolute layout) — `.md-edit-profile__form .big_checkbox
{ padding-left: 0 !important; }` does exactly this.

**First seen in:** [2026-05-27-register-checkboxes-modern.md](./2026-05-27-register-checkboxes-modern.md)

## Pattern: `/api/v1/boards?user_id=X` returns every owned board including sub-board copies — visible-tile counts need root clustering

The boards endpoint returns the raw library: a copied board set
contributes both its root tile AND every sub-board copy underneath
it. On real accounts this inflates 14 visible roots to 419 records.
Any UI surface that wants a count matching what the user *sees as
tiles* must apply the root-vs-copy clustering, not the raw
`my_boards.length` or paginated `store.query('board', { user_id })`
total.

Filter is in [`app/frontend/app/utils/board-roots.js`](../../app/frontend/app/utils/board-roots.js)
(`filterRootBoards(boards, userId)`):

- shallow roots: id shape `<copyId>-<userId>` with copy_id null/self
- regular roots: copy_id null or equals own id
- everything else is a copy → drop

Used by `myBoardsRoots` on [`controllers/user/index.js`](../../app/frontend/app/controllers/user/index.js)
(boards-page BOARDS chip / `myBoardsTileCount`) and by `boardCount`
on [`components/dashboard/authenticated-view.js`](../../app/frontend/app/components/dashboard/authenticated-view.js)
(home-tab Boards stat). If another surface needs an "owned board
count," reach for the util — don't re-read `length` off the raw
query.

**First seen in:** [2026-05-27-home-board-count-roots-only.md](./2026-05-27-home-board-count-roots-only.md)

---

## Pattern: create-board-new preview URLs stripped by process_buttons whitelist

**Surface:** AI board creation on `/create-board-new` — preview shows OpenSymbols images but saved board has none.

**Symptom:** Preview grid renders `<img src="https://opensymbols...">` from client `_label_images` cache; after Create, buttons have labels but no symbols.

**Root cause:** `saveBoard` bakes `image_url` onto `model.buttons[]`, but `Board#process_buttons` `.slice(...)` whitelist drops `image_url` before `before_save :process_client_supplied_images` runs. `process_suggested_symbols` only ran for `@buttons_changed == 'populated_from_labels'`, not client-baked buttons.

**Fix:** Stash `image_url` by button id in `process_buttons` before slice; consume in `process_client_supplied_images`. Fallback `process_suggested_symbols` for `@brand_new` boards still missing `image_id`.

**First seen in:** [2026-05-26-ai-board-preview-images-phase1.md](./2026-05-26-ai-board-preview-images-phase1.md)

---

## Pattern: OpenSymbols search returns nested license objects — pick_preview must normalize

**Surface:** Button-settings Picture tab → search symbols → pick thumbnail → "Use This".

**Symptoms:** License row shows `[object Object]`; "Use This" appears to do nothing (preview stays) because `save_image_preview` hangs probing remote SVG dimensions via `new Image()` with no timeout.

**Root cause:** `/api/v1/search/symbols` (via `OpenSymbols.find_images`) returns `license: { type: 'CC BY-SA', author_name: ..., uneditable: true }`, but `pictureGrabber.pick_preview` treated `preview.license` as a flat string and assigned it to `license.type`. Width/height from search hits were not copied to `image_preview`, forcing a browser Image probe that can hang on CloudFront SVGs.

**Fix recipe:** `normalize_preview_license(preview)` handles nested vs flat shapes; copy `width`/`height` onto `image_preview` in `pick_preview`; in `save_image_preview`, use provided dimensions when present and timeout the Image probe. Guard `Button#load_image` async callbacks with `requestedId` so modal `load_image('remote')` cannot overwrite a newly assigned image.

**Evidence:** `app/frontend/app/services/content-grabbers.js`, `app/frontend/tests/utils/picture_grabber-test.js`; commit `770a8c624`. Task log (local): `2026-05-27-button-image-use-this.md`.

---

## Pattern: board-detail edit grid uses image_url — change_button must update it

**Surface:** Board-detail edit mode → Button Settings → Picture → pick symbol → "Use This".

**Symptom:** Modal "Current picture" shows the new symbol, but the board tile still shows the old image.

**Root cause:** `board-detail-grid.hbs` renders `<img src={{btn.image_url}}>`. Edit-mode buttons are built via `_make_ember_btn`, which sets `image_url` once from `raw.image_urls`. `editManager.change_button` updated `local_image_url` (used by legacy fast_html / speak paths) but not `image_url`, so the grid stayed stale after save.

---

## Pattern: large background prefetches must keep descendant images lazy

**Surface:** session-start board prefetch in `app/frontend/app/utils/board_detail_cache.js` for home and catalog trees.

**Symptom:** prefetch appears to speed up navigation but can flood browser requests and delay interactive UI when every descendant image is warmed up front.

**Root cause:** `/tree` returns root plus many descendants. Warming every descendant image immediately multiplies requests by depth and board size; this can saturate the browser queue and starve foreground actions.

**Fix:** ingest all descendant JSON into `board_detail_cache`, but warm images for root boards only during background prefetch; let descendant images load lazily on actual navigation.

**First seen in:** [2026-05-27-lingolinq-catalog-prefetch](./2026-05-27-lingolinq-catalog-prefetch.md)

**Fix recipe:** In `change_button`, when setting `local_image_url` from `image.best_url`, also `emberSet(button, 'image_url', best)`. Template fallback: `(or btn.local_image_url btn.image_url)` for defense in depth.

**Evidence:** `app/frontend/app/utils/edit_manager.js`, `app/frontend/app/templates/components/board-detail-grid.hbs`; commit `770a8c624`. Task log (local): `2026-05-27-button-image-use-this.md`.

---

## Pattern: loading overlays are UX-only — keep them off the cache path

**Surface:** global `show_loading_overlay` / `hide_loading_overlay`, board open from My Boards, board-detail route.

**Finding:** Overlays only set `loading_overlay_message` and timing fields. All board JSON (`board_detail_cache`), Ember Data peek/push, `prime_caches`, and ordered-buttons caching run independently. Overlay hide in `setupController` does not invalidate caches.

**Smoothness fixes (2026-05-28):**
- Shorter overlay minimum (150ms) when raw JSON + Ember record are already cached (`open_board_in_user_view`).
- `boardDetailCache.clear()` in `clear_user_state` on SPA sign-out.
- Classic `board-alt` route reads `boardDetailCache` before `findRecord`.
- `_maybe_prime_caches()` already awaited before `_build_from_raw` so `url_cache_primed` in ordered-buttons ctx is correct on first build.

**Do not:** tie overlay dismissal to image warm or `/tree` completion — conflicts with lazy descendant image prefetch.

**First seen in:** [2026-05-28-loading-overlay-cache-evaluation](./2026-05-28-loading-overlay-cache-evaluation.md)

---

## Pattern: extra_data JSON must not use FileSystem writes on web

**Surface:** `persistence.store_url_now` caching `BoardDownstreamButtonSet` S3 URLs (`lingolinq-*-uploads`, `/extras…/data-….json`).

**Symptom:** Console error `saving to data cache failed for https://…/BoardDownstreamButtonSet/…/data-….json` via `LingoLinq.track_error` (unhandled RSVP rejection).

**Root cause:** After fetching encrypted JSON via the search proxy, `store_url_now` attempted a Chrome PERSISTENT FileSystem write when `local_system.allowed` was true. Large encrypted button-set payloads often fail that write (quota / FS limits). Images/sounds need FileSystem; JSON extra_data does not — `find_json` resolves via `data_uri` in IndexedDB `dataCache`.

**Fix recipe:** In `store_url_now`, when `type == 'json'` and `object.data_uri` is set, skip `write_file` and `store('dataCache', …)` with `data_uri` retained. Add uploads buckets to `cors_match` so dev/prod S3 can be fetched directly when CORS allows.

**Evidence:** `app/frontend/app/services/persistence.js`, `app/frontend/app/utils/persistence.js`; task log `2026-05-28-loading-overlay-cache-evaluation.md`.

---

## Pattern: defer image_id in change_button — stale image_url rebinds wrong symbol

**Surface:** Button-settings Picture → pick search hit → "Use This".

**Symptom:** Preview shows the chosen symbol, but after "Use This" the modal "Current picture" (and board tile) revert to the **previous** symbol.

**Root cause:** `change_button` set `image_id` before updating `image_url`. That synchronously triggers `Button#findContentLocally`, which calls `load_image('local')`. `load_image` falls back to the stale `button.image_url` (still pointing at the old symbol) when `board.image_urls[newId]` is not populated yet, creates an incomplete image record with the **old URL** and **new id**, and overwrites `button.image`.

**Fix recipe:** When `options.image` and `image_id` are both supplied, apply `image` + URL fields first, then set `image_id` last. Clear `image_url` when swapping images. In `load_image`, prefer an already-assigned image record for the requested id; do not reuse `button.image_url` when a populated `board.image_urls` map lacks that id.

**Evidence:** `app/frontend/app/utils/edit_manager.js`, `app/frontend/app/utils/button.js`, `app/frontend/tests/utils/edit_manager-test.js`; commit `770a8c624`. Task log (local): `2026-05-27-button-image-use-this.md`.

---

## Pattern: Speak+light surface overrides shadow speak+light from the base — delete the override, don't fork it

**Surface:** `app.scss` selectors of the form
`.md-shell--board-detail:not(.md-shell--board-detail-edit):not(.md-board-detail--dark) <thing>`.
There's exactly one block of these (~app.scss:62329) and it owns the page-shell, the center stage, the tile drop-shadow, and the right-panel chrome for speak+light.

**Symptom:** Design direction flips (e.g. "speak+light should mirror edit+light, not edit+dark"). The temptation is to add a new override on top, or duplicate it under a `.md-board-detail--mirror-edit` class — both leave the old rules live and create a competing-cascade footgun.

**Root cause:** The base rules at `.md-shell--board-detail` (~58778), `.md-board-detail-main` (~59209), `.md-board-detail-right-panel` (~68112), and the base symbol-card shadow already deliver the edit+light look — `edit+light` has *no* overrides on those selectors. Speak+light's overrides were the only thing making it differ.

**Fix recipe:** When mirroring edit+light from speak+light (or vice-versa), DELETE the page/main/tile/right-panel speak-light overrides in that block instead of forking. The remaining overrides — `.md-board-detail-sentence-bar`, `.md-board-detail-home-btn`, `.md-board-detail-sentence-bar__tool-btn`, `.md-board-detail-actions-toggle`, `.md-board-detail-sidebar-toggle--stacked` — are the ones whose BASE assumes a dark canvas (white text, frosted gray-blue / solid blue-grey). Rewrite those in place using the same translucent-white frosted-glass formula `.md-board-edit-panel` uses (`linear-gradient(180deg, rgba(255,255,255,0.78) → rgba(241,244,248,0.78)) + backdrop-blur(12px) saturate(140%) + layered $la-navy shadows + inset white top highlight`). That keeps the compose row reading as the speak-mode mirror of the edit-page rails.

**Evidence:** `app/frontend/app/styles/app.scss` block @ 62329. Task log (local): `2026-05-28-board-detail-speak-light-mirror-edit-light.md`.

---

## Pattern: Bidirectional view-switch overlay — extract to a util and parameterize, don't inline a second copy

**Surface:** the `#ll-pre-reload-overlay` paint that masks the brief route flash when toggling between the Classic (board-alt) view and the Modern (board-detail) view. Originally inline in `controllers/board/index.js#go_to_modern` (~200 lines: DOM construction + theme detection + routeDidChange listener + safety timer + rAF-deferred transition).

**Symptom:** When the inverse direction (Modern → Classic, `controllers/user/board-detail.js#go_to_classic`) needs the same overlay, the obvious move is to copy the whole block over. That doubles the maintenance footprint and the prior race-fix comment (`animation: fade-in 180ms` → "paint at full opacity, defer transition by 1 rAF") shows this overlay has already been broken once by a subtle paint-timing bug — a second copy is a second time-bomb.

**Root cause:** The overlay's lifecycle is identical regardless of direction; only the visual accent differs (parenthetical font-weight). Inlining ties one direction's overlay to its controller and forces parallel evolution.

**Fix recipe:** Extract to `app/frontend/app/utils/view_switch_overlay.js`. Single `default export` that takes `{ routerSvc, transition, isDark, accentLight }` and owns the entire overlay lifecycle. Each controller becomes a 10-line call site. Per-direction visual tweaks ride on modifier classes on the card (e.g. `--accent-light`); the CSS modifier sits in-place next to the existing accent rule at `app.scss:80157` (don't fork a separate scoped block). Theme detection (`themeMode` → `isDark`) stays in the controllers since they already have appState in scope.

**Evidence:** `app/frontend/app/utils/view_switch_overlay.js` (new), `app/frontend/app/controllers/board/index.js` (refactor), `app/frontend/app/controllers/user/board-detail.js` (added overlay call), `app/frontend/app/styles/app.scss:80157` (accent-light modifier added in place). Task log (local): `2026-05-28-view-switch-overlay-shared-classic-direction.md`.

---

## Pattern: Board-card click navigation has TWO surfaces — board-icon `pick_board` default branch + board-preview `visit`; everything else delegates

**Surface:** any page that renders board cards via the `board-icon` component (boards index, dashboard, My Boards picker, right-panel sub-boards, search results, find-a-board, copy-board target picker, etc.).

**Symptom:** "Apply X to every board-card click" sounds like it needs a sweep across many call sites; in practice it's two well-defined ones, and wrapping the wrong ones breaks selection-only flows (copy-board, find-a-board for button targets).

**Root cause:** `board-icon.js#pick_board` (lines ~225-292) has 7 branches:
- `noop` — early return
- `onActionOverride` (caller-supplied fn) — delegated, may or may not navigate
- `action_override` (template attr → action) — delegated
- `onAction` (caller-supplied fn) — delegated (selection flows live here)
- `children` cluster → `triggerExternalAction('action', ...)` — delegated to parent (drill-in)
- `option == 'select'` → opens preview modal — navigation happens later in the modal's `visit` action
- `allow_style && override_count` → opens preview modal — same
- **Default (lines 279-291):** `router.transitionTo('user.board-detail', parts[0], parts[1])` for `parts.length === 2`, else `appState.home_in_speak_mode(opts)` (in-app state flip, NOT a route load).

The preview-modal "Open" lives at `board-preview.js#visit` and always calls `transitionToRoute(...)` after setting `referenced_board`.

**Fix recipe:** When applying a navigation-time effect (e.g. the shared `paint_view_switch_overlay`) to "every board-card click", wrap exactly these two:
- `board-icon.js#pick_board` default branch's `parts.length === 2` arm.
- `board-preview.js#visit` (both arms).

DO NOT wrap the delegated branches (`onAction`, `onActionOverride`, etc.) — they may not navigate at all (selection-only flows). DO NOT wrap the keyed `home_in_speak_mode` arm — it's an in-app state flip, not a route load. The card-driven UI surface is wider than these two points, but every other UI funnels through them.

board-preview.js doesn't inject the router service by default — add `router: service('router')` alongside the existing `appState` injection so the overlay can attach `routeDidChange` for graceful dismissal (the appState controller's `transitionToRoute` is a Route helper, not a Router service).

**Evidence:** `app/frontend/app/components/board-icon.js#pick_board`, `app/frontend/app/components/board-preview.js#visit`. Task log (local): `2026-05-28-board-card-click-loading-overlay.md`.

## Pattern: ember-shepherd tour chrome and scoped overlay blur

The home tour is **Shepherd.js 14.5.1** (via `ember-shepherd`). Key facts
for restyling it (`components/home-tour.js` + the `.shepherd-*` /
`.md-tour__*` block in `app.scss`, ~89778+):

- **`title` and `text` are rendered with `innerHTML`** (a step's `text`
  may also be a function returning an `HTMLElement`). So tutorial chrome
  that has no template — an eyebrow identity pill, etc. — is injected as
  an HTML string from JS (`_decoratedTitle()`), not from a `.hbs`. The
  strings come from i18n only (no user input), so there is no XSS
  surface. Shepherd portals popovers + the overlay into `<body>`, so the
  component template is just the trigger.
- **Per-step decoration goes through `defaultStepOptions.when.show`**
  (steps don't set their own `when`, so the default applies to all). The
  handler runs with `this` = the Step; use `step.el`, `step.tour.steps`,
  `step.options.attachTo`. That's where the progress dots are painted
  (`_renderTourProgress`, derived live from `tour.steps` so supporter-/
  org-gated steps stay counted correctly).
- **Overlay = an SVG `<path>` (default black fill) dimmed by the
  container's `opacity`.** Tint it by overriding `fill` on the path
  (genuinely new rule — the element ships with no fill). A spotlight
  *hole* is cut on attached steps; `backdrop-filter` on the SVG box
  blurs the WHOLE viewport including that hole, defeating the spotlight.
  Fix: toggle a `body.md-tour--centered-step` class from the `show` hook
  for intro/outro (no `attachTo`) steps and scope the blur to that class
  — attached steps keep a crisp spotlight (RULE #0.3).
- **CTA contrast (AAC = no compromise):** white text on a premium-looking
  *light* lavender-denim gradient is marginal (~2.8:1) and even deepened
  white-on-denim only reaches AA (~4.77:1 at `#4A6BCB`). Durable rule:
  **keep navy text and make the gradient light** — a darkest stop around
  `#C5D6F2` (the legacy `rgba(dusty-denim,.30)` solid surface, ~#C9DAF3)
  holds navy at ~8:1 (AAA). Gradient + inner sheen + lift supply the
  "premium" without ever touching contrast. Don't use white text on
  brand-colored buttons in this app.

Process note: `app.scss` is ~90k lines; when the `Edit` tool fails with
*"File has been modified since read"* (stale read-state — most often a
SECOND concurrent Claude session editing the same file; also long tool
delays), apply changes with a one-shot **atomic Python replace-once
script** (require each old-block to match exactly once, abort-without-
writing otherwise, back up first) and **delete the in-repo `.bak`** so it
isn't committed. If two sessions must run, isolate one with
`/gsd-new-workspace` (git worktree) so they never write the same files.

Atmosphere recipe (round-2 polish that read as "premium onboarding"
rather than "enterprise modal"): (1) **delete header/footer divider
lines** — segment with spacing + one shared translucent glass surface,
not borders; (2) layer a **hero glow** (top-center radial) + low-opacity
aurora corners over a *light* white base (>=0.90) — a dim surface is
usually too-low white opacity over the navy scrim, not the scrim itself;
(3) **glassy translucent close chip** (frosted white + blur) instead of a
solid grey `$surface-*` circle so it stops looking system-native; (4) a
**tiny restrained SVG illustration** (speech bubbles/nodes) as a
`background-image` layer with opacity baked into strokes — never
`filter: blur` the pseudo-element that carries it (it smears the glyphs).

## Pattern: Viewport-conditional board-detail UI (orientation gate + immersive tool consolidation)

**Surface:** `controllers/user/board-detail.js`,
`templates/user/board-detail.hbs`, `styles/app.scss`,
`lib/feature_flags.rb`. Feature flag `portrait_orientation_overlay`
(2026-05-29). A landscape-orientation overlay shows at ≤640px when a
board has >8 columns; mic/backspace/clear consolidate into the
down-arrow chevron's popover at ≤640px in speak mode.

**Reusable techniques / gotchas:**
- **Reactive width signal:** there is NO pre-baked "≤Npx" reactive
  property. `app_state.window_inner_width` is only `.set` from
  `controllers/board/index.js` (the CLASSIC view), so it's stale/absent
  on the modern board-detail page. Use the controller's own stored
  `window.matchMedia('(max-width: Npx)')` listener instead — the
  controller already does this for the 1024px panel auto-collapse
  (`board-detail.js` init + willDestroy). Mirror that exact pattern:
  store the MQL + handler on `this`, `set` a boolean, detach in
  willDestroy (both `removeEventListener` and legacy `removeListener`).
- **Columns per row, filled or empty:** `controller.current_grid.columns`
  (`board-detail.js` `current_grid` = `ordered_buttons[0].length`) counts
  grid placeholders per row, not active buttons — exactly the
  "more than N placeholders per row" signal.
- **Both modes share one template/root:** `md-shell--board-detail` is
  always present; `md-shell--board-detail-edit` is the only mode
  discriminator (`board-detail.hbs:1`). "Speak OR edit" = no extra gate;
  "speak only" = `{{#unless this.edit_mode}}` / `!edit_mode` in a computed.
- **Premium in-page gate, not a native popup:** a `position: fixed;
  inset: 0` veil with `backdrop-filter: blur()` keeps the board visible-
  but-blurred behind AND freezes interaction for free (the veil captures
  all pointer events — no `pointer-events` plumbing on the board needed).
  Layer it ABOVE `$aac-z-topbar` (400) since it's an intentional
  full-viewport gate (`z-index: $aac-z-topbar + 50`), the documented
  exception to "keep floating UI < 400".
- **Accessibility escape hatch is mandatory for AAC:** never hard-block
  on orientation — mounted / one-handed / non-rotatable setups exist.
  Pair the primary CTA with a quiet text-button "Continue Anyway" that
  dismisses (scope it "this board this session" via an `observer('model.id')`
  reset). "Rotate Device" can't force rotation on web: best-effort
  `screen.orientation.lock('landscape')` in try/catch + auto-retire when
  the matchMedia listener flips back to landscape.
- **Don't fold modern quick-actions into the legacy `speak-menu` modal**
  (`templates/speak-menu.hbs` is Bootstrap-era chrome). Build a small
  modern popover anchored to the chevron and keep a "More" entry →
  `open_speak_menu` so nothing becomes unreachable (RULE #0.3). Reuse the
  existing controller action handlers (`speak_sentence` / `backspace_sentence`
  / `clear_sentence`) — no new logic, just a new surface.
- **`darken()`/`lighten()` are deprecated in dart-sass; this repo's
  convention is `color.adjust(...)` (138 uses vs ~2 darken).** Use
  `color.adjust($c, $lightness: -5%)`. `@use "sass:color"` is already at
  the top of `app.scss`. Verify additions with
  `node_modules/.bin/sass --no-source-map app.scss /tmp/x.css` (compiles
  clean = no warnings).
- **Respect `prefers-reduced-motion`:** looping illustration animations
  (e.g. the phone-rock) must drop to a static end-state under the
  reduced-motion media query.

## Pattern: dual wide-only/narrow-only markups share a base class — `querySelector(base)` grabs the hidden one

**Surface:** the dashboard caseload + speak cards render TWO markups that
both carry the base class — `.md-card--caseload-wide-only` AND
`.md-card--caseload-narrow-only` (same for `--speak`). A `@media` switch
at 1024px toggles `display` between them (app.scss ~39569-39602). Only one
is ever visible.

**Symptom:** anything that does `document.querySelector('.md-card--caseload')`
gets the FIRST DOM match — the `-wide-only` variant — which is
`display:none` at <=1024px. A `display:none` node has no bounding rect, so
a Shepherd tour step attached to it flies to the top-left corner and cuts
NO spotlight hole (the modal-overlay opening needs a real rect). Looks
like "the tour card is mispositioned and not highlighting."

**Fix:** target the VISIBLE variant by width, not the base class. In
home-tour.js: `cardSel(base) => narrow ? base+'-narrow-only' :
base+'-wide-only'`, used for the caseload/speak `attachTo.element`. The
live-resize handler (`_onTourResize`) must also flip `attachTo.element`
(not just `on`) for these dual-variant steps, else crossing 1024px
re-attaches to the now-hidden markup. Single-markup cards
(boards/extras/orgs) pass the base class through unchanged.

**General rule:** before `querySelector(base-class)` on a dashboard card,
check whether that card has `-wide-only`/`-narrow-only` (or any
display-toggled) twins sharing the class. If so, qualify the selector to
the visible one. Evidence: home-tour.js `cardSel`/`_tourStepCfg`; task log
2026-05-29-home-tour-guided-experience-surface.md.

## Pattern: Dashboard card order is driven by grid-template-areas per breakpoint × variant — reorder there, never the DOM

**Surface:** `templates/components/dashboard/authenticated-view.hbs`
(home page bento) + `styles/app.scss` `.md-grid` rules.

The home dashboard cards (boards / speak / extras / org_mgmt / caseload
/ sup / getting_started) are placed by **named `grid-template-areas`**,
not DOM order. Each card has a fixed `grid-area:` (e.g. `.md-card--extras
{ grid-area: extras }` ~app.scss:50024, `.md-card--org-management`
`grid-area: org_mgmt` ~app.scss:39595). To move a card at a breakpoint,
**edit the `grid-template-areas` strings — do NOT reorder the markup**
(the markup feeds every breakpoint at once).

Gotchas:
- The layout is defined as a **matrix of variant modifiers ×
  breakpoints**. Variants: `--with-org-mgmt`, `--with-caseload`,
  `--with-getting-started` (and their combinations), plus `:has(
  .md-supervisors-page)`. Breakpoints that each REDEFINE the areas:
  base (desktop, >950), `@media (max-width: 950px)` (~app.scss:51890,
  single-column / caseload 2-col), and `@media (max-width: 640px)`
  (~app.scss:52107, caseload splits to its own rows). A change "at ≤Npx"
  usually means editing the SAME swap in BOTH the 950 and 640 blocks for
  every variant that contains the two cards — miss one and the order
  reverts at that narrower width.
- `org_mgmt` only renders with `has_management_responsibility`;
  `getting_started` is currently disabled (computed returns false) but
  its variants still exist in CSS — keep them consistent for when it's
  re-enabled.
- All `.md-grid` rules use `!important` (base rule sets it), so overrides
  must stay within the same breakpoint/specificity, not stack.
- `820px` / `550px` blocks only define single-area full-page views
  (`"extras"`, `"reports"`, `"sup"` for the extras/reports/supervisor
  tabs) — NOT the multi-card home grid. Don't confuse them.

## Pattern: board-picker is shared (setup + /search/home); reusing boards-page tab classes hits a ≤640px hide rule

**Surface:** `components/board-picker.{hbs,js}`, `templates/components/setup/board_category.hbs`, `templates/home-boards.hbs`, boards-page tabs in `templates/components/available-boards-section.hbs` + `app.scss`.

- **`board-picker` renders on two routes**: the setup wizard's
  board_category step AND `/search/home` (`home-boards.hbs`). Any markup
  change to the component affects both. To change only one surface, add
  an opt-in attribute (here `tabbed=true`, passed only from the setup
  component) and branch in the template (`{{#if this.tabbed}}`).
  board-picker is a classic `@ember/component`, so a passed `foo=true`
  auto-binds to `this.foo` — no JS change needed.
- **Setup page routing**: `controllers/setup.js` `setupComponent` maps the
  `page` query param to `components/setup/{page}` via `{{component}}`. The
  LIVE template is `templates/components/setup/<page>.hbs`, NOT the
  same-named route template `templates/setup/<page>.hbs` (that one is
  dead). Edit the component template.
- **Shared wizard chrome**: the `<header class="md-hero md-hero--setup">`
  in `templates/setup.hbs` is shown for every step. To drop it on one
  step, extend its `{{#unless}}` with `(is-equal this.setupComponent
  "setup/<page>")` — don't delete the header.
- **Reusing the boards-page folder tabs** (`ul.ub-boards-page__tabs.ub-
  boards-page__tabs--boards > li[.is-active] > a`): the pill/active/hover
  rules are NOT parent-scoped, so the look transfers anywhere you put
  those classes. BUT a `@media (max-width: 640px)` rule keyed on the
  parent `.ub-boards-page__tabs-row` HIDES the pills (`display:none`) and
  swaps in a mobile `<select>`. If you reuse the pill classes WITHOUT a
  mobile select, wrap them in your OWN row class (e.g.
  `.md-home-boards-picker__tabs-row`), not `.ub-boards-page__tabs-row`,
  or the tabs disappear on phones. Re-create the folder-baseline divider
  by copying `.ub-boards-page__tabs-row::after`.

---

## Pattern: sidebar "pin open" state lives in the `quick_sidebar` pref via `stickSidebar` — reuse it, don't add a second flag

**Surface:** the speak-mode boards sidebar. There are TWO renderings of
it: the **app-level** sidebar (`application.hbs` / `brief.hbs`, used by
board-alt and the main `/board` route) and board-detail's **inline**
sidebar (`.md-board-detail-inline-sidebar`, board-detail explicitly
hides the app one via `#content:has(.md-shell--board-detail) ~ #sidebar
{ display:none }` at `app.scss:63532`).

**The single source of truth for "pinned open" is the persistent
`user.preferences.quick_sidebar` pref**, toggled by the application
controller's `stickSidebar` action ([application.js:601](app/frontend/app/controllers/application.js#L601))
— it flips `quick_sidebar`, clears the `sidebarEnabled` stash, and
`user.save()`s. `app_state.sidebar_pinned` = `speak_mode &&
quick_sidebar`. The board-detail inline sidebar ALREADY honors this pref
(auto-open in `_syncInlineSidebarFromPrefs`, stay-open-after-jump in
`_maybeCloseInlineSidebarAfterAction`, lock in `toggleInlineSidebar`) —
the local `inlineSidebarOpen` is just the ephemeral show/hide on top.

**Lesson:** when adding a pin control to either sidebar, delegate to the
existing `stickSidebar` primitive (board-detail does this through its
`_sidebarAppController()` helper, the same path `sidebar_jump`/
`sidebar_special` already use) and bind the pressed state to
`quick_sidebar`. Do NOT introduce a second pin boolean — the two
sidebars must share one pinned state so pinning in board-detail is also
pinned on board-alt. Bind the button's `aria-pressed` to
`quick_sidebar` directly (not `sidebar_pinned`) so it reads correctly
even outside speak_mode.

**First seen in:** [2026-05-29-board-detail-inline-sidebar-pin.md](./2026-05-29-board-detail-inline-sidebar-pin.md)

---

## Pattern: async store/query callbacks must guard `isDestroyed`/`isDestroying` before `set`

**Symptom:** `Assertion Failed: calling set on destroyed object:
<frontend@component:…>.<prop> = …`, with a stack ending in
`publish → invokeCallback → Class.set → assert` (i.e. a Promise
resolving and writing to a component that's already gone).

**Root cause:** a component fires an async call (`LingoLinq.store.query`,
`persistence.ajax`, `RSVP.Promise`, `runLater`) and its `.then()`/error
callback calls `_this.set(...)`. If the user navigates or the component
re-renders before the promise resolves, the callback runs against a
torn-down instance. On fast-swapping surfaces (the home page card
layout, modals) this fires routinely.

**Fix (codebase-canonical):** make the FIRST line of every async
callback that writes to the component:
```js
if(_this.isDestroyed || _this.isDestroying) { return; }
```
Guard EACH callback (success AND every error/fallback handler), not just
the first — a chained `.then(success, error)` has two entry points.
Already used in board-preview-canvas.js, button-settings.js,
board-picker.js, board-preview.js, copy-board.js. Synchronous `init` /
`didInsertElement` sets are NOT at risk and don't need the guard.

**Detection:** grep a component for `\.then(function` and check each
callback body that calls `_this.set(` / `this.set(` has the guard.

**First seen in:** [2026-05-29-board-selection-tool-destroyed-set.md](./2026-05-29-board-selection-tool-destroyed-set.md)

---

## Pattern: per-element responsive show/hide rules must sit AFTER that element's base `display` rule — don't consolidate when bases are scattered

**Surface:** any "two sibling variants, show one per viewport via @media" setup
where the base layout rule uses `display: <x> !important` (very common in
`app.scss`, e.g. `.md-grid .md-card.md-card--caseload { display: flex !important }`).

**Trap:** the `@media … { … display: none !important }` hide rule and the base
rule often share specificity (e.g. both `(0,3,1)`) AND both use `!important`.
At equal specificity + equal !important-ness, **source order is the only
tiebreak** — the later rule wins. So a hide rule placed BEFORE the base rule is
silently overridden and the element never hides.

**How it bit (twice) on the dashboard caseload/speak cards:** consolidating both
cards' hide rules into ONE @media block worked for caseload (its base rule was
earlier in the file) but not speak (its base rule was ~4700 lines LATER, so the
base `display:flex` won and BOTH speak variants rendered → "duplicated card").

**Rule:** keep each element's responsive hide rule immediately AFTER (and near)
the base `display` rule it must beat. Do NOT consolidate per-element show/hide
rules into a single shared block when the elements' base rules are scattered
across the file. (Alternative fix per the related pattern above — bump
specificity with a compound selector — also works, but co-location is simpler
and self-documenting.) Verify with `grep -n` that base line < hide line for
each element.

**First seen in:** [2026-05-28-dashboard-cards-as-buttons-narrow.md](./2026-05-28-dashboard-cards-as-buttons-narrow.md) (correction section)

---

## Pattern: a glow/halo `::before` that "leaks to the whole container" at one breakpoint = the host lost `position` (static re-anchors the absolute pseudo)

**Symptom:** an element's decorative glow/halo/ring (a `::before` or `::after`
with `position: absolute; inset: -Npx`) hugs the element fine at most widths,
but at ONE breakpoint the glow suddenly spans the entire parent
container/row. The element itself is sized correctly — only its pseudo blows up.

**Root cause:** `position: absolute` resolves `inset`/`top`/`left` against the
**nearest positioned ancestor**. The element is normally the glow's containing
block because it's itself positioned (`absolute`/`relative`). A responsive
override that flips the element to **`position: static`** (commonly to "drop an
absolutely-pinned chip into normal flow") removes it from the positioned-ancestor
chain, so the absolute pseudo re-anchors to the next positioned ancestor (a hero,
card, or workspace) and `inset:-4px` stretches across THAT box instead.

**Fix:** drop the element into flow with **`position: relative`**, not `static`.
With `top/left/right` left at `auto`, relative is layout-identical to static but
keeps the element as the pseudo's containing block, so the glow hugs it again.
Seen on `.md-tour__trigger` (the "Take a tour" chip): its ≤1024px block set
`position: static !important`, leaking the verdigris `::before` glow across the
whole dashboard hero. (Same family as the absolute-pin work at app.scss ~28499 —
when you change a positioned element's `position` responsively, check whether any
`::before`/`::after` depends on it as the containing block.)

**First seen in:** [2026-05-30-take-a-tour-glow-leak.md](./2026-05-30-take-a-tour-glow-leak.md)

---

## Pattern: Signup default library boards — copy via Progress, not copy_to_home_board

**Surface:** new user registration (email or Google SSO).

**Requirement:** Give every new communicator owned copies of curated vocab boards in **My Boards** without setting `preferences.home_board`.

**Root cause to avoid:** `User#copy_to_home_board` always writes `preferences.home_board` — wrong tool for library-only provisioning.

**Fix recipe:** Add `User#copy_board_to_library` (`copy_for` + `copy_board_links`, no home pref). Schedule one Progress job per slug in `SystemBoardSources::SIGNUP_LIBRARY_SLUGS` via `Progress.schedule(user, :copy_board_to_library, …, for_user: user)` from `UserBoardProvisioner` after save. Source boards live on the `lingolinq` content user (`SystemBoardSources`); import with `VOCABULARY_USER_NAME=lingolinq bundle exec rake openaac:import_vocabularies`. Gate with `FeatureFlags.signup_default_library_boards_enabled?`.

**Evidence:** `lib/user_board_provisioner.rb`, `lib/system_board_sources.rb`, `app/models/user.rb`; task log `2026-05-28-signup-default-library-boards.md`.

---

## Pattern: Beta program access on registration — server defaults + org opt-out

**Surface:** self-service signup, org start codes, beta welcome routes.

**Requirement:** New users default to `preferences.beta_program_access: true`; org admins opt out via `org.settings['default_beta_program_access'] = false` for start-code registrations only.

**Fix recipe:** Change `User.preference_defaults`; in `Organization.parse_activation_code` set `activate_for.settings['preferences']['beta_program_access']` from `Organization#default_beta_program_access?` when target is an org; expose org setting in JsonApi + org settings UI; branch `register.js` post-save and guard `beta-welcome*` routes on `app_state.beta_program_access`. End users still cannot self-set the pref via API.

**Evidence:** `app/models/user.rb`, `app/models/organization.rb`, `app/frontend/app/routes/register.js`; task log `2026-05-29-beta-program-registration-default.md`.

---

## Pattern: `find_all_by_global_id` does not preserve input order

**Symptom:** RSpec expects `[bi1, bi2]` from `known_button_images` but gets reversed order when DB ids differ from button-list order.

**Root cause:** `GlobalId.find_all_by_global_id` uses `WHERE id IN (...)`; PostgreSQL returns rows in arbitrary/id order, not the caller's id list order.

**Fix recipe:** After lookup, `sort_by { |r| ids.index(r.global_id) || ids.length }` (see `Board.long_query`, `Board#known_button_images`). For specs comparing sorted `global_id` lists, sort **both** sides — lexicographic sort puts `"1_1000"` before `"1_999"`.

**Evidence:** `app/models/concerns/global_id.rb:108-174`, `app/models/board.rb#known_button_images`; task log `2026-05-29-spec-ordering-flakes.md`.

---

## Pattern: board translation speak text must mirror label when vocalization unset

**Symptom:** Board shows translated labels but Speak reads English.

**Root cause:** Buttons often have only `label`; after translation the label overlay updates but a stale English `vocalization` field (or missing dest-lang vocalization in the translations blob) wins in `utterance.speak_button` (`vocalization || label`).

**Fix recipe:** In `Board#translate_set`, when dest label is stored and source vocalization was blank or matched source label, also write dest vocalization and update live button vocalization. Mirror label→vocalization in `edit_manager.update_inflections` and `board.translated_buttons` when speak/label locales match. Sync `label_locale`/`vocalization_locale` stashes after translate; on board load prefer board default locale unless `override_*` stashes exist from Switch Languages.

**Evidence:** `app/models/board.rb#translate_set`, `app/frontend/app/models/board.js`, `app/frontend/app/utils/edit_manager.js`; task log `2026-05-30-board-translation-fixes.md`.

---

## Pattern: pre-built Spanish library boards — translate copies, do not regenerate

**Symptom:** Spanish labels break symbol/image lookup when boards are generated directly in Spanish.

**Fix recipe:** Keep English Quick Core / Vocal Flair as canonical on `lingolinq/*`; `copy_for` → `WordData.translate_batch` → `translate_set` into `*-es` slugs so `image_id` is preserved. Provision with `rake lingolinq:provision_spanish_library_boards`; gate signup copies with `FeatureFlags.signup_spanish_library_boards_enabled?`.

**Evidence:** `lib/spanish_library_boards.rb`, `lib/system_board_sources.rb`, `lib/user_board_provisioner.rb`; task log `2026-05-30-board-translation-fixes.md`.

---

## Pattern: board-detail Switch Languages — overlay translations on ordered_buttons

**Symptom:** Switch Languages changes speak locale metadata but grid labels stay in the board default language; taps may not vocalize on board-detail.

**Root cause:** Modern board-detail builds `ordered_buttons` from raw API buttons in `_build_from_raw` and does not apply `contextualized_buttons` overlays. In speak mode, `edit_manager.process_for_displaying` takes the legacy `fast_html` shortcut and returns early without rebuilding `ordered_buttons`.

**Fix recipe:** After `_build_from_raw`, call `_apply_display_locales_to_ordered_buttons` (maps `contextualized_buttons` onto the plain-object grid). On Switch Languages close, invalidate `last_cb`/`fast_html` and re-run that overlay plus `process_for_displaying(true)`. Skip the speak-mode `fast_html` early-return path when `controller.is_board_detail`.

**Evidence:** `app/frontend/app/controllers/user/board-detail.js`, `app/frontend/app/utils/edit_manager.js`; task log `2026-05-30-board-translation-fixes.md`.
