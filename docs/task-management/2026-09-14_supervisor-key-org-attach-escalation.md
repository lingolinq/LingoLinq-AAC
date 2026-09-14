# supervisor_key org-attach escalation: third party ratifies an org attachment on a communicator's behalf

**Status:** Phase 1 gate IMPLEMENTED, then BLOCKED by dual review. Do not merge. See section 8.
Discovered 2026-09-14 while settling the LL-1baffd92d5 seat count.
**Not in the findings register.** Suggested severity High.
**Related:** [2026-09-14_claim-user-cross-tenant-takeover.md](./2026-09-14_claim-user-cross-tenant-takeover.md) section 6.
**Why it matters now:** unlike LL-1baffd92d5, this needs **no `License` row**, and prod has zero. It is the
only live item in this cluster.

---

## 1. Fact sheet

### (a) Where is the value READ?

The value is a **non-pending `org_user` / `org_supervisor` UserLink**, and it is read as an authorization input:

- `Organization.manager_for?` (`app/models/organization.rb`) selects the target's links with
  `(l['type'] == 'org_user' || l['type'] == 'org_supervisor') && l['user_id'] == user.global_id && !l['state']['pending']`
  and returns true when they intersect the actor's `full_manager` org links. CONFIRMED.
- `app/models/user.rb:86` grants on exactly that:
  `add_permissions('manage_supervision', 'support_actions', 'link_auth') {|user| Organization.manager_for?(user, self) && !user.valet_mode? }` CONFIRMED.
- `app/controllers/api/users_controller.rb:210` converts `support_actions` into a password write:
  `elsif params['reset_token'] == 'admin' && user.allows?(@api_user, 'support_actions')` then
  `user_data = user_data.slice('password'); options[:allow_password_change] = true`. CONFIRMED.

So minting a non-pending org link for a user is not a bookkeeping act. It grants the org's managers
`support_actions` over that user, which is password control.

### (b) All the shapes, and the writer of each

Writers of a non-pending `org_user` link, repo-wide:

1. `Organization#claim_user` via `UserLink.generate(user, self, 'org_user', { sponsored: true })`. No
   `pending` key, so falsy, so non-pending. **Currently unreachable in prod: zero `License` rows.**
2. `User#update_subscription_organization` (`app/models/concerns/subscription.rb`) via
   `link.data['state']['pending'] = !!pending unless pending == nil`. Writes `pending` **explicitly**, and
   stamps `link.data['state']['added'] ||= Time.now.iso8601`. **Reachable with no licence at all.**

Writer 2 is reached with `pending = false` from `Organization#add_user(user_key, pending, sponsored, eval)`
whenever `sponsored` is false, because `if sponsored && !eval_account` skips the licence fast-path.

### (c) Cross-file claims, each checked

| Claim | Verdict |
|---|---|
| A third party can submit `user[supervisor_key]` for another user | **TRUE**, by two routes. `users_controller#update` has an explicit slice branch, `elsif user.allows?(@api_user, 'manage_supervision') && !user.allows?(@api_user, 'edit')` then `user_data = user_data.slice('supervisor_key')`; and an actor holding `edit` falls to the `else` branch (`return unless allowed?(user, 'edit')`) which passes the **full** payload, `supervisor_key` included. |
| The key is processed against the TARGET, not the actor | **TRUE**. `User#process_params` runs `self.process_supervisor_key(params['supervisor_key'])` (`app/models/user.rb:3089`) where `self` is the user being updated; `process_supervisor_key` is `SupervisorKeyProcessor.new(self, key).call` (`app/models/concerns/supervising.rb:204`). |
| The acting user is already available inside `process_params` | **TRUE**, and this is what makes a clean fix possible. `users_controller#update` sets `options['updater'] = @api_user` before `user.process(user_data, options)`, and `process_params` already uses it: `if !non_user_params['updater'] \|\| non_user_params['updater'].global_id != self.global_id` (`app/models/user.rb:2715`). No new threading is needed to reach `process_params`; only `process_supervisor_key` needs the argument. |
| `start-<code>` can attach the target to an org with no licence | **TRUE**. `process_start` calls `Organization.parse_activation_code(@key, user)`, which reaches `org_or_user.add_user(activate_for.user_name, false, !!overrides['premium'], false)`. With `overrides['premium']` falsy, `sponsored=false`, the licence path is skipped, and writer 2 mints an explicitly non-pending link. |
| `approve-org` is a second, simpler route to the same end | **TRUE**, and it needs no activation code. `process_approve_org` does `user.update_subscription_organization(user.managing_organization(true).global_id, false, nil, nil)`, i.e. it takes the target's **pending** org and ratifies it as non-pending. An org manager can create the pending link via `management_action=add_user-<victim>` (which passes `pending=true`) and then ratify it on the victim's behalf. |
| `parse_activation_code` can be called lookup-only, before side effects | **TRUE**. `users_controller#create` already does `code = Organization.parse_activation_code(user_data['start_code'])` with no target purely to validate. This is what lets a guard resolve the target org before anything is written. |
| Prod has zero licence seats, so this is the live path | **TRUE**, measured. Execution `lingolinq-admin-audit-cs8z2`: `LICENSES_TOTAL=0`, `SEATS_FREE_ACTIVE=0`, `USERS_WITH_MANAGING_ORG=0`. |

