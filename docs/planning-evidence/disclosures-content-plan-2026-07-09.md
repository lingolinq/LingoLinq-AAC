# Phase 2 Plan: Disclosures Content

**Project:** LingoLinq AI Data-Sharing VPC
**Phase goal:** A versioned, i18n-ready disclosure exists describing exactly what "AI data
sharing" means at LingoLinq -- named vendors, data categories, retention, revocation -- with a
`CURRENT_VERSION` constant the consent check can gate on, and the privacy policy updated to
reference it.
**Depends on:** Phase 1 (DONE -- `User#ai_consent_granted?(disclosures_version:)` exists and
needs a canonical version source, which this phase creates).
**Blocks:** Phase 3 (Parent UX surfaces this copy) and Phase 4 (gate passes `CURRENT_VERSION`).
**Plan written:** 2026-06-25, grounded in a code audit of origin/staging.
**Validation pass:** 2026-06-26 -- external research (COPPA 2025 rule, AI-vendor terms, disclosure
best-practice) + compliance-auditor + Codex outside review; staging re-verified. Verdict:
GO-WITH-ADJUSTMENTS. Adjustments are folded in below and marked `[V2]`.

---

## [V2] Validation update -- read first (2026-06-26)

The phase shape is sound and the code grounding below is CONFIRMED on `origin/staging` (the
"editing the wrong file" worry from one reviewer was a main-vs-staging artifact). The following
adjustments are now binding on this phase:

