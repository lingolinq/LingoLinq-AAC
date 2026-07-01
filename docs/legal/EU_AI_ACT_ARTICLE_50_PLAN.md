# EU AI Act Article 50 Transparency: Implementation Milestone Plan

**Status:** DRAFT for review (supersedes the `~/ai-company-brain/ready-to-deploy/` DeepSeek scaffold, which is not runnable; see "Why the prior package was rejected").
**Owner:** Scot Wahlquist
**Created:** 2026-06-20
**Regulatory deadline:** Article 50 applies **2026-08-02**. Machine-readable marking (Art. 50(2)) has a grace period to **2026-12-02** for systems already on market (AI Omnibus, May 2026).
**Penalty tier:** up to EUR 15M or 3% of global turnover (Art. 99(4)(g)).

---

## 1. What Article 50 actually requires (verified 2026-06-20)

Article 50 imposes **transparency**, not consent-to-share-data (that is the separate COPPA AI VPC milestone). Four obligations exist; two apply to LingoLinq:

1. **Interactive-AI disclosure (50(1))**: inform users when they interact directly with an AI system. Borderline applicable (board generation is a discrete feature, not a chatbot), but cheap to satisfy with the disclosure modal.
2. **AI-generated-content marking (50(2))**: output of AI systems that generate synthetic text/image/audio/video must be (a) marked in a **machine-readable** format and (b) **detectable as AI-generated**. Applies: `AiBoardGenerator.generate_words` produces synthetic text (board word lists, names, descriptions).
3. Emotion-recognition / biometric (50(3)): N/A (LingoLinq does not run these).
4. Deepfake disclosure (50(4)): N/A (no image/audio/video synthesis).

Supporting guidance now in force:
- Commission **draft transparency guidelines** (2026-05-08).
- **Code of Practice on Transparency of AI-Generated Content** (2026-06-10), voluntary, describes acceptable marking/labelling workflows. We will align the marking approach to it.

Sources: artificialintelligenceact.eu/article/50, artificialintelligenceact.eu/article/2 (scope / extraterritoriality), digital-strategy.ec.europa.eu Code of Practice (2026-06-10), globalpolicywatch.com 10-takeaways (2026-05).

**Scope decision (revised after adversary review, 2026-06-21): two obligations, two different gates.**
Art. 50(2) machine-readable **marking is a property of the AI OUTPUT** and binds LingoLinq as **provider** whenever that output is used in the Union (Art. 2(1)(c) extraterritorial trigger). A US-session board can be shared into an EU classroom. Therefore **marking is applied to ALL AI-generated content unconditionally**, not gated by detected user jurisdiction. Marking is invisible and carries no UX cost, so universal application is both legally safe and disruption-free.
The Art. 50(1) **visible disclosure modal is the only EU-gated surface**, because it is the only piece with a UX cost for AAC users. Jurisdiction detection **fails safe**: `UNKNOWN` is treated as in-scope (disclose), never out-of-scope.

---

## 2. Why the prior package was rejected (DeepSeek `ready-to-deploy/`)

Recorded so the same mistakes are not reintroduced. Verified against the codebase at branch `staging`:

| # | Defect | Evidence |
|---|--------|----------|
| 1 | Three-way data-location contradiction: migration adds `boards.ai_metadata` column, model patch writes `board.settings['ai_metadata']`, audit reads the column. Data written is never read. | schema has `t.text "settings"`, no `ai_metadata`; `board_article50_patch.rb:27` vs `article_50_compliance_audit.rb:45` |
| 2 | Audit script crashes on first run: `puts "-" * ow80` (undefined var); divide-by-zero at 0 AI boards. | `article_50_compliance_audit.rb:24,197` |
| 3 | Broken module wiring: patch is an `ActiveSupport::Concern` with `class_methods`, README says `extend` it; `extend` does not install a Concern's class methods. | `ai_board_generator_article50_patch.rb`; real `lib/ai_board_generator.rb` is `module ... class << self` |
| 4 | ~~Wrong call signature raises ArgumentError~~ **CORRECTED after adversary review: this was NOT a real defect.** In Ruby 3.x, `foo(**hash)` against `def foo(params = {})` collapses kwargs into the positional hash and does not raise; the real code already calls `log_ai_call(provider:, model:, ...)` this exact way in production. Row struck for table credibility. | verified `ai_board_generator.rb:663`, `ai_word_predictor.rb:244` call it identically |
| 5 | Misses the real entrypoint entirely: never touches `boards_controller#581` then `generate_words`. Nothing ever sets `article_50_disclosure_shown = true`. | `app/controllers/api/boards_controller.rb:581` |
| 6 | Phantom `user_consents` table referenced by monitoring; no migration creates it. | `monitoring/article50_monitoring.yml:147` |
| 7 | No frontend, no i18n, no feature flag, no specs (all hard requirements). Deployment checklist is wrong platform (systemd / `rails test` / main-branch; LingoLinq is Render / RSpec / staging-first). | package contents; CLAUDE.md hard rules |
| 8 | No machine-readable marking (Art. 50(2)) at all, the legally load-bearing half. | package contents |

