---
name: promote-finding
description: Promote a Critical/High finding from a PR-time review (the /review-pr or /adversary-review CLI pass, or the n8n PR Review Bot comment) into the durable findings register as status "open". Code/path evidence only; never closes, downgrades, or triages. User-invoked only (/promote-finding).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

# /promote-finding: bridge a PR review finding into the register

The n8n PR Review Bot and the `/review-pr` + `/adversary-review` CLI passes post findings to a PR
comment and a Google Chat thread, and then they evaporate. The one store with a lifecycle, the
findings register `audit-reports/FINDINGS.json`, is fed only by the periodic `/audit-run` and never
sees PR-time findings. This skill closes that gap: it promotes a **reviewed, real, Critical/High**
PR finding INTO the register as `status: "open"` so it gets tracked and triaged instead of just
logged. It is the manual, governed counterpart of `/audit-run`'s automatic fan-out.

The register is the single source of truth and must never regress. This flow only ever ADDS a
finding as `open` (disposition `untriaged`); it never closes, downgrades, accepts risk, or sets a
disposition. **Only Scot** does any of those (plan section 5.6, checkpoint 1). Enforcement is
mechanical: `scripts/promote-finding.rb` refuses to write any other status or disposition.

## Why this is a manual command (not a hook, not an n8n auto-promote step)

1. **SSOT write governance.** The n8n PR bot runs a DeepSeek pass via OpenRouter (no BAA).
   `FINDINGS.json` is the compliance SSOT (PII-free, Tier 2). The concern is not a reviewer
   *seeing* the register -- under the two-tier policy an approved reviewer may -- it is letting
   bot-curated content be written *into* the SSOT automatically, which would require giving the
   n8n service write access to the repo register: a governance and attack-surface violation.
   Promotion is operated manually from a trusted session.
2. **False-positive control.** AI reviewers carry a 5-15% false-positive rate. Auto-promotion
   would flood the register with FPs. A human (you) deciding "yes, this one is real, track it" IS
   the triage gate the 2026-06-14 evaluation calls the differentiator (attribution + ownership).
3. **It mirrors `/audit-run`:** user-invoked orchestrator + deterministic merge helper + only-Scot
   governance. Same shape, different source.

## Hard rules (always)

