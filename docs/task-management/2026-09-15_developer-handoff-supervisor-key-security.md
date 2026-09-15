# Developer handoff: supervisor_key / claim_user security branch

Prepared 2026-09-15 by Scot's session. Read-only investigation; no new implementation.
Everything below was read in code or demonstrated in a test run. Claims are labelled
CONFIRMED (read or executed here) or UNVERIFIED. Nothing here is a legal conclusion:
code inspection can establish what the software does, not whether a given data flow
satisfies FERPA, HIPAA, GDPR or COPPA. Those calls belong to Scot and counsel.

---

## 1. Recovery details

| Item | Value |
|---|---|
| Repository | `lingolinq/LingoLinq-AAC` |
| Worktree | `/home/scotw/.local/share/agent-wt/worktrees/LingoLinq-AAC-ea35b3a9/session-171acdb2` |
| Branch | `scot/security/claim-user-target-authorization` |
| HEAD | `2e88e1a48cfa645c41abcc9542a6272262677305` |
| Working tree | Clean. Zero uncommitted or untracked files. |
| Pushed | **No.** No upstream configured, `git ls-remote --heads origin <branch>` returns 0 rows. |
| Pull request | **None.** |
| Base | `develop`. Merge-base `4104b657b243164a4ba257fad015db4942ce79f0`. |
| Commits on branch | 15, all committed. |
| Rebase needed | Yes. `develop` has advanced 5 commits since the merge-base (through `cdf50fb1d`). |

All work is committed; nothing exists only in the working tree. Because nothing is pushed,
the branch exists in this worktree only. **Preserve or push it before reclaiming the worktree.**

Commits, oldest first: `62be85c5b`, `274b3c965`, `e68c5f72c`, `6db92e037`, `0689aab99`,
`03251b762`, `3c6240adb`, `ce3ccf3ba`, `376393e64`, `8b1267d4d`, `72b4d6be5`, `26057805a`,
`d4eabca34`, `4318d53e0`, `2e88e1a48`.

Supporting documents already committed on the branch:
- `docs/task-management/2026-09-14_claim-user-cross-tenant-takeover.md`
- `docs/task-management/2026-09-14_supervisor-key-org-attach-escalation.md`
- `docs/task-management/2026-09-14_merged-findings-optionb.md` (the dual-review baseline
  `/apply-check` should diff against)

### Test state

`spec/services/supervisor_key_processor_spec.rb` 51 examples, 0 failures.
`spec/services/supervisor_key_processor_spec.rb` + `spec/models/concerns/supervising_spec.rb`
113 examples, 0 failures.

Known pre-existing baseline failures, unrelated to this branch and present on the merge-base:
4 in `spec/models/organization_spec.rb` `load_domains` (orphaned test-DB rows, see
`reference_test_db_orphan_rows`). One flake observed once in
`spec/models/concerns/supervising_spec.rb:1141` and not reproduced on re-run; baselined as a
flake, not a regression.

Run prefix required locally: `DB_USER=scotw RAILS_ENV=test bundle exec rspec ...`

### The two open Codex P1 findings

Source for both: the dual review recorded in
`docs/task-management/2026-09-14_merged-findings-optionb.md`, reviewed SHA `72b4d6be5`,
Codex senior-dev pass (`gpt-5.6` via `~/bin/codex-review`) plus the Claude adversary pass run
in parallel. Verdict REQUEST-CHANGES; deliberately **not** recorded via `record-pr-review.sh`.

**P1-A. Ratification never allocates a License seat.** CONFIRMED by reading.
`SupervisorKeyProcessor#process_approve_org` (`app/services/supervisor_key_processor.rb`)
calls `user.update_subscription_organization(org.global_id, false, nil, nil)` and never calls
`Organization#claim_user`. A user who ratifies a pending org attachment is flipped to
non-pending but remains unlicensed, and the org's seat stays unallocated. Cross-confirmed by
both reviewers. Latent in production today because there are zero `License` rows.

