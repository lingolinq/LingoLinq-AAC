---
name: audit-run
description: Orchestrate a LingoLinq-AAC audit run. Stamps the audited SHA + diff, fans out the read-only domain finders in parallel, reconciles results into the findings register, runs the adversary verifier, and validates citations. User-invoked only (/audit-run).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# /audit-run: LingoLinq audit orchestrator

It runs in the trusted main
session (NOT a read-only finder), so it may use full tools and MCP. The finders it spawns are
read-only by construction. The register `audit-reports/FINDINGS.json` is the single source of
truth and must never regress: this runbook only ever ADDS findings or marks them `open`. Only
Scot closes a finding, downgrades severity, or accepts risk (plan section 5.6, checkpoint 1).

## Cadence (quarterly full / monthly light)
Recorded decision (plan section 9.1): a **quarterly full run** plus a **monthly diff-scoped
light run**. The cadence is tracked in `audit-reports/compliance-calendar.json`
(`rev-audit-run-quarterly-full`, `rev-audit-run-monthly-light`) and surfaced by
`/compliance-status`. Cadence dates are advisory scheduling, NOT a compliance claim.

- **Quarterly full:** run all steps below (1-7b). Finders scan their full scope; the run renders
  the quarterly unified report. Schedule it when plan usage headroom allows; the finders run in
  parallel.
- **Monthly light:** run steps 0-5, the per-run line in Step 7 and Step 7b, with the **diff since the last
  run** as the finder scope. "Last run" is the register's own `meta.auditedSha`, NOT a base branch: an audit is run
  ON the base (`develop`), so `origin/develop...HEAD` resolves to ZERO files and would silently
  hand every finder an empty scope. Use a two-dot tree comparison against the recorded SHA:
  `git diff --stat $(jq -r '.meta.auditedSha' audit-reports/FINDINGS.json) HEAD`. Two dots, not
  three -- three uses the merge-base, which is wrong whenever the audited SHA is not an ancestor
  of HEAD. No quarterly
  report render unless something material surfaces. This catches regressions between heavy runs
  without burning plan-cap headroom.
  - **Exception - `accessibility-auditor` never runs diff-only.** Static a11y on a diff is
    low-signal (the dual board render path and shared SCSS selectors mean a tile/contrast defect
    rarely lives entirely inside the changed lines), so in a monthly light run the accessibility
    finder either runs its FULL frontend scope or is skipped entirely - it is never passed the
    diff scope. If it is skipped in a light run, say so in the run-log `runs.jsonl` line
    (`skipped: ["accessibility"]`) so its absence is explicit, not silent.
  - **Exception - `code-hygiene-auditor` also never runs diff-only, for the same reason as
    accessibility, plus one more.** A "dead code" claim requires proving zero reachable
    references ANYWHERE in the tree, not just within the diff - restricting its own reads to the
    diff would make every dead-code verification unreliable. So in a monthly light run it either
    runs its FULL scope (heavier than the other light-run finders, since "full scope" here means
    "grep the whole tree for every candidate," not just "read more files") or is skipped
    entirely, following the exact same `skipped: ["code-hygiene"]` run-log convention as
    accessibility above. There is no cheaper middle ground for this domain; do not try to invent
    a diff-scoped mode for it.

Either way the register `FINDINGS.json` is updated mechanically and citation-check must stay
green; only Scot closes, downgrades, or accepts risk.

## Coverage: what "full" means (Scot, 2026-11-01)
A run may write "full" in `meta.auditedRef` only if, at one commit:
1. Every finder examined every item in its own checklist.
2. Every read on the live-read list below was taken, with a successful result.

Any other run is stamped partial. "Quarterly full", run-log `type: full` and the gate's `--mode full`
name how much of the fan-out runs, not how much of it was reached: a quarterly full run can end
partial, and a monthly light run is always partial. Open findings do not affect coverage. This
definition governs `/audit-run` and `FINDINGS.json` only: `/ember-audit-run` has its own register, and
its `full` mode names its slices.

**Standing limits.** Only these three things a repo read cannot answer are standing limits, not gaps.
They are disclosed in every run and do not block full:
- Callers outside the repo (console use, runbooks).
- Vendor internals.
- Provider-side revocation of retired keys, unless the provider console is opened.

Nothing else is a standing limit, including a failed or untaken live read. A checklist item whose
evidence is a document outside this repo counts as not reached until that document has been read
(Scot, 2026-11-01).

