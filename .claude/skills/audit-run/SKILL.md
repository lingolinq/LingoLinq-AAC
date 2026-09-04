---
name: audit-run
description: Orchestrate a full LingoLinq-AAC audit. Stamps the audited SHA + diff, fans out the read-only domain finders in parallel, reconciles results into the findings register, runs the adversary verifier, and validates citations. User-invoked only (/audit-run). Replaces the legacy workflows/full-audit.md.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Agent
---

# /audit-run: LingoLinq audit orchestrator

This is the supported replacement for `workflows/full-audit.md`. It runs in the trusted main
session (NOT a read-only finder), so it may use full tools and MCP. The finders it spawns are
read-only by construction. The register `audit-reports/FINDINGS.json` is the single source of
truth and must never regress: this runbook only ever ADDS findings or marks them `open`. Only
Scot closes a finding, downgrades severity, or accepts risk (plan section 5.6, checkpoint 1).

## Cadence (quarterly full / monthly light)
Recorded decision (plan section 9.1): a **quarterly full run** plus a **monthly diff-scoped
light run**. The cadence is tracked in `audit-reports/compliance-calendar.json`
(`rev-audit-run-quarterly-full`, `rev-audit-run-monthly-light`) and surfaced by
`/compliance-status`. Cadence dates are advisory scheduling, NOT a compliance claim.

- **Quarterly full:** run all steps below (1-7). Finders scan their full scope; the run renders
  the quarterly unified report. Schedule early in the weekly Pro/Max plan window (heavy parallel
  Opus consumes weekly caps).
- **Monthly light:** run steps 0-5 ONLY, with the **diff since the last run** as the finder
  scope (pass each finder the `git diff --stat origin/staging...HEAD` paths below). No quarterly
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

## Run context (dynamic injection)
- Audited commit:  !`git rev-parse HEAD`
- Audited ref:     !`git rev-parse --abbrev-ref HEAD`
- Working tree clean?  !`git status --porcelain | head -1 | grep -q . && echo "DIRTY (commit or note before auditing)" || echo "clean"`
- Diff vs staging:  !`git diff --stat origin/staging...HEAD 2>/dev/null | tail -20`

Record this SHA as `auditedSha` for the whole run. Every finding's `evidence.sha` must be this
SHA so `scripts/citation-check.rb` can validate snippets against the exact tree audited.

## Step 1: Preflight
1. Confirm `audit-reports/FINDINGS.json` exists and is currently green:
   `ruby scripts/citation-check.rb` (expect exit 0). If it is already red, STOP and report;
   do not run an audit on top of a broken register.
2. Capture the audited SHA (above). If the tree is dirty, ask Scot to commit first (snippets
   must anchor to a committed SHA).

## Step 2: Fan out the read-only finders (parallel)
Spawn the six domain finders concurrently with the Agent tool, passing each the `auditedSha`.
They are read-only (no Edit/Write; a PreToolUse guard blocks mutating Bash) and emit
register-shaped findings with `status: "open"`.

> **Anchor every finder to `auditedSha`, and snapshot live infra ONCE (finding LL-3483c28f3c).**
> Two things the first full run (2026-06-14) surfaced:
> 1. A spawned finder reads whatever tree its working directory is on, which is not guaranteed to
>    be the orchestrator's `auditedSha` (e.g. a finder spawned from a worktree may read the primary
>    checkout's HEAD). Code findings are protected mechanically - `audit-merge.rb` + `citation-check.rb`
>    drop any snippet that does not resolve at `auditedSha` - but TELL each finder the `auditedSha`
>    and have it cite snippets that exist there, and confirm in Step 5 that citation-check is green
>    (a finder that audited the wrong tree shows up as dropped/`skipped` findings).
> 2. For LIVE-infra checks there is no citation gate (runtime evidence is SKIPped). To avoid
>    concurrent finders observing a moving target, the orchestrator (trusted main session) should
>    pull the live Render/AWS/GCP read-state ONCE and pass that snapshot to the infra finder, rather
>    than letting parallel finders hit live APIs independently. The first run emitted no runtime
>    findings (all 7 were committed-file `type:"code"`), so the race did not bite - keep this as the
>    standing instruction until/unless a snapshot mechanism is built.

