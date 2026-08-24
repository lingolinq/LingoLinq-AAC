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

- [Gotcha: highlight-outlet must not mount opening-observer with a null model](#gotcha-highlight-outlet-must-not-mount-opening-observer-with-a-null-model)
- [Gotcha: online invalid_token must not fall back to cached user/self](#gotcha-online-invalid_token-must-not-fall-back-to-cached-userself)
- [Pattern: Playwright settings e2e — three settings surfaces + restore after mutate](#pattern-playwright-settings-e2e--three-settings-surfaces--restore-after-mutate)
- [Gotcha: blank board-detail has no symbol grid — empty-state is a valid ready signal](#gotcha-blank-board-detail-has-no-symbol-grid--empty-state-is-a-valid-ready-signal)
- [Gotcha: Button Settings `#label` is hidden on the Help tab](#gotcha-button-settings-label-is-hidden-on-the-help-tab)
- [Gotcha: board-detail empty-cell save ignores placeholder ids like `fake_0_0`](#gotcha-board-detail-empty-cell-save-ignores-placeholder-ids-like-fake_0_0)
- [Pattern: phased board prefetch — shared planner, dual persistence files](#pattern-phased-board-prefetch--shared-planner-dual-persistence-files)
- [Pattern: board-preview latency is cold-cache, not the loading gate — warm on intent](#pattern-board-preview-latency-is-cold-cache-not-the-loading-gate--warm-on-intent)
- [Gotcha: every route transition closes all modals (global_transition) — don't keep a modal "open behind" a routed page](#gotcha-every-route-transition-closes-all-modals-global_transition--dont-keep-a-modal-open-behind-a-routed-page)
- [Gotcha: Shepherd modal overlay is VISUAL-ONLY; canClickTarget:false makes the target click "fall through"](#gotcha-shepherd-modal-overlay-is-visual-only-canclicktargetfalse-makes-the-target-click-fall-through)
- [Pattern: supervisor caseload session prefetch reuses board_detail_cache, not offline sync](#pattern-supervisor-caseload-session-prefetch-reuses-board_detail_cache-not-offline-sync)
- [Pattern: encrypted buttonset JSON cache must carry parsed payloads](#pattern-encrypted-buttonset-json-cache-must-carry-parsed-payloads)
- [Pattern: remote buttonset reload can wipe generate URL before second load_buttons](#pattern-remote-buttonset-reload-can-wipe-generate-url-before-second-load_buttons)
- [Pattern: button_set per-button locale can stale — translate modal must use board locale](#pattern-button_set-per-button-locale-can-stale--translate-modal-must-use-board-locale)
- [Pattern: translate Accept must persist via Resque and a full save payload](#pattern-translate-accept-must-persist-via-resque-and-a-full-save-payload)
- [Pattern: translate linked-board scope needs button_set.buttons, not root board.buttons fallback](#pattern-translate-linked-board-scope-needs-button_setbuttons-not-root-boardbuttons-fallback)
- [Pattern: progress polling stops on finished_at — handlers must not require status === 'finished' alone](#pattern-progress-polling-stops-on-finished_at--handlers-must-not-require-status--finished-alone)
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
- [Pattern: Preview-clone pointer-drag — hit-test by geometry (not elementsFromPoint) and re-wire after every clone rebuild](#pattern-preview-clone-pointer-drag--hit-test-by-geometry-not-elementsfrompoint-and-re-wire-after-every-clone-rebuild)
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
- [Pattern: layout-variant selectors that SWAP a base class have EQUAL specificity — they can't be relocated to a partial](#pattern-layout-variant-selectors-that-swap-a-base-class-have-equal-specificity--they-cant-be-relocated-to-a-partial)
- [Pattern: app-wide pref→root-class overlays belong in app-state, mirroring `set_fitzgerald_scope`](#pattern-app-wide-prefroot-class-overlays-belong-in-app-state-mirroring-set_fitzgerald_scope)
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
- [Pattern: beta seed baseline belongs to `lingolinq`, demo analytics are opt-in](#pattern-beta-seed-baseline-belongs-to-lingolinq-demo-analytics-are-opt-in)
- [Pattern: Word prediction locale has three layers — display locale, board locale, cache/sync locale](#pattern-word-prediction-locale-has-three-layers--display-locale-board-locale-cachesync-locale)
- [Pattern: shared AI reuse caches need exact scrubbed keys before recommendation matching](#pattern-shared-ai-reuse-caches-need-exact-scrubbed-keys-before-recommendation-matching)
- [Pattern: Translated board names must not rename route keys](#pattern-translated-board-names-must-not-rename-route-keys)
- [Pattern: Demo speak `board` query param must alias away from loaded board state](#pattern-demo-speak-board-query-param-must-alias-away-from-loaded-board-state)
- [Pattern: endpoint-specific 401 auth without changing legacy `require_api_token`](#pattern-endpoint-specific-401-auth-without-changing-legacy-require_api_token)
- [Pattern: Shepherd tour steps for a user-reorderable surface must be built from the LIVE DOM, not a fixed list](#pattern-shepherd-tour-steps-for-a-user-reorderable-surface-must-be-built-from-the-live-dom-not-a-fixed-list)
- [Pattern: activation location logging must tolerate missing hit history](#pattern-activation-location-logging-must-tolerate-missing-hit-history)
- [Pattern: retranslate existing board language must force default update](#pattern-retranslate-existing-board-language-must-force-default-update)
- [Gotcha: SES region config may be `AWS_REGION`, not `SES_REGION`](#gotcha-ses-region-config-may-be-aws_region-not-ses_region)
- [Gotcha: `ember test` here runs only lint + 3 acceptance tests — the unit suite is NOT wired in](#gotcha-ember-test-here-runs-only-lint--3-acceptance-tests--the-unit-suite-is-not-wired-in)
- [Pattern: dashboard "fill the row" needs an inline grid-template-columns = visible-item count](#pattern-dashboard-fill-the-row-needs-an-inline-grid-template-columns--visible-item-count)
- [Fact: the two dashboard layout keys are `focused` + `gentle` (renamed from `balanced`/`dynamic` 2026-06-11)](#fact-the-two-dashboard-layout-keys-are-focused--gentle-renamed-from-balanceddynamic-2026-06-11)
- [Gotcha: dashboard preview tiles + selection gates leak HIDDEN-but-present state](#gotcha-dashboard-preview-tiles--selection-gates-leak-hidden-but-present-state)
- [Gotcha: a saved frontend preference silently vanishes if it's not in `User::PREFERENCE_PARAMS`](#gotcha-a-saved-frontend-preference-silently-vanishes-if-its-not-in-userpreference_params)

---

## Pattern: shared AI reuse caches need exact scrubbed keys before recommendation matching

For user-entered AI prompts that become reusable data, scrub PII first, normalize the scrubbed text, and use a conservative exact key with behavior-shaping settings such as locale and include-core vocabulary. Store generated output separately from user-applied output; the applied list is the reviewed signal future recommendation layers should trust more. Keep v1 in Postgres and derive later vector/graph layers from the source rows rather than changing the modal/API contract. When verifying specs around seeded/template records after migrations, compare table-count deltas from each example's starting count instead of hard-coding absolute counts. First seen in [`ai-focus-word-library-architecture.md`](./ai-focus-word-library-architecture.md).

- [Pattern: ember-shepherd tour chrome and scoped overlay blur](#pattern-ember-shepherd-tour-chrome-and-scoped-overlay-blur)
- [Pattern: Viewport-conditional board-detail UI (orientation gate + immersive tool consolidation)](#pattern-viewport-conditional-board-detail-ui-orientation-gate--immersive-tool-consolidation)
- [Pattern: Dashboard card order is driven by grid-template-areas per breakpoint × variant — reorder there, never the DOM](#pattern-dashboard-card-order-is-driven-by-grid-template-areas-per-breakpoint--variant--reorder-there-never-the-dom)
- [Pattern: board-picker is shared (setup + /search/home); reusing boards-page tab classes hits a ≤640px hide rule](#pattern-board-picker-is-shared-setup--searchhome-reusing-boards-page-tab-classes-hits-a-640px-hide-rule)
- [Pattern: dual wide-only/narrow-only markups share a base class — `querySelector(base)` grabs the hidden one](#pattern-dual-wide-onlynarrow-only-markups-share-a-base-class--querySelectorbase-grabs-the-hidden-one)
- [Pattern: sidebar "pin open" state lives in the `quick_sidebar` pref via `stickSidebar` — reuse it, don't add a second flag](#pattern-sidebar-pin-open-state-lives-in-the-quick_sidebar-pref-via-sticksidebar--reuse-it-dont-add-a-second-flag)
- [Pattern: async store/query callbacks must guard `isDestroyed`/`isDestroying` before `set`](#pattern-async-storequery-callbacks-must-guard-isdestroyedisdestroying-before-set)
- [Pattern: per-element responsive show/hide rules must sit AFTER that element's base `display` rule — don't consolidate when bases are scattered](#pattern-per-element-responsive-showhide-rules-must-sit-after-that-elements-base-display-rule--dont-consolidate-when-bases-are-scattered)
- [Pattern: compile `app.scss` standalone with dart-sass to catch SCSS errors without a full ember build](#pattern-compile-appscss-standalone-with-dart-sass-to-catch-scss-errors-without-a-full-ember-build)
- [Pattern: gate hover motion behind `prefers-reduced-motion: no-preference` instead of an `!important` reduced-motion override](#pattern-gate-hover-motion-behind-prefers-reduced-motion-no-preference-instead-of-an-important-reduced-motion-override)
- [Pattern: a glow/halo `::before` that "leaks to the whole container" at one breakpoint = the host lost `position` (static re-anchors the absolute pseudo)](#pattern-a-glowhalo-before-that-leaks-to-the-whole-container-at-one-breakpoint--the-host-lost-position-static-re-anchors-the-absolute-pseudo)
- [Pattern: a CSS background-image on a Shepherd popover (or any lazily-injected element) flashes blank on first open — preload it](#pattern-a-css-background-image-on-a-shepherd-popover-or-any-lazily-injected-element-flashes-blank-on-first-open--preload-it)
- [Pattern: a guided-tour auto-open flag consumed at a single afterRender misses when the gating state (edit_mode) resolves on a promise microtask — poll the condition](#pattern-a-guided-tour-auto-open-flag-consumed-at-a-single-afterrender-misses-when-the-gating-state-edit_mode-resolves-on-a-promise-microtask--poll-the-condition)
- [Pattern: `i18n_generator.rb --merge` does NOT refresh CHANGED English into existing locale placeholders — only adds MISSING keys](#pattern-i18n_generatorrb---merge-does-not-refresh-changed-english-into-existing-locale-placeholders--only-adds-missing-keys)
- [Pattern: a Shepherd popover anchored to an element that gets removed mid-transition is flung to the top-left (0,0) by floating-ui — snap it out instantly](#pattern-a-shepherd-popover-anchored-to-an-element-that-gets-removed-mid-transition-is-flung-to-the-top-left-00-by-floating-ui--snap-it-out-instantly)
- [Pattern: the app root font-size is 10px (62.5%) — `rem` font-sizes render at 62.5%; ALWAYS use px (or the $aac-font-size-* tokens), never rem](#pattern-the-app-root-font-size-is-10px-625--rem-font-sizes-render-at-625-always-use-px-or-the-aac-font-size--tokens-never-rem)
- [Pattern: a click-to-speak container that holds the inline word-prediction buttons CANNOT be `role="button"`](#pattern-a-click-to-speak-or-click-to-act-container-that-holds-the-inline-word-prediction-buttons-cannot-be-rolebutton)
- [Pattern: the speak row's left "stack" mirrors the right `actions-wrap--stacked` — build symmetric, use `flex: 1`](#pattern-the-speak-rows-left-stack-mirrors-the-right-actions-wrap--stacked--build-symmetric-use-flex-1)
- [Pattern: a child pinned by `parent > * { z-index: 1 }` traps ALL its descendants below higher-z siblings — raise the ROW, not the menu](#pattern-a-child-pinned-by-parent---z-index-1--traps-all-its-descendants-below-higher-z-siblings--raise-the-row-not-the-menu)
- [Pattern: auth-page (login/register) "content cut off / bg not full height" — page-bg must be a transparent box; mesh goes on the fixed full-viewport `#within_ember`](#pattern-auth-page-loginregister-content-cut-off--bg-not-full-height--page-bg-must-be-a-transparent-box-mesh-goes-on-the-fixed-full-viewport-within_ember)
- [Pattern: blank username suggestions must be discarded before `clean_path`](#pattern-blank-username-suggestions-must-be-discarded-before-clean_path)
- [Pattern: keyboard control vocalizations must survive translation overlay](#pattern-keyboard-control-vocalizations-must-survive-translation-overlay)
- [Pattern: per-user UI prefs must be read from `currentUser`, not the board-detail route's URL user](#pattern-per-user-ui-prefs-must-be-read-from-currentuser-not-the-board-detail-routes-url-user)
- [Pattern: `.md-board-collection__*` is a light-base panel reusable on any page; dark theme is ancestor-scoped](#pattern-md-board-collection-is-a-light-base-panel-reusable-on-any-page-dark-theme-is-ancestor-scoped)
- [Pattern: a new user preference is a 3-touch change — whitelist + default + dirty-bit save](#pattern-a-new-user-preference-is-a-3-touch-change--whitelist--default--dirty-bit-save)
- [Pattern: "order-dependent" spec failures on global counts are often orphaned committed rows in the test DB](#pattern-order-dependent-spec-failures-on-global-counts-are-often-orphaned-committed-rows-in-the-test-db)

## Pattern: a new user preference is a 3-touch change — whitelist + default + dirty-bit save

Adding any scalar `User` preference end-to-end always touches the same three
places — miss one and it silently fails:

1. **Whitelist** — add the key to `User::PREFERENCE_PARAMS` (app/models/user.rb ~1076).
   `process_params` only copies keys in this array; an un-whitelisted key is
   dropped with no error, so the value never persists.
2. **Default** — add to `User.preference_defaults['any_user']` (or
   `['authenticated_user']`). `generate_defaults` (before_save) backfills it only
   when the stored value is `nil`, so existing users get it on their next save.
3. **Frontend save** — read via `appState.currentUser.preferences.<key>`; to save:
   `user.set('preferences.<key>', v); user.set('preferences.device.updated', true); user.save();`
   The `device.updated` dirty bit is REQUIRED: `preferences` is `DS.attr('raw')`, and
   mutating a nested key does not reliably mark the attr dirty, so without it
   ember-data may not send the change. Canonical example: `set_board_view_style`
   in controllers/board/index.js.

For UI driven off the value, default in JS too (`|| 'dynamic'` + validate against a
known set) so nil/unknown never breaks render before the backend backfills. Applied
in 2026-06-08 dashboard_layout preference (md-grid--layout-* hook class).

**A preference value can be a hash, not just a scalar.** `process_params` stores a
whitelisted key's value verbatim (the `'true'`/`'false'` coercion only touches scalar
strings), and nested hashes under `preferences` already round-trip (`device`,
`substitutions`). So `dashboard_sections => {boards: true, extras: false}` works with
the same 3 touches. Treat **missing/`true` as the default-on state and only `=== false`
as "off"**, so sections/keys added later default visible for existing users.

**When two surfaces must agree on the same set (e.g. a settings modal that toggles
what a page renders), put the registry in ONE shared util, not in each component.**
2026-06-08 `utils/dashboard_sections.js` exports `HOME_SECTIONS` (key, cardClass,
labelKey, `available(user)`) consumed by both the dashboard render (`sectionVisibility`
computed) and the Getting Started modal (checkbox list + live-preview toggling) — so
availability rules and keys can't drift. Bonus: drive grid-layout modifier classes off
the *visibility* (available && !hidden), not raw availability, so hiding a section also
collapses its reserved grid area instead of leaving a gap.

**Gotcha — hiding a dashboard card via JS needs inline `!important`.** The Speak and
Caseload cards render two siblings (`--wide-only` / `--narrow-only`) switched by
`@media` rules that use `display: ... !important` (app.scss ~42246, ~47106). A plain
inline `el.style.display = 'none'` is beaten by that stylesheet `!important` and the
card stays visible. Use `el.style.setProperty('display','none','important')` to hide
(inline-important outranks stylesheet-important) and `el.style.removeProperty('display')`
to restore — the latter hands control back to the media rules so the correct variant
shows per viewport. Applied in the Getting Started live preview toggles.

**Gotcha — a clone of `.md-grid--dashboard` keeps the live grid modifier classes.** To
make a cloned-DOM preview reflow like the real page when a section is toggled, also
`classList.toggle('md-grid--with-caseload' / '--with-org-mgmt')` on the clone — hiding
the card alone leaves the reserved grid area empty.

**Pattern — when a `grid-template-areas` matrix grows combinatorial, make it a data map,
not CSS modifier classes.** The dashboard reflow (which cards show, where) started as one
CSS rule per visibility combination, selected by modifier classes with hand-tuned
specificity (`.md-grid--hide-speak.md-grid--with-caseload:not(.md-grid--with-org-mgmt)`,
source-order tiebreaks). That doesn't scale — every new rule has to out-rank the others,
and named areas don't auto-collapse when empty. Converted (2026-06-08) to a pure function
`utils/dashboard_sections.js#dashboardLayout(vis)` → `{areas[], rows}`, first-match-wins
branches, applied as an **inline `grid-template-areas` style** on `.md-grid--dashboard`
(htmlSafe computed on the real page; `style.setProperty(...,'important')` on the preview
clone). Inline-`!important` beats the base `.md-grid` stylesheet `!important`, so no
specificity management at all; adding a layout = adding one branch (the `areas` array IS
the doc). Keep the old modifier classes ONLY if they also drive non-layout styling
(`md-grid--with-caseload` restyles the Speak card). This is the standard dashboard-engine
approach (Grafana/react-grid-layout): layout is data, not per-combination CSS. Caveat:
inline styles can't carry media queries — fine here because the dashboard's areas are
viewport-independent (responsiveness is via the card wide/narrow variants, not the grid).

**Adding a new dashboard DISPLAY STYLE (dynamic/focused/balanced) is a 4-touch change,
and the cleanest form is a TRANSFORM over the canonical matrix — not a fork.** 2026-06-09
"Balanced" (Speak = full-width hero, Extras hidden) was added by: (1) a thin
`balancedLayout(vis)` in `utils/dashboard_sections.js` that strips the special cards from
`vis`, runs the SAME `dashboardLayout()` for the remainder, then stacks the hero row on
top — so any future card added to the matrix benefits the new style for free; (2)
`gridLayoutState(vis, positions, boards, layout)` gained an optional `layout` arg routing
to it; (3) every CALLER that should honor the style threads the layout through —
`authenticated-view#dashboardGrid` (real page) and `getting-started-tour#syncState`
(preview); (4) visual-only deltas (the hero's doubled height) go on the existing
`md-grid--layout-<style>` hook class — it's there for exactly this, and a fresh selector
means zero cascade management (verify it has no rules yet with `grep`). Two cross-cutting
gotchas: **(a)** a card the style EXCLUDES must be force-hidden in BOTH places that read
visibility (`sectionVisibility` forces `extras=false` for the real grid's `cardHideStyle`
AND the matrix; `syncState` forces `vis.extras=false` for the preview) or the excluded
card overflows the grid as an orphan; **(b)** the preview clone inherits the live grid's
`md-grid--layout-*` class frozen at modal-open, so `syncState` must RE-STAMP the layout
class on the clone when the user switches styles, else the layout-scoped CSS won't apply
to the preview. Don't mutate the user's per-section prefs to express the exclusion — let
the layout override it so switching back to Dynamic restores their Extras choice.

## Pattern: blank username suggestions must be discarded before `clean_path`

`Processable#generate_user_name` treats an explicit suggestion as authoritative unless it is blanked out first. Passing `''` from signup/default-generation paths reaches `clean_path('')`, which pads to `___` instead of falling back to email or `"person"`. Normalize blank suggestions to `nil` before choosing the fallback source, and keep a regression spec in `spec/models/concerns/processable_spec.rb`.

**First seen in:** [2026-06-03-staged-registration-flow.md](./2026-06-03-staged-registration-flow.md)

## Pattern: keyboard control vocalizations must survive translation overlay

Keyboard boards use vocalizations as control protocols: `+a` composes spelling, `:space` completes the in-progress word, and `:shift` toggles capitalization. `Board#translated_buttons` must not replace those `:`/`+` vocalizations with visible labels when label and vocalization locales match, or controls start speaking words like “space”/“shift” and letters stop composing. If `lingolinq/keyboard` has stale locale metadata, default it back to English when no user locale or Switch Languages override exists, and repair the content board through `SystemSidebarBoards.ensure_for`.

**First seen in:** [2026-06-03-keyboard-shift-space-default-language.md](./2026-06-03-keyboard-shift-space-default-language.md)

## Pattern: Word prediction locale has three layers — display locale, board locale, cache/sync locale

Word predictions should follow the visible label language first (`app_state.label_locale`), then fall back to the board model's `locale`. Translated boards can display Spanish while the underlying board record still reports English, so using `model.locale` first sends English AI requests. When changing prediction language behavior, update all three layers together: controller lookup locale, AI client cache key, and `record_selection` sync/telemetry locale. The local ngram/helper corpus in `app/frontend/app/utils/word_suggestions.js` is English-only, so non-English prediction lookup should keep vocabulary prefix matches but skip English fallback suggestions. For non-English locales without AI, add translation-aware vocabulary suggestions from warmed button sets (`collect_vocabulary_next_words`) and pass `translations` + `board_locale` into lookup options so Spanish labels resolve from the board translations blob, not raw English button text.

## Pattern: Translated board names must not rename route keys

Board-detail has `_auto_rename_board`, which POSTs `/rename` when `board.name` changes after save. Translation also changes `board.name` when a localized board name becomes visible/default, so auto-rename must skip names that match `translations.board_name`; otherwise canonical URLs like `crisis-vocabulary` become localized slugs like `vocabulario-de-crisis`. Existing accidental renames should resolve through `OldKey` by using `Board.find_by_possibly_old_path` in board-detail API lookups.

## Pattern: Demo speak `board` query param must alias away from loaded board state

`demo.speak` uses controller property `board` for the rendered board object. If a shareable URL needs `?board=...`, declare an aliased query param such as `{ board_key: 'board' }` and use `board_key` internally. Reusing `board` for both the query param and model state will clobber the loaded board object.

**Sticky QP gotcha:** `board` is sticky by default. Topbar "Try a Demo" links must pass `@query={{hash board=null source=null}}`, and the route should only honor `?board=...` when `source=offline_boards` (offline picker). Otherwise always load manifest root (`public/demo-boards/manifest.json` → Project Core 36). First seen in [2026-06-07-demo-try-default-board.md](./2026-06-07-demo-try-default-board.md).

**Exit target:** Demo speak exit should always `LinkTo offline_boards` — do not branch on `source`; "Try a Demo" used to fall through to `index`.

## Pattern: phased board prefetch — shared planner, dual persistence files

**Surface:** session navigation cache (`board_detail_cache.js`) and offline IndexedDB sync (`sync_boards`).

**Approach:** [`board_prefetch_planner.js`](../../app/frontend/app/utils/board_prefetch_planner.js) enumerates roots in priority order (home → liked → owned → public). Session cache runs `/tree` per root via `_run_prefetch_pipeline`; offline sync seeds the BFS queue with the same lookups via `lookupsToSyncSeeds`.

**Gotcha:** `sync_boards` exists in **both** [`app/utils/persistence.js`](../../app/frontend/app/utils/persistence.js) and [`app/services/persistence.js`](../../app/frontend/app/services/persistence.js). Runtime sync uses `window.persistence` (the service). Any offline-sync change must be applied to **both** files or offline behavior won't match.

**Flags:** Phase 1 (home) is unconditional; phases 2–4 run when `background_board_prefetch` is enabled (shipped in `ENABLED_FRONTEND_FEATURES`). Phase 4 also honors legacy `catalog_board_prefetch`.

**First seen in:** [2026-05-30-phased-online-board-caching.md](./2026-05-30-phased-online-board-caching.md)

## Pattern: supervisor caseload session prefetch reuses board_detail_cache, not offline sync

**Surface:** fast online navigation cache in [`board_detail_cache.js`](../../app/frontend/app/utils/board_detail_cache.js).

Supervisor caseload warming should call the existing phased `_run_prefetch_pipeline` for supervisee user records. Keep it online-only, visible-tab-only, bounded, and deduped per supervisor/supervisee pair; do not change `persistence.sync_boards` unless the request is specifically about persistent offline availability.

**Gotcha:** supervisee summaries from `currentUser.supervisees` may only contain ids/user names. Load the full `user` record before planning roots when possible, then fall back to a summary wrapper.

**First seen in:** [2026-06-02-supervisor-caseload-session-prefetch.md](./2026-06-02-supervisor-caseload-session-prefetch.md)

## Pattern: encrypted buttonset JSON cache must carry parsed payloads

**Surface:** `store_url_now` / `store_json` / `find_json` in both [`app/services/persistence.js`](../../app/frontend/app/services/persistence.js) and [`app/utils/persistence.js`](../../app/frontend/app/utils/persistence.js), especially downstream `BoardDownstreamButtonSet` JSON used by Translate and board hierarchy loading.

**Gotcha:** The network/decrypt path can succeed while the cache path fails later. Do not make parsed JSON depend on a `data_uri` re-encode or filesystem write: Unicode labels and large buttonsets can make `btoa(JSON.stringify(...))` fragile, and local filesystem rejection should not block JSON consumers. Carry `json_payload` through the cache object, read it directly from `store_json`/`find_json`, and keep `buttonset.load_buttons` able to fall back to `remote_json` when cache persistence rejects.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

## Pattern: remote buttonset reload can wipe generate URL before second load_buttons

**Surface:** `board.load_button_set` → `Buttonset.load_button_set` → `load_buttons`, especially Translate modal / `BoardHierarchy.load_with_button_set`.

**Gotcha:** `load_button_set` already completes `load_buttons` on success paths. A follow-up `buttonset.reload()` for freshness replaces the Ember record with API JSON that omits inline `buttons` (remote mode) and may omit `root_url` when `url_for` is not ready — even though `/generate` just returned a working S3 URL. The second `load_buttons` then rejects `{error: 'root url not available'}`. Skip redundant reload when `buttons_loaded` is set; apply generate URLs **after** reload; add a `remote_enabled` fallback to `load_button_set(..., skipEmberRecordReload=true)`.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

## Pattern: button_set per-button locale can stale — translate modal must use board locale

**Surface:** `components/button-set.js` `_startTranslating`, `/api/v1/users/self/translate`.

**Gotcha:** `BoardDownstreamButtonSet` embeds `'locale' => board.settings['locale']` at generation time. That tag can lag `board.locale` or reflect destination metadata while labels stay in the source language. Grouping translate batches by `b.locale` then sends `source_lang === destination_lang`, Google echoes, and the echo filter drops every result — only words using `board.locale` (e.g. board name) get translations.

**Fix recipe:** For the translate review modal, derive `source_lang` from each button's `board_id` → current board record locale; for the root board always use `model.board.locale`. Do not trust button_set snapshot locale alone.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

## Pattern: translate Accept must persist via Resque and a full save payload

**Surface:** `components/button-set.js` `save_translations`, `POST /api/v1/boards/:id/translate`, Switch Language / `board.locales`.

**Gotcha:** Accept is two steps — AJAX POST then background `translate_set`. If Resque is not running locally, progress never finishes and nothing is stored (`translated_locales` stays English-only). Separately, `save_translations` must merge auto-translate dict + row edits; row-only payload can be empty even when the review UI looked filled.

**Fix recipe:** Merge `_this.get('translations')` with per-row fields before POST; guard against zero button keys; verify progress reaches `finished`; bump `board_reload_key` and reload board before language modals.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

## Pattern: translate linked-board scope needs button_set.buttons, not root board.buttons fallback

**Surface:** Translate Boards hierarchy + `components/button-set.js`.

**Gotcha:** Hierarchy selection passes `board_ids_to_translate` for whole-set translation, but when `button_set.buttons` is empty the modal falls back to `model.board.buttons` (root only). Linked boards never appear in review or save. Strict `board_ids.indexOf(b.board_id)` also drops rows when id string formats differ.

**Fix recipe:** Shared `_buttons_for_translate()` for review + auto-translate; normalize ids with `String()`; refuse root-only fallback when linked boards are selected; surface `load_buttons` failure instead of swallowing it.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

## Pattern: progress polling stops on finished_at — handlers must not require status === 'finished' alone

**Surface:** `progress_tracker.js`, translate Accept / Switch Language flows, any `progress_tracker.track` consumer.

**Gotcha:** `check()` stops rescheduling when `finished_at` is present. Consumers that only run success UI when `event.status === 'finished'` miss completion if the API returns `finished_at` before `settings.state` reads `'finished'` (or normalizes inconsistently). Polling correctly halts; modal stays on "Accepting…" and `board_reload_key` never fires — user refreshes and sees saved server data.

**Fix recipe:** Use shared `progress_tracker.is_finished(event)` (`status === 'finished' || finished_at`). Normalize in `_normalize_progress`. Match buttonset.js pattern. Store `track_id` and `untrack` on terminal.

**First seen in:** [2026-05-30-board-translation-fixes.md](./2026-05-30-board-translation-fixes.md)

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

**Same trap in `.js`, via WRAPPER HELPERS — not just `.hbs` bound keys.**
The generator's `.js` scanner (`i18n_generator.rb:84`) only matches a
LITERAL `i18n.t(` token. A key passed through a wrapper — e.g.
`decoratedTitle('home_tour_welcome_title', "Welcome")` in the Shepherd
tours (`utils/tours/*.js`), where `decoratedTitle` internally calls
`i18n.t(headingKey, ...)` with a VARIABLE — is invisible to the scanner.
Result: the key never reaches `en.json` and falls back to its English
default in every locale, even though it renders fine in English. (Verified
2026-06-14: `home_tour_welcome_title` / `home_tour_done_title` are absent
from `en.json` for exactly this reason.) The remedy is identical — a
`_<feature>_i18n_extractor_no_op()` function in the same file listing each
wrapped key as a literal `i18n.t('key', "Default")`; see
[`utils/tours/board-picker.js`](../app/frontend/app/utils/tours/board-picker.js)
(`_board_picker_tour_i18n_extractor_no_op`). Rule: any key you hand to a
wrapper that calls `i18n.t` with a non-literal needs an extractor line.

**Diagnostic shortcut:** if a catalog-driven UI works fine in
English but a non-English locale shows the English default-label
string instead of the localized one, suspect the dynamic-key
extraction failure first. Run `ruby i18n_generator.rb` and check
its output for missing strings — TOTAL MISSING is the parser's
own count of keys it found but couldn't pair with a string. (Or just
`grep -c your_key public/locales/en.json` — 0 means it wasn't extracted.)

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

**Extension (2026-06-11):** It's not just *counts* — any TILE-LIST surface
leaks sub-boards the same way. Two that did:
- Home Boards-div preview (`previewBoards` on authenticated-view.js) built
  its 5 tiles straight off `_fetchedPreviewBoards` (raw `store.query`) with
  no clustering — only the sibling `boardCount` filtered. Wrap the pool in
  `filterRootBoards` inside the computed.
- Board-detail "My Board Collection" (`board-collection.js`) trusted the
  server `root: true` param.

**Do NOT trust server `root: true`.** In `app/controllers/api/boards_controller.rb`
(~L299) the real copy_id filter is COMMENTED OUT (since 2020) and replaced
with `boards.where(['search_string ILIKE ?', "%root%"])` — a text match on
the word "root", which leaks sub-boards AND drops legit roots. Until that's
fixed server-side, do client-side clustering: drop the param, paginate the
full owned set via `meta.more`, then `filterRootBoards` the accumulation
(it's first-page-sensitive, so cluster the WHOLE set, not page 1).

**First seen in:** [2026-06-11-subboards-leaking-preview-and-collection.md](./2026-06-11-subboards-leaking-preview-and-collection.md)

**Extension (2026-06-12) — the boards-page Public tab:** `board_list`
(controllers/user/index.js) has its OWN id/copy_id clustering, but it only
nests a sub-board under its root when the root is in the SAME list. The Public
tab's source (`model.public_boards`, a public search) returns sub-board copies
whose root isn't in the list, so they leaked through as top-level tiles — plus
multiple owners' identically-named copies. Fix: flag the Public branch and run
the accumulated list through `dedupeByName(filterRootBoards(list, model.id))`
before the existing grouping/sort (preserve `.done`). `public_boards` is fully
paginated by `generate_or_append_to_list`, so clustering isn't first-page-
sensitive here. Mine-tab clustering left untouched. Same primitives search.js
uses for online results: `sortByNameNatural(dedupeByName(filterRootBoards(...)))`.

**First seen in:** [2026-06-12-public-tab-subboards-leak.md](./2026-06-12-public-tab-subboards-leak.md)

**Extension (2026-06-12) — copy_id-less sub-boards need the BRAND key-pattern, not just `filterRootBoards`:** `filterRootBoards` keys ENTIRELY on `copy_id`. Legacy/un-clustered set copies (e.g. an account's CommuniKate pages) often have **no `copy_id` in the DB** (`relinking.rb#assert_copy_id`/`cluster_related_boards` exist precisely to back-fill it and frequently don't), so the serializer omits it and EVERY sub-board reads as a root — leaking on the boards-page Mine + Public tabs AND the speak-menu My Boards, all of which share that heuristic. The fix that works regardless of copy_id is `utils/board-brands.js#filterBrandRoots`: a board matching a brand family's `test()` (brand marker in key/name) but NOT its `root_re` (`<brand>-<size>` root shape) is a brand sub-board → drop it; non-brand boards pass. This is the same key-pattern classifier the Find Boards grouping + the speak-menu brand sections use. Compose as `filterBrandRoots(filterRootBoards(list, userId))` (+ `dedupeByName` for public search). Applied in `controllers/user/index.js` (board_list Mine+Public, myBoardsRoots) and `components/board-collection.js` (_sortMyBoards). LIMITATION: only the 4 known brands (CommuniKate/Quick Core/Sequoia/Vocal Flair); non-brand sets with nil copy_id still leak — the robust general fix is a server-computed `root` flag (board.rb `!copy_id || copy_id==global_id`, falling back to "no same-user immediately-upstream boards"). The boards-page `root: true` server param is ALSO broken (real filter commented out, replaced by `search_string ILIKE '%root%'` — boards_controller.rb:299).

**First seen in:** [2026-06-12-subboards-brand-root-filter.md](./2026-06-12-subboards-brand-root-filter.md)

---

## Pattern: image drag-drop onto a button — reuse `save_image_preview`, swap the target

**Surface:** board-detail edit mode (`content_grabbers.apply_dropped_image_to_button`) and create-board-new (`components/create-board-new.js`).

The board-detail image-drop pipeline is: global `drop` listener (`services/content-grabbers.js:3050`) → `content_dropped(button_id, dataTransfer)` (bails unless `appState.edit_mode`) → `apply_dropped_image_to_button` = `read_file`→dataURL → `pictureGrabber.save_image_preview(preview)` (uploads, returns a SAVED image record with a hosted `.url`) → `editManager.change_button`. To get the same gesture on a surface WITHOUT a live board/editManager/`.button[data-id]`/edit_mode (e.g. create-board-new, where buttons are plain objects keyed by label in `_label_images`), reuse the two board-agnostic primitives — `content_grabbers.read_file` + `pictureGrabber.save_image_preview` — and write the returned `image.get('url')` into that surface's own button state instead of calling `change_button`. Don't touch the shared service.

Gotchas: (1) Distinguish an external image drag from an internal HTML5 reorder drag by payload — reorder carries only `text/plain`; an image carries a `File`/`Files` type (during dragover files aren't readable yet, so check `dataTransfer.types` includes `Files`) or, cross-tab, `text/uri-list`/`<img>`-in-`text/html`. (2) The tile's own `ondrop`/`ondragover` must `stopPropagation` or the global document drop handler also fires. (3) Only persist a hosted URL (await `save_image_preview`) — never bake a `data:` URL into the saved board. (4) `dragover` must `preventDefault` on the target for `drop` to fire at all; set `dropEffect:'none'` to reject (e.g. blank cells when images are label-keyed).

**Evidence:** task log `2026-06-12-create-board-new-image-drop.md`.

**GOTCHA (do NOT "optimize"):** For create-board-new, bake the image **URL** onto
`model.buttons[]`, never the saved image's `image_id`. `save_image_preview` creates
a PRIVATE, unlinked ButtonImage (`license: {type:'private'}`, no `public:true`);
linking it by `image_id` shows in the create preview but renders BLANK on the board
page and bypasses caching. The server's `process_client_supplied_images`
(board.rb:1262) only runs when `image_id` is blank — it creates a fresh
`public:true`, board-owned ButtonImage from the URL (`process_new`, handles `data:`
URLs → `ButtonImage.data`) and wires it into the after-save `map_images` cache. The
"duplicate ButtonImage" from URL-baking is the intended trade-off for correct
rendering + caching. (Burned once 2026-06-12 by an image_id "efficiency fix"; reverted.)

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
- **A CENTERED step (welcome/outro, no `attachTo`) tags `<body>` with
  `.shepherd-target`.** Shepherd uses `target = this.target || document.body`
  (shepherd.cjs `setupTooltip` ~L2343 + `showStep` ~L4780), so any styling on
  the `.shepherd-target` class lands on `<body>` for those steps. Our spotlight
  GLOW is `.shepherd-target { filter: drop-shadow(...) }` — a `filter` on
  `<body>` BLANKS the whole viewport white on any route whose body has an opaque
  background (e.g. `/board-picker`): Chrome stops propagating the body
  background to the canvas and the white body box paints over everything. The
  home/dashboard route survives only because its body background isn't opaque
  white — a latent trap that a new route trips. **Durable rule: scope target-only
  decoration as `.shepherd-target:not(body)`** (the glow on body is invisible
  anyway — it sits behind the dark modal overlay). Symptom to recognise: tour
  opens with correct content in the DOM (steps present, `current_route` right),
  but the page paints pure white and `elementFromPoint(center)` returns only
  `<html>`. Check `getComputedStyle(document.body).filter` ≠ `none`. First seen:
  board-picker tour, 2026-06-14 (`2026-06-14-board-picker-tour.md`).
- **A step attached to a target TALLER than the viewport makes the popover
  "bounce" + the page "freeze" on scroll.** floating-ui's `flip()` switches the
  popover between `top`/`bottom` as the scroll changes how much room is above vs.
  below a near-viewport-height reference — a ~500px jump per flip. The modal
  overlay also swallows wheel events (the "freeze"). Fix (applied in
  guided-tour.js `_lockTourScroll`/`_unlockTourScroll`): LOCK page scroll while
  the tour runs — `overflow:hidden` on `#content` + `body` + `documentElement`,
  restored on complete/cancel/destroy. A modal tour drives the view itself, and
  crucially `overflow:hidden` blocks user wheel/scrollbar but NOT programmatic
  scroll, so Shepherd's per-step `scrollIntoView` still centers each target
  (verified: scrollIntoView scrolls an overflow:hidden `#content`, 0→712). This
  is the standard modal-tour behavior and fixes every tour, not just the one with
  the tall target. First seen: board-picker grid step, 2026-06-14.
- **Step-to-step "jump" that disorients users = inconsistent placement + instant
  scroll.** When popovers land on different SIDES per step (bottom→right→top) and
  the page scroll is `behavior:'auto'` (instant), users lose track of where they
  are (a tester nearly abandoned the board-picker tour over this). Fix: (a) give
  every interior step the SAME placement (`on:'bottom'` — popover always directly
  below the spotlight, tour reads straight down the page); (b) `scrollTo:
  {behavior:'smooth', ...}` per-step so the spotlight glides — and because
  floating-ui `autoUpdate` repositions during the animated scroll, the popover
  GLIDES with it. Uniform placement also KILLS the smooth-scroll flip-flash (the
  original reason for instant scroll) because a locked placement never flips, so
  smooth + consistent can coexist. Scope smooth to the one tour via per-step
  `scrollTo` if other tours rely on instant. Tall targets need `block:'start'`
  for the below-popover to fit; pair with `el.style.scrollMarginTop = navBottom +
  gap` (measure the fixed header live) so the scroll doesn't tuck the target under
  the navbar. First seen: board-picker tour, 2026-06-14.
- **Smooth scroll re-introduces the flip-FLASH (popover flashes top→bottom);
  fix = scroll BEFORE show, not after.** Shepherd's `scrollTo` runs AFTER the
  step shows, so the popover is positioned mid-animation and floating-ui `flip()`
  re-picks the side each frame as the target moves (low→centered) = visible
  flash. You CANNOT remove `flip()` via `floatingUIOptions.middleware`: Shepherd
  merges it with **deepmerge-ts**, which CONCATENATES arrays, so your list
  appends to `[flip(), shift(), arrow()]` instead of replacing. Instead set the
  step's `scrollTo:false` and do the scroll in `beforeShowPromise`, resolving
  once motion settles (poll the target's `getBoundingClientRect().top` until
  steady). `Tour._updateStateBeforeShow()` hides the previous step before
  `beforeShowPromise` runs, so during the scroll no popover is positioned and the
  new one is placed ONCE at the final spot — smooth scroll, zero flash. Detect a
  flash in tests by sampling the visible `.shepherd-element[data-popper-placement]`
  every ~30ms across a transition: it should go `none…` (scrolling) → final side,
  never the opposite side first. First seen: board-picker tabs step, 2026-06-14.
  PROMOTED to the runner (`guided-tour.js _applySmoothScroll`) so EVERY tour gets
  scroll-then-show from one place: before `addSteps`, each attached step gets
  `scrollTo:false` + an injected `beforeShowPromise` (composed with any existing
  one, e.g. home's dropdown-open) that calls the shared `scrollIntoViewSettled`.
  That helper has a fast-path (already fully on-screen → resolve now, no dead
  time) — but a fast-path SKIP means no centering, so a target whose preferred
  side only fits when centered will flip to the other side. If a tour needs a
  uniform placement, set `step.scrollBlock` to FORCE the scroll (board-picker sets
  it on every step for uniform 'bottom'); leave it off (home) to let the fast-path
  trim motion where placements are mixed anyway.
- **"Scroll then show" makes the screen FLASH BRIGHT between steps** — fix by
  keeping the scrim up during the scroll. `Tour.show()` hides the old step first,
  and `Step.hide()` calls `modal.hide()`, so the dark overlay is gone for the whole
  `beforeShowPromise` scroll → the page shows at full brightness until the next
  step re-darkens it. In the injected beforeShowPromise (runs right after the old
  step hid), re-show a FLAT scrim before scrolling: `modal.closeModalOpening()`
  (zero the opening) + `modal.show()`; the incoming step's `setupForStep` re-cuts
  the spotlight on show. Get the modal via a captured `tour.tourObject.modal` —
  Shepherd invokes `beforeShowPromise` with `this` = the step OPTIONS object, not
  the Step, so `this.tour` is undefined. Verify by sampling
  `.shepherd-modal-overlay-container.shepherd-modal-is-visible` (+ opacity>0) every
  ~30ms across a transition: should be visible 100% of frames, no gap. First seen:
  2026-06-14.
- **FINAL tour-transition model (supersedes "scroll then show"): "show then scroll,
  spotlight visible, popover hidden."** The modern feel users expect = the dimmed
  page + its spotlight stay VISIBLE and the next item GLIDES into the highlight
  (page = constant spatial reference). "Scroll then show" (scroll with the spotlight
  gone, reveal after) is the opposite and feels disorienting. Implement at the
  runner: (1) `step.scrollTo=false`; do the smooth scroll in the `when.show` hook
  AFTER the step shows, so Shepherd's translucent overlay + rAF-tracked spotlight
  follow the target as it scrolls in. (2) Hide ONLY the popover card during that
  motion via a class — `visibility:hidden; opacity:0; transition:none` (visibility,
  not just opacity, else Shepherd's opacity transition fades it visible mid-scroll);
  remove on settle to fade it in. This dodges floating-ui's flip-flash while keeping
  the page in view. (3) Keep the scrim continuous across hide→show: `beforeShowPromise`
  calls `modal.show()` (NOT closeModalOpening) before Svelte flushes, so it never
  blinks bright. Verify: overlay opacity steady; popover visibility:hidden every
  scrolling frame then visible; cutout path varies (tracking). First seen: 2026-06-14.
- **A keyframe ENTRANCE animation silently blocks opacity fades (and is the hidden
  "slide-in").** Symptom: a plain inline `opacity:0` computes to `1`, but
  `opacity:0 !important` computes to `0`, AND no `!important` rule matches the
  element. That's an `@keyframes` with `animation-fill-mode: both/forwards` holding
  the property — animations outrank regular inline styles but lose to `!important`
  inline. The LingoLinq tour card had `md-tour-step-in` (`opacity 0→1` + `translate`
  + `scale`, fill:both): the translate/scale was the unwanted slide-in, and the
  held opacity:1 made fade-out impossible. Fix for "gentle cross-fade, no slide":
  DELETE the keyframe entrance and drive opacity with transitions only —
  `.shepherd-element { transition: opacity .45s }`, fade-in by toggling a
  visibility:hidden→visible "revealing" class on a double-rAF (so opacity:0 paints
  before transitioning to 1), fade-out by inline opacity on the step `hide` hook.
  For a slow/visible AAC scroll, replace `scrollIntoView({behavior:'smooth'})`
  (browser-paced, ~300ms) with a custom eased rAF scroll (~900ms) on the app's
  scroll pane — detect it by scrollability (scrollHeight>clientHeight), NOT
  overflow, since the tour locks it to overflow:hidden; respect
  prefers-reduced-motion (jump instantly). Headless gotcha: puppeteer defaults to
  prefers-reduced-motion:reduce, so emulate `no-preference` to test animated paths
  — otherwise fades/scrolls read as instant and look "broken." First seen: 2026-06-14.
- **Need a LIVE/interactive Ember component inside a tour "card"? Use an app modal,
  not Shepherd.** Shepherd renders a step's `text` as innerHTML or a detached
  HTMLElement, and Ember 3.28 has no imperative `renderComponent`, so you can't
  embed a reactive component in a popover. Instead, the final/interactive step's
  button does `this.complete(); modal.open('your-modal', {})` — complete FIRST so
  the Shepherd overlay tears down before the app modal opens (two body-level
  overlays otherwise collide). App modals here: build a `components/<name>.{js,hbs}`
  (wrap body in `{{#modal-dialog dialogClass=...}}`, read opts via
  `modal.getSettingsFor('<name>')`), add a `{{else if (is-equal this.currentTemplate
  "<name>")}} {{<name>}}` branch in `templates/components/modal-container.hbs`, open
  with `modal.open('<name>', opts)`. To "carry context across a navigation" (e.g.
  tour modal → create-board-new), set a one-shot flag on `app-state`
  (`appState.set('from_tour_board_picker', true)`), read it in the destination
  component's `init`, and clear it in the destination ROUTE's `deactivate` so it
  can't leak to a later non-tour visit. First seen: board-picker tour final step,
  2026-06-14.
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

## Pattern: the app root font-size is 10px (62.5%) — `rem` font-sizes render at 62.5%; ALWAYS use px (or the $aac-font-size-* tokens), never rem

**The trap:** This app sets the root `html` font-size to **10px** (the classic
`62.5%` of the 16px default — see the `html:has(#within_ember…)` rules ~app.scss
8277/8284, and many `font-size: 10px` anchors). So **`1rem` = 10px, not 16px.**
A rule written `font-size: 1.05rem` renders at **10.5px**, `1rem` at **10px** —
roughly two-thirds of what you'd expect. That's why the `$aac-font-size-*`
design tokens are all in **px** (`xs/sm: 14px`, `base: 15px`, `md: 18px`).

**How it bit (3 rounds on the beta-welcome pages):** the staging beta CSS used
`rem` font-sizes (`1rem`, `1.05rem`, `1.08rem`, `1.18rem`) assuming a 16px root,
so all body copy rendered at ~10–12px. Worse: an audit that "verified nothing is
below 14px" computed `rem × 16` — **wrong**, because the root is 10px. The audit
passed while the real rendered text was ~10px. Only DevTools (showing `1.18rem` →
**11.8px**) exposed it.

**Rules:**
1. **Never use `rem` for `font-size`** in this codebase. Use **px** literals or
   the `$aac-font-size-*` tokens. (`em` is fine where parent-relative scaling is
   intended, but watch the cascade.)
2. When auditing font sizes, **don't assume a 16px root** — `rem×16` is wrong
   here. Verify against the actual 10px root, or just confirm everything is px.
3. clamp()/px/vw values are root-independent and render as written — safe.

**First seen in:** [2026-05-30-beta-welcome-premium-redesign.md](./2026-05-30-beta-welcome-premium-redesign.md)

---

## Pattern: Signup default library boards — copy via Progress, not copy_to_home_board

**Surface:** new user registration (email or Google SSO).

**Requirement:** Give every new communicator owned copies of curated vocab boards in **My Boards** without setting `preferences.home_board`.

**Root cause to avoid:** `User#copy_to_home_board` always writes `preferences.home_board` — wrong tool for library-only provisioning.

**Fix recipe:** Add `User#copy_board_to_library` (`copy_for` + `copy_board_links`, no home pref). Schedule one Progress job per slug in `SystemBoardSources::SIGNUP_LIBRARY_SLUGS` via `Progress.schedule(user, :copy_board_to_library, …, for_user: user)` from `UserBoardProvisioner` after save. Source boards live on the `lingolinq` content user (`SystemBoardSources`); import with `VOCABULARY_USER_NAME=lingolinq bundle exec rake openaac:import_vocabularies`. Gate with `FeatureFlags.signup_default_library_boards_enabled?`.

**Evidence:** `lib/user_board_provisioner.rb`, `lib/system_board_sources.rb`, `app/models/user.rb`; task log `2026-05-28-signup-default-library-boards.md`.

---

## Pattern: custom lingolinq content boards — commit OBZ + `SystemBoardSources.ensure_*`

**Surface:** a public board on the `lingolinq` account that must exist in fresh DBs, appear in `User.default_sidebar_boards`, and optionally copy on signup.

**Fix recipe:** Export with `Converters::LingoLinq.to_obz` → `public/system-boards/<slug>.obz`. Add slug to `SIGNUP_LIBRARY_SLUGS` if signup should copy it. Implement idempotent `ensure_<slug>!` via `from_obz` (mirror `openaac:import_vocabularies` post-import: public root, `generate_stats`, `save!` button set). Wire `db:seed` and optional `rake lingolinq:ensure_<slug>`. Sidebar defaults reference `SystemBoardSources.board_key(slug)` (public key), not the user's copy.

**Evidence:** `lib/system_board_sources.rb`, `public/system-boards/crisis-vocabulary.obz`, task log `2026-06-01-crisis-vocabulary-defaults.md`.

---

## Pattern: beta seed baseline belongs to `lingolinq`, demo analytics are opt-in

**Surface:** fresh beta/local DB setup through `db/seeds.rb`.

Default seeds should create beta-critical public/system data (`lingolinq`, `lingolinq_admin`, admin org membership, starter boards, templates) without generating demo district users or analytics logs. Legacy `example` content that is meant to be public starter content should be recreated under `lingolinq/*`; true demo data (sample logs, rooms, demo district users, report history) should require an explicit opt-in such as `SEED_DEMO_DATA=1`. Verify fresh DB readiness with `rake lingolinq:verify_beta_seed`, using `REQUIRE_LIBRARY_BOARDS=false` only before OpenAAC/manual system-board imports have run.

**Evidence:** `lib/beta_seed.rb`, `db/seeds.rb`, `lib/tasks/lingolinq.rake`; task log `2026-06-04-beta-fresh-db-seeds.md`.

---

## Pattern: accessibility QA accounts are opt-in, separate from demo district

**Surface:** eye-gaze and switch-scanning test accounts for manual QA.

Use `SEED_ACCESSIBILITY_USERS=1` on `db:seed` or `rake lingolinq:seed_accessibility_users` to create `lingolinq-eyegaze` and `lingolinq-switchuser` with pre-set device prefs and public action-heavy boards. These are **not** part of `BetaSeed.verify_beta_seed` or `SEED_DEMO_DATA`. Passwords: `SEED_EYE_GAZE_PASSWORD`, `SEED_SWITCH_USER_PASSWORD` (required in production/staging).

**Evidence:** `lib/accessibility_seed.rb`, `db/seeds.rb`, `lib/tasks/lingolinq.rake`; task log `2026-06-08-accessibility-user-seeds.md`.

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

---

## Pattern: compile `app.scss` standalone with dart-sass to catch SCSS errors without a full ember build

**Surface:** any SCSS-only change to `app/frontend/app/styles/app.scss` (or its partials). A full `ember build` to validate one selector edit is slow.

**Technique:** dart-sass ships in the frontend `node_modules`. Compile the whole stylesheet with its `@use` load path and throw away the output:

```bash
cd app/frontend
npx --no-install sass --no-source-map --load-path=app/styles app/styles/app.scss /dev/null
```

`--no-source-map` matters with a `/dev/null` target: without it dart-sass tries to write `/dev/null.map` and exits 66 (permission denied) even though the stylesheet compiled fine. Exit 0 = the SCSS parses and all `@use`'d tokens/functions resolve (`$brand-*`, `color.adjust`, `clamp`, multi-layer `background`, etc.). Exit non-zero prints the file:line of the syntax/var error. Catches the common breakages (typo'd `$var`, unbalanced braces, mixed-unit `calc` issues) in ~1s. Note: this is a *syntax* gate, not a visual one — it won't catch cascade/specificity problems, only that the file compiles.

**Evidence:** task log `2026-05-30-beta-feedback-section-redesign.md`.

---

## Pattern: gate hover motion behind `prefers-reduced-motion: no-preference` instead of an `!important` reduced-motion override

**Surface:** AAC-friendly hover affordances (cards, list rows) that should lift/translate on hover but must respect reduced-motion users.

**Anti-pattern:** add the `transform`/`transition` unconditionally, then cancel it in a `@media (prefers-reduced-motion: reduce)` block with `transform: none !important; transition: none !important;`. This needs `!important` to beat the `:hover` rule and litters the file with override blocks (CLAUDE.md Rule #0.7 discourages `!important` cascade patches).

**Better:** keep the base + non-motion hover styling (color/shadow brightening) always-on, and put ONLY the movement inside `@media (prefers-reduced-motion: no-preference)`:

```scss
.card { /* base + glass */
  &:hover { background: …brighter…; box-shadow: …stronger…; } /* depth, no motion */
}
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: transform 180ms ease, box-shadow 220ms ease;
    &:hover { transform: translateY(-2px); }
  }
}
```

Reduced-motion users get the hover depth with zero movement; everyone else gets the lift. No `!important`, no override block. Keep motion calm (no scale/bounce/spring) for AAC.

**Note:** the original live example (`.beta-welcome-mission`) was later removed when that checklist was switched to a static, no-hover treatment — so this is a technique to reach for, not a selector to copy. The reusable point stands: gate motion with `no-preference` rather than cancelling it with a `reduce` + `!important` override.

**Evidence:** task log `2026-05-30-beta-feedback-section-redesign.md`.

---

## Gotcha: the board-detail "speak page" and "edit page" are ONE route/controller/template gated by `edit_mode`

**Surface:** any work that treats board-detail speak mode and edit mode as separable (extraction, reuse, refactor).

**Reality (verified 2026-05-31):**
- The page is the `user/board-detail` route: `app/frontend/app/templates/user/board-detail.hbs` (~3,535 lines) + `app/frontend/app/controllers/user/board-detail.js` (~7,127 lines) + `routes/user/board-detail.js` (~468 lines).
- Speak vs edit is NOT two pages — it's one template + one controller branched by an `edit_mode` flag (~19 `edit_mode` branches in the template, ~38 in the controller). The grid, sentence/speak bar, header, and board-loading machinery are shared.
- The button grid is already its own component: `board-detail-grid` (`board-detail.hbs:2051`). The hard-to-reuse part is the *behavior* in the route controller, not the markup.
- Landmarks: options menu = `.md-board-detail-actions-menu` / `toggle_options_menu` (`board-detail.hbs:792-825`); header = `md-board-detail-header` (:1319); edit left panel = `md-board-edit-panel` (:153); left nav sidebar = `md-board-detail-sidebar` (:84).
- Controller is route-coupled: ~57 `transitionTo*`/`this.send`/etc. calls; `setupController` (routes/user/board-detail.js:206-264) seeds the initial UI state (`edit_mode`, `show_options_menu`, `paint_mode`, …).

**Implication:** To make board-detail reusable, relocate the WHOLE thing (both modes) into one classic `@ember/component` — Ember can't embed a route/controller into another template (controllers are route-bound singletons; the old `{{render}}` helper is gone). It's relocation, not a rewrite: alias the incoming `@board` to an internal `model` so the ~23 `this.model` template refs stay verbatim; move `setupController` seeding into the component's `init`/`didReceiveAttrs`; keep route-only concerns (model load, navigation) in the route. Splitting speak from edit is the high-risk path — avoid it.

**Naming trap:** `templates/board-details.hbs` / `components/board-details.js` (PLURAL) is an unrelated "Board Details" metadata MODAL — not the page. A reusable page component named `board-detail` (SINGULAR) sits one character away; keep them distinct.

**Evidence:** task log `2026-05-31-board-detail-speak-component-spec.md`; `.planning/phases/04-board-detail-speak-component/04-{SPEC,CONTEXT}.md`.

---

## Pattern: a click-to-speak (or click-to-act) container that holds the inline word-prediction buttons CANNOT be `role="button"`

**Surface:** making the board-detail sentence bar (`.md-board-detail-sentence-bar__text`) the speak trigger, or any time you want a large region clickable that also contains child buttons.

**Root cause (verified 2026-05-31):** `__text` renders the inline word-prediction `<button>`s (`.md-board-detail-sentence-bar__prediction`). Giving the container `role="button"` (or making it a real `<button>`) nests interactive controls, which `ember-template-lint` blocks with **`no-nested-interactive`** (and it's genuinely invalid ARIA). The predictions can't be hoisted out of `__text` without breaking the tuned `__text--with-symbols` flex-wrap/scroll layout.

**Recipe that satisfies lint + a11y + layout:**
- Use `tabindex="0"` + `aria-label` on the container (focusable + labeled). `tabindex` alone does NOT trip `no-nested-interactive`; only an interactive *role*/element does.
- Click via `{{action "speak_sentence"}}`.
- A focusable `<div>` is not Enter/Space-activated like a `<button>`, so add `{{action "..._keydown" on="keyDown"}}` and, in the handler, **bail when `event.target !== event.currentTarget`** so a keypress on a focused child button activates the child, not the container.
- Give child buttons `{{action "..." bubbles=false}}` so a child *click* (which calls `stopPropagation`) doesn't bubble to the container's click handler.
- Scope CSS (cursor, focus-visible) with the `[tabindex]` attribute selector, not `[role="button"]` — it still targets only the interactive instance (the edit-mode `--preview` mirror has no tabindex). Add the focus-visible selector to the existing shared WCAG block, don't write a new ring.

**Related:** [Pattern: HTML5 drag-and-drop suppressed by nested `<button>` children](#pattern-html5-drag-and-drop-suppressed-by-nested-button-children) — same family (nested interactive elements bite you), different symptom.

**Evidence:** task log `2026-05-31-speak-bar-mic-and-folder-back-btn.md`.

---

## Pattern: the speak row's left "stack" mirrors the right `actions-wrap--stacked` — build symmetric, use `flex: 1`

**Surface:** adding controls to the left of the board-detail sentence bar (e.g. moving the folder Back button out of the pill to sit under Home).

**Reality (verified 2026-05-31):** the row `.md-board-detail-sentence-row` is `display:flex; align-items:stretch`. The RIGHT side already uses a stacked column `.md-board-detail-sentence-bar__actions-wrap--stacked` (flex column, `gap:2px`) whose two buttons are each `flex:1`, so they split the row height evenly and scale with the bar size class (small 90 / medium 100 / large 150 / huge 200px row heights, `app.scss:~62169`). To stay visually balanced, build the LEFT side the same way: a `flex-direction:column` wrapper with `flex:1` children (Home on top, Back beneath). At the default size each lands ~44px; they grow together at larger sizes — exactly matching the right pair. A *fixed* 44px Home would look unbalanced on large/huge rows.

**Gotchas:** Home's tight gap to the bar comes from `margin-right:-8px` ON the home button; when you wrap Home, move that margin to the wrapper and zero it on Home, or the inner column misaligns. There's an OLDER dead `.md-board-detail-sentence-nav*` "home+back stack" experiment in `app.scss` — unused in any template; don't reuse it (its `__btn` is solid blue-grey, not Home's frosted glass). Style a new Back to mirror `.md-board-detail-sidebar-toggle--stacked` instead, and switch its SVG stroke to `currentColor` so dark mode works via a `color` override rather than the `brightness()` filter used for hardcoded strokes.

**Evidence:** task log `2026-05-31-speak-bar-mic-and-folder-back-btn.md`.

---

## Pattern: a child pinned by `parent > * { z-index: 1 }` traps ALL its descendants below higher-z siblings — raise the ROW, not the menu

**Surface:** an absolutely-positioned popover/dropdown that opens and is painted UNDER a sibling section, even though the popover itself has a huge `z-index` (e.g. 99999). Seen on the caseload card's mobile "More Actions" dropdown getting covered by the goals / "Add goal" content.

**Root cause:** `z-index` is resolved at EACH stacking-context level, not globally. The caseload card uses `.md-caseload__card > * { position: relative; z-index: 1 }`, then bumps `card-top` to `z:5` (so the OPTIONS dropdown wins). That leaves the action-tiles ROW at `z:1`. The dropdown lives inside that row; at the *card* level its ancestor (the row, z:1) loses to card-top (z:5), so NOTHING inside the row — no matter how high its own z-index — can paint above card-top. Raising the popover or its wrapper is futile; they're trapped inside the row's z:1 context.

**Fix:** lift the popover's stacking-context ANCESTOR (the row), gated on the open state, via `:has()`:
```scss
.md-caseload__card > .md-caseload__actions--tiles:has(.md-caseload__extras-dropdown--mobile.open) {
  z-index: 9999;
}
```
`.open` is the Bootstrap toggle class on the wrapper (`controllers/caseload.js:438`). `:has()` is supported in this build. Match an existing open-dropdown z tier rather than inventing a new ceiling.

**Diagnostic:** when a high-z popover is still covered, walk UP from the popover to the common stacking root and find the first ancestor whose `z-index` is lower than the covering element's ancestor at that same level — that ancestor is the trap. Also: the caseload card deliberately avoids `transform` on `:hover` because a transform creates a containing block that would CLIP the overflowing dropdown — reach for shadow-only elevation when a card must let a child overflow.

**Evidence:** task log `2026-05-31-caseload-more-actions-shape-and-zindex.md`.

---

## Pattern: auth-page (login/register) "content cut off / bg not full height" — page-bg must be a transparent box; mesh goes on the fixed full-viewport `#within_ember`

**Surface:** the recurring "content not expanding to full height / cuts off at the bottom" bug on unauthenticated shell pages (login, register, beta onboarding). Also presents as "the bg only covers the card, then a bare white/dark strip below," or "the sign-in page lost its background."

**Architecture:** these pages use the `:has(.page-footer)` app-shell. `#within_ember:has(.page-footer)` is `position: fixed; inset: 0; overflow: hidden` (full viewport). `#content` is the ONLY scrollport (`flex:1 1 auto; min-height:0; overflow-y:auto`). The page-bg wrapper (`.login-page-bg` / `.register-page-bg`) is meant to be a TRANSPARENT alignment box; the shared `#content:has(.{login,register}-page-bg)` rule sets `#content` transparent on purpose, with the comment "the mesh lives on the full-viewport #within_ember below."

**Two failure modes (both seen 2026-05-31):**
1. **`min-height: 100vh` on the page-bg wrapper.** As a flex child of the shorter `#content` scrollport, with default `flex-shrink:1`, the wrapper is pinned to the 100vh floor while taller content (e.g. the Google-signup consent block) overflows past it — `overflow:hidden` then clips it, `overflow:visible` makes it visibly spill. FIX: remove `min-height`; the box sizes to content and `#content` scrolls (mirror `.login-page-bg`, which never had it).
2. **Gradient painted on the wrapper instead of `#within_ember`.** It only covers as far as the box reaches, leaving a bare strip below the card (mistaken for "the footer showing"). And if the `#within_ember` mesh was never added (it was only done for beta-welcome), sibling pages render bare white. FIX: paint the mesh on the full-viewport `#within_ember:has(.page-footer):has(.{page}-bg)` (compound `:has()` = (1,2,0), out-specifies the `:has(.page-footer)` transparent reset). It then fills the entire page height behind the scrolling content — no seam, no short bg.

**The mesh to use** is the shared `.md-shell` base gradient (app.scss ~40000) — the SAME stormy-teal/charcoal-blue/charcoal-dark/verdigris/dusty-denim blob mesh + stone linear-gradient used on the authenticated home/app pages. Reuse it verbatim so auth pages match the app.

**Footer note:** `.page-footer` is `display:none` everywhere except landing-alt (rules ~378/382) but KEPT in the DOM because the whole shell layout keys off `:has(.page-footer)`. A `display:none` footer still matches `:has()`. Don't remove the element to "hide the footer" — you'll break the scroll layout app-wide.

**Same bug, another surface — the BOARD-PICKER page (2026-06-12):** `/board-picker`
is a TOP-LEVEL route, so its `#content` is NOT `.index.with_user` and never gets the
`#content` background (app.scss ~546). The `.md-shell--board-picker` mesh only reaches
content height inside the scrolling `#content`, so on short content / small screens the
area below the picker card rendered bare (looked like a purple/empty strip). Same FIX:
paint the `.md-shell` base mesh on `#within_ember:has(.page-footer):has(.board-picker-page)`
(compound `:has()` (1,2,0) out-specifies the `:has(.page-footer)` transparent reset at
~415). **Lesson: when a page bg "doesn't fill to the bottom," don't reach for
`min-height`/`flex-grow` on the inner shell/workspace — that's the wrong layer (it gets
pinned/clipped by the `#content` scrollport). Paint the mesh on the fixed full-viewport
`#within_ember`.** `footer` (controllers/application.js) is true for any non-board route,
so most app pages ARE `:has(.page-footer)` and can use this.

**Evidence:** task log `2026-05-31-register-login-fullheight-bg.md`; board-picker instance in `2026-06-12-board-picker-bg-and-tabs.md`.

---

## Pattern: spec re-reading `Time.now` to rebuild a value the implementation stamped earlier — clock-boundary flake (NOT a format bug, and do NOT fix with `travel_to`)

**Surface:** a spec creates records (or schedules a job), then rebuilds an expected string from a SECOND `Time.now` read and compares it to output the implementation derived from the FIRST read. Two seen 2026-06-01:
- `admin_reports` (`organizations_controller_spec`): `ts = Time.now.strftime('%m-%Y')` vs report keys built from `event.created_at`. CI: `expected {"06-2026 ..."}` / `got {"05-2026 ..."}`, labels/counts matching, only the month differing.
- transcoding (`callbacks_controller_spec`): `prefix = bs.file_path + bs.file_prefix + "v" + Time.now.to_i.to_s` vs the prefix `media_object#schedule_transcoding` already scheduled using its own `Time.now.to_i`. CI: `Worker.scheduled?(...)` got `false` (a 1-SECOND boundary is enough).
- `subscription_hash` (`subscription_spec`): `User#subscription_hash` stamps `json['timestamp'] = Time.now.to_i` on every call. Specs that call it twice to prove subscription state did or did not change must compare `hash.except('timestamp')`, not the full hash.

**Root cause:** two independent clock reads. The first is stamped at create/schedule time; the test's is read later (after the HTTP request, which takes real time). When they land in different periods (month rollover, or just a 1s tick — a 5000+ example suite takes minutes, so it happens) the strings disagree. The implementation is correct; the TEST is non-deterministic.

**Anti-fix to reject #1:** "compute the timestamp differently / before the call." If it still comes from a separate `Time.now`, the two-reads race remains. Reordering hash keys does nothing — Ruby `eq` ignores order.

**Anti-fix to reject #2 — `travel_to` / freezing the clock (tried 2026-06-01, REGRESSED).** Wrapping the body in `travel_to(Time.now)` makes auth fail with `400 Not authorized`. Why: `allowed?(org,'edit')` resolves org-manager permission through `UserLink.links_for`, whose Redis cache key is `links/for/<code>/<record.updated_at.to_f.round(3)>`. Freezing time pins `updated_at`, so the empty link set cached at instant T is NOT invalidated when `add_manager` writes the link (its `updated_at` touch also lands on T) → stale "no manager" → 401/400. **This codebase relies on `updated_at` actually ADVANCING between writes to bust caches; never freeze the clock around code that reads permission/link caches.** (Same family as the `links_for`/`updated_at` reload gotcha elsewhere in this doc.)

**Correct fix — bind the expectation to the source of truth, never read the clock twice:**
- Report-by-month: build the expected key from the event's OWN `created_at`, e.g. `"#{ae3.created_at.strftime('%m-%Y')} asd iOS"`. The report groups by `event.created_at`, so this is exactly right and deterministic.
- Scheduled-job prefix: read the actual scheduled args back instead of recomputing — `action = Worker.scheduled_actions.detect { |a| a['args'][0..2] == ['Transcoder','convert_audio', bs.global_id] }; prefix = action['args'][3]`. `Worker`/`scheduled_actions` come from the `boy_band` gem; an action is `{'class'=>'Worker','args'=>[klass, method, *args]}`.

**Codebase gotchas surfaced en route:**
- Local specs can fail to LOAD with `ActiveRecord::PendingMigrationError` (whole file errors, looks like "all tests failing"). CI uses `db:schema:load` (`.github/workflows/ci.yml`) so CI won't hit it — local-only; run `RAILS_ENV=test rails db:migrate`.
- `RAILS_ENV=test rails db:migrate` can rewrite `db/schema.rb` with a cosmetic index `WHERE`-clause re-serialization (`ARRAY[...]` predicate) — a Postgres-version artifact, not a real change. Revert it (`git checkout db/schema.rb`).
- `callbacks_controller_spec.rb:5` ("invalid arn") stubs `ENV` with `expect(ENV).to receive(:[]).with("SNS_ARNS")`; that strict mock fails when Rack reads `RACK_MULTIPART_BUFFERED_UPLOAD_BYTESIZE_LIMIT` during `post`. Fails when the file runs ALONE, passes in the full CI order — a pre-existing isolation quirk, not a real CI failure.
- Always demand the real CI log before fixing a "format mismatch" — the `expected`/`got` diff is the decisive evidence; a plausible theory was wrong here twice.

**Evidence:** task log `2026-06-01-admin-reports-timestamp-month-boundary-flake.md`.

---

## Pattern: Org/room reports read from WeeklyStatsSummary, not raw logs

**Surface:** seed/demo data, org portal reports, room (OrganizationUnit) stats.

**Root cause:** `Organization.usage_stats` (used by the org portal AND `units_controller#stats`) sources word clouds / total words / modeled words from `WeeklyStatsSummary` rows over an **8-week** window; only the session timeline comes from raw `LogSession` (4 months), and room `user_weeks` from raw logs (12 weeks). `LogSession` schedules summary builds **async** (`after_save :schedule_summary`), so freshly-created logs have no summaries until a worker runs. `lib/seed_reporting_logs.rb` actively *deletes* summaries (fine for the individual `/user/stats` page, which recomputes live, but leaves org/room reports empty).

**Fix recipe:** After seeding sessions, build summaries synchronously: collect distinct weekyears via `WeeklyStatsSummary.date_to_weekyear(started_at.utc.beginning_of_week(:sunday))` and call `WeeklyStatsSummary.update_now(user_id, weekyear)` per week. For supervisor modeling frequency in room reports, seed `daily_use` logs (`LogSession.process_daily_use`) with `models`/`modeled` per `DAILY_EVENT_TYPES`.

**Gotcha:** `UserLink.links_for(record)` caches in Redis keyed by `record.updated_at`. `OrganizationUnit#assert_supervision!` reads `links_for(self)`; each `add_supervisor`/`add_communicator` bumps the unit's `updated_at` via `UserLink#touch_connections` but only in the DB. Reload the unit (`unit.reload`) before `assert_supervision!` or it reads a stale empty link set and wires nothing.

**Evidence:** `app/models/organization.rb:1085` (`usage_stats`), `app/controllers/api/units_controller.rb:68` (`stats`), `app/models/log_session.rb:18,883`, `app/models/weekly_stats_summary.rb:192,197`, `app/models/user_link.rb:19,94`; impl `lib/seed_organization.rb` (`seed_room`, `seed_communicator_history`).

---

## Gotcha: organizations.admin has a UNIQUE index — normal orgs must be NULL

**Symptom:** `PG::UniqueViolation ... index_organizations_on_admin ... Key (admin)=(f) already exists` when seeding a second org.

**Root cause:** `t.index ["admin"], unique: true` (`db/schema.rb`). Postgres unique indexes allow unlimited NULLs but only one row per concrete value: `admin = true` is the single super-admin org, and `admin = false` is a *second* singleton slot already claimed by the demo org from `db/seeds.rb`. Every normal/seeded district must use `admin = nil`.

**Fix recipe:** Never set `org.admin = false` for normal orgs; leave it NULL. `Organization.admin` is `where(admin: true).first`, so NULL orgs behave identically to "not admin".

**Evidence:** `db/schema.rb` (`index_organizations_on_admin`), `app/models/organization.rb:125`, `db/seeds.rb:489`; fix `lib/seed_organization.rb:37`.

---

## Pattern: `store.peekAll('buttonset')` iteration crashes on empty/unmaterialized records — guard every callsite

**Surface:** speak-mode board grid renders empty ("No symbols found") with console `TypeError: Cannot read properties of undefined (reading 'get')` thrown from `LingoLinq.Buttonset.load_button_set` (buttonset.js ~1200), via either `application.js#update_level_buttons → board#load_button_set` or `word_suggestions#load_vocabulary_button_sets → updateSuggestions` (word prediction).

**Root cause:** `peekAll('buttonset')` can surface empty/unmaterialized records, so a bare `button_sets.find(bs => bs.get('key')...)` / `.forEach(bs => bs.get(...))` throws when an entry is undefined. The static `Buttonset.load_button_set` was the ONE iteration site missing the guard that the others already had: `board.js#load_button_set` (`.map(i=>i).forEach`, `if(bs && ...)`, since Nov 2025) and `word_suggestions#button_sets_for_board_ids` (`if(bs && ...)`, added by Melissa #280, 2026-05-22).

**Not a refactor regression — a latent bug newly exercised.** The crash line predates everything (Nov 2025 rename). The trigger is Melissa's word-prediction/caching warming path (`load_vocabulary_button_sets`), which calls the unguarded static method frequently and in new contexts. She guarded her own new `peekAll` site but the shared static method was missed. Traci's board-detail styling refactor added zero buttonset-store code and is unrelated.

**Fix:** guard each entry in `Buttonset.load_button_set` — `button_sets.find(bs => bs && bs.get && bs.get('key') == id)` and `if(!bs || !bs.get) return;` at the top of the `.forEach`. With the crash gone, the method falls through to its normal `generate(id)` path and the board populates.

**Diagnostic technique:** when a `peekAll(...).find/forEach` callback throws "undefined reading 'get'", grep ALL `peekAll('<type>')` sites — the guarded ones reveal the known hazard and the missing guard is the bug. `git log -L <lines>:<file>` on the crash line tells you it's pre-existing, not the current refactor.

**Evidence:** `app/frontend/app/models/buttonset.js:1199-1209`, `board.js:1275`, `word_suggestions.js:1200,1246`.

---

## Pattern: sentence-bar chips push the right-side menus off-page — flex `min-width:0` + restore vertical wrap-scroll (not horizontal nowrap)

**Surface:** board-detail speak mode. As the user taps enough symbols, the sentence-bar chip strip overflows and shoves the right-side controls (options menu, sidebar toggle) off the page; the board chrome scrolls out of view.

**Root cause (two parts):**
1. **Missing `min-width: 0`.** `.md-board-detail-sentence-bar` is `flex: 1` (= `flex:1 1 0%`) inside `.md-board-detail-sentence-row`, but a flex item defaults to `min-width: auto` — it refuses to shrink below its content's intrinsic width. With a long chip list the bar balloons and pushes its siblings (the menu stacks) off the row. Fix: `min-width: 0` on the bar **and** on the scrolling `__text` child so overflow can engage instead of widening the row.
2. **A higher-specificity override replaced the vertical scroll with a horizontal one.** Two competing `--with-symbols` rules existed: the base `.md-board-detail-sentence-bar__text--with-symbols` (`flex-wrap: wrap; overflow-y: auto; align-content: flex-start` — the intended vertical wrap-scroll) and a later, `.md-board-detail-sentence-row`-scoped override (`flex-wrap: nowrap; overflow-x: auto`) added to make chips fill the bar height. The scoped one wins on specificity and forced a single non-wrapping row — which, without `min-width:0`, can't scroll and so expands the page. This is a Rule #0.7 stacked-override that silently changed behavior.

**Fix:** rewrite the winning (`.md-board-detail-sentence-row …`) override to do vertical wrap-scroll — `flex-wrap: wrap; overflow-y: auto; overflow-x: hidden; align-content: flex-start; min-width: 0; max-height: var(--nb-sb-h)` (size-aware so the scroll viewport scales with the sentence-bar size class). Pair with a JS observer (`_scroll_sentence_to_newest`, `observer('sentence_parts.[]')` → `next()` → `el.scrollTop = el.scrollHeight`) so the newest chips stay visible and older rows scroll up out of view — the chat-log pattern (`align-content: flex-start` keeps every row reachable; `flex-end`/`center` push rows to a negative offset scrollTop can't reach).

**Provenance note:** the nowrap override dates to 2026-05-17/19 sentence-bar polish — NOT a recent board-detail refactor. A long-latent flex bug only trips once content is wide enough; "it broke yesterday" often means "I only just populated enough to hit it."

**Evidence:** `app.scss` `.md-board-detail-sentence-bar` (~62190) + `.md-board-detail-sentence-row .md-board-detail-sentence-bar__text--with-symbols` (~62405); `controllers/user/board-detail.js#_scroll_sentence_to_newest`.

## Pattern: a template-bound `style={{…}}` attribute WIPES imperative `el.style.setProperty()` on the same element

**Surface:** board-detail speak mode — entering edit mode and returning, the word-prediction rail tiles revert to their fallback size (84×78) and placeholder images, as if the per-cell measurement never ran ("going through their screen size check").

**Root cause:** `_sync_prediction_tile_size` sets `--prediction-tile-w/h/gap/rail-pad-top` IMPERATIVELY via `main.style.setProperty(...)` on `.md-board-detail-main`. A change had ALSO added a template binding `style={{safe-style (concat "--bd-button-text-size:" …)}}` to that same `<main>`. Ember owns a template-bound `style` attribute: on the next re-render it rewrites the whole attribute to its tracked value (just `--bd-button-text-size`), erasing the imperatively-set tile vars → fallback sizing. The edit→speak transition is one such re-render.

**Fix:** never put a template-bound `style` on an element that also receives imperative `style.setProperty`. Move the bound custom property to a DIFFERENT element. Here `--bd-button-text-size` moved off `<main>` onto the two prediction containers (`.md-board-detail-sentence-bar__prediction-group` and `.md-board-detail-prediction-rail`), which are ancestors of their own labels and receive no imperative styles. Imperative-only `<main>` keeps its tile vars intact.

**Rule of thumb:** imperative DOM style writes and Ember attribute bindings must not share an element. Pick one owner per element's `style`.

**Evidence:** `controllers/user/board-detail.js#_sync_prediction_tile_size` (`main.style.setProperty`); `templates/user/board-detail.hbs` `<main>` (no bound style) + the two prediction containers (carry `--bd-button-text-size`).

---

## Pattern: `root: true` / `search_string ILIKE '%root%'` does NOT mean "set root" — it means "copy-set head or original"; use the anchored brand-key regex for set roots

**Surface:** "My Board Collection" brand sections (CommuniKate, Quick Core, Sequoia, Vocal Flair) listed sub-boards as separate rows (e.g. "Vocal Flair 84 - A Prefix" alongside "Vocal Flair 84"). Goal: show only each set's TOP board.

**Root cause / gotcha:** the obvious fix — add `root: true` to the public brand query (the same param the My Boards section uses) — is WRONG for public originals. `boards_controller#index` implements `root` as `search_string ILIKE '%root%'`, and `board.rb:899` only appends `" root"` when `!settings['copy_id'] || copy_id == global_id`. So EVERY original (never-copied) board gets the marker — including an original published sub-board. `root: true` works for My Boards only because a user's OWN boards are copy-sets (head marked root, sub-board copies are not). There is no clean data flag separating set-root from set-sub-board on original public boards (`parent_board_id` is copy lineage; `immediately_upstream_boards` is unreliable for popular roots).

**Fix:** key off the board KEY convention (same approach as `components/board-picker.js` _loadBrandGroups). Roots are `<brand>-<size>` (`vocal-flair-84`, `quick-core-60`, `sequoia-15`, optionally `-w-keyboard`); sub-boards carry a descriptive suffix (`vocal-flair-84-categories-food`). CommuniKate has no sizes → root is `communikate-home` / bare / `-<size>`. Per-family `root_re = /(^|\/)<slug>-\d+(-w(?:ith)?-keyboard)?$/i` (`(^|\/)` skips the `<owner>/` prefix, `$` rejects descriptive tails). Note the real key suffix is `-w-keyboard`, not board-picker's older `-with-keyboard` — match both with `-w(?:ith)?-keyboard`.

**Evidence:** `app/controllers/api/boards_controller.rb:299-301`; `app/models/board.rb:899`; `app/frontend/app/components/board-collection.js` (BRAND_FAMILIES `root_re` + `_loadAllBrands` filter).

**Boards page (`user/index` `board_list`):** apply the same client-side cleanup to the default grid only — `filterBrandSetRootBoards` + `dedupeBoardRows` on Public tab, and `filterBoardsPageTopLevelRoots` (= `filterRootBoards` then `filterBrandSetRootBoards`) + `dedupeBoardRows` on Mine tab, with `boardsPagePreferUserNames` (signed-in user, then `lingolinq`). Name dedup is case-insensitive. Leave `boards_page_raw_list` untouched so Boards Filter search still returns sub-board matches. Shared helpers live in `utils/board-roots.js`.

---

## Pattern: to match prediction-word font to board-button labels, use the board's `cqw` clamp inside a tile-as-container — NOT `vw`

**Surface:** board-detail — predicted-word font didn't match the board button labels (rail words rendered LARGER than board labels on narrow/short screens).

**Root cause:** board button labels are CELL-relative — `.md-board-detail-symbol-card__label` uses `clamp(.., 14cqw, var(--bd-button-text-size))` resolved against the `symbol-card` container (`container-type: size`). The prediction label was viewport-relative (`1.5vw`, capped at `--bd-button-text-size`). `vw` ≠ `cqw`, so they diverge whenever cells aren't viewport-proportional (landscape phones: wide-short cells keep `cqw` large while `vw` shrinks, or vice-versa).

**Fix:** the prediction rail tiles are already sized to the board cell (`--prediction-tile-w` measured by `_sync_prediction_tile_size`). Make each tile a `cqw` container (`container-type: inline-size`) and give the label the board's exact clamps — `clamp(10px,14cqw,var(--bd-button-text-size,15px))` at ≤1024px, `clamp(9px,13cqw,…)` at ≤820px. `14cqw` of the tile == `14cqw` of the cell (equal widths) → words match board labels. The in-bar tiles (>1024px) keep the base `1.5vw` clamp, which matches the board's own base `vw` formula on wide screens. `--bd-button-text-size` must be inherited by the prediction containers (set it on them, not on `<main>` — see the bound-style-vs-imperative pattern above).

**Evidence:** `app.scss` `.md-board-detail-symbol-card__label` (cqw) + `.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction(-label)` (container + cqw clamps) + base `.md-board-detail-sentence-bar__prediction-label`.

---

## Pattern: never `transform: scale()` a `object-fit:contain` image to "enlarge" it — it crops inside `overflow:hidden`

**Surface:** board-detail speak mode on short/landscape screens (e.g. iPhone 390px tall) — board button symbol images showed cut off.

**Root cause:** short-viewport rules scaled the symbol `img` up (`scale(1.25 → 2.1)` at ≤500/420/350/280px height) to keep it "roughly constant" as cells shrank, trusting `overflow:hidden` to clip "minor edge overshoot." But the image is already `object-fit:contain` (filling its short dimension), so ANY `scale > 1` overflows and the holder crops it — `scale(1.5)` cut ~⅓ off. A cropped AAC symbol is unrecognizable (worse than a smaller intact one).

**Fix:** remove the scale steps; let `object-fit:contain` size the image to the cell at every height (smaller but fully visible). To make symbols read larger on short screens, give the image more vertical room (trim label/cell padding) — never scale past the container.

**Evidence:** `app.scss` near the former `@media (max-height: 500/420/350/280px) … .md-board-detail-symbol-card__image img { transform: scale() }` block (removed).

## Pattern: sizing a fixed-width sibling to a FLEXIBLE element's measured size is circular — solve the convergent width in closed form

**Surface:** board-detail speak mode — the word-prediction rail tiles (right column) didn't match the board button width/height; the rail rendered NARROWER than the buttons.

**Root cause:** `_sync_prediction_tile_size` set the rail width to the *measured board card width* (`--prediction-tile-w`). But the rail is a fixed-width `flex-shrink:0` sibling of the FLEXIBLE board grid (`grid-fade` is `flex:1`). Setting the rail to the measured card width is circular: the rail then steals that width back from the grid, the cards reflow to a different width, and — with no re-measure-to-convergence — the rail stays permanently one step out of sync. (It also only measured at init+300ms / on resize / on board change, so it was stale when the rail first appeared as suggestions loaded.)

**Fix:** compute the convergent width directly. The grid + rail share a horizontal budget `S = gridFadeWidth + railMargin + railWidth` that is INVARIANT to how it's split (the `flex:1` grid absorbs whatever the rail takes; the sidebar is a separate fixed sibling). At the width `W` where one board column == the rail: `S = (N+1)·W + (N-1)·colGap + railMargin` → `W = (S − (N-1)·colGap − railMargin) / (N+1)`, with `N = current_grid.columns`. One measurement at ANY current rail width yields the right `W` (since `S` is invariant) — no iteration. Guard on the rail being visible (else fall back to plain card width for the >1024px in-bar layout). Also added `suggestions.list.[]` to the re-measure observer so it recomputes when the rail appears.

**Rule of thumb:** never measure a flex-distributed dimension to set a sibling that feeds back into that same distribution. Identify the split-invariant total and solve for the fixed point.

**Evidence:** `controllers/user/board-detail.js#_sync_prediction_tile_size` (+ its `_on_change` observer); `app.scss` `.md-board-detail-prediction-rail { width: var(--prediction-tile-w) }`.

## Pattern: board-detail at <=500px height — SPEAK fills the viewport, EDIT must SCROLL (don't force-fill it); confirm the desired behavior before engineering a fill

**Surface:** board-detail at <=500px height. Speak: the board grid left a gap because the fixed `calc(100dvh - Npx)` couldn't reclaim the space the shrunk sentence bar freed. Fixed with a CSS flex-fill (stretch grid-fade → grid `flex:1 1 0` fills the flexed wrap). Then the same gap was reported in EDIT — and several "make edit fill too" attempts each failed or were rejected.

**The real lesson (behavioral, not just technical):** EDIT and SPEAK want DIFFERENT behavior. Speak should fill to a consistent viewport height (no scroll). EDIT should keep comfortable, consistent button heights and SCROLL (`<main>` is `overflow-y:auto`) when they don't fit — NOT squish/stretch to fit. Chasing a "fill" for edit was the wrong goal the whole time. When a fix "doesn't work" repeatedly, re-confirm the *desired behavior*, don't just iterate the mechanism.

**Failed fill attempts for edit (all reverted — don't repeat):**
- CSS flex-fill (un-scope speak's rules to edit): collapsed the `minmax(0,1fr)` rows to thin strips — edit's chain (inside the `1fr` edit layout, `grid-template-columns:1fr` @ ~71420) hands the grid no definite height to stretch into.
- Per-size-class `:has()` calc (reduce `-180` by the bar's shrink): still gapped — a fixed `calc(100dvh-X)` can't adapt to whether the global top bar is present (absent in responsive devtools fullscreen → over-subtracts).
- JS measure-and-set the grid height to main's content bottom: *did* fill, but the user didn't want a fill at all — edit should scroll.

**What edit actually needs:** at `@media (max-height:500px)`, drop the edit grid's fixed calc to `height:auto !important` (so it sizes to content, not compressed) and floor each cell (`.md-shell--board-detail-edit .md-board-detail-grid__cell { min-height: 96px }`) so buttons stay usable; content then grows past the viewport and `<main>` scrolls. Speak keeps its flex-fill; >500px edit keeps `calc(100dvh-180px)`.

**Debugging note that paid off:** Chrome's purple diagonal-hatch (with grid overlay on) = grid free-space/gap not covered by tracks; the box-overlay shows which element OWNS an empty band — here `<main>` owned it (it was full height; the `grid-sidebar-wrap` inside wasn't growing). Always identify the element that owns the empty space before sizing anything.

**Evidence:** `app.scss` `@media (max-height: 500px)` block — speak `:not(.md-shell--board-detail-edit) … grid-fade` flex-fill + edit `.md-shell--board-detail-edit … .md-board-detail-grid { height:auto !important }` and `… .md-board-detail-grid__cell { min-height: 96px }`; edit grid base `calc(100dvh-180px)!important`; layout `.md-shell--board-detail-edit .md-board-detail-layout { grid-template-columns: 1fr !important }`.

---

## Pattern: endpoint-specific 401 auth without changing legacy `require_api_token`

**Surface:** API actions that are publicly routed or intentionally exempt from `require_api_token`, but still need a clear authentication challenge before action-specific validation or feature checks.

**Gotcha:** `require_api_token` intentionally returns the legacy 400 "Access token required..." response, and `spec/controllers/application_controller_spec.rb` locks that behavior. Do not change it just to make one endpoint return 401.

**Fix recipe:** exempt only the target action from the shared guard, then make the action's first check `return api_error(401, {error: "Authentication required", unauthorized: true}) unless @api_user`. This preserves global compatibility while keeping clients from seeing misleading feature/validation errors when they simply need to authenticate.

**Related permission gotcha:** `admin_support_actions` is a global support capability from `User` permissions (`Organization.admin_manager?(user) && !user.valet_mode?`). For global admin/support endpoints, prefer a direct predicate over `@api_user.allows?(@api_user, 'admin_support_actions')`, which makes the acting user both resource and actor and obscures the real authorization rule.

**Evidence:** task log `2026-06-02-word-predict-auth-and-admin-support-permission.md`.

---

## Pattern: activation location logging must tolerate missing hit history

**Surface:** Speak Mode button activation, especially fast-html/controller handoffs, translated display paths, find-button highlights, keyboard/programmatic activation, and any path that reaches `application.activateButton` without first running `raw_events.track_selection`.

**Root cause:** `buttonTracker.track_selection` initializes `buttonTracker.hit_spots`, but `buttonTracker.locate_button_on_board` is also called from activation logging and used to assume `hit_spots.length` existed before its own fallback logic. If a valid activation path has no prior selection history, telemetry/location calculation can throw before speech activation completes.

**Fix recipe:** Treat activation location telemetry as best-effort. In `locate_button_on_board`, normalize `var hit_spots = buttonTracker.hit_spots || []` and use the existing no-prior-point fallback (`percent_travel` from closest edge) when history is absent.

**Evidence:** `app/frontend/app/utils/raw_events.js` (`locate_button_on_board`); task log `2026-06-01-translated-speak-button-hit-spots.md`.

---

## Pattern: retranslate existing board language must force default update

**Surface:** Translate Boards modal, `components/translation-select.js`, `components/button-set.js`, `/api/v1/boards/:id/translate`, `Board#translate_set`.

**Root cause:** The normal translate path intentionally avoids applying visible labels when `destination_lang` already equals the board locale (`set_as_default_here = false`). That is safe for ordinary same-locale cache updates, but wrong for an explicit support/admin retranslate after a previous broken translation marked the language as available.

**Gotcha:** Broken translated boards can report `board.locale === destination_lang` while their visible labels are still in the original language. If the review modal derives `source_lang` from `board.locale`, it sends Spanish → Spanish, Google echoes, and the frontend echo filter drops every target field.

**Permission gotcha:** `/api/v1/boards/:id/translate` requires edit permission on the board in the URL before it schedules progress. Public library boards like `lingolinq/core-blocks-*` can be viewed but not translated in place by regular users. The user-facing path should not hard-stop; it should copy first, then translate the copy.

**Fix recipe:** Only from the explicit Re-Translate UI, open the existing button-set review modal with `force_update_default: true` and pass the original source locale (`translations.default || board.locale`) as `source_locale`; keep normal Start Translation and Switch Existing Translation unchanged. The server will then apply reviewed labels/vocalizations to the visible board text and propagate the override to selected linked boards. For read-only boards, keep the translate modal reachable and show a `Translate a Copy` action that calls the existing application `copy_board` flow with `translate_locale`; `copying-board` then opens the review modal against the copied board.

**Evidence:** `app/frontend/app/components/translation-select.js`, `app/frontend/app/templates/components/translation-select.hbs`, `app/models/board.rb` (`translate_set`); task log `2026-06-01-translate-modal-retranslate.md`.

---

## Gotcha: SES region config may be `AWS_REGION`, not `SES_REGION`

**Surface:** registration emails and any mail delivered through `config/initializers/amazon_ses.rb`.

**Root cause pattern:** local/Render env may provide standard AWS keys like `AWS_REGION` while the app-specific SES initializer reads only `SES_REGION`. Credentials can be present and `op run` can be working, but SES still fails before delivery with `Aws::Errors::MissingRegionError`.

**Fix recipe:** Keep `SES_REGION` as the explicit override, but fall back to `AWS_REGION` and `AWS_DEFAULT_REGION`. For diagnosis, check the running app process env in a sanitized way and use read-only `Aws::SES::Client#get_send_quota` before sending a real email.

**Evidence:** `config/initializers/amazon_ses.rb`; task log `2026-06-02-registration-email-sending-investigation.md`.

---

## Pattern: autocomplete tokens should follow credential intent, not nearby labels

**Surface:** profile/preferences and account-management forms with mixed profile fields, username lookups, password resets, and delegated account creation.

**Fix recipe:** Use semantic tokens for real user details (`name`, `email`, `tel`, `url`), `current-password` only for credentials that authenticate an existing account, and `new-password` for credential creation/reset/update. For username lookup, start-code, free-form bio, and profile location fields, prefer `autocomplete="off"` plus autocapitalize/autocorrect/spellcheck off where typing exact identifiers matters, so browsers do not inject saved usernames/password-adjacent values into unrelated profile fields.

**Evidence:** `app/frontend/app/templates/user/edit.hbs`; task log `2026-06-03-profile-autocomplete-field-types.md`.

---

## Pattern: speak-mode display prefs read from `app_state.referenced_user`, not `currentUser`

**Surface:** any feature whose on/off or appearance should follow the AAC user being spoken AS (board-detail and classic board-alt speak pages), e.g. word prediction, skin, preferred symbols, button text position.

**Root cause pattern:** in speak mode the logged-in account (`currentUser`) is often a supervisor, not the communicator. Reading prefs off `currentUser` shows the wrong person's settings. The established app-state property is `referenced_user` — board/index.js already gates skin/symbols/button_text off `appState.referenced_user.preferences.*`, and board-detail uses `app_state.referenced_user.preferences.*`. It is only meaningful in speak mode (pair the read with `&& speak_mode`, or an `!speak_mode` early-return).

**Fix recipe:** to make a setting global across both speak pages, key it on `referenced_user.preferences.<key>`, add that exact path to the computed/observer dependency keys, and default-OFF defensively with `=== true` (not `!== false`) so a null/absent pref is treated as off. Seed the same default into the preferences-page `setup()` pending+original so the form doesn't render dirty. Retire the old per-record attr by simply not reading it — leave the model attr/JSON-API field in place (removing it is a gated DB/contract change) rather than migrating data.

**Evidence:** `app/frontend/app/controllers/board/index.js` (`updateSuggestions`, `computeHeight`), `app/frontend/app/controllers/user/board-detail.js`, `app/frontend/app/controllers/user/preferences.js`, `app/models/user.rb` (`preference_defaults`); task log `2026-06-06-word-prediction-global-pref-redesign.md`.

---

## Pattern: consolidate multiple creation entry points onto one route

**Surface:** a feature reachable from several buttons/modals (board creation: dashboard "new board" actions, legacy `/create-board` standalone page, modal opens) that should funnel into a single canonical flow.

**Fix recipe:** replace every `modal.open('<legacy>')` with `router.transitionTo('<canonical-route>')`, and turn the legacy route into a redirect via `beforeModel() { this.router.transitionTo('<canonical-route>'); }`. Grep `modal.open('<legacy>')` across `app/frontend/app/` afterward to prove zero remaining opens. Watch `this` in promise callbacks — capture `var _this = this;` and route through `_this.get('router')` (the `lingolinq/no-this-in-promise-executor` rule + plain-callback `this` gotcha). Preserve purchase-gate semantics: only navigate in the resolve handler if the original did, so you don't bypass `check_for_needing_purchase`.

**Evidence:** `app/frontend/app/components/dashboard/authenticated-view.js`, `app/frontend/app/routes/create-board.js`; task log `2026-06-06-word-prediction-global-pref-redesign.md`.

---

## Gotcha: `overflow-y: auto` silently clips horizontal overflow too

**Surface:** any scroll container (e.g. the word-prediction side rail `.md-board-detail-prediction-rail`) that sets only `overflow-y: auto`/`scroll` and assumes the X axis stays `visible`.

**Root cause pattern:** per CSS spec, when one overflow axis is set to a non-`visible` value, a computed `visible` on the other axis becomes `auto`. So `overflow-y: auto` with no `overflow-x` declared → `overflow-x` computes to `auto`, which **clips** (and may scroll) horizontal overflow. Content wider than the box gets cut on the right with no visible scrollbar if it's only slightly over.

**The trigger is usually a fixed `min-width` floor, not text.** A flex/`width:100%` child that inherits a base `min-width: 44px` (touch-target floor) from a shared class CANNOT shrink below it. When the scroll container is dynamically sized smaller than that floor (e.g. the rail width tracks a board cell, and many-column boards make cells <44px), the child overflows its container by `floor − containerContent`, and the `overflow-y:auto`→`overflow-x:auto` clips its right edge. This clips EVEN SHORT content ("you", "i") — a key tell that it's the *box* overflowing, not the *label text*. If you only see it with long words you'll wrongly chase text wrapping; if you see it with short words too, suspect the min-width floor.

**Fix recipe:** first identify whether short content also clips (box overflow) vs only long content (text overflow). For box overflow, override the inherited floor on the dynamically-narrowed element: `min-width: 0`, scoped so siblings sharing the base class keep their touch-target floor. Ensure inner fixed-size children (images) scale with the box (`max-width`/`%`) so the shrunk tile stays legible. Only ALSO add text wrap/clamp (`width:100%; word-break; -webkit-line-clamp; text-overflow:ellipsis`, matching the analogous element's treatment) if long labels still overflow after the box is fixed — verify before adding, don't stack speculatively.

**Evidence:** `app/frontend/app/styles/app.scss` (`.md-board-detail-prediction-rail .md-board-detail-sentence-bar__prediction` `min-width:0` override of the base tile's `min-width:44px`); rail width from `controllers/user/board-detail.js#_sync_prediction_tile_size`; task log `2026-06-06-word-prediction-global-pref-redesign.md`.

---

## Pattern: split global admin telemetry from feature-flagged org telemetry

**Surface:** `Api::TelemetryController#index` and organization telemetry endpoints.

**Gotcha:** `telemetry_admin_panel` grants access to the organization telemetry panel for org managers, but global/no-organization telemetry remains super-admin-only. A shared before action that allows either admins or the feature flag can make the global endpoint look broader than it is, especially if the action repeats its own admin check.

**Fix recipe:** Use separate before actions: admin-only for global index endpoints, and admin-or-feature-flag for organization-scoped panel endpoints. Cover both contracts in controller specs.

**Evidence:** `app/controllers/api/telemetry_controller.rb`, `spec/controllers/api/telemetry_controller_spec.rb`; task log `2026-06-04-render-secrets-telemetry-auth.md`.

---

## Pattern: button set cache regeneration is only for S3 403/404 misses

**Surface:** `Api::SearchController#proxy` and `button_set_cache` proxy URLs.

**Gotcha:** Generic fetch exceptions on a cache URL, such as timeouts, should not trigger button set regeneration. Regeneration is a stale-S3-pointer recovery path for confirmed 403/404 cache misses; broadening it can mask real upstream/network problems.

**Fix recipe:** Keep the proxy regeneration flag false by default, set it only from `BadFileError` messages that identify 403/404, and cover generic exceptions with a no-regeneration controller spec.

**Evidence:** `app/controllers/api/search_controller.rb`, `spec/controllers/api/search_controller_spec.rb`; task log `2026-06-04-proxy-cache-and-badge-auth-review.md`.

---

## Pattern: badge goal filtering requires goal visibility, not just public profile visibility

**Surface:** `Api::BadgesController#index` with `goal_id`.

**Gotcha:** A user can have `User#view_detailed` via a public profile and still lack `UserGoal#view` for a specific goal. Badge filtering by `goal_id` must keep the separate goal visibility check so public/highlighted badge visibility does not imply access to goal-specific badge data.

**Fix recipe:** Keep `allowed?(goal, 'view')` when filtering badges by `goal_id`, and cover public-profile-only access with a controller spec.

**Evidence:** `app/controllers/api/badges_controller.rb`, `app/models/user_goal.rb`, `spec/controllers/api/badges_controller_spec.rb`; task log `2026-06-04-proxy-cache-and-badge-auth-review.md`.

---

## Pattern: per-user UI prefs must be read from `currentUser`, not the board-detail route's URL user

The `user.board-detail` route nests under `user`, so `this.modelFor('user')`
resolves to the **board OWNER** (the `:user_id` in the URL), which is NOT the
logged-in user when you open a board you don't own (anything outside "My
Boards"). Every personal viewing preference toggle in
`controllers/user/board-detail.js` (`set_folder_style`,
`toggle_folder_colored_face`, `toggle_shrink_labels_to_fit`,
`toggle_soft_borders`, `toggle_hide_speak_bar`, `set_speak_menu_item_hidden`)
**saves** to `app_state.currentUser.preferences.*`. The route's `setupController`
was **reading** them back from `modelFor('user')` — so on another user's board
they silently reverted to defaults (the owner has no such pref saved).

**Fix recipe:** read personal viewing/display prefs from
`this.appState.get('currentUser')` so the read mirrors the write. Keep the
board-owner `user` var for ownership logic. Note `symbol_background`/`voice` in
the same block still read from the owner — leave intentionally owner/communicator-
scoped prefs alone unless their save side also targets `currentUser`.

**Smell test:** when a setting "resets to default" only on records you don't own,
check whether the read source (`modelFor`) matches the write source (`currentUser`).

**Evidence:** `app/routes/user/board-detail.js` `setupController` (~line 266);
save handlers `app/controllers/user/board-detail.js:7093-7202`; task log
`2026-06-08-folder-prefs-revert-on-others-boards.md`.

---

## Pattern: `.md-board-collection__*` is a light-base panel reusable on any page; dark theme is ancestor-scoped

The speak-mode "My Board Collection" panel's CSS (`app.scss` ~66916–67340) is
authored as a **light base** (`.md-board-collection__*`) with the dark speak-mode
look layered as `.md-board-detail--dark .md-board-collection__*` overrides. So the
exact same panel markup (header + search pill + sectioned `__item` rows) can be
dropped onto a **light** page (e.g. the Find Boards / `search` page) and it renders
as a light-themed twin automatically — no re-theming needed. Reuse the classes;
only add a thin shell (trigger + floating-panel positioning) around them. `__body`
already does `overflow-y:auto; flex:1; min-height:0`, so a shell with a `max-height`
+ `display:flex; column` gives you a scrolling dropdown for free.

**Combobox-over-existing-search:** on the Find Boards page the "Filter Boards"
field was the page's live SERVER search (the `_autoSearch` observer re-queries on
`searchString` change). To turn it into a board-jump dropdown without losing search,
make the dropdown's top input the search field: `@onQueryChange={{action (mut
this.searchString)}}` flows typing back to the controller, the existing observer
fires, and the section lists are just the live results — no client-side filter layer
and no need to touch the speak-mode component.

**Gotchas:** (1) `{{#each sections as |section|}}` shadows the `<section>` tag —
ember-template-lint `no-shadowed-elements`; name the block param `group`. (2) Floating
panel z-index must be `< $aac-z-topbar` (use 150). (3) mixed-unit `min(60vh, 460px)`
compiles fine here (dart-sass; precedent at app.scss:24301) — only arithmetic
(`px + vw`) inside `clamp()` needs `calc()`.

**Evidence:** `components/search-board-jump.{js,hbs}`, `controllers/search.js`
`jump_sections`/`select_jump_board`, `app.scss` `.ub-search-jump*`; task log
`2026-06-08-find-boards-jump-dropdown.md`.

---

## Pattern: board cards are governed by the `board-card-modern` mixin (its `!important` makes surface font/spacing overrides DEAD)

Board cards (`board-icon` component, root `.simple_board_icon`) get their modern
look from the `@mixin board-card-modern` (app.scss:~61), `@include`d on 4 surfaces:
home-boards picker (~5135), the `.ub-search-page` responsive `.btn.simple_board_icon`
(~39134), dashboard user-summary available-boards (~45087), and the boards+search
grid `.ub-boards-page__board-grid` (~60760). The mixin's typography/layout rules are
`!important`, so per-surface declarations like `.name { font-size:1.69rem }` or
`.author { font-size:17px; margin:0 0 16px }` are **overridden and dead** — the card
actually renders the mixin's values (title `max(11px,1.2rem)`=12px, author
`max(11px,0.9rem)`=11px, author margin 0). To change card typography/spacing
*everywhere*, edit the MIXIN, not the surface block. Font floors use `max(<px>, <rem>)`
so text never drops below the px floor when the 10px root scales rem down.

**Decorative top accent:** the mixin's `&::before` (`inset:0 0 auto 0`, 2px gradient)
is the top border. It only looks right when the card keeps the mixin's
`overflow:hidden` (clips the bar to the 28px radius). The boards/search card had flipped
it to `overflow:visible`, so the bar bled past the rounded corners as a full-width line.
Fix = restore `overflow:hidden` (heart/home-badge/trash are siblings in the *holder*,
not children of the card, so they aren't clipped).

**Equal-height across rows:** the boards/search grid is `display:flex; flex-wrap;
align-items:stretch` → cards equalize within a row only. For uniform height across ALL
rows, set a `min-height` floor on the card; content is bounded (title `-webkit-line-clamp:2`
+ fixed 104px image), so a floor above the tallest content (≈300px) makes every card match.
The home-boards picker / user-summary cards use `height:auto` and are NOT under the
boards-grid selector, so a boards-grid min-height does not touch them (scope deliberately).

**Evidence:** `app/styles/app.scss` mixin ~61, base `.simple_board_icon` ~9619,
boards/search grid ~60711; task log `2026-06-08-board-card-refinements.md`.

---

## Pattern: home-tour `cardSel` MUST target the visible wide/narrow variant — don't "simplify" it to the base class

The dashboard caseload + speak cards render **dual markup**: `<base>-wide-only`
AND `<base>-narrow-only` elements that BOTH carry the base class
(`.md-card--speak`, `.md-card--caseload`), with CSS hiding one per breakpoint
(`<=1024px` shows `-narrow-only`, `>=1025px` shows `-wide-only`). The home tour
(`components/home-tour.js`) must anchor steps to the **visible** variant via
`cardSel(base) => base + (narrowTour ? '-narrow-only' : '-wide-only')`. A bare
`querySelector('.md-card--speak')` grabs the FIRST (DOM-order) element — the
HIDDEN, zero-size variant at the current width — so the popover AND the spotlight
detach to a corner and nothing is highlighted (breaks "after the main nav" on
small screens). `_onTourResize` must also flip `attachTo.element` to the visible
variant when crossing 1024px, not just the placement side.

**This has regressed twice.** Both times a "Modernize…" refactor replaced
`cardSel` with `return base` under a comment claiming the cards became
single-markup — they did NOT. boards/extras/orgs ARE single-markup (target base
directly); caseload/speak are NOT. Before simplifying `cardSel`, grep the
template for `-wide-only`/`-narrow-only` on that card first.

**Evidence:** `app/templates/components/dashboard/authenticated-view.hbs`
(speak/caseload wide-only + narrow-only), `app/components/home-tour.js`
`cardSel` + `_onTourResize`; app.scss ~46369 / ~41673 (the 1024/1025 hide rules).
Related: [[the dual wide-only/narrow-only markup gotcha already in this doc]].

## Card box-shadow / glow "cut off on the right" is a GUTTER problem, not an overflow problem

**Symptom:** a dashboard card's soft drop-shadow / showcase glow is sharply
clipped on the right, and only at narrower widths. Tempting (wrong) fix:
`overflow: visible` / `overflow-x: visible` on an ancestor.

**Why overflow is the wrong lever:** the dashboard scroll chain (`#content`,
`.md-shell`, `.md-workspace`, `.md-main`) is a deliberate multi-layer
horizontal-scroll guard — `overflow-x: hidden !important` on ALL of them inside
`@media (max-width: 1024px)` (app.scss ~54151-54161). Un-clipping one layer just
moves the clip up the chain; `#content` still clips at the viewport. And on
narrow screens the card sits only ~14-26px from the viewport edge, so a 38-52px
shadow is physically off-screen — no overflow trick conjures space that isn't there.

**Root cause (verified):** the shadow needs a GUTTER ≥ its blur reach between the
card edge and the clip edge. Desktop `.md-workspace` has `padding: 40px 40px …`
(~40323) — that 40px gutter is exactly why the shadow shows on desktop. The
`@media (max-width: 820px)` block (~40388) drops it to `margin: 0; padding-left/
right: 14px` — 14px < the 38px (rest) / 52px (hover) glow reach → hard clip.

**Fix pattern:** restore the gutter for the affected surface only, scoped by
content — `.md-workspace:has(.md-grid--dashboard) { padding-left/right: 40px
!important }` inside the ≤1024 block. `:has()` is already used here (~15708,
~29219) so it's safe. Keep the scroll guard intact. Size the gutter against the
WIDEST box-shadow layer's blur (`grep -A6 'md-card--…' | grep box-shadow`).
A decorative glow fades to ~0 before its full blur radius, so matching the
resting reach (not the hover peak) is usually enough; hover overshoot landing
off-screen reads as a natural fade, not a clip.

**Evidence:** app.scss ~40323 (desktop 40px gutter), ~40388-40415 (≤820px 14px
reduction), ~54151-54161 (multi-layer scroll guard), ~46275-46313 (Speak card
0 0 38px / 52px glow).

## Two independent Shepherd tours can safely share the ember-shepherd `tour` service

Building a second tour-style modal (`getting-started-tour`) alongside the
existing `home-tour`? Both can inject `service('tour')` and call
`tour.addSteps(theirSteps)` without contaminating each other. ember-shepherd's
`addSteps` runs `_initialize()`, which **creates a brand-new `Shepherd.Tour`
every call** (no "already initialized" guard — `node_modules/ember-shepherd/
dist/services/tour.js` `_initialize`, ~l.446-478). So each start gets a fresh
tour with only the steps from that addSteps call — no need to reset
`tour.steps`. Just set `defaultStepOptions`/`modal`/`confirmCancel` BEFORE
addSteps each time (they're read at instantiation), which both components do.

Reuse the home-tour CSS for a matching look: `md-tour__step`,
`md-tour__step--intro` (centered modal), `md-tour__btn--ghost/--primary`,
`md-tour__eyebrow`/`__heading` (decorated title via innerHTML), and toggle
`body.md-tour--centered-step` in a `when.show` hook for the backdrop blur.

Naming gotcha: a `getting-started` component (+ `getting-started-icon`) ALREADY
exists — a checklist modal driven by the `modal` service (NOT Shepherd). The
new progressive tour-style modal is `getting-started-tour` to avoid clobbering
it. Two distinct "Getting Started" surfaces; don't conflate them.

## Fixed-positioned dashboard chrome must clear z-index:1000 (the inner-header)

A `position: fixed` element placed on the dashboard (e.g. the "Take a tour"
button, the Getting Started badge) **vanished** until given `z-index > 1000`.
The app header (`#within_ember > header`, app.scss ~l.442) is
`position: fixed; z-index: 1000; height: var(--topbar-height)`, and the
app-navbar inside it overflows downward (padding-top: 2rem), so it paints over
fixed children placed near the top. Fix: `z-index: 1001` (above the header) and
position below it via `top: calc(var(--topbar-height, 16px) + Nrem)`. The
disappearance was NOT a transform/containing-block trap — no ancestor of the
dashboard content has transform/filter/contain; it was pure stacking.

---

## Pattern: webcam eye gaze is lazy — preference toggle does not start the camera

**Surface:** User Preferences dwell/eye-tracking, Speak Mode, Test Dwell.

**Gotcha:** `preferences.device.dwell` only saves a setting. The camera/weblinger stack starts when entering Speak Mode (`app-state.js` `check_scanning`) or clicking Test Dwell (`dwell-tracker` → `capabilities.eye_gaze.listen()`). `calibratable`/`calibrate` were no-op stubs in the open web build; weblinger loads async from CDN (or `/weblinger/weblinger.js` fallback). If `window.weblinger` is missing, `listen()` used to no-op silently.

**Fix recipe:** Wire `calibratable`/`calibrate` to `window.weblinger.calibrate()`; surface `fail` via `weblinger-tracking-fail` events; show setup guidance in Preferences; vendor weblinger locally with CDN fallback.

**Evidence:** `app/frontend/app/utils/capabilities.js`, `app/views/layouts/application.html.erb`; task log `2026-06-08-webcam-eye-gaze-ux.md`.

**Gotcha:** `app.covidspeak.org` CDN for WebGazer/Jeeliz deps is unreachable (`ERR_NAME_NOT_RESOLVED`). Web builds must use self-hosted `/weblinger/lib/` (vendored from open-aac/weblinger.js), not `weblinger_asset_prefix` → covidspeak.

---

## Pattern: a DOM-snapshot live preview can't show elements the source page `{{#if}}`-removed — render-all + hide

The Getting Started "choose what appears" modal builds its live preview by
`cloneNode(true)`-ing the real `.md-grid--dashboard` (getting-started-tour.js
`_onDisplayShow`). When the real dashboard hid a section by **removing** its card
from the DOM (`{{#if this.sectionVisibility.X}}`), that card was absent from the
snapshot — so re-checking the box reapplied the grid area (space) but `setCardDisplay`
found no element to show → **phantom empty grid cell, no card**. Hiding worked
because the card was still in the snapshot when toggled off; the asymmetry is the tell.

**Fix recipe:** keep every *available* card in the DOM always and toggle the
hidden state with an inline `display: none !important` binding (a `cardHideStyle`
computed off the visibility map) instead of `{{#if}}`-removing it. Keep a separate
*availability-only* gate (`sectionAvailable`) so type-restricted cards (caseload/org)
still never render for users who lack them. Then the clone is full-fidelity and the
modal's existing show/hide (`removeProperty('display')` / `setProperty(...,'important')`)
works in both directions. Inline `!important` wins over the wide/narrow variant
`display:...!important` @media rules with zero SCSS specificity work.

**Rule of thumb:** any "faithful preview" built from a DOM clone must clone a source
that contains *all* toggleable elements (visibility via CSS, not conditional render),
or it can only ever preview removals, never re-additions.

**Evidence:** `app/frontend/app/components/dashboard/authenticated-view.js`
(`sectionAvailable`, `cardHideStyle`), `.../templates/components/dashboard/authenticated-view.hbs`,
`.../components/getting-started-tour.js`; task log `2026-06-09-getting-started-preview-readd-phantom-space.md`.

---

## Pattern: dashboard card "positions" preference — permute grid-area names, don't rewrite the matrix

To let users rearrange the home dashboard cards (drag-to-swap in the Getting Started
preview, behind `dashboard_drag_layout`), the position is stored per-section exactly
like `dashboard_sections` visibility: `preferences.dashboard_positions` maps a section
key → the section key whose home-slot it occupies (default identity; a swap is the pair
`{A:B, B:A}`). Backend wiring mirrors `dashboard_sections` line-for-line (PREFERENCE_PARAMS
+ preference_defaults). Frontend save uses the same `device.updated` dirty-bit + `user.save()`.

**Key move:** apply positions by *substituting the area-name tokens in the
grid-template-areas string* (`applyPositions` in `dashboard_sections.js`), NOT by
emitting per-card inline `grid-area`. This rides the existing inline `gridStyle`
(single source of truth, shared by home + preview) and naturally no-ops on the narrow
`order`-based layout, so no responsive conflict. Only relabel a **closed permutation**
over currently-visible non-boards cards (every target is also a source, targets
distinct); any partial/inconsistent map (e.g. a saved swap referencing a now-hidden
card) falls back to the untouched layout — emitting a non-rectangular template would
silently drop a card. Boards is excluded from swapping (spanning hero = different cell
shape). Default/empty positions produce a byte-identical layout (verify in node).

**Drag in the preview clone:** the clone is `pointer-events:none !important`, and the
cards are nested buttons/links, so native HTML5 DnD is out. Use pointer events +
`setPointerCapture`. IMPORTANT: do NOT re-enable `pointer-events` on the card itself —
that also re-activates its `:hover` lift/glow inside the preview (unwanted, and the hover
rules are scattered/duplicated so overriding them is a cascade fight). Instead lay a
transparent **overlay** (`md-gst-drag-overlay`, `position:absolute; inset:0`, z-indexed)
over each swappable card: the overlay carries `pointer-events:auto !important` + the grab
cursor + `touch-action:none`, while the card stays inert and never enters :hover.
elementFromPoint lands on the overlay; its parent is the host card. The `md-gst-draggable`
class's *presence is the flag gate* (JS adds it only when the flag is on). No visual ghost —
source dims, hovered target highlights, release commits — sidesteps elementFromPoint
self-hit math. Cross the show-hook ↔ persist boundary via a `data-gst-positions` attribute
stamped on `.md-gst-preview__live` (same DOM-channel the checkboxes use). Boards is excluded
(spanning hero — different cell shape).

**Evidence:** `app/frontend/app/utils/dashboard_sections.js` (applyPositions,
gridLayoutState(vis, positions)), `.../components/getting-started-tour.js`
(_swapPositions, _wirePreviewDrag, _persistDisplaySelection),
`.../components/dashboard/authenticated-view.js` (sectionPositions, flag-gated),
`app/models/user.rb`, `lib/feature_flags.rb`; task log
`2026-06-09-getting-started-drag-swap-layout.md`.

**Boards (the spanning hero) move:** unlike the equal small cards (token-permutation),
moving Boards is STRUCTURAL — it changes which cells it spans AND the column widths.
Model it as a separate `{side, raised}` descriptor applied by `applyBoardsPlacement` as
post-processing on the base areas (raise = rotate the 2-row block up one cell in its
column; side:right = swap the two tokens in each Boards row → mirror). The wider column
must follow Boards, so swap 55/45→45/55 — but do it with a `md-grid--boards-right` CLASS
scoped to `@media (min-width: 951px)`, NEVER inline: inline `!important` columns would
beat the ≤950px mobile `@media` rules and force 2 columns on phones. Keep it 100% opt-in +
default-preserving: `gridLayoutState(vis, positions, boards)` with `boards` null/absent
returns byte-identical output (node-verify this). Only transform a clean 2-row
single-column Boards block; full-width/1-row/absent → untouched (no invalid templates).

**Inline `gridStyle` leaks across dashboard tabs:** the home dashboard's `.md-grid--dashboard`
is shared by all tabs (home/boards/reports/extras/supervisors), switched by `activeTab`. The
home layout's inline `style={{this.gridStyle}}` (grid-template-areas/rows, `!important`) and
`{{this.gridClassString}}` (with-caseload / with-org-mgmt / boards-right) are applied to that
ONE element — and inline `!important` beats the per-tab `.md-shell--*-view .md-grid {
grid-template-areas: "extras-page"/"boards"/"reports"/"sup" }` rules, so non-home tab content
(grid-area: extras-page, etc.) loses its cell and auto-places at the bottom. Fix: gate the
home grid styling to `{{if (is-equal this.activeTab "home") ...}}` (same pattern already used
for `md-grid--with-getting-started`). Rule of thumb: any inline grid-template-* on a
multi-tab shared grid MUST be tab-gated, or it overrides every other tab's layout.

**Re-saving a `raw` (POJO) preference silently no-ops — first save works, second doesn't
PERSIST (VERIFIED):** `preferences` is `DS.attr('raw')` mutated in place via
`user.set('preferences.x.y', v)`. Console-verified: after such a nested set,
`user.get('hasDirtyAttributes') === false` and `user.changedAttributes()` is EMPTY — i.e.
ember-data does NOT register the in-place nested mutation as a change. So on a re-save the
record looks clean and `save()` serializes/sends the STALE value; the new value never
reaches the server (and dependent computeds don't re-render). The first save can sneak
through, later ones don't. The `device.updated=true` "dirty bit" is ITSELF a nested set, so
it does NOT actually dirty the record — it doesn't fix this. This is a documented Ember
Data limitation (ember-data only detects REFERENCE changes on object/`raw` attrs, not
in-place mutations — see discuss.emberjs.com "hasDirtyAttributes … nested attributes").
**Fix (community-standard "replace the entire object"):** NEVER mutate the model's object
in place. Copy it, edit the COPY, set the whole attribute ONCE:
```js
var prefs = Object.assign({}, user.get('preferences') || {});
prefs.dashboard_positions = positions;            // edit the COPY
prefs.device = Object.assign({}, prefs.device, {updated: true});
user.set('preferences', prefs);                   // fresh ref → dirty + notify
```
CRITICAL: a `set('preferences.x', …)` BEFORE the reassign defeats it — it mutates the
canonical in place, so the later copy has the same content and ember-data sees no change.
Build the copy first, never touch the model's nested keys. Verify with
`u.get('hasDirtyAttributes')` (→ true) + `Object.keys(u.changedAttributes())` (→ ['preferences']).

**A cloned DOM preview must be made INERT, or a drag's trailing click navigates/closes the
modal:** `cloneNode(true)` keeps the source's real `<a href>` + Ember `data-ember-action*`
attributes, so the `click` browsers synthesize at the end of a pointer-drag bubbles into the
cloned button/link and fires its action / href navigation — tearing down the surrounding
modal (looked like "drag-drop reloads the page"). Fix at clone-build: strip `href` from
anchors and every `data-ember-action*` attr from descendants, AND have the drag overlay
swallow clicks (`preventDefault()` + `stopPropagation()`). A preview should never be able to act.

**Drag-to-swap must exchange the cards' CURRENT cells, not the cells NAMED after them:** with
a positions map `{cardKey → slotKey}`, swapping `positions[A]`/`positions[B]` targets the
base-cells literally named A/B — but once cards have been rearranged, A and B no longer sit
in their own base-cells, so the op cascades into a 3-cycle that displaces a THIRD card (and
the drop-target cue lights up two cards instead of one). Fix: find the cell each card
CURRENTLY occupies (the key X where `positions[X] === card`, default `card`) and swap those
two cells' owners — so only A and B move. (getting-started-tour.js `_swapPositions`.)

**A 1px divider/hairline that computes to `height: 0` is being CRUSHED by flexbox, not
overridden:** if DevTools shows `height: 0px` while the `height: 1px` rule is present (not
struck through), the element is a direct child of a `display:flex; flex-direction:column`
container that is height-capped + scrolling (`overflow-y:auto`), and the default
`flex-shrink:1` squeezes the 1px line to nothing when content overflows. Fix: `flex-shrink:0`
on the divider. Tell: a `--collapsed`/sibling variant of the same element already pins
`flex-shrink:0` — the expanded variant just never got the same guard. This was the real cause
of the "missing" left Action-Panel divider (`.md-board-edit-panel__divider`), even though
selector/color/height all looked correct in source. Don't chase margin/color first — check
the computed `height` and the flex parent.

**Apply a dropped image DIRECTLY to a board button (no settings modal):** both the
classic board (`controllers/board/index.js` buttonSelect) and board-detail open the
`button-settings` modal on an image drop (`content_dropped` → `file_dropped` →
`buttonSelect(id,'picture')`), which is the wrong UX for a drag-drop (flash-then-revert,
extra clicks). To commit straight to the button: upload with
`pictureGrabber.save_image_preview({url, content_type, protected:false})` (returns the
saved image record — same call the modal's `set_as_button_image` uses), then
`editManager.change_button(id, { image: image, image_id: image.get('id'),
_picked_display_url: image.get('url') })`. `change_button` derives `image_url` (the field
board-detail-grid actually renders — NOT `local_image_url`), syncs `board.buttons`,
clears `fast_html`/`last_cb` to re-render, and calls `save_state` (undo + dirty). Scope
the direct path to board-detail via `appStateService.get('current_route')` containing
`board-detail` so the classic board keeps its modal flow. Helper added:
`contentGrabbers.apply_dropped_image_to_button` (services/content-grabbers.js). The image
record uploads immediately; the button's reference persists with the board edit on Done
Editing.

**A speak-mode tap on board-detail CHROME fires the Ember action TWICE (synthetic +
native click) — a toggle opens-then-closes and looks "dead":** in speak mode
`raw_events.js` `element_release` synthesizes a `dispatchPassThroughClick` for
non-`/button/` targets (its final `else`), but board-detail also keeps the BROWSER's
native click alive (the `.board-detail-view` carve-out in `eat_events`, raw_events.js:79).
`preventDefault()` on touchend/mouseup does NOT cancel the native click, so chrome
buttons (options ⋮ menu, sentence-bar tools) get TWO clicks → a toggle nets closed.
Tell-tale: works with devtools open (timing drops one click), broken closed; survives
hard refresh (so NOT live-reload). Fix: in `element_release`'s final `else`, when
`event_source === 'click'` (real pointer → native click coming) AND target is within
`.board-detail-view`, do nothing and let the native click drive the action; dwell/
eye-gaze/scanning use other `event_source`s (no native click) and must still synthesize.
**CRITICAL refinement — scope the skip to `event.type === 'mouseup'` (MOUSE only).** The
double only happens on mouse, where the native click fires regardless of preventDefault.
On TOUCH, `element_release`'s `preventDefault()` CANCELS the browser's synthesized click,
so the synthetic `dispatchPassThroughClick` is the ONLY click — skipping it there makes
board-detail chrome unresponsive to taps on real tablets (the main AAC platform) AND in
devtools device-emulation. Symptom of getting this wrong: works with devtools closed
(mouse), breaks with devtools open (touch emulation) — the exact inverse of the original
mouse-only double-click. So: skip synthetic only for `mouseup`; let `touchend` fall
through and synthesize.
Diagnosis technique that nailed it: a capture-phase recorder logging every pointer/click
(target, `elementFromPoint`, `aria-expanded`, innerWidth) to **localStorage** so a
devtools-closed Heisenbug can be read back after reopening devtools. See
[2026-06-09-board-detail-speak-options-menu-double-click.md](2026-06-09-board-detail-speak-options-menu-double-click.md).

**Safe, verifiable way to dedup byte-identical rule-blocks in a giant SCSS file
(app.scss had ~5.2k duplicated lines from bad merges):** (1) parse into depth-0
brace-balanced blocks with a scanner that IGNORES braces inside strings, `/* */`, and `//`
comments — a naive `{`/`}` counter mis-splits on `[attr="…}…"]` and corrupts the file;
(2) group by exact block text, remove all but the LAST copy (keep-last preserves the cascade
— the later identical copy already wins over anything between it and the earlier copy);
(3) GUARD with cascade-equivalence, not a raw byte-diff: removing a duplicate legitimately
shrinks the raw CSS, so compile both versions `--style=compressed` (pipe candidate via
`sass --stdin`, no temp files), then canonicalize each compiled output by collapsing
byte-identical compiled rules keep-last, and compare. Identical canonical forms ⇒ every
selector/property resolves to the same winning declaration ⇒ behavior-neutral. Only write the
file if the guard passes AND the candidate compiles. Variants are auto-excluded because full
block bodies differ (here: 141 selectors like `:root`, `@font-face`, `@media (max-width:640px)`
×28 distinct bodies were correctly preserved). The compile gate caught a parser bug on the
first run and left the file untouched.

---

## Pattern: board-detail grid + `.button` class = double speak-bar add on mouse

**Surface:** board-detail speak mode, symbol grid taps.

**Root cause:** Classic boards wrap the grid in `.advanced_selection`, which blocks native clicks and routes selection only through `raw_events`. board-detail omits that wrapper so Ember `{{action "select_button"}}` works, but symbol cards still carry class `.button`. On **mouse**, `raw_events` `touch_release` → `buttonSelect` runs on `mouseup`, then the native `click` fires the same Ember action — two `utterance.add_button` calls (often one capitalized, one not). On **touch**, `preventDefault` on `touchend` suppresses the synthesized click, so `raw_events` must remain the sole path.

**Fix recipe:** In `raw_events` `button_select`, skip speak-mode `buttonSelect` for `source === 'click'` on `.md-board-detail-grid` when `lastReleaseEvent.type` is not a touch event. Keep all non-`'click'` sources (`dwell`, `keyboard`, `longpress`, etc.) and scanner's direct `buttonSelect` send unchanged.

**Evidence:** `app/frontend/app/utils/raw_events.js`, `app/frontend/app/templates/components/board-detail-grid.hbs`; task log `2026-06-09-board-detail-speak-bar-double-add.md`.

---

## Pattern: triaging PR-review "security findings" — read the real guard, not the flagged line

Automated/LLM PR reviewers flag plausible-but-already-mitigated issues, hedged with
"may / could / potentially / if the template uses X incorrectly". Each hedge is a tell:
resolve it against the ACTUAL code path before changing anything (RULE #0 — diagnose with
evidence; don't apply theatrical fixes that add dead code and risk regressions). In one
sweep, 5/5 dashboard findings were false positives (`2026-06-10-pr-security-findings-triage.md`):

- **"XSS via interpolated user string"** → the custom i18n `t` helper already HTML-escapes
  EVERY interpolated value (`escapeHtmlForInterpolation`, `i18n.js:18-22,73,84`), the source
  computed returns a plain string (not `htmlSafe`), and `{{t}}` auto-escapes. Check the
  helper's escaping before assuming a raw-input sink.
- **"Client accepts arbitrary `for_user_id` / no permission check"** → board-creation auth
  is SERVER-side: `boards_controller.rb:600-606` validates the target exists (400) AND
  `allowed?(user,'edit')`. The client sentinel (`'self'`) isn't the boundary; the API is.
  FERPA/data-isolation checks live in Rails, never the Ember form.
- **"Missing permission lets user bypass restricted view"** → the flagged flag
  (`caregiverUnlocked`) was a transient, non-persisted DISPLAY toggle (focused↔balanced
  layout), not an access gate; the "unlocked" view shows the same-or-fewer sections
  (`sectionVisibility` still runs `availableHomeSections` + forces Extras hidden). A layout
  toggle on a user's OWN dashboard is not a security boundary.
- **"Cross-account leak from shared collection"** → `appState.sidebar_boards` is the current
  user's OWN sidebar state; appending a system board from it touches no other account.
- **"Race condition in runLater timer"** → already guarded: cancel-existing-before-start in
  the start handler, cancel+null in the end handler, and `runCancel` in `willDestroyElement`.

**Rule of thumb:** for a flagged finding, locate (a) the escaping/sanitization layer, (b) the
server-side authorization, and (c) the resource lifecycle (timer/teardown) — the mitigation
is usually already there. Reply to the PR with file:line evidence instead of patching.
**Evidence:** task log `2026-06-10-pr-security-findings-triage.md`.

---

## Pattern: removing a dashboard display-layout variant is a coordinated multi-touch change + graceful pref coercion

Removing one `dashboard_layout` variant (e.g. 'focused', 2026-06-10) touches a fixed set of
layers — miss one and you leave dead code or a broken state:

1. **Layout engine** — `utils/dashboard_sections.js` (`gridLayoutState`, the per-variant
   transform like `balancedLayout`/`focusedLayout`, any `FOCUSED_*` maps).
2. **Real render** — `components/dashboard/authenticated-view.js` (the `effectiveLayout`/
   `*HomeLayout` computeds, body-class observers, lock/exit actions, lifecycle calls) AND
   its `.hbs` (`{{#if thatLayout}}…{{else}}…{{/if}}` — keep the else as unconditional).
3. **The "Dashboard Design" modal** — `components/getting-started-tour.js` (the style option
   card + renumber the survivors, the preview builder branch, validation arrays
   `['dynamic','focused','balanced']` → `['dynamic','balanced']`, label maps).
4. **Any dedicated component** — delete `dashboard/focused-home.{js,hbs}` once unreferenced.
5. **SCSS** — delete the whole `Focused Layout` section + the stray `body.md-home-focused`
   rule (grep every `md-focused`/`md-home-focused`/`md-main--focused`/`md-back-to-focused`/
   `md-gst-focused`/`layout-focused` selector).
6. **Backend** — update the `User.preference_defaults` comment; do NOT migrate the column.

**Graceful coercion is the load-bearing safety net.** Existing users may have the removed
value stored. Make `effectiveLayout` (real render) AND the modal's `['dynamic','balanced']`
validation **coerce an unknown/legacy value to the default ('dynamic')** so those users
silently fall back instead of hitting a now-missing branch. No DB migration required.

**Watch for shared symbols misattributed to the removed variant.** `greetingFirstName` and
the `focused_talk` i18n key looked focused-only but are used by the BALANCED hero —
keep them. Always grep each candidate symbol's *callers* before deleting.

**First seen in:** [2026-06-10-dashboard-design-rename-and-focused-removal.md](./2026-06-10-dashboard-design-rename-and-focused-removal.md)

## Gotcha: `grep … | head -N` can hide later usages — verify import/symbol safety with an UNtruncated grep

While removing dead code, a `grep -n "runLater\|runCancel" file.js | head -40` showed only the
focused-code usage, so the `@ember/runloop` import was removed as "unused" — but `runLater`
was still used at lines 1295/1372, **past the 40-line truncation**. The broken import was
caught only by the post-edit residue grep (run without `head`). **Before deleting any import
or shared symbol, grep for ALL its usages with no `head`/pager truncation** (or `grep -c`),
then confirm zero remain. Truncated search output is a silent source of "removed something
still in use" regressions.

**First seen in:** [2026-06-10-dashboard-design-rename-and-focused-removal.md](./2026-06-10-dashboard-design-rename-and-focused-removal.md)

---

## Pattern: replace a combinatorial layout matrix with a packer+overrides engine, proven byte-identical

The dashboard grid (`utils/dashboard_sections.js#dashboardLayout`) was a ~20-branch
matrix enumerating `grid-template-areas` per visibility combination of 5 cards — it
doesn't scale to "add more home items." Replaced (2026-06-10) with a **generic 2-column
packer + a small `LAYOUT_OVERRIDES` table** for the few hand-curated/legacy arrangements
the packer doesn't reproduce. Adding a card is now a `LAYOUT_PRIORITY` + `AREA` entry
(the packer places it generically); you only add an override to hand-tune a specific
combo. Balanced stays a thin transform (`balancedLayout`) over the same engine.

**The safety mechanism that made this shippable without a browser: byte-parity.**
`grid-template-areas`/`-rows` are deterministic strings → identical strings render
identically, no visual ambiguity. Proven across all 32 combos by a tiny **node harness**
([docs/spikes/engine-verify.js](../spikes/engine-verify.js)) that diffs engine vs. the
verbatim matrix, plus a golden-table unit test
([tests/unit/utils/dashboard-sections-test.js](../../app/frontend/tests/unit/utils/dashboard-sections-test.js)).
Approach: dump the matrix's 32 outputs first (the golden table), THEN write the engine to
reproduce them — don't hand-derive rules and hope.

## Gotcha: verify a transcription against the REAL file, not a hand-retyped copy

While byte-diffing the engine I "found a bug" (matrix emitting `auto auto 0` for 4 rows,
collapsing the Org row). It was a **typo in my throwaway harness's copy of the matrix** —
the real `dashboard_sections.js:130` was `auto auto auto 0` (correct). Re-reading the
actual file before editing (Rule #0.5) caught it before I shipped a false "bug-fix" +
misleading comment. When a refactor seems to reveal a latent bug in code that's been in
production, first re-read the real source — suspect your transcription before the original.

## Gotcha: `ember test --filter <substring>` runs only ESLint tests in the headless WSL env

In this repo's headless `ember test --filter X` invocation, the ONLY tests that load are
the synthetic `ESLint | ...` ones; real QUnit assertion tests are never matched — confirmed
by filtering an existing known-good test ("it blocks duplicate calls" in
`action-lock-test.js`) which also returned "No tests matched." So a `--filter` returning
"No tests matched" does NOT mean your test is broken or missing. Don't burn rebuilds
chasing it: verify pure-function logic with a node harness, lint the files, and (if needed)
run the full suite via the proper dev/CI path rather than `--filter`.

## Pattern: adding a NON-grid toggle (the welcome hero) to the dashboard engine

The dashboard visibility system (`dashboard_sections` pref + `sectionHidden`) was built for
grid CARDS (`HOME_SECTIONS`, placed by the layout engine). To make a NON-grid element (the
`header.md-hero--dashboard` greeting) toggleable WITHOUT shoving it through the grid packer,
add a parallel registry `EXTRA_HOME_TOGGLES` (key + cardClass + labelKey + `dynamicOnly`)
and reuse the SAME persistence: `sectionHidden(user, key)` is generic, so it governs the
hero with zero new storage. Touch points (all small, all reusing existing seams):
`dashboard_sections.js` (registry + export), `getting-started-tour.js` (render the extra
toggle after the card toggles via a shared `toggleItem()` helper; carry its checkbox state
into the saved map AFTER `sectionsMapFor` since that scopes to grid sections and drops it;
hide its row on Balanced via a `md-gst-section--dynamic-only` class; seed it in the
no-checkbox preview branch), `authenticated-view.js` (`heroHideStyle` computed — gate on
`activeTab !== 'extras'` because that same `<header>` is the Extras page header), and the
template (`style={{this.heroHideStyle}}`). NOTE the modal preview clones only `.md-grid`
(`getting-started-tour.js:317`), so a non-grid toggle persists + reflows the REAL page but
won't animate in the mini-preview — acceptable, not a bug.

## Gotcha: a `<button>` card can render its background unlike an `<a>` card — reset `appearance`

The Account card is a `<LinkTo>` (`<a>`); Create-a-Board / Reports are `<button>`s. All share
`.md-grid .md-card { background: <gradient> !important }`, yet a native `<button>` without an
`appearance` reset can have its surface tinted by native chrome (engine-dependent), making
"same CSS background" look different from the anchor. Fix is hygiene, not a new bg rule
(Rule #0.7): add `appearance/-webkit-/-moz-appearance: none !important` to the shared
`.md-card--as-button` base so every button card paints the `.md-card` gradient identically to
the anchor. Diagnose first: the backgrounds were already CSS-identical (grouped selectors +
base `.md-card`), so stacking a redundant `background:` on create-board would have been a
no-op — the real difference was the element type.

## Pattern: full-width (column-spanning) small card → engine-flagged, page-gradient surface

When the packer emits a lone trailing small card as a full-width `'X X'` row, the card spans
both columns and visually wants to read differently from a half-width button. `gridLayoutState`
scans the final `areas` for any `'X X'` row that isn't Boards, maps the area token back to its
section key (reverse `AREA`), and pushes a `md-grid--fullspan-<key>` class. CSS (scoped to the
>950px two-col width) then gives that card the page (`md-shell`) gradient + a soft white CENTRE
glow and centres its `.md-card__head` cluster (`justify-content: center`) while the titles keep
`text-align:left` — so the image-to-text alignment is preserved, just centred as a group. This
keeps the "spanning card looks intentional" styling data-driven off the engine instead of
hard-coding which section is wide.

## Pattern: an A/B style toggle that reuses the Dashboard Design modal's save+preview seams

To let users flip every dashboard button between badge IMAGES and former SVG ICONS, the
cheapest robust design renders BOTH in each card (`<img class="md-card__icon-img">` +
`<svg class="md-card__icon-glyph">`) and switches with ONE grid class
(`md-grid--badges-icons`) driven by a pref (`dashboard_badge_style`). Why render-both +
class-toggle (not `{{if}}`): the Dashboard Design modal preview is a static
`cloneNode(true)` of `.md-grid`, so a class toggle flips the clone instantly with no
re-render — same trick the layout/section-hide classes already use. The modal control
piggybacks every existing seam: render the segmented control in `_dynamicPreviewHtml`
(toggles page), re-seed it in the show hook's re-seed block, toggle the clone class in
`syncState` via a `currentBadgeStyle()` that falls back to the saved pref when the control
isn't on the page (so the read-only display-style page's preview still reflects the pref),
and persist in `_persistDisplaySelection` next to the layout choice. The home page just
reads the pref into a `badgeStyleClass` computed bound on the grid. Net: one new pref, one
CSS mode block, zero new storage/preview plumbing.

## Gotcha: icons-mode "restore the tile box" is a NEW state, not a cascade override

The image cards run their `.md-card__icon` box transparent (4-class `!important` rules). Icons
mode must put the 46×46 tinted tile back. That's not a Rule #0.7 violation (don't stack a
competing rule for the same state) — `md-grid--badges-icons` is a genuinely DIFFERENT state,
so a mode-scoped block is correct. Match the transparent overrides' 4-class specificity and
place the block AFTER them so it wins on source order; new image-only cards (account/
create-board/reports) never had icon tints, so define theirs in this block too.

## Pattern: ordered-list reorder model replaces swap + special-case placement

The dashboard drag started as TWO models — small cards did a pairwise swap
(`_swapPositions`, a closed-permutation `dashboard_positions` map) and Boards had its own
`side/raised` placement (`applyBoardsPlacement`, gated on a 2-row single-column block via
`boardsMovable`). Two failures fell out of one earlier change: making Boards FULL-WIDTH set
`boardsMovable`→false (Boards stopped moving entirely), and a swap model fundamentally can't
"insert between rows." Both dissolve under a single **ordered list** of section keys
(`dashboard_order`): `packOrder` lays the visible keys out (smalls two-per-row, Boards a
full-width row, a lone small spanning full width); dragging INSERTS the dragged key
before/after the drop target (`reorderInsert` + a `_dropAfter` pointer test). Boards is just
another block in the order — it moves like any card, for free. The whole `applyPositions` /
`boardsCells` / `boardsMovable` / `_boardsDropPlacement` / `_displacedKeys` apparatus deleted;
`gridLayoutState(vis, order, layout)` is the new signature. Lesson: when a feature needs two
parallel special-case models to express one user intent ("arrange my cards"), the unifying
data model (here: an order) is usually simpler than patching either model.

## Gotcha: the modal preview only reconciles a FIXED class list — dynamic classes get dropped

`syncState` toggled a hard-coded `STYLE_CLASSES` array onto the preview clone, so the
engine's DYNAMIC `md-grid--fullspan-<key>` classes never reached the preview (fullspan styling
silently missing in the modal only). Fix: reconcile by REGEX — strip every
`md-grid--(boards-full|boards-right|with-*|fullspan-)` class, then add exactly the set
`gridLayoutState` returned. When an engine can emit an open-ended set of state classes, the
preview must mirror by pattern, not by a frozen allow-list.

## Decision log: deferring a card that needs ~15 shared-rule touches

Adding an "Edit Dashboard" badge-action card meant threading `md-card--edit-dashboard` into
~15 grouped CSS rules that account/create-board/reports share (several with descendant
selectors, so neither `replace_all` nor one consolidated block does it cleanly). Rather than
rush that at the tail of a large change and risk regressing the existing cards, it was backed
fully out of the engine (HOME_SECTIONS/AREA/DEFAULT_ORDER/test) so nothing ships half-wired.
The real fix is a small refactor first: extract a shared `md-card--badge-action` class so the
4th (and Nth) card is one selector, not fifteen — THEN add Edit Dashboard. Half-adding a card
to the engine leaves an empty named grid-area (reserved blank space), so it's all-or-nothing.

## i18n_generator.rb workflow: three gotchas that block or silently skip keys

Running `ruby i18n_generator.rb --merge` (which does `--generate` THEN merges into the 12
non-English locales) to register new keys surfaced three traps:

1. **Duplicate keys hard-block ALL generation.** If any single key maps to two different
   strings across source, the script prints `DUPLICATE <key> <file>` and writes NOTHING
   (`TOTAL DUPS > 0` → "FOUND ISSUES, SO NO GENERATION"). So one stray conflict anywhere in
   the repo blocks your unrelated keys. Run with NO args first (safe dry run — only writes
   under `--generate`/`--merge`/`--confirm`) and read the `TOTAL DUPS` line. Reusing one key
   for two strings is the usual cause — e.g. `create_a_board` for both "Create a Board →" and
   "Create a Board"; fix by moving the trailing arrow into a separate `<span>` so the key's
   string is identical at both sites (no visual change), or split into two keys.

2. **`--generate` DELETES keys no longer referenced in CURRENT frontend source.** It rebuilds
   en.json from a fresh scan, so orphaned keys (removed from templates but left in en.json)
   are dropped — legit cleanup, but a broader diff than "just my keys." Before trusting it,
   confirm the dropped keys are truly dead: no exact `key="X"` / `i18n.t('X'` in
   `app/frontend/app/`, AND no dynamic `'prefix_' + var` construction. (Watch out for grep
   substring false-positives: `allow_cookies` "matched" only because `allow_cookies_checkbox`
   exists.)

3. **The scanner is LITERAL-ONLY — dynamically-referenced keys land in 0/13 locales.** A key
   rendered via `i18n.t(someVar.labelKey, someVar.labelDefault)` (e.g. the EXTRA_HOME_TOGGLES
   registry) is invisible to the parser, so it never reaches the locale files (it still WORKS
   at runtime via the inline default — it's just untranslatable). Register it with a literal
   the scanner CAN see — even inside a `//` comment, since the parser reads every line for
   `i18n.t('...`: `// i18n.t('home_welcome_banner', "Welcome banner")`. Then re-run.

---

## Pattern: Dashboard card icons — color lives in the CHIP, glyph stays monochrome

**Surface:** `templates/components/dashboard/authenticated-view.hbs` `.md-card__icon`
chips (home-tab cards: Speak, Extras, Account, Create-a-Board, Reports, Edit
Dashboard, Caseload, Org).

**What read as "juvenile clipart":** each inline SVG glyph baked in 2–3 stroke
colors (blue #4C86D8 + teal #2A9D8F + slate #46505F) **plus** semi-transparent
`fill="#..." fill-opacity` rainbow fills. Per current icon practice (Lucide,
Linear/Geist, designsystems.com) that multicolor+filled look = "an illustration,
not an icon."

**The fix that works:** keep the tinted gradient chip tiles (already the modern
Stripe/Untitled-UI "Featured Icon" pattern — `app.scss:47216+`, 47265–47310) and
redesign each glyph as **single-hue duotone line art** (one hue = the chip's tint).
Two things both matter — don't skip the second:
1. **New SHAPE, not just new color.** Recoloring the old shapes was rejected
   ("you just kept exactly the same shape"). Pick a more distinctive/elegant
   metaphor: sparkles (extras), area-trend chart (reports), layout tiles (edit
   dashboard), speech-bubble+waveform (speak), avatar-in-ring (account),
   board-cells+plus (create), people-pair (caseload), building skyline (org).
2. **Refined duotone, ONE hue.** The body shape gets a soft same-hue fill
   (`fill="#hue" fill-opacity="0.10–0.13"`) UNDER a `stroke="#hue"` outline;
   detail strokes inherit root `fill="none"`. This is the Phosphor/Untitled-UI
   premium look — depth without the rainbow. The original read as clipart from
   MULTIPLE clashing hues + baked fills, not from fills per se. Never use a
   per-path SECOND hue.
- Keep the set-wide 1.5px stroke + round caps/joins (matches navbar dropdown
  icons → don't introduce a second stroke weight).
- Hue map (matches existing chip tints): speak/create-board/caseload → teal
  #2A9D8F; account/reports/edit/org → blue #4C86D8; extras → coral **#D9573F**
  (deepened from the chip's #F06A5B so it clears ~3:1 on the light coral tile).

**Gotchas:**
- Speak & Caseload each render TWO sibling variants (wide-only + narrow-as-button)
  with duplicated SVG — edit both (replace_all works for the identical caseload pair).
- The wide-Speak/Caseload svgs are 24px in a 46px base chip and **lack**
  `.md-card__icon-glyph` (which forces 34px); do NOT add that class to them or they
  blow up. Only the as-button variants carry it.
- getting-started-tour clones the live home DOM for its preview, so glyph edits
  propagate to the Dashboard Design modal for free — no second edit site.

---

## Pattern: Don't use a cross-component Ember observer as a one-shot EVENT bus — register a direct opener

**Surface:** opening a navbar-mounted component's flow (e.g. `getting-started-tour`
Dashboard Design tour) from a sibling component (the home "Edit Dashboard" card).

**What failed:** the trigger set `appState.open_dashboard_design='display'` and the
tour component had `observer('appState.open_dashboard_design', …)` to react. The
observer never reliably fired → button did nothing. Observers-as-events are
fragile: they won't re-fire for an UNCHANGED value, and registration can race the
signal. Tell: `home-tour.js` uses the same pattern but bolts on a
`didInsertElement` + `sessionStorage` fallback ("a route transition raced the
observer registration") — a sign the team already learned the observer alone
isn't trustworthy here.

**Reliable fix:** have the receiving component **register a bound opener on the
shared service** in `init` (`appState.set('dashboard_design_opener',
this._open.bind(this))`, cleared in `willDestroy`), and have the caller CALL it
directly (`appState.dashboard_design_opener(arg)`), falling back to the old signal
only if no opener is registered. The navbar component is always mounted, so the
opener is present before any click. Deterministic, no observer timing.

**Diagnostic shortcut:** when a NEW trigger "does nothing," `git show HEAD:<file>`
to check whether the wiring is uncommitted/never-worked (vs a regression). And if
two entry points share one opener function, a working second entry point (here the
navbar "Get Started" badge → same `_startGettingStarted`) proves the machinery is
fine and isolates the bug to the trigger.

**Ember-rule gotcha:** `ember/require-super-in-init` wants `this._super(...arguments)`
(spread), NOT `this._super.apply(this, arguments)`, specifically in `init`.

## Gotcha: `ember test` here runs only lint + 3 acceptance tests — the unit suite is NOT wired in

A full `ember test` in this repo executes **1402 tests that are all ESLint / TemplateLint
wrappers + a smoke test + 2 acceptance tests** — **zero** of the `tests/unit/**` QUnit modules
run (verified 2026-06-11 by grepping the TAP output: 0 lines match `Utility`/any unit module). So
adding `tests/unit/...-test.js` gives you a lint-checked file that is **never executed** by the
default command, and `--filter="<module name>"` returns *"No tests matched"* because the module
never loads. Two consequences: (1) `ember test --filter` matches **test NAMES**, not module names
(`--filter="dashboard"` only hit lint wrappers whose names contain the filename); (2) for pure
util logic, verify by **exhaustive manual trace + eslint + `ember build`** (which still compiles
SCSS/templates/JS), not by trying to run the QUnit file. Still write the `-test.js` — it documents
intent and will run if/when the unit suite is wired into CI — just don't expect it to gate here.

## Pattern: dashboard "fill the row" needs an inline grid-template-columns = visible-item count

To make N cards in a CSS-grid row **expand to fill** when some are hidden (no empty cells), you
cannot keep a fixed column count and pad with `.` — and you cannot evenly distribute, say, 3 cards
across 4 fixed columns (4∤3). The fix in `utils/dashboard_sections.js` `focusedLayout`: set the
column count to **exactly the number of visible cards** (`cols = max(1, visibleUtilityCount)`),
express every full-width row as that many repeats of its name (so `grid-template-areas` rows stay
rectangular — required), and emit `grid-template-columns: repeat(N, 1fr)` **inline** (returned as
`gridLayoutState().columns`, applied with `!important` in `authenticated-view.gridStyle` AND the
modal preview `syncState`). Gentle View returns `columns: null` so the stylesheet's 2-col rule
governs. The ≤1024px flex fallback ignores grid-template entirely, so it's unaffected.

## Fact: the two dashboard layout keys are `focused` + `gentle` (renamed from `balanced`/`dynamic` 2026-06-11)

`preferences.dashboard_layout` is `'focused'` (default) or `'gentle'`. **Both were renamed on
2026-06-11, no backward-compat (pre-production):** Focused View was `'balanced'` (a separate
earlier `'focused'` value had been removed), Gentle View was `'dynamic'`. Renamed across the
persisted value (`user.rb` default), JS (`FOCUSED_DEFAULT_ORDER`, `FOCUSED_ACTION_KEYS`,
`focusedLayout`, `reorderForFocused`, `_gentlePreviewHtml`, `gentleOnly`, `=== 'focused'`,
`['gentle','focused']`), CSS (`md-grid--layout-focused`/`-gentle`, `md-shell--layout-focused`,
`ll-layout-focused`, `md-card--speak-focused*`, `md-gst-section--gentle-only`), `data-gst-layout`,
and i18n key names (`getting_started_tour_layout_focused*`/`_gentle*`). The engine branches on
`=== 'focused'` only (everything else → the gentle `dashboardLayout`). **Do not reintroduce
`'balanced'` or `'dynamic'`.**

**Rename technique — and why the two words differ:** `balanced` is a rare word, so a word-boundary
blanket `s/\bbalanced\b/focused/g` was safe (it can't touch `unbalanced`). `dynamic` is a COMMON
word with real false-positives that must be preserved — `dynamic viewport`, `100dvh`,
a `…dynamic-width-css-fluid-layout` SO URL, "rendered via a **dynamic** i18n.t" (runtime sense),
"shared helper with **dynamic** keys". So `dynamic`→`gentle` used ONLY explicit-token seds
(`md-grid--layout-dynamic`, `dynamicOnly`, `_dynamicPreviewHtml`, `getting_started_tour_layout_dynamic`,
quoted `'dynamic'`/`"dynamic"`, the `Dynamic` layout comments) — NEVER `\bdynamic\b`. Lesson: gauge
the word's commonness first (`grep -rl <word> | wc -l`); rare → word-boundary blanket ok, common →
explicit tokens + a hand-audited residual grep.

## Gotcha: dashboard preview tiles + selection gates leak HIDDEN-but-present state

Two distinct bugs, same shape — a computed/gate reading state that's present in the DOM/data but
not actually applicable:

1. **`filterRootBoards` is first-page-sensitive — cluster the FULL library, not a page.** The
   dashboard Boards strip (`previewBoards`) showed sub-board copies of a copied set because it ran
   `filterRootBoards(_fetchedPreviewBoards)` over only the first 20 fetched records. The filter's
   shallow-root map needs the WHOLE owned library to collapse a set to its root tile (the root and
   its sub-boards must be in the same list). `boardCount` already used the full `_fetchedBoards`;
   the strip must too (fall back to the first page until pagination completes). Don't reach for a
   server `root` param — boards-controller `params['root']` is a `search_string ILIKE '%root%'`
   text search, NOT a roots filter.

2. **Selection gates must ignore layout-hidden-but-checked toggles.** The Dashboard Design modal's
   "Nothing to display" overlay + Done/close disabling stopped firing once Focused View became the
   default: Focused View hides the Extras + Welcome-banner toggles (`applyLayoutSections` sets their
   row `display:none`) but leaves them CHECKED, so `anyChecked()` over *all* inputs always returned
   true. Fix: gate on `applicableBoxes()` = inputs whose `.md-gst-section` row isn't `display:none`.
   General rule: when a layout can hide a control while preserving its value, any "is anything
   selected?" check must filter to the controls actually applicable to that layout.

## Gotcha: a saved frontend preference silently vanishes if it's not in `User::PREFERENCE_PARAMS`

`User#process_params` only copies preference keys listed in `PREFERENCE_PARAMS` (`app/models/user.rb`,
iterated ~line 1287) from the request into `settings['preferences']`. Any pref the frontend sends
that ISN'T whitelisted is silently dropped on save, and the save *response* (which lacks it) resets
the in-memory model — so the value "works locally, reverts on close/reload." This bit the dashboard
drag-reorder: the frontend layout engine was migrated from a `dashboard_positions`/`dashboard_boards`
model to a single ordered list `dashboard_order`, but the whitelist still listed the old two keys
and not `dashboard_order`. **When you add/rename a persisted user preference on the frontend, add it
to `PREFERENCE_PARAMS` in the SAME change** (the FE save path and `gridLayoutState` can all be
correct and it'll still look broken). Quick check: `grep "'<pref_key>'" app/models/user.rb`.
## PHI/PII in logs: PiiScrubber and filter_parameters do NOT cover explicit logger calls (2026-06-10)

**Surface:** Cloud Run migration log hygiene (Phase 2.7); any `Rails.logger.*` / `puts` that interpolates user data.

**Gotcha:** Two existing log-safety mechanisms have a coverage gap that becomes a compliance problem under Cloud Run. (1) `lib/pii_scrubber.rb` only runs on the AI-egress path (`ai_board_generator`, `ai_word_predictor`); it is never wired into the Rails/Resque logger. (2) `config.filter_parameters` (`config/initializers/filter_parameter_logging.rb`) only masks Rails' auto-generated request/`Parameters:` lines. **Neither touches explicit `Rails.logger.info("...#{user.user_name}...")` string-interpolation calls.** Anything interpolated into a log string reaches stdout raw. On Render that was ephemeral; on Cloud Run every stdout line is auto-ingested into GCP Cloud Logging (persistent, indexed, HIPAA-scoped) because `RAILS_LOG_TO_STDOUT` is set on web+worker and `log_level` is `:info`.

**Fix recipe (applied):** (a) replace human-readable identifiers/credentials with the opaque `global_id`, or drop them (`user_name`, SAML `name_id`, `supervisee_code`/`supervisor_key` values, raw AI response text, HubSpot response body); (b) demote high-volume INFO lines that emit a `global_id` to `:debug` (suppressed at prod `:info`); (c) it is acceptable to KEEP an opaque `global_id` in a rare failure warn/error where it has real diagnostic value (board-not-found-after-retries, consent-email-skipped). The project's own scrubber classifies `global_id`/`user_id` as identity (pii_scrubber.rb:19), so keep even those out of routine high-volume logs.

**Defense-in-depth (added):** `PiiScrubbingFormatter` (lib/pii_scrubbing_formatter.rb) subclasses `::Logger::Formatter`, scrubs each fully-formatted line via `PiiScrubber.scrub_log_line`, and is wired in production.rb as `config.log_formatter`. It composes with `ActiveSupport::TaggedLogging` (which clones the formatter and extends the clone) via the `super` chain, so request-id tags are preserved. CRUCIAL SCOPE CAVEAT: the formatter redacts email (including TLD-less/quoted-local-part via `LOG_EMAIL_PATTERN`), phone (`LOG_PHONE_PATTERN` — requires separators so bare epoch timestamps are skipped), SSN (3-2-4 with SSA-invalid filter; still over-matches some order ids), and IPv4. It does NOT scrub names, usernames, utterances, board labels, linking codes, or global_ids -- the highest-value PHI in an AAC app (a child's name/utterance) is not regex-detectable, so call-site hygiene stays the PRIMARY control and the formatter is only a thin net. Do not let the formatter's existence justify skipping a call-site audit. Coverage is limited to Rails/Resque stdout through `config.log_formatter`; third-party gems that bypass the formatter (e.g. boy_band internal failure logs) are out of scope. `log_line_needs_scrub?` provides a cheap pre-check before regex passes. Not chosen: raising prod `config.log_level` to `:warn` (production.rb:65) would kill INFO leaks wholesale but also lose all INFO observability.

**Evidence:** audit `docs/task-management/2026-06-10-cloudrun-phi-logging-audit.md`; fixes on branch `scot/compliance/phi-logging-scrub` across `passwords.rb`, `session_controller.rb`, `user.rb`, `ai_board_generator.rb`, `external_tracker.rb`, `logs_controller.rb`, `cluster_location.rb`, `board.rb`, `users_controller.rb`.

---

## Pattern: admin-editable feature flags layer on top of AVAILABLE / ENABLED constants

**Surface:** System Settings → Features; runtime `FeatureFlags.frontend_flags_for`.

**Approach:** Keep `AVAILABLE_FRONTEND_FEATURES` as the code-defined catalog (new flags still need a developer add). Store site-wide enabled list in `Setting` key `default_enabled_features` (seeded from `ENABLED_FRONTEND_FEATURES`). Per-org overrides live in `organizations.settings['enabled_features']`; `nil` means inherit site default. Site-wide group pools: `canary_enabled_features` (default: all AVAILABLE minus `DISABLED_CANARY_FEATURES`) and `beta_opt_in_features` (default: all AVAILABLE). Resolution: org/site baseline → per-user `feature_flags[feature]` if in beta pool → canary if in canary pool. Features tab scope dropdown uses `group:canary` / `group:beta` pseudo-ids; Emails tab hides groups. ENV-locked flags (e.g. `SIGNUP_DEFAULT_LIBRARY_BOARDS`) stay read-only in the UI.

**Evidence:** `lib/system_feature_settings.rb`, `lib/feature_flags.rb`, `Api::SystemFeaturesController`; task log `2026-06-09-system-settings.md`.

---

## Pattern: System Settings authorization — split site admin vs support manager

**Surface:** `Api::SystemSettingsAccess`, System Settings UI.

**Approach:** `User#admin?` is true for both `settings['admin']` (site admin) and Admin-org full managers, so do not use it alone to gate site-wide mutations. Site-wide writes (`default`, `group:*`, app defaults) require `settings['admin'] == true`. Org-scoped reads/writes allow site admin, `admin_support_actions` (Admin-org manager), or `org.manager?` / `upstream_manager?`. UI mirrors this: hide Default/canary/beta scopes and App defaults tab unless `user.settings.admin`.

**Evidence:** `app/controllers/concerns/api/system_settings_access.rb`, `app/frontend/app/controllers/system-settings.js`; task log `2026-06-09-system-settings.md`.

---

## Pattern: persisted email template overrides — output-only ERB + layout wrapper

**Surface:** `SystemEmailOverride`, `SystemEmailTemplates`, System Settings email editor.

**Approach:** Repo file templates may keep `<% if %>` (trusted, rendered via normal mailer views). **Stored** `html_body`/`text_body` overrides must pass `SystemEmailTemplateSecurity.validate!` (only `<%= %>` tags; block dangerous expressions). Deliver overrides with `render_string(binding)` then `render html:, layout: 'email'` — not `render html:` alone (drops layout). `normalize_i18n_overrides` must accept `ActionController::Parameters` via `to_unsafe_h` or preview/save drops nested `i18n_overrides`.

**Evidence:** `lib/system_email_template_security.rb`, `app/mailers/concerns/system_email_override.rb`; task log `2026-06-09-system-settings.md`.


## Pattern: "order-dependent" spec failures on global counts are often orphaned committed rows in the test DB

**Symptom:** A spec file fails ~dozens of examples in a full run, all on
*global* count assertions (`expect(LogSession.count).to eq(2)` -> `got 110`).
Easy to misread as cross-example state pollution / ordering.

**Reality (log_session_spec.rb, 2026-06-11):** `lingolinq-test` carried ~108
LogSession + ~95 JobStash + ~171 RemoteAction rows committed days earlier by a
prior interrupted run. Transactional fixtures were fine (live count held steady
across full runs = no ongoing leak); the orphans just inflated every unscoped
count. A counting example fails the *same way in isolation*, which is the tell:
true order-dependence passes alone, orphan-pollution does not. Examples that
"pass alone" usually just don't assert a global count.

**Diagnose:** add a throwaway `after(:each)` that logs the count, or
`DB_USER=scotw RAILS_ENV=test bundle exec rails runner 'puts Model.count'`. If
count is already nonzero at example #1, it is pre-existing committed data, not a
leak. Check `Model.order(:id).first.created_at` for an old date.

**Fix:** file-scoped `before(:each)` clearing the affected tables (runs inside
the example txn, restored on rollback) for a deterministic baseline. Mirror
`spec_helper`'s `RemoteAction.delete_all` and `log_session_spec`'s
`JobStash.delete_all`. Keep it file-scoped, NOT global: a global
`AuditEvent.delete_all` was shown to perturb counts. See
[[reference_auditevent_escapes_rspec_txn]] and task log
`2026-06-11-log-session-spec-isolation.md`.

---

## Pattern: client-supplied preferences that drive computed inline styles/classes need write-time shape coercion

**Surface:** `User#process_params` `PREFERENCE_PARAMS` loop, dashboard_* prefs, `components/dashboard/authenticated-view.js`, `utils/dashboard_sections.js`.

**Approach:** `PREFERENCE_PARAMS` assigns whitelisted prefs **verbatim** — no type/shape check. When a pref feeds a computed `htmlSafe` inline style or a CSS class name (the `dashboard_layout`/`dashboard_sections`/`dashboard_order`/`dashboard_positions`/`dashboard_boards` set), validate it server-side against a known-keys whitelist on write (`sanitize_dashboard_preferences!`), dropping invalid values so the client falls back to defaults. The frontend already filters unknown keys (`orderedVisible` keeps only `vis[k]`-truthy keys; `effectiveLayout` whitelists `gentle`/`focused`) and builds styles only from the `AREA` map — so this is defense-in-depth, not the sole guard. Key list source of truth is `dashboard_sections.js`; duplicate it in `User::DASHBOARD_SECTION_KEYS` with a sync comment (Ruby can't import the JS).

**Evidence:** `app/models/user.rb` (`DASHBOARD_SECTION_KEYS`, `sanitize_dashboard_preferences!`); triage of 6 merge findings in task log `2026-06-12-dashboard-merge-security-findings.md`. Note: board enumeration via `user_id` is already blocked by `boards_controller#index` `allowed?(user, 'view_detailed')` — not a gap.

## Pattern: top-level route templates render into `#content` with NO `.ember-view` wrapper (shell/workspace height)

**Surface:** `templates/application.hbs:1458-1459` (`<div id="content">{{ outlet }}</div>`), standalone route templates like `templates/board-picker.hbs`, the `.md-shell` height/flex chain in `app.scss`.

**Gotcha:** A top-level ROUTE template (e.g. `/board-picker`) renders its root element **directly** into `#content` via `{{ outlet }}` — there is NO `.ember-view` / `#index_view` wrapper between `#content` and `.md-shell`. So the real chain is `#content > .md-shell.md-shell--board-picker > .md-workspace`. Dashboard pages are different: they render under `#index_view` (a `.ember-view`), so `#content .ember-view > .md-shell` matches THEM but NOT a standalone route. The base shell rule already encodes this by listing BOTH variants: `#content .ember-view > .md-shell, #content > .md-shell {…}` (app.scss:41168-41169). If you target a standalone shell with an `.ember-view`-based selector, it silently never matches.

**Symptom that surfaced it:** On `/board-picker` ≤950px the glass `.md-workspace` card stopped at content height with the `#within_ember` mesh filling below it ("card ends, shell shows"). The `@media (max-width:950px)` single-column block (app.scss:55596) collapses `.md-shell`→`min-height:auto;flex:0 0 auto` and `.md-shell > .md-workspace`→`flex:0 0 auto;min-height:min-content` — intentional for the dashboard (long board lists must scroll), wrong for a short standalone page.

**Fix:** restore BOTH the shell height AND the workspace grow — they are co-dependent (a prior attempt that only flex-grew the workspace failed: the generic shell rule kept the shell collapsed, so there was no free height to grow into, AND the workspace's (0,2,0) rule lost the source-order tie to the generic `flex:0 0 auto !important`). Scope robustly via `#within_ember:has(.board-picker-page)` (proven to match — same hook the bg fix uses — and indifferent to wrapper structure):
```scss
@media (max-width: 950px) {
  #within_ember:has(.board-picker-page) .md-shell--board-picker { min-height: 100vh !important; }           /* (1,2,0) beats #content > .md-shell (1,1,0) */
  #within_ember:has(.board-picker-page) .md-shell--board-picker > .md-workspace {
    flex: 1 1 auto !important; min-height: auto !important;                                                  /* (1,3,0) beats .md-shell > .md-workspace (0,2,0) */
  }
}
```
**Lessons:** (1) Verify the actual DOM wrapper chain before writing shell/workspace selectors on a standalone route — don't assume the dashboard's `.ember-view`/`#index_view` nesting. (2) "Shrink-to-content vs fill-viewport" needs the shell height AND the workspace flex fixed together; fixing only one is a no-op. (3) For a card-not-full-height bug, flex-grow IS the right layer (≠ the `#within_ember` bg-paint fix used for bg-not-filling) — but only once the shell provides a definite tall height.

**Evidence:** task log `2026-06-12-board-picker-workspace-fullheight.md`; contrast `2026-06-12-board-picker-bg-and-tabs.md` (bg fill, different layer).

## Pattern: v2 Ember addons (ember-auto-import code-splitting) break on the Rails-served bundle

**Surface:** `app/frontend/ember-cli-build.js` (`autoImport.webpack`), `app/assets/javascripts/application.js` + `application-test.js` (Sprockets manifests), `bin/render-build.sh`, `lib/tasks/extras.rake` (`extras:assert_js`).

**Symptom:** A feature using a **v2 Ember addon** (e.g. `ember-shepherd` → the Shepherd tours) works under `ember serve` but on the deployed Rails app throws `Could not find module '<pkg>/services/<x>' imported from 'frontend/services/<x>'` and `this.class.create is not a function` (the injected service can't be built).

**Root cause:** A v2 addon's `_app_` re-export is merged into the app (`frontend/services/<x>`) but its real implementation is pulled in by **ember-auto-import**, which by default **code-splits** it into a content-hashed `chunk.<id>.<hash>.js`. Ember's own `index.html` loads those chunk `<script>`s; the **Rails app does NOT use that index.html** — it concatenates only `vendor.js` + `frontend.js` via the Sprockets manifest (`//= require`). So the chunk that DEFINES the module is never on the page. This app's integration (`fingerprint`/`minify` disabled, manual concat) assumes everything lands in `vendor.js`/`frontend.js`; the first runtime auto-import dependency exposes the gap.

**Deploy flow (important):** Render DOES build — `render.yaml` → `bin/render-build.sh`: `extras:assert_js` → `ember build --environment production` → hardcoded `cp -f dist/assets/{frontend,vendor}.{js,css}` onto the Sprockets load path (`app/assets/javascripts|stylesheets`) → `assets:clobber` + `assets:precompile`. Anything not in that `cp` list and not `//= require`d is dropped.

**Fix (4 coordinated changes):**
1. `ember-cli-build.js` `autoImport.webpack`: `optimization: { splitChunks: false, runtimeChunk: false }` + `output: { filename: 'auto-import-[name].js', chunkFilename: 'auto-import-[name].js' }` → one stable `dist/assets/auto-import-app.js` (runtime + all eager deps), no hashed chunks. (Only safe if the app has no dynamic `import()` — verify with `grep -rE "import\(" app/`; `LingoLinq.Log.import` etc. are method calls, not module imports.)
2. `application.js` (+ `application-test.js`): `//= require auto-import-app.js` immediately BEFORE `frontend.js` (runtime must load before the app that consumes it).
3. `bin/render-build.sh`: add `cp -f app/frontend/dist/assets/auto-import-app.js app/assets/javascripts/auto-import-app.js` to the copy block.
4. `extras:assert_js`: copy it too, and `touch` an empty placeholder when no build exists so precompile never fails on the missing `require`.

**Verify:** after `ember build` there must be ZERO `dist/assets/chunk.*.js` the app needs (only `auto-import-app.js`); after `assets:precompile`, the served `public/assets/application-*.js` must contain the impl (`grep -c Shepherd …` > 0) and define `<pkg>/services/<x>`. Load order: auto-import runtime byte-offset < the `frontend/services/<x>` re-export.

**Lessons:** (1) The Rails app ignores Ember's `index.html` — any ember-auto-import output beyond `vendor.js`/`frontend.js` must be manually wired into the Sprockets manifest AND the render-build copy step. (2) Adding a v2 addon to this app is never just `npm install` — it needs this build-wiring. (3) Diagnose deploy bugs against the ACTUAL build (`render.yaml`/`render-build.sh`), not assumptions about committed assets.

**Evidence:** task log `2026-06-12-shepherd-tours-broken-on-render.md`.

## Pattern: SSRF guard for server-side image/URL fetches lives in `Uploader.sanitize_url`

**Surface:** `lib/uploader.rb#sanitize_url` (called by `valid_remote_url?` + every server-side image fetch: `ButtonImage.process_url`, OBF import, symbol download). Any flow where a CLIENT supplies an image `url` that the server later fetches (symbol search, board-detail image drop, create-board-new drag-drop, OBF import) funnels through here.

**Gotcha:** `sanitize_url` is the single SSRF chokepoint, but its original host checks (`^127`, `localhost`, `^0`, decimal-IP) MISSED link-local `169.254.169.254` (cloud metadata) and RFC1918 private ranges (`10/172.16-31/192.168`) — so an authenticated user could point any image-URL flow at internal services. It also didn't restrict the scheme (so `file://`/`gopher://`/`data:` reached the builder, and a nil-host URI could crash the `uri.host.match` line).

**Fix shape:** two layers — (1) `sanitize_url` for fast string-level checks (scheme, IP literals, encodings); (2) `lib/safe_http.rb` for every user-supplied fetch: resolve hostname via `Addrinfo.getaddrinfo`, reject if **any** A/AAAA answer is in a blocked range, then pin validated IPs into libcurl via `CURLOPT_RESOLVE` (`resolve:` in Typhoeus) so connect-time DNS cannot rebind. Redirects are followed manually (max 5 hops) with full re-validation per hop; `followlocation` is always false. Shared IP classification lives in `SafeHttp.blocked_address?` (also used by `sanitize_url` for literals).

## Ethon 0.15 resolve runtime (2026-06-12 follow-up)

Ethon 0.15 rejects `resolve:` as a Ruby Array at **run** time (`Ethon::Errors::InvalidValue`); Typhoeus::Request.new accepts it but `request.run` fails. Convert pin strings to `Ethon::Curl.slist_append` + `FFI::AutoPointer` before passing to Typhoeus. Specs that mock Typhoeus should expect `kind_of(FFI::AutoPointer)` for `:resolve`, not a string array.

**Proxy controller gotcha:** `ActionController::Metal` delegates `content_type` to `response`. A local assignment like `content_type, body = get_url_in_chunks(...)` inside `proxy` does **not** bind a local — it calls the reader. Use distinct names (e.g. `fetched_content_type`) in controller actions that shadow response helpers.

**Test:** `spec/lib/uploader_spec.rb` "sanitize_url" stays network-free (adversarial string cases). DNS/pin behavior in `spec/lib/safe_http_spec.rb` with stubbed `Addrinfo.getaddrinfo`. Proxy SSRF rejection in `spec/controllers/api/search_controller_spec.rb`.

**Lesson:** before "fixing" a client-side upload finding, trace to the server fetch — the create-board drag-drop "SSRF" finding was really a gap in the shared `sanitize_url`, fixed once at the chokepoint, not in the UI component. Also: client supplied image URLs are baked as `<img src>` (no HTML execution sink), and `data:` URLs are stored, never fetched — so "stored XSS via data: URL" doesn't apply here.

**IPv6 gotcha:** `IPAddr#private?` / `#link_local?` miss IPv4-compatible (`::169.254.169.254`) and non-canonical mapped forms (`::ffff:0:7f00:1`). `SafeHttp#embedded_ipv4` must peel these via raw `hton` bytes — and comparisons must use `.b` literals because `hton` returns ASCII-8BIT while `"\xff\xff"` is UTF-8 in Ruby 3 (`==` fails on encoding even when bytes match). Strip zone index (`fe80::1%eth0`) before parse.

**Evidence:** task logs `2026-06-12-pr-security-review-response.md`, `2026-06-12-ssrf-dns-rebinding-fix.md`, `2026-06-12-safe-http-adversarial-fixes.md`.

## Pattern: ButtonImage content_type is the image-type allowlist chokepoint (stored-XSS defense)

**Surface:** `app/models/button_image.rb#process_params` (~line 190-200) — the single place `content_type` and data: URIs get stored for EVERY image path (symbol search, board-detail drop, create-board drag-drop, OBF import). `process_url` (concerns/uploadable.rb) does NOT set content_type; `Uploader.remote_upload` (uploader.rb:296,318) passes content_type straight onto the S3 object's `Content-Type`.

**Gotcha:** client-supplied `content_type` was stored verbatim — `inferImageContentType` (content-grabbers.js) returns the data: MIME / passed-in type as-is (no allowlist), and `ButtonImage` did `settings['content_type'] = params['content_type']` with no check. So a dropped `data:text/html` or a scriptable SVG could be stored as a "ButtonImage" and re-served inline with that type. Board buttons render via `<img src>` (no script exec), so it's NOT a confirmed app-origin XSS — the real residual is a malicious **SVG** served inline from the CDN origin + arbitrary non-image blobs stored as images.

**Fix (defense-in-depth, at the sink):** coerce any non-`image/*` content_type to `image/png`; drop a `data:` URI whose MIME isn't `image/*` (kills the `data:text/html` payload). SVG (`image/svg+xml`) must PASS — OpenSymbols serves SVG symbols, so rejecting it breaks legit rendering; **`SvgSanitizer`** (`lib/svg_sanitizer.rb`, Loofah XML scrubber) strips `<script>`, event handlers, `foreignObject`, and dangerous URIs at `ButtonImage#process_params` (data: sink) and `Uploadable#upload_to_remote` (HTTP/data_uri → S3). SVG uploads force server-side upload (`requires_server_sanitized_upload?`) so client direct S3 POST cannot bypass sanitization.

**Lesson:** a client-side "unsafe upload" finding usually resolves at a server chokepoint, not in the UI component — same as the SSRF→`sanitize_url` fix. Trace content_type all the way to what the CDN serves before judging exploitability; `<img src>` rendering neutralizes most stored-image XSS, leaving SVG-served-inline as the real residual — address with `SvgSanitizer`, not blanket SVG rejection.

**Evidence:** task logs `2026-06-12-pr-security-review-response.md`, `2026-06-12-svg-upload-sanitization.md`; tests in `spec/lib/svg_sanitizer_spec.rb`, `spec/models/button_image_spec.rb`, `spec/models/concerns/uploadable_spec.rb`.

## Pattern: layout-variant selectors that SWAP a base class have EQUAL specificity — they can't be relocated to a partial

**Surface:** the Focused View overlay rules in `app.scss` (`.md-grid--layout-focused …`, scattered
~29407, 41313, 46922-47229, 47584-47835, 52753, 56373+). Tried to consolidate them into a
`_focused-view.scss` partial imported via `@use` (which forces the rules to the TOP of the compiled
output).

**Gotcha:** a focused selector like `.md-grid--layout-focused .md-card--badge-action.md-card--as-button .md-card__sub`
does NOT add a class to the gentle base — it SWAPS `.md-grid` → `.md-grid--layout-focused`. Same class
count → **equal specificity** (0,5,0) to the gentle `.md-grid .md-card--badge-action… .md-card__sub`. So
the focused rule wins ONLY because it sits LATER in source order. The code documents this in its own
comments ("Placed AFTER the badge-action text rules so … colours win the equal-specificity source-order
tie", `app.scss:47582`; "beats … #5C6470 by source order", `:47615`, competitor at `:47564`). Move such a
rule to the top of the file (or into a `@use`'d partial) and the GENTLE rule wins → silently broken
focused cards. Rules are HETEROGENEOUS: a few genuinely win by specificity (`.md-grid.md-grid--layout-focused`,
TWO classes on the grid = 0,6,0, e.g. `:47816`) and ARE relocatable; most are not. A blanket relocation
can't tell them apart.

**Verification trap:** a pre/post dart-sass **compile diff does NOT catch this** — the declarations are
byte-identical; only the winning rule flips. Detecting an order-induced regression needs computed-style /
browser checking, not a CSS text diff. So "the SCSS still compiles" and "the declaration set is unchanged"
are NOT proof the cascade is unchanged.

**Lesson:** before relocating any variant-scoped CSS (layout/theme/mode overlays), check whether each
selector ADDS a qualifying class (→ higher specificity, order-independent, safe to move) or SWAPS the base
class (→ equal specificity, order-dependent, NOT safe to move). If you must consolidate order-dependent
rules, first convert each source-order win into a specificity win (add a `body.<mode>` ancestor or a
double-class `.md-grid.md-grid--<mode>`) — a separate, riskier refactor — THEN relocate. For a NEW overlay,
prefer wiring the runtime body-class globally (see next pattern) + a scoped partial as the home for NEW
rules, and leave battle-tested inline rules in place. Relates to
[`!important` does not beat source order at equal specificity](#pattern-important-does-not-beat-source-order-at-equal-specificity--bump-specificity-with-a-compound-selector-instead).

**Evidence:** task log `2026-06-12-focused-view-global-overlay.md`.

## Pattern: app-wide pref→root-class overlays belong in app-state, mirroring `set_fitzgerald_scope`

**Surface:** the Focused View overlay needs `body.ll-layout-focused` present on EVERY page (gated on
`preferences.dashboard_layout === 'focused'`, the default). It was originally toggled inside
`components/dashboard/authenticated-view.js` (`_syncLayoutBodyClass`, added on `didInsertElement`, REMOVED
on `willDestroyElement`) — so the class only existed while the dashboard was mounted and vanished on
navigation, making an app-wide overlay impossible.

**Fix shape (the established pattern):** there is already an idiomatic pref→root-class sync to copy —
`set_fitzgerald_scope`. (1) a `LingoLinq.set_<x>_scope(value)` helper in `app/app.js` toggles the class on
`document.body`/`documentElement`; (2) a `sync_<x>_scope: observer('sessionUser', 'sessionUser.preferences.<key>', …)`
in `services/app-state.js` calls it — firing on `sessionUser` change (initial load / login = the per-page-load
check) AND on the specific pref change. `sessionUser` (the logged-in account holder, set on auth) is the right
source for chrome prefs, not `currentUser` (which can be a "speak-as" target). Remove the component-local
toggle so there is a single authority.

**Lesson:** for any "apply X app-wide based on a saved user preference" need, don't add a body-class toggle in
a page component (dies on navigation) — put it in `app-state` as a `sessionUser`-driven observer mirroring
`set_fitzgerald_scope`, and keep the variant CSS in an ancestor-scoped partial so the baseline (e.g. Gentle
View) is untouched. See [layout-variant selectors that SWAP a base class](#pattern-layout-variant-selectors-that-swap-a-base-class-have-equal-specificity--they-cant-be-relocated-to-a-partial)
for why the EXISTING inline rules can't simply be moved into that partial.

**Evidence:** task log `2026-06-12-focused-view-global-overlay.md`.

---

## Pattern: Preview-clone pointer-drag — hit-test by geometry (not elementsFromPoint) and re-wire after every clone rebuild

**Surface:** the Dashboard Design modal's drag-to-reorder
(`getting-started-tour.js` `_wirePreviewDrag`), and any pointer-drag built
over a CSS-`zoom`ed CLONE of a grid where the clone is
`pointer-events:none` except for per-item drag overlays.

**Symptom:** drag-to-swap "doesn't work every time" — drops miss or land
on the wrong slot, and (the bigger one) drag stops working entirely after
the user switches a setting that re-renders the preview. Smoothness also
suffers. Multiple prior fixes that tweaked the commit/hit-test math did
not resolve it.

**Two independent root causes — both must be fixed:**

1. **Target detection via `elementsFromPoint` is unreliable here.** The
   clone forces `pointer-events:none` on everything but the overlays, and
   the dragged card is pinned `z-index:999` and translated to sit directly
   under the cursor. So the lookup must peer THROUGH that ghost to find the
   occluded target overlay — sensitive to stacking, sub-pixel position,
   overlay border-box vs grid gap, so it intermittently returns no target.
   **Fix: detect by GEOMETRY.** A CSS `transform` on the dragged item is
   visual-only and never reflows its siblings, so every OTHER item's
   `getBoundingClientRect()` is its true on-screen cell. Scan those rects
   (excluding the dragged item; skip zero-rect = display:none) for the one
   containing the cursor. Deterministic, independent of stacking/pointer-
   events/the ghost, valid under CSS `zoom` (rect and `clientX/Y` share
   screen space on current Chrome), and cheap (no forced hit-test → also
   fixes per-frame jank). Use the SAME scan at release instead of a cached
   "last highlighted" target — a cached target goes stale when the final
   pointermove's rAF frame is cancelled on pointerup.

2. **Drag wired once, but the preview is REBUILT on settings change.** The
   wiring (`_wirePreviewDrag`) ran a single time on modal-open, but picking
   a display style calls `_buildPreviewContent`, which REMOVES and re-clones
   the preview DOM. The fresh items have no overlays/listeners and the old
   `cards`/closure point at detached nodes → drag silently dead until the
   modal is reopened. **Fix: wrap the wiring in a function and re-call it
   after every rebuild.** A per-item `_gstDragWired` expando guards against
   double-wiring (expandos are NOT copied by `cloneNode`, so fresh clones
   re-wire correctly).

**General lesson:** when a feature is wired imperatively onto cloned/
rendered DOM, audit EVERY path that re-renders that DOM and confirm the
wiring re-runs — "works on open, dead after interaction X" is the tell.
And prefer geometry (rect containment) over `elementsFromPoint` whenever a
moving/occluding element sits between the cursor and the target.

**Evidence:** task log `2026-06-12-dashboard-drag-reliability.md` (the
"deeper" + adversarial-review sections). User-verified working after the
geometry + re-wire fixes.

**Related:** [Custom-JS drag works on desktop but not in touch-emulation](#pattern-custom-js-drag-works-on-desktop-but-not-in-touch-emulation--root-cause-is-touch-action-not-the-js)
(touch-action), [Dashboard card order is driven by grid-template-areas](#pattern-dashboard-card-order-is-driven-by-grid-template-areas-per-breakpoint--variant--reorder-there-never-the-dom).

### JSON bundle import: images missing when S3 upload fails locally

**Symptom:** JSON bundle import creates boards and `image_id` on buttons, but
buttons show no symbols. `ButtonImage` rows have `pending: true`, `url: nil`,
`errored_pending_url` set to the CloudFront source URL.

**Root cause:** `upload_to_remote` successfully fetches OpenSymbols /
CloudFront URLs during import, but when the S3 post fails (common in local dev
without upload creds) it only recorded `errored_pending_url` for http(s)
sources — leaving the image stuck pending with nothing displayable.

**Fix:** `Uploadable#store_downloaded_file_fallback!` — on S3 failure after a
successful fetch, store bytes as a `data_uri` (≤512KB) or keep a trusted
symbol-CDN URL with `pending: false`. Also normalize synthesized bundle URLs
in `ApiJsonBundle#coalesce_media` via `encode_import_url`.

**Re-import required** after pulling the fix; existing pending images on a test
account won't self-heal unless you re-import or run `upload_to_remote` again.

### JSON bundle import: custom photos replaced by OpenSymbols after import

**Symptom:** Imported custom button images (e.g. teacher photos) display
correctly at first, then swap to stock symbols (e.g. dart for "Miss") minutes
later or after reload.

**Root cause:** `ButtonImage#ensure_library_url_for_skin!` runs on a slow job
after board API load when `needs_library_url_enrichment?` is true (S3-hosted
import copies). It searches OpenSymbols by button label and stores
`library_alternates`. With `preferred_symbols: opensymbols` (default), the
client renders the alternate URL, not the imported photo. `Board#swap_images`
can also replace `image_id` by label lookup (only skips `lingolinq-usercontent`
URLs).

**Fix:** JSON bundle import sets `ButtonImage#settings['preserve_source_image']`.
That flag skips skin enrichment, keeps `settings_for` on the original URL, and
skips `swap_images` replacement. Re-import affected boards after deploying.

**Evidence:** `lib/converters/lingo_linq.rb`, `app/models/button_image.rb`,
`app/models/board.rb#swap_images`, task log `2026-06-13-json-bundle-import.md`.

---

## Pattern: "Center the cards" on the account page means centering `.row.big_buttons`, not the stat rows — and it must be base-level, not Focused-View-scoped

**Symptom:** Account-page stat cards (`.md-user-summary__stats-row--boards`,
`--supervise`) render left-aligned on small screens. Repeated attempts to
center them by adding `justify-content: center` / a flex-column to the stats
row *itself* (and verified-correct via compiled-CSS cascade) did not move them.

**Root cause (two compounding mistakes):**
1. **Wrong element.** Those stat rows are nested **inside** `.row.big_buttons`
   (`app/templates/user/index.hbs`), which at `@media (max-width:768px)` is
   `display:flex; flex-wrap:wrap` with **no `justify-content`**. The stat rows
   are flex *items* of that container, so they pack to the left regardless of
   how their *internal* cards are aligned. Centering the cards inside a row
   does nothing when the row itself is a left-packed flex item. Fix: center the
   **container** → `.md-user-summary .row.big_buttons { justify-content:center }`.
2. **Wrong scope.** Focused View is `body.ll-layout-focused` (toggled in
   `app.js` only when layout ≠ 'gentle'). A fix scoped to `body.ll-layout-focused`
   is a no-op in Gentle View. "Center on small screens regardless of view" ⇒ the
   rule must live at the **base** level (`.md-user-summary …`), not inside the
   focused-view block.

**Also burned:** generalizing the (wrong) fix to `.md-user-summary__stats-row`
re-showed the `--boards` row that Focused View hides — because `display:flex`
(specificity 0,2,1, later in source) beat the `display:none` hide (also 0,2,1).
Only set `display` on a row you're sure isn't the hidden one; prefer centering
the parent (no `display`/`width` touched ⇒ the `--boards` hide stays safe).

**Lesson:** When cards "won't center," check whether they're flex/grid *items*
of a wrapper and center the **wrapper**. And confirm which view-class
(`body.ll-layout-focused`) actually applies before scoping a rule to it.

---

## Pattern: A divider/hairline in a flex-column container "has space but no line" → flex-shrink collapsed its height

**Symptom:** A `<div>` divider (e.g. `.la-mobile-drawer__divider`, height 1–2px) renders an
empty GAP where it should be but no visible line — only on tall/overflowing layouts.

**Cause:** The parent is `display: flex; flex-direction: column` with overflow (e.g. the mobile
drawer panel). When content exceeds the container, flex shrinks items with the default
`flex-shrink: 1`. A divider has **no content**, so its min-content height is 0 → it collapses to
0px. Its `margin` is NOT subject to flex-shrink, so the gap remains while the line vanishes.

**Fix:** Pin the divider's size: `flex-shrink: 0;` on the divider rule. (Same fix applies to any
fixed-size, zero-content flex child — spacers, rules, thin separators.)

**Lesson:** "Gap shows but the element doesn't paint" inside a flex column = suspect flex-shrink
collapsing a zero-content child before suspecting the background/color.

## Pattern: Shepherd tour steps for a user-reorderable surface must be built from the LIVE DOM, not a fixed list

The Gentle View home dashboard is now a drag-to-reorder + show/hide grid
(`utils/dashboard_sections.js` → `dashboard_order` / `dashboard_sections`
prefs). A guided tour with a hard-coded step list + per-card placement sides
(`speak`→right, `boards`→left, …) breaks the moment a user moves or hides a
card: the popover points the wrong way and the tour jumps around instead of
following what the user sees.

**Fix (the position-independent tour, `app/frontend/app/utils/tours/`):**
1. **Coverage from the shared registry** — iterate `HOME_SECTIONS` (the same
   source of truth the renderer uses) so tour coverage can't silently drift
   when cards are added. Per-card tour *copy* lives in a `cardCopy()` switch.
2. **Skip hidden cards via `offsetParent`** — cards turned off are
   `display:none !important` but STAY in the DOM, so a bare `querySelector`
   still finds them and Shepherd spotlights a zero-size box (popover flies to a
   corner). `visibleEl(sel)` = first match with `offsetParent !== null` skips
   hidden cards AND picks the visible variant of a dual-markup card
   (`-wide-only`/`-narrow-only`) without special-casing. (Same failure family
   as the dual-markup spotlight bug.)
3. **Order by live geometry** — sort the resolved elements by
   `getBoundingClientRect()` top, then left, so steps follow the on-screen
   reading order whatever the saved arrangement is.
4. **Placement from geometry, not a fixed side** — `placementForElement(el)`:
   `<=1024px` or near-full-width → `bottom`; left half → `right`; right half →
   `left`. Recompute on resize for `home_tour_card_*` steps only and re-show the
   open step.
5. **Small screens** — the nav step targets whichever control is visible
   (`.md-pillnav` vs the collapsed `.md-pillnav-dropdown__trigger`, since
   `.md-pillnav` is `display:none` at `<=$aac-breakpoint-xs`); per-pill steps
   gate on the pill row's `offsetParent`.

**Two corollaries:**
- **Page-specific tours need a dispatcher, not one mega-component.** A
  `tourBuilderFor(route, layout)` registry maps the page to its step-builder;
  the trigger button hides (`hasTour`) where no tour exists. The home dashboard
  renders at BOTH `user.index` and `user.home`; home-only navbar affordances
  (display-style, the tour button) gate on `current_route == "user.home"`.
- **Don't lose a side-effect when gating the tour.** The post-registration
  auto-open also hands the user off to the critical-mode setup wizard. When the
  current layout has no tour yet (default Focused View), still run the handoff —
  gate the *tour*, not the *handoff*.
## Pattern: compliance-officer write guard uses a file allowlist, not directory prefixes

**Root cause family:** granting `Write` on broad prefixes (`audit-reports/`, `/tmp`) lets a
read-mostly agent touch register truth (`FINDINGS.json`) or stage files outside the repo tree.

**Fix pattern:** `compliance-officer-write-scope.sh` resolves paths with `File.realpath` (or
parent realpath for not-yet-created files), then matches an explicit relative-path allowlist
(calendar, dated hygiene/regulatory notes, `docs/legal/*.md`). `FINDINGS.json` / `FINDINGS.md`
are hard-denied. `/tmp` is not allowed. Calendar `.md` is generated by
`scripts/compliance-calendar-render.rb` with a CI `--check` drift gate.

**Evidence:** `docs/task-management/2026-06-13-pr-review-phase3-fixes.md`; hook at
`.claude/hooks/compliance-officer-write-scope.sh`.

## Guided tours: handoff-driven outro + unregistered title keys

**Tour-step `title` keys are NOT statically registered by `i18n_generator.rb`.**
Titles go through `decoratedTitle(headingKey, headingDefault)` (utils/tours/shared.js),
which calls `i18n.t(key, default)` with *variable* args — the generator only scans
literal `i18n.t('lit', "lit")` calls, so it never sees them. `home_tour_welcome_title`,
`home_tour_done_title`, `home_tour_next_title` are absent from `en.json` by design and
render via the runtime default. Don't "fix" their absence; keep a good English default in
code. Body/button keys passed straight to `i18n.t` DO get registered.

**Outro variant is driven by the handoff, not by `tourSeen`.** The home tour's final step
previews "pick your communication board (page-set)" only when `_startTour` got an
`afterComplete` board-picker handoff (auto-open / first-time flow). Manual replays
("Take a tour") have no handoff → keep the celebratory "You're all set / Finish" outro.
Keying the copy off the *actual* navigation avoids promising a board pick we won't deliver.
Threaded: guided-tour `_startTour` → registry thunk `(options)` →
`buildHomeSteps(layout, options)` → `doneStep(options.handoff)`.
Evidence: `docs/task-management/2026-06-14-home-tour-board-picker-handoff.md`.

## Shepherd tours: hub-and-spoke "menu mode" via tour.show()

**Button `action` is bound to the Tour, and `Tour.show(id)` jumps anywhere.**
In shepherd.js 14.5.1, `action = config.action.bind(step.tour)` (dist/cjs line
3284), so inside a button `action` callback `this` is the Tour instance —
`this.show('<step-id>')`, `this.complete()`, `this.cancel()` all work. `Tour.show`
takes a step id OR index. That makes a non-linear MENU possible over a single
linear `steps` array: a centered hub step whose footer buttons each
`this.show(topicId)`, topic steps with a "Back to menu" button
(`action: () => this.show('home_tour_menu')`), and `type:next` still walks the
array by index (so topics flow in order into the done step). No need for a
separate state machine.

**Pattern:** build menu-mode as its own step list (`buildHomeMenuSteps`) chosen by
an `options.menu` flag threaded component → registry thunk → builder. Decide the
flag in the component: `menuMode = tourSeen && !afterComplete` (returning user,
NOT the first-time handoff). Resolve topic spotlight elements from the DOM and
skip absent ones; if none resolve, return null and fall back to the linear tour.
Progress dots imply 1..N order, so suppress them in menu mode (detect a
`home_tour_menu` step in `_renderTourProgress`). Navigation that needs the router
(e.g. a "go to board picker" link in the outro) can't live in step data (action's
`this` is the Tour, not the component) — pass an `onPickBoard` callback down from
the component and call it from the button action after `this.complete()`.
Evidence: `docs/task-management/2026-06-14-home-tour-board-picker-handoff.md`.

## Shepherd intro title cut off / popover off-screen = flex min-width:auto

A long centered-tour heading (e.g. "Next: pick your communication board
(page-set)") pushed the intro/outro popover past its `max-width:560px` and off the
left edge, clipping the title. Cause: `.shepherd-title` is a flex ITEM of
Shepherd's flex `.shepherd-header`, and flex items default to `min-width:auto`, so
they won't shrink below their content — a title wider than the cap forces the box
wider instead of wrapping. Short titles fit under the cap so they never exposed it.
Two compounding causes — fixing only the first did NOT work:
1. `.shepherd-title` is a flex ITEM of Shepherd's flex `.shepherd-header` with the
   default `min-width:auto`, so it won't shrink below content. (`min-width:0` here.)
2. THE REAL BLOCKER: the heading is `display:inline-block` (in the
   `prefers-reduced-motion: no-preference` block, app.scss ~92185, for its
   slide-in animation). inline-block sizes to its content (one line) and never
   wraps regardless of the parent's `min-width:0` — so the long title still forced
   the card wider than its `max-width:560px` cap and off-screen.
Fix that shipped (per user "widen the modal"): give the long-title outro variant
(it carries a distinct `md-tour__step--next` class) a wider cap clamped to the
viewport — `max-width: min(720px, 94vw)` — so it fits on one line on desktop and
can never run off-screen; PLUS `max-width:100%` on the inline-block heading so it
wraps as a fallback on narrow screens. General rule: a long heading that won't wrap
inside a max-width'd card — check BOTH flex `min-width:auto` AND a
`display:inline-block`/`white-space:nowrap` on the heading itself.

## Pattern: board-preview latency is cold-cache, not the loading gate — warm on intent
The board-preview loading overlay is correctly two-phase (model resolved AND canvas
images settled — `board-preview.js#_emitCombinedLoading`, overlay gated on
`preview_loading` in `board-preview-overlay.hbs`). But the canvas has a hard **4s
safety net** (`board-preview-canvas.js#render_canvas`, the `runLater(..., 4000)`)
that force-fires `onCanvasReady` even with images still pending — it assumes
"cached/CDN-warm loads land in well under 1s." Cold, image-heavy public catalog
boards (e.g. 84-button) cold-fetch dozens of S3/CloudFront symbols past 4s, so the
overlay lifts while images are still loading → "images pop in after the spinner
ends." Not a regression; inherent to previewing uncached boards.
**Fix pattern (prefetch-on-intent):** warm a board on hover/focus/touch of its card,
NOT eagerly on container open (the board-picker tour loads brand groups of up to
50 boards ×2 — eager-all is a thundering herd). The warmer (`board_preview_warmer.js`)
must (1) load the FULL record (list/search queries ship summary rows without
`image_urls`; reload if `image_urls` missing — mirror board-preview's partial check)
and (2) `new Image().src = url` for the SAME URLs the canvas requests: reproduce
`variant_image_urls(skin)` + `[id + '-' + preferred_symbols] || [id]`, with
preferred = `referenced_user.preferences.preferred_symbols || 'original'`, skin =
`currentUser.preferences.skin`. This warms the browser HTTP cache so the canvas's
`resolve_url_sync` remote-URL fallback becomes a cache hit. board-icon is shared
app-wide, so gate warming behind an opt-in attr (`prefetchPreview`, default false)
that only the picker passes — never enable hover-prefetch globally.
**Root fix (not just the accelerator):** the canvas's fixed 4s safety net was the
actual culprit — it force-fired `onCanvasReady` while images were still loading.
Replace any "fixed deadline from start" overlay-release timer with a **no-progress
stall watchdog**: extract a single `do_emit()`, then cancel+reschedule a
`runLater(do_emit, STALL_MS)` on every unit of progress (each settled image in
`mark_image_done`). A slow-but-steady load keeps the overlay up until the last item
lands (pending→0, normal path); the timer fires ONLY on a true wedge (no onload AND
no onerror ever), so it can't stick forever yet never penalizes a slow device.
Cancel the timer in `do_emit`, at render start (observer re-render), and in
`willDestroyElement`, and skip re-arming when `isDestroyed`/`isDestroying`. General
rule: a loading gate that must wait for N async units should watch PROGRESS, not
wall-clock — a fixed deadline is correct only when you can guarantee the work
finishes within it (here, only warm/cached loads did).

## Gotcha: every route transition closes all modals (global_transition) — don't keep a modal "open behind" a routed page
`app_state.global_transition` (`app/services/app-state.js`, fired on every Ember
`routeWillChange` from `routes/application.js`) unconditionally calls `modal.close()`
+ `modal.close_board_preview()`. So a service modal (rendered via the modal service
into `modal-container.hbs`, outside the route outlet) CANNOT survive a
`router.transitionTo(...)` — the transition tears it down. Implication for guided
tours / multi-step flows: do NOT try to keep a modal mounted-but-hidden across a
route change (it needs an exemption in global_transition + CSS hiding + restore, and
leaks if any other navigation fires). Two correct patterns instead: (1) stay in the
modal layer — render the next step as an overlay STACKED on the still-mounted modal
(how board-preview-overlay stacks on the tour-board-picker modal), so no route change
happens; or (2) if the modal is STATELESS, accept the transition and RE-OPEN it on
return — `transitionTo(route)` then open the modal in the transition's `.then`
(opening AFTER the transition resolves dodges global_transition's close, which fires
at routeWillChange). Example: `create-board-new#close` re-opens `tour-board-picker`
on Cancel when `from_tour` is set. Carry the "came from the modal" intent in a local
component property captured at init (the route's `deactivate` clears the appState
flag, so reading appState at close-time is too late).

## Gotcha: Shepherd modal overlay is VISUAL-ONLY; canClickTarget:false makes the target click "fall through"
A Shepherd `modal: true` tour does NOT block page interaction. The dark overlay
(`.shepherd-modal-overlay-container`) is `pointer-events:none` (visual scrim only),
and `canClickTarget:false` merely sets `pointer-events:none` on the spotlit target —
which doesn't swallow the click, it makes the target TRANSPARENT to pointer events,
so the click falls THROUGH to whatever element sits behind it. Concrete bug: the
board-picker tour spotlights a card's `.info` Preview pill; clicking it fell through
to the parent board-icon card's `pick_board` action and navigated into the board
mid-tour. So "disable the target" is NOT enough to make a tour read-only.
**Fix:** make the whole app inert while a step is showing, with one CSS rule keyed
on Shepherd's own active-step class — `body:has(.shepherd-element.shepherd-enabled)
#within_ember { pointer-events: none; }` — plus `.shepherd-element{pointer-events:
auto}` so the popover stays live. Shepherd portals the popover + overlay to <body>
OUTSIDE `#within_ember` (the ember app root), so the popover keeps working and only
the page goes dead. Releases automatically when the tour ends (no enabled step), so
a subsequent live modal/handoff is unaffected. Applies to EVERY tour on the shared
runner. Keep `canClickTarget:false` too (defense-in-depth + documented standard).

---

## Pattern: a CSS background-image on a Shepherd popover (or any lazily-injected element) flashes blank on first open — preload it

**Surface:** any image shown via CSS `background-image: url(...)` on an element
that is injected into the DOM on demand — Shepherd tour popovers, modals,
dropdowns. Symptom: the element paints with a blank gap where the image goes,
then the image pops in a beat later, but only the FIRST time (cached after).

**Root cause:** a browser does not fetch a CSS `background-image` until the
element is laid out and painted as visible. Shepherd portals its popover into
`<body>` only at `tour.start()`, so the background fetch begins at show time —
the card paints blank, then the bytes arrive. (For the guided tours this hit the
welcome-card map illustration: `tour-map-dark.png`/`tour-map-light.png` on
`.md-tour__step--welcome .shepherd-text`, app.scss ~92195/92249, shared by all
three opening tours.)

**Fix:** preload the bytes before the element exists with
`<link rel="preload" as="image" href="...">` in `app/frontend/app/index.html`.
This is the codebase's established pattern — the Focused "Let's Communicate"
hero (`speak-circle-simple-dark.webp`) is preloaded there for the identical
reason (index.html:36-43). Notes:
- An `<img>` can also take `decoding="sync"`; a CSS background cannot, so for
  backgrounds the preload fetch IS the whole fix — decode of a small (≤120px)
  PNG is sub-frame.
- index.html is static (only ember-cli tokens like `{{rootURL}}` are processed),
  so it can't branch on the user's `dashboard_layout` — preload BOTH variants if
  the image differs per layout. Each tour map is ~30-40KB, so this is cheap.
- Prefer this over JS `new Image().src` warming on component mount for tours: the
  auto-open tour (new users) fires immediately after render, so warming wouldn't
  finish in time for the very case that matters; the index.html preload starts at
  the top of page load, parallel and high-priority.

**First seen in:** [2026-06-15-tour-welcome-image-blank-flash.md](./2026-06-15-tour-welcome-image-blank-flash.md)

---

## Pattern: a guided-tour auto-open flag consumed at a single afterRender misses when the gating state (edit_mode) resolves on a promise microtask — poll the condition

**Surface:** a cross-page hand-off flag (e.g. `appState.board_detail_tour_pending`)
set on page A, then consumed by a component that mounts on page B to auto-start
something (a tour). The consumer checks a condition derived from route state
(`tourKey` → `appState.edit_mode`) and clears the flag.

**Symptom:** the auto-start silently never fires, even though the flag is set
correctly and the consumer component mounts.

**Root cause:** the consumer fired ONCE (init → `scheduleOnce('afterRender', …)`)
and the condition it gated on wasn't true yet at that tick. On the board-detail
EDIT page, `appState.edit_mode` is a computed on
`stashes.current_mode == 'edit' && currentBoardState`, and the `.edit` route sets
`current_mode='edit'` INSIDE `check_for_needing_purchase().then(...)` — a promise
microtask, not synchronously in setupController (routes/user/board-detail/edit.js).
So the single afterRender check runs before edit mode settles, sees the condition
false, and does nothing. For a `tagName: ''` (tagless) component, `didInsertElement`
never fires, and an observer on the flag/`tourKey` won't fire either when the flag
was already true (no CHANGE after mount) — so there's no second chance.

**Fix:** poll the gating condition on a bounded schedule (e.g. 20 × 150ms ≈ 3s)
until it holds, THEN consume the flag once and start — the same pattern
`_scheduleBoardDetailAutoOpen` already uses to wait for the grid DOM. Funnel all
entry points (init, observer, didInsertElement) into one guarded consumer
(`_bdTourConsuming` prevents stacking parallel polls). Leave the flag set on
timeout so a later legitimate instance can still consume it, and guard every
deferred tick with `isDestroyed`/`isDestroying` so an instance torn down mid-poll
(the page-A instance during the route transition) bails instead of consuming the
flag for the wrong context.

**General rule:** never gate a one-shot afterRender action on route/mode state
that is established by a PROMISE resolution (purchase checks, async model loads).
Either await that promise explicitly, or poll the condition. `current_mode='edit'`
landing on a microtask is the specific gotcha here.

**First seen in:** [2026-06-15-board-detail-edit-tour-not-auto-opening.md](./2026-06-15-board-detail-edit-tour-not-auto-opening.md)

---

## Pattern: `i18n_generator.rb --merge` does NOT refresh CHANGED English into existing locale placeholders — only adds MISSING keys

**Surface:** rewording an EXISTING user-facing string (changing the default in an
`i18n.t('key', "new text")` call) that already has entries in the non-English
`public/locales/*.json`.

**Symptom:** after `ruby i18n_generator.rb --generate` (updates en.json from code)
+ `--merge`, en.json shows the NEW text but every other locale still shows the OLD
text. New keys propagate fine; changed keys silently don't.

**Root cause:** `--merge` builds each locale with
`new_json[key] = json[key] || "*** #{english_string}"` (i18n_generator.rb ~L319/331)
— it KEEPS the existing locale value and only falls back to `*** <english>` for
keys MISSING from that locale. A changed key already exists, so its old value
(often an untranslated `*** <old english>` placeholder) is preserved as-is.

**Fix:** after `--generate`/`--merge`, refresh the changed keys in the non-English
locales yourself. If they were untranslated placeholders (value starts with
`*** `), replace the old-English placeholder with the new-English placeholder
across all locales (a scoped `sed` over `public/locales/*.json`, skipping en.json)
so they stay "awaiting translation" but current — matching how `--merge` writes
brand-new keys. Verify none were actually translated first (grep the key across
locales; a leading `*** ` means untranslated). Real translation is the separate
rails-console step (`WordData.translate_locale_batch`). Always re-validate each
file parses as JSON after a `sed` sweep (`ruby -e "require 'json'; JSON.parse(...)"`).
Escape `&` as `\&` in the sed replacement.

**First seen in:** [2026-06-15-board-detail-tour-tools-reword.md](./2026-06-15-board-detail-tour-tools-reword.md)

---

## Pattern: a Shepherd popover anchored to an element that gets removed mid-transition is flung to the top-left (0,0) by floating-ui — snap it out instantly

**Surface:** a guided-tour step (ember-shepherd) attached to an element that
DISAPPEARS as the tour advances — classically a dropdown/menu item, where
advancing to the next step closes the dropdown (e.g. the home tour's account-menu
walkthrough → setIdentityDropdownOpen(false) on the next step's show hook).

**Symptom:** when leaving that step, the OUTGOING popover (which is still
mid-cross-fade, kept rendered by the app.scss `[hidden]` rule) briefly flashes at
the top-left corner of the page before the next step settles. The flashing card
shows the outgoing step's own text (e.g. "Sign Out").

**Root cause:** the cross-fade keeps the outgoing popover in the DOM and visible
(opacity transitioning over ~0.45s). floating-ui is still positioning it against
its anchor. When the dropdown closes, the anchor element becomes display:none
(zero box), so floating-ui recomputes and places the popover at the fallback 0,0
— top-left — for the remainder of the fade.

**Fix:** for steps anchored to a disappearing element, snap the outgoing popover
out INSTANTLY (`transition:none; opacity:0`) on its `hide` event instead of
cross-fading it, so there is nothing visible left for floating-ui to reposition.
Detect those steps by id (e.g. ids starting with `home_tour_iddrop_`); every other
step keeps the gentle cross-fade. Cheaper and more robust than trying to delay the
dropdown close past the fade or freeze the popover's transform.

**First seen in:** [2026-06-15-tour-signout-flash-top-left.md](./2026-06-15-tour-signout-flash-top-left.md)

---

## Dropdown clipped by a PAGE-level `overflow: hidden` ancestor — z-index can't fix it

**Surface:** an absolutely-positioned in-panel dropdown (e.g. the create-board-new
Edit Tools rail's `.md-settings-dropdown-menu` for skin tones / fonts) that opens
but gets cut off, no matter how high its z-index is raised.

**Root cause:** the menu is clipped by an ANCESTOR with `overflow: hidden` (or
`overflow-y: auto`), not by sibling stacking. On the create-board-new PAGE the
clippers were page-level wrappers — `.beta-program-access`,
`.with_user…content--no-top-padding`, and `body`. z-index only resolves
sibling/stacking order; it NEVER lets content escape an `overflow:hidden` clip box.

**Diagnose, don't guess:** with the dropdown open, run a console ancestor-walk from
the menu node up to `<html>`, logging each ancestor's computed
`overflow`/`overflowX`/`overflowY`, `transform`, `clipPath`, `contain`, and bounding
rect; flag any whose box ends before the menu's edge AND has overflow≠visible. The
flagged node is the actual clipper.

**Two fixes, by requirement:**
- *In-panel is OK* → **flow-position** (`position: static; width: 100%` on the menu
  + `display: block` on the wrap). Simplest; the menu grows the section down the
  panel and the page scrolls. BUT it's bounded by the panel width — in a narrow
  rail the labels truncate.
- *Menu must SPILL OUTSIDE the container* (narrow rail, full labels in view) →
  **anchored `position: fixed`** (the floating-ui/Popper pattern) is the intended
  approach, BUT a hand-rolled in-place version for the create-board-new rail did
  NOT land (inline coords never reliably applied; menu rendered off-screen). It was
  reverted and the **Skin Tones section hidden** as a stopgap — STATUS: UNRESOLVED.
  If revisited, do NOT hand-roll fixed positioning in place: PORTAL the menu to
  `<body>` with Ember's built-in `{{in-element}}` (what ember-basic-dropdown/Popper
  do) so there is no clipping ancestor at all, then position from the trigger.

**Gotcha:** switching the menu to `position: static` dropped it BELOW the fixed
close-backdrop (z-index 100), so the backdrop swallowed option clicks (selection
"stopped working"). A positioned menu (`relative`/`fixed`) with z-index > backdrop
keeps clicks working.

**First seen in:** create-board-new Edit Tools rail dropdowns (traci/styling).
See `docs/styling-recurring-problems.md` #1 for both fixes.
## Pattern: a register-adding script must mirror citation-check's matcher EXACTLY, or it reddens CI

**Root cause family:** any script that ADDS findings to `FINDINGS.json` (`audit-merge.rb`,
`promote-finding.rb`) gates evidence with its own `snippet_present?`. If that gate is looser than
`citation-check.rb`'s acceptance test, it accepts evidence that citation-check later rejects,
turning the register red after the fact.

**Concrete trap:** `citation-check.rb` matches a snippet **per source line**
(`contents.each_line ... normalize(line).include?(needle)`). A `snippet_present?` that normalizes
the WHOLE file and does one `include?` will accept a multi-line snippet that no single line
contains; citation-check then FAILs it. Fix: gate per-line too
(`content.each_line.any? { |l| norm(l).include?(needle) }`). Verified by reproducing the FAIL.

**Corollary - never re-anchor an existing finding's evidence to an ephemeral sha.** Promoting a
re-found OPEN finding must NOT move its `evidence.sha` to the PR-branch head sha: that sha can be
orphaned (rebase/force-push/branch delete) before citation-check runs in CI, reddening a finding
that was green. Keep the finding's existing durable (merged/audited) sha; only refresh `lastSeen`
+ append a provenance note.

**Evidence:** `docs/task-management/2026-06-14-operationalize-review-findings.md`;
`scripts/promote-finding.rb` `snippet_present?` and the reseen branch.

## Pattern: secret pre-scrub should redact-and-proceed for PII but SKIP the call on a real secret

**Context:** the n8n PR bot ships the diff to DeepSeek (OpenRouter, no BAA). Mirroring
`lib/pii_scrubber.rb` (whose `redact_for_ai` is redact-and-proceed): PII shapes get redacted and
the review still runs on the scrubbed diff, but a HIGH-CONFIDENCE secret shape (distinctive
prefixes: AWS `AKIA`, `ghp_`, `xox*-`, `sk-`, `AIza`, `sk_live`, JWT `eyJ.eyJ.`, `scheme://u:p@`)
trips a skip gate so a credentialed diff is never sent to a no-BAA endpoint even redacted.

**Why not a generic `password=`/`token=` pattern for the SKIP:** it false-trips normal code
(`token = SecureRandom.hex` matches), which would silently disable the adversary review on many
PRs. Keep the generic shape for REDACTION (register-side refusal is cheap) but use only
distinctive-prefix shapes to gate the skip. Test `.replace`-based scrubbers with `.replace`, not
`.test`, on `/g` regexes - `.test` carries `lastIndex` across calls and gives false misses.

**Evidence:** n8n workflow `lbyA52atQjQ8MCqy` nodes `PII Pre-Scrub (DeepSeek)` / `DeepSeek PII
Gate`; `scripts/promote-finding.rb` `SECRET_PATTERNS`.

## Pattern: editing a LIVE n8n workflow - share nodes via fan-out, don't rename, verify at runtime

**Context:** extended the PR-bot scrub from one model path to both, and consolidated the
two-model output (workflow `lbyA52atQjQ8MCqy`).

- **Don't rename a node in a live workflow to "clean up" a now-inaccurate name.** n8n connections
  and `$('Node Name')` references key on the node NAME; renaming silently breaks every connection
  and cross-node reference unless every reference is updated in the same atomic op. Keeping a
  slightly-stale name (`PII Pre-Scrub (DeepSeek)` now scrubs both paths) + a corrected `notes`
  field is the lower-risk choice. Document the broadened responsibility in notes + the sticky.
- **Reuse one node via fan-out instead of duplicating logic.** One shared scrub node feeding two
  IF gates (Claude + DeepSeek), both branching on the same `pii_scrub.secrets_found`, beats two
  copies of the pattern list (DRY; one place to keep in sync with `lib/pii_scrubber.rb`). A synthetic
  "Skipped" Code node per gate feeds the SAME Merge input index the real call would, so the
  downstream reviewer-name lookup is unaffected.
- **`n8n_validate_workflow` is a heuristic, not a compiler.** It emits false positives on Code
  nodes: `"Array items must be objects with json property"` fires on a node whose helper functions
  `return` non-arrays even when the node's actual `return [{ json: ... }]` is correct; `"Invalid $
  usage"` and `"File system access"` fire on normal `.replace`/`$()` usage. ALWAYS confirm a Code
  node's real behavior by running its logic standalone in node with stubbed `$input`/`$()` - the
  runtime output is the source of truth, the validator is advisory.
- **Consolidating two reviewers' findings:** dedupe by Jaccard token-overlap on finding TITLES
  (>=0.6), merge to the higher severity + longer detail + union of reviewers, then derive ONE
  verdict by mapping each model's verdict to a common severity scale and taking the max. Keep the
  per-model verdicts in a small table so attribution is not lost.

**Evidence:** `docs/task-management/2026-06-14-operationalize-review-findings.md` follow-on section;
workflow `lbyA52atQjQ8MCqy` nodes `PII Pre-Scrub (DeepSeek)`, `Claude PII Gate`, `Format Output`.

## Pattern: register governance has TWO Scot-owned axes (status AND disposition) - guard both

When schema 1.1 added a `disposition` block (`untriaged`/`accepted`/`fixed`/`dismissed-false-positive`/
`wontfix`) orthogonal to `status`, every place that protected a Scot decision by checking `status`
alone silently regressed: a finding can be `status: open` yet `disposition: dismissed-false-positive`,
and a re-find guarded only on `SCOT_OWNED_CLOSED` statuses sailed through as a routine `reseen`,
quietly re-validating something Scot dismissed. **Rule:** any "is this Scot's decision?" check on a
finding must test BOTH `status` (in `SCOT_OWNED_CLOSED`) and `disposition.state` (in
`SCOT_OWNED_DISPOSITIONS` = every value except `untriaged`). Fixed in both `scripts/promote-finding.rb`
and `scripts/audit-merge.rb` (the hand-synced sibling - when you fix governance in one, grep the other
for the same guard). Reproduce a governance gap before fixing: build a register finding in the missed
state, run the script against a COPY, assert the summary bucket (regressions vs reseen). Evidence:
2026-06-15 review round 2 in `docs/task-management/2026-06-14-operationalize-review-findings.md`.

## Pattern: refuse/scrub on a DEEP walk of the whole record, never a named-field allowlist

`sensitive_hits` scanned a hand-picked list of fields (`title`, `snippet`, `remediation.options`...),
so PII in a `remediation` subkey - or any reviewer-added key - bypassed refusal and a student email
reached the git-tracked register. A code/path-evidence-only or no-PII guarantee that scans a SUBSET of
a structure is a guarantee in name only: the whole object gets persisted/sent, so the whole object must
be scanned. Replaced with a recursive `deep_strings(node)` that collects every key AND value, then
matches the PII/secret patterns against the join. Same principle for the n8n pre-scrub (scrub the
message content, not a curated slice). Evidence: H2, `scripts/promote-finding.rb#deep_strings`.

## Pattern: redact-and-proceed vs skip on the no-BAA AI path - decide by confidence, not category

The PR-bot scrub (`lbyA52atQjQ8MCqy`) and `promote-finding.rb` are a hand-synced secret/PII pair, but
their CONSEQUENCE differs and should: distinctive live-credential shapes (AWS `AKIA`, GitHub `ghp_`,
`Bearer <20+>`, Google `ya29.`) SKIP the model call entirely (a credentialed diff is never sent to a
no-BAA endpoint even redacted); ambiguous shapes (a `password = "..."` assignment that is usually a
test fixture) REDACT-and-proceed so the review still runs. The trap to avoid: a broad pattern that
SKIPS on `token = SecureRandom.hex` disables review on a large fraction of normal PRs. Mitigations that
worked: require a QUOTED value for generic credential assignments (`["'][^"'\s]{8,}["']`), and require
20+ token chars after `Bearer`. Always test a new scrub regex for BOTH catch and no-false-trip on
ordinary code before shipping. Evidence: H4, node `PII Pre-Scrub (DeepSeek)` SECRETS/PII arrays.

## Gotcha: EN 301 549 clause numbers (9.x.x.x) trip the register's IP-address PII scrubber

When the `accessibility-auditor` finder emits a WCAG finding, any four-part dotted number in the
finding text - notably an EN 301 549 clause like `9.1.4.3` - matches `audit-merge.rb`'s IP regex
(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`) and the ENTIRE finding is REFUSED as `pii:ip` (it
silently never lands in the register; merge reports `skipped`, citation-check stays green only
because the finding is absent). WCAG success-criterion numbers (`1.4.3`, `2.4.7`) are at most 3
dotted groups and are always safe; the EN 301 549 web mapping (`9.1.x.x`) is the one that bites.
Fix (no Ruby change, scrubber is correct defense-in-depth): the `accessibility-audit` skill + agent
instruct finders to cite the WCAG SC number in emitted fields and reference EN 301 549 only at the
3-part parent clause (`9.1.4`) or in prose. Verified 2026-06-15 via a /tmp dry-run: with `9.1.4.3`
in `notes` -> merge `skipped=1 (refused: pii:ip)`; with `9.1.4` -> merge `new=1`, citation-check
PASS. Evidence: `scripts/audit-merge.rb` PII_PATTERNS[:ip]; `.claude/skills/accessibility-audit/SKILL.md`.

## Gotcha: `Worker.scheduled?` specs flake repo-wide off BoyBand's stale 30s `sizeof/<queue>` cache

`Worker.scheduled?` -> `BoyBand::WorkerMethods#scheduled_for?` short-circuits with
`return false if idx > 500`, where `idx = queue_size(queue)` reads a Redis cache
`sizeof/<queue>` with a **30-second TTL** that only recomputes when the cached value is `0`.
`Worker.flush_queues` (run in `spec_helper.rb` `before(:each)`) empties the queue LISTS but
never clears that cache. So one earlier example that pushes `sizeof/default` past 500 makes
EVERY `Worker.scheduled?` return a FALSE NEGATIVE (`expected true, got false`) for the next 30
WALL-CLOCK seconds - regardless of the flushed queue. Whether a given spec lands in that window
varies run-to-run, so it presents as a random "timing" flake that passes on re-run. It is
repo-wide: 38 spec files / 201 `scheduled?` assertion sites are exposed; `external_tracker_spec:16`
and `flusher_spec:403` are just the most frequently bitten. Two traps: (1) "force Resque inline"
is the WRONG fix - these specs assert the job IS queued, and inline runs it and empties the queue,
failing them deterministically; (2) `config.order = "defined"` + single-process CI + fresh Redis
rules out order-dependence and cross-process races, so the only nondeterminism is wall-clock vs the
TTL. Fix (verified): in `before(:each)` after `flush_queues`, also
`Resque.redis.keys('sizeof/*').each{|k| Resque.redis.del(k)}` and the same for `*_queue_size`
(`RedisInit#queue_size`'s separate 5-min cache). Deterministic repro:
`redis-cli set lingolinq-test:sizeof/default 600` then run the two specs -> exact CI failure;
clearing the cache makes them pass. Evidence: `boy_band-0.1.16/lib/boy_band.rb:43,266`;
`spec/spec_helper.rb` before(:each); CI run 27601259798.

## Gotcha: local `lingolinq-test` `bad decrypt` at boot from a stale `encryption_hash` sentinel row

Running rspec locally can fail at environment load with
`OpenSSL::Cipher::CipherError: bad decrypt` in `Setting.get` (config/environment.rb -> spec_helper).
Cause: the test DB holds a single `settings` row `key='encryption_hash'` (GoSecure's
key-validation sentinel) encrypted with a SECURE key pair that no longer matches the effective env.
`spec_helper` loads `.env.op.template` BEFORE `.env`, and dotenv does not override already-set vars,
so `.env.op.template`'s `SECURE_NONCE_KEY` shadows `.env`'s and breaks the encryption pair. CI never
hits this because it uses `db:create db:schema:load` (fresh DB, no `encryption_hash` row -> no
decrypt). Local fix (test DB only, regenerates on boot):
`psql -U scotw -d lingolinq-test -c "delete from settings where key='encryption_hash'"`. Do not
"fix" it by editing the dotenv load order in spec_helper.

## Pattern: every external-model call site must gate the same way (COPPA + org opt-out + PiiScrubber + AiApiLog)

The canonical AI egress shape is fixed across call sites (`lib/ai_word_predictor.rb`,
`lib/ai_board_generator.rb`): (1) `FeatureFlags.ai_feature_enabled_for?(feature, user)` for the
feature flag + org `disable_ai_features` opt-out, (2) `FeatureFlags.coppa_blocks_ai_for?(user)`
short-circuit (default-ON via `COPPA_AI_HARD_GATE`) BEFORE any provider call, (3)
`PiiScrubber.redact_for_ai` on the payload with the user's names + any free-text person name added
via `PiiScrubber.configure_blocklist`, and (4) an `AiApiLog.log_ai_call(provider: 'claude', ...)`
row in an `ensure` so success AND failure are audited. `lib/eval_narrator.rb` was the lone exception
(finding LL-2e4c14d370 et al.); when adding a NEW AI call site, copy this shape exactly rather than
inventing a new flag. Gate on whoever's data leaves (the evaluated student), not necessarily the
requesting user. When no data subject can be resolved, refuse the external call and fall back to a
local/deterministic path rather than sending ungated.

## Gotcha: `ai_feature_enabled_for?` silently returns false unless the flag is in `FeatureFlags::AI_FEATURES`

`FeatureFlags.ai_feature_enabled_for?(feature, user)` first does `return false unless
AI_FEATURES.include?(feature)` (`feature_flags.rb:139`). A flag can be live in
`AVAILABLE_FRONTEND_FEATURES`/`ENABLED_FRONTEND_FEATURES` yet still be denied by the AI gate because
it was never added to the `AI_FEATURES` allowlist (`:77`). Adding a feature to the AI gate means
registering it in `AI_FEATURES`. `system_feature_registry.rb:80` also derives its `ai_feature:`
flag from this list, so registering there correctly tags it in the admin registry.

## Gotcha: `EvalNarrator` shipped against the OLD `ruby-anthropic` API; the gem is official `anthropic ~> 1.23`

`lib/eval_narrator.rb#draft_via_anthropic` originally used `Anthropic::Client.new(access_token:)` +
`client.messages(parameters: {...})` + a Hash response (the alexrudall `ruby-anthropic` gem). The
Gemfile pins official `anthropic ~> 1.23`, whose API is `Anthropic::Client.new(api_key:)` +
`client.messages.create(...)`, with `response.content` an array of blocks (`#type`/`#text`) and
`response.usage.input_tokens/output_tokens`. The old call raised and soft-fell-back to the template,
so the AI path was dead. Match the sibling AI libs' usage; isolate the SDK call behind a
`call_anthropic` method so specs can stub the network boundary.

## Gotcha: eval `narrate` gates on `user_id` but ships the unbound `eval_session` payload (identity/payload decoupling)

Adversary verification of the #411 COPPA fix found the gate and PII blocklist were bypassable:
`Api::EvalSessionsController#narrate` resolves the student from `params['user_id']` and runs the
COPPA consent, org AI opt-out, and supervise checks against THAT user, but the data actually sent
to Anthropic is the independent free-text `params['eval_session']` payload. Nothing bound the two,
so a clinician supervising a consented student A could pass `user_id=A` (gate passes) while the
payload carried a different, non-consented child B's eval data. Lesson: when a compliance gate keys
on a caller-asserted identity, the egressed data must be DERIVED from that identity, not accepted
independently from the same request. Hardening applied (`scot/security/eval-narrator-payload-binding`):
(1) external narration is now OPT-IN (`payload['use_anthropic'] == true`; the controller coerces the
client flag to a strict boolean and the frontend sends it only on the SLP's explicit "Generate"
click) so nothing egresses by default; (2) `payload_for_prompt` drops the client-asserted
`sett.student` name entirely (subject identity comes only from the resolved user record, whose name
is blocklisted), so a mismatched request cannot leak the payload subject's name via the structured
field. RESIDUAL (still open, needs a larger follow-up): the consent decision is still keyed to the
caller-asserted `user_id`; fully binding eval-data provenance to the gated user requires persisting
the eval server-side against that user rather than trusting a client payload. Arbitrary third-party
names typed into `slp_notes` free text remain a surface-wide NER limitation, not eval-specific.

## Gotcha: in an EnterWorktree session, Edit/Write to absolute PRIMARY paths hits the primary checkout, not the worktree

When the session is inside an `EnterWorktree` worktree (`.claude/worktrees/...`), `Edit` and `Write`
calls that pass an absolute path into the primary checkout
(`/mnt/c/.../LingoLinq-AAC/docs/...`) write to the primary checkout, NOT the worktree, even though
cwd is the worktree. Relative-path tools (Bash scripts run after `cd`, render scripts) correctly hit
the worktree, so you end up with a split: some changes in the worktree, some in primary. Symptom:
`git status` in the worktree shows only the relative-path changes; a `grep` of the worktree file
shows the edit "missing." Recovery without disturbing other tabs sharing the primary checkout:
`cp primary/file worktree/file` for each edited file, then `git -C primary checkout HEAD -- <tracked
files>` and `rm` any stray new files from primary (a path-level restore, not a branch switch, so
co-tenant tabs are safe). Prevention: once in a worktree, address files by their worktree path
(`.claude/worktrees/<name>/...`) for Edit/Write, or Read the worktree path first so the harness
tracks that copy. Confirmed 2026-06-18 during the compliance-docs refresh.

## Pattern: the compliance register is the source of truth; the legal docs and Notion page are renders or hand-anchored drafts

`audit-reports/FINDINGS.json` is the single source of truth for finding status/counts. `FINDINGS.md`,
`audit-reports/compliance-calendar.md`, and `audit-reports/notion/compliance-audit-page.md` are
deterministic renders; never hand-edit them. Regenerate via `ruby scripts/citation-check.rb
<json> --render`, `ruby scripts/compliance-calendar-render.rb <json>`, and `ruby
scripts/compliance-notion-publish.rb <json>` (the last stamps a fresh `Time.now` so its `--check`
ignores the timestamp). The `docs/legal/*` artifacts (Posture Report, AI Governance Memo,
Subprocessors, dated status snapshots) are hand-authored DRAFTS that must (a) read headline counts
from the register, not from prose, (b) stay DRAFT/unattested until Scot signs, and (c) never close,
triage, or attest a finding, which is Scot-only. When refreshing them, recompute per-framework
open/high counts straight from the JSON (a `ruby -rjson` tally) rather than carrying old numbers
forward; the 2026-06-13 posture report had stale 0/13 + FERPA 8/4 figures that did not match the
register's 0/16 + FERPA 10/5. Run all three `--check` renders + `citation-check` green before
committing. Confirmed 2026-06-18.

## Pattern: Playwright e2e against staging when local stack is cold

Root Playwright lives at repo root (`playwright.config.ts`, `tests/`). Default
`baseURL` is `https://lingolinq-staging.onrender.com`; override with
`PLAYWRIGHT_BASE_URL` (e.g. `http://localhost:8184`). Prefer Chromium-only for
day-to-day smoke; keep assertions on role/name (Ember SPA hydrates after shell
HTML). In this Cursor/WSL environment set
`PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright` if launch fails looking
under `/tmp/cursor-sandbox-cache/...`. Local Rails/Ember still need `bundle
install` + frontend `npm install` before `PLAYWRIGHT_BASE_URL=http://localhost:8184`
works. Confirmed 2026-07-26.

## Pattern: Playwright login form IDs + device-trust follow-up

Login is Ember at `/login` (`#login_form`). Stable fields: `#identification`
(username, not email), `#password`, submit via role `/sign in/i` scoped to the
form. The submit button stays disabled until the client browser token is ready
— wait for enabled before click. After auth, most fresh browser contexts show
"Trust this Device" (`login_followup`); race that button vs `/:user/home` then
assert `#identity_button`. Always-seeded local users: `lingolinq`/`password`,
`lingolinq_admin`/`admin2025!`. Board smoke: public `/lingolinq/yesno` with
`a.button[data-id]` + `.button-label` (or `#board_canvas` if canvas_render).
Shared helper: `tests/helpers/auth.ts`. Confirmed 2026-08-07.

## Gotcha: highlight-outlet must not mount opening-observer with a null model

`HighlightOutlet` in `application.hbs` looked up `controller:highlight` and always
wrapped it in `opening-observer`. On insert, that called `highlight.opening()`, which
does nested sets like `this.set('model.shift_color', false)`. With no active highlight,
`model` was null → Ember threw "Property set failed: object in path \"model\"…" as an
**unrecoverable render error**, freezing the Ember runloop. Symptoms: the main
outlet stuck on `index-loading` ("Preparing your workspace"), **or** `/login`
stuck on disabled Sign In ("Initializing...") because `login-form`'s 2s
`runLater` never fires to pick up `BROWSER_TOKEN`. APIs (`domain_settings`,
`token_check`) can still return 200. Fix: only mount when `settings` is present
(`{{#if this.settings}}`), and null-guard `opening` / `closing` /
`compute_styles` / `shift_color` in `controllers/highlight.js` (staging PR
#466). Confirmed 2026-08-07; login-button symptom confirmed 2026-08-13 on a
branch that lacked #466.

## Gotcha: online invalid_token must not fall back to cached user/self

`persistence.DSExtend.findRecord` treated `invalid_token` / "Token needs refresh" as
a cue to return IndexedDB-cached `user/self` while online. Combined with
`force_logout` opening a modal **without** `invalidate` when `modal.route` was set,
boot stayed `isAuthenticated` with a dead token: board APIs 400'd forever behind the
workspace skeleton. Online + invalid token for `user`/`self` must reject so session
recovery runs; offline local fallback remains. Also treat "Token needs refresh" /
"Expired token" as logout-worthy in `app-state` `find_user`, and always
`invalidate(true)` from `force_logout`. Confirmed 2026-08-07.

## Pattern: Playwright settings e2e — three settings surfaces + restore after mutate

User-configurable settings are not one page: (1) `/:user/preferences` form with
collapsed `.md-pref-box` sections and custom `bound-select` buttons (not native
`<select>`), saved via `user.save()` then redirect away from preferences;
(2) home **Display Style** (Shepherd `.md-ds-modal` Gentle/Focused — Color Tone /
`ll-bento-dark-toggle` is speak-mode-only or hidden on home); (3) board-detail
**edit** Light/Dark (`/:user/board-detail/:board/edit` → `.md-board-detail--dark`).
Helpers in `tests/helpers/preferences.ts`; suite serial + restores values.
`bound-select` treats `id: ''` as unset (`- Select -` after reload) — skip those
options for persistence asserts. Confirmed 2026-08-07 (33/33 pass locally).

## Gotcha: blank board-detail has no symbol grid — empty-state is a valid ready signal

`user/board-detail` only mounts `board-detail-grid` (`role="grid"` /
`aria-label="Symbol board"`) when there is at least one visible button.
A brand-new blank board hits `nothing_visible_not_edit` and renders
`.md-board-detail-empty-board` instead (“This board hasn't been set up yet…”
plus **Edit this Board**). Waiting only for the grid times out even though
the board was created and the URL is already `/:user/board-detail/:slug`.
The header title *does* contain the new name, but speak mode sets
`board_collapsed` (`display: none` on `.md-board-detail-header`) so
`toBeVisible()` on that text also hangs. Playwright ready-wait: grid **or**
that empty-state block (scoped so the confirm-edit-board modal's same button
label does not match). Assert the empty-state as the visible end state; read
the title with `textContent` / `toBeAttached`, not `toBeVisible`. See
`tests/helpers/click-efficiency.ts` `boardDetailReady` /
`expectBlankBoardCreated`. Confirmed 2026-08-17.

## Gotcha: Button Settings `#label` is hidden on the Help tab

Empty-cell click does open the Button Settings modal. `#label` is always
in the DOM (General tab, `class="hidden"` until `generalState`). Users
without `preferences.disable_button_help` get `state = 'help'` in
`button-settings.js` `opening()`, so Playwright `locator('#label')` resolves
but `toBeVisible()` hangs. Wait for the dialog, then if `#label` is not
visible click the **General** tab (role=tab) before fill. Do not click
“Skip this help in the future” in e2e against the shared seed user — that
persists `disable_button_help`. Helper: `fillButtonSettingsLabel` in
`tests/helpers/click-efficiency.ts`. Confirmed 2026-08-17.

## Gotcha: board-detail empty-cell save ignores placeholder ids like `fake_0_0`

Blank board-detail edit cells are placeholders (`fake_0_0`, etc.), not rows
in `board.buttons`. `editManager.change_button` only patches existing
`board.buttons` entries and never inserts for a placeholder id.
`process_for_saving` only assigns a numeric id when `id < 0` or `!id`; the
string `'fake_0_0'` is neither, so Done Editing → Save returns to the
“hasn't been set up yet” empty state with no label. Same for a human
following the UI. Click-efficiency add-symbol tests are `test.skip` until
fixed; user how-to marks the task blocked. See
`docs/how-to/click-efficiency-findings.md`. Confirmed 2026-08-17.
