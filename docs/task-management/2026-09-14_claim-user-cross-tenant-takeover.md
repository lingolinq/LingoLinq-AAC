# LL-1baffd92d5: cross-tenant account takeover via Organization#claim_user

**Severity:** Critical (SLA 24-72h; filed 2026-09-02, 12 days old)
**Frameworks:** FERPA, COPPA, GDPR, SOC2
**Branch:** `scot/security/claim-user-target-authorization`
**Status at start:** UNTOUCHED, live in `origin/main`. No fix on any branch, no open PR.

---

## 1. Fact sheet

### (a) Where is the value actually READ?

`claim_user` writes two things. Both are read, and by more than the licensing layer.

**The `managing_organization_id` COLUMN** is read by:
- `User#current_sponsor` CONFIRMED (`app/models/user.rb:32`) `Organization.find_by(id: self.managing_organization_id)`
- `User#in_trial?` CONFIRMED (`app/models/user.rb:36`)
- `AiWordPredictor` CONFIRMED (`lib/ai_word_predictor.rb:265`), which carries an explicit comment at `:244-245` that it reads the COLUMN and deliberately does not call `User#managing_organization`
- `TelemetryEvent` CONFIRMED (`app/models/telemetry_event.rb:31`) `return user.managing_organization_id if user.managing_organization_id`

**The `org_user` UserLink** is read through `User#managing_organization` CONFIRMED (`app/models/concerns/supervising.rb:74`), which resolves `Organization.attached_orgs(self)` and filters on `o['pending']`. Its readers are the compliance and gating layer:
- `lib/feature_flags.rb:241` (AI feature gating)
- `lib/compliance/jurisdiction_resolver.rb:86`
- `lib/compliance/segment_resolver.rb:47`
- `lib/eu_jurisdiction.rb:151`
- `app/models/ai_focus_word_set.rb:76`
- `lib/system_feature_settings.rb:85`

**Consequence, and it is worse than the finding states.** `claim_user` writes the column AND generates a link with no `pending` key, so both readers resolve to the attacker's org. A successful claim does not merely steal a seat: it moves the victim's **compliance jurisdiction, AI feature gating, AI routing org scope and telemetry attribution** into the attacker's organization. For a GDPR data subject this silently relocates the controller relationship.

Note `User#current_sponsor` (column) and `User#managing_organization` (link graph) are **different methods**, not a redefinition. Both exist and both matter.

### (b) All reachable shapes, and the writer of each

Runtime writers of the column: exactly two. CONFIRMED by grep over `app/` and `lib/`.
- `Organization#claim_user` (`app/models/organization.rb:29`) sets it. The defect.
- `License#release` (`app/models/license.rb:97`) sets it to `nil` and `expires_at` to `2.months.from_now`.

Reachable target states at claim time:
1. Unmanaged consumer or parent-owned account (column `nil`, no `org_user` link)
2. Already managed by THIS org
3. **Managed by ANOTHER org** (the cross-tenant case; `user.update!` overwrites unconditionally)
4. Pending-attached to this org (link exists, `state['pending']` true)
5. Consented member of this org (link exists, `state['pending']` falsy)

States 1 and 3 are the takeover. State 5 is the only legitimate use of the direct endpoint.

### (c) Cross-file claims, each checked