| Agent | Domain | Skill it loads |
|-------|--------|----------------|
| `privacy-auditor`       | privacy       | gdpr-ferpa-audit |
| `infra-auditor`         | infra         | soc2-security-audit |
| `api-auditor`           | api           | api-contract-audit |
| `dependency-auditor`    | dependency    | dependency-audit |
| `accessibility-auditor` | accessibility | accessibility-audit |
| `code-hygiene-auditor`  | code-hygiene  | code-hygiene-audit |

Prompt each with: the `auditedSha`, the scan scope from its skill, and
"cross-check `audit-reports/FINDINGS.json` first; reference an existing `id` rather than
duplicating." Collect each finder's JSON `{domain, auditedSha, findings:[...]}`.

> RETIRED from the fan-out (Phase 2): `ember-stabilization` and `rails-upgrade` (migration-era,
> shipped) and the 0-100 `mvp-readiness` score (decision 5.9.2: the headline is now the count of
> open Critical/High findings, not a synthetic score). The legacy top-level
> `skills/`, `subagents/`, `workflows/` dirs were removed in Phase 2; their content was
> migrated into this `.claude/` layout.

## Step 3: Reconcile into the register (deterministic)
Write each finder's output to a temp JSON file, then run the merge helper. It computes the
stable id (`LL-` + first 10 hex of `sha256(ruleKey + "|" + file)`), preserves `firstSeen`,
`owner`, existing `status`, and `closureEvidence` for known ids, adds new findings as `open`,
bumps `lastSeen` + the register `auditedSha`/`auditedRef`/`auditedDate`, and FLAGS regressions
(an id previously `verified-closed`/`accepted-risk`/`superseded` that a finder re-surfaced):

```
ruby scripts/audit-merge.rb \
  --register audit-reports/FINDINGS.json \
  --sha <auditedSha> --ref <auditedRef> --date <YYYY-MM-DD> \
  --in /tmp/finder-privacy.json --in /tmp/finder-infra.json \
  --in /tmp/finder-api.json --in /tmp/finder-dependency.json \
  --in /tmp/finder-accessibility.json --in /tmp/finder-code-hygiene.json \
  --out audit-reports/FINDINGS.json --summary /tmp/audit-summary.json
```

The merge NEVER sets `verified-closed` and NEVER downgrades an existing finding. New findings
land as `open`; regressions land as `open` with `regression: true` and a loud note for Scot.

> **`--sha` restamps `meta.auditedSha` — that is correct HERE and nowhere else.** This is a
> whole-tree scan, so the audit pointer legitimately moves to the audited commit (a governance act:
> record the move and the intervening-commit analysis in `meta.auditedShaPriorNote` for Scot's
> sign-off). If you are adding a finding OUTSIDE a full `/audit-run`, add `--no-restamp` so evidence
> anchors at the true commit while `meta` stays untouched. Never pass the register's existing
> `auditedSha` to dodge the restamp: that anchors the new evidence to a commit it was never verified
> against and passes citation-check green whenever the line numbers happen to coincide.

## Step 4: Adversary verification (fresh context per batch)
For each NEW or REGRESSED finding (from the merge summary), spawn the brain `adversary` agent
with a fresh context to independently confirm it before it is treated as real. Batch by domain
to keep each verifier context focused. Give the adversary ONLY the finding (ruleKey, file:line,
snippet, claim) and ask it to try to REFUTE it against the code at `auditedSha`. Record each
verdict in the finding's `notes` (`adversary: confirmed|refuted|uncertain`, with reasoning).
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
   have the finder re-emit without the offending token. Common case: an accessibility finding whose
   text contains a 4-part EN 301 549 clause (`9.1.4.3`) that matches the IP scrubber - the
   accessibility-audit skill already instructs finders to avoid this, so a refusal here means the
   guidance was not followed and the finding must be corrected, not silently lost.