**Salvageable intent:** the three migrations' shape (jurisdiction + disclosure/consent fields on `ai_api_logs`, an `ai_content_reviews` table), the 5-year EU retention idea, and the monitoring YAML as a non-authoritative spec.

---

## 3. Architecture: reuse the AI Data-Sharing VPC infrastructure

Per Scot's decision, Article 50 is a **distinct milestone** built **on top of** the in-flight "LingoLinq AI Data-Sharing VPC" GSD milestone. It does not duplicate the disclosure/consent/call-site/audit plumbing.

Reused VPC primitives (real symbols):

| VPC primitive | Source | Article 50 reuse |
|---|---|---|
| `settings['ai_consent']` storage pattern + versioned record_id | `User#grant_ai_consent!` (Phase 1, shipped) | Store Art. 50 disclosure-shown state under `settings['ai_transparency']` using the identical idempotent/versioned pattern. Do NOT invent a new column. |
| `AiConsentDisclosures::CURRENT_VERSION` versioned, i18n disclosure module | VPC Phase 2 (pending) | Add an Article 50 transparency disclosure as a sibling versioned disclosure in the same module. |
| Ember disclosure modal + tokenized flow | VPC Phase 3 (pending) | Reuse the modal shell; Art. 50 variant is EU-gated and informational (acknowledge, not parental token). |
| Shared call-context helper + `AiApiLog.log_ai_call` join at every AI site | VPC Phase 4 (pending) | Extend the SAME helper to stamp `jurisdiction`, `article_50_disclosure_shown`, and the AI marker. Both `ai_board_generator.rb` and `ai_word_predictor.rb` already have per-site `log_ai_call` wrappers to extend. |
| `AuditEvent.log_command` + `GoSecure.nonce` audit pattern | Phase 1 | Same audit trail mechanism for disclosure/review events. 5-year EU retention. |

**Hard dependency:** Article 50 disclosure-modal and call-site marking phases (P3, P4 below) depend on **VPC Phase 4** landing the shared call-context helper. The backend-data and jurisdiction phases (P1, P2) are **independent** and can land now.

---

## 4. Phase breakdown (this milestone)

Phases are numbered Art50-Px to distinguish from VPC phases.

### Art50-P1: Audit-trail data layer (independent, can start now)
- Migration: add to `ai_api_logs`: `jurisdiction` (string, 10), `article_50_disclosure_shown` (bool, default false), `ai_content_marked` (bool, default false), `ai_generated_content_id` (string). Add indexes incl. partial `where jurisdiction = 'EU'`.
- Migration: create `ai_content_reviews` (user ref, content_type/content_id strings via global_id, reason, status, jurisdiction, reviewer ref, timestamps). Single canonical home for the human-review workflow.
- No new `boards` column. AI board metadata lives in `boards.settings['ai_metadata']` (one place).
- RSpec for both migrations + model validations.
- **No production backfill** (mirror VPC D-03 no-op: absent = "not marked / unknown jurisdiction").

### Art50-P2: Jurisdiction detection -- FAIL-SAFE (independent, can start now)
- `LingoLinq::Jurisdiction.eu?(user)` resolves EU membership for the **disclosure modal only** (NOT for marking, which is unconditional).
- **Resolution, EU-inclusive + fail-safe:** consider both the org/DPA record and the explicit user setting. If **either** indicates EU, resolve EU (a personal user pref can never override an EU org to suppress a district-level obligation; a user may voluntarily ADD EU). Resolve non-EU only when every authoritative signal is a **recognized** non-EU code. Locale is an additive hint that can ADD EU, never REMOVE it. Everything else (mixed, unrecognized, garbage, no signal) resolves to **`UNKNOWN` -> in-scope (disclose).** Under-disclosure is the violating direction, so ambiguity defaults to showing the disclosure.
- Correct the DeepSeek bug: UK and other non-EU locales must NOT map to `EU` (post-Brexit). EU = current 27 member states. But locale is never the sole basis for EXCLUDING someone.
- RSpec must include: `en`-locale + EU-org resolves to EU; `UNKNOWN` resolves to disclose; a French-locale + US-org does not get wrongly forced out of EU by org alone if a stronger EU signal exists.

