---
description:
alwaysApply: true
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## RULE #0 — CHECK THIS FIRST, EVERY SINGLE TIME, BEFORE TOUCHING CODE

**Scope:** this rule applies to **every** code change — additions, modifications, refactors, fixes, deletions, and styling/markup edits alike. "Fix" below is shorthand for any change. The rule takes precedence over everything else in this document.

1. **Diagnose before fixing — never guess.** Identify the actual root cause and **verify it with evidence** (read the real code paths end to end, inspect the real data, reproduce or trace the failing behavior). Do not propose or apply a fix based on a plausible-sounding theory. If you cannot verify the cause, say so and keep investigating — do not ship a guess.
2. **Be thorough.** Trace the full path the bug actually travels, including shared code, both the working and broken variants, and the data the code operates on. A fix that addresses a symptom without explaining why the verified root cause produces it is not acceptable.
3. **Never break existing, working functionality.** Preserve all current behavior. If a fix risks regressing anything that works today, stop and flag it rather than proceeding. Do not "fix" one thing by degrading another.
4. **If diagnosis is incomplete, do not apply a change.** Report what was verified, what wasn't, and the next investigation step. An honest "not yet diagnosed" beats a confident wrong fix.
5. **If an attempted correction does not fix the problem, suspect the attempt itself first.** Before trying again, thoroughly re-evaluate whether the change was made on the wrong element, component, route/page, or layer. If it was, **revert the incorrect change** before doing anything else -- do not leave wrong edits stacked in place. Only then re-diagnose (per rules 1-4) and fix the real problem. Never pile a second guess on top of an unreverted first guess.
6. **Keep the code modular and organized — never write spaghetti.** Each change should live in the smallest sensible unit (component, helper, service, partial, mixin) with a single, clear responsibility. Reuse existing primitives instead of duplicating logic; extract a shared unit when the same idea appears in two places. Name things for what they are, group related code together, and don't bolt new behavior onto an already-overloaded file or function just because it's convenient. If a change would tangle responsibilities, stop and propose the split first.
7. **When changing a styling rule, edit the original — do not stack a new one on top.** Locate the existing selector that governs the element (in `app.scss` or the relevant partial) and modify it in place so each component has one authoritative rule. Do not introduce a new selector with higher specificity, an override block at the bottom of the file, or an `!important` patch just to win the cascade. Only add a new rule when the element genuinely has no existing style; if uncertain whether a rule already exists, search first.
8. **Track every researched task in a markdown log; distill durable lessons to a shared learnings doc.** As soon as a task requires research (diagnosis, multi-file exploration, multiple iterations), create `docs/task-management/YYYY-MM-DD-<kebab-task-name>.md` and use it as a live working log: goal, hypotheses, attempts, what worked, what failed, evidence (file:line), decisions. Update it as you go, not at the end. **Before** starting a task, skim `docs/task-management/LEARNINGS.md` for prior findings that apply. **On** successful completion, distill any durable patterns — root-cause patterns, reusable techniques, codebase gotchas — into that same `LEARNINGS.md` so future tasks benefit. Skip the per-task file only for truly trivial edits (one-line/typo) that need no investigation.
9. **If it makes a task more efficient, always spawn subagents — don't ask first.** Any task that splits into independent slices (multi-file code review, audits, broad searches, migrations, verification across many routes) should be fanned out to parallel subagents rather than worked through serially. Launch them in a single message so they run concurrently, and give each one an explicit file list, the repo-specific traps to check, and a rule to label every finding CONFIRMED (traced in code) vs PLAUSIBLE (needs a runtime check). This is standing authorization: do not wait to be asked, and do not sit single-threaded through work that parallelizes. It does not relax rules 1-4 — a subagent's report is evidence to verify, not a verified finding, and anything acted on still needs its own root-cause confirmation.

10. **A red test run is not a regression until you have confirmed the run COMPLETED.** A truncated run is indistinguishable from a failing one at a glance — it prints a `# fail` line, names a test, and exits non-zero. Check the shape of the run before reporting anything:
    - **`node -v` FIRST — before reading a single line of failure output.** The shell's nvm
      default here is **16**; this repo requires **22** (`/.nvmrc`, `app/frontend/.nvmrc`,
      `package.json` engines `>=22 <23`). A wrong-Node run can die during BUILD and still exit
      non-zero with a `# fail` line, which looks exactly like a red suite. `export
      NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`. Documented in LEARNINGS
      (2026-08-10) and rediscovered the hard way on 2026-08-23 — a handoff claimed "testem
      cannot launch in this environment", which is false.
      Two claims that used to live here were re-verified on 2026-08-30 and are NO LONGER TRUE;
      do not reason from them. (a) The `require() of ES Module .../execa/index.js` symptom:
      `execa` now resolves to **1.0.0, CJS** (no `type` field), so it cannot reproduce. (b) "`npx
      ember` resolves to a placeholder `ember` package": `node_modules/ember` does not exist and
      is absent from `package-lock.json`; `.bin/ember` points at `ember-cli/bin/ember`, and
      `.github/workflows/ci.yml` itself runs `npx ember build` / `npx ember test`. Invoking
      `./node_modules/.bin/ember` is still the safer habit, just not for that reason.
    - **You cannot attribute a failure without a BASELINE.** Re-run the full suite with your change
      reverted in the working tree. Identical pass/fail counts with DIFFERENT failing test names
      means flaky, not a regression. A real regression fails the SAME tests every time.
      **The live cause as of 2026-08-31 is `capabilities.sync_access_token`**, which calls
      `localStorage.getItem` from an async callback. When that callback lands after another test
      has torn down its `localStorage` stub it throws `TypeError: localStorage.getItem is not a
      function`, and QUnit charges the resulting GLOBAL FAILURE to whichever test happens to be
      running — most recently `Unit | Component | boards-layout-toggle: rapid toggling serializes
      saves instead of racing them`, which is not related to it in any way. Evidence: two
      back-to-back full runs on the same tree, both complete (`# tests 2412 / # skip 38`), one
      with that failure and one with none, and the named test passing 20/20 in isolation.
      (This rule previously named a `token_validated` leak in `services/session.js`. That one was
      FIXED — all three async writers are teardown-guarded at `services/session.js:279`, `:364`,
      `:676`. The discipline outlived its original example, which is the point of dating the
      example rather than trusting it.)
    - **`ember test`: check `# skip` first.** The skip count is near-constant (38 as of 2026-08-16) while the total drifts as tests are added, which makes skips the reliable tell. A complete run reports `# skip 38` with a total that DRIFTS upward as tests are added (2005 on 2026-08-16; 2157 and 2327 in later recorded runs — reconcile against a recent run, not against this number); a truncated one reports the same `# skip` line with a much smaller number (0, 14 and 26 were all seen in one session) and a total well short of the baseline. The usual cause is `Browser timeout exceeded: 120s` — testem's `browser_disconnect_timeout` reaping a headless browser that went SILENT under machine load, not a slow test. The tell is that the named test differs every run and passes in isolation (`npx ember test --filter "<name>"`).
    - **Do not run a full suite while `ember serve` or browser probes are running.** That contention is the cause, and it wasted four runs in one session. Stop them, or accept the truncations.
    - **Do not "fix" it by raising `browser_disconnect_timeout` in `testem.js`.** The 120s is deliberate. Note what CI actually does, because an earlier version of this rule cited the wrong lines for it: `.github/workflows/ci.yml:124-129` is the **ESLint gate** (`run: npm run lint:js:ci`), while the fail-fast rationale lives at **`:141-147`** and justifies a 50-minute GitHub `timeout-minutes` STEP CAP — a different mechanism from testem's `browser_disconnect_timeout`. Treat "CI is unaffected" as UNVERIFIED unless you have just queried the Actions API; it is not checkable from the repo alone. If you need a patient run locally, wrap the repo config in a temp file outside the repo and pass `--config-file`; never commit the change.
    - Same discipline for any suite: reconcile the totals against a known-good baseline before claiming a delta. If you cannot say why the count moved, you do not yet know whether it passed.