| Claim | Verdict |
|---|---|
| `add_user` is a second caller of `claim_user` | **TRUE** (`app/models/organization.rb:1046`, `return self.claim_user(user, 'student')`) |
| The org UI adds users as pending | **TRUE** (`app/models/organization.rb:1845,1848,1850`, all three `add_user(key, true, ...)`) |
| `claim_user` ignores `pending` | **TRUE**. Its signature has no such parameter, and `UserLink.generate(user, self, 'org_user', { sponsored: true })` sets no `pending` key. `UserLink.generate` (`app/models/user_link.rb:41-52`) assigns `data['state'] = state if state`, so `state['pending']` is `nil`, which is falsy, so the link reads as **non-pending and immediately active**. |
| A target-side consent primitive already exists | **TRUE**. `SupervisorKeyProcessor#process_approve_org` (`app/services/supervisor_key_processor.rb:67-70`) reads `user.managing_organization(true)`, the PENDING org, and re-runs `update_subscription_organization(..., false, ...)`. The user performs this on their own account. |
| `claim_user` is the only path that BINDS a licence seat | **TRUE**, and load-bearing. `license.update!(user_id: ...)` appears only at `app/models/organization.rb:27`. `License#release` is the only unbind. **Nothing binds a seat when a pending user later approves.** |
| The existing controller spec encodes the vulnerability | **TRUE** (`spec/controllers/api/organizations_controller_spec.rb:785`). It creates a bare `User.create` with no relationship to the org and asserts `response.successful? == true`. Any correct fix must change this spec. |
| Throttling protects the endpoint | **TRUE** (`config/initializers/throttling.rb:30`) but rate limiting is not authorization. |
| The `pending=false` callers are attacker-reachable | **NOT ESTABLISHED.** `organization.rb:1470` (`activate_for` purchase/gift activation), `gift_purchase.rb:231`, and `lib/seed_organization.rb`. The org UI cannot reach them. Whether the purchase flow can be driven with an arbitrary `activate_for` target is **an open question for review**, and it is the one path that would bypass the proposed gate. |

Nothing ASSUMED is load-bearing except the last row, which is called out as an open question rather than relied on.

---

## 2. The red test (written before the fix)

Derived from the traced mechanism, not from the fix. Three cases, in `spec/models/organization_spec.rb` plus one controller case:

1. **Cross-tenant rejection.** Org A and Org B each with an active student licence. User is claimed by A (legitimately). B calls `claim_user` on the same user. Expect: raises, `user.reload.managing_organization_id` still A's id, B's licence still `user_id: nil`.
2. **Unconsented stranger rejection.** Org with a free seat, target user with no `org_user` link. Expect: raises, no column write, seat unbound.
3. **Consented member still works.** Target has a non-pending `org_user` link to the org. Expect: succeeds, column set, seat bound. This is the regression guard for the legitimate flow.
4. **Controller.** Manager POSTs `claim_user` for an unrelated user. Expect a 400 and no state change, in place of today's `success: true`.

**Weakest passing state check:** if the test only asserted that `claim_user` raises, a fix that raises on everything would pass while destroying the product. Case 3 is what makes the suite meaningful, so it is mandatory, not optional.

**The mutation that must make it fail:** removing the target-side guard from `claim_user` must turn cases 1, 2 and 4 red while 3 stays green.

---

## 3. Proposal

### Diagnosis

`Organization#claim_user` (`app/models/organization.rb:19-35`) authorizes only the requester (`allowed?(@org, 'manage')` at `app/controllers/api/organizations_controller.rb:246`) and performs no check of any kind on the target. `user.update!(managing_organization_id: self.id, expires_at: license.expires_at)` overwrites a prior managing org unconditionally.

There is a second and previously unreported half. The org UI calls `add_user(key, true, ...)`, meaning **pending, consent required**, and `add_user`'s licence fast-path (`organization.rb:1043-1048`) routes to `claim_user`, which has no `pending` parameter and therefore **silently discards the pending semantics the rest of the system honours**. So even the ordinary, well-intentioned "add a student" flow performs a consent-free binding whenever a formal seat happens to be free. A fix at the controller alone would leave this open.

### Option A (recommended): authorize the target inside `claim_user`, keep seat binding synchronous

- Hard reject when `user.managing_organization_id` is present and is not `self.id`. No legitimate flow transfers a user between districts by username; a transfer must go through `License#release` first.
- Require target-side authorization otherwise: either the caller explicitly asserts a non-pending attachment (`pending: false`, the purchase and seed paths), or the target already holds a **non-pending** `org_user` link to this org (state 5, the legitimate use of the endpoint).
- `add_user` passes its own `pending` through, so the org UI path (`pending: true`) no longer binds; it falls through to the existing `update_subscription_organization` branch that creates the pending link and awaits `process_approve_org`.
- Record prior and new managing org on the `license_claim` AuditEvent.

**Trade-off:** preserves the current synchronous seat binding, so no seat accounting changes and no new approval-side machinery. It does change behaviour for one real flow: a manager adding a brand-new student now gets a pending attachment rather than an immediate sponsorship, until the user approves. That is the correct behaviour and it is what `pending=true` already meant everywhere else, but it is a visible product change and Scot should know it is in the diff.

