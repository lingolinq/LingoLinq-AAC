# Audit finder wiring and checklist refresh (2026-10-30)

Finding: LL-c667ec15e3. Status stays with Scot; this change does not touch the register row.

## What changed

- `/audit-run` and `/ember-audit-run` spawn finders unnamed and run `scripts/audit-fanout-gate.rb`
  before merging finder output, including a later re-emit. `/compliance-status` spawns its agent unnamed.
- `audit-run-logger.sh` records each spawn's `agent_id`; the gate wants one per output. A live run of
  two unnamed finders logged two ids, and the gate refused three outputs against them.
- Live wiring runs (not audits) on this branch: the six real finders passed the default mode, the Ember
  finder passed partial mode, a dropped finder was refused, and a real named finder was refused.
- `audit-merge.rb` refuses a restamping merge of a file whose `auditedSha` is not `--sha`.
- Each finder checklist carries a run receipt: a checklist token and a guard canary.
- Checklists gained the verified US dates and the COPPA and HIPAA lines.
- The ADA Title II calendar row moved from 2027-04-24 to 2027-04-26, as DOJ's rule states.

## Sources opened

| Source | Used for |
|---|---|
| Federal Register 2026-09266 (govinfo and API) | HHS Section 504 dates |
| Federal Register 2026-07663 (govinfo and API) | ADA Title II dates |
| Federal Register 2025-05904 (govinfo and API) | COPPA compliance date |
| eCFR 16 CFR 312.8, version dated 2025-06-23 | Written security program wording |
| Federal Register 2024-30983 (API) | HIPAA update is a Proposed Rule |

## Left out

EU AI Act Article 50 wording: EUR-Lex returned an empty challenge response and no other primary copy
opened, so no line was added. The switch-scanning contract already in `accessibility-audit` is unchanged.
