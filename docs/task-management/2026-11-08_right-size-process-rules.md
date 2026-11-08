# 2026-11-08: right-size the process rules

Scot's decision, 2026-11-07: size the repo's process rules to what laws and contracts require.
Text and config only; no application code.

## What changed

1. **Review tiers.** A normal PR gets one review (the Codex GitHub connector's automatic review
   counts, or one `/review-pr`). Dual review only for authentication or sessions, consent or
   account ownership, access to another user's or organization's data, billing, AI model routing
   or the AI client, infra or deploy config, and the `data-bearing-paths` gate. At most two review
   rounds; a third needs Scot's OK. Critical or High still blocks. Files: `CLAUDE.md`,
   `AGENTS.md`, `.github/copilot-instructions.md`, `.claude/skills/pr-preflight/SKILL.md`.
2. **Fix-proposal scope.** Fact sheet and red-test-first required for data handling, auth, sync
   and offline, and the dual-review areas; optional for UI, styling, copy, docs and small isolated
   fixes. Files: `CLAUDE.md` Rule #0 item 12, `.claude/skills/fix-proposal/SKILL.md`, and the
   short forms in `AGENTS.md` and `.github/copilot-instructions.md`.
3. **Incident scope.** Not changed in this repo. The breach runbook in force is
   `docs/legal/2026-09-14_incident-response-breach-runbook.md` (attested, frozen), not
   `docs/legal/BREACH_RUNBOOK.md` (a superseded predecessor, also frozen). A change needs a Path A
   successor that only Scot attests, and the agent-side data rule it depends on has not changed
   yet. Scot chose to keep the successor as a private draft until then.
4. **Audit cadence.** One formal full `/audit-run` per year (`rev-audit-run-annual-full`, next due
   2027-09-16, set by Scot). The quarterly-full and monthly-light rows are gone. Ad hoc runs stay
   available in full or light mode, and their stamp reads `Ad hoc run, no sign-off stamp PR`.
   Files: `audit-reports/README.md`, `audit-reports/compliance-calendar.json` (and its render),
   `.claude/rules/compliance-docs.md`, `.claude/skills/audit-run/SKILL.md`, plus run-name wording in
   `.claude/skills/accessibility-audit/SKILL.md`, `.claude/skills/code-hygiene-audit/SKILL.md`,
   `.claude/agents/code-hygiene-auditor.md` and `.claude/skills/compliance-status/SKILL.md`.
5. **Adding process.** One line in `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md` and
   `.claude/rules/compliance-docs.md`: add a gate, review round, attestation or consent step only
   when a law, a signed contract or a real incident calls for it, and name which.

## Kept unchanged

Rule 14, rule 15, the public-repo filter, Tier 1 data rules, Bedrock-only runtime AI. Finder
checklist item counts are unchanged, so `audit-fanout-gate.rb` expected ids are unaffected.
Historical `quarterly` and `monthly light` mentions in dated legal docs and run logs are history
and stay.
