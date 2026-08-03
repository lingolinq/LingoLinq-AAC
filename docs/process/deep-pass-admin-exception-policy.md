# `--admin` merge exception policy: codex-review/deep-pass

**Status: APPROVED 2026-07-28.** All three open fields set by Scot. Effective on
merge into LingoLinq-AAC.

Resolves Fork 2 of the codex-review gate plan (ai-company-brain
`outputs/plans/2026-07-28-codex-review-gate-plan.md`).
Audit log: `audit-reports/deep-pass-admin-overrides.md`.

---

## Why this exists

`codex-review/deep-pass` is a required status check on `staging`. As of 2026-07-27
it has **no funded reviewer route**: `CODEX_OPENAI_API_KEY` was deleted deliberately
and `CLAUDE_REVIEW_API_KEY` never existed. Every run since has failed at
authentication.

Two options were considered. Demoting the check to advisory was **rejected**:
`enforce_admins` is false, so the override already exists, and demotion would
silently remove the gate for every future PR rather than for the specific PRs
affected by this outage. **The check stays required.** This policy governs the
override instead, so each bypass is a deliberate, recorded act.

## Scope

Applies only to merges blocked by `codex-review/deep-pass` while no authorized
reviewer route is funded and verified. It does not apply to any other failing
required check.

## What `--admin` actually does

`gh pr merge <N> --merge --admin` **bypasses branch protections broadly**, not just
`deep-pass`. In one command it can also override `rspec`, `build-and-test`,
`audit-artifacts-integrity`, `secret-detection`, and `codex-review-tests`.

**An `--admin` merge is not equivalent to a passing reviewer gate.** It records that
a human chose to proceed without one. Nothing in this policy should be read as
treating the two as interchangeable.

Because the bypass is broad, every other required check must be **green on its own**
before the override is used. The override is authorized for `deep-pass` only.

## Authorized approvers

**Scot Wahlquist (`swahlquist`), CEO and Co-Founder.** Sole approver.

`enforce_admins` is false, so admin rights already gate who *can* do this; naming
one person makes the audit trail unambiguous.

### The approver is not automatically the reviewer

Condition 4 requires a named human to have reviewed the diff. **The approver must
not silently count as both the independent diff reviewer and the approver.** Name a
separate human reviewer whenever one is available (Melissa, Traci, Dominic, as
appropriate to the diff).

Where no second human is available, the audit entry must say so explicitly:

```
Human reviewer: Scot Wahlquist (SAME AS APPROVER - no second reviewer available)
```

Never leave it implied. Two roles collapsing into one person is a fact the audit log
should make visible, not hide. Recording it that way also makes it countable at the
lapse review, which is where it matters.

## Permitted conditions

All five must hold. If any fails, the merge waits.

1. `codex-review/deep-pass` is failing **because no reviewer route is funded**, not
   because a reviewer produced findings. Confirm the run failed at the
   authentication step, not at the review step.
2. **Every other required check is green on its own.** `rspec`,
   `build-and-test`, `audit-artifacts-integrity`, `secret-detection`,
   `codex-review-tests`.
3. The PR is **not on a data-bearing path** as classified by
   `scripts/codex-review-path-classifier.sh` (fixtures, seeds, factories, data
   migrations, cassettes, SQL/CSV dumps). A Tier 1 data-bearing PR does not merge
   without review under any circumstance.
4. A **named human has actually reviewed the diff**. The override replaces the
   model reviewer, not review itself. Record who.
5. An approver from the list above authorized this specific PR.

## Required evidence, per override

Recorded **both** as a comment on the PR before merging **and** as a row in the
audit log. Every field is mandatory.

```
--admin merge under the deep-pass exception policy

PR:                   #<number>
Head SHA:             <full sha>
Timestamp (UTC):      <ISO 8601>
Reason for exception: <one line: why this cannot wait for a funded route>

Auth-failure evidence (condition 1):
  deep-pass run URL:  <run URL, including /attempts/<n>>
  Failing step:       Authenticate Codex CLI   <- must be auth, NOT the review step
  Run conclusion:     failure

Human diff reviewer:  <name>   (condition 4; if same as approver, say so explicitly)
Approver:             Scot Wahlquist (swahlquist)

Required-check results (condition 2, ALL must be green on their own):
  rspec:                      <result>
  build-and-test:             <result>
  audit-artifacts-integrity:  <result>
  secret-detection:           <result>
  codex-review-tests:         <result>
  codex-review/deep-pass:     failure (the check this exception covers)

Data-bearing path (condition 3): <no | yes>
  classifier result:  <output of scripts/codex-review-path-classifier.sh>
```

Record every required check's **actual result**, not "all green." `--admin`
bypasses all of them at once, so an unenumerated list is the exact thing this
policy exists to prevent.

## Expiry

**2026-08-28**, or the date an authorized reviewer route passes verification,
**whichever comes first.**

This policy is **temporary by construction**. It lapses on the earlier of:

- 2026-08-28, or
- an authorized reviewer route being funded and passing the five-case verification
  in Phase 2 of the gate plan.

On lapse, ordinary operation resumes: no further `--admin` merges for `deep-pass`.
If the outage is still unresolved at the expiry date, the policy must be
**explicitly renewed** with a new expiry, not allowed to roll over silently. A
temporary exception that never expires is the failure mode this clause exists to
prevent.

## Audit location

**`audit-reports/deep-pass-admin-overrides.md`**, one entry per override, in the
repo so it versions alongside the code it governs.

Single location. Do not also mirror into `FINDINGS.json`; two sources of truth for
the same exception is worse than one.

## Review on lapse

When the policy lapses, review the audit log and answer two questions in writing:

1. How many overrides were used, and did any of them merge a defect that a working
   reviewer gate would plausibly have caught?
2. Did condition 4 (a named human actually reviewed the diff) hold every time, or
   did it degrade into a formality?

Question 2 is the one that matters. If the human-review condition decayed under
time pressure, that is evidence about how this organization behaves during an
outage, and it should inform whether `deep-pass` is restored as required or
redesigned.

---

## Remaining items

1. ~~Land this in the repo.~~ Done: this PR.

2. Routing side effect to be aware of later: a PR touching `audit-reports/` matches
   `COMPLIANCE_PATTERNS`, so every override entry will itself be a compliance-path
   PR. Inert today (`CODEX_COMPLIANCE_PATHS` defaults to `allow` and both routes
   are unfunded), but it will matter once a route is funded, and it means the audit
   log's own PRs would route to `claude-deep`.