### The bound on severity, stated honestly

Both dangerous actions require the actor to already hold `manage_supervision` or `edit` on the target. A
pending link does **not** grant `manage_supervision` (`manager_for?` filters `!l['state']['pending']`), so
an attacker cannot bootstrap from nothing. This is an escalation from **existing supervisor or manager of
the user** to **password control**, not takeover of an arbitrary stranger by username. It is still a real
defect: a supervising therapist should not be able to attach a communicator to their own organization and
then set that communicator's password, locking out the family.

---

## 2. The product decision this turns on, and why I am not deciding it alone

The obvious fix is "supervisor_key actions are self-only". **That would be wrong, and it would break the
product.**

`add_permissions('edit', 'manage_supervision', ...) {|user| user.edit_permission_for?(self, true) ... }`
(`app/models/user.rb`) grants these rights to supervisors, which includes **parents and guardians managing a
communicator's account**. In AAC, acting on behalf of the communicator is the normal case, not an exception;
many communicators cannot operate an activation-code flow themselves. A self-only rule would stop a parent
redeeming their child's school start code, which is a core onboarding path.

So the gate must separate **acting for someone** (legitimate, must keep working) from **acting for someone
into your own organization** (self-dealing, the defect).

**Proposed gate: refuse when the acting user is a manager or assistant of the organization the key would
attach the target to, and the actor is not the target.**

- Parent redeems a school's start code for their child: parent does not manage the school. **Allowed.**
- Therapist redeems a code for a client into a clinic they do not manage. **Allowed.**
- Org manager sends `start-<their own org's code>` or `approve-org` for a user they supervise.
  **Refused.**
- User acts on their own account. **Always allowed.**

Implementable with what already exists: resolve the org with a lookup-only `parse_activation_code(@key)`
(no target, no side effects) before acting, then test `org.manager?(actor) || org.assistant?(actor)`.
`Organization#manager?` and `#assistant?` are both defined (`app/models/organization.rb:464`, `:475`).

**The question for Scot, because it changes what ships:** is "the actor must not manage the receiving org"
the right line, or should ratifying an org attachment on another user's behalf require something stronger,
such as the target's own confirmation, even for a parent? The second is safer and more disruptive, and for
an under-13 communicator it interacts with the COPPA consent story. I do not think an agent should pick
the AAC care model unilaterally.

---

## 3. Candidate fixes

### Option A (recommended): self-dealing gate at the key processor

Thread the actor into `SupervisorKeyProcessor` (`process_supervisor_key(key, actor)`, defaulting to `self`
so existing non-controller callers are unchanged), and in `process_start` and `process_approve_org` refuse
when the resolved org is managed by the actor and the actor is not the target. Audit the refusal.

Blast radius: two key actions, one new argument with a safe default. Parent and guardian flows untouched.

### Option B: restrict the controller slice