11. **Do not assert anything about a system you have not just checked — especially to justify a change.** Saying "CI hits this too", "this is covered by specs", "that path is unused", or "this is pre-existing" is a claim, and each one is cheap to verify: query the Actions API for real run outcomes, grep for the call site, diff the linter against `git show HEAD:<file>`. Inference from plausible reasoning is not evidence, and a wrong claim is worse when it is the argument FOR editing shared config or shipping a fix. If a check is impractical, say the claim is unverified rather than stating it flatly — and when a claim you already made turns out wrong, correct the durable artifacts (docs, learnings, PR body), not just the chat.

12. **Never implement a fix before an adversarial review of the PROPOSED fixes.** Diagnose, then
    write the candidate fixes down — **more than one, wherever more than one exists** — and put
    that proposal through adversarial review *before* editing any code. Apply only what survives,
    with whatever changes the review demands.

    The order matters because fixes are where the defects are. On the branch that produced this
    rule, six review rounds found real bugs and **three of them found the bugs in the previous
    round's fixes**. When proposals were finally reviewed before landing, the reviewer found
    defects in **four of five** proposals — twice running. In the worst case, a CRITICAL scanning
    lockout, *both* proposed remedies were actively harmful (one added ~120 DOM lookups per scan
    tick on an eye-gaze user's code path; the other could leave scanning stopped with no armed
    timer) and the correct third fix came from the review. Under fix-then-review, every one of
    those ships and is discovered — if at all — a round later.

    What a proposal must contain:
    - the **diagnosis**, verified in code, with file:line — a wrong diagnosis makes the best-built
      fix worthless, and one on that branch blamed the wrong commits entirely;
    - **at least two candidate fixes** where they exist, with the trade-off between them stated,
      plus the simplest alternative considered and why it was rejected;
    - **the risks you can see**, and explicitly **the questions you could not resolve** — those are
      where a wrong fix hides, and naming them is what lets the review aim;
    - the **test** that will accompany the fix, and **the mutation that must make that test fail**.

    Every accompanying test must then be **falsified** before it is trusted: revert the fix, confirm
    the test goes red, restore. Four tests on that branch passed against the very bugs they were
    written for and were caught only this way. A test that cannot fail is worse than no test,
    because it is counted as coverage.

    Restore from a copy you made yourself, never `git checkout` — that destroys uncommitted work,
    and doing it once cost a whole redesign and three rounds of debugging its absence. Commit
    before running destructive verification.

    This does not license skipping rules 1-4: a review is evidence to verify, not a verdict. Reviews
    on that branch were wrong too — a contrast remedy that still failed AA, a magnitude computed
    from the wrong root font-size, a "factually wrong" charge against a comment that was correct.
    Verify each finding yourself before acting on it, and say so when you disagree.

