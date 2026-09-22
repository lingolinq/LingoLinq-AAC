# Session handoff — COPPA offboarding safety (#903), release review (#898), dead scheduler (#902)

Written 2026-09-01. Everything below was verified against the live tree and GitHub
at the time of writing. Claims are labelled CONFIRMED (checked) or ASSUMED.

---

## 0. Thirty-second version

- **PR #903 is open, green, and awaiting Scot's review/merge.** It gates the COPPA
  offboarding sweeper behind a three-state kill switch, stops deletion proceeding on a
  failed export, makes GET `/parental_consent/decline` inert, and revokes tokens on decline.
- **The working tree has 470 lines of UNCOMMITTED findings** (12 new: 1 Critical, 6 High,
  5 Medium) on branch `scot/compliance/audit-findings-2026-09-01`. Do not blow this away.
- **Five High findings from the #898 release review were never fixed and are tracked nowhere.**
  Not in the register, not as issues. They are listed in §4 below because this document is
  currently their only record.
- **Agreed plan:** merge #903 → restore the scheduler → read the unbounded backlog count
  → only then decide whether to enable the sweeper. §5 has the one open risk in step 2.

---

## 1. PR #903 — what it does

CONFIRMED: `scot/fix/coppa-offboarding-safety` → **`staging`**, head `2fd6f39d6`, state OPEN,
all six checks pass (rspec 25m50s, build-and-test 23m, audit-artifacts-integrity,
codex-review-tests, secret-detection, security-scan).

Title: *fix(coppa): gate the offboarding sweeper, stop deleting on a failed export, and make
decline safe*

> **Open question for Scot:** the original ask was "a single follow-up PR against main".
> #903 targets `staging`, per the repo convention that only release PRs target `main`.
> Re-targeting is a one-click change if that was not intended.

### The six items requested, and their status

| # | Item | Status |
|---|---|---|
| 1 | Confirm the #900 scanning fix is on main | CONFIRMED present |
| 2 | Kill switch for the COPPA offboarding sweeper | Done, three-state |
| 3 | Export failure must not proceed to deletion | Done |
| 4 | GET `/parental_consent/decline` must not mutate | Done, GET/POST split |
| 5 | Token revocation on decline | Done |
| 6 | Optional read-only backlog count tool | Delivered as a script in issue #902, not as app code |

### Kill switch semantics (`COPPA_OFFBOARDING_SWEEP_ENABLED`)

Case- and whitespace-insensitive. Implemented in
`app/workers/offboarding_coppa_expiration_worker.rb`.

- **unset** → `mode=disabled`. Logs that it is disabled and exits. Scans nothing, touches nothing.
- **`report`** → scans the identical candidate set, logs the count plus `[global_id, reason]`
  for each, capped at `MAX_REPORT_LINES = 200`. Zero mutation, zero deletion scheduling.
- **`true`** → full sweep, previous behaviour.

Specs cover all three states. `lib/tasks/scheduler.rake` prints `mode=<mode>` next to the
count, so the log line is self-describing without reading the worker.

### The other model changes (`app/models/user.rb`)

- `schedule_offboarding_export_then_delete!(reason:)` derives the reason **inside** the claim
  lock, and aborts unless the exporter returns a Hash with a present `:path`:
  ```ruby
  unless upload.is_a?(Hash) && upload[:path].present?
    return release_offboarding_export_claim!(reason: resolved_reason, error_class: export_error_class)
  end
  ```
- New `release_offboarding_export_claim!(reason:, error_class: nil)`. Releases the claim,
  `return false unless released`, writes a guarded `AuditEvent` with
  `'error_class' => error_class.presence`.
- **PII:** the audit row and the log line carry the exception **class only**, never the
  message. A spec asserts the message is absent. (This was a Codex finding on my own work —
  I had persisted the raw exporter message.)