Drop `supervisor_key` from the `manage_supervision` slice branch entirely, so only actors with `edit` can
send it. Rejected as primary: it does not close the hole (a supervisor with `edit` still reaches it through
the `else` branch with the full payload) and it silently breaks whatever legitimately uses that branch.

### Option C: change the authorization model so an org link does not confer `support_actions`

The deepest fix, and arguably the correct one: password control should not fall out of org attachment at
all. Rejected for now as far too large a blast radius for this pass, and it would need its own threat
model. Worth recording as the strategic direction.

### Simplest alternative considered and rejected

Blanket self-only on `supervisor_key`. Rejected for the product reason in section 2.

---

## 4. Risks and unresolved questions

- I have **not** enumerated every legitimate caller of the `manage_supervision` slice branch. If some
  first-party flow relies on an org manager sending `start-` or `approve-org` for a user, Option A breaks
  it. That needs a frontend sweep before coding.
- `process_add` (adds a supervisor to the target) and `approve_consent` / `deny_consent` (parental consent
  decisions) are the same shape and are **not** covered by Option A as scoped. They should probably be in
  the same change; I have not traced them.
- Severity depends on how many real supervisor relationships exist in prod. `USERS_WITH_MANAGING_ORG=0`
  says nothing about `org_user` links or supervisor links; that is a separate count and has not been run.

---

## 5. Measurements taken 2026-09-14 (read-only, audited job)

### Prod relationship census (execution `lingolinq-admin-audit-p5l6r`)

```
USERS_TOTAL=39   ORGS_TOTAL=3   USERLINKS_TOTAL=94
LINKTYPE_org_user=23   ORG_USER_NONPENDING=23   (every org_user link is non-pending)
LINKTYPE_org_manager=6   LINKTYPE_supervisor=29   LINKTYPE_org_supervisor=9
LINKTYPE_org_unit_communicator=21   LINKTYPE_org_unit_supervisor=5   LINKTYPE_board_share=1
```

The precondition the escalation needs (an existing supervisor or manager relationship over the target) is
**present** in prod: 29 supervisor links and 6 org-manager links. Per the standing note that prod carries
only test and fake accounts, real-world exposure is bounded, but the code path is live and the data shape
that enables it exists. Contrast the licence census for LL-1baffd92d5, which was all zeros.

### Frontend sweep: who legitimately sends `supervisor_key` (risk 4.1, partially resolved)

Every frontend sender found sets the key on the **signed-in user's own record**, which Option A always
permits:

- `app/frontend/app/controllers/user/index.js`: `user.set('supervisor_key', "approve-org")`,
  `"remove_supervisor-org"`, `"approve_supervision-" + org_id`
- `app/frontend/app/controllers/user/subscription.js`: `"approve-org"`, `"remove_supervisor-org"`
- `app/frontend/app/components/dashboard/authenticated-view.js`: `'approve-org'` / `'remove_supervisor-org'`
  on the org-consent notice
- `app/frontend/app/components/supervision-settings.js` and `controllers/supervision-settings.js`:
  activation code, `remove_supervision-`, `remove_supervisee-`
- `app/frontend/app/components/add-supervisor.js` and `controllers/add-supervisor.js`: `type + '-' + user_name`

~~**No frontend caller sends a `start-` or `approve-org` key against a DIFFERENT user's record.**~~

**RETRACTED 2026-09-14, this claim was FALSE** and the dual review caught it. The sweep grepped for
`supervisor_key` and read the assignment, but never traced what `user` was bound to. It is the VIEWED
user, not the session user:

- `app/frontend/app/components/add-supervisor.js`: `const user = controller.get('model.user')` then, when
  a start code was entered, `user.set('supervisor_key', type + '-' + user_name)` with `type` = `'start'`.
- The modal is opened with the viewed user in all three places:
  `app/frontend/app/controllers/user/index.js` and `controllers/supervision-settings.js` both
  `modal.open('add-supervisor', {user: _this.get('model')})`, and
  `components/supervision-settings.js` the same via `modalUtil.open`.