**P1-B. `claim_user` has no row lock and `licenses.user_id` has no unique constraint.**
CONFIRMED by reading. In `app/models/organization.rb`, `claim_user` is defined at line 19;
the guard reads `user.managing_organization_id` at line 47; the seat lookup runs at line 67;
`License.transaction` opens at line 70 and writes `license.update!(user_id: ...)` at line 72
and `user.update!(managing_organization_id: ...)` at line 75. Nothing locks the user row
between the read at 47 and the write at 75, so two organizations can both observe a nil
`managing_organization_id` and both proceed. `db/schema.rb` `create_table "licenses"` carries
`index_licenses_on_user_id`, which is **not unique**, and there is no partial unique index on
`(user_id) WHERE status = 'active'`. Codex rated this High/P1; a prior adversary pass had it
as PLAUSIBLE. The concurrency window itself has **not** been demonstrated by an executed test
here: UNVERIFIED as an executed repro, CONFIRMED as a code-shape reading.

---

## 2. Security findings

### 2.1 Closed on this branch

| Finding | Expected | Observed before fix | Fixed by | Test evidence |
|---|---|---|---|---|
| `Organization#claim_user` performed no target-side authorization, allowing an org to claim a user already managed by another org (LL-1baffd92d5) | A claim against a user managed by another org is refused and audited | Claim succeeded, rewriting `managing_organization_id` | `62be85c5b` | 4 specs in `spec/models/organization_spec.rb` |
| Third-party `start-` redemption attached a target to an org actively, reaching `support_actions` | Third-party attachment lands pending | Landed non-pending; `manager_for?` true | `03251b762`, `3c6240adb`, `8b1267d4d` (option B) | 11 specs |
| Same escalation via a `user_type: 'supporter'` code | Supporter codes obey the same rule | `add_supervisor(..., false, ...)` minted a non-pending `org_supervisor` link | `4318d53e0` | 3 specs; red run showed `Organization.manager_for?` returning `true` pre-fix |

Mutation evidence for the last row: reverting the argument to the literal `false` kills two of
the three new specs. The third is the self-redemption regression guard and correctly survives.

### 2.2 `managing_organization` pending-blind fallback — OPEN, decision not defect

**Expected (per option B):** unchanged behaviour. **Observed:** `User#managing_organization`
(`app/models/concerns/supervising.rb`) ends on `org ||= orgs.detect{|o| o['type'] == 'user' }`,
with no pending filter.

**Actors / resources / prerequisites.** Any actor who can cause an org attachment for a target.
Resource is the target's governing organization, which drives data policy, the logging kill
switch, AI feature gating and EU jurisdiction via `lib/feature_flags.rb`,
`lib/compliance/jurisdiction_resolver.rb`, `lib/compliance/segment_resolver.rb`,
`lib/eu_jurisdiction.rb`, `app/models/ai_focus_word_set.rb`, `lib/system_feature_settings.rb`.

**Authorization path.** `attached_orgs` maps `org_user` links to `type => 'user'`. The first two
`detect` lines filter on pending; the third does not, and is reached only when the user has no
non-pending `org_user` attachment at all.

**This is not a regression introduced by option B.** CONFIRMED: before option B the same
third-party attachment landed non-pending and matched the second line, returning the same org.
Outcome is identical or strictly more conservative, never less. Pinned by two specs in
`spec/services/supervisor_key_processor_spec.rb`. Mutation-verified: deleting the third line
makes `managing_organization` return `nil`, i.e. the user resolves to **no** governing org.

**Not fixed, deliberately.** Making it pending-aware is a new tightening with a large blast
radius, not a repair. It is a product/compliance decision, listed in section 5.

### 2.3 Pending board share grants edit on the shared board — OPEN, intent ambiguous

**Expected (as the reviewer read it):** a share marked pending confers nothing until approved.
**Observed:** it withholds the downstream set only.

**Actors / resources / prerequisites.** Actor: a board author who shares with
`include_downstream` **and** `allow_editing`. That combination is the only one that sets
`pending` (`app/models/concerns/sharing.rb`, `share_or_unshare`). Resource: the shared root
board and its downstream tree. Prerequisite: none beyond an ordinary share.

**Authorization path.** `Board.all_shared_board_ids_for` builds two lists. `shallow_board_ids`
selects on `allow_editing` with **no** pending filter. `deep_board_shares` selects on
`allow_editing && !pending`. `update_available_boards` writes both into
`user.settings['available_private_board_ids']`, and `Board#allows?` reads that. Separately,
`Sharing#shared_with?(user, plus_editing)` short-circuits on the direct link with no pending
check.

**Reproduction (executed here, throwaway spec, since deleted).** Author shares a root board
with `share_with(grantee, true, true)`; root has one downstream child.

