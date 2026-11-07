# 2026-11-06 retract the HIPAA six-year floor from retention comments (#1061 / KAN-118)

Comment-only change, so no fix-proposal fact sheet is required (Rule 12). Runtime is unchanged: `EuJurisdiction.retention_stamp` still maps `:unknown` to `nil`.

## What was verified

- The retraction: `app/models/ai_api_log.rb` BASIS NOTE above `purge_old_eu_logs!` (#888, 2026-08-30). Article 50 imposes no record-keeping period; the 45 CFR 164.316(b)(2) floor framing is withdrawn; a disclosed up-to-6-years window remains.
- The window is disclosed to users: `config/locales/en.yml` `retention_hipaa`. Both windows are under counsel review: `lib/lingo_linq/article50_disclosures.rb` retention comment.
- `lib/eu_jurisdiction.rb` and `lib/tasks/scheduler.rake` no longer cite 164.316(b)(2) as a live rule; their only remaining citations quote the retraction. This was not a full sweep. Still using the old framing: spec titles at `spec/lib/lingo_linq/article50_disclosures_spec.rb:168,174` ("EU and HIPAA floors") and `spec/lib/eu_jurisdiction_spec.rb:142` (renaming a test needs approval under Rule 14), comments at `spec/lib/eu_jurisdiction_spec.rb:137` and `spec/lib/ai_board_generator_spec.rb:237`, and the key `lingolinq_hipaa_floor` in `lib/lingo_linq/article50_disclosures.rb`. `lib/flusher.rb:123-125` and `spec/lib/flusher_spec.rb:1054` state a 6-year requirement for PaperTrail, a different data class.

## Review follow-up (senior-dev pass on 7661c204b)

- `eu_jurisdiction.rb` still opened with "Article 50 RETENTION stamp", the other half of the #888 retraction. Reworded.
- The same block said the tiered purge "excludes healthcare-linked rows" and "once purge_old_eu_logs! is scheduled". `purge_old_eu_logs!` filters only on `jurisdiction` and age, is already wired in `scheduler:dispatch`, and `ai_api_logs` has no per-row healthcare marker. Reworded to say there is no carve-out today.
- The spec pattern `/inside the six-year floor/` could not match develop's wording, which wraps as `inside` / `# the six-year floor`. Now `/inside\s+(?:#\s+)?the six-year floor/i`.
- The spec also pins the two corrected statements. Red on the pre-follow-up comment, green after.

## Proposal review follow-up (adversary pass on the wording)

- The window is a stated maximum, not a floor. An earlier draft said "not a duty to keep"; that overreached, because the counsel memo says "We are not saying no argument exists" and leaves whether 164.316(b)(2)(i) reaches `ai_api_logs` as question 6. The comments leave that question open.
- The `:unknown` rationale was replaced, not re-cited: the old reason was the retracted floor, and the reason now is that the EU purge cannot be undone and needs an EU signal behind it.
- "Confirmed" was corrected in `eu_jurisdiction.rb` only. The same word remains at `lib/tasks/scheduler.rake:206`, `lib/lingo_linq/article50_call_context.rb:40`, `spec/lib/eu_jurisdiction_spec.rb:135`, and in public copy at `app/frontend/app/templates/privacy.hbs:99` and `lib/lingo_linq/ai_consent_disclosures.rb:141`.
- The public notice in `config/locales/en.yml` was left as it is, by decision.

## Not in this PR

- The legal-doc side of the retraction. The current drafts still carry the retracted bases: `docs/legal/2026-08-25_ai-data-flow-classification.md` and `docs/legal/2026-09-22_data-retention.md`. Also check `docs/legal/2026-08-24_ai-governance-memo.md:765` (draft) and `docs/legal/2026-09-14_compliance-program.md:259-260` (attested, so `/re-attest-record`). `AI_DATA_FLOW_CLASSIFICATION.md` and `DATA_RETENTION.md` are attested and superseded, so they are frozen, and `scheduler.rake` still names them as surfaces to keep identical, which cannot be followed until those pointers move. #1061 stays open for this.
- `DATA_RETENTION.md` accuracy (#1060) and the privacy page (#1050).
- Whether the EU purge needs a healthcare carve-out (open with counsel). Building one needs a per-row marker (schema and call-site change). No row can reach the cutoff before about 2031.
- `security-scan` fails on Rails 7.2.3.2 advisories on develop too; that needs its own bump.