### Option B: pending-claim state, seat binds on acceptance

The register's alternative. `claim_user` records a pending claim; the column and the seat bind only after `process_approve_org`.

**Rejected for this change.** `claim_user` is the only code path in the repo that binds a licence seat (verified above). Option B therefore requires building seat binding into the approval path, and until that exists every pending claim leaks a paid seat that is reserved but never bound. That is a materially larger blast radius than the vulnerability warrants as a same-week fix. Option B is the better long-term design and should be a separate, planned change.

### Simplest alternative considered and rejected

Add the target check to `Api::OrganizationsController#claim_user` only. Rejected: it leaves `add_user`'s licence fast-path (`organization.rb:1046`) fully exploitable, and the model is the correct boundary because both entry points converge there.

### Risks I can see

- **The existing spec at `organizations_controller_spec.rb:785` will go red.** It encodes the vulnerable behaviour. It must be rewritten to establish a consented member first, preserving its actual subject (that `external_reference` is not exposed, LL-55baae6d40). Rewriting it is correct, not test-fudging, but it must be called out loudly in the PR body.
- **Seed and demo scripts** (`lib/seed_organization.rb`) pass `pending=false` and should keep working, but they are the most likely place to discover an ordering assumption.
- **Product behaviour change** for new-student adds, as described under Option A.
- **`org_assertions` and cache invalidation** run on the existing paths; deferring the bind changes when they fire. Not traced in depth.

### Questions I could not resolve

1. Is `organization.rb:1470` (`activate_for`, purchase/gift activation, `pending=false`) reachable with an attacker-chosen target? It is the one path that bypasses the proposed gate.
2. Should an existing pending link to THIS org be sufficient to bind, or must it be non-pending? I propose non-pending (consent actually given). This is a product/legal call as much as a technical one, and it is the difference between "invited" and "accepted".
3. Should a cross-org claim raise, or move the user to a pending state for the new org? I propose raise, as the smaller blast radius.

---

## 4. Dual review outcome: the proposal above is REJECTED as drafted

Two independent reviewers (adversary red-team, security-reviewer) ran against the proposal before any
code was written. Between them: **4 blockers**, three of which they found independently of each other.
Option A as drafted would have shipped a gate that does not hold.

### Converged blockers (both reviewers, independently)

**C1. `UserLink.generate` replaces `data['state']` wholesale, so the gate reads the vulnerability's own output as consent.**
CONFIRMED, and I re-read it myself: `res.data['state'] = state if state` (`app/models/user_link.rb`). `claim_user`
passes `{ sponsored: true }`, which contains no `pending` key, so every link the **vulnerable code has already
minted** reads falsy and therefore "non-pending". A gate keyed on "not pending" would let every org re-claim every
user it has already taken. Worse, the same assignment means calling `claim_user` on a genuinely pending user
**silently destroys `pending: true` and `added`**, which is a live defect in the current code independent of this fix.
The gate must require `state.key?('pending') && state['pending'] == false && state['added'].present?`, a shape only
`update_subscription_organization` writes.

**C2. Forwarding `pending` into a raising `claim_user` breaks the primary org onboarding flow.**
CONFIRMED. The org UI calls `add_user(key, true, ...)`; a raise propagates to
`rescue => e; add_processing_error("user management action failed: ...")` and every add-a-student fails behind a
generic 400. The authorization check inside `add_user` must be a **non-raising predicate** that falls through to the
existing pending branch. `claim_user` raises only for the direct controller entry point.

**C3. The fix is prospective only; there is no remediation path for users already bound.**
CONFIRMED. `Organization#detach_user` removes the UserLink but never clears `managing_organization_id` nor releases
the seat, and the `"r<org_id>"` branch of `update_subscription_organization` never calls `release_user!`. Only the
**attacking** org or the stale-licence sweep can free a victim. A remediation pass must ship alongside, and the PR
body must say the gate is prospective.

### The blocker that changes the finding itself

**C4. The `pending: false` exemption is attacker-reachable, at a LOWER privilege bar than the register records, through an entry point the register does not mention.**
Raised by the adversary; **the security reviewer got this wrong** and I verified the chain myself end to end rather
than taking either at face value.