| Cache state | root `view` | root `edit` | downstream `edit` |
|---|---|---|---|
| Stale (no refresh job run) | false | false | false |
| After forced refresh, still `pending` | true | **true** | false |
| After `update_shares_for(grantee, true)` | true | true | true |

**Both rows matter and the first is not an artifact to be waved away.** The stale row is the
real state of the system between the write and the refresh. It shows the cache is
**fail-closed on grant**: a newly granted share confers nothing until the refresh runs. The
corollary is that the same mechanism is **fail-open on revoke**: access persists until the
refresh runs. See 2.4.

**Intended or not?** UNVERIFIED and it needs a product answer, not a code answer. A coherent
reading is that `pending` here was only ever meant to gate *downstream propagation* of edit
rights, which is what the argument name `pending_allow_editing` suggests. Under that reading
this is an **intended existing permission**, not unauthorized access, and the defect is the
label rather than the behaviour. Do not file it as a vulnerability until Scot rules.

### 2.4 Permission-cache staleness window — OPEN, needs characterization

`available_private_board_ids` lives in the `users.settings` column and is **authorization
state with no TTL** (the code says so in `app/models/concerns/board_caching.rb`). It is
refreshed only by `update_available_boards`.

Production refresh mechanics, CONFIRMED by reading:
1. Mutating paths call `schedule_board_cache_refresh` (supervising) or
   `Worker.schedule_for(:priority, User, :perform_action, 'update_available_boards')` (sharing).
2. `persist_board_cache_refresh` first writes a `RemoteAction` outbox row (`act_at: now`); on a
   revoke it bumps an existing row's `act_at` to now rather than skipping.
3. After all transactions commit, `schedule_once(:update_available_boards)` enqueues on the
   `priority` Resque queue, which the Cloud Run worker does drain.
4. The outbox row is cleared when the work is **done**, not when the job is accepted.
5. Backstop: `Uploader.remote_remove_batch` re-drives due `RemoteAction` rows from the
   `push_remote_logs` scheduler task. The code comments describe this as hourly. The
   production schedule was **not** verified in this pass: UNVERIFIED.
6. `update_available_boards` self-defers: if the cache was generated within 60 minutes **and**
   the user's `view` list exceeds 500 boards, it creates a `RemoteAction` for 30 minutes out
   and returns without recomputing.

Consequences to characterize before relying on any pending-state design:

| Event | Interval of incorrect access | Direction |
|---|---|---|
| Grant / share | Until the refresh job runs | Fail-closed (no access yet) |
| Approval of a pending share | Until the refresh job runs | Fail-closed |
| **Revocation / unshare** | Until the refresh job runs; up to the backstop interval if the job is lost; plus up to ~30 min more for users over 500 boards | **Fail-open (access persists)** |
| Relationship `revoked` | As above; `revoke` does call `unlink_supervisor_from_user`, which schedules the refresh | **Fail-open** |
| Relationship `expired` | No access implication today, because only `pending` rows expire and pending is authorization-inert | n/a |

The >500-board deferral is the one worth measuring: for a heavily-shared supervisor a
revocation can be deferred by design. UNVERIFIED as an executed scenario.

### 2.5 `permission_level` is under-enforced — OPEN, out of this branch's scope

**Expected:** five levels with five behaviours. **Observed:** three behaviours.
CONFIRMED: `permission_level` is read for authorization at exactly two sites, both in
`app/models/concerns/supervising.rb`. `edit_permission_for?` treats
`edit_boards|manage_devices|full` as edit. `modeling_only_for?` treats `modeling_only` as
restricted. Every other reference is display code (mailers, `lib/json_api/`, controller echo).

Because `supervisor_for?` returns true for **any** approved relationship regardless of level,
and `app/models/user.rb` grants `view_detailed`, `view_existence`, `model`, `supervise`,
`view_deleted_boards`, `set_goals` and `view_word_map` on
`supervisor_for? && !modeling_only_for?`, an approved `view_only` relationship grants
everything except board editing. `manage_devices` and `full` are indistinguishable.

The same collapse appears from the `UserLink` side: `user_link_type` maps `view_only` to
`'read_only'`, and in `link_supervisor_to_user` the `'read_only'` branch sets neither
`edit_permission` nor `modeling_only`, while `supervisee_links` selects `type == 'supervisor'`
with no state filter.

