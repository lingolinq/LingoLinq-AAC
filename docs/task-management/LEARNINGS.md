# LEARNINGS (curated)

This is the curated set of durable lessons for LingoLinq-AAC, grouped by the surface they apply to.
Every historical entry, including the ones condensed here, lives verbatim in
`learnings-archive/LEARNINGS-2026-01_to_2026-09.md`; grep that file by surface keyword (`scanner`,
`attest`, `!important`, `i18n_generator`) when you need the full trace. New lessons are appended to
`learnings-archive/YYYY-MM.md` for the current month and are promoted here only by a reviewed PR.

Admission rule for an entry in this file:

- (a) It generalizes beyond one PR: a future task in a different file would hit it.
- (b) It is at most 8 lines and carries exactly one citation that resolves at HEAD (a `path:line`, a
  symbol, or a script name). Never a dated task-log filename; those are gitignored and dangle.
- (c) It is not already stated in CLAUDE.md or a skill.
- (d) It states no infrastructure fact contradicted by the global hosting truth: GCP Cloud Run, Render
  deleted 2026-09-09, Node 22, Ember 5.12, Rails 7.2, base branch `develop`.

## Rails and background jobs

- **`allowed?` renders on denial, so at most one call per expression.** It calls `api_error` then returns
  false; `allowed?(a) || allowed?(b)` double-renders, and the allowed path persists a record then 500s.
  Use the pure `user.allows?(@api_user, perm)` for all but the last check. Symbol: `allowed?` in
  `app/controllers/application_controller.rb`.
- **A serialized client model sends `""` for unset ids, and `""` is truthy in Ruby.** Use `.presence`.
  Tell: an `allowed?` 400 body without `resource_id` means the object was nil (a lookup miss), not a
  permission denial. Symbol: `find_by_path` in `app/models/concerns/global_id.rb`.
- **Permissions are Redis-cached for 30 minutes, so `allows?` can disagree with the DB.** A runner and
  the server can answer differently; `touch` both users to force a recompute. Anything that changes the
  answer (the per-request `valet_mode?` flag) must be in the cache key. Symbol: `permissions_redis` in
  `app/models/concerns/permissions.rb`.
- **Every external-model call site gates the same way.** `ai_feature_enabled_for?` (org opt-out, COPPA,
  EU under-16, prefs; returns false unless the flag is in `AI_FEATURES`), then `PiiScrubber.redact_for_ai`,
  then an `AiApiLog` row in `ensure`. Call the gate BEFORE any shared-cache short-circuit; a cache hit
  must not skip consent. Symbol: `ai_feature_enabled_for?` in `lib/feature_flags.rb`.
- **A gate keyed on a caller-asserted identity must derive the egressed data from that identity.**
  Checking consent for `user_id` while shipping an unbound free-text payload lets a consented id carry
  another child's data. Symbol: `narrate` in `app/controllers/api/eval_sessions_controller.rb`.
- **PiiScrubber and `filter_parameters` never touch explicit `Rails.logger` interpolation.** Cloud Run
  ingests every stdout line into Cloud Logging, so log opaque `global_id`s or nothing; the log formatter
  catches only emails, phones, SSNs and IPv4. Cite `lib/pii_scrubbing_formatter.rb`.
- **`after_all_transactions_commit` is not a durable outbox.** It closes the Redis-vs-Postgres ordering
  race, not the crash window after commit. Write a same-transaction `RemoteAction` as the fallback and
  keep the post-commit enqueue as the fast path. Symbol: `schedule_board_cache_refresh` in
  `app/models/concerns/supervising.rb`.
- **`schedule_for` on an unsaved record enqueues `id: null` and dispatches to the class.** The job fails
  forever as `method not found`. Enqueue create-time instance jobs from `after_commit`, never from
  `process_params`. Symbol: `update_privacy` in `app/models/board.rb`.
- **`Worker.process_queues` destroys the RemoteActions it processes.** It runs `RemoteAction.process_all`
  before draining Resque, so RA-row assertions after two waves flake to zero; assert after one wave.
  Symbol: `process_queues` in `lib/worker.rb`.
