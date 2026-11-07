# 2026-11-06 finish the retention retraction in the legal drafts (#1061, #1060 / KAN-118)

Follows #1269, which fixed `lib/eu_jurisdiction.rb` and `lib/tasks/scheduler.rake` comments and left the legal-doc side open. Docs, comments and a citation spec; no runtime change.

## What was verified

- Register status of each document (`audit-reports/DOCUMENT-REGISTER.json`): `2026-09-22_data-retention.md`, `2026-08-25_ai-data-flow-classification.md` and `2026-08-24_ai-governance-memo.md` are unattested drafts, so they can change in place. `2026-09-14_compliance-program.md`, `2026-09-14_subprocessor-register.md` and `2026-09-14_incident-response-breach-runbook.md` are attested and frozen.
- `2026-09-14_compliance-program.md:259-260` lists 164.316(b)(2) among the laws the schedule as a whole addresses. It does not state a floor for `ai_api_logs`, so no retraction is owed there. Its `DATA_RETENTION.md` pointer is stale, as are the pointers in the other two attested records; they move at their next supersession.
- #1060's four claims against the 2026-09-22 draft: children's age-18 sweeper, `LogSnapshot` cascade and the 2-year account window were already corrected. `ClusterLocation` still said 90 days in the window cell; corrected here. `app/models/cluster_location.rb` has no purge and `lib/flusher.rb:9-19` removes the rows only in `flush_user_logs`.

## What changed

- 2026-09-22 draft: section 1 citation, three `AiApiLog` tiers, new healthcare-linked row, `PaperTrail` basis marked unconfirmed, `ClusterLocation` window, section 6 pointers, and a dated disclosure block, because the existing block says no other cell differs.
- 2026-08-25 draft: section 6 and the scope note, same retraction.
- Governance memo: dated bracket at the "open" item, matching that file's correction style.
- `scheduler.rake` now points at the two current drafts. Spec comments no longer imply early deletion against a floor.
- `spec/lib/retracted_hipaa_floor_citations_spec.rb` now covers the three drafts, the rake pointers and the `ClusterLocation` cell. Red first: 5 of 7 failing, then green.

## Wording choice

"Under counsel review" is not repeated in these edits. The latest repo record (2026-09-18 addendum) says the memorandum has not been sent, so the drafts say "open for counsel" and "drafted for counsel".

## Not in this change

- Attestation of the drafts (Scot only), and closing LL-1421732fb8.
- The privacy page (#1050).
- Spec titles at `spec/lib/lingo_linq/article50_disclosures_spec.rb:168,174` and `spec/lib/eu_jurisdiction_spec.rb:142` (Rule 14 needs approval), and the `lingolinq_hipaa_floor` metadata key.
- `lib/flusher.rb:123-125` and `spec/lib/flusher_spec.rb:1054` still cite the frozen schedule's 6-year `PaperTrail` line. Different data class, and that comment justifies report-only behaviour.
- `config/locales/en.yml` and `lib/tasks/scheduler.rake` still say "under review with our lawyers" / "under counsel review". True only once the memorandum goes out.