### Art50-P3: Unconditional marking + disclosure stamping at the call sites (marking independent of jurisdiction; helper depends on VPC Phase 4)
- **Marking (Art. 50(2)) is applied to ALL AI-generated board content unconditionally**, regardless of detected jurisdiction. It is an output property with no UX cost. Do not gate it on `eu?`.
- **Two-layer marking** per the 2026-06-10 Code of Practice (committed now, not deferred): (1) a `settings['ai_metadata']` provenance block (generator, model, timestamp, content-id, compliance version) AND (2) a content-embedded, machine-readable marker on the generated output. Must be **effective, interoperable, robust, detectable**, not a UI badge alone.
- Stamp `jurisdiction` and `article_50_disclosure_shown` into the `AiApiLog` row via the **VPC Phase 4 shared call-context helper** (extend it, do NOT fork a parallel wrapper -- see collision note in Sequencing). Applies at both `generate_words` (board gen) and `ai_word_predictor` (word prediction).
- **BoardCloner marker propagation (mandatory):** `app/cloners/board_cloner.rb` initializes copies with `settings: {}` and allowlists carried fields (`:11`, `:61-115`); `ai_metadata` is NOT in the allowlist today, so copies silently lose the marker. Add `ai_metadata` to the BoardCloner allowlist so a copy of AI content stays marked (a copy of synthetic text is still synthetic text). Also confirm the copy-by-reference path (`BoardContent::OFFLOADABLE_ATTRIBUTES`, `app/models/board_content.rb:23`) preserves it. RSpec: copy a marked board, assert the copy is still marked; assert a hand-built board does not inherit a marker.

### Art50-P4: Frontend disclosure modal + persistent badge -- ACCESSIBLE (depends on VPC Phase 3 modal)
- EU-gated disclosure modal before first AI generation (reuse VPC Phase 3 modal shell). Informational acknowledgement; records `article_50_disclosure_shown`. EU-gating uses `Jurisdiction.eu?` (fail-safe).
- **Modal accessibility (mandatory, routed through `accessibility-auditor` before merge):** keyboard-operable, correct ARIA role + screen-reader announcement, **dismissible via scanning / switch / eye-gaze access methods**, focus managed (no trap that an AAC access method cannot escape), and **must not interfere with auto-speak / mid-session communication**. An inaccessible compliance modal is itself a regression for the population this product serves.
- Persistent "AI-generated" badge on boards whose `settings['ai_metadata'].generated == true` (reuse existing `nb-ai-mode-badge` styling if present).
- Human-review request entry point writing to `ai_content_reviews`.
- **All strings i18n** (`{{t}}` / `i18n.t`), double-quoted user-facing. en + es minimum (match VPC).

### Art50-P5: Feature flag (split), retention, monitoring, audit close
- **Split flag, fail-safe:** the **marking** path (Art. 50(2)) is NOT flag-gated (or defaults ON) so an un-toggled flag can never produce unmarked output. **Only the visible modal** (Art. 50(1) UX) rides a disruption-sensitive flag `article_50_disclosure_modal` in `AVAILABLE_FRONTEND_FEATURES`. The 2026-08-02 enable of the modal is a **hard release gate**, not "verify on staging when convenient."
- 5-year EU retention for `ai_api_logs` where `jurisdiction = 'EU'` (extend `DATA_RETENTION.md` + the existing retention cron, not a new system).
- Compliance audit rake task (a correct rewrite of the DeepSeek script: reads `boards.settings['ai_metadata']`, no `ow80`, guards divide-by-zero; also audits COPIED boards for marker presence).
- Close the Article 50 finding in `audit-reports/FINDINGS.json` per the register-edit-regenerate-artifacts process (citation-check + render + notion-publish).

---

## 5. Cross-cutting requirements (LingoLinq hard rules)

- **Feature flag** required (Art50-P5): no user-facing change without it.
- **i18n** for every user-facing string (Art50-P4).
- **PiiScrubber** unchanged: Art. 50 adds no new outbound data; marking is local.
- **Branch** `scot/compliance/eu-ai-act-article-50` off `staging`; PRs target `staging`.
- **RSpec** coverage per phase (note: `ember test` does not run unit specs behaviorally; frontend logic verified via QUnit where loadable plus manual EU-account walkthrough).
- **No em dashes** in user-facing disclosure copy.

## 6. Acceptance criteria (milestone)