- **A new user preference is a three-touch change.** Add the key to `PREFERENCE_PARAMS` (an unlisted key
  is dropped silently and the save response reverts the UI), add a `preference_defaults` entry, and on
  the client set `preferences.device.updated = true` so the raw attr dirties (create `device` first if
  absent). Symbol: `PREFERENCE_PARAMS` in `app/models/user.rb`.
- **Client-supplied URLs and uploads are defended at the server sink, not in the UI.** `SafeHttp` resolves
  DNS, rejects private and link-local answers, pins IPs into libcurl and re-checks each redirect hop;
  `ButtonImage#process_params` coerces non-`image/*` types and runs `SvgSanitizer` (SVG must still pass,
  OpenSymbols serves it). Cite `lib/safe_http.rb`.
- **An unset env var can turn a storage optimization into silent data loss.** With `REMOTE_EXTRA_DATA`
  unset, `detach_extra_data` is a no-op that still returns true, so data stripped into a transient stash
  was the only copy. Never move the sole copy until the destination write is confirmed. Cite
  `app/models/concerns/extra_data.rb`.
- **Board translation egress to Google is `users#translate` and `WordData`, not `translate_set`.** An
  off-switch on `translate_set` alone still leaks labels. Spelling-key letters (`+e`) must be
  identity-mapped, never sent; Google returns solfege and abbreviations. Symbol: `letter_compose_key?`
  in `lib/board_translation_words.rb`.