The security reviewer asserted "exactly two callers pass a target-bearing second argument, both in
`users_controller.rb`" and concluded open question 1 resolves to NO. That is **factually incorrect**. There are three
callers of `Organization.parse_activation_code` and two pass a target; one of them is
`app/services/supervisor_key_processor.rb`, which the reviewer missed:

```
app/services/supervisor_key_processor.rb:112:    res = Organization.parse_activation_code(@key, user)
app/controllers/api/users_controller.rb:281:    res = Organization.parse_activation_code(user_data['start_code'], user)
```

The chain, each hop read directly:
1. `Api::OrganizationsController#start_code` gates on `return unless allowed?(@org, 'edit')`. Per
   `add_permissions('view', 'edit') {|user| ... self.assistant?(user) }` (`app/models/organization.rb`), an org
   **assistant** holds `edit`. So an assistant can mint an activation code carrying `overrides['premium']`.
2. `Api::UsersController#update` accepts a `supervisor_key` from an actor holding `manage_supervision` (or `edit`)
   on the **target**: `elsif user.allows?(@api_user, 'manage_supervision') && !user.allows?(@api_user, 'edit')` then
   `user_data = user_data.slice('supervisor_key')`.
3. `User#process_params` runs `self.process_supervisor_key(params['supervisor_key'])` (`app/models/user.rb:3089`)
   where **`self` is the target user**, not the actor. `SupervisorKeyProcessor.new(self, key)`
   (`app/models/concerns/supervising.rb:204`) therefore carries the target as `user`.
4. `process_start` calls `parse_activation_code(@key, target)`, reaching
   `org_or_user.add_user(activate_for.user_name, false, !!overrides['premium'], false)` with `pending = false`.

Both variants defeat the drafted gate. With `premium` truthy, `sponsored=true` takes the licence fast path into
`claim_user` with the `pending: false` exemption. With `premium` falsy, `sponsored=false` skips the fast path into
`update_subscription_organization(self, false, false, false)`, which writes
`link.data['state']['pending'] = !!pending unless pending == nil`, minting a link with `pending` **explicitly false
and `added` stamped**, which satisfies even the hardened C1 gate. The attacker then calls `claim_user` normally.

**Consequence for the register.** LL-1baffd92d5 is filed as "any manager with a free seat". The real bar is an org
**assistant** (to mint the code) plus **supervisor-level** rights on the target (to deliver the key), and the
`supervisor_key` route is a second entry point the finding does not mention. This is a distinct defect in its own
right and is filed separately rather than folded into this change.

### Other review findings adopted

- **Use org-scoped INSTANCE helpers, never the class methods.** `Organization.managed?` has no `record_code` and no
  `user_id` filter; `Organization.sponsored?` has no `record_code` filter; `Organization.attached_orgs` is all-orgs by
  construction. Any of them lets a user attached to org A satisfy a gate evaluated for org B. (security-reviewer, CONFIRMED)
- **Audit the DENIAL, not just the success.** Today the `license_claim` AuditEvent is written only after success, so
  under the fix a rejected cross-tenant attempt becomes a 400 that nobody sees. Both reviewers flagged it; for a
  FERPA/SOC2 CC6 control the denial is the event a district auditor needs. (both)
- **Place the guard above the seat lookup and outside `License.transaction`.** (security-reviewer)
- **`License.transaction` does roll back the seat binding when `user.update!` raises.** Verified by the reviewer; no
  change needed. (security-reviewer, CONFIRMED)
- **Do not use `add_permissions`/`allows?` on the target User for this gate.** Reviewer recommends against: org
  managers and supervisors already hold `edit` on their users, so an `allows?`-based gate would pass for exactly the
  actors being defended against. (security-reviewer, CONFIRMED; I agree, and it is why I did not adopt the idiom)
- **Unguarded sibling: `Organization#remove_user` has no target-org membership check.** Out of scope here, filed separately.

### Revised plan

The consent half and the cross-tenant half have very different blast radii, and C4 means the consent half is not
closeable without also fixing the `supervisor_key` entry point. Splitting:

