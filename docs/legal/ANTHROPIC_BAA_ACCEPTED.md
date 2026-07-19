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

## Open Conditions Before PHI Flows (from the 2026-07-18 eligible-services scope review)

Transport is HIPAA-compliant in code today (Messages API only, in-scope models, no excluded
features), and three of the four seams (word prediction, board generation, offline dictionary) are
ordinary in-scope uses or carry no PHI. The **evaluation-narration** seam (`lib/eval_narrator.rb`) is
a permissible "Healthcare Activity" (charting/documentation support) but triggers Anthropic's three
mandatory conditions. **PHI must not flow through eval narration until these are met:**

1. **Licensed-clinician gating (BLOCKER).** The narrate endpoint currently gates on
   `allowed?(user,'supervise')` (`eval_sessions_controller.rb:60`) plus the `comprehensive_eval_ai`
   flag - neither establishes SLP/clinician licensure. A verified-clinician gate (or a contractual
   attestation that all `comprehensive_eval_ai` users are licensed) is required. Tracked as a
   separate security PR (eval-narrator runtime gates).
2. **Model allowlist (WARNING).** `EVAL_NARRATOR_MODEL` is env-overridable with no boot-time
   allowlist; pin it to {Haiku, Sonnet, Opus} and refuse Fable/Mythos. Same security PR.
3. **`slp_notes` free-text NER (WARNING).** Third-party names free-typed into `slp_notes` egress
   unscrubbed; add NER redaction or a structured-notes affordance.
4. **Accuracy-testing (condition i) and legal-compliance (condition ii) artifacts** for the
   eval-narration use case do not yet exist; produce and store both under `docs/legal/`.

Until condition 1 lands, eval narration for PHI orgs stays on the deterministic no-egress local
template (`draft_via_template`), which is the current default.

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

**Status:** BAA executed, HIPAA readiness enabled and verified live. Transport compliant in code.
PHI-flow gate open on the eval-narration licensed-clinician condition (separate security PR). See
`COMPLIANCE.md` section 4, `docs/legal/SUBPROCESSORS.md` row 4, and the 2026-07-18 eligible-services
scope review for how this is reflected in the posture.