**Assistive-technology testing does not count toward full.** The team owns screen reader, switch and
eye-gaze testing, and `docs/legal/ACCESSIBILITY_CONFORMANCE_REPORT.md` tracks it as an open gap. It
is an exclusion, not a checklist item or a standing limit. Every full stamp carries this exact line,
so the stamp never reads as though that testing was done:

```
Excludes assistive-technology testing (tracked separately in the conformance report).
```

**Live-read list.** This list names services, read types and targets only, because this repo is public. Results
never go in it (Step 1b). Each entry between semicolons is one read. "Answers" names the checklist item
in the receiving finder's skill that each read is evidence for, by the item's opening words.

| Area | Reads | Target | Handed to | Answers |
|------|-------|--------|-----------|---------|
| AWS | All enabled regions for regional services; SES; customer-policy statement bodies; KMS and SNS policies; CloudTrail bucket Object Lock; CDN distribution config | Whole account | `infra-auditor` | Object Lock: "Data-access events logged". CDN config: "HTTPS enforced". The others: "GCP/AWS services follow least-privilege" |
| Google Cloud | URL map redirect; secret accessors; job and worker-pool config | Production | `infra-auditor` | URL map: "HTTPS enforced". Secret accessors: "GCP/AWS services follow least-privilege". Job and worker-pool config: "Secrets from env / Secret Manager" |
| GitHub | Environment branch policy | Production environment | `infra-auditor` | "CI/CD exists" |
| Production config | Feature-flag state per flag: on for everyone (in the default list and in every organization's own list), off for everyone (in no list, the canary and beta opt-in lists included), or mixed; no organization names. Non-secret config | Production | Flag values: `code-hygiene-auditor`. Config: `api-auditor` | Flag values: class "Stale feature-flag branch". Config: "Large datasets (LogSession, BoardDownstreamButtonSet) live in S3" |
| Sentry | Alert rules; scrubbing | Production | `infra-auditor` | Alert rules: "Data-access events logged". Scrubbing: "Logs contain no PII or secrets" |
| HubSpot, Jira | HubSpot: retention settings. Jira: any retention rule, app or automation on projects holding support tickets; "none" is a complete answer | Production | `privacy-auditor` | "Retention periods defined per data type" |
| S3/CDN, Stripe | S3 behaviour (bucket only until a non-production CDN exists); Stripe behaviour | Non-production | `api-auditor` | S3: "Large datasets (LogSession, BoardDownstreamButtonSet) live in S3". Stripe: "Consistent error format" |
| Accessibility | Axe and focus walk on every route, including speak mode, with computed contrast and rendered focus | Local or non-production | `accessibility-auditor` | 1.4.3, 1.4.11, 2.4.3, 2.4.7 and 4.1.2 |

## Run context (dynamic injection)
- Audited commit:  !`git rev-parse HEAD`
- Audited ref:     !`git rev-parse --abbrev-ref HEAD`
- Working tree clean?  !`git status --porcelain | head -1 | grep -q . && echo "DIRTY (commit or note before auditing)" || echo "clean"`
- Diff since last audited SHA:  !`SHA=$(jq -r '.meta.auditedSha' audit-reports/FINDINGS.json 2>/dev/null); git diff --stat "$SHA" HEAD 2>/dev/null | tail -20`

Record this SHA as `auditedSha` for the whole run. Every finding's `evidence.sha` must be this
SHA so `scripts/citation-check.rb` can validate snippets against the exact tree audited.

## Step 1: Preflight
1. Confirm `audit-reports/FINDINGS.json` exists and is currently green:
   `ruby scripts/citation-check.rb` (expect exit 0). If it is already red, STOP and report;
   do not run an audit on top of a broken register.
2. Capture the audited SHA (above). If the tree is dirty, ask Scot to commit first (snippets
   must anchor to a committed SHA).

## Step 1b: Take the live reads (quarterly full only)
Record the run start first (`date -u +%Y-%m-%dT%H:%M:%SZ`).

Before the fan-out, the orchestrator takes each read on the live-read list once, in this session, and hands the results to the finder the
table names. A monthly light run skips this step.

- **Write each read's scope first.** In the private run record, note what the read must cover before
  you take it: routes from `app/frontend/app/router.js` at `auditedSha`, flags from
  `lib/feature_flags.rb`, regions, resources and config names from the provider's own list call, and
  for a behaviour read, the requests you will send.
- **Record the caller and the target.** A read against any target other than the table's, or by a caller
  that cannot see the whole scope, is not a success.
- **Successful means the whole answer for that scope.** An auth or permission error, an expired session,
  or a subset of the scope is not a success. An empty answer counts only if the row says why empty is
  expected. A failed read may be retaken in the same run. A read you have no access or approval for
  stays untaken: the run stamps partial.
- **Take every read in this run, and record its UTC time.** A result from an earlier run does not count.
  A gate retry at the same SHA is the same run, so it may reuse reads taken after the first run start.
  A live read shows deployed state when it was read, which need not match `auditedSha`.
- **The accessibility read holds synthetic data only.** Its environment has no team or real accounts.
  Hand the finder the route template, rule id, element and class, and measured value only, never page
  text.
- **Behaviour reads stay out of production, and nothing they send may reach a real person.** Stripe uses
  test-mode credentials and synthetic accounts, with no team or real accounts. The account's email is
  at `example.com` or another reserved domain, because a decline emails the account. Its requests go
  through the non-production app's own endpoints, after you confirm that app's Stripe key is in test
  mode, and take the failure path only: induce a decline so the result shows the app's error shape.
  Never complete a purchase, because a completed one emails a team inbox. S3 uses the non-production
  uploads bucket the scope names, with read-only requests on synthetic test objects only, and lists or
  opens nothing else. Before the run, Scot, or someone he names, creates those objects by using the
  non-production app with a synthetic account while `REMOTE_EXTRA_DATA` is set on that app's web
  service and its worker, since a worker job does the upload: one log session with enough events to be
  stored in S3, and one board's button set. The scope lists their keys.
  Confirm each key exists before the read; with any missing, the S3 read stays untaken. The CDN half is
  added once a non-production CDN exists.
- **Hand over and keep the least that answers the item.** A policy body or config can go whole, but never
  a person's identifier, such as a recipient address or a principal's email (give the principal type),
  and never a secret's value. Remove any that a result carries before you store it or hand it over,
  because the private run record can be committed to the private repo and read by a reviewer with no
  BAA.
- **A document outside this repo goes through you too.** When a checklist item's evidence is a named
  document (`audit-reports/DOCUMENT-REGISTER.json` gives its location), read it, note that in the private
  run record, and hand it to the finder with any person's identifier removed. A document you cannot reach leaves that item not reached.
- **Results stay out of this repo.** Keep them, with one row per read (scope, caller, target, UTC time,
  taken, succeeded), in the private run record, along with every finder output file, including each
  `note`. No account IDs, resource
  names, config values or secret values in any committed file, commit message or PR text.
- **The private run record** is a dated folder under `~/ai-company-brain/outputs/docs/`, outside this
  repo. The orchestrator writes it and Scot owns it. Keep it for as long as its stamp is in the
  register's history. Live-read detail, documents, notes and receipts from it never go in a task log,
  a `unified-audit` report or any other committed file in this repo, beyond the verdict and counts.
  Findings still reach the register through Step 3.

## Step 2: Fan out the read-only finders (parallel)
Use the run start from Step 1b; a monthly light run records it here
(`date -u +%Y-%m-%dT%H:%M:%SZ`). Step 2b needs it. Then spawn the six
domain finders concurrently with the Agent tool, passing each the `auditedSha`.
They are read-only (no Edit/Write; a PreToolUse guard blocks mutating Bash) and emit
register-shaped findings with `status: "open"`.

> **Spawn every finder with `subagent_type` and NO `name` (finding LL-c667ec15e3).** While agent
> teams are enabled, a named Agent call launches a teammate, and a teammate does not get the
> definition's `skills`, so it would run without its checklist. Whether teams are enabled here does
> not matter: unnamed spawns are correct either way, and Step 2b checks the result. Do not paste a
> checklist into the prompt to compensate, and never pass a `checklistToken`: the finder has to
> get it from its own skill.

> **Anchor every finder to `auditedSha`; a live-infra snapshot is taken only in Step 1b (finding LL-3483c28f3c).**
> Two things the first full run (2026-06-14) surfaced:
> 1. A spawned finder reads whatever tree its working directory is on, which is not guaranteed to
>    be the orchestrator's `auditedSha` (e.g. a finder spawned from a worktree may read the primary
>    checkout's HEAD). Code findings are protected mechanically - `audit-merge.rb` + `citation-check.rb`
>    drop any snippet that does not resolve at `auditedSha` - but TELL each finder the `auditedSha`
>    and have it cite snippets that exist there, and confirm in Step 5 that citation-check is green
>    (a finder that audited the wrong tree shows up as dropped/`skipped` findings).
> 2. For LIVE-infra checks there is no citation gate (runtime evidence is SKIPped). To avoid
>    concurrent finders observing a moving target, the orchestrator (trusted main session) should
>    pull the live GCP/AWS read-state ONCE and pass that snapshot to the infra finder, rather
>    than letting parallel finders hit live APIs independently. The first run emitted no runtime
>    findings (all 7 were committed-file `type:"code"`), so the race did not bite - keep this as the
>    standing instruction until/unless a snapshot mechanism is built. A quarterly full run takes that
>    snapshot in Step 1b, and a monthly light run takes none. The infra finder's own read-only checks
>    stay as they are.

| Agent | Domain | Skill it loads |
|-------|--------|----------------|
| `privacy-auditor`       | privacy       | gdpr-ferpa-audit |
| `infra-auditor`         | infra         | soc2-security-audit |
| `api-auditor`           | api           | api-contract-audit |
| `dependency-auditor`    | dependency    | dependency-audit |
| `accessibility-auditor` | accessibility | accessibility-audit |
| `code-hygiene-auditor`  | code-hygiene  | code-hygiene-audit |

Prompt each with: the `auditedSha`, the whole scan scope from its skill (the diff in a monthly light
run), its Step 1b results and documents if any are named for it, each with the item the live-read
table says it answers, and
"cross-check `audit-reports/FINDINGS.json` first; reference an existing `id` rather than
duplicating. Return the run receipt your checklist requires and the coverage block your agent
definition requires." Collect each finder's JSON `{domain, auditedSha, checklistToken, guardCanary, note,
coverage, findings:[...]}` (`note` is required from a finder handed a read or a document, otherwise
optional).

> RETIRED from the fan-out (Phase 2): `ember-stabilization` and `rails-upgrade` (migration-era,
> shipped) and the 0-100 `mvp-readiness` score (decision 5.9.2: the headline is now the count of
> open Critical/High findings, not a synthetic score). The legacy top-level
> `skills/`, `subagents/`, `workflows/` dirs were removed in Phase 2; their content was
> migrated into this `.claude/` layout.

## Step 2b: Fan-out gate (fail-closed)
Write each finder's output to `/tmp/finder-<domain>.json`, then run the gate before anything
reaches the register. A quarterly full run uses the default mode, which needs all six. A monthly
light run adds `--mode light`, which may omit only `accessibility-auditor` and `code-hygiene-auditor`;
list the finders you spawned, matching the `skipped` list in the run log:
```
ruby scripts/audit-fanout-gate.rb --sha <auditedSha> --since <run start> \
  --finder privacy-auditor=/tmp/finder-privacy.json --finder infra-auditor=/tmp/finder-infra.json \
  --finder api-auditor=/tmp/finder-api.json --finder dependency-auditor=/tmp/finder-dependency.json \
  --finder accessibility-auditor=/tmp/finder-accessibility.json \
  --finder code-hygiene-auditor=/tmp/finder-code-hygiene.json