**This change (small, non-forgeable, closes the headline):**
1. `claim_user` hard-rejects when `user.managing_organization_id` is present and is not `self.id`. Non-forgeable:
   an attacker cannot clear a victim's column, and no legitimate flow transfers a managed user between orgs by
   username (transfer goes through `License#release`, which nils it).
2. The guard sits above the seat lookup and outside `License.transaction`.
3. An `AuditEvent` is written on DENIAL, recording requesting org, target, and the prior managing org.
4. Red tests per section 2, plus a rewrite of `organizations_controller_spec.rb`'s claim_user case, which currently
   asserts the vulnerable behaviour.

**Deliberately NOT in this change, and stated as residual:**
- The consent gate for **unmanaged** targets. It depends on fixing `process_start`/`supervisor_key` first (C4),
  otherwise the gate is forgeable.
- The remediation pass for already-bound victims (C3).
- `Organization#remove_user`'s missing target check.

---

## 5. Post-review corrections to the fact sheet, verified independently

Three items surfaced in the full review text after the fix was committed. Each was re-verified here rather
than accepted on the reviewers' word.

### 5.1 Exploitability is LATENT, not live: nothing in the repo creates a `License` row

**CONFIRMED, and this changes the severity narrative.**

```
$ grep -rnE 'License\.create|License\.new|licenses\.create|licenses\.build' app/ lib/ db/ config/
(no output)
$ grep -rnE 'License\.create|License\.new|licenses\.create|licenses\.build' spec/ | wc -l
18
$ grep -n 'license' config/routes.rb
338:      get 'licenses'
$ grep -rn 'claim_user' app/frontend/
(no output)
```

No production code path, rake task, seed, controller or migration creates a `License`. The only licence
route is read-only. The frontend never calls `claim_user`. `lib/seed_organization.rb` sets
`settings['total_licenses']`, a different legacy counter, not `License` rows.

So as the code stands, `self.licenses.where(user_id: nil, seat_type: seat_type, status: 'active').first`
returns nil and `claim_user` raises "No seats available in this district" before reaching anything. The
`add_user` licence fast-path is likewise dead.

**What this does and does not mean.** The defect is real, present and unfixed in production code, and it
becomes live the moment the licensing feature is switched on or any seat row is created out of band
(console, direct SQL, a future migration). It is not currently a 24-hour incident. The register and the Q3
audit report both describe LL-1baffd92d5 as live in production; that should be amended to "present and
unfixed, exploitable only once `License` rows exist".

**SETTLED 2026-09-14 against production. The count is zero.** Run read-only through the existing audited
`lingolinq-admin-audit` Cloud Run job (`USER_KEY=ops-audit`) with a per-execution args override, which does
not mutate the job definition; execution `lingolinq-admin-audit-cs8z2`:

```
LICENSES_TOTAL=0        SEATS_FREE_ACTIVE=0        SEATS_BOUND=0
ORGS_WITH_LICENSES=0    USERS_WITH_MANAGING_ORG=0
```

The `licenses` table is empty and **no user carries a `managing_organization_id` at all**. Two consequences:

1. **LL-1baffd92d5 is latent, not exploitable.** `claim_user` raises "No seats available in this district"
   before reaching the vulnerable write, on both entry points. Severity should be restated as a latent
   Critical gated on a precondition that does not currently hold. Only Scot downgrades severity.
2. **Blocker C3 is moot.** There is no remediation backlog because there are zero bound users. Nothing was
   ever taken. That objection can be struck from the design constraints.

This also invalidates the doc's original reason for rejecting Option B. "Option B leaks a paid seat" is
moot when no seats exist, so there is room to do the pending-claim design properly rather than under
incident pressure.

### 5.2 The impact is worse than "seat theft": it reaches password reset

**CONFIRMED (adversary), and it should be in the finding's notes.** `Organization.manager_for?` keys on the
non-pending `org_user` LINK, not on the column. `app/models/user.rb` grants `'manage_supervision'`,
`'support_actions'` and `'link_auth'` on that basis, and `Api::UsersController#update` has
`elsif params['reset_token'] == 'admin' && user.allows?(@api_user, 'support_actions')` which slices
`user_data` down to `password` and sets `options[:allow_password_change] = true`. A successful claim
therefore lets the attacking org **set the victim's password**. This is account takeover, not seat theft.