**The legal model (answers "when is consent needed in the app").** The trigger is *disclosure of
the child's PERSONAL INFORMATION to a third party*, not "AI is used." But the PiiScrubber is a
safeguard, NOT proof of legal de-identification: scrubbed output is *pseudonymized* (still personal
data under GDPR/ICO), and the regex+blocklist scrubber leaks free-text names and small-cohort
context (FERPA PII includes indirect/linkable identifiers, not just names --
https://studentprivacy.ed.gov/content/personally-identifiable-information-education-records).
**Conservative default until counsel signs off: treat any scrubbed-but-user-linked prompt, AI
output, or report as personal/regulated.** We do not self-grant an exemption.

**Four-bucket data classification (drives Task 1, gates the copy):**

| Bucket | Example | Treatment |
|---|---|---|
| **Non-personal** | "Generate a Halloween board" -- no user/org/child/health/school/rare-context detail | No second-tier gate; signup consent + feature flag suffice |
| **Scrubbed personal (pseudonymized)** | prompt/output with identifiers stripped but record still user-linked or internally re-identifiable | Conservatively personal; gate unless counsel confirms; never call "de-identified" |
| **Regulated PII** | "board for Johnny, age 6, Lincoln Elementary, epilepsy, AAC goals"; reports joinable to user/org/timestamps/diagnoses; small-cell aggregates | Second-tier verifiable parental consent required |
| **Never send externally** | raw identifiers, therapy notes, evaluations, diagnoses, real student/patient records, classroom context | Blocked unless an explicit approved legal+vendor basis exists |

Mapping current features: AI word predictor (child's communication content) and any reports/data
feature -> Regulated PII -> gate. AI board generator -> depends on input; conservatively
Scrubbed-personal unless counsel confirms a neutral-topic exemption -- NOT assumed exempt. One-time
"OK" persisted on first use is the right UX; "verifiable" only means the OK establishes it is the
parent (the method issue, [V2] item 4).

**Terminology rule for all copy:** say "scrubbed/pseudonymized," never "de-identified," unless the
HIPAA Safe Harbor / Expert Determination standard is actually met.

**Binding [V2] adjustments (detailed in the tasks below):**
1. Task 1 becomes a gating four-bucket AI Data-Flow Classification.
2. Vendor-truthfulness constraints on the copy (tier-specific; no "never trains"; no "no identifiers
   sent"; Anthropic ZDR unconfirmed; confirm Google = Vertex AI, not AI Studio free tier).
3. The "2-year AiApiLog retention" statement is currently UNENFORCED -- restate or ticket a purge.
4. Consent-METHOD cross-phase escalation: email-plus/text-plus are not COPPA-adequate for
   third-party disclosure; Phase 3 must use KBA / card / gov-ID match for the gated features.
5. COPPA 16 CFR 312.4(c) 7-element direct-notice checklist baked into the copy acceptance criteria.
6. `es` is a hard gate before enforcement, not a loose "tracked" sub-task.
7. No-regress guards: `boards_controller` already passes `user:` and AiApiLog already scrubs both
   summaries on staging -- add acceptance criteria so Phase 2/4 do not regress them.

---

## [RESOLVED 2026-07-09] Retention number + server-render — both confirmed, execute against this

**Retention (blocker, now resolved).** Do NOT publish a single blanket retention number. Scope
the copy by category, matching the four legal regimes that actually apply (verified directly
against `origin/staging` `app/models/ai_api_log.rb`, not assumed):

| Scope | Number | Basis | Copy treatment |
|---|---|---|---|
| EU-jurisdiction rows | 5 years, then purged | EU AI Act Art. 50 record-keeping (`AiApiLog.purge_old_eu_logs!(years: 5)`) -- this is a *retention mandate*, not a minimization cap | State as current policy. Note the mechanism is built but inert until jurisdiction stamping (Phase 4) activates it -- do not imply it is purging EU rows today. |
| Under-13 rows | 12 months, rolling | COPPA data-minimization (ratified 2026-07-09) | State as target policy; **flag as "rolling out"** -- no purge job exists yet. Do not assert it is already enforced. |
| General (everyone else) | 24 months | GDPR storage-limitation, Art. 5(1)(e)+5(2) (ratified 2026-07-09) | State as target policy; **flag as "rolling out."** No time-based purge job exists yet -- today, general AiApiLog retention is tied to account lifecycle only (see correction below). |
| Rows also serving as a HIPAA audit trail | 6-year floor (not a cap) | HIPAA 45 CFR 164.316(b)(2) | This is the one real conflict: a blanket 24-month cap cannot apply to a row that must also satisfy a 6-year HIPAA floor. Do not silently apply 24mo everywhere. Acceptable for now per prod having no real PHI yet -- add a line noting HIPAA-covered accounts may be retained longer, pending a dedicated policy once real PHI exists. |

This is **Option C** (scope by category; explicitly flag the two not-yet-built mechanisms as
"rolling out" rather than already-enforced) -- chosen specifically so this phase does not
recreate the exact defect PR #559 just fixed (a retention number stated in copy that nothing
enforces).

**Correction to the Ground-truth section below:** `privacy_security_retention_ai_logs` (`privacy.hbs:93`)
is **already fixed** as of PR #559 (`cdc6ee825`, merged). It no longer says "2 years." Current live
text: *"AI request logs: the audit record (AiApiLog) tied to a user account is deleted when that
account is deleted; IP addresses on those records are redacted at 90 days."* Task 02-02.3's job is
therefore NOT "restate an unenforced 2-year number" -- it is: **extend** this already-correct
account-lifecycle line with the EU/children/general scoped detail from the table above, without
touching or reverting the PR #559 wording. Read the live line before editing.

**Server-render design (plan line 97-109): CONFIRMED as-is.** Rails renders the canonical
disclosure (`app/views/ai_consent/disclosures/v1.html.erb`), Ember fetches + caches client-side.
No changes needed for Ember 5.12 -- a Glimmer component doing `fetch()` + client cache is
straightforward on the current Ember version. Proceed exactly as specified in that section.

---

## Ground-truth from the codebase (verified against `origin/staging`, 2026-06-26)

- **The live privacy policy is the Ember `app/frontend/app/templates/privacy.hbs`.** CONFIRMED: it is
  hand-built (no auto-generated header). The Rails partial `app/views/shared/_privacy.html.erb` is
  DEAD/duplicate (old Bootstrap markup). **Edit only `privacy.hbs`.**
- **Existing privacy AI hooks to extend (not rewrite) -- CONFIRMED at these lines:**
  - `privacy.hbs:58` key `privacy_sharing_intro` -- "vetted third-party providers under DPAs; no PII
    or PHI sent to analytics providers." Does NOT yet name the AI vendors. This is where vendor naming
    (Anthropic / OpenAI / Google) gets added.
  - `privacy.hbs:71` key `privacy_special_coppa_v2` -- ALREADY states AI features for under-13 require
    verifiable parental consent under 16 CFR Part 312 regardless of school enrollment, and limits the
    FERPA school-official authorization to non-AI, no-profiling, no-advertising use. Extend to reference
    the *second-tier* AI-data-sharing consent + link to the disclosure page; mirror this school/FERPA
    language into the legal doc.
  - `privacy.hbs:93` key `privacy_security_retention_ai_logs` -- states "AiApiLog retained for 2 years;
    IP addresses redacted at 90 days." **[V2] the 2-year limit is NOT enforced** (see Task 02-02.3).
- **Mailer copy lives in `config/locales/en.yml` via `mailer_t`** (NOT public/locales). `config/locales`
  has ONLY `en.yml` (no es).
- **Ember/JSON copy lives in `public/locales/*.json`** (en + es + 11 others). `es.json` values are
  auto-translated placeholders prefixed `***` -- structurally present, NOT human-reviewed.
- **Phase 1 methods CONFIRMED inert** at `user.rb:431` `ai_consent_granted?(disclosures_version:)`,
  `:480` `grant_ai_consent!`, `:567` `revoke_ai_consent!` -- exist, tested, called from ZERO request-path
  sites. This phase supplies the canonical version source they need.
- **[V2] Outbound-data reality (confirmed):** `lib/ai_board_generator.rb` scrubs the prompt via
  `PiiScrubber.redact_for_ai` and threads `user:` for flags/COPPA/audit; `boards_controller.rb:587`
  passes `user: @api_user`; `ai_api_log.rb:20-24` scrubs BOTH `request_summary` and `response_summary`.
  `lib/ai_word_predictor.rb` exists on staging and also requires the scrubber -- Task 1 must pin down its
  exact outbound payload. The scrubber is regex+blocklist (`lib/pii_scrubber.rb`): it does NOT catch
  arbitrary free-text first names. The disclosure must reflect that residual risk truthfully.

---

## Design decision to confirm with Scot BEFORE coding (gray area)

Render the disclosure as a single source of truth server-side, surfaced into the Ember modal context
(do NOT duplicate the legal copy across en.yml + 13 JSON locales). Recommended approach:

- **Canonical copy:** a server-rendered Rails view `app/views/ai_consent/disclosures/v1.html.erb`.
- **Ember access:** the Phase 3 modal fetches the rendered HTML from `GET /ai_consent/disclosures/:version`
  rather than re-keying the copy in `public/locales`. **[V2] cache the fetched HTML client-side after
  first load** so the AAC app degrades gracefully offline.
- **Metadata:** `LingoLinq::AiConsentDisclosures` exposes `CURRENT_VERSION` + per-version metadata
  (effective date, vendor list, **content hash**) as JSON for the gate and the modal header.

**Recommend server-render.** Confirm before building.

---

## Plan 02-01: Disclosure template + version constant + i18n extraction

**Outcome:** The canonical AI data-sharing disclosure exists, versioned, truthful, and
referenceable by the consent check.

### Tasks
1. **[V2] AI Data-Flow Classification (gating; truthfulness gate).** For each AI feature
   (`ai_board_generator`, `ai_word_predictor`, and any reports feature), document precisely what
   user-derived data is sent to which vendor AND ENDPOINT/TIER, post-scrubber, and whether any account
   identifier rides in the payload or request metadata. Sort each into the four buckets (Non-personal /
   Scrubbed-personal / Regulated PII / Never-send) using the conservative default, and flag small-cohort
   re-identification risk. Keep the "what the vendor receives" vs "what we store internally (AiApiLog,
   user-linked)" distinction explicit. Output: a table of *feature -> bucket -> needs second-tier VPC? ->
   what the disclosure must say*. This is the input to every copy claim below.
2. **Create `LingoLinq::AiConsentDisclosures` module** (`lib/ai_consent_disclosures.rb` or
   `app/models/concerns/` per repo convention) with:
   - `CURRENT_VERSION = 1`
   - a per-version registry: effective date, vendor list, data categories, retention windows,
     revocation summary, and a **content hash** of the rendered disclosure (metadata only; long-form
     copy lives in the view).
   - a `.metadata(version)` method returning JSON-serializable metadata for the gate + modal.
3. **Create the server-rendered disclosure** `app/views/ai_consent/disclosures/v1.html.erb`
   covering, in plain parent-facing language (double-quoted i18n strings, target Flesch-Kincaid
   grade 6-8):
   - named vendors + **API/paid tier** -- only those actually called (per Task 1)
   - data categories sent (from Task 1 -- must match reality; use "scrubbed/pseudonymized," never
     "de-identified" unless the HIPAA standard is met)
   - training-vs-inference distinction, stated truthfully per vendor (see 02-02.3 vendor constraints)
   - retention windows (reuse what is ACTUALLY enforced -- see 02-02.3)
   - revocation path AND the child's experience on revocation (AI features stop working; future calls
     hard-fail; already-sent inferences cannot be retracted)
   - **[V2] COPPA 16 CFR 312.4(c) 7-element checklist** (acceptance criteria below)