- **Spawning ImageMagick: argv only, reject a one-element argv, pass `:in => File::NULL`, escape `%`,
  `\` and leading `@` in labels.** A one-element `system(*args)` is the shell form, an empty argv element
  makes IM read stdin and hang the worker, and `-label` has its own interpreter that `Shellwords`
  cannot defuse. Cite `lib/image_magick_runner.rb`.
- **The prod uploads bucket blocks public access, so server-side reads of uploaded objects must be
  signed.** A raw `s3.amazonaws.com` fetch returns a 403 body that surfaces as a zip error or `File not
  found`; staging can pass where prod fails. Symbol: `signed_internal_url` in `lib/uploader.rb`.
- **A media record's `protected` flag is an entitlement boundary; never relax its predicate to fix
  rendering.** The real bug was `settings['protected']` stored as the string `"false"`, which is truthy;
  cast on write and read. Cite `lib/json_api/image.rb`.
- **`BoardCloner` copies only allowlisted settings keys.** A new `settings` key is silently dropped from
  every copy until it is added to the allowlist. Cite `app/cloners/board_cloner.rb`.

## Ember reactivity and data

- **Ember Data 5.3 relationship and query arrays are native Proxies.** `firstObject` is silently
  `undefined`, `toArray` is gone (use `Array.from`), `.sortBy`/`.pushObject` throw, and results refuse
  in-place mutation (`.slice()` first). Only `A()`-wrapped plain arrays take Ember array methods.
  Symbol: `EXTEND_PROTOTYPES` in `app/frontend/config/environment.js`.
- **`store.push` does not overwrite a dirty `attr('raw')`, and in-place mutation does not dirty it.**
  Clone the array (and nested objects) before `set`, or the follow-up `save()` is skipped. Symbol:
  `sync_changed` in `app/frontend/app/utils/persistence.js`.
- **`findRecord(..., {reload: true})` never reaches the network.** The adapter is offline-first and
  ignores ED's reload option; the opt-out is `persistence.force_reload`, set and restored around the
  call. Symbol: `force_reload` in `app/frontend/app/models/base.js`.
- **`sessionUser.id` is the literal `'self'`.** Compare `global_id` on authorship gates, and never put
  `self` in a `/users/:id` URL; the server treats it as a username lookup and 404s. Cite
  `app/frontend/app/serializers/application.js`.
- **Three different "users" exist; pick per purpose.** `sessionUser` is the authenticated account;
  `currentUser` is swapped to the communicator in speak mode (`feature_flags` and personal prefs follow
  it); the `user` route model is the board OWNER in the URL. "Whose page is this" comes from
  `permissions.user_id`. Symbol: `feature_flags` in `app/frontend/app/services/app-state.js`.
- **Route state traps.** Query params are sticky per singleton controller (add `resetController`), a
  `deactivate`-only teardown leaves controller state for the next visit, and "show this on entry" must
  be a computed over the resolved record, not a flag set in `setupController` before the promise
  resolves. Cite `app/frontend/app/routes/board-picker.js`.
- **Observers are not an event bus, and they fire synchronously here.** They skip unchanged values and
  race registration, so register a direct opener; `_DEFAULT_ASYNC_OBSERVERS` is unset, so `set()` runs
  the observer inline, while `willDestroy` is non-eager and needs a tick. Cite
  `app/frontend/config/environment.js`.
- **`stashes.online` is seeded only by an observer that never fires on a machine that starts online.**
  Unset, `push_log` parks every log in localStorage and nothing reaches the server. Symbol: `push_log`
  in `app/frontend/app/services/stashes.js`.
- **The adapter's `ajax` override must go through `ajaxOptions`.** Calling `$.ajax` with ED's raw options
  form-encodes every write: arrays become index-keyed hashes, numbers and booleans become strings, and
  `false` arrives truthy. Cite `app/frontend/app/adapters/application.js`.
- **Handler binding contracts must match the template form.** `{{on "evt" this.fn}}` does not bind
  `this`; bind a factory in `init` (not `didInsertElement`, which is `undefined` for the first render).
  A factory helper pairs with `(this.x "name")`, an immediate-invoke helper with `(fn this.x "name")`;
  mixing halves silently kills the handler. Symbol: `ctrlAction` in `app/frontend/app/components/available-boards-section.js`.
- **A template-bound `style={{...}}` wipes imperative `el.style.setProperty` on the same element.** One
  owner per element's `style`. Symbol: `_sync_prediction_tile_size` in
  `app/frontend/app/controllers/user/board-detail.js`.
- **`global_transition` runs on every `routeWillChange`: it closes all modals and calls
  `toggle_edit_mode`.** No modal survives a transition, an edit-to-edit hop re-opens the copy prompt,
  and mode derives only from `stashes.current_mode`. Symbol: `global_transition` in
  `app/frontend/app/services/app-state.js`.
- **The session-entry gates (terms-agree, Art.50 disclosure) live only in the index route.** Any login
  that lands elsewhere skips them. Symbol: `maybeShowSessionEntryGate` in `app/frontend/app/routes/index.js`.
- **A board's key is not stable.** Renaming rewrites it and copies get a `_<n>` suffix, so key-shape
  heuristics reclassify boards and `LIKE '%/name'` misses copies. Classify a copy by
  `parent_board_key`. Cite `app/frontend/app/utils/board-brands.js`.

## Templates, i18n and modals

- **`i18n_generator.rb` is a static, single-line parser.** Dynamic `{{t bound key=bound}}` keys are
  invisible; a single-quoted default deletes the key on the next run; a call whose `)` is on the next
  line is dropped; `--merge` only adds missing keys, so a reworded default never refreshes other
  locales. Cite `i18n_generator.rb`.
- **`{{t "text" key="k"}}` renders the locale value when `k` already exists, and `%%` is not
  unescaped.** Reusing a key makes the inline text dead, and a locale value without the leading `*** `
  marker counts as already translated. Cite `app/frontend/app/utils/i18n.js`.
- **There is no `eq` helper; use `is_equal`.** `(eq ...)` throws at render and aborts the template.
  Cite `app/frontend/app/helpers/is_equal.js`.
- **Strict-mode templates resolve bare names as helpers.** Write `this.prop`; template-lint misses
  `no-implicit-this` in several large legacy templates, so grep for bare `{{snake_case}}` too. Cite
  `app/frontend/.template-lintrc.js`.
- **The modal slot is single-tenant.** `modal.open('X')` is a no-op unless `X` is registered in
  `modal-container`; a second `open` in the same run loop replaces the first before it mounts; `open()`
  resolves only on close; work that must survive dismissal belongs in a service plus an app-level
  component. Symbol: `_openModal` in `app/frontend/app/services/modal.js`.
- **`raw_events` synthesizes clicks inside modals, so a modern `{{on "click"}}` handler fires twice.**
  Idempotent actions hide it; creates double-post. Symbol: `dispatchPassThroughClick` in
  `app/frontend/app/utils/raw_events.js`.

## Board rendering and scanning (AAC input paths)

- **A board tile has four render paths; a change must land in each.** Board-detail speak mode uses
  `_make_btn` (a hand-picked field subset; an omitted field vanishes on every re-render), edit mode uses
  `_make_ember_btn`, the classic renderer builds `fast_html` (eval boards stay on it by design), and the
  board preview is a separate canvas painter. Symbol: `_make_btn` in `app/frontend/app/controllers/user/board-detail.js`.
- **Board-detail chrome receives clicks by two routes.** Ember `{{on}}` and the `raw_events` fallback
  for synthetic dwell, gaze and touch input; when the dedup misfires, a toggle action net-cancels.
  Symbol: `defer_board_detail_chrome_click_to_ember` in `app/frontend/app/utils/raw_events.js`.
- **A "vocalization same as label, drop it" optimization destroys special vocalizations.** `+q`,
  `:space`, `:shift` are actions, not words; one localize-then-save pass wiped every keyboard key on a
  board. Reproduce save bugs through the in-app control, not the URL. Symbol:
  `_localized_button_fields` in `app/frontend/app/controllers/user/board-detail.js`.
- **Speak-bar edits must mutate `rawButtonList`, never only the chip mirror.** The spoken, logged and
  synced sentence derives from it. Symbol: `set_button_list` in `app/frontend/app/utils/utterance.js`.
- **Find-a-button on a sub-board must search from the navigation root, and client-built button sets key
  on numeric `global_id`, never the ED `id`.** Symbol: `_resolveSearchRoot` in
  `app/frontend/app/components/find-button.js`.
- **`store.peekAll('buttonset')` can yield unmaterialized entries.** Guard `bs && bs.get` at every
  iteration site. Symbol: `load_button_set` in `app/frontend/app/models/buttonset.js`.
- **Modal scanning needs both `.modal_targets .btn` markup AND `{ scannable: true }`.** Either alone
  strands the switch user; and any new `scanner.find_elem` call in `start()` must be null-guarded
  because the specs stub that seam. Symbol: `scannableTargets` in `app/frontend/app/services/modal.js`.
- **Scanner recovery assumes an emptied group leaves the layout.** A container that keeps its box while
  empty defeats `next_element`'s zero-box recovery; `escape()` keeps a class allow-list on purpose so the
  switch user always has an exit; `scanner.started` is set in `start()` and never cleared, so a guard
  keyed on it collapses to its other term. Symbol: `escape` in `app/frontend/app/utils/scanner.js`.
- **`buttonTracker.last_dwell_linger` is the LAST dwell target, not a dwell in progress.** It is never
  nulled in button dwell mode. Symbol: `last_dwell_linger` in `app/frontend/app/utils/raw_events.js`.
- **A cancellation that resolves lands on the success path.** The prediction cancel resolved `[]`,
  indistinguishable from "no words", and blanked the panel under a live dwell. Keep stale predictions
  visible until the new set arrives; never swap under a dwell. Symbol: `_pending_reject` in
  `app/frontend/app/utils/ai_word_predictor.js`.

## SCSS and layout

- **`!important` rules of this stylesheet.** A non-important declaration never beats an important one
  at any specificity (bare `.md-shell` paints with `!important`; the `board-card-modern` mixin's
  cosmetics beat any variant; a plain inline style loses, so JS fit-to-size writes inline `!important`).
  Between two importants, specificity then source order decide. Symbol: `board-card-modern` in `app/frontend/app/styles/app.scss`.
- **At equal specificity, emit order wins, and it is not what the file suggests.** `@use`d partials are
  emitted before every app.scss rule; byte-identical duplicates exist and the later copy wins; a later
  `gap` shorthand resets an earlier `row-gap`. Cite `app/frontend/app/styles/app.scss`.
- **A media query adds no specificity.** An un-nested higher-specificity rule outranks the breakpoint
  fix, and an `!important` base makes a whole ladder of non-important media rules dead. Fix the base
  rule. Cite `app/frontend/app/styles/app.scss`.
- **The root font-size is 10px, so `rem` renders at 62.5%.** Write px or the `$aac-font-size-*` tokens;
  a spec authored against 16px lands below the AAC type floor. Cite `app/frontend/app/styles/app.scss`.
- **Grep SCSS for BEM as `&__name`, not the full class.** Full-name greps report "unstyled" falsely,
  deleted surfaces leave orphan blocks, and deleting CSS is text surgery: `:not(.dead)` is a live
  selector and multi-line selector lists break silently. Validate with `npx --no-install sass
  --load-path=app/styles app/styles/app.scss /dev/null` from `app/frontend`. Cite `app/frontend/app/styles/app.scss`.
- **The scroll container is `#content`, and route templates render straight into it.** Overlays that
  must scroll with the page live inside it; there is no `.ember-view` wrapper between `#content` and a
  route's `.md-shell`. Symbol: `id="content"` in `app/frontend/app/templates/application.hbs`.
