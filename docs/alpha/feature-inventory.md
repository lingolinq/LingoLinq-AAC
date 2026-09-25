# Alpha feature inventory

- **Audited SHA:** `9d9be11527a82c3be71388cce837e6fad3121050` (`origin/develop` at the time of the audit, merge of PR #1062), 2026-09-24.
- **Data:** [`feature-inventory.csv`](feature-inventory.csv), one row per feature a tester can exercise or backend capability a tester can reach.
- **Rows:** 291. Every Rails route and every Ember route maps to a row or to the excluded-routes table below (see [Verification gate](#verification-gate)).
- **Public repo.** This file and the CSV hold triage facts only. Detailed review notes produced during the inventory are kept in internal notes, not in this repository.
- **Scope:** read-only investigation of application code. Nothing was run: no app, database, rails console, runner or gcloud. `bundle exec rails routes --expanded` was the only command that loaded the Rails environment.

## How this was built

1. `bundle exec rails routes --expanded` succeeded without a database. It gave 433 routes with `Source Location` (410 from `config/routes.rb`, 14 ActionMailbox and 9 ActiveStorage framework routes). The Ember router (`app/frontend/app/router.js`) was parsed into 115 route declarations (`inflections` is declared twice, lines 61 and 62; both are counted).
2. Each of the 548 routes was assigned to exactly one of seven area slices. A read-only Explore subagent inventoried each slice, plus one for background jobs and platform services and one that verified `docs/FEATURES.md` sections 2, 3, 5, 7 and 8 against code. Subagent output was treated as evidence to verify, not as findings.
3. Mechanical checks on every row: each full repo-relative `path:line` citation in `user_entry`, `backend` and `feature_flag` resolves to an existing file with at least that many lines, and every `existing_tests` path exists. Short citations (a bare file name, or `:NNN` continuing the previous file) are not resolved by this check. Ten random rows were re-read by hand (results below).
4. Duplicate rows produced by overlapping slices (for example 2FA reported by the auth, users and platform slices) were merged: 348 subagent rows became 292, with routes, tests and ledger ids unioned and each prose cell reduced to one statement plus any extra citations.
5. Two ledger properties that are not testable features were dropped (`no-e2ee`, `no-voiceprints`; see `audit-reports/CAPABILITY-LEDGER.json`), and one route-hygiene row was added for the excluded routes.

### Column notes

- **Extra columns.** Besides the requested columns the CSV carries `capability_ledger_id`, `side_effects`, and two traceability columns, `rails_routes` and `ember_routes`, which the reconciliation below counts. Route keys are stable: Rails routes as `VERB path controller#action` (from `rails routes --expanded`, format suffix dropped), Ember routes as `name:path` (from `router.js`), separated by ` | `.
- **roles** uses `anonymous; communicator; supervisor-SLP; org-admin; system`. `anonymous` means at least one of the row's endpoints or pages is reachable without logging in: the Rails action is exempt from `require_api_token` or its controller has no such filter, or the Ember route is a public page. Per-action checks may still refuse the request, so these rows are candidates for a logged-out test pass. `system` means site admin, operator or automated.
- **side_effects** is a heuristic from the feature name and backend text, for planning agent-run tests: `none (read-only)`, `writes`, `destructive` (deletes, revokes, purges, offboards or resets something) and `external-send` (email, SMS, push, webhook, AI call, payment or another third-party service). Rows marked `destructive` or `external-send` should run only in specs or an isolated test database, never against a shared environment. Check the backend before relying on the label.
- **data_risk** is `no`, or `yes:` followed by the data classes the feature touches (usage logs, identity and contact, age or consent, clinical or evaluation, recordings, location, AI processing, audit records, org roster, credentials, board content).
- **status_signals** uses a fixed tag set: stub; TODO or FIXME in code; retired; dead or orphaned route or code; no UI entry (API only); legacy UI only; flag never read; TEMPORARY forced-on flag; depends on a service that is not provisioned; commented-out code; suspected bug (not security); needs device or native app. Tags are triage hints, not defects.
- **phase** is the earliest phase in which a real user hits the feature. A row no user touches directly takes the phase of the user action that triggers it (for example the AI client and its guards are phase 6, account emails phase 0); rows with no triggering action are phase 8.
- **origin** is computed mechanically against a frozen mirror of pre-fork SweetSuite (`lingolinq/sweet-suite-aac-original-template` at `55aaa8a`, cloned read-only into a scratch directory) from each row's primary implementation files and Rails routes:
  - `LingoLinq-new`: none of the primary files exist in the mirror, or every Rails route the row covers is an action that the mirror's controller lacks.
  - `heavily modified`: some primary files are new, some routes are new actions, or a backend file changed by 50% or more (added plus deleted lines over the mirror's line count).
  - `upstream sweet-suite`: otherwise.
  - Frontend churn is reported but does not decide the class on its own, because the Ember 3.28 to 5.12 upgrade (PR #490) rewrote most frontend files (median frontend churn 64%, median backend churn 22%). A file's presence or absence in the mirror is proved by the file tree. The 50% threshold is a heuristic, so treat the class as ASSUMED and the per-file churn figures in the cell as the evidence.
- **feature_flag** gives the **code default** from `lib/feature_flags.rb`. Two caveats verified in code:
  - Production can replace the backend's enabled list through the `default_enabled_features` DB Setting (`lib/system_feature_settings.rb:6-12`, limited to `AVAILABLE_FRONTEND_FEATURES`). Organizations can override it for their members (`:60-67`).
  - The Ember UI forces ON every flag in the code constant regardless of that Setting. `app/assets/javascripts/globals.js.erb:5` emits `ENABLED_FRONTEND_FEATURES` and `app/frontend/app/services/app-state.js:2943-2948` sets each one true on `feature_flags`. So a DB or org override cannot switch off, in the UI, a flag that is enabled in code.
  - Live production flag state was not read in this audit.
- **confidence** has three values. `CONFIRMED`: the author re-read the cited lines against the code. `AGENT-REPORTED`: an inventory agent read the code and cited it; the citations passed the bounds check, but the author did not re-read the content. `ASSUMED: ...`: part of the row is inferred, and the text says what.
- **Departure from repo convention:** CLAUDE.md Rule #0.8 asks for a task log under `docs/task-management/` for researched work. This change commits only the two requested files, per the task instructions.

## Counts

### By area

| value | rows |
|---|---:|
| Setup, auth, account & purchasing | 47 |
| Boards & content | 39 |
| Background jobs, mail & platform services | 38 |
| LingoLinq-new: AI, clinical eval, multilingual, beta | 36 |
| Org, district & system admin; integrations | 34 |
| Speak mode, access & device | 33 |
| Users, supervision & team | 33 |
| Logs, reports, goals & lessons | 31 |

Rows can list more than one role, so role counts sum to more than the row total.

### By role

| value | rows |
|---|---:|
| anonymous | 79 |
| communicator | 197 |
| supervisor-SLP | 212 |
| org-admin | 70 |
| system | 94 |

### By phase

| phase | meaning | rows |
|---:|---|---:|
| 0 | setup and install | 37 |
| 1 | first session | 18 |
| 2 | board customizing | 35 |
| 3 | communicator daily use | 31 |
| 4 | team | 32 |
| 5 | data | 31 |
| 6 | LingoLinq-new features | 25 |
| 7 | org and district admin | 36 |
| 8 | everything else | 46 |

### By verify_by

| value | rows |
|---|---:|
| agent | 134 |
| human | 89 |
| both | 68 |

### By origin (mechanical, see column notes)

| value | rows |
|---|---:|
| heavily modified | 181 |
| upstream sweet-suite | 59 |
| LingoLinq-new | 51 |

### By confidence

| value | rows |
|---|---:|
| AGENT-REPORTED | 254 |
| ASSUMED | 28 |
| CONFIRMED | 9 |

### By side_effects (heuristic)

| value | rows |
|---|---:|
| writes | 102 |
| none (read-only) | 64 |
| external-send | 53 |
| destructive | 50 |
| destructive; external-send | 22 |

Rows with `data_risk` = yes: **168** of 291. Rows carrying a `capability_ledger_id`: **38**.

## Features with NONE in existing_tests

37 rows. "NONE" means no spec or Ember test was found that references the feature's controller, action, component or library. It does not mean the code is unreachable.

| id | phase | feature |
|---|---:|---|
| SET-02 | 0 | Post-login device step (trusted vs shared device / long-lived token) |
| SET-29 | 1 | Standalone home-board picker (/board-picker), self or supervisee |
| SET-30 | 0 | Beta program welcome and beta agreement acceptance |
| SET-31 | 1 | Intro modal deep link (/intro) |
| SET-36 | 0 | Terms of service and privacy policy pages |
| SET-37 | 8 | Jobs page |
| SET-39 | 8 | Pricing page |
| SET-41 | 0 | Download / install page (store links, Windows, PWA add-to-home-screen guidance) |
| SET-42 | 8 | Limited (no external links) mode |
| SET-43 | 8 | Extras tab (tools and resources grid) on user dashboard |
| SET-45 | 3 | Video embed player page for video buttons |
| BRD-01 | 1 | Authenticated dashboard home (/:user/home and /bento) |
| BRD-02 | 8 | Modern-dashboard routes (empty stubs) |
| BRD-06 | 0 | Emergency / Basic Access boards (offline, no login) |
| BRD-12 | 2 | Board levels (reveal/lock buttons by level, speak-mode level switch) |
| BRD-30 | 2 | Button Stash (collect buttons from several boards, place them later) |
| SPK-04 | 3 | Speak-bar chip editing (remove, reorder, swap a word in the sentence) |
| SPK-11 | 3 | Head tracking (iOS Face ID native or webcam), head pointer, tilt sensitivity, facial-expression selection |
| SPK-12 | 3 | Inflections overlay on long-press (grammatical forms 3x3 grid) |
| SPK-13 | 3 | Automatic inflections (auto-adjust button word forms to sentence context) |
| SPK-14 | 3 | Native on-screen keyboard and external keyboard input |
| SPK-15 | 3 | Swipe pages (long swipe toggles between home and sidebar boards) |
| SPK-17 | 3 | Show/hide hidden buttons in speak mode (enable all buttons) and prevent_hide_buttons |
| SPK-19 | 2 | Skin tone preference applied to symbol images |
| SPK-20 | 3 | Custom sidebar: add/remove/reorder/hide sidebar boards and actions, quick actions, sidebar edit PIN, device... |
| SPK-22 | 8 | Board header 'Other Actions' menu (other_menu) on legacy board view |
| SPK-32 | 0 | Public 'Try a Demo' speak mode on static demo boards (build/speak/clear sentence, quick words, style panel) |
| SPK-33 | 8 | /speech static AAC symbol-board mockup page |
| TEAM-14 | 4 | Switch between supervisees (Switch Communicators) |
| TEAM-16 | 4 | Dashboard Supervisors panel (inline supervision settings modal) |
| TEAM-18 | 4 | Modeling ideas (word activity suggestions for supervisees) |
| TEAM-28 | 2 | Button suggestions (Extra Ideas) in board edit |
| DATA-31 | 7 | Lesson recent list and lesson delete (broken stubs) |
| NEW-02 | 6 | Quick Eval: build starter board from the recommendation |
| NEW-07 | 5 | Saved tiered-eval view and IEP-ready PDF export (with goals grid) |
| NEW-35 | 0 | Interface language picker (navbar locale modal; es/en UI strings) |
| SYS-38 | 8 | Route hygiene: routes in the Excluded routes table (dead resource defaults, unused framework routes) answer... |

## Features that look unfinished, dead or flag-disabled

98 rows carry at least one `status_signals` tag. The list is generated from the tags, so it matches the CSV exactly. Tags are triage hints: a row can be tagged for a flag that is never read while the feature itself works.

| tag | rows |
|---|---:|
| TODO or FIXME in code | 25 |
| flag never read | 22 |
| dead or orphaned route or code | 20 |
| no UI entry (API only) | 18 |
| commented-out code | 12 |
| stub | 7 |
| TEMPORARY forced-on flag | 7 |
| suspected bug (not security) | 3 |
| needs device or native app | 2 |
| depends on a service that is not provisioned | 2 |

| id | feature | tags |
|---|---|---|
| SET-04 | Two-factor authentication (TOTP): enable/confirm/disable/reset and login prompt | TODO or FIXME in code; commented-out code |
| SET-06 | Forgot password / forgot username (email help) | TODO or FIXME in code |
| SET-10 | SMS recipient consent opt-in page | dead or orphaned route or code |
| SET-23 | Bulk license purchase page (/purchase/:id) | TODO or FIXME in code |
| SET-24 | Redeem gift code | no UI entry (API only) |
| SET-25 | Admin gift/code management (list, create, deactivate) | no UI entry (API only) |
| SET-27 | Generate/delete start codes (start-codes modal) incl. 'Apply shallow clones'... | flag never read; commented-out code |
| SET-31 | Intro modal deep link (/intro) | no UI entry (API only) |
| SET-34 | Speak Mode 15-minute session limit (limited paid supervisors, modeling-only,... | suspected bug (not security) |
| SET-35 | Purchase-needed gate (check_for_needing_purchase) on edit boards and other ac... | dead or orphaned route or code |
| SET-38 | Static marketing pages (about, features, partners, compare, ambassadors) | dead or orphaned route or code; no UI entry (API only) |
| SET-39 | Pricing page | commented-out code |
| BRD-02 | Modern-dashboard routes (empty stubs) | stub; dead or orphaned route or code |
| BRD-03 | My Boards page (owned, starred, shared, tag folders, layout toggle) | TODO or FIXME in code; TEMPORARY forced-on flag |
| BRD-05 | Classic board view (board-alt) and hidden canvas render mode | flag never read |
| BRD-06 | Emergency / Basic Access boards (offline, no login) | stub |
| BRD-08 | Find a home board (starter board finder) | commented-out code |
| BRD-10 | Copy a board set (Make a Copy, copy for a supervisee, copy-first before editi... | dead or orphaned route or code; flag never read |
| BRD-11 | Board edit mode (button editor, button-settings modal, undo/redo, save) | TEMPORARY forced-on flag |
| BRD-13 | Symbol search and libraries (OpenSymbols, PCS, SymbolStix, LessonPix, GIPHY A... | flag never read |
| BRD-16 | Button sounds (record, upload, zip import, sound library) | flag never read |
| BRD-17 | User video upload/record (goals, notes, messages) | flag never read |
| BRD-24 | Translate a board set / trim board languages | flag never read |
| BRD-26 | Delete board (and undelete by re-saving the key) | TODO or FIXME in code |
| BRD-28 | Board popularity stats (uses, stars, forks) | TODO or FIXME in code; dead or orphaned route or code |
| BRD-35 | Word part-of-speech lookup (word data modal, auto button colors) | TODO or FIXME in code |
| BRD-36 | External resources and image proxy (button suggestions, books, cached button-... | TODO or FIXME in code |
| SPK-01 | Enter Speak Mode (dashboard Continue Speaking / board-detail auto-speak / leg... | TODO or FIXME in code |
| SPK-04 | Speak-bar chip editing (remove, reorder, swap a word in the sentence) | TEMPORARY forced-on flag |
| SPK-07 | Premium voices: browse, download/claim, delete (native app only) | needs device or native app |
| SPK-08 | Touch/click activation settings (select on press/release, location, cutoff, m... | TODO or FIXME in code |
| SPK-12 | Inflections overlay on long-press (grammatical forms 3x3 grid) | TODO or FIXME in code |
| SPK-14 | Native on-screen keyboard and external keyboard input | needs device or native app |
| SPK-15 | Swipe pages (long swipe toggles between home and sidebar boards) | flag never read |
| SPK-19 | Skin tone preference applied to symbol images | commented-out code |
| SPK-20 | Custom sidebar: add/remove/reorder/hide sidebar boards and actions, quick act... | flag never read; TEMPORARY forced-on flag |
| SPK-23 | Modeling mode toggle from speak mode, and speak-as-communicator / switch comm... | commented-out code |
| SPK-29 | Offline mode and sync (IndexedDB/SQLite cache, auto-sync, manual sync, Sync D... | TODO or FIXME in code |
| SPK-32 | Public 'Try a Demo' speak mode on static demo boards (build/speak/clear sente... | dead or orphaned route or code |
| SPK-33 | /speech static AAC symbol-board mockup page | stub |
| TEAM-03 | Delete my account (scheduled hard delete after 36h) | TODO or FIXME in code |
| TEAM-06 | Supporter requests access to a communicator by username/email (consent flow) | TEMPORARY forced-on flag |
| TEAM-08 | Communicator approves/denies pending supervision requests in-app | TEMPORARY forced-on flag |
| TEAM-09 | View or revoke a consent-flow supervisor relationship (API only) | no UI entry (API only) |
| TEAM-14 | Switch between supervisees (Switch Communicators) | TEMPORARY forced-on flag |
| TEAM-17 | Remote modeling (real-time follow and prompt over websocket) | depends on a service that is not provisioned |
| TEAM-18 | Modeling ideas (word activity suggestions for supervisees) | flag never read |
| TEAM-20 | Share an utterance (to supervisors/contacts, email, social) | TODO or FIXME in code; depends on a service that is not provisioned |
| TEAM-21 | Shared utterance page and recipient reply (/u/:code -> /utterances/:id) | commented-out code |
| TEAM-24 | User edit history (admin support) | suspected bug (not security) |
| TEAM-27 | Word map (vocabulary location map) API | no UI entry (API only) |
| TEAM-31 | Evaluation account transfer and reset | TODO or FIXME in code; commented-out code |
| DATA-01 | Communicator log list (sessions, notes, assessments, evals, profiles, journal... | no UI entry (API only) |
| DATA-05 | Quick assessment (tally correct/incorrect, optionally tied to a goal) saved a... | flag never read |
| DATA-06 | Legacy evaluation (obf/eval speak-mode eval) stored as eval log, pending eval... | TODO or FIXME in code; flag never read |
| DATA-07 | OBL log file download (single log, all logs, anonymized .obla) | TODO or FIXME in code; commented-out code |
| DATA-12 | Usage reports page (date/device/location filters, compare two periods, word u... | no UI entry (API only) |
| DATA-14 | Core word reports (core list, core/fringe coverage, modify core word list) | TODO or FIXME in code; flag never read |
| DATA-16 | Report snapshots (saved named report filters: date range, device, location) | no UI entry (API only); flag never read |
| DATA-17 | Public anonymized trends page (aggregate word/device/usage trends; admin inte... | no UI entry (API only) |
| DATA-18 | Trends slice for research integrations (developer key, 5-10 obfuscated users... | TODO or FIXME in code |
| DATA-19 | Anonymous research log bundle (monthly zip of opted-in users' anonymized logs) | no UI entry (API only) |
| DATA-20 | Communicator goals list and create goal (new, or from a template via browse) | TODO or FIXME in code |
| DATA-21 | Goal detail: edit, status tracking, linked notes/assessments/logs, video stat... | stub |
| DATA-23 | Badges page (earned and in-progress badges; highlight, hide, view badge) | dead or orphaned route or code; flag never read |
| DATA-26 | Periodic log summary email to communicators and supervisors; hourly log push... | TODO or FIXME in code |
| DATA-27 | User recordings library (recorded button sounds: play, transcript, edit, dele... | flag never read |
| DATA-28 | My trainings list (assigned lessons, completion status, rating face, launch) | stub |
| DATA-30 | Org and unit lesson management (create, edit, assign to users/org/room, unass... | no UI entry (API only) |
| DATA-31 | Lesson recent list and lesson delete (broken stubs) | stub; dead or orphaned route or code |
| NEW-05 | Eval protocol catalog API (static and org-scoped protocol templates) | no UI entry (API only) |
| NEW-06 | Server-side Quick Screen recommendation API (plus legacy eval_recommend alias) | no UI entry (API only) |
| NEW-12 | Word suggestions API (token-based AI next-word endpoint) | dead or orphaned route or code |
| NEW-19 | AI call audit log (AiApiLog), IP redaction after 90 days, EU 5-year purge, da... | dead or orphaned route or code; flag never read |
| NEW-22 | EU jurisdiction determination (drives Art. 50 scope and the AiApiLog retentio... | flag never read |
| NEW-25 | AI consent preferences: master 'Allow AI features' plus per-feature opt-ins,... | stub |
| NEW-30 | Product telemetry capture (route visits, board activations, taps, word-predic... | dead or orphaned route or code; suspected bug (not security) |
| NEW-31 | Global telemetry dashboard API (site admin) | no UI entry (API only) |
| ORG-06 | District license seats: list seats and claim a user into a seat (API only) | no UI entry (API only) |
| ORG-07 | Org reports: all communicators, supervisors, evals, recent sessions, logged o... | dead or orphaned route or code |
| ORG-08 | Site-admin global reports: new users, subscriptions, premium voices, feature... | commented-out code |
| ORG-11 | Org billing page: allotted licenses, supervisor/eval/premium-symbol seats, ex... | dead or orphaned route or code; no UI entry (API only) |
| ORG-23 | Org data policy: logging, geo logging, reports, publishing, retention and res... | no UI entry (API only) |
| ORG-28 | Resque job web UI at /jobby | dead or orphaned route or code |
| ORG-31 | AWS SNS callbacks: subscription confirm, media transcoding events, inbound SM... | TODO or FIXME in code |
| ORG-33 | App connections / installed tools (LessonPix, IFTTT, custom tools): browse, c... | flag never read |
| ORG-34 | Webhooks (event handlers): add, list, test, update, delete; new_session/new_u... | flag never read |
| SYS-01 | Scheduler dispatch (hourly and daily jobs run by the Cloud Run scheduler Job) | commented-out code |
| SYS-03 | Transactional email delivery pipeline (SES, priority queue, per-user channels... | dead or orphaned route or code |
| SYS-05 | Account emails: welcome/confirm registration, new-registration admin alert, p... | TODO or FIXME in code |
| SYS-07 | Supervisor/team notification emails: supervisor access request/approved/revok... | dead or orphaned route or code |
| SYS-09 | Subscription and billing emails (purchase confirmed, expiring in 1 month/3 mo... | dead or orphaned route or code |
| SYS-13 | Orphan/leftover retention sweep with retention_flush audit events | dead or orphaned route or code |
| SYS-14 | Version history and deleted-board retention (limits on PaperTrail rollback, 3... | TODO or FIXME in code |
| SYS-18 | Audio/video transcoding (AWS MediaConvert) of recordings, plus a daily retry | flag never read |
| SYS-24 | Outbound webhooks and remote log push (integrations and 'research' listeners) | TODO or FIXME in code; flag never read |
| SYS-26 | Duplicate log session merging (hourly) | commented-out code |
| SYS-38 | Route hygiene: routes in the Excluded routes table (dead resource defaults, u... | dead or orphaned route or code |

## Could not classify, or classified by inference

- Rows with ASSUMED confidence: 28.
- Rows whose origin could not be computed (no primary files resolved): 0.
- Every other row was classified. All origin classes are heuristic in the sense given under Column notes, and AGENT-REPORTED rows have not been re-read by the author.

| id | feature | what is assumed |
|---|---|---|
| SET-02 | Post-login device step (trusted vs shared device / long-lived token) | persistence of the long_token choice goes through the user save endpoint (not opened) |
| SET-06 | Forgot password / forgot username (email help) | forgot_login route resolves the dasherized forgot-login template/controller via ember-resolver underscore/dash fallback |
| SET-18 | Device management (list, rename, remove/hide devices) | exact Ember page that renders the device list not opened |
| SET-19 | Subscription view/purchase/manage (Stripe checkout, communicator pl... | the row text itself marks part of the claim as inferred or not verified |
| SET-29 | Standalone home-board picker (/board-picker), self or supervisee | backend endpoints for the actual home-board assignment not traced |
| SET-34 | Speak Mode 15-minute session limit (limited paid supervisors, model... | runtime TypeError inferred from code (modal promise assumed to resolve on close); board-detail re-entering speak on next board load (routes/user/board-detail.js:609-612) may reset speak_mode_started, not verified |
| SET-44 | Goal status quick-update links from email | summary- links fail (find_by_global_id on 'summary-...' not traced) |
| BRD-21 | Board edit history and rollback / restore deleted board | redirect-of-history-link inferred from reading routes/board.js beforeModel, not run |
| BRD-24 | Translate a board set / trim board languages | translate_set egress to Google inferred from the settings.hbs:61 text; board.rb:2594 body not read |
| SPK-10 | Dwell / eye-gaze selection (webcam weblinger, native eye gaze, curs... | the row text itself marks part of the claim as inferred or not verified |
| SPK-11 | Head tracking (iOS Face ID native or webcam), head pointer, tilt se... | the row text itself marks part of the claim as inferred or not verified |
| SPK-21 | Geo sidebar: highlight sidebar boards by location/time (geo-fenced) | the row text itself marks part of the claim as inferred or not verified |
| TEAM-20 | Share an utterance (to supervisors/contacts, email, social) | the row text itself marks part of the claim as inferred or not verified |
| TEAM-22 | Personal contacts and 'message me' link for two-way messaging | user_spec coverage of add_contact not opened; offline_actions branch lines seen via grep |
| TEAM-33 | External AAC device (sidekick) declaration on profile | users_controller_spec coverage of external_device not opened |
| DATA-06 | Legacy evaluation (obf/eval speak-mode eval) stored as eval log, pe... | spec file coverage of eval log_type not individually confirmed; boundary: new clinical /eval (eval.quick, eval_sessions) is covered by another row |
| DATA-12 | Usage reports page (date/device/location filters, compare two perio... | the row text itself marks part of the claim as inferred or not verified |
| DATA-14 | Core word reports (core list, core/fringe coverage, modify core wor... | components/stats/core-list.js path inferred from <Stats::CoreList>, not opened |
| DATA-15 | Enable usage logging / geolocation logging from Reports (opt-in) | stats-test.js coverage of enable_logging not confirmed |
| DATA-22 | Public goal library and template sequences (browse templates; admin... | whether non-admin users can open goals.goal for a template (show requires 'view', user_goal.rb:19-28) not verified |
| NEW-02 | Quick Eval: build starter board from the recommendation | header comment read only and the ajax call site, not the payload builder |
| NEW-17 | Bedrock account-binding check (expected AWS account guard on the AI... | BAA status comes from code comments (ai_client.rb:21-27, eval_narrator_model_allowlist.rb:16-17), not from a verifiable artifact |
| NEW-22 | EU jurisdiction determination (drives Art. 50 scope and the AiApiLo... | the row text itself marks part of the claim as inferred or not verified |
| NEW-35 | Interface language picker (navbar locale modal; es/en UI strings) | choose-locale internals and config/locales/es.yml contents not opened |
| SYS-09 | Subscription and billing emails (purchase confirmed, expiring in 1... | the row text itself marks part of the claim as inferred or not verified |
| SYS-15 | Expire stale supervisor access requests | the row text itself marks part of the claim as inferred or not verified |
| SYS-34 | Server-side at-rest field encryption (secure_serialize) on about 40... | key management (SECURE_ENCRYPTION_KEY) lives in the GoSecure gem, not opened |
| SYS-38 | Route hygiene: routes in the Excluded routes table (dead resource d... | expected responses come from static reading; not executed |

## Comparison with docs/FEATURES.md

`docs/FEATURES.md` ("Last Updated: February 2025") was used as a seed list, not as evidence. It was not edited. Each item it names is either mapped to CSV rows below or listed under "claims not supported by current code".

### FEATURES.md items mapped to CSV rows

| FEATURES.md item | CSV rows |
|---|---|
| S1 Role: Communicator | TEAM-01 |
| S1 Role: Supporter/Supervisor | TEAM-01, TEAM-12 |
| S1 Role: Modeling-only | TEAM-10, TEAM-11 |
| S1 Role: Valet mode | SPK-24, SPK-25 |
| S1 Role: Organization manager | ORG-04, ORG-05 |
| S1 Role: Limited paid supervisor | SET-34 |
| S1 Permission types (view_existence ... link_auth) | TEAM-01 |
| S2 Speak Mode > 15 min | SET-34 |
| S2 Adding Supervisors (supervisor_consent_flow) | TEAM-05, TEAM-06 |
| S2 Auto-Jump to Speak Mode | SET-33 |
| S2 Editing Boards | SET-35, BRD-11 |
| S2 Premium Voices / voice limits | SPK-07 |
| S2 Usage Reports | DATA-12, DATA-13 |
| S2 Video Recording | BRD-17 |
| S2 Modeling Ideas | TEAM-18 |
| S2 Goals | DATA-20, DATA-21 |
| S2 Badge Tracking | DATA-23, DATA-24 |
| S2 Quick Assessments | DATA-05 |
| S2 Unlimited Evaluations | DATA-06, NEW-01, NEW-03, NEW-04 |
| S2 Logs / Team Messaging | DATA-01, DATA-04, TEAM-19 |
| S2 Share Utterance | TEAM-20 |
| S2 Third-Party Integrations | ORG-33, ORG-34 |
| S2 Button Suggestions | TEAM-28 |
| S4 Speak Mode | SPK-01, SPK-02 |
| S4 Board browsing/navigation | BRD-04, SPK-16, SPK-15 |
| S4 Button activation (click, dwell, scanning, head-tracking) | SPK-08, SPK-09, SPK-10, SPK-11 |
| S4 Utterance/sentence box | SPK-03, SPK-04 |
| S4 Speech synthesis | SPK-06, SPK-07, BRD-38 |
| S4 Find-a-button | BRD-29 |
| S4 Board creation/editing | BRD-09, BRD-10, BRD-11 |
| S4 Board levels | BRD-12 |
| S4 Symbol libraries | BRD-13, TEAM-32 |
| S4 Import/Export (OBF part) | BRD-18, BRD-20 |
| S4 Emergency boards | BRD-06 |
| S4 Supervisors / modeling-only links | TEAM-05, TEAM-10 |
| S4 Modeling ideas | TEAM-18 |
| S4 Remote modeling | TEAM-17 |
| S4 Logs | DATA-01, DATA-02 |
| S4 Goals | DATA-20, DATA-21 |
| S4 Badges | DATA-23 |
| S4 Assessments | DATA-05 |
| S4 Evaluations | DATA-06, NEW-01 |
| S4 Usage reports (Stats) | DATA-12 |
| S4 Video recording | BRD-17 |
| S4 Core reports | DATA-14 |
| S4 App connections | ORG-33, ORG-34 |
| S4 LessonPix | BRD-13, ORG-33 |
| S4 Premium symbols | BRD-13, TEAM-32 |
| S4 Organizations | ORG-01, ORG-03 |
| S4 Rooms | ORG-14, ORG-15 |
| S4 Lessons (org) | ORG-13, DATA-30 |
| S4 Profiles | ORG-22, TEAM-23 |
| S4 Reports (org) | ORG-07 |
| S4 Scanning mode | SPK-09 |
| S4 Head tracking | SPK-11 |
| S4 Dwell | SPK-10 |
| S4 Native keyboard | SPK-14 |
| S4 Inflections overlay | SPK-12 |
| S6 Modeling-only restrictions | TEAM-11, TEAM-10 |
| S7 Org roles (Manager, Assistant, Supervisor) | ORG-05, ORG-04, ORG-14 |

Section 3 (feature flags) and section 8 (where premium is checked) are verified item by item in the two tables that follow. Section 5 has its own table further down.

### Feature flags: code vs FEATURES.md section 3

`lib/feature_flags.rb` defines **76** flags in `AVAILABLE_FRONTEND_FEATURES`; **57** are in `ENABLED_FRONTEND_FEATURES` (on by code default) and **19** are available but off. FEATURES.md section 3 lists 37 enabled and 3 disabled flags. Every flag it names exists with the stated default. It omits the flags marked "absent" below. "never read" means no read site was found in `app/`, `lib/` or `app/frontend/app/`, so the flag has no effect.

| flag | code default | read in frontend | read in backend | FEATURES.md | CSV rows citing it | note |
|---|---|---|---|---|---|---|
| `subscriptions` | on (lib/feature_flags.rb:117) | app/frontend/app/templates/brief.hbs:426 (also footer.hbs:12, user/... | none | enabled | SET-17, SET-19, SYS-09 |  |
| `assessments` | on (lib/feature_flags.rb:117) | none | none | enabled | DATA-05 | flag is never read (dead); quick-assessment is gated on premium only |
| `custom_sidebar` | on (lib/feature_flags.rb:117) | none | none | enabled | SPK-20 | flag is never read (dead) |
| `canvas_render` | off (n/a (AVAILABLE only, lib/feature_flag...) | none (the preferences.device.canvas_render pref is read instead, bo... | none | disabled | BRD-05 |  |
| `snapshots` | on (lib/feature_flags.rb:117) | none | none | enabled | DATA-16 | flag is never read (dead) |
| `enable_all_buttons` | on (lib/feature_flags.rb:120) | app/frontend/app/templates/application.hbs:1201 | none | enabled | SPK-17 |  |
| `video_recording` | on (lib/feature_flags.rb:118) | none | none | enabled | BRD-17, SYS-18 | flag is never read (dead); video-recorder.js:37-39 is gated on currently_premium |
| `goals` | on (lib/feature_flags.rb:118) | none | app/models/user_badge.rb:91 | enabled | DATA-20, DATA-21, DATA-24, DATA-25 | backend only |
| `app_connections` | on (lib/feature_flags.rb:120) | none | none | enabled | ORG-33, ORG-34, SYS-24 | flag is never read (dead) |
| `translation` | on (lib/feature_flags.rb:119) | none | none | enabled | BRD-24, NEW-33 | flag is never read (dead) |
| `geo_sidebar` | on (lib/feature_flags.rb:118) | app/frontend/app/components/sidebar-button-settings.hbs:57 | none | enabled | SPK-21 |  |
| `modeling` | on (lib/feature_flags.rb:118) | none | none | enabled | SPK-07, TEAM-18 | flag is never read (dead) |
| `edit_before_copying` | on (lib/feature_flags.rb:118) | none | none (only the registry, lib/system_feature_registry.rb:15) | enabled | BRD-10 | flag is never read (dead) |
| `core_reports` | on (lib/feature_flags.rb:119) | none | none | enabled | DATA-14 | flag is never read (dead) |
| `lessonpix` | on (lib/feature_flags.rb:119) | none | none | enabled | BRD-13, ORG-33 | flag is never read (dead); LessonPix access depends on the integration or extras instead |
| `audio_recordings` | on (lib/feature_flags.rb:120) | none | none | enabled | BRD-16, DATA-27, SYS-18 | flag is never read (dead) |
| `fast_render` | on (lib/feature_flags.rb:119) | none | none | enabled | BRD-05 | flag is never read (dead) |
| `badge_progress` | on (lib/feature_flags.rb:120) | none | none | enabled | DATA-23 | flag is never read (dead) |
| `board_levels` | on (lib/feature_flags.rb:121) | app/frontend/app/templates/application.hbs:416 | none | enabled | BRD-12 |  |
| `premium_symbols` | on (lib/feature_flags.rb:121) | none | none | enabled | BRD-13 | flag is never read (dead); premium_symbols in button-settings.js is a separate variable based on extras |
| `find_multiple_buttons` | on (lib/feature_flags.rb:122) | app/frontend/app/templates/application.hbs:1271 | none | enabled | BRD-29 |  |
| `new_speak_menu` | on (lib/feature_flags.rb:122) | app/frontend/app/components/speak-menu.hbs:49 | none | enabled | SET-16, SPK-05 |  |
| `native_keyboard` | on (lib/feature_flags.rb:121) | app/frontend/app/templates/user/preferences.hbs:1005 | none | enabled | SPK-14 |  |
| `inflections_overlay` | on (lib/feature_flags.rb:122) | app/frontend/app/controllers/user/preferences.js:461 | none | enabled | SPK-12 | ; the gate in preferences.hbs:520 was removed (comment only) |
| `app_store_purchases` | on (lib/feature_flags.rb:121) | app/frontend/app/utils/subscription.js:279 | none | enabled + platform | SET-21 | ; only matters in installed app builds |
| `emergency_boards` | on (lib/feature_flags.rb:123) | app/frontend/app/templates/application.hbs:1330 | none | enabled | BRD-01, BRD-06 |  |
| `evaluations` | on (lib/feature_flags.rb:123) | none | none | enabled | DATA-06 | flag is never read (dead) |
| `swipe_pages` | on (lib/feature_flags.rb:122) | none (only the preferences.swipe_pages pref, preferences.hbs:497) | none | enabled | SPK-15 | flag is never read (dead) |
| `app_store_monthly_purchases` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/utils/subscription.js:290 | none | platform (in AVAILABLE, not ENABLED) | SET-21 | ; only has an effect when Subscription.product_types is set (app store) |
| `ios_head_tracking` | on (lib/feature_flags.rb:123) | app/frontend/app/controllers/user/preferences.js:534 | none | enabled + platform | SPK-11 |  |
| `vertical_ios_head_tracking` | on (lib/feature_flags.rb:124) | app/frontend/app/controllers/user/preferences.js:541 | none | enabled + platform | SPK-11 |  |
| `auto_inflections` | on (lib/feature_flags.rb:124) | app/frontend/app/templates/user/preferences.hbs:507 | none | enabled | SPK-13 |  |
| `remote_modeling` | on (lib/feature_flags.rb:124) | app/frontend/app/templates/user/preferences.hbs:1032 | none | enabled | SPK-26, TEAM-17 |  |
| `focus_word_highlighting` | on (lib/feature_flags.rb:124) | app/frontend/app/templates/user/board-detail.hbs:1099 | none | enabled | SPK-18, NEW-10 |  |
| `profiles` | on (lib/feature_flags.rb:125) | app/frontend/app/templates/organization/settings.hbs:210 | lib/json_api/unit.rb:56 | enabled | TEAM-23, ORG-22 | ; the backend check also needs premium_org |
| `skin_tones` | on (lib/feature_flags.rb:125) | app/frontend/app/templates/user/preferences.hbs:149 | none (only date-based defaults) | enabled | BRD-13, SPK-19, SPK-26 | ; FEATURE_DATES entry (feature_flags.rb:157) sets preference defaults (user.rb:2018); that is separate from the flag |
| `lessons` | on (lib/feature_flags.rb:125) | app/frontend/app/components/dashboard/authenticated-view.js:1200 | none | enabled | BRD-01, DATA-28, DATA-30, ORG-13 | ; the dashboard tile also needs currently_premium_or_fully_purchased |
| `other_menu` | on (lib/feature_flags.rb:125) | app/frontend/app/templates/application.hbs:593 | none | enabled | SPK-22 |  |
| `shallow_clones` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | app/models/user.rb:2334 (starred_board_refs) | disabled | SET-27, BRD-10 | FEATURES.md says it is 'Used in start-codes modal', but the start-codes shallow-clone checkbox (start-codes.hbs:170) is not tied to this flag |
| `ai_board_generation` | on (lib/feature_flags.rb:125) | app/frontend/app/utils/ai_feature_gate.js:129 | app/controllers/api/boards_controller.rb:573; lib/ai_board_generato... | enabled | NEW-09, NEW-10 | ; in AI_FEATURES and USER_PREF_AI_FEATURES (feature_flags.rb:173-178); ai_feature_enabled_for? also checks org opt-out, COPPA, EU under-16 and user prefs (feature_flags.rb:250-257) |
| `ai_word_prediction` | on (lib/feature_flags.rb:125) | app/frontend/app/utils/ai_word_predictor.js:53 (through aiFeatureEn... | app/controllers/api/words_controller.rb:57; app/controllers/api/wor... | absent | NEW-11, NEW-12, NEW-13 | enabled in code, missing from FEATURES.md; AI compliance gating (feature_flags.rb:250-257) |
| `ai_board_suggestions` | off (n/a (AVAILABLE only, lib/feature_flag...) | none (only the pref checkbox, preferences.hbs:262) | none (only the pref list, user.rb:2478) | absent | NEW-25 | missing from the disabled list; flag is never read; in AI_FEATURES and USER_PREF_AI_FEATURES |
| `ai_symbol_search` | off (n/a (AVAILABLE only, lib/feature_flag...) | none (only the pref checkbox, preferences.hbs:268) | none | absent | NEW-25 | missing from the disabled list; flag is never read; in AI_FEATURES and USER_PREF_AI_FEATURES |
| `ai_compliance_logging` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | none (only the registry, system_feature_registry.rb:46) | absent | NEW-19 | missing from the disabled list; flag is never read; in AI_FEATURES |
| `supervisor_consent_flow` | on (lib/feature_flags.rb:136) | app/frontend/app/components/supervision-settings.js:165 | app/controllers/api/supervisor_relationships_controller.rb:216; app... | absent in section 3 (mentioned in section 2, line 42) | TEAM-06, TEAM-07, TEAM-08 | enabled in code, missing from the section 3 lists; TEMPORARY forced ON; comment says return it to AVAILABLE only before go-live |
| `product_telemetry` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/services/telemetry.js:27 | app/controllers/api/telemetry_events_controller.rb:54 | absent | NEW-30 | missing from the disabled list |
| `telemetry_admin_panel` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/templates/organization.hbs:21 | app/controllers/api/telemetry_controller.rb:92 | absent | ORG-10 | missing from the disabled list; admins see it regardless (organization.hbs:21) |
| `tarheel_reader` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | lib/uploader.rb:1066 | absent | BRD-36 | missing from the disabled list |
| `auth_spa_transition` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/services/session.js:704 | none | absent | SET-01, SET-05 | missing from the disabled list |
| `google_sso` | on (lib/feature_flags.rb:127) | app/frontend/app/controllers/register.js:315 | none | absent | SET-12 | enabled in code, missing from FEATURES.md |
| `quick_screen_eval` | on (lib/feature_flags.rb:127) | app/frontend/app/templates/caseload.hbs:313 | app/controllers/api/eval_protocols_controller.rb:33; app/controller... | absent | NEW-01, NEW-02, NEW-03, NEW-05, NEW-06 | enabled in code, missing from FEATURES.md |
| `comprehensive_eval_ai` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/components/eval-comprehensive-runner.js:68 | app/controllers/api/eval_sessions_controller.rb:112 | absent | NEW-04 | missing from the disabled list; in AI_FEATURES, so AI compliance gating applies |
| `multi_user_board_import` | on (lib/feature_flags.rb:127) | app/frontend/app/services/content-grabbers.js:3110 | none | absent | BRD-18 | enabled in code, missing from FEATURES.md |
| `customize_menu` | on (lib/feature_flags.rb:128) | app/frontend/app/templates/user/board-detail.hbs:3091 | none | absent | BRD-11 | enabled in code, missing from FEATURES.md; TEMPORARY forced ON for testing |
| `home_tour` | on (lib/feature_flags.rb:129) | app/frontend/app/components/app-navbar-authenticated-inner.hbs:37 | none | absent | none | enabled in code, missing from FEATURES.md; PERMANENT ON (it is the onboarding path; pinned by a spec) |
| `paste_html_import` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/components/create-board-new.js:373 | app/controllers/api/boards_controller.rb:538 | absent | BRD-19 | missing from the disabled list |
| `catalog_board_prefetch` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/utils/board_prefetch_planner.js:162 | none | absent | SPK-30 | missing from the disabled list |
| `background_board_prefetch` | on (lib/feature_flags.rb:131) | app/frontend/app/utils/board_prefetch_planner.js:166 | none | absent | BRD-04, SPK-30 | enabled in code, missing from FEATURES.md |
| `portrait_orientation_overlay` | on (lib/feature_flags.rb:130) | app/frontend/app/controllers/user/board-detail.js:5270 | none | absent | none | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `signup_default_library_boards` | on (lib/feature_flags.rb:132) | none | lib/user_board_provisioner.rb:7 | absent | NEW-32 | enabled in code, missing from FEATURES.md; the ENV SIGNUP_DEFAULT_LIBRARY_BOARDS override forces it on (feature_flags.rb:221-225) |
| `english_first_board_generation` | on (lib/feature_flags.rb:132) | app/frontend/app/components/create-board-new.hbs:1420 | app/controllers/api/boards_controller.rb:697 | absent | BRD-09, NEW-34 | enabled in code, missing from FEATURES.md |
| `signup_spanish_library_boards` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | lib/user_board_provisioner.rb:15 | absent | NEW-32 | missing from the disabled list; ENV override; also needs an es locale (feature_flags.rb:227-235) |
| `eval_single_library` | on (lib/feature_flags.rb:126) | app/frontend/app/utils/eval_session.js:170 | none | absent | NEW-01, NEW-08 | enabled in code, missing from FEATURES.md |
| `dashboard_drag_layout` | on (lib/feature_flags.rb:133) | app/frontend/app/components/display-style.js:546 | none | absent | none | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `boards_page_owner_dedup` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/utils/board-roots.js:11 | none | absent | none | missing from the disabled list |
| `edit_sidebar` | on (lib/feature_flags.rb:134) | app/frontend/app/templates/user/preferences.hbs:60 | none | absent | BRD-11, SPK-20, SPK-26 | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `boards_side_by_side_layout` | on (lib/feature_flags.rb:141) | app/frontend/app/templates/user/boards.hbs:18 | none | absent | BRD-03 | enabled in code, missing from FEATURES.md; TEMPORARY; comment says turn it OFF before production go-live |
| `sentence_bar_editing` | on (lib/feature_flags.rb:135) | app/frontend/app/controllers/user/board-detail.js:1634 | none | absent | SPK-04 | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `text_symbol_fallback` | on (lib/feature_flags.rb:137) | app/frontend/app/components/board-detail-grid.hbs:121 | none | absent | none | enabled in code, missing from FEATURES.md; on by default; kept registered so it can be rolled back |
| `board_category_grouping` | on (lib/feature_flags.rb:138) | app/frontend/app/templates/user/board-detail.hbs:194 | none | absent | none | enabled in code, missing from FEATURES.md; TEMPORARY forced ON; clinically sensitive (moves vocabulary out of learned positions) |
| `session_resume` | on (lib/feature_flags.rb:140) | app/frontend/app/routes/index.js:137 | none | absent | none | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `supervising_context_banner` | on (lib/feature_flags.rb:139) | app/frontend/app/services/app-state.js:4025 | none | absent | TEAM-14 | enabled in code, missing from FEATURES.md; TEMPORARY forced ON |
| `eu_consent_age` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | app/controllers/application_controller.rb:45 | absent | NEW-21 | missing from the disabled list; eu_consent_age_enabled? reads the ENABLED constant directly, so the DB Setting, org settings and beta opt-in cannot turn it on (feature_flags.rb:... |
| `article_50_disclosure` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/utils/article50_gate.js:134 (reads the sessionUser... | app/controllers/application_controller.rb:439 | absent | NEW-09, NEW-22, NEW-23 | missing from FEATURES.md; off by code default; production state not read here; a code comment (feature_flags.rb:81-101) describes production enablement through the DB Setting; p... |
| `compliance_workflow_kernel` | off (n/a (AVAILABLE only, lib/feature_flag...) | app/frontend/app/routes/register.js:67 | app/models/user.rb:425; app/controllers/application_controller.rb:5... | absent | SET-08, SYS-36 | missing from the disabled list; compliance_workflow_kernel_enabled? reads the ENABLED constant directly, ignoring the DB Setting (feature_flags.rb:272-274) |
| `sms_recipient_consent` | off (n/a (AVAILABLE only, lib/feature_flag...) | none | app/models/sms_consent_invite.rb:8; app/models/utterance.rb:276 | absent | SET-10, TEAM-20 | missing from the disabled list; decided per communicator through sms_recipient_consent_enabled? (feature_flags.rb:278-281) |

### Premium checks: FEATURES.md section 8 vs code

| FEATURES.md row | status | evidence |
|---|---|---|
| Add supervisor: check_for_currently_premium (allow_fully_purchased) | CONFIRMED | app/frontend/app/components/supervision-settings.js:158, app/frontend/app/controllers/supervision-settings.js:85 and app/frontend/app/controllers/user/index.js:1490 all call it with allow_fully_purchased=true. The function is defined at app/frontend/app/services/app-state.js:3026-3042. |
| Quick assessment: check_for_currently_premium | CONFIRMED | app/frontend/app/controllers/user/logs.js:124. Bug at app/frontend/app/controllers/user/index.js:1461: it passes _this.get('model','quick_assessment'), so action is undefined. The premium check on the model still runs. |
| Evaluation: check_for_currently_premium (allow_premium_supporter) | CONFIRMED | Called with (false, true) at app/frontend/app/controllers/user/index.js:1505 and :1511, app/frontend/app/components/dashboard/authenticated-view.js:1597, and app/frontend/app/controllers/caseload.js:636. Also app/frontend/app/utils/eval.js:1345 checks currently_premium_or_premium_supporter. |
| Record session: check_for_currently_premium | CONFIRMED but dead | app/frontend/app/controllers/application.js:1207 runs the check and then only does alert('not yet implemented'). No template sends startRecording; beta-feedback-form.js:651 has its own unrelated startRecording. |
| Video recording: user.currently_premium | CONFIRMED | app/frontend/app/components/video-recorder.js:37-39, video_allowed = user.currently_premium |
| Share utterance: referenced_user.currently_premium | CONFIRMED (backend uses a different check) | Frontend: app/frontend/app/components/share-utterance.hbs:48. Backend: app/controllers/api/utterances_controller.rb:45 checks sharer.any_premium_or_grace_period?(true), which checks the sharer rather than the referenced user and allows the grace period. |
| Premium voices: currently_premium and premium_voices.allowed | CONFIRMED | app/frontend/app/components/premium-voices.js:64 checks currently_premium && premium_voices.allowed>0, or premium_voices.always_allowed (an override the doc does not mention). Backend limit: app/models/user.rb:327-331 add_premium_voice, reached through app/controllers/api/users_controller.rb:378-381 claim_voice (needs 'edit'). |
| Button suggestions: currentUser.currently_premium | CONFIRMED with a caveat | app/frontend/app/components/button-suggestions.js:142 and app/frontend/app/controllers/button-suggestions.js:93. They only set premium_ideas=true; they do not hide the whole feature. |
| Edit boards: check_for_needing_purchase | CONFIRMED with a caveat | app/frontend/app/routes/user/board-detail/edit.js:55 and app/frontend/app/controllers/application.js:1220. In toggleEditMode the check is in the else-branch, which runs when edit_mode is already on. check_for_needing_purchase (app-state.js:3043-3069) only BLOCKS modeling_only users (or callers passing prevent_unless_purchased). For really_expired users it just shows a reminder and then lets the... |
| Third-party integrations (board view): currently_premium_or_premium_supporter | CONFIRMED | app/frontend/app/templates/board/index.hbs:3 checks sessionUser.currently_premium_or_premium_supporter and shows a warning instead of the tool. Same check at user/board-detail.hbs:597 and user/board-alt/index.hbs:3. |
| Goals, badges, stats, logs: template gates on currently_premium | DIFFERENT for logs | goals.hbs:3, badges.hbs:3 and stats.hbs:51 use model.currently_premium. logs.hbs:3 uses model.currently_premium_or_premium_supporter. All four show ModelingOnlyNotice first when the viewer is modeling_only. Backend: app/controllers/api/logs_controller.rb:39 denies logs for a modeling_only user. |
| Premium voice limits (2 / 1 / 1 / 0) | CONFIRMED, with one nuance | app/models/user.rb:187-211 User.default_premium_voices: full_premium and eval gives 1; full_premium gives 2; trial gives 1; otherwise 0. The caller at user.rb:183-185 passes full_premium?(true), billing_state==:trialing_communicator and eval_account?. Nuance: eval_communicator is itself one of the full_premium? states (subscription.rb:968-976), and eval_account? means billing_state==:eval_commu... |

Share utterance: the backend check is at `app/controllers/api/utterances_controller.rb:45`, `sharer.any_premium_or_grace_period?(true)`, and it runs only when `user_id` is sent. It checks the sharer, not the referenced user.

### Organization roles: FEATURES.md section 7 and role concepts vs code

| role or concept | exists in code | where defined | permissions per code |
|---|---|---|---|
| Manager | yes | `org_manager` link with `full_manager`, `app/models/organization.rb:418-421` | `view`, `edit`, `manage` on the org (`organization.rb:44`). License and subscription changes are limited to managers of the LingoLinq admin org (`organization.rb:46`). |
| Assistant | yes | `org_manager` link without `full_manager`, `app/models/organization.rb:429-432` | `view`, `edit` on the org (`organization.rb:43`). `edit` covers the roster, reports, rooms, start codes and lessons, not only settings. |
| Supervisor | yes | `org_supervisor` link, `app/models/organization.rb:434-437` | `view` on the org (`organization.rb:47`). Supervises org users through room (unit) links (`app/models/organization_unit.rb:284`), not through org membership alone. |
| Org member (managed, sponsored, eval, pending) | yes, not in FEATURES.md | `app/models/organization.rb:439-457` | Communicator members; sponsored and eval members get premium through the org. |
| Admin-org manager | yes, not in FEATURES.md | `app/models/organization.rb:46`, `app/models/user.rb:84` | LingoLinq internal staff role: org deletion, licenses, subscriptions, support actions. |
| valet | EXISTS; described differently in the doc | app/models/concerns/passwords.rb:153 valet_mode?; app/models/user.rb:94-97 lets you log in as 'model@<user_id>', which calls assert_valet_mode!. On their own account, valet sessions get only view_existence/view_detailed/view_word_map/model in the 'modeling' scope (user.rb:57), and every other permission excludes valet (user.rb:55-56, 60-84). app/controllers/application_controller.rb:293-294 sets valet_blocked. It... | |
| modeling-only | EXISTS in two forms | Billing state: app/models/concerns/subscription.rb:856-858 (billing_state==:modeling_only). Per supervision link: app/models/concerns/supervising.rb:121-126 (permission_level 'modeling_only' or link state). Frontend: app/frontend/app/models/user.js:440-455, which also counts a modeling_session and expired free-trial supporters. Restrictions: user.rb:64-72 (no view_detailed, supervise or word map; set_goals only in... | |
| limited paid supervisor | EXISTS | app/frontend/app/models/user.js:431-433 limited_paid_supervisor = premium_supporter && subscription.limited_supervisor && !currently_premium. The server sets it in lib/json_api/user.rb:285-291: premium_supporter, account created more than 2 months ago, not an org supervisor, and no premium supervisees. Effect: speak mode on their own account is capped at 15 minutes (app-state.js:3657-3660). Also used at premium-re... | |

### FEATURES.md claims not supported by current code

Each entry names what was searched. "Not supported" can mean the feature is absent, works differently from the description, or is enforced only in the client.

| FEATURES.md claim | searched | finding |
|---|---|---|
| Snapshots – Save board states | grep snapshots in the frontend and lib; read app/frontend/app/models/snapshot.js and lib/feature_flags.rb:117; ls app/controllers/api (snapshots_controller.rb); grep feature_flags.snapshots | In this codebase snapshots are saved usage-report filters (models/snapshot.js: name, start, end, device_id, location_id; opened from controllers/user/stats.js:538 save-snapshot). They do not save board states, and the snapshots flag is never read. The nearest board-state feature is board version history plus rollback (boards#history/#rollback, BRD-21), which is limited to 6 months and whose page may be unreachable... |
| Import/Export – OBL format (for boards) | grep obl/.obl in app, lib and the frontend | OBL appears only in app/controllers/api/logs_controller.rb and lib/exporter.rb, so it is a usage-log format and not a board format. Board import/export supports OBF, OBZ and PDF (board.rb:818). The OBF part of this item is covered by the import and download rows. |
| communicator story: add buttons from multiple sources at once | grep 'multiple sources', stash, batch/bulk add in the frontend | No bulk multi-source add exists. The closest match is Button Stash (collect up to 48 buttons from any boards and place them one at a time; BRD-30). Also related: button-suggestions (external resources) and CSV label import in create-board-new (create-board-new.hbs:484-497). |
| fast_render (Fast board rendering) | grep -rn fast_render app lib (rb/js/hbs/erb) | Only in lib/feature_flags.rb:16,119 and lib/system_feature_registry.rb:19; no code reads it, so there is no fast-render feature to test |
| Head tracking described as 'iOS head tracking' flag-gated | controllers/user/preferences.js:534-551 | Head tracking works through the webcam (weblinger) on any platform. ios_head_tracking and vertical_ios_head_tracking only relabel Eye-Gaze-Plus-Head and add External Gaze Hardware on iOS. The Head Tracking option is not gated by either flag |
| Native keyboard described as 'On-screen keyboard' | services/app-state.js:4505-4514, utils/scanner.js:1064 | It is the OS keyboard, and only in the installed iOS/Android app (capabilities.installed_app). There is no web on-screen keyboard behind this flag |
| Section 6: modeling-only cannot 'Have a personal home board' | grep modeling_only / billing_state in app/models/user.rb, lib/json_api/user.rb, app/frontend/app/services/app-state.js, dashboard/authenticated-view.js | No home-board restriction tied to modeling_only found. The closest match is the speak-mode premium nag for modeling-only supporters with no supervisee (app-state.js:1806) |
| Section 6: modeling-only cannot 'Use cloud extras' (backend) | grep modeling_only? in app/ lib/ (Ruby) | Only frontend enforcement: the Extras card is hidden (templates/user/index.hbs:246). No server-side modeling_only check on extras was found |
| Section 6: modeling-only cannot view goals | app/models/user.rb:75-80 | Differs in the backend: set_goals is still granted to a billing modeling-only supervisor (user.rb:79 only blocks per-link modeling-only when the user is not billing modeling_only). Only the UI hides it (templates/user/goals.hbs:1) |
| Premium: Button Suggestions described as 'AI/contextual' | app/frontend/app/components/button-suggestions.js | Not AI. It uses core/fringe lists (:176), message-bank suggestions (:235) and external resource search (:306/:376). The premium gate exists (:142) |
| Section 8: Share utterance 'referenced_user.currently_premium' | share-utterance.hbs, utterances_controller.rb | True in the frontend only (share-utterance.hbs:48). The backend checks the SHARER's any_premium_or_grace_period?(true), and only when user_id is sent (utterances_controller.rb:45). Email/SMS shares via share-email have no server-side premium check |
| Permission view_existence/view_detailed 'View user/board details' | app/models/board.rb:84-102 | These are user permissions only. Board uses view/edit/delete/share; view_detailed is checked in badges_controller.rb:7 and boards_controller.rb:74, not on boards |
| Section 8: Record session (check_for_currently_premium) | grep startRecording across app/frontend/app (js, hbs); read controllers/application.js:1205-1209; compared upstream controllers/application.js:661-665 | The premium check exists, but after it passes the action only runs alert('not yet implemented'). No template calls startRecording (only beta-feedback-form uses a same-named action of its own). This is a stub and cannot be reached in the UI, same as upstream. |
| Flags assessments, video_recording, core_reports, badge_progress, evaluations, snapshots (as feature toggles) | grep of feature_flags.<name> and feature_enabled('<name>') in app/frontend/app, app/, lib/; upstream frontend | Listed in AVAILABLE and ENABLED (lib/feature_flags.rb:12-21,117-125) and in lib/system_feature_registry.rb, but no code reads them. Turning them off changes nothing. Only 'goals' (app/models/user_badge.rb:91) and 'lessons' (controllers/user/lessons.js:24, authenticated-view.js:1200, organization.hbs:25) are read. |
| Snapshots: 'Board snapshots / Save board states' (flag list and communicator story 'save board snapshots to... | read app/models/log_snapshot.rb:22-29, snapshots_controller.rb, frontend snapshot callers | Snapshots are saved report filters (name, start, end, device_id, location_id), not board states. No board-layout restore feature exists under this name. |
| Quick Assessments: 'Communicator or premium supporter' | controllers/user/logs.js:124; services/app-state.js:3026-3040 | Partly refuted. check_for_currently_premium is called without allow_premium_supporter, so only the communicator's currently_premium counts. The goals and goal-page entry points (user/goals.js:92, user/goal.js:130) have no premium check at all. |
| Unlimited Evaluations ('unlimited') | grep for eval_limit, evals_remaining, free_eval, eval_count, max_evals, unlimited eval | No per-eval count or limit exists, so 'unlimited' reflects no mechanism. Access is check_for_currently_premium(...,'eval',false,true) (user/index.js:1505). Org 'eval accounts' licenses are a separate subscription concept. |
| Section 8: 'Goals, badges, stats, logs: Template gates on currently_premium' | grep of currently_premium in templates/user/{stats,goals,goal,logs,log,badges}.hbs and api controllers | Partly confirmed. stats.hbs:51, goals.hbs:3 and badges.hbs:3 gate on currently_premium. logs.hbs:3 gates on currently_premium_or_premium_supporter, not currently_premium. user/goal.hbs, goals/goal.hbs and user/log.hbs have no premium gate. No server-side premium check in logs, goals, badges, snapshots or users#daily_stats. |
| Video Recording: 'Communicator only' | components/video-recorder.js:37-39 and its call sites | The gate is the currently_premium of the target user passed in. message-unit.hbs:75 passes sessionUser, so a premium supporter can record there. The rule is not communicator-only. |
| Goals: comment on goals (story supporter 'comment on goals') | grep of comment in frontend goal controllers, templates and models; goals_controller.rb:83-89; user_goal.rb:478 | Backend accepts goal comments. At HEAD no UI shows or sends them (models/goal.js:41 attr only), so this is backend-only. |
| Evaluations (premium 'Unlimited Evaluations', FEATURES.md lines 56, 104, 159, 300, 351) | caseload.hbs run_eval; components/dashboard/authenticated-view.js:1587-1599; routes/eval/quick.js; the evaluations flag in lib/feature_flags.rb | The new /eval Quick Screen is NOT the premium Evaluations implementation. It is gated by quick_screen_eval with no premium check. Premium Evaluations is still the upstream obf/eval flow: 'Full Eval'/'Run Evaluation' -> appState.check_for_currently_premium(user,'eval') -> set_speak_mode_user(...,'obf/eval') at authenticated-view.js:1597-1598, driven by utils/eval.js (present upstream) and flag 'evaluations' (ENABLE... |
| Org Manager: manage the org subscription so that we stay within our plan | templates/organization/subscription.hbs, organization.hbs nav, app/models/organization.rb:46, organizations_controller.rb:850-857 | Partly supported: manage_subscription is granted only to admin-org (LingoLinq staff) managers (organization.rb:46), so ordinary org managers see a read-only billing page (ORG-11), and no in-app link leads to it. |
| Org Roles table: Assistant = View/edit org settings | app/models/organization.rb:43, organizations_controller.rb update/users/admin_reports, units permissions | The role exists (org_manager link without full_manager, organization.rb:429-432), but its permissions are broader than settings: edit covers the roster, reports, rooms, start codes and lessons (organization.rb:43). |
| S3 line 72: "Users can have flags enabled via user.settings['feature_flags'] or org-wide canary" | lib/feature_flags.rb:188-190; lib/system_feature_settings.rb:42-48, 60-67 | A per-user flag counts only if it is in the beta list. Canary is a per-user `settings['feature_flags']['canary']` flag, not org-wide. The org-level mechanism is `org.settings['enabled_features']`. |
| S3 "Disabled by default: shallow_clones: Used in start-codes modal" | components/start-codes.hbs:170; app/models/user.rb:2334 | The start-codes "Apply shallow clones" checkbox is not tied to the flag. The flag is read only by the backend starred-board refs (user.rb:2334). |
| S3 enabled flags that have no effect: assessments, custom_sidebar, snapshots, video_recording, app_connections, translation, modeling, edit_before_copying, core_reports, lessonpix, audio_recordings... | grep of `feature_flags.<name>`, `feature_flags['<name>']`, `feature_enabled_for?('<name>')` in app/, lib/, app/frontend/app/ | Never read, so turning any of them off changes nothing. The features themselves ship ungated or gated by other checks (see the flag table). |
| S2 "Speak Mode > 15 min: Communicator only" | app/frontend/app/services/app-state.js:3652-3673 | The 15-minute limit applies to limited paid supervisors and modeling-only users speaking for themselves, supporters working with expired communicators, and expired communicators. It is enforced only in the client (row SET-34). |

### FEATURES.md section 5 "Potentially Unused": still reachable by a user?

| item | reachable | evidence |
|---|---|---|
| `canvas_render` | no | The flag is read nowhere; the only other reference is the registry, lib/system_feature_registry.rb:6. The related preference preferences.device.canvas_render is read at board/index.hbs:160 and app-state.js:5100, but grep of app/frontend/app finds no preferences UI that sets it. It is only in the allowed param list at user.rb:2438. |
| `shallow_clones` | flag: no; separate start-code option: yes | The flag is off by default and is only read by the backend (user.rb:2334, :2348). The 'Apply shallow clones' checkbox in components/start-codes.hbs:170 is not tied to the flag. It is reachable from org settings (organization/settings.hbs:181 → controllers/organization/settings.js:166) and from supervision-settings.js:221. |
| `app_store_monthly_purchases` | no in the app-store build; not relevant on web | The only read is utils/subscription.js:285-291 (app_pricing_override_no_monthly = product_types && !flag). Off by default, this hides the monthly options in pricing.hbs:40 and subscription-form.hbs:35/79/93 when app-store product types are present. Web/Stripe pricing is not affected. |
| `lessonpix` | yes, but the flag itself is dead | The flag is never read. LessonPix is reachable through 'Connect To LessonPix' in user/edit.hbs:454, which is not flag-gated. The image-library picker offers it in button-settings.js:638 (integration or premium symbols) and :659 (lessonpix_required upsell), and create-board-new.js:594 lists it. Backend: board.rb:2904. |
| `edit_before_copying` | no (dead flag, no dedicated UI) | The flag is never read in the frontend or backend; the only reference is the registry, lib/system_feature_registry.rb:15. copy-board's 'tweakBoard' action (copy-board.js:303) is the normal copy action, not an edit-before-copy step. |
| `profiles` | yes | Flag is on by default. It gates the org settings Profiles card (organization/settings.hbs:210), the org dashboard RecentProfiles (organization/index.hbs:226) and the user page's 'Latest Communication Profile' (user/index.hbs:195, which also needs permissions.supervise). Backend: lib/json_api/unit.rb:56, which also needs premium_org. |
| `other_menu` | yes | Flag is on by default. It shows 'Other Actions' in the board menu (application.hbs:593 and the mobile menu at :695) and hides the top-level 'Download Board' item (application.hbs:562 {{#unless}}). |

The matching CSV rows carry the flag facts in `feature_flag` (and a `flag never read` tag where it applies): BRD-05 (canvas_render), SET-27 (shallow_clones), SET-21 (app_store purchases), BRD-13 and ORG-33 (lessonpix), BRD-10 (edit_before_copying), ORG-22 and TEAM-23 (profiles), SPK-22 (other_menu).

### User stories (FEATURES.md section 11) mapped to CSV rows

"no matching row" means no CSV row implements the story as written. The note says what exists instead.

| role | story ("I want to ...") | CSV rows | note |
|---|---|---|---|
| Communicator | use Speak Mode to express myself | SPK-01, SPK-03 |  |
| Communicator | browse and navigate boards (grid, levels, swipe) | BRD-04, SPK-16, BRD-12, SPK-15 |  |
| Communicator | activate buttons via click, dwell, scanning, head-tracking | SPK-08, SPK-10, SPK-09, SPK-11 |  |
| Communicator | build phrases in the utterance box | SPK-03, SPK-04 |  |
| Communicator | text-to-speech output | SPK-06 |  |
| Communicator | premium voices | SPK-07 | native app only |
| Communicator | search for buttons across boards | BRD-29 |  |
| Communicator | Speak Mode longer than 15 minutes when premium | SET-34 | limit applies to more than communicators |
| Communicator | auto-jump to Speak Mode | SET-33 |  |
| Communicator | create and edit boards | BRD-09, BRD-11 |  |
| Communicator | multiple levels per board | BRD-12 |  |
| Communicator | symbol libraries (OpenSymbols, PCS, SymbolStix, LessonPix) | BRD-13 |  |
| Communicator | import and export boards (OBF, OBL) | BRD-18, BRD-20 | OBL is a log format, not a board format |
| Communicator | save board snapshots to restore layouts | **no matching row** | snapshots are saved report filters (DATA-16); nearest board feature is edit history and rollback (BRD-21) |
| Communicator | quick access to emergency boards | BRD-06 |  |
| Communicator | add buttons from multiple sources at once | **no matching row** | no bulk multi-source add; Button Stash (BRD-30) collects buttons and places them one at a time |
| Communicator | add supervisors | TEAM-05 |  |
| Communicator | modeling ideas synced to my account | TEAM-18 |  |
| Communicator | remote modeling sessions | TEAM-17 | needs an external websocket server |
| Communicator | create and track goals | DATA-20, DATA-21 |  |
| Communicator | badge progress and notifications | DATA-23, DATA-24 |  |
| Communicator | quick assessments | DATA-05 |  |
| Communicator | unlimited evaluations | DATA-06, NEW-01 | no evaluation count limit exists to be unlimited |
| Communicator | contextual button suggestions | TEAM-28 | not AI |
| Communicator | usage reports and stats | DATA-12, DATA-13 |  |
| Communicator | record video sessions | BRD-17 | video notes and messages only; the "record session" action is a stub (see section 8 table) |
| Communicator | view logs and team messaging | DATA-01, DATA-04, TEAM-19 |  |
| Communicator | share utterances externally | TEAM-20 |  |
| Communicator | third-party integrations (webhooks, tools) | ORG-33, ORG-34 |  |
| Communicator | manage app connections and integrations | ORG-33 |  |
| Communicator | scanning mode | SPK-09 |  |
| Communicator | head-tracking (iOS) | SPK-11 | webcam head tracking works on any platform |
| Communicator | dwell-to-select | SPK-10 |  |
| Communicator | native keyboard | SPK-14 | installed app only |
| Communicator | inflections overlay | SPK-12 |  |
| Communicator | skin tone options for symbols | SPK-19, BRD-13 |  |
| Communicator | enable all buttons | SPK-17 |  |
| Communicator | focus word highlighting | SPK-18 |  |
| Communicator | AI board generation | NEW-09 |  |
| Communicator | view and manage my subscription | SET-19 |  |
| Supporter | view my supervisee's boards | TEAM-12 |  |
| Supporter | model for my supervisee | TEAM-12, SPK-23 |  |
| Supporter | edit permission on a supervisee's boards | TEAM-05, BRD-11 |  |
| Supporter | modeling-only links for some supervisees | TEAM-10 |  |
| Supporter | modeling ideas for premium supervisees | TEAM-18 |  |
| Supporter | remote modeling sessions | TEAM-17 |  |
| Supporter | add and manage supervisors for a supervisee | TEAM-05, TEAM-06, TEAM-08 |  |
| Supporter | view logs for premium supervisees | DATA-01, DATA-02 |  |
| Supporter | view usage reports and stats for premium supervisees | DATA-12, DATA-13 |  |
| Supporter | team messaging for premium supervisees | TEAM-19, DATA-04 |  |
| Supporter | create and track goals for supervisees | DATA-20, DATA-21 |  |
| Supporter | comment on goals | **no matching row** | backend accepts goal comments but no UI shows or sends them (see DATA-21 status_signals) |
| Supporter | run quick assessments for supervisees | DATA-05 |  |
| Supporter | unlimited evaluations when premium | DATA-06, NEW-01, NEW-03, NEW-04 |  |
| Supporter | create and edit boards for supervisees | BRD-09, BRD-10, BRD-11 |  |
| Supporter | import/export boards for supervisees | BRD-18, BRD-20 |  |
| Supporter | symbol libraries including LessonPix | BRD-13, ORG-33 |  |
| Supporter | preview third-party integrations for premium supervisees | ORG-33 |  |
| Supporter | switch between supervisees | TEAM-14 |  |
| Supporter | see the communicators tab | TEAM-15, TEAM-16 | ASSUMED: the "communicators tab" is now the Caseload page and dashboard panel |
| Supporter | premium supporter access | SET-19 |  |
| Modeling-only | model for my supervisees | TEAM-12, TEAM-10 |  |
| Modeling-only | modeling ideas when supervising premium communicators | TEAM-18 |  |
| Modeling-only | download boards to practice offline | SPK-29, BRD-20 |  |
| Modeling-only | understand I cannot edit, view reports or use premium voices | TEAM-11 | goals are not blocked in the backend (see unsupported claims) |
| Modeling-only | understand I use only built-in voices | TEAM-11, SPK-07 |  |
| Valet | view boards | SPK-25 |  |
| Valet | model | SPK-25 |  |
| Valet | cannot edit, supervise or access cloud features | SPK-25 |  |
| Org manager | manage org users and licenses | ORG-04, ORG-05, ORG-06 |  |
| Org manager | manage the org subscription | ORG-11 | read-only for ordinary managers; only admin-org managers can change it; page is orphaned |
| Org manager | manage extras and add-ons | ORG-05 | ASSUMED: add_extras management action |
| Org manager | view org-level reports | ORG-07 |  |
| Org manager | add and remove users | ORG-05 |  |
| Org manager | manage organization units | ORG-14 |  |
| Org manager | assign users to units | ORG-14 |  |
| Org manager | sponsor users | ORG-05 |  |
| Org manager | create and manage lessons | ORG-13, DATA-30 |  |
| Org manager | manage rooms | ORG-14 |  |
| Org manager | assign lessons to rooms or users | DATA-30, ORG-13 |  |
| Org manager | use profiles | ORG-22, TEAM-23 |  |
| Org manager | manage org settings (branding, defaults) | ORG-17, ORG-19 |  |
| Org assistant | view org settings | ORG-17 |  |
| Org assistant | edit org settings when permitted | ORG-17 | assistant power is broader than settings (see roles table) |
| Org assistant | view org users | ORG-04 |  |
| Org supervisor | view the org | ORG-03 |  |
| Org supervisor | supervise org users | ORG-14, TEAM-12 | supervision comes from a room link, not org membership alone |

87 stories; 84 map to at least one row; 3 have no matching row.

### Features in code that FEATURES.md does not mention

205 of 291 rows appear in neither the item map nor the user-story map above (86 rows do). Most were added after February 2025 (tiered clinical evaluation, AI generation and prediction, EU AI Act controls, COPPA and GDPR consent flows, System Settings, beta feedback, telemetry, the new dashboard and board view). Others are upstream capabilities the document never listed (SAML SSO, OAuth for third-party apps, NFC tags, Button Stash, word data tools, background jobs and mail), plus core flows such as login and logout that FEATURES.md takes for granted.

- **Setup, auth, account & purchasing** (43): SET-01 Password login (web SPA) issuing a device token; SET-02 Post-login device step (trusted vs shared device / long-l...; SET-03 Session token check / restore (incl. SAML tmp-token hando...; SET-04 Two-factor authentication (TOTP): enable/confirm/disable/...; SET-05 Logout (client-side session clear); SET-06 Forgot password / forgot username (email help); SET-07 Confirm registration (email link) and resend; SET-08 Account registration (role, country, birth month/year, te...; SET-09 COPPA under-13 parental consent (signup email, grant/decl...; SET-10 SMS recipient consent opt-in page; SET-11 AI data-sharing and EU AI Act Art.50 disclosure documents; SET-12 Google SSO sign-in, account linking and Google signup; SET-13 SAML org SSO login, IdP logout and linking an account to...; SET-14 OAuth2 authorization for third-party apps (developer keys...; SET-15 Service status, heartbeat and health probes; SET-16 Profile edit (name, email, cell, password change, avatar,...; SET-17 My Account hub (/:user/account) and user shell route; SET-18 Device management (list, rename, remove/hide devices); SET-20 Stripe webhook subscription/extras events; SET-21 In-app store purchases (iOS/Android receipt verification); SET-22 Purchase premium as a gift; SET-23 Bulk license purchase page (/purchase/:id); SET-24 Redeem gift code; SET-25 Admin gift/code management (list, create, deactivate); SET-26 Start code landing page and signup with a start/activatio...; SET-27 Generate/delete start codes (start-codes modal) incl. 'Ap...; SET-28 Setup wizard (/setup) - retired, redirects home; SET-29 Standalone home-board picker (/board-picker), self or sup...; SET-30 Beta program welcome and beta agreement acceptance; SET-31 Intro modal deep link (/intro); SET-32 Landing page / app entry (logged-out landing, logged-in d...; SET-36 Terms of service and privacy policy pages; SET-37 Jobs page; SET-38 Static marketing pages (about, features, partners, compar...; SET-39 Pricing page; SET-40 Help center, FAQ and contact forms; SET-41 Download / install page (store links, Windows, PWA add-to...; SET-42 Limited (no external links) mode; SET-43 Extras tab (tools and resources grid) on user dashboard; SET-44 Goal status quick-update links from email; SET-45 Video embed player page for video buttons; SET-46 Board/user deep-link pages (SEO meta, embed header, old-p...; SET-47 Ember SPA shell served for deep links owned by other areas
- **Boards & content** (27): BRD-01 Authenticated dashboard home (/:user/home and /bento); BRD-02 Modern-dashboard routes (empty stubs); BRD-03 My Boards page (owned, starred, shared, tag folders, layo...; BRD-05 Classic board view (board-alt) and hidden canvas render mode; BRD-07 Board search (public by locale, plus private search of ow...; BRD-08 Find a home board (starter board finder); BRD-14 Button image save/upload/webcam photo; BRD-15 Swap images across a board set to another symbol library; BRD-16 Button sounds (record, upload, zip import, sound library); BRD-19 Import board from pasted HTML / other-platform JSON bundle; BRD-21 Board edit history and rollback / restore deleted board; BRD-22 Rename board; BRD-23 Board privacy (public/private/unlisted across the set); BRD-24 Translate a board set / trim board languages; BRD-25 Star, tag into folders, and remove/unlink boards from a u...; BRD-26 Delete board (and undelete by re-saving the key); BRD-27 Board sharing responses and viewing copies of a board; BRD-28 Board popularity stats (uses, stars, forks); BRD-30 Button Stash (collect buttons from several boards, place...; BRD-31 NFC tags linked to buttons; BRD-32 Word data / inflections review tool (admin); BRD-33 Language rules for inflections/contractions; BRD-34 Reachable core words for an utterance reply; BRD-35 Word part-of-speech lookup (word data modal, auto button...; BRD-36 External resources and image proxy (button suggestions, b...; BRD-37 App search for app-launch buttons; BRD-39 Focus words search (proxy to workshop.openaac.org)
- **Speak mode, access & device** (12): SPK-05 Speak menu (new_speak_menu): punctuation, repeat / louder...; SPK-13 Automatic inflections (auto-adjust button word forms to s...; SPK-20 Custom sidebar: add/remove/reorder/hide sidebar boards an...; SPK-21 Geo sidebar: highlight sidebar boards by location/time (g...; SPK-22 Board header 'Other Actions' menu (other_menu) on legacy...; SPK-26 Preferences page: load/save all General and Device prefer...; SPK-27 Speak-mode behaviour prefs (on vocalize clear/home, self-...; SPK-28 Per-device preference profiles (Device Preferences per de...; SPK-30 Background board prefetch during sync (phased: home, star...; SPK-31 Install to home screen / standalone detection (Getting St...; SPK-32 Public 'Try a Demo' speak mode on static demo boards (bui...; SPK-33 /speech static AAC symbol-board mockup page
- **Users, supervision & team** (16): TEAM-02 Admin/org user lookup search (users#index); TEAM-03 Delete my account (scheduled hard delete after 36h); TEAM-04 List a user's supervisors and supervisees; TEAM-07 Guardian approves/denies supervision via emailed consent...; TEAM-09 View or revoke a consent-flow supervisor relationship (AP...; TEAM-13 Supervise-only supporter sets a communicator's home board; TEAM-21 Shared utterance page and recipient reply (/u/:code -> /u...; TEAM-22 Personal contacts and 'message me' link for two-way messa...; TEAM-24 User edit history (admin support); TEAM-25 Rename a user (support action); TEAM-26 Daily-use activity log (self; admin read audited); TEAM-27 Word map (vocabulary location map) API; TEAM-29 Message bank phrase suggestions for batch voice recording; TEAM-30 Trigger a button's third-party integration action; TEAM-31 Evaluation account transfer and reset; TEAM-33 External AAC device (sidekick) declaration on profile
- **Logs, reports, goals & lessons** (18): DATA-03 Usage log push from device (session logging of speak-mode...; DATA-07 OBL log file download (single log, all logs, anonymized ....; DATA-08 LAM report view of a session log (nonce link, no login); DATA-09 Log import (OBL/LAM file upload) and manual log session e...; DATA-10 Logging access code: verify code and unlock logs beyond t...; DATA-11 Clear all logs (flush a communicator's logs after typing...; DATA-15 Enable usage logging / geolocation logging from Reports (...; DATA-16 Report snapshots (saved named report filters: date range,...; DATA-17 Public anonymized trends page (aggregate word/device/usag...; DATA-18 Trends slice for research integrations (developer key, 5-...; DATA-19 Anonymous research log bundle (monthly zip of opted-in us...; DATA-22 Public goal library and template sequences (browse templa...; DATA-25 Goal auto-advance (scheduled rollover of template or sequ...; DATA-26 Periodic log summary email to communicators and superviso...; DATA-27 User recordings library (recorded button sounds: play, tr...; DATA-28 My trainings list (assigned lessons, completion status, r...; DATA-29 Lesson launch page by share link and completion rating; DATA-31 Lesson recent list and lesson delete (broken stubs)
- **LingoLinq-new: AI, clinical eval, multilingual, beta** (32): NEW-02 Quick Eval: build starter board from the recommendation; NEW-05 Eval protocol catalog API (static and org-scoped protocol...; NEW-06 Server-side Quick Screen recommendation API (plus legacy...; NEW-07 Saved tiered-eval view and IEP-ready PDF export (with goa...; NEW-08 Full Evaluation SLP report card and fill-in workbook (lay...; NEW-10 AI focus-word generation (Focus Words modal); NEW-11 AI next-word prediction in speak mode (prediction bar); NEW-12 Word suggestions API (token-based AI next-word endpoint); NEW-13 Personal learned prediction entries (server sync of the u...; NEW-14 AI-seeded offline prediction library and smart phrases (b...; NEW-15 AI provider client: Claude on AWS Bedrock only, no direct...; NEW-16 Runtime model allowlist (refuses retention-bearing or unv...; NEW-17 Bedrock account-binding check (expected AWS account guard...; NEW-18 PII scrubber: pseudonymize/redact prompts before AI egres...; NEW-19 AI call audit log (AiApiLog), IP redaction after 90 days,...; NEW-20 COPPA under-13 hard gate on all AI calls (pending parenta...; NEW-21 EU under-16 AI block and parental-consent request / one-c...; NEW-22 EU jurisdiction determination (drives Art. 50 scope and t...; NEW-23 EU AI Act Art. 50(1) first-AI-use disclosure modal, ackno...; NEW-24 EU AI Act Art. 50(2) signed AI-generated output marker (b...; NEW-25 AI consent preferences: master 'Allow AI features' plus p...; NEW-26 Organization-wide AI opt-out (disable_ai_features); NEW-27 Beta feedback form (public page and in-app modal); NEW-28 Beta feedback screen recording (consented capture, direct...; NEW-29 Beta feedback admin triage (list, filter, search, hide/un...; NEW-30 Product telemetry capture (route visits, board activation...; NEW-31 Global telemetry dashboard API (site admin); NEW-32 Spanish library boards copied at signup for es-locale users; NEW-33 Library board translation pipeline (store dest-locale tra...; NEW-34 English-first / bilingual board authoring in Create Board; NEW-35 Interface language picker (navbar locale modal; es/en UI...; NEW-36 Curated vocabulary library seeding (Quick Core descriptio...
- **Org, district & system admin; integrations** (19): ORG-02 /admin shortcut redirects to the user's first managed org; ORG-08 Site-admin global reports: new users, subscriptions, prem...; ORG-09 Set communicator implementation status (for example Waiti...; ORG-10 Org telemetry dashboard page; ORG-12 Site-admin extras page: blocked emails and cells, block e...; ORG-16 Message room members (communicators, supervisors or all),...; ORG-18 External authentication (SAML) for an org and linking an...; ORG-20 Manage org start codes: create with overrides, delete; ORG-21 Start code lookup at registration and in the admin lookup...; ORG-23 Org data policy: logging, geo logging, reports, publishin...; ORG-24 Database explorer: allowlisted table schema and paginated...; ORG-25 System Settings: email template list, editor, per-org ove...; ORG-26 System Settings: site-wide app defaults (branding fields); ORG-27 System Settings: feature toggles per scope (site default,...; ORG-28 Resque job web UI at /jobby; ORG-29 Background job progress polling; ORG-30 Content-Security-Policy violation report ingestion; ORG-31 AWS SNS callbacks: subscription confirm, media transcodin...; ORG-32 Per-host domain settings bootstrap (branding and consent-...
- **Background jobs, mail & platform services** (38): SYS-01 Scheduler dispatch (hourly and daily jobs run by the Clou...; SYS-02 Resque worker pool and queues (priority/default/slow/when...; SYS-03 Transactional email delivery pipeline (SES, priority queu...; SYS-04 Admin-edited system email templates applied at send time; SYS-05 Account emails: welcome/confirm registration, new-registr...; SYS-06 Consent emails: COPPA parental consent request/confirmati...; SYS-07 Supervisor/team notification emails: supervisor access re...; SYS-08 Onboarding 'Checking In' usage reminder email (5-10 days...; SYS-09 Subscription and billing emails (purchase confirmed, expi...; SYS-10 Admin inbox emails: Contact Us message, beta feedback, us...; SYS-11 Inactive-account deletion warnings and automatic deletion; SYS-12 Org data-retention policy enforcement (purge sponsored us...; SYS-13 Orphan/leftover retention sweep with retention_flush audi...; SYS-14 Version history and deleted-board retention (limits on Pa...; SYS-15 Expire stale supervisor access requests; SYS-16 COPPA offboarding sweep: export the account, email the pa...; SYS-17 License seat expiry releases the user and starts family C...; SYS-18 Audio/video transcoding (AWS MediaConvert) of recordings,...; SYS-19 S3 media storage: presigned uploads, signed download URLs...; SYS-20 Deferred RemoteAction queue (weekly stats refresh, badge...; SYS-21 Weekly stats rollups (WeeklyStatsSummary) that feed repor...; SYS-22 Log location clustering (geo and IP clusters for reports); SYS-23 HubSpot lead tracking for new supporter accounts (Externa...; SYS-24 Outbound webhooks and remote log push (integrations and '...; SYS-25 In-app notification feed fan-out (messages, home board ch...; SYS-26 Duplicate log session merging (hourly); SYS-27 Board downstream processing (button set rebuild for searc...; SYS-28 Utterance share preview image (SentencePic via a hardened...; SYS-29 SVG sanitization of uploaded or data-URI button images; SYS-30 SSRF-guarded outbound HTTP (SafeHttp) for image-by-URL, i...; SYS-31 AuditEvent immutable audit trail (consent, deletion, pass...; SYS-32 Audited operator console (bin/audit_console, ConsoleGuard...; SYS-33 Production log PII scrubbing (PiiScrubbingFormatter); SYS-34 Server-side at-rest field encryption (secure_serialize) o...; SYS-35 LingoLinq::Jurisdiction primitive (EU country detection f...; SYS-36 Compliance kernel (segment, jurisdiction, digital-consent...; SYS-37 Art.50(2) AI-output marking audit (operator rake task); SYS-38 Route hygiene: routes in the Excluded routes table (dead...

## Excluded routes

86 routes are not mapped to a feature row. Each has a reason below. "Dead route" means a Rails resources default (or explicit route) whose action is defined nowhere in the controller, its parents, or `app/controllers/concerns/`, and that has no implicit-render template (there is no `app/views/api/`). From static reading a request to it should end in `AbstractController::ActionNotFound`; this was not executed. Row SYS-38 asks for a test that every excluded route answers with a 4xx.

| route key | kind | controller#action | reason |
|---|---|---|---|
| GET `/api/v1/gifts/new` `api/gifts#new` | Rails | `api/gifts#new` | Rails resources :gifts default GET /new; no def new in app/controllers/api/gifts_controller.rb, ApplicationController or app/controllers/concerns: dead route |
| GET `/api/v1/gifts/:id/edit` `api/gifts#edit` | Rails | `api/gifts#edit` | Rails resources :gifts default GET /:id/edit; no def edit anywhere in the controller chain: dead route |
| PATCH `/api/v1/gifts/:id` `api/gifts#update` | Rails | `api/gifts#update` | Rails resources :gifts PATCH update; no def update in Api::GiftsController or concerns: dead route |
| PUT `/api/v1/gifts/:id` `api/gifts#update` | Rails | `api/gifts#update` | Rails resources :gifts PUT update; no def update: dead route |
| jasmine:/jasmine | Ember | | test-harness path only (router.js:8 disables pushState for /jasmine); no route, controller or template in app/frontend/app |
| user.device:/device | Ember | | dead Ember route: no routes/user/device.js, controllers/user/device.js or templates/user/device.hbs (renders an empty outlet); only referenced in a route-name list at app/frontend/app/controllers/application.js:2284; also absent upstream. Device management actually lives in the device-settings modal |
| GET `/api/v1/users/cache` `api/boards#cache` | Rails | `api/boards#cache` | GET /api/v1/users/cache -> boards#cache (boards_controller.rb:8-11) is a stub that returns a constant {user:{id:'cache'}}. The frontend deliberately avoids it (routes/user.js:15-20). No user feature. |
| GET `/api/v1/boards/new` `api/boards#new` | Rails | `api/boards#new` | Rails resources default GET /boards/new: no def new in boards_controller.rb and none in concerns (remote_uploader.rb, concerns/api/*). Dead route. |
| GET `/api/v1/boards/:id/edit` `api/boards#edit` | Rails | `api/boards#edit` | Rails resources default GET /boards/:id/edit: no def edit in the controller or concerns. Dead route. |
| GET `/api/v1/tags/new` `api/tags#new` | Rails | `api/tags#new` | Rails resources default GET /tags/new: no def new in tags_controller.rb. Dead route. |
| GET `/api/v1/tags/:id/edit` `api/tags#edit` | Rails | `api/tags#edit` | Rails resources default GET /tags/:id/edit: no def edit. Dead route. |
| POST `/api/v1/words` `api/words#create` | Rails | `api/words#create` | POST /words (create): no def create in words_controller.rb or concerns. Dead route. |
| GET `/api/v1/words/new` `api/words#new` | Rails | `api/words#new` | GET /words/new: no def new. Dead route. |
| GET `/api/v1/words/:id/edit` `api/words#edit` | Rails | `api/words#edit` | GET /words/:id/edit: no def edit. Dead route. |
| GET `/api/v1/words/:id` `api/words#show` | Rails | `api/words#show` | GET /words/:id (show): no def show in words_controller.rb. Dead route. |
| DELETE `/api/v1/words/:id` `api/words#destroy` | Rails | `api/words#destroy` | DELETE /words/:id: no def destroy. Dead route. |
| GET `/api/v1/images/batch` `api/images#batch` | Rails | `api/images#batch` | GET /images/batch: no def batch in images_controller.rb or concerns. The upstream router also declares it with no def (upstream routes.rb:232). Dead route. |
| GET `/api/v1/images` `api/images#index` | Rails | `api/images#index` | GET /images (index): no def index. Dead route. |
| GET `/api/v1/images/new` `api/images#new` | Rails | `api/images#new` | GET /images/new: no def new. Dead route. |
| GET `/api/v1/images/:id/edit` `api/images#edit` | Rails | `api/images#edit` | GET /images/:id/edit: no def edit. Dead route. |
| DELETE `/api/v1/images/:id` `api/images#destroy` | Rails | `api/images#destroy` | DELETE /images/:id: no def destroy in images_controller.rb or RemoteUploader. Dead route. |
| GET `/api/v1/sounds/new` `api/sounds#new` | Rails | `api/sounds#new` | GET /sounds/new: no def new. Dead route. |
| GET `/api/v1/sounds/:id/edit` `api/sounds#edit` | Rails | `api/sounds#edit` | GET /sounds/:id/edit: no def edit. Dead route. |
| GET `/api/v1/videos` `api/videos#index` | Rails | `api/videos#index` | GET /videos (index): no def index in videos_controller.rb. Dead route. |
| GET `/api/v1/videos/new` `api/videos#new` | Rails | `api/videos#new` | GET /videos/new: no def new. Dead route. |
| GET `/api/v1/videos/:id/edit` `api/videos#edit` | Rails | `api/videos#edit` | GET /videos/:id/edit: no def edit. Dead route. |
| DELETE `/api/v1/videos/:id` `api/videos#destroy` | Rails | `api/videos#destroy` | DELETE /videos/:id: no def destroy. Dead route. |
| GET `/api/v1/users/new` `api/users#new` | Rails | `api/users#new` | Rails resources default GET /users/new; no def new in app/controllers/api/users_controller.rb or ApplicationController/concerns: dead route |
| GET `/api/v1/users/:id/edit` `api/users#edit` | Rails | `api/users#edit` | Rails resources default GET /users/:id/edit; no def edit: dead route |
| DELETE `/api/v1/users/:id` `api/users#destroy` | Rails | `api/users#destroy` | Rails resources default DELETE /users/:id; no def destroy (deletion is POST flush/user): dead route |
| POST `/api/v1/profiles` `api/profiles#create` | Rails | `api/profiles#create` | resources :profiles default POST; no def create in app/controllers/api/profiles_controller.rb: dead route |
| GET `/api/v1/profiles/new` `api/profiles#new` | Rails | `api/profiles#new` | resources :profiles default GET new; no def new: dead route |
| GET `/api/v1/profiles/:id/edit` `api/profiles#edit` | Rails | `api/profiles#edit` | resources :profiles default GET edit; no def edit: dead route |
| PATCH `/api/v1/profiles/:id` `api/profiles#update` | Rails | `api/profiles#update` | resources :profiles default PATCH; no def update: dead route |
| PUT `/api/v1/profiles/:id` `api/profiles#update` | Rails | `api/profiles#update` | resources :profiles default PUT; no def update: dead route |
| DELETE `/api/v1/profiles/:id` `api/profiles#destroy` | Rails | `api/profiles#destroy` | resources :profiles default DELETE; no def destroy: dead route |
| GET `/api/v1/utterances` `api/utterances#index` | Rails | `api/utterances#index` | resources :utterances default GET index; no def index in app/controllers/api/utterances_controller.rb: dead route |
| GET `/api/v1/utterances/new` `api/utterances#new` | Rails | `api/utterances#new` | resources :utterances default GET new; no def new: dead route |
| GET `/api/v1/utterances/:id/edit` `api/utterances#edit` | Rails | `api/utterances#edit` | resources :utterances default GET edit; no def edit: dead route |
| DELETE `/api/v1/utterances/:id` `api/utterances#destroy` | Rails | `api/utterances#destroy` | resources :utterances default DELETE; no def destroy: dead route |
| modern-dashboard.supervisors:/supervisors | Ember | | Vestigial: router.js:43 still declares it but there is no routes/modern-dashboard*, no parent template, and templates/modern-dashboard/supervisors.hbs is a single comment line; commit a968c422e 'Remove modern-dashboard component and routes'. Renders a blank page. Live replacement is dashboard-sup... |
| GET `/api/v1/goals/new` `api/goals#new` | Rails | `api/goals#new` | Rails resources default GET /goals/new; no def new in goals_controller.rb, ApplicationController or concerns: dead route |
| GET `/api/v1/goals/:id/edit` `api/goals#edit` | Rails | `api/goals#edit` | Rails resources default GET /goals/:id/edit; no def edit anywhere: dead route |
| POST `/api/v1/badges` `api/badges#create` | Rails | `api/badges#create` | POST /badges; no def create in badges_controller.rb. Frontend createRecord('badge') calls (controllers/user/goal.js:62,187; goals/goal.js:52,183) are unsaved preview records: dead route |
| GET `/api/v1/badges/new` `api/badges#new` | Rails | `api/badges#new` | GET /badges/new; no def new: dead route |
| GET `/api/v1/badges/:id/edit` `api/badges#edit` | Rails | `api/badges#edit` | GET /badges/:id/edit; no def edit: dead route |
| DELETE `/api/v1/badges/:id` `api/badges#destroy` | Rails | `api/badges#destroy` | DELETE /badges/:id; no def destroy. UI hides badges via update disabled=true (controllers/user/badges.js:60-63): dead route |
| GET `/api/v1/snapshots/new` `api/snapshots#new` | Rails | `api/snapshots#new` | GET /snapshots/new; no def new: dead route |
| GET `/api/v1/snapshots/:id/edit` `api/snapshots#edit` | Rails | `api/snapshots#edit` | GET /snapshots/:id/edit; no def edit: dead route |
| GET `/api/v1/lessons/new` `api/lessons#new` | Rails | `api/lessons#new` | GET /lessons/new; no def new: dead route |
| GET `/api/v1/lessons/:id/edit` `api/lessons#edit` | Rails | `api/lessons#edit` | GET /lessons/:id/edit; no def edit: dead route |
| GET `/api/v1/logs/new` `api/logs#new` | Rails | `api/logs#new` | GET /logs/new; no def new: dead route |
| GET `/api/v1/logs/:id/edit` `api/logs#edit` | Rails | `api/logs#edit` | GET /logs/:id/edit; no def edit: dead route |
| DELETE `/api/v1/logs/:id` `api/logs#destroy` | Rails | `api/logs#destroy` | DELETE /logs/:id; no def destroy in logs_controller.rb. Log deletion goes through users#flush_logs: dead route |
| GET `/api/v1/units/new` `api/units#new` | Rails | `api/units#new` | GET /api/v1/units/new: Rails resources default; no def new in units_controller.rb and no concern defines it (app/controllers/concerns has only remote_uploader.rb and api/): dead route |
| GET `/api/v1/units/:id/edit` `api/units#edit` | Rails | `api/units#edit` | GET /api/v1/units/:id/edit: no def edit in units_controller.rb or concerns: dead route |
| GET `/api/v1/organizations/new` `api/organizations#new` | Rails | `api/organizations#new` | GET /api/v1/organizations/new: no def new in organizations_controller.rb or concerns: dead route |
| GET `/api/v1/organizations/:id/edit` `api/organizations#edit` | Rails | `api/organizations#edit` | GET /api/v1/organizations/:id/edit: no def edit: dead route |
| GET `/api/v1/webhooks/new` `api/webhooks#new` | Rails | `api/webhooks#new` | GET /api/v1/webhooks/new: no def new in webhooks_controller.rb: dead route |
| GET `/api/v1/webhooks/:id/edit` `api/webhooks#edit` | Rails | `api/webhooks#edit` | GET /api/v1/webhooks/:id/edit: no def edit: dead route |
| GET `/api/v1/webhooks/:id` `api/webhooks#show` | Rails | `api/webhooks#show` | GET /api/v1/webhooks/:id: no def show in webhooks_controller.rb or ApplicationController; the frontend never GETs a single webhook: dead route |
| GET `/api/v1/integrations/new` `api/integrations#new` | Rails | `api/integrations#new` | GET /api/v1/integrations/new: no def new in integrations_controller.rb: dead route |
| GET `/api/v1/integrations/:id/edit` `api/integrations#edit` | Rails | `api/integrations#edit` | GET /api/v1/integrations/:id/edit: no def edit: dead route |
| POST `/rails/action_mailbox/postmark/inbound_emails` `action_mailbox/ingresses/postmark/inbound_emails#create` | Rails | `action_mailbox/ingresses/postmark/inbound_emails#create` | framework-mounted, unused by app: no app/mailboxes dir; no ApplicationMailbox or action_mailbox references in app/, config/, lib/ or db/; config.action_mailbox.ingress unset, so ActionMailbox::BaseController#ensure_configured returns 404 (actionmailbox-7.2.3.2 app/controllers/action_mailbox/base_... |
| POST `/rails/action_mailbox/relay/inbound_emails` `action_mailbox/ingresses/relay/inbound_emails#create` | Rails | `action_mailbox/ingresses/relay/inbound_emails#create` | framework-mounted, unused by app: same evidence as 411 (relay ingress 404s because no ingress is configured) |
| POST `/rails/action_mailbox/sendgrid/inbound_emails` `action_mailbox/ingresses/sendgrid/inbound_emails#create` | Rails | `action_mailbox/ingresses/sendgrid/inbound_emails#create` | framework-mounted, unused by app: same evidence as 411 (sendgrid ingress) |
| GET `/rails/action_mailbox/mandrill/inbound_emails` `action_mailbox/ingresses/mandrill/inbound_emails#health_check` | Rails | `action_mailbox/ingresses/mandrill/inbound_emails#health_check` | framework-mounted, unused by app: same evidence as 411 (mandrill health check) |
| POST `/rails/action_mailbox/mandrill/inbound_emails` `action_mailbox/ingresses/mandrill/inbound_emails#create` | Rails | `action_mailbox/ingresses/mandrill/inbound_emails#create` | framework-mounted, unused by app: same evidence as 411 (mandrill ingress) |
| POST `/rails/action_mailbox/mailgun/inbound_emails/mime` `action_mailbox/ingresses/mailgun/inbound_emails#create` | Rails | `action_mailbox/ingresses/mailgun/inbound_emails#create` | framework-mounted, unused by app: same evidence as 411 (mailgun ingress) |
| GET `/rails/conductor/action_mailbox/inbound_emails` `rails/conductor/action_mailbox/inbound_emails#index` | Rails | `rails/conductor/action_mailbox/inbound_emails#index` | dev-only and unused: Rails::Conductor::BaseController before_action ensure_development_env returns 403 unless Rails.env.development? (actionmailbox-7.2.3.2 app/controllers/rails/conductor/base_controller.rb:7-12); no ActionMailbox tables or usage in the app |
| POST `/rails/conductor/action_mailbox/inbound_emails` `rails/conductor/action_mailbox/inbound_emails#create` | Rails | `rails/conductor/action_mailbox/inbound_emails#create` | dev-only conductor (403 outside development) and unused: same evidence as 417 |
| GET `/rails/conductor/action_mailbox/inbound_emails/new` `rails/conductor/action_mailbox/inbound_emails#new` | Rails | `rails/conductor/action_mailbox/inbound_emails#new` | dev-only conductor and unused: same evidence as 417 |
| GET `/rails/conductor/action_mailbox/inbound_emails/:id` `rails/conductor/action_mailbox/inbound_emails#show` | Rails | `rails/conductor/action_mailbox/inbound_emails#show` | dev-only conductor and unused: same evidence as 417 |
| GET `/rails/conductor/action_mailbox/inbound_emails/sources/new` `rails/conductor/action_mailbox/inbound_emails/sources#new` | Rails | `rails/conductor/action_mailbox/inbound_emails/sources#new` | dev-only conductor and unused: same evidence as 417 |
| POST `/rails/conductor/action_mailbox/inbound_emails/sources` `rails/conductor/action_mailbox/inbound_emails/sources#create` | Rails | `rails/conductor/action_mailbox/inbound_emails/sources#create` | dev-only conductor and unused: same evidence as 417 |
| POST `/rails/conductor/action_mailbox/:inbound_email_id/reroute` `rails/conductor/action_mailbox/reroutes#create` | Rails | `rails/conductor/action_mailbox/reroutes#create` | dev-only conductor and unused: same evidence as 417 |
| POST `/rails/conductor/action_mailbox/:inbound_email_id/incinerate` `rails/conductor/action_mailbox/incinerates#create` | Rails | `rails/conductor/action_mailbox/incinerates#create` | dev-only conductor and unused: same evidence as 417 |
| GET `/rails/active_storage/blobs/redirect/:signed_id/*filename` `active_storage/blobs/redirect#show` | Rails | `active_storage/blobs/redirect#show` | framework-mounted, unused by app: no has_one_attached, has_many_attached or ActiveStorage references in app/, config/, lib/ or db/; no config.active_storage.service in config/environments; no active_storage tables in db/schema.rb; config/storage.yml is only the Rails-generated Disk stub; routes e... |
| GET `/rails/active_storage/blobs/proxy/:signed_id/*filename` `active_storage/blobs/proxy#show` | Rails | `active_storage/blobs/proxy#show` | framework-mounted, unused by app: same evidence as 425 |
| GET `/rails/active_storage/blobs/:signed_id/*filename` `active_storage/blobs/redirect#show` | Rails | `active_storage/blobs/redirect#show` | framework-mounted, unused by app: same evidence as 425 |
| GET `/rails/active_storage/representations/redirect/:signed_blob_id/:variation_key/*filename` `active_storage/representations/redirect#show` | Rails | `active_storage/representations/redirect#show` | framework-mounted, unused by app: same evidence as 425 |
| GET `/rails/active_storage/representations/proxy/:signed_blob_id/:variation_key/*filename` `active_storage/representations/proxy#show` | Rails | `active_storage/representations/proxy#show` | framework-mounted, unused by app: same evidence as 425 |
| GET `/rails/active_storage/representations/:signed_blob_id/:variation_key/*filename` `active_storage/representations/redirect#show` | Rails | `active_storage/representations/redirect#show` | framework-mounted, unused by app: same evidence as 425 |
| GET `/rails/active_storage/disk/:encoded_key/*filename` `active_storage/disk#show` | Rails | `active_storage/disk#show` | framework-mounted, unused by app: same evidence as 425 |
| PUT `/rails/active_storage/disk/:encoded_token` `active_storage/disk#update` | Rails | `active_storage/disk#update` | framework-mounted, unused by app: same evidence as 425 |
| POST `/rails/active_storage/direct_uploads` `active_storage/direct_uploads#create` | Rails | `active_storage/direct_uploads#create` | framework-mounted, unused by app: same evidence as 425 (direct uploads; the app uploads via its own S3 remote_uploader) |

## Verification gate

### Route reconciliation

`bundle exec rails routes --expanded` ran successfully at the audited SHA, so no fallback parse of `config/routes.rb` was needed. Ember routes come from parsing `app/frontend/app/router.js`, skipping commented-out lines. The reconciliation matches the stable route keys in this CSV's `rails_routes` and `ember_routes` columns, plus the Excluded routes table in this file, against both route lists:

```
CSV rows: 291
Rails routes (rails routes --expanded): 433  mapped: 350  excluded: 83  both: 0  unaccounted: 0
Ember routes (router.js):               115  mapped: 112  excluded: 3  both: 0  unaccounted: 0
TOTAL routes: 548  mapped: 462  excluded: 86  unaccounted: 0
keys in CSV/md that match no real route: []
```

The check was proved able to fail. With `GET /jobs boards#jobs` and `user.logs:/logs` removed from a scratch copy of the CSV, it printed `unaccounted: 2`, named both keys and exited 1. The reconciliation and build scripts are kept with the internal notes, not in this repository.

### Citation checks

- **Bounds check:** every full repo-relative `path:line` in `user_entry`, `backend` and `feature_flag` exists and is within the file's length, and every `existing_tests` path exists: 0 failures on the final build.
- **Limits:** short citations (a bare file name, or `:NNN` continuing the previous file) are not resolved by this check. A passing bounds check shows a line exists, not that it says what the row claims. The hand re-read below is the only content check, which is why most rows are labelled AGENT-REPORTED.

### Ten random rows re-read against the code

The rows were picked with `random.seed(20260924); random.sample(rows, 10)` from the first build and are listed here under their current ids.

| id | feature | result |
|---|---|---|
| SET-08 | Account registration | Lines confirmed: `users_controller.rb:253` `def create`; `:265` COPPA gate; `:285` `UserBoardProvisioner.provision_for`; `register.js:67` reads `compliance_workflow_kernel`; the tests exist. One locator was wrong and has been corrected: the `user_creation` AuditEvent is at `:326-337`, not `:317-328`. |
| SYS-27 | Board downstream processing | Lines confirmed: `board_downstream_button_set.rb:424` `def self.update_for`; `upstream_downstream.rb:5` `track_downstream_boards!`; both specs exist. |
| BRD-28 | Board popularity stats | Lines confirmed: `boards_controller.rb:903` `def stats`, `:906` `allowed?(board, 'view')`; `lib/stats.rb:157` `board_use`; `board-details.js:99` opens `board-stats`; `board-stats.js:61` GETs `/stats`. |
| SYS-34 | Server-side at-rest field encryption | Cited lines confirmed: `secure_serialize.rb:1-4` includes `GoSecure::SerializeInstanceMethods`; 41 files in `app/models` reference it. The row stays ASSUMED because the key-management part lives in a gem that was not opened. |
| SYS-37 | Art.50(2) AI-output marking audit | Lines confirmed: `lib/tasks/compliance.rake:5-7` defines the task and calls `Art50MarkingAudit.run`; the spec exists. |
| SET-30 | Beta program welcome and agreement | Lines confirmed: `beta-welcome-message.js:47` `acceptAgreement`; `register.js:115` `hasBetaAccess` branch; `beta-welcome-mode.js:50-52` PUTs `beta_agreement_accepted`; `beta-welcome.js:18` checks `beta_program_access`. NONE for tests holds: the only test that mentions beta welcome does so in a comment. |
| NEW-36 | Curated vocabulary library seeding | Lines confirmed: `curated_vocabulary_sources.rb:106` and `:192`; `system_boards.rake:32-33`; `openaac.rake:49`; both specs exist. |
| TEAM-24 | User edit history (admin support) | Lines confirmed: `user/index.hbs:560` Edit History link under `support_actions` (`:504`); `users_controller.rb:579` `def history`, `:584` `admin_support_actions`, `:592-593` AuditEvent. |
| NEW-06 | Server-side Quick Screen recommendation API | Lines confirmed: `eval_sessions_controller.rb:16` `def recommend`, `:20` supervise check, `:102` `quick_screen_eval` flag; `eval_recommend.rb:32`; `eval_protocol.rb:48`; `feature_flags.rb:127` lists the flag. |
| ORG-08 | Site-admin global reports | Lines confirmed: `organizations_controller.rb:338` `def admin_reports`, `:344-346` admin-org check, `:560` voice AuditEvents, `:588` feature_flags report; `organization/reports.js:34` checks `model.admin`. |

Result: the cited lines of all 10 rows say what the rows claim, apart from one wrong locator (SET-08), which has been corrected. 9 rows are CONFIRMED; SYS-34 stays ASSUMED for the part that was not opened. Following the verification rule, all 139 `Controller#action path:line` citations in the final CSV were then checked for the same kind of error. 137 point at the `def` line, and 2 (TEAM-05, ORG-13) intentionally point at a line inside the action body.