- `decline_parental_consent!` now calls `devices.each(&:invalidate_keys!)`, not
  `invalidate_cached_keys`. Precedent at `user.rb:1030-1042` for `revoke_parental_consent!`
  names the three deliberately cache-only sites (consent grant, parent-email submit, family
  offboarding). Decline is not one of them.
- New streaming discovery `User.each_expired_offboarding_consent_candidate` (`to_enum`,
  avoids materialising the candidate set), plus `offboarding_export_reason` returning
  `'declined'` / `'expired'`.
- `OFFBOARDING_SWEEP_LOOKBACK = 90.days`, with a documented orphaning caveat — see §5.

### Controller / routes / views

- `app/controllers/parental_consents_controller.rb`: `decline` (GET, renders only) and
  `decline_submit` (POST, mutates). Private `prepare_decline_context` resolves five states:
  `:invalid`, `:already_declined`, `:not_declinable`, `:confirm`,
  `:declined` / `:declined_export_pending`. `declinable?(c)` mirrors every model-side refusal.
- `config/routes.rb`: `post '/parental_consent/decline' => 'parental_consents#decline_submit'`,
  **deliberately unnamed**. The GET already generates `parental_consent_decline_path`; adding
  `as:` raises `ArgumentError: Invalid route name, already in use`.
- `app/views/parental_consents/decline.html.erb`: five state branches, `form_tag ... method: :post`,
  hidden `user_id` / `token`.
- `config/locales/en.yml`: added `decline_confirm_title/body`, `offboarding_decline_confirm_body`,
  `decline_confirm_button`, `decline_not_declinable_title/body`, `decline_export_pending_title/body`.

---

## 2. ⚠️ Uncommitted work sitting in the tree

CONFIRMED as of writing:

```
branch: scot/compliance/audit-findings-2026-09-01   (cut from staging fa2fb2545)
 M audit-reports/FINDINGS.json      +470 lines, 12 new findings
```

`register-lint` passes on it. It is **uncommitted and unpushed**. A branch switch or
`git checkout` loses it.