**Classification:** this is a **label and UI correctness** problem, and possibly a product
decision about what the levels should mean. It is only "unauthorized access" if someone was
told `view_only` meant view only and relied on it. That is a question about what the product
promised, not about the code. Scope B, not A.

### 2.6 Other open items carried from the dual review

- `User.link_supervisor_to_user` has **no pending dimension at all**: no writer sets it and no
  reader filters on it. `parse_activation_code` has four link-creating sites; two call this
  method and therefore cannot be made pending by threading a flag. CONFIRMED.
- `process_add` remains ungated.
- `consent_transition` actor defect (section 9.2 of the escalation log).
- `SupervisorConsentService#create_with_supervisor` writes `status: 'approved'` with
  `permission_level: 'edit_boards'`, stamps `consent_responded_at` and `activated_at` at
  creation, links with `'edit'`, and passes **no** `:author`, so it does not stamp
  `authored_organization_id`. CONFIRMED.
- `SupervisorMailer#consent_denied` is registered and has zero call sites; expiry is silent.
- Three Mediums and three Lows in the merged-findings table, untouched.

### 2.7 Design intent: what `pending` does and does not block — DO NOT REGRESS

Added 2026-09-15 after Scot reviewed the branch. This section exists because the deliberate
bypasses below look like bugs and a well-meaning change could remove them.

**The operating policy, stated by Scot (product/operational, not legal advice).** Families sign
a contract with the district at the start of the year authorizing the district to create
accounts, pull usage data and so on. So when a district adds a new therapist, that therapist
should be able to start working with the student **without waiting for any in-app family
approval**. The concern raised was that this branch might have introduced a barrier that should
not exist.

**It did not.** Verified 2026-09-15 by an executed throwaway spec against HEAD:

| Scenario | Attached | `pending` | `manager_for?` (admin/password path) | Therapist can supervise and edit |
|---|---|---|---|---|
| Org-authored student account, therapist redeems the org's start code for them | yes | **false** | **true** | yes |
| Therapist self-redeems the org's `user_type: 'supporter'` code | yes | **false** | n/a | yes |
| Family-authored student account, therapist redeems the code for them | yes | **true** | false | **yes** (`supervisor_for?` and `edit_permission_for?` both true) |

In the third row the student is still returned by `Organization#users`, because
`attached_users('user')` does **not** filter on pending; only the `'approved_user'` type does.

**So `pending` withholds administrative control of the account, not clinical use of it.** What it
actually gates is `Organization.manager_for?`, which is what grants `support_actions`,
`manage_supervision` and `link_auth` in `app/models/user.rb`. The reset-token password write is
the terminal. Supervision, board editing, modelling and roster visibility are all unaffected,
because they come from the separate `type == 'supervisor'` `UserLink`, which has no pending
dimension at all (see 2.6).

**Three deliberate behaviours. Do not remove any of them without Scot's sign-off.**

1. **Org-authored accounts bypass pending entirely.** `update_subscription_organization`
   (`app/models/concerns/subscription.rb`) sets `pending = false` when
   `settings['authored_organization_id'] == new_org.global_id && created_at > 2.weeks.ago`.
   `Organization#add_supervisor` carries the same override. This runs **after**
   `force_pending` is threaded in, which is why row 1 of the table is non-pending. This is the
   district onboarding path and it must keep working.
2. **Self-redemption is non-pending.** `force_pending` is false when the person redeeming the
   code is the account holder, which is the literal value the call site used before this branch.
   Row 2 is therefore byte-identical to pre-branch behaviour.
3. **`management_action` has always created pending links.** `Organization#process_params`
   calls `self.add_user(key, true, ...)` and `self.add_supervisor(key, true)` with pending
   hardcoded to `true`. This predates the branch. The district admin console flow was already
   pending-by-default, so this branch introduced no new barrier there.

**The distinction to preserve when reasoning about this.** FERPA-authorized data access and
administrative control of an account are different things, and only the second is gated. A
signed district agreement addresses the district's access to education records. It does not
follow that the district should be able to take over a pre-existing personal account that a
family created and uses at home. The pending gate exists for account takeover, which is why it
applies to family-authored accounts and not to district-authored ones. Whether that line is
drawn in the right place is a product decision (section 5), not a code one.

**Open item for the developers to confirm, UNVERIFIED.** The org-authored bypass has a
two-week window. In normal operation the student is attached at creation, so the window should
never be the binding constraint. If a real workflow exists where a district creates accounts in
one month and attaches them to an org in a later month, that attachment will pend. Confirm
against actual district onboarding rhythm before assuming it is harmless.