- **Human-gated promotion.** The register is Tier 2 (PII-free), so an approved reviewer may see
  it; the gate here is governance, not routing. YOU decide what enters the SSOT: you may promote
  findings that a reviewer (`/review-pr`, the n8n bot's DeepSeek pass, `/adversary-review`)
  produced, but only after reading and re-judging them yourself -- never auto-forward a
  reviewer's verdict into the register.
- **Code/path evidence only.** Every promoted finding must carry `evidence.file` + a `snippet`
  that resolves at `evidence.sha`. No student/patient data, no secrets, no finding bodies with
  identifiers ever enter the register. `promote-finding.rb` REFUSES (does not redact) any finding
  whose text matches a PII or secret shape.
- **Critical/High only.** Medium/low PR findings are not promoted (keeps the register signal-dense).
- **Only Scot** closes, downgrades, accepts risk, or sets a disposition.

## Step 1: Gather the reviewed findings

Get the findings from ONE of:
- a `/review-pr` or `/adversary-review` run you just did in this session (read its output), or
- the n8n PR Review Bot's sticky PR comment: `gh pr view <PR#> --comments` and read the comment
  marked `<!-- pr-review-bot -->` (read it yourself; you are the promotion gate -- the bot's
  DeepSeek section is advisory input you re-judge, not a source you forward verbatim).

You decide which findings are REAL and worth tracking. Do not promote speculative or duplicate
findings; cross-check the register first (Step 2).

## Step 2: Cross-check the register first

`ruby scripts/citation-check.rb` must be green before you start (do not promote onto a red
register). Then check whether each candidate already exists: a finding's id is
`LL-` + first 10 hex of `sha256(ruleKey + "|" + file)`. If it already exists and is `open`,
promotion just refreshes its `lastSeen` and notes; if it exists and is Scot-closed, promotion
flags it `regression: true` for your review and Scot's decision (it is NOT reopened automatically).

## Step 3: Build the promotion input (code/path evidence only)

For each finding to promote, capture the exact `file`, `line`, and a verbatim `snippet` from the
code AT a real commit SHA. The sha must be reachable in the local git repo so
`git show <sha>:<file>` works, AND it must stay reachable when citation-check later runs in CI.
**Prefer the post-merge `staging` sha** for durability; a PR-branch head sha works at promotion
time but can be orphaned by a later rebase/force-push or branch deletion, which would redden
citation-check. The `snippet` must be a SINGLE source line (citation-check matches per line; a
multi-line snippet is refused). Write a JSON file:

```json
{
  "source": "pr-review",
  "pr": 391,
  "reviewer": "claude-senior-dev",
  "findings": [
    {
      "ruleKey": "short-stable-kebab-key",
      "title": "One-line description (no PII, no secrets)",
      "severity": "critical",
      "confidence": "high",
      "frameworks": ["FERPA"],
      "evidence": { "type": "code", "file": "app/...", "line": 42, "snippet": "verbatim code line", "sha": "<commit sha>" },
      "remediation": { "options": "what to do", "timeframe": "30d" },
      "notes": "context, code/path only"
    }
  ]
}
```

`ruleKey` is the finding's stable identity; pick a descriptive kebab key and reuse the same key if
the same issue recurs (recurrence then shows as one id over time, not a duplicate).

## Step 4: Promote (deterministic, governed)

```
ruby scripts/promote-finding.rb \
  --register audit-reports/FINDINGS.json \
  --in /tmp/pr-review-findings.json \
  --out audit-reports/FINDINGS.json \
  --summary /tmp/promote-summary.json \
  --owner <named-owner>            # who is responsible for triaging this; defaults to "unassigned"
```

The script: promotes Critical/High only; refuses any finding carrying PII/secret shapes; refuses
any finding whose snippet does not resolve (per-line) at its sha (would redden citation-check);
adds new findings as `open` / `untriaged` with PR provenance (`source` + a notes line); flags
regressions; and asserts it never wrote a Scot-owned status or a non-untriaged disposition. Read
the summary: `new`, `reseen`, `regressions`, `skipped` (with the reason each was skipped/refused).

**Expect some conservative false refusals.** The PII/secret gate errs on the safe side (refuse,
never redact-in). A snippet line containing a numeric literal with underscores (`30_000`), a
dotted version (`1.2.3.4`), or a `password =`/`token =`/`secret:` assignment can match the
PII/secret shapes and be refused even when it is not real PII. If a legitimate finding is refused
for this reason, cite a different (cleaner) line of the same issue, or paraphrase the surrounding
line; do not fight the gate. This in-script gate is redundant with the n8n bot's upstream
pre-scrub, so conservative is correct.

## Step 5: Validate + regenerate all derived artifacts

Promoting a finding can change severity counts and bundle membership, so it is not enough to
rebuild `FINDINGS.md` alone — the Notion mirror, compliance calendar, document register, and
publication-status report all derive from the register and CI's `audit-artifacts-integrity` job
fails the merge if any drifts. Regenerate them all in one governed, ordered step:

```
scripts/regenerate-register.sh          # gate on citation-check, render all artifacts, re-verify
```

This gates on `citation-check` first (refuses to render onto a register whose evidence does not
resolve), renders every derived artifact in dependency order, then re-runs the exact `--check`
verifications CI uses, so a green run here means a green `audit-artifacts-integrity`. It writes
local artifacts only and never pushes to Notion/Drive (those sync in their own CI workflows).
Run `scripts/regenerate-register.sh --check` to verify without writing (mirror CI locally).

If citation-check is red, a promoted snippet does not resolve at its sha (usually the sha is not
fetched locally, or the snippet was not copied verbatim). Fix the evidence and re-run; do not
commit a red register.

### If `document-register-render --check` fails with contentHash drift

Read the FAIL line carefully — after #766 it tells you which case you are in:

| Message says | Meaning | What to do |
|---|---|---|
| `contentHash drift for "…"` and **`(run render)`** / unattested | File changed; register row hash is stale | `scripts/regenerate-register.sh`, commit JSON + `.md` |
| `contentHash drift on the ATTESTED row` / points at `/re-attest-record` | Scot signed those bytes; fingerprint must not be overwritten | **Stop. Do not run render.** Revert the file edit, or ping Scot / `/re-attest-record` |

Attested = the register row has `attestation.attestedBy` (and a pinned `attestedContentHash`). Empty
`attestation: {}` means unattested — regenerate is fine. Full triage table:
`docs/legal/COMPLIANCE_DOCS_GUIDE.md` ("When CI is red").

<details><summary>Underlying commands (if you need to run one render in isolation)</summary>

```
ruby scripts/citation-check.rb audit-reports/FINDINGS.json          # validate evidence (exit 0)
ruby scripts/citation-check.rb --render audit-reports/FINDINGS.json # rebuild FINDINGS.md
ruby scripts/document-register-render.rb                            # DOCUMENT-REGISTER.md + JSON hashes
ruby scripts/compliance-calendar-render.rb                          # compliance-calendar.md
ruby scripts/compliance-notion-publish.rb                          # local Notion mirror render
ruby scripts/compliance-publication-status.rb                      # publication status report
```
</details>

## Step 6: Report to Scot (he owns triage)

- What was promoted (id, ruleKey, severity, PR, owner), what was skipped/refused and why.
- Confirm citation-check is green.
- Remind: these land `open` / `untriaged`. **Only Scot** sets a disposition
  (accepted / fixed / dismissed-false-positive / wontfix) or closes the finding. To triage, Scot
  edits the finding's `disposition` block in `FINDINGS.json` (`state`, `decidedBy`,
  `decidedDate`, `rationale`) and re-renders; or moves it to `verified-closed` /`accepted-risk`
  with `closureEvidence.attestation` when the issue is resolved/accepted.

## Guardrails (always)

- The register is the single source of truth and never regresses; this flow only adds `open`.
- Code/path evidence only; PII/secret-bearing findings are refused, never redacted-in.
- Compliance content is Tier 2 (PII-free output): any approved reviewer is permitted; the data-bearing-path guard is the boundary.
- Promotion does not change `meta.auditedSha` (these findings are anchored to their own PR sha,
  not the last /audit-run tree). If you instead file a finding through `audit-merge.rb` outside a
  full `/audit-run`, pass `--no-restamp` to get the same guarantee; never pass the register's
  existing `auditedSha` to dodge the restamp, which silently anchors the evidence to a commit it
  was never verified against (see `audit-reports/README.md`, "The audit pointer vs. the evidence
  anchor").