- **Overflow traps.** `overflow-y: auto` clips the X axis; `overflow-x: hidden` makes Y a scroll box and
  kills descendant `position: sticky`; `overscroll-behavior: contain` on a non-overflowing scroll box
  swallows the wheel; `cqmin` under `container-type: inline-size` resolves to the viewport; percentage
  padding resolves against width on all sides. Symbol: `overflow-x: hidden !important` in `app/frontend/app/styles/app.scss`.
- **The modern symbol card also carries class `.button`, so every classic `.button` rule leaks onto
  it.** Symbol: `md-board-detail-symbol-card` in `app/frontend/app/components/board-detail-grid.hbs`.
- **Sprockets rewrites `url(#id)` fragment refs inside CSS data-URI SVGs in production.** Gradient fills
  go transparent on deploy only; keep gradients out of embedded SVGs. Symbol: `Sprockets` comment in
  `app/frontend/app/styles/app.scss`.

## Tests and CI

- **Two frontend test idioms coexist, and the QUnit harness has its own rules.** Jasmine-wrapped
  (`describe`/`it`, local `stub`; `persistence.ajax = fn` does not stub) versus QUnit (`module`/`test`,
  `strictEqual` enforced). Import app modules as `'frontend/...'`, ED model ids must be strings under
  `throwOnUnhandled`, and a zero-match filter reports "1 tests, 1 failed". Cite `app/frontend/tests/helpers/jasmine.js`.
