# LingoLinq Capability Ledger

> **PROVISIONAL -- NON-CANONICAL (Phase A).** Generated 2026-07-12, verified against `staging`.
> This is the code-cited, present-tense record of what the product actually does today, so
> compliance docs ground claims against verified capabilities instead of re-deriving them.
> **Not yet authoritative:** it becomes canonical only when Phase B (`scripts/capability-check.rb`)
> enforces `currentEvidence` resolution **at HEAD** and `negativeEvidence` grep scoping in CI. Until
> then, do not treat rows as attested and do not mirror this file into any external tool (e.g. Codex
> `AGENTS.md`). Source of truth is `audit-reports/CAPABILITY-LEDGER.json`; this render is
> hand-maintained until the Phase B renderer lands.
>
> Evidence semantics: `built`/`partial` rows carry `currentEvidence` (must resolve at HEAD, not a
> pinned SHA -- this is the key difference from the findings register). `deliberately-not-done` rows
> carry scoped `negativeEvidence` (grep scopes + expected zero matches). See the JSON for full fields.

## Built (11)

| Capability | Evidence (HEAD) | Anti-claim it kills |
|---|---|---|
| Password authentication (hashed) | `app/models/user.rb:98` | passwordless / device-JWT-only |
| Server-side at-rest encryption | `app/models/concerns/secure_serialize.rb:1` | E2EE / zero-readable-keys |
| PiiScrubber pseudonymization before AI egress | `lib/pii_scrubber.rb:215` | de-identified / anonymized |
| COPPA under-13 AI hard-gate | `lib/ai_board_generator.rb:40` | (also note: not an EU under-16 gate) |
| Jurisdiction primitive (EU vs non-EU) | `app/models/lingo_linq/jurisdiction.rb:1` | gates only the Art. 50(1) modal, nothing else yet |
| EU AI Act Art. 50(2) output marking | `lib/art50_marker.rb:37` | confusing it with the Art. 50(1) modal |
| Hard-delete on request | `lib/flusher.rb:401` | automatic time-based wipe (there is none) |
| AiApiLog audit trail + IP redaction | `app/models/ai_api_log.rb:30` | log anonymization (it's pseudonymization) |
| AI board-gen + word-prediction (Claude + Gemini) | `lib/ai_word_predictor.rb:37` | ZDR guarantee |
| Message banking retains user's OWN voice | `app/models/button_sound.rb:11` | voiceprint / speaker-ID |
| AWS S3 BAA (storage) | `docs/legal/AWS_BAA_ACCEPTED.md` (attestation) | model-provider BAA (that's separate) |

## Partial (1)

| Capability | Evidence (HEAD) | Note |
|---|---|---|
| TOTP 2FA (ROTP) | `app/models/concerns/passwords.rb:95` | exists but **optional**; admin/staff mandatory 2FA is an open item |

## Planned (2)

| Capability | Anchor | Status |
|---|---|---|
| EU AI Act Art. 50(1) user disclosure modal | `lib/lingo_linq/ai_consent_disclosures.rb:5` | content merged (Phase 2); modal (Phase 3) + consent gate (Phase 4) not built. EU clock 2026-08-02 |
| Under-16 (EU GDPR Art. 8) block on AI path | `lib/ai_board_generator.rb:40` | AI path still gates on under-13 only; gap-check pending |

## Deliberately not done (5) -- out-of-scope by design

| Capability | Negative-evidence scope | Expected |
|---|---|---|
| End-to-end encryption | `app/**`,`lib/**` for `end_to_end`/`e2ee`/`zero_knowledge` | 0 matches |
| ZDR contractual guarantee | `app/**`,`lib/**` for `zero_data_retention`/`zdr` | 0 matches |
| Voiceprints / speaker-ID / voice-cloning | `app/**`,`lib/**` for `voiceprint`/`speaker_id`/`voice_clone` | 0 matches |
| Diagnosis / disability / IEP / 504 fields | `db/schema.rb` for `disabilit`/`diagnos`/`iep`/`504`/`impair` | 0 matches |
| Model-provider (Anthropic/Google) BAA | `docs/legal/**` for an executed model-provider BAA | 0 matches (HIPAA on AI path provisional) |

---

*Framing note: "deliberately not done" means out-of-scope by design, never a known gap shipped without. These rows exist to stop over-claims, mirroring the "Deliberately not claimed" section of `COMPLIANCE_PROGRAM_OVERVIEW.md`.*