**Recommended work, and a genuine gap.** The three scenarios in the table above have **no
permanent regression test**. They were demonstrated once and the spec was deleted. Turning them
into real specs belongs in Scope A, because they are exactly what a future change to
`force_pending`, to the two-week bypass, or to `attached_users` would silently break.

---

## 3. Proposed developer scope

### A. Narrow fixes for confirmed authorization defects and the two P1s

1. **P1-B lock and constraint.** Take a row lock on the target inside `License.transaction`
   in `claim_user`, and add a partial unique index on `licenses(user_id) WHERE status = 'active'`.
   Write the concurrency repro first; the window is currently a reading, not a demonstration.
2. **P1-A seat allocation on ratification.** Allocate the seat atomically when the user
   ratifies, so `approve-org` and `claim_user` cannot disagree. Note the ordering interaction
   with the `claim_user` guard added on this branch.
3. **Rebase** onto current `develop` (5 commits ahead) and re-run the suite.
4. Decide the three Mediums and three Lows from the merged-findings table.

Scope A should not change any user-visible permission semantics.

### B. Permission-label and UI corrections

Finding 2.5, and the `pending` share label in 2.3 if Scot rules it a labelling defect. Either
enforce all five `permission_level` values or reduce the list to the behaviours that exist, and
correct `PERMISSION_DESCRIPTIONS`, the mailer copy and the client. Default
`create_with_supervisor` to least privilege rather than `edit_boards`. Wire `consent_denied`
and notify on expiry.

This is user-visible and needs a feature flag plus i18n (see section 4).

### C. Later consent/relationship architecture redesign

The design sketch is at
`~/ai-company-brain/outputs/plans/2026-09-15-pending-collaboration-state-model.md`.
Treat it as input, not a decision.

**Open design option, not a conclusion: make `SupervisorRelationship` authoritative and
`UserLink` a projection of it.** The unused `supervisor_relationships.user_link_id` column is
*suggestive* of that original intent, but an unused column is not evidence of a decision and
must not be treated as one. Before adopting it, the developers should weigh:

- *Migration.* Every existing `type == 'supervisor'` `UserLink` would need a backfilled
  relationship row, including links created by org-unit `assert_supervision`, start codes, and
  the four `parse_activation_code` sites. The partial unique index on (supervisor,
  communicator) where status in (pending, approved) will reject duplicates that the link graph
  currently tolerates.
- *Compatibility.* `UserLink` is read by board caching, `json_api`, org rollups and the
  permission cascade. A projection has to be written before any of those read, or they must be
  taught to read the new source.
- *Rollback.* If the projection is wrong, access is wrong. There must be a way to fall back to
  link-derived permissions without a data restore, which argues for dual-write and a read
  switch rather than a cutover.
- *The alternative.* Keep `UserLink` authoritative and treat `SupervisorRelationship` purely as
  a consent audit record, adding a pending dimension to the link instead. Smaller blast radius,
  keeps one enforcement path, but leaves the consent record advisory.

Also in scope C: `link_supervisor_to_user` has no pending dimension (2.6), which either design
must address.

### D. `OrganizationUnit` scoping as a separate subsystem

`organization_unit_ids` on a link is union bookkeeping for safe removal; **no permission guard
reads it**. Room/caseload scoping is therefore a new subsystem, not a wiring job. Keep it out
of A, B and C.

### On `authored_organization_id`: candidate signal only

The design sketch proposes it as the family-versus-school discriminator. **Do not treat it as a
policy boundary until the paths below are resolved.** CONFIRMED findings:

- Exactly one write site, `app/models/user.rb` inside `process_params`, create-only
  (`!self.id`), gated by `User.validated_org_author`, which requires `org.allows?(author,'edit')`.
  That includes org **assistants**, not only full managers. The code's own comment flags
  whether to restrict it to full managers as an open Phase 1 decision.
- It is **never cleared**. It records the *authoring* org forever, which is not necessarily the
  current governing org after a transfer, and persists after a student leaves.
- Creation paths that do **not** set it: `SupervisorConsentService#create_with_supervisor`
  (passes no author), Google SSO provisioning in
  `app/models/concerns/google_authentication.rb` (two sites), start-code redemption via
  `Organization.parse_activation_code` (never reaches `process_params`), and the seed helpers
  in `lib/seed_organization.rb` and `lib/beta_seed.rb`.