4. **Expose the disclosure** via `GET /ai_consent/disclosures/:version` (route + thin controller
   action rendering the versioned view). Plain HTML, no auth required to read the disclosure itself.
5. **i18n extraction:** run `i18n_generator.rb` to pull new strings into `public/locales/en.json`
   and the other locales. **[V2]** flag `es.json` `***` placeholders for HUMAN Spanish review as a
   BLOCKING dependency before enforcement (see 02-02.6), not a loose sub-task.
6. **Reference `CURRENT_VERSION` from the Phase 1 check:** default `ai_consent_granted?`'s
   `disclosures_version:` to `LingoLinq::AiConsentDisclosures::CURRENT_VERSION` (the actual call-site
   wiring is still Phase 4).

### Acceptance criteria (must be TRUE)
- [ ] **[V2]** Task 1 classification table exists; every feature is bucketed with the conservative
      default; small-cohort risk is flagged; the table drives the copy's data-category claims.
- [ ] `LingoLinq::AiConsentDisclosures::CURRENT_VERSION == 1` and `.metadata(1)` returns vendor +
      retention + data-category metadata + a content hash of the rendered disclosure.
- [ ] `GET /ai_consent/disclosures/1` renders the full disclosure with named vendors (with tier),
      data categories, retention, and revocation, in English.
