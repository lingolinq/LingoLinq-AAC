---
name: pr-preflight
description: Mandatory checklist before opening a PR or pushing to an open PR in LingoLinq-AAC. Claim verification against HEAD, entry-point enumeration for auth/visibility changes, the generated-artifact checks that mirror the audit-artifacts-integrity CI job, the cross-doc sweep for compliance docs, the honest status block the PR template expects, and the behavioural definition of done for UI flows. Run it yourself before every push; invoke as /pr-preflight.
allowed-tools: Read, Grep, Glob, Bash
---

# PR Preflight

Work through every section that applies. The PR body sections in P5 are in
`.github/PULL_REQUEST_TEMPLATE.md`; fill them, do not delete them.

## P1. Claim verification

Every factual claim in the PR title, PR body, or any touched doc must be verified
against the CURRENT head, not against the plan, memory, or a prior session.

- Before writing "X is fixed / built / supported": open the file and confirm at HEAD.
- Any claim about a provider, integration, or capability (Anthropic, Gemini, SES, ZDR,
  BAA, encryption, retention) needs a fresh grep of runtime code first:
  `git grep -n -i "gemini\|anthropic\|ses_\|zdr" -- lib/ app/ config/ ':!spec'`
- Banned in PR bodies unless backed by a per-path test or trace: "both paths",
  "all call sites", "fully fixed", "no longer possible".
- Plans are hypotheses. Executing a plan written in another session means re-verifying
  every file-level claim in it before implementing.

## P2. Entry-point enumeration (any auth, access, or visibility change)

Enumerate every path to the resource before coding:

1. fresh server-rendered navigation
2. client-side SPA transition (Ember)
3. direct API call (verify with curl using raw params)
4. offline or cached content

Enforcement lives at the Rails API layer. Client-side Ember flags are UX polish, never
the security boundary. The PR body carries a table `| Entry point | Enforced at | Test |`
and lists any uncovered path under "Not covered", never omits it.

## P3. Generated artifacts and git metadata (compliance or register PRs)

These mirror the CI job `audit-artifacts-integrity`, so a green preflight means that job
will not block the PR. Prefer the wrapper:

```
scripts/regenerate-register.sh --check    # verify only; omit --check to regenerate
```

Or the individual checks:

```
ruby scripts/compliance-notion-publish.rb --check
ruby scripts/document-register-render.rb --check
ruby scripts/compliance-calendar-render.rb --check
ruby scripts/compliance-publication-status.rb --check
ruby scripts/capability-check.rb --check
ruby scripts/register-lint.rb audit-reports/FINDINGS.json audit-reports/ember-upgrade/FINDINGS-EMBER.json
git diff --check
```

Exec bit: only for CHANGED scripts that a doc or skill invokes directly (`./script`),
not every file under `scripts/`. List them explicitly, for example:

```
for s in scripts/regenerate-register.sh; do
  git ls-files -s "$s" | awk '$1 !~ /^100755/ {print "NOT EXECUTABLE: " $4}'
done
```

If a doc instructs running a script directly, the executable bit is part of the PR. If a
check fails, fix it in THIS PR before pushing.

**contentHash drift triage:** read whether the FAIL names an ATTESTED row. Unattested:
run `scripts/regenerate-register.sh` and commit. Attested: stop, do not run render;
revert the file or use `/re-attest-record`. See `docs/legal/COMPLIANCE_DOCS_GUIDE.md`
("When CI is red").

## P4. Cross-doc consistency (touching `docs/legal/**` or `audit-reports/**`)

When changing any claim in one compliance doc:

```
git grep -n -i "<subject>" -- docs/legal/ audit-reports/
```

Reconcile every instance in the same PR, or list the known-stale files in the PR body as
explicit follow-ups. A register or ledger row marked "built" needs its evidence
resolvable at HEAD, never only at a historical SHA.

## P5. Honest status block (every PR body)

```
## Fix status
| Item | Status (Fixed / Partial: <scope> / Not fixed) | Evidence (file:line or spec) |
## Not covered by this PR
- <explicit list; "none" is acceptable only after P2>
## Author-Model
<model that wrote most of the diff, e.g. fable-5.1, sonnet-4.6, opus-4.7, human>
```

## P6. Behavioural definition of done (UI flows)

Done means the full lifecycle works: the action completes, the modal closes or
resolves, the caller callback fires, the list refreshes, and both success and failure
states are visible. A persisted record with a stuck UI is a High bug, not a partial
success. If you cannot execute the flow, say so in the PR body and request a manual
click-test of the SPECIFIC steps, listed.

## Then: review

Run `/review-pr` and then `/adversary-review` on the diff. A Critical or High finding
from either blocks the PR until addressed.