### 5.3 The shipped guard also refuses intra-hierarchy transfers

**CONFIRMED.** `upstream_manager?` grants a full manager of a parent org `manage` on its children, so a
parent/child move inside one district reaches `claim_user` and is now refused. This is a deliberate
decision, not an oversight: such a transfer must route through `License#release_user!` (which clears the
column) like any other. It is recorded as a comment in `claim_user` so nobody adds an admin or upstream
escape hatch later. If districts turn out to need in-place hierarchy moves, that is a feature to design,
not a guard to weaken.

### 5.4 Other review items NOT addressed by this commit

- **Concurrent claims split-brain** (adversary, PLAUSIBLE). Seat selection is
  `licenses.where(user_id: nil, ...).first` then `license.update!` with no row lock and no unique index on
  `licenses.user_id`. Two concurrent claims select the same row; both users get `managing_organization_id`
  set and the loser is bound with no seat. Needs `FOR UPDATE SKIP LOCKED` or an affected-row assertion.
- **`add_user` via `management_action` is reachable by an org ASSISTANT** (`allowed?(org, 'edit')`), and that
  route is NOT covered by `Throttling::PROTECTED_PATHS`, which only lists
  `api/v1/organizations/.+/claim_user`.
- **`Organization#remove_user` has no target-org membership check** and can drive
  `begin_family_offboarding_consents!` on a stranger, writing `under_16` / `eu_under_16`, which feed the
  Art. 8 / Art. 50 AI gate. The correct in-file idiom already exists in `add_extras_to_user`:
  `raise "user not attached to org" unless valid`.
- **`JsonApi::License#build_json` emits `metadata` with no permissions check** although the field is
  secure_serialized as potentially sensitive district/billing data, and 'edit' includes assistants.
- **Fact-sheet correction:** the License method is `release_user!`, not `release`.


---

## 6. NEW, and it does NOT depend on licences: a live escalation to password control

Found while confirming that the seat count settled the severity question. Filed here because it is a
**different defect** from LL-1baffd92d5 and is not in the register.

Every link below was read directly, not inferred:

- `Organization.manager_for?` keys on the target's **non-pending** links:
  `select{|l| (l['type'] == 'org_user' || l['type'] == 'org_supervisor') && l['user_id'] == user.global_id && !l['state']['pending'] }`
- `app/models/user.rb:86` grants on that basis:
  `add_permissions('manage_supervision', 'support_actions', 'link_auth') {|user| Organization.manager_for?(user, self) && !user.valet_mode? }`
- `app/controllers/api/users_controller.rb:210` unlocks the password write:
  `elsif params['reset_token'] == 'admin' && user.allows?(@api_user, 'support_actions')`
- The `start_code` plus `supervisor_key` path reaches `add_user(victim, false, !!premium, false)`. With
  `premium` falsy, `sponsored=false` skips the licence fast-path entirely and calls
  `update_subscription_organization(self, false, false, false)`, which writes
  `link.data['state']['pending'] = !!pending unless pending == nil`, i.e. **an explicitly non-pending
  `org_user` link, with no `License` row required**.

So an actor who is a full manager of any org can attach a victim to that org as non-pending, become
`manager_for?` them, gain `support_actions`, and **set their password**. No seat, no licence, no
`managing_organization_id` write. The zero seat count does not mitigate this at all.

**Precondition that bounds it, stated honestly:** delivering the `supervisor_key` needs
`manage_supervision` or `edit` on the target (`app/controllers/api/users_controller.rb`, the
`user_data.slice('supervisor_key')` branch), so the attacker must already supervise or manage the victim.
It is therefore an escalation from **supervisor to password control**, not takeover of an arbitrary
stranger by username. That is still a real defect: a supervising therapist should not be able to set a
communicator's password and lock out the family.

Note the contrast that shows the shape is specific, not general: the `management_action=add_user-<victim>`
route passes `pending=true`, producing a pending link, which `manager_for?` correctly refuses. Only the
`pending=false` callers mint the dangerous link.

Suggested severity High. Candidate register row; not filed, because promoting is a register mutation that
requires regenerating artifacts or CI fails.