| Severity | ID | Subject |
|---|---|---|
| **Critical** | `LL-1baffd92d5` | `claim_user` authorizes only the requesting org manager and performs **no check on the target user**. Any manager with a free seat can take over any account by username, including one another district already manages. `Organization#claim_user` then overwrites `managing_organization_id` **and** `expires_at` unconditionally (`organization.rb:29`). This is the district data-isolation boundary. |
| High | `LL-c7bbfa452a` | School-authorized account creation skips the COPPA block, so `settings['coppa']` is never written and the under-13 AI gate passes for exactly the accounts it exists to stop |
| High | `LL-933e61efd7` | Five retention/deletion promises on the public privacy page have no implementing mechanism |
| High | `LL-3e36a18199` | `rake scheduler:dispatch` is the single entrypoint for every recurring job; nothing has triggered it in prod since 2026-07-21 (same defect as issue #902) |
| High | `LL-4f1eb5fd0a` | `Lesson#check_url` SSRF — raw Typhoeus, unbounded redirect following, bypasses the repo's own `SafeHttp` DNS/IP validation |
| High | `LL-fba170716e` | SNS callback logs the full payload before verifying it on the SMS branch; **no signature verification at all** on the SubscriptionConfirmation branch |
| High | `LL-400adcead5` | PR #901 machine-translated the AI-sharing / Article 50 / COPPA / retention disclosures into 12 locales; the guard covers English only |
| Medium | `LL-135ee6ca59` | `User#ai_consent_granted?` has no runtime caller — the separate AI data-sharing consent promised to parents is never enforced by the AI gate |
| Medium | `LL-20703f4fa8` | `AiApiLog.error_message` takes raw provider exception text into an unbounded column, excluded from the `before_validation` scrub |
| Medium | `LL-d033b27acd` | Document register anchors its overdue window to `meta.generatedDate` instead of today, so it printed "none overdue" while two records were |
| Medium | `LL-37860cbcfa` | No GitHub Action is pinned by commit digest, including the auth action in the prod deploy job that holds `id-token: write` |
| Medium | `LL-84c67d758d` | Terms-agree modal calls `ModalDialog` without `labelledBy` — ships `role=dialog` + `aria-modal` with no accessible name |

**Before committing these:** run `scripts/regenerate-register.sh` (or CI's
`audit-artifacts-integrity` goes red). See §6.

ASSUMED: these came from a 2026-09-01 Codex whole-tree audit reconciled by a dual review.
That is what the `notes` fields say; it is not work I can attribute from my own context.

---

## 3. Issue #902 — the dead scheduler

CONFIRMED open. *"Production scheduler has not run since the GCP cutover (2026-07-22): all
hourly/daily tasks dead, including two retention controls documented as live."*

Four independent confirmations that nothing invokes `scheduler:dispatch` in production.
Dead roughly six weeks.

I posted a **correction to my own step 4** on that issue. The original text said to run the
sweep in `report` mode and trust the count. That is wrong, and wrong in the specific
situation the issue describes: discovery is bounded by 90 days, the consent deadline is 14
days, so every day the scheduler stays dead more of the backlog ages past the horizon and
becomes invisible to **both** `report` and `run`. `report` prints a reassuringly small
number, that number gets used to justify enabling deletion, and the aged-out accounts are
never exported and never deleted by anything. The comment carries an unbounded counting
script to take first.

---

## 4. Still open, and tracked NOWHERE

CONFIRMED by grep: none of the following appear in `audit-reports/FINDINGS.json`, and none
have a GitHub issue. **This document is currently their only record.** They came out of the
Codex leg of the #898 release review and #903 did not touch them.

| Severity | file:line | Finding |
|---|---|---|
| High | `app/controllers/api/users_controller.rb:1148-1152` | Board translation bypasses the organization external-AI opt-out. An org with `external_ai_processing: false` still has board words sent to Google Translation. A disclaimer is not an authorization control. |
| High | `lib/feature_flags.rb:130-133` | `board_category_grouping` and `boards_side_by_side_layout` are in the production-enabled list, with comments explicitly identifying both as temporary staging rollouts requiring removal before production. |
| High | `app/frontend/app/components/board-detail-grid.js:82-108` + `app/frontend/app/utils/article50_gate.js:121-125` | Grouping eligibility is evaluated for `currentUser` while board preferences resolve for `referenced_user`. A supervisor's flag can enable grouping on a communicator's board whose org has it disabled. |
| High | `lib/user_board_provisioner.rb:6-20` + `app/models/user.rb:3854-3890` | `signup_sidebar_boards` inserts `inflections-es` by locale, but provisioning that board is gated separately by `signup_spanish_library_boards_enabled?`. Spanish users can get a sidebar entry pointing at a board copy that does not exist. |
| High | `app/frontend/app/utils/board_categories.js:648-649` | `+`-prefixed action vocalizations are not classified as controls. `+q`, `+.` etc. fall through to colour/POS classification, so with grouping on, keyboard/action controls can move into ordinary vocabulary categories. |

**Important caveat on the flags item:** the PR body's claim that "merging turns them ON for
everyone in production" is UNVERIFIED and probably FALSE. `app/models/system_feature_settings.rb:6-13`
returns `stored & AVAILABLE_FRONTEND_FEATURES` when the `default_enabled_features` Setting
exists, falling back to `ENABLED_FRONTEND_FEATURES` only when it does not. Production has
that Setting (art50 was enabled through it, audited 2026-08-23). So editing `ENABLED` has no
prod effect while the Setting exists — **and the corollary is worse**: every flag added to
`ENABLED` since the Setting was written is live on staging but not in prod, so the two
diverge untested. Membership in `AVAILABLE` is a ceiling, so the `AVAILABLE` additions are
what actually matter.

Also CONFIRMED on the clinical-risk claim: `user.rb:1756` defaults
`board_category_grouping => {'enabled' => false}` and `board-detail-grid.js:131-139` tests
`=== true` strictly, so an absent preference is OFF. Flag-on exposes an opt-in control; it
does **not** regroup anyone's board by default. The rollout-policy violation is real; the
"moves vocabulary out of cells users have motor memory for" harm claim is overstated.

---

## 5. The agreed plan, and the one open risk

Scot's stated sequence:

> "We'll merge #903, restore the scheduler, read the unbounded count, and only then decide
> whether to turn the sweeper on."

Step 1 and the COPPA part of step 2 are safe: #903 defaults the sweeper to disabled, so a
restored scheduler logs `mode=disabled` and exits.

**The gap is the other ten daily tasks.** CONFIRMED from `lib/tasks/scheduler.rake`: eleven
tasks run at `hour == 6`, and grepping that block for `ENV[`, `_enabled?`, `FeatureFlags`
returns nothing. Only the COPPA sweeper has a kill switch, and it gates inside the worker.

| | Task | Destructive? |
|---|---|---|
| 1 | `check_for_expiring_subscriptions` | state changes **+ mail** |
| 2 | `transcode_errored_records` | no |
| 3 | `flush_users` | **deletes users** |
| 4 | `clean_old_deleted_boards` | **deletes boards** |
| 5 | `enforce_data_retention_policies` | **deletes** |
| 6 | `redact_old_ai_api_log_ips` | **irreversible redaction** |
| 7 | `purge_old_eu_ai_api_logs` | **deletes rows** |
| 8 | `expire_stale_supervisor_consent_requests` | state |
| 9 | `expire_offboarding_coppa_consents` | gated by #903 |
| 10 | `flush_expired_beta_feedback_recordings` | **deletes** |
| 11 | `expire_licenses` | state |

Two specifics:

1. **`lingolinq-prod-worker` is also suspended.** These tasks enqueue into Resque
   (`User.schedule_for('slow', ...)`, `Worker.schedule(Flusher, ...)`,
   `BoardContent.schedule_for('whenever', ...)`). Restoring the cron alone piles six weeks
   of jobs into Redis with nothing draining them. Restoring both at once drains it all in
   one go.
2. **`check_for_expiring_subscriptions` reaches `SubscriptionMailer`.** CONFIRMED:
   `app/models/concerns/subscription.rb:150` (`UserMailer :organization_assigned`), `:302`
   (`:unsubscribe_reason`), `:531` (`:purchase_bounced`), `:540/:542/:543` (gift mails).
   `app/models/license.rb` has no mailer calls. Mail is the one thing that cannot be rolled
   back. Prod carries only internal test accounts (PR #483, operator attestation, **not**
   code-verified), so the blast radius is probably nil — but that is worth confirming rather
   than assuming.

**Recommendation:** restore the scheduler with the worker still down, read one cycle of logs
first. That surfaces what each task *would* do before anything drains. This is what #902
step 3 already says.

### The 90-day orphaning caveat (durable follow-up on #903)

`OFFBOARDING_SWEEP_LOOKBACK = 90.days` bounds discovery to
`parental_consent_offboarding_started` AuditEvents inside that window. Accounts whose event
has aged past it are still `coppa_offboarding_export_due?` but nothing looks for them. The
constant carries the caveat and a spec pins the behaviour so it cannot regress silently.
The durable fix is to drive discovery off **user state** rather than a time-bounded audit
scan, or to re-stamp the started event while an offboarding is still outstanding. Not done
in #903.

---

## 6. Landmines — read before touching anything

- **The age-18 privacy fix is Scot's, not the agent's.** He said he will push it as his own
  PR. It lives in `stash@{0}` on `scot/compliance/retract-false-coppa-closure`
  (18 files, one line each: 13 locales + `privacy.hbs` + `_privacy.html.erb` +
  `DOCUMENT-REGISTER.json/.md` + `docs/legal/2026-08-09_data-retention_draft.md`).
  The claim being retracted is that data is purged at age 18 — it is incorrect, and nobody
  should lose data for turning 18. **Do not push this.**
- **`AuditEvent` commits outside the RSpec transaction.** Use
  `before(:each) { AuditEvent.delete_all }`, scoped to the describe block. Never `after`.
  Codex flagged an `after(:each)` in my #903 specs for exactly this reason.
- **The test DB carries orphaned rows.** Five stale AuditEvents + one Board + one User faked
  14 `user_spec` failures via unscoped `Model.count` assertions. Take a baseline (rule 10)
  before calling anything a regression. After cleaning: 405 examples, 0 failures.
- **`""` is truthy in Ruby.** I reported "all 10 transitions attested" by testing
  `closureEvidence.attestation` for truthiness; empty strings read as present. Use
  `.to_s.strip.empty?`. Three rows are genuinely empty: `LL-7d50b089c9` (no disposition
  either), `LL-f150e0e828`, `LL-1e7b568ef3`.
- **Register edits require artifact regeneration.** `scripts/regenerate-register.sh`, or
  `audit-artifacts-integrity` fails. If a contentHash FAIL names an **attested** row, stop —
  do not run render; revert or ping Scot (`/re-attest-record`).
- **Dated filenames are gitignored.** `YYYY-MM-DD-*.md` is ignored tree-wide. Use an
  underscore after the date, as this file does. `LEARNINGS.md` **is** tracked and is a
  conflict hotspot — it conflicted three times with staging during #903; resolve keeping
  both sides.
- **RSpec needs `DB_USER=scotw RAILS_ENV=test`** as a prefix; background shells skip `.env`.
- **Node 22** in this repo (`.nvmrc`). Check `node -v` before reading any frontend failure
  output; the shell default is 16 and a wrong-Node run dies during build looking exactly
  like a red suite.

---

## 7. What dies when this session ends

The session scratchpad (`/tmp/claude-1000/.../scratchpad/`) is session-specific and will not
exist in a new thread. Contents worth knowing about:

- `WIP-privacy-age18-correction.patch` — mirror of `stash@{0}`. **The stash is the durable
  copy**; the patch file is not. If the stash is ever lost, this file is gone too.
- `codex-out.md`, `codex-903-out.md` — the two Codex review tables. **Preserved in the
  appendices below**, so they survive this session.
- `my-verified-findings.md` — my own #898 reviewer-of-record notes. The load-bearing content
  is folded into §4 above.
- `902-comment.md` — already posted to issue #902.

---

## 8. Working method used (so a new thread can match it)

- **Dual review**: a Codex senior-dev pass and a Claude `adversary` pass run in parallel on
  the same diff, then reconciled. On #903 this found real defects **in my own fixes** — a PII
  leak, a vacuous token assertion, and a regression where `decline_parental_consent!`
  discarded the return value of `schedule_offboarding_export_then_delete!` and told the
  parent the account was gone when the export had failed.
- **`scripts/codex-review-guard.sh` must be run before any external reviewer pass.** It
  blocks the diff when it touches data-bearing paths (fixtures, seeds, factories, migrations,
  cassettes, data rake tasks, SQL/CSV dumps). Codex is Tier 2, no BAA — the app's
  `PiiScrubber` does **not** run on the review path.
- Reviewers are wrong sometimes. The adversary claimed `LL-1e7b568ef3` "DOES carry a
  structured attestation"; it does not, and it converged once shown the data. Verify each
  finding independently before acting (rules 1-4, 12).

---

## Appendix A — Codex review of PR #898 (release, staging→main)

| Severity | file:line | Finding | Failure scenario | Fix |
|---|---|---|---|---|
| Critical | `config/routes.rb:44`; `parental_consents_controller.rb:47-54` | GET decline performs an irreversible mutation | Email scanners, link previews, or browser prefetch follow the URL and call `decline_parental_consent!` without guardian intent | GET renders confirmation only; mutate via POST — **DONE in #903** |
| Critical | `app/models/user.rb:793` | Declining consent does not revoke existing bearer tokens | `invalidate_cached_keys` clears Redis but leaves persisted `settings['keys']`; a pre-decline token still works | `devices.each(&:invalidate_keys!)` — **DONE in #903** |
| High | `api/users_controller.rb:1148-1152` | Board translation bypasses the org external-AI opt-out | Org with `external_ai_processing: false` still sends board words to Google Translation | Enforce the policy server-side before `WordData.translate_batch` — **OPEN** |
| High | `lib/feature_flags.rb:130-133` | Experimental grouping + side-by-side forced on in production | Comments identify both as temporary staging rollouts requiring removal | Remove from the production-enabled list — **OPEN** (see the Setting caveat in §4) |
| High | `board-detail-grid.js:82-108`; `article50_gate.js:121-125` | Grouping eligibility uses `currentUser`, preferences use `referenced_user` | A supervisor's flag regroups a communicator's board whose org disabled it | Resolve a subject-scoped flag for `referenced_user` — **OPEN** |
| High | `user_board_provisioner.rb:6-20`; `user.rb:3854-3890` | Signup sidebar can reference an unprovisioned Spanish board | `inflections-es` added by locale; provisioning gated separately | Only add when the Spanish provisioning flag is on — **OPEN** |
| High | `app/models/user.rb:875-883` | Offboarding expiry discovery stops after 90 days | Worker down >90 days ⇒ expired users vanish from the candidate query forever | Unbounded/durable due-work query — **PARTIAL**: caveat + spec in #903, mechanism unchanged |
| High | `board_categories.js:648-649` | `+`-prefixed action vocalizations not classified as controls | `+q`, `+.` fall through to colour/POS; with grouping on, controls move into vocabulary categories | Treat `+` like `:`, preserving `:suggestion` — **OPEN** |

## Appendix B — Codex review of PR #903 (my own work)

| Severity | file:line | Finding | Resolution |
|---|---|---|---|
| Critical | `user.rb:856-857` | Failed export releases the claim but does not cancel an existing `schedule_deletion_at`; an account with a prior fuse still gets deleted | Addressed: deletion no longer proceeds on a failed export. **Legacy rows with `offboarding_export_scheduled_at` but no path were NOT reconciled** — open |
| High | `user.rb:951` | 90-day cutoff permanently excludes older due accounts | PARTIAL — caveat + spec, mechanism unchanged (§5) |
| High | `user.rb:844-845, 926-930` | Raw exporter exception text stored in the audit payload and logged; truncation is not sanitization | FIXED — `error_class` only, spec asserts the message is absent |
| Medium | `user.rb:912-920` | Claim release has no ownership token; can clear a *newer* worker's claim after a 6h stale-claim takeover | **OPEN** — would need a claim token compared on release |
| Medium | `parental_consents_controller.rb:114-124` | `prepare_decline_context` validates token equality but not pending state or expiry | Addressed via `declinable?` / `:not_declinable`; re-verify expiry coverage |
| Medium | `user.rb:954-956` | One `find_by_global_id` per candidate in both modes; thousands of round trips on a real backlog | **OPEN** — batch via `find_all_by_global_id` |
| Medium | `offboarding_coppa_expiration_worker_spec.rb:66-88` | Report-mode specs stubbed the resolver with doubles, testing nothing about real selection | FIXED — DB-backed integration specs added |
| Medium | `user_org_offboarding_consent_spec.rb:539-547` | `after(:each)` AuditEvent cleanup, which the repo's transaction behaviour defeats | FIXED — moved to `before(:each)` |