```
It needs, per output: one more distinct spawn id in this run's log, a file written after the run
start with a `findings` array and the finder's domain, the `checklistToken` from its own skill, a
denied guard canary, and an agent definition that wires the guard and logger. Keep the printed
table: the summary line in Step 7 records it as `finderGate` in every mode.

Any other exit than 0 is a refusal: **STOP. Do not run `audit-merge.rb`, do not restamp
`meta.auditedSha`**, and report the table to Scot. `audit-merge.rb` does not read the gate, so this
stop is what holds. To retry, find out why, then re-run **every** finder in this gate call with a new
run start and new output files: re-running only the refused one leaves the others older than the new
`--since`. Never edit a finder's output, the log, or a token to get past it.

## Step 2c: Decide coverage from the receipts (before the merge)
The gate and the merge do not read `coverage`, so this decision rests on this step and on Scot's
sign-off. The verdict is full only if every one of these holds; otherwise it is partial. A monthly
light run is partial without this check.
1. All six finders passed the gate in the default mode, each prompted with its skill's whole scan scope.
   A receipt that leaves any item not reached makes this run partial. Only a gate refusal re-runs
   finders (Step 2b). A Step 5 re-emit changes findings only and replaces no receipt. A receipt from another commit counts for
   nothing.
2. Every receipt has a `coverage` block with `examined`, `notReached` and `standingLimits`. A missing or
   malformed block means that finder is not complete.
3. Every `notReached` is empty.
4. Every `examined` holds exactly that finder's item ids, with none missing and none extra. Take the
   expected ids from the skill at `auditedSha`, not from the receipt. A count of 0 means the check cannot
   run, so the finder is not complete:
   - `privacy`, `infra`, `api`, `dependency`, `accessibility`: `item-1` up to the count from
     `git show <auditedSha>:.claude/skills/<skill>/SKILL.md | grep -c '^- \[ \]'`.
   - `code-hygiene`: `class-1` up to the count from
     `git show <auditedSha>:.claude/skills/code-hygiene-audit/SKILL.md | grep -cE '^[0-9]+\. \*\*'`.
5. Every `standingLimits` entry starts with an item id and falls under one of the three standing limits
   above. Treat any other entry as not reached.
6. No `note` says an item was sampled, skipped or could not be verified. An item described that way is
   not reached, even if `examined` lists it. Text that only restates a standing limit does not count.
7. Every read on the live-read list has a row in the private run record that is taken and succeeded, and
   the finder the table names confirms in its `note` that it used that read for the item the table
   names. The same goes for any document handed over.

A receipt is the finder's own report, and nothing here verifies it against what the finder read. The
verdict rests on the receipts and Scot's sign-off, so the receipts go in the private run record for him
to read.

Pass the result as `--ref` in Step 3, quoted. Every stamp carries the standing limits; drop the third
limit only if the provider console was opened. In the partial stamp, `<m>` is the number of reads on
the live-read list. Write "FULL COVERAGE" only with a full verdict, and do not use the word "full" in
any other stamp outside a branch name. The stamp is written before Scot signs: when he does, replace
`Scot sign-off: pending` with `Scot signed <YYYY-MM-DD>`.

Full verdict:
```
<ref> (== origin/develop tip <sha8> at run start, <date>). FULL COVERAGE: every finder reported every checklist item examined at this commit and every named live read succeeded during this run. Internal automated review by AI agents against our own checklists, not a third-party audit; it says what was examined, not that it passed, and open findings are counted separately. Standing limits: callers outside the repo; vendor internals; provider-side key revocation. Scot sign-off: pending. Excludes assistive-technology testing (tracked separately in the conformance report).
```
Partial verdict:
```
<ref> (== origin/develop tip <sha8> at run start, <date>). PARTIAL COVERAGE: <n> of 6 finders complete, <n> of <m> live reads succeeded; details are in the private run record. Internal automated review by AI agents against our own checklists, not a third-party audit; it says what was examined, not that it passed, and open findings are counted separately. Standing limits: callers outside the repo; vendor internals; provider-side key revocation. Scot sign-off: pending. Excludes assistive-technology testing (tracked separately in the conformance report).
```
Monthly light run:
```
<ref> (== origin/develop tip <sha8> at run start, <date>). PARTIAL COVERAGE: monthly light run scoped to the diff since <prior sha8>; no live reads taken. Internal automated review by AI agents against our own checklists, not a third-party audit; it says what was examined, not that it passed, and open findings are counted separately. Standing limits: callers outside the repo; vendor internals; provider-side key revocation. Scot sign-off: pending. Excludes assistive-technology testing (tracked separately in the conformance report).
```

Public text carries the verdict and counts only. A `notReached` entry names an unexamined area, so it
stays in the private run record, never in the stamp, a finding, `meta.auditedShaPriorNote`, the run log, a commit or a PR. Writing
any of these stamps is still a restamp: Scot's sign-off in Step 3 applies to it.

## Step 3: Reconcile into the register (deterministic)
Run the merge helper with `--in` set to exactly the list the gate just passed (a light run lists
fewer files than the example below), and `--ref` set to the Step 2c stamp. A restamping merge refuses any file whose `auditedSha` is not
`--sha`. It computes the
stable id (`LL-` + first 10 hex of `sha256(ruleKey + "|" + file)`; for a row whose ruleKey is the
self-referencing withheld form, `minimized-finding-` + its own id, lowercased, citation-check does not recompute the id; finders are
instructed not to emit that form, and register-lint refuses a mismatched one), preserves `firstSeen`,
`owner`, existing `status`, and `closureEvidence` for known ids, adds new findings as `open`,
bumps `lastSeen` + the register `auditedSha`/`auditedRef`/`auditedDate`, and FLAGS regressions
(an id previously `verified-closed`/`accepted-risk`/`superseded` that a finder re-surfaced):

```
ruby scripts/audit-merge.rb \
  --register audit-reports/FINDINGS.json \
  --sha <auditedSha> --ref "<Step 2c stamp>" --date <YYYY-MM-DD> \
  --in /tmp/finder-privacy.json --in /tmp/finder-infra.json \
  --in /tmp/finder-api.json --in /tmp/finder-dependency.json \
  --in /tmp/finder-accessibility.json --in /tmp/finder-code-hygiene.json \
  --out audit-reports/FINDINGS.json --summary /tmp/audit-summary.json