13. **Establish three facts BEFORE writing a fix, and write them down labelled.** Every defect
    self-inflicted on the branch that produced rules 12-14 came from skipping one of exactly three
    questions. They are a closed list, they are cheap, and they are answerable before any code is
    written:

    - **(a) Where is this value actually READ?** Trace the control flow to the read, not to where
      the concept belongs. This one question accounts for FIVE separate bugs on that branch, all
      of the same shape: a guard placed where it cannot fire — after the early return it needed to
      precede; on the dwell branch when the scanner branch returns first; keyed on a value that is
      null for exactly the users it was written for; and twice as a proposed fix that was a strict
      no-op. Every one of them read correctly. None executed correctly.
    - **(b) What are ALL the shapes this can hold?** Enumerate the reachable states and name the
      writer of each. `suggestions === null` missed `{ready: true, list: []}`, which FOUR call sites in
      `board-detail.js` produce, plus a fifth in `controllers/board/index.js`; the fix looked
      complete and covered one of two cases. Note the count: this rule used to say "three",
      copying a code comment that was counting CAUSES rather than writers — in the very rule that
      tells you to name the writer of each.
    - **(c) Is this claim about another file TRUE?** Rule 11 already says this; it was still
      violated repeatedly. "The sibling test uses the shared helper" (it uses an inline stub),
      "`updateSuggestions` observes `model.id`" (it does not), "that probe failure was an ember
      rebuild" (it was a real defect, and the misreading cost hours).

    **Label every fact CONFIRMED (`file:line`) or ASSUMED before you use it.** No ASSUMED line may
    be load-bearing for a fix: check it, or do not proceed on it. This exists because a verified
    fact and a plausible inference are indistinguishable from the inside — writing them in
    different columns is what makes the gap visible. Reviewers on that branch used exactly this
    labelling and it is why their findings held up.

    **The three facts are NEVER skipped, and "this one is obvious" is the signal to write them
    down, not to skip them.** Every one of the five guard-placement bugs looked obvious. Each was a
    one-line change to code the author had just written and believed he understood; that belief was
    the defect. The fact sheet is a PRECONDITION of touching code, not a ceremony reserved for
    changes that feel large — the small, confident, self-evident fix is exactly where this failed,
    five times, and twice the misplaced guard WAS the entire proposed fix. There is no size or
    urgency threshold below which the three questions are optional. If the answers are genuinely
    trivial the sheet takes a minute and proves it; if writing it is awkward, that awkwardness IS
    the finding, and it is cheaper here than three review rounds later.

    **Then write the RED TEST FIRST — before the fix exists — derived from the traced mechanism.**
    This is the highest-leverage single practice available here, because it forces (a), (b) and (c)
    simultaneously: a test cannot fail *for the right reason* unless you know where the value is
    read, which states are reachable, and what the neighbouring code really does. It also proves
    the diagnosis before any effort is invested in a fix worth defending. All five hollow tests on
    that branch — tests that passed against the very bug they were written for — were written
    AFTER their fix, from a description rather than from a mechanism. A fix whose red test you
    cannot write is a fix whose bug you do not yet understand.

    Worked example, from the bug that consumed three review rounds. The claim was "a cleared
    sentence must blank the panel". Writing the fix first produced a guard that read correctly and
    sat after the early return that made it unreachable; it survived a full round, a proposal
    review, and a commit message asserting it was fixed. Writing the RED TEST first would have
    required setting up a freeze, blanking it, and observing the panel — and the setup itself walks
    straight into the early return, so the diagnosis surfaces in the first ten minutes rather than
    the third round. The same holds for the header-row false positive: any test that scans the
    header row goes red immediately, because building it forces you to ask what the scanner's
    `dom` actually IS at that step. In both cases the test is not a check on the fix; it is the
    instrument that finds where the fix belongs.

14. **Five practices that prevent the specific defects this codebase has already produced.** Each
    is cheap, mechanical, and traceable to a real failure — not general advice.

    1. **Trace-to-the-read before placing any guard.** State in one line where the value is read
       and show the guard precedes it on every path. If you cannot write that line, you do not yet
       know where the guard goes. (Rule 13(a) is the diagnosis; this is the habit.)
    2. **Write the weakest passing state before writing a test.** Ask: what is the least-working
       version of this system that still makes this test green? If that state contains the bug, the
       test is wrong — rewrite it before running it. This catches hollow tests earlier and more
       cheaply than falsification does, and falsification (rule 12) then confirms it. Real examples:
       a cue test that stopped its stimulus before asserting; a regression that needed TWO
       suppressed writes to diverge and had one; an "untargeted control" whose first assertion was
       false for an unrelated reason and could never fail.
    3. **Write comments last, and make every cross-file claim checkable.** Comments describe what
       the code DOES, not what it is for, and any assertion about another file cites `file:line`.
       Four comments on that branch claimed more than their code — including one asserting the
       exact opposite of the behaviour beneath it, and one whose stated rationale described a path
       that could not execute. A comment written before the code settles becomes a false statement
       that misleads the next reader, the next reviewer, and you.
    4. **Enumerate matches before any text substitution in a shared file.** List what a
       replacement will hit and confirm each is intended. A blanket `<=768px` -> `<=1024px` rename
       intended for ONE stale comment corrupted four correct ones, and a block deletion silently
       removed a helper that two live call sites still referenced. The same rule applies to
       deleting a range: print what is inside it first.
    5. **Two independent reviewers for anything High or above.** Independent convergence was the
       strongest evidence produced on that branch — two reviewers who had not seen each other's
       output found the same HIGH defect, one by tracing and one by writing a probe test. A single
       reviewer is also wrong sometimes: reviews on that branch produced a contrast remedy that
       still failed AA, a magnitude computed from the wrong root font-size, and a "factually wrong"
       charge against a comment that was correct.

    **Ordering matters:** rules 13 and 14 come FIRST and rule 12's proposal review is the
    BACKSTOP. A reviewer spending its attention on a guard that cannot fire is a wasted reviewer;
    that class should never reach it. Reviews earn their cost on blast radius, cross-file
    interactions, and the things you structurally cannot see about your own work.

    (For the two structural constraints these practices depend on — one change per unit, and
    stopping when the error rate rises — see rule 15.)

15. **Two structural constraints on HOW the work is paced.** Rules 12-14 govern the content of a
    change; these govern its size and its timing. Both were learned by violating them.

    **One coherent change per unit.** On the branch that produced these rules, EVERY multi-item
    batch contained at least one defect and every single-item change was clean — a perfect split.
    The mechanism is not mysterious: a batch shares one verification pass, so a mistake in item
    three hides behind green results earned by items one and two, and the fact sheet (rule 13)
    degrades from a trace into a list. If several fixes are genuinely independent, they are
    genuinely separate units; if they are not independent, that coupling is itself something to
    establish before touching any of them. Batching also defeats falsification: mutating one item
    to confirm its test fails tells you nothing about the other four.

    **Stop when the error rate rises; do not push through.** Assumption errors on that branch got
    WORSE as the session lengthened, not better, and the qualitatively different mistakes all came
    late: a blanket `sed` across a shared stylesheet that corrupted four correct comments, a
    `git checkout` on uncommitted work that destroyed a completed redesign and cost three further
    rounds debugging its absence, and a range deletion that silently removed a helper two live call
    sites still referenced. None of those are reasoning errors of the kind rules 13-14 address —
    they are the mechanical slips of someone going too fast, and no amount of review discipline
    prevents them because they happen in the act of applying an already-correct plan.

    The tell is not fatigue, which is not observable from the inside. It is the RATE: two
    self-inflicted errors close together, a fix that needs a second correction, or a verification
    step that has to be re-run because the first attempt was botched. At that point the correct
    move is to commit what is verified, write down what remains, and stop — not to attempt one more
    change. Work that stops cleanly at a known-good state costs one session; work that continues
    past this point has already cost more than it saved, twice, on the branch that produced this
    rule.

