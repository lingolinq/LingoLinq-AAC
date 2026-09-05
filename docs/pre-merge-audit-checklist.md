# Pre-Merge Audit Checklist

A pre-emptive sweep to run against every PR **before** opening it for
review against `develop`. Designed to surface the class of findings
that have historically blocked merges in this repo (feature-flag
gaps, orphan refs after removals, dynamic i18n keys, missing tests,
N+1 regressions, role-gate omissions, accessibility regressions) so
they get fixed by the author rather than caught by the reviewer.

> **This is NOT the full audit.** The full audit is the `/audit-run`
> skill ([`.claude/skills/audit-run/SKILL.md`](../.claude/skills/audit-run/SKILL.md)),
> which fans out the read-only domain finders and reconciles results
> into the findings register; that's for periodic/release-prep cycles.
> This doc is the per-PR smoke test that complements it.

> **Adversarial framing.** Per Scot's governance note, sensitive-path
> PRs go through `/review-pr + /adversary-review` (Phase 1 dual
> review). This checklist is structured so that **Tier 3 is what the
> adversarial reviewer will actually run** — the author is expected
> to run it on themselves first. The cooperative checks (Tier 2,
> Tier 4) catch hygiene mistakes; the adversarial sweep (Tier 3)
> catches the *substantive* failures the cooperative checks
> structurally cannot — missing authz, untrusted-data trust,
> implicit guarantees lost during removal, tests passing for the
> wrong reason. Going into a dual review without having run Tier 3
> on yourself first is asking for the kind of finding that gets you
> blocked.

## Table of contents

