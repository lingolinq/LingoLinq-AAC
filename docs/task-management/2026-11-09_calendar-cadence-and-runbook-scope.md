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
- `lastDone` is unchanged on every row. The overdue annual rows (`rev-ferpa-annual`,
  `rev-gdpr-dpa-annual`, `rev-gemini-baa-annual`) are untouched, pending Scot.

## Change 2: breach runbook successor

- New `docs/legal/2026-11-09_incident-response-breach-runbook.md` (`DOC-c731415bd9`, draft),
  Path A successor of `docs/legal/2026-09-14_incident-response-breach-runbook.md`
  (`DOC-f082212111`, now `superseded`; its bytes and attestation block are untouched).
- Text follows the merged agent data rule (dev and staging hold no real user content; a problem
  confined to them, touching nothing shared with prod, is a normal bug unless real user data is
  found there, then stop and tell Scot).
- Not attested. Only Scot attests.

## Cross-doc sweep

- Reconciled: `docs/legal/2026-08-24_ai-governance-memo.md` (draft) and
  `.claude/agents/compliance-officer.md` quarterly wording.
- Follow-ups (frozen or out of scope): the attested subprocessor register
  (`docs/legal/2026-09-14_subprocessor-register.md`) still says its review is quarterly and must
  agree with the calendar; the data-retention docs' "Related" line points at the 2026-09-14
  runbook; `bundleDefinitions` `requiredDocs` still point at the 2026-08-15 runbook; the
  `rev-breach-runbook-drive-remirror` row still targets v2.2.2.
