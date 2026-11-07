# 2026-11-06 retract the HIPAA six-year floor from retention comments (#1061 / KAN-118)

Comment-only change, so no fix-proposal fact sheet is required (Rule 12). Runtime is unchanged: `EuJurisdiction.retention_stamp` still maps `:unknown` to `nil`.

## What was verified

- The retraction: `app/models/ai_api_log.rb` BASIS NOTE above `purge_old_eu_logs!` (#888, 2026-08-30). Article 50 imposes no record-keeping period; the 45 CFR 164.316(b)(2) floor framing is withdrawn; a disclosed up-to-6-years window remains.
- The window is disclosed to users: `config/locales/en.yml` `retention_hipaa`. Both windows are under counsel review: `lib/lingo_linq/article50_disclosures.rb` retention comment.
- No statement of the floor as a live rule remains in `app`, `lib`, `config`, `spec` or `scripts`. Remaining mentions quote the retraction or test for it.

## Review follow-up (senior-dev pass on 7661c204b)

- `eu_jurisdiction.rb` still opened with "Article 50 RETENTION stamp", the other half of the #888 retraction. Reworded.
- The same block said the tiered purge "excludes healthcare-linked rows" and "once purge_old_eu_logs! is scheduled". `purge_old_eu_logs!` filters only on `jurisdiction` and age, is already wired in `scheduler:dispatch`, and `ai_api_logs` has no per-row healthcare marker. Reworded to say there is no carve-out today.
- The spec pattern `/inside the six-year floor/` could not match develop's wording, which wraps as `inside` / `# the six-year floor`. Now `/inside\s+(?:#\s+)?the six-year floor/i`.
- The spec also pins the two corrected statements. Red on the pre-follow-up comment, green after.

## Not in this PR

- `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md:235` still says "audit-floor purposes", and `scheduler.rake` says to keep that file identical. Whether it is attested was not checked; an attested file needs `/re-attest-record`, not an in-place edit. The three-surfaces note is in #1060.
- `DATA_RETENTION.md` accuracy (#1060) and the privacy page (#1050).
- Building a healthcare carve-out for the EU purge (needs a per-row marker: schema and call-site change). No row can reach the cutoff before ~2031.
- `security-scan` fails on Rails 7.2.3.2 advisories on develop too; that needs its own bump.