- It is already load-bearing for `lib/compliance/segment_resolver.rb` `school_path?`, for
  `external_email_allowed?`, and for the 2-week pending bypass in `add_supervisor` and
  `update_subscription_organization`.

Net: it identifies one path, an org admin or assistant creating a user through the org console.
It is not a general family-versus-school boundary. Import and transfer paths were not
exhaustively enumerated in this pass: UNVERIFIED.

---

## 4. Validation and rollout

**RSpec.** Scope A needs: a concurrency spec for P1-B that fails without the lock (two threads
or an explicit interleave); a constraint spec asserting the partial unique index rejects a
second active license; a seat-allocation spec for P1-A asserting a ratified user holds a
license. Scope B needs one spec per `permission_level` asserting the exact capability set, which
is what would have caught 2.5. Follow the repo rule: red test first, then mutate the fix to
confirm the spec dies.

**QUnit.** Only if the client renders permission labels or the pending state. Run shape rules
are in `app/frontend/CLAUDE.md`; reconcile against a baseline before calling a delta.

**Cache-aware testing.** Any spec touching board permissions must force
`Board.all_shared_board_ids_for` plus `update_available_boards` before asserting, or it will
measure cache staleness rather than policy. This produced a false negative during this
investigation and is the single easiest way to get a wrong answer here.

**Migration risks.** The partial unique index on `licenses` may fail to build if duplicate
active rows already exist. Check production before writing the migration; there are currently
zero `License` rows, which makes this the cheapest possible moment to add the constraint.

**Production-safe verification.** Read-only checks only, via the audited runner
(`bin/audit_console` / the `lingolinq-admin-audit` job, whose default args are a read-only
`rails runner`). `USER_KEY` is required and the session writes an `AuditEvent`. No production
mutations without Scot's explicit authorization.

**Feature flags.** Scope A is a defect fix and needs none. Scope B changes user-visible
permission labels and behaviour and does need one per repo convention. Note that
`supervisor_consent_flow` is currently forced ON for everyone in `ENABLED_FRONTEND_FEATURES`,
marked TEMPORARY (2026-08-12), with an explicit instruction to return it to AVAILABLE-only
before production go-live. Any Scope B or C work should resolve that flag's status rather than
inherit it. Remember that production flag values can come from a DB override.

**i18n.** Any changed label needs `en.yml` and `es.yml`; the Spanish tree serves unauthenticated
notices and has been missed before.

---

## 5. Decisions for Scot

**Already decided, 2026-09-15.** A district-provisioned account needs no in-app family approval
for a therapist to begin working with the student, on the basis of the start-of-year district
agreement. The branch already behaves this way (see 2.7); the bypasses that deliver it are
deliberate and must not be removed. The questions below are the ones still open.

Product and policy only; the developers cannot infer these. Keep them as **distinct
permissions**. The three-role model and the role names in the design sketch are **not** adopted
and should not be implemented without approval.

1. **What may an unaccepted invitation permit?** For each capability separately: create draft
   content, see that the person exists, see their board structure, see live boards, model on a
   device, edit live boards, read communication history, set goals, change devices, change org
   membership, change billing. Default answer if undecided: nothing beyond draft content.
2. **Does preparation happen in an isolated draft, or does it modify the user's live board?**
   This determines whether Scope C needs a new content state or can reuse the existing pending
   board share. It also decides 2.3.
3. **Who may read communication history?** Currently anyone with an approved relationship at
   any level except `modeling_only`. This is the highest-value single decision in the list.
4. **Who may model, edit boards, and set goals?** Currently these three travel together with
   history access on one guard. Should they separate?
5. **Which family/school exceptions get separate treatment?** Specifically: should the school
   path be restricted to full managers rather than assistants; should it require a signed
   DPA flag; and what should happen to an `authored_organization_id` stamp when a student
   transfers or leaves.
6. **Is the pending board share behaviour in 2.3 intended?** If yes it is a labelling fix; if
   no it is an authorization defect and moves into Scope A.
7. **Should the `managing_organization` fallback become pending-aware?** Unchanged is the
   no-behaviour-change option. Changing it means a pending-only user resolves to no governing
   org at all.

---

## Handling constraints

No messages have been sent to developers. Nothing has been pushed, merged, published, or run
against production. No permissions or configuration were changed. This document and the branch
are the whole deliverable.