- [ ] **[V2]** The disclosure contains all 7 COPPA 312.4(c) direct-notice elements: (i) what is
      collected/used and the disclosure opportunities, (ii) that consent is required and nothing is
      collected/used/disclosed without it, (iii) the specific items + uses, (iv) the third-party
      identities/categories + purposes AND the explicit "you may consent to core service WITHOUT
      consenting to AI disclosure" statement, (v) a link to the full privacy notice, (vi) the means to
      provide verifiable consent, (vii) deletion-if-no-consent-within-reasonable-time.
- [ ] **[V2]** The disclosed data categories MATCH what `ai_board_generator` / `ai_word_predictor`
      actually send (Task 1), and the copy says "scrubbed/pseudonymized," not "de-identified."
- [ ] New strings appear in `public/locales/en.json`; `es.json` entries exist (placeholder OK,
      tracked as a BLOCKING pre-enforcement dependency).
- [ ] `ai_consent_granted?` resolves a default version from the constant (no caller hardcodes 1).
- [ ] RSpec: module returns correct version/metadata + content hash; route renders 200 for a known
      version and 404 for an unknown one.

---

## Plan 02-02: Privacy policy updates + internal legal documentation

**Outcome:** The public privacy policy names the AI vendors and links the disclosure; an internal
legal record explains the rationale, sub-processor basis, and the open counsel questions.

