# Phase-2 Self-Findings Triage (harden-now vs defer)

> Phase 3 deliverable. The 5 findings below were recorded as `open` in the register during the
> Phase 2 PR #380 self-review. This doc records the harden-now-vs-defer **decision and
> rationale** for each, and what was applied in this branch. It does NOT change any finding's
> status: only Scot moves a finding to `verified-closed`/`accepted-risk`. The register
> (`audit-reports/FINDINGS.json`) remains the source of truth; these findings stay `open` until
> Scot attests, or the next `/audit-run` reconciles them at a new audited SHA.
>
> Triaged: 2026-06-13. Register audited SHA at triage: `56da75814c`.

## Decision summary

| Finding | Severity | Decision | Applied in this branch? |
|---|---|---|---|
| LL-a2b45c2bcb (finder agent-memory cross-run state) | low | **Harden now** | Yes (instruction-only) |
| LL-5f0f4f52f8 (audit system not self-audited) | low | **Harden now** (partial) | Yes (scope note); full meta-audit -> Phase 4 |
| LL-b5c30235d3 (runtime/CLI evidence secret/PII leak) | medium | **Harden now** (instruction) + recommend mechanical check | Instruction applied; script check recommended for Scot |
| LL-97f9001bb4 (guard denylist residual bypass) | low | **Defer** | No (rationale below) |
| LL-3483c28f3c (parallel-finder live-infra race) | low | **Defer to Phase 4** | No (rationale below) |

## Per-finding detail

### LL-a2b45c2bcb - finder agent-memory may carry process state across runs (low) -> HARDEN NOW
- **Why now:** cheapest of the five, instruction-only, and directly tied to a real trust
  property (memory must never become a covert findings/PII store). The register scheduled it
  for Phase 3.
- **Applied:** added a `## Memory policy` section to all four finder agents
  (`privacy/infra/api/dependency-auditor.md`) stating that `memory: project` holds process
  knowledge only, never findings/PII/snippets/secrets, and that a fresh run re-verifies against
  live code. The same policy is built into the new `compliance-officer` agent.
- **Residual:** this is an instruction, not a mechanical control. Claude Code does not expose a
  per-agent memory-content validator today. `memory: local` or a periodic memory reset remains
  an option if a stronger control is wanted later. Stays `open` until Scot attests.

### LL-5f0f4f52f8 - audit system files (.claude/) not in any scan scope (low) -> HARDEN NOW (partial)
- **Why now (partial):** the cheap part (putting `.claude/` in a finder's documented scope) is
  instruction-only; the expensive part (an automated meta-audit pass in the orchestrator) is
  Phase 4 cadence work.
- **Applied:** added an "Audit-system self-audit (CC-meta)" bullet to `infra-auditor.md` scan
  strategy, putting `.claude/agents`, `.claude/skills`, `.claude/hooks` in the SOC 2 finder's
  scope (least-privilege toolsets, guard efficacy, no secrets/PII in instructions, evidence
  rules that cannot leak).
- **Deferred to Phase 4:** a dedicated meta-audit step in `/audit-run` that fans a finder
  specifically at the audit system. Tracked there. Stays `open` until then / Scot attests.

### LL-b5c30235d3 - runtime/CLI evidence relies on instruction-only control vs secret/PII leak (medium) -> HARDEN NOW (instruction) + RECOMMEND mechanical check
- **Why:** highest severity of the five (medium), tagged HIPAA/FERPA, and it is the one that
  could put a secret or identifier into a finding. `type:"runtime"` snippets are free text that
  `citation-check.rb` deliberately skips, so today the only control is the agent instruction.
- **Applied (instruction):** strengthened `infra-auditor.md` with an explicit rule and concrete
  examples (record the shape, never raw values: "TLS min below policy", not the cert; "DB SSL
  mode = <non-require>", not the connection string).
- **Recommended to Scot (not applied here):** a mechanical secret-shaped-string rejector in
  `scripts/audit-merge.rb` or `scripts/citation-check.rb` that fails the run if any finding's
  evidence snippet matches secret/PII shapes (API-key prefixes `ghp_`/`rnd_`/`pplx-`/`eyJh`,
  high-entropy tokens, email/SSN-shaped strings). This touches the Phase-1 audit toolchain and
  deserves its own small security-reviewed change rather than riding on this governance branch.
  **Tracked on the compliance calendar as `gov-secret-rejector-build` (nextDue 2026-09-01).**
  Until built, the instruction is the control. Stays `open`.

### LL-97f9001bb4 - audit Bash guard is a denylist with residual fetch-and-exec bypass (low) -> DEFER
- **Why defer:** the **primary** read-only guarantee for finders is the `tools: Read, Grep,
  Glob, Bash` allowlist (no Edit/Write at all). The Bash denylist in `audit-readonly-guard.sh`
  is defense-in-depth; a determined novel obfuscation can still slip a write through it, but the
  finder has no write tools and the guard already blocks pipe-to-shell/eval. A true fix
  (allowlist-based command filter or a sandboxed finder shell) is a meaningful build, not a
  Phase 3 governance task.
- **Note for the record:** the new `compliance-officer-write-scope.sh` guard added this phase
  shares the same denylist limitation on its Bash branch, but the officer's **primary** control
  is an allowlist (writes permitted only under `audit-reports/` and `docs/legal/`), which is
  stronger than the finder Bash denylist. So this phase did not widen the residual-bypass
  exposure. Stays `open`; revisit with a sandbox/allowlist effort if SOC 2 evidence demands it.

### LL-3483c28f3c - parallel finders read live infra without synchronization (low) -> DEFER to Phase 4
- **Why defer:** the fix ("snapshot live infra once in the orchestrator and pass it to
  finders, or stamp a single read window") is an `/audit-run` orchestration change, which is
  Phase 4 cadence territory (first full run on the new system). Low severity; an inconsistent
  live-infra snapshot across concurrent finders is a data-quality risk, not a security or
  privacy one. Tracked for Phase 4. Stays `open`.

## What Scot decides
- Whether to accept the instruction-only hardenings as sufficient to move LL-a2b45c2bcb,
  LL-5f0f4f52f8, and LL-b5c30235d3 toward closure (only Scot attests).
- Whether to greenlight the mechanical secret-shaped-string rejector (LL-b5c30235d3) as a
  follow-up security change.
- Whether the deferred items (LL-97f9001bb4, LL-3483c28f3c) are acceptable to carry into Phase
  4, or warrant earlier work.

_Governance: this doc recommends; it does not close. The register is unchanged by this triage._
