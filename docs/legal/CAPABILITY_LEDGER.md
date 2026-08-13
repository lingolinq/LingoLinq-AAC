# LingoLinq Capability Ledger

> Generated from `audit-reports/CAPABILITY-LEDGER.json` by `scripts/capability-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.
>
> **Status: canonical.** `built`/`partial` rows' `currentEvidence` is
> validated to resolve at HEAD, and `deliberately-not-done` rows' `negativeEvidence` is
> enforced, by `scripts/capability-check.rb --check` in CI (audit-artifacts-integrity). A
> capability is a present-tense claim: if the backing code is removed, the check goes red.
> Verified against `staging`; generated 2026-07-12.

## Built (14)

| Capability | Evidence (HEAD) | Anti-claim / note |
|---|---|---|
| Password authentication (bcrypt-hashed, via the passwords concern / GoSecure) | `app/models/user.rb:98` | NOT passwordless / device-JWT-only. |
| Server-side at-rest encryption of sensitive fields (secure_serialize / SECURE_ENCRYPTION_KEY) | `app/models/concerns/secure_serialize.rb:1` | NOT end-to-end encryption; LingoLinq holds the keys. Do not claim 'zero readable keys' or E2EE. |
| PiiScrubber pseudonymizes (scrubs direct identifiers from) payloads before AI egress | `lib/pii_scrubber.rb:215` | NOT de-identified or anonymized. Pseudonymized data is still personal data; does not meet HIPAA Safe Harbor. |
| COPPA hard-gate blocks AI generation for under-13 users awaiting parental consent | `lib/ai_board_generator.rb:44` | This is an under-13 (COPPA) gate; it does NOT itself enforce an EU under-16 (GDPR Art. 8) block on the AI path (see cap eu-under16-ai-block). |
| Jurisdiction detection primitive (EU vs non-EU) exists | `app/models/lingo_linq/jurisdiction.rb:58` | The EU jurisdiction primitive gates the Art. 50(1) disclosure modal (built and staged, gated OFF behind the article_50_disclosure flag; see cap art50-1-disclosure-modal) and, via the Phase 4 call-context helper, stamps jurisdiction on AiApiLog rows; it does not by itself drive an under-16 AI block. |
| Full hard-delete of a user on request (flush_user_completely) | `lib/flusher.rb:401` | There is no automatic time-based wipe (no 48h/180d purge); deletion is on request / policy-driven. |
| AiApiLog audit trail with scrubbed summary columns / IP redaction | `app/models/ai_api_log.rb:30` | Redaction is pseudonymization of the log record, not anonymization. |
| AI board generation + word prediction via Anthropic Claude on AWS Bedrock (Anthropic-only runtime) | `lib/ai_word_predictor.rb:333` | The prior Google Gemini fallback was DISABLED 2026-07-09 (Gemini Developer/AI-Studio endpoint data-handling terms inadequate for child data); there is no runtime Gemini path today. Runtime AI egresses to Claude on AWS Bedrock (the Bedrock Mantle Messages API via lib/ai_client.rb), not the direct api.anthropic.com endpoint; enforced in CI by scripts/ai-endpoint-guard.sh. Only pseudonymized data is sent (see cap pii-scrubber-pseudonymization). |
| Message banking retains the user's OWN voice recordings for playback | `app/models/button_sound.rb:11` | These are the user's own communication recordings, NOT voiceprints/speaker-ID/biometrics (see cap no-voiceprints). |
| Signed AWS Business Associate Agreement (HIPAA-eligible AWS services in use) | `docs/legal/AWS_BAA_ACCEPTED.md:65` | The AWS BAA does NOT cover a direct third-party model endpoint outside AWS (e.g. api.anthropic.com). That direct path is unused at runtime today; when used it is covered by the Anthropic HIPAA-Ready BAA (see cap anthropic-model-provider-baa). Fable/Mythos models are excluded from Bedrock HIPAA eligibility. |
| EU AI Act Article 50(1) user-facing AI-interaction disclosure modal | `app/frontend/app/components/ai-disclosure.js:8` | Built and staged, but gated OFF: the `article_50_disclosure` frontend flag is registered in AVAILABLE_FRONTEND_FEATURES only (not enabled for any user), so the modal is shown to no one yet. Do not claim a LIVE or enabled Art. 50(1) disclosure in production. Enabling the flag is the 2026-08-02 release gate, on Scot's sign-off, after the production deploy. |
| Jurisdiction-aware under-16 (EU GDPR Art. 8) block on the AI generation path | `lib/feature_flags.rb:267` | This gate is NOT the same as signup COPPA (settings['coppa']) or second-tier AI data-sharing VPC (settings['ai_consent'] / government-ID). It only covers EU under-16 AI enablement. |
| Zero-data-retention (ZDR) confirmed for the two active Anthropic models | `docs/legal/AI_DATA_SHARING_CONSENT.md:50` | ZDR is confirmed ONLY for these two specific models; it does NOT extend to any other/future Anthropic model outside the ZDR-eligible tier, and NOT to any non-Anthropic provider. ZDR is NOT a substitute for a HIPAA BAA (see cap anthropic-model-provider-baa for the executed Anthropic BAA and cap aws-s3-baa for Bedrock under the AWS BAA). Fable 5 / Mythos-class models are explicitly NOT ZDR-eligible and never receive identifiable payloads. |
| Signed BAA covering the AI model-provider (Anthropic) egress path | `docs/legal/ANTHROPIC_BAA_ACCEPTED.md:144` | Google (Gemini) as a model provider still has no BAA; its runtime fallback remains disabled (2026-07-09). The Anthropic BAA is the still-available direct-path basis, not the active Bedrock route. |

## Partial (2)

| Capability | Evidence (HEAD) | Anti-claim / note |
|---|---|---|
| TOTP two-factor authentication (ROTP), currently OPTIONAL | `app/models/concerns/passwords.rb:95` | NOT mandatory; do not claim enforced MFA for all users or admins. |
| EU AI Act Article 50(2) machine-readable output marking -- board-generation slice only | `lib/ai_board_generator.rb:148` | The Art. 50(2) obligation is NOT closed: this slice marks board generation ONLY. Other AI-output surfaces (generate_focus_words, AiWordPredictor.predict, eval narration, AiPredictionGenerator) are not yet marked, and durable persistence of the marker (board.settings + relinking copy_for) is follow-up. Also distinct from the Art. 50(1) disclosure modal (see cap art50-1-disclosure-modal). |

## Deliberately not done -- out-of-scope by design (3)

| Capability | Negative-evidence scope | Expected |
|---|---|---|
| End-to-end encryption / zero-readable-keys | app/**/*.rb, lib/**/*.rb for end_to_end/e2ee/zero_knowledge/client_side_encrypt | 0 matches |
| Voiceprints / speaker-identification / voice-cloning of training audio | app/**/*.rb, lib/**/*.rb for voiceprint/speaker_id/speaker_recognition/voice_clone | 0 matches |
| Diagnosis / disability / IEP / 504 / medical-condition data fields | db/schema.rb for disabilit/diagnos/\biep\b/\b504\b/impair/medical_condition | 0 matches |

---

*Framing: "deliberately not done" means out-of-scope by design, never a known gap shipped without. These rows exist to stop over-claims, mirroring the "Deliberately not claimed" section of `COMPLIANCE_PROGRAM_OVERVIEW.md`.*