1. [When to run](#when-to-run)
2. [How to use this doc](#how-to-use-this-doc)
3. [Tier 1 — Automated checks (run as a script)](#tier-1--automated-checks-run-as-a-script)
4. [Tier 2 — Pattern-based sweeps (judgment + grep)](#tier-2--pattern-based-sweeps-judgment--grep)
   - [2.1 Feature flags](#21-feature-flags)
   - [2.2 Orphan sweep after removals](#22-orphan-sweep-after-removals)
   - [2.3 Test coverage delta](#23-test-coverage-delta)
   - [2.4 i18n key audit](#24-i18n-key-audit)
   - [2.5 Offline / error / empty state coverage](#25-offline--error--empty-state-coverage)
   - [2.6 N+1 and query performance](#26-n1-and-query-performance)
   - [2.7 Role / permission gates](#27-role--permission-gates)
   - [2.8 Accessibility regressions](#28-accessibility-regressions)
   - [2.9 Style / SCSS hygiene](#29-style--scss-hygiene)
   - [2.10 LEARNINGS pattern checks](#210-learnings-pattern-checks)
5. [Tier 3 — Adversarial sweep (red-team your own PR)](#tier-3--adversarial-sweep-red-team-your-own-pr)
   - [3.0 Mindset shift](#30-mindset-shift)
   - [3.1 Threat surface inventory](#31-threat-surface-inventory)
   - [3.2 Authorization probes (role × resource matrix)](#32-authorization-probes-role--resource-matrix)
   - [3.3 Input fuzzing at trust boundaries](#33-input-fuzzing-at-trust-boundaries)
   - [3.4 State corruption probes (concurrency / mid-save / multi-tab)](#34-state-corruption-probes-concurrency--mid-save--multi-tab)
   - [3.5 Trust boundary analysis](#35-trust-boundary-analysis)
   - [3.6 Removed code: implicit guarantees lost](#36-removed-code-implicit-guarantees-lost)
   - [3.7 External dependency failure modes](#37-external-dependency-failure-modes)
   - [3.8 Privacy / compliance regression](#38-privacy--compliance-regression)
   - [3.9 Production-only behaviors (Sprockets / CSP / asset pipeline)](#39-production-only-behaviors-sprockets--csp--asset-pipeline)
   - [3.10 Supply chain](#310-supply-chain)
   - [3.11 Migration safety](#311-migration-safety)
   - [3.12 Tests pass for the right reason](#312-tests-pass-for-the-right-reason)
   - [3.13 Red-team prompts (open questions you must be able to answer)](#313-red-team-prompts-open-questions-you-must-be-able-to-answer)
6. [Tier 4 — Process hygiene](#tier-4--process-hygiene)
7. [Tools: installed, available, recommended](#tools-installed-available-recommended)
8. [Maintenance — how to update this checklist](#maintenance--how-to-update-this-checklist)

---

## When to run

| Trigger | Run | Why |
|---|---|---|
| Before opening a PR against `develop` | Tier 1 + Tier 2 + Tier 4 | Catch hygiene blockers before review |
| Before opening a PR touching a [sensitive path](#46-dual-review-for-sensitive-paths) (security / AI / user data / feature flags / mailers / tree/bulk/global_id/board/board_content/SlowWorker) | Tier 1 + Tier 2 + **Tier 3** + Tier 4 | Dual-review will run Tier 3 on you; better to find it first |
| Before opening any PR ≥ 10 files | Tier 1 + Tier 2 + **Tier 3** + Tier 4 | Large PRs have more attack surface than the author can comprehensively self-audit; Tier 3 is the methodology that catches what skimming misses |
| After every round of review fixes | Re-run whichever tier(s) the review touched | Fixes can introduce new debris, and a fix to a Tier 3 finding can introduce a Tier 2 regression |
| Before committing a hotfix to a release branch | Tier 1 + Tier 2.1 (flags) + Tier 2.6 (N+1 if touching list endpoints) + Tier 3.6 (removed-code guarantees) | Hotfix scope is narrower but Tier 3.6 is non-negotiable — hotfixes that delete code are the highest-risk class |
| Periodic / release prep | Run the `/audit-run` skill instead | This checklist is per-PR scope; the full audit is repo-wide |

## How to use this doc

Each item is one of two severities:

- **🔴 BLOCK** — failing this means the PR cannot merge until fixed. These are the patterns that have actually blocked merges in this repo (Scot-review findings, LEARNINGS Critical patterns).
- **🟡 WARN** — failing this gets flagged in the PR description for reviewer consideration. May be intentional, but author must explain.

For each item, the "Why" line cites either a past PR finding (with PR# or commit hash where available) or a LEARNINGS pattern. **Read the linked LEARNINGS entry before deciding "N/A"** — most "N/A" calls turn out to apply once you read the pattern.

---

## Tier 1 — Automated checks (run as a script)

Copy-paste this block before opening a PR. All of these are already wired into [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and will fail CI if broken, but running locally is faster than waiting for CI feedback.

```bash
# From repo root. Backend.
bundle exec rspec --fail-fast              # backend tests
bundle exec brakeman --no-pager            # Rails SAST
bundle exec bundle-audit check --update    # gem CVEs
bundle exec rubocop --parallel             # Ruby style (NOT in CI yet — see Tier 3.6)

# Frontend.
cd app/frontend
npm run lint:js                            # ESLint
npm run lint:hbs                           # ember-template-lint
npx ember test                             # Ember tests (Chrome Headless)
npx ember build --environment=production   # catch prod-only Sprockets / asset issues
npm audit --omit=dev                       # frontend CVEs (prod deps only)

# Secrets — quick sweep
cd ..
git diff --name-only develop...HEAD | xargs gitleaks detect --no-git --redact -s 2>&1 | head -20

# i18n — verify generator picks up your new keys
ruby i18n_generator.rb --dry-run            # see §2.4
```

If any of these fail, **stop and fix before continuing to Tier 2**. The Tier 2 sweeps assume the code at least builds and passes type/lint checks.

---

## Tier 2 — Pattern-based sweeps (judgment + grep)

### 2.1 Feature flags

**🔴 BLOCK — Every new user-facing surface must be behind a feature flag.**

| Check | How |
|---|---|
| New template blocks for end-users? | `git diff develop...HEAD -- '*.hbs'` — for any new visible UI, grep [`lib/feature_flags.rb`](../lib/feature_flags.rb) for a flag that wraps it. If none exists, ADD one to `AVAILABLE_FRONTEND_FEATURES` and conditionally to `ENABLED_FRONTEND_FEATURES`, then gate the template + JS. |
| New action handler called from a user-triggered button? | Wrap the handler in `if(this.get('app_state.feature_flags.<flag>'))` or refuse the action when flag is off. |
| New API endpoint that exposes new functionality? | Backend-side flag check at controller entry. |

**Why:** AAC users get disoriented by surprise UI changes. Per CLAUDE.md "Feature Flags" section, this is a hard rule. Past offender: PR #284 (Customize Menu) shipped enabled-for-all — Scot flagged as Sec 1 Critical. Gate is at [`board-detail.hbs:2878-2945`](../app/frontend/app/templates/user/board-detail.hbs) + [`board-detail.js:6186-6202`](../app/frontend/app/controllers/user/board-detail.js).

**Diagnostic shortcut:** `grep -E "AVAILABLE_FRONTEND_FEATURES|ENABLED_FRONTEND_FEATURES" lib/feature_flags.rb` — if your new surface name doesn't appear in both arrays, the gate doesn't exist.

---

### 2.2 Orphan sweep after removals

**🔴 BLOCK — A "removed" feature isn't removed until every coupled site is gone.**

| Site family | How to check |
|---|---|
| Control / input / button itself | Manual confirmation it's deleted from the template |
| Preview / hint / help-text mentions of the control on the same page | `grep -i "<feature-name>" path/to/template.hbs` |
| Conditional render blocks gated on the control's state | `grep "attributable_<feature>_type\|<feature>_options\|set<Feature>" path/to/template.hbs` |
| Controller members reachable only from the removed UI | `grep "<feature-name>" app/frontend/app/components/<component>.js` — for every match, find what consumes it; if nothing does, delete |
| Tests that exercised the removed flow | `grep -rn "<feature-name>" app/frontend/tests/` — update or delete |
| Default model state when the field is locked | Verify model init still sets a sane default; verify save flow still produces server-acceptable payloads |

**Why:** Past Sec 1 Critical: PR #284 said boardPicker was removed but [`application.js:147-785`](../app/frontend/app/controllers/application.js) and [`tests/controllers/application-test.js:256-345`](../app/frontend/tests/controllers/application-test.js) still hold picker state + assertions on staging head. See LEARNINGS pattern [Removing a UI feature is incomplete until every coupled site is removed](task-management/LEARNINGS.md#pattern-removing-a-ui-feature-is-incomplete-until-every-coupled-site-is-removed) — distilled from [2026-05-27-create-board-remove-license.md](task-management/2026-05-27-create-board-remove-license.md).

**Diagnostic shortcut:** `git diff develop...HEAD --name-only -- '*.hbs' | xargs -I {} basename {} | sed 's/\.hbs$//'` to list the templates you removed UI from, then `grep -rn "<feature-name>"` across the entire repo for each. If results are in (a) the same file's other locations or (b) the matching JS controller, those are orphans. If they're in unrelated components, those are SEPARATE consumers — leave them.

---

### 2.3 Test coverage delta

**🔴 BLOCK — Every changed user-facing component must ship with at least one test exercising the change.**

| Check | Threshold |
|---|---|
| Files changed in this PR | Run `git diff --stat develop...HEAD app/frontend/app/components/ app/controllers/` |
| New tests added in this PR | Run `git diff --stat develop...HEAD app/frontend/tests/ spec/` |
| Ratio | If <changed files> ≥ 5 AND <new tests> ≤ 1, this is a BLOCK — same pattern Scot called Sec 1 High on PR #281 |

**Why:** PR #281 shipped 60+ frontend files with ~1 new test. Scot's High finding: no integration coverage for `create-board-new`, `board-preview-canvas`, `dashboard`, SPA-transition. The minimum bar is **one happy-path test per significant user flow that the PR touches**.

**Where new tests go:**
- Frontend integration: `app/frontend/tests/integration/components/<component>-test.js`
- Frontend acceptance: `app/frontend/tests/acceptance/<flow>-test.js`
- Backend model/controller: `spec/models/`, `spec/controllers/`

**Diagnostic shortcut:** `git diff develop...HEAD --name-only | grep -E "(components|controllers)/" | wc -l` vs `git diff develop...HEAD --name-only | grep -E "tests/|spec/" | wc -l`.

---

### 2.4 i18n key audit

**🔴 BLOCK — All user-facing strings use `{{t "..." key="..."}}` / `i18n.t('key', "default")` with LITERAL keys, never dynamic.**

| Check | How |
|---|---|
| New user-facing strings hard-coded without i18n | `git diff develop...HEAD -- '*.hbs' '*.js' | grep -E '^\+' | grep -vE 'key=|i18n\.t|aria-label.*\{\{t ' | grep -E '[A-Z][a-z]+ [A-Z][a-z]+'` — quick heuristic for two-word capitalized strings that look like UI copy |
| Dynamic `{{t group.section ...}}` keys | `git diff develop...HEAD -- '*.hbs' | grep -E '\{\{t [a-z][a-zA-Z._]*[^"\}]'` — anything starting with `{{t ` followed by a property reference instead of a literal string |
| Translation file coverage | After authoring strings, run `ruby i18n_generator.rb` and `git diff app/frontend/public/locales/en.json` — every new key should appear |
| Single vs double quote convention | `git diff develop...HEAD -- '*.js' | grep "^\+" | grep "i18n\.t([^']" ` — user-facing must use double quotes |

**Why:** PR #284 used dynamic `{{t group.section...}}` keys for the Customize Menu — `i18n_generator.rb` parses templates statically and can only see literal keys. Only 3 of 23 keys made it into `en.json`. Non-English locales now miss 20 strings. Scot's High finding.

**The rule:** `i18n_generator.rb` extracts ONLY literal keys. Dynamic keys produce no entry in `en.json`. If you genuinely need a key computed at runtime (e.g. per-tab labels), declare all the possible keys as literals in a hidden block or a JS constant the generator can see — never compute the key string itself. Per CLAUDE.md "Internationalization":

```hbs
{{!-- BAD — i18n_generator can't see what `group.section` resolves to --}}
{{t group.section "default"}}

{{!-- GOOD — literal key always extractable --}}
{{#if (is-equal group "ui")}}{{t "section.ui" "User Interface"}}{{/if}}
{{#if (is-equal group "audio")}}{{t "section.audio" "Audio"}}{{/if}}
```

---

### 2.5 Offline / error / empty state coverage

**🟡 WARN — Any new view that fetches data must render an explicit offline/error/empty state, never a silent blank.**

| Check | Trigger |
|---|---|
| New component that does a `store.findRecord` / `fetch` / network call | Must have an `if (error)` branch with user-visible copy, AND an `if (no_results)` branch |
| New offline-cacheable view (board preview, label preview, dashboard tile) | Must render an offline indicator when cache-miss + no network — blank cells are indistinguishable from a bug |
| Loading state | A spinner is fine, but blank-with-no-spinner is not |

**Why:** PR #282's preview-canvas offline path renders blank cells with no offline indicator at [board-preview-canvas.js:188-218, 359-364](../app/frontend/app/components/board-preview-canvas.js) — cache-miss + no network looks identical to a bug. Scot's High finding.

**The rule:** "blank" is a state, not the absence of state. Every fetch has three failure modes — no network, network-ok-no-data, network-ok-data-stale — and the UI must visually distinguish each so the user knows whether to retry, wait, or report.

---

### 2.6 N+1 and query performance

**🔴 BLOCK — Any list endpoint touched by this PR must ship with `.includes(...)` for every association the serializer touches, AND a query-count spec.**

| Check | How |
|---|---|
| Did this PR change any controller that returns a list (index actions, search results, paginated feeds)? | `git diff develop...HEAD --name-only -- 'app/controllers/**index*.rb' 'app/models/**.rb' 'lib/json_api/**.rb'` |
| If yes — does the controller `.includes(...)` every association the JSON serializer reads? | Read the serializer in `lib/json_api/<model>.rb`, list every `.<association>` access, confirm each is in the controller's `.includes(...)` |
| Is there a query-count spec? | `grep -rn "query_count\|assert_queries\|expect.*queries\|prosopite" spec/controllers/` |

**Why:** Scot's Med-High finding on [`BoardsController#index`](../app/controllers/api/boards_controller.rb) — N+1 worsened after My Boards + preview changes. List-endpoint N+1s regress silently because each request is "only" a few extra queries, but at scale (Resque jobs, search, dashboard) they compound. Once a regression ships there's no automated detector unless you wrote one.

**Recommended tooling** (not currently installed in this repo): the [`prosopite`](https://github.com/charkost/prosopite) gem auto-detects N+1 with zero false positives by comparing query call-stacks + fingerprints. Per the prosopite README, in `test.rb` + `spec_helper.rb` you can configure tests with N+1 queries to fail automatically — `scan` / `finish` run before/after each test. This would have caught the BoardsController regression as a failing spec. See [Tools](#tools-installed-available-recommended) for installation steps.

**Diagnostic shortcut (manual)**: open a Rails console with `bin/audit_console`, do `User.find_by_path('test_user').reload`, then run the index endpoint with `ActiveRecord::Base.logger = Logger.new(STDOUT)` — count repeated `SELECT ... WHERE <association>_id = ?` for the same association across rows. If the count > 1 per row, that's an N+1.

---

### 2.7 Role / permission gates

**🔴 BLOCK — Every UI flow gated on user role uses the canonical check, not a hand-rolled one.**

| Check | How |
|---|---|
| Templates: gating on supporter/communicator role | `git diff develop...HEAD -- '*.hbs' | grep -E "currentUser\.role|sessionUser\.role|preferences\.role"` — these are NOT the canonical guard; use `supporter_role` instead |
| Compound role gates | If the condition combines two boolean checks, prefer inline `{{#if (and X Y)}}` over a new computed property (codebase convention) |
| `sessionUser` vs `currentUser` choice | Boot-early components (e.g. create-board-new) use `sessionUser`; settled-route components use `currentUser`. Match the surrounding code |

**Why:** Scot's Phase D #19 — communicator accounts saw a supporter-only prompt because the gate was `show_user_options` alone, missing the role check. See LEARNINGS pattern [`!supporter_role` is the canonical communicator gate](task-management/LEARNINGS.md#pattern-supporter_role-is-the-canonical-communicator-gate--never-invent-a-communicator_role-boolean) — distilled from [2026-05-27-create-board-communicator-for-someone-else.md](task-management/2026-05-27-create-board-communicator-for-someone-else.md).

**The rule:** `preferences.role == 'supporter'` exposed as `<user>.supporter_role` is the canonical check. Communicators AND unspecified-role users both fall into `!supporter_role`. Never invent a `communicator_role` boolean — there is a string label by that name in [`caseload.hbs:202`](../app/frontend/app/templates/caseload.hbs#L202) but it is NOT a guard. Backend equivalent: `User#supporter_registration?`.

---

### 2.8 Accessibility regressions

**🟡 WARN — Every new interactive element has a visible focus ring, an accessible label, and keyboard activation.**

| Check | How |
|---|---|
| New `<button>` / `<a>` / `role="button"` | Must have `aria-label` or visible text |
| New non-native interactive (div/span with `{{action}}`) | Must have `role="button"` + `tabindex="0"` + keydown handler for Space/Enter (see [`raw_events.js:178-189`](../app/frontend/app/utils/raw_events.js) for the existing keyboard activation pattern on `.md-board-detail-symbol-card`) |
| `outline: none` in new CSS | Must be paired with `:focus-visible` override providing an accessible focus ring (per the `_focus.scss` mixins referenced in Scot's review) |
| New SVG icon | Must have `aria-hidden="true"` if decorative OR `aria-label` if interactive |
| New form input | Must have an associated `<label for="...">` |

**Why:** Scot's Accessibility category called out missing `_focus.scss` mixins, unpaired `outline: none` rules, and missing keyboard activation. AAC users disproportionately rely on assistive tech; an accessibility regression here is a feature regression.

**Diagnostic shortcut:** `git diff develop...HEAD -- '*.hbs' | grep -E "^\+.*\{\{action " | grep -v -E "(button|<a |<input|role=\"button\")"` — any `{{action}}` on a non-button without `role="button"` is a likely violation.

---

### 2.9 Style / SCSS hygiene

**🟡 WARN — Edit existing selectors; never stack overrides.**

| Check | How |
|---|---|
| New `!important` declarations | `git diff develop...HEAD -- 'app/frontend/app/styles/app.scss' | grep "^+" | grep "!important"` — every match needs a comment explaining why no other approach works |
| New override-of-existing-selector blocks | If your change targets an element that already has rules elsewhere in `app.scss`, find the existing selector and edit it in place rather than adding a more-specific override. Per CLAUDE.md Rule #0.7 |
| Duplicate selectors | `grep -n "^\.md-board-detail-symbol-card {" app/frontend/app/styles/app.scss` (substitute your selector) — if more than one match, the LATER copy wins, the earlier is dead. See LEARNINGS pattern [`app.scss contains byte-identical duplicate rules`](task-management/LEARNINGS.md#pattern-appscss-contains-byte-identical-duplicate-rules--the-later-copy-wins) |
| Mixed-unit `clamp()` math | `git diff develop...HEAD -- 'app/frontend/app/styles/' | grep -E "clamp\([^)]*[a-z]+ *\+" | grep -vE "calc\("` — SassC can't evaluate `px + vw` etc. unless wrapped in `calc()`. Per CLAUDE.md "CSS / SCSS" |
| Sass `lighten()` / `darken()` calls | `git diff develop...HEAD -- '*.scss' | grep "^+.*\(lighten\|darken\)("` — deprecated; use `color.adjust()` per Scot's Miscellaneous note |

**Why:** SCSS hygiene fails are silent — they compile and render, but they leave the next person debugging cascade conflicts. The most expensive instance was [LEARNINGS pattern `duplicate selectors in app.scss can leave stale layout constraints active`](task-management/LEARNINGS.md#pattern-duplicate-selectors-in-appscss-can-leave-stale-layout-constraints-active).

---

### 2.10 LEARNINGS pattern checks

**🟡 WARN — Skim the LEARNINGS.md index; for each pattern, confirm "not applicable" or apply the check.**

Read [`docs/task-management/LEARNINGS.md`](task-management/LEARNINGS.md). For every pattern, write either:

- **N/A** with a one-line reason (e.g. "no SVG changes, so SVG-gradient pattern doesn't apply")
- **Applied** with where in the diff you verified (e.g. "drag-and-drop touch-action — added to new draggable cell at app.scss:NNNN")

Patterns that recur most across past PRs (read these first):

| Pattern | Catches |
|---|---|
| [Pass-through actions silently truncate args](task-management/LEARNINGS.md#pattern-pass-through-actions-silently-truncate-args-when-the-wrappers-signature-has-fewer-named-params) | Any new wrapper component that forwards Ember actions — must use `arguments` / rest, not named params |
| [HTML5 drag suppressed by nested `<button>`](task-management/LEARNINGS.md#pattern-html5-drag-and-drop-suppressed-by-nested-button-children) | Any new draggable tile with nested interactive children |
| [Custom-JS drag fails in touch emulation](task-management/LEARNINGS.md#pattern-custom-js-drag-works-on-desktop-but-not-in-touch-emulation--root-cause-is-touch-action-not-the-js) | Any new draggable surface — needs `touch-action: none` on the draggable element |
| [SVG gradient IDs mangled by Sprockets in production](task-management/LEARNINGS.md#pattern-svg-gradient-id-refs-inside-css-data-uris-mangled-by-rails-sprockets-in-production) | Any new SVG gradient — verify with `npx ember build --environment=production` not just dev |
| [`__label-collapsed` is a multi-role class — scope by parent](task-management/LEARNINGS.md#pattern-__label-collapsed-is-a-multi-role-class--scope-by-parent-before-styling) | Any new selector on a shared class name |
| [Settings-backed API flags should be cast](task-management/LEARNINGS.md#pattern-settings-backed-api-flags-should-be-cast-before-ember-consumes-them) | Any new feature flag that round-trips through `User#preferences` |
| [A single-quoted `i18n.t` default silently DELETES the key](task-management/LEARNINGS.md#gotcha-a-single-quoted-i18nt-default-silently-deletes-the-key-on-the-next-generator-run) | Any new/edited `i18n.t(...)` call — a single-quoted default makes the generator drop the key (and all 13 locales' translations) on its next run, while reporting success |

**Mechanical check — new `i18n.t` calls must double-quote the user-facing default:**

```bash
# Any hit in YOUR diff is a latent key-deletion landmine. Fix to: i18n.t('key', "Default")
git diff --unified=0 origin/staging... -- 'app/frontend/app/**/*.js' \
  | grep -E "^\+.*i18n\.t\('[a-zA-Z0-9_]+', *'"
```

> Baseline as of 2026-07-16: ~291 pre-existing single-quoted defaults across ~69 files (see `d71fe1c87`).
> They survive only because those keys are *also* referenced with a correct double-quoted default
> elsewhere — so don't "fix" the count, just don't ADD to it.
>
> **Before running `ruby i18n_generator.rb --generate`:** do not trust its `TOTAL MISSING 0` output.
> Regenerate, then diff the key set against every key actually referenced in source. On 2026-07-16
> a clean-looking run deleted 286 keys, 17 still in use.

> **The LEARNINGS doc is INPUT to this checklist, not just OUTPUT.** Per [feedback_learnings_doc_workflow](../../.claude/projects/-home-tracid-LingoLinq-AAC/memory/feedback_learnings_doc_workflow.md), every researched fix opens a task-management log with a `## Prior LEARNINGS consulted` section. If you can't fill that section in for this PR, you haven't done the audit.

---

## Tier 3 — Adversarial sweep (red-team your own PR)

### 3.0 Mindset shift

Tier 2 is **cooperative**: "did I, the author, do the right things?"

Tier 3 is **adversarial**: "what's wrong with this code that I, the author, didn't notice?" It is structurally what an adversarial reviewer will run on your PR. The point of running it on yourself first is not to make Tier 3 unnecessary — the reviewer still runs it independently — but so that the findings you fix at this stage are findings you don't argue about in the PR.

The shape of adversarial findings in this repo (per Scot's review history + the LEARNINGS doc) is almost always one of these failure modes:

1. **Silent wrong behavior.** Code runs without error but does the wrong thing — pass-through actions truncate args, touchmove preventDefault is silently ignored, tests pass against the wrong code path. The LEARNINGS doc has *eleven separate "silently" patterns* — when an adversary asks "what could go wrong here?", "silently does the wrong thing" is the modal answer.
2. **Trust violations.** Code trusts client-provided data that it shouldn't (role flags, IDs, sanitization), OR doesn't trust internal-code guarantees that it should (over-validating creates false-negative bugs).
3. **Implicit invariants.** Code assumes something that isn't enforced — that `sessionUser` is hydrated, that the feature flag won't flip mid-session, that the array won't be empty, that the supervisee actually has edit permission.
4. **Authz gaps.** UI check without server check, server check on one route but not the sibling route, role-string check that misses unspecified-role users.
5. **Removed-code debris.** Deleted code provided implicit guarantees that are now gone — a sanitize() that prevented XSS, a permission check that prevented IDOR, an audit log that satisfied compliance.

Each subsection below names a specific failure-mode family and the probe questions to ask.

> **How long this takes.** A first-time Tier 3 sweep on a substantive PR (≥10 files) is 30–60 minutes. After you've done it a few times the questions become reflexive and most of the time goes to the items you can't immediately answer. Do not skip it on the theory that "this PR is small" — small PRs are exactly where authz gaps hide, because the author looks once and assumes the surface is too narrow to matter.

---

### 3.1 Threat surface inventory

**🔴 BLOCK — Before reviewing line-by-line, enumerate the new attack surface.**

Open the PR description (or scratch file) and produce these lists from the diff:

| Surface | Question | How to enumerate |
|---|---|---|
| New endpoints | What controller actions / API routes did this PR add? | `git diff develop...HEAD -- 'config/routes.rb' 'app/controllers/'` and grep new `def <action>` lines |
| New UI flows | What new user-triggerable actions were added? | `git diff develop...HEAD -- '*.hbs' \| grep -E '^\+.*\{\{action '` |
| New data fields | What model/serializer fields were added or surfaced? | `git diff develop...HEAD -- 'app/models/' 'lib/json_api/' 'db/migrate/'` |
| New trust boundaries | What new "client → server" or "user A → user B" data flows were added? | Manually trace each new endpoint: who is the caller, who is the data subject, are they the same person? |
| Removed code paths | What was deleted? What was that code preventing? | `git diff develop...HEAD \| grep -E '^-' \| grep -E 'def \|function \|sanitize\|allowed\?\|permit\(\|secure_serialize\|encrypt'` — focus on anything that looked like a guard |

**Why this BLOCKs:** an adversary will produce this list themselves and run §3.2–3.7 against it. If you can't produce the list, you can't have audited the change you wrote.

**Output format** — a brief inventory the reviewer can sanity-check, e.g.:

```
New endpoints:    POST /api/v1/boards/:id/customize_layout
New UI flows:     customize-menu (template), customize-menu-trigger (button), reset-layout action
New data fields:  Board#layout_overrides (JSON), BoardCustomization model + .visible / .position
Trust boundaries: customize_layout reads layout_overrides FROM the client and writes to Board owned by current_user.
                  Need to verify: current_user CAN edit this board (not just owns; supervisor with edit perm should also work).
Removed:          none in this PR
```

---

### 3.2 Authorization probes (role × resource matrix)

**🔴 BLOCK — Every new code path verified against every role × resource combination, with the negative cases tested.**

For each new endpoint/UI flow from §3.1, walk the matrix:

| Role of caller | Resource owner | Expected | Tested? |
|---|---|---|---|
| Communicator | Self | Allow | |
| Communicator | Another communicator (no supervision) | Deny | |
| Supporter | Supervisee with edit perm | Allow | |
| Supporter | Supervisee WITHOUT edit perm | Deny | |
| Supporter | Stranger (no supervision relation) | Deny | |
| Unspecified-role user | Self | Same as communicator (per LEARNINGS [`!supporter_role` gate](task-management/LEARNINGS.md#pattern-supporter_role-is-the-canonical-communicator-gate--never-invent-a-communicator_role-boolean)) | |
| Logged-out | Anyone | Deny (or public-board-only, if applicable) | |
| Admin / org-admin | Any | Per `add_permissions` rules — verify intent | |

Failures the adversary will find:

- **UI gate without server gate.** The template hides a button from communicators, but the underlying API endpoint accepts any authenticated user. Hide-in-UI is not authz; it's UX. The endpoint MUST re-check via `allowed?(user, 'edit')` or equivalent on the server.
- **IDOR.** The endpoint takes a resource ID from the URL. Does it verify the ID belongs to a resource the caller can access, or does it just `Resource.find_by_global_id(params[:id])` and trust the result? Try fetching another user's resource by guessing/incrementing the ID.
- **Role string vs canonical check.** `if user.preferences.role == 'communicator'` misses unspecified-role users. The canonical gate is `!user.supporter_role`. Search the diff for any string-comparison of role.
- **Sibling-route inconsistency.** PR adds a guard to `GET /boards/:id/customize` but a sibling `POST /boards/:id/customize_bulk` exists without the guard. Always check whether the new endpoint has siblings that share its risk class.
- **Mass assignment.** `params.permit(:layout_overrides, :owner_id)` — `owner_id` allows a user to write data to ANOTHER user's record. Permit only the fields the user is entitled to mutate.

**Diagnostic commands:**

```bash
# Find new controller actions without a visible permission check
git diff develop...HEAD -- 'app/controllers/' | grep -E '^\+\s*def ' | head
git diff develop...HEAD -- 'app/controllers/' | grep -E 'allowed\?|permit_attributes|require_owner'

# Find new params.permit usage — review each for over-allowlisting
git diff develop...HEAD -- 'app/controllers/' | grep -E '^\+.*params.*permit'
```

---

### 3.3 Input fuzzing at trust boundaries

**🟡 WARN — Every new input has been considered against the standard adversarial input list.**

For every new form field, URL param, query string, file upload, header, or POST body field, ask:

| Input class | Examples | What it can break |
|---|---|---|
| Empty / null | `""`, `null`, `undefined` | Server crashes, null-deref, default-state assumption |
| Very long | 10,000-char string | DB column truncation, JSON serialization OOM, slow regex |
| Unicode / emoji | `"𝓗𝓮𝓵𝓵𝓸 👨‍👩‍👧‍👦"` | Surrogate-pair handling, normalization bugs, display overflow |
| Control characters | `"\x00"`, `"\r\n"` (CRLF injection in headers / logs) | Log injection, header injection, SQL terminator |
| HTML / JS | `<script>`, `<img src onerror>`, `javascript:`, SVG payloads | XSS into safe-style, innerHTML, or attribute-context |
| Path traversal | `../`, `..\\`, URL-encoded `%2e%2e` | File reads outside the intended directory |
| SQL meta | `'`, `--`, `'; DROP TABLE` | If query construction is anywhere not parameterized |
| URL schemes | `file://`, `javascript:`, `data:`, `chrome://` | Open redirect, SSRF, client-side XSS via fetched href |
| Boolean coercion | `"false"` (string), `0`, `null`, `[]` | Truthy/falsy mismatch in template gates — see LEARNINGS [`settings-backed API flags should be cast`](task-management/LEARNINGS.md#pattern-settings-backed-api-flags-should-be-cast-before-ember-consumes-them) |
| Numeric extremes | `-1`, `0`, `Number.MAX_SAFE_INTEGER + 1`, `NaN`, `Infinity` | Off-by-one, signed/unsigned overflow in DB, divide-by-zero |

For LingoLinq specifically:
- **Image URL fields**: `data:` URIs with embedded JS, `file://`, SVG with `<script>`, very large images (DoS the upload pipeline)
- **Label text**: emojis (AAC users use them heavily), zero-width chars (visual spoofing in label search), bidi override chars (visual filename-vs-display mismatch)
- **Board key / global_id**: the protected-IDs-with-nonce scheme (per CLAUDE.md) means try a valid-format ID with the wrong nonce; try the nonce of a different record; try without the nonce
- **for_user_id**: try setting it to another user's global_id and watch whether server enforces supervisee relationship server-side

**Diagnostic shortcut for templates:**
```bash
# Find any new {{safe-style}}, innerHTML, or Ember triple-stash {{{...}}} that could be XSS vectors
git diff develop...HEAD -- '*.hbs' | grep -E '^\+.*(safe-style|innerHTML|\{\{\{)'
git diff develop...HEAD -- '*.js' | grep -E '^\+.*\.innerHTML\s*='
```

---

### 3.4 State corruption probes (concurrency / mid-save / multi-tab)

**🟡 WARN — Every new stateful action handles the concurrent / interrupted / out-of-order cases.**

This is the LEARNINGS [`stale Ember dev bundle`](task-management/LEARNINGS.md#pattern-its-broken-symptoms-that-vanish-on-re-test--stale-ember-dev-bundle) pattern generalized — **state can be stale in many ways, not just dev-cache.**

| Probe | Question to answer |
|---|---|
| Double-click | If the user double-clicks the save button, does the action fire twice? Does the second fire run against partially-updated state? |
| Mid-save navigation | If the user clicks save then immediately navigates away, does the optimistic UI update get rolled back on failure? Does the destination route see consistent state? |
| Multi-tab | Open the same board in two tabs. Edit in tab A, edit in tab B, save tab B, then save tab A. What wins? Is there a conflict UI? |
| Offline mid-action | Toggle the network to offline mid-save. Does the action queue and retry, or silently lose data, or show a confusing partial state? |
| Background sync race | The user is editing a board; the background sync pulls down a server-side change to the same board. What happens to the in-flight edit? (LingoLinq's offline-sync model means this is real, not hypothetical.) |
| `model.save()` rejection | What happens if the server returns 422/500? Is the user shown an actionable error, or does the UI silently show success? |
| Feature flag flip mid-session | If `app_state.feature_flags.<flag>` changes from true → false while the user is on a page that depended on it, does the UI handle gracefully? (Important: flags can be re-fetched on sync.) |
| Ember runloop reentry | If your code does `this.set('foo', X)` inside a computed property that depends on `foo`, you've recursed. Adversary will try to find these. |

**Specific to this codebase:**
- **`persistence.sync` race**: in-flight sync + user edit → see `app/frontend/app/utils/persistence.js` for the existing conflict-resolution model and verify the new flow integrates with it
- **`extra_data` (S3-stored) timeout**: if S3 round-trips fail or are slow, does the UI degrade or hang?

---

### 3.5 Trust boundary analysis

**🔴 BLOCK — Identify every piece of client-provided data the code uses, and verify each is validated before being trusted.**

The standard trust-boundary mistakes:

1. **Trusting a client-provided ID.** Server reads `params[:user_id]` and queries `User.find(params[:user_id])` — but does it verify the *caller* is allowed to read that user? If not, IDOR.
2. **Trusting a client-provided role flag.** Client sends `{ as_supporter: true }` to bypass a check. Anything in the request body is the caller's word for it, not the server's.
3. **Trusting a hidden form field.** `<input type="hidden" name="permission" value="edit">` — the client can change it.
4. **Trusting localStorage / IndexedDB.** Anything on the client device is mutable by a determined user. Server must re-verify on any action that matters.
5. **Trusting an API response shape.** Server returns `{role: "supporter"}`. Client UI gates on it. Adversary intercepts the response (debug proxy, browser extension) and rewrites it. Any sensitive action gated only on this is bypassable — the server must re-check.
6. **Cross-origin trust.** A new `postMessage`, `iframe`, or WebSocket consumer that doesn't check origin.

For each new code path, list the inputs by trust level:

| Source | Trust |
|---|---|
| `params[:anything]` (request body / URL) | UNTRUSTED |
| Cookies | UNTRUSTED (forgeable except for HttpOnly + Secure session cookie) |
| LocalStorage / IndexedDB | UNTRUSTED |
| `request.headers[*]` | UNTRUSTED |
| `current_user.*` | TRUSTED (server-side, server-derived from session) |
| `User#supporter_role` | TRUSTED (server-side computed property over `preferences`) |
| Inter-service calls (Resque job args) | Treat as UNTRUSTED unless documented otherwise |

If you find any code path where untrusted data is used in a security-relevant decision (authz, file access, SQL fragment construction, command execution), that's a finding to fix BEFORE the adversarial reviewer finds it.

---

### 3.6 Removed code: implicit guarantees lost

**🔴 BLOCK — For every block of code deleted in this PR, identify what implicit guarantee that code provided and verify the guarantee is preserved elsewhere or genuinely no longer needed.**

Per LEARNINGS [`Removing a UI feature is incomplete until every coupled site is removed`](task-management/LEARNINGS.md#pattern-removing-a-ui-feature-is-incomplete-until-every-coupled-site-is-removed) — but extended to the SECURITY domain:

| Removed thing | Guarantee it may have provided | How to verify |
|---|---|---|
| `sanitize(...)` / `escape_html(...)` call | XSS prevention on a downstream sink | Trace every code path that fed into the removed sanitize; check each sink (innerHTML, safe-style, etc.) still has sanitization upstream |
| `allowed?(...)` / `current_user.can_*?` check | Authz | Trace every entry into the removed-guard's protected code; verify each entry has an equivalent check |
| `secure_serialize` / encryption | Privacy compliance on a sensitive field | Verify the field is no longer stored OR equivalent protection moved upstream |
| `AuditEvent.log` | Compliance audit trail | If the audited action is still possible, the audit log must be reinstated at the new code site |
| Rate limiter / throttle | DoS prevention | Verify upstream rate limiter still covers the endpoint, or that the endpoint is no longer reachable |
| Validation (`validates :foo, presence: true`) | Data integrity | Check that callers / upstream constraints prevent bad data; if not, expect a class of new bugs |
| Feature flag check | Gradual rollout safety | Verify the feature is genuinely ready for 100% — or that the flag is now elsewhere |

**Diagnostic commands:**

```bash
# Surface every deleted line that LOOKS like a guard or validation
git diff develop...HEAD | grep -E '^-' | grep -E 'allowed\?|sanitize|secure_serialize|AuditEvent|validates|permit\(|rate_limit|feature_flags' | head -40

# Surface every deleted method definition
git diff develop...HEAD | grep -E '^-\s+(def |function )' | head -20
```

For each match, you must either justify the removal (the guard is redundant because upstream X already does it) or restore it.

---

### 3.7 External dependency failure modes

**🟡 WARN — For every external service this code path touches, verify graceful degradation.**

LingoLinq depends on Postgres, Redis, S3 (extra_data, file uploads), SES (email), SNS (notifications), Elastic Transcoder, Stripe, Google APIs (Places, Translate, Maps, TTS), and optionally OpenSymbols. Plus the WebSocket server. Any new code that hits any of these must answer:

| Failure | What should happen | Verify |
|---|---|---|
| Service unreachable (network timeout) | User-visible "unavailable, try again" or queued retry — NOT a generic 500 or silent hang | Set the env var to an unreachable host locally, exercise the flow |
| Service returns 5xx | Caught and reported, not propagated as a crash | Curl `httpbin.org/status/500` as the dependency mock if possible |
| Service returns 2xx with malformed body | Caught and reported; do not crash on `JSON.parse` failure or missing fields | Mock the service returning `{}` or `null` or non-JSON |
| Service is slow (10s+) | UI shows loading indicator and does not block other actions | Throttle network to "slow 3G" in DevTools |
| Service quota exceeded (429 / rate limit) | Backoff + retry, NOT a tight loop | Examine the retry policy |
| Stripe / payment failure | Atomic rollback; user not charged AND not granted access | Use Stripe's test failure cards |

**For Resque background jobs:**
- **Idempotency**: if the job runs twice (Resque retry, manual re-enqueue), is the outcome the same as running once?
- **Retry storm**: if the job fails, how many times does it retry? Is there exponential backoff?
- **Queue starvation**: a new slow job on the `priority` queue can block higher-priority work. Match the job to the correct queue (`priority` / `default` / `slow` / `whenever`).
- **Dead-letter handling**: where does a job go after `MAX_RETRIES`? Is anyone alerted?

---

### 3.8 Privacy / compliance regression

**🔴 BLOCK — For each new data flow, verify it does not regress GDPR or FERPA compliance.**

Per CLAUDE.md "Security" section, user data is privacy-regulated. Per the existing audit infrastructure (the `privacy-auditor` finder and its [`gdpr-ferpa-audit`](../.claude/skills/gdpr-ferpa-audit/SKILL.md) skill), compliance is one of the audit domains.

| Probe | Question |
|---|---|
| New PII / PHI surfaced in UI | Does this UI show data that the viewing user has a privacy-cleared reason to see? Or is it surfaced as a side-effect of a feature designed for something else? |
| New PII in logs | Did any new `Rails.logger.info("user #{user.email} did X")` or equivalent slip in? Server logs are not PII-clean by default; emails / DOBs / locations should not be in log output |
| New PII in URLs | URLs are logged everywhere (Render access logs, browser history, referrer headers, error trackers). `GET /api/users/by_email/<email>` is a PII leak; use POST + body or use IDs |
| New `extra_data` field | The S3 extra-data system (`models/concerns/extra_data`) is for large datasets like LogSession. Does the new field belong there? Is the encrypted-URL access pattern preserved? |
| New `secure_serialize` candidate | Does the new field contain sensitive data? If yes, it must use `secure_serialize` for at-rest encryption |
| Supervisor → supervisee data access | Does the supervisor's new view show data they're entitled to under the supervision relationship? Or does it leak data outside that scope? |
| Audit trail for sensitive operations | Is there an `AuditEvent.log` call for any operation that touches PII or modifies authz? Per CLAUDE.md, console access is audited; new admin / impersonation / data-export operations should be too |
| Right-to-be-forgotten | Does this new feature store user data in a place where `User#destroy` will not cascade? (S3 extra_data, audit logs, third-party APIs.) Document the gap in the data deletion runbook |

**Diagnostic command:**

```bash
# Find any new logging that includes user-identifying expressions
git diff develop...HEAD | grep -E '^\+' | grep -E 'logger\.(debug|info|warn|error).*user\.(email|name|phone|date_of_birth|address|location)' | head -10

# Find any new URLs that take user-identifying params
git diff develop...HEAD -- 'config/routes.rb' | grep -E '^\+.*(:email|:phone|:name)'
```

---

### 3.9 Production-only behaviors (Sprockets / CSP / asset pipeline)

**🟡 WARN — Production build differs from dev build in ways that have caused incidents.**

Per LEARNINGS [`SVG gradient IDs mangled by Sprockets in production`](task-management/LEARNINGS.md#pattern-svg-gradient-id-refs-inside-css-data-uris-mangled-by-rails-sprockets-in-production), there's a known class of issues where dev-build works fine and prod-build silently mangles. Anything new in this PR that involves:

- **SVG gradients with `url(#id)` references** (especially inside CSS data URIs) — verify prod build at `npx ember build --environment=production` and grep the compiled CSS for the id refs
- **Cross-file class references via CSS interpolation** — Sprockets fingerprinting can break runtime-constructed selectors
- **CSP-affecting changes** — new `eval`, new `unsafe-inline` styles, new external script loads
- **Subresource integrity** — new CDN script without an `integrity=` attribute
- **Sass compression behaviors** — CLAUDE.md notes `:sass` compression is disabled in production (`config.assets.css_compressor = nil`). Do not re-enable; see `docs/CSS_SCSS_GUIDELINES.md`
- **Asset fingerprinting on dynamic paths** — any URL constructed at runtime from a fingerprinted name needs the fingerprint resolution helper

**Verify locally:**
```bash
cd app/frontend
npx ember build --environment=production
# Inspect dist/assets/*.css for the specific selectors / IDs your PR touches
```

---

### 3.10 Supply chain

**🟡 WARN — Every new dependency vetted before merge.**

| Check | How |
|---|---|
| Did this PR add any new gem / npm package? | `git diff develop...HEAD -- 'Gemfile' 'Gemfile.lock' 'app/frontend/package.json' 'app/frontend/package-lock.json'` |
| For each new dep: maintained? | Check the repo's last release date, open-issue count, weekly downloads |
| For each new dep: CVE history? | Search [advisory-db](https://github.com/rubysec/ruby-advisory-db) for the gem, or `npm audit` for the npm dep |
| For each new dep: license compatible? | Project is AGPLv3 — verify the new dep doesn't have a more-restrictive license (MIT/BSD/Apache are fine; GPL-only without dual-license is a problem) |
| For each new dep: transitive surface? | `npm ls <pkg>` / `bundle viz` to see the dependency tree — small leaf deps with their own dep tree may pull in a lot |
| Pinned to a specific version? | Caret/tilde ranges (`^1.2.3`, `~1.2.3`) can pull in minor versions on next install — for security-relevant deps, prefer exact pins |

---

### 3.11 Migration safety

**🔴 BLOCK (only when migrations are present) — Every new DB migration is reversible, lock-bounded, and data-loss-aware.**

| Probe | How |
|---|---|
| Is there a new migration? | `git diff develop...HEAD -- 'db/migrate/'` |
| Is `down` (rollback) defined? | If `change` doesn't auto-reverse (e.g. `change_column`, raw SQL), explicit `up`/`down` is required |
| Long-running migrations on large tables | Adding a column with a non-null default to a 50M-row table without `add_column_with_default :null => true, :default => …, :update_in_batches => true` will lock the table — use `disable_ddl_transaction!` and batch the backfill |
| Data loss risk | `remove_column` is destructive AND irreversible after deploy. Stage the removal: PR 1 stop writing, PR 2 stop reading, PR 3 remove column |
| Concurrent index | `add_index :concurrently => true` for Postgres on large tables, in its own transaction (requires `disable_ddl_transaction!`) |
| New NOT NULL on existing column | Backfill in a separate prior PR, only then add the constraint |

---

### 3.12 Tests pass for the right reason

**🔴 BLOCK — Verify the tests in this PR are actually exercising the changed code.**

This is the meta-check the adversarial reviewer applies to the test suite itself. The failure mode: a test exists, passes green, but doesn't actually cover the changed line. Per LEARNINGS, "tests rarely error noisily — they just silently pass against the wrong thing or get skipped."

| Probe | How |
|---|---|
| Coverage of the actual changed lines | Run RSpec / Ember test with coverage; verify the new/changed lines are covered. `git diff --unified=0 develop...HEAD -- 'app/'` to get the changed line numbers; cross-check against coverage report |
| Tests that contain `pending` / `skip` / `xit` / `it.skip` | `git diff develop...HEAD -- 'spec/' 'app/frontend/tests/' \| grep -E '^\+.*(pending\|skip\|xit\b)'` — every such case must have a reason |
| Tests that have empty bodies | A common adversarial finding: a test scaffolded then never written. `grep -A2 'it ".*" do$' new_spec.rb \| grep -B1 '^  end'` |
| Tests that don't actually call the changed function | If the changed function is named `foo`, `grep -l "foo" spec/` should include the new tests |
| Tests that mock the thing they're testing | A test that mocks `User#supporter_role` to return true and then asserts the gate works — it tested the mock, not the gate. Mock at the boundary, not at the unit under test |
| Tests that pass before the change too | Run the test against the base (`git stash; git checkout develop; rspec <new spec>; git checkout -; git stash pop`). If the new test passes without your change, it's not testing your change |
| Flaky tests introduced | New test depends on time, randomness, network, file order, or test execution order? Adversary will find a way to make it fail |

---

### 3.13 Red-team prompts (open questions you must be able to answer)

For each PR, write a brief answer to each of these. The adversarial reviewer will ask them; you should have your answers ready in the PR description.

1. **"What's the worst thing a logged-in user can do with this code?"** — the realistic worst case, not "they could request a page slowly." Targeted at: malicious-user attack surface.
2. **"What's the worst thing a logged-out / new visitor can do with this code?"** — anything new that's reachable without auth.
3. **"What's the worst thing a supporter can do to a supervisee with this code?"** — supervisor-abuse surface, which is specifically called out in the AAC/disability context.
4. **"What data can flow from one user's account to another's that couldn't before?"** — privacy regression check.
5. **"If this feature flag is OFF, does the system still work?"** — flag-off correctness.
6. **"If this feature flag is ON but the database hasn't been migrated yet (deploy ordering), does the system gracefully degrade?"** — deploy-order safety.
7. **"What happens if an attacker submits the same request 1000 times in a second?"** — rate-limit / idempotency surface.
8. **"What happens if the database is in a read-only replica failover state for 30 seconds during this code path?"** — degraded-mode behavior.
9. **"What did the removed code prevent, and how do I know that prevention is still in place?"** — implicit-guarantee regression check (see §3.6).
10. **"If I gave a junior engineer this PR with no context and asked them to find one bug, what would they find?"** — sanity check that the code is auditable by someone other than the author.

If any of these questions makes you say "I don't know" or "I haven't thought about that yet" — you have a finding to fix before submitting. The adversarial reviewer asking the same question after you submit is the same finding, just stamped publicly on the PR.

---

## Tier 4 — Process hygiene

### 4.1 Branch name

**🔴 BLOCK** — Per CLAUDE.md "Branching":
- Type prefix required: `fix/`, `feat/`, `chore/`, `docs/`, `perf/`, `refactor/`, `test/`, `compliance/`, `security/`
- Developer handle: `melissa`, `scot`, `traci`, `dominic`, etc.
- Form: `<type>/<dev>-<kebab-description>` OR `<dev>/<type>/<kebab-description>`

```bash
git branch --show-current
# If output doesn't match the pattern, rename before opening PR:
# git branch -m <new-name>
```

### 4.2 Target branch

**🔴 BLOCK** — PRs target `develop`, NOT `main` or `staging`. (Promotion PRs from `develop` to `staging`, and release PRs from `staging` to `main`, are separate operations.)

### 4.3 PR description matches the actual diff (claims audit)

**🔴 BLOCK** — Every assertion the PR description makes must be verifiable against `git diff develop...HEAD`. This is the meta-check that catches the same failure mode as Scot's Sec 1 Critical on PR #284 (description claimed `boardPicker` was removed, but the diff didn't actually remove it). The adversarial reviewer reads the description first, then verifies every claim — if the claim is false, the PR is bounced.

**Concrete claims to verify before opening:**

```bash
# 1. Files-touched claim
git diff develop...HEAD --stat | tail -1

# 2. "Removed X" claims — for every "remove*" / "delete*" / "drop*" verb in the PR description,
#    extract the identifier and grep the diff to confirm it's actually deleted, not just hidden
git log develop..HEAD --oneline
git diff develop...HEAD | grep -E '^-' | grep -E '<identifier-name>' | head    # should show deletions
git grep '<identifier-name>'                                                  # should return nothing OR
                                                                              # only intentional separate-consumer matches

# 3. "Added X" claims — confirm the diff actually adds it, not just stubs it
git diff develop...HEAD | grep -E '^\+' | grep -E '<identifier-name>'

# 4. "Behind feature flag" claims — confirm BOTH AVAILABLE_FRONTEND_FEATURES AND ENABLED_FRONTEND_FEATURES
#    are updated, and the template/JS actually gate on the flag
grep -E 'AVAILABLE_FRONTEND_FEATURES|ENABLED_FRONTEND_FEATURES' lib/feature_flags.rb | grep '<flag-name>'
git diff develop...HEAD | grep '<flag-name>'

# 5. "No regression in X" claims — these are not provable from a diff alone; either point at the
#    test that locks the behavior, or weaken the claim to "tested manually in scenarios A/B/C"
```

**Anti-pattern:** PR descriptions written from an outline of what you *intended* to do, then never reconciled with what was *actually* committed. Two ways to avoid:

1. Write the PR description LAST, AFTER running `git diff develop...HEAD` and reading every hunk. Treat the diff as the source of truth; the description summarizes it.
2. If you wrote a description in advance, run the description through this audit before opening. Strike claims the diff can't substantiate.

### 4.4 Task-management log exists

**🟡 WARN** — Per CLAUDE.md Rule #0.8, any researched task gets a live working log at `docs/task-management/YYYY-MM-DD-<slug>.md`. Check the log exists and has:

- `## Prior LEARNINGS consulted` section (per the workflow rule above)
- Diagnosis section with file:line evidence
- Verification plan
- "Lessons (candidate for LEARNINGS.md)" section

### 4.5 LEARNINGS.md updated

**🟡 WARN** — If the work produced a durable lesson, it should be added to [`LEARNINGS.md`](task-management/LEARNINGS.md). New pattern gets a `## Pattern: …` entry with `**First seen in:**` link back to the task log; refinement edits the existing entry in place (no near-duplicate stacking).

### 4.6 Dual review for sensitive paths

**🔴 BLOCK** — Per Scot's governance note (soft freeze), any PR touching these paths needs **Phase 1 dual review** (`/review-pr + /adversary-review`) before merge:

- security
- AI generation
- user data flows
- feature flags (`lib/feature_flags.rb`)
- mailers
- `#tree` / bulk / `global_id` / `board` / `board_content` / `SlowWorker` paths

```bash
# Quick check for sensitive paths in your diff:
git diff develop...HEAD --name-only | grep -E "(feature_flags|mailers/|app/models/board|app/models/board_content|lib/slow_worker|global_id|app/jobs/.*tree|bulk)" | head
```

If any results, **flag in the PR description** that dual review is required. **Run Tier 3 on yourself first** — the adversarial reviewer is going to.

### 4.7 Rubocop not yet in CI — run manually

`rubocop` is in the Gemfile and Gemfile.lock but is NOT invoked by [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Run it manually before opening:

```bash
bundle exec rubocop --parallel --display-cop-names
```

---

## Tools: installed, available, recommended

### Already installed and wired into CI

| Tool | Purpose | Where wired |
|---|---|---|
| RSpec | Backend tests | [ci.yml](../.github/workflows/ci.yml) |
| Ember Test (QUnit) | Frontend tests | [ci.yml](../.github/workflows/ci.yml) |
| Brakeman | Rails SAST (security static analysis) | [ci.yml](../.github/workflows/ci.yml) |
| bundle-audit | Gem CVE check | [ci.yml](../.github/workflows/ci.yml) |
| npm audit | Frontend dep CVE check | [ci.yml](../.github/workflows/ci.yml) |
| gitleaks | Secrets scanning | [ci.yml](../.github/workflows/ci.yml) |
| ESLint | JS lint (with custom `lingolinq/no-this-in-promise-executor` rule) | [`app/frontend/.eslintrc.js`](../app/frontend/.eslintrc.js) |
| ember-template-lint | Handlebars template lint | [`app/frontend/.template-lintrc.js`](../app/frontend/.template-lintrc.js) |

### Installed in Gemfile but NOT in CI

| Tool | Purpose | Why not in CI yet |
|---|---|---|
| Rubocop + rubocop-rails | Ruby style lint | No CI step. Run manually per §3.7. **Recommended next step:** add a Rubocop step to CI. |

### Available externally — close gaps that match past findings

These are the most directly relevant tools from web research, ranked by how directly they would have prevented Scot-review-style findings:

#### [Prosopite](https://github.com/charkost/prosopite) — auto-detect N+1 queries (closes Scot #6)

Drop-in gem. Per the prosopite README, configure tests to fail on N+1 detection:

```ruby
# test.rb / spec_helper.rb
Prosopite.rails_logger = true
# In a global before/after hook:
before { Prosopite.scan }
after  { Prosopite.finish }
```

Catches N+1 with zero false positives by comparing query call-stacks + fingerprints. Would have caught [`BoardsController#index`](../app/controllers/api/boards_controller.rb) regression as a failing spec instead of as a Scot review comment. Compared to the older `bullet` gem, prosopite catches N+1s introduced via FactoryBot test fixtures, which `bullet` misses.

**Effort:** ~30 min to add gem + config + first-pass green run.

#### [Danger JS](https://github.com/danger/danger-js) — PR-level rule enforcement (closes Scot #2, #3, partially #1)

Runs in CI and posts as a PR comment. Rules written in TypeScript that walk the PR diff. Sample rules that would catch past findings:

```typescript
// danger/dangerfile.ts
import { danger, warn, fail } from 'danger'

// #3: missing tests for large PRs
const changedFiles = danger.git.modified_files.concat(danger.git.created_files)
const codeFiles = changedFiles.filter(f => f.match(/\.(js|rb)$/))
const testFiles = changedFiles.filter(f => f.match(/tests?\/|spec\//))
if (codeFiles.length >= 5 && testFiles.length === 0) {
  fail(`PR changes ${codeFiles.length} code files but no tests. See §2.3 of pre-merge-audit-checklist.`)
}

// #1: new feature flag references that don't exist in lib/feature_flags.rb
const ffContent = danger.github.utils.fileContents('lib/feature_flags.rb')
// ... parse + check ...

// #2: detect "removed X" claims in PR description that don't match the diff
const description = danger.github.pr.body || ''
const removalClaims = description.match(/(?:remov|delet)\w*\s+\w+/gi) || []
// ... cross-check claimed identifiers against `git grep` ...
```

Danger is widely used (per Espressif's [shared-github-dangerjs](https://github.com/espressif/shared-github-dangerjs) and other large-org configs) and works with GitHub Actions out of the box.

**Effort:** ~2 hours for an initial dangerfile covering Scot's top patterns.

#### [Knip](https://github.com/webpro-nl/knip) — find unused JS exports / dead code (closes Scot #2, generalizes orphan sweep §2.2)

```bash
npx knip --include exports,files
```

Builds a comprehensive module graph and identifies exports never imported, files never referenced, and unresolved imports — explicitly the gap ESLint and depcheck miss (per [Recca0120's analysis](https://recca0120.github.io/en/2026/05/02/knip-dead-code-detector/)). Has ~150 plugins for frameworks; Ember support is via standard JS/TS config (no Ember-specific plugin documented at search time, but works on the underlying module graph). Would have caught `boardPicker` orphans automatically. Has `--fix` mode for auto-removal.

**Effort:** ~1 hour to add as npm devDependency + write the first allowlist for intentional uncovered exports.

#### [Semgrep](https://semgrep.dev/) — pattern-based static analysis with custom rules (closes Scot #1, #7, #8, generalizes pattern detection)

YAML rules per CWE / per codebase convention. The pattern from Scot's #1 (Customize Menu missing feature flag) is exactly the use case Semgrep is designed for — per [Semgrep custom rules docs](https://semgrep.dev/docs/semgrep-secrets/rules), "banning deprecated function calls, requiring error handling around specific operations, enforcing naming conventions, ... blocking direct imports from internal packages." Example rule shape:

```yaml
# .semgrep/feature-flag-required.yml
rules:
  - id: new-template-block-without-feature-flag
    pattern: '<div class="md-customize-menu...'
    message: "New Customize Menu UI must be gated behind a feature flag. See lib/feature_flags.rb."
    languages: [generic]
    severity: ERROR
```

CI integration is one GitHub Actions step. Free tier (Community Edition) covers everything in this checklist.

**Effort:** ~3 hours for a first set of repo-specific rules covering Scot's top findings.

#### [Lingual i18n-check](https://github.com/lingualdev/i18n-check) — translation file validation (closes Scot #4)

Per the project README, it validates translation files and exits non-zero on missing/unused keys. Designed for CI integration: "End-to-end i18n checks can be run on CI pipelines... exit with exit code 1 if at least one translation key is missing or unused." Repo uses ember-intl-compatible JSON files at [`public/locales/`](../public/locales/) so this should drop in.

**Effort:** ~1 hour to add as a CI step that runs after `i18n_generator.rb`.

#### [Test Coverage Comparison GitHub Action](https://github.com/marketplace/actions/test-coverage-comparison-of-added-modified-files) — per-file coverage threshold (closes Scot #3)

Fails the workflow when coverage for modified or newly added files does not meet a minimum threshold, OR when coverage decreases more than X%. Posts as PR comment. Pairs well with the manual §2.3 check — Danger catches "zero tests added" with one rule, this catches "tests added but skip the touched lines."

**Effort:** ~30 min to wire up; longer to backfill a baseline coverage threshold for existing code.

### Tools NOT recommended (yet)

- **Bullet (Rails N+1)** — superseded by Prosopite. Per [Factorial Engineers' comparison](https://labs.factorialhr.com/posts/bullet-or-prosopite-for-nplus1), Bullet has known false positives/negatives, especially around FactoryBot-created associations in tests.
- **Heavy CodeQL integration** — overkill for the per-PR sweep. Already partially covered by Brakeman + npm audit. Reconsider when/if the team adopts GitHub Advanced Security.
- **Full Danger.rb (the Ruby version)** — Danger JS works fine for a Rails/Ember monorepo since the rules run in Node; no need to maintain two languages of rules.

---

## Maintenance — how to update this checklist

This doc is intended as a **living artifact**. Update it when:

1. **A new Scot-review-style finding lands.** Add a check to the relevant Tier 2 section with the past-finding citation and the diagnostic command. The shape: BLOCK or WARN | Check | How | Why-with-citation.
2. **A new LEARNINGS.md pattern is added.** Cross-reference it from §2.10 if it warrants pre-merge attention. Not every LEARNINGS pattern needs a check here — only the ones whose violation is detectable mechanically or with a quick grep.
3. **A new tool gets installed.** Move it from "Available externally" to "Already installed and wired into CI."
4. **A check becomes obsolete** because tooling now catches it automatically. Strike through the check in place rather than deleting (so the historical context survives), and move the citation into the relevant tool's row.

**Where the doc lives:** `docs/pre-merge-audit-checklist.md` (this file). Linked from:
- CLAUDE.md (the codebase contract) — to be added as part of the "Doing tasks" section
- The `/audit-run` skill ([`.claude/skills/audit-run/SKILL.md`](../.claude/skills/audit-run/SKILL.md)) - as the lightweight per-PR sibling
- PR template (if/when one is added to `.github/pull_request_template.md`)

**Authority:** This doc represents accumulated team knowledge from the LingoLinq-AAC review process; it is binding for branches targeting `develop`, `staging`, and `main`. Disagreements with a specific check → raise on the PR with rationale; consensus updates land here.

---

## Sources (external research)

External tool research consulted while writing this checklist:

- [Danger JS](https://danger.systems/js/) — PR review automation framework
- [danger/danger-js (GitHub)](https://github.com/danger/danger-js) — source repo
- [Espressif's shared-github-dangerjs](https://github.com/espressif/shared-github-dangerjs) — example reusable Danger JS workflow
- [Prosopite](https://github.com/charkost/prosopite) — Rails N+1 auto-detection with zero false positives
- [The N+1 Dilemma — Bullet or Prosopite?](https://labs.factorialhr.com/posts/bullet-or-prosopite-for-nplus1) — Factorial Engineers' comparison
- [Knip](https://knip.dev/) — JavaScript/TypeScript dead code detection
- [webpro-nl/knip (GitHub)](https://github.com/webpro-nl/knip) — source repo
- [Find Dead Code with Knip: The Blind Spots ESLint and depcheck Miss](https://recca0120.github.io/en/2026/05/02/knip-dead-code-detector/) — comparative analysis
- [Lingual i18n-check](https://github.com/lingualdev/i18n-check) — translation file validation with CI failure on missing keys
- [i18n-check: End to end React i18n testing](https://lingual.dev/blog/i18n-check-end-to-end-react-i18n-testing/) — usage overview
- [Semgrep custom rules](https://semgrep.dev/docs/writing-rules/rule-ideas) — pattern-based static analysis rule structure
- [Semgrep CI sample configs](https://semgrep.dev/docs/semgrep-ci/sample-ci-configs) — GitHub Actions integration patterns
- [Test Coverage Comparison of Added & Modified Files (GitHub Action)](https://github.com/marketplace/actions/test-coverage-comparison-of-added-modified-files) — per-file threshold enforcement
- [ember-template-lint](https://github.com/ember-template-lint/ember-template-lint) — Handlebars template linting with custom-rule plugin system

Internal references:

- [CLAUDE.md](../CLAUDE.md) — codebase contract, Rule #0 + branching + i18n + feature flag rules
- [LEARNINGS.md](task-management/LEARNINGS.md) — durable patterns distilled from past tasks
- The `/audit-run` skill ([`.claude/skills/audit-run/SKILL.md`](../.claude/skills/audit-run/SKILL.md)) - full multi-agent audit (periodic; complements this per-PR sweep)
- [`.claude/agents/`](../.claude/agents/) - read-only domain finder agents used by the full audit
