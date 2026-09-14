# supervisor_key org-attach escalation: third party ratifies an org attachment on a communicator's behalf

**Status:** proposal, no code written. Discovered 2026-09-14 while settling the LL-1baffd92d5 seat count.
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

**No frontend caller sends a `start-` or `approve-org` key against a DIFFERENT user's record.** That
materially lowers the regression risk of Option A: the self-dealing gate would not break any shipped UI
path found in this sweep. It does not prove no integration or API consumer does so, which is why the gate
should audit its refusals rather than fail silently.
