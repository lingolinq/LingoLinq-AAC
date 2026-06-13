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
Spawn the four domain finders concurrently with the Agent tool, passing each the `auditedSha`.
They are read-only (no Edit/Write; a PreToolUse guard blocks mutating Bash) and emit
register-shaped findings with `status: "open"`.

| Agent | Domain | Skill it loads |
|-------|--------|----------------|
| `privacy-auditor`    | privacy    | gdpr-ferpa-audit |
| `infra-auditor`      | infra      | soc2-security-audit |
| `api-auditor`        | api        | api-contract-audit |
| `dependency-auditor` | dependency | dependency-audit |

Prompt each with: the `auditedSha`, the scan scope from its skill, and
"cross-check `audit-reports/FINDINGS.json` first; reference an existing `id` rather than
duplicating." Collect each finder's JSON `{domain, auditedSha, findings:[...]}`.

> RETIRED from the fan-out (Phase 2): `ember-stabilization` and `rails-upgrade` (migration-era,
> shipped) and the 0-100 `mvp-readiness` score (decision 5.9.2: the headline is now the count of
> open Critical/High findings, not a synthetic score). The legacy top-level
> `skills/`, `subagents/`, `workflows/` dirs are deprecated; see their READMEs.

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
  --out audit-reports/FINDINGS.json --summary /tmp/audit-summary.json
```

The merge NEVER sets `verified-closed` and NEVER downgrades an existing finding. New findings
land as `open`; regressions land as `open` with `regression: true` and a loud note for Scot.

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
2. `ruby scripts/citation-check.rb --render audit-reports/FINDINGS.json` to regenerate
   `audit-reports/FINDINGS.md` from the JSON.
3. Optionally write a rendered `audit-reports/unified-audit-YYYY-MM-DD.md` for a quarterly run.

## Step 6: Report (headline = open Critical/High, not a score)
Present to Scot:
- **Headline:** open **Critical** and **High** counts (decision 5.9.2). No 0-100 score.
- New findings this run (by domain/severity), regressions (loud), and adversary verdicts.
- Confirm citation-check is green and the audited SHA.
- Remind: only Scot closes, downgrades, or accepts risk. Nothing customer-facing leaves without
  his sign-off (plan section 5.6).

## Step 7 (optional): Run log
Append a one-line JSONL record of this run (audited SHA, date, finder set, counts) to
`audit-reports/run-log.jsonl` so recurrence is a diff over time. (Full hook-based per-tool run
logging is Phase 4.)

## Guardrails (always)
- Read-only auditors; the register is the single source of truth; no student/patient data in
  findings (snippets are code only); compliance content is Claude-only, never Codex/DeepSeek.
- This runbook never closes a finding and never edits application code. If a fix is warranted,
  that is a separate, normal (non-audit) change on its own branch.
