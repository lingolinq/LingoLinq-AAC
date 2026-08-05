# Anthropic HIPAA-Ready BAA + HIPAA Readiness - ACCEPTED

## Acceptance Details

**Date:** BAA executed and HIPAA readiness enabled on the org 2026-07-18
**BAA document version:** Anthropic Business Associate Agreement, 2026-05-06 revision
**Anthropic API Organization:** LingoLinq, LLC (the runtime-dedicated API org)
**Accepted / enabled by:** Scot Wahlquist (Anthropic Console)
**Status:** **ACTIVE** (HIPAA readiness enabled on the organization; verified live 2026-07-18)

## What This Covers

This is the **model-provider BAA for the direct Anthropic runtime AI egress path** (word
prediction, board generation, and evaluation-narrative drafting). It is distinct from, and does not
overlap with, the two infrastructure BAAs already on file:

- `AWS_BAA_ACCEPTED.md` - AWS infrastructure (S3, RDS, etc.)
- `GCP_BAA_ACCEPTED.md` - Google Cloud infrastructure (Cloud Run, Cloud SQL, Memorystore)

Under Anthropic's HIPAA-Ready offering, once a BAA is signed and HIPAA readiness is enabled on the
organization, PHI **may** be transmitted to Anthropic through the HIPAA-eligible API surface, subject
to the constraints below. A signed BAA is **necessary but not sufficient** for HIPAA compliance
(mirrors the AWS and GCP posture).

## Coverage Scope (verified against Anthropic's live docs 2026-07-18)

Source: Anthropic "API and data retention" docs, https://platform.claude.com/docs/en/manage-claude/api-and-data-retention,
plus the executed BAA and the "HIPAA-Ready Offering Implementation Guide" (2026-05-06 revision).

- **HIPAA readiness covers supported Claude API features** with a signed BAA and a HIPAA-enabled
  organization. It **does not require Zero Data Retention (ZDR).** The `/v1/messages` (Messages API)
  endpoint is listed HIPAA-eligible and is the endpoint all runtime AI seams use.
- **In-scope models:** Claude Haiku 4.5 and Claude Opus 4.7 (the current runtime inventory), and
  Claude Sonnet if added later. These are standard models, not mandatory-retention "Covered Models."
  Fable 5 / Mythos 5 are ZDR-excluded "Covered Models" and are **never** permitted on this runtime
  path (Tier 1) per CLAUDE.md.
- **HIPAA readiness is per-organization and irreversible.** Once enabled it cannot be turned off, and
  it blocks non-eligible features org-wide with an HTTP 400.
- **Not covered / must never carry PHI (return HTTP 400 under HIPAA mode without ZDR):** Files API,
  Batch API, Skills API, Code Execution, Computer Use, Web Fetch, and the MCP connector. All four
  runtime seams are plain single-turn `messages.create` calls and use none of these.
- **Claude Code, the Workbench, and the Console are not covered** under HIPAA readiness. They are dev
  tooling and are excluded from the runtime PHI path (Tier 2, no user data by construction).

## Evidence / Provenance