So a therapist who manages a school org and supervises a student, enrolling that student with the
school's own start code, is exactly the case the gate refuses. That is an ordinary onboarding action and
the gate breaks it. Worse, it breaks it **silently**: `User#process_params` treats a false return as
non-fatal and only `Rails.logger.warn`s, so the PUT returns 200 and `add-supervisor.js` takes its
`else { add_done(); }` branch and closes the modal as success.

The lesson: an assertion about "no caller does X" is only as good as the binding trace behind it. Grepping
the call site is not tracing the receiver.

---

## 6. Red tests written, and the escalation is now DEMONSTRATED

Six specs added to `spec/services/supervisor_key_processor_spec.rb` under
`describe "self-dealing gate on third-party org attachment"`, written before any fix.

They are driven through `User#process(user_data, {'updater' => actor})` rather than
`SupervisorKeyProcessor.new` directly, because that is the real request path
(`Api::UsersController#update` sets `options['updater'] = @api_user`, and `User#process_params` then calls
`self.process_supervisor_key` where `self` is the target). Written this way they fail because the
escalation **succeeds**, not because a method signature does not exist yet, and they remain valid however
the actor ends up threaded.

**Red state, confirmed by running them:** the three guard cases fail and the three regression guards pass.

| Case | Expected | Actual today |
|---|---|---|
| `approve-org` by an actor managing the pending org | stays pending | **ratified** on the target's behalf |
| `start-<code>` for an org the actor manages | not attached | **attached** |
| denial AuditEvent written | present | absent (no gate) |
| user runs `approve-org` on their own account | works | works |
| third party redeems a code for an org they do NOT manage | works | works |
| third-party removal action | works | works |

The last three are what make the suite meaningful: a gate that refused everything would satisfy the first
three while destroying the parent and guardian onboarding path.

### Correction to section 1: this is no longer only a traced chain

Earlier notes described the escalation as a confirmed *reading* rather than a demonstrated exploit. It is
now demonstrated. A temporary spec (since deleted) ran the full chain against the test database:

```
BEFORE  manager_for? = false    support_actions = false
AFTER   attached_to_org = true  link_nonpending = true
        manager_for? = true     support_actions = true
```

One `supervisor_key` request, **no `License` row involved**, moves an actor who merely supervises the
target from no authority to holding `support_actions` over them. `support_actions` is exactly the
permission `Api::UsersController#update` checks at
`elsif params['reset_token'] == 'admin' && user.allows?(@api_user, 'support_actions')` before slicing the
payload to `password` and setting `options[:allow_password_change] = true`.

The password write itself was not performed; the permission gate that authorises it was observed flipping
from false to true. That is the security-relevant boundary.

---

## 7. Implemented: Phase 1 self-dealing gate

`SupervisorKeyAuthority` (`app/services/supervisor_key_authority.rb`) holds the policy: a self-only
default with enumerated exceptions. `SupervisorKeyProcessor` consults it before each org-attaching
action. The actor is threaded from `options['updater']`, which `Api::UsersController#update` already
sets, through `User#process_params` and `Supervising#process_supervisor_key`, defaulting to the target so
every existing caller keeps its current self-action behaviour.

**The rule:** no actor may attach or ratify ANOTHER user into an organization that actor manages, assists,
or upstream-manages. Acting FOR a communicator into an org the actor does not manage stays allowed.

### Gated actions

| Action | Link it writes | How the org is resolved |
|---|---|---|
| `approve-org` | `org_user` non-pending | `user.managing_organization(true)` |
| `start-<code>` | `org_user` non-pending | side-effect-free one-arg `parse_activation_code`, third-party only |
| `approve_supervision` | `org_supervisor` non-pending | `Organization.find_by_global_id(@key)` |

### The re-sweep found a third route

`approve_supervision` was **not** in the original scope and was found by the mandated re-sweep for the
defect class. `Organization#approve_supervisor` sets `link.data['state']['pending'] = false` on an
`org_supervisor` link, and `Organization.manager_for?` counts **non-pending `org_supervisor` links
alongside `org_user` ones**:

```ruby
user_orgs = UserLink.links_for(user).select{|l| (l['type'] == 'org_user' || l['type'] == 'org_supervisor') && l['user_id'] == user.global_id && !l['state']['pending'] }
```

