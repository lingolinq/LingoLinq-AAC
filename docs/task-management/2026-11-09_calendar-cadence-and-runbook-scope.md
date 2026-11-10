# 2026-11-09: calendar cadences and breach-runbook environment scope

Scot's decisions of 2026-11-07 to 2026-11-09: keep only the review cadences a law or a signed
contract requires, and state which environments the breach runbook covers. Docs and config only.

## Change 1: `audit-reports/compliance-calendar.json` (Scot approved 2026-11-09)

- `rev-soc2-quarterly` removed (not pursuing SOC 2; re-add if a customer requires it).
- `rev-gdpr-subprocessor-quarterly`: event-driven (subprocessor added or changed), `nextDue` null.
- `rev-coppa-retention-quarterly`: annual, `nextDue` 2027-09-16. The linked fixed date
  `fix-coppa-2026-04-22` carried the same `nextDue` and "each quarter" wording, so it moved too.
- `rev-zdr-reverify-on-rotation`: "event-driven (model change) + annual", `nextDue` 2027-09-16.
- `rev-accessibility-acr-semiannual`: annual, `nextDue` unchanged.
- No id renamed. No check validates calendar ids, and frozen attested records cite the old ids.
- `lastDone` is unchanged on every row.
- Scot's answers on the overdue rows (2026-11-09): `rev-gemini-baa-annual` removed (Gemini has no
  live call site on develop; `scripts/ai-endpoint-guard.sh` blocks its key). `rev-ferpa-annual` and
  `rev-gdpr-dpa-annual` re-dated to 2027-09-16, with the missed 2026-09-01 date recorded in each
  row's `watch` so the re-dating is visible.
- `rev-zdr-reverify-on-rotation`: title, `drafts` and `watch` no longer name OpenRouter, which no
  code references; they now describe the Bedrock models allowlisted in `lib/ai_client.rb` and
  `lib/eval_narrator.rb`. Id kept.

## Change 2: breach runbook successor

- New `docs/legal/2026-11-09_incident-response-breach-runbook.md` (`DOC-c731415bd9`, draft),
  Path A successor of `docs/legal/2026-09-14_incident-response-breach-runbook.md`
  (`DOC-f082212111`, now `superseded`; its bytes and attestation block are untouched).
- Text follows the merged agent data rule (dev and staging hold no real user content; a problem
  confined to them, touching nothing shared with prod, is a normal bug unless real user data is
  found there, then stop and tell Scot).
- Not attested. Only Scot attests.

## Change 3: subprocessor register successor (Scot asked 2026-11-09)

- New `docs/legal/2026-11-09_subprocessor-register.md` (`DOC-c6eadd79fb`, draft), Path A
  successor of `docs/legal/2026-09-14_subprocessor-register.md` (`DOC-052b0e947c`, now
  `superseded`; bytes and attestation untouched).
- Review is event-driven (a subprocessor added or changed), so `nextReviewDue` is null, matching
  the calendar. Row 5 (Gemini) is marked REMOVED 2026-11-09 and kept as history.
- Not attested. Bundle `requiredDocs` for both successors are retargeted only after Scot attests.

## Cross-doc sweep

- Reconciled: `docs/legal/2026-08-24_ai-governance-memo.md` (draft) and
  `.claude/agents/compliance-officer.md` quarterly wording.
- `rev-gemini-baa-annual` removal: the draft AI governance memo no longer calls that row a
  reactivation gate (the gate is the endpoint guard plus the subprocessor review). Mentions in
  attested or superseded records are history and stay.
- Follow-ups (frozen or out of scope): the data-retention docs' "Related" line points at the 2026-09-14
  runbook; `bundleDefinitions` `requiredDocs` still point at the 2026-08-15 runbook; the
  `rev-breach-runbook-drive-remirror` row still targets v2.2.2.

## 2026-11-10: attestation and close-out

The "draft", "not attested" and "retargeted only after Scot attests" statements above describe
the state on 2026-11-09 and are kept as history.

- Scot attested `DOC-c731415bd9` (runbook) and `DOC-c6eadd79fb` (subprocessor register) on
  2026-11-10 at sha256 `c73ea73d...` and `d7d275e1...`. Both rows are `approved`, and the
  predecessors still verify against their frozen bytes.
- Scot confirmed that removing Gemini needs no customer notice and no further section 7 exit step.
  That determination is in the register row's attestation note, not in the attested file.
- Seven `bundleDefinitions` `requiredDocs` entries were retargeted: four runbook, three
  subprocessor register.
- Review: one senior-dev pass (Codex `gpt-6.1-sol`, high) on PR #1297 at `f6b5f1fa9`. The verdict
  was approve with comments.
- Follow-ups for the next subprocessor register successor:
  - Reword the header's "carries NO attestation of its own" to point only at the register row.
  - Put the Gemini section 7 determination beside row 5.
