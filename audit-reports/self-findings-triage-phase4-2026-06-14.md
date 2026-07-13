# Phase-4 Revisit of the Two Deferred Self-Findings

> Phase 4 "Cadence" deliverable. Phase 3 triaged five audit-system self-findings and DEFERRED two
> (`audit-reports/self-findings-triage-2026-06-13.md`). With the first full `/audit-run` now
> executed for real (2026-06-14, audited SHA `1aa5d2db`), this doc revisits those two with
> first-run evidence in hand and records the harden-now-vs-keep-deferred decision. It does NOT
> change any finding's status: only Scot moves a finding to `verified-closed`/`accepted-risk`. The
> register (`audit-reports/FINDINGS.json`) remains the source of truth; both stay `open`.

## Decision summary

| Finding | Severity | Phase-3 decision | Phase-4 decision (with first-run evidence) | Applied in this branch? |
|---|---|---|---|---|
| LL-3483c28f3c (parallel-finder live-infra race) | low | Defer to Phase 4 | **Keep deferred + instruction-only hardening** | Yes (orchestrator instruction) |
| LL-97f9001bb4 (guard denylist residual bypass) | low | Defer | **Keep deferred (unchanged)** | No (rationale below) |

## First-run evidence that informs both

The first full fan-out (four finders -> merge -> adversary verify -> citation-check) produced:

- **7 new findings, all `type:"code"` (committed files), zero `type:"runtime"`/live-infra evidence.**
  Every snippet resolved at the audited SHA; `audit-merge.rb` skipped nothing and
  `citation-check.rb` stayed green (41 PASS / 0 FAIL).
- **A cwd/SHA-context wrinkle:** subagents spawned via the Agent tool read whatever tree their
  working directory is on. In this run the finders/verifiers ran with cwd pinned to the **primary
  checkout** (HEAD `eb103c486`), not the orchestrator's worktree (`1aa5d2db`) - two adversary
  verifiers reported this explicitly. Because the merge and citation-check anchor every code
  snippet to the explicit `auditedSha` and drop anything that does not resolve there, **code
  findings were protected mechanically**; the integration files in question were also unchanged
  between the two commits, so the verdicts held.
- **The project finder subagents were not resolvable as Agent-tool subagent types in this runtime**
  (the registry is a fixed list), so the finders ran as registered stand-ins
  (compliance-auditor / rails-ember-dev / general-purpose) carrying the finder role + skill scope.
  This means the per-agent read-only guard and the new logger hook were **not exercised** this run.
  In a normal interactive Claude Code session the `.claude/agents/*` finders resolve and their
  hooks fire; this should be confirmed there. Recorded as a run note, not a register finding,
  because it is a property of this orchestration harness, not a verified defect of the supported
  runtime.

## Per-finding detail

### LL-3483c28f3c - parallel finders read live infra without synchronization (low) -> KEEP DEFERRED + instruction-only hardening
- **Why not full harden now:** the race only manifests when finders emit `type:"runtime"` evidence
  from concurrent live Render/AWS/GCP reads. The first real fan-out emitted **none** - all findings
  were committed-file code anchored to one SHA - so the race did not bite. A full fix (snapshot
  live infra once in the orchestrator and pass it to finders, or stamp a single read window) is an
  `/audit-run` orchestration build; low severity and a data-quality, not security, risk.
- **What was applied (instruction-only, cheap, evidence-driven):** added a standing instruction to
  `audit-run` SKILL Step 2 - (1) anchor each finder to `auditedSha` and rely on the citation gate
  to drop wrong-tree snippets; (2) for live-infra checks, the orchestrator (trusted main session)
  pulls the live read-state ONCE and passes that snapshot to the infra finder rather than letting
  parallel finders hit live APIs independently. This mirrors the Phase-3 pattern of instruction
  hardening for low-severity audit-system findings.
- **Residual / still deferred:** the actual snapshot mechanism (a real orchestrator pre-pull +
  pass-through) is not built; the instruction is the control until it is. The cwd/SHA wrinkle above
  is the more pressing real-world manifestation and is covered by the same Step-2 instruction plus
  the mechanical citation gate. Stays `open` until Scot attests.

### LL-97f9001bb4 - audit Bash guard is a denylist with residual fetch-and-exec bypass (low) -> KEEP DEFERRED (unchanged)
- **Why defer holds:** the **primary** read-only guarantee for finders is the
  `tools: Read, Grep, Glob, Bash` allowlist (no Edit/Write at all); the Bash denylist in
  `audit-readonly-guard.sh` is defense-in-depth. The first run surfaced no bypass - and in fact did
  not exercise the guard, since the run used registered stand-in agents that lack the wired hook.
  No new evidence raises the risk.
- **New this phase, checked for regressions:** the Phase-4 PostToolUse logger hook
  (`audit-run-logger.sh`) added to the four finders is read-only (append-only to a local log,
  always exits 0) and grants no write capability, so it does **not** widen the residual-bypass
  exposure. The compliance-officer write-scope guard (Phase 3) remains allowlist-primary.
- **What a real fix would take:** an allowlist-based command filter or a sandboxed finder shell - a
  meaningful build, not warranted by first-run evidence. Stays `open`; revisit if a SOC 2 evidence
  requirement demands a stronger mechanical control.

## What Scot decides
- Whether the instruction-only hardening for LL-3483c28f3c is sufficient, or the snapshot mechanism
  should be built sooner.
- Whether LL-97f9001bb4 is acceptable to carry as-is (allowlist-primary, denylist defense-in-depth),
  or warrants the sandbox/allowlist build now.
- Both stay `open`; this doc recommends, it does not close. The register is unchanged in status by
  this triage (only the two findings' `notes` were annotated with this revisit).