### Tasks
1. **Edit `app/frontend/app/templates/privacy.hbs`** (the LIVE policy -- not the dead Rails partial):
   - Extend `privacy_sharing_intro` (`:58`) to name Anthropic / OpenAI / Google as AI sub-processors,
     the **API/paid tier** used, the data categories sent, and training-vs-inference posture.
   - Extend `privacy_special_coppa_v2` (`:71`) to describe the *separate* AI-data-sharing consent and
     link to `/ai_consent/disclosures/1`. (The under-13 + FERPA-school language is already strong; build
     on it.)
   - Reconcile `privacy_security_retention_ai_logs` (`:93`) with what is actually enforced (Task 3).
   - Bump the "Last Updated" date. Add new i18n keys; run `i18n_generator.rb`.
2. **Do not edit** `app/views/shared/_privacy.html.erb` (dead). Add a `<%# DEAD: /privacy serves the
   Ember SPA; see privacy.hbs %>` comment OR file a cleanup ticket to delete it -- flag the
   stale-duplicate-policy risk either way.
3. **[V2] Vendor-truthfulness constraints (binding on all copy in 02-01.3 and Task 1 above):**
   - Confirm LingoLinq uses Google's **Vertex AI** path, not AI Studio free tier (the free Gemini tier
     trains on input and its terms prohibit under-18 products -- categorically unusable for child data).
   - Never claim "never trains" unqualified (false for consumer Claude.ai and free Gemini); scope every
     no-training claim to the commercial API / paid tier.
   - Do NOT claim "no identifiers are sent." Truthful framing: "filtered to remove recognizable patterns
     (emails, phone numbers, IDs) before sending; free-text entries may still contain names." Pair with
     a scrubber-hardening ticket.
   - Anthropic ZDR is not publicly documented -- do not claim or disclaim it without sales confirmation.
   - **2-year AiApiLog retention is currently UNENFORCED** (only `redact_old_ip_addresses!(days: 90)`
     exists). Either point the copy at a real enforcing purge job OR restate to what is enforced, AND
     file a separate ticket for a 2-year AiApiLog purge (COPPA 312.10 bars indefinite retention).
4. **Create `docs/legal/AI_DATA_SHARING_CONSENT.md`:** rationale; per-vendor sub-processor basis and
   data-handling terms (Anthropic API/DPA, OpenAI API, Google Vertex AI; BAA/ZDR status with source +
   date); the four-bucket classification + the conservative default; data categories; the versioning
   policy (a material copy change bumps `CURRENT_VERSION` and forces re-consent; content-hash integrity
   check); revocation semantics; **the school/FERPA-authorized pathway** (mirror the live policy's
   language -- school authorization covers limited educational non-AI use, not third-party AI
   disclosure); and the **open counsel questions** (neutral-board-gen exemption; consent method).
5. **[V2] Consent-METHOD cross-phase escalation.** Record a high-priority Phase 3 pre-decision: the
   email-link consent method Phase 3 was modeled on is NOT COPPA-adequate for third-party disclosure
   (email-plus/text-plus are excluded). The gated features need KBA / credit-card transaction / gov-ID
   match. Phase 2 copy stays method-agnostic; do not ship copy implying a one-click email suffices.
6. **[V2] `es` hard gate.** Human-reviewed Spanish for the consent disclosure is a BLOCKING dependency
   before any enforcement (Phase 4/5) is turned on for `es`-locale users. State it as such.
7. **[V2] No-regress guards.** Add acceptance criteria that Phase 2/4 work does NOT regress the
   already-correct staging behavior: `boards_controller` threads `user:` into the generator (so org
   opt-out + COPPA gate + audit attribution apply), and AiApiLog scrubs BOTH request and response
   summaries. (Codex flagged these as gaps from a stale `main` read; they are already fixed on staging.)