- **Executed agreement PDFs** (Privileged & Confidential; stored out-of-repo):
  Google Drive "Compliance Audits" folder, in the `500_Customer Success` shared drive, alongside the
  AWS and GCP BAA records:
  - "Anthropic - Business Associate Agreement (2026-05-06).pdf"
    (https://drive.google.com/file/d/1sL3di9GRP4hlids-baZDT26n3SKjzwD5/view)
  - "Anthropic - HIPAA-Ready Offering Implementation Guide (2026-05-06).pdf"
    (https://drive.google.com/file/d/1QQV-PrgsNtnQZtwa2BJ0bf1qrOG54Upr/view)
- **Live enablement verification (2026-07-18), performed against the runtime `ANTHROPIC_API_KEY`
  (op://LingoLinq Shared Dev/ANTHROPIC_API_KEY/credential), key value never logged:**
  - `POST /v1/messages` (Haiku 4.5) -> **HTTP 200** (eligible feature works, no ZDR required).
  - `GET /v1/files` (Files API, non-eligible) -> **HTTP 400**, error:
    "this endpoint is not available for HIPAA-regulated organizations without Zero Data Retention".
  - The 400 on a non-eligible feature is positive proof the runtime key is on a HIPAA-regulated
    organization and that org-wide HIPAA enforcement is active. This independently resolves the
    key-identity blocker raised in the 2026-07-18 eligible-services scope review.

## Runtime key / org boundary

- The runtime `ANTHROPIC_API_KEY` belongs to the **LingoLinq, LLC** Anthropic API org, which is
  dedicated to in-app runtime inference. It is provisioned separately from the dev-tooling Claude
  keys (e.g. `CLAUDE_FIX_API_KEY`, `CLAUDE_REVIEW_API_KEY`), which are **not** on this org.
- The same runtime key value is synced across every service that runs an AI seam (dev / staging /
  prod web, workers/Resque, and the scheduler) via the 1Password -> Render sync
  (`scripts/sync-render-env.js`) and mirrored to GCP Secret Manager. Because the codebase reads a
  single `ANTHROPIC_API_KEY`, a per-service mismatch would be invisible from code; the live 400
  probe above confirms the key currently deployed is the HIPAA-regulated org key.

## Runtime seam classification (all four seams are in-scope under the BAA)

Transport is HIPAA-compliant in code today (Messages API only, in-scope models, no excluded
features). All four runtime seams are ordinary in-scope uses or carry no PHI, so runtime AI can run
under the executed BAA:

- **Word prediction, board generation, offline dictionary** - ordinary in-scope uses or no PHI.
- **Evaluation narration (`lib/eval_narrator.rb`) - NOT a HIPAA "Healthcare Activity" (adjudicated by
  Scot Wahlquist, 2026-07-19).** The LingoLinq eval is an assistive-technology **access /
  feature-match assessment**: the AAC user completes find-the-target tasks at progressively smaller
  grid sizes, producing a hit/miss heat map that shows which areas of a board they can physically and
  visually access, which yields a recommended board size and layout. The AI narrative summarizes
  those access findings and the board-layout recommendation. It does **not** diagnose, treat, or
  produce medical charting / billing / coding / claims, so it is not one of Anthropic's enumerated
  Healthcare Activities and Anthropic Healthcare-Activity condition (iii) (restrict use to licensed
  clinicians) **does not apply.** There is therefore intentionally **no licensed-clinician gate** on
  this path. This corrects the conservative "Healthcare Activity" reading in the 2026-07-18
  eligible-services scope review, which pre-dated the domain classification.

**Controls that DO apply to eval narration and are enforced** (defense-in-depth on top of the BAA):
Messages-API-only transport on the HIPAA-Ready org key; PII scrub + structural student-name drop +
`etiology` (medical-cause) minimization before egress; the `EVAL_NARRATOR_MODEL` boot + call-time
allowlist pinning the model to in-scope Claude families and refusing Covered Models (both in the
security PR, eval-narrator runtime gates); the COPPA parental-consent gate; explicit per-request
opt-in; and the org-level AI opt-out. Eval narration also defaults to a deterministic no-egress local
template unless the caller explicitly opts in.

**Residual item (tracked, not a blocker):** free-typed third-party names in `slp_notes` are not
NER-scrubbed (`lib/eval_narrator.rb`); the structural student-name drop handles the primary subject.
Add NER redaction or a structured-notes affordance as a follow-up.

The classification is recorded at the call site (`lib/eval_narrator.rb` module header) and in the
audit register (`audit-reports/FINDINGS.json`, ruleKey `eval-narration-healthcare-activity-classification`,
disposition set by Scot) so the quarterly audit does not re-flag the absent licensed-clinician gate.
If eval narration is ever repositioned as diagnosis, treatment, or auto-finalized clinical
documentation, this classification must be reopened with Scot before PHI flows under that use.

## Supersedes

This record supersedes the prior "no model-provider BAA / provisional pending CEO review" posture for
the Anthropic runtime egress path. The following were reconciled in the same PR:

- `COMPLIANCE.md` (Anthropic subprocessor row) - "No model-provider BAA (open item)" updated to the
  executed BAA.
- `docs/legal/SUBPROCESSORS.md` row 4 - contract basis updated from Commercial-Terms DPA to the
  executed HIPAA-Ready BAA.
- `docs/legal/GCP_BAA_ACCEPTED.md` scope-boundary note - the statement that the Anthropic path "has
  no BAA" narrowed to "is covered by Anthropic's own BAA, not the GCP infrastructure BAA".
- `docs/legal/AI_GOVERNANCE_MEMO.md` - provisional-posture section updated.

The GCP and AWS records' statements that **their** BAAs do not extend to the Anthropic egress path
remain correct: each infrastructure BAA covers only its own provider. Anthropic's egress path is now
covered by Anthropic's own BAA recorded here.

## Account Coverage

This BAA and HIPAA readiness apply to the **LingoLinq, LLC** Anthropic API organization only. Any
other Anthropic org that processes PHI requires its own BAA and HIPAA-readiness enablement. Because
readiness is irreversible, this org must remain runtime-dedicated (no dev/tooling keys added to it).

---

**Status:** BAA executed, HIPAA readiness enabled and verified live. Transport compliant in code; all
four runtime seams are in-scope under the BAA. Eval narration is classified as an assistive-technology
access assessment, not a Healthcare Activity (Scot 2026-07-19), so no licensed-clinician gate applies;
the model allowlist + etiology minimization ship in the eval-narrator runtime-gates security PR. See
`COMPLIANCE.md` section 4, `docs/legal/SUBPROCESSORS.md` row 4, and the 2026-07-18 eligible-services
scope review (superseded on the eval-narration classification by this record) for how this is
reflected in the posture.

## Runtime routing update - 2026-07-24 (re-attested 2026-07-24)

Runtime AI routing moved from the direct `api.anthropic.com` endpoint to **Claude on AWS Bedrock**
(constructed in `lib/ai_client.rb`). **Plane corrected 2026-08-04:** this previously read "the
Bedrock Mantle Messages API". The default and only usable plane is classic `bedrock-runtime`; the
account is not entitled to mantle (403 on every model, request open with AWS). All four seams above (word
prediction, prediction seeding, board generation, eval narration) are coded to route through Bedrock
on the same in-scope models (Haiku 4.5, Opus 4.7).

**Corrected 2026-08-01, re-corrected 2026-08-04:** this section previously described the move as
completed egress, and was then over-corrected to say the Bedrock path had never been operational in
production. The accurate statement is a closed window: the routing change shipped, the Bedrock path
was operational only from 2026-08-03T08:23Z to 2026-08-04T06:31Z (revision `00013-76w`), carrying a
single internal verification call with no user or student data, and is **not operational as of
2026-08-04**. See the correction bullet below and the 2026-08-04 operational-status correction in
`docs/legal/AWS_BAA_ACCEPTED.md`.

- **This executed Anthropic HIPAA-Ready BAA remains valid and on file.** It is no longer the *active
  runtime route*; it documents a still-available, BAA-covered direct path. Runtime seams no longer
  read `ANTHROPIC_API_KEY` or construct a direct Anthropic client (enforced by
  `scripts/ai-endpoint-guard.sh` in CI).
- **The designated runtime route is covered by the AWS account BAA** (`docs/legal/AWS_BAA_ACCEPTED.md`):
  Amazon Bedrock is a HIPAA-eligible AWS service **excluding Fable/Mythos models**, so
  Anthropic-model inference on Bedrock stays inside AWS's HIPAA boundary. The runtime models (Haiku
  4.5, Opus 4.7) are on the eligible side of that exclusion. Operative condition: Bedrock calls must
  run under the BAA'd AWS account (2390-4478-5114). **That condition was UNVERIFIED from 2026-07-27
  through the 2026-08-01 evidence gather, and the 2026-07-27 statement that it had been verified is
  retracted** and stays retracted: no `lingolinq-web` revision from `00001-2vn` through `00012-x8z`
  carried a Bedrock credential, so `AiClient.configured?` was false and no Bedrock call could be
  made. **Verified 2026-08-04** during the `00013-76w` window (`sts:GetCallerIdentity` returned
  239044785114, principal `user/lingolinq-bedrock-runtime`); credentials were withdrawn on
  `00014-5rw`, so the condition is again unverifiable and must be re-verified on any future mount.
- The adjudicated seam classifications above (including eval narration not being a HIPAA Healthcare
  Activity, Scot 2026-07-19) are unchanged by this routing move.
- Statements above that name the direct `/v1/messages` endpoint or `ANTHROPIC_API_KEY` as the
  endpoint/credential "all runtime AI seams use" are superseded by this section for runtime routing.

**Attestation:** Re-attested 2026-07-24 by Scot Wahlquist, CEO (Bedrock runtime routing). Prose
corrected 2026-07-27 to remove a contradictory "re-attestation owed" banner left in the bytes that
attestation covered.

Corrected 2026-08-01 by Claude Code to remove the stale "active runtime route" framing and the
retracted operative-condition verification, and re-corrected 2026-08-04 to bound the over-corrected
"never operational" language. Those corrections are not attestations; only Scot attests.

**Re-attested 2026-08-04 by Scot Wahlquist, CEO.** The earlier "re-attestation pending" state is
discharged. See `docs/legal/AWS_BAA_ACCEPTED.md` for the evidence and the operational window.