- **All** AI-generated board content carries the two-layer machine-readable marker, regardless of jurisdiction (`ai_content_marked=true` on every AI call). Marking is never suppressed by a flag or by jurisdiction detection.
- **Copied** AI boards remain marked (BoardCloner propagates `ai_metadata`); a copy of a marked board asserts marked in RSpec.
- EU-detected users additionally see the disclosure modal; `ai_api_logs` rows have `jurisdiction='EU'`, `article_50_disclosure_shown=true`. `UNKNOWN` jurisdiction also shows the modal (fail-safe). RSpec: `en`-locale + EU-org resolves to EU.
- The disclosure modal passes accessibility-auditor (keyboard/ARIA/scan/switch/gaze dismiss, no auto-speak interference).
- Non-EU detected users: no modal, no regression in AI generation latency or quality. Their output is still marked.
- A human-review request creates an `ai_content_reviews` row and an `AuditEvent`.
- Compliance audit rake passes (audits originals AND copies); Article 50 finding closed with citation-check green.
- 5-year retention applied to EU audit logs.

## 6a. Adversary review (2026-06-21): Block lifted, conditions folded in

The adversary returned a **Block** (2 Critical, 2 High, 2 Medium, 1 Low). All conditions are now reflected above:

| Finding | Severity | Resolution in this plan |
|---|---|---|
| Marking gated to EU sessions = unmarked EU-used outputs | Critical | Sec 1 + Art50-P3: marking is now unconditional (output property, Art. 2(1)(c) extraterritorial) |
| Locale-based jurisdiction fails open to under-disclosure | Critical | Art50-P2: org-driven, locale additive-only, `UNKNOWN` = disclose |
| BoardCloner strips `ai_metadata` on copy | High | Art50-P3: add to BoardCloner allowlist + copy-marked RSpec |
| Feature flag fails closed to non-compliance | High | Art50-P5: split flag; marking not flag-gated; modal flag is a hard release gate |
| Rejection table row #4 overstated | Medium | Sec 2: row #4 struck/corrected |
| Two-layer marking + modal a11y not committed | Medium | Art50-P3 (two-layer committed) + Art50-P4 (a11y criteria) |
| STATE.md says VPC P1 un-pushed (actually merged) | Low | Dependency confirmed real; collision guard added to Sec 7; STATE.md note is stale scratch |

## 7. Sequencing recommendation

1. **Now (unblocked):** Art50-P1 plus Art50-P2 (data layer plus jurisdiction detection). No VPC dependency.
2. **Unblocker:** prioritize **VPC Phase 4** (shared call-context helper); it is the critical path for both milestones. **Collision guard:** both milestones intend to extend the SAME per-site `log_ai_call` wrappers and the `with_lock` consent path around `generate_words`. Art50-P3 must **extend the merged VPC Phase 4 helper, not fork a parallel wrapper**, or the two milestones will edit the AI call path in conflict.
3. **After VPC P3/P4:** Art50-P3, P4, P5.

Marking (Art. 50(2)) has until 2026-12-02; visible disclosure (50(1)) should target 2026-08-02. Art50-P1/P2/P4 land the 08-02 surface; P3 marking can follow before 12-02.

---

## 8. Art. 50(2) marking: known limitations of the shipped approach (documented, accepted-with-triggers)

**Implementation-status bridge (2026-07-01).** The Art. 50(2) marking that actually shipped diverged from this plan's original symbol names. The plan (Sec 3, Art50-P3) proposed a plain `settings['ai_metadata']` provenance block. The delivered design instead uses a **signed** marker module, `lib/art50_marker.rb` (`Art50Marker`), persisted under `board.settings['ai_generated']`:

