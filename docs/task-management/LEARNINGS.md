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

- [Gotcha: `after_all_transactions_commit` is not a durable outbox — pair it with a same-transaction RemoteAction](#gotcha-after_all_transactions_commit-is-not-a-durable-outbox--pair-it-with-a-same-transaction-remoteaction)
- [Gotcha: authorizing the supervisee-list owner does not authorize the children inside it](#gotcha-authorizing-the-supervisee-list-owner-does-not-authorize-the-children-inside-it)
- [Gotcha: `sessionUser.id` is the `'self'` sentinel — compare `global_id` on authorship gates](#gotcha-sessionuserid-is-the-self-sentinel--compare-global_id-on-authorship-gates)
- [Gotcha: Ruby indent is not control flow — a 4-space line can still be inside the `if`](#gotcha-ruby-indent-is-not-control-flow--a-4-space-line-can-still-be-inside-the-if)
- [Gotcha: contentHash drift — ATTESTED means stop; unattested means regenerate-register](#gotcha-contenthash-drift--attested-means-stop-unattested-means-regenerate-register)
- [Gotcha: staging → audit-register merge is a union, then regenerate](#gotcha-staging--audit-register-merge-is-a-union-then-regenerate)
- [Gotcha: a dated successor must not inherit the predecessor's attestation dates](#gotcha-a-dated-successor-must-not-inherit-the-predecessors-attestation-dates)
- [Gotcha: `redact_for_ai` on the sentence does not automatically cover interpolated `context.topic`](#gotcha-redact_for_ai-on-the-sentence-does-not-automatically-cover-interpolated-contexttopic)
- [Gotcha: Rails reserves `params['action']` — consent APIs must use `decision` or member approve/deny routes](#gotcha-rails-reserves-paramsaction--consent-apis-must-use-decision-or-member-approvedeny-routes)
- [Gotcha: `pending_supervisor_requests` was never serialized — fetch the relationships index instead](#gotcha-pending_supervisor_requests-was-never-serialized--fetch-the-relationships-index-instead)
- [Gotcha: button-settings Speak must sync vocalization via change_button — set-field alone does not persist](#gotcha-button-settings-speak-must-sync-vocalization-via-change_button--set-field-alone-does-not-persist)
- [Gotcha: Capacitor offline AAC needs SQLite + Filesystem shims — IndexedDB-only is not speak-ready](#gotcha-capacitor-offline-aac-needs-sqlite--filesystem-shims--indexeddb-only-is-not-speak-ready)
- [Gotcha: `capabilities.storage.status()` resolve shape is a contract — do not add diagnostic keys](#gotcha-capabilitiesstoragestatus-resolve-shape-is-a-contract--do-not-add-diagnostic-keys)
- [Speak vs edit: Default symbols still showed OpenSymbols in speak mode](#speak-vs-edit-default-symbols-still-showed-opensymbols-in-speak-mode)
- [Gotcha: Cloud Run secret assertions must check every nonzero-percent traffic target](#gotcha-cloud-run-secret-assertions-must-check-every-nonzero-percent-traffic-target)
- [Gotcha: `rem` is a trap in this codebase — the root font-size is 10px, so write px](#gotcha-rem-is-a-trap-in-this-codebase--the-root-font-size-is-10px-so-write-px)
- [Pattern: derive report narrative in a pure util, never in the template or from absent data](#pattern-derive-report-narrative-in-a-pure-util-never-in-the-template-or-from-absent-data)
- [Gotcha: Ember Data model ids in tests must be strings — numeric `set('id', N)` fails throwOnUnhandled](#gotcha-ember-data-model-ids-in-tests-must-be-strings--numeric-setid-n-fails-throwonunhandled)
- [Gotcha: batch-path nil is not “missing opts” — key presence vs value](#gotcha-batch-path-nil-is-not-missing-opts--key-presence-vs-value)
- [Gotcha: compliance segment stamps must use validated org ids, not raw params](#gotcha-compliance-segment-stamps-must-use-validated-org-ids-not-raw-params)
- [Gotcha: board translation Google egress is users#translate / WordData, not Board#translate_set](#gotcha-board-translation-google-egress-is-userstranslate--worddata-not-boardtranslate_set)
- [Pattern: before adding a guard, grep the canonical path for one that already exists — with the exact flag name, in that file alone](#pattern-before-adding-a-guard-grep-the-canonical-path-for-one-that-already-exists--with-the-exact-flag-name-in-that-file-alone)
- [Pattern: deleting dead CSS is a text-surgery problem — `:not()` and multi-line selector lists are the two ways to silently break live styling](#pattern-deleting-dead-css-is-a-text-surgery-problem---not-and-multi-line-selector-lists-are-the-two-ways-to-silently-break-live-styling)
- [Pattern: a "protected" flag on a media record is an ENTITLEMENT boundary — never relax its predicate to fix a rendering bug](#pattern-a-protected-flag-on-a-media-record-is-an-entitlement-boundary--never-relax-its-predicate-to-fix-a-rendering-bug)
- [Gotcha: Textarea `@value` on a get-only computed crashes on keystroke — needs a setter/cache](#gotcha-textarea-value-on-a-get-only-computed-crashes-on-keystroke--needs-a-settercache)
- [Gotcha: Ember `<Input>` checkboxes need `@type`, and bound-select must stopPropagation](#gotcha-ember-input-checkboxes-need-type-and-bound-select-must-stoppropagation)
- [Gotcha: Ember strict-mode templates treat bare names as helpers — use `this.` for controller props](#gotcha-ember-strict-mode-templates-treat-bare-names-as-helpers--use-this-for-controller-props)
- [Gotcha: AI feature flags are rollout; prefs turn AI on — Ember UI must AND both](#gotcha-ai-feature-flags-are-rollout-prefs-turn-ai-on--ember-ui-must-and-both)
- [Gotcha: Generate-with-AI UI opt-in is explicit; server grandfather is not](#gotcha-generate-with-ai-ui-opt-in-is-explicit-server-grandfather-is-not)
- [Gotcha: serialize rapid model saves — overlapping user.save() lose updates / trip "in flight"](#gotcha-serialize-rapid-model-saves--overlapping-usersave-lose-updates--trip-in-flight)
- [Pattern: dedup an "already-owned copy" by parent lineage, never by slug convention](#pattern-dedup-an-already-owned-copy-by-parent-lineage-never-by-slug-convention)
- [Pattern: phased board prefetch — shared planner, dual persistence files](#pattern-phased-board-prefetch--shared-planner-dual-persistence-files)
- [Pattern: board-detail `/tree` blocks paint on the full descendant payload](#pattern-board-detail-tree-blocks-paint-on-the-full-descendant-payload)
- [Pattern: board-preview latency is cold-cache, not the loading gate — warm on intent](#pattern-board-preview-latency-is-cold-cache-not-the-loading-gate--warm-on-intent)
- [Pattern: boards-page Mine list — cache-first paint, atomic background refresh](#pattern-boards-page-mine-list--cache-first-paint-atomic-background-refresh)
- [Gotcha: board-picker category tabs share one `category_boards` list — stale loads must not paint](#gotcha-board-picker-category-tabs-share-one-category_boards-list--stale-loads-must-not-paint)
- [Gotcha: Android “classic board” error may be stale packaged board-detail](#gotcha-android-classic-board-error-may-be-stale-packaged-board-detail)
- [Gotcha: every route transition closes all modals (global_transition) — don't keep a modal "open behind" a routed page](#gotcha-every-route-transition-closes-all-modals-global_transition--dont-keep-a-modal-open-behind-a-routed-page)
- [Gotcha: sync double `modal.open` — the *second* template wins; do not invent write-loss on the winner](#gotcha-sync-double-modalopen--the-second-template-wins-do-not-invent-write-loss-on-the-winner)
- [Gotcha: Shepherd modal overlay is VISUAL-ONLY; canClickTarget:false makes the target click "fall through"](#gotcha-shepherd-modal-overlay-is-visual-only-canclicktargetfalse-makes-the-target-click-fall-through)
- [Gotcha: tagless GuidedTour — one init, host-gated pending consumers, body is not a scroll target](#gotcha-tagless-guidedtour--one-init-host-gated-pending-consumers-body-is-not-a-scroll-target)
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
- [Gotcha: `__text-symbol` is a third label surface — include it in contrast modes and shrink-to-fit](#gotcha-__text-symbol-is-a-third-label-surface--include-it-in-contrast-modes-and-shrink-to-fit)
- [Pattern: `organizations.admin` is a singleton boolean, not a normal flag](#pattern-organizationsadmin-is-a-singleton-boolean-not-a-normal-flag)
- [Pattern: settings-backed API flags should be cast before Ember consumes them](#pattern-settings-backed-api-flags-should-be-cast-before-ember-consumes-them)
- [Pattern: duplicate selectors in `app.scss` can leave stale layout constraints active](#pattern-duplicate-selectors-in-appscss-can-leave-stale-layout-constraints-active)
- [Gotcha: seed privilege removals inside `SEEDING_ALREADY_DONE` never clean upgraded DBs](#gotcha-seed-privilege-removals-inside-seeding_already_done-never-clean-upgraded-dbs)
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
- [Pattern: Ember 5 QUnit unit tests — persistence proxy, run loop, and subject shape](#pattern-ember-5-qunit-unit-tests--persistence-proxy-run-loop-and-subject-shape)
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
- [Gotcha: persistence-sync Jasmine harness — wait for `sync_boards` tail / `syncSettled`, not only the `sync()` promise](#gotcha-persistence-sync-jasmine-harness--wait-for-sync_boards-tail--syncsettled-not-only-the-sync-promise)
- [Pattern: Board-card click navigation has TWO surfaces — board-icon `pick_board` default branch + board-preview `visit`; everything else delegates](#pattern-board-card-click-navigation-has-two-surfaces--board-icon-pick_board-default-branch--board-preview-visit-everything-else-delegates)
- [Pattern: Signup default library boards — copy via Progress, not copy_to_home_board](#pattern-signup-default-library-boards--copy-via-progress-not-copy_to_home_board)
- [Pattern: curated system boards live on static S3 — prefer over OpenAAC](#pattern-curated-system-boards-live-on-static-s3--prefer-over-openaac)
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
- [Pattern: reuse the speak-mode-pin modal as a generic PIN gate for any action](#pattern-reuse-the-speak-mode-pin-modal-as-a-generic-pin-gate-for-any-action)
- [Gotcha: async schedule_for on an unsaved record enqueues id:null and class-dispatches to a nonexistent method](#gotcha-async-schedule_for-on-an-unsaved-record-enqueues-idnull-and-class-dispatches-to-a-nonexistent-method)
- [Gotcha: safely cleaning up Resque failed jobs — origination is chain::, not scheduled; count-check destructive removes](#gotcha-safely-cleaning-up-resque-failed-jobs--origination-is-chain-not-scheduled-count-check-destructive-removes)
- [Gotcha: `Worker.process_queues` destroys RemoteActions — assert RA rows after one wave, not two](#gotcha-workerprocess_queues-destroys-remoteactions--assert-ra-rows-after-one-wave-not-two)
- [Gotcha: a single-quoted `i18n.t` default silently DELETES the key on the next generator run](#gotcha-a-single-quoted-i18nt-default-silently-deletes-the-key-on-the-next-generator-run)
- [Gotcha: fail-closed Sentry filters must not collapse lookup failures to nil](#gotcha-fail-closed-sentry-filters-must-not-collapse-lookup-failures-to-nil)
- [Gotcha: git DOC-ids hash `canonicalLocation` — never rename a registered path in place](#gotcha-git-doc-ids-hash-canonicallocation--never-rename-a-registered-path-in-place)
- [Gotcha: dual-key tag reads — check each key independently, never `a || b` before coercion](#gotcha-dual-key-tag-reads--check-each-key-independently-never-a--b-before-coercion)
- [Gotcha: Flusher `transfer_user_content` is not a checklist for `flush_user_content`](#gotcha-flusher-transfer_user_content-is-not-a-checklist-for-flush_user_content)
- [Gotcha: set-field on nested model fields needs nested observer deps (videoChanged pattern)](#gotcha-set-field-on-nested-model-fields-needs-nested-observer-deps-videochanged-pattern)
- [Gotcha: embed-frame `data-user_token` is UserIntegration#user_token, not User#user_token](#gotcha-embed-frame-data-user_token-is-userintegrationuser_token-not-useruser_token)
- [Gotcha: private uploads bucket — server-side OBZ/OBF import must use signed_internal_url](#gotcha-private-uploads-bucket--server-side-obzobf-import-must-use-signed_internal_url)

---

## Gotcha: Cloud Run secret assertions must check every nonzero-percent traffic target

`status.latestReadyRevisionName` is not “what users hit,” and neither is “the revision with
the largest traffic percent.” Cloud Run can split traffic across multiple revisions (canary /
rollback). A post-deploy secret-linkage check that inspects only one of them can pass while a
smaller-percentage revision is missing required `secretKeyRef` mounts. Emit and assert every
`status.traffic` entry with `percent > 0` (dedupe by revision name; fall back to
`latestReadyRevisionName` only when no nonzero targets exist). See
`scripts/gcp/assert-runtime-secrets.sh` and
[`2026-08-05-assert-runtime-secrets-traffic-split.md`](./2026-08-05-assert-runtime-secrets-traffic-split.md).

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
- [Gotcha: a server-side guard on payload SHAPE must be written against what Ember actually sends](#gotcha-a-server-side-guard-on-payload-shape-must-be-written-against-what-ember-actually-sends)
- [Gotcha: raw_events synthesizes clicks in modals — modern `{{on "click"}}` handlers then fire TWICE](#gotcha-raw_events-synthesizes-clicks-in-modals--modern-on-click-handlers-then-fire-twice)
- [Gotcha: `Utils.uniq(list)` with no comparator used to throw — and this repo has Puppeteer, not Playwright](#gotcha-utilsuniqlist-with-no-comparator-used-to-throw--and-this-repo-has-puppeteer-not-playwright)
- [Gotcha: `allowed?` RENDERS on denial — never put two of them in an `||`](#gotcha-allowed-renders-on-denial--never-put-two-of-them-in-an-)
- [Pattern: removing a user-facing toggle has an artifact checklist — source removal is only half of it](#pattern-removing-a-user-facing-toggle-has-an-artifact-checklist--source-removal-is-only-half-of-it)
- [Pattern: a Shepherd popover anchored to an element that gets removed mid-transition is flung to the top-left (0,0) by floating-ui — snap it out instantly](#pattern-a-shepherd-popover-anchored-to-an-element-that-gets-removed-mid-transition-is-flung-to-the-top-left-00-by-floating-ui--snap-it-out-instantly)
- [Pattern: the app root font-size is 10px (62.5%) — `rem` font-sizes render at 62.5%; ALWAYS use px (or the $aac-font-size-* tokens), never rem](#pattern-the-app-root-font-size-is-10px-625--rem-font-sizes-render-at-625-always-use-px-or-the-aac-font-size--tokens-never-rem)
- [Pattern: a click-to-speak container that holds the inline word-prediction buttons CANNOT be `role="button"`](#pattern-a-click-to-speak-or-click-to-act-container-that-holds-the-inline-word-prediction-buttons-cannot-be-rolebutton)
- [Pattern: the speak row's left "stack" mirrors the right `actions-wrap--stacked` — build symmetric, use `flex: 1`](#pattern-the-speak-rows-left-stack-mirrors-the-right-actions-wrap--stacked--build-symmetric-use-flex-1)
- [Pattern: a child pinned by `parent > * { z-index: 1 }` traps ALL its descendants below higher-z siblings — raise the ROW, not the menu](#pattern-a-child-pinned-by-parent---z-index-1--traps-all-its-descendants-below-higher-z-siblings--raise-the-row-not-the-menu)
- [Pattern: auth-page (login/register) "content cut off / bg not full height" — page-bg must be a transparent box; mesh goes on the fixed full-viewport `#within_ember`](#pattern-auth-page-loginregister-content-cut-off--bg-not-full-height--page-bg-must-be-a-transparent-box-mesh-goes-on-the-fixed-full-viewport-within_ember)
- [Pattern: blank username suggestions must be discarded before `clean_path`](#pattern-blank-username-suggestions-must-be-discarded-before-clean_path)
- [Pattern: keyboard control vocalizations must survive translation overlay](#pattern-keyboard-control-vocalizations-must-survive-translation-overlay)
- [Pattern: board-detail Speak bar must speak vocalization, not just label](#pattern-board-detail-speak-bar-must-speak-vocalization-not-just-label)
- [Pattern: board-detail Speak bar must play attached button sounds, not TTS-only](#pattern-board-detail-speak-bar-must-play-attached-button-sounds-not-tts-only)
- [Pattern: long-running modal work that must survive dismissal belongs in a service + app-level component, not a "hidden" modal](#pattern-long-running-modal-work-that-must-survive-dismissal-belongs-in-a-service--app-level-component-not-a-hidden-modal)
- [Gotcha: generic `.button` selectors in the CLASSIC board CSS leak onto the modern board-detail card](#gotcha-generic-button-selectors-in-the-classic-board-css-leak-onto-the-modern-board-detail-card)
- [Gotcha: `cqmin` inside an `inline-size` container silently resolves to the viewport](#gotcha-cqmin-inside-an-inline-size-container-silently-resolves-to-the-viewport)
- [Pattern: measure the real render before tuning a responsive coefficient](#pattern-measure-the-real-render-before-tuning-a-responsive-coefficient)
- [Gotcha: "the symbol doesn't fill the button" is usually the ASSET, not CSS — measure the opaque box before touching object-fit](#gotcha-the-symbol-doesnt-fill-the-button-is-usually-the-asset-not-css--measure-the-opaque-box-before-touching-object-fit)
- [Gotcha: percentage padding resolves against WIDTH — including padding-top/bottom](#gotcha-percentage-padding-resolves-against-width--including-padding-topbottom)
- [Gotcha: a media query adds NO specificity — an un-nested rule can silently outrank your breakpoint fix](#gotcha-a-media-query-adds-no-specificity--an-un-nested-rule-can-silently-outrank-your-breakpoint-fix)
- [Pattern: a viewport-filling `calc(100dvh - …)` must subtract every ancestor inset it sits inside](#pattern-a-viewport-filling-calc100dvh--must-subtract-every-ancestor-inset-it-sits-inside)
- [Gotcha: a plain inline style LOSES to a CSS `!important` — JS "fit to size" silently no-ops](#gotcha-a-plain-inline-style-loses-to-a-css-important--js-fit-to-size-silently-no-ops)
- [Gotcha: a self-rescheduling `runLater` makes every acceptance test hang — and the cause is never where the TODO says](#gotcha-a-self-rescheduling-runlater-makes-every-acceptance-test-hang--and-the-cause-is-never-where-the-todo-says)
- [Gotcha: Mirage 3 needs a config parameter and explicit models — symptoms look like an app hang](#gotcha-mirage-3-needs-a-config-parameter-and-explicit-models--symptoms-look-like-an-app-hang)
- [Gotcha: a skipped test's fixtures rot silently](#gotcha-a-skipped-tests-fixtures-rot-silently)
- [Pattern: `store_url_now` can resolve WITHOUT a cached copy — `local_url || data_uri` then assigns undefined and destroys the source URL](#pattern-store_url_now-can-resolve-without-a-cached-copy--local_url--data_uri-then-assigns-undefined-and-destroys-the-source-url)
- [Pattern: separate a real regression from this suite's wandering timeout by RE-RUNNING, not by reasoning](#pattern-separate-a-real-regression-from-this-suites-wandering-timeout-by-re-running-not-by-reasoning)
- [Gotcha: "Died on test #N" is the jasmine shim's STEP number, not the Nth `it()`](#gotcha-died-on-test-n-is-the-jasmine-shims-step-number-not-the-nth-it)
- [Gotcha: fit-to-box must measure BOTH axes — `word-break: keep-all` makes a long word overflow sideways, never down](#gotcha-fit-to-box-must-measure-both-axes--word-break-keep-all-makes-a-long-word-overflow-sideways-never-down)
- [Pattern: per-user UI prefs must be read from `currentUser`, not the board-detail route's URL user](#pattern-per-user-ui-prefs-must-be-read-from-currentuser-not-the-board-detail-routes-url-user)
- [Pattern: `.md-board-collection__*` is a light-base panel reusable on any page; dark theme is ancestor-scoped](#pattern-md-board-collection-is-a-light-base-panel-reusable-on-any-page-dark-theme-is-ancestor-scoped)
- [Pattern: inside `.md-board-collection`, `data-bd-action` is the REAL handler — `@onSelect`/`@onBack` are decoration](#pattern-inside-md-board-collection-data-bd-action-is-the-real-handler--onselectonback-are-decoration)
- [Pattern: a board's KEY is not stable — renaming a board rewrites it, so key-shape heuristics silently reclassify boards](#pattern-a-boards-key-is-not-stable--renaming-a-board-rewrites-it-so-key-shape-heuristics-silently-reclassify-boards)
- [Pattern: `global_transition` runs `toggle_edit_mode()` on routeWillChange — an edit→edit transition re-opens the copy prompt](#pattern-global_transition-runs-toggle_edit_mode-on-routewillchange--an-editedit-transition-re-opens-the-copy-prompt)
- [Pattern: a new user preference is a 3-touch change — whitelist + default + dirty-bit save](#pattern-a-new-user-preference-is-a-3-touch-change--whitelist--default--dirty-bit-save)
- [Pattern: "order-dependent" spec failures on global counts are often orphaned committed rows in the test DB](#pattern-order-dependent-spec-failures-on-global-counts-are-often-orphaned-committed-rows-in-the-test-db)
- [Gotcha: ember-data 5.3 relationship/store arrays are NOT EmberArrays — `firstObject` on a hasMany is silent undefined](#gotcha-ember-data-53-relationshipstore-arrays-are-not-emberarrays--firstobject-on-a-hasmany-is-silent-undefined)
- [Pattern: reuse the audit-register machinery for non-compliance domains via a separate register file](#pattern-reuse-the-audit-register-machinery-for-non-compliance-domains-via-a-separate-register-file)
- [Pattern: "it follows me when I scroll" — the app's scroll container is `#content`, so an overlay must live INSIDE it, not next to it](#pattern-it-follows-me-when-i-scroll--the-apps-scroll-container-is-content-so-an-overlay-must-live-inside-it-not-next-to-it)
- [Gotcha: a rule in an `@use`d partial LOSES to an equal-specificity rule in app.scss — the partial is emitted first](#gotcha-a-rule-in-an-used-partial-loses-to-an-equal-specificity-rule-in-appscss--the-partial-is-emitted-first)
- [Gotcha: legacy bare-element rules (`h1 { height: 60px }`) silently size modern components — a "gap" with no margin behind it](#gotcha-legacy-bare-element-rules-h1--height-60px--silently-size-modern-components--a-gap-with-no-margin-behind-it)
- [Gotcha: a shared mixin's `!important` cosmetics beat your MORE SPECIFIC variant rule — the variant silently renders as the base](#gotcha-a-shared-mixins-important-cosmetics-beat-your-more-specific-variant-rule--the-variant-silently-renders-as-the-base)
- [Gotcha: Bootstrap 3's `.dropdown-menu > li > a` (0,1,2) beats the app's flat `.md-settings-dropdown-item` — the modern skin's flex/gap silently never applies](#gotcha-bootstrap-3s-dropdown-menu--li--a-012-beats-the-apps-flat-md-settings-dropdown-item--the-modern-skins-flexgap-silently-never-applies)
- [Gotcha: `overscroll-behavior: contain` on a NON-overflowing `overflow: auto` element swallows the wheel entirely](#gotcha-overscroll-behavior-contain-on-a-non-overflowing-overflow-auto-element-swallows-the-wheel-entirely)
- [Pattern: an overlay gated on an ASYNC-resolved record belongs in a computed, not a flag the route sets](#pattern-an-overlay-gated-on-an-async-resolved-record-belongs-in-a-computed-not-a-flag-the-route-sets)
- [Gotcha: Ember Data's `{reload: true}` NEVER reaches the network — the app's adapter is offline-first, use `persistence.force_reload`](#gotcha-ember-datas-reload-true-never-reaches-the-network--the-apps-adapter-is-offline-first-use-persistenceforce_reload)
- [Gotcha: a 200 on the user PUT does not mean the home board was stored — the server discards invalid refs silently](#gotcha-a-200-on-the-user-put-does-not-mean-the-home-board-was-stored--the-server-discards-invalid-refs-silently)
- [Gotcha: a translucent control RE-TINTS when its container's state changes — "it changes colour when I click it" is often the parent, not the button](#gotcha-a-translucent-control-re-tints-when-its-containers-state-changes--it-changes-colour-when-i-click-it-is-often-the-parent-not-the-button)

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

**Sticky QP gotcha:** `board` is sticky by default. Every "Try a Demo" link (topbar, landing hero, etc.) must pass `@query={{hash board=null source=null}}`, and the route should only honor `?board=...` when `source=offline_boards` (offline picker). Otherwise always load manifest root (`public/demo-boards/manifest.json` → Project Core 36). First seen in [2026-06-07-demo-try-default-board.md](./2026-06-07-demo-try-default-board.md); landing hero wired in [2026-07-30-landing-try-demo-speak.md](./2026-07-30-landing-try-demo-speak.md).

**Exit target:** Demo speak exit should always `LinkTo offline_boards` — do not branch on `source`; "Try a Demo" used to fall through to `index`.

## Pattern: phased board prefetch — shared planner, dual persistence files

**Surface:** session navigation cache (`board_detail_cache.js`) and offline IndexedDB sync (`sync_boards`).

**Approach:** [`board_prefetch_planner.js`](../../app/frontend/app/utils/board_prefetch_planner.js) enumerates roots in priority order (home → liked → owned → public). Session cache runs `/tree` per root via `_run_prefetch_pipeline`; offline sync seeds the BFS queue with the same lookups via `lookupsToSyncSeeds`.

**Gotcha:** `sync_boards` exists in **both** [`app/utils/persistence.js`](../../app/frontend/app/utils/persistence.js) and [`app/services/persistence.js`](../../app/frontend/app/services/persistence.js). Runtime sync uses `window.persistence` (the service). Any offline-sync change must be applied to **both** files or offline behavior won't match.

**Flags:** Phase 1 (home) is unconditional; phases 2–4 run when `background_board_prefetch` is enabled (shipped in `ENABLED_FRONTEND_FEATURES`). Phase 4 also honors legacy `catalog_board_prefetch`.

**First seen in:** [2026-05-30-phased-online-board-caching.md](./2026-05-30-phased-online-board-caching.md)

## Pattern: board-detail `/tree` blocks paint on the full descendant payload

**Surface:** cold / TTL-miss opens of modern speak (`user.board-detail` → `GET /api/v1/boards/:key/tree`).

**Gotcha:** Route comments say “resolve when the root is ready; cache descendants in the background,” but `model()` only calls `handleRoot` / `resolve` inside the `/tree` AJAX success handler — after root **and** all descendants have been downloaded and parsed. For a large vocab (e.g. home with ~96 downstream boards) lite serialize alone was ~2s and ~84MB JSON locally; root-only was ~50ms / ~1.5MB. Session `boardDetailCache` (5 min) and `background_board_prefetch` only help *after* that warm; they do not remove the first-open cliff. Prefetch of the home root pays the same full-tree cost in the background.

**Fix recipe:** Two-phase load — `GET …/tree?root_only=1` first (lite root), paint, then ingest full `/tree` in the background via `ingest_tree(..., { force: false, warm_root_images: false })`. Server skips descendant load when `root_only` is set. Do not “fix” slow opens by only extending TTL or prefetch coverage.

**Gotcha (prefetch root_only vs cache hit):** Session prefetch stores `/tree?root_only=1`. A board-detail cache hit used to return without warming the full tree, so folder taps that used to be warm after prefetch were cold. Mark those entries `root_only`; on cache hit (modern `board-detail` and classic `board-alt`) call `warm_full_tree_if_root_only` so the full `/tree` still lands in the background. A full-tree ingest clears the mark. Do not treat empty `descendants` as the signal — a board with no children is a valid full tree. Do not let a later root_only ingest downgrade a fresh full-tree entry.

**Diag:** `localStorage.ll_board_cache_diag=1` → [`board_cache_diag.js`](../../app/frontend/app/utils/board_cache_diag.js) marks on board-detail.

**First seen in:** [2026-07-23-speak-mode-board-cache-latency.md](./2026-07-23-speak-mode-board-cache-latency.md)

## Pattern: boards-page Mine list — cache-first paint, atomic background refresh

**Surface:** `/:user/boards` overlay gated on `model.my_boards.done` ([`user/boards.hbs`](../../app/frontend/app/templates/user/boards.hbs)); list load in [`generate_or_append_to_list`](../../app/frontend/app/controllers/user/index.js).

**Gotcha:** Re-entering the boards page always re-queried `store.query('board', { user_id })`. Streaming partial pages onto `model.my_boards` cleared `.done` until the last page, so a background refetch re-showed “Preparing your workspace.” Server Redis on boards index only caches public search, not Mine `user_id` lists. Even after cache-first paint, a within-TTL revisit still re-downloaded the full owned library (buttons+grid per row) while session `catalog_board_prefetch` flooded `/tree` and starved Mine pagination.

**Fix recipe:** (1) Persist a compact Mine snapshot in localStorage ([`boards_page_list_cache.js`](../../app/frontend/app/utils/boards_page_list_cache.js), 10m TTL). (2) Hydrate in [`routes/user/boards.js`](../../app/frontend/app/routes/user/boards.js) before `update_selected`. (3) When the visible list is already usable (`Array` + `.done`), accumulate pages in a side buffer and atomically swap only on the final page; never set `{loading:true}` over a usable empty list. (4) Clear snapshots in `appState.clear_user_state`. (5) **Within TTL, skip `store.query` entirely** when usable list + `hasFreshSnapshot`; clear snapshot on create/delete/copy so the next visit refreshes. (6) Paginated index JSON omits `buttons`/`grid`/`intro`/`background` (`args[:paginated]` in [`lib/json_api/board.rb`](../../lib/json_api/board.rb)). (7) Set `setMineListBusy` during Mine fetch; defer `board_detail_cache` phase-4 catalog `/tree` until clear. Distinct from `board_detail_cache` (speak `/tree`). (8) **Pass-2:** `setBoardsPageActive` on `user.boards` activate/deactivate; pause phase-1 home, phase-2 liked, phase-3 owned-list + phase-3/4 `/tree` and image warm while the route is active (TTL skip clears Mine busy, so Mine-busy-only deferral is not enough). Wait until deactivate — do not resume prefetch on a wall-clock cap while Boards is still open. (9) Prefetch `/tree?root_only=1` and mark the cache entry `root_only`; speak cache-hits call `warm_full_tree_if_root_only` so folder taps are not left cold. `collectPublicLookups` runs `filterBrandSetRootBoards` after wrapping plain API rows with `.get` (brand `test()` only reads `board.get('key')`). (10) Overlay/hero gate on `mineListPaintReady` (first page or `.done`), not last-page `.done`. (11) Gate `reload_logs` / `load_badges` / `load_goals` / `check_daily_use` on `isBoardsPageActive()` so boards visits do not fetch profile widgets; profile and account `setupController` still call them (including `check_daily_use`). Search may run on a partial library — show `boards_filter_library_loading` until `my_boards.done`.

**Gotcha (list summary + locale):** Omitting button/content blobs must not skip `localized_name` / `localized_locale`. Index already eager-loads `board_content`; when `args[:locale]` is present, still load translations for `board_name` matching, but do not rewrite per-button labels (list payloads have no `buttons`). Gating the whole locale block behind `!list_summary` broke `Api::BoardsController index should return a localized board name`.

**First seen in:** [2026-08-03-boards-page-cache-first.md](./2026-08-03-boards-page-cache-first.md); load-perf follow-up [2026-08-10-boards-page-load-perf.md](./2026-08-10-boards-page-load-perf.md); pass 2 [2026-08-17-boards-page-load-pass2.md](./2026-08-17-boards-page-load-pass2.md)

## Gotcha: board-picker category tabs share one `category_boards` list — stale loads must not paint

**Surface:** `/board-picker` `BoardPicker` with `searchAtTop` ([`components/board-picker.js`](../../app/frontend/app/components/board-picker.js)).

**Gotcha:** All Available Boards waits for every mine/shared page plus the first public page before painting, so it is slow. The selected tab (`current_category`) and the grid (`category_boards`) are separate. Switching to Cause and Effect starts a new query but does not cancel the All Available requests. Those writers used to call `this.set('category_boards', …)` with no generation check, so the default list appeared under the new category.

**Fix:** All Available uses its own `_available_load_id` so the first fetch can finish in the background. Results are snapshotted and reused when the user returns to the tab; they only paint `category_boards` while that tab is selected. Tagged categories still bump `_boards_load_id` so a late Cause and Effect response cannot overwrite All Available. Tests in `tests/unit/components/board-picker-category-race-test.js`.

**First seen in:** [2026-08-20-board-picker-category-race.md](./2026-08-20-board-picker-category-race.md)

## Gotcha: Android “classic board” error may be stale packaged board-detail

**Surface:** Capacitor app loads packaged `lingolinq_mobile/www/` (usually `PACKAGE_SOURCE=prod`), not Ember `:8184`. Speak/home routing uses `transitionToBoardForCurrentUiStyle` — default `modern` → `user.board-detail`; `classic` preference → `user.board-alt` (reuses `board/index`); only `obf/` / `integrations/` / odd keys hit legacy `board`.

**Gotcha:** A Try-Again-only offline screen on Android often looks like “classic” but is **board-detail’s old error UI** from a www snapshot built before the Home/Back escape-hatch PR. Confirm with UI chrome (`md-board-detail-error` + Bootstrap button vs plain `<a>`) and whether the APK was re-packaged after the fix. Still keep escape hatches on classic `board` / `board-alt` error templates — real classic sessions and legacy keys still hit them.

**First seen in:** [2026-08-11-classic-board-error-escape.md](./2026-08-11-classic-board-error-escape.md)

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

## Gotcha: `__text-symbol` is a third label surface — include it in contrast modes and shrink-to-fit

**Surface:** board-detail text-only buttons under `text_symbol_fallback`
(`md-board-detail-symbol-card__text-symbol`).

**Symptom:** Black image-background mode shows unreadable dark text on
`#000` cards; and/or "Shrink labels to fit" leaves long text-symbol
copy clipped at the CSS 16px floor.

**Root cause:** Text-symbol buttons hide the ordinary `__label` and
render a full-card span instead (`board-detail-grid.hbs`). That span
uses `color: inherit` and is not in the historical
`__label`/`__label-input` selector pairs for
`.symbol_background_black` or `label_fit.js#selectLabels`. Naively
routing it through `fitWrapped` is also wrong — that path targets the
3.45em bottom label box, while text-symbols fill the card at
`clamp(16px, pref*1.45, 32px)`.

**Fix recipe:** Keep `__text-symbol` in lockstep with label contrast
rules (same white/`!important` treatment as labels under
`.symbol_background_black`; high-contrast already has its own rule).
For shrink-to-fit, select the span in `label_fit.js` and fit against
the card box (`fitFullCard`) at the 1.45× CSS base — do not reuse the
3-line label-box math.

**Evidence:**
[`app.scss` black-mode rule](../../app/frontend/app/styles/app.scss),
[`label_fit.js`](../../app/frontend/app/utils/label_fit.js).

**First seen in:**
[2026-07-29-text-symbol-codex-findings.md](./2026-07-29-text-symbol-codex-findings.md)

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

## Gotcha: seed privilege removals inside `SEEDING_ALREADY_DONE` never clean upgraded DBs

**Surface:** `db/seeds.rb` privilege grants gated by `SEEDING_ALREADY_DONE` (`User.exists?(user_name: 'example') && Organization.exists?(admin: true)`).

**Symptom:** PR removes an `add_manager` / admin grant from the legacy seed block; fresh DBs are safe, but already-seeded environments keep the old `UserLink` and `Organization.admin_manager?(example)` stays true.

**Root cause:** The already-seeded guard exits before the changed lines run. Deleting a grant is not the same as revoking an existing link.

**Fix:** Put an idempotent revoke **outside** that guard (and outside `SEED_DEMO_DATA` if the bad link can exist without re-seeding demo data). Prefer `Organization#assistant?` + `#remove_manager` so any admin-org `org_manager` link is cleared.

**First seen in:** [2026-08-11-revoke-example-admin-org-link-on-reseed.md](./2026-08-11-revoke-example-admin-org-link-on-reseed.md) (PR #776 Codex P1)

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

## Pattern: `current_mode` is the ONE source for speak/edit/default — and child-route exits must restore the parent's invariant

**The model:** there is no settable `speak_mode`. All three flags derive from a
single persisted stash, `stashes.current_mode` (`services/app-state.js:3033-3060`):
`speak_mode = current_mode=='speak' && currentBoardState`,
`edit_mode = current_mode=='edit' && …`, `default_mode = current_mode=='default' || …`.
So "put them back in speak mode" == `stashes.persist('current_mode','speak')`,
and any change flips TWO flags (speak on, default off).

**The invariant:** the board-detail route declares *"board-detail operates as
speak mode"* and forces `current_mode='speak'` on entry, recording
`_was_not_speak_mode` so it can restore `'default'` when you leave
(`routes/user/board-detail.js:453-457, 496-500`).

**The trap:** `board-detail.edit` is a CHILD route (`router.js:159-161`). Exiting
the child back to the parent does NOT re-run the parent's `setupController`, so
the parent cannot re-assert its invariant. The child's `resetController` is the
only thing that can — and if it restores anything other than `'speak'`, the user
is stranded ON board-detail with `speak_mode` false. That silently disables the
whole speak surface (logging, scanning, sidebar, speak chrome) and was the
upstream cause of the dead ⋮ toggle (see the dual-dispatch entry below).
**Rule: when a child route mutates a mode/state the parent asserts on entry, the
child's resetController must restore it — the parent gets no second chance.**

**The second half — `last_speak_mode` asymmetry.** The speak_mode observer skips
its TEARDOWN when the transition target is 'edit' (`app-state.js:2865-2866`) so a
session survives the round-trip, but it used to still record
`last_speak_mode = false` (`:2911`). That made the trip back out of edit look
like a FRESH activation, re-running the once-per-activation block (`:2733`) on
every edit exit: speaks "here we go", re-shows logging toast / voice + volume
warnings / intro + goal modals, and calls `set_history([])` (`:2750`) — wiping
board history and breaking the back button. Fix was symmetric: skip the
`last_speak_mode` write while `current_mode=='edit'` too.
**Rule: if you skip teardown for a transition, you must also skip the
"last state" bookkeeping for it, or the return trip re-fires first-entry effects.**

**Gotcha when auditing this area:** `current_mode` is PERSISTED, and
`routes/index.js:101` auto-jumps into speak mode on next login when it reads
`'speak'`; `routes/index.js:136` / `routes/bento.js:58` only ever downgrade
`'edit'`, never `'speak'`. Also `res.reload(!speak_mode)`
(`routes/board/index.js:30`) suppresses server reload in speak mode, which works
against the edit route's cache invalidation — verify freshly-saved edits appear.

**First seen in:** [2026-07-18-actions-toggle-dead-after-edit.md](./2026-07-18-actions-toggle-dead-after-edit.md)

---

## Pattern: inside `.md-board-collection`, `data-bd-action` is the REAL handler — `@onSelect`/`@onBack` are decoration

**Surface:** any reuse of the `BoardCollection` panel on board-detail in a new
context (the edit-mode "Board Collections" left drawer was the first). Applies
to every board-detail chrome element that carries `data-bd-action`.

**Symptom:** you pass `@onSelect` / `@onBack` closures to the component, they
look wired, and the component's own `select_board` / `back` actions do call
them — but clicking runs the OTHER context's behavior instead. In the edit
drawer this read as two separate bugs: picking a board rendered it in SPEAK
mode (`md-board-detail-grid board speak`), and the back button never committed
to the previewed board.

**Root cause:** clicks inside `.md-board-collection` on board-detail are never
deferred to Ember — `raw_events` explicitly bails out of
`defer_board_detail_chrome_click_to_ember` for that selector
(`raw_events.js:2719`) and routes the release to `boardDetailChromeRelease`
(`raw_events.js:1591-1595`). That resolves the action by walking the DOM for
`data-bd-action` / `data-bd-arg` **first** (`raw_events.js:101-109`), before any
class-based map, and sends it to `editManager.controller`. So the hardcoded
attribute in the template wins over the component argument, every time.

**Rule: when a shared board-detail component gains a second context, the
`data-bd-action` values must become context-aware too — otherwise the new
context silently dispatches the old context's controller actions.** Resolve the
names ONCE on the component (a `computed('editContext')` returning the action
name) and bind the attribute to it, so the attribute path and the `{{on}}` path
can't drift. Then add the controller action for the new context and have it
DELEGATE to the same handler the component argument points at — one behavior,
one definition.

**Corroborating smell to look for:** an action defined on the controller with
zero references anywhere in the app (here, `close_edit_board_collection`) while
the surface it belongs to "doesn't work". Nothing was ever wired to it, because
the template was still emitting the other context's action name.

**Generalization:** on board-detail, `data-bd-action` is not a fallback for
dwell/eye-gaze — for co-located classic components it is the ONLY path. Grep
`data-bd-action` in a template before assuming an `{{on "click"}}` handler is
what actually runs.

**Corollary — a control with NO `data-bd-action` inside such a panel is dead
unless the branch re-dispatches a pass-through click.** `data-bd-action` routes
to `editManager.controller`, i.e. board-detail CONTROLLER actions. Controls whose
handler is COMPONENT-local (BoardCollection's "Show N more boards" →
`toggle_my_boards_expanded`, the search `×` → `clear_search`) legitimately carry
no attribute, so `boardDetailChromeRelease` resolves nothing — and the
`event.preventDefault()` that precedes it swallows their click. They looked
completely inert: no menu, no error, nothing. The sibling `.board-detail-view`
branch already had the remedy; the `.md-board-collection` branch was missing it:

```js
if(!boardDetailChromeRelease(elem_wrap)) {
  dispatchPassThroughClick(elem_wrap.dom, event.clientX, event.clientY);
}
```

**Rule: any raw_events branch that calls `preventDefault()` before attempting a
chrome dispatch MUST fall back to `dispatchPassThroughClick` when nothing
resolves** — otherwise it silently eats every control the chrome map does not
know about. It cannot double-fire, since the fallback is only reached when no
action was resolved. Symptom to recognize: within one panel, some controls work
and others are completely inert — split them by presence of `data-bd-action`.

**CORRECTED 2026-08-04 — the pass-through fallback must NOT fire on a mouse
release.** The paragraph above originally claimed the fallback "cannot
double-fire", and inferred from the dead "Show more" that `{{on "click"}}` never
fires inside `.md-board-collection`. Both are wrong, and the second is the
textbook version of the trap the dual-dispatch entry below warns about: for a
TOGGLE, firing twice is indistinguishable from never firing. `preventDefault()`
in that branch lands on `mouseup`, which does **not** cancel the browser's
follow-up `click`, so the control's own `{{on "click"}}` runs anyway — the
synthetic click is a SECOND dispatch, and the toggle net-cancelled in both
drawers. Nothing on that path calls `stopPropagation()` on the native click, and
the modifier is an ordinary `addEventListener` (the same `ctrlAction` binding
used by ~2130 click sites app-wide), so of course it fires.

The corrected rule: **re-dispatch only when the browser will NOT deliver a
native click** — touch (`preventDefault()` on `touchend` DOES cancel the
synthesized click), dwell, eye-gaze, scanning. See
`passThroughUnresolvedChromeClick` (`raw_events.js`), which skips the synthetic
click when `event.type === 'mouseup'` **and** `elem_wrap.dom.contains(event.target)`.
The `contains` half is required for `activation_location: 'start'`, where
`elem_wrap` is reassigned to the *mousedown* element: on a press-A/release-B
interaction the native click goes to their common ancestor and misses A, so
those must still synthesize.

**Meta-lesson:** a fix whose only evidence is "the symptom is consistent with my
theory" is not diagnosed. The edit-mode branch already had the fallback while the
pill was dead there — that fact alone refuted the "swallowed outright" diagnosis
and was visible at the time.

**First seen in:** [2026-08-03-edit-collections-drawer-dispatch-bug.md](./2026-08-03-edit-collections-drawer-dispatch-bug.md),
corrected in [2026-08-04-board-collection-show-more-dead.md](./2026-08-04-board-collection-show-more-dead.md)

---

## Pattern: a board's KEY is not stable — renaming a board rewrites it, so key-shape heuristics silently reclassify boards

**Surface:** anything that infers a board's ROLE from its key slug — most of all
`isBrandSetRoot` / `filterBrandRoots` (`utils/board-brands.js`), which decides
whether a board is a brand-set ROOT tile or a sub-board PAGE.

**Symptom:** a user renames a board they own and it disappears from My Boards
(Board Collection panel) and from the boards-page grid. Nothing was deleted; the
board is still owned and still returned by the API.

**Root cause:** saving a renamed board on board-detail auto-renames the KEY to
match the new display name — `_auto_rename_board`
(`controllers/user/board-detail.js`) posts `/api/v1/boards/:id/rename` and
transitions the URL. So `<user>/sequoia-15` becomes
`<user>/sequoia-15-changed-with-a-really-long-name`, which is shape-identical to a
genuine sub-board page (`<user>/sequoia-15-animals`) and fails the
`<brand>-<size>$` root pattern. The renamed ROOT is then filtered out as a
sub-board. Only brand-family boards are affected — non-brand boards match no
family and always pass.

**Rule: classify a COPY by its PARENT's key (`parent_board_key`), not its own.**
A copy of a set root has `parent_board_key = lingolinq/sequoia-15`; a copy of a
page has `parent_board_key = lingolinq/sequoia-15-animals`; a rename never touches
the parent. Fall back to the board's own key when there is no parent (originals,
shallow clones, and the `:as_lite` serializations that omit the field — see
`lib/json_api/board.rb`). `parent_board_key` is a declared attr on the Ember Board
model and IS present on the non-lite boards-index payload.

**Corollary — user-editable text must never be the only input to a visibility
decision.** `name` (and, because of the auto-rename, `key`) are both user-editable,
so any filter keyed on them can make a user's own board vanish through an ordinary
edit. Prefer an immutable relation (`parent_board_id`/`parent_board_key`,
`copy_id`) as the signal and keep the text pattern as the fallback.

**The rename itself is link-safe — don't "fix" that part.** `Board#rename_to` writes an
`OldKey` row, the server-rendered `/:user/:board` route resolves it via
`find_by_possibly_old_path` and REDIRECTS to the new key, and the API `show` resolves
old keys too. A collision aborts the rename (`@collision_error`) and leaves the key
untouched — the `_1` suffix comes from `generate_unique_key` at CREATE, not from rename.
What the rename does cost is a slow-queue `rename_deep_links` pass over every upstream
board, shared user, UserLink, UserBoardConnection and LogSession referencing the board.
So the guard worth having is not "stop renaming" but **"only rename the key when the key
was already the slug of the OLD name"** — that leaves a deliberately-chosen URL (or a
`_1` copy key, or a `my:` shallow-clone key) alone. Implemented in
`controllers/user/board-detail.js#_auto_rename_board`.

**Also check for a second copy of the loop.** This exact classifier existed twice —
`board-brands.js#filterBrandRoots` (Board Collection) and
`board-roots.js#isBrandSetRootBoard` (boards page) — so the bug shipped on both
surfaces and had to be fixed twice until the duplicate was collapsed into one
exported `isBrandSetRoot`.

**First seen in:** [2026-08-04-renamed-brand-copy-vanishes-from-my-boards.md](./2026-08-04-renamed-brand-copy-vanishes-from-my-boards.md)

---

## Pattern: `global_transition` runs `toggle_edit_mode()` on routeWillChange — an edit→edit transition re-opens the copy prompt

**Surface:** any flow that transitions from one board to another while
`app_state.edit_mode` is true — the edit-mode Board Collections drawer preview,
and the post-copy hop into a freshly-made copy from copy-to-edit.

**Symptom:** copy-to-edit completes, lands correctly in edit mode of the new
copy, and *then* "Edit this Board / You don't have permission to edit this board
directly… Edit a Copy" (`confirm-needs-copying`) re-opens on top of it. Looks
like the copy failed or the permissions did not refresh; neither is true.

**Root cause:** `app-state.js#global_transition` ends with a bare

```js
if(this.get('edit_mode')) { this.toggle_edit_mode(); }
```

whose *intent* is "navigating away from a board while editing leaves edit mode."
But `toggle_edit_mode` is the INTERACTIVE entry point — before it changes any
mode it runs `assert_source()` and, when `!board.permissions.edit`, opens
`confirm-needs-copying` (`app-state.js:1471-1478`). And `global_transition` is
wired to **`routeWillChange`** (`routes/application.js:110`), so it fires BEFORE
the destination's `model`/`setupController`: the board it inspects is the one
still on screen — the ORIGINAL non-owned board — not the copy being navigated
to. Awaiting `copiedBoard.reload(true)` cannot help, because the copy is never
the board being checked.

**Why it hides:** arriving from SPEAK mode, `edit_mode` is false at
`routeWillChange`, so the call is never reached — the whole copy-to-edit flow is
clean from speak mode and broken only from edit mode. Chasing the copy's
freshness (reload, permissions, double-transition) is therefore a dead end; the
distinguishing variable is the mode you STARTED in.

**Fix:** skip the teardown when the destination is the edit route itself —
`transition.to_route != 'user.board-detail.edit'` — since edit→edit navigation is
staying in edit mode and `routes/user/board-detail/edit.js:64` re-asserts
`current_mode='edit'` regardless. This mirrors the guard the `speak_mode`
observer already uses for the same reason (`app-state.js:2865-2866`).

**Rule: a lifecycle/cleanup hook must never call an INTERACTIVE entry point.**
`toggle_edit_mode`, `toggleEditMode`, and friends open modals and can start a
copy; hooks that just want to drop a mode should change the mode directly, or be
gated so they cannot fire on a transition that is staying in that mode. Grep for
bare calls to interactive actions inside observers and transition hooks.

**First seen in:** [2026-08-03-edit-collections-drawer-dispatch-bug.md](./2026-08-03-edit-collections-drawer-dispatch-bug.md)

---

## Pattern: dual-dispatch (raw_events fallback + Ember `{{on}}`) double-fires and net-cancels TOGGLE actions

**Surface:** board-detail chrome. Clicks reach the controller by TWO routes —
Ember's `{{on "click"}}` and the `raw_events.js` fallback
(`resolveBoardDetailChromeAction` → `controller.send`), which exists because
Ember 5 `{{on}}` misses SYNTHETIC clicks (dwell/eye-gaze/touch).
`defer_board_detail_chrome_click_to_ember` is the dedup that decides which one
wins. When that dedup mis-fires, BOTH run.

**Symptom:** a toggle button looks dead — no menu, no flash, no console error.
Non-toggle chrome (e.g. `go_home`) looks fine because double-dispatching an
IDEMPOTENT action is invisible. Only a toggle net-cancels
(`false→true→false`), so a toggle is the canary for this whole bug class.

**Root cause found (2026-07-18):** the dedup bailed whenever neither
`speak_mode` nor `edit_mode` was set. Leaving edit mode lands on board-detail
with BOTH false, so raw_events stopped deferring and dispatched the action
itself — while Ember's `{{on "click"}}` still fired for the same interaction.

**The load-bearing detail — `preventDefault()` on `mouseup` does NOT cancel the
follow-up `click`.** raw_events suppresses at the pointer-release, so with a
MOUSE the native click still reaches `{{on}}` → two calls. With TOUCH,
`preventDefault()` on `touchend` DOES suppress the synthetic click → one call →
works. That mouse/touch asymmetry is the real explanation for symptoms that
look like timing ghosts.

**Beware the DevTools red herring:** the bug "healed whenever DevTools opened,"
which reads as a throttling/render-flush issue. It was not — DevTools was
putting the interaction on the TOUCH path. Do not chase resize/focus/rAF
theories until you have confirmed the event TYPE (`mouseup` vs `touchend`).

**Diagnostic technique when opening DevTools changes the behavior:** the console
can't observe the broken state. Instrument the code to push records into a
global buffer (`window.__td`), reproduce with DevTools CLOSED, then open
DevTools and read the buffer. Log at EVERY dispatch point (the Ember action AND
the raw_events `send`) so the call COUNT per interaction is visible — the count
is what distinguishes double-fire from no-fire.

**Fix:** defer to Ember for real mouse clicks in every mode; let raw_events take
over only where `{{on}}` genuinely misses events (non-'click' sources, touch
releases, co-located classic components like `.md-board-collection`). See
`defer_board_detail_chrome_click_to_ember` (`raw_events.js:2694`).

**Recurrence (2026-08-04) — same class, opposite direction.** The bug came back
in `.md-board-collection` because a fix ADDED a second dispatch:
`dispatchPassThroughClick` was called on `mouseup` for controls the chrome map
does not resolve, on top of the native click. "Show N more boards" went dead in
both drawers. **Checklist before adding any synthetic click in raw_events: is a
native `click` still coming?** On `mouseup`, yes — always. Only `touchend`
(and the no-native-click sources: dwell, gaze, scanning, switch) need one.
Whenever a control in board-detail chrome "does nothing", count dispatches
before assuming zero.

**First seen in:** [2026-07-18-actions-toggle-dead-after-edit.md](./2026-07-18-actions-toggle-dead-after-edit.md),
recurred in [2026-08-04-board-collection-show-more-dead.md](./2026-08-04-board-collection-show-more-dead.md)

---

## Pattern: the Ember-5 migration `ctrlAction` click wrapper kills HTML5 drag

**Surface:** any component that forwards native `ondragstart` /
`ondragover` / `ondrop` through the hand-rolled `ctrlAction` closure
introduced during the Ember 4→5 migration to replace classic
`{{action}}` closure-actions. First hit: `sidebar-editor` (the
board-detail "Edit Sidebar" reorder drag).

**Symptom:** drag does nothing — no drag ghost, no reorder. The UI hints
(`draggable="true"`, grip cursor) look right, but the item never lifts.

**Root cause:** `ctrlAction` is built for CLICK handlers. For ANY event
with `.preventDefault` + (`.type` || `.target`) — which every DOM event
has — it (1) calls `event.preventDefault()` and (2) pops the event off
the args before `send`. Both are fatal to native drag:
- `preventDefault()` on a live `dragstart` **cancels the drag before it
  starts** (spec behavior) — nothing lifts, no dragover/drop ever fire.
- popping the event starves `row_drag_start` of the `dataTransfer` it
  needs to call `setData` (Firefox refuses to drag without a payload).

This is a migration artifact: the drag handlers were wired to the same
wrapper as the click handlers, and the click-correct preventDefault+pop
is drag-wrong.

**Fix:** give drag its own forwarder that passes the RAW event through
untouched (no preventDefault, no pop) — `dragAction` in
`sidebar-editor.js`. The drag actions already call `preventDefault`
themselves in exactly the right places (to cancel a non-reorderable
drag, and to allow a drop on `dragover`/`drop`) — never on a live
`dragstart`. Rule of thumb: do NOT preventDefault `dragstart`; DO
preventDefault `dragover`+`drop` (inside the action, guarded).

**Evidence:** `sidebar-editor.js` `ctrlAction` (init) preventDefaults +
pops; `row_drag_start` (~line 479) reads `event.dataTransfer`;
`dragAction` (init) is the raw-event forwarder; handlers rewired in
`sidebar-editor.hbs:51,53`.

**Related:** the "walk the chain, the first wrapper that truncates is the
bug" diagnostic above — same class (a forwarder mangling the event), one
layer worse (it also cancels via preventDefault, so the visual hint
doesn't even appear).

**First seen in:** [2026-07-18-sidebar-editor-drag-drop.md](./2026-07-18-sidebar-editor-drag-drop.md)

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

## Pattern: carry register attestation across the Google OAuth redirect via the backend, not controller memory

Same hard-reload trap as above, but for a *pre*-auth signal. `continue_with_google`
does `location.href = '/auth/google/start?…'` — a full navigation — so any
controller state (e.g. `age_attested`, set when the user checks "I am at least
13…") is wiped before the user returns to the Google-signup modal. The ONLY
durable channel across the redirect is the OAuth `state` config the backend
stores:

- Frontend passes `terms_agree` on the `google_start` URL →
  `session_controller#google_start` stores `config['terms_agree']` (line ~748) →
  `google_signup_candidates` echoes it back (line ~898) → `loadGoogleSignup`
  reads `res.terms_agree` into `googleSignupTerms`.
- **Gotcha:** `googleSignupSubmitDisabled` also requires `age_attested` when
  `!showCoppaConsent`, and `age_attested` is a plain controller prop that the
  redirect reset to `false`. So after the redirect you must **re-derive it**:
  `this.set('age_attested', !!res.terms_agree)` inside `loadGoogleSignup`.
  Otherwise Create Account stays disabled with no visible checkbox to fix it.
- Keep a safety-net `{{#unless this.googleSignupTerms}}` attestation checkbox in
  the modal so a stale/direct session that arrives without the carried flag
  isn't permanently stuck.

**First seen in:** register signup-method split (method chooser → Google/email),
task `2026-07-01-register-signup-method-split.md`.

## Pattern: Shepherd tours must resolve targets at SHOW time, not build time

**Symptom:** A guided-tour step spotlights the wrong place — renders centered
instead of attached, or the popover flies to a corner — intermittently, and
"only when deployed" (works locally). Placements/auto-routing "don't translate
to deployment."

**Root cause (build-time fragility):** the tour builders (`utils/tours/*.js`)
resolved each step's target ONCE at build time and captured the element ref:
`var el = visibleEl(cfg.sel); if(!el) return; attachTo:{element: el}`. Two failure
modes fall out of this:
1. **Late paint** — under deployment latency the board grid / cards / panels
   render AFTER the tour is built, so `visibleEl` returns null → the step is
   dropped or the captured ref is stale (Shepherd centers / mis-places). Fast
   local render hides it.
2. **`visibleEl` uses `offsetParent`, which is ALWAYS null for `position:fixed`
   elements** — so a fixed target (e.g. `.md-tour__trigger`) is reported hidden
   and the step falls back to centered even though it's on screen.

**Fix (all in `utils/tours/shared.js`, applied across every tour):**
- `visibleBySelector(sel)` — "first visible match" by `getBoundingClientRect`
  width/height, NOT `offsetParent`. Works for fixed elements AND skips
  display:none variants of a multi-markup selector.
- `liveTarget(sel, fallbackEl)` — returns a FUNCTION for `attachTo.element`.
  Shepherd v14 re-runs `parseAttachTo` on every `_show()` ("Force resolve … on
  subsequent shows"), and it supports a function element — so the target is
  resolved LIVE each show (survives re-render, picks the on-screen variant),
  falling back to the build-time element so a resolved step never regresses.
- `waitForElement(sel)` — a bounded (`20×75ms`) `beforeShowPromise` that waits
  for the target to be visible before positioning, so a late paint is
  spotlighted instead of centered.
- Where a target can be fixed, gate inclusion on `visibleBySelector` too (home
  header items), not `visibleEl`.

Keep the build-time `visibleEl`/`visibleBySelector` call for ORDERING and the
add/skip decision; only the ATTACH resolution moves to show time.

**Runner note:** `attachTo.element` can now be a function — any code that reads
it (e.g. `guided-tour.js#_onTourResize`) must resolve function/string/element
before measuring.

**Not a deploy-pipeline bug:** verified the Render build does NO minify/
fingerprint (dart-sass, real-file copies, cache clobber), so tour source ships
byte-identical — the divergence was purely this runtime timing race surfacing
under production latency.

**First seen in:** home-tour skip-handoff rendering centered (fixed trigger);
generalized to all tours. Task `2026-07-01` tour work,
traci/styling/styling-updates.

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

## Pattern: board-detail `processButtons` in save path clobbers new `image_id`

**Surface:** Board-detail edit mode → Button Settings / drop image → Save → reopen from My Boards → image gone.

**Symptom:** Tile shows the new picture while editing; after Save (and especially after leaving and reopening), the button has no image again.

**Root cause:** `saveButtonChanges` sets `model.buttons` from `process_for_saving()`, then calls `processButtons()`. On board-detail, `processButtons` is NOT the legacy no-op / display refresh — it runs `_build_from_raw(this._last_raw)`, which does `board.set('buttons', raw.buttons)`. If `_last_raw` still holds the pre-edit snapshot (change_button did not mutate the same array ref), the just-serialized `image_id` is overwritten before `board.save()`.

Originally `processButtons` was an intentional no-op (`8c277037d`) precisely because board-detail owns display via `_build_from_raw`. Rebuilding from stale raw inside the save path undoes that contract.

**Fix:** Before `processButtons()`, sync `state.buttons` / `state.grid` / in-session `image_urls` into `_last_raw`. Also document the contract on `processButtons`.

**Related (create-board-new):** Create must also wait for in-flight `_applyDroppedImageToLabel` uploads (not only OpenSymbols lookups) before baking `_label_images` into `model.buttons`.

**Evidence:** `controllers/user/board-detail.js` `saveButtonChanges`; tests `user-board-detail-save-image-persist-test.js`. Task log: [2026-07-30-ai-board-manual-image-not-persisting.md](./2026-07-30-ai-board-manual-image-not-persisting.md).

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

**Extension (2026-07-06) — VF84 + sidebar user copies:** Schedule `vocal-flair-84` (and other library slugs) via Progress from `UserBoardProvisioner`; keep `SIGNUP_SYNC_SLUGS` empty. An in-request sync copy of VF84 exceeds `Rack::Timeout` (~16s) on staging and 500s signup after the user row is already saved. Prefer VF84 first in `SIGNUP_ASYNC_SLUGS`, then yesno/inflections, then remaining library slugs. Default sidebar still lists system keys in `default_sidebar_boards`, but `User#sidebar_boards` resolves entries to user-owned copies via `parent_board_id` except `keyboard` (`sidebar_system_keys`). Crisis vocabulary copies on signup like other library boards, so the sidebar link should resolve to the user's copy. **Crisis dedup:** auto-add and stored prefs must treat `lingolinq/crisis-vocabulary` and `username/crisis-vocabulary` as the same sidebar slot (match by slug); otherwise merge appends a second crisis entry and resolve turns both into duplicate user-copy links. Home-board pickers should use `findExistingUserCopy` / `links_copy_as_home` (see `assign-vocal-flair-home.js`), not point `preferences.home_board` at the catalog board.

**Evidence:** task logs `2026-07-06-signup-boards-sidebar-copies.md`, `2026-07-28-staging-registration-timeout.md`.

---

## Pattern: custom lingolinq content boards — commit OBZ + `SystemBoardSources.ensure_*`

**Surface:** a public board on the `lingolinq` account that must exist in fresh DBs, appear in `User.default_sidebar_boards`, and optionally copy on signup.

**Fix recipe:** Export with `Converters::LingoLinq.to_obz` → `public/system-boards/<slug>.obz`. Add slug to `SIGNUP_LIBRARY_SLUGS` if signup should copy it. Implement idempotent `ensure_<slug>!` via `from_obz` (mirror `openaac:import_vocabularies` post-import: public root, `generate_stats`, `save!` button set). Wire `db:seed` and optional `rake lingolinq:ensure_<slug>`. Sidebar defaults reference `SystemBoardSources.board_key(slug)` (public key), not the user's copy.

**Evidence:** `lib/system_board_sources.rb`, `public/system-boards/crisis-vocabulary.obz`, task log `2026-06-01-crisis-vocabulary-defaults.md`.

---

## Pattern: curated system boards live on static S3 — prefer over OpenAAC

**Surface:** large gallery / signup OBZs that must not live in git, and must not land as CoughDrop-branded OpenAAC copies on `lingolinq`.

**Fix recipe:**
1. Keep sources in `tmp/seed-boards/` (gitignored). Never commit multi‑MB OBZs.
2. Catalog local → `system-boards/<key>` in `CuratedVocabularySources::CATALOG`.
3. Upload: `rake lingolinq:upload_curated_boards`. Use `UPLOAD_STATIC_S3_BUCKET=lingolinq-staging-static` (or prod) — **not** a leading `STATIC_S3_BUCKET=` before `op run`, because `--env-file` wins over the shell and will reset it to the local/dev bucket. Pattern: `op run --env-file=.env.op.local -- env UPLOAD_STATIC_S3_BUCKET=… bundle exec rake …`.
4. Senner signup set: `SystemBoardSources.ensure_senner_baud!` (S3 primary, `SENNER_BAUD_OBZ_PATH` / `tmp/seed-boards/SennerBaudSocialPages60ll.obz` local fallback). After `from_obz`, call `sync_load_board_keys!` so `load_board.key` matches the board resolved by id (avoids `_N` dead links after key collisions).
5. Gallery curated sets: `rake lingolinq:import_curated_vocabularies` or `SEED_IMPORT_CURATED_VOCABULARIES=1`.
6. OpenAAC import skips filenames in `CuratedVocabularySources.openaac_skip_files`; keep OpenAAC for non-overlapping sets (quick-core-*, vocal-flair-60, etc.).
7. Quick Core **root descriptions** cannot be cleaned with find-and-replace: they contain `app.mycoughdrop.com/example/core-N` sibling links and a sentence that is *about* CoughDrop ("isn't unique to CoughDrop"). Stamp a hand-written overlay after `from_obz` (`lib/quick_core_descriptions.rb`). Child boards that only have `built with CoughDrop` can be rewritten to `built with LingoLinq`. Already-seeded DBs: `rake lingolinq:apply_quick_core_descriptions` (no OBZ re-download). Do not put this rewrite in `Converters::LingoLinq.from_external` — it would alter therapist CoughDrop migrations.

**Evidence:** `lib/curated_vocabulary_sources.rb`, `lib/system_board_sources.rb`, `lib/quick_core_descriptions.rb`, `lib/tasks/system_boards.rake`, `lib/tasks/openaac.rake`; task logs `2026-08-13-curated-s3-system-board-seeds.md`, `2026-08-20-quick-core-import-descriptions.md`.

**Collision note (2026-08-14):** Senner OBZ boards can occupy bare keys like `lingolinq/core-60`. OpenAAC Quick Core roots also import as `core-N`, while signup expects `lingolinq/quick-core-N`. Seed order is Senner then OpenAAC. After Senner import, `relinquish_bare_core_roots!` moves bare `core-N` → `senner-baud-core-N` (child keys like `core-60-when` stay shared). After each `quick-core-N.obz` import, `rekey_quick_core_root!` sets the root to `quick-core-N` and `sync_load_board_keys!` runs.

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

**Evidence:** task log `2026-05-31-register-login-fullheight-bg.md`; board-picker instance in `2026-06-12-board-picker-bg-and-tabs.md`. SEARCH-PAGE instance (2026-07-15): /search is top-level (no `.index.with_user`), bg was on `.ub-find-board-page` wrapper → short. Fixed the same way: bento gradient on `#within_ember:has(.page-footer):has(.ub-find-board-page)` + transparent `#content:has(.ub-find-board-page)` + transparent wrapper. See `2026-07-15-search-my-boards-empty-self-userid.md`.

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
`toggle_folder_colored_face`, `toggle_soft_borders`,
`toggle_hide_speak_bar`, `set_speak_menu_item_hidden`)
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

**Fix recipe (pre–Ember 5):** In `raw_events` `button_select`, skip speak-mode `buttonSelect` for `source === 'click'` on `.md-board-detail-grid` when `lastReleaseEvent.type` is not a touch event. Keep all non-`'click'` sources (`dwell`, `keyboard`, `longpress`, etc.) and scanner's direct `buttonSelect` send unchanged.

**Ember 5 regression (2026-06-22):** The defer-to-Ember `{{on "click"}}` path silently stopped working — `preventDefault` on `mouseup` cancels the native click, and `dispatchPassThroughClick` does not reach Ember 5 co-located classic component listeners (runtime-verified). **Fix:** Revert defer; always route speak-mode releases through `buttonSelect`. `preventDefault` on `mouseup` still suppresses duplicate native click, so no double speak-bar add.

**Evidence:** `app/frontend/app/utils/raw_events.js`, `app/frontend/app/components/board-detail-grid.hbs`; task logs `2026-06-09-board-detail-speak-bar-double-add.md`, `2026-06-17-ember5-upgrade.md`.

---

## Pattern: board-detail chrome + speak header — route `controller.send`, not synthetic click

**Surface:** board-detail page chrome (sentence bar tools, options menu, sidebar toggle, local home/back) and application `#speak` header (home, back, clear, backspace, speak options) while `#within_ember` carries `.board-detail-view`.

**Root cause:** Same Ember 5 failure as the grid: `preventDefault` on `mouseup` cancels the browser click, and `dispatchPassThroughClick` does not reach `{{on "click" (fn this.ctrlAction …)}}` on co-located classic templates (runtime-verified: pass-through logs fire, zero `ctrlAction` logs).

**Fix recipe:** In `raw_events.js`, `boardDetailChromeRelease()` maps pointer releases inside `.board-detail-view` (excluding grid `.button` targets) directly to `controller.send`:
- Application speak header IDs → `appState.controller` (`home`, `clear`, `backspace`, `speakOptions`, …).
- Board-detail controls → `editManager.controller` via class/id maps for stable chrome (sentence bar, options toggle, sidebar) and `data-bd-action` / `data-bd-arg` on menu/sidebar buttons (100+ `ctrlAction` targets).

Keep `{{on}}` + `ctrlAction` in templates for keyboard/a11y and non–raw_events paths; raw_events is the sole mouse/touch path in speak mode.

**Ember 5 post-codemod regression (2026-06-23):** After fixing `(fn this.ctrlAction …)` → `(this.ctrlAction …)`, Ember `{{on}}` works again on mouse. `boardDetailChromeRelease` on `mouseup` still runs first, then the native `click` reaches Ember — toggles fire twice (options ⋮ menu opens then immediately closes). **Fix:** mirror grid defer — `defer_board_detail_chrome_click_to_ember` skips `preventDefault` and `boardDetailChromeRelease` for speak-mode mouse on chrome targets; touch/dwell still route through `boardDetailChromeRelease`.

**Evidence:** `app/frontend/app/utils/raw_events.js` (`defer_board_detail_chrome_click_to_ember`), `application.hbs`, `board-detail.hbs`; debug session `bcf18d` (2026-06-22).

---

## Pattern: board-detail edit toolbar — same Ember 5 routing as chrome, plus `ignored_region`

**Surface:** per-button edit toolbar on symbol cards in edit mode (`board-detail-grid` co-located component).

**Root cause:** Toolbar buttons are in `ignored_region` so `touch_release` skips `element_release` and expects native click → co-located `{{on "click"}}`. Ember 5 never delivers that click (same co-located classic component failure as speak chrome). Card body taps still work via `button_select` → `controller.send('buttonSelect')`.

**Fix recipe:** Mark each toolbar control with `data-bd-edit-action="edit_button_settings"` (or `*_by_id` for portal dropdown). In `raw_events.js`, `boardDetailGridEditActionRelease()` resolves the action on pointer release and calls `editManager.controller.send`.

**Evidence:** `raw_events.js`, `board-detail-grid.hbs`, `2026-06-23-board-detail-edit-toolbar-clicks.md`.

---

## Pattern: co-located modal `{{on "click" (fn this.ctrlAction …)}}` — use `(this.ctrlAction …)`

**Surface:** `speak-menu`, `button-settings`, route templates (`edit-sound`, etc.), and other co-located classic modals migrated to `ctrlAction` + `{{on}}` during Ember 5 upgrade.

**Root cause:** `ctrlAction` returns a handler function. `(fn this.ctrlAction "x")` invokes `ctrlAction("x", …)` at click time and discards the returned handler, so the action never runs. Under speak mode, `raw_events` `dispatchPassThroughClick` still needs a bound handler — pass-through logs fire but close no-ops. Use `(this.ctrlAction "x")` (bind at render) for `{{on}}`, `modal-dialog` `action`/`opening`/`closing`, and `button-listener` `buttonEvent`. Classic `{{action "x"}}` also works; pair with `modalDialogClickRelease()` when pointer synthesis is suppressed.

**Evidence:** `speak-menu.hbs`, `button-settings.hbs`, `raw_events.js`; task logs `2026-06-23-board-detail-edit-toolbar-clicks.md`, `2026-06-26-speak-menu-modal-close-fix.md`.

**Classic component methods on `{{on}}`:** `{{on "click" this.foo}}` passes `foo` unbound — at runtime `this` is the DOM element, so `this.toggleProperty` / `this.get` throw. During Ember 5 `{{action}}` → `{{on}}` migrations, use `actions: { foo }` + `(this.ctrlAction "foo")` (see `password-field.js`); do not assign per-handler closures on the instance in `init()`.

---

## Pattern: board-detail edit-mode panel chrome never routed (speak-only gap)

**Surface:** Done Editing, Discard, left/right edit panels on `user.board-detail` edit route.

**Root cause:** `boardDetailChromeRelease` and `find_selectable_under_event` chrome wrapping were gated on `speak_mode` only. In `edit_mode`, `element_release` only handled grid symbol cards; panel clicks had no path to `controller.send`. Buttons already had `data-bd-action`; resolver was fine.

**Fix:** Extend chrome detection to `edit_mode`; call `boardDetailChromeRelease` / `boardDetailChromeReleaseFromEvent` from edit-mode release paths; exclude `.modal-content` from chrome routing; `modalDialogClickRelease` pass-through for modal buttons; `dispatchPassThroughClick` fallback for controls without `data-bd-action`.

**Evidence:** `raw_events.js`, `2026-06-23-board-detail-edit-panel-clicks.md`.

---

## Pattern: `EXTEND_PROTOTYPES: false` — Ember Array methods on native arrays

**Surface:** speak mode button taps, speak-bar backspace, any `utterance.add_button` path.

**Root cause:** `config/environment.js` sets `EXTEND_PROTOTYPES: false`. `rawButtonList` / `working_vocalization` are native arrays. Calls like `pushObject`, `insertAt`, `removeAt`, `popObject`, `pushObjects` throw (`… is not a function`), aborting `activate_button` after entry — silent failure (no console error if uncaught in async path). Folder navigation still works because it returns before `activateButton`.

**Fix recipe:** Use native array ops (`push`, `splice`, `pop`, `concat`) and `this.set('rawButtonList', nextList)` so `rawButtonList.[]` observers fire. Same class of bug as `.uniq()` on `board.js` and `pushObjects` on `user/index`.

**Evidence:** `app/frontend/app/utils/utterance.js` (`add_button`, `backspace`); runtime logs `post-fix4` (`add_button done`, `btnListLen` 1→7); task log `2026-06-17-ember5-upgrade.md`.

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

### JSON bundle import: button sounds missing / silent after import

**Symptom:** CoughDrop JSON-bundle import brings boards/images, but buttons with
recorded sounds (rimshot, drumroll, laughter, sigh) don’t play.

**Root causes (all verified):**
1. Non-empty stub `sounds: [{id}]` skipped `sound_urls` synthesis (`coalesce_media`
   only synthesized when `sounds.empty?`), so URLs never reached `ButtonSound`.
2. `normalize_sound` dropped `data_url` / didn’t `encode_import_url`.
3. `upload_to_remote` required `Content-Type: audio/*`; S3 often returns
   `application/octet-stream` for `.mp3` → treated as fetch failure.
4. Sound S3-failure path had no fallback (images store `data_uri` / CDN URL);
   left `url: nil`, `pending: true`, `errored_pending_url` set.

**Fix recipe:** Fill stub media urls from `board.sound_urls` / `image_urls`;
normalize sound urls; accept octet-stream for audio-looking URLs; on S3 failure
for sounds, keep the already-fetched source URL playable (no large audio
`data_uri` in DB). Re-import affected boards after deploy.

**Evidence:** `lib/converters/api_json_bundle.rb`, `Uploadable#store_downloaded_file_fallback!`,
`acceptable_remote_content_type?`; task log `2026-08-04-json-bundle-import-sounds.md`.

### JSON bundle import: custom photos replaced by OpenSymbols after import

**Symptom:** Imported custom button images (e.g. teacher photos) display
correctly at first, then swap to stock symbols (e.g. dart for "Miss") minutes
later or after reload. “Default symbols” in preferences does **not** restore
them by itself.

**Root cause (two layers):**
1. `ButtonImage#ensure_library_url_for_skin!` (slow job) searches OpenSymbols by
   label and stores `library_url_for_skin` / `library_alternates`.
2. `JsonApi::Board` set `image_urls[id] = skin_url || url`, so the library match
   became the **primary** board-detail URL even when
   `preferred_symbols=original` (“Default symbols”). Board-detail paints that
   primary key; it does not prefer `id-original`.

**Fix:** `Converters::LingoLinq#from_external` always sets `preserve_source_image`
on new `ButtonImage` rows — shared by JSON-bundle, `.obf`, and `.obz`. That
skips label-search enrichment. Serialization must not prefer `skin_url` when
the user prefers original/default. For preserved images, `skin_capable_url`
ignores enrichment `library_url_for_skin` swaps but still skins when the
**imported URL itself** is already a skinnable `/libraries/` asset. Re-import
after deploy for the import flag; Default symbols + JSON fix helps
already-enriched boards without re-import.

**Evidence:** `lib/json_api/board.rb`, `lib/converters/lingo_linq.rb`,
`app/models/button_image.rb`, task logs `2026-06-13-json-bundle-import.md`,
`2026-08-10-preserve-imported-board-images.md`.

### Speak vs edit: Default symbols still showed OpenSymbols in speak mode

**Symptom:** Board edit grid shows imported/source images; speak mode shows
OpenSymbols/ARASAAC matches despite Preferred Symbols = Default (`original`).

**Root cause:** Speak-mode `board-detail` builds `image_map` with
`img.skin_url || img.url`. Enrichment stored in `library_url_for_skin` becomes
`skin_url` and wins. Edit mode uses Ember `Button` + `image.best_url`, which
follows the Image `url` when preferred is original.

**Fix:** JsonApi omits `images[].skin_url` (and does not prefer it in
`image_urls`) when preferred is original; board-detail only applies `skin_url`
when `_preferred_symbols` is a library id. Important: `JsonApi::Image.as_json`
already stamps `skin_url`, so `JsonApi::Board` must `i.delete('skin_url')` under
original prefs — merely skipping the re-assign leaves the Image-layer value and
speak clients still paint enrichment matches.

**Gotcha:** `.eslint-todo` fingerprints include line numbers. Adding comment
lines above a one-line logic change in a grandfathered file makes every later
finding look "new". Keep board-detail edits line-count-neutral (EOL comments).

**Evidence:** `lib/json_api/board.rb`, `controllers/user/board-detail.js`
`_build_from_raw`; task logs `2026-08-10-preserve-imported-board-images.md`,
`2026-08-10-preserve-imported-images-ci-failures.md`.



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

## Gotcha: tagless GuidedTour — one init, host-gated pending consumers, body is not a scroll target

**Surface:** post-"Pick this Board" speak tour (and board-detail edit tour).
**Symptoms:** Skip tour does nothing; X dismisses but navigates back to
`/board-picker`.

**Root causes (all required together):**
1. **Duplicate `init` on a tagless component** — Ember classic `.extend({ init })`
   keeps the *last* definition. A second `init` (Ember 5.12 upgrade) that only
   wired `onStartTour` overwrote the pending-flag consumers. `tagName: ''` means
   `didInsertElement` never runs; observers don't fire for already-true flags →
   the board-detail host never auto-started the speak tour.
2. **Navbar stole the start during `empty_header` race** — navbar `<GuidedTour />`
   stays mounted until `currentBoardState` lands. When `current_route` becomes
   board-detail first, its `tourKey` is already `board_detail_speak_*`, so it
   consumed the pending flag and started the tour, then was destroyed when
   `empty_header` flipped. Gate speak/edit pending consumers on `@speakHost` /
   `@editHost` so only the board-detail hosts start those tours. Never run home
   `_scheduleAutoOpen` (afterComplete → board-picker) from those hosts.
3. **Centered steps use `document.body` as `step.target`** — `_scrollHighlightIntoView`
   must early-reveal when there is no real `attachTo` (or target is body/html);
   otherwise `md-tour__step--revealing` keeps Skip/X unclickable.
4. **Defense:** home auto-open `afterComplete` handoff must no-op when
   `current_route` is already `user.board-detail*`.

**Evidence:** `guided-tour.js`; task log
`2026-07-31-speak-tour-skip-close.md`.

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

**Corollary — `--merge` never PRUNES either.** The same additive-only loop
(`new_json[key] ||= string unless skip_string`, i18n_generator.rb ~L322) copies
every key already in a locale file forward unconditionally. So when you DELETE a
string from the source tree, `--generate` correctly drops it from en.json but it
survives forever in all 12 non-English locales as an orphan. Removing a
user-facing feature is therefore never finished by regenerating: grep the key
across `public/locales/` and delete it yourself.

Do that with Ruby `JSON.parse` → `delete` → `JSON.pretty_generate` rather than
`sed` — that is the exact serializer the generator writes with, so a no-op
round-trip is byte-identical (verify this first) and the diff contains only the
removed lines with no incidental reformatting. `sed` on these files risks a
dangling comma when the key is last in its object.

**First seen in:** [2026-06-15-board-detail-tour-tools-reword.md](./2026-06-15-board-detail-tour-tools-reword.md);
prune corollary in [2026-08-07-remove-shrink-labels-to-fit-toggle.md](./2026-08-07-remove-shrink-labels-to-fit-toggle.md)

---

## Gotcha: a server-side guard on payload SHAPE must be written against what Ember actually sends

**Surface:** any controller branch that inspects the request payload to decide
authorization — "allow this weaker role, but only when they're changing X".

**Symptom:** specs pass, the real UI 400s. The branch's supervise-only home-board
guard required the payload to contain only `preferences`:
`return false unless (top_keys - ['preferences']).empty?`.

**Root cause:** Ember Data's `user.save()` serializes the **entire record**, not
the dirty attribute. Captured off the running app, one home-board pick PUTs
`user[user_name]`, `user[user_token]`, `user[link]`, `user[name]`, `user[email]`,
`user[description]` and ~20 more alongside `preferences`. No real request can
ever satisfy an "only this key" test. The spec passed because it hand-built a
preferences-only payload — it encoded the assumption instead of testing it.

**Fix recipe:** make the guard depend on what must be PRESENT, then **discard**
everything else server-side rather than requiring the client to have sent
nothing else. Safety comes from the slice, not from the shape test. Keep the
deeper model-layer check (here `process_home_board`'s view/share gate) as the
real boundary.

**Also:** `!!value` is not a presence test for a Hash — `{}` is truthy in Ruby,
so an empty `home_board` sailed through and persisted `preferences.home_board = {}`,
leaving the user worse off than the `nil` they started with. Require the field
you actually need (`home_board['id'].present?`).

**When writing the spec:** capture a real payload first (Puppeteer
`page.on('request')` → `r.postData()`) and use that shape. If the spec's payload
is hand-written and tidy, assume it is lying.

**First seen in:** [2026-08-07-pick-for-home-ui-e2e.md](./2026-08-07-pick-for-home-ui-e2e.md)

---

## Gotcha: raw_events synthesizes clicks in modals — modern `{{on "click"}}` handlers then fire TWICE

**Surface:** any button inside `.modal-content` wired with `{{on "click"}}`
(rather than classic `{{action}}`).

**Symptom:** the handler runs twice per click. Invisible for idempotent actions
(close), destructive for anything that creates: the board-picker CTA copied a
board twice, the second `POST /boards` failed `400 board key already in use`, and
the user saw an error *after* a copy had already been made.

**Root cause:** `modalDialogClickRelease` (`utils/raw_events.js`) synthesizes a
pass-through click on `mouseup` so classic `{{action}}` components — which don't
receive pointer events under Ember 5 — still work. `preventDefault()` on a
*mouseup* does NOT suppress the click event that follows, so a modern `{{on}}`
listener gets both. Proven by tagging the events:
synthetic = `{isTrusted:false, pass_through:true}`, native = `{isTrusted:true,
pass_through:false}`.

**Fix recipe:** skip the synthetic dispatch when the browser is certain to
deliver a real click to that same element — `event.type === 'mouseup' &&
el.contains(event.target)`. Touch, dwell, eye-gaze and scanning produce no native
click and must still get the pass-through, so do not remove the synthesis
outright. `passThroughUnresolvedChromeClick` in the same file already had this
guard, scoped to `.md-board-collection`.

**Diagnostic that settles it in one run:** attach a capture-phase listener to the
element and log `e.isTrusted` per event. Two events with different `isTrusted`
means dual dispatch, not a double user click.

**First seen in:** [2026-08-07-pick-for-home-ui-e2e.md](./2026-08-07-pick-for-home-ui-e2e.md)

---

## Gotcha: `Utils.uniq(list)` with no comparator used to throw — and this repo has Puppeteer, not Playwright

**Two traps that cost a full debugging session:**

**1. `Utils.uniq` (utils/misc.js)** took `(list, compare)` and dereferenced
`compare.toString()` before checking its type, so a one-argument call threw
`Cannot read properties of undefined (reading 'toString')` the moment the list was
non-empty. `User#org_board_keys` was the lone one-arg caller; because
`edit_manager#copy_board` reads `org_board_keys` before copying, this killed the
ENTIRE board-picker pick flow with a generic "we couldn't set up your board"
toast and no network activity at all. Fixed to default to identity. (Two
`persistence.js` call sites had been passing `function(i) { return i; }` to dodge
it — a workaround in the codebase is a hint the primitive is wrong.)

**2. Browser automation:** this repo commits **puppeteer** (`package.json`),
NOT playwright. A committed QA script that does `import { chromium } from
'playwright'` cannot run here — which is how a flow ships "verified" without ever
having been executed. Check the import against `package.json` before trusting any
E2E script's green/red status.

**3. Background jobs:** flows that go through `Progress.schedule` (board copy →
`copy_board_links`) need a **Resque worker** running. Rails + Ember alone leaves
the progress pending forever and the completion callback never fires, which looks
exactly like a frontend hang.

**First seen in:** [2026-08-07-pick-for-home-ui-e2e.md](./2026-08-07-pick-for-home-ui-e2e.md)

---

## Gotcha: `allowed?` RENDERS on denial — never put two of them in an `||`

**Surface:** widening any authorization check in `app/controllers/api/*`
to accept a second permission ("also let supervisors do this").

**Symptom:** the obvious edit — `allowed?(user,'edit') || allowed?(user,'supervise')`
— produces `AbstractController::DoubleRenderError`. Both the DENY path
(clean 400 becomes a 500) and, worse, the newly-ALLOWED path break: the
action runs to completion, persists its record, then dies rendering.
A supervise-only board create left an orphan board behind and 500'd.

**Root cause:** `allowed?` is not a predicate. On denial it calls
`api_error 400, res` and *then* returns false
([`application_controller.rb:300`](../../app/controllers/application_controller.rb#L300)).
So the first failing call has already rendered, whatever the second one
answers.

**Fix recipe:** use the PURE predicate `user.allows?(@api_user, '<perm>')`
for every check but one, and let a single `allowed?` remain last to
produce the error render:

```ruby
return unless user.allows?(@api_user, 'supervise') || allowed?(user, 'edit')
```

Invariant: **at most one `allowed?(user, …)` call per expression.**
`allows?` is the model-side check on the permissions concern and takes
the actor as its first argument — note the receiver/argument order is the
inverse of `allowed?`. `users_controller#update` already used this form
correctly one screen away from the site that broke.

**Also:** when widening, scope to what the feature actually needs rather
than to the permission name. The board-picker only needed to COPY a board
for a communicatee, and `models/board.js create_copy` always sets
`parent_board_id` — so gating on `parent_board_id.present?` enabled the
flow while leaving "supervise-only cannot author a fresh board for a
supervisee" intact. Check the existing deny-path specs before choosing the
key: both of them posted *without* `parent_board_id`, which is what made
the narrow gate free.

**`allows?` is NOT a drop-in substitute — pass the scopes.**
`allows?(user, action, relevant_scopes=nil)` falls back to the RAW
`user.permission_scopes` (permissable.rb:72), but `allowed?` passes
`api_permission_scopes`, which NORMALIZES: blank (integration / dev-key
devices) and a legacy lone `'*'` both become `'full'`. Supervision rules
require `'full'`, so a bare `allows?` silently DENIES callers that
`allowed?` would allow. Always
`user.allows?(@api_user, 'supervise', api_permission_scopes)`.
This is easy to miss because the bare form reads fine and passes specs —
the divergence only shows on integration tokens.

**Sweep before you assume it's one site:**
`grep -rn "allowed?(.*) || allowed?(" app/controllers/`
Also grep `allows?(@api_user` for bare calls missing the scopes argument.

**Proving it, rather than pattern-matching it:** the reachable trigger is
a `'none'`-scoped token (permissable.rb:74 deliberately does not widen
`['none']` with `'*'`, so every permission resolves false). Write the
regression spec, `git stash` the fix, run it against the original — you
want the actual `DoubleRenderError` with a stack line in YOUR file before
you claim the bug. `logs_controller#index` already carried this fix with
an explanatory comment while `#show`/`#eval_pdf` did not, which is worth
remembering: **when you find one of these, grep the rest of the same file
before concluding you've found the only one.**

**First seen in:** [2026-08-07-allowed-double-render-and-supervise-scope.md](./2026-08-07-allowed-double-render-and-supervise-scope.md)

---

## Pattern: removing a user-facing toggle has an artifact checklist — source removal is only half of it

**Surface:** deleting (or neutralizing) any preference switch — a Text Settings
toggle, a feature checkbox, a settings row.

**Symptom:** the switch is gone from the UI and every grep of
`app/frontend/app` is clean, so the removal reads as done — but the i18n key
lingers in 12 locale files, and any `LEARNINGS.md`/doc entry naming the removed
action function is now pointing at something that no longer exists.

**Checklist** (all verified by grep, not assumed):

1. Template markup + `data-*-action` hook
2. Controller property + `toggle_*` action
3. Component `@arg` and any `--modifier` body class it drove
4. Observers on the property (`observer('shrinkLabelsToFit', …)`)
5. Consumers gating on the modifier class (here: `label-field.js` checked
   `.md-board-detail-grid--shrink-labels` before re-fitting one label)
6. The behavior gate itself in the util
7. SCSS rules scoped to the modifier class
8. Server-side preference whitelist (often absent — LingoLinq stores
   `preferences.*` as an open blob, so nothing to remove in Rails)
9. **`public/locales/*.json` in all 12 non-English locales** — see the prune
   corollary above; the generator will not do this
10. Docs/LEARNINGS entries that cite the removed function as a live example

Steps 9 and 10 are the ones that get missed, because 1–8 are what a grep of the
app source shows you and they come back clean.

**Judgment call worth recording:** a toggle whose behavior became unconditional
should be REMOVED, not left in place. On an AAC product a switch that controls
nothing is a support burden — but note the stored `preferences.<key>` value on
existing users is deliberately left alone; it's an inert key in an open blob, and
deleting user data to tidy a schema is the riskier half of the trade.

**First seen in:** [2026-08-07-remove-shrink-labels-to-fit-toggle.md](./2026-08-07-remove-shrink-labels-to-fit-toggle.md)

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

---

## Pattern: Modernizing a legacy `la-*`/Bootstrap modal → the `md-modal-*` family

**When:** a modal still uses the old `la-<name>-modal-*` wrapper + Bootstrap
`form-horizontal`/`col-sm-*` grid (e.g. record-note), while newer modals (quick-assessment)
use the shared `md-modal-*` system.

**Recipe:**
- Reuse the shared classes — they're already styled: `modal-header md-modal-header`,
  `md-modal-icon-circle` (+ a `md-<name>-icon` tint), `md-modal-title`, `la-modal-close`
  (shared SVG × close — keep it), `modal-body md-modal-body`, `md-modal-form`,
  `md-modal-field` + `md-modal-label`, `modal-footer md-modal-footer`, `md-modal-btn`
  (`--cancel`/`--primary`/`--secondary`), `md-modal-check`/`md-modal-check__input/__label`.
- Add only a small `md-<name>-*` block for the bits unique to that modal; mirror
  **quick-assessment** (`.md-quick-assess-*`, app.scss ~79839) for the design language
  (verdigris icon tint `rgba($brand-verdigris,0.14)`, attached-dropdown, flow-anchored
  `*-list` menu, steppers).
- **Gotcha:** a `bound-select` / `.bound-select__list` inside the modal clips on the
  body's `overflow:hidden` → set it `position: static` (flow-positioned) so it pushes
  the form down (styling-recurring-problems.md #1).
- **Gotcha:** the goal-status emoji is the `faces.png` sprite, scoped by `.face_button
  .face` (app.scss ~8748). It only renders if the button keeps the `face_button` class
  (it comes from the controller's `button_display_class`, which also carries `btn-primary`
  for the active one — style `.md-<name>-status.btn-primary` for the selected look).
- **Don't blindly delete** the old `.la-<name>-*` rules: some (e.g.
  `.la-record-note-cancel-btn`/`-save-btn`) are reused by OTHER modals (assign-lesson).
  Check usages first; leaving inert rules is safer than a cross-modal regression.

## Image optimization (only ImageMagick available; no pngquant/optipng/pngcrush)
- This box has **only `convert` (ImageMagick)** for image work — `pngquant`, `optipng`,
  `pngcrush`, `zopflipng`, `magick` are all absent. Plan optimization around `convert`.
- **Never use `PNG8:` for icons with soft/anti-aliased edges** — it forces **1-bit
  (binary) alpha**, so smooth edges go jagged (verified: `-channel A -separate -format %k`
  dropped to 2 alpha levels). Instead quantize colors WITHOUT the `PNG8:` prefix:
  `convert in.png -strip -resize 256x256 -colors 256 -define png:compression-level=9 out.png`
  keeps 8-bit alpha (~32 levels) while still cutting size dramatically (212KB→24KB, ~9×).
- **Verify quality numerically**, don't guess: alpha richness via
  `convert f.png -channel A -separate -format "%k" info:` (more = smoother edges) and total
  colors via `identify -format "%k" f.png`. Then eyeball the result with the Read tool.
- **Size for the display use, with retina headroom**: an 88px icon → 256px covers ~3×.
- **Images must live in BOTH trees** to render on Ember and Rails:
  `app/frontend/public/images/` (Ember source → built into `dist/images/`) AND
  `public/images/` (Rails). SCSS `url(../images/<name>.png)` resolves against the compiled
  CSS location in each. `dist/` is a gitignored build artifact — don't hand-edit it.
- When swapping an asset, **re-check filters tuned for the OLD asset** (e.g. a
  `filter: brightness(1.15)` added to lift a dull grayscale image will wash out a new
  vivid color image — remove it rather than carry it over).

## Cloning one dashboard card's styling onto another (e.g. Org card → Rooms card)
- **Reuse the source card's CSS classes in the new markup** (`.md-card--rooms__top`,
  `.md-rooms__grid`, `.md-room-card`, `.md-rooms__count`, `.md-rooms__all`) rather than
  duplicating rules. Global (unscoped) classes work as-is; only the rules **scoped under
  the source card** (`.md-grid .md-card.md-card--rooms .md-room-card`, …__head, divider,
  :hover) need the new card's selector appended.
- **Grid-area names ≠ section keys.** `dashboard_sections.js`'s `AREA` map renames some:
  `org → org_mgmt`. The card's `grid-area` must match the `AREA` value, or it won't land
  in the grid. Check `AREA` before assuming the class name equals the area name.
- **Section background needs (0,3,0) specificity.** The base `.md-grid .md-card { background … !important }`
  is (0,2,0); a card section rule must be `.md-grid .md-card.md-card--X` (0,3,0) to win
  (Rooms does this; mirror it for the clone).
- **Card-as-button → card conversion is low-risk for old CSS:** most legacy rules are
  `.md-card--<name>.md-card--as-button …`-qualified, so they go **inert automatically**
  once the element drops `md-card--as-button`. Only remove the rules that match the bare
  `.md-card--<name>` and conflict (e.g. an old `display/justify/min-height` layout rule).
- **Match peer buttons, don't assume a shared rule covers them:** Rooms' "View all" uses
  the *generic* `.md-btn--primary` — Rooms is NOT in the speak/boards/caseload/org
  denim-pill rule. To match Rooms, drop the clone from that rule rather than add Rooms in.

## Boards strip: dashboard vs boards-page are DIFFERENT components
- The dashboard Boards card and the actual boards page render board tiles with
  **different** markup/classes — they do NOT share a component:
  - Dashboard: `components/dashboard/authenticated-view.hbs` → `.md-strip` / `.md-strip__item`
    / `.md-strip__home-badge` / `.md-strip__heart` (data from the `previewBoards` computed).
  - Boards page: `components/available-boards-section.hbs` → `.ub-boards-page__board-item*`
    / `.ub-boards-page__board-item-home-badge` (nested SCSS `&__board-item-home-badge`
    ~app.scss:64196, NOT a flat selector — grep the `&__…` fragment, not the full class).
  - So a "make X on the boards page match the home page" request means editing BOTH
    selectors, not one shared rule.
- The dashboard strip's HOME-board tile is flagged by `isHome`; the system Crisis/
  Emergency tile is appended in `previewBoards` (key ends `crisis-vocabulary`). To target
  it in CSS, add a flag there (`isEmergency`) + a template class — there's no built-in one.
- Gentle-vs-Focused board sizing: dashboard rules are `.md-grid--dashboard …` (BOTH
  layouts). To change Gentle only, add `.md-grid--layout-gentle …` rules AFTER them
  (equal specificity → source order wins); the supervisor/admin thumb is a (0,4,0)
  `.md-grid--dashboard.md-grid--with-caseload/--with-org-mgmt` rule, so a Gentle override
  of the thumb must also be (0,4,0) to win.
---

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

## Gotcha: controller AI endpoints must call `ai_feature_enabled_for?` before any shared-cache short-circuit (#762)

`feature_enabled_for?` is rollout only. `ai_feature_enabled_for?` also enforces org
`disable_ai_features`, COPPA, EU under-16, and user prefs. A controller that gates with the plain
flag and then returns a warmed `AiFocusWordSet` (keyed only on scrubbed prompt + locale + core
flag — no user/org scope) skips every consent check on a cache HIT; the generator's own
`ai_feature_enabled_for?` only runs on MISS. Specs that only exercise the miss path pass against
the broken code. Mutation-test cache-hit 403 examples: revert the controller gate, confirm red
(200 + cached words), restore, confirm green. Mirror `boards_controller#generate_labels` for the
gate + Article 50 backstop (`article_50_disclosure` is AVAILABLE-only — do not enable it just to
exercise the backstop). See `docs/task-management/2026-08-07-focus-words-consent-gate.md`.

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

## Gotcha: AI feature flags are rollout; prefs turn AI on — Ember UI must AND both

`frontend_flags_for` / Ember `feature_flags` do **not** consult user AI prefs. Server egress uses
`ai_feature_enabled_for?` (flag + org + COPPA + EU + `user_pref_allows_ai?`). If Ember only checks
`appState.feature_flags.ai_*`, the UI offers generate/predict while the API 403s after the user
turned prefs off. Do not bake prefs into the flags payload. Mirror pref semantics in
`app/frontend/app/utils/ai_feature_gate.js` (`prefAllowsAi` / `aiFeatureEnabled`) and gate board-gen /
word-prediction UI through it. Master `nil` = grandfather allow; master false = block; master true
= per-feature must be true for `USER_PREF_AI_FEATURES`. See
`docs/task-management/2026-07-14-eu-ai-prefs-parental-consent.md`. (2026-07-15)

## Gotcha: Generate-with-AI UI opt-in is explicit; server grandfather is not

`prefAllowsAi` still grandfathers a nil master (the generate_labels API can succeed). The
create-board chooser uses `prefExplicitlyEnabled` / `boardGenerationEntry` so unset prefs open
`enable-ai-features` instead of letting the user fill the form and then see "Feature not
available". Do not fold that stricter check into `aiFeatureEnabled` — other AI UI still relies on
grandfather. Register the modal in `modal-container.hbs` **and** `convertedModals` (same trap as
`eu-ai-parental-consent`). Cancel is `modal.close(false)`, which **rejects**; callers must
`.then(stay, stay)` or cancel looks like an unhandled error. EU under-16 without consent opens
`eu-ai-parental-consent` instead of self-enable.

The create-board chooser (`.nb-create-chooser`) is an in-page `position:fixed` overlay at
z-index 6000, above Bootstrap `.modal` (1050). Opening `enable-ai-features` (or EU consent)
while the chooser is visible paints the system modal behind the chooser, and the chooser's
`backdrop-filter` blurs it. Hide the chooser before `modal.open`, restore it if the user
does not proceed — same pattern as `choose_paste_html` / `choose_json_bundle`. Do not raise
global `.modal` z-index to beat the chooser.

`applyAiFeaturePrefs` must only write `true` for requested keys (master + the triggered feature).
Writing `false` for the other `USER_PREF_AI_FEATURES` overwrites siblings that were already on
(e.g. word prediction). Clone the whole `preferences` object before `user.set('preferences', …)`
so Ember Data `attr('raw')` dirties. Apply runs before `user.save()`, so Cancel and a rejected
save must `rollbackAttributes()` or the next Generate with AI skips the popup with in-memory prefs
on and the API can still 403. See
`docs/task-management/2026-08-17-ai-enable-popup.md`. (2026-08-17)

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

### Ember 5: classic `extend` callback props need `init()` arrow bindings

On `Controller.extend` / `Component.extend`, methods passed as **callback props** to child components (e.g. `opening-observer` `opening`/`closing`, `@onClose`, yielded `closeDrawer`) lose `this` when the child invokes them. Ember 5 dev asserts if you use `(fn this.method)` with unbound prototype methods. Fix: assign arrow functions in `init()`, and **capture services/locals in closure** — do not reference `this.appState` (or other injected services) inside the arrow body when the callback is passed as a component arg; Ember's `fn` wrapper still asserts on `this.*` access:

```javascript
init() {
  this._super(...arguments);
  var appState = this.appState;
  this.opening_index = () => { appState.set('index_view', true); };
}
```

`{{on "click" this.method}}` on the same component often still works; the issue is specifically **callbacks passed to children**. Store service must re-export `ember-data/store` (not `@ember-data/store`) until full legacy-compat migration. Custom `transforms/raw.js` must use **default** import: `import Transform from '@ember-data/serializer/transform'` — `{ Transform }` is undefined (`Transform.extend` crash on user fetch). See `docs/task-management/2026-06-17-ember5-upgrade.md`.

---


## Gotcha: the custom `{{and}}` helper is 2-ARG ONLY — extra operands are silently dropped

`app/frontend/app/helpers/and.js` is `helper(function([a, b]) { return !!a && !!b; })`. It
destructures exactly the first TWO positional args. A 3-operand `(and a b c)` compiles and runs
with **no error**, but `c` is never evaluated — the condition collapses to `a && b`. This bit the
supervisor dashboard hero: `(and supporter_role (is-equal activeTab "home") (is-equal effectiveLayout
"gentle"))` dropped the layout check, so the Gentle hero leaked onto Focused view.

- **Fix pattern:** nest — `(and a (and b c))` — or add a single combined computed on the component.
- **Detection:** `grep -rEn '\(and ' app/frontend/app/templates/` then eyeball any call with >2
  operands (watch for nested `(is-equal …)`/`(or …)` that each count as one operand). There are a few
  pre-existing 3-operand `(and …)` calls in the tree that are also latent — they only "work" when the
  dropped operand doesn't change the result.
- Same caution applies to any other custom boolean helper; check its ar\-ity before passing 3+ args.

## Gotcha: supervisor `currentUser.supervisees` is REFETCHED + overwritten at ≥10 — per-supervisee fields must also live on the `/supervisees` index serializer

Per-supervisee data the dashboard needs (e.g. `org_status` for the "Communicators Need Attention"
card) is set in `lib/json_api/user.rb`'s self-serialization loop, but that only covers
`supervisees[0,10]`. When a supervisor has ≥10 communicators, `app/frontend/app/models/user.js:768-771`
(`load_all_connections`) refetches `/api/v1/users/:id/supervisees` via `Utils.all_pages` and
**overwrites** `currentUser.supervisees` wholesale. That index endpoint
(`users_controller.rb` → `JsonApi::User.paginate(..., limited_identity: true, supervisor: user)`)
must therefore set the SAME per-supervisee fields, or they vanish after the reload and the dependent
UI silently empties for exactly the largest caseloads.

- **Fix pattern:** set the field inside as_json's shared `limited_identity` + `args[:supervisor]`
  branch (a single helper like `JsonApi::User.org_status_for`), which feeds BOTH the dashboard payload
  and the index endpoint — not only in the dashboard loop. Then drop the redundant loop assignment.
- A frontend merge-on-overwrite can't fully fix it: fields are only sent for the first 10, so
  supervisees 11+ would still be missing the data. Fix at the serializer.
- `org_status` shape is ALWAYS a hash `{'state' => '<id>', …}` (because `link['state']['status']`
  is itself a `{state:…}` hash) — every consumer reads `org_status.state`. Don't "fix" it to a string.

---

## Ember 4.12 deprecation audit — what's still firing in this app (2026-06-22)

After the 3.28 → 4.12 upgrade, the `until: 4.0` deprecations were already cleared (they'd be hard
breaks otherwise). The `until: 5.0` ones still firing, found by grepping `app/frontend/app`:

- **`routing.transition-methods` — the only broad one (~37 calls, ~30 files).** `Controller#transitionToRoute`
  and `Route#transitionTo`/`replaceWith`. Fix: `router: service()` + `this.router.transitionTo(...)`.
  ~76 files already use the router service, so the pattern is established. Breaks at Ember 5.
- `component.mouseenter-leave-move` — 1 hit (`components/board-icon.js` `mouseEnter:`). Use `{{on "mouseenter"}}`.
- ember-data `DS.*` namespace — 28 files / 505+ `DS.attr`. Works in 4.12; modernize to `@ember-data/*` later.

Audit gotchas:
- Grep over-counts `transitionTo`: `router.transitionTo()` (the correct replacement) is FINE — filter out
  `router` and match `this.transitionTo(` / `this.transitionToRoute(` specifically.
- `{{action}}` (424 files) is NOT a 4.12 deprecation — normal usage. Only the legacy object-first form
  `(action someObject "name")` breaks in 4.x (fixed in highlight-outlet; that was the only template using it).
- All `Ember.*` global matches here are in comments / commented-out code — already cleaned up.
- `no-implicit-this` is NOT in ember-template-lint 2.21.0's `recommended` set, so templates were never
  checked for `this-property-fallback`. Enable it to catch stragglers (they silently render nothing in 4.x).
- The authoritative runtime list needs `ember-cli-deprecation-workflow` (catches implicit-injections +
  this-property-fallback + ember-data deprecations that static grep can't). Full audit:
  docs/task-management/2026-06-22-ember-412-deprecations.md

---

## ember-data `DS.*` → `@ember-data/*` migration + deprecation-workflow (2026-06-22)

Resolved the `ember-data:deprecate-legacy-imports` deprecation across 26 files. Import-path map (ember-data 4.12):
- `DS.Model` / `DS.attr` / `DS.hasMany` / `DS.belongsTo` → `import Model, { attr, hasMany, belongsTo } from '@ember-data/model'`
- `DS.RESTAdapter` → `import RESTAdapter from '@ember-data/adapter/rest'`
- `DS.RESTSerializer` → `import RESTSerializer from '@ember-data/serializer/rest'`
- `DS.Transform` → `import Transform from '@ember-data/serializer/transform'`

Gotchas:
- `node -e "require.resolve('@ember-data/model')"` FAILS (MODULE_NOT_FOUND) even though the package is installed — these resolve via Ember's addon tree at build time, not Node CJS. Don't trust `require.resolve`; validate import paths with a real `ember build` instead. (Piloted the 4 paths on 5 files + build BEFORE the 21-file bulk.)
- The `import DS from "ember-data"` grep misses double-quoted imports (`adapters/application.js` used `"`). Match both quote styles.
- `DS.attr` appearing in COMMENTS (`serializers/user.js`, `controllers/user/board-detail.js`) is not real usage — skip. And `GRID_BANDS.slice()` / `STATUS_IDS.indexOf()` false-match `DS\.` — anchor on real `DS.<member>`.

Runtime deprecation capture: installed `ember-cli-deprecation-workflow` v4. Setup = `app/deprecation-workflow.js` (`import setupDeprecationWorkflow from 'ember-cli-deprecation-workflow'; setupDeprecationWorkflow({throwOnUnhandled:false, workflow:[]})`) guarded on `config.environment !== 'production'`, imported from `app/app.js`. Avoid the README's `@embroider/macros` guard if macros aren't already used in app code (adds boot risk) — the env guard is safer. Capture the list by running the app then `deprecationWorkflow.flushDeprecations()` in the console.

---

## Gotcha: `ember build` success does NOT mean the app boots (classic build + v2-format addons)

`ember-cli-deprecation-workflow` v4 is a v2/Embroider-format addon. In this CLASSIC ember-cli build,
`ember build` compiled it fine, but at runtime the AMD loader threw
`Uncaught Error: Could not find module 'ember-cli-deprecation-workflow'` at app-boot → white screen.
v2-format addons don't expose a classic `addon/` AMD module, so a plain
`import x from 'the-addon'` has nothing to resolve at runtime even though the build "passed."

- **Lesson:** for ANY change touching addon imports / new dependencies / app.js boot wiring, a green
  `ember build` is necessary but NOT sufficient — verify the app actually BOOTS (dev server + reload),
  because module resolution differs between build and runtime.
- For deprecation-workflow specifically on a classic build, use the **classic v2.x** of the addon
  (ships a real `addon/` tree the loader resolves), not v4.
- After uninstalling/installing an addon, RESTART `ember serve` — it doesn't reliably pick up
  node_modules/package.json changes on a hot rebuild.

## board-detail short-height scroll: speak FILLS, edit SCROLLS (deliberate)
The board-detail page is a viewport-pinned layout (`.md-board-detail-layout` =
`calc(100dvh - topbar)`) whose **only** intended scroller is `<main
class="md-board-detail-main">` (`overflow-y:auto`). The scroll chain is already
built for small viewports: `.md-board-detail-grid-sidebar-wrap` is `flex:1 0 auto`
("stays at content height when main is over-constrained", app.scss:69729) and
`.md-board-detail-grid-fade` is opacity-only (app.scss:2901, no clip). The board
ONLY fails to scroll because the grid (`grid-template-rows: minmax(0,1fr)`)
collapses to fit. At `@media (max-height:500px)` the two modes were intentionally
OPPOSITE: **edit** drops `height:auto` + floors `.md-board-detail-grid__cell {
min-height:96px }` so it overflows and main scrolls; **speak** flexed the
grid-fade column to FILL (shrink buttons, no scroll). The board's REAL short/narrow
mechanism is the square-collapse block (`@media (max-width:1024px)` ~app.scss:72143):
default boards are `--shape-square` (from `stretch_buttons` pref); it makes cards
`aspect-ratio:1` and the grid `height:auto` + `align-content:start`, so the `minmax(0,1fr)`
rows resolve to the squares' aspect height — grid is exactly as tall as the squares (no
inter-row gaps) and `main` (overflow-y:auto) scrolls. To get scroll on SHORT screens, add a
`(max-height: …)` arm to THAT media query — do NOT invent a new floor. **Gap trap:** under
aspect-squared cards, ANY rule that makes a row taller than the square opens an inter-row gap.
Two wrong tries proved it: (a) `height:auto` + cell `min-height:96px`, (b) grid
`min-height: calc(--board-rows*104px)` — both forced rows taller than the squares → gaps. The
only gap-free path is the grid collapsing to the squares' own height. `computeHeight()` is
EMPTY (board-detail.js:1920) so sizing is pure CSS; `--board-rows` is set by JS (board-detail.js:3044).

## Pattern: white symbol matte and the `ll-symbol-white-matte` filter are mutually exclusive on one element

A symbol image with transparent regions bleeds the button's Fitzgerald fill through its
face in Colored mode (`symbol_background_clear`). The legacy classic board fixed this with
an unconditional `.button img.symbol { background:#fff }` (first commit
`coughdrop.css.scss:573`); that survives today as the `symbol_background_white` mode.
Colored mode instead uses the `#ll-symbol-white-matte` SVG filter (alpha-only white
knockout, defined in `app/frontend/app/index.html`). The trap: you cannot add
`background:#fff` to an element that also carries that filter — CSS `filter` processes the
element's own background, so the matte filter knocks the white right back out. To restore a
white matte in Colored mode you must DROP the filter and paint white on a filter-free
element. In the board-detail grid the symbol `<img>` is content-sized
(`width/height:auto` + `object-fit:contain`), so a `background:#fff` on the img sits
exactly behind the rendered image — no wrapper, and it does NOT stretch to the whole image
band the way a container fill (`.md-board-detail-symbol-card__image`) would. Default for
new users is `symbol_background = 'clear'` (`lib/json_api/user.rb:89`), so Colored mode is
the common case. See [`2026-06-23-symbol-transparency-bleed-legacy.md`](./2026-06-23-symbol-transparency-bleed-legacy.md).
## Gotcha: bootstrap 3 tooltip/popover is XSS-safe only via DOM-node content, not data-content strings
Bootstrap 3.4.1 (`node_modules/bootstrap/dist/js/bootstrap.js`) `Popover.getContent` reads the
`data-content` attribute FIRST, then falls back to the `content` option. `Popover.setContent`
branches `typeof content === 'string' ? 'html' : 'append'` and runs `sanitizeHtml` ONLY on string
content. So `$(el).attr('data-content', node.innerHTML).popover('show')` round-trips through a
parsed+sanitized HTML string (safety depends on the EOL sanitizer), whereas passing
`content: () => domNode` makes bootstrap `.append()` the real node, never parsing HTML at all
(sanitizer irrelevant). When building popover/tooltip bodies, construct a DOM node with
`document.createElement` + `.innerText` (escapes) + `img.src` (property, no attr injection) and hand
bootstrap the NODE via the `content` function; do not set `data-content` to an HTML string. Verified
in `utils/utterance.js:silent_speak_button` (LL-d1ea8659c3). Note bootstrap JS is also load-bearing
for `data-toggle="dropdown"` (incl. keyboard a11y in `controllers/caseload.js`) and
`data-dismiss="alert"`, so the EOL lib cannot simply be dropped without replacing those too.

## Gotcha: bootstrap 3 popover('destroy') is async; home-grown init guards go stale after it
Bootstrap 3's `Tooltip/Popover.destroy` defers `removeData('bs.popover')` into the `hide()`
animation callback (~150ms, `animation:true` is the default), so the instance is still present
synchronously right after `destroy` but gone a moment later. A home-grown "init once" guard keyed
on a custom attribute (e.g. `if(!$el.attr('data-popover')){ ...popover(opts) }`) does NOT get
cleared by destroy, so a later `.popover('show')` finds no instance, skips re-init, and bootstrap's
`Plugin` rebuilds a DEFAULT popover (`html:false`, `content:''`, no `content` fn) -- an empty/blank
widget that silently drops your configured options. Prefer bootstrap's own idempotency: call
`$el.popover(opts)` unconditionally before `show` (no-op when an instance exists, re-creates with
your opts after a destroy). Seen in `utils/utterance.js:silent_speak_button` where
`services/app-state.js:2336` destroys `#speak_mode`'s popover on leaving a board (LL-d1ea8659c3).

## Pattern: dedup an "already-owned copy" by parent lineage, never by slug convention

When a flow needs the user's existing copy of a public board (pick-as-home, add-to-sidebar),
it's tempting to look up `username/<original-slug>` and reuse whatever's there — copies DO keep
the slug under the user's namespace. But that key can also be an UNRELATED board the user
copied from a different source with the same slug, so reusing on the bare convention can set
the WRONG board as home — a correctness/safety bug for AAC users. Confirm lineage instead:
reuse only when `parent_board_id === original.id` (or `parent_board_key === original.key`).
App-made copies always set `parent_board_id` server-side, and `/show` always serializes it, so
real copies confirm. Two gotchas: (1) a board cached as a LIST partial may omit
`parent_board_id`, making a real copy look unconfirmed — use `findRecord(key, {reload:true})`
so the parent fields are authoritative; (2) an unconfirmed match should fall back to copying
fresh (a benign duplicate) rather than reuse-on-faith. Single shared helper:
`app/frontend/app/utils/board-copy.js#findExistingUserCopy` (used by board-preview-overlay +
sidebar-editor). Don't fork two copies of this logic — divergence is how the slug-trust branch
crept back in.

## Gotcha: Ember strict-mode templates treat bare names as helpers — use `this.` for controller props

After the Ember 5 upgrade, classic curly invocations still compile under strict resolution:
a bare identifier like `home_board_pref` in `{{board-icon board=home_board_pref}}` is looked up as
a **helper**, not a controller property. That throws
`Attempted to resolve a helper in a strict mode template, but that value was not in scope: home_board_pref`
and surfaces on `user.account` because that route reuses `templateName: 'user/index'`.
Fix: `board=this.home_board_pref`. Block params from `{{#each ... as |board|}}` stay bare and
are fine. See `docs/task-management/2026-07-14-home-board-pref-strict-mode.md`.

## Gotcha: serialize rapid model saves — overlapping user.save() lose updates / trip "in flight"

A UI that persists on every quick interaction (drag-reorder, up/down nudge, toggle) can fire
several `record.save()` calls in quick succession. Concurrent saves on the SAME Ember Data
record are unsafe: the network PUTs can complete out of order (the slower/earlier one wins,
silently dropping a later change), and Ember Data can also throw when a save starts while one is
already in flight. Fix: keep the optimistic `set()` synchronous (so the UI updates instantly),
but CHAIN the actual `save()` off a module/instance `_saveChain` promise so saves run one at a
time — each chained save serializes the model's CURRENT attributes (the latest array), so
coalescing is safe. Keep the chain alive past a rejection (`prior.then(noop, noop)`) so one
failed save can't wedge the queue, and expose the tail as `_lastSave` for callers that must wait
for persistence to settle (e.g. a reload-on-close). See
`app/frontend/app/components/sidebar-editor.js#_save`.


---

## Pattern: Ember 5 QUnit unit tests — persistence proxy, run loop, and subject shape

**Surface:** `app/frontend/tests/unit/**`, `tests/helpers/persistence-stub.js`, any test
that stubs `frontend/utils/persistence`, uses `setupTest` / `settled()` / `waitUntil()`,
or boots a full controller/component to assert on a single method.

**Context:** On `feat/melissa-ember-5-12-upgrade`, CI QUnit failures clustered into a
few repeatable families (see
[`2026-06-26-ember5-ci-unit-test-fixes.md`](./2026-06-26-ember5-ci-unit-test-fixes.md)).
Unit modules listed in [`tests/test-helper.js`](../app/frontend/tests/test-helper.js)
explicit imports **do** run under `npx ember test`; the older gotcha that the unit
suite is never loaded is stale for those modules — but most `tests/unit/**` files are
still not auto-discovered unless added there or pre-loaded by the AMD loop.

### 1. Stub persistence on the service instance, not the module export

`frontend/utils/persistence` re-exports a **Proxy** that forwards method calls to
`window.persistence` (the running service). Assigning `persistence.ajax = …` on the
import does nothing at runtime → real ember-ajax 404s in tests.

```js
import { persistenceTarget, stubPersistenceAjax } from '../../helpers/persistence-stub';

hooks.beforeEach(function() {
  this._restorePersistenceAjax = stubPersistenceAjax(function() {
    return RSVP.reject({ error: 'offline in test' });
  });
});
hooks.afterEach(function() {
  if (this._restorePersistenceAjax) { this._restorePersistenceAjax(); }
});
```

Also stub `url_cache` / `url_uncache` on `persistenceTarget()`, not on the module.

### 2. Use the container — not bare `.create()`

`BoardIndexController.create()` (and similar) bypasses injection; Ember 5 asserts when
computed properties resolve `persistence` / `app-state` without a container.

```js
// Prefer
this.owner.factoryFor('controller:copying-board').create();

// Or pass mocks explicitly when testing a method in isolation
BoardIndexController.create({
  persistence: EmberObject.create({ … }),
  appState: EmberObject.create({ … })
});
```

### 3. A 60s timeout on a “sync” test is usually async cleanup, not the assertion

**Default fix (2026-06):** import `setupTest` from `frontend/tests/helpers` (or
`../../helpers`), **not** directly from `ember-qunit`. The wrapper sets
`waitForSettled: false` by default so `afterEach` does not call `settled()`.
Jasmine-style tests use the same wrapper via `tests/helpers/jasmine.js`.

Raw `setupTest(hooks)` from `ember-qunit` wires `afterEach` → `teardownContext` →
**`settled()`**. Booting a heavy object (`controller:user/board-detail`,
`component:copying-board`, Ember Data records) schedules `runLater`, observers, and
RSVP chains that never finish in a unit test → `settled()` blocks until QUnit’s 60s cap.

**Symptom:** test body is one or two `assert.equal` calls; browser log is empty;
runtime ≈ 60000ms exactly.

**Fix ladder (pick the shallowest that fits):**

| Situation | Fix |
|-----------|-----|
| Test only calls pure prototype methods (`_resolve_cached_image_url`, `_word_prediction_locale`, …) | Prefer **`Controller.create({ …stubs })`** or **`factoryFor().create()`** with `setupTest` from **`tests/helpers`**. Copying `Controller.prototype.method` onto `EmberObject.create({ … })` often fails — the method may be missing on `.prototype` in the test bundle, so the instance property is `undefined`. For small controllers, bare `.create()` with mocked injections works (see `board-index-word-prediction-locale-test.js`). |
| Test drives async modal/hierarchy code | `setupTest` from **`tests/helpers`**; poll completion with **`run` + `later`**, not native `setTimeout` or `await settled()`. |
| Test stubs a loader that never settles (hung buttonset) | Reject the hung RSVP in `afterEach` so orphans don't wedge the next test. |
| Code under test uses `@ember/runloop` (`opening()`, `init` → `runOpening`) | Wrap the trigger in `run(function() { … })`. |

**Do not** reach for `await settled()` or `@ember/test-helpers` `waitUntil()` when
orphan RSVP promises exist (never-settling stubs) — `waitUntil` polls with `settled()`
between attempts and hangs the same way.

### 4. Native `setTimeout` does not flush Ember `later()`

`copy_hierarchy_loader.js` schedules early live-links fallback with `later()`. A
`pollUntil` loop built on `setTimeout(tick, 10)` never advances those timers → the
promise never resolves → `loading` stays true → 60s timeout.

```js
import { run, later } from '@ember/runloop';

function pollUntil(condition, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return new RSVP.Promise(function(resolve, reject) {
    var start = Date.now();
    function tick() {
      if (condition()) { resolve(); return; }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('pollUntil timed out after ' + timeoutMs + 'ms'));
        return;
      }
      later(tick, 10);
    }
    run(tick);
  });
}
```

Contrast: `hide_loading_overlay()` uses `runLater` — poll with `run`/`later` (see
`loading-overlay-cache-test.js#waitForOverlayHidden`), not `await settled()`, when
orphan promises may still be pending.

### 5. ember-qunit 8 / Ember 5 component gotchas

- Legacy Jasmine **`this.subject()`** is not wired reliably — use
  `this.owner.factoryFor('component:audio-browser').create()`.
- **`element` is read-only** on Ember 5 components — use
  `Object.defineProperty(component, 'element', { get: () => fakeHost })`, not
  `component.set('element', …)`.
- **`clear_user_state`** must not `set('referenced_user', null)` — that property is
  now a computed derived from `currentUser`.

### 6. Jasmine `describe()` errors poison global state

`tests/helpers/jasmine.js` keeps module-global `names`, `all_befores`, etc. If a
top-level `describe()` callback throws **before** `names.pop()` (e.g.
`afterEach is not defined` in `board-preview-canvas-test.js`), the stack stays dirty:
later suites register **without** `QUnit.module` + `setupTest`, test titles pick up
the leaked prefix (`BoardPreviewCanvasComponent capabilities …`), and
`ember_helper`’s `beforeEach` calls `persistence.set` on a **destroyed** service
from the last torn-down owner.

**Fix recipe:**

- Import every jasmine helper you use (`afterEach`, `waitsFor`, `runs`, …).
- `jasmine.js` wraps `add_test()` in `try/finally` so `names.pop()` always runs.
- `ember_helper` resets persistence via `owner.lookup('service:persistence')` when
  `this.owner` exists, and skips `set` when the target is destroyed.

**Symptom:** hundreds of legacy Jasmine tests fail with
`calling set on destroyed object: … persistence … online = true`, often with wrong
test name prefixes. Or `Cannot read properties of undefined (reading 'lookup')` in
`runs()` / post `afterEach` when `testOwner.lookup` runs after ember-qunit teardown.

**Also:** `afterEach` in `jasmine.js` pushed to `all_afters[length - 1]` (the root bucket)
while nested describes `unshift` new levels at index 0 — so every nested `afterEach` (e.g.
`testOwner.lookup` cleanup in `application-test.js`) leaked into **all** tests' post hooks.
Use `all_afters[0]` to match `beforeEach` / `unshift` symmetry.

**First seen in:** [2026-06-26-ember5-ci-unit-test-fixes.md](./2026-06-26-ember5-ci-unit-test-fixes.md).

**Also:** `restoreStubs()` in `test_wrap` must run **after** inner `waitsFor`/`runs` async
callbacks (in the outer post-`runs` block), not synchronously after `instance.call()`.
Early restore clears stubs before promise chains run — symptom: `word_suggestions` gets
`images/square.svg` instead of stubbed `fallback_url`, persistence stubs ignored, hundreds
of Jasmine assertion failures.

**ContentGrabbers in Jasmine:** `utils/content_grabbers` is a Proxy to `window.cg`. Do not
capture `contentGrabbers.videoGrabber` at describe registration time; assign in `beforeEach`
after `ember_helper` runs `owner.lookup('service:content-grabbers')`.

**Puppeteer localStorage:** use `replaceLocalStorage()` from `ember_helper` — assignment
`window.localStorage = {…}` throws (getter-only).

**Persistence/app-state stubs:** `utils/persistence` and `utils/app_state` are Proxies whose
get traps forward to `window.persistence` / `LingoLinq.appState`. Jasmine `stub()` mirrors
onto the live service when stubbing the util export; QUnit tests should use
`stubPersistence()` / `persistenceTarget()` instead of assigning `persistence.ajax`.
**Prime first:** call `primePersistenceService(owner)` (via `setupTest` or
`ember_helper` beforeEach) before stubbing — otherwise first model `createRecord`
replaces the placeholder and drops ajax stubs (symptom: ember-ajax 404, ~4650ms
timeouts in Board/User model tests).

**First seen in:** [2026-06-27-ember-test-ci-failures.md](./2026-06-27-ember-test-ci-failures.md).

### 6. BoardHierarchy / store in copy-modal tests

Monkey-patch `BoardHierarchy.load_with_button_set` and `load_from_live_links` in
the test **before** calling `opening()`. Never rely on real `load_from_live_links`
(`LingoLinq.store.findRecord`) in unit tests — it hangs without a populated store.
Set `earlyLiveLinksDelayMs: 0` (or a small ms value) on the controller/component so
tests don't wait for the production 6000ms default.

**Reference implementations:**

- `tests/helpers/index.js` — `setupTest` wrapper with default `waitForSettled: false`
- `tests/unit/controllers/copying-board-test.js` — `pollUntil`, `openCopyModal`, hung-buttonset cleanup
- `tests/unit/controllers/user-board-detail-image-cache-test.js` — `factoryFor` + `waitForSettled: false`; side-effect `import 'frontend/models/board'` for `LingoLinq.Board.*` statics
- `tests/unit/controllers/board-index-word-prediction-locale-test.js` — isolated method context

**First seen in:** [`2026-06-26-ember5-ci-unit-test-fixes.md`](./2026-06-26-ember5-ci-unit-test-fixes.md)
(on `feat/melissa-ember-5-12-upgrade`).

---

## Adding a new component-based modal (frontend)
The modal system is component-based. To add a modal named `X`, FIVE wiring points are required —
miss any one and it silently won't render:
1. `app/components/X.js` — `tagName: ''`; `init` reads `modal.getSettingsFor('X')` into `model`;
   actions `close` (`modal.close()`), `opening` (`modal.setComponent(this)`), `closing`.
2. `app/templates/components/X.hbs` — wrap body in
   `{{#modal-dialog action=(action "close") opening=(action "opening") closing=(action "closing")}}`.
   Modern classes: `md-modal-header` / `la-modal-close` / `md-modal-body` / `md-modal-footer`.
3. `components/modal-container.js` — add `'X'` to the `convertedModals` array (the gate).
4. `templates/components/modal-container.hbs` — add `{{else if (is-equal this.currentTemplate "X")}}{{X}}`.
5. Open it with `modal.open('X', {...opts})` (opts are read back via `getSettingsFor('X')`).
Live-saving a user preference from a modal: bind a checkbox `@checked` to a `computed({get,set})`
whose setter does `user.set('preferences.FIELD', v); user.set('preferences.device.updated', true);
user.save();` — saves immediately on toggle. For text inputs, save on `{{on "change" ...}}` (blur)
not per keystroke. Example: `app/frontend/app/components/pin-settings.js`. When several settings
can change in quick succession, SERIALIZE the saves — chain each onto the previous in-flight one
(`this._save_chain = this._save_chain ? this._save_chain.then(run, run) : run()`) so overlapping
`user.save()` calls can't drop a write (see "serialize rapid model saves"). For a PIN/credential
text input, also SANITIZE on change AND on close (`(v||'').replace(/[^0-9]/g,'').slice(0,4)`) so a
non-numeric/empty value can never be persisted — an empty PIN silently disables whatever it gates.

## Pattern: reuse the speak-mode-pin modal as a generic PIN gate for any action

To PIN-gate ANY action (not just exiting Speak Mode), open the existing
`speak-mode-pin` entry modal in validate-only mode and act on the resolved
payload — no new modal, no separate PIN value:

```js
modal.open('speak-mode-pin', {
  action: 'none',                                   // validate only, no side effect
  hide_hint: user.get('preferences.hide_pin_hint')
}).then(function(res) {
  if (res && res.correct_pin) { doTheGatedThing(); } // res is undefined on cancel
}, function() {});
```

The modal resolves `modal.close({correct_pin:true})` on a correct PIN (and plain
`close()` → `undefined` on cancel), so `modal.open(...).then(res => res && res.correct_pin)`
is the gate. `action: 'none'` is the same mode the speak-mode ENTRY gate uses
(`application.js:1094`). Gate only when `require_<x>_pin && speak_mode_pin` both set
so a missing PIN can never lock the user out. First applied: `require_sidebar_edit_pin`
gating `open_sidebar_editor` (board-detail.js), 2026-06-26. The PIN value
(`speak_mode_pin`) is SHARED across all gates — a new gate is just a new boolean
pref (3-touch) + this `.then` wrapper, NOT a new PIN.

**Do NOT pass the PIN in the modal options** (`actual_pin: ...`). `modal.open`'s options
are stored in the modal service's in-memory `settingsFor` blob, so putting the plaintext
PIN there leaks it into shared state. Instead the `speak-mode-pin` component reads it LIVE
via an `actual_pin` computed off `appState.currentUser.preferences.speak_mode_pin` (used for
both validation and the Reveal link); callers pass only `action` + `hide_hint`. (Security
fix, 2026-06-27 — external review flagged plaintext-in-options.)

## Pattern: default a preference ON for NEW users only, never backfilling existing ones

`generate_defaults` (before_save) runs on every save, and the `preference_defaults` bucket
loop backfills any `nil` field on EVERY existing user's next save. So putting
`'word_suggestions' => true` in a `preference_defaults` bucket silently turns the feature ON
for every pre-existing user the next time they save — an unannounced behavior change (an
external review rated this HIGH).

To default a preference ON for **new** sign-ups only:
1. Do NOT put it in any `preference_defaults` bucket (those backfill everyone).
2. In `generate_defaults`, set it under a `new_record?` guard so it's applied once at
   registration and never on later saves:
   ```ruby
   if self.new_record?
     self.settings['preferences']['word_suggestions'] = true if self.settings['preferences']['word_suggestions'] == nil
   end
   ```
   (For a date-cut default, the codebase's existing idiom is
   `FeatureFlags.user_created_after?(self, 'flag')` — but that needs a flag date marker;
   `new_record?` is simpler when the cut is "from now on".)
3. Make the CLIENT read it as `=== true` (treat `nil`/`undefined` as OFF) so existing users
   with no stored value read as off. A `!== false` read is the trap — it makes `nil` mean ON,
   re-introducing the silent enablement client-side even after the server stops backfilling.
Applied to `word_suggestions` / `word_suggestion_position`, 2026-06-27.

**Review-lens note:** correctness / regression / accessibility / cascade passes do NOT catch
security-or-input-validation gaps (silent default flips, missing PIN validation,
plaintext-in-options, save races). When a change touches auth/PIN/preferences, run an explicit
"abuse + input-validation + concurrency" lens as its OWN pass — three internal adversarial
reviews missed all four of these because none was framed that way.

## Pattern: editing the speak bar must mutate the GLOBAL utterance, not just the display mirror

`utils/utterance.js` `rawButtonList` is the source of truth; `set_button_list` (observer)
recomputes the VISUAL `app_state.button_list` from it (handling inflections, spelled-letter
merges, `:complete`/`:space`, capitalization, punctuation). The board-detail controller keeps a
local `sentence_parts` MIRROR of button_list for the chip UI. Two non-obvious rules:

1. **Edit on rawButtonList, never only the mirror.** If you remove/reorder a chip by mutating
   `sentence_parts` alone, the spoken/logged/synced sentence (derived from rawButtonList) silently
   diverges from what's displayed. Add edit methods to utterance.js that re-`set('rawButtonList',
   …)` and let set_button_list recompute. Each VISUAL chip owns a CONTIGUOUS block of raw entries
   bounded by consecutive `button_list[i].raw_index` (set_button_list walks raw in order and merges
   modifiers into the prior visual button). So remove = drop a block, move/swap = reorder blocks,
   replace = relocate a block. Implemented as `visual_raw_blocks` / `remove_button` /
   `move_to_index` / `move_button` / `swap_buttons` / `replace_with_last` (2026-06-27).
   **Make the partition FAIL-SAFE:** if `raw_index` values are missing / out-of-range /
   non-increasing, return null and have callers no-op — a wrong guess must never corrupt the
   utterance.

2. **The additive, raw_index-keyed sync CANNOT survive a reorder.** The old
   `sync_sentence_from_button_list` only appended/updated chips matched by `raw_index` and never
   removed or reordered. But set_button_list REASSIGNS `raw_index` on every change, so after a
   reorder the keys no longer line up (you get duplicates / stale order). Rewrite the sync as a
   FULL MIRROR (rebuild `sentence_parts` in global order, dropping anything no longer present), with
   a value-equality guard to avoid churn and a **label-keyed image cache** (`_resolved_label_images`)
   so async-resolved symbols survive a rebuild (object identity and raw_index are both unstable
   across a reorder; the label is stable).

3. **Replace-with-a-board-button:** don't hand-build a raw entry (you'd miss image/vocalization/
   sound/content processing). Route the tapped board button through the normal activate pipeline
   (`appController.activateButton`) so it APPENDS a correct entry, then `replace_with_last(target)`
   relocates that last block onto the target and drops the old one.

For the accessible reorder UX itself, see the research in
`docs/task-management/2026-06-27-speak-bar-active-edit.md`: move buttons (‹ ›) are the most
accessible non-drag path; pair native HTML5 DnD (pointer) with full keyboard (Enter/Space select,
arrows move, Esc cancel) + an `aria-live` region announcing each result. Don't add a DnD library to
this Ember 3.28 app — dnd-kit / pragmatic-drag-and-drop are React-first; native DnD + buttons covers it.

## Gotcha: selective board-set copying ALREADY exists — reuse `board_hierarchy`, don't rebuild

Before adding any "choose which sub-boards to copy" UI, know the infra is already there end-to-end:
- **Frontend:** `utils/board_hierarchy.js` builds the downstream tree with per-board `selected`
  flags, `selected_board_ids()`, `root_deselected`, `set_downstream(id,'selected',bool)`, `toggle()`.
  The `{{board-hierarchy selectable=true hierarchy=…}}` component renders the selectable tree
  (used by `confirm-delete-board`, `slice-locales`, `swap-images`, and the `copying-board` modal).
  `components/board-hierarchy.js` `select_all(state)` now honors `state` → `select_all false`
  is Deselect All (existing callers pass no arg, so they still select).
- **Copy flow:** the OPTIONS modal is `copy-board` (name/user/symbols); the EXECUTION modal is
  `copying-board`, which loads the hierarchy (`copy_hierarchy_loader`, `expand_all:true`, all
  selected by default) and passes `hierarchy.selected_board_ids()` as the include list.
- **Backend:** the copy endpoint already accepts `expand_selected_board_ids` (users_controller →
  user.rb#2559 → relinking.rb `copy_board_links_for`), so partial copies are supported server-side.
So "modernize the copy modal / default-all-selected / deselect some" = a UI disclosure around the
existing `board-hierarchy`, NOT a new feature. (2026-06-27: collapsed the picker behind a
`md-modal-expander` disclosure + modern `md-modal-btn` footer in `copying-board`.)

---

## Pattern: Ember 5 CI hang — destroyed-object read in post-teardown callback

**Surface:** Full `ember test` in CI wedges for hours with no pass/fail count; local module
filters may look fine.

**Cause:** After a test tears down the app, a leaked `observer` / `later()` reads a computed on a
destroyed service. Ember 3.28 returned `undefined`; **Ember 5 throws**. The throw re-enters
`window.onerror` / app `Ember.onerror` until stack overflow, corrupting Testem so every later test
appears to timeout.

**Fix (production):** Guard chokepoints — e.g. `edit_manager.process_for_displaying` bails when
`appState.isDestroyed` (`a98bd1b7a`). Same pattern on high-traffic observers/timers
(`app-state` `on_user_change`, `refresh_user`, `check_for_board_readiness`); cancel recurring
`runLater` in `willDestroy`.

**Fix (harness):** `start({ setupTestIsolationValidation: true, testIsolationValidationDelay: 50 })`;
lower `QUnit.config.testTimeout` so wedges fail in seconds. Do **not** expect fixing
`window.onerror` recursion alone to turn red tests green — it only amplifies the underlying error.

See [`2026-06-27-ember5-ci-remaining-test-fixes.md`](./2026-06-27-ember5-ci-remaining-test-fixes.md).

## Gotcha: the Eval tool renders through the CLASSIC board renderer — re-skin, don't re-route

The Eval pages (`/obf/eval-start`, `/obf/eval-N-N`) are boards owned by the system user `obf`.
`routes/board.js` deliberately excludes `^obf/` from the modern board-detail redirect, so eval
boards ALWAYS render through `templates/board/index.hbs` (classic), never board-detail. The eval
flow handlers (`button_settings`, `assessment_settings`, `#board_bg` z-index layering, the eval
header nav) are wired to that classic structure — so the established pattern is to RE-SKIN the
classic markup, NOT switch renderers (see the `app.scss` "Modern Eval Header" comment ~88932 and
the `.board.eval_mode` z-index block ~7858).

Scoping hooks (both eval-only, safe to style without touching normal boards):
- **Header:** `app_state.eval_mode` adds `.md-eval-header` on `<span id="speak">` (application.hbs).
- **Body:** `display_class` (`controllers/board/index.js:1212`) adds `eval_mode` to the `.board`
  container only when `app_state.eval_mode` → scope body styling under **`.board.eval_mode`**.
- Body DOM is classic: `#board_bg` + `.button_row` > `<a class="button">` with `.symbol` + `.button-label`.
- The button's inline `computed_style` (`utils/button.js:940`) sets position/size + `outline-color`
  /`--btn-ring-color` ONLY — never the face bg/border/radius — so the card face is pure CSS and a
  white-glass re-skin works with `!important` to beat base `.button`/`.colored_icons` rules.
  (2026-06-29: added the "Modern Eval Board Body" block — soft gradient surface + white glass button
  cards + navy labels — scoped to `.board.eval_mode`, companion to the existing Modern Eval Header.)

## Pattern: the dashboard is role-agnostic by DATA — never fork the edit per role

The home dashboard + its edit (`display-style.js`) are ONE surface driven by the section
registry in `utils/dashboard_sections.js`. Roles are expressed as data, not code branches:
- `HOME_SECTIONS[].available(user)` gates each card per role (`availableHomeSections(user)`).
- Default card order is single-sourced through **`defaultOrderFor(user, layout)`** (2026-07-03):
  Focused shares one `FOCUSED_DEFAULT_ORDER`; Gentle is role-aware — a supervisor (any of
  caseload/rooms/attention/org available) gets `SUPERVISOR_DEFAULT_ORDER`, else `DEFAULT_ORDER`.
  Both the live grid (`dashboardLayout`) and the edit resolve their default from the SAME arrays,
  so they can't drift. **Never hardcode `(layout==='focused')?FOCUSED_DEFAULT_ORDER:DEFAULT_ORDER`
  in the edit** — that was the supervisor bug (edit used the communicator order, mismatching the grid).
- Adding a future role = add sections with `available` predicates (+ maybe a default-order array).
  The single edit picks it up; do NOT create a per-role edit page (breaks the "grid + preview read
  the same `dashboard_order` so they never drift" guarantee, and duplicates drag/persist logic).

**The dashboard user is `referenced_user || currentUser`** (the app's idiom, app-state 907/1256).
Resolve it ONCE per method and use it for BOTH `availableHomeSections()` AND preference read/write —
never read one identity and write another. Today `referenced_user` is only ever set to `null`
(app-state.js:1994, never assigned), so it == `currentUser` — which is already masquerade-correct
(act-as re-resolves `currentUser` to the acted-as user, app-state.js:468-475). Modeling
(`referenced_speak_mode_user`) is speak-mode-only and never reaches dashboard-edit. So the seam is
behavior-neutral today and the single wire-in point for a future "supervisor edits a supervisee's
dashboard" flow: set `referenced_user` and the whole edit routes to that user, no other changes.

- Org access is role-tiered (organization.rb:42-48): manager→view/edit/manage, assistant→view/edit,
  **supervisor→view ONLY**, communicator→none. EVERY org-management endpoint (managers/users/
  supervisors/units/stats/admin_reports/settings) gates on `allowed?(@org,'edit')`, so a supervisor
  loading any of them gets 400 "Not authorized" — not a bug, a permission tier. A supervisor's org
  link is sponsored-membership (add_supervisor + premium licenses), not admin; their work is the
  Caseload. UI rule: gate org-management nav links + the home "My Organizations" card behind
  `permissions.edit` / a manager-type org, and skip edit-gated controller fetches for view-only users
  — never surface a link to a page whose API the user's role can't call. (2026-06-29)

- eat_events mobile gotcha: any NEW {{action}}-bound <button>/<a> that renders on the CLASSIC board
  page while speak_mode is active (e.g. the eval intro `.md-eval-intro`) needs a carve-out in BOTH
  raw_events handlers, not just `click`. The touchstart/mousedown `eat_events` (raw_events.js:~66)
  preventDefaults on mobile when `eatable` (speak_mode) && capabilities.mobile && !ignored_region —
  which SUPPRESSES click synthesis on Android/iOS, so a `.closest()` exception added only to the
  click handler leaves the control dead on touch devices. Add the selector to the eat_events
  carve-out (alongside `.board-detail-view, .md-board-detail-grid`) too. (2026-06-29, adversarial review)
- eval.js `intro_header_start` gotcha: `level` is captured as `levels[working.level]` at the top; the
  level-overflow normalization at the end (`if(!level[working.step]){ working.level++ }`) re-reads that
  SAME captured `level`. If a branch jumps to a different level (welcome → find-4, which lives in a
  later level), you must resync `level = levels[working.level]` after setting working.level, or the
  normalization re-increments past the target. (2026-06-29, adversarial review)

- Below-chip / below-anchor popover inside an overflow-clipped scroller (speak-bar chip edit
  menu): the sentence-bar chips live in `.md-board-detail-sentence-bar__text--with-symbols`,
  which is `overflow-y:auto; max-height:86px` — and per spec `overflow-y:auto` FORCES
  `overflow-x` to auto too, so a menu positioned `top:100%` INSIDE a chip is clipped on BOTH
  axes. Fix pattern: render the popover as a sibling OUTSIDE the scroller (a child of the
  `position:relative` bar, which has no overflow), then JS-anchor it under the chip by
  measuring `chip.getBoundingClientRect()` vs `bar.getBoundingClientRect()`, clamping `left`
  into the bar, and offsetting a caret. Because the bar has `transform:translateZ(0)` (its own
  stacking context) and sits BEFORE the board grid in DOM, lift the whole row with
  `.md-board-detail-sentence-row:has(<the-menu>){position:relative;z-index:20}` so the dropped
  card paints above the grid. Avoid the first-frame `left:0` flash by positioning twice —
  provisionally with a fallback width BEFORE the `{{#if}}` renders the menu, then exact via
  `runLater(this, this._position_chip_menu, 0)` on afterRender. (2026-06-30)
- AAC accidental-tap guard for an edit menu = PRESS-AND-HOLD, not a post-tap dwell.
  First attempt used "tap now, reveal menu after a 2s dwell" — but that still opens on a single
  accidental tap (the timer fires regardless), which the user rejected. Correct pattern: require
  a deliberate 2s press-and-hold; any shorter press does nothing. Implement the hold in the
  presentational component with POINTER events (not click): `pointerdown` arms a
  `runLater(HOLD_DURATION)` + a `--pressing` state; `pointerup`/`pointercancel`/`pointerleave`
  cancel; `pointermove` past a tolerance (~12px, generous for tremor) cancels as a drag/scroll.
  On completion fire the open action AND set a `_hold_fired` flag so the trailing synthetic
  `click` (pointerup → click) is swallowed instead of toggling the just-opened menu shut. A
  short tap stays useful: no-op when nothing's open, dismiss when THIS item's menu is open,
  immediate-select in a mode that already committed (e.g. swap-target). Keyboard Enter opens
  immediately (already deliberate). On the pressable element set `user-select:none` +
  `-webkit-touch-callout:none` + `touch-action:manipulation` so the long-press doesn't select
  text / fire the iOS callout / double-tap-zoom, and add a fill animation whose duration EQUALS
  HOLD_DURATION as a "keep holding" progress cue (static tint under reduced-motion). Cancel the
  hold timer in `dragStart` and `willDestroy`. (2026-06-30)

- Decorative box-shadow vanishing "on click" = the global focus reset stripping it. app.scss
  has `#within_ember *:focus:not(:focus-visible) { outline:none !important; box-shadow:none
  !important; }` (line ~274) to suppress Bootstrap's focus box-shadow on MOUSE clicks. It's
  `*`-broad, so ANY focusable element whose box-shadow is DECORATIVE (a glass/elevation shadow,
  not a focus ring) loses that shadow the instant a click focuses it — reads as the element
  going flat / "actively clicked". Symptom: shadow present at rest + on keyboard focus
  (`:focus-visible` path), but gone on pointer click (`:focus:not(:focus-visible)` path). Fix:
  carve the element out of that global rule with `:not(.the-class)` (edit the rule in place,
  don't stack an `!important` shadow re-assert). Safe because UA browsers only draw the default
  outline for `:focus-visible`, so excluding it adds no stray outline on click. This bit the
  speak-bar chip (`.md-board-detail-sentence-bar__chip`, a focusable span[role=button]).
  (2026-06-30)

- Dead responsive rules = base display swapped flex↔grid, media queries not updated.
  Symptom: a component's `@media` blocks set `grid-template-columns` / `grid-column: span N`
  but the layout doesn't respond and the desktop layout looks off (e.g. a centered flex-wrap
  leaving an awkward 4+2 row). Cause: the BASE rule uses `display: flex` (someone changed it
  from grid) so every `grid-*` property in the media queries is inert. Fix: switch the base
  back to `display: grid` with explicit `grid-template-columns` — it both fixes the desktop
  layout AND reactivates the already-written responsive rules for free. Seen on
  `.md-org-stats__grid` (org dashboard): base was flex, but 820px/550px media queries + the
  `--wide` modifier all assumed grid. Check the base display before writing NEW responsive
  rules — the ones you want may already exist. (2026-07-01)

- The `/setup` route is DUAL-PURPOSE — don't delete it wholesale. It serves (1) first-run
  ONBOARDING (Getting Started wizard, `mode:'critical'` / `page:'board_category'`) AND (2)
  BOARD/COMMUNICATOR setup (`board-actions.js:112` symbol-layout editor `page:'symbols'`; and
  supervisors/org-admins "set up a communicator's board" from caseload/org-people/user-index/
  switch-communicators). Only #1 is being replaced by the Shepherd home tour + the standalone
  `board-picker` route (`router.js:140`, decoupled from setup). Full map:
  docs/task-management/2026-07-02-setup-pages-deprecation-map.md. Two gotchas found: (a) there are
  TWO terms-agree files — the live modal `components/terms-agree.js:31` ALWAYS routes to setup and
  ignores the `home_tour` flag, while the stale `controllers/terms-agree.js:25-46` has the correct
  flag branch (ON → home+tour, OFF → setup); that mismatch is why a terms-needing login lands in the
  old wizard even with `home_tour` enabled. (b) `progress.setup_done` is written ONLY by the wizard
  (`getting-started.js:75`) and read only by setup/dashboard/`routes/index.js:104` — so repurposing
  it for "tour done" means wiring the tour's completion to set it. (2026-07-02)

- Eval stuck repeating a step (no advancement): the adaptive advance decision
  (`utils/eval.js` ~l.2077) gates entirely on `assessment.mastery_cutoff /
  non_mastery_cutoff / attempt_minimum / attempt_maximum`. Those are assigned
  ONLY in the `opts[1] == 'start'` branch (~l.1159); `populate_assessment`
  (~l.2318) sets device prefs + `populated=true` but NOT the cutoffs. So a
  resume/deep-link (`eval-<level>-<step>`) or a re-entry after a page refresh
  (module reload resets `assessment = {}`) leaves them undefined, every
  comparison is `>= undefined` (false), and `next_step` never fires. Fix:
  default the four cutoffs from the module constants on every board build
  (no-op on 'start'). Not dev-only — any real resume hits it. (2026-07-06)

## Gotcha: async schedule_for on an unsaved record enqueues id:null and class-dispatches to a nonexistent method

**Surface:** any `self.schedule_for(queue, :some_instance_method, ...)` (boy_band async)
called from a `before_save` / `process_params`-style path where `self` may not be
persisted yet.

**Symptom:** Resque failures `method not found: <Class>:<method>` that accumulate slowly
over months, one per record created through that path. The failed payload has
`"id": null` and targets `<Class>` (the class, not an instance).

**Root cause:** boy_band's `schedule_for` captures `id = self.id` at ENQUEUE time
(`boy_band.rb:408`). On CREATE, `process_params` runs before the INSERT, so `self.id` is
nil. At run time, `perform_action` sees no id, leaves `obj = self` (the class), and
`Class.respond_to?(instance_method)` is false → `raise "method not found: Class:method"`.
The job can never succeed, so it just piles up in the failed queue.

**Fix:** never enqueue the instance job until `self.id` exists. If create-time work is a
true no-op, guard the enqueue on `self.id`. If the create payload can already identify
downstream targets, preserve the request on the model instance and enqueue it from an
`after_commit` callback on create. `Board#update_privacy` uses the latter approach because a
new board can contain links to existing boards that still need the requested privacy
cascade. Also skip payloads that would no-op (e.g. blank privacy). Detection: the failed job
shows `"id": null` + `method not found`.

**Evidence:** `app/models/board.rb` `schedule_for(:priority, :update_privacy, ...)` ran
before a new board had an id; ~26 dead `Board:update_privacy` jobs accumulated Mar–Jun
2026. Fixed by deferring the create-time enqueue until after commit (branch
`fix/traci-update-privacy-unsaved-board-guard`).

## Gotcha: safely cleaning up Resque failed jobs — origination is chain::, not scheduled; count-check destructive removes

Two lessons from a 2026-07-03 over-deletion (a "clear last-two-days failures"
cleanup deleted 2,674 jobs when ~10 were in scope; full account in
`docs/task-management/2026-07-03-failed-queue-deletion-incident.md`).

**1. A job's origination is the `chain::` timestamp — not `scheduled`, `run_at`, or `failed_at`.**
A Resque/boy_band failed-job payload carries a `chain::j<ISO-timestamp>_...` arg
(the immutable time the chain first started); to slice the failed queue by
age/origination, parse THAT. The over-delete happened because the cleanup's
origination helper tried the inner `settings['scheduled']` epoch and then fell
through to `run_at`/`failed_at` — but never checked `chain::`. Two traps combined:
(a) not every job has a `scheduled` hash — Progress jobs pass a bare integer id
(`["Progress","perform_action",3355]`), so there was nothing to read; and
(b) `run_at`/`failed_at` reflect the LAST attempt, which today's reprocessing had
set to the current date. So ~2,664 months-old Progress failures resolved to
`failed_at` = "today" and got swept into a "last two days" delete.

**2. Count-check before any destructive bulk Resque/Redis op.** Before
`Resque::Failure.remove` / `redis del` on a filtered set, assert the selected
count against what the prior analysis predicted and abort on a large gap
(`abort if selected > expected * N`). Analysis said ~10; the delete selected
2,674 (267×) — an assertion would have caught it. Note there is effectively no
undo: `Resque::Failure.remove` is irreversible, and the dev Redis has no AOF and
auto-BGSAVEs on churn, so the pre-delete RDB is overwritten within minutes.

## Gotcha: `Worker.process_queues` destroys RemoteActions — assert RA rows after one wave, not two

`Worker.process_queues` (`lib/worker.rb`) always calls `RemoteAction.process_all` before draining Resque, and `process_all` destroys every row it processes. After synchronous `track_downstream_boards!`, board-level `schedule_update_available_boards` RAs already exist; the first `process_queues` turns those into user-level `update_available_boards` RAs. A second `process_queues` immediately consumes/destroys those user RAs — so `expect(RemoteAction.where(...).count).to be >= 1` after two waves flakes as `got: 0`. Assert after one wave when the setup already called `track_downstream_boards!`. Deferred-track examples (no sync track, only `process`) still need two waves because track itself arrives as a RemoteAction. See [`2026-07-23-board-caching-remote-action-flake.md`](./2026-07-23-board-caching-remote-action-flake.md).

## Pattern: privacy classification language in docs/legal/* is load-bearing and drifts across repos

"De-identified", "anonymous", and "pseudonymized" are legally distinct terms, not synonyms.
`lib/pii_scrubber.rb` output is **pseudonymized personal data** (GDPR Art. 4(5)): known direct
identifiers removed by design (a safeguard, not a guarantee — free-hand third-party names can
evade pattern/blocklist scrubbing), still personal data, all processor obligations apply. Never describe
scrubbed AI-vendor prompts as "de-identified" or "anonymous" in `docs/legal/*` — a regulator
or customer DPO reads those words as claims. Also: corrections made in the ai-company-brain
program docs do NOT auto-propagate to this repo's registers (`docs/legal/SUBPROCESSORS.md`
etc.); the brain doc explicitly defers to the register as SSOT, so when either side changes
classification language, grep the other side for the stale term in the same session. Found
2026-07-05 when a brain-repo audit caught the register still saying "de-identified" three
weeks after the program doc was corrected to "pseudonymized". (2026-07-05)

- Ember Data "mutating a preferences object in place won't persist" is a FALSE ALARM in this
  app — don't add ref-reassign dances to force dirtiness. Two facts: (1) `record.save()` always
  issues a network request (it does NOT skip a pristine record); (2) the User serializer extends
  `@ember-data/serializer/rest` (`serializers/application.js`), whose `serialize()` walks EVERY
  attribute via `eachAttribute` regardless of dirty state — so the full `preferences` object
  (including a nested `set('preferences.progress.x', …)` mutation) is always in the PUT payload.
  Canonical analog: `components/intro.js` does `user.set('preferences.progress.intro_watched',
  true); user.save()` with no ref-reassign and persists fine. The ONLY real gotcha with nested
  prefs is that `Ember.set('preferences.progress.x', …)` throws if `preferences.progress` is
  undefined — so vivify the intermediate object first; that's a correctness guard, not a
  dirty-tracking hack. (2026-07-06, adversarial-review triage)

## Full Eval "switch" lag after selecting an answer = one shared advance delay
**Symptom:** After tapping an answer on a Full-Eval item, the old image lingers
~1s before the next item loads; users re-tap thinking it didn't register.
**Root cause:** Every interactive eval board (find-a-word, category, association,
…) is built by one function in `app/frontend/app/utils/eval.js` and shares
`res.handler`. On a normal selection it advances via
`runLater(jump_to_board, button.id == 'button_done' ? 200 : <delay>)` — the delay
was a hardcoded **1000ms** ("ding, wait, then jump"), and it returns
`highlight: false`, so there's no feedback during the wait. A `handling` guard
already ignores re-taps, so it's not functionally broken — just confusing.
**Fix:** One value governs ALL eval types — don't hunt per-evaluation. Made it
`assessment.advance_delay` (default 350ms, tunable via settings). The ding is
fire-and-forget audio and keeps playing across the board switch, so shortening
the delay doesn't cut the chime. `button_done` stays 200ms.

## Eval progress lives in-memory only — persist incrementally to survive reload
**Context:** A Full Eval's answers accumulate only in module-level `assessment`/
`working` (+ `window.assessment` + appState) until `persist()` saves once at
conclusion. A reload/crash mid-eval wipes it (module reload → `assessment={}`),
losing all answers, and `last-eval` (which reads in-memory via
`last_assessment_from_memory`) renders blank (epoch-0 date via
`analyze`'s `new Date((assessment.started||0)*1000)`).
**Fix pattern (incremental persistence):** snapshot `{assessment, working_stash}`
to IndexedDB `settings` store, key `eval_progress`, via
`persistence.store('settings', obj, key)` (sets `storageId=key`) / `find` / `remove`
— one eval per browser so a singleton key suffices. Save debounced after each
answer; restore on the reload/deep-link build branch when the live assessment has
no `events` (self-guard with a once-per-load flag + re-jump to
`obf/eval-<lvl>-<stp>-<att>`); clear on `persist()` (concluded) and on fresh
`start`. `last-eval` gets a durable fallback: an observer async-loads the snapshot
when in-memory is empty and feeds `processed_assessment`.
**Gotchas:** `_json_safe` (JSON round-trip) the snapshot to strip `working.ref`
action closures (structured-clone would throw). Scored data (`events`/`started`)
is plain and round-trips intact; `working.ref` runtime state re-derives on rebuild.
All store calls best-effort (catch → no-op) so the eval never breaks if IndexedDB
is unavailable. RSVP is NOT imported in eval.js — use the persistence promise
directly + native `Promise` fallback.

## Eval scoring silently zeroes out after reload/resume — level_id keying fragility
**Symptom:** Eval results show a real Date + Duration + Settings but 0 hits, 0%,
empty Assessment Types, empty Grid Activations — despite the communicator having
answered items.
**Root cause (NOT a broken scoring mechanism):** Every response is recorded as
`assessment.events[working.level_id]` (`eval.js` `log_response`), and `analyze()`
attributes each key via `levels.find(l => l[0].intro == key)`. But `working.level_id`
is assigned ONLY inside `intro_board` (a level's step-0 intro screen). Enter a
mid-level item step WITHOUT that intro — reload, deep-link (`obf/eval-2-5`), or
resume — and `level_id` is stale (`'intro'`) or `undefined`, so answers key under a
section `analyze` can't map → they're silently dropped from the report. The code's
own comment already flagged `working.level_id` as "unreliable (stays 'intro' after
Start)". The keying + analyze logic are UNCHANGED from origin/main, so this is a
latent re-entry bug, not a regression from results-page modernization.
**Fix:** derive it from the current level on EVERY board build, not just the intro:
`if(level && level[0] && level[0].intro) { working.level_id = level[0].intro; }`
placed right after `var level = levels[working.level]`. `level[0].intro` is exactly
the key `analyze` matches on, so this makes scoring survive any entry path (and is
what makes incremental-persistence resume score correctly).
**Confirm at runtime:** `Object.keys(window.current_assesment.events||{})` on the
results page — `"undefined"`/`"intro"` keys (or `{}`) = mis-keyed; real section ids
(`find_target`, …) = correct.

## Pattern: Beta feedback email was already built — wire `ContactMessage#deliver_message`, don't reinvent

Beta feedback submissions save as `ContactMessage` with `recipient: 'beta_feedback'`. The mailer (`AdminMailer#beta_feedback_sent`), templates, screenshot attachment, and `BETA_FEEDBACK_EMAIL` override already existed; delivery was intentionally skipped in `ContactMessage#deliver_message`. Enabling email is a one-line `AdminMailer.schedule_delivery(:beta_feedback_sent, global_id)` — same Resque priority queue + SES path as Contact Us. Screen recordings stay out of the email (too large); note presence and link to `/beta-feedback/admin/entry/:id` instead. Specs had explicit "do not email" assertions that must be flipped when enabling.

## Gotcha: `sync_changed` tmp-ID remap must clone `buttons` before `set` — in-place mutation on `attr('raw')` does not dirty

After offline sync uploads tmp boards/images/sounds, `sync_changed` runs a second pass
(`re_updates`) to rewrite button `image_id` / `sound_id` / `load_board.id` from `tmp_*` to
permanent ids. Mutating the existing `buttons` array in place and calling
`record.set('buttons', buttons)` with the same reference does not reliably mark the
`attr('raw')` attribute dirty in Ember Data 5.x — the follow-up `save()` is skipped and
CI test 1211 (`persistence-sync` temp-ID links) times out waiting for permanent links.
Clone each button (and nested `load_board`) into a new array before `set`, matching the
`[].concat(buttons)` pattern already used in `board.js#add_button`. Touch both
`app/utils/persistence.js` and `app/services/persistence.js`. (2026-07-08)

## Registration consent age threshold lives ONLY on the frontend (2026-07-08)
The COPPA/GDPR parental-consent age gate is computed client-side in
`app/frontend/app/controllers/register.js#_classifyCommunicatorAge`
(`getFullYear() - 13`). The birthdate is NEVER sent to the backend; the client
maps age -> the boolean `coppa_under_13` (via `routes/register.js#saveProfile`
+ `serializers/user.js`), and `User#process_params` (~user.rb:1321) triggers
the parental-consent flow purely off that boolean. So to change the AGE
threshold (e.g. EU 16 vs US 13), you change the FRONTEND cutoff, not the
backend gate. To feed the frontend a jurisdiction-derived number without
duplicating logic: compute server-side and deliver via `domain_settings`
(anonymous-available; injected at `layouts/application.html.erb:61` from the
CACHED per-host `@domain_overrides` blob -> always `.merge` a fresh copy, never
mutate). Anonymous registration reads feature flags from
`window.enabled_frontend_features` (= `ENABLED_FRONTEND_FEATURES`), NOT from
`currentUser.feature_flags` (there is no user yet), so an `AVAILABLE_`-only
flag is OFF for signup by default. See `LingoLinq::Jurisdiction` (PR #556).

## Fresh worktree frontend node_modules breaks on sqlite3 native build (2026-07-08)
`npm install` in a fresh agent-wt worktree fails to compile `sqlite3`
(node-pre-gyp, Cordova/Electron offline path only) under the current Node 20
toolchain and can leave `node_modules/.bin/ember` unlinked, so `ember build`
won't run. sqlite3 is not needed for the WEB target. If a real ember build /
browser drive is required, fix sqlite3 first (rebuild against a compatible
toolchain or skip the optional native dep); a JS ES-module `node --check` is
the cheap fallback to confirm controller/route syntax.

## Ember 4.12→5.12 upgrade (staging #490) shipped under-migrated — 4 break classes
**Context:** staging's Ember 5.12 upgrade left widespread latent breakage (no build/console errors — just wrong/blank UI). Full register: `docs/ember-5.12-migration-findings.md`.
**The 4 runtime break classes to grep for after any Ember 4→5 upgrade with EXTEND_PROTOTYPES:false:**
1. **Array prototype extensions on NATIVE arrays** — `.sortBy/.mapBy/.uniq/.compact/.pushObject/.firstObject/@each/[]` throw/undefined on `[]` (but are fine on Ember Data `hasMany` / `A()`). Fix: native equiv or `A()`.
2. **`@each`/`.[]` + in-place element mutation on native arrays** — silent stale reactivity (a two-way `@checked={{item.prop}}` under `@each.prop` won't fire). Wholesale `set()` is safe. Fix: `A()` at the assignment site.
3. **Template `this.X` with no backing property** — codemod prefixed `this.` onto (a) `{{#each ... as |X|}}` block params → `this.X` hits controller prop, drop the `this.`; (b) `this.app_state.*` where no `app_state` injection → add `app_state: alias('appState')`. Whole regions render blank/wrong.
4. **Modal controllers rewritten as tagless components** — `modal-dialog` calls the `opening` closure in its `didRender` BEFORE the child's `didInsertElement` binds `onOpening`, so `opening()` (builds modal state) no-ops → empty modal / thrown action. Fix: `self.send('opening')` in `didInsertElement` or bind `onOpening` in `init()`. **Missed instance (2026-07-28):** `components/confirm-delete-user.js` left `user` null → Delete User Account threw `Cannot read properties of null (reading 'user_name')` on staging; same Class‑4 fix. Grep for converted modals that bind `onOpening` in `didInsertElement` but never `send('opening')`.
5. **Ember Data 5.x removed `store` auto-injection into CONTROLLERS** — controllers calling `this.store.query/createRecord/...` without `store: service('store')` get `this.store === null` → route "Failed to load" (`Cannot read properties of null (reading 'query')`). Routes are fine (global `LingoLinq.store` or inherit from `routes/index.js`); components already inject. Fix: add `store: service('store')` to the controller. Grep: `grep -rlE "this\.store\b|_this\.store\b" app/controllers app/components` minus files that inject it.
**Gotchas:** duplicate modules (`utils/*` ↔ `services/*` for persistence/stashes) and controller/component twins (modeling-ideas, batch-recording, button-set, quick-assessment) — fix BOTH; one twin is often already migrated. Build + template-lint DON'T catch any of these — must exercise the UI path.

**Remediation notes (2026-07-09, all 4 classes fixed — 96 files, `ember build` green):**
- **Detect dead twins/templates before fixing.** The legacy modal *controllers* (`controllers/modals/{assessment-settings,focus-words,modeling-ideas}.js`) are DEAD — zero refs, no `templates/modals/*.hbs`, and modal.js says "All modals use component-based rendering." Fix the live `components/*` twin instead. Likewise a route with `templateName:'board/index'`/`controllerName:'board.index'` (e.g. `routes/user/board-alt/index.js`) makes its OWN `templates/user/board-alt/index.hbs` dead — don't create a controller for it; it renders through the borrowed controller. Check `templateName`/`controllerName` on the route and whether the file is referenced before "fixing" it.
- **Class 4 no double-invoke:** modal.js's legacy `if(controller.opening) controller.opening()` (`ModalController` path) only fires for a top-level `opening` *method*; action-only components have `controller.opening === undefined`, so adding `self.send('opening')` in `didInsertElement` is the sole trigger (no duplicate). `save-snapshot` has a top-level `opening()` + an action that delegates to it — still needs the `send`.
- **Class 2 fix location matters:** `A()` only fixes `@each` when the array is *created at the fix site* (a computed's `return`, or an `init`/`opening` `set`). Wrapping a computed's *output* does NOT fix a dependency keyed on a *model's* raw array (e.g. `org_or_user.start_codes.@each.disabled`) — the dep still points at the raw source. If the mutation is always followed by a wholesale `reload()`/`set()` (fires `.[]`), there's no user-visible bug; skip rather than add an ineffective wrap.
- **`arr.uniq(fn)` was already identity-dedup:** Ember's `uniq()` takes NO arg — a passed key fn was silently ignored even under 4.12 (prototype extensions). So `[...new Set(arr)]` (identity) *preserves* behavior; a keyed dedupe (`uniqBy`-style) is a behavior CHANGE, not a migration fix. Don't "fix" the latent intent during a migration.
- **`.compact()` ≠ `.filter(Boolean)`:** compact drops only `null`/`undefined`; use `.filter(x => x != null)` to keep `0`/`''`.

## English i18n renders the INLINE `{{t "default"}}`, not en.json-only edits
**Context:** goal-form restyle — changed several strings (Title-Case headings, "Enable badge rewards", "Custom tracking", removing a comma) by editing ONLY `public/locales/en.json`. They did NOT show in English; the user still saw the old inline text.
**Why:** `app/frontend/app/utils/i18n.js:50` resolves `langs[preferred][key] || langs[fallback][key]` and, when that misses (or the browser's cached locale predates your edit), falls back to the literal string passed to `{{t "inline default" key='k'}}`. In practice the **inline default is the source of truth for English**; en.json is consumed for OTHER locales (generated FROM the inline defaults by `i18n_generator.rb`).
**Fix:** change BOTH the inline default in the `.hbs`/`.js` AND the en.json value, together — same pattern that worked for the landing-alt copy. Editing en.json alone is silently ineffective for English. Quick check: if a copy change isn't showing after reload, grep the template for the `{{t "..." key='k'}}` and update the inline string too. (2026-07-13)

## Modernizing a form that embeds a shared Bootstrap-grid component (badge-settings)
**Context:** the goal editor embeds `badge-settings` (used by 4 badge editors), built entirely on Bootstrap `.form-horizontal` + `.col-sm-*`.
**Gotchas:**
- Dropping `form-horizontal` from the wrapping `<form>` collapses the component's grid into a scattered mess — keep the class (the component was designed for it) even on an otherwise-modern form; your own fields use their own classes and are unaffected.
- To flatten the grid cleanly, scope overrides to the form: `[class*="col-sm-"] { float:none; width:auto; margin-left:0 }` (kills offsets) and make `.form-group` a `display:flex; flex-wrap:wrap`. Align rows with a fixed label column via `[class*="col-sm-"]:has(.form-control-static) { flex: 0 0 210px }`.
- `overflow:hidden` on the editor card (added to clip a header bg) **clips open `bound-select` popups** — round the header's own corners instead and drop the card overflow; `bound-select` is a custom `<div>`, not a native `<select>`, so target `.bound-select`/`.bound-select__list` for width.
- Restructuring the component's template modernizes ALL its consumers at once — preserve every action/conditional/`bound-select`, keep the complex conditional rows verbatim, and lint for block balance. (2026-07-13)
## Gotcha: persistence-sync Jasmine harness — wait for `sync_boards` tail / `syncSettled`, not only the `sync()` promise

Recurring Ember CI flakes (timeout / async-work-not-finished) in `persistence-sync-test.js` often look like PR regressions but are harness races: `persistence.sync()` can resolve while real board traversal (`enableRealSyncBoards` / `sync_boards`) and remap/tail work are still running. Passing siblings already use `primeBoardRevisionsSyncHarness(function(){ tailDone = true; })` and wait `done && tailDone`; tests that call the harness with no callback and wait only on `done` assert/cleanup early. Post-`sync()` fixed `later(..., 50)` plus immediate `cancelSyncTailWork()` has the same shape for temp-id rewrite. Prefer `waitForSyncDoneAndSettled(done)` (`done && syncSettled()`) plus the board-sync completion callback, and only cancel tail work after permanent IDs are visible. See `docs/task-management/2026-07-13-ember-ci-persistence-sync-harness-wait.md`. (2026-07-13)

**UPDATE (2026-07-22) — the `waitForSyncDoneAndSettled` gate is NECESSARY but NOT SUFFICIENT; the
flake is deeper (still live).** Deep re-investigation: the flake survives even on FULLY-gated tests
(e.g. `not try to download boards that match the fresh revision`). Runtime evidence on a failing
`persist important ids`: `syncDone=true settled=true important_ids=null` — and since `important_ids`
is set only on the sync SUCCESS path (`persistence.js:2335`), this proves **the victim test's own
`persistence.sync()` intermittently REJECTS.** Root cause: a PRIOR test's late-resolving async
(`store_url`/`find`/`save` promise) bleeds into the shared `persistence` singleton and corrupts a
LATER test's sync into rejection / never-settling. No per-test wait predicate can fix this — the
singleton is dirtied BEFORE the victim runs. What DIDN'T work (tried & reverted): a
drain-before-teardown in the shared `tests/helpers/jasmine.js`, a defensive `beforeEach`
`cancelSyncTailWork()`, and adding `refresh_after_eventual_stores.waiting` to `syncSettled()` — the
last made it WORSE (that flag sticks `true`, so `syncSettled()` never returns true and HANGS gated
tests). Across batches the rate stayed ~17–33% regardless. The fix is EPOCH-FENCING the async tail (a
promise resolving after its test ended must no-op, not touch the next test's state). SHIPPED as
TEST-HARNESS ONLY (persistence.js unchanged): a per-test `LingoLinq.sync_epoch` stamped in the
jasmine shim + a stub-traversal fence in `sync-test-cleanup.js` that no-ops stale `findRecord.then`/
`store_url` work + the real-boards wait-gate completion. This cut the flake from ~25% to low single
digits (residual: one real-boards test, `not try to download … fresh revision`, whose own sync
promise is intermittently orphaned by the REAL sync_boards in-flight race — not harness-fixable
without prod surgery). That residual is then ABSORBED by a module-scoped auto-retry in the jasmine
shim (`test_wrap`): persistence-sync tests ONLY (name-gated; all other modules keep the original
path — zero blast radius) run up to 3 attempts, buffering QUnit results and reporting only the final
one, with a per-attempt hang cap under a raised `assert.timeout`. Abandoned attempts self-terminate
via the existing `runs()` `id == current_test_id` guard. Net: 0 failures across ~40+ module runs,
production code untouched. (Retry masks only a proven-timing flake — a genuinely broken test fails
all 3 attempts and is still reported.) DEAD ENDS (reverted): guarding
`schedule_sync_board_step` (no-op'd a scheduled nextBoard → hung the real sync); adding
`refresh_after_eventual_stores.waiting` to `syncSettled()` (flag sticks true → hangs gated tests);
a defensive `beforeEach cancelSyncTailWork()` (pre-cancel can orphan the next sync). Verify any flake
fix over ≥30 iterations AND on the full suite — variance is huge, 15 green runs prove nothing.
(2026-07-22)

## Gotcha: `EXTEND_PROTOTYPES: false` (set by the 5.12 upgrade) — Ember array/string methods on NATIVE receivers throw

The Ember 5.12 upgrade (PR #490) changed `config/environment.js` `EXTEND_PROTOTYPES: {…}` → **`false`**. So Ember's array/string prototype extensions (`.pushObject`, `.sortBy`, `.mapBy`, `.filterBy`, `.uniq`, `.compact`, `.toArray`, `.camelize`, etc.) are **not installed on native `Array`/`String`** — calling them on a plain `[]`/`''` is `undefined` → `TypeError`, not a deprecation. They work ONLY on an `A()`-wrapped array (`import { A } from '@ember/array'`) or an Ember-Data collection (`ManyArray`/`RecordArray`). Consequences when auditing:
1. The `deprecate-array-prototype-extensions` warning (until 6.0) **cannot fire here** — the extension path isn't installed. Don't chase it as a live deprecation.
2. Grep hits for these methods split into: **safe** (`A(...)`-wrapped, ED collection, or guarded by `typeof x.method === 'function'`) vs **broken** (native receiver). Only the native-receiver ones are real bugs — and they're outright `TypeError`s, so check reachability.
3. When fixing a real native-receiver site, wrap the receiver in `A()` (matches existing repo precedent, e.g. `components/modeling-ideas.js:78 A(follow_ups).sortBy`) or convert to native JS. `A(x).uniq()`/`.sortBy()` return a **native** array, so a following `.compact()`/`.uniq()` must be native (`.filter(v => v != null)`) — don't chain another Ember-array method onto the result.

**Corollary — dead legacy modal controllers.** Many `controllers/modals/*.js` were "Converted … to component" during the modal-system migration: the live path is now `components/modal-container.js`'s `convertedModals` list → the `components/` version; `templates/modals/*.hbs` no longer exists. Same-named `controllers/modals/X.js` are orphaned and never instantiated, so any breakage in them (e.g. native-array `TypeError`s the upgrade missed) never executes. Before "fixing" a modal controller, confirm it isn't a converted-to-component corpse — check `convertedModals` and whether a `components/X.hbs` exists. See `docs/task-management/2026-07-14-ember-5-12-full-deprecation-audit.md`. (2026-07-14)

## Gotcha: the board-detail view has THREE distinct "sidebars" — confirm which before styling

`templates/user/board-detail.hbs` renders three different things a user might call "the sidebar":
1. **`.md-board-detail-sidebar`** — the left NAV column (`<aside aria-label="Board navigation">`,
   Communicate / Clinical / Settings). Left grid track of `.md-board-detail-layout`
   (`grid-template-columns: 194px 1fr 194px`). Shown `{{#unless model.integration}}`; `display:none`
   in EDIT mode.
2. **`.md-board-detail-right-panel`** — the RIGHT grid column (3rd 194px track).
3. **`.md-board-detail-inline-sidebar`** — a thin (`width:100px`) quick-nav strip of board
   thumbnails, a FLEX child of `.md-board-detail-grid-sidebar-wrap`. Renders only when
   `inlineSidebarOpen` (the `quick_sidebar` preference) is true, `{{#unless edit_mode}}`.

"Reduce/hide the sidebar" is ambiguous across these — **ask or inspect which element** before
editing; don't assume the left nav. Styling the wrong one produces correct-looking CSS that
"does nothing" on screen. Also note the layout difference that dictates the hide technique: the
3-col grid is AUTO-FLOW (no grid-template-areas), so `display:none` on a grid-child sidebar
mis-slots the board into the vacated track — collapse the track instead; but the inline sidebar is
a plain flex child, so `display:none` reflows cleanly. To hide "temporarily without changing the
user's preference," key the CSS off the transient state class (`.md-shell--board-collection` =
`board_collection_open`), never the persisted `--collapsed` / `quick_sidebar` state. See
`docs/task-management/2026-07-14-board-collection-lang-column-narrow.md` Change 5. (2026-07-14)

### Board `user_id` query param resolves via `find_by_path` — pass the real global id, never `'self'`
`boards_controller#index` resolves the `user_id` query param with
`User.find_by_path(user_id)`, which routes a non-digit string to
`find_by(user_name: ...)` and only routes a digit-leading global id (`1_1`) to
`find_by_global_id`. There is no user named `self`, so `?user_id=self` returns nil
→ `exists?` 404s → the owned-boards query comes back empty. The literal `'self'`
DOES work for `store.findRecord('user', 'self')` (persistence.js special-cases it),
but NOT for the boards index `user_id` param. To load a user's owned boards, pass
`app_state.get('currentUser.id')` (what the working `board-collection` drawer does),
not `'self'`. A `.length`-gated section will silently vanish when this is wrong;
an always-empty "None found" state can hide the same bug for years.
See `docs/task-management/2026-07-15-search-my-boards-empty-self-userid.md`. (2026-07-15)

### A generic preventDefault-and-drop action wrapper silently breaks `<input>` handlers
Some components (e.g. `search-board-jump.js`) define a `ctrlAction(name)` helper
that wraps click actions: it calls `event.preventDefault()` and then POPS the DOM
event off the args before `send()`. That's correct for buttons, but any handler
that needs the event — `input` (reads `event.target.value`), `keydown` (reads
`event.key`) — receives `undefined` and silently no-ops (a text field that won't
accept typing). Bind input/keydown to dedicated event-preserving closures
(`this.handleInput = e => self.send('update_query', e)`), NOT the click wrapper.
See `docs/task-management/2026-07-15-search-my-boards-empty-self-userid.md`. (2026-07-15)

### Overriding a compound-class `!important` base (e.g. `.md-btn--primary`) needs ≥ its specificity
`.md-btn--primary.md-btn--pill` sets `background`/`border-color`/`color` with
`!important` at specificity (0,2,0). A page-scoped override like
`.ub-find-board__create` (0,1,0) that ALSO uses `!important` still LOSES —
`!important` vs `!important` is resolved by specificity, and source order is
irrelevant when specificity differs (a `@use`d partial emitting before app.scss
does not matter here). The override silently applies nothing (button keeps the
pale base wash). Fix: include the base's classes so the override matches/exceeds
it — `.ub-find-board__create.md-btn--primary.md-btn--pill` (0,3,0), and the
`:hover`/`:focus-visible` variants likewise (0,3,1) to beat the base's (0,2,1).
See `docs/task-management/2026-07-15-search-my-boards-empty-self-userid.md`. (2026-07-15)

### A canvas sized from a parent measurement re-renders wrong on route re-entry
`board-preview-canvas` sets its dimensions from the parent's measured height
(`getBoundingClientRect().height − 96`). That measurement is only reliable once
the layout has settled. When the rendering trigger is a singleton controller
property that survives navigation (e.g. `preview_board`, never reset on route
exit), the component re-inserts on route RE-ENTRY and measures a still-transitional
(short) parent → the element caps to a wide-short strip and the board letterboxes
tiny. First visit hides the bug because the user only triggers render after layout.
Fix pattern: a `ResizeObserver` on the PARENT (not the self-sized element) that
re-renders when the container settles — deterministic, no rAF/setTimeout guessing,
and it also fixes window-resize sizing. Guard with a <2px no-op check to prevent
loops. See `docs/task-management/2026-07-15-search-my-boards-empty-self-userid.md`. (2026-07-15)

### Modernizing a Bootstrap input+dropdown combobox → native <datalist>
When replacing a Bootstrap `input + .btn-group.dropdown` "type-or-pick" control
in a modal, a native `<input list="x"> + <datalist id="x">` preserves BOTH free
text and preset suggestions with zero JS and no bootstrap — the cleanest modern
swap. Caveat: selecting a datalist option only updates the bound input value, so
any SIDE EFFECT the old dropdown action performed (e.g. external-device's
`set_vocab` also auto-filled Vocab Size from the preset's `buttons`) is lost —
re-apply it via an `{{on "change" ...}}` handler that re-matches the value
against the option list. Modern modal field classes already exist:
`md-modal-field` / `md-modal-label` / `md-modal-input` / `md-modal-select` /
`md-modal-hint` / `md-modal-btn(--primary/--cancel/--secondary)`; add
`md-modal-segment`/`__option(--active)` for a two-choice toggle (replaces
`.btn-group`). (2026-07-15)

### `<datalist>` + `{{#each ... as |option|}}` — never name the block param `option`
Rendering `<option value={{option.name}}>` where `option` is ALSO the each block
param shadows the native `<option>` HTML element. Glimmer flags it
`no-shadowed-elements` ("Ambiguous element used") and throws an UNRECOVERABLE
render error at runtime — the whole app then spams "Attempted to rerender, but
the Ember application has had an unrecoverable error occur during render." The
page that hosts the component may still paint (the error fires when the
shadowing template actually renders — e.g. when a modal opens), which makes it
look unrelated. Fix: rename the block param (`as |opt|` → `<option value=
{{opt.name}}>`). Catch these fast with `npx ember-template-lint <file.hbs>`
before blaming data/JS. (2026-07-15)

### Ember 4.x/5.x removed implicit-`this` fallback → bare `{{prop}}` throws an UNRECOVERABLE render error
A bare property reference in a classic `.hbs` template — `{{board-icon board=home_board_pref}}` or `{{home_board_pref}}` where `home_board_pref` is a CONTROLLER/component property (not `this.`, not `@arg`, not a block param) — worked in Ember 3.28 via the implicit-`this` fallback. Ember 4.x/5.x REMOVED that fallback, so the bare word is now resolved as a HELPER, isn't found, and throws:
`Attempted to resolve a helper in a strict mode template, but that value was not in scope: <name>`
This is an UNRECOVERABLE render error — Ember then halts and every nav link changes the URL but can't re-render, so the whole app looks frozen/dead (looks like "navigation is broken," but it's a render throw).
LATENT + dangerous: it only fires when the specific branch that contains the bare ref actually renders. So a page can work for years until a data state (or an unrelated edit that changes which `{{else if}}` branch renders) reaches that line. Example: `marcus_williams_slp` never rendered the `home_board_pref` line because they hit the External AAC branch first; removing that branch dropped them into it and exposed the upgrade bug.
Fix: add `this.` (`board=this.home_board_pref`). To find these BEFORE they ship, the `no-implicit-this` template-lint rule catches them — it is NOT enabled in this app's `.template-lintrc.js`, which is why they slip through. Diagnose a frozen app by getting the RED console error (Pause on Caught Exceptions, or filter to errors) — the "Attempted to rerender" spam is downstream noise. See account-page fix 2026-07-15 (`templates/user/index.hbs:149`). (2026-07-15)

### Scanning for implicit-`this` bugs: ember-template-lint is UNRELIABLE on large legacy templates — cross-check with grep
`no-implicit-this` IS enabled in this repo (`.template-lintrc.js` extends 'recommended') but is NOT enforced by `ember serve`, so violations ship. Worse: when scanning for them, ember-template-lint SILENTLY MISSES the violation in several large legacy route templates (`templates/user/index.hbs`, `templates/user/preferences.hbs`, `templates/trends.hbs`) — it flags the exact same `arg=bare_prop` line in a small temp file but reports 0 for these files (not a cache/ignore/inline-disable issue; unexplained scope-tracking miss on big files). So do NOT trust a green ember-template-lint run as proof there are no implicit-this bugs. Cross-check with grep for the property-shaped patterns: bare `{{snake_case}}` mustaches, `arg=snake_case` values, and `{{#if/each/let snake_case}}` — then rule out block params (`{{#each x as |name|}}`, `{{#let x as |name|}}`), helper INVOCATIONS with args (`{{date_ago x}}`, `{{is_equal a b}}`), component invocations (`{{subscribe}}`, `{{masquerade}}` = real components), and i18n interpolation param names (`board_key=this....`). The 2026-07-15 sweep found 6 real bugs across 3 files (home_board_pref ×1, *_keycode_string ×4, elem_style ×1) that the linter missed entirely. (2026-07-15)

## Gotcha: a single-quoted `i18n.t` default silently DELETES the key on the next generator run

**@MelissaOneil / @scot — flagged 2026-07-16.** `CLAUDE.md` says user-facing strings must use
double quotes and that this is "CRITICAL — i18n generator depends on it". This is the concrete
failure it prevents, and it is silent.

`i18n_generator.rb`'s JS parser reads the key between single quotes, then scans **past the comma
for a `"`** to find the default string (see `i18n_generator.rb` ~L95–140). Given
`i18n.t('key', 'Default')` it never finds a double quote, skips the string entirely, and the key
is therefore absent from the regenerated `en.json` — i.e. **`--generate` deletes it**, along with
its translations in all 13 locales. The generator reports success while doing this
(`TOTAL DUPS 0 / MISSING 0`).

This had already bitten us: running `--generate` on 2026-07-16 removed **286 keys, 17 of them
still in use** — all core AAC user-facing settings (`opensymbols`, `lessonpix_library`, `pcs`,
`twemoji`, `noun_project`, `arasaac`, `tawasol_library`, `text_above_pictures`,
`text_below_pictures`, `no_pictures`, `show_words`, `show_symbols`, `show_more_libraries`,
`clear_background`, `always_white_background`, `always_black_background`,
`high_contrast_black_background`). Fixed in `d71fe1c87` by correcting the quotes at the 31
offending call sites (`controllers/setup.js`, `(components|controllers)/swap-images.js`); after
the fix, `--generate` removes 269 keys and **0** of them are still referenced.

**Why it survives unnoticed:** a key only disappears if *every* reference uses a single-quoted
default. Keys referenced correctly somewhere else are still found, so the violation lies dormant.
**~291 single-quoted defaults remain across ~69 files** — each a latent landmine with this exact
failure mode.

**Before running `ruby i18n_generator.rb --generate`, always diff the key set** (regenerate, then
compare against every key actually referenced in source) instead of trusting its "0 missing" output.
See §2.10 of the pre-merge checklist for the grep.

## Gotcha: ember-template-lint rewrites `.lint-todo` on a PLAIN run, and line shifts orphan unrelated violations

Two independent traps in the same tool; both cost real diagnosis time on 2026-07-16.

**1. A plain `ember-template-lint .` auto-cleans resolved todos** — it silently rewrites the
*tracked* `.lint-todo`. You do not need `--update-todo` to mutate it. Confirmed by
`git diff -- app/frontend/.lint-todo` showing `17 insertions, 0 deletions`, i.e. every `remove|`
line came from my own read-only-looking lint runs. **Use `--no-clean-todo` for any check you intend
to be read-only.**

**2. Todo↔violation matching survives line shifts only sometimes, and the failure lands somewhere
else entirely.** Inserting 2 lines at `button-settings.hbs:794` shifted `<form>`s at 1016/1162/1230
to 1018/1164/1232 (those still matched), but orphaned the violation at line **369** — 400 lines
*above* the edit, in a rule (`no-duplicate-landmark-elements`) unrelated to the change. Symptom is
self-contradictory: a hard error at 369 *plus* `invalid-todo-violation-rule` claiming that same
todo "passes". Do not hand-patch `remove|` lines; **re-baseline the file**:
`rm .lint-todo && npx ember-template-lint . --update-todo` (→ clean adds / 0 removes).

**Diagnostic discipline this forces:** when the tool under test mutates its own baseline, an A/B
experiment against the working tree is worthless — I twice "proved" the error was pre-existing
using a `.lint-todo` the linter had already corrupted. The only sound test is against a pristine
`git show HEAD:<path>` copy of **both** the source and the baseline. Restore from HEAD before
concluding "not mine".

## Gotcha: nested `app/frontend/.github/workflows` never runs on GitHub Actions

Only the **repository-root** `.github/workflows/` is executed. A CI file under
`app/frontend/.github/workflows/` (added during the Ember 4.12 upgrade with `lint:js && lint:hbs`)
is dead decoration — it has never gated a PR. When auditing “is X in CI?”, read the **root**
workflow end-to-end; do not trust a nested copy. The ESLint root gate landed separately as
`npm run lint:js:ci` + `.eslint-todo` (see [`2026-08-07-eslint-ci-gate.md`](./2026-08-07-eslint-ci-gate.md)).

## Gotcha: ESLint baseline must be `.eslint-todo`, not shared `.lint-todo`

`ember-template-lint` owns and **rewrites** `app/frontend/.lint-todo` on a plain run. Putting
ESLint fingerprints in that file would race with template lint. Use a separate
`app/frontend/.eslint-todo` consumed only by `scripts/eslint-todo-gate.js` (`lint:js:ci` /
`lint:js:todo`). CI never regenerates the baseline; intentional rebaselines are explicit commits.

## Gotcha: `.eslint-todo` fingerprints include line numbers — edits look like “new” lints

`eslint-todo-gate` fingerprints `file|ruleId|line|column|severity|messageHash`. Inserting imports,
guards, or tests in a file that already has grandfathered findings (especially large ones like
`board-detail.js` / `app-state.js`) produces a flood of `ember/no-runloop` “NEW” rows even when no
new runloop call sites were added. Diagnose before migrating: compare counts of
`file|ruleId|messageHash` (ignore line/column). Line-only churn → fix any truly new violations,
then `npm run lint:js:todo`. Do not treat a line-shift storm as a mandate to adopt ember-lifeline
in the same PR. Recurred on `perf/melissa-boards-page-pass2` (`new=41`, 3 truly new). See
[`2026-08-10-eslint-todo-line-shift-boards-perf.md`](./2026-08-10-eslint-todo-line-shift-boards-perf.md)
and [`2026-08-18-eslint-todo-line-shift-boards-page-pass2.md`](./2026-08-18-eslint-todo-line-shift-boards-page-pass2.md).

## Pattern: fix `require-input-label` by wiring the EXISTING label with `{{unique-id}}` — not by promoting the placeholder

The obvious fix (`aria-label` derived from `placeholder`) is wrong for a large subset, for two reasons.

**Many flagged inputs already have a visible label that just isn't associated** — it declares
`for="code"` with no element carrying that id, or has no `for` at all. Wiring it beats an aria-label
on every axis: zero new i18n keys, no visible text change, and it restores click-label-to-focus.
Check this bucket *first*.

**Placeholders are often hints, formats, or examples — not names.** `"(optional)"`, `"HH:MMam/pm"`,
`"email@example.com"`, `"YYYY-MM-DD"` become useless accessible names ("(optional), edit text").
Every one of those four turned out to sit beside a real label anyway.

Wire with Ember 5.12's built-in `{{unique-id}}` (in `BUILTIN_HELPERS`; no addon needed):
```hbs
{{#let (unique-id) as |id|}}
  <label for={{id}}>{{t "Code" key="code"}}</label>
  <input id={{id}} …>
{{/let}}
```
Static ids are a latent bug in any component rendered more than once — `pick-license.hbs:21` still
carries a prior dev's comment: *"Ember is now barfing if I add more than one element with the same
id, so changed to refid for now"*. But **grep JS before replacing an existing static id**: some are
load-bearing (`button-settings.js:1199` `getElementById('fill')`/`('border')`,
`start-codes.js:171` `querySelector('#qr_code img')`). Ember *property* names (`this.set('home_board', …)`)
are false hits — match on DOM lookups only.

**Analyzer caution:** a proximity walk up the ancestor chain invents false pairings — it matched a
*"Contact Name"* field to an unrelated `"Name"` label 4 levels up, and a search box to a
`"Show Ideas For:"` label in a different section. Only trust a pair when the field group contains
exactly ONE label and ONE control; eyeball the rest.

## Pattern: order-dependent dictionary matching — exact matches must beat predictive/fuzzy ones

`utterance.contraction()` (frontend) walked a single `for...in` over the contractions dictionary,
mixing two kinds of match in one loop and short-circuiting on the first (`if(!res)`):
- **exact:** last two words equal a key (`"it is"` → `it's`)
- **predictive:** last one word equals a key's first word (after `is`, offer `"is not"` → `isn't`)

Because `for...in` iterates in insertion order and the dict lists `"is not"` before `"it is"`, the
*predictive* branch of the earlier entry fired before the *exact* entry was ever reached — so
"it is" produced `isn't`. The bug is invisible until two dictionary entries share a leading word AND
the fuzzy one is listed first; changing dict order would mask or move it, which is exactly why it's
fragile.

**Rule:** when a lookup has both an exact and a fuzzy/predictive tier, run them as **separate passes
— all exact matches first, fuzzy only if none matched** — never as one order-dependent loop. Don't
let iteration order decide precedence.

**Testing note:** this lived in a plain util (`utterance.js`), not a component, so it was unit-testable
via the existing `setRawButtons([...])` harness in `tests/utils/utterance-test.js` — no rendering, no
hang. Util-level logic bugs found during UI verification should get a util test (regression guard +
proof the preserved branch still works), since the app's component-rendering tests hang (see the
field-wrapper note in the template-lint working log).

## Pattern: DDAU without {{mut}} — the set-value helper; and Glimmer components are untestable here

Migrating curly component invocations to angle-bracket (`no-curly-component-invocation`) breaks any
component that relied on curly's implicit TWO-WAY `value=` binding (password-field, key-code-text-field,
lowercase-text-field, login-form fields, …). The fix is DDAU, and the idiomatic 5.12 way — WITHOUT the
discouraged `{{mut}}` — is a one-way `@value` in + an `@onChange` callback out:

    <FieldWrapper @value={{this.x}} @onChange={{set-value this "x"}} />

`app/helpers/set-value.js` returns a setter closure `(v) => set(target, path, v)` — the companion to
`set-field` (which reads the value off a DOM event; set-value takes the value directly). The child
component calls `this.onChange?.(newValue)` (Glimmer) or `this.emitChange` (classic) on input/change.

**Two component-authoring rules learned:**
1. **A component that has (or needs) a unit test must stay a CLASSIC `@ember/component`.** `@glimmer/component`
   (1.1.2 here) CANNOT be instantiated outside a rendering context — `new X(owner, {})` and
   `factoryFor('component:x').create()` both throw "You must pass both the owner and args to super()",
   and rendering tests hang in this app (see the field-wrapper note in the template-lint log). So a
   Glimmer component's actions/getters are untestable here. DDAU works in classic too: define a bound
   closure in `init` (`this.emitChange = (e) => self.onChange?.(e.target.value)`) and wire it with
   `{{on "input" this.emitChange}}` — a plain closure survives `{{on}}` where a classic METHOD would
   lose `this` (see [[the password-field ctrlAction regression]]).
2. **A component that writes through a service, not a caller property, needs NO @onChange.** label-field
   writes label edits through `editManager.change_button()`, so its `@value` is input-only — converting
   it required only the invocation change, not a DDAU callback.

**Verifying a DDAU conversion:** the native input always *shows* what you type (browser draws it), so a
broken write-back is invisible while typing — it only surfaces on submit/save/use. Test the submit path,
not the typing. login+register validate password-field/lowercase-text-field + the shared set-value
mechanism in one action; label-field needs a board-label edit (its editManager path is separate).

## Gotcha: store.push does NOT overwrite a dirty attr('raw') in EmberData 5.3 — use set()

find-button's search returned zero results after the 5.12 upgrade. Traced via console diagnostics
(input→onChange→searchString→observer→search all fire correctly): the buttonset being searched had
`get('buttons').length === 0` even though the local walk collected 2043 buttons. Root cause:
find-button builds a local buttonset (`_buildLocalButtonSet`) and does
`store.push({data:{type:'buttonset', id, attributes:{buttons: all_buttons}}})` — but under EmberData
5.3, `store.push` will NOT overwrite an attribute that was previously locally `set()` (dirty). A prior
`bs.set('buttons', [])` left `buttons` dirty-empty, so the push silently no-op'd on that attribute.
**Fix:** after the push, `record.set('buttons', all_buttons)` — mirroring the server-load path
(`BoardDownstreamButtonSet.load_buttons` uses `bs.set('buttons', buttons)`, which is why server-loaded
sets always had buttons and locally-built ones didn't). Rule: to populate an attr('raw') on a record
that may already exist dirty, use `.set()`, not `store.push`.

Companion 5.12 breakage in the same feature: the search box was `{{focus-input value=this.x}}` on the
DEPRECATED @ember/legacy-built-in-components TextField, whose two-way `value=` binding stopped updating
in 5.12 — so `searchString` never changed and the observer never fired. Replacing focus-input with a
Glimmer component + native input + DDAU (@value/@onChange via set-value) fixed that half. A feature can
have MULTIPLE independent 5.12 breakages stacked; fixing one reveals the next. Diagnose each layer with
targeted console logs before concluding.
## Gotcha: Textarea `@value` on a get-only computed crashes on keystroke — needs a setter/cache

Org Settings → Home Boards bound `<Textarea @value={{this.home_board_key_lines}}>` to a **get-only** computed that joined `model.home_board_keys`. Typing tried to `set('home_board_key_lines', …)` and threw `Cannot read properties of undefined (reading 'call')` (missing Ember computed setter). Fix: writable computed with a `_home_board_key_lines` edit cache, cleared in `opening()` / after save. Related: pasted modern board URLs (`/:user/board-detail/:slug`) are not board keys until host + `board-detail`/`board` segments are stripped to `owner/slug` — do that in both the settings save normalize and `Organization#process`. See `docs/task-management/2026-07-16-org-home-board-key-lines.md`. (2026-07-16)

**Decide by whether the field is actually edited (2026-07-20, "Class 11" sweep — 3 more of these found & fixed).** The same crash appears wherever the input-codemod stapled a `set-field`/`set-value` write-back onto a get-only computed. There are TWO correct fixes, and picking the wrong one adds dead machinery:
- **Field IS edited** (user types, value is consumed) → `{get,set}` computed with a `_`-prefixed edit cache, mirroring `substitution_string` (`controllers/user/preferences.js:645`) and `word_lines` (`components/modify-core-words.js:85`). The getter returns the cache once set, else derives from source; the setter stashes raw text. Accept the `require-computed-property-dependencies` eslint WARNING on the `_`-cache — declaring it as a dep would defeat the cache (same warning rides `substitution_string`). Trace that downstream consumers still work: for `word_lines`, `parsed_words`→`save()` reads the cache while `save_disabled` still keys off the untouched source array — behavior-identical to the pre-4.0 clobber.
- **Field is display-only** (iframe embed snippet, off-screen clipboard mirror) → do NOT add a setter. Make it one-way: drop `@onChange`/the `{{on "input" (set-field …)}}` and add `readonly`. `FocusInput` guards with `this.args.onChange?.()` so dropping `@onChange` is safe; `readonly` inputs still `.focus().select()`+`.val()` for copy. Fixed this way: `share-board.hbs:43` (`board.embed_code`), `share-utterance.hbs:20` (`sentence`).
- The crash only fires on a REAL keystroke; Glimmer components can't be render-tested in this app (see the DDAU/untestable learning), so `ember test` green is necessary but not sufficient — a manual open-modal-and-type is still owed. See `docs/task-management/2026-07-15-template-lint-convention-migration.md` (Session 4). (2026-07-20)

## Gotcha: Ember `<Input>` checkboxes need `@type`, and bound-select must stopPropagation

`<Input type="checkbox" @checked={{…}}>` renders as a text field (`ember-text-field`, `type="text"`) — the HTML `type` attr is not the component arg. Use `@type="checkbox"` (as organization/settings already does). Separately, `bound-select`'s `ctrlAction` helper used to `preventDefault` then **pop the event** before `send`, so `toggle`/`choose` never received it and never `stopPropagation`'d — clicks bubbled into `modal-dialog` and selects looked dead. Match `modern-select`: keep the event, stopPropagation, and make `.md-org-settings-field > span` `display:block` so the `tagName:span` wrapper doesn't shrink the hit target. See `docs/task-management/2026-07-16-org-home-board-key-lines.md`. (2026-07-16)

## Gotcha: sync double `modal.open` — the *second* template wins; do not invent write-loss on the winner

When `setupController` opens `terms-agree` then falls through to `modal.open('intro')` in the same run loop, Ember’s final `currentTemplate` is `intro`: the *first* modal never mounts; the *second* does, so its `init()` side effects (`show_intro` clear, `intro_watched` save) still run. Claiming “durable write loss” on the winner inverts the victim. Remaining real defect is consent *presentation* (terms skipped that visit; `terms_agree` stays false — no false-positive record). Same fall-through exists in `routes/bento.js`. See `docs/task-management/2026-07-23-terms-agree-intro-finding-correction.md` and register `LL-53cb93fab1`. (2026-07-23)

## Pattern: EU AI under-16 consent is a third blob, not COPPA signup

EU under-16 AI enablement (`settings['eu_ai_parental_consent']`) is separate from COPPA account activation (`settings['coppa']`) and AI VPC data-sharing (`settings['ai_consent']`). Mirror COPPA token/`with_lock`/`AuditEvent` patterns for grant/revoke, but the complete controller must NOT mint devices or welcome emails — those are account-activation side effects. Persist country via `LingoLinq::Jurisdiction.trusted_country` (ISO alpha-2 only) and always recompute `eu_under_16` server-side from country + under_16; ignore client `eu_under_16`. Prefer-gate AI through `FeatureFlags.ai_feature_enabled_for?` (COPPA + EU + prefs) and keep thin call-site eu/coppa checks for defense in depth. Store allowlisted `requested_features` on request; apply them onto `settings['preferences']` inside the same `grant_eu_ai_parental_consent!` lock that records grant; on revoke force `EU_AI_PREF_KEYS` off. Prefs UI opens a modal (not an inline form) via `gate_ai_enable` → `modal.open('eu-ai-parental-consent')`. **Do not raise signup `coppaConsentAge` to 16 for EU** — that reused COPPA account-activation parent email for Art. 8; product intent is account create without parent email, AI consent only after login. Register keeps literal under-13 for `coppa_under_13`; `_classifyUnder16` + country drive `eu_under_16`. Register product-improvement force-off must set `model.preferences` (the signup user record), not assume `controller.user` exists. See `docs/task-management/2026-07-14-eu-ai-prefs-parental-consent.md`. (2026-07-14; registration decoupling 2026-07-15)

## Pattern: Org offboarding starts COPPA + resets EU AI (2026-07-16)

District seat reclaim (`Organization#remove_user`, both `License#release_user!` and legacy
detach) must call `User#begin_family_offboarding_consents!`. School-authorized communicators
(no prior active COPPA) get `settings['coppa']` pending with `offboarding: true`; parent email
is optional at remove (`offboarding_parent_email`) and otherwise collected at login via
`POST /api/v1/users/submit_parental_consent_email` (credential proof, no session) when the
token endpoint returns `coppa_parent_email_required`. That same submit path re-stamps pending
after revoke. EU under-16 users get `apply_eu_ai_offboarding_reset!` (force `EU_AI_PREF_KEYS`
false + invalidate consent) so AI stays off until a new parent grant. Do not require parent
email to complete org remove — login dialog is the fallback. See
`docs/task-management/2026-07-16-org-offboarding-parental-consent.md`.

## Pattern: Org `settings['jurisdiction']` drives release-time age laws (2026-07-17)

School-created communicators often have no personal country, so EU Art. 8
(`eu_under_16`) cannot be derived from the user alone. Store org location as
`settings['jurisdiction']` (`US` or `EU` only; `USA` normalizes to `US`) —
required on org create via `Organization#process_params`, editable in settings.
On `User#begin_family_offboarding_consents!`, prefer the releasing org's
jurisdiction over `registration_country`: EU + under-16 → set
`registration.eu_under_16` and force AI off; US + under-16 → AI prefs off but
`eu_under_16=false` (no Art. 8 parent gate). Under-13 COPPA applies for both.
Legacy orgs with blank jurisdiction keep the country-based fallback. See
`docs/task-management/2026-07-16-org-offboarding-parental-consent.md`.

## Gotcha: ember-data 5.3 relationship/store arrays are NOT EmberArrays — `firstObject` on a hasMany is silent undefined

Verified against the emberjs/data v5.3.8 source: `ManyArray` and `RecordArray`
(`peekAll`/`findAll`/`query` results) are native Proxies exposing only native array
methods — `.sortBy`/`.pushObject`/`.filterBy` throw and `firstObject`/`lastObject`
return `undefined` silently (blank UI, no console error), including in templates.
`A()`-wrapping ED arrays is also unsupported, and `peekAll`-style results refuse
in-place mutation (`.sort()`/`.push()` assert) — copy with `.slice()` first. So the
Class-1 receiver rule is: ONLY `A()`-wrapped plain arrays are safe receivers for Ember
array methods; native arrays AND ED arrays are findings. Async `belongsTo` is the one
proxy that survives (chained `.get('user.x')` still works — don't over-flag it). The
unresolved async-hasMany proxy keeps only `length/links/meta/forEach/then/reload`.
Full per-receiver table + 70-entry known-issues KB: `docs/ember-upgrade/KNOWN-ISSUES.md`
(built 2026-07-16; hunted by the `/ember-audit-run` orchestrator into the register
`audit-reports/ember-upgrade/FINDINGS-EMBER.json`). (2026-07-16)

## Pattern: reuse the audit-register machinery for non-compliance domains via a separate register file

`scripts/audit-merge.rb` and `scripts/citation-check.rb` are register-path
parameterized, so a new audit domain (e.g. the Ember upgrade) gets deterministic ids,
dedup, regression flagging, PII refusal, and rendered markdown by pointing `--register`
at its own file (`audit-reports/ember-upgrade/FINDINGS-EMBER.json`) — without polluting
the compliance headline in `audit-reports/FINDINGS.json`. Two gotchas: the merge
REFUSES findings containing dotted-quad tokens (IP scrubber — never write 4-part
version strings) or `NNN_NNN` underscore-digit tokens (global_id scrubber — avoid
numeric literals like `100_000` in snippets); and runtime findings (no file anchor)
id-anchor on `ruleKey` with `evidence.source`, exempt from the snippet-at-SHA citation
gate. (2026-07-16)

## Gotcha: template-lint migration — verify the defect is REAL before "fixing"; disable syntax; `.lint-todo` count is `adds − removes`, not `wc -l`

Three hard-won rules for clearing `.lint-todo` (Ember 5.12 recommended-rule migration),
all learned the same way — static analysis being wrong about the runtime (cf. the folders
`(fn sendAction)` false positive and the 22 `require-input-label` id-count false positives):

1. **Test-first: confirm the flagged defect actually exists in the live DOM before touching
   code.** `no-duplicate-id` flagged `#board_upload` (create-board-new.hbs) and `#board_upload`
   (new-board.hbs) — but a Puppeteer check on the live route showed `document.querySelectorAll('#board_upload').length === 1`: the two occurrences are **mutually-exclusive template branches**
   (`{{#if standalone}}` header vs `{{#unless standalone}}` body), so only one ever renders.
   "Fixing" by renaming would have broken the JS that targets `#board_upload`
   (`getElementById` + content-grabbers `event.target.id`) and the `aria-describedby` pairing —
   degrading working code to satisfy a linter wrong about the runtime. Harness pattern:
   `scratchpad/verify-defect-duplicate-id.mjs` (login → goto route → count in live DOM). Use
   **DOM queries** for structural rules (duplicate-id, nested-interactive, duplicate-landmark),
   **axe-core** (inject at runtime, no dep) for semantic-a11y rules (require-context-role,
   require-input-accessible-name), and **drive the interaction** for behavior rules (autofocus,
   pointer-down). If/unless on the SAME boolean is provably mutually exclusive — no live check
   needed.

2. **`template-lint-disable-next-line` does NOT exist in ember-template-lint 6.1.0** (that's
   ESLint syntax; an earlier handoff assumed it and was wrong → `error: unrecognized template-lint
   instruction`). The only instructions are `template-lint-disable` / `template-lint-enable`.
   To suppress ONE element, wrap it:
   `{{! template-lint-disable no-duplicate-id }}` / `<el>` / `{{! template-lint-enable no-duplicate-id }}`.
   Rationale comments with mustache tokens must use `{{!-- --}}` (the short `{{! }}` form ends at
   the first `}}`). Disabling a **verified false positive** is NOT the banned "suppress a real
   defect" — it's documenting that the linter is wrong; cite the runtime evidence in the comment.

3. **`.lint-todo` is append-only add/remove pairs; the real count is `grep -c '^add|' − grep -c
   '^remove|'`, NOT `wc -l`.** Resolving/suppressing a violation appends a `remove|<fingerprint>`
   line that cancels its `add|` — it does not delete the `add`. So `wc -l` grows while the
   effective count drops. Incremental `--update-todo` gives a clean minimal diff (+N remove lines)
   but leaves tombstones; a clean rebaseline (`rm .lint-todo && --update-todo`) collapses tombstones
   but reorders the whole file (~365-line diff — append-order vs sorted regen) and is merge-hostile.
   Convention: **incremental for feature PRs** (minimal diff), measure progress by effective count,
   and do a clean rebaseline only as an isolated housekeeping commit. Editing a template near a
   deferred violation re-fingerprints/renumbers its entry (a 1-line `input` edit re-keyed its
   `require-input-accessible-name` entry) — expected, commit it with the template change. (2026-07-20)

## Template action-chains fail SILENTLY on a wrong/missing model-computed name (2026-07-21)
Button Settings modal: selecting "Open a web site" or "Launch an application" showed
NOTHING below the Action dropdown. Reported as "selecting an action doesn't save."
Root cause was purely in `button-settings.hbs`: the `{{#if}}/{{else if}}` chain that
renders per-action config branched on `this.model.openUrlAction` — **a computed that
exists nowhere** (real name `linkAction`, `utils/button.js:240`) — and had **no
`appAction` branch at all** (computed exists, `button.js:243`; all supporting JS —
`find_app`/`pick_app`/`set_app_find_mode`, `ios_search`/`*_status_class`,
`contentGrabbers.setup(btn, this)` — was already present). A bad `{{else if this.model.X}}`
produces no error/warning; the pane just stays blank.
- **Diagnostic pattern:** when a modal pane "does nothing / won't save," first check whether
  the config UI even RENDERS. Extract every `this.model.<x>Action` the hbs references and grep
  each against the model's actual computed definitions; cross-check dropdown option `id`s
  (`buttonActions`: talk/folder/link/app/integration) against the `== 'id'` checks in the
  computeds. Mismatch = dead branch.
- **Recovery:** original working markup lived in the pre-component template
  (`git show 869c59c2f:app/frontend/app/templates/button-settings-action.hbs`); port faithfully
  rather than invent, adapting to current conventions (native `<input>`+`set-field`,
  `{{on "click" (this.ctrlAction ...)}}`, `this.` prefixes, `{{t "..." key='...'}}`).
- **i18n gotcha:** a reused key with two different default strings ("custom_launch" for iOS vs
  Android) → generator aborts with `DUPLICATE`. Give each string a distinct key. After adding
  `{{t}}` helpers, `ruby i18n_generator.rb --generate` (syncs en.json to template usage; prunes
  0-reference orphans) then `--merge` (propagates to 12 locales in the `"<trans> [[ <English>"`
  convention). Validate all locale JSON parses after.

## Driving the button-settings modal headlessly (Puppeteer) — it CAN be automated
Prior handoffs claimed the button-settings modal "can't be driven headless." It can.
- **Auth without a password:** mint a token in Rails (`Device.generate_token!` → the value is
  `device.settings['keys'].last['value']`), then in the browser BEFORE app boot set
  `localStorage['lingolinqStash-auth_settings'] = JSON.stringify({access_token, token_type:'bearer',
  user_name, user_id})` and `localStorage['lingolinqStash-prior_login']='"true"'`. `stashes.setup()`
  reads `lingolinqStash-*` keys on boot; `capabilities.access_token` syncs from auth_settings.
- **Speak-mode board URL:** `/:user/board-detail/:boardname` (board-detail defaults to speak mode).
  Edit mode: append `/edit`. Clicking a symbol card in edit mode opens button-settings.
- **Modal internals:** nav pills are `#button_settings .nav-pills a` (match EXACT text — "Action"
  vs "Quick Actions"). The action `<BoundSelect>` trigger is `#action`; its options are
  `.bound-select__option` (click by text). The destination picker is `.md-board-collection` with
  `.md-board-collection__item` rows grouped in `.md-board-collection__section` (My Boards first,
  then brand groups = community). A cross-author pick raises the confirm card
  (`.md-bs-card--selected` eyebrow "Choose how to use this board"); `.md-bs-choose__btn` "Use
  original board" links directly. Selected link shows in `.md-bs-dest__name`.
- **Save path:** closing button-settings does NOT save the board. Click "Done Editing"
  (`.md-board-edit-session__btn--save`, action `back_to_boards`) → it opens the `confirm-leave-edit`
  modal → click `.md-leave-edit-btn--save` to actually persist. Missing this step = edits lost.
- **Folder-link navigation is sound:** verified own + community links persist with `load_board.key`
  and navigate in speak mode. `load_board` is dropped at runtime ONLY when `link_disabled` is true
  (`app-state.js:3764`) or the whole hash is server-deleted for an unviewable/missing target.

## `.lint-todo` raw line count ≠ open violations (it's an add/remove append-log)

`app/frontend/.lint-todo` is NOT a flat list of current violations — it is an append-log of
`add|…` and `remove|…` operations keyed by (rule, content-hash, file, line). A violation is
**open only if its `add` has no matching `remove`**. A naive `grep -c "<rule>"` counts both and
massively overcounts: a 2026-07 handoff claimed "68 require-context-role violations" (raw
`add` count) when only **2** were actually open — prior migration commits had already appended
`remove` lines for ~66.

To get the TRUE current set, never trust the raw count or a stale figure:
- `npx ember-template-lint --include-todo <path>` re-evaluates at HEAD and reports every current
  violation (whether it would be an error or a suppressed todo). A stale todo shows nothing.
- Or compute net-active = (# add − # matching remove) by hash in a script.

After fixing, `ember-template-lint . --update-todo` appends only the `remove` lines for the
now-passing violations (a clean, minimal diff) — you do NOT need to hand-edit `.lint-todo`, and
you should NOT wholesale re-baseline unless you intend to churn every rule's tracked state.

## `require-context-role`: fix grid→gridcell with a `display:contents` row wrapper

The rule (see the installed `node_modules/ember-template-lint/lib/rules/require-context-role.js`)
walks UP from the child-role element, **skips** `role="presentation"`/`role="none"` ancestors,
bails (no violation) if any ancestor is `aria-hidden`, and checks the FIRST real ancestor's role.
So `role="option"` inside `<li role="presentation">` inside `<ul role="listbox">` is VALID
(the presentation li is skipped). The common real violation is a `role="grid"` whose `{{#each}}`
renders `role="gridcell"` divs with no `role="row"` between them.

Fix without breaking CSS: wrap each row's cells in `<div role="row">` carrying
`display: contents` (a dedicated `…__row` class). `display:contents` generates no layout box, so
cells keep participating in the parent CSS grid. **Safe precondition (verify first):** the grid
lays out via `display:grid` + `grid-template-columns/rows` with auto-placed cells and uses only
descendant (space) selectors — NO `>` direct-child or `:nth-child` cell selectors and no
`grid-template-areas` targeting direct children. Under those conditions the wrapper is
layout-invisible; verified byte-identical on create-board-new + new-board preview grids.

## Synthetic `@each` reactivity tests don't reproduce the real Class 2 native-array staleness

The Ember 5.12 Class 2 bug (in-place element mutation not refiring `foo.@each.prop` on a native
array) does NOT reproduce in a minimal QUnit repro: Ember 5.12 STILL fires `@each` for
`EmberObject` elements `set()` in place even on a raw `[]`. A "native array won't refire"
negative-control assertion FAILS (recomputes to 1, not 0). The production staleness only manifests
under the real controllers' build path (array of records, `emberSet`, no wholesale re-set). So a
unit test can validly guard the FIX's A()-array reactivity contract, but a faithful bug repro needs
controller-level integration coverage — don't ship a false negative control. (Ref:
`tests/unit/ember-5-12-regression-test.js`.)

## npm install must run under the project's Node (22 via nvm), not the shell default

The machine's default node is 16; running `npm install` there (npm 8) mangled
`app/frontend/package-lock.json` (300-line diff, "removed 45 packages") even for a 6-dep add.
Always `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` first. If a lockfile got
mangled, `git checkout -- package.json package-lock.json` and redo under Node 22 (clean diff =
only the intended deps).

## Client image uploads: `remote_upload` params live in a 1-second shared meta cache
When a create returns S3 upload params, they're stashed in `lingoLinqExtras`/`$.ajax.metas`
(extras.js) keyed by method+model+url, pushed at RESPONSE time (extras.js:341) and read back by
`content-grabbers.js#save_record` right after `object.save()` resolves. This cache prunes on every
`meta_push` and is shared across ALL in-flight requests — so anything that delays or races between
the create response and the meta read (concurrent board-image GETs, a slow/large POST body) can
drop the params, and `save_record` then silently bails at `reject('remote_upload parameters
required')`, leaving the image `pending` with a null `url`. Symptom: image shows locally (data-URL
cache) then vanishes on reload; secondary symptom: un-uploaded images keep ~700KB base64 inline and
the board-save payload trips Rack's 4MB `QueryParser::QueryLimitError`.
- Diagnose with the DB, not guesses: `button_images.url IS NULL` + `pending_upload? = true` means
  the browser→S3 upload never completed (Rails never wrote the url). Server S3 creds are fine if the
  log shows `Aws::S3::Client 200 head_object`. Watch UTC vs local when reading `created_at`.
- The prune condition was inverted (kept stale, dropped fresh). When touching short-lived shared
  caches, confirm the keep-vs-drop sign — an inverted TTL fails intermittently under load only.
- Optimize captured/uploaded photos to JPEG (opaque → JPEG w/ white letterbox backfill; keep PNG
  only when the drawn region has alpha). `size_image` only processes same-origin data: URLs
  (http/gif bypass), so getImageData is safe there. Smaller uploads also widen the timing margin.

## `size_image` alpha detection must probe the SOURCE, not the letterboxed canvas
`content-grabbers.js#size_image` contain-fits the source into a square canvas, leaving transparent
letterbox bands. The original opaque/transparent test sampled `getImageData` of the *drawn region*
on that canvas — but the anti-aliased boundary between image and transparent letterbox reads
alpha<255, so EVERY opaque non-square photo was misclassified as "has alpha" and wrongly kept as
PNG (never JPEG'd). Our own testing caught this only because we checked the actual output MIME, not
just "did it produce a url". Fix: probe alpha by drawing the SOURCE `img` stretched to fill a tiny
throwaway 24x24 canvas (no letterbox), threshold alpha<250. Lesson: when classifying pixels, sample
a surface with NO synthetic transparency you introduced — never the same canvas you letterboxed.
- Verification pattern that works here: all four custom-image callers (create-board-new
  `_applyDroppedImageToLabel`, board-detail `file_selected`/`web_image_dropped`/`edit_image`) route
  through the ONE shared `size_image`, so exhaustively proving `size_image`'s input-class matrix
  (opaque→JPEG, transparent→PNG, http/gif→passthrough, <300px→early-return, >4MB→JPEG) + proving the
  shared `save_image_preview`/`save_record` persists once, covers every path. Confirm each caller
  passes the right URL in and uses the result — statically + a stub-controller dynamic check.
- DOM drop handlers (`cellDrop`) are thin `event.dataTransfer` pass-throughs, so a synthetic
  `DataTransfer` (File via canvas.toBlob→new File; http via `items.add(url,'text/uri-list')`) in
  headless Puppeteer faithfully exercises the real UI drag. Wrap `save_image_preview` to capture the
  exact URL fed to persistence — that isolates "optimizer output" from "server round-trip", so a
  bogus-external-url server rejection doesn't muddy the passthrough proof.
- size_image early-returns UNoptimized when BOTH dims <300px (`default_size`). Acceptable: sub-300
  images are already tiny and JPEG artifacts on small symbols look worse than the KB saved.
- Login 400 "Invalid client_secret for client_id" is NOT a wrong-password error — `/token` rejects the
  browser token (used as `client_secret`) BEFORE checking the password (`SessionController#token`:
  `GoSecure.valid_browser_token?`). The token is time-boxed (`GoSecure.browser_token`, format
  `<counter>-<hmac>`) and the server returns a fresh one in the `BROWSER_TOKEN` response header on
  EVERY response (even the 400). The frontend captures it (`extras.js` → `fakeXHR.browserToken`) but
  only persisted it in `session.js#check_token` — which runs only when the login form has NO stored
  token. So a stale token in IndexedDB wedges login and a reload doesn't help (it reads the same stale
  token back). Fix = refresh the stored token from `fakeXHR.browserToken` centrally in
  `persistence.ajax` (both success `data.meta.fakeXHR` and error `rejection.fakeXHR`) so it never goes
  stale, plus a one-shot login retry in `session.js#authenticate` on the `client_secret` error.
  Debug tip: `curl -D - -X POST localhost:5000/token ...` shows both the JSON error and the fresh
  `browser_token:` header; generate a valid one with `rails runner 'print GoSecure.browser_token'`.

## Board-detail sentence bar / grid: one authoritative scaling variable, hardcoded px is the bug
The board-detail redesign scales the sentence-bar controls with a set of size-class CSS variables
(`--nb-sb-btnh`, `--nb-sb-btnw`, `--nb-sb-sbtn`, …) defined per `.md-board-detail-sentence-bar--<size>`
AND redefined smaller inside `@media (max-height:500px),(max-width:600px)`. Any control that hardcodes
a px size instead of reading these vars silently stops scaling. The mic `__btn--speak` did exactly
this (`width/height/min-width:55px`) and froze while the sibling tool buttons shrank on small screens.
Fix pattern: a circular control's diameter should equal the tool-button height, so use
`var(--nb-sb-btnh, 55px)` (the 55px fallback = the medium base, so desktop is unchanged). When a
"button isn't scaling" report comes in, grep the element's rule for literal px and compare against
the sibling that DOES scale — the sibling shows which `--nb-sb-*` var to adopt.

## `!important` + non-important media overrides = the media rules are DEAD (verify, don't assume)
`.md-board-detail-grid` had `gap: var(--bd-button-gap,8px) !important` while the responsive
`@media{.md-board-detail-grid{gap:2px}}` rules were NON-important — so the base `!important` wins at
every breakpoint and the media gaps never apply. Before "fixing responsive gap at small screens",
check importance: a base `!important` can make a whole ladder of media rules inert, so the real fix
is the base rule (one edit), not the media blocks. Confirmed by measuring getComputedStyle at each
width.

## Board-detail grid gap: the prediction rail reads rowGap and needs it parseFloat-readable
`_sync_prediction_tile_size` (controllers/user/board-detail.js:387) does
`parseFloat(getComputedStyle(grid).rowGap)` (and columnGap) to align prediction tiles to board rows,
publishing them as `--prediction-tile-gap` / `--prediction-rail-gap-left`. So any change to the grid
gap MUST leave row-gap resolving to a plain px — the code explicitly warns that `min()`/percentage
gaps serialize to something parseFloat can't read (a real 2026-07 regression). Note for future gap
work: `calc(var(--bd-button-gap,8px)*0.5)` DOES resolve to a plain px in computed style (verified
in-browser: pref 8px→rowGap "4px", 16px→"8px"), so a proportional row-gap would be rail-safe IF such
a change is ever wanted. (A 2026-07-25 request to reduce the board-detail vertical gap this way was
started then withdrawn by Traci — no gap change shipped; this entry is kept only for the rail
contract + calc-serialization facts.)

## Inline sidebar (Keyboard/Crisis) in speak mode is `md-board-detail-inline-sidebar__name`
The speak-mode board shortcuts on board-detail are the INLINE sidebar
(`.md-board-detail-inline-sidebar__item/__name/__img` inside `.md-board-detail-grid-sidebar-wrap`),
NOT the classic `#sidebar` (which is `display:none !important` on the board-detail layout — app.scss
72241 / 78778) and NOT the edit-nav `md-board-detail-sidebar__item` (horizontal, emoji icons,
Communicate/Clinical/Settings). Its label font ladder had unreadably small ≤768/≤400h tiers (8px/7px)
— below the AAC label floor. When a board-detail speak-mode "sidebar" styling report comes in, it's
the inline-sidebar classes.

## Board-detail board grid height is a load-bearing magic-number calc; don't flex-fill it
The speak-mode board grid uses `height: calc(100dvh - 120px)` (top-aligned in its flex wrap), NOT
flexbox fill. This is DELIBERATE and load-bearing: a CSS-grid container with
`grid-template-rows: repeat(N, minmax(0,1fr))` collapses to min-content when it has no definite
height, so align-self:stretch / height:100% / flex:1 all either collapse the board to ~118px or
introduce scroll (verified across attempts). computeHeight() is a no-op — the layout is pure CSS.
The 120 offset = the chrome above the grid (sentence bar ~90 + ~30 padding), tuned for the MEDIUM
bar. On ≤500px-tall screens the sentence bar shrinks ~27px (the --nb-sb var block) but 120 didn't
follow → a dead gap below the last row. Fix by matching the offset to the shrunk chrome in the SAME
height breakpoint (`@media (max-height:500px)` → `calc(100dvh - 93px)`), scoped to max-HEIGHT only
(narrow-width has taller chrome and would scroll). To compact short screens (tight gap + top),
override `gap`/`padding-top` in a `@media (max-height:Npx)` block — rows are 1fr so a smaller gap
just makes buttons taller; the grid still fills. Keep gap a plain px (the prediction rail parseFloats
getComputedStyle(grid).rowGap).

## Render board-detail headless: seed the session before boot
The board-detail route needs an authenticated user session, not just an API token. To get the real
board rendering in Puppeteer: `page.evaluateOnNewDocument(() => localStorage.setItem(
'lingolinqStash-auth_settings', JSON.stringify({access_token: TOK, user_name: 'tracitest'})))` BEFORE
`page.goto(...)`, then also set window.capabilities.access_token + a no-op sync_access_token after
load. Navigate to `/<user>/board-detail/<boardname>` (speak) — the grid renders once the model loads
(poll for `.md-board-detail-grid__cell`). This unlocks real computed-style measurement for any
board-detail layout work.

## Board-detail default-folder mode reserves ~10px top padding on EVERY cell (the "folder setting")
Asymmetric row spacing on the board grid (bigger vertical gap than horizontal) is usually the folder
reserve, NOT the grid gap. The `folder-tab-geometry($visible,$offset)` mixin (app.scss ~80053) drives
default folder mode and sets `padding-top` on BOTH `.md-board-detail-grid__cell--folder` AND
`.md-board-detail-grid__cell:not(--folder)` (so folder + non-folder card tops align) — default is
`(6px,2px)` → ~10px per cell. That reserve stacks ON TOP of the grid gap, so card-to-card row gap =
gap + 10px while the sides = gap. To make gaps symmetric (e.g. on short screens): scope to the
default-folder selector `.md-board-detail-grid:not(--folder-tab-labels):not(--folder-colored-corner)`
and zero `.md-board-detail-grid__cell` padding-top + `.md-folder-back` top/bottom. The visible tab
tucks behind the card; folders stay identified by the bottom-right corner glyph. Verify with the
CARD (not cell) rects: cardRowGap between row N and N+1 should equal the grid gap.
## Oversized-PR review: chunk the diff across passes, fold fail-closed (never truncate-and-defer)

`codex-review/deep-pass` (Scot's required, fail-closed gate) injected only the first
`MAX_BYTES=60000` of the diff. A large PR (#665: ~644 KB) was truncated, the reviewer correctly
refused a verdict over unverified hunks, and the fail-closed policy turned that into a red required
check. **Truncation is the wrong lever for a required gate** — it converts "too big" into
"unreviewable → blocked" instead of "reviewed across passes".

**Fix pattern (reusable for any prompt-budget-bound reviewer):**
- Split the raw `git diff BASE...HEAD` on **file-boundary headers** (`^diff --git `) into chunks
  each ≤ a raised per-chunk cap; never split one file across chunks. Only a single file bigger than
  the cap stays truncated, and only for its own chunk (truncate on a **line** boundary — a byte cut
  splits multibyte UTF-8 in `public/locales/*.json` and makes the prompt undecodable; mirror the
  workflow's `head -c | sed '$d'`).
- Review each chunk on its own pass; keep the existing per-chunk convergence ("confirm both
  directions").
- Fold **across** chunks as a **conjunction, not a vote**: APPROVE only if every chunk approves;
  any blocked chunk blocks the PR; surface the highest-priority blocker. (Contrast: convergence
  *within* a chunk is a majority vote across non-deterministic runs.)
- Bound fan-out with `MAX_CHUNKS`; the overflow tail becomes a **synthetic fail-closed chunk** so a
  truly enormous PR still routes to a human — preserving the original safe behavior for just the
  tail, not the whole PR. Never silently drop the overflow.
- Keep normal PRs free: a diff under the cap = exactly one chunk = unchanged cost.

**Gotchas:** (1) GitHub Actions `run:` bash is `set -eo pipefail` by default — `ls glob | sort`
crashes the step on an empty diff. `find <dir> -maxdepth 1 -name 'chunk-*.txt' -print0 | xargs -0`
is the robust idiom: it runs **nothing** (exit 0) on 0 matches, never word-splits paths, and adding
`-P N -I{}` turns it into a **bounded-parallel pool** in one line — GNU xargs (ubuntu-latest) honors
`-P` with `-I{}` (BSD xargs does not, but the runner is GNU). A pooled worker that exits non-zero
fails the step → fail-closed; a legitimate REQUEST_CHANGES review must exit 0 (write JSON, let the
downstream fold decide), or every blocking review would false-fail the step. Keep the per-worker
body in its own script so the pool invokes `bash script.sh {}` (no exec-bit needed) and both routes
share one code path. (2) The prompt-injection guard must scan **each chunk's own diff** (the text
that chunk's reviewer actually saw), not a single global diff. (3) Make the cap/limit/concurrency
repo `vars.` (`CODEX_MAX_DIFF_BYTES`, `CODEX_MAX_DIFF_CHUNKS`, `CODEX_REVIEW_CONCURRENCY`) so the
tooling owner can tune runner cost/time without a code change. (4) Parallelizing the chunk loop is
what keeps a large PR under the watchdog's 30-minute staleness threshold — serial passes (up to
MAX_CHUNKS × 3 codex runs) can otherwise go stale, which is still fail-closed but defeats the point
of reviewing the big PR. (Threshold, not deadline: the watchdog acts once a status is 30 min old AND
a sweep runs, and sweep timing is best-effort. See issue #710.)
Files: `scripts/codex-review-chunk-diff.py`, `codex-review-one-chunk.sh` (per-chunk worker, both
routes), `codex-review-assemble-manifest.py`, `codex-review-build-envelope.py` (`fold_across_chunks`
+ `--manifest`), `.github/workflows/codex-review.yml`.

## Pattern: Compliance Kernel is feature-gated and additive — never replace eu_consent_age in the same PR

The Section 1 kernel (`lib/compliance/`, flag `compliance_workflow_kernel`) computes segment,
jurisdiction, per-member digital consent age, and HCD framework merge into a `Compliance::Profile`.
It must ship AVAILABLE-only (OFF by default). When OFF: no `settings['compliance']` stamp, no
`compliance` key on user JSON, no `compliance_kernel` in domain_settings. Leave
`eu_consent_age` / `JsonApi::Json.coppa_consent_age` and existing COPPA signup paths untouched
so consumers migrate deliberately. Jurisdiction priority for this phase: declaration > org >
user country > locale (IP geolocation deferred). Quebec is `CA-QC` → age 14 (Law 25).
- Ember 5.x reactivity: a full-viewport loading overlay (`<AppLoadingOverlay>`) silently stopped
  rendering after the 5.12 upgrade. Cause: the `tagName:''` classic component observed
  `app_state.loading_overlay_message` through a classic `computed('app_state.loading_overlay_message')`,
  but that property was NEVER declared on the `Service.extend({...})` (only `.set()` later). Under
  Ember 5.x an undeclared, set-later property + classic computed in a tagless component can fail to
  notify the Glimmer template — `{{#if this.show}}` never flips true. VERIFIED FIX (3 parts):
  (1) declare `loading_overlay_message: null` on the service so it's a known trackable field;
  (2) bind the template DIRECTLY to the service prop (`{{#if this.app_state.loading_overlay_message}}`)
  — Glimmer auto-tracks direct property access reliably; (3) drop the now-dead show/message computeds.
  Lesson: for Ember 5.x reactivity, prefer declaring observed props + binding templates directly to
  the tracked source over a classic computed indirection, especially in `tagName:''` components. A
  leftover `data-show` DEBUG probe in the co-located .hbs was the tell that this area was known-broken.
- Slow board open (~4s) from the My Board Collection panel was NOT the board fetch/render — the
  `ll_board_cache_diag` log (enable via `localStorage.setItem('ll_board_cache_diag','1')`, reads on
  `window.__LL_BOARD_CACHE_LOG`) showed `model:cache_hit ms:6` + `grid_built ms:12` but
  `setup:buttonset_fail ms:3621`. Two independent causes, both fixed:
  (1) `routes/user/board-detail.js#setupController` called `model.load_button_set()` on the open path;
  for an uncached set that hits `POST /buttonsets/:id/generate` (server-generates the whole
  find-a-button hierarchy, `BoardDownstreamButtonSet.update_for`) — seconds on a large board. Fix:
  defer it via `runLater` after paint (mirrors the deferred `warm_images`/`prefetch_linked` pattern),
  guarded to skip if destroyed or the user navigated away. find-a-button is user-invoked; no need to
  generate eagerly on every open.
  (2) The collection panel's "Opening your board" overlay cleared via `onSelect(board).then(done)`, but
  `onSelectBoardFromCollection` used `_this.send('select_board_from_collection', board)` — and Ember's
  `send()` does NOT propagate an action's return value, so `onSelect` returned undefined, no transition
  to hook, and the overlay only cleared via its 8s safety timeout. Fix: make onSelectBoardFromCollection
  own the transitionTo and RETURN it; the action delegates to it (still reached via raw_events
  data-bd-action). Lesson: to clear a loading overlay when a route transition settles, the handler must
  RETURN the Transition — `send()` won't give it back.
- Button-set (find-a-button) generation — and board copy, and any Uploader.remote_upload —
  failing for ALL boards in dev was NOT a code bug: `Uploader.remote_upload_params` sets
  `acl=public-read` on the S3 upload unless `ENV['UPLOADS_S3_NO_ACL']` is truthy
  (lib/uploader.rb:332,341), and the `lingolinq-dev-uploads` bucket has Object Ownership =
  "Bucket owner enforced" (ACLs disabled). S3 rejects the acl param with
  `AccessControlListNotSupported: The bucket does not allow ACLs`. Fix: set
  `UPLOADS_S3_NO_ACL=1` (documented in `.env.example`); we added it to the committed
  `.env.op.template` so every dev environment inherits it (and to gitignored `.env.op.local`).
  Diagnostic technique that nailed it: read the LIVE failure from the running worker via
  `Resque::Failure.all(start, n)` (rails runner) — that reflects the app's real resolved-cred
  environment, unlike a bare `rails runner` which loads unresolved `op://…` creds
  (`config/application.rb` dotenv order is FIRST-wins: .env.op.template, .env.op.local, .env,
  .env.local) and fails earlier with `InvalidArgument: the Credential is mal-formed`. Two
  different S3 errors from the same upload code depending on whether you booted under `op run`.
  Gotcha: macOS blocks `ps eww` env inspection of other processes, so you can't scrape the
  running app's resolved creds to reproduce; verify via the worker's failure log instead, and
  confirm end-to-end after a restart (env loads at boot).
- Find-a-button multi-word sentence builder (find_multiple_buttons beta flag) was broken on the
  Ember-5.12 board-detail speak page in three independent ways — the old guided-highlight system
  predates the board-detail nav model and was never fully wired to it:
  (1) SEARCH dropped cross-board words: `find_sequence` (buttonset.js) anchors return-navigation to
      `home_board_id` = speak-mode `root_board_state`. When you view a board OUTSIDE the active home
      tree (root_board_state points elsewhere, or no home board set), `button_steps` can't compute a
      path back to the root, so every combo that dips into a sub-board is discarded — only same-board
      results survive. Fix: when `from_board_id == this.global_id` (you're on the searched tree's
      root), anchor `home_board_id` to it. Diagnosed by logging the combos array as they build.
  (2) HIGHLIGHT didn't resume in sub-boards: `edit_manager.process_for_displaying` has a board-detail
      speak-mode branch that returns EARLY (rendering is done by board-detail components, not the
      fast_html canvas) BEFORE it reaches `resume_scanning()`. So `highlight_button('resume')` never
      fired after navigating into a sub-board and the sequence stalled. Fix: trigger the resume in the
      board-detail branch too, guarded on an active `button_highlights` queue.
  (3) RETURN leg had no Back button: the `true_home` return step highlighted `#speak > button:first`
      (matches nothing on board-detail; buttons are nested in `.md-board-detail-nav-stack`) and would
      use Home (go_home → session root, the wrong board). The Back button (`data-bd-action=go_back`)
      only renders when `board_detail_nav_history.length > 0`, but the guided `activateButton` path
      bypasses board-detail#`_push_nav_history`. Fix: push nav-history when the guided highlight
      navigates INTO a sub-board, and retarget the return step to `go_back`. Gotcha: there are TWO
      go_back buttons in the DOM; `modal.highlight($set)` sizes its mask to the bounding box of the
      whole jQuery set, so highlighting `$("[data-bd-action=go_back]")` swept in the adjacent Home
      button — target `$("[data-bd-action=go_back]:visible").first()` (a single element).
  Method for all three: add scoped `console.log` probes at the exact branch points (method entry vs
  the send/action, the pre-step selector counts), reproduce once, read the log — NOT guess. The
  guard-clears-the-queue and stale-cache hypotheses were both disproven this way before landing (2)/(3).

## Pattern: find-a-button on a SUB-board must search from the nav ROOT, and client-built button sets MUST key on `global_id` (numeric), never ember-data `id`

**Surface:** `find_multiple_buttons` on the board-detail speak page, invoked while the user is on a
sub-board and searching a word that lives on a PARENT/root board (the "backward"/climb-up case).

**Two coordinated pieces (both required):**
1. **Search the whole tree, not the current sub-board.** `find-button.js#_buildLocalButtonSet` walks
   DOWN from the board it's given, so a sub-board's set never contains parent/root words. Fix:
   `_resolveSearchRoot` resolves `app_state.board_detail_nav_history[0]` (the board the user started
   on = tree root) to a board model and builds the set from THAT; the search observer uses
   `this.button_set` (root set) with the current board's id as `from_board_id`. And in
   `buttonset.js#find_sequence`, in SPEAK mode anchor `home_board_id = this.get('global_id')` (the
   searched tree's root) regardless of `from_board_id`, so `button_steps` emits a `true_home` step
   (→ the board-detail Back button) to climb up. Forward search (on root, target deeper) is
   preserved: on the root `home == global_id` is the same value the old `from==global_id` branch
   produced, and `button_steps` finds a deeper target by walking UP to the current board, not via home.

2. **THE ID-FORM TRAP (this is what makes the climb actually land).** The guided highlight matched
   the target with `button.board_id == board.model.id`. A board resolved via
   `store.findRecord('board', <key>)` (by KEY — how the nav root is looked up) has its ember-data
   `id` == the KEY string (`"lingolinq/vocal-flair-112"`), and stashes the backend global_id in
   `_actual_id`; the model's `global_id` computes `_actual_id || id`. DESCENDANTS fetched by numeric
   `load_board.id` are already numeric. So stamping `board_id` from `board.get('id')` gave the ROOT's
   buttons key-form ids while every descendant was numeric — and the runtime `board.model.id` is
   ALWAYS numeric. Result: the climb reached the root, but `button.board_id ("…key…") == board.id
   ("1_836")` failed → the WRONG_BOARD re-query found NO_PATH → "no path to highlighted button" and
   the highlight silently stopped, even though the SEARCH worked (the set was internally consistent
   in key-form, incl. `home_board_id`). Fix: use `board.get('global_id') || board.get('id')`
   EVERYWHERE the client-built set is created/keyed/searched — `_buildLocalButtonSet` (set `root_id`
   + per-button `board_id`), `_loadOrBuildButtonSet` (store peek key), and the search observer's
   `from_board_id`. board-detail itself already uses `model.get('global_id') || model.get('id')` for
   the same reason (`routes/user/board-detail.js`). Rule of thumb: **any id that will be compared
   against a runtime `board.model.id` must be the numeric `global_id`, because `findRecord(key)`
   yields a key-`id` record while `load_board.id` walks yield numeric ids.**

**Method:** scoped `[ll-root]/[ll-fs]/[ll-fb]/[ll-hl]` console probes at the exact branch points
(root resolution, find_sequence anchor + combos, results-received, and the highlight
ON_BOARD/WRONG_BOARD/resume-hook branches), reproduce once, read the log. The "search is broken"
theory was disproven this way — the search was fine; the log showed `board_id=<key>` vs
`current_board=1_836` at the highlight step, pinning it to the id-form mismatch, not the resume path.

## Pattern: a scoped rule that "loses despite higher specificity" → hunt a bare-class `!important`, don't guess specificity

Symptom: a board-detail-scoped SCSS rule (e.g. `.md-shell.md-shell--board-detail:not(...)`, 0,4,0)
sets `background: X` but the element keeps rendering a different value from a LOWER-specificity
selector. Specificity math says you should win; you don't.

Root cause in this codebase: a GLOBAL bare-class rule paints via `!important` —
`.md-shell { background: <gradient> !important }` (~app.scss L42990, shared by every authenticated
view). A non-important declaration can NEVER beat an `!important` one, regardless of specificity or
source order. The bare `.md-shell` selector contains no view-specific token, so
`grep "md-shell--board-detail"` is blind to it — that's why it stays hidden.

Diagnosis technique (fast, definitive, no guessing — satisfies RULE #0): drive headless Chrome via
Puppeteer's CDP session and call `CSS.getMatchedStylesForNode` on the element. It returns EVERY
matched rule in cascade order with each declaration's `important` flag and its media context — so
the actual winner (and its `!important`) is unambiguous. Beats staring at specificity or `!important`-
grepping a 90k-line compiled file. Harness pattern:
`page.target().createCDPSession()` → `DOM.enable`/`CSS.enable` → `DOM.querySelector` → `CSS.getMatchedStylesForNode`.

Fix rule: when the blocker is an existing GLOBAL `!important` you must not edit (shared across views —
Traci-scope + RULE #0.3 "don't break working functionality"), adding `!important` to a properly
SCOPED, higher-specificity selector is the SANCTIONED exception to "no !important patches"
(CLAUDE.md #0.7) — you're overriding an existing `!important`, not winning a specificity war against a
plain rule. Document WHY (name the global rule + line) in a comment so the next reader doesn't strip it.

Corollary — redesign color drift: when a base surface (`.md-board-detail-main`) is re-themed to a new
color, every "flatten/seam/surround" rule that HARDCODED the old color silently becomes a visible
seam. After changing a surface token, grep for sibling rules that reference the OLD literal/token and
re-point them to the new one.

Also caught this session: a headless "the fix didn't apply" reading was a STALE ember build — always
confirm the LIVE compiled asset (`curl :8184/assets/frontend.css | grep <your selector>`) contains
your change BEFORE concluding the cascade is wrong. `sleep 6` is not enough; poll the asset until it
reflects the edit.

## Pattern: a DERIVED field with MULTIPLE entry points — fix the shared mutator, not one caller

Bug class: a model field is DERIVED from other fields via an observer (e.g. button.js `updateAction`
sets `buttonAction` from load_board/url/apps, with load_board winning). Switching the "type" must CLEAR
the conflicting source fields or the derived value silently reverts. If there are several UI entry
points that set the type (a dropdown AND quick-action shortcut buttons), fixing ONE (the dropdown's
`updateModelButtonAction`) leaves the others (`quick_action('url')` did a bare
`set('model.buttonAction','link')`) still broken — and the user re-reports the SAME symptom.

Rule: when a fix clears/normalizes fields on action-type switch, extract it into ONE shared method
(`_apply_button_action`) and route EVERY entry point through it. Before declaring such a bug fixed,
enumerate every caller that sets the derived field (`grep` the field name + every quick-action/shortcut),
not just the one the report mentioned. Codebase-specific: board-detail speak-mode `select_button`
navigates ANY button with `load_board` (returns before the url branch), so a stale load_board = a
folder nav ("player never initialized" is a *separate* video-player timeout, app.js:686 — don't be
misled by it). Verify with the REAL click entry point (`ctrl.send('buttonSelect', id)` → find_button →
select_button), not by hand-passing a raw board.buttons object (whose url isn't synced by set-field —
only the Button model is), or the assertion silently no-ops.

## Pattern: verify UI-event fixes through the REAL event path — a stale rendered copy ≠ the model

Trap that cost two "fixed but not fixed" cycles on the board-detail URL-link bug: the headless repro
called `ctrl.send('buttonSelect', id)`, which resolves the button via `editManager.find_button` (fresh
from the model). A REAL mouse click goes through the grid's `{{on "click" (invokeAttr "selectButton" btn)}}`
and hands `select_button` the DISPLAY copy — a plain object board-detail rebuilt from
`board.contextualized_buttons`, which can LAG the model after an in-place edit. So the repro passed
while the app still broke. Lesson: reproduce UI-event bugs by dispatching a real DOM event on the
actual bound element (`[data-id=…]`) and instrument the handler to log the object it ACTUALLY received
(`typeof obj.load_image === 'function'` tells you Button-instance vs plain display copy) — don't call
the action with a hand-fetched fresh object.

Two compounding root causes worth remembering for board-detail:
1. **Display copies lag the model.** board-detail renders from `contextualized_buttons` (plain-object
   copies); `editManager.process_for_displaying` early-returns for board-detail speak mode, so its
   rebuild uses a different path. A click handler that trusts the passed button can act on pre-edit
   data. Fix: resolve authoritative action fields from `board.get('buttons')` (the raw array
   change_button keeps current) by id inside the handler, not from the passed render copy.
2. **`set-field model.X` updates only the model, never board.buttons.** Bound inputs like the URL
   field (`{{on "input" (set-field this "model.url")}}`) don't call `change_button`, so the field
   never reaches the authoritative board.buttons array (unlike labelChanged, which does). Any field
   that must survive a re-render / drive activation needs a `change_button` sync observer mirroring
   labelChanged. Check `Button.attributes` includes the key or change_button won't sync it to board.buttons.

## Pattern: board-detail `_make_btn` is a hand-picked field subset — omitted fields vanish on every speak re-render

board-detail builds its speak-mode display buttons with `_make_btn` (controllers/user/board-detail.js),
which returns a HAND-PICKED object literal — NOT a full button copy (edit mode uses `_make_ember_btn`,
which does `Button.create(btn)` and keeps everything). Any Button attribute NOT explicitly listed in
`_make_btn`'s return is silently dropped on every speak-mode rebuild (mode switch, redraw, cache
refresh). Symptoms this caused: a URL/video link tapped in speak mode navigated/stale because the
display copy lost `url`/`video`; and Button Settings' "Also speak & add" (add_to_vocalization) checkbox
"cleared after Done" because reopening the modal reads the display copy via `find_button`, which had
lost the field. Verified: board.buttons + contextualized_buttons both KEEP the field; `_make_btn`
DROPPED it. Fix: carry the action/option fields through `_make_btn` (url, video, book, apps,
integration, add_to_vocalization, add_vocalization, home_lock, link_disabled, sound_id). Rule: when a
button field must survive a speak-mode re-render or be editable in the modal, it MUST be in `_make_btn`'s
output — grep that return object before assuming board.buttons is enough. (`select_button` reading the
authoritative board.buttons entry is a belt-and-suspenders complement, but the modal/find_button path
still needs the display copy to be complete.)

---

## Pattern: before adding a guard, grep the canonical path for one that already exists — with the exact flag name, in that file alone

**Surface:** any "feature flag X isn't being honored" fix, especially when the
symptom is on one renderer (board-detail) but the flag is a Button attribute
shared by all of them.

`link_disabled` ("Disable this link action for now") looked unenforced on
board-detail, so a guard went into `select_button`. It was redundant: the
enforcement has always lived at
[app-state.js `activate_button`](../../app/frontend/app/services/app-state.js), which
strips the link action off a COPY of the button:

```js
if(button.link_disabled) {
  button = $.extend({}, button);
  setProperties(button, { apps: null, url: null, video: null,
                          add_vocalization: true, load_board: null, user_integration: null })
}
```

That is stronger than a branch guard — it neutralizes folder, url, app AND
integration in one place, and forces `add_vocalization` so the button degrades to a
plain talk button. Every renderer funnels through `activate_button`, so this is the
only correct home for the flag.

**Two traps this exposed:**

1. **A guard at the call site is escapable and creates a false sense of coverage.**
   board-detail's own guard was inert — its fall-through re-entered
   `activate_button`, which was already handling the flag. Worse, a test asserting
   "select_button falls through to activation" against a STUBBED `activateButton`
   proves nothing about whether the link opens: the real function is where the
   behavior lives. When testing a flag with one canonical enforcement point, the
   test belongs at that point; call-site tests should only assert the flag is
   passed DOWN intact.

2. **Verify the "no enforcement exists" claim with a single-file grep.** The
   original conclusion ("`app-state.js` has zero `link_disabled` references") came
   from a multi-file grep whose output was misread. `grep -n "link_disabled"
   app/services/app-state.js` — one file, one term, no other args — would have
   shown line 3764 immediately. Never conclude "this is unhandled" from a grep with
   several path arguments; re-run it against the single file you're about to edit.

**The real bug in that block was narrower than "missing":** it used a raw truthy
test on a flag the codebase documents as string-persisted. `Button.LEVEL_BOOL_ATTRS`
(utils/button.js) is the canonical list of boolean-ish button attributes — `hidden`,
`link_disabled`, `add_to_vocalization`, `add_vocalization`, `home_lock`,
`hide_label`, `text_only`, `no_skin` — and legacy/copied boards persist them as the
STRINGS `"true"`/`"false"`. `!!"false"` is `true`, so a board that left the link
ENABLED had it silently stripped. Fix: `Button.coerce_level_value(attr, val)`, which
is the single source of truth for that coercion. **Rule: any read of a
LEVEL_BOOL_ATTRS attribute outside `_make_btn` must go through
`coerce_level_value`.**

**Related:** level rules can SET these attributes (paint mode writes
`mods.pre.link_disabled`), so reading a raw `board.buttons` entry also skips the
level resolution. board-detail now shares one `_resolve_level_attrs` helper between
the render path (`_make_btn`) and the activation path (`_resolve_action_src`) so a
tapped button's link options resolve at the same level the rendered button was
filtered by.

**First seen in:** [2026-07-26-adversarial-review-remediation.md](./2026-07-26-adversarial-review-remediation.md)

---

## Pattern: deleting dead CSS is a text-surgery problem — `:not()` and multi-line selector lists are the two ways to silently break live styling

**Surface:** removing the SCSS left behind when a template stops rendering an
element. app.scss is ~94k lines, so this is always scripted, never hand-edited.

Two failure modes, both of which produce a file that still compiles and still has
balanced braces — so neither is caught by a syntax check:

1. **`:not(.dead-class)` is a LIVE selector.** A rule like
   `.row:not(.row--preview) .text { cursor: pointer }` targets everything that
   ISN'T the dead thing. Deleting it because it mentions the dead class removes
   styling from the surviving elements. Strip `:not(...)` before testing a
   selector for deadness; then simplify the survivor in place (drop the now-vacuous
   negation) rather than leaving a reference to a class that no longer exists.

2. **A multi-line comma-separated selector list must be removed WHOLE.** When
   scanning line-by-line, the continuation lines are already consumed before the
   `{` is reached. Removing only the `{` line and its body leaves the leading
   selectors dangling, where they silently weld onto the NEXT rule in the file —
   applying dead-element styling to a live one. Drop every line from the start of
   the selector list (and its leading comment) through the closing brace.

Also: only delete a rule when EVERY selector in its comma list is dead. If a rule is
shared between a dead and a live selector, leave it and report it — a script that
"helpfully" edits shared rules is unreviewable.

**The verification that actually proves the deletion was surgical** (do this, not a
visual diff of a 500-line removal): compile both revisions with `sass` and diff the
resulting SELECTOR SETS.

```
git show <base>:app/frontend/app/styles/app.scss > /tmp/base.scss
npx sass --no-source-map --load-path=app/styles /tmp/base.scss /tmp/base.css
npx sass --no-source-map --load-path=app/styles app/styles/app.scss /tmp/new.css
# then: removed = selectors(base) - selectors(new); assert every one matches a dead class
# and assert added == 0
```

This caught the `:not()` mistake immediately (it showed a live selector in the
removed set) and gave a reviewable one-line result: *52 selectors removed, all
matching a dead class, 0 unexpected, 0 added*.

**Companion to** [Removing a UI feature is incomplete until every coupled site is
removed](#pattern-removing-a-ui-feature-is-incomplete-until-every-coupled-site-is-removed)
— run that 7-site checklist FIRST. On this pass it turned up two live bugs that were
not dead code at all: a guided-tour step whose `sel:` targeted a deleted element, and
six tour strings still naming buttons that had been renamed. A "dead CSS cleanup"
that skips the checklist ships those.

**First seen in:** [2026-07-26-adversarial-review-remediation.md](./2026-07-26-adversarial-review-remediation.md)

---

## Pattern: a "protected" flag on a media record is an ENTITLEMENT boundary — never relax its predicate to fix a rendering bug

**Surface:** `lib/json_api/image.rb` — deciding whether a viewer gets the real
image or the unlicensed fallback.

A user-uploaded image was rendering as the wrong symbol, and the fix relaxed the
gate from `!allowed_sources.include?(settings['protected_source'])` to additionally
require `settings['protected_source'].present?` — on the stated theory that a user's
own upload is "protected with a blank source". **That theory is false**, and one
console call disproves it:

```ruby
bi = ButtonImage.process_new({'url' => 'data:image/png;base64,AAA'}, {:user => u})
bi.protected?                      # => false
bi.settings['protected_source']    # => nil
bi.settings['license']             # => {"type" => "private"}
```

`generate_defaults` gives an upload a *private LICENSE*; it never sets
`settings['protected']`. `protected?` reads only `settings['protected']`, which is
set exclusively from library-search params. So uploads never reach that branch at
all — the change could not have been fixing the reported symptom, and what it DID do
was serve gated library symbols (records with `protected => true` and no recorded
source) to viewers with no subscription. `Board#track_protected_sources` treating a
blank source as `'lessonpix'` is the codebase's own evidence that such records exist.

**Rules:**
- A predicate that decides "may this viewer see this asset" is a security boundary.
  Widening it to fix a rendering bug is never in scope — diagnose the rendering bug
  instead, and say plainly when it remains undiagnosed (CLAUDE.md rule 0.4).
- **Prove the record shape before writing the fix.** One `process_new` call in a spec
  settles what `protected?` / `protected_source` / `license` actually are. A comment
  asserting a shape is a hypothesis until executed.
- **A boundary spec suite that only tests non-blank values will stay green through a
  blank-value regression.** All 13 pre-existing examples used
  `protected_source => 'asdf'` / `'pcs'`, which is precisely why this landed. Add the
  empty/nil case for any predicate keyed on a field that can be absent, and verify
  the new spec FAILS against the broken version before trusting it
  (see [Query-count specs must be verified to FAIL against the broken state](#pattern-query-count-specs-must-be-verified-to-fail-against-the-broken-state--otherwise-theyre-no-ops)).

**First seen in:** [2026-07-26-adversarial-review-remediation.md](./2026-07-26-adversarial-review-remediation.md)

## Gotcha: compliance status packages must Path-A supersede attested legal docs, not edit them

**Symptom:** A `/compliance-status` done-vs-needed package refreshes
`COMPLIANCE_POSTURE_REPORT.md` / `COMPLIANCE_PROGRAM.md` in place to update counts; CI
`document-register-render --check` fails with "attested revision no longer exists."

**Root cause:** Those files are attested legal artifacts. Editing them changes `contentHash`
while `attestedContentHash` stays pinned. Overwriting the pin would burn the prior attestation.

**Fix recipe:** Leave attested files untouched; write
`docs/legal/<YYYY-MM-DD>_<kebab-slug>_draft.md` successors; register Path A
`supersedes`/`supersededBy`; retarget live bundles; keep frozen binders on the predecessor.
See [2026-08-09-compliance-done-needed-report.md](./2026-08-09-compliance-done-needed-report.md).

## Gotcha: re-attesting attested `docs/legal/**` must supersede, not overwrite `attestedContentHash`

**Symptom:** A skill or agent "fixes" `document-register-render.rb --check` MISMATCH on an
attested legal doc by setting `attestation.attestedContentHash = contentHash` on the same row.
CI goes green; the prior attestation's byte pin is gone.

**Root cause:** `docs/legal/README.md` rules 3–4 freeze attested artifacts (bytes, filename,
location). `priorAttestations` stores dates only, not hashes, so same-row re-pin deletes the
register's only link between the old attestation and those exact bytes. The integrity guard
passing is not the same as preserving the attested record.

**Fix recipe:** Path A — leave the attested file untouched; add
`docs/legal/<YYYY-MM-DD>_<kebab-slug>_<status>.*`; new register row with `supersedes`; old row
`status: superseded` + `supersededBy`; attest the **successor** only. Path B (same-row re-pin)
only for non-`docs/legal/**` git rows or explicit Scot-directed recovery after an already-landed
in-place amend. Skill: `.claude/skills/re-attest-record/SKILL.md`. Example chain:
`DOC-9f6a2412ad` → `DOC-ae3f9d06ef`.

> **SUPERSESSION NOTE, 2026-08-10.** The filename pattern in the Fix recipe above is superseded. The
> original wording is preserved as written, because this is a historical log rather than a live spec.
> The successor path is now `docs/legal/<YYYY-MM-DD>_<kebab-slug>.<ext>` with **no status token**:
> status is a mutable register-row property, and `docs/legal/README.md` rule 3 freezes an attested
> file's name permanently, so a status encoded in the name either goes false at the first status
> change or forces a rename that rule 3 forbids. **A record must never be attested at a `_draft`
> path.** Four dated `_draft` records predating the rule are grandfathered in place while unattested,
> and each must be renamed to the statusless path, with its references repaired, before it is
> attested. Everything else in this entry (Path A versus Path B, supersession pointers, bundle
> retargeting by location) still stands. Authority: `docs/legal/README.md` Naming section, approved
> by Scot 2026-08-10.

> **SUPERSESSION NOTE, 2026-08-11.** The 2026-08-10 note's "rename … before it is attested" clause
> is itself superseded. In-place rename of an already-registered git path changes the DOC-id
> (`expected_id` hashes `canonicalLocation`; render overwrites `id`), which breaks the register's
> permanent-ID promise and makes Notion sync create a new row while orphaning/pruning the old one.
> The four grandfathered `_draft` records stay at their paths while unattested; before attestation,
> leave via **Path A supersession** to a **new** statusless dated file + new register row (attest
> only the successor). Do not rename the registered `_draft` path in place. Authority:
> `docs/legal/README.md` Naming → Transition rule; Codex P2 on PR #784.

**Also retarget live bundles by location, not title.** `meta.bundleDefinitions.*.requiredDocs`
bind by `canonicalLocation`; moving live membership to the successor without updating those
locations fails `--check` as a missing required member. Frozen dated binders can stay on the
predecessor. Worked example (PR #721 recovery): DOC-bff9acf51f → DOC-e62caf7fb9 and
DOC-03cb9fe91f → DOC-90632edc44; see
[2026-08-09-pr721-path-a-supersession.md](./2026-08-09-pr721-path-a-supersession.md). When the
same PR moves `lib/flusher.rb` definitions, re-pin `CAPABILITY-LEDGER.json` `currentEvidence.line`
before the register gate (otherwise capability-check stays masked behind the attested-hash fail).

## Gotcha: git DOC-ids hash `canonicalLocation` — never rename a registered path in place

**Symptom:** A policy says "rename the file, repair inbound references, then attest." After rename +
render, the row's `id` changes; Notion sync creates a new Doc ID page; `supersedes` /
`supersededBy` / notes that cited the old DOC-id go stale.

**Root cause:** `expected_id` is `DOC-` + `sha256(canonicalLocation)[0,10]`, and render always
overwrites `doc['id']` (`scripts/document-register-render.rb`; `meta.idAlgorithm`). For git rows,
path *is* identity. Drive rows use `driveFileId` precisely because Drive IDs survive renames; git
has no equivalent.

**Fix recipe:** Path A — new statusless dated file + new register row that `supersedes` the old
path; mark the old row `superseded`; retarget live bundles by location; attest only the successor.
Do not `git mv` an already-registered `docs/legal/**` path and pretend the DOC-id survived.
Authority: `docs/legal/README.md` Naming → Transition rule (PR #784 Codex P2).

## Gotcha: fail-closed Sentry filters must not collapse lookup failures to nil

`CoppaSentryScrub::TRANSACTION_FILTER` (and `#call`) treat `nil` as anonymous non-child by
design. If `lookup_user` rescues `User.where` timeouts to `nil`, the outer fail-closed rescue
never runs and a potentially-child event ships. Preserve a distinct failure signal
(`LOOKUP_FAILED` sentinel) so `child_user?` can fail closed (scrub errors / drop transactions)
while true anonymous `nil` stays unscrubbed. Ref: `config/initializers/sentry.rb`,
[`2026-07-27-sentry-coppa-review-fixes.md`](./2026-07-27-sentry-coppa-review-fixes.md).

## Gotcha: dual-key tag reads — check each key independently, never `a || b` before coercion

When reading a tag that may exist under symbol or string keys, do not do
`tags[:key] || tags['key']` before validating the value. A truthy non-true symbol value
(e.g. `'false'`, `'yes'`) short-circuits and shadows a string-key `true`/`'true'`. Evaluate
each key through the same coercion helper. Hit in `keep_cache_error_tag?` after the L1
string-coercion change. Ref: `config/initializers/sentry.rb`.

## Pattern: Bedrock AI credentials are a dedicated atomic pair — never fall back to AWS_KEY/AWS_SECRET

Cloud Run mounts `AWS_KEY`/`AWS_SECRET` from the S3/SES least-privilege user
(`scripts/gcp/iam/lingolinq-cloudrun-s3-ses-policy.json`). That principal has **no** Bedrock Mantle
actions. If `AiClient.configured?` treats those keys (plus `AWS_REGION`) as sufficient, every AI
feature reports "configured" then fails AccessDenied at invoke time.

**Rules:**
1. Resolve credentials as **atomic pairs** (`BEDROCK_AWS_KEY`+`BEDROCK_AWS_SECRET`, else
   `AWS_ACCESS_KEY_ID`+`AWS_SECRET_ACCESS_KEY`). Never combine halves from different families.
2. Do **not** fall back to `AWS_KEY`/`AWS_SECRET` for Bedrock — keep the two-tier split.
3. Mantle client kwargs use `aws_secret_access_key` (anthropic Mantle). The older
   `Bedrock::Client` uses `aws_secret_key` — do not rename based on that older API.
4. Provision a separate Bedrock Mantle IAM user + policy
   (`scripts/gcp/iam/lingolinq-bedrock-mantle-policy.json`); do not bolt invoke onto the S3/SES policy.
5. Operator/dev diagnostics that list required env vars must mention **both** accepted
   credential pairs (dedicated Bedrock + standard SDK). Omitting the SDK pair misleads
   local setups that already have `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` and only
   need a region. Keep calling out that `AWS_KEY`/`AWS_SECRET` are not accepted.
6. **The two Bedrock planes are not interchangeable** (learned 2026-08-01). `bedrock-mantle`
   and classic `bedrock-runtime` carry DIFFERENT model catalogs and SEPARATE entitlements.
   Account 239044785114 is entitled only to classic; Mantle 403s every model even with admin
   credentials and `bedrock-mantle:CreateInference` on `Resource: "*"`, so a 403 there is an
   entitlement fact, not an IAM bug. Classic additionally REJECTS bare foundation-model ids
   ("on-demand throughput isn't supported") and requires the `us.` cross-region inference-profile
   form. Opus 4.7 is absent from the classic catalog entirely. Select the plane with
   `BEDROCK_PLANE`; `AiClient.bedrock_model` maps the alias to the plane's wire id.

Evidence: `lib/ai_client.rb`, `spec/lib/ai_client_spec.rb`,
`docs/task-management/2026-07-27-ai-client-bedrock-credential-review.md`.

## Ember until:6.0 deprecation inventory (2026-07-27)

Prep target: clear `until: 6.0` deprecations on Ember 5.12 / Node 22 before any 6.x bump
(Node 24 needs ember-cli 6.7+, not 6.2). Working log (gitignored dated file):
`docs/task-management/2026-07-27-ember-until-6-deprecation-cleanup.md` on branch
`chore/melissa-ember-until-6-deprecations`.

**Inventory result (exercised paths):** zero until:6.0 ids in
`deprecationWorkflow.deprecationLog.messages` and zero console `DEPRECATION` lines during
cold boot (static `dist/`) and board-filtered QUnit / `ember test --filter=board`
(# pass 403, # fail 0). Static checklist also clear for `template-action`,
`component-template-resolving`, Ember barrel, transition-methods, legacy `ember-data/*`
imports (except allowed `ember-data/store`). All `:foo_id` routes have explicit
`model` / `model: function` hooks.

**Gotchas:**
1. Grepping only `model(` under-counts classic `model: function(params)` — dominant here.
2. Headless Chrome against `ember serve` can stick at `readyState=loading` (curl still 200);
   capture via **static `dist/` + Playwright** or Testem Chrome instead.
3. `ember-cli-deprecation-workflow` v4 `flushDeprecations()` may throw
   (`messages.values(...).filter` on a `Set`); read
   `[...deprecationWorkflow.deprecationLog.messages]` instead.
4. `DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false` in `ember-cli-build.js` is the RFC 1026
   **fix** (Store no longer extends EmberObject) — not a silence opt-out. Do not reverse it.
5. `package.json` can list `ember-cli-deprecation-workflow` while `node_modules` lacks it —
   dependency-checker then blocks `ember serve` until `npm install`.

**Still open before claiming fully clear:** ~~Rails-backed authenticated smoke~~ (done);
enable `no-implicit-route-model` (done Phase 2); ~~reverse store-extends opt-out~~
(**misframed** — `DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false` already *is* the RFC 1026
fix); then `throwOnUnhandled: true` for test (Phase 3; watch `binding-style-attributes`).

## Phase 2 until:6.0 hardening (2026-07-27)

- Enabled `no-implicit-route-model: true` in `app/frontend/config/optional-features.json`
  after verifying every `:foo_id` route has `model` / `model: function`. Board-filtered
  `ember test` stayed green (# pass 403 / # fail 0).
- **`DEPRECATE_STORE_EXTENDS_EMBER_OBJECT: false` is the fix, not a silence.** Per RFC 1026 /
  deprecations.emberjs.com, setting the flag to `false` opts the Store out of extending
  EmberObject and clears `ember-data:deprecate-store-extends-ember-object`. Do not "reverse"
  it. This app already re-exports `ember-data/store` with no `Store.extend`.
- `binding-style-attributes` (Ember v1.x warning) still fires on some org UI paths; it is
  **not** until:6.0, but it will trip `throwOnUnhandled: true` unless fixed or logged
  (never silenced) in the deprecation workflow before Phase 3 CI hardening.

## Phase 3 until:6.0 CI hardening (2026-07-27)

- `app/deprecation-workflow.js`: `throwOnUnhandled: config.environment === 'test'`
  (dev still logs; production skipped). `workflow: []` — no silence handlers.
- Board-filtered `ember test` stayed green under throw-on-unhandled (# pass 403 / # fail 0).
- `ember-htmlbars.style-xss-warning` (`binding-style-attributes` console text) is emitted via
  Ember `warn()`, not `deprecate()`, so it does **not** enter `ember-cli-deprecation-workflow`
  and does not require a workflow `log` entry to keep tests green.

## Gotcha: batch-path nil is not “missing opts” — key presence vs value

When a batch helper downloads once and fans out (`self.assert_priority` → `wd.assert_priority(opts)`), a failed download still passes the key (`'counts' => nil`). Treating `counts ? … : fallback` as “no list, so fetch per record” turns one S3 failure into N retries — especially when a Redis build lock is released on failure. Distinguish `opts.key?('counts')` (batch: use or skip) from absent key / no opts (per-record path). Ref: `app/models/word_data.rb`, [`2026-07-29-codex-release-review-fixes.md`](./2026-07-29-codex-release-review-fixes.md).

## Gotcha: compliance segment stamps must use validated org ids, not raw params

`Compliance::SegmentResolver.school_path?` treats any present `authored_organization_id` as school (FERPA / `school_authorization_allowed`). Signup authorization may reject a bogus or unauthorized id later, but a compliance stamp that reads the raw request param has already persisted the wrong segment. Pass only the validated org global_id (`org_authorized ? authoring_org.global_id : nil`). Ref: `User#stamp_compliance_profile_from_params!`, [`2026-07-29-codex-release-review-fixes.md`](./2026-07-29-codex-release-review-fixes.md).

## Gotcha: board translation Google egress is users#translate / WordData, not Board#translate_set

`Board#translate_set` only applies a client-supplied translation hash — it does not call Google. The frontend first POSTs words to `/api/v1/users/:id/translate` → `WordData.translate_batch` → `query_translations` (Typhoeus to `translation.googleapis.com`), then posts the result to boards#translate → `translate_set`. An org off-switch that only gates `translate_set` still lets labels leave to Google. Gate the users translate action (and optionally `translate_set` as belt-and-suspenders); do **not** gate `WordData.query_translations` globally because `translate_locale_batch` uses it for library locale files. Org toggles for this live as top-level `settings['external_ai_processing']` (same shape as `default_beta_program_access`), not under `settings['permissions']` (ACL). Check all attached orgs (managers/supervisors), not only `managing_organization` / org_user. Ref: [#691](https://github.com/lingolinq/LingoLinq-AAC/issues/691), [`2026-07-28-org-external-ai-processing-off-switch.md`](./2026-07-28-org-external-ai-processing-off-switch.md).

## Gotcha: Ember Data model ids in tests must be strings — numeric `set('id', N)` fails throwOnUnhandled

With `throwOnUnhandled: true` in test (`app/deprecation-workflow.js`), `store.createRecord(...); record.set('id', 12)` emits Ember Data’s non-strict-id deprecation (“use `"12"` instead”) and fails the suite. Plain button/object ids can still be numbers; **Ember Data model** ids must be strings. Prefer `set('id', '12')` (or `pushPayload` with string ids). Hit in `tests/models/video-test.js` `check_for_editable_license` after Phase 3 CI hardening. Do **not** silence the deprecation — fix the call site.

## Gotcha: Ember 5.12 orphan-template deletion can drop live UI that lived only in the orphan

The Ember 5.12 upgrade deleted "legacy orphan" button-settings partials (`button-settings-picture.hbs`, etc.) that still held controls never ported into the component-based `button-settings.hbs`. Example: per-button `text_only` / `stretch_text_only` ("Show only text (as large as fits) for this button") — runtime attribute + render/save paths stayed wired; only the Picture-tab checkbox disappeared. When removing orphan templates, diff each orphan against the surviving component/controller template for unbound controls before deleting. Ref: [`2026-07-30-button-settings-text-only-checkbox.md`](./2026-07-30-button-settings-text-only-checkbox.md).

## Gotcha: `settings['protected']` stored as the string `"false"` blanks speak-mode images

**Surface:** Button image create/update (`ButtonImage#process_params`) + speak-mode display (`JsonApi::Image` → board `image_urls` → board-detail `_make_btn`).

**Symptom:** Edit mode / Button Settings show the picture; after Save, speak mode shows the label as a text symbol only. DB has a real `image_id` and S3 URL.

**Root cause:** `protected?` was `!!self.settings['protected']`. In Ruby `!!"false"` is **true**. JsonApi then treats the image as gated (blank `protected_source` fails the allowed-sources check), replaces `url` with a missing fallback → `image_urls[id] = nil` → `_make_btn` sets `text_symbol`. Edit mode still looks fine because it uses the in-session `_picked_display_url` / Ember image record, not the blanked API map.

Do **not** “fix” this by relaxing the JsonApi protected-source gate (entitlement boundary — see pattern above). Cast on write and on read:

```ruby
def protected?
  process_boolean(self.settings && self.settings['protected'])
end
# process_params:
self.settings['protected'] = process_boolean(params['protected']) if params['protected'] != nil
```

Same pitfall exists on `ButtonSound`. Related: settings-backed API flags + string `'false'` (beta feedback pattern earlier in this file).

**Evidence:** `lingolinq_admin/animals` shark `1_41045_…` had `protected: "false"` (String), `protected?=true` pre-fix, `url: nil` in `images_and_sounds_for`.

**First seen in:** [`2026-07-30-ai-board-manual-image-not-persisting.md`](./2026-07-30-ai-board-manual-image-not-persisting.md)

## Gotcha: org shell redesign can drop live controller actions that only lived in the old sidebar

The Apr 2026 organizations UI redesign rewrote `organization.hbs` to the md-shell / pill-nav layout and left `find_user` / `masquerade` / `find_board` actions on `controllers/organization.js` with **no template bindings**. API + controller still worked; the only regression was discoverability. When restyling a shell, diff the old template for interactive controls (search, masquerade, license inputs) and either port them or deliberately retire them. Restore home for site-admin user lookup: Organizations directory (`organizations.hbs`) behind `has_admin_access`. Ref: [`2026-07-30-org-directory-find-user-masquerade.md`](./2026-07-30-org-directory-find-user-masquerade.md).

## Gotcha: `modal.open('X')` is a no-op unless `X` is registered in modal-container

After the Ember 5 modal migration, `utils/modal.open` only drives `service:modal` → `modal-container`, which renders an explicit `{{#if (is-equal this.currentTemplate "…")}}` branch per converted component. Opening a legacy controller/template name that was never converted (e.g. `user-results`) sets `currentTemplate` but paints nothing — silent failure. When restoring a `modal.open` call site, confirm the template string appears in both `modal-container.hbs` and the `convertedModals` list in `modal-container.js`. Ref: [`2026-07-30-org-directory-find-user-masquerade.md`](./2026-07-30-org-directory-find-user-masquerade.md).

## Gotcha: session.restore() must re-sync masquerade fields on every call

`restore()` used to set `as_user_id` only when transitioning to authenticated (`token && !isAuthenticated`). Boot restores more than once; later calls skipped that block, so `session.as_user_id` stayed null while `auth_settings.as_user_id` still fed API token-check query params. Symptom: masquerade “works” but Stop Masquerading UI never appears. Always sync `as_user_id` / `original_user_name` from stash whenever a token is present. Ref: [`2026-07-30-org-directory-find-user-masquerade.md`](./2026-07-30-org-directory-find-user-masquerade.md).

## Gotcha: authenticated chrome is AppNavbar, not application.hbs #identity

When `useAppNavbarInHeader` is true (dashboard, org, most user routes), `application.hbs` renders `<AppNavbar>` and **skips** the legacy `#identity` block. Header controls added only under `#identity` in `application.hbs` are invisible on those pages. Put authenticated-nav affordances (e.g. Stop Masquerading next to Upgrade) in `app-navbar-authenticated-inner.hbs` (and the mobile drawer). Ref: [`2026-07-30-org-directory-find-user-masquerade.md`](./2026-07-30-org-directory-find-user-masquerade.md).

## Gotcha: Flusher `transfer_user_content` is not a checklist for `flush_user_content`

Merge reassignment (`transfer_user_content`) and hard-delete (`flush_user_content`) diverge. Models present only in transfer — historically `UserVideo`, `ButtonSound`, `ButtonImage` — will survive account erasure unless flush also sweeps them by `user_id`. Board flush only destroys media when join-table `full_flush` conditions hold, so off-board / message-bank `ButtonSound` rows are invisible to that path. Prefer explicit `Model.where(user_id:).each { flush_record }` over relying on `User` associations (`dependent: :destroy` is often missing). `flush_record` → `destroy` is what schedules Uploadable S3 `remote_remove`. Same class of gap later hit `LogSnapshot` (no transfer entry either — keyed by `user_id`, no FK cascade, no S3; LL-1e2ab28aab / issue #775). Ref: [`2026-07-31-flush-uservideo-buttonsound-erasure.md`](./2026-07-31-flush-uservideo-buttonsound-erasure.md) (LL-854b1d3853), [`2026-08-10-flusher-log-snapshot-sweep.md`](./2026-08-10-flusher-log-snapshot-sweep.md).

## Gotcha: stubbing `Uploader.remote_remove` still needs uploads-bucket URL shapes

Specs that `expect(Uploader).to receive(:remote_remove)` never hit the "scary delete" guard, so `http://www.example.com/...` fixtures can mask regressions. Use uploads-bucket HTTPS paths that match `/\w+\/.+\/\w+-\w+(\.\w+)?$/` after the bucket prefix is stripped (extension optional, end-anchored; `^extras` also allowed — see `lib/uploader.rb:223`). Keep `removable: false` fixtures on non-uploads URLs (e.g. opensymbols) — `check_for_removable` forces `removable=true` for uploads-bucket URLs. Ref: [`2026-07-31-flush-uservideo-buttonsound-erasure.md`](./2026-07-31-flush-uservideo-buttonsound-erasure.md).

## Pattern: a missing env var can turn a storage optimization into silent data destruction

**Surface:** `ExtraData` concern (`app/models/concerns/extra_data.rb`) plus any caller that
stashes data into `@cached_extra_data` before calling `detach_extra_data`.

**Gotcha:** `extra_data_too_big?` hard-returns false unless `ENV['REMOTE_EXTRA_DATA']` is set,
and the upload block in `detach_extra_data` is gated on it. With the var unset the entire
detach is a **silent no-op** that still returns `true`. Meanwhile
`BoardDownstreamButtonSet#generate_defaults` was stripping `data['buttons']` into the in-memory
`@cached_extra_data` for any set over 200 buttons. Nothing got uploaded, so that was the only
copy, and because `generate_defaults` is a `before_save` callback that begins by nilling
`@cached_extra_data`, the very next save recomputed `button_count = 0` and wrote the record
empty. This zeroed 1754 of 2061 prod button sets. The variable appears in no tracked config
anywhere in the repo, and does not appear in the 2026-06-30 45-var Render prod env
accounting either, so its absence is a long-standing misconfiguration of unknown
vintage rather than a cutover regression. (Do not assume "the migration dropped it"
without checking the Render side; the 10 prod sets that carry a nonce come from
`url_for`'s `detach_extra_data('force')` path, which bypasses the env gate at
`extra_data.rb:28`, and are not evidence the var was ever set.)

**Rule:** never move the only copy of data into a transient stash unless the destination is
known to be writable. Gate the strip on the same predicate that gates the write. `LogSession`
already did this correctly (`extra_data.rb:51-53` keeps events in the DB when upload fails);
`BoardDownstreamButtonSet` did not, on the reasoning that button sets are regenerable, but
regeneration hits the identical trap.

**Diagnostic technique that cracked it:** look at the *distribution*, not one record. Every
prod button set was under the 200-button threshold (`bc_max=194`, `bc_gt200=0`) in a library
whose root boards legitimately produce 3717-button sets. A hard ceiling exactly at a constant
in the code is a fingerprint pointing straight at the branch guarded by that constant. One
broken record looks like corruption; the histogram names the line.

**Also:** `extras:rebuild_button_sets` reported success while writing empty sets, which sent a
prior triage session chasing S3 KMS and ImageMagick ghosts. A repair task that cannot detect
its own no-op is worse than no task. It now preflights the storage config and reports roots
that rebuild to zero.

**First seen in:** `2026-08-01-prod-empty-button-sets.md` (PR #724)

---

## Flaky async test at ~position 595 (`ai_word_predictor` / `app_state`) — same singleton-pollution class, module not yet fenced (documented finding, no fix applied)

**Symptom:** an intermittent failure that lands on either `ai_word_predictor` (~#595,
"resolve cached predictions without duplicate fetches") or the adjacent `app_state`
"inject settings" (~#597). Position hops run-to-run; **both pass in isolation**. This is
the same flake *class* as the 2026-07-22 persistence-sync entry (shared-singleton async
pollution: a prior test's late async bleeds into a later test) — but in a **different
module** that the shipped persistence-sync fence/retry does **not** cover.

**Why these two are the victims:** `ai_word_predictor-test` sorts immediately before
`app_state-test` (`ai…` < `app…`), so a leaked async from an `ai_word_predictor` test
fires during a later `ai_word_predictor` test *or* spills into the first `app_state` test.

**Verified pollution surface (`app/utils/ai_word_predictor.js`):**
- Module-level shared state: `_cache`, `_pending_timer`, `_pending_reject`.
- The debounce `_pending_timer` (scheduled via `runLater`) fires `_fetch()` →
  **real `persistence.ajax`**; `ai_word_predictor-test.js` does **not** stub ajax.
- `clear_cache()` (the test's `beforeEach`) resets **only `_cache`** — it does NOT cancel
  `_pending_timer` / null `_pending_reject`.
- `cancelHarnessAsyncWork()` (jasmine `afterEach`, `tests/helpers/sync-test-cleanup.js`)
  cancels persistence's `eventual_store_timer` but **knows nothing about `ai_word_predictor`**.
- Net: an `ai_word_predictor` debounce timer / in-flight `_fetch` XHR is fenced by nothing,
  so it resolves late onto whatever test is running.

**Recommended fix (NOT yet applied — needs the LEARNINGS ≥30-iteration verification budget):**
a **post-test** fence (never a `beforeEach` pre-cancel — that's a documented dead end from
the persistence-sync entry): in `cancelHarnessAsyncWork()` cancel
`ai_word_predictor._pending_timer` + null `_pending_reject`, and **stub `persistence.ajax`**
in `ai_word_predictor-test.js` so `_fetch` never leaves a real XHR in flight. Test-harness
only; production untouched — matches the shipped epoch-fence philosophy. A pragmatic
alternative is extending the name-gated auto-retry in `jasmine.js` to also cover
`ai_word_predictor` / `app_state` (masks rather than fixes).

**Verification burden (why left as a finding):** per the persistence-sync entry, trusting
any fix here requires ≥30 full-suite iterations (~15 min each); 15 green runs prove nothing.

**First seen in:** this branch's CI (`traci/styling/styling-updates`), 2026-08-03. Related:
the 2026-07-22 persistence-sync epoch-fencing entry.

---

## Gotcha: set-field on nested model fields needs nested observer deps (videoChanged pattern)

`editManager.change_button` sync observers that watch only an object reference (`observer('model.book', …)`) do **not** refire when `set-field` mutates nested properties on that object. The video path already documents and implements this (`button-settings.js` `videoChanged` observes `model.video` + `model.video.popup|start|end`). Restoring TarHeel book checkboxes with `set-field` alone is incomplete unless `bookChanged` also observes `model.book.popup` / `.speech` / `.utterance` (or each control calls `change_button`). Separately: TarHeel init defaults are asymmetric — `speech: false`, `utterance: true` (`utils/button.js:163-175`) — so register impact text must not say both default falsy. Ref: [`2026-08-02-ember-register-book-options-codex-fixes.md`](./2026-08-02-ember-register-book-options-codex-fixes.md).

## Gotcha: list-endpoint board records omit `permissions` → false "make a copy" prompt on your OWN board

`Board.permissions` is `attr('raw')` (`models/board.js:900`), populated ONLY when the API response passes `:permissions => @api_user` (`lib/json_api/board.rb:120-122`). The **boards-index** endpoint (dashboard preview, boards page, My Boards picker, sidebar) does **not** pass it, so records loaded via those list surfaces have `permissions === undefined` (same gap the `starred_for_current_user` computed at `models/board.js:934` documents/works around for `starred`). The board-detail route serves the cached list-record via its cache-hit fast path (`routes/user/board-detail.js:116`) without reloading. Then any edit-entry gate that checks `!board.get('permissions.edit')` can't distinguish **"unknown"** (permissions absent) from **"can't edit"** (permissions present, edit=false), so it opens `confirm-needs-copying` on a board the user OWNS. A manual refresh fixes it only because full navigation reloads via the single-board endpoint (which includes permissions).

**Two edit-entry gates had this bug — both fixed:** `app-state.js#toggle_edit_mode` (app-wide toggle) and `board-detail.js#enter_edit_mode` (options-menu "Edit Board", `board-detail.hbs:896`).

**First attempt (reverted — didn't work):** reload the board when `permissions` was *entirely absent* (`!board.get('permissions')`). Failed because the cached list record can carry `permissions` **present but stale `edit:false`** (not undefined), so the `!permissions` guard never fired — AND a `reload()` may be served from the offline/persistence cache, so it isn't a reliable way to refresh permissions anyway.

**Working fix — ownership check (no reload, cache-proof):** ownership is authoritative and ALWAYS available client-side — a board's `key` is `<owner>/<slug>` and `user_name` is the owner. Compute `owner_name = board.user_name || board.key.split('/')[0]`; if it equals `sessionUser.user_name`, the user can always edit directly, so OR it into the gate: prompt-to-copy only when `!permissions.edit && !owns_board`. Owning a board always implies edit rights (server enforces on save anyway), and non-owned-but-editable cases (supervisor/shared) still fall back to `permissions.edit`. The server `show` endpoint DOES send permissions (`boards_controller.rb:390 :permissions => @api_user`) — the gap is purely that LIST endpoints omit it and the board-detail route serves the cached list record. Ref: [`2026-08-04-ui-test-checklist.md`](./2026-08-04-ui-test-checklist.md).
## Gotcha: merging staging into an attestation-correction PR must not take staging's `built` ledger flip

When a compliance PR retracts an overclaim (e.g. #725 Bedrock credential attestation →
`ai-features-anthropic` `partial` / not operational) and staging later lands the runtime fix
that staging's own ledger marks `built` again (#719 mount + #727 classic plane), a naive
"take theirs" on `CAPABILITY-LEDGER.json` undoes the PR thesis.

**Resolution pattern:** keep the correction's status/claimLanguage; fold in the new technical
facts (classic vs mantle, deploy-workflow mount) into antiClaim/notes; state explicitly that
code landing ≠ operative-condition verified. Then regenerate — never hand-edit — with
`ruby scripts/capability-check.rb` and `ruby scripts/document-register-render.rb`. Date-stamp
historical evidence rows that staging's code change would otherwise falsify (e.g. "absent in
deploy-cloudrun.yml" → "absent as of YYYY-MM-DD evidence gather (pre-#719)").

Ref: `docs/task-management/2026-08-03-bedrock-attestation-staging-merge.md` (gitignored working log).

## Gotcha: embed-frame `data-user_token` is UserIntegration#user_token, not User#user_token

Two different credentials share the name `user_token`. `User#user_token` is a permanent HMAC of `global_id` (login-serialized via `lib/json_api/user.rb`). Embed-frame's `data-user_token` is **not** that: `board.js` reads `tool.get('user_token')` from the integration serializer, which mints `UserIntegration#user_token` (integration-scoped, obfuscated user id + integration id + sig). When scoping permanent-token findings (e.g. LL-90045bb29c residual), do not fold embed-frame into `User#user_token` blast radius without verifying the mint site. Ref: [`2026-08-03-ll-90045bb29c-narrow-close.md`](./2026-08-03-ll-90045bb29c-narrow-close.md).

## Gotcha: private uploads bucket — server-side OBZ/OBF import must use signed_internal_url

`lingolinq-prod-uploads` blocks public access. Browser upload (SigV4 POST) can succeed while the worker-side import still fails: `Converters::Utils.remote_to_boards` used to `SafeHttp.get` the raw `https://bucket.s3.amazonaws.com/...` URL, get a 403 XML body, then feed it to rubyzip → misleading `Zip end of central directory signature not found` at progress ~0.22 / `processing_file`. JSON bundle import already signed via `Uploader.signed_internal_url` (`lib/converters/api_json_bundle.rb`); OBF/OBZ import and `Uploader.remote_zip` must do the same, and raise on non-success HTTP before parsing. Ref: [`2026-08-04-obz-import-signed-fetch.md`](./2026-08-04-obz-import-signed-fetch.md).

## Gotcha: a compliance claim about runtime state expires; verify at the SHA and in prod, never from the diff

PR #725 took nine review rounds. The same defect recurred four times, twice by the
reviewer who was correcting it. The pattern is worth naming because it is not a
compliance problem, it is an epistemics problem that any long-lived doc PR will hit.

**The defect:** a runtime-state claim written as an unbounded absolute. "No revision
carries a Bedrock credential." "Bedrock egress has never occurred." "AiClient.build has
always returned nil." Each was true when written and false by merge, because production
changed underneath the branch.

**Why sweeps kept missing it:** grepping the phrasing you remember writing
(`dormant|not operational|no data is sent`) will not match `never occurred`,
`always returned nil`, `currently UNVERIFIED`, `has been since`, or
`is present on any revision`. Enumerate by MEANING, not by phrase: find every line that
mentions the subject alongside a state verb, then check each for an explicit time bound.

**The rule that actually works:** every claim about runtime state carries the window it
covers. Not "X never happened" but "X did not happen between <date/revision> and
<date/revision>, the period this claim covers." An unbounded absolute in a compliance doc
is a latent defect with a fuse on it.

**Reviewers must read bytes, not working directories.** Twice in one session a confident
finding came from a checkout that had drifted from the reviewed head (once the primary
checkout, once an external reviewer's). Use `git show <sha>:<path>` or a fresh fetch.
Corollary: before dismissing a reviewer's finding as stale, verify it against the SHA
they actually reviewed — it may be valid there and already fixed downstream.

**Configuration is not observation.** "Credentials are mounted" does not mean "calls
happened," and "the feature is reachable" does not mean "the feature ran." The original
retracted claim inferred runtime behaviour from deployment config; the correction then
inferred dormancy from deployment config the same way. Separate verified / reachable /
unexercised / unavailable explicitly. `AiApiLog` only records completed logged seam calls,
so a zero-row result proves "no logged seam call completed," never "nothing egressed."

**Regeneration is order-dependent.** `capability-check.rb` writes
`docs/legal/CAPABILITY_LEDGER.md`, which `document-register-render.rb` then hashes. Running
the register renderer first produces a spurious drift failure. Order: capability-check ->
citation-check --render -> calendar -> notion -> document-register-render ->
publication-status.

Ref: PR #725; live-prod verification via a throwaway Cloud Run job on the serving image.

## Gotcha: nested `sound[user_id]=self` 404s on create (replace_helper_params is top-level only)

`ApplicationController#replace_helper_params` rewrites top-level `id` / `*_id` placeholders like `user_id=self` → `@api_user.global_id`, but **not** nested hashes. `Api::SoundsController#create` resolves nested `sound[user_id]` with `User.find_by_path`, which treats non-digit strings as `user_name` — there is no user named `self`, so create returns **404 Record not found** before any `ButtonSound` insert. Images create never looks up nested `user_id`, so picture upload can still work while sound upload fails. Same class of bug as boards index `?user_id=self` (2026-07-15 learning). Fix: treat nested `'self'` as `@api_user` (boards already special-cases `for_user_id == 'self'`), ignore blank, and on the frontend never POST the literal `'self'` — use `currentUser._actual_id || id` or omit. Ref: [`2026-08-04-sound-upload-nested-self-404.md`](./2026-08-04-sound-upload-nested-self-404.md).

## Pattern: board-detail Speak bar must speak vocalization, not just label

**Surface:** board-detail Speak Mode — button with distinct `label` vs `vocalization` (e.g. joke boards: label "Money joke", vocalization = the joke text).

**Symptom:** Button tap speaks the joke correctly; tapping the Speak bar text or mic speaks only the short label.

**Root cause:** Two speak paths. Button tap uses `utterance.speak_button` (`vocalization || label`). Classic `#button_list` uses `utterance.vocalize_list` (same). Board-detail's `speak_sentence` was speaking local `sentence_text`, which joined **labels only**, and `sync_sentence_from_button_list` never copied `vocalization` onto `sentence_parts` chips. Demo speak already had the correct helper (`sentence_text_for` → `vocalization || label`).

**Fix recipe:** Persist `vocalization` on each `sentence_parts` chip when mirroring `app_state.button_list`. Keep display `sentence_text` as labels (chip / text-strip UX). For Speak-bar / mic replay, call `utterance.vocalize_list` (same as classic) so **attached button sounds** play and TTS uses `vocalization || label`. Keep a TTS fallback (`sentence_speak_text`) only when `button_list` has nothing speakable (e.g. phrase-builder chips that never hit `add_button`). `vocalize_list` sets `list_vocalized` / honors `clear_on_vocalize` — that is intentional parity with classic Speak Mode.

**Evidence:** task log [`2026-08-04-speak-bar-label-not-vocalization.md`](./2026-08-04-speak-bar-label-not-vocalization.md); follow-up [`2026-08-04-speak-bar-skips-button-sounds.md`](./2026-08-04-speak-bar-skips-button-sounds.md); `board-detail.js` `_speak_current_sentence` / `sentence_speak_text`; contrast `utterance.js` `speak_button` / `vocalize_list`.

## Pattern: board-detail Speak bar must play attached button sounds, not TTS-only

**Surface:** board-detail Speak Mode with buttons that have recorded `ButtonSound` audio (imported joke boards, rimshot, etc.).

**Symptom:** Button tap plays the recording; Speak bar / mic speaks the label via TTS.

**Root cause:** `speak_sentence` called `speecher.speak_text(...)`. Classic Speak Mode calls `utterance.vocalize_list`, which pushes `{sound: url}` into `speecher.speak_collection` when `button_list[i].sound` is set. The vocalization-text fix did not close this gap.

**Fix recipe:** Route Speak-bar / mic through `utterance.vocalize_list` when `app_state.button_list` has speakable entries. Do **not** use that path for phrase-builder commit (local chips only — would replay a stale utterance).

**Evidence:** [`2026-08-04-speak-bar-skips-button-sounds.md`](./2026-08-04-speak-bar-skips-button-sounds.md).


## Pattern: long-running modal work that must survive dismissal belongs in a service + app-level component, not a "hidden" modal

**Surface:** "Copying Board" progress modal — the copy must keep running when the
user clicks outside it, and must report back later (background drawer → toast).

**Why not the obvious approach:** the modal slot is single-tenant and short-lived.
`services/modal.js#_openModal` destroys the current modal whenever another one
opens, and `app_state.global_transition` closes all modals on every route change.
So you can never "keep the modal open, just minimized" — the surface has to move
out of the modal layer.

**Fix recipe (three pieces, each single-responsibility):**
1. A tiny **state service** (`services/copy-progress.js`): status / payload / a
   dismiss timer, plus a monotonic **token** stamped when the job is backgrounded.
   Result handlers only write if they still own the token, so a second job started
   while the first is pending can't be reported under the wrong subject.
2. An **app-level component** mounted in `templates/application.hbs` (next to
   `<AppToast />`), which is the only region that survives route transitions.
3. In the modal component, capture **every service into a local `const` before**
   kicking off the promise chain, and thread a plain `{token: null}` closure object
   through the handlers. The chain outlives the component — after `modal.close()`
   the component is destroyed, so any `this.get(...)` in a settle handler is a
   latent crash. Guard `this.set(...)` with `isDestroyed`/`isDestroying`.

**Two traps found here:**
- **Backdrop vs. Close are indistinguishable to a modal.** `modal-dialog.js`
  `actions.close` computes `isBackdropClick` internally, then calls the same
  `@action` for both. To branch, add an *opt-in* `@backdropAction` (same additive
  pattern as the existing `@labelledBy`): present → backdrop calls it instead of
  `@action`; absent → every other modal is byte-for-byte unchanged.
- **`{{this.onFoo}}` handlers assigned in `didInsertElement` never bind.** Several
  modal components assign `this.onClose = …` there with a plain (non-`set`)
  assignment, but the child `<ModalDialog>` renders *before* the parent's
  `didInsertElement`, so `@action` stays `undefined` forever (which is why
  `modal-dialog` has a `modal.close()` fallback). Anything the template hands to a
  child must be assigned in **`init()`**.

**Corollary — an actionable notice must not auto-dismiss.** Once the finished
card gained an "Open Board" button, the originally-specced 4 s auto-fade became a
trap: the user has to notice it, read it, and land the click inside that window,
and in an AAC app that motor assumption is exactly the one you cannot make. Timed
fade is for notices that carry no action; anything offering a choice waits to be
answered. (Bonus: dropping the timer removed the runloop entirely from the
service.)

**Evidence:** [`2026-08-06-copy-board-minimize-to-drawer.md`](./2026-08-06-copy-board-minimize-to-drawer.md);
`components/copying-board.js` `minimize`/`start_copying`; `components/modal-dialog.js`
`backdropAction`; `services/copy-progress.js`.

## Gotcha: generic `.button` selectors in the CLASSIC board CSS leak onto the modern board-detail card

The modern board-detail symbol card renders with `class="button md-board-detail-symbol-card …"`
— it carries **`.button` too**. So every classic-renderer rule written as
`.button …` (there are many; the classic board CSS is thousands of lines earlier
in `app.scss`) silently applies to the modern page as well.

Concrete bug: `@media (max-height: 800px) { .button img.symbol { transform:
scale(clamp(0.6, 0.6 + (100vh - 400px)/1000px, 1)) } }` was shrinking every
board-detail symbol on any viewport under 800px tall — `scale(0.968)` at 768px,
`scale(0.6)` at 400px. The rule exists to compensate for the classic renderer's
JS-sized `img_holder` (its own comment says so); the modern card has no such
holder — its symbol is a `flex: 1 1 auto` child that already yields space to the
label — so there the compensation is not just useless, it fights the layout.

**Detection:** you cannot grep for this. The offending rule mentions neither
`board-detail` nor `symbol-card`. Use CDP `CSS.getMatchedStylesForNode` (or
DevTools' Computed → "matched rules") on the real element and read what actually
matched. That is also how to catch the reverse case.

**Fix shape:** exclude by class on the shared element —
`.button:not(.md-board-detail-symbol-card) img.symbol` — rather than moving or
rewriting the classic rule, so the classic board keeps its behavior
byte-for-byte. Any time you touch a `.button …` rule, ask which of the two
renderers you meant, and scope it.

**Related:** the sibling gotcha is picking the wrong renderer entirely (patching
`board.js#to_fast_html` for a board-detail bug) — see
[`2026-08-04-board-button-image-font-ratio.md`](./2026-08-04-board-button-image-font-ratio.md).

## Gotcha: `cqmin` inside an `inline-size` container silently resolves to the viewport

`container-type: inline-size` exposes only the inline axis. Per spec the block
axis is then unavailable, so `cqb`/`cqh` — and therefore **`cqmin`/`cqmax`** —
fall back to the **small-viewport** units instead of the container. The rule
still parses and still computes a number, so it fails silently: the font looks
plausible on one screen and completely wrong on another.

`cqmin` is only meaningful under `container-type: size` (both axes). The
board-detail symbol card has `container-type: size` so `cqmin` is valid there;
the word-prediction tile next to it has `container-type: inline-size`, so the
rule that deliberately mirrors the board label had to stay on `cqw` with a
matched coefficient. Two visually-paired components, two different correct units.

**Rule of thumb:** before writing `cqmin`, confirm the nearest ancestor container
is `container-type: size`. If it is `inline-size`, use `cqi`/`cqw`.

## Pattern: measure the real render before tuning a responsive coefficient

For "make it bigger on small screens" bugs, drive the actual page and read
computed styles — do not reason from a screenshot. The committed Puppeteer works
against the running dev stack (ember :8184 → rails :5000). Auth without a
password: mint a browser `Device` token server-side and seed
`localStorage['lingolinqStash-auth_settings']` in `evaluateOnNewDocument` before
boot (`stashes.persist_raw`, `app/utils/_stashes.js:296`); destroy the temporary
device afterwards.

Why it pays: on the reported board the label was pinned to the clamp **floor**
(10px) against a **35px** user preference — a 3.5× gap that reads as "a bit
small" in a screenshot and tells you nothing about which of four competing
rules to edit or by how much. Measuring also produces honest before/after
numbers, which is what surfaces the real trade: from one fixed card, a bigger
label and a bigger symbol are in direct competition (the symbol is `flex: 1 1
auto` and gets only leftovers), so the growth has to be paid for out of
**padding**, not out of the other element.

**Evidence:** [`2026-08-06-small-screen-button-text-image-padding.md`](./2026-08-06-small-screen-button-text-image-padding.md).

## Gotcha: "the symbol doesn't fill the button" is usually the ASSET, not CSS — measure the opaque box before touching object-fit

Recurring report on board buttons: the symbol looks small and floats in empty
space, so "remove the padding on the image." Before changing anything, measure.
On the reported board the `__image` holder and the `<img>` both had `padding: 0`,
`margin: 0`, no transform, and the img element box was **exactly** the holder box
— CSS was already giving the symbol every available pixel. Two non-CSS causes:

1. **Aspect-ratio letterboxing.** Symbols are square (250×250); the holder is
   wide-and-short, so `object-fit: contain` fills the height and leaves side
   margins. Not removable without cropping or distorting.
2. **Transparent margin baked into the image file.** Render the symbol to a
   canvas and compute its opaque bounding box (`getImageData`, alpha > 12). On
   one sampled board the glyphs occupied **72–92%** of their canvas height, with
   **1–14%** transparent margin per side.

**Why `object-fit: cover` / a global upscale is the wrong fix:** it crops by a
FIXED amount while the baked-in margin VARIES 1–14%. A ~15% crop is harmless on
the median symbol and eats real artwork on the tight ones. For AAC the glyph
outline is the recognition cue, so silently clipping a tenth of the drawing on an
unpredictable subset of buttons is a worse defect than the whitespace.

**What IS safe:** give the image more room instead of scaling it. `__image` is
`flex: 1 1 auto` and the label is `flex-shrink: 0`, so every pixel of label
padding/leading comes straight out of the symbol — trimming label padding and
line-height on short cards enlarges a height-limited symbol with zero risk. The
real fix for (2) is asset-side (trim the sources, or store a per-symbol opaque
bbox and crop via `object-position`), not a stylesheet change.

**Evidence:** [`2026-08-06-small-screen-button-text-image-padding.md`](./2026-08-06-small-screen-button-text-image-padding.md) (Round 2).

## Gotcha: percentage padding resolves against WIDTH — including padding-top/bottom

`padding: 1%` on a block does **not** mean "1% of my height" on the vertical
sides. Per spec every percentage padding (and margin) resolves against the
*containing block's inline size*, i.e. its WIDTH, on all four sides. So a
wide-but-short element gets a vertical inset sized by its width.

Bit us on board buttons: `padding: clamp(1px, 1%, 4px)` was a good fix for
"padding should scale with the button, not the viewport" (a dense board on a wide
screen never matched a `@media (max-width: 1024px)` rule and kept the full 4px).
But on a 108x44 button it then spent ~1% of *108* on the top and bottom of a 44px
box, leaving a dead band under the symbol. Correct form splits the axes:

```scss
padding: 1px clamp(1px, 1%, 4px);  /* vertical flat; horizontal scales — width IS its axis */
```

**Rule of thumb:** percentage padding is only meaningful on the horizontal sides.
If you want a size-responsive *vertical* inset you need a container query
(`cqh`/`cqmin`) or a flat value — never a percentage.

**Related:** for making an element's own padding respond to its own size, a
container cannot query ITSELF; percentage padding against the parent is usually
the cheapest correct lever, since making the parent a container costs
`contain: layout` (a stacking context) on every instance.

**Evidence:** [`2026-08-06-small-screen-button-text-image-padding.md`](./2026-08-06-small-screen-button-text-image-padding.md) (Round 3).

## Gotcha: a media query adds NO specificity — an un-nested rule can silently outrank your breakpoint fix

Chased this for two iterations on board-detail. `@media (max-width: 820px) { .md-board-detail-layout { height: auto; min-height: calc(...) } }` looked like the rule that governed the layout height. It did not. An un-nested rule,
`.md-shell--board-detail:not(.md-shell--board-detail-edit) .md-board-detail-layout { height: calc(100dvh - ...) }`,
has specificity (0,3,0) versus the media rule's (0,1,0) — and **wrapping a rule
in `@media` does not raise its specificity at all**. So the un-nested `height`
won regardless of source order, and an explicit `height` beats `min-height`
outright. Editing the media block changed the computed `min-height` to 373px
while the used height stayed 375px — visibly nothing happened.

**Detection:** if a responsive fix "does nothing", read the *computed* value AND
the matched-rule list (CDP `CSS.getMatchedStylesForNode` / DevTools Computed),
not the file. The winning rule is often the one with no breakpoint on it.

**Rule of thumb:** the breakpoint block is rarely the authoritative owner of a
property. Find the highest-specificity declaration first, and make the change
there — or the breakpoint rule is dead code that merely looks like the fix.

## Pattern: a viewport-filling `calc(100dvh - …)` must subtract every ancestor inset it sits inside

`height: calc(100dvh - var(--topbar-height, 68px))` on a layout nested inside a
shell with `padding-top: 2px` makes the page *always* exactly 2px taller than the
viewport — a permanent scrollbar with nothing to scroll to. Harmless-looking on a
desktop; on a 375px-tall phone it reads as "the board doesn't fit".

**Fix shape:** publish the inset as a custom property **declared on the same rule
as the padding it mirrors**, so the two cannot drift apart, and subtract it with a
`0px` fallback so states that don't set the padding are unaffected:

```scss
.md-shell--board-detail:not(...) { padding-top: 2px; --bd-shell-pad-top: 2px; }
.md-shell--board-detail:not(...) .md-board-detail-layout {
  height: calc(100dvh - var(--topbar-height, 68px) - var(--bd-shell-pad-top, 0px));
}
```

Check for this whenever a `100dvh`/`100vh` sizing rule lives below an ancestor
with padding, a border, or a sticky header.

**Evidence:** [`2026-08-06-board-detail-short-viewport-vertical-fit.md`](./2026-08-06-board-detail-short-viewport-vertical-fit.md).

## Gotcha: a plain inline style LOSES to a CSS `!important` — JS "fit to size" silently no-ops

`label_fit.js` sized board labels with `el.style.fontSize = px`. The responsive
label rules in app.scss are `!important`
(`@media (max-width: 1200px) { … font-size: clamp(…) !important }`), and **a
plain inline declaration does not beat an `!important` one** — only an
`!important` inline does. Two failures compounded and hid each other:

1. The iterative measure loop set a trial size, but the element kept rendering at
   the CSS-forced size, so `scrollWidth`/`scrollHeight` never changed. No trial
   ever "fit", and every label bottomed out at the `MIN_FONT_PX` floor.
2. The floor value it finally wrote was ignored too, so the visible result was
   *no change at all*.

Net effect: the "Shrink labels to fit" preference appeared to do nothing on any
viewport under 1200px — for as long as those `!important` rules existed.

**Detection:** compare the element's `style.fontSize` (inline) against
`getComputedStyle(el).fontSize`. `inline=9px` + `computed=18px` is the signature
— the JS ran, wrote, and was overruled.

**Fix shape:** route every write through one helper using
`el.style.setProperty('font-size', px + 'px', 'important')`, and clear with
`removeProperty`. Do this in the MEASURE loop too, not just the final write, or
the measurement is meaningless.

**General rule:** any JS that measures-then-sizes must set its trial values at a
priority that actually wins, or it is measuring a value it does not control.

## Gotcha: fit-to-box must measure BOTH axes — `word-break: keep-all` makes a long word overflow sideways, never down

`fitWrapped` iterated font-size against `scrollHeight` vs a 3-line box only. The
board labels set `word-break: keep-all` + `overflow-wrap: normal` on purpose (for
AAC, the shape of the whole word is the recognition cue, so never split one), so a
single long word **cannot wrap**: it stays on one line, overflows horizontally,
and `text-overflow: ellipsis` renders `color/visual` → `color/…`. One line always
fits a 3-line box, so the height-only check reported "fits" and the label was
silently truncated instead of shrunk.

Add a width test (`scrollWidth <= boxW - safety`) alongside the height test.

**Also:** the measure loop lifted `-webkit-line-clamp` / `max-height` / `overflow`
to read natural height, and in that state `scrollWidth` reports a couple of px
NARROWER than the restored box renders — so the loop stopped one step early and
the label still ellipsised by 2-3px. A small width safety margin
(`WRAP_WIDTH_SAFETY_PX`, mirroring the existing `INPUT_WIDTH_SAFETY = 0.9`)
absorbs the skew. Derive it from a measurement, not a guess.

**Evidence:** [`2026-08-06-text-symbol-labels-cut-off.md`](./2026-08-06-text-symbol-labels-cut-off.md).
## Pattern: masquerade authorization must emit a fail-closed AuditEvent

**Surface:** `ApplicationController#check_api_token` `as_user_id` / `X-As-User-Id` impersonation (site-admin and org-manager branches).

**Symptom:** FERPA/HIPAA accounting-of-disclosures had no record that an admin viewed or acted inside a student account. PaperTrail whodunnit (`user:<op>:as:<target>`) is not enough (destroy-only / pruned / missing on some models).

**Fix recipe:** On successful authorization, **before** swapping `@api_user`, call a helper that (1) Redis-dedups per operator/target for 30 minutes (`masq_audit/<op>/<target>`, separate from the org auth `masq/...` key), (2) writes `AuditEvent.log_command` with `type=masquerade`, `acting_as`, and `branch`, (3) **fail-closes** (503, no swap) if the row does not persist — same posture as database_schema/contents disclosure reads. Attribute `user_key` to the operator (pre-swap `@api_user`), never the target. Do not emit on denied attempts.

**Evidence:** finding `LL-522c1a6d13`; [`2026-08-05-masquerade-audit-event.md`](./2026-08-05-masquerade-audit-event.md); prior art `schema_explorer.rb` `audit_user_key` / `audit_acting_as`.

## Gotcha: Notion findings Owner is human-owned; FINDINGS.json owner does not sync

`scripts/compliance-findings-notion-sync.rb` only PATCHes register-owned columns (severity, status, disposition, title, etc.). **Owner**, Target date, Program notes, and Needs Scot decision are left untouched so non-devs can manage the board. Setting `"owner": "Melissa"` in `FINDINGS.json` updates the register SSOT for developers but will **not** populate Notion Owner — set that field on the Notion card directly. Scot-only gates remain close / disposition / severity downgrade / accepted-risk. Ref: [`2026-08-05-masquerade-operator-indicator.md`](./2026-08-05-masquerade-operator-indicator.md).

## Pattern: masquerade UI must name the operator, not only that a masquerade is active

Stop Masquerading controls (PR #714) signal masquerade without naming the acting admin. Operator identity is already stashed as `session.original_user_name` (set at masquerade start, restored every `session.restore()`). Expose a stash-safe computed (`masqueradeOperatorName` / `masqueradeStopLabel` on `controllers/application.js`) and bind every chrome path (AppNavbar desktop + menu + drawer, legacy `#identity`, brief). Do not rely on `application.hbs` alone when `useAppNavbarInHeader` is true. Finding LL-cde54765c6. Ref: [`2026-08-05-masquerade-operator-indicator.md`](./2026-08-05-masquerade-operator-indicator.md).


## Pattern: board-picker Cause and Effect uses home-board `settings.categories`, not folder tags

**Surface:** `/board-picker` Cause and Effect tab.

**Symptom:** Tagging a board "Cause and Effect" via Categorize Board only creates a Mine-page folder; the picker stayed empty / "Coming soon".

**Root cause:** Two systems share the word category. (1) Personal folders = `user.settings.board_tags` via the tag-board modal. (2) Catalog browse = `board.settings.categories` with fixed ids (`cause_effect`, `robust`, …), set in Edit Board Details when "can be used as a home board" is checked. The tabbed picker also had a hard-coded coming-soon stub that skipped `_resolveCategoryBoards` for `cause_effect`.

**Fix recipe:** Remove the stub; load via `_resolveCategoryBoards('cause_effect')`. Ensure the board is public + home_board + tagged `cause_effect`. Do not confuse with folder tags. PR #761 also removed the Keyboards "Coming soon" placeholders the same way (`_resolveCategoryBoards('keyboards')`). Traci's later picker rework (`f2cc29f13`, 2026-08-09) put those placeholders back; restored on `fix/melissa-board-picker-stale-category`.

**Evidence:** [`2026-08-05-board-picker-cause-effect-catalog.md`](./2026-08-05-board-picker-cause-effect-catalog.md); `components/board-picker.js` / `.hbs`.

## Gotcha: board-picker empty categories used to fall back to top popular public boards

When `settings.categories` had no matches for a tab, `_resolveCategoryBoards` loaded uncategorized `public` + `home_popularity` (`per_page: 6`). Same ~6 boards (e.g. jokes) then appeared in Simple Starters / Functional / Phrase-Based. Removed that fallback — empty tabs show "None found"; only explicitly tagged home boards appear. Ref: [`2026-08-05-board-picker-cause-effect-catalog.md`](./2026-08-05-board-picker-cause-effect-catalog.md).

## Gotcha: `(fn this.sendAction …)` with a factory helper never runs the action

**Surface:** user boards page Folders accordion (`/u/:user/boards`, `available-boards-section`).

**Symptom:** Clicking Folders header/chevron does nothing; folder filter / drag-drop wired the same way also no-op.

**Root cause:** Same as the `(fn this.ctrlAction …)` factory gotcha. `sendAction` returned a handler function; template used `{{on "click" (fn this.sendAction "toggleFoldersExpanded")}}`, so click called the factory and discarded the returned handler.

**Fix recipe:** The two halves must MATCH. The settled pairing in this component
is **factory `sendAction` (returns a handler) + bare `(this.sendAction "x")`**,
same as `ctrlAction`. Handlers that need the Event (`updateFolderFilter`,
drag/drop) use `selfEventAction`, not `sendAction`.

Both ways of breaking the pairing have been hit here:

- `(fn this.sendAction "x")` against the factory — `fn` calls the FACTORY on
  click and discards the handler it returns, so the action never runs. This was
  the original symptom.
- immediate-invoke `sendAction` against bare `(this.sendAction "x")` — a bare
  sub-expression is a plain-function helper invocation, so Glimmer calls it
  **during render**: `toggleFoldersExpanded` fired on every render pass and
  `{{on "click" …}}` received its `undefined` return. Latent until something
  re-rendered the component mid-transition, which surfaced as `Assertion Failed:
  You attempted to update foldersExpanded … it had already been used previously
  in the same computation` and ABORTED the transition — the visible symptom was
  an unrelated link "not routing".

**Tell for this class of bug:** an assertion naming a component property, with
"first used: While rendering: (instance of an `on` modifier)". That phrase means
the handler ran at render, not on the event.

**Evidence:** [`2026-08-05-boards-folder-accordion-fn-sendaction.md`](./2026-08-05-boards-folder-accordion-fn-sendaction.md); related LEARNINGS entry on `(fn this.ctrlAction …)`. Re-verified 2026-08-10 when boards-page load testing hit the foldersExpanded assertion.


## Gotcha: a self-rescheduling `runLater` makes every acceptance test hang — and the cause is never where the TODO says

`await visit(...)` waits for a settled state, and Ember's test waiters track
runloop timers. So ONE `runLater` callback that re-arms itself blocks every
acceptance test in the app, forever. `app_state#refresh_user` did exactly that on
a 15-minute cycle, which is why every acceptance test touching an authenticated
route in this repo was `QUnit.skip`ped with a TODO blaming the session/auth
bootstrap. The TODO was wrong, and building the auth stub it asked for would have
fixed nothing.

**Diagnose it, don't guess.** Call `visit()` WITHOUT awaiting, wait on a raw
`setTimeout` (not waiter-tracked), then dump `getSettledState()` from
`@ember/test-helpers`:

```js
visit('/some/route');                                  // deliberately not awaited
await new Promise((r) => setTimeout(r, 9000));
console.log(JSON.stringify(getSettledState()));        // debugInfo.timers has STACKS
```

`debugInfo.timers[].stack` names the exact function that scheduled each pending
timer. Three plausible hypotheses (auth, persistence bootstrap, the scanner) were
all wrong; the probe answered it in one run.

**Fix shape:** long-period background polling belongs on a native `setTimeout` /
`setInterval`, not `runLater` — a 15-minute refresh has no business in the runloop
queue, and this codebase already uses native timers for its other pollers. Prefer
that to an `isTesting()` early-return: the first attempt here guarded the
reschedule with `isTesting()` and broke two existing unit tests that assert
`refreshing_user` receives a fresh token. Native timers keep production behavior
AND the token contract, with no test-only branch.

**Related:** bounded retry chains (`resume_scanning`'s 10 attempts on a
100–900ms backoff) do NOT hang the suite — they just make each `visit()` cost
seconds. Only self-perpetuating timers are fatal.

## Gotcha: Mirage 3 needs a config parameter and explicit models — symptoms look like an app hang

Two failures that both present as "acceptance tests don't work", neither of them
in app code:

1. `Mirage config default exported function must at least one parameter` —
   ember-cli-mirage 3.x calls the default export WITH its discovered config and
   expects it to create the server. A 2.x-style `export default function() {
   this.get(...) }` throws inside `startMirage`, i.e. in `beforeEach`, so the test
   never reaches `visit()` at all. Shape:
   `export default function (config) { return createServer({...config, routes}) }`
   with the old body kept as `routes` (invoked with the server as `this`).
2. **Factories are not models.** `mirage/factories/user.js` alone does not create
   `schema.users`; without `mirage/models/user.js` any handler calling
   `schema.users.findBy(...)` throws and Mirage answers **500**, which then fails
   the route and reads like an app bug.

Also: this API's `:id` segments are `find_by_path` values (global_id OR
user_name), and `schema.users.find()` only knows record ids and THROWS on a miss.
Match on `user_name` first and fall back to `find` only for a numeric segment.

**Evidence:** [`2026-08-07-acceptance-test-harness-unblocked.md`](./2026-08-07-acceptance-test-harness-unblocked.md).

## Gotcha: a skipped test's fixtures rot silently

`board-detail-empty-state-test.js` created a board keyed `tester/view-only-empty`
and then visited `/viewer/board-detail/view-only-empty`. Mirage looks boards up by
`<user_name>/<boardname>` from the URL, so the lookup 404'd. The mismatch had been
sitting there unnoticed because the test was skipped — nothing had ever executed
it. When unskipping anything, expect its fixtures to be wrong, and budget for it.

## Pattern: `store_url_now` can resolve WITHOUT a cached copy — `local_url || data_uri` then assigns undefined and destroys the source URL

`persistence.store_url_now` does **not** always hand back something cacheable. It
early-returns `RSVP.resolve({url: url, type: type})` — no `local_url`, no
`data_uri` — whenever `!window.lingoLinqExtras || !window.lingoLinqExtras.ready`,
or the url is `data:` / `file:` / localhost (`app/utils/persistence.js:1521-1526`,
mirrored in `app/services/persistence.js`).

So the idiom `thing[attr] = data.local_url || data.data_uri` silently assigns
**undefined** and throws away the URL it was caching. It is not a no-op — it is
destructive, and permanent for the lifetime of the singleton.

Concretely (`app/utils/speecher.js`): `load_beep()` on app boot
(`routes/application.js:186`) wiped all twelve CDN feedback-sound URLs to
`undefined` whenever extras were not ready. Feedback sounds then go silent, and
every later `load_sound` falls to its `else` and rejects
`{error: "beep sound not saved: " + attr}`.

**Rule: always keep the existing value as the final fallback** —
`data.local_url || data.data_uri || thing[attr]`. A local cache is an
optimisation; the URL is the thing you cannot regenerate. `load_sound`'s own
error path already said so — *"Local cache is optional for UI feedback sounds;
keep the CDN URL for playback"* — it just failed to apply it on the success path.
Check the other `local_url || data_uri` call sites before assuming this is the
only one.

**Second-order effect worth predicting:** fixing it makes the app do *more* async
work in tests, because the corrupted-and-fast-rejecting path was doing none.
Expect timing-sensitive `waitsFor` tests to wobble afterwards, and see the
re-run rule below before blaming yourself.

**First seen in:** [2026-08-08-speecher-load-beep-suite-failure.md](./2026-08-08-speecher-load-beep-suite-failure.md)

## Pattern: separate a real regression from this suite's wandering timeout by RE-RUNNING, not by reasoning

This suite has a standing defect: async work leaks across QUnit module
boundaries, and *some* later test dies on a ~5.5s `waitsFor` timeout. **Which**
test changes every run — observed victims include `dbman`, `persistence
DSAdapter`, `modal`, `progress_tracker`, `login-form`, `speecher`. `6c2b843fb`
reduced it (acceptance modules now run the sync-heavy teardown) but did not
eliminate it.

The trap: you land a fix, the suite comes back with failures that were green in
your baseline, and it looks exactly like you broke something.

**Discriminator — one extra run, no code change:**
- **Same tests fail again** → deterministic → it is yours. Fix or revert.
- **Failing set MOVES or empties** → the ambient flake. Two runs of *identical*
  code producing **disjoint** failure sets is proof on its own.

Worked example: baseline `1 fail (speecher)` → with fix `3 fail (login-form,
DSAdapter ×2)` → same code again `1 fail (modal)`. Zero overlap between the last
two, so the fix was exonerated by evidence rather than by argument. Budget ~13
min per full run and just do it — a `waitsFor` timeout in a module you did not
touch is the signature.

**Corollary:** never quote this suite's failure count as a single number. Quote
it as *"N fail, of which M are the wandering timeout"*, or the next person
inherits a false baseline — which is precisely how the previous hand-off came to
claim 3 standing failures when only 1 was real.

**First seen in:** [2026-08-08-speecher-load-beep-suite-failure.md](./2026-08-08-speecher-load-beep-suite-failure.md)

## Gotcha: "Died on test #N" is the jasmine shim's STEP number, not the Nth `it()`

A failure reading `Died on test #1: [object Object]` under the legacy jasmine
shim (`tests/helpers/jasmine.js`) does **not** mean the first `it()` in the
block. `#1` is the shim's internal step counter; the failing `it()` is named on
the `not ok` line itself. Read the `not ok` line, ignore the `#N`.

Two companions to that message:
- **`[object Object]` means the thing thrown/rejected was a plain object** — look
  for `RSVP.reject({...})` on the path, and grep the literal object shape to find
  it. Here it was `{error: "beep sound not saved: " + attr}`.
- **A "Died" is an escaping exception, not a failed assertion.** The usual cause
  is an **unhandled** rejection: Ember's `setOnerror` rethrows under `isTesting()`
  (`app/app.js:36-38`). So look for a `.then(success)` with **no** rejection
  handler. Of the two `load_beep` tests, only the one lacking a rejection handler
  died — the other saw the same rejection and passed.
- Note `RSVP.all_wait` (`app/utils/misc.js:147-175`) rejects on the **first**
  failure whenever `LingoLinq.all_wait` is falsy — and nothing in the codebase
  ever sets it. One bad item sinks the whole batch immediately.

**First seen in:** [2026-08-08-speecher-load-beep-suite-failure.md](./2026-08-08-speecher-load-beep-suite-failure.md)

## Gotcha: verify a CI job the way CI runs it — `TZ=UTC` — before believing a local red

`spec/lib/stats_spec.rb` builds its window from `2.days.ago.utc` and
`Date.today.to_time.utc`. `Date.today` is **local**. Run it after local midnight
UTC (i.e. any evening in US timezones) and the window spans one fewer day, so
**10 stats examples fail locally and pass in CI**. `organization_spec` "usage_stats"
goes the same way. Under `TZ=UTC` the same 311 examples are green.

Cost of not doing this: two full spec runs (~35 min each) and a confidently
WRONG report that "rspec is red on staging today" — it was red on *this laptop*,
at 22:5x MDT. Always reproduce a CI failure with the CI environment first:

    TZ=UTC DB_USER=... bundle exec rspec

## Gotcha: check the DIFF SCOPE before attributing a failure to your branch

A `sharing_spec` example asserting `b2.allows?(u4, 'view')` failed on the branch
and passed on staging — twice in a row, single-example runs, look conclusive.
It was **not** a regression: re-running the same single example on the branch a
third time passed. It is state/order dependent, and the "A/B" was measuring
leftover database state, not code.

The check that would have prevented the whole detour, in one second:

    git diff --stat origin/staging...HEAD -- app/models/ lib/     # empty

`allows?` lives in `app/models/concerns/permissions.rb`. The branch changed only
three controllers. A model-level `allows?` regression was **impossible**, and no
amount of A/B running should have been allowed to override that. Establish the
blast radius from the diff FIRST; let it veto seductive-looking run results.

Corollary: on a suite with known ordering flakiness, "fails on A, passes on B"
across two single runs is NOT evidence. Re-run the failing side to confirm it
reproduces before attributing anything.

## Pattern: this repo's RSpec suite wanders too — ~4 random failures per full run

Not just QUnit. Two consecutive full `TZ=UTC` runs of the same commit produced
**completely disjoint** failure sets:

| run | failures |
|---|---|
| 1 | board_spec:243, board_spec:5089, board_caching:118, boards_controller:474 |
| 2 | sharing_spec:1161, subscription_spec:1174, subscription_spec:1235, board_set_copier:80 |

Every one of them passes in isolation. They cluster on values written by
deferred `Worker.schedule` work (`downstream_board_ids`, `sync_stamp`,
`private_viewable_board_ids`), which is the same deferred-work-leaks-across-test-
boundaries shape as the QUnit `waitsFor` timeout. Treat "N failures" from a full
run as a distribution, not a fact: classify each one as
isolation-reproducible vs wandering before acting on it.

Aside: a full run once died with `[BUG] Segmentation fault` in
`ethon-0.15.0/lib/ethon/easy/operations.rb:30` (libcurl, via Typhoeus) while
three suites shared the machine. It did not recur on an idle box — treat a
native crash there as resource contention before chasing it as a real bug.

## Pattern: app-booting acceptance modules leak singleton state into later QUnit modules — and FOUR harness-level fixes do not work

**Symptom:** a full `ember test` fails one random test per run with
`condition failed for more than 5500ms`. The victim MOVES every run — observed:
`modal`, `dbman`, `speecher`, `persistence DSAdapter` (four different tests),
`login-form`, `contentGrabbers`. Each passes in isolation.

**Trigger, proven by bisect:** the `setupApplicationTest` acceptance modules.
Excluding them → **2/2 clean** full runs; with them → **4 of 5** runs flaked.
Staging (2 acceptance modules) ran clean; the branch that ADDED a third
(`board-lock-test`, real route transitions + Mirage) flakes.

**Mechanism:** those modules boot the whole app (`routes/application.js` →
`load_beep`, persistence timers, sync). Compounding it, the global `afterEach` in
`tests/helpers/ember_helper.js` is imported **from the jasmine shim** — it pushes
into `all_afters`, consumed only by the shim's own `test_wrap`. Real
`QUnit.module` tests never run it, so `teardownSyncHeavyTestHarness` has never
fired after an acceptance test. (`6c2b843fb` added `'Acceptance'` to the
sync-heavy name list, but the hook reading that list is shim-only — so it never
applied to acceptance modules at all.)

**FOUR fixes that DO NOT work — do not repeat these:**

1. **`QUnit.testDone` running the sync-heavy teardown** → **HANGS THE SUITE.** It
   tears down persistence/sync state between two tests of the SAME acceptance
   module; the next test's `visit()` waits forever. Symptom: log frozen at a
   constant byte count for 20+ min, repeating `"scanning resume timed out"`.
2. **`QUnit.moduleDone` running the same teardown** → **no effect.**
   `cancelHarnessAsyncWork()` cancels TIMERS and clears QUEUES; it does **not
   restore singleton state** the boot already mutated. Cleaning up after the
   module is too late for damage done during it.
3. **Excluding acceptance from the requirejs auto-loader so the bottom-of-file
   explicit imports run last** → **no-op.** ES `import` statements are HOISTED and
   evaluated before the module body, so acceptance still registered at positions
   1-6 regardless of where the statements sit.
4. **Dynamic `import()` before `start()` to defer registration** → **suite never
   starts.** This build is AMD/requirejs, not native ESM; the `import()` promises
   never resolve, so `start()` inside `.then()` never fires and zero tests run.

**Counter-evidence against a 5th ("run acceptance last" via `req()` ordering):**
during a botched bisect the acceptance modules ran at positions 73-77 and **five
of them failed**. They pass at positions 1-6. They appear to be order-sensitive
themselves, so moving them last risks trading one random unit failure for several
deterministic acceptance failures.

**What SHOULD work, and why:** identify the SPECIFIC singleton the boot dirties
for the failing test and restore exactly that — the shape that fixed
`speecher load_beep` (`7b8dd045c`), where `load_beep()` had permanently rewritten
twelve CDN URLs. State restoration, not async cancellation, is the lever.

**Bisect method note:** commenting out the explicit `import` lines is NOT enough
to remove an acceptance module — the auto-loader re-requires it and it then runs
at a different position and fails, producing a meaningless run. Exclude from BOTH
paths and verify the TEST COUNT drops before believing any result.

---

## Pattern: cross-session per-user state must live OUTSIDE the `lingolinqStash-` prefix

**Surface:** anything that has to be remembered across a logout — "where did this
user leave off", per-user device preferences, resume/continue affordances.

**The trap:** `stashes` looks like the natural home for it, and holds several
suggestively-named keys (`root_board_state`, `current_mode`, `last_root`,
`browse_history`, `prior_login`). None of them survive a logout.
`session.invalidate()` calls `stashes.flush()` (`services/session.js:668`), and
`flush` deletes **every** `localStorage` key starting with `stashes.prefix`
(`utils/_stashes.js:191-206`, prefix `lingolinqStash-`, only `usage_log` exempt).
So a "remember this for next login" value stored via `stashes.persist` is
guaranteed to be gone at exactly the moment you want to read it.

**The working shape** (predates this entry — `ll_last_board_<user_name>`, now
consolidated in `utils/session_history.js`): a plain `localStorage` key outside
the stash prefix, suffixed with `user_name` so a shared device keeps each user's
state separate. `session_history.js` owns both `ll_last_board_*` and
`ll_last_location_*`.

**Related trap — `browse_history` / `boardHistory` are not a page history.** They
are the speak/browse **board back-stack**, pushed and popped by
`app_state.get_history`/`set_history` and reset to `[]` on every speak-mode
activation (`app-state.js`, and ~14 call sites in `utils/eval.js`). They cannot
answer "what page was the user on".

**Where to record a route:** `app_state.finish_global_transition` (called from
`routes/application.js#didTransition`). Its sibling `global_transition` runs on
`routeWillChange`, where `router.currentURL` is still the **previous** URL — the
GA pageview at `routes/application.js:176` reads `currentURL` from the
`didTransition` side for the same reason.

**Where the login landing decision lives:** `routes/index.js#afterModel`, gated by
`appState._index_login_entry` (set in `beforeModel` from `transition.from`, true
only on cold boot or a `login*` → `index` transition). Two safety notes for
anyone adding a branch there: `routes/user/home.js` extends this route but fully
overrides `afterModel` **without `_super`**, so a `replaceWith('user.home')`
cannot re-enter your branch; and any route you might redirect *to* must be
excluded from what you record, or you build a loop.

**First seen in:** [2026-08-09-per-user-session-resume.md](./2026-08-09-per-user-session-resume.md)

---

## Pattern: the board PREVIEW and the board ITSELF are two different renderers — parity is not automatic

**Surface:** anything that changes how a button looks on board-detail. The
board-picker / board-preview modal draws the same board through a completely
separate painter, so a board-detail styling change silently does NOT reach it.

- Live board: **DOM + CSS** — `components/board-detail-grid.hbs` +
  the `.md-board-detail-symbol-card--<pos>` rules in `app.scss`.
- Preview: **canvas** — `components/board-preview-canvas.js`, a hand-written
  painter that re-implements fill/border/label/image layout in canvas ops.

**How they drifted (2026-08-09, reported by Melissa on keyboard boards):**

1. **A colour source the preview couldn't see.** The live card's POS class reads
   `part_of_speech || painted_part_of_speech || suggested_part_of_speech`
   (`board-detail-grid.hbs:53`). `suggested_part_of_speech` does not exist in board
   data — `board-detail.js#resolve_unknown_buttons` mints it at render time from
   `/api/v1/search/batch_parts_of_speech`. The canvas read only the FIRST field, so
   every button whose colour came from the lookup fell through to the neutral
   fallback. Keyboard boards are the extreme case: single letters carry no author
   colour and no stored type, but the dictionary types them (letters are nouns →
   peach, "i" → pronoun → yellow, "x" → verb → green).
2. **A hard-coded mode.** The preview passed `@dark_mode={{true}}`; the real board's
   dark mode is the `preferences.board_dark_mode` user pref, default OFF.
3. **A CSS rule with no canvas counterpart.**
   `.md-board-detail--dark .md-board-detail-symbol-card--no-color` (two classes)
   out-specifies every one-class POS rule, so on a DARK board an author-uncoloured
   button is near-white — POS colours only apply in LIGHT mode.

**Rules that fall out of this:**

- When a button's appearance depends on a value computed at render time rather than
  stored on the button, the preview needs the same computation. Put it in a shared
  util (here `utils/parts_of_speech.js`) and have both renderers call it — do not
  re-derive it in the canvas.
- Before assuming a preview/live mismatch is a palette bug, check specificity in
  `app.scss`. `LingoLinq.board_detail_keyed_colors` is built at runtime from the
  same `--fitzgerald-*` custom properties the CSS rules read (`app.js:465`,
  `_variables.scss`), so the palettes cannot drift — only the *inputs* can.
- A hard-coded `@dark_mode={{true}}` (or any mode flag) on a preview is a parity bug
  waiting to happen; mirror the pref the real surface reads.

**Making a network-dependent value cheap enough for a preview:** cache by word at
module scope, cache MISSES as well as hits, and batch. AAC boards repeat the same
closed-class vocabulary, so after the first board a session's lookups are free —
which sped the live board up on re-entry as a side effect. Then hold the first paint
on a `Promise.race([lookup, timeout])`: the preview's loading overlay is already held
until every symbol image settles, so the lookup costs nothing in wall clock, and the
timeout guarantees a wedged request degrades to the old appearance instead of an
empty canvas.

**First seen in:** [2026-08-09-board-preview-styling-parity.md](./2026-08-09-board-preview-styling-parity.md)

---

## Pattern: "whose page is this?" comes from `permissions.user_id`, not from comparing to `currentUser`

**Surface:** any app-level chrome that must behave differently when a supporter is
inside a communicator's account — context banners, guard rails, confirmation
copy, audit prompts.

**The tempting wrong answer:** compare the page's user to
`app_state.currentUser`. `currentUser` is not stable for this — it is swapped by
speak-mode / "speak as" flows, and `referenced_user` is a speak-mode concept too
(`app-state.js#referenced_user` returns `currentUser` unless modeling). Neither
answers "whose account does this ROUTE belong to".

**The reliable answer, already in the payload.** Every user record is serialized
with permissions scoped to the requester (`lib/json_api/user.rb:31` →
`user.permissions_for(viewer)`):

- `permissions.user_id` — the **viewer's** global id, not the record's. It differs
  from the record's `id` exactly when you're on someone else's page.
- `permissions.supervise` / `.model` / `.edit` — present only when the viewer holds
  a supervisory link (`app/models/user.rb:61-66`). A stranger on a public profile
  gets only `view_existence` / `view_detailed`.

Verified in the dev DB (2026-08-09): stranger → `["user_id","view_existence",
"view_detailed"]`; self → `user_id == id`; supporter → `supervise/model/edit` all
true with `user_id` = the supporter. So the test is `id != permissions.user_id`
**AND** one of `edit|supervise|model`. Dropping the second half announces
supervision to strangers.

`permissions_for` lives in the `permissable` gem (via
`app/models/concerns/permissions.rb`), so there is no local `def permissions_for`
to read — check the shape empirically with `rails runner` rather than grepping.

**Publishing it to app-level chrome:** set the page's user on `app_state` from the
PARENT `:user_id` route (`routes/user.js#setupController`), and clear it in
`resetController` when `isExiting`. That one pair covers all ~20 child routes;
setting it per-child is both redundant and a leak waiting to happen. Flows that
address a communicator WITHOUT being under `/:user_id` (the standalone
board-picker) carry `app_state.setup_user` instead — a complete answer has to
consider both, and the classic `/board/*key` route has neither.

**First seen in:** [2026-08-09-supervising-context-pill.md](./2026-08-09-supervising-context-pill.md)

---

## Gotcha: `computed.reads(...)` (and friends) throw at MODULE EVALUATION on Ember 5 — a white screen, and `ember build` won't catch it

**Symptom:** the whole app renders blank, console shows

```
Error occurred:
 - While rendering:
   -top-level
     application
_object.computed.reads is not a function   TypeError
  at Module.callback (assets/frontend.js)
  at requireModule (assets/vendor.js)
  at Resolver.resolve …
```

**Cause:** `import { computed } from '@ember/object'` gives you the `computed`
FUNCTION. It has no `.reads` / `.alias` / `.or` / `.equal` / … properties — those
macros live in `@ember/object/computed` and must be imported by name:

```js
import { reads } from '@ember/object/computed';   // correct
context: reads('appState.supervising_context'),

import { computed } from '@ember/object';         // WRONG
context: computed.reads('appState.supervising_context'),
```

The whole codebase already uses the correct form (`import { alias } from
'@ember/object/computed'` in ~a dozen components); the broken form is the trap
when writing from memory of pre-3.x Ember.

**Why it is so destructive:** the call runs while the module is being EVALUATED,
not when the component renders. The resolver evaluates the module during the
top-level `application` render, so one bad macro in ANY component that
application.hbs reaches blanks the entire app — not just that component.

**Why the build is green anyway:** `ember build` only compiles modules; it never
evaluates them. A clean build says nothing about `computed.reads`. The same is
true of eslint. Catching this needs the app actually loaded in a browser, or a
test that renders it.

**Grep to check a change before shipping it:**
```
grep -rnE "computed\.(reads|alias|and|or|not|equal|bool|empty|notEmpty|gt|lt|oneWay|readOnly|sort|mapBy|filterBy)\b" app/frontend/app --include=*.js
```

**Also note:** in `@ember/object/computed`, `reads` is an alias export of `oneWay`
(`ember-source/dist/packages/@ember/object/computed.js`) — one-way binding, so
setting the local property does not write back through the path.

**First seen in:** [2026-08-09-supervising-context-pill.md](./2026-08-09-supervising-context-pill.md)

## Pattern: "it follows me when I scroll" — the app's scroll container is `#content`, so an overlay must live INSIDE it, not next to it

**Symptom:** a banner/pill/badge stays glued to the viewport while the page
scrolls under it, when it was supposed to sit at the top of the page.

**The trap:** changing `position: fixed` → `absolute` fixes nothing on its own.
In this app the DOCUMENT never scrolls on any page that renders a page footer
(i.e. every non-board page — `footer` = `!currentBoardState`,
controllers/application.js:150):

```
#within_ember:has(.page-footer) { position: fixed; inset: 0; overflow: hidden }   /* app.scss ~l.502 */
#within_ember:has(.page-footer) #content:has(.md-shell) { overflow-y: auto }      /* app.scss ~l.973 */
```

`#content` is the scroll container. An element rendered as a SIBLING of `#content`
(e.g. straight after `</header>` in `application.hbs`) is outside the scrollport,
so it hovers no matter which positioning scheme it uses. Same reason
`guided-tour.js` treats `#content` as "the app's scroll container", and why
`scrollIntoView` moves an `overflow:hidden` `#content` 0→712.

**The fix shape** — render it inside `#content` and give it a containing block
there:

```hbs
<div id="content">
  <MyOverlay />        {{!-- before the {{outlet}} --}}
  {{ outlet }}
</div>
```
```scss
.my-overlay-anchor { position: relative; height: 0; }  /* 0-basis flex item, no layout impact */
.my-overlay        { position: absolute; top: 12px; left: 16px; pointer-events: none; }
```

The zero-height anchor is the load-bearing part: without a positioned ancestor
inside the scroller, an `absolute` child resolves against `#within_ember` again
and you are back where you started.

**Offset math — do NOT add `var(--topbar-height)`.** `top` is measured from the
anchor, which sits at `#content`'s CONTENT-box top, i.e. after the layout's top
padding. `#within_ember #content { padding-top: calc(var(--topbar-height) + 3rem + var(--speak-bar-extra, 0px)) }`
(app.scss ~l.1197, specificity 0-2-0) beats the later `#content { padding: 0 }`
(0-1-0), so nearly every page ALREADY pads past its fixed header; the bento rules
(~l.633/881) restate the same calc. The layouts that zero that padding
(`.board-detail-view`, `.content--no-top-padding`) also zero or hide the header.
So a small constant offset clears the chrome on every page, and a
`--topbar-height`-based one double-counts and drops the element too low.

**Stacking is unaffected by the move:** `#content` sets no `z-index`/`transform`
(and `overflow` alone does not create a stacking context), so the element still
paints in `#within_ember`'s stacking context — above page content at `z-index:
900`, below the `z-index: 1000` fixed header it now scrolls under.

**First seen in:** [2026-08-09-supervising-context-pill.md](./2026-08-09-supervising-context-pill.md)

## Gotcha: a rule in an `@use`d partial LOSES to an equal-specificity rule in app.scss — the partial is emitted first

`app/frontend/app/styles/app.scss` pulls its partials at the TOP (`@use "board_picker"`
is line 13), and Sass emits a module's CSS **before** the using file's own rules.
So every partial rule lands tens of thousands of lines earlier than anything in
app.scss. At equal specificity, later wins — which means **app.scss always beats
the partial** unless the partial out-specifies it.

Seen in `_board_picker.scss`: the compact-grid rule was written as

```scss
.md-shell--board-picker .md-home-boards-picker__grid--compact { … }   /* (0,2,0) */
```

with a comment stating the `.md-shell--board-picker` ancestor was added so the
page's own grid rule would not win. But that ancestor only produced a TIE with

```scss
.md-shell--board-picker .md-home-boards-picker__grid { … }            /* (0,2,0), app.scss ~5259 */
```

so `grid-template-columns`, `justify-content` AND `gap` in the compact rule were
all inert, and the compact grid silently rendered with the detailed grid's
280px-tile columns and 1.5rem gutters.

**Fix shape:** chain both classes on the same element rather than adding an
override block or `!important` —
`.md-shell--board-picker .md-home-boards-picker__grid.md-home-boards-picker__grid--compact`
is (0,3,0) and wins on merit, wherever it sits in the emit order.

**How to check before believing a partial rule is live** (compile and compare
byte offsets — the later offset wins a specificity tie):

```js
const css = require('sass').compile('app/styles/app.scss', {loadPaths:['app/styles']}).css;
['<partial selector> {', '<app.scss selector> {'].forEach(s => console.log(css.indexOf(s), s));
```

**Related:** the sibling trap where a media query adds no specificity, above.

**First seen in:** [2026-08-09-supervising-context-pill.md](./2026-08-09-supervising-context-pill.md) (board-picker styling pass)

## Gotcha: legacy bare-element rules (`h1 { height: 60px }`) silently size modern components — a "gap" with no margin behind it

**Symptom:** visible space between two elements whose CSS says there is none.
The board-picker page head reads `margin: 0` on both the `h1` and the subtitle,
with a comment saying they deliberately touch — yet ~37px sat between them.

**Cause:** `app.scss` ~1826 carries a bare `h1 { display: inline-block; height:
60px; margin: 5px 0 0 5px; }` from the old nav-header logo row. Modern component
rules override `margin` (`.md-hero__title { margin: 0 !important }`) but nothing
overrode **height**, so the (0,0,1) element rule was the only `height` declaration
in play: the heading box was pinned at 60px with its text at the top, and the dead
space below read as a gap. `display: inline-block` from the same rule is why such
a heading's DevTools box hugs its text instead of filling the row — a useful tell.

**How to spot it:** if a box's measured height doesn't match `font-size ×
line-height` and no margin explains the space, grep the compiled CSS for
BARE-ELEMENT rules on that tag, not just class rules:

```js
const css = require('sass').compile('app/styles/app.scss', {loadPaths:['app/styles']}).css;
// print every rule whose selector is/contains a bare `h1` with a box declaration
```

**Fix shape:** neutralise it in the component's OWN rule (`display: block;
height: auto`) — never by editing the legacy rule, which the old header still
needs. Same family as the `.button` leak onto board-detail cards, above.

**First seen in:** [2026-08-09-supervising-context-pill.md](./2026-08-09-supervising-context-pill.md) (board-picker styling pass)

## Gotcha: a shared mixin's `!important` cosmetics beat your MORE SPECIFIC variant rule — the variant silently renders as the base

**Symptom:** a "compact"/"quiet"/"flat" variant renders with the base component's
look — big radius, big shadow, big hover lift — even though the variant rule is
clearly more specific and clearly sets its own values.

**Cause:** `!important` beats non-important **at any specificity**. This codebase's
`@mixin board-card-modern` (app.scss ~94) declares `border-radius`, `border`,
`background`, `box-shadow`, `transition` and its `:hover` shadow/border with
`!important`, and is included at `.md-home-boards-picker__board
.btn.simple_board_icon`. The board-picker's compact-row rule at (0,4,0) set the
same properties plainly — so every one of them was dead, and "compact" rows kept
the gallery tile's 28px radius, `0 8px 20px` shadow and `translateY(-3px)` hover.

Two extras from the same mixin that a variant usually also wants to answer:
- a decorative `::before` hairline (kill with `display: none`, not by fighting it)
- `height: 100%` on the host rule, which together with grid/flex `stretch` makes
  every card in a row as tall as its tallest sibling. A variant that wants
  per-item height needs `height: auto` AND `align-items: start` AND
  `align-self: start` on the wrapper (the page rule often sets `stretch`).

**Rule of thumb:** before writing a variant of a mixin-styled component, grep the
mixin for `!important` and match it property-for-property, with a comment saying
why. Partial-file precedent: `_board_picker.scss` already did this for `img` and
`.name` ("must answer in kind at (0,5,0)") — the shell rule just never did.

**How to confirm rather than guess:** compile and read the emitted rules, then
compare specificity among the `!important` declarations only:

```js
const css = require('sass').compile('app/styles/app.scss', {loadPaths:['app/styles']}).css;
// grep the compiled text for the property and count which rules carry !important
```

**First seen in:** [2026-08-09-board-picker-compact-refinement.md](./2026-08-09-board-picker-compact-refinement.md)

## Gotcha: Bootstrap 3's `.dropdown-menu > li > a` (0,1,2) beats the app's flat `.md-settings-dropdown-item` — the modern skin's flex/gap silently never applies

**Symptom:** A menu wearing the modern dropdown skin renders items with the
glyph jammed against the label (zero gap) and sitting on the text baseline
rather than centred — even though `.md-settings-dropdown-item` clearly declares
`display: flex; align-items: center; gap: 8px`. DevTools shows the `gap` as
"computed" but with no effect, because the box is not a flex container.

**Cause:** Any menu that keeps `dropdown-menu` on the `<ul>` (needed whenever
Bootstrap's JS owns open/close via `data-toggle="dropdown"`) inherits vendored
Bootstrap 3.4.1's
`.dropdown-menu>li>a{display:block;padding:3px 20px;…}` at specificity
`(0,1,2)`. The skin class is a flat `(0,1,0)`, so `display`, `padding` and every
box-model property lose — `gap` is inert in block layout, and an inline `<svg>`
aligns to the baseline. `font-size`/`color`-only skin properties still win, so
the item looks *almost* right, which is why this reads as a spacing bug rather
than a cascade bug.

**Fix recipe:** put the layout properties on a selector that out-specifies
Bootstrap's element chain — `<menu-class> > li > a.<item-class>` is `(0,2,2)` —
and, per Rule #0.7, reuse the one that already exists for that menu rather than
adding a second. These menus usually already have such a rule for
`text-decoration`, for exactly this reason.

**Applies to:** every `<ul class="dropdown-menu md-settings-dropdown-menu">` in
the app. A menu that does NOT carry `dropdown-menu` (custom open/close via
`md-settings-dropdown-wrap`) is unaffected — the flat class works there, which
is why the same markup behaves differently in two places.

**How to confirm rather than guess:** read `display` off the anchor, not `gap`:

```js
getComputedStyle(document.querySelector('.md-settings-dropdown-item')).display
// "block" => Bootstrap won; "flex" => the skin applies
```

**First seen in:** [2026-08-09-extras-dropdown-icon-alignment.md](./2026-08-09-extras-dropdown-icon-alignment.md)

## Gotcha: `overscroll-behavior: contain` on a NON-overflowing `overflow: auto` element swallows the wheel entirely

**Symptom:** "Scrolling is not allowed once the menu is open." The page is fine
everywhere else — it only freezes while the pointer sits over the open
panel/menu, which makes it read as a global scroll lock and sends you hunting
for `body { overflow: hidden }` or a modal backdrop that does not exist.

**Cause:** `overflow-y: auto` makes an element a scroll container **whether or
not it actually overflows**. Pair it with `overscroll-behavior: contain` and a
container with nothing to scroll still counts the wheel as an overscroll, which
`contain` refuses to chain to the ancestor scroller (`#content` here) — so the
gesture is absorbed and nothing moves. The containment does its intended job
only in the rarer state where the content DOES overflow.

**Fix:** drop `overscroll-behavior: contain` from height-capped menus/popovers.
Default chaining scrolls the element first and the page once it bottoms out,
which is the expected behaviour anyway. Keep `contain` only for panels that
overflow essentially always (a long log/list pane), not for one whose cap is a
safety valve.

**How to confirm rather than guess** (a `file://` repro with the real vendor CSS
is enough; no app boot needed):

```js
await page.mouse.move(cx, cy); await page.mouse.wheel({deltaY: 400});
await page.evaluate(() => document.querySelector('#content').scrollTop);
// 0 over the menu but 400 over plain page => the menu is eating the wheel
```

**First seen in:** [2026-08-09-extras-dropdown-icon-alignment.md](./2026-08-09-extras-dropdown-icon-alignment.md)

## Pattern: an overlay gated on an ASYNC-resolved record belongs in a computed, not a flag the route sets

**Surface:** any "show this panel/overlay/prompt on entry, but only for case X"
where case X depends on a record the route fetches — a supervisee, an org, a
subscription.

**The trap:** `setupController` looks like the place to set
`controller.set('show_thing', true)`. Two things break it, and both are silent:

1. **It runs before the record resolves.** `routes/board-picker#setupController`
   calls `_resolve_setup_user`, which fires a `findRecord` — `setup_user` is
   still null when the flag is being set, so anything the panel needs from that
   record (a name to title it) is missing, and any "is this someone else's
   account" test answers wrong.
2. **Re-entry short-circuits.** The resolver skips its own work when the id has
   not changed (`if (user_id != setup_user.id)`), and the controller is a
   SINGLETON, so state left over from the previous visit is still there. A flag
   set inside that branch never fires again for the same user.

**The working shape:** derive visibility, and keep only the DISMISSAL mutable.

```js
_options_dismissed: false,                    // route resets this on entry
show_picker_options: computed('for_self', 'setup_user.id', '_options_dismissed', function() {
  if (this.get('_options_dismissed')) { return false; }
  if (this.get('for_self')) { return false; }  // returns TRUE while the record is null
  return !!this.get('setup_user.id');          // ...so nothing flashes during the load
})
```

The `for_self`-style guard defaulting to `true` on a null record is what
suppresses the flash — worth checking that any such helper you lean on defaults
to the SAFE answer rather than to `false`.

**Related:** dismissing an overlay that sits over already-rendered content should
not be a route change. Lowering it is what lets a "return to options" control
raise it again with no reload.

**First seen in:** [2026-08-10-board-picker-supervisor-options-overlay.md](./2026-08-10-board-picker-supervisor-options-overlay.md)

## Gotcha: Ember Data's `{reload: true}` NEVER reaches the network — the app's adapter is offline-first, use `persistence.force_reload`

**Symptom:** a lookup written to be authoritative silently answers from cache. A
record deleted on the server (or on another device) keeps resolving, so
"does this already exist?" logic decides YES and skips the work — and the code
comment above it confidently claims the opposite.

**Cause:** the app replaces ED's adapter with its own
(`utils/persistence.js#findRecord`, mixed in via `adapters/application.js`
`persistence.DSExtend`). It sets `start_with_local = true` unconditionally and
calls `check_remote()` ONLY when the local db had nothing. ED's `reload` option
is never consulted, so `store.findRecord(type, id, {reload: true})` is a local
read whenever anything is cached.

**The app's actual opt-out** is `persistence.force_reload`, keyed
`<modelName>_<id>` and checked before the local lookup — the switch
`models/base.js#reload` flips. Set it around the call and restore it:

```js
var force_key = 'board_' + expectedKey;
var prior = persistence.force_reload;
persistence.force_reload = force_key;
var restore = function() {
  if(persistence.force_reload === force_key) { persistence.force_reload = prior; }
};
LingoLinq.store.findRecord('board', expectedKey, {reload: true}).then(restore_and_use, restore_and_null);
```

Two details that make this work: the module exports a **Proxy** whose `get` trap
prefers `window.persistence` but which has NO `set` trap, so the write lands on
the same target object the adapter reads (neither class declares `force_reload`,
so nothing shadows it); and a 404 is NOT in the adapter's `local_fallback` list
(only token/5xx/connection/401 are), so a genuinely-missing record still rejects.

**How to confirm rather than guess:** grep the dev log for the request. If the
GET isn't there, the adapter answered locally.

**First seen in:** [2026-08-10-quick-assign-phantom-copy.md](./2026-08-10-quick-assign-phantom-copy.md)

## Gotcha: a 200 on the user PUT does not mean the home board was stored — the server discards invalid refs silently

**Symptom:** the flow completes, the success modal shows, the app navigates to
the boards page — and the user has no home board.

**Cause:** `User#process_home_board` (app/models/user.rb ~2921) validates the
reference and can store nothing while still returning success:

- board can't be resolved (deleted / bad id) -> it DELETES the preference and
  `return true`;
- board exists but is neither viewable by the user nor shareable by the updater
  -> no branch assigns it, and the write is simply skipped.

Both come back as a clean 200, so `user.save().then(success)` is not evidence of
anything.

**Fix shape:** read the value back off the SAVED record and reject if it isn't
ours (`utils/home_board.js#saveHomeBoard`). The response carries the truth —
`lib/json_api/user.rb:76` serializes the authoritative `preferences.home_board`,
`preferences` is `attr('raw')` on the user model, and the adapter applies the
server payload to the record on save.

**Generalize:** for any write the server may sanitize rather than reject, the
client's success test must be "did the server echo what I sent", not "did the
request resolve".

**First seen in:** [2026-08-10-quick-assign-phantom-copy.md](./2026-08-10-quick-assign-phantom-copy.md)

## Gotcha: a translucent control RE-TINTS when its container's state changes — "it changes colour when I click it" is often the parent, not the button

**Symptom:** a button visibly changes appearance when it is clicked/selected, but
NO rule targets its selected state — no `--active` descendant rule, no
`[aria-expanded]` styling, nothing on `.touched`.

**Cause:** the button's background is a bare translucent tint
(`linear-gradient(rgba(hue,.08), rgba(hue,.26))` with no opaque layer). Its
CONTAINER changes background on selection — here `.md-caseload__list-row--active`
paints a verdigris tint + glow across the whole row — and that new background
composites straight through the button. The button's own CSS never changed; what
you see is the parent showing through it.

**Fix:** give the tint an opaque floor — `background: linear-gradient(…), #fff;`.
The gradient still reads, but the parent can no longer contribute.

**How to confirm rather than guess** — two measurements, in this order:

1. Click, then move the pointer AWAY and re-read the computed style. If it now
   matches the resting state, nothing sticks to the button and `:hover` is a red
   herring (this is the step that is easy to stop at — it disproves one cause
   without finding the real one).
2. Render the control inside BOTH container states and sample the PAINTED pixel,
   not the computed style. Computed style is identical in both cases — that is
   the whole point — so only the rendered colour shows the difference:

```js
const png = await page.screenshot({clip: {x, y, width: 1, height: 1}, encoding: 'base64'});
// inflate the IDAT chunk -> raw[1..3] is the pixel's RGB
```

**First seen in:** [2026-08-10-caseload-row-actions-match-panel-tiles.md](./2026-08-10-caseload-row-actions-match-panel-tiles.md)

## Gotcha: a blanket `svg * { stroke: … }` silently flattens every two-tone icon under it

**Symptom:** icons that are two-tone in the markup (neutral navy shape + one
brand accent — the repo convention, see `_focused-view.scss:681`,
`getting-started-icon.hbs`) render as a single flat hue, and nothing in the
markup explains it. Re-colouring the SVG paths changes nothing.

**Cause:** a container-level rule such as

```scss
.md-caseload__quick-action svg *       { stroke: $la-navy; }
.md-caseload__quick-action:hover svg * { stroke: $brand-dusty-denim-aa; }
```

The SVG carries its colours as **presentation attributes**, which sit at the very
bottom of the cascade — ANY CSS declaration beats them. So one rule two levels up
overrides every accent stroke in every glyph it contains, at rest and on hover.

**Fix:** don't set stroke at the container level. Size icons there
(`svg { width; height }`) and let the markup own colour. Scope a single-ink
stroke ONLY to the ranks that genuinely need one — an icon on a filled/dark
button (white), or an unavailable/disabled control (grey).

**Check the hover rule too.** The resting rule is the obvious one; a matching
`:hover svg *` will re-flatten the glyph the moment the pointer lands, which
reads as "the icon changes colour on hover" rather than as the same bug.

**Generalize:** when a styling change must reach markup-set SVG attributes, grep
for `svg *` and `svg path` at every ancestor level before editing the glyph.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Technique: verify a base-rule change by specificity, not by reading the file top to bottom

**Situation:** changing a BASE rule (e.g. `.md-caseload__quick-action`) that a
dozen modifier ranks build on. The risk is a rank that was silently relying on
the base value — or one that sits EARLIER in the file and looks overridden but
isn't.

**Why source order misleads:** in `_caseload.scss` the `--empty` placeholder
rules sit ~500 lines ABOVE the base rule, yet still win, because
`.md-caseload__list-quick .md-caseload__quick-action--empty` is `(0,2,0)` against
the base's `(0,1,0)`. Reading downward suggests the opposite.

**Method:** compile and enumerate the emitted selectors, then score each rank:

```js
const sass = require('sass');
const r = sass.compile('app/styles/app.scss', {loadPaths: ['app/styles'], quietDeps: true});
r.css.split('\n').forEach((l, i) => { if (/md-caseload__quick-action/.test(l)) console.log(i, l); });
```

Any rank at `(0,2,0)`+ survives a `(0,1,0)` base edit; anything at the base's own
specificity needs source order checked. Also confirm each rank overrides every
property the base change touches — a rank that overrides `background` but not
`box-shadow` inherits the new shadow.

**Note:** the `sass` CLI in `app/frontend/node_modules/.bin` is broken in this
env (`ERR_REQUIRE_ESM` from chokidar). The JS API above works fine and is the
fastest way to compile-check a SCSS edit without a full `ember build`.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Gotcha: `min-width` + `white-space: normal` does NOT make a flex item's label wrap

**Symptom:** a button is given `white-space: normal` so its two-word label will
wrap to the shared tile width, and a `min-width` to match its neighbours — and it
still renders one line wide, visibly wider than the button it is meant to match.

**Cause:** for a flex item with `flex: 0 1 auto`, the flex **base size** resolves
from `width: auto` → the item's **max-content** size. The max-content size of a
wrapping label is still its full *unwrapped* line. So the item lays out at the
one-line width and only shrinks if the flex container actually runs out of room.
`min-width` is a floor; nothing here supplies a ceiling.

**Fix:** give the item a **definite basis** — `flex: 0 0 <n>px` (or an explicit
`width`). That is what forces the label to wrap inside the box rather than
inflating it. Pair it with `overflow-wrap: break-word` so a locale whose single
word exceeds the inner width breaks instead of spilling.

**Generalize:** "make these two the same width" in a flex row is a *basis*
question, not a *min-width* question. Reach for min-width only when you want a
floor and are happy for content to grow past it.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Gotcha: an ancestor-class rule later in the file beats the modifier rule you are editing

**Symptom:** you edit `.block__el--variant:hover` (or its mixin), the compiled CSS
shows exactly what you wrote, and the browser still renders the old effect.

**Cause:** a *shorter* selector at the SAME specificity sitting later in the file.
In `_caseload.scss`, `.md-caseload__action:hover { box-shadow: 0 1px 4px … }`
sat ~75 lines after `.md-caseload__action--tile:hover`. Both are `(0,2,0)`, so
source order decided it, and the base-class rule flattened every tile's hover
lift. It read as harmless because its comment described what it *didn't* do
("no background override") rather than what it did.

**How to catch it:** before editing a modifier's state rule, grep for the BASE
class with the same pseudo-class — `grep -n '\.block__el:hover' file.scss` — not
just the modifier. If both exist, the later one wins at equal specificity.

**How to resolve it safely:** check whether the base class ever appears WITHOUT
the modifier in markup (`grep -o 'md-caseload__action[a-z-]*' template.hbs | sort
| uniq -c`). If every occurrence carries the modifier, the base rule is dead
weight and should be deleted rather than out-specified.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Technique: a translucent badge/button must be measured on its DARKEST host row state, not on white

**Situation:** a spec hands you a tint + ink pair (e.g. `rgba(42,157,143,0.10)`
background, `#1A7B7A` text). You check it against white, it clears 4.5:1, you
ship it.

**The miss:** the component does not sit on white. In `_caseload.scss` the badge
sits inside a row that paints a verdigris wash on `:hover`, `:focus-within` and
`--active`. The badge's own background is translucent, so that wash composites
straight through it and darkens the backdrop — dropping `#1A7B7A` from 4.54:1 to
**4.27:1**, i.e. it fails precisely while the user is pointing at the row.

**Method:** enumerate every state the ANCESTOR can be in (resting / hover /
focus-within / selected / dark), composite the translucent layers in that order,
and measure the worst one. Same trap applies to a border alpha that has to meet
1.4.11's 3:1 — measure it against the fill on one side AND the row on the other.

**Also:** never put a white radial "highlight" over a saturated fill that carries
white text or white icon strokes. An 8% white wash lifted a 4.75:1 teal to ~4.0:1
locally — and highlights are conventionally placed top-left, which is exactly
where a stacked icon sits.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Gotcha: `flex: 0 0 auto` on a wrapping toolbar causes horizontal page scroll

**Symptom:** you pin a toolbar to its natural width so it starts at the same x in
every row. At desktop it is perfect; at tablet the whole page scrolls sideways.

**Cause:** `0 0 auto` means "base size = max-content, never shrink". The toolbar's
own `flex-wrap: wrap` can only wrap its buttons if the toolbar is allowed to get
narrower — with shrink disabled it holds one long line and overflows.

**Fix:** `flex: 0 1 auto` + `min-width: 0`. Shrink stays available for negative
space only, so at wide widths the item still sits at max-content (identical
width row to row, which was the goal) and at narrow widths it shrinks and its
children wrap.

**Related:** to make sibling A absorb a row's slack, set `flex-grow` on A rather
than removing shrink from B. Grow and shrink answer different questions.

**First seen in:** [2026-08-10-caseload-row-tiles-match-home-room-cards.md](./2026-08-10-caseload-row-tiles-match-home-room-cards.md)

## Pattern: demoting UI options to text links — reuse `.md-link-btn`, don't hand-roll a reset

**Surface:** create-board-new chooser (`.nb-create-chooser`), but applies to any "promote two
options, demote the rest" restyle.

**Recipe:** `.md-link-btn` (app.scss ~49610) already exists for `<button>` elements that must
*look* like inline links while keeping button semantics — added 2026-04-11 per WCAG audit when
converting `<a href="#" {{action}}>` to real buttons. Compose it (`class="md-link-btn
<block>__alt-link"`) and add only the block-specific scale/color. Keep them `<button>`s: these
fire actions (file picker, import modals), they do not navigate.

**Two traps:**
1. **`.md-link-btn:hover` sets `text-decoration: none`** (shorthand). Any `text-decoration-color`
   you write in your own `:hover` is dead — the shorthand already zeroed the line. Set only
   `color` on hover; underline-at-rest / none-on-hover is the app-wide convention.
2. **Composition relies on source order, not specificity.** Both selectors are (0,1,0). Your
   overrides win only because your rule sits later in `app.scss`. Verify by compiling and
   comparing output line numbers — don't assume, and don't reach for `!important` (rule 7).

**Also:** when the demoted options leave a stacked list, check whether a feature-flag `{{#if}}`
existed *purely* to vary inline `animation-delay`. In this case the AI button was duplicated
across both branches of `{{#if paste_html_import_enabled}}` for exactly that reason; once the
delays converged it collapsed to one button.

**Verify SCSS with Dart Sass, not SassC.** `app/frontend/ember-cli-build.js:31` pins
`implementation: require('sass')`. A `SassC::Engine` check fails at ~line 681 on `color.adjust`
(a Dart-only module function) — that failure is pre-existing noise, not your change. Compile with
`npx sass --load-path=app/styles app/styles/app.scss <out>`, or via the Node API
(`node -e "require('sass').compile('app/styles/app.scss',{loadPaths:['app/styles']})"`).

**If `npx sass` dies with `ERR_REQUIRE_ESM` (chokidar), you are on the wrong Node.** See the
Node-version entry below — this repo needs Node 22; the API entry point happens to survive on
Node 16, which makes it easy to misread a version problem as a broken tool.

**Evidence:** [`2026-08-07-create-board-chooser-primary-secondary.md`](./2026-08-07-create-board-chooser-primary-secondary.md).

## Gotcha: board-detail's light-mode styles are ancestor-scoped — reused surfaces silently miss them

**Surface:** any view that reuses the `md-board-detail-*` classes outside the board-detail
page. Found twice on the create-board-new live preview.

**Symptom:** the reused surface looks right in DARK mode and wrong in LIGHT mode.

**Root cause:** board-detail's dark rules are written as `.md-board-detail--dark .x`
(ancestor-free, so they follow the class anywhere), but its LIGHT rules are written as
`.md-shell--board-detail:not(...):not(.md-board-detail--dark) .x`. Anything without a
`.md-shell--board-detail` ancestor gets the BASE rule instead — and several base rules are
authored for the opposite surface brightness, so they fail in the worst way: legible
markup, invisible pixels.

**Known members of this family (all now also scoped to `.new-board-mockup-wrap`):**
`.md-board-detail-sentence-bar`, `.md-board-detail-home-btn`,
`.md-board-detail-sentence-bar__tool-btn`, `.md-board-detail-sentence-bar__btn--speak svg`,
`.md-board-detail-symbol-card--empty`.

**Fix recipe:** add the new surface as a second selector on the EXISTING light rule (rule
7) — never a parallel override. Then sweep for the rest before declaring done:
```
grep -n "md-shell--board-detail[^ ,{]*:not(.md-board-detail--dark)" app.scss
```
and for each hit check whether the target class exists in the reusing template.

**The trap that cost a round trip:** changing a container's background WITHOUT auditing the
children means children whose wash assumed the old brightness disappear. `--empty` cards
have three variants (navy wash for light surfaces, white for dark mode, white for
speak-light); flipping the canvas to `$brand-charcoal-dark` while leaving the base navy
wash made every blank card invisible. **Computed-style assertions passed the whole time** —
the card was "visible" with a background — so only a rendered screenshot caught it.

**Evidence:** [`2026-08-07-create-board-chooser-primary-secondary.md`](./2026-08-07-create-board-chooser-primary-secondary.md).

## Gotcha: "my changes vanished" is usually a side branch that only ever merged INWARD

**Symptom:** a shipped, verified UI change is back to its old form on the working branch, with a
clean tree, no stash, and no conflict debris in the history.

**Root cause shape:** a side branch (`traci/styling/new-work`) was merged into the working branch
on day 1, received more commits on day 3, and ended day 3 by merging `staging` *in*. That last
merge feels like "syncing up" and leaves the branch looking current — but it moves code toward the
side branch, never out of it. The new commits stay stranded and the working branch never regresses,
it simply never advanced.

**Find the change without guessing** — enumerate every blob of the file across all refs AND the
reflog, then score each for the shape you remember:

```sh
for c in $(git rev-list --all --reflog); do
  git rev-parse -q --verify "$c:path/to/file"
done | sort -u | while read b; do
  echo "$b $(git cat-file blob $b | grep -c 'class-you-remember')"
done
```

The odd one out is your commit; `git rev-list --all --reflog | ... grep <blob>` names the commit.
Beats `log -S` when you don't know the removed string, and beats `fsck --lost-found` when the
commit is reachable but unmerged.

**Then scope it before panicking.** `git log --oneline HEAD..<branch>` per candidate branch turns
"I lost a lot of work" into an exact count — here, one commit out of five branches checked.

**Prevention:** after committing on a side branch, merge it back out the same session, or don't
merge `staging` in at all — the inward merge is what makes a stranded branch look finished.

**Evidence:** [`2026-08-10-recover-stranded-new-work-commit.md`](./2026-08-10-recover-stranded-new-work-commit.md).

## Gotcha: grepping SCSS for a full BEM class name gives false "unstyled" reads — the rules are nested as `&__…`

**Symptom:** `grep -c "ub-boards-page__folder-filter" app.scss` → 0, so you conclude a whole UI
section lost its styling. It didn't. `app.scss` writes these as nested selectors:

```scss
.ub-boards-page {
  &__folders-section { … }
  &__folder-filter-input { … }
}
```

The literal string `ub-boards-page__folder-filter-input` **never appears in the source** — Sass
composes it at compile time. `grep -rn "&__folder"` finds 101 such rules where the full-name grep
found 0.

**Sound check — test membership against the COMPILED OUTPUT, not the source:**

```sh
node -e "
const sass=require('sass'), fs=require('fs');
const css=sass.compile('app/styles/app.scss',{loadPaths:['app/styles'],quietDeps:true}).css;
const used=new Set(fs.readFileSync('<template>.hbs','utf8').match(/<block>__[a-z-]*/g));
console.log([...used].filter(c=>!css.includes('.'+c)));
"
```

**Why it matters here:** this is the *primary* dead-CSS / missing-CSS audit in this repo, and the
naive grep produces a confident false positive in both directions — "unstyled" for nested rules,
and "styled" for a class that only appears inside a comment. Always compile.

**Corollary for rule 7 (edit the original rule, don't stack a new one):** when you "can't find the
existing selector," search for the `&__` suffix under its block before concluding none exists —
otherwise you add a duplicate flat rule that competes with a nested one.

**Evidence:** [`2026-08-10-recover-stranded-new-work-commit.md`](./2026-08-10-recover-stranded-new-work-commit.md).

## Gotcha: `ERR_REQUIRE_ESM` from testem/sass/anything means the shell is on Node 16, not that the tool is broken

**Symptom:** `ember test` builds fine, then dies before launching a browser:

```
require() of ES Module .../testem/node_modules/execa/index.js
from .../testem/lib/utils/fileutils.js not supported.
```

`npx sass` fails the same way via `chokidar`. Both read as "this dependency shipped a breaking
ESM release."

**Actual cause:** the shell's default Node. `nvm`'s default here is **16**, but this repo requires
**22** (`app/frontend/package.json` engines `>=22.0.0 <23.0.0`; both `.nvmrc` files say `22`).
Node 22.12+ supports `require()` of an ES module; Node 16 does not. Same command, same
`node_modules`, different Node → works or throws.

**Fix — take the Node version first, before diagnosing anything else:**

```sh
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

`bin/ember-server` already does this, which is why the dev server works while a bare
`npx ember test` in the same shell does not.

**Why it misleads:** the failure names a third-party file and a real Node limitation, so it looks
like a dependency bug worth pinning or patching. Two wasted moves it invites: adding a resolution
to pin `execa`/`chokidar` back, and writing a Node-API workaround for a CLI that was never broken.
`node -v` first — one second, versus a plausible fix to shared config that would have broken CI.

**Evidence:** [`2026-08-10-recover-stranded-new-work-commit.md`](./2026-08-10-recover-stranded-new-work-commit.md).

## Gotcha: helper-factory vs immediate-invoke must match the TEMPLATE binding form — mixing halves kills the handler

**Surface:** `available-boards-section` folders accordion, but applies to every `this.xAction`
wrapper in a classic component.

Two valid, mutually exclusive contracts:

| Template binding | Component helper must |
|---|---|
| `{{on "click" (this.x "name")}}` | **return** a handler (factory) |
| `{{on "click" (fn this.x "name")}}` | invoke `send()` **immediately** |

The bare subexpression is evaluated at RENDER time (plain-functions-as-helpers, Ember 4.5+). So
pairing a bare binding with an immediate-invoke helper does two bad things at once: it fires the
action **during render**, and it passes `{{on}}` an `undefined` handler, so the control is dead.

**Diagnostic signature** — this exact assertion means you have the mismatch, not a state bug:

```
You attempted to update `foo` ... it had already been used previously in the same computation.
  `foo` was first used: While rendering: (instance of a `on` modifier)
```

**How it happens:** the two halves get fixed in separate commits. Here `f7e52b33e` (08-05) switched
the helper to immediate-invoke to match 24 `(fn …)` bindings — correct at the time — and
`8b1274820` (08-06) rewrote the markup to the bare form (matching the file's five other helpers)
without reverting the helper. Each commit was self-consistent; the pair was not.

**Prefer the factory** when a component has several such wrappers: one contract for all of them,
and the odd one out is what invites this regression.

**The linter will NOT catch it.** `lingolinq/no-fn-handler-factory` only flags the mirror-image
misuse (`(fn factory …)`), and only for a hardcoded name list that does not include `sendAction`.
Cover it with a rendering test that actually clicks —
`tests/integration/available-boards-folders-test.js`.

**Test-fixture trap found writing that test:** Glimmer's `{{#if}}` treats an **empty array as
falsy**, so a stub like `board_list: {results: []}` skips the entire section and every assertion
fails with "element does not exist" — looking like a broken component rather than a thin fixture.

**Evidence:** [`2026-08-10-recover-stranded-new-work-commit.md`](./2026-08-10-recover-stranded-new-work-commit.md).

## Gotcha: a callback assigned in `didInsertElement` is `undefined` for the whole first render

**Surface:** classic components that build `this.onClose = function(){...}` style handlers.
Found on three modals; `speak-mode-intro` had already hit it and fixed it in `init()`.

`didInsertElement` runs AFTER the template renders, so anything the template reads during
render sees `undefined`. Plain assignment (not `this.set`) notifies nothing, so there is no
re-render to repair it. **Three different symptoms, one cause:**

| How the template uses it | Symptom |
|---|---|
| `{{on "click" this.onClose}}` | `TypeError: Cannot read properties of undefined (reading 'bind')` at modifier install — hard render error, button dead |
| `@action={{this.onClose}}` passed to a child | silently undefined; child falls back or does nothing |
| `@onClose={{this.onClose}}` + child does `{{#if @onClose}}` | **the control is never RENDERED at all** |

That third one is the nasty one: there is no error and no dead button to click — the button
simply is not there, so it reads as a design choice.

**Fix:** assign in `init()`. It runs before render, and for handler closures there is no
reason to wait for the DOM. Keep genuinely DOM-dependent work (focus, measurement) and
"the user has now SEEN this" side effects in `didInsertElement`.

**Detection:** a source grep only finds the shape you already know. Grepping
`{{on "click" this.onClose}}` found the first two and would never have found the third,
whose handlers are passed as arguments. What found it was opening every modal in a real
browser and asking "is there a close button, and does clicking it work" —
`app/frontend/scripts/modal-audit-qa.mjs`.

**Cheap regression test, no rendering required:** the contract is "handlers exist on a
freshly constructed component", so `owner.factoryFor('component:x').create()` then
`typeof component.onClose === 'function'` catches all three shapes in ~10ms. Rendering the
real modal to test this costs 8-27s and flakes against QUnit's 15s ceiling.

**Evidence:** [`2026-08-10-modal-scroll-and-close-app-wide.md`](./2026-08-10-modal-scroll-and-close-app-wide.md).

## Gotcha: Puppeteer's `page.click()` silently delivers NOTHING inside this app's modals

**Symptom:** an automated sweep reports every modal's close button as broken, while the same
buttons work fine by hand. Capture listeners on the button record zero mousedown, mouseup AND
click — yet `elementFromPoint` at the button's centre returns an element *inside* the button,
so nothing is overlaying it.

**Cause:** puppeteer runs `scrollIntoViewIfNeeded` and then clicks measured coordinates.
Modals here sit in nested scroll containers — `modal-dialog.js` didRender gives
`.modal-content` an inline `max-height` + `overflow:auto`, and `.modal` is `overflow-y:auto`
whenever `body.modal-open` is set — so the target can move between measure and click.

**Do not conclude the handler is broken.** Distinguish the two:

```js
await page.click(sel);                                   // trusted, real coordinates
if (stillOpen) { await page.evaluate(() => el.click()); } // untrusted, but a real DOM event
```

Both fail -> the handler really is dead. Only the first fails -> automation artifact; report
it as information, never as a defect. `el.click()` still exercises the `{{on "click"}}`
binding, which is what handler-wiring defects break, so it is a sound fallback — it just does
not exercise the trusted-pointer path (`raw_events.js` buttonTracker), so it cannot catch
double-dispatch style regressions.

**Also:** `page.waitForTimeout()` was REMOVED in Puppeteer 24. Written as
`await page.waitForTimeout?.(500)` it is a silent no-op, not a wait — which left a whole sweep
running against the `/login/device` interstitial instead of the app. Assert you reached the
app (URL no longer matches `/login`) rather than trusting a sleep.

**Evidence:** [`2026-08-10-modal-scroll-and-close-app-wide.md`](./2026-08-10-modal-scroll-and-close-app-wide.md).

---

## Pattern: a new per-variant style must be `:not()`-guarded when its class is ALSO on the disabled variant

**Where this bites:** the caseload row's quick actions. `.md-caseload__quick-action--speak`
appears on three elements: the live `<button>` AND both `<span role="note">` unavailable
placeholders, which carry `--empty` as well (`caseload.hbs` ~155-171). The same shape exists
for any `--empty` / `--<action>` pair in that row.

**The trap:** `--empty`'s flat-grey disabled surface is declared at (0,2,0)
(`.md-caseload__list-quick .md-caseload__quick-action--empty`) near the TOP of
`_caseload.scss`. A new variant rule written the way its siblings are written —
`.md-caseload__quick-action.md-caseload__quick-action--<action>`, also (0,2,0) — lands ~1000
lines LATER, so **equal specificity resolves on source order and the new colour silently
repaints the disabled placeholders too.** Nothing errors; the disabled state just stops
looking disabled, which is an accessibility regression (the row communicates unavailability
with surface + ink + border, deliberately not with opacity).

**Do this:** scope the variant so it *cannot* match the disabled element, on the base rule and
on every state:

```scss
.md-caseload__list-quick .md-caseload__quick-action--speak:not(.md-caseload__quick-action--empty) { … }
/* …and the same guard on :hover and :active */
```

Verify by grepping the COMPILED css for the new colour and confirming every selector carrying
it also carries the guard — reading the SCSS is not enough, because the failure is an
ordering effect you cannot see in one rule.

**Two companions in the same row:**
- The row has a shared `:hover` / `:active` that tints EVERY button verdigris. Any variant
  with its own hue must restate both states in its own hue or it flips teal mid-interaction.
- Light tints are ~1.3:1 against the white row, so the BORDER carries WCAG 1.4.11 (3:1), not
  the fill. Alphas do not transfer between hues: `#4C86D8` at 0.62 clears 3:1 but
  `#4E8060` (sage) at 0.62 measures only 2.36:1 and needs 0.80. Compute per hue.

**Evidence:** [`2026-08-12-caseload-speak-sage-glass.md`](./2026-08-12-caseload-speak-sage-glass.md).

---

## Gotcha: a variant with its own `:hover` but no `:active` has NO press feedback for mouse users

**Symptom:** a button visibly arms on hover but nothing happens when you click and hold — the
pane never pushes in. Keyboard activation of the same button flashes the WRONG hue.

**Cause — one omission, two opposite cascade failures.** Found on the caseload row's Model
button, which had `--model` base + `:hover` rules but no `:active` of its own, so presses fell
through to the row's shared `.md-caseload__quick-action:active` (0,2,0):

- **Mouse:** a mouse-down is *also* a hover. `--model:hover` is (0,3,0) and outranks the shared
  (0,2,0) `:active`, so the hover declarations simply persist through the press. The press rule
  never paints. Higher-specificity `:hover` **silently swallows** a lower-specificity `:active`.
- **Keyboard** (Space/Enter — no hover): shared `:active` (0,2,0) ties the variant's BASE rule
  (0,2,0) and sits later in source, so it wins — repainting the button in the shared state's
  hue (verdigris here), not the variant's.

**Rule of thumb:** in a family where the shared `:hover`/`:active` carry a hue, any variant that
overrides `:hover` **must** also override `:active`, at specificity ≥ its own `:hover`, placed
AFTER the `:hover` block so it wins the same-specificity tie during a press. Overriding one
state and not the other is never correct.

**Cheap way to spot it:** list the variant's emitted selectors in the COMPILED css and check
each hue-bearing rank has base → `:hover` → `:active` in that order. In `_caseload.scss`,
`--choose-board` and `--speak` both had the full set; `--model` was the one missing a press
state, which is what made "it's an omission, not a design choice" verifiable rather than a
guess.

**Evidence:** [`2026-08-12-caseload-speak-sage-glass.md`](./2026-08-12-caseload-speak-sage-glass.md).

---

## Gotcha: `backdrop-filter` over an OPAQUE backdrop is visually inert but still costs a compositing layer

**Symptom:** elements don't paint until you scroll them in and out of view, then appear.
Worst on lists, where the cost multiplies per row.

**Check before adding OR keeping `backdrop-filter`:** what is actually behind the element?
In `_caseload.scss` the row buttons sit on `.md-caseload__list-row`, whose background is
`linear-gradient(180deg, #ffffff, rgba($la-navy, 0.02))` — flat and opaque. Blurring flat
white renders nothing, and `saturate()` has no saturation to boost on white. The filter was
pure cost: one compositing layer per button per row.

**The trap is that it looks load-bearing.** These rules are commented as "GLASS", so the
filter reads as the thing making them glassy. It isn't — the gloss sweep (a white
`linear-gradient` fading to transparent) and the inset rim do all the visible work.
Removing `backdrop-filter` from all seven `.md-caseload__quick-action` rules changed nothing
on screen.

**Rule of thumb:** `backdrop-filter` earns its cost only over VARIED or SEMI-TRANSPARENT
content — a modal veil over a board, a bar over scrolling content. Over a solid card, delete it.

**Fast audit** (maps every declaration to its owning rule, so you can see which sit on solid
backgrounds):
```
python3 - <<'PY'
import re
sel=''
for i,l in enumerate(open('app/frontend/app/styles/_caseload.scss'),1):
    if l.rstrip().endswith('{'): sel=l.strip()
    if re.match(r'\s*-?(webkit-)?backdrop-filter:\s*blur', l): print(i, sel, l.strip())
PY
```

**Evidence:** [`2026-08-12-caseload-speak-sage-glass.md`](./2026-08-12-caseload-speak-sage-glass.md).

## Gotcha: `rem` is a trap in this codebase — the root font-size is 10px, so write px

`app.scss` inherits bootstrap's `html { font-size: 10px }` (called out in a comment at
`app/frontend/app/styles/app.scss:5366`). Every `rem` therefore renders at **62.5% of the
usual size**: `1rem` is 10px, not 16px; `3rem` is 30px, not 48px.

This bites hardest when importing a design spec written against a normal 16px base. A new
Reports partial authored straight from such a spec rendered with 9.5px body text (below the
14px WCAG floor and far below this app's AAC type requirement) and a 30px-tall primary CTA
(below the 44×44 minimum target). Nothing errored, nothing warned, and the mistake is
invisible in the SCSS — only measuring the rendered page exposes it.

**Rules:**
1. Write **px** in new partials. The existing partials (`_modern_pages.scss` has zero `rem`)
   already do this deliberately.
2. If porting a spec that uses `rem`, multiply every value by 16 to get the intended px.
3. `rem` inside **media query** parameters is unaffected — media queries evaluate against the
   *initial* 16px root font-size, not the document's. So `@media (max-width: 70rem)` really is
   1120px while `min-height: 3rem` in the same file is 30px. That inconsistency is exactly why
   px-everywhere is the safer convention here.
4. Verify by measuring, not by reading: `getComputedStyle(document.documentElement).fontSize`
   returning `10px` is the tell, and a quick Puppeteer pass over
   `getBoundingClientRect()` catches undersized targets that the stylesheet looks fine about.

**Evidence:** [`2026-08-12-reports-summary-redesign.md`](./2026-08-12-reports-summary-redesign.md).

## Pattern: derive report narrative in a pure util, never in the template or from absent data

The Reports summary needs sentences ("Communication increased this period", "↑ 18%"). Two
traps, both avoided by putting the derivation in a plain module (`app/frontend/app/utils/
report_summary.js`) that takes a Stats object and returns a fully-formed view model:

1. **Only claim what the pipeline actually measures.** `lib/stats.rb` has no prompting or
   independence metric anywhere (`modeled_*` is *partner modeling*, not prompting), so any
   "becoming more independent" phrasing would be fabricated. Grep the server-side derivation
   before writing a sentence about it.
2. **There is no previous-period payload in single-period mode.** `usage_stats2` only exists
   in explicit compare mode. Rather than firing a second `/stats/daily` request or inventing a
   baseline, the summary splits the selected range's `days` payload in half and compares later
   vs earlier — and every generated string *names the earlier half's dates*, so the claim is
   exact instead of implying a period that was never fetched. Guard rails: needs ≥4 days and a
   non-empty earlier half, and a ±5% dead band so noise reads as "steady".

A pure util also makes all of this unit-testable without rendering (12 QUnit tests, no Mirage,
no `setupApplicationTest`) — which is the only practical way to lock down "never claims X".

**Evidence:** [`2026-08-12-reports-summary-redesign.md`](./2026-08-12-reports-summary-redesign.md).

## Pattern: restyling markup that carries a SHARED global class — keep the class, answer every compound bucket

CLAUDE.md says to preserve existing styling class names, so a restyle usually adds its own
class *alongside* the legacy one rather than replacing it. That works, but only if you enumerate
the legacy rule's compound variants — a single base override silently leaks the rest.

The Reports core word list renders `class="report-word-chip weighted_word weight_N"`, where
`weighted_word` / `weight_N` come from `utils/stats.js:134` and are also used by the word cloud
and `Stats::WeightedWords`. app.scss styles them as **one base plus five compound rules**
(`.weighted_word`, then `.weighted_word.weight_10, .weighted_word.weight_9`, `…8, …7`, `…6, …5`,
`…4, …3`, `…0` — app.scss:18515-18543). Because `_reports.scss` is `@use`d and therefore emitted
*first*, a chip rule at `.report-chart-card .report-word-chip` (0,2,0) beats the bare base
(0,1,0) but **ties** with every `.weighted_word.weight_N` (0,2,0) — and a tie loses to source
order. Buckets 3-10 and 0 would have kept app.scss's greys while 1-2 took the new skin.

**Recipe:**
1. Grep the legacy selector for compounds, not just the base: `grep -n "\.weighted_word" app.scss`
   — and remember nested SCSS hides them as `&.weight_10`, so grep the *compiled* CSS when unsure.
2. Give every compound bucket a matching rule one level more specific
   (`.report-chart-card .report-word-chip.weight_9`, 0,3,0). Buckets with no compound rule
   (here `weight_1` / `weight_2`) can fall through to your base.
3. Verify from the rendered page, not the stylesheet: group the live nodes by bucket and read
   back `getComputedStyle` per bucket. Six buckets appeared on real data; all six resolved to the
   new scale, which is the only proof that nothing fell through.

Same shape applies when composing a shared reset like `.md-link-btn` from a partial: the reset
lives in app.scss (emitted later), so the partial's rules must be compound to win — do not reach
for `!important` (rule 7).

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Gotcha: a hand-rolled `margin-top: 56px` on a chart is a MISSING HEADING, not a layout offset

`core-fringe.hbs` and `parts-of-speech-pie.hbs` each wrapped their chart in
`<div style="margin-top: 56px">`. The number was not geometry — it was the height of the *sibling*
card's `<h3>`, hand-copied so the untitled charts would line up with the titled one. Two costs:
the cards had no accessible name at all, and the offset broke the moment the neighbour's title
wrapped. Giving each chart a real card head deleted the magic number and named the card. When you
find a bare pixel offset on an untitled panel, check whether the panel is missing its heading
before treating the number as a spacing decision.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Gotcha: `{{t "Some Text" key="existing_key"}}` silently renders the LOCALE value, not your text

`i18n.t` (`app/frontend/app/utils/i18n.js:50-54`) prefers `langs[preferred][key]` and only falls
back to the inline string when the key is absent. So reusing a key that already means something
else makes the inline default dead code: `sankey-parts-of-speech.hbs` read
`{{t "Parts of Speech Flow" key="parts_of_speech"}}` and had always rendered **"Parts of Speech"**,
because `en.json` defines `parts_of_speech` as `"Parts of Speech"`. Nobody noticed until a second
card legitimately claimed that title and the page showed the same heading twice. When adding a
heading, grep `public/locales/en.json` for the key you are about to reuse and confirm its value
matches the words you typed. The corollary is the safe part: a key that exists in `en.json` but
not in other locales falls back to the inline string, so adding en-only keys never breaks a locale.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Technique: batch the edits, verify ONCE — a Puppeteer round on this app costs ~3-4 minutes

Live-checking a Reports change means: launch Chrome, load `/login`, seed the fields,
sign in, wait out the token round-trip, then reload the page once per viewport with a
~10s settle for the charts. That is 3-4 minutes per run, and it does not get cheaper by
checking fewer things. Verifying one CSS variable at a time turns a twenty-minute task
into an hour.

**Do:** make every edit the diagnosis calls for, then run one script that measures ALL of
them across ALL widths and screenshots each. **Don't:** re-run the harness after each
single-property change to see whether that one landed.

Two corollaries that saved rounds once adopted:
- **Measure the whole chain in one probe.** When a box is the wrong width, walk
  `el.parentElement` to the viewport in a single `page.evaluate` and dump
  `width / left / right / min-width / flex / display` for every ancestor. The culprit
  (here: an Ember component's `div.ember-view` sitting as a flex item with the default
  `min-width: auto`) shows up immediately; guessing at it costs a round each time.
- **Byte-identical numbers across two runs mean the CSS did not rebuild, not that the
  fix failed.** Confirm with `curl -s localhost:8184/assets/frontend.css | grep -A5 '<selector>'`
  before re-diagnosing — that check is seconds, a re-run is minutes.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Gotcha: an Ember classic component's `div.ember-view` is a flex item with `min-width: auto`

`Stats::DataFilter` renders `<div class="ember-view"><div class="md-stats-filter">…`, and
that outer wrapper — which appears in no template and therefore in no stylesheet — becomes
a flex item of whatever row it is dropped into. Its default `min-width: auto` resolves to
the min-content width of everything inside (here the whole period row on one line, 381px),
so at 390px it held the header open at 381px and pushed the page sideways while every
element *inside* it reported `min-width: 0` and looked innocent.

Whenever a flex row containing a classic component overflows, style the wrapper:
`.<row> > .ember-view { min-width: 0 }`. Same trap for `overflow: hidden` and `flex: 1`
that you meant to apply to the component's own root element.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Gotcha: a control with its own `min-width` OVERFLOWS the wrapper you let shrink

Making a flex wrapper shrinkable (`min-width: 0`) does not narrow a control inside it that
carries its own floor. `.md-stats-period-select__trigger { min-width: 128px }` inside a wrap
that collapsed to 46px simply drew 128px wide, centred, spilling ~40px to the LEFT and
landing on top of the label beside it. The rendered symptom reads as clipped text, so it is
easy to chase as an overflow/z-index problem; the measurement (`trigger.left < label.right`)
names it instantly.

**Rule:** exactly one box in the pair owns the width. Either the wrap owns it (wrap
`flex: 1 1 auto; min-width: <floor>`, control `min-width: 0; width: 100%`) or the control
does (wrap `flex: 0 0 auto`). Splitting the floor across both is what produces the overflow.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Gotcha: a two-column grid row puts a full-width child on its OWN row — DOM order decides who lands where

`.report-bar-list__row` is `grid-template-columns: 1fr auto` with three children: label,
value, and a track carrying `grid-column: 1 / -1`. Written label → track → value, the track
auto-places on row 2 and the value is pushed to row 3 — the row silently renders at 64px
instead of 32px (`grid-template-rows: 21.42px 8px 21.42px` is the tell), and a 9-row list
comes out 576px instead of 292px. Nothing errors; the list just scrolls.

Put the full-width spanning child LAST in the markup, or place everything explicitly with
`grid-row`. And when a list is unexpectedly tall, read `getComputedStyle(row).gridTemplateRows`
before touching any gap or font size — it says how many rows you actually got.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).

## Technique: run the chart palette through a validator before restyling a chart

The Reports parts-of-speech pie derived nine slice colors at runtime from the Fitzgerald key
(`stats_colors.partsOfSpeechColor` = `tinycolor(fill).saturate(10).darken(20)`). Computing the
nine hexes and checking them took two minutes and settled the design question outright:
`article` and `other` resolve to the SAME color (`#a38f8f` — `other` matches no `types` entry
and falls back to the same `#ccc` fill as `article`), `conjunction` is the neighbouring grey,
worst adjacent CVD separation ΔE 4.3, six of nine below 3:1 on the card. The chart could not
be read no matter how it was skinned, so the fix was the FORM (sorted, directly-labelled bars
in one hue), not the paint.

Domain color coding — Fitzgerald part-of-speech colors are a real AAC convention and match the
user's own boards — is a genuine reason to keep a palette, but only where something else
carries identity. On a labelled bar list the label carries it; on a nine-slice pie nothing does.

**Evidence:** [`2026-08-12-reports-core-parts-of-speech-cards.md`](./2026-08-12-reports-core-parts-of-speech-cards.md).
## Gotcha: Capacitor offline AAC needs SQLite + Filesystem shims — IndexedDB-only is not speak-ready

**Surface:** Capacitor shell (`lingolinq_mobile`) + Ember `dbman` / `capabilities.storage`.

`installed_app: true` alone does not enable Cordova offline. Without `window.sqlitePlugin`, `dbman` falls back to IndexedDB and logs `should be using sqlite but using indexeddb instead`. Without filesystem (`cordova.file` or `window.file_storage`), `storage.status.available` stays false and sync cannot cache symbol/sound blobs for speak mode.

**Working pattern (2026-08):** keep Ember sync logic; install Cordova-shaped shims before `app.js` in the shell (`www/sqlite_bridge.js` → `@capacitor-community/sqlite`, `www/filesystem_bridge.js` → `@capacitor/filesystem` + `Capacitor.convertFileSrc`). Ember backup: `capacitor_bridge.js` + shims imported from `capabilities.js`. Serve speak-mode media via `convertFileSrc`, never raw `file://`. Prod-packaged `app.js` still needs the **shell** bridges.

See `docs/native-apps/capacitor-7-kickoff.md` and task log `2026-08-10-capacitor-offline-boards.md`.

## Gotcha: `capabilities.storage.status()` resolve shape is a contract — do not add diagnostic keys

**Surface:** `app/frontend/app/utils/capabilities.js` `storage.status`, test `capabilities.storage status - should resolve correctly on windows/node`.

Callers (and jasmine `toEqual` tests) treat the resolved object as `{available, requires_confirmation}`. Adding an unused `capacitor: isNativeCapacitor()` key on the `window.file_storage` branch broke CI even when the value was `false` (Electron/desktop also uses `file_storage`). Keep Capacitor native on `capacitor_bridge` / `capabilities.capacitor_native`, not on this status payload.

## Gotcha: Ember unit tests must import app modules as `frontend/...`, not relative `../../app/...`

**Surface:** Ember test module map (`app/frontend/tests/**`).

Relative imports like `../../app/utils/foo` from `tests/unit/utils/` resolve as `frontend/tests/app/utils/foo` and fail to load (`Could not find module`). Use the app module prefix: `import … from 'frontend/utils/foo'`. Example miss: `board-attribution-test.js` (merged in #771).

## Gotcha: contentHash drift — ATTESTED means stop; unattested means regenerate-register

**Surface:** CI `audit-artifacts-integrity` → `document-register-render.rb --check` (post-#766 messaging).

Two different failures share “contentHash drift” wording. **Attested** rows have
`attestation.attestedBy` + pinned `attestedContentHash` (what Scot signed). **Unattested** rows
have empty `attestation: {}` — only a living `contentHash`.

- Unattested drift → `scripts/regenerate-register.sh`, commit JSON + `.md`. Safe.
- Attested drift → do **not** run render (bumps hash, dirties register, fails next as “attested
  revision no longer exists” — the #721 footgun). Revert the file or Scot `/re-attest-record`
  (Path A supersede for `docs/legal/**`).

Example this session: Capability Ledger (`docs/legal/CAPABILITY_LEDGER.md`) is unattested; line
drift from `feature_flags.rb` only needed regenerate after the ledger JSON line bump. Skills:
`.claude/skills/re-attest-record/SKILL.md`, `promote-finding/SKILL.md`; guide:
`docs/legal/COMPLIANCE_DOCS_GUIDE.md`.

## Gotcha: Rails reserves `params['action']` — consent APIs must use `decision` or member approve/deny routes

**Surface:** `Api::SupervisorRelationshipsController#consent_response`, Ember `consent-response` / `pending-consent-requests`.

`params['action']` is always the controller action name (`consent_response`, `approve`, …). A body field named `action` does not carry the client's approve/deny intent. Ship `decision` / `consent_action`, or call `PUT …/approve` / `PUT …/deny` so `action_name` is the decision. Treating `params['id']` as a consent token when the client sent a relationship global id silently breaks in-app approve/deny; authenticated party approve needs `approve_as_party` / `deny_as_party` by global id. See task log `2026-08-12-supervisor-consent-ship.md`.

## Gotcha: `pending_supervisor_requests` was never serialized — fetch the relationships index instead

**Surface:** Ember `user.pending_supervisor_requests` attr + `PendingConsentRequests`.

The User model exposes `pending_supervisor_requests`, but `lib/json_api/user.rb` never populates it. Enabling `supervisor_consent_flow` alone shows an empty pending list. Load pending rows from `GET /api/v1/supervisor_relationships?role=communicator&status=pending` and map into the UI shape (`id`, `requester_name`, `requester_avatar_url`, `permission_level`).

## Gotcha: button-settings Speak must sync vocalization via change_button — set-field alone does not persist

**Surface:** `button-settings` Sound → Speak (`model.vocalization`).

`set-field` updates only the in-modal Button. Board save serializes `board.buttons`, so Speak edits disappear unless synced with `editManager.change_button` (same class of bug as `urlChanged` / `labelChanged`). Closing can also hit `pictureGrabber.clear_image_preview` during teardown; unguarded `controller.set('image_preview', null)` throws “calling set on destroyed object”, which the image-save error path surfaces as a misleading **upload failed** alert. Guard destroyed controllers in clear, and flush vocalization on close. Task log: `2026-08-13-button-settings-vocalization-save.md`.

## Gotcha: a singleton controller + `deactivate`-only teardown leaves global state null on the SECOND visit

**Surface:** `/board-picker?user_id=X`, but the shape applies to any route that mirrors
controller state into a service.

`routes/board-picker.js#deactivate` nulled `appState.setup_user`; the controller kept
its own `setup_user`, because Ember controllers are singletons and nothing cleared it.
The resolver then guarded on `if (user_id != setup_user.id)` — a cheap "already
loaded, skip the fetch" test — so on a second visit to the same id the ids matched,
the whole block was skipped, and the *service* copy stayed null for the entire visit.
Consumers split: the page header read the controller (right name), while
`board-preview-overlay#pick_for_home` read `appState.setup_user || currentUser` and
silently fell through to the supervisor. A supporter's pick was written to their own
account while the page said otherwise.

**Rule:** if teardown clears a mirrored copy, the resolver must RE-ASSERT it on every
pass, not only when the source has to be re-fetched. Keep the fetch guarded; never
guard the assignment. And clear both copies in the same hook — asymmetric teardown is
what makes visit 2 differ from visit 1, which is why this class never shows up in a
single-visit manual test.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Gotcha: Ember query params are STICKY per controller — a bare transition inherits the last value

`queryParams: ['user_id']` with no `resetController` means Ember restores the previous
value on any later transition that does not specify one. In this repo that meant a
supporter who opened the picker for a communicator (`?user_id=X`) and later opened it
**for themselves** from any of six links that pass no query — `getting-started.hbs:52`,
`modeling-ideas.hbs:89`, `guided-tour.js:556/633/800`, `create-board-new.js:1805`,
`controllers/user/index.js:1537` — landed back in the supervisee flow. Two callers
(`dashboard-user-boards.hbs:44`, `user/boards.hbs:97`) pass `user_id=null` explicitly,
which masked it on the common paths and is why it survived review.

**Rule:** any query param that scopes WHO an action writes to needs a `resetController`
clearing it on `isExiting`. Passing `user_id=null` at some call sites is not a fix — it
is a per-caller workaround that hides the default.

**The trap inside the fix:** clearing the param notifies its observer, and **Ember
observers are async** — they fire on the next flush, after the hook returns, on a route
you have already left. Here that late pass re-resolved the setup user to the *current*
user and would have re-introduced the very wrong-target write being fixed. Gate the
resolver on a `_route_active` flag set in `setupController` and cleared as the FIRST
statement of `resetController`; do not rely on `deactivate` vs `resetController`
ordering.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Technique: check whether a server flag is reachable from the CLIENT before fixing the branch it guards

An adversarial review flagged `user.rb:2949-2957` — the org home-board copy takes an
async `Progress.schedule` early return without writing `home_board`, so the client
would resolve the user's OLD board. Real code, real early return, wrong conclusion:
`grep -rn "'async'" app/ lib/ --include=*.rb` shows `non_user_params['async']` is set
only by `organization.rb:1875` (true) and `subscription.rb:656` (false) — both
server-side. No controller ever puts it in `non_user_params`, so a browser PUT always
takes the sync branch, which does write the preference and save.

**Rule:** when a finding depends on a flag being set, grep for every PRODUCER of that
flag, not just its consumers, before writing the fix. One grep separated a real bug
(the unconfirmed write on the same path) from a phantom, and stopped a fix being
written for an unreachable branch — which would have been untestable and would have
implied a defect that does not exist.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Gotcha: the class a template writes is not always the method that "decides" it — check the template, not the helper

An adversarial review reported that the board PREVIEW colours folder buttons the live
board leaves white, and prescribed skipping part-of-speech colour for folders because
`board-detail.js#pos_css_class` returns `'folder'` before it looks at POS. The premise
was right, the prescription was wrong: `board-detail-grid.hbs:53` never calls
`pos_css_class`. It writes
`md-board-detail-symbol-card--{{or btn.part_of_speech btn.painted_part_of_speech btn.suggested_part_of_speech 'default'}}`
straight from the raw fields. `pos_css_class` gates one thing only —
`resolve_unknown_buttons` (`:3738`), which filters on `pos === 'default'` — so folders
are excluded from the LOOKED-UP type and nothing else. An authored `part_of_speech` on
a folder paints on the live board, and the prescribed fix would have stopped the
preview painting it: a new parity bug in the opposite direction.

**Rule:** when a finding says "X decides the colour/class", grep the TEMPLATE for the
class it actually emits before changing anything. A well-named method often turns out
to gate a narrower step than its name suggests.

**Same file, second instance:** the preview suppressed POS whenever `border_color` was
set, its comment claiming to mirror the board. The board's suppressor is
`{{unless btn.background_color '…--no-color'}}` — `background_color` only — and
`--no-color` (`app.scss:80413`) sets `outline-color: transparent` and nothing else, so
it never fights the POS background at all. Read the RULE BODY before believing a class
name suppresses anything.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Pattern: a "feature unavailable" lock must match what the UI actually does

The caseload row rendered a locked `<span role="note">` for modeling-only links saying
More Actions was unavailable — while the row header's own click handler opened the
panel regardless. Two things were wrong, and only one of them was the lock: the panel
is legitimately available on a modeling-only link (it carries Speak, Home Board and
Modeling Ideas, all granted by `model`), and the items that genuinely are restricted
already carried their own "not available when you are linked as modeling-only" copy
inside it.

**Rule:** before gating a container on a permission, check what is INSIDE it. Gating
the panel would have removed capability the link actually has; the honest fix was to
delete the false lock and leave the per-item gating that was already correct. A lock
the next click contradicts is worse than no lock — it teaches users to ignore locks.

Note the boundary that made this a UI defect and not a leak: the server still refuses
the restricted data (`allowed?` → 400), so nothing was exposed. Check where the real
enforcement is before rating a UI affordance as a data-protection finding.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Gotcha: bucketing a time series forward from index 0 puts the short bucket on the NEWEST point

`report_summary.js#buildTrend` opened a weekly bucket every 7 rows counting from the
start, so any range that is not a multiple of 7 ended on a partial bucket: a 60-day
range plotted a 4-day sum beside 7-day sums — a ~43% fall created entirely by bucket
width, on the most recent point of a communicator's progress chart.

**Rule:** anchor buckets to the END of the range (`remainder = rows.length % size`,
first boundary at `remainder`), so the short bucket is the oldest point, where a reader
is least likely to read it as a trend. Carry the bucket's span (`days`) on each point
so a consumer can disclose it. Do not "fix" this by averaging unless the legend and the
data table change units with it, and never by dropping the remainder — that silently
discards real days.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Gotcha: an overlay's z-index is chosen against the wrong neighbour

`.bp-options` sat at `z-index: 5900` with a comment explaining the choice — entirely in
terms of the create-board chooser's 6000. Nobody had compared it to Bootstrap's modal
layer (`.modal-backdrop` 1040 / `.modal` 1050), which every button in that overlay can
open. `check_for_needing_purchase()` returns a promise that settles ONLY when the user
dismisses `premium-required`, so painting that dialog behind the scrim hung the flow
with no exit but a reload.

**Rule:** a full-viewport overlay's z-index has to be justified against everything it
can SUMMON, not just the sibling it visually competes with. When the comment names only
one neighbour, that is the tell. Check whether the overlay's own actions can open a
modal, a flash, or an error dialog — and if the answer is yes, it belongs below the
modal layer, not above it.

**Evidence:** [`2026-08-13-branch-vs-staging-adversarial-review.md`](./2026-08-13-branch-vs-staging-adversarial-review.md).

## Click-testing UI fixes: how a browser probe passes without testing anything (2026-08-14)

From click-testing the adversarial-review fixes (H4/H5/H3/M2/M9) on
`traci/styling/styling-updates`. Every item below cost real time in that session.

1. **`el.click()` cannot detect a z-index/overlay bug — it bypasses hit testing.**
   For anything about stacking, covering scrims, or "is this actually clickable",
   dispatch a REAL mouse click at the element's centre (Puppeteer `elementHandle.click()`
   / CDP) so the topmost element receives it, and assert with
   `document.elementFromPoint()` that the node you hit is the element or a descendant.
   A probe using `el.click()` passes cleanly against the broken build.

2. **A probe that never observes its window must FAIL, not pass.** Make the
   observation itself an assertion: "≥N in-flight frames sampled or FAIL". Two M2 runs
   reported a spotless DOM while testing nothing — first by selecting "Custom Filter"
   (which fires no request), then by re-selecting the period already displayed. Only the
   frame-count guard exposed them. Same shape for races: assert the late response
   actually arrived late AND carried the wrong data, or the race was never created.

3. **Widen the window instead of racing it.** Request interception with a fixed delay
   on the specific URL (`/stats/daily`, `/badges?user_id=<A>`) turns an unobservable
   millisecond window into a deterministic multi-second one. This is what made H5's race
   reproducible after the register had recorded it as "fixed by inspection, not reproduced".

4. **Negative-control in place, no git needed.** While the dialog was open, forcing
   `.bp-options` back to its pre-fix `z-index: 5900` re-covered the close button —
   proving the check bites. Cheap, and the only evidence a passing check is not vacuous.

5. **`aria-selected` is not a reliable "currently selected" signal in this app.**
   `Stats::PeriodSelect` binds it to `is-equal this.selection item.id`, and
   `usage_stats.filter` is UNSET on a default load (`controllers/user/stats.js:296`
   treats absent and `'last_2_months'` as the same), so nothing is marked selected while
   that period is on screen. Compare against the trigger's visible label instead.

6. **Check the finding is even testable against seed data BEFORE writing the probe.**
   M9 needed >10 badges across the caseload and H5 needed two DISTINGUISHABLE badges;
   the seeded demo caseload has 16 communicators and exactly ONE badge, and `db/seeds.rb`
   creates no badges at all. Similarly H4 needs an expired/modeling-only supporter and
   all three seeded SLPs are `org_sponsored_supporter`. Survey the data first; a probe
   written against absent data reports SKIP at best and a false PASS at worst.

7. **Client-side gates can be armed in-page instead of mutating the DB — when the
   defect is client-side.** H4 needs `modeling_only`, a computed; setting its plain
   dependency `modeling_session` on `appState.sessionUser` arms the exact code path
   (`models/user.js:414`) without touching data. Legitimate because H4's defect is
   stacking + promise settlement, and the account state is only the trigger. It would
   NOT be legitimate for something like M9, where server paging is the thing under test.

8. **Two states that come from the same template branch can never disagree — don't
   assert on them.** The caseload badge caption's name and the panel id both derive from
   `{{#if (is-equal supervisee.user_name this.selectedSupervisee)}}`, so comparing them
   would "pass" forever. H5 is only visible as "panel is B's but the BADGE is A's",
   which is why the seeded badges carry per-user names.

9. **Dev DB access recipe** (the obvious guesses all fail): `DB_USER=tracid` with **no**
   password over the unix socket (`psql -h localhost` forces TCP and fails md5), plus
   `SECURE_NONCE_KEY` / `SECURE_ENCRYPTION_KEY`, which `GoSecure.validate_encryption_key`
   demands at boot (`config/environment.rb:27`). Read them off the running server with
   `tr '\0' '\n' < /proc/<pid>/environ`. `User` has `billing_state` / `modeling_only?` /
   `premium_supporter?` — there is no `expired?` or `currently_premium?`.

## Permission testing in this codebase: three grants that silently invalidate your test subject (2026-08-14)

Trying to exercise a permission DENIAL (`view_detailed` false) took four candidate
accounts before one worked, because three separate grants keep it true:

1. **Org managers bypass the modeling-only split.** `user.rb:87` grants
   `view_detailed`/`supervise`/`set_goals` on `Organization.manager_for?` with **no**
   `modeling_only_for?` condition, so an org manager keeps full access on a
   modeling-only link. `sarah_chen_slp` is a manager — never use her to test a denial.
2. **`settings['public'] == true` grants `view_detailed` to EVERYONE** (`user.rb:58`),
   including users with no relationship at all — verify with an unrelated user before
   trusting any allow result. Several seeded demo communicators are public
   (`aiden_parker`, `bella_martinez`, `charlie_kim`, `luna_garcia`).
3. **`modeling_only_for?` has three independent triggers** (`supervising.rb:121-125`):
   the supporter's own `modeling_only?`, the relationship's `permission_level`, and a
   per-link `state['modeling_only']` flag. Only the third is per-link.

Corollaries:
- **Check for pre-existing fixtures before creating any.** A seeded modeling-only link
  (`marcus_williams_slp` → `ethan_brown`) already existed; the survey missed it because
  the query filtered on a **non-existent `link_type` column** and silently matched
  nothing. `UserLink` stores `record_code` as a real COLUMN and `type`/`state` inside
  `data` — filtering on the wrong one returns empty rather than erroring.
- **Not every seeded account can log in.** `elena_rodriguez_slp` fails
  `valid_password?('demo2025!')` while the other two SLPs pass. Check
  `valid_password?` in the console before blaming the probe.
- Mutating a `UserLink`'s serialized `data` needs a **reassignment**
  (`l.data = l.data.deep_dup.tap{...}`); in-place mutation may not mark the column
  dirty. Follow with `touch` on both users to bust the permission cache.

## Ember Data 5.3: `toArray()` is gone, and a defensive guard turns that into a false NEGATIVE (2026-08-14)

`store.query(...)` results have **no `toArray`** in Ember Data 5.3 (`typeof` is
`undefined`), though `.length` still works. Code written defensively as
`rows.toArray ? rows.toArray().map(...) : []` therefore yields `[]` — and a check
asking "does this endpoint leak data?" answered **"0 records, no leak"** when the true
answer was 8 records including the leaked one. `Array.from(rows)` works.

The general rule this is an instance of: **a read that cannot be performed must FAIL
loudly, not fall back to an empty value.** An empty fallback inside a security or
regression check converts "I could not look" into "there is nothing there". Always log
HOW the read succeeded (length, access path) alongside the result, so a vacuous read is
visible in the output rather than indistinguishable from a clean one.

## Pattern: LingoLinq has TWO eval pipelines — check which one produced the page before "fixing" a report (2026-08-14)

"The new report isn't showing on `/:user/logs/last-eval`" is almost never a broken
render. There are two independent evals and they end in different places:

| | Tiered eval | Full eval |
|---|---|---|
| Entry | `eval.quick` route (caseload link) | speak-mode boards, `app_state.eval_mode`, `obf/eval-*` |
| Engine | `utils/eval_session.js` + `utils/eval_recommend.js` | `utils/eval.js` |
| Ends at | `user.logs` list after `session.persist()` | **`user.log` / `last-eval`** (`eval.js:221`) |
| Renderer | `eval-quick-report` / `eval-saved-summary` | `templates/user/log.hbs` raw trial tables |

`routes/user/log.js:13` builds an **in-memory** log for `last-eval` with no
`tiered_eval`, so the `{{#if this.model.tiered_eval_type}}` branch at `log.hbs:2`
can never match there — it always falls through to the legacy `processed_assessment`
renderer. Anything built only for the tiered flow is invisible on that page **by
construction**, not by regression. Confirm which pipeline ran before diagnosing:
a tiered eval leaves a `log_sessions` row, a full eval may leave nothing (memory +
an IndexedDB `eval_progress_<uid>` snapshot only).

Two traps when bridging them:

1. **`analyze()` overwrites the raw access key with a localized label**
   (`eval.js:892-903` — `res = Object.assign({}, assessment)` then
   `res.access_method = <translated>`). Anything that needs to *branch* on the access
   method must read the raw key, so `analyze()` now also emits `access_method_key`.
   Same shape of trap anywhere a display label is written back over its own source value.
2. **`GRID_BANDS[].band` labels describe the Quick Screen's EXTRAPOLATION, not a size.**
   The Quick Screen probes stop at 4×6, so 24 demonstrated cells recommend the
   84-button band. The full eval tests 1×2 → 8×14 directly (`eval.js:1099-1137`, clusters
   24/60/112 = 4×6, 6×10, 8×14) and reports the largest grid actually mastered — so the
   demonstrated grid IS the recommendation, and reusing the band label prints a mastered
   4×6 as `tiny`. Share `GRID_BANDS` for *which published sizes exist*; do not carry its
   labels across. Bonus: those clusters line up 1:1 with `VOCAL_FLAIR_BUTTON_COUNTS`
   (24/40/60/84/112), so the page-set recommendation needs no heuristic.

## Gotcha: an AAC eval report is TWO documents with conflicting rules — brand naming is the fork (2026-08-14)

Per `docs/AAC_EVALUATION_STANDARDS.md` §2, a medical/funding report **must** name
manufacturer + product + HCPCS, and a school/IEP report **must not** — naming a product
in an IEP obligates the district to provide that exact product. So any recommendation UI
that names a board/page set (`eval-page-set-card`, "Vocal Flair 84") is medical-mode only
and must be replaced by feature language in school mode. This is a hard content rule, not
a display preference: a single "eval report" that always names the product is wrong half
the time. Related §6 rule — do not print a fabricated confidence number for a battery with
no fixed denominator; report data volume (scored trials, accuracy, latency) instead.

## Gotcha: a saved eval can only be rewritten by RE-SENDING it — and a mismatch silently forks the record (2026-08-14)

There is no merge-into-a-saved-eval endpoint. `PUT /api/v1/logs/:id` reaches
`LogSession#process_params` with `update_only`, which writes **only** `highlighted` and
per-event notes (`log_session.rb:1678-1730`); `data['eval']` lives in the other branch and
is unreachable on update. The client also never learns an eval's log id — evals are pushed
as events through a `JobStash` and the response is a synthetic `fake-…/pending` record
(`json_api/log.rb:13-18`), with the real LogSession created later in Resque. (Hence the
long-standing `// TODO: how to get log_session_id for in-memory evaluation` in
`controllers/user/log.js`.)

The one supported rewrite is the resume path: **re-send the whole eval event**. The server
matches it to the existing record by `log_session_id` (exact, unbounded) or by `ref_id` (a
Ruby-side scan over evals created in roughly the last 72h — `data` is encrypted, so no SQL
match is possible), then calls `s.process({eval: ...})`, which **replaces `data['eval']`
wholesale** (`log_session.rb:1058-1077`, `1810`).

Three consequences, all load-bearing:

1. **Send the complete blob, never a patch** — and start from the RAW eval, not
   `evaluation.analyze()`'s return value, which is an `Object.assign` copy carrying derived
   display fields that must not be persisted. (This is why `controllers/user/log.js` now
   has a `raw_assessment` computed that `processed_assessment` derives from.)
2. **Authorship is a data-integrity boundary, not a permission nicety.** The reattach
   requires `s.user == user && s.author == self.author`; when it fails the server does not
   error — it creates a **duplicate eval LogSession** (`log_session.rb:1108`). Verified by
   negative-control spec: a mismatched `ref_id` produced 2 eval logs and the new data never
   reached the original. Any UI that re-sends an eval must gate on authorship first.
3. **The write is asynchronous and unconfirmable** (stash → 10s-throttled push → Resque),
   so UI must say "saved, syncing", never a bare "saved".

Anything stored inside the eval blob (e.g. `data['eval']['report_workbook']`) rides along
for free and reads back under `json['evaluation']` (`json_api/log.rb:102`) — no server
change needed. But do NOT write `eval_mode` onto a legacy eval record: both
`generate_defaults` (`log_session.rb:286-315`) and the serializer (`json_api/log.rb:82-104`)
branch on it before `data['eval']`, so it would silently switch the record's date derivation
and JSON shape.

## Gotcha: `stashes.online` is seeded ONLY by an observer that never fires on a machine that starts online (2026-08-14)

Symptom: nothing is ever logged to the server — no sessions, no evals, no assessments.
`log_sessions` gets no new rows, `job_stashes` gets none, Resque queues sit empty, and
`log/development.log` records **zero** `POST /api/v1/logs`. Everything piles up in
`localStorage['lingolinqStash-usage_log']` instead, silently.

Root cause: `push_log`'s guard is `this.get('online')` on the **stashes service**
(`services/stashes.js`), which is a DIFFERENT flag from `persistence.get('online')`.
The only thing that propagated a value into it was persistence's `on_connect`, an
`observer('online', ...)` (`utils/persistence.js:3959`, `services/persistence.js:3945`).
Observers fire on CHANGE. Persistence initializes its own flag from `navigator.onLine`,
so when a machine is online at boot and stays online, that flag never changes, the
observer never fires, and `stashes.online` stays **`undefined`** — falsy — for the whole
session. Every push returns silently at the guard.

Observed directly with Playwright against the running dev app (no user console needed):
```
navigator.onLine          -> true
persistence.get('online') -> true
stashes.get('online')     -> undefined     <-- every push silently dropped
```

Fix: seed it in `services/stashes.js#setup()` from the same source persistence uses
(`this.set('online', navigator.onLine)`); the observer still keeps them in step afterwards.

Two general lessons:
1. **Two flags with the same name on two objects will drift.** `persistence.online`,
   `stashes.online` and `navigator.onLine` are three separate things here; verifying one
   in the console proves nothing about the one the write path actually reads.
2. **A guard seeded only by an observer has no value until the observed thing CHANGES.**
   If the initial state is already the steady state, the observer never runs. Seed
   explicitly; don't let an observer be the sole initializer.

Debugging technique worth reusing: browser-only state is observable from the shell with
`npx playwright` against `localhost:8184` (chromium is already installed; log in via
`/login`, fields `#identification` / `#password`). Far better than asking the user to run
console commands and relay results.

## Gotcha: `adapters/application.js` overrode `ajax()` and silently form-encoded every write (2026-08-15)

`RESTAdapter#ajax` is not just a transport call — it is what invokes `ajaxOptions()`,
and `ajaxOptions()` is what sets `contentType: application/json`, `dataType: 'json'`
and `JSON.stringify(data)`. An override that calls `$.ajax(options)` directly (added in
`248150d15`, 2026-01-18, to make extras.js' Authorization patch apply) skips it, and
jQuery then form-encodes the body. Nothing warns; the request still succeeds.

Form encoding loses three things the API can never recover:

* **Arrays become index-keyed objects.** Rails builds an Array only for `a[]=`;
  `log[events][0][type]` parses as `{'events' => {'0' => …}}`. Downstream
  `params['events'].map{|e| e['user_id']}` then yields `['0', {...}]` and raises
  `TypeError: no implicit conversion of String into Integer`.
* **Numbers become strings** — `event['window_width'] > 0` →
  `ArgumentError: comparison of String with 0 failed`.
* **Booleans become strings** — `false` arrives as `"false"`, truthy in **both** Ruby
  and JS. This is the one that forces a client-side fix: no server-side coercion can
  tell the boolean from the string, so a failed eval trial silently reads as passed.

Lessons:

1. **When overriding a framework method to inject one concern, call the framework's own
   option builder — don't hand it your raw input.** `$.ajax(this.ajaxOptions(url, type, options))`
   keeps both the auth patch and the request semantics.
2. **`extend({useFetch: false})` does NOT override a native class field.** Upstream
   declares `useFetch = true` as a class field; field initializers run on the instance
   after the prototype is built, so the `extend` property is overwritten before the first
   request. Assign it in `init()` instead. The failure mode is nasty: `ajaxOptions` takes
   the fetch branch and returns `{body}`, jQuery ignores `body` and form-encodes `data`
   anyway, so the body is form-encoded while the header claims JSON and Rails answers
   `ActionDispatch::Http::Parameters::ParseError`.
3. **A 200 from an endpoint that enqueues work proves nothing.** `process_as_follow_on`
   returns a synthetic `fake-…/pending` record and the real write happens in Resque. When
   the job raises, the queues drain to empty and look healthy. Check
   `redis-cli llen lingolinq-development:failed`, not queue depth.

## Gotcha: `""` is truthy in Ruby, and a serialized client model sends `""` for every unset attribute (2026-08-15)

`user_id = params['user_id'] || params['log']['user_id']; user = user_id ? find_by_path(user_id) : @api_user`
looks safe and is not. The Ember client serializes the whole model, so an unset
`user_id` arrives as `""` rather than being omitted — `""` is truthy, so it reached
`find_by_path("")`, got nil, and `allowed?(nil, …)` rejected the request as
`Not authorized`. Use `.presence`, not truthiness, on any id that comes from a
serialized client model.

Diagnostic tell worth remembering: `allowed?` adds `resource_class` / `resource_id` to
its error body **only when the object is non-nil**. Their absence in a captured 400 says
the object was nil — i.e. a lookup MISS, not a permission denial. That distinction was
the whole difference between "the SLP lacks permission" and "we looked up the empty
string".

## Gotcha: permissions are Redis-cached, so `allows?` can disagree with the DB (2026-08-15)

`Permissable` caches permission sets in Redis for 30 minutes
(`app/models/concerns/permissions.rb` → `Permissable.permissions_redis`). A `rails
runner` process and the running server can therefore return **different** answers for
the same `allows?` call, and a stale entry survives edits to the underlying links.

Before concluding that supervisor data was lost, check the durable state directly:
`UserLink.where(user_id: communicator.id)`, `user.permissions_for(other)`, and
`GET /api/v1/users/self`. If those look right and `allows?` says false, it is the cache.
`u.touch` on both users changes the cache key and forces a recompute.

Corollary for this repo: a browser login currently re-poisons that cache — see
`HANDOFF-evals-not-saving.md`, "Environment problem". Open, unowned, pre-existing.

## Pattern: a recompute that returns fresh objects will destroy the input the user is typing in (2026-08-15)

`{{#each}}` keys on `@identity`. A computed that maps over a schema and returns **new
plain objects** each time therefore forces Ember to tear down and rebuild every item's
DOM whenever it invalidates — including a focused `<input>`. In `eval-workbook`,
`writeField` called `notifyPropertyChange('workbook')` on every keystroke to refresh the
"started" badges, so each field accepted exactly ONE character before the element was
destroyed and focus fell back to `<body>`. The form was unusable, and it compiled, linted
and passed static review.

Fix shape: **separate stable structure from reactive status.** The structural computed
depends only on structural keys; the per-keystroke status (badges, counters) hangs off a
`revision` counter the writer increments, and the template reads it from a side map
(`{{get this.startedMap section.id}}`). Genuinely structural edits — adding or removing a
repeating row — still invalidate the structure, which is correct because nobody is
mid-keystroke when they click a button.

Detection technique, since this is invisible to unit tests and to `fill()`-style test
helpers (which set `.value` and fire one event):

```js
await p.focus(sel);
await p.evaluate(s => { document.querySelector(s).__mark = 'M'; }, sel);
for (const ch of 'board') { await p.keyboard.type(ch); await p.waitForTimeout(120); }
// same_node false / still_focused false / value === 'b'  => the node is being rebuilt
```

General lesson: **"it renders" and "it can be used" are different claims.** Only typing
character by character, with focus assertions, distinguishes them.

## Gotcha: a transient instance flag that changes permissions but not the cache key (2026-08-15)

`User#valet_mode?` is `!!@valet_mode` — a per-instance, per-request flag, not a column.
Nearly every rule in `User` is guarded by `&& !user.valet_mode?`, so it changes the answer
completely. But Permissable keys its permission cache on `user.cache_key`
(id + `updated_at`) plus the scopes, and the flag is in **neither**. A valet-mode
computation and an ordinary one therefore share one Redis slot for 30 minutes, and
whichever ran first wins.

How it surfaced: every login PUTs the whole user model to `/users/self`; a user with a
valet password configured sends `valet_login: true` with `valet_password: null` (the UI
never echoes the secret back), which made `set_valet_password` treat a no-op re-save as a
fresh enable — regenerating the secret AND calling `assert_valet_mode!` on the in-memory
user. The rest of that request then computed permissions as a valet, and
`JsonApi::User.build_json` cached "no model, no supervise" for every supervisee. Ordinary
requests read it and 400'd for the next half hour: the supervisor was locked out of their
own communicators.

Lessons:

1. **If a value changes what a cached computation returns, it belongs in the cache key.**
   Folding it into the scopes works when the cache key already includes scopes, and is
   safe when no rule declares that scope name (a scope match needs one intersection hit,
   so an extra unmatched entry partitions the cache without granting anything).
2. **Configuring a credential is not authenticating with it.** `set_valet_password`
   asserting valet mode conflated "this account has a valet login" with "this request IS
   the valet." The existing specs called `assert_valet_mode!` themselves, which is the tell
   that the method was never meant to do it.
3. **The direction you observe is not the only direction.** Here a restricted computation
   denied a legitimate user. The inverse — a valet session reading the permissive entry a
   normal session cached — is privilege escalation through the same slot.

Debugging technique that broke the deadlock: **instrument the cache WRITE, not the read.**
Logging inside `permissions_for` after `super` reports the inputs at read time, which look
perfectly healthy on a cache hit and sent me chasing phantom data loss. `set_cached` only
runs on a miss, so logging there — with the user stashed in a `Thread.current` by a thin
`permissions_for` override — captured `valet=true` and the exact `caller` in one run.

Corollary bug found alongside: `Permissable#allows?` appends `'*'` to the scopes and then
passes the already-appended array to `permissions_for`, which appends it AGAIN. So
`allows?` reads `scopes_full,*,*` while a direct `permissions_for` reads `scopes_full,*` —
two cache entries for one question, free to disagree indefinitely, because a correct value
computed via one path never repairs the other. If `allows?` and `permissions_for` ever
disagree at the same instant, this is why.

## Gotcha: Rails controller specs stringify scalar params — a green suite proves nothing about the JSON contract (2026-08-15)

`post :create, params: {:x => true, :y => 4}` in a controller spec does **not** deliver a
boolean and an integer. Rails' test harness flattens scalars to Strings, so the controller
receives `"true"` and `"4"`. Nested Arrays and Hashes keep their structure. Probed directly
against `Api::BoardsController`:

```
params: {:board => {:public => true, :rows => 4, :tags => ['a','b']}}
  => "public"=>"true" (String), "rows"=>"4" (String), "tags"=>Array
body:   {...}.to_json  + request.headers['Content-Type'] = 'application/json'
  => "public"=>true (TrueClass), "rows"=>4 (Integer), "tags"=>Array
```

Consequences, both of which bit on this branch:

1. **The `params:` style tests the form-encoded shape, not the JSON one.** After
   `6df5b1bbc` restored JSON request bodies, the entire backend suite still exercised the
   old wire format for scalars. A handler that accepts only `params['x'] == 'true'` passes
   every spec in the repo and fails in the browser. Arrays are the exception — preserved
   in both modes — which is why index-keyed-Hash handling *was* genuinely covered.
2. **It silently launders type bugs into passing assertions.** The tell is a spec that
   coerces before asserting: `expect(log.data['duration_s'].to_i).to eq(42)`. The `.to_i`
   is there because the harness stringified it. Over a real JSON body the value is an
   Integer and needs no coercion — so the `.to_i` was hiding the fact that the type was
   never being tested.

To pin a JSON contract, post a raw body:

```ruby
request.headers['Content-Type'] = 'application/json'
put :update, params: {:id => b.global_id}, body: {:board => {...}}.to_json
```

`params:` still supplies path params (`:id`); the body is parsed and merged.

**Always run the negative control.** Re-post the same assertions the `params:` way; only
the ones that FAIL are regression detectors. Of nine specs added here, six failed the
control (numbers, `false`, `duration_s`, button ids, numeric preferences, the no-clobber
guard) and three passed it — because `board.rb`'s flag normalization and
`process_boolean` already repair the string forms. Those three are contract pins, worth
keeping but not worth counting as coverage. Without the control you cannot tell the two
apart, and a "passing" spec that would pass either way proves nothing about the change
it was written for.

The control also produces evidence you cannot get any other way: posting an omitted
preference the `params:` way showed a stored `750` being **overwritten with `""`**,
confirming from observed behavior — not from reading the code — that under form encoding
every unset attribute clobbered its setting on every save (`user.rb` PREFERENCE_PARAMS is
guarded by `!= nil`, and `""` passes that guard while `nil` does not).

See `docs/task-management/2026-08-15-adapter-json-blast-radius.md` for the full sweep.

## Technique: replay the REAL captured request body — a hand-built payload tests nothing (2026-08-15)

Probing an authorization boundary with a payload you constructed from reading the code is
close to worthless, because the most likely outcome is that your payload is malformed and
the request dies *before* reaching the decision you meant to test — while returning the
same 200 a correct refusal would.

Concretely: a hand-built eval-hijack POST put the blob at `log.data.eval`, returned
`200 {"pending":true}`, and changed nothing. That reads exactly like "the server refused."
It wasn't. `redis-cli llen lingolinq-development:failed` went 3497 → 3498 with
`no valid events to process out of 0` — the job never reached an author check. The real
client sends the eval inside `log.events[0].eval` (`utils/eval#save_workbook` →
`stashes.log_event`, so it is an EVENT, not a `data` key).

The reliable method:

1. drive the real UI with Playwright and capture the request:
   `p.on('request', rq => { if (rq.method()==='POST') body = rq.postData(); })`
2. write it to disk, mutate only the one field you are attacking,
3. replay with `curl --data-binary @body.json` under the other account's token.

Only then does a "nothing happened" result mean refusal. Pair it with the failed-queue
delta every time — in this codebase the HTTP response is a synthetic
`fake-…/pending` record and the real write is a Resque job, so the queue counter is the
only thing that distinguishes "refused" from "died".

## Gotcha: before guarding against a behaviour, check whether a spec SPECIFIES it (2026-08-15)

A non-author's eval save was forking the record, so the obvious fix was to refuse the
write when `s.author != self.author`. That broke `log_session_spec.rb:1171` — "should
create a new copy if the eval was resumed by a different author" — which specifies the
fork as intended: two clinicians can each hold their own eval of the same communicator,
and the second author's work must not overwrite the first's.

The real defect was narrower than the behaviour it lived inside: the fork inherited the
original's `ref_id`, and `utils/eval#find_saved_log_id` matches on `ref_id` and takes the
first hit. Two records answering to one id made "which record does a workbook save bind
to" list-order dependent, for BOTH accounts. In the pre-existing spec the fork carries no
`ref_id`, which is exactly why that spec never caught it.

Fix: drop only the inherited identifier, keep the fork. Rule of thumb — when a guard you
add breaks an existing test, the test is usually describing a case you did not know
about; re-scope the guard to the actual harm rather than deleting the test. RULE #0 §3.

## Gotcha: `window.app_state` does not exist — it is `window.LingoLinq.appState` (2026-08-15)

`utils/app_state.js` resolves the singleton via `LingoLinq.appState`, and `app.js:1006`
exposes only `window.LingoLinq`. A Playwright probe reading `window.app_state.get(...)`
returns `null` for everything, silently — including values you can see are set on screen.

Two consequences worth internalising beyond the specific global:

- **A probe that reports `null` for something you KNOW is set is broken, not evidence.**
  Always include a control field (`currentUser` while plainly logged in). If the control
  is null, throw the run away rather than interpreting it.
- **Don't select a button by its CSS class alone when the class is shared.**
  `.md-board-preview__action--primary` is worn by whichever primary CTA that footer
  branch rendered; clicking it "worked" while pressing the wrong control entirely. Match
  on the accessible text instead, and assert the label you matched.

Working probe:

```js
const flags = () => p.evaluate(() => {
  const as = window.LingoLinq && window.LingoLinq.appState;
  const nm = (u) => (u && u.get) ? u.get('user_name') : (u === null ? null : String(u));
  return { setup_user: nm(as.get('setup_user')), currentUser: nm(as.get('currentUser')) };
});
```

## Gotcha: a DB read taken right after a backgrounded write is not a verdict (2026-08-15)

Picking a home board for a supervisee schedules a `Progress`-backed copy (95 boards, in
this case). Reading `settings['preferences']['home_board']` seconds later returned `NONE`
twice, and I twice concluded the UI was reporting success while nothing persisted.

It was persisting; my reads were racing the job. The thing that settled it was the full
request trace — `PUT /api/v1/users/1_33` sent
`{"id":"hannah_lee/vocal-flair-60","key":...}` and the server returned
`{"id":"1_1458","key":...,"locale":"en_US"}`, a RESOLVED id, which is proof of a kept
write in a way a racing `SELECT` is not.

Order of evidence for "did this save?": the server's response body first, then a fresh
reload, then the failed-queue delta. A bare model read immediately after a scheduled job
is the weakest of the four and the easiest to misread as a bug.

Related trap in the same flow: `saveHomeBoard` (`utils/home_board.js`) verifies the save
by re-reading `preferences.home_board` off the SAVED record. That is only meaningful
because the server re-serializes from its own record — had the response omitted the key,
Ember Data would have kept the optimistic local value and the check would have verified
its own write.

## Gotcha: i18n_generator.rb silently drops any `i18n.t` call whose `)` is on the next line (2026-08-15)

The parser extracts the key and the English string, then scans for the closing `)`
**on the same line** (`i18n_generator.rb:124-134`). A call formatted like this:

```js
return i18n.t('workbook_progress', "%{n} of %{t} sections started", {
  n: this.get('startedCount'), t: this.get('sectionCount')
});
```

never finds it, so the key is counted MISSING. Two consequences, both quiet:

1. **Generation is blocked entirely.** `if dups > 0 || missing > 0` prints
   "FOUND ISSUES, SO NO GENERATION" and no locale file is written — so ONE badly
   wrapped call stops every other new string from reaching every locale.
2. **A regenerate DELETES the key.** en.json is rebuilt from the source scan, so a
   key that was added by hand (and therefore looks fine in the app, because
   `i18n.t` falls back to its English 2nd argument) vanishes on the next
   `--generate`, and can never be translated in the meantime.

Six keys on the eval-report branch were in exactly this state. Fix is formatting:
keep the whole call on one line. The `)` inside the STRING does not help — the scan
starts after the closing quote.

Run `ruby i18n_generator.rb` with no arguments before finishing any string work: it
writes nothing and prints `TOTAL DUPS / TOTAL MISSING / TOTAL STRINGS`. Anything
other than 0/0 needs fixing before the file is committed.

Related: the generator scans BOTH `app/frontend/app/**/*.js` (`:10`) and
`**/*.hbs` (`:142`), so template-only keys are safe. And it now pins
`Encoding.default_external = UTF-8` itself — it previously died on the first read of
en.json in any shell without LANG/LC_ALL set (`"\xE2" on US-ASCII`), which is most
non-interactive shells.

## Gotcha: an Ember dependency key only works on a real PROPERTY, not a module import (2026-08-15)

`controllers/user/log.js` had:

```js
import app_state from '../../utils/app_state';
...
same_author: computed('model.author.id', 'app_state.sessionUser.id', function() {
  return this.get('model.author.id') == app_state.get('sessionUser.id');
}),
```

The KEY was the bug that day — Ember cannot observe a module import. The BODY
was not fully correct: it compared `sessionUser.id`, which is often the `'self'`
sentinel. That second bug is the 2026-08-18 gotcha below.

This fails silently in both directions — no error, no warning, and the value is
CORRECT on first read, which is what makes it survive review. Grep for it:

```bash
grep -rn "computed(" app/frontend/app | grep -E "'(app_state|persistence|modal|capabilities)\."
```

Any dependency key naming a module import rather than an injected service is dead.
Fix by injecting (`appState: service('app-state')`) and reading through
`this.get(...)` so the watched path and the read path are the same object —
`services/app-state.js:70` assigns `LingoLinq.appState = this` and
`utils/app_state.js` is a Proxy onto it, so this is the same instance, not a second.

**Test it with a mutation, not a value.** Asserting `same_author === true` passes on
the broken version too. The only test that catches it reads once, changes
`sessionUser`, and reads again — of 3 specs written here, that is the single one the
negative control failed.

## Gotcha: `sessionUser.id` is the `'self'` sentinel — compare `global_id` on authorship gates (2026-08-18)

Fixing the `same_author` *watch* path (injected `appState`, key
`'appState.sessionUser.id'`) left the *comparison* broken.
`serializers/application.js` pins the session-user record id to the literal
`'self'` so Ember Data never re-keys the identifier. `models/user.js#global_id`
is the real backend id. `model.author.id` is a real global id like `'1_24'`.
`'1_24' == 'self'` is always false, so "Resume Evaluation" stayed hidden from
the eval's own author.

It is a window, not a constant: a later local-storage read can close it and put
the real id on `.id`. While the window is open, `.id` comparisons fail. Mirror
`eval-workbook.js#isAuthor`: prefer `sessionUser.global_id`, fall back to `.id`,
drop the `'self'` sentinel, fail closed.

A test that stubs `{ id: '1_24' }` will not catch this. Stub `{ id: 'self',
global_id: '1_24' }` — that is the network load path.

## Gotcha: Ruby indent is not control flow — a 4-space line can still be inside the `if` (2026-08-18)

`supervisor_relationships_controller.rb` had `channel` / `actor_id` at 4 spaces
inside a 6-space `if` body. That looks like they escaped the guard. They did
not: Ruby uses `if`/`end`, not indent. `AuditEvent.log_command` stayed inside
the same `end`, so unresolvable tokens still wrote no audit row (the spec
already asserted this). Re-indent for humans; do not "fix" control flow that
is already correct.

## Gotcha: a test that leaks state into a SHARED service hangs the run, it does not fail it (2026-08-15)

A new unit test set `sessionUser` on the `app-state` service to a stub and never
restored it. `app-state` is a singleton shared by every test in the run, so the stub
outlived the module and reached the user-scoped `persistence` suite — where it did
not fail an assertion. It **hung the browser**:

```
not ok 1513 PuppeteerChrome - error
  Error: Browser timeout exceeded: 120s
  Error while executing test: persistence: persistence find - should update freshness of results as applicable
```

testem killed the run at test 1513 of 1995, so ~480 tests never executed.

Two things make this genuinely hard to spot:

1. **It reads as flaky infrastructure, not a test defect.** "Browser timeout" plus
   Chrome's GPU/GCM noise in the log looks like an environment problem, and the
   machine really was loaded. The temptation is to shrug and re-run.
2. **The truncated summary looks plausible.** It reported `1 fail` and `15 skip`.
   The skip count is the tell — this suite has 38 skips, and a skip count can only
   go DOWN if the run ended early. Always compare tests/pass/**skip** against a
   known-complete baseline; `fail: 1` alone hides that 480 tests never ran.

Fix is the cleanup hook, restoring the PRIOR value rather than blanking it:

```js
hooks.beforeEach(function() {
  const app = this.owner.lookup('service:app-state');
  this._priorSessionUser = app ? app.get('sessionUser') : null;
});
hooks.afterEach(function() {
  const app = this.owner.lookup('service:app-state');
  if (app) { app.set('sessionUser', this._priorSessionUser || null); }
});
```

Rule: any test that writes to `app-state` (`sessionUser`, `currentUser`,
`setup_user`, `tour_board_picker_active`, …), `stashes`, or `persistence` needs a
matching `afterEach`. The board-preview spec in the same session already did this
for `tour_board_picker_active`; the controller spec did not, and that asymmetry was
the whole bug.

Confirmed by re-running: with the hooks added the suite completed at 1995/1956/38
skip/0 fail with zero browser timeouts, and `persistence find` ran normally.

## Technique: negative-control the CHECK, not just the fix — a check that cannot fail is not a check (2026-08-15)

Fixing the `%%` double-percent in the eval reports, I loaded the rendered report at
`/hannah_lee/logs/1_5383`, found zero `%%` on the page, and nearly called it verified.
Then ran a control with the bug deliberately restored in both templates: **also zero**.
That eval carries no motor-map / dynamic-assessment / literacy data, so the blocks holding
those strings never render. The "passing" check could not have failed.

`EvalSavedSummary` really does render on that route (`templates/user/log.hbs:15`), which is
what made the check look sound. Rendering the COMPONENT is not the same as rendering the
BRANCH the string lives in.

**Technique:** after a green check, break the thing on purpose and confirm the check goes
red. If it stays green, the check is measuring nothing. Cheap, and it caught two worthless
verifications in one session — the other being feeding the OLD literal into `i18n.t` and
reporting it still showed `%%`, which only proves `i18n.t` returns the default you hand it.

The verification that actually worked: parse every percent-bearing `{{t "..." key=...}}`
literal straight out of the templates on disk, push each through the live in-page
`i18n.t`, assert no `%%`. 24/24, nothing hardcoded, so it cannot drift from the source.

## Gotcha: a truncated Testem run looks exactly like a failing one — `# skip` is the tell (2026-08-15)

Three full `ember test` runs this session; two aborted early and both printed:

```
# tests 6      <- suite is 1995
# pass  5
# skip  0      <- suite has 38
# fail  1
Testem finished with non-zero exit code. Tests failed.
```

That reads as a regression. It is not — the run died at test 6 on
`Browser timeout exceeded: 120s` and never reached the rest. **The discriminator is
`# skip`:** a complete run of this suite reports 38, a truncated one reports 0. `# fail 1`
is the timeout being counted, not an assertion.

I reported "1 failure" before checking, and the conclusion would have been wrong. Check
`# skip` against the known suite shape BEFORE reporting any regression. Better: have the
progress monitor assert `# skip 38` and label the result COMPLETE vs TRUNCATED itself.

## Gotcha: `tests/acceptance/board-lock-test.js` times out under machine load (2026-08-15)

Both aborted runs above died inside this one file, on a DIFFERENT test each time. Run in
isolation it is clean: `ember test --filter "board lock"` gives 3/3 pass. The hangs
correlate with `ember serve` being up and browser probes hammering it concurrently.

Not a real failure and not branch-specific. If a full run dies here, re-run with the dev
server quiet before investigating anything else.

## Technique: poll the built asset for a marker before probing — never sleep and hope (2026-08-15)

Every browser probe against the dev server races the Ember rebuild. Sleeping a fixed
interval either wastes time or silently tests the OLD bundle, which is how a negative
control quietly turns into a false pass.

Put a unique string in the edit and poll for it:

```bash
for i in $(seq 1 60); do
  if curl -s http://localhost:8184/assets/frontend.js --max-time 30 | grep -q "MARKER"; then break; fi
done
```

Note the bundle is `/assets/frontend.js` (not `lingolinq-aac.js`), and dev builds keep
comments, so a comment marker works. Poll for the marker's ABSENCE to confirm a revert.

## Gotcha: `(this.ctrlAction this.onRemove)` only works under a route controller, not angle-bracket invocation (2026-08-15)

`board-preview.hbs` invoked its remove button as `(this.ctrlAction this.onRemove)`. That
form assumes `onRemove` is an action NAME string and that `send()` will bubble from the
component to a route controller acting as its `target` — the pre-overlay design, where
`controllers/board-preview.js` was the target.

The live path is `<BoardPreview>` rendered by `board-preview-overlay.hbs`. Angle-bracket
invocation does not set `target`, and the passed `onRemove` is a CLOSURE, so `send(fn)`
fails with:

```
Assertion Failed: <board-preview> had no action handler for: function () {...}
```

Match the file's own idiom instead: `(this.ctrlAction "remove")` plus a `remove` action
that calls `this.onRemove()` if it is a function — exactly how `select`/`pick_for_home`
already work in that component.

## Pattern: when a template binding looks dead, check the SERVICE before blaming the template (2026-08-15)

`board-preview.hbs`'s `{{#if this.removeContext}}` block never rendered. First diagnosis:
`board-preview-overlay.hbs` does not pass `@removeContext`. True, but incomplete — the
chain was broken in FOUR places, and the primary break was upstream of every template:

1. `services/modal.js#_openBoardPreview` built its `boardPreview` object without copying
   `options.remove`, so `boardPreview.remove` was ALWAYS undefined. `utils/modal.js:564,572`
   dutifully computed and passed it; the service dropped it on the floor.
2. the overlay did not forward `@removeContext` / `@onRemove`;
3. the overlay had no `remove` action;
4. the component invoked it in the route-controller form (above).

Each link alone is enough to kill the feature, so fixing any one of them changes nothing
observable — which is exactly why it stayed broken. Trace producer -> transport -> consumer
and confirm the VALUE survives each hop, rather than stopping at the first missing binding.
Corroborating evidence that the design was intended: `controllers/board-preview.js:123-134`
(dead route-era code) already had the correct `remove` action.

## Gotcha: `%%` in an i18n string renders doubled — this i18n layer has no printf escaping (2026-08-15)

`utils/i18n.js` interpolates `%{name}` (regex at :40, substitution at :68) plus a few
`%app_name%` tokens. There is no `%%` -> `%` unescape anywhere, so a literal `%%` reaches
the DOM as `%%`:

```
i18n.t('report_motor_map_pct', "%{p}%% accurate", {p:42})  ->  "42%% accurate"
i18n.t('__nope',               "%{p}% accurate",  {p:42})  ->  "42% accurate"
```

A bare `%` is safe: the interpolation regex only consumes `%` when followed by `{word}`.
`i18n_generator.rb` has no `%%` handling either, confirming it was never a convention —
`git log -S'%{p}%%'` traces all 8 sites to the Ember 5.12 upgrade (#490), a codemod
applying printf-style escaping this layer does not use.

Write a single `%`. When fixing, do the locale files too (13 x the same keys) or
translators inherit the artifact.

## Gotcha: `a || b ? c : d` parses as `(a || b) ? c : d` — bit `utils/modal.js` for years (2026-08-15)

```js
option: board.preview_option || board.get ? board.get('preview_option') : undefined,
```

Intent was "read preview_option, tolerating boards with no `.get`". Actual behaviour: `||`
binds tighter than `?:`, so a plain-object board carrying a truthy `preview_option` took
the TRUE branch and threw `board.get is not a function`. Ember-record callers never
noticed because `.get` always exists for them.

Branch on the RECEIVER, not the value: `board.get ? board.get('preview_option') : board.preview_option`.
Note `preview_option` is always assigned as a PLAIN property even onto Ember Data records
(`button-settings.js:1392`, `board-icon.js:318/399`) — it is not a model attr — so reading
it as one is faithful.

## Gotcha: `ember test` truncations are `browser_disconnect_timeout`, not failing tests (2026-08-16)

Four of six full runs in one session died with:

```
Error: Browser timeout exceeded: 120s
# tests 1428   <- suite is 1995
# skip  14     <- suite has 38
# fail  1
Testem finished with non-zero exit code. Tests failed.
```

...in a DIFFERENT place each time (board-lock twice, speecher, misc). None of the accused
tests fail in isolation. That is `testem.js`'s `browser_disconnect_timeout: 120` reaping a
headless browser that stalled for 120s — typically because `ember serve` and/or browser
probes are competing for the same machine. The `# fail 1` is the reaping, not an assertion.

Two things follow:

1. **`# skip` is the completeness tell.** A complete run of this suite reports 38. Anything
   less means the run died early and the tally is meaningless. Check it BEFORE reporting a
   regression — a truncated run mimics a failing one exactly (non-zero exit, a `# fail`
   line, a named test).
2. **Don't blind-retry — raise the timeout.** Wrap the repo config instead of editing it:

```js
const base = require('/abs/path/app/frontend/testem.js');
module.exports = Object.assign({}, base, { browser_disconnect_timeout: 900 });
```

```bash
npx ember test --config-file /abs/path/to/testem-patient.js
```

That turned a 4-in-6 truncation rate into a clean 7-minute run.

**But do NOT raise it in the committed `testem.js`** — I recommended that before checking,
and the evidence says otherwise. Across the last 30 `ci.yml` runs the Ember test step
failed ZERO times (the 6 failures were audit-artifact checks x3, rspec, Ember lint, and
the capability ledger). CI is not hitting this. And the 120s value is deliberate: the
workflow comment at `.github/workflows/ci.yml:126-129` wants a wedged runner to "fail fast
instead of burning the 6h Actions ceiling", backed by a 50-minute step cap. Raising it to
900s would make a genuinely hung browser burn 15 minutes before reporting instead of 2.

So this is a LOCAL problem with a local cause: `ember serve` and browser probes competing
with the test run on the same box. Cheapest real fix is to not run them concurrently. The
wrapped-config trick is a workaround for when you must.

## Pattern: a sentinel used as an identity compares equal to itself across accounts (2026-08-16)

`serializers/application.js` pins the session user's record id to the literal string
`'self'` so Ember Data never re-keys the identifier, parking the real id in `_actual_id`.
Any code that then treats `sessionUser.id` as an identity is comparing a CONSTANT, and
`'self' === 'self'` is true for every pair of accounts.

This produced two bugs on the same gate, in opposite directions:

- **False deny.** `models/user.js` never declared `_actual_id`, so Ember Data dropped it
  and the record had no usable id during the window. The eval's own author read as
  not-the-author and got the read-only banner. Fix: declare the attr, add a `global_id`
  computed (`_actual_id || id`, matching `board.js`/`buttonset.js`), compare with that.
- **False allow — the dangerous one.** `utils/eval.js` stamped `assessment.author_id`
  from `sessionUser.id`, so an eval started inside the window recorded its author as
  `'self'`. A second SLP on a shared device, also inside the window, matched it and was
  granted edit on the first SLP's eval — exactly the fork the stamp existed to prevent.

Three things generalize:

1. **A sentinel is not an identity.** Reject it explicitly on BOTH sides of a comparison
   (`if (x === 'self') { x = null; }`), do not merely prefer the real id. Old persisted
   data still carries the sentinel long after the writer stops emitting it.
2. **Fail closed on an ambiguous stamp.** A stored `'self'` cannot be attributed, so the
   gate refuses it even for the legitimate author. Bounded by
   `EVAL_PROGRESS_MAX_AGE_S` (24h); retyping a workbook beats forking a clinical record.
3. **Check the write side, not just the read side.** The read-side fix (`global_id`) was
   correct and shipped first, and the gate still trusted a poisoned stamp because nothing
   had audited what WROTE `author_id`. When you fix an identity comparison, grep for every
   place that persisted that identity.

The window is short (seconds) and that is what hides it — sampling at 9s showed 5/5
healthy, sampling at 250ms caught it live in 2 of 3 loads. See also the entry on
negative-controlling the check.

**Removing a fallback is a behaviour change.** Tightening `global_id || id` to `global_id`
alone broke two passing tests: plain-`EmberObject` test stubs have no `global_id` computed,
and the old `|| id` had been carrying them. The fix is `global_id || id` with the sentinel
stripped from whichever answered — preserving every case except the one being excluded.
---

## Gotcha: attestation hash claims must pin retrievable git bytes

Do not invent or retain a content-hash prefix in runbook/register prose unless that exact
blob is reachable from merged ancestry (usually `git show <commit>:docs/legal/...` → sha256).
`priorAttestations` stores dates only, so a wrong hash in prose has no mechanical check and
becomes an unverifiable attestation pin. On BREACH_RUNBOOK, a claimed `fbdf49a1...` v2.2 pin
had no matching blob; the git-canonical #703 bytes are `0ee1b92e...` @ `456b673`. Prefer
`version + full sha256 + commit` (and a distinct label per attested byte set — e.g.
`v2.2.1-interim` vs `v2.2.1`) over truncated prefixes alone. Ref: PR #722 Codex review,
[`2026-08-02-breach-runbook-codex-review-fixes.md`](./2026-08-02-breach-runbook-codex-review-fixes.md).

## Gotcha: staging → audit-register merge is a union, then regenerate

When `staging` lands on a findings-register branch, do not pick one side of
`FINDINGS.json` / `DOCUMENT-REGISTER.json`. Rebuild from `git show HEAD` +
`MERGE_HEAD`: keep this branch's unique findings and docs, add staging-only
rows, and for a shared id keep the longer staging notes/remediation trail
without changing status, severity, or disposition. Then run
`scripts/regenerate-register.sh` so the `.md` mirrors and publication status
are derived, not hand-merged. If citation-check says `file not found at sha`,
`git fetch` that evidence commit before re-anchoring the pin. Attested
`attestedContentHash` pins stay untouched. Task log:
[`2026-08-17-code-hygiene-auditor-staging-merge.md`](./2026-08-17-code-hygiene-auditor-staging-merge.md).

## Gotcha: a dated successor must not inherit the predecessor's attestation dates

Copying `**Attestation history:** re-attested 2026-08-08` onto a `draft` successor makes the new bytes look reviewed. Label it **Predecessor attestation history** and state that this record has none. Same defect for Related links: point at the operative dated register (`2026-08-16_subprocessor-register.md`), not the frozen `SUBPROCESSORS.md`. Ref: `docs/legal/2026-08-17_ai-data-flow-classification.md`.

## Gotcha: `redact_for_ai` on the sentence does not automatically cover interpolated `context.topic`

`AiWordPredictor.predict` used to scrub `sentence` then interpolate `context.topic` into `system_prompt` unsanitized (`lib/ai_word_predictor.rb`; forwarded by `Api::WordSuggestionsController`). Closed 2026-08-18: `scrub_context` runs `redact_for_ai` on topic before the cache key and before `call_anthropic`. Durable rule: every user-derived field that reaches the vendor prompt is an egress surface and must be scrubbed at the same choke point as the primary input, not only inventoried.

## Gotcha: BREACH_RUNBOOK vendor contacts live in §7, not §11

§7 is Vendor Notification List; §11 is Appendix: Key References. Changelog / header /
register `correctionNote` text that says "§11 vendor contacts" sends responders to the wrong
procedure. When correcting Anthropic/OpenAI/Google contact rows, cite §7.

## Gotcha: `after_all_transactions_commit` is not a durable outbox — pair it with a same-transaction RemoteAction

Deferring `schedule_once` until after commit closes the Redis-vs-Postgres ordering race (a worker must not recompute `available_private_board_ids` from the pre-commit snapshot). It does not close the crash/Redis-down window after commit: the relationship change is already durable, the callback cannot roll it back, and a missed enqueue leaves a revoked supervisor's persisted board-id list stale until some unrelated refresh. `RemoteAction` with `action: 'update_available_boards'` is this app's outbox (`board_caching.rb`, `organization.rb`); write it in the same transaction as the link change, keep post-commit `schedule_once` as the fast path, and let hourly `Uploader.remote_remove_batch` drain the fallback. Pull an existing delayed row's `act_at` forward on revoke so a prior 30-minute RA cannot outlive the unlink. Ref: `app/models/concerns/supervising.rb` `schedule_board_cache_refresh`.

## Gotcha: authorizing the supervisee-list owner does not authorize the children inside it

"Modeling only" means two different things, and conflating them breaks a whole tier. `modeling_only?` is a GLOBAL BILLING state — `billing_state` returns `:modeling_only` as the final fall-through for any supporter who is not premium, trialing, org-sponsored, an org supporter, or a manager. A PER-LINK modeling-only restriction is a property of one relationship. `modeling_only_for?` returns true for both, because it opens `return true if self.modeling_only?`. Every permission rule already encodes the right granularity for itself: `'supervise'` excludes modeling-only outright, `'set_goals'` excludes per-link but deliberately KEEPS a billing-lapsed supporter (the carve-out is written into the rule body). Layering `&& !caller.modeling_only_for?(x)` on top of `allows?` applies the coarse test to both and silently overrides that carve-out — it emptied badge feeds and caseloads for lapsed supporters, and a spec was written asserting the broken result. Do not re-implement a permission's own policy at the call site; pass the right permission and let the rule decide. CI cannot catch this class on its own: a freshly-created account is `:trialing_supporter` for 60 days, so a test must drive the state (`expires_at = 2.days.ago`) to reach it at all.

`allowed?(user, 'supervise')` on a therapist says nothing about the communicators inside `user.supervisees`. A district manager holds that permission on in-org therapists (`user.rb:87`), and a supporter asking about themselves always passes, so the gate admits the whole caseload — including a contracting SLP's private out-of-org children. Exclusion filters (`!modeling_only_for?`, `!private_logging?`) make it worse: no relationship returns false and the negation lets the stranger through. The check must be affirmative per child, and it must be the RIGHT check: roster identity uses `User#listable_as_supervisee_by?` / `supervisee_listable?` ('model'), while a disclosure ABOUT the child uses `User#readable_as_supervisee_by?` / `supervisee_readable?` ('set_goals' for progress, 'supervise' for usage). Using the data predicate for a roster empties the caseload of every billing-lapsed supporter, because 'supervise' carries a modeling-only conjunct and `billing_state` falls through to `:modeling_only` for any supporter who is not premium, trialing, org-sponsored, an org supporter, or a manager. HTTP list endpoints are not the only copy — `JsonApi::User` nests the first 10 with `limited_identity` (name, avatar, unread counts, org_status) on user show, which is the caseload source for <10 communicators, and `users#ws_settings` emits ids. Withholding identity is not sufficient on its own: the same payload carried the child's home board and full downstream board-id set via `board_set_ids(include_supervisees: true)`, which re-derived from the unfiltered list, and board ids are directly fetchable. `limited_identity` is not a redaction. Grep `user.supervisees` in `app/controllers` and `lib/json_api` before calling the class closed.

## Gotcha: one CLI flag carrying two meanings silently corrupts the register's evidence anchors

`scripts/audit-merge.rb --sha` used to do two unrelated jobs: stamp `meta.auditedSha` (the claim "an `/audit-run` audited the WHOLE tree at this SHA", a governance act needing Scot's sign-off per `meta.auditedShaPriorNote`) **and** overwrite every incoming finding's `evidence.sha`. Adding a finding outside a full run therefore had no correct invocation: passing the true commit falsely restamped the audit pointer, and passing the register's existing `auditedSha` to dodge that restamp silently re-anchored the new evidence to a commit it was never verified against. The second is the dangerous one — `citation-check.rb` matches per LINE, so when the snippet happens to sit on the same line in both commits it passes **green with a wrong anchor**; PR #742's session only caught it because line 182 vs 152 happened to differ. Fix: `--no-restamp` (evidence anchors at `--sha`, `meta` untouched), mirroring `promote-finding.rb`, which never touches the pointer for exactly this reason. General rule: when a flag feeds two sinks that only coincide in one workflow, the workflow that separates them is the one that gets corrupted silently. Ref: [`2026-08-04-audit-merge-sha-decoupling.md`](./2026-08-04-audit-merge-sha-decoupling.md).

## Gotcha: `audit-artifacts-integrity` green proves renders match JSON, NOT that the register is loadable

Every check in that CI job compares a generated markdown against its JSON source; none of them reads the field *shapes* the register's consumers depend on. A finding whose `source` was written as a bare String instead of an object merged fully green and then hard-crashed `promote-finding.rb` (`Hash#dig': String does not have #dig method (TypeError)`) for the **entire** register weeks later — `citation-check.rb` exited 0 on it too, since it only validates evidence. Closed with two complementary gates: `scripts/register-lint.rb` (predicted shapes, enums, id uniqueness — precise error messages) and `scripts/tests/register-consumer-smoke-test.sh` (runs the real consumers over each committed register with empty input, asserting exit 0 **and** byte-identical output — catches whatever the predicate list failed to anticipate). When adding a validator for a data file, gate on *consumability*, not just on render consistency. Ref: [`2026-08-04-audit-merge-sha-decoupling.md`](./2026-08-04-audit-merge-sha-decoupling.md).