## Branching (mandatory before ANY code change)

Before you make any edit in this repo, you MUST be on a properly-named branch — but **do not create a new branch** when the user is already working on one for the same task or PR.

1. **Branch from `develop`, not `main` or `staging`.** PRs target `develop` first; promote `develop` to `staging`, then open a release PR from `staging` to `main`. Create a new branch only when starting **new** work or when currently on `main` / `staging` / `develop`.
2. **Stay on the active feature branch** when the user (or conversation) is already on a properly named branch and the request is part of that work — e.g. CI failures on their PR, review feedback, follow-up fixes, or “fix this on my branch.” Commit directly on that branch. Do **not** check out `develop` or `staging`, spawn a separate `fix/…` branch, and merge back unless the user explicitly asks for a split PR or a clean branch off `develop`.
3. **Branch name format:** use the **developer** doing the work, not a fixed name. Two conventions both work:
   - `<type>/<developer>-<kebab-case-description>` — e.g. `fix/melissa-persistence-bg-parse-json`, `feat/melissa-signup-default-library-boards`
   - `<developer>/<type>/<kebab-case-description>` — e.g. `melissa/fix/sidebar-actions`, `traci/styling/styling-updates`
   - `<type>` is one of: `fix`, `feat`, `chore`, `docs`, `perf`, `refactor`, `test`, `compliance`, `security`. The type prefix is REQUIRED in the `<type>/…` form.
   - `<developer>` is a short lowercase handle: `melissa`, `scot`, `traci`, `dominic`, etc.
   - Use kebab-case for the description (lowercase, hyphens between words).
4. **Never edit on `main`, `staging`, or `develop` directly.** If you find yourself on one of those branches, `git checkout develop && git pull && git checkout -b <type>/<developer>-<description>` (or `<developer>/<type>/<description>`) first.
5. Date suffixes like `-2026-05-08` are only for time-bound recovery/release branches, not regular feature work.

If you produced a branch name without a type prefix (e.g. `melissa-sidebar`), rename it before opening a PR: `git branch -m fix/melissa-sidebar`.

## Project Overview

LingoLinq (formerly LingoLinq) is an open-source web-based AAC (Augmentative and Alternative Communication) application. It consists of a Rails backend and an Ember.js frontend, both contained in this monorepo. The system is deployed as a web app and packaged for mobile (iOS/Android) and desktop apps.

Key characteristics:
- Cloud-based with offline support via IndexedDB/SQLite
- Multi-device sync with automatic conflict resolution
- Supervisor/user permission model for therapy teams
- Uses Open Board Format (OBF) for board import/export
- Deployed on Render (lingolinq-prod, lingolinq-staging, lingolinq-dev) with background job processing via Resque

## Development considerations
LingoLinq-AAC supports multiple locales, so when developing anything on the frontend, whether
in templates or modals and alerts, you will need to use the internationalization libraries
in order to support locales. Do net ever add raw text strings to any user-facing 
resources, always use the i18n helpers. You can find examples of the helpers 
throughout the code, using
commands such as `i18n.t('key', "string")` or `{{t "this is some test" key='key'}}`. Instructions for generating and processing string files is located in `/i18n_generator.rb`.
NOTE: as a standardized convention for the codebase, all user-facing strings should use
double-quotes and all other strings should use single quotes.

### Backend (Rails)

**Setup:**
```bash
# Install dependencies
bundle install

# Setup database (requires Postgres and Redis running)
rails extras:assert_js  # Fixes symbolic links
rails db:create
rails db:migrate
rails db:seed  # Optional: creates example user (username: example, password: password)
```

**Running servers:**
```bash
# Fresh start (kills existing processes, checks dependencies, starts all services)
bin/fresh_start

# Or manually:
# Development with all processes (recommended)
foreman start

# Stop all running processes
bin/kill_all

# Single process (backend only, frontend won't work)
rails server

# Background jobs (Resque workers)
env QUEUES=priority,default,slow INTERVAL=0.1 TERM_CHILD=1 bundle exec rake environment resque:work
```

**Testing:**
```bash
# Run all specs
bundle exec rspec

# Run specific spec file
bundle exec rspec spec/models/user_spec.rb

# Run specific test
bundle exec rspec spec/models/user_spec.rb:42
```

**Console access:**
```bash
# Audited console wrapper (platform-agnostic; run from any app shell)
bin/audit_console
```

> Note: this script was previously named `bin/heroku_console`. It no longer
> invokes the Heroku CLI; it sets `USER_KEY` and `exec`s `bundle exec rails
> console`, so it works from the Render Shell tab, a Cloud Run exec shell, or a
> local checkout. `USER_KEY` does two things: it attributes record writes to you
> via PaperTrail, and it satisfies the audited-session control, which records a
> session-open `AuditEvent` and refuses the session in production when the key is
> absent (see the Security section). The control is operative as of 2026-08-29
> (finding LL-7f7372e3eb, verified-closed); the older note claiming it was dead
> on the Reline stack is obsolete.

**Scheduled tasks (run periodically in production):**
```bash
rake check_for_expiring_subscriptions  # daily
rake generate_log_summaries            # hourly
rake push_remote_logs                  # hourly
rake check_for_log_mergers             # hourly
rake advance_goals                     # hourly
rake transcode_errored_records         # daily
rake flush_users                       # daily
rake clean_old_deleted_boards          # daily
```

### Frontend (Ember)

**Setup:**
```bash
cd app/frontend
npm install
# bower install (Deprecated: dependencies moved to npm/vendor)
```

**Running:**
```bash
cd app/frontend
ember serve  # Runs on port 8184, auto-compiles on changes
```

**Testing:**
```bash
cd app/frontend
ember test
```

**Linting:**
```bash
cd app/frontend
npm run lint:js
npm run lint:hbs
```

**Build:**
```bash
cd app/frontend
ember build --environment production
```

### Deployment