- **Slice 1 (PR #505, merged):** mint the marker at generation time on the `AiBoardGenerator.generate_words` path. The marker is a provenance-bound (not content-bound) server bearer attestation, signed with HMAC-SHA512 via `GoSecure.lite_hmac` keyed by `SECURE_ENCRYPTION_KEY`.
- **Slice 2 (PR #507, merged 2026-07-01):** make the marker durable. It now survives a board save (`Board#process_params`), propagates through copies (`app/cloners/board_cloner.rb`), stays inline through content offload (`BoardContent`), and is exposed as a non-secret provenance view in the JSON API (`JsonApi::Board` via `Art50Marker.public_view`, which withholds `signature` and `content_id`). Every persistence and propagation boundary canonicalizes through `Art50Marker.normalized` (verify, then slice to `PERSIST_KEYS`), so client-padded unsigned keys cannot ride along.

The **register entry for Art. 50(2) stays OPEN**: `generate_focus_words` / `AiWordPredictor.predict` / eval-narration marking, OBF/OBZ export marking, and the EU-gated Art. 50(1) disclosure modal are not yet delivered.

**Fail-safe direction (applies to both limitations below).** Every read path (`public_view`, `marked?`, and the cloner via `normalized`) re-verifies the signature server-side. A marker that does not verify is treated as **unmarked**, never as "verified AI-generated." So both failure modes below degrade toward **under-marking** (the system stops claiming AI provenance it cannot prove); neither can cause **false marking** (claiming human-authored content is AI-generated). Under-marking is nonetheless the direction Art. 50(2) polices, so each item is tracked here with an explicit remediation trigger rather than silently accepted.

### 8.1 OBF/OBZ export does not carry the marker (export laundering / under-marking)

- **What.** The Open Board Format exporters/importers in `lib/converters/` emit and read no Art. 50(2) marker. A marked, AI-generated board exported to `.obf` / `.obz` and later re-imported (into this instance or another) arrives **unmarked**. Export then reimport launders the AI provenance.
- **Regulatory relevance.** Art. 50(2) attaches to the AI **output**. A copy of synthetic text is still synthetic text, so an exported-and-reimported AI board that reads as human-authored is under-marked.
- **Why deferred (risk assessment).**
  - The shipped marker is **server-secret-keyed** (HMAC via `SECURE_ENCRYPTION_KEY`) and is only verifiable on the **issuing** server. Embedding it verbatim in an OBF file would be useless off-server: a third-party tool could not verify it, and a reimport into a different LingoLinq instance (different key) would read it as forged. Carrying the marker across the export boundary therefore requires a **different, portable** marking scheme, not a copy of the internal one.
  - The 2026-06-10 Code of Practice expects marking that is interoperable, robust, and detectable. A portable content-credential (a C2PA-style manifest, or a non-secret provenance claim in an OBF `ext_` extension field) is the correct instrument for the export path, and is a design change, not a config toggle.
  - **Likelihood is low today:** OBF/OBZ export of AI-generated boards is an infrequent path; the large majority of AI content stays in-app, where it is marked and verified end to end.
- **Decision.** DEFERRED as a tracked scope gap (not accepted as permanent). Recorded here so the gap is a known, reasoned omission rather than an oversight.
- **Remediation trigger and plan.** Address before 2026-12-02 **if** EU-bound OBF/OBZ export of AI-generated content is in scope by then, or sooner if AI-board export volume becomes material. Candidate implementation: emit a **non-secret** provenance manifest (the `public_view` fields plus a portable claim) into an OBF `ext_lingolinq_ai` extension field on export, and on import re-mint a fresh server-signed marker when a trusted provenance claim is present. Add matching RSpec (export a marked board, assert the manifest; reimport, assert re-marked).

### 8.2 `SECURE_ENCRYPTION_KEY` rotation invalidates every persisted marker

- **What.** Markers are signed with an HMAC keyed by the `SECURE_ENCRYPTION_KEY` environment variable. Rotating that key makes every **previously persisted** marker fail verification, so every already-marked board silently reads as **unmarked** until re-signed.
- **Scope note (pre-existing constraint).** The same key underpins the `secure_serialize` concern **application-wide**. Rotating it already breaks decryption of all secure-serialized data across the app, so in practice the key is **effectively never rotated** without a full re-encryption migration. The marker limitation is therefore **subsumed by** an existing operational constraint rather than being a new one introduced by Art. 50 work.
- **Regulatory relevance.** An unplanned or migration-less key rotation would un-mark all AI content at once (mass under-marking) until markers were re-signed.
- **Risk assessment.** **Low likelihood** (rotation is already gated by the app-wide `secure_serialize` blast radius), **high blast radius** if it ever occurs (all persisted markers at once).
- **Decision.** DEFERRED / documented. No marker-specific mitigation beyond the existing app-wide "do not rotate `SECURE_ENCRYPTION_KEY` without a re-encryption migration" operational rule.
- **Remediation trigger and plan.** If a key rotation is ever planned, the re-encryption migration **must also re-sign persisted `ai_generated` markers** (verify under the old key, re-sign under the new key). The more robust future option is to sign markers with a **dedicated, independently rotatable key** and embed a versioned key id (`kid`) in the marker, so markers signed under a prior key remain verifiable through a rotation window. Fold this requirement into the key-rotation runbook whenever one is authored.

**Cross-references.** BoardCloner marker propagation and the allowlist behavior that made these boundaries load-bearing are tracked separately; see the task log for slices 1-2 and the copy-settings allowlist gotcha. Both limitations above were surfaced by the Claude `adversary` reviews of PR #505 and PR #507 and are the two Low-severity items those reviews deferred.