So it reaches the same `support_actions` grant by a different link type. A red test was written for it,
confirmed red (the actor ratified org-supervisor membership on the target's behalf), then closed. Had the
re-sweep been skipped, the fix would have shipped with a third route still open.

### Trace-to-the-read

The value guarded is a **non-pending `org_user` / `org_supervisor` UserLink**, read by
`Organization.manager_for?`, which `app/models/user.rb:86` turns into `support_actions`, which
`Api::UsersController#update` turns into a password write. In all three gated actions the guard executes
**before** the call that writes or ratifies the link (`update_subscription_organization`,
`parse_activation_code(code, user)`, and `approve_supervisor` respectively), with no early return between
guard and write. Every third-party route into those three writers passes through
`SupervisorKeyProcessor#call`. **Correction:** that is the single dispatch point for the supervisor_key
actions only, NOT for org attachment generally. `Api::OrganizationsController#claim_user` is a separate
ingress that writes a non-pending `org_user` link directly, and `Organization#add_user` is a third. The
original wording overstated the coverage.

### Verification

- 8 gate specs green; 43 green across the whole `supervisor_key_processor_spec.rb` file.
- **Falsified:** with the gate reverted and the tests kept, exactly the guard cases go red and every
  regression guard stays green.
- **Baselined:** `spec/models/user_spec.rb` shows the same 11 failures with and without the change
  (`add_premium_voice`, `track_protected_source`; the known orphaned-AuditEvent-row hazard), and
  `organization_spec.rb` the same 4 (`load_domains`). None are caused by this change.
- 406 examples across `spec/services/`, `supervising_spec.rb` and `organization_spec.rb` with only those
  4 pre-existing failures.

### Still Phase 2

`process_add` (adds a supervisor, no org involved) and `approve_consent` / `deny_consent` (parental
consent decisions) share the third-party shape but do **not** write an org link, so they are untouched by
this gate and remain untraced. They are the next thing to look at, and `approve_consent` / `deny_consent`
should probably come first because they touch the COPPA surface directly.

---

## 8. Dual review outcome: BLOCKED. Do not merge.

Run 2026-09-14 against `3c6240adb`, baseline `4104b657b`. Senior-dev pass: **no blocker**, 7 SHOULD-FIX.
Adversary pass: **1 Critical + 1 High blocker**. Under the repo rule that a Critical or High from either
reviewer blocks the PR, this change does not ship as written. Both blockers were re-verified here rather
than accepted on the reviewer's word.

### BLOCKER 1 (Critical): the gate is launderable, because it keys on the SUBMITTER

`allows_org_attachment?` refuses only when the **submitting** actor manages the target org. The attacker
chooses who submits, and `process_add` is deliberately ungated and mints a fresh eligible submitter.

Verified chain:
1. Attacker A fully manages org O and holds `edit` supervision of victim V.
2. A creates throwaway account B, then submits `supervisor_key=add_edit-<B>` against V.
   `process_add` performs **no authorization on who is being added**: its only guards are
   `return false unless user.any_premium_or_grace_period? && user.id` and that the supervisor resolves
   and is not the user. `Supervising.link_supervisor_to_user` performs none either, and sets
   `link.data['state']['edit_permission'] = true`.
3. B now holds `edit` on V, so B reaches the `else` branch of `users_controller#update` with the full
   payload and submits `start-<O's code>`. B manages nothing, so **the gate passes.**
4. V is attached to O non-pending, and `manager_for?(A, V)` becomes true, granting A `support_actions`.

The escalation survives at the cost of one extra API call and one throwaway account. The change's own
green regression spec, "should still allow a third party to redeem a code for an org they do not manage",
is the exploit verbatim. **The suite pins the hole open**, which is the sharpest possible statement of the
problem: the test I wrote to protect the parent/guardian path is the same shape as the attack.

### BLOCKER 2 (High): the gate silently breaks a shipped onboarding path

See the retraction in section 5. The therapist-enrols-student flow is refused, and refused invisibly
(HTTP 200, modal closes as success, nothing attached, only an unwatched AuditEvent).

### Why both point at the same design error

The gate asks "does the submitter benefit?" when the property that actually matters is "has the TARGET
consented?". Keying on the submitter is both too weak (BLOCKER 1: launder through another account) and
too strong (BLOCKER 2: refuses a legitimate submitter who happens to manage the org).

### Recommended redesign, not yet implemented

On a third-party `start-` / `approve-org` / `approve_supervision`, write the org link as **pending**
instead of refusing. This resolves both blockers at once:

- Laundering gains nothing: the link is pending whoever submits, and `manager_for?` counts only
  NON-pending links, so no `support_actions` is granted.
- The therapist flow works and is not silent: the student is attached, pending ratification.
- It matches how the product already behaves. The org UI's own path passes `pending=true`
  (`self.add_user(key, true, true, false)`), so pending-on-third-party-attachment is the existing
  designed state, not a new concept.
- `process_add` still needs its own gate; it is the capability-minting primitive behind BLOCKER 1.

**This is a product decision and is not an agent's to take**: it makes third-party enrolment two-step, and
for a communicator who cannot ratify it re-raises the guardian question from section 2. Holding for Scot.

### Other findings accepted, not yet actioned

- Two of the gate's three predicates (`assistant?`, `upstream_manager?`) have no spec; deleting them from
  the condition leaves the suite green. The same is true of `claim_user`'s hierarchy branch. Both need a
  mutation-proof test.
- The actor fails OPEN when `non_user_params['updater']` is absent, because it defaults to the target and
  so reads as a self-action. `users_controller#update` always sets it, but any other `user.process` caller
  would bypass the gate.
- `approve-org` still writes `user.settings['pending'] = false` before dereferencing a possibly-nil org.
- `claim_user` still discards `add_user`'s `pending` argument on the licence fast-path, re-opening the
  same escalation by a route this gate cannot see, latent only while `LICENSES_TOTAL=0`.
- The denial AuditEvent is keyed `user_key: 'system'` while the success event uses the acting user.
- Several line-number citations in these docs have gone stale, including from this change's own hunks.

---

## 9. Two further results from the dual review

### 9.1 The test suite is NOT degenerate (independently mutation-tested)

The senior-dev reviewer applied the "prove a check by making it fail" rule to the specs themselves, which
the author had not done for the degenerate cases:

- an **allow-everything** gate kills 4 specs
- a **refuse-everything** gate kills 6, including the parent/guardian onboarding guard

So neither degenerate implementation passes, and the regression guards are load-bearing rather than
decorative. This is the one part of the change both reviewers called sound. Note it does NOT rescue the
design: BLOCKER 1 stands precisely because the *correct-looking* implementation is bypassable, which no
mutation test of the existing specs could have found.

It also leaves SHOULD-FIX 4 intact: deleting `assistant?` or `upstream_manager?` from the gate's condition
still leaves the suite green, because every spec builds its org with `add_manager(name, true)`.

### 9.2 NEW finding on the consent surface: `consent_transition` substitutes the target for the actor

Pre-existing, not introduced by this change, and **not covered by the gate**. Suggested High.

`SupervisorKeyProcessor#consent_transition` is the handler for `approve_consent` and `deny_consent`:

```ruby
result = SupervisorConsentService.new.send(method, relationship: rel, actor: user)
```

It passes `actor: user`, i.e. the TARGET whose record is being updated, never the submitting actor. The
service's only authorization check is:

```ruby
def party_response_error(relationship, actor)
  return { error: 'not_authorized' } unless actor && relationship && relationship.communicator_user_id == actor.id
```

That binds the consent token to the communicator, but says nothing about **who submitted it**. Because the
processor hands it the target, the predicate is satisfied by construction on every third-party submission.
So a supervisor holding `edit` on a communicator can approve or deny a supervision-consent decision on
that communicator's behalf, and the service cannot tell.

This is the COPPA/consent surface flagged earlier as the thing to look at before `process_add`. The actor
threading added by this change stops at the three org actions and does not reach `consent_transition`;
extending it there is a one-line change (`actor: actor`) but alters what the consent service authorizes,
so it needs its own trace and its own red test rather than being folded in here.

**Do not fold this into the blocked change.** It is a separate defect with a separate blast radius.