3. `ruby scripts/citation-check.rb --render audit-reports/FINDINGS.json` to regenerate
   `audit-reports/FINDINGS.md` from the JSON.
4. Optionally write a rendered `audit-reports/unified-audit-YYYY-MM-DD.md` for a quarterly run.

## Step 6: Report (headline = open Critical/High, not a score)
Present to Scot:
- **Headline:** open **Critical** and **High** counts (decision 5.9.2). No 0-100 score.
- New findings this run (by domain/severity), regressions (loud), and adversary verdicts.
- Confirm citation-check is green and the audited SHA.
- Remind: only Scot closes, downgrades, or accepts risk. Nothing customer-facing leaves without
  his sign-off (plan section 5.6).

## Step 7: Run log (built in Phase 4)
Two layers, both code/path evidence only - no student/patient data, no finding bodies with PII,
no secrets:
1. **Per-tool examination log (automatic).** Each finder has a PostToolUse hook
   (`.claude/hooks/audit-run-logger.sh <agent>`) that appends one line per examined path/command
   to `audit-reports/run-log/examined-<sha8>.jsonl` (LOCAL/gitignored). Nothing to do here; it
   captures "what each agent examined" as the finders run. Bash commands are redacted for
   secret/PII shapes; Grep patterns and all tool RESULTS are never logged.
2. **Per-run summary (you append).** Add one JSONL line to `audit-reports/run-log/runs.jsonl`
   (committed, safe) recording: `ts`, `auditedSha`, `auditedRef`, `type` (full|light), `finders`,
   `new`/`reseen`/`regressions`/`skipped` counts, `newIds`, the adversary verdict tally,
   `citationCheck` status, and the open Critical/High headline. Recurrence is then a diff over
   `runs.jsonl`. See `audit-reports/run-log/README.md`.

## Step 8 (optional, human-initiated): Publish summary to Notion
Regenerate the one-way Notion page body from the register:
`ruby scripts/compliance-notion-publish.rb` (then `--check`). It renders a PII-free summary
(headline + open-findings table, file:line anchors only) to
`audit-reports/notion/compliance-audit-page.md`, stamped with the audited SHA + run date and
marked "generated, do not edit". The actual push to the single Notion "Compliance & Audit" page in
the Master Inbox is a **human-initiated one-way step** (no audit/compliance surface auto-sends
externally) - see `audit-reports/notion/README.md`. The unattested Compliance Posture Report is
never published here; it stays DRAFT until Scot signs.

## Related: promoting PR-time findings
`/audit-run` is the periodic source, but PR-time reviews catch issues too. To pull a reviewed
**Critical/High** finding from a `/review-pr` / `/adversary-review` pass or the n8n PR bot into this
same register, use the **`/promote-finding`** skill (`.claude/skills/promote-finding/`). It is the
manual, Claude-operated counterpart to this orchestrator (same deterministic-merge + only-Scot
governance via `scripts/promote-finding.rb`), kept manual on purpose: a human is the
false-positive triage gate and the n8n bot is never given write access to the register (which is
PII-free, Tier 2 content -- a reviewer *seeing* it is fine; the concern is automated *writes*). See `audit-reports/README.md` ("Bridging PR-time
review findings").

## Guardrails (always)
- Read-only auditors; the register is the single source of truth; no student/patient data in
  findings (snippets are code only); compliance content is Tier 2 (PII-free), reviewable by any approved reviewer, gated by the data-bearing-path guard.
- This runbook never closes a finding and never edits application code. If a fix is warranted,
  that is a separate, normal (non-audit) change on its own branch.
- Disposition (triage) is Scot-only: the adding scripts only ever write disposition `untriaged`.