```

The merge NEVER sets `verified-closed` and NEVER downgrades an existing finding. New findings
land as `open`. A regression (an id Scot closed, accepted, superseded or dispositioned that a finder
re-surfaced) KEEPS its Scot-owned status and disposition: the merge only sets `regression: true` and
appends a loud note (`scripts/audit-merge.rb`). So a regression still renders as closed in
`FINDINGS.md`, the Notion page and every headline until Scot reopens it or records accepted risk.
Surface every regression to Scot explicitly in Step 5, in every mode, and get that decision before the
register PR merges.

> **`--sha` restamps `meta.auditedSha` — that is correct HERE and nowhere else.** An
> `/audit-run` moves the audit pointer to the audited commit, and its stamp says what the run reached (a governance act:
> record the move and the intervening-commit analysis in `meta.auditedShaPriorNote` for Scot's
> sign-off). If you are adding a finding OUTSIDE an `/audit-run`, add `--no-restamp` so evidence
> anchors at the true commit while `meta` stays untouched. Never pass the register's existing
> `auditedSha` to dodge the restamp: that anchors the new evidence to a commit it was never verified
> against and passes citation-check green whenever the line numbers happen to coincide.

## Step 4: Adversary verification (fresh context per batch)
For each NEW or REGRESSED finding (from the merge summary), spawn the brain `adversary` agent
with a fresh context to independently confirm it before it is treated as real. Batch by domain
to keep each verifier context focused. Give the adversary ONLY the finding (ruleKey, file:line,
snippet, claim) and ask it to try to REFUTE it against the code at `auditedSha`. Record each
verdict in the finding's `notes` as `adversary: confirmed|refuted|uncertain` with a one-line reason
that meets Step 7b's rules, because `notes` are public once pushed. Keep the adversary's full
reasoning in the private run record.
- Adversary refutes with high confidence: annotate; recommend Scot drop or downgrade (do NOT
  auto-remove; Scot decides).
- Adversary confirms: the finding stands as `open`, now independently verified.

A finding only ever becomes `verified-closed` LATER, when the underlying issue is fixed AND
the adversary verifies the fix AND Scot signs (`closureEvidence.attestation`). That closure path
is not part of this run; this run surfaces and verifies, it does not close.

## Step 5: Validate + render
1. `ruby scripts/citation-check.rb audit-reports/FINDINGS.json` (expect exit 0). If any active
   finding's snippet does not exist at `auditedSha`, fix the finding's evidence and re-run.
2. **Inspect the merge summary for REFUSED findings (do NOT treat a refusal as a benign skip).**
   `audit-merge.rb` buckets PII/secret refusals into the same `skipped` array as benign skips
   (snippet-not-found, missing-ruleKey). A refusal is a data-quality DEFECT, not a routine skip: a
   real finding (possibly Critical/High) was dropped and is invisible in the headline. Check it:
   `ruby -rjson -e 'JSON.parse(File.read("/tmp/audit-summary.json"))["skipped"].select{|s| s["reason"].to_s.include?("refused:")}.each{|s| puts s.to_json}'`
   If any line prints, surface it LOUDLY to Scot (which finder, which ruleKey, which pattern) and
   have the finder re-emit without the offending token: record a new start, spawn it unnamed as in
   Step 2, then run the gate on the new output with that `--since` and `--mode partial --expect 1`. Merge
   it with the Step 3 command and the same Step 2c stamp, `--in` only that file and a new `--summary` path so the first summary
   survives. Run this same check on the new summary, put any new id through Step 4, and add its counts to
   the Step 7 line. Common case: an accessibility finding whose
   text contains a 4-part EN 301 549 clause (`9.1.4.3`) that matches the IP scrubber - the
   accessibility-audit skill already instructs finders to avoid this, so a refusal here means the
   guidance was not followed and the finding must be corrected, not silently lost.
3. `scripts/regenerate-register.sh` to regenerate `audit-reports/FINDINGS.md` and every other file
   derived from the register, including the Notion page body. It gates on citation-check first.
4. Optionally write a rendered `audit-reports/unified-audit-YYYY-MM-DD.md` for a quarterly run. It is
   public, so its coverage section carries the verdict and counts only.
5. In every mode, surface each regression to Scot for the decision in Step 3, and print each finder's
   `note` as returned; it holds the reads the finder used and what it could not verify from this repo.

## Step 6: Report (headline = open Critical/High, not a score)
Present to Scot:
- **Headline:** open **Critical** and **High** counts (decision 5.9.2). No 0-100 score.
- **Coverage verdict** from Step 2c, kept apart from the headline: full or partial, each finder's
  examined count against its total, live reads succeeded against the list, the standing limits, and
  the assistive-technology exclusion. Point Scot at the receipts in the private run record: a full
  stamp rests on them and on his sign-off. If findings were dropped as snippet-not-found, say that the
  finder may have read another tree (Step 2), which puts a full verdict in doubt.
- **Live-read issues held in `note`.** A handed-over result that no source line can carry is not a public
  finding. List each one from the private run record, and Scot decides whether to file it.
- New findings this run (by domain/severity), regressions (loud), and adversary verdicts.
- Confirm citation-check is green and the audited SHA.
- Remind: only Scot closes, downgrades, or accepts risk. Nothing customer-facing leaves without
  his sign-off (plan section 5.6).

## Step 7: Run log
Two layers, both code/path evidence only - no student/patient data, no finding bodies with PII,
no secrets:
1. **Per-tool examination log (automatic).** Each finder has a PostToolUse hook
   (`.claude/hooks/audit-run-logger.sh <agent>`) that appends one line per examined path/command
   to `audit-reports/run-log/examined-<sha8>.jsonl` (LOCAL/gitignored). Nothing to do here; it
   captures "what each agent examined" as the finders run, and Step 2b reads it. Bash commands are
   redacted for secret/PII shapes; Grep patterns and all tool RESULTS are never logged.
2. **Per-run summary (you append).** Add one JSONL line to `audit-reports/run-log/runs.jsonl`
   (committed, safe) recording: `ts`, `auditedSha`, `auditedRef`, `type` (full|light, the run mode,
   not the coverage verdict, which is in `meta.auditedRef`), `finders`,
   `finderGate` (the Step 2b result and mode),
   `new`/`reseen`/`regressions`/`skipped` counts, `newIds`, the adversary verdict tally,
   `citationCheck` status, and the open Critical/High headline. Recurrence is then a diff over
   `runs.jsonl`. See `audit-reports/run-log/README.md`. `.jsonl` is a data-bearing extension
   (`scripts/codex-review-path-classifier.sh`), so `data-bearing-paths` scans the line this
   PR adds. It passes unless the scan flags a value (an email on a non-example domain, a
   phone number outside 555-0100 to 555-0199, an SSN-shaped number); then it fails until a
   reviewer confirms the rows are synthetic and adds the `synthetic-data` label. Never add
   that label yourself (root `CLAUDE.md` rule 15).

## Step 7b: Read the public text before any push (every mode)
This repo is public. A pushed branch is published whether or not it merges, a push publishes every
commit rather than only the final tree, and CI runs only after the push. So commit the run's files
and never use `git add -A`. `git status --porcelain` must then print nothing; if a tracked file outside
the run is changed, stop and start the run again in a fresh worktree. Make the first push with
`git push -u origin <branch>`, so later pushes have an upstream. Before the run's first push, and again
before every later one, write every outgoing commit, its patch on any path and its message, to a new
file. `mktemp` prints its path; use that path as `<file>` and delete it after the read:
```
mktemp
git rev-list --min-parents=3 HEAD ^origin/develop                           # must print nothing
git log -p --reverse --remerge-diff origin/develop..HEAD > <file>           # first push
git log -p --reverse --remerge-diff @{u}..HEAD ^origin/develop > <file>     # later pushes
wc -l <file>
```
`--remerge-diff` shows what a merge commit added by hand, such as a resolved register conflict, but
not for a merge of three or more parents, so a commit the `rev-list` line prints stops the push. Stop
too if any command exits non-zero or `wc -l` prints 0: nothing was read. Read the whole file, in pieces
if needed, until the lines read match `wc -l`. A `Binary files ... differ` line hides its content, so
it fails unless Scot opens that file and passes it. Read the PR title and body you will
post, and any PR comment or body edit you post later, the same way. Read the lines themselves, not a
summary. A line passes only if all of these hold:
1. It carries no value from a live read or a handed-over document: no account ID, resource name,
   principal, region, policy text or config value. The only coverage text is the fixed stamp text from
   Step 2c and a light run's `skipped` list.
2. It carries no secret, no person's identifier, and no customer, student or patient data.
3. It does not name or describe an area this run did not reach, beyond those two. A register PR's "Not
   covered" section says only that coverage detail is in the private run record.
4. An unfixed issue is stated at claim level: its claim, `file:line` and severity, with remediation and
   closure criteria that add nothing on how to exploit it. No work factor, exploit chain, request
   sequence or live config value, and no detail of a row the register already withholds. Compare every
   new or re-anchored unfixed row with each withheld row (its title contains "details withheld") in the
   private evidence store, whatever file either cites. If you cannot rule out that it is the same issue,
   the row fails. An organization-authorization issue carries nothing beyond the register's withheld
   form. The security disclosure policy keeps that detail in the private evidence store until the fix
   is deployed and verified and disclosure is approved
   (`docs/legal/2026-09-17_compliance-status-snapshot.md`, "Security disclosure policy applied to the
   register").

As an aid, grep the added lines for narration such as `escalat`, `bypass`, `unauthenticated`, `IDOR`,
`token in URL` and `not enforced`. A hit is a line to read again, not a pass or a fail. Also run:
```
ruby scripts/minimized-disclosure-guard.rb --check --base-ref "$(git merge-base HEAD origin/develop)"
scripts/regenerate-register.sh --check
```
The guard does not scan `audit-reports/`, so for the register this read is the only check.

If any line fails, push nothing. Tell Scot in this session, not in any public text, which line and which
rule, and wait: he decides whether to minimize the row under the disclosure policy, hold it in the
private run record, or reword it. Change only what he decides, and rewrite only the unpushed commits
so that none of them carries the failing line: `git reset --soft @{u}` after a push, or
`git reset --soft "$(git merge-base HEAD origin/develop)"` before the first one, then one new commit.
Before the first form, run `git fetch` and `git merge-base --is-ancestor @{u} HEAD`; if it fails,
someone else has pushed to the branch, so stop and tell Scot. Never force-push. Then repeat Step 5
items 1 and 3 and this read from the start. A failing line that is already on the remote is a
disclosure, not a hold: tell Scot at once, because
deleting the branch does not unpublish it. Record in the private run record that the read passed, and
at which commit.

Text others post after the push, such as the Codex GitHub connector's automatic PR review, is outside
this read. Read it when it lands. If it describes an unfixed issue beyond claim level, treat it as a
disclosure: tell Scot, who decides whether to hide or delete it. Neither unpublishes it, since
notifications and copies already went out.
`/promote-finding` writes this same register, so it applies this read before its push too.

## Step 8 (optional, human-initiated): Publish summary to Notion
Step 5 item 3 renders the one-way Notion page body from the register
(`ruby scripts/compliance-notion-publish.rb`, then `--check`), and Step 7b reads it. It renders a PII-free summary
(headline + open-findings table, file:line anchors only) to
`audit-reports/notion/compliance-audit-page.md`, stamped with the audited SHA + run date and
marked "generated, do not edit". The actual push to the single Notion "Compliance & Audit Posture"
page under Compliance Home is a **human-initiated one-way step** (no audit/compliance surface
auto-sends externally): a person runs `ruby scripts/compliance-notion-page-publish.rb` with
`NOTION_TOKEN` set (`--dry-run` first) - see `audit-reports/notion/README.md`. The unattested Compliance Posture Report is
never published here; it stays DRAFT until Scot signs.

## Related: promoting PR-time findings
`/audit-run` is the periodic source, but PR-time reviews catch issues too. To pull a reviewed
**Critical/High** finding from a `/review-pr` / `/adversary-review` pass or the Codex GitHub connector's
PR review into this same register, use the **`/promote-finding`** skill (`.claude/skills/promote-finding/`). It is the
manual, Claude-operated counterpart to this orchestrator (same deterministic-merge + only-Scot
governance via `scripts/promote-finding.rb`), kept manual on purpose: a human is the
false-positive triage gate and no automated reviewer is given write access to the register (which is
PII-free, Tier 2 content -- a reviewer *seeing* it is fine; the concern is automated *writes*). See `audit-reports/README.md` ("Bridging PR-time
review findings").

## Guardrails (always)
- Read-only auditors; the register is the single source of truth; no student/patient data in
  findings (snippets are code only); compliance content is Tier 2 (PII-free), reviewable by any approved reviewer, gated by the data-bearing-path guard.
- This runbook never closes a finding and never edits application code. If a fix is warranted,
  that is a separate, normal (non-audit) change on its own branch.
- Disposition (triage) is Scot-only: the adding scripts only ever write disposition `untriaged`.
