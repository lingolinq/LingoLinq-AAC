# 2026-10-01 to 2026-10-03: Consent rationale drafts aligned with the privacy policy (#909)

Branches: `compliance/scot-consent-docs-school-auth-63d95115` (PR #1092) and
`compliance/scot-consent-docs-followups-63d95115` (PR #1093), both merged to develop.
This log was written after the work, on 2026-10-03.

## Goal

Bring the unattested consent rationale draft (`docs/legal/2026-08-25_ai-data-sharing-consent.md`)
and AI data-flow classification draft (`docs/legal/2026-08-25_ai-data-flow-classification.md`) in
line with the privacy policy wording merged in #909, without touching the attested
`docs/legal/AI_DATA_SHARING_CONSENT.md`. Wording that changed meaning was approved by Scot before
each commit. Nothing was attested.

## Shipped

| PR | What |
|---|---|
| #1092 | Sections 1, 3, 5, 6 and 9 of the consent draft follow #909; section 5 retention sentence matches section 2.1 (Bedrock route); classification bucket row and corrections row; `privacy_special_ai_consent_intro` / `_outro` pinned to the English fallback in every non-English locale (red-first spec, falsified with an injected translation); `word_data.rb` line references in the multilingual schema doc re-pointed. |
| #1093 | Counsel-review timing made consistent; classification "no changes" line scoped to its own revision; Regulated PII rows use #909's COPPA scope; section 6 states which position applies until #909 reaches production, and records the team and supervisor model Scot set on 2026-10-02; schema doc line references re-verified. |

## Review

Each PR had a dual review (senior-dev and adversary passes) with an apply-check after every round
of fixes. #1092 took three rounds; the first round's top finding was policy written as present-tense
product behaviour. Both lessons are in `learnings-archive/2026-10.md`.

## Open

The follow-ups listed in #1093's PR body (effective dates per part of section 6, revision labels,
whether turning AI features on requires the applicable authorization, two pointer fixes, one
punctuation fix), a privacy-wording update after #1087, a counsel-memo question on AI under district
authorization, and Scot's attestation via `/re-attest-record`.