- **App-booting acceptance modules leak singleton state into later modules, and a test that leaks into
  a shared service hangs the run rather than failing.** Restore the exact state the boot mutated; four
  harness-level reorderings were tried and do not work. Cite `app/frontend/tests/acceptance/README.md`.
- **Acceptance harness traps.** A self-rescheduling `runLater` (the user refresh cycle) never settles
  test waiters and hangs every acceptance test; Mirage 3 calls the default export with its config and
  expects a server back, and a 2.x-style zero-arg export throws in `beforeEach`. Symbol: `refresh_user`
  in `app/frontend/app/services/app-state.js`.
- **`Worker.scheduled?` flakes repo-wide off BoyBand's 30-second `sizeof/<queue>` cache.** One example
  that pushes a queue past 500 makes every later `scheduled?` a false negative for 30 wall-clock
  seconds; the cache keys are deleted in `before(:each)`. Cite `spec/spec_helper.rb`.
- **Unscoped global counts fail on rows left by earlier runs.** `AuditEvent.count`, `Board.count` and
  `LogSession.count` assertions need a file-scoped `delete_all`; "order-dependent" is usually orphaned
  committed rows in `lingolinq-test`. Cite `spec/models/user_spec.rb`.
- **Two clock reads are a flake, and there is no Timecop here.** A spec that rebuilds a stamped value
  from a second `Time.now` (or `N.ago.to_i`) fails at any boundary; capture once and reuse. Run
  date-window specs under `TZ=UTC`; `Date.today` is local. Symbol: `decorate_completion` in
  `app/models/lesson.rb`.