```bash
# Precompile assets for production
bin/deploy_prep

# Mobile app preparation
rake extras:mobile

# Desktop app preparation
rake extras:desktop
```

## Architecture

### Backend Architecture

**Database:** PostgreSQL with Redis for caching and background jobs

**ID System:** Custom `global_id` format (`#shardnum#_#dbid#`) used instead of raw database IDs for future sharding support. Key methods:
- `Model.find_by_global_id(id)` - lookup by global ID only
- `Model.find_by_path(path)` - lookup by ID, board key, or username
- `Model.find_all_by_global_id([ids])`
- Some records use protected IDs (id-and-nonce) to prevent snooping

**JSON API:** All API responses generated in `lib/json_api/` (not using Rails standard JSON serializers)

**Key Model Concerns:** (in `app/models/concerns/`)
- `global_id` - ID lookup helpers for sharding-ready IDs
- `extra_data` - Stores large datasets (LogSession, BoardDownstreamButtonSet) in S3 instead of DB
- `permissions` - Access control (`add_permissions`, `allowed?`)
- `processable` - Standardized client data processing with uniqueness enforcement
- `relinking` - Server-side board set copying
- `upstream_downstream` - Keeps linked boards up-to-date when children change
- `secure_serialize` - Encryption layer for sensitive data (privacy compliance)
- `subscription` - Subscription/purchase event management
- `supervising` - Supervisor relationship management
- `board_caching` - Tracks available board IDs for users

**Key Libraries:** (in `lib/`)
- `worker.rb` / `slow_worker.rb` - Background job management (Resque)
- `purchasing.rb` - Stripe API integration
- `stats.rb` - Log data ingestion and report generation
- `exporter.rb` - OBF/OBL format exports with anonymization
- `feature_flags.rb` - Feature flag system for gradual rollouts
- `converters/` - OBF/OBZ file conversion
- `uploader.rb` - File upload helpers (client and server-side)
- `transcoder.rb` - AWS transcoding event handling

**Key Models:**
- `User` - Large model with subscription, permission, and board management logic
- `Board` - Large model with button processing, copying, sharing functionality
- `ButtonSet` (BoardDownstreamButtonSet) - Tracks all buttons in board hierarchy for find-a-button feature
- `LogSession` - User interaction tracking with large data stored in S3
- `BoardContent` - Copy-by-reference system to minimize storage

### Frontend Architecture

**Framework:** Ember.js **5.12** with Ember Data 5.3 for models (ember-cli 5.12).