8. **Legal review checkpoint (Scot + counsel sign-off) -- THE GATE.** The disclosure copy and the
   policy edits do not ship until approved. This is the phase long-pole. Start the review the moment
   draft copy exists; run it in parallel with the 02-01 code. The two questions explicitly for counsel:
   (a) can scrubbed neutral board-gen be treated as Non-personal (exempt) or must it stay gated; (b)
   which verifiable-parental-consent method for the gated features.

### Acceptance criteria (must be TRUE)
- [ ] `privacy.hbs` names the AI vendors WITH TIER, states data categories + training-vs-inference,
      and links to the disclosure page.
- [ ] "Last Updated" reflects the change date.
- [ ] No copy claims "de-identified" (unless the HIPAA standard is met), "never trains" unqualified,
      or "no identifiers sent."
- [ ] The retention statement matches what is actually enforced; a 2-year-purge ticket exists if the
      copy keeps the 2-year claim.
- [ ] `docs/legal/AI_DATA_SHARING_CONSENT.md` exists with per-vendor sub-processor citations, the
      four-bucket classification, the versioning + revocation policy, the school/FERPA pathway, and the
      open counsel questions.
- [ ] Dead Rails `_privacy.html.erb` is flagged (commented or ticketed).
- [ ] The Phase 3 consent-method pre-decision is recorded (STATE.md / ROADMAP).
- [ ] Scot + counsel have signed off on the final disclosure + policy copy (record the approval).
- [ ] en renders clean in a locale smoke check; es human review is tracked as a blocking
      pre-enforcement dependency.

---

## Risks & watch items

| Risk | Why it matters | Handling |
|---|---|---|
| **Consent-method invalidity [V2]** | A perfect versioned disclosure gating an invalidly-obtained consent protects nothing. | Phase 3 pre-decision (02-02.5); copy stays method-agnostic. |
| **Legal copy review (Scot + counsel)** | The slowest item; gates Phases 3 & 4, plus the two counsel questions. | Start review on first draft; run parallel with 02-01 code. |
| **Truthfulness of data categories** | A disclosure that misstates what's sent is a compliance defect worse than none. | Task 1 four-bucket classification + vendor constraints (02-02.3) before any copy. |
| **"De-identified" overclaim [V2]** | Scrubbed = pseudonymized = still personal data; regex scrubber leaks free-text/small-cohort. | Conservative default; terminology rule; scrubber-hardening ticket. |
| **Unenforced 2-year retention [V2]** | Stating a limit nothing enforces is itself a disclosure defect + COPPA 312.10 risk. | Restate to enforced reality or ticket the purge (02-02.3). |
| **Single-source architecture** | Wrong choice duplicates copy across 13 locales OR breaks offline. | Server-render + client-side cache; confirm with Scot up front. |
| **es is placeholder-only** | Machine `es` arguably fails the "clearly understandable" notice standard for Spanish-speaking parents. | Human `es` review is a blocking pre-enforcement gate (02-02.6). |
| **Dead Rails privacy partial** | Stale duplicate policy copy could diverge from the live one. | Flag/ticket for deletion (02-02.2). |

## Out of scope (deferred to later phases)
- The parent-facing mailer, controller, and Ember `<AiConsentModal />` -- Phase 3.
- The verifiable-parental-consent METHOD implementation -- Phase 3 (pre-decision logged here).
- Wiring the gate into AI call sites / replacing the hardcoded denial string -- Phase 4.
- The 2-year AiApiLog purge job -- separate ticket (not Phase 2 content).
- Feature flag, backfill, monitoring -- Phase 5.

## Rough effort
~2-3 dev-days of code (02-01 + 02-02 Tasks 1-4,7) + the Task 1 classification (~0.5 day) + legal
review (Scot + counsel, days-to-weeks, parallel). Senior dev not required for the code; a competent
Rails dev or contractor can execute once copy is approved.