- **Falsify in place, add a positive control, and sweep sanitizers against an oracle.** Reverting the
  whole file makes stubs inert; a negative assertion passes when its selector matches nothing; a hang
  test must assert on the spawn option, not hang the suite; curated examples miss the byte the author
  did not think of. Cite `spec/lib/image_magick_runner_spec.rb`.
- **Both lint baselines are line-anchored append logs.** `.eslint-todo` shows a storm of "new" findings
  after any edit to a grandfathered file (compare `file|rule|hash` net deltas; never `--update-todo`
  without diffing rule identity). `.lint-todo` is `add`/`remove` rows, and a plain
  `ember-template-lint` run rewrites it; pass `--no-clean-todo` for read-only checks. Cite
  `app/frontend/scripts/eslint-todo-gate.js`.
- **Browser probes lie in three ways.** Puppeteer `page.click` delivers nothing inside the nested modal
  scroll containers; Playwright e2e specs write the signed-in user's real device prefs and poison later
  runs; a fixed sleep tests the old bundle, so poll the built asset for a marker. Cite
  `app/frontend/e2e/helpers.js`.

## Compliance registers and legal docs

- **Attested legal docs are frozen bytes; supersede, never re-pin.** A successor must not inherit the
  predecessor's attestation dates, the metadata table is not the signed statement, and any hash quoted
  in prose must be a blob reachable from merged ancestry. Cite `docs/legal/README.md`.
- **The register's PII guard walks the whole record, and its IP regex refuses any dotted quad.** EN 301
  549 clauses like `9.1.4.3` get a finding silently skipped; never claim a finding is tracked until its
  row exists. Symbol: `deep_strings` in `scripts/promote-finding.rb`.
- **Scot's decisions live on two axes: `status` AND `disposition.state`.** A guard on status alone
  re-validates a dismissed finding as a routine `reseen`. Symbol: `SCOT_OWNED_CLOSED` in
  `scripts/audit-merge.rb`.
- **A finding id is `SHA256(ruleKey|file)`, and evidence must match per source line.** Rescoping a row's
  file in place, or a register-adding script with a looser snippet matcher, reddens the local
  citation-check later. Cite `scripts/audit-merge.rb`.
- **Register merges are unions, then regenerate; never `json.dumps` the file.** Keep both sides' unique
  rows and the longer notes trail, and edit prose by exact text replace, since a Python dump escapes
  `§` across every note. Cite `scripts/regenerate-register.sh`.
- **Scrubbed AI prompts are pseudonymized personal data, never "de-identified" or "anonymous".** Those
  words are legal claims in the legal docs folder. Symbol: `redact_for_ai` in `lib/pii_scrubber.rb`.

## Deploy and infra (GCP)

- **A Cloud Run post-deploy secret assertion must check every traffic target with `percent > 0`.**
  `latestReadyRevisionName` is not what users hit under a canary or rollback split. Cite
  `scripts/gcp/assert-runtime-secrets.sh`.
- **Bedrock credentials are a dedicated atomic pair.** Never fall back to `AWS_KEY`/`AWS_SECRET` (the
  S3/SES principal has no Bedrock actions) and never mix halves of two families. Symbol: `configured?`
  in `lib/ai_client.rb`.
- **dotenv loads `op://` references as literal strings, so `present?` is not "injected".** Treat a
  value starting with `op://` as unset. Symbol: `google_translate_token_injected?` in
  `lib/library_board_translator.rb`.

## Repo hygiene and tooling

- **Removing a UI feature is incomplete until every coupled site is gone.** i18n keys in every locale
  file, the model whitelist, docs naming the action, lint-todo rows and tests; a clean grep of
  `app/frontend/app` is half the job. Cite `public/locales`.
- **`chmod +x` does not reach the index when `core.fileMode` is false.** CI-invoked shell harnesses must
  be `100755`: `git update-index --chmod=+x <path>`. Cite `scripts/tests`.
- **`npm ci --dry-run` deletes `node_modules` first.** There is no check-only mode; the `patch-package`
  postinstall then fails on an empty tree. Cite `app/frontend/package.json`.