**Ember version history:** The app originally shipped on **Ember 3.28**, then was upgraded to
**4.12** (PR #437) and finally to **5.12** (PR #490) — the current version. When touching frontend
code, target 5.12 APIs. Note that the 5.12 upgrade set `EXTEND_PROTOTYPES: false`
(`config/environment.js`), so Ember array/string prototype extensions (`.pushObject`, `.sortBy`,
`.mapBy`, `.uniq`, `.compact`, etc.) are **not** available on native arrays/strings — call them only
on an `A()`-wrapped array (`import { A } from '@ember/array'`) or an Ember-Data collection, or use
native JS equivalents. Deprecation-audit status is tracked in
`docs/task-management/2026-07-14-ember-5-12-full-deprecation-audit.md`.

**jQuery removal:** Work to remove jQuery has been done on the develop branch. `jquery-integration` is disabled in `config/optional-features.json` to avoid `Component.reopen` deprecation from @ember/jquery. The app uses jQuery (`$`) for DOM manipulation where needed but does not use `this.$()` on components. When making changes, prefer native DOM APIs or Ember patterns over jQuery where practical.

**Offline Support:** IndexedDB (web) or SQLite (mobile) via `dbman.js` abstraction layer

**Key Utilities:** (in `app/frontend/app/utils/`)
- `app_state.js` - Application state management, button activation logic
- `persistence.js` - Local database abstraction, sync logic, Ember-Data caching
- `edit_manager.js` - Board editing state, undo/redo, board rendering preparation
- `capabilities.js` - Platform-specific code (file storage, gaze tracking, clipboard, etc.)
- `button.js` - Button helper methods (buttons stored on board objects, not persisted separately)
- `content_grabbers.js` - Image/sound/video search and insertion
- `raw_events.js` - Low-level DOM listeners (clicks, drags, dwell, eye-gaze)
- `scanner.js` - Scanning mode implementation
- `speecher.js` - Speech synthesis
- `utterance.js` - Sentence box content tracking and rendering
- `modal.js` - Modal and flash notice helpers
- `i18n.js` - Internationalization with English grammar helpers
- `sync.js` - Online status tracking, remote modeling sessions
- `eval.js` - Assessment system (special OBF type)
- `profiles.js` - Survey and assessment tools

**Key Models:** (in `app/frontend/app/models/`)
- Most client-side models match server names
- `User`, `Board`, `ButtonSet` are particularly large with extensive functionality

**Components:** (in `app/frontend/app/components/`)
- UI components for charts, graphs, data visualization

### Critical Code Paths

**Frontend hotspots:**
- `editManager.process_for_displaying` - Converts server data to renderable format
- `Board.contextualized_buttons` - Language/symbol/inflection display logic
- `app_state.activate_button` - Main button selection handler (sentence box, speech, actions)
- `persistence.sync` - Offline sync logic
- `persistence.getJSON` - Encrypted URL processing for extra_data
- `LingoLinq.Buttonset.load_button_set` - Button set loading with caching
- `User.currently_premium` - Feature access determination
- `controllers/board/index.js:computeHeight` - Board rendering sizing
- `initializers/attempt_lang.js` - Language file loading on startup

**Backend hotspots:**
- `boards_controller#index` - Board search (performance-sensitive, needs indexes)
- `BoardDownstreamButtonSet.update_for` - Button set updates (can run very frequently)
- `Board.process_buttons` - Board update processing
- `models/concerns/relinking.rb` - Board set copying logic
- `models/concerns/upstream_downstream.rb#track_downstream_boards!` - Runs often, queue bottleneck risk
- `Purchasing.purchase` - Stripe subscription activation

## Development Conventions

### Code Style

**Callback and plain-object context:**
- When a computed property or function returns a **plain object** whose methods are later called (e.g. `appState.get('board_virtual_dom').button_from_point(x,y)`), inside those methods `this` is the plain object, not the Ember service/controller. Use a closure: `var _this = this;` at the top of the computed/function, then use `_this.get()` / `_this.set()` inside the returned object's methods. Same for callbacks passed to `new RSVP.Promise()`, `.then()`, or `forEach`: capture the outer `this` as `_this` and use `_this` in the callback so "this.get is not a function" does not occur.
- **ESLint:** The custom rule `lingolinq/no-this-in-promise-executor` flags `this.get` / `this.set` inside the executor function of `new RSVP.Promise(function(resolve, reject) { ... })`. In that callback, `this` is not the service/controller, so using `_this` avoids runtime errors. The rule only checks Promise executors (not every `.then()` or plain object), to limit false positives while catching a common mistake.

**String Quoting Convention:**
- **User-facing strings:** ALWAYS use double quotes `"string"`
- **All other strings:** ALWAYS use single quotes `'string'`
- This convention is CRITICAL - i18n generator depends on it

**Deprecations:**
- NEVER suppress or hide deprecations. Fix the root cause instead.
- Do not use `registerDeprecationHandler` to silence warnings.
- When addressing Ember deprecations, migrate to the recommended APIs (e.g. `observer()` instead of `.observes()`, `isTesting()` from `@ember/debug` instead of `Ember.testing`).

**Functionality and styling:**
- Do NOT remove or change functionality when refactoring.
- Preserve existing class names used for styling unless there is a clear need to change them - if so, prompt the user first.

**Internationalization:**
- NEVER add raw text strings to user-facing code
- Templates: `{{t "displayed text" key='translation_key'}}`
- Controllers/JS: `i18n.t('translation_key', "default text")`
- Translation files: `public/locales/*.json`
- Generation script: `i18n_generator.rb`

**CSS / SCSS:**
- Mixed-unit math (e.g. `px + vw`, `rem + vw`) inside `clamp()` MUST be wrapped in `calc()` - SassC cannot evaluate mixed units at compile time
- CSS compression is disabled in production (`config.assets.css_compressor = nil`) - do NOT re-enable `:sass` compression (see `docs/CSS_SCSS_GUIDELINES.md`)

**Platform-Specific Code:**
- Extract platform-specific code or wrap in `capabilities` library
- Use capability checks to enable features conditionally
- System deployed as web, mobile (Cordova), and desktop (Electron) apps

### Feature Flags

New user-facing features MUST be added behind a feature flag (`lib/feature_flags.rb`):
- AAC users can find unexpected UI changes disruptive
- Allows beta testing and gradual rollout
- Some users/orgs are opted into beta features for testing
- Add to `AVAILABLE_FRONTEND_FEATURES` and conditionally to `ENABLED_FRONTEND_FEATURES`

**This applies to NEW features only.** A small change to a feature that already ships does
not need a flag — including one that is user-visible, and including one that makes a
destructive control newly reachable. Bug fixes that restore intended-but-broken behavior
are never new features. Do not raise the flag question for these; just ship them. When a
change is large, or genuinely introduces a new capability, ask.

### Security

- Avoid OWASP Top 10 vulnerabilities (XSS, SQL injection, command injection, etc.)
- User data is privacy-regulated - use `secure_serialize` concern for sensitive fields
- Console access: use `bin/audit_console` (sets `USER_KEY` so console record-writes are attributed to you via PaperTrail, and works from the Render Shell tab, a Cloud Run exec shell, or locally). The audited-session control is **operative** as of 2026-08-29 (LL-7f7372e3eb, verified-closed) and is not wrapper-only: `bin/rails` runs `Audit::ConsoleGuard.enforce_pre_boot!` before the app boots, and `bundle exec rails console` re-execs through `bin/rails` (`Rails::AppLoader.exec_app`), so both paths are covered. In production an un-keyed `console`/`runner` is refused pre-boot, `db`/`dbconsole` is refused outright (HIPAA), and `config/initializers/auditing.rb` re-checks at runtime (catching `-e`/`--environment` forms) before writing a session-open `AuditEvent` fail-closed. The wrapper's job is to prompt for `USER_KEY` rather than let you hit that refusal. **SCOPE, stated as a general rule because enumerating bypasses under-counts them:** the hooks are `Rails.application.console` and `.runner`, so **only `rails console` and `rails runner` are audited. Every other route to the production database is not.** That includes, non-exhaustively: `bin/rake` (requires `config/boot` directly, no guard); any other `bin/rails` subcommand such as `db:migrate`, which `ConsoleGuard.classify` returns as `:other` so it passes `enforce_pre_boot!`, boots fully and fires neither hook; a direct boot (`ruby -r./config/environment -e '...'`); and a non-Ruby client such as `psql "$DATABASE_URL"` or `gcloud sql connect`, which sits outside the guard entirely and makes the `rails dbconsole` HIPAA refusal largely decorative. All give database access with no `AuditEvent`, no refusal and no attribution, in production included. RESIDUAL: `USER_KEY` is self-asserted free text, not derived from an authenticated principal, so the attributed actor is spoofable by anyone who already has a shell on the app; recorded in LL-7f7372e3eb's closure evidence
- Protected IDs require nonce to prevent snooping

## Opening a PR from this machine

Two obvious routes are dead ends here — do not spend a turn rediscovering them:
- **`gh` CLI is not installed** (`gh not found`).
- **The MCP GitHub server rejects its credentials** ("Bad credentials").

What works is the OAuth token git already uses for pushes, held by the macOS
`osxkeychain` credential helper. Read it with `git credential fill` (protocol=https,
host=github.com; the value comes back on the `password=` line) and send it as a
`Bearer` token to `POST /repos/lingolinq/LingoLinq-AAC/pulls`, with
`Accept: application/vnd.github+json`. The payload is `{title, head, base, body, draft}`.

Build that payload with `json.dumps` reading the body from a FILE rather than inlining
it: PR bodies contain backticks, quotes and newlines that shell interpolation mangles.

Handling rules for that credential:
- **Never echo it, never write it to a tracked file, never put it in a commit message or
  PR body.** Pipe it from the credential helper straight into the request header.
- Use it only for github.com API calls against this repo. It is the user's own
  credential, not a service account, so anything done with it is attributed to them.
- Opening or updating a PR is outward-facing: the user asks for it first. Pushing to a
  branch that already has an open PR updates that PR, so the same applies there.
- The same token serves any REST endpoint, so prefer it over asking the user to copy
  results out of the web UI.

## PR Preflight (MANDATORY before opening a PR or pushing to an open PR)

### P1. Claim Verification Gate
Every factual claim in the PR title, PR body, or any touched doc must be verified
against the CURRENT head, not against the plan, memory, or a prior session.
- Before writing "X is fixed/built/supported": open the file and confirm at HEAD.
- Any claim about a provider, integration, or capability (Anthropic, Gemini, SES,
  ZDR, BAA, encryption, retention) requires a fresh grep of runtime code first:
  git grep -n -i "gemini\|anthropic\|ses_\|zdr" -- lib/ app/ config/ ':!spec'
- BANNED phrases in PR bodies unless backed by a per-path test or trace:
  "both paths", "all call sites", "fully fixed", "no longer possible".
- Plans are hypotheses. If executing a plan written in another session, re-verify
  every file-level claim in the plan before implementing. This extends the
  Plans B/D read-first rule to ALL plans.

### P2. Entry-Point Enumeration (any auth/access/visibility change)
Before coding, enumerate every path to the resource:
  1. fresh server-rendered navigation
  2. client-side SPA transition (Ember)
  3. direct API call (verify with curl using raw params)
  4. offline/cached content
Enforcement lives at the server/API (Rails) layer. Client-side Ember flags are UX
polish, never the security boundary. The PR body must include:
  | Entry point | Enforced at | Test |
Any path not covered is listed under "Not covered", not omitted.

### P3. Generated Artifacts + Git Metadata (compliance/register PRs)
Run before every push (these mirror the CI job `audit-artifacts-integrity`, so a
green preflight means that job will not block the PR). Prefer the one wrapper:
  scripts/regenerate-register.sh --check   # verify only (or omit --check to regenerate)
Or the individual checks:
  ruby scripts/compliance-notion-publish.rb --check
  ruby scripts/document-register-render.rb --check
  ruby scripts/compliance-calendar-render.rb --check
  ruby scripts/compliance-publication-status.rb --check
  ruby scripts/capability-check.rb --check
  ruby scripts/register-lint.rb audit-reports/FINDINGS.json audit-reports/ember-upgrade/FINDINGS-EMBER.json  # exit 1 on a malformed register row (field shape, enum, duplicate id)
  git diff --check
  # exec-bit: only for CHANGED scripts that a doc/skill invokes DIRECTLY (./script),
  # not every non-exec file in scripts/ (most .rb/.py run via `ruby`/`python` and are
  # correctly 100644). List the directly-invoked ones explicitly, e.g.:
  #   for s in scripts/regen-ledger.sh; do
  #     git ls-files -s "$s" | awk '$1 !~ /^100755/ {print "NOT EXECUTABLE: " $4}'
  #   done
If a doc instructs running a script directly (./script, no interpreter prefix), the
executable bit is part of the PR. If a check fails, fix it in THIS PR before pushing.

**contentHash drift triage (after #766):** read whether the FAIL names an **ATTESTED**
row. Unattested → `scripts/regenerate-register.sh` and commit. Attested → stop, do
**not** run render; revert the file or ping Scot (`/re-attest-record`). See
`docs/legal/COMPLIANCE_DOCS_GUIDE.md` ("When CI is red").

### P4. Cross-Doc Consistency Sweep (touching docs/legal/** or audit-reports/**)
When changing any claim in one compliance doc:
  git grep -n -i "<subject>" -- docs/legal/ audit-reports/
Reconcile every instance in the same PR, OR list the known-stale files in the PR
body as explicit follow-ups. A register/ledger row marked "built" needs its
evidence resolvable at HEAD, never only at a historical SHA.

### P5. Honest Status Block (required in every PR body)
## Fix status
| Item | Status (Fixed / Partial: <scope> / Not fixed) | Evidence (file:line or spec) |
## Not covered by this PR
- <explicit list; "none" is acceptable only after P2>
## Author-Model: <fable-5 | sonnet-x | opus-x | haiku-x>

### P6. Behavioral Definition of Done (UI flows)
Done = the full lifecycle works: action completes, modal closes/resolves, caller
callback fires, list refreshes, success AND failure states are visible. A persisted
record with a stuck UI is a High bug, not a partial success. If you cannot execute
the flow, say so in the PR body and request a manual click-test of the SPECIFIC
steps, listed.

## Environment Setup

**Required services:**
- PostgreSQL (database)
- Redis (background jobs, caching)
- Node.js 22 (managed via nvm)
- Ruby 3.4.3
- ImageMagick (`convert`, `identify`, `montage`)
- Ghostscript (`gs`)

**Node Version Management:**
- Both `/.nvmrc` and `app/frontend/.nvmrc` specify Node 22
- `bin/ember-server` uses nvm to ensure Node 22 for the frontend dev server

**Environment variables:**
- Copy `.env.example` to `.env`
- Uncomment required variables (REDIS_URL, database config)
- Default Redis: `redis://localhost:6379/`
- AWS integrations: S3 (storage), SES (email), SNS (notifications), Elastic Transcoder (media)
- Google API: Places, Translate, Maps, TTS
- Optional: Websocket server for online status/real-time features
- Optional: OpenSymbols.org endpoint for image search

**Database setup:**
- Update `config/database.yml` for your Postgres config
- Development DB: `lingolinq-development`
- Test DB: `lingolinq-test`

## Troubleshooting

**Redis memory issues:**
```ruby
RedisInit.size_check
rake extras:clear_report_tallies
```

**Background job queue issues:**
```ruby
Worker.method_stats('queue_name')
Worker.prune_jobs('queue_name', 'method_name')
```

**Console examples:**
```ruby
b = Board.find_by_path('example/keyboard')
downs = Board.find_all_by_global_id(b.downstream_board_ids)
u = User.find_by_path('username')
s = u.log_sessions.last
bi = ButtonImage.last
```

See docs/CODE_INVESTIGATION.md for detailed debugging guidance on common problem areas.

## Testing

**Backend:**
- RSpec for model, controller, library specs
- Specs in `spec/` directory matching file structure
- Run single spec: `bundle exec rspec spec/path/to/file_spec.rb`
- Run with line number: `bundle exec rspec spec/path/to/file_spec.rb:42`

**Frontend:**
- QUnit tests via Ember testing framework
- Run: `cd app/frontend && ember test`

## Translation Management

- Translation files: `public/locales/*.json`
- Word data import tool available in admin org for inflections/parts of speech
- Template files at OpenAAC tools site for rules.json and words.json
- See docs/TRANSLATIONS.md for contributor guidelines
- Use `i18n_generator.rb` scripts to manage translation files

## Additional Notes

- Feature PRs target `develop`; promote `develop` to `staging`, then `staging` to `main`
- License: AGPLv3
- Contributor agreement required for code contributions
- OpenAAC Slack channel available for questions
- Background jobs use Resque with multiple queues: priority, default, slow, whenever

## Audit Orchestration System

This repo includes an audit orchestration system for continuous code quality, compliance, and
security-posture assessment. As of the Audit/Compliance Modernization (Phase 2, 2026-06), it
lives in the supported Claude Code layout under `.claude/` and is driven by the findings
register. The legacy top-level `skills/`, `subagents/`, and `workflows/` dirs were removed in
Phase 2; their content was migrated into the `.claude/` layout below.

### Directory Layout (current)
| Path | Purpose |
|------|---------|
| `.claude/agents/*-auditor.md` | Read-only domain finder agents (privacy, infra, api, dependency, accessibility) |
| `.claude/skills/<domain>-audit/SKILL.md` | Per-domain checklists with the register schema embedded |
| `.claude/skills/audit-run/SKILL.md` | `/audit-run` orchestrator (replaces `workflows/full-audit.md`) |
| `.claude/hooks/audit-readonly-guard.sh` | PreToolUse write-blocker wired into each finder |
| `audit-reports/FINDINGS.json` + `FINDINGS.md` | The findings register: single source of truth |
| `scripts/citation-check.rb` | Mechanical evidence validator (snippet exists at SHA) |
| `scripts/register-lint.rb` | Structural validator (field shapes, enums, id uniqueness); CI-gated |
| `scripts/audit-merge.rb` | Deterministic register reconciler (never auto-closes) |

### Running a Full Audit
1. Invoke `/audit-run` (user-only skill). It stamps the audited SHA, fans out the six
   read-only finders in parallel, reconciles results into `audit-reports/FINDINGS.json` via
   `scripts/audit-merge.rb`, runs the `adversary` agent as verifier, and validates with
   `scripts/citation-check.rb`.
2. Headline is the count of open **Critical/High** findings, NOT a 0-100 score.
3. Only Scot closes a finding, downgrades severity, or accepts risk.

### Finder Agents
| Agent | Domain | Skill loaded |
|-------|--------|--------------|
| `privacy-auditor` | GDPR/FERPA/COPPA/HIPAA privacy | `gdpr-ferpa-audit` |
| `infra-auditor` | SOC2-style security + infrastructure | `soc2-security-audit` |
| `api-auditor` | Ember<->Rails API contract | `api-contract-audit` |
| `dependency-auditor` | Dependency freshness + CVEs | `dependency-audit` |
| `accessibility-auditor` | WCAG 2.1 AA / EN 301 549 (static markup/SCSS) | `accessibility-audit` |
| `code-hygiene-auditor` | Dead code + AI-slop patterns (static Rails/Ember) | `code-hygiene-audit` |

Retired from the fan-out: `ember-stabilization` and `rails-upgrade` (migration-era, shipped)
and the `mvp-readiness` 0-100 score (replaced by open Critical/High counts).

### Ember Upgrade Audit (separate register, same machinery)
The Ember 3.28 → 5.12 upgrade shipped under-migrated (see `docs/ember-5.12-migration-findings.md`);
`/ember-audit-run` (`.claude/skills/ember-audit-run/SKILL.md`) hunts residual upgrade
regressions. It fans out the read-only `ember-upgrade-auditor` finder across seven codebase
slices (checklist: `.claude/skills/ember-upgrade-audit/SKILL.md`; knowledge base:
`docs/ember-upgrade/KNOWN-ISSUES.md`), optionally ingests a Playwright runtime crawl
(`scripts/ember-route-crawl.mjs`), and reconciles into
`audit-reports/ember-upgrade/FINDINGS-EMBER.json` — a **separate register** from the
compliance one (engineering findings must not pollute the compliance Critical/High headline)
using the same `audit-merge.rb`/`citation-check.rb` machinery and the same governance
(only Scot closes/downgrades/accepts).

### Audit Rules
- Finders are read-only by construction: `tools: Read, Grep, Glob, Bash` (no Edit/Write) plus a
  PreToolUse hook that blocks mutating Bash. They report; they never fix.
- The register (`audit-reports/FINDINGS.json`) is the single source of truth. `audit-merge.rb`
  only ever ADDS findings or marks them `open`; it never closes or downgrades.
- **Restamping `meta.auditedSha` is a governance act, not a side effect of adding a finding.** The
  pointer means "/audit-run audited the WHOLE tree at this SHA" and moving it needs Scot's sign-off
  plus an analysis of the intervening commits (see `meta.auditedShaPriorNote`). Only a real
  whole-tree `/audit-run` passes `--sha` bare. Any other addition uses
  `audit-merge.rb --sha <trueCommit> --no-restamp`, which anchors `evidence.sha` at the real commit
  while leaving `meta` untouched; `promote-finding.rb` never touches the pointer at all. Never
  pass the register's existing `auditedSha` just to dodge the restamp - that silently anchors the
  new evidence to a commit it was never verified against, and passes citation-check green whenever
  the snippet happens to sit on the same line in both commits.
- No student/patient data ever appears in findings; evidence snippets are code only.
- Compliance content is **Tier 2**: the register is PII-free (code evidence only), so any approved reviewer is permitted; the data-bearing-path guard (`codex-review-guard.sh`), not a Claude-only rule, is the boundary.
- All findings include file paths and line numbers, anchored to the audited commit SHA.
