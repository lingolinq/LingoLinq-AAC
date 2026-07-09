---
phase: 02-disclosures-content
plan: 01+02 (single combined PLAN.md covering both sub-plans)
subsystem: compliance
tags: [coppa, i18n, rails, ember, ai-consent, disclosure, privacy-policy, gdpr]

requires:
  - phase: 01-foundation
    provides: "User#ai_consent_granted?(disclosures_version:), #grant_ai_consent!, #revoke_ai_consent! (inert, unwired)"
provides:
  - "LingoLinq::AiConsentDisclosures module with CURRENT_VERSION=1 and versioned metadata registry"
  - "GET /ai_consent/disclosures/:version server-rendered disclosure (v1, English)"
  - "privacy.hbs AI vendor naming, second-tier consent link, retention reconciliation"
  - "docs/legal/AI_DATA_FLOW_CLASSIFICATION.md (four-bucket classification, Gemini/Vertex finding)"
  - "docs/legal/AI_DATA_SHARING_CONSENT.md (rationale, sub-processor basis, open counsel questions)"
affects: [03-parent-ux, 04-ai-call-site-enforcement, 05-rollout-monitoring]

tech-stack:
  added: []
  patterns:
    - "Server-rendered Rails view (per-version frozen ERB templates) as single source of truth for legal copy, fetched raw by a future Ember modal rather than duplicated across 13 locale JSONs"
    - "Structured-metadata content hash (not literal rendered HTML) for substantive-change detection on versioned legal copy"

key-files:
  created:
    - lib/lingo_linq/ai_consent_disclosures.rb
    - app/views/ai_consent/disclosures/v1.html.erb
    - app/controllers/ai_consent/disclosures_controller.rb
    - docs/legal/AI_DATA_FLOW_CLASSIFICATION.md
    - docs/legal/AI_DATA_SHARING_CONSENT.md
    - spec/lib/lingo_linq/ai_consent_disclosures_spec.rb
    - spec/controllers/ai_consent/disclosures_controller_spec.rb
  modified:
    - app/frontend/app/templates/privacy.hbs
    - app/models/user.rb
    - config/routes.rb
    - config/locales/en.yml
    - public/locales/*.json (12 new keys, en text + *** placeholders)
    - app/views/shared/_privacy.html.erb (dead-partial flag)
    - docs/legal/DATA_RETENTION.md (AiApiLog retention reconciliation)

key-decisions:
  - "Named Google Gemini 2.5 Flash as a real conditional fallback vendor (matching the attested AI_GOVERNANCE_MEMO.md inventory) rather than omitting it, while explicitly flagging its Vertex-AI-vs-AI-Studio data-handling terms as unconfirmed and blocking Task 02-02.8 sign-off"
  - "ai_consent_granted?'s disclosures_version: kwarg now defaults to AiConsentDisclosures::CURRENT_VERSION, superseding the D-03 required-kwarg-with-no-default design now that a canonical version source exists (one test updated accordingly)"
  - "Content hash covers structured REGISTRY metadata, not literal rendered HTML, since this codebase has no prior ApplicationController.renderer-outside-a-request pattern"
  - "Extended (not replaced) the three existing privacy.hbs AI-relevant sections per the PR #559 lineage; used NEW i18n keys for new prose rather than mutating existing keys' text, to avoid silently shipping stale translations of changed meaning under old keys"
  - "Manually patched the 13 public/locales/*.json files with only the 12 new keys, instead of trusting i18n_generator.rb --generate --merge, which would have additionally dropped 192 pre-existing unrelated keys no longer matched by the scanner elsewhere in the codebase (out-of-scope drift, left untouched)"

requirements-completed: [DSC-01, DSC-02, DSC-03, DSC-04, DSC-05, DSC-06]

duration: 28min
completed: 2026-07-09
---

# Phase 2: Disclosures Content Summary

**Versioned, server-rendered AI data-sharing disclosure (7 COPPA elements, Anthropic + conditional Gemini named) wired to a new `LingoLinq::AiConsentDisclosures` version constant, with the public privacy policy and internal legal docs reconciled to match.**

## Performance

- **Duration:** 28 min (commit-timestamp span; wall-clock session was longer due to research/verification)
- **Started:** 2026-07-09T21:25:46Z
- **Completed:** 2026-07-09T21:54:03Z
- **Tasks:** 13 of 14 plan tasks completed (Plan 02-01 tasks 1-6, Plan 02-02 tasks 1-7); Task 02-02.8 explicitly NOT executed (see below)
- **Files created:** 7
- **Files modified:** 20 (includes 13 `public/locales/*.json` files for the i18n patch)

## Accomplishments

- `LingoLinq::AiConsentDisclosures` module (`CURRENT_VERSION = 1`, `.metadata(1)` with vendor,
  retention, and data-category metadata plus a SHA256 content hash), 18 passing specs.
- `GET /ai_consent/disclosures/1` renders a plain-HTML fragment containing all 7 COPPA 16 CFR
  312.4(c) direct-notice elements, in English, naming Anthropic (Claude Haiku 4.5, Claude Opus 4.7)
  as the primary confirmed-ZDR vendor and Google Gemini 2.5 Flash as a conditional,
  data-handling-terms-unconfirmed fallback. 6 passing controller specs (`render_views`).
- `User#ai_consent_granted?` now defaults its version argument to the new constant.
- `privacy.hbs` extended (not replaced) to name AI vendors, link the new disclosure, and reconcile
  AI log retention into an EU (5yr, enforced) / children (12mo, rolling out) / general (24mo,
  rolling out) / IP-90-day (enforced) split, replacing a single blanket "2 years" claim.
- Two new internal legal docs: `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` (four-bucket
  classification per feature, a real Gemini/Vertex-AI truthfulness finding grounded in an already
  CEO-attested open governance item) and `docs/legal/AI_DATA_SHARING_CONSENT.md` (rationale,
  per-vendor sub-processor basis, versioning policy, revocation semantics, school/FERPA pathway,
  the `es` hard gate, no-regress guards, and the two open counsel questions).
- `docs/legal/DATA_RETENTION.md`'s stale "AiApiLog kept 2 years" row reconciled to match.

## Task Commits

Each task was committed atomically (15 commits total, `c595f630..HEAD` on this worktree branch):

1. **02-01.1: AI data-flow classification table** - `f93a66782` (docs)
2. **02-01.2: LingoLinq::AiConsentDisclosures module** - `4a9b7597a` (feat)
3. **02-01.3: v1 disclosure view** - `c70ef16f8` (feat)
4. **02-01.4: route + controller** - `d1a4f0541` (feat)
5. **02-01.5: i18n strategy note** - `538a634c7` (docs)
6. **02-01.6: default ai_consent_granted? version** - `03cc8324a` (feat)
7. **02-02.1: privacy.hbs vendor naming + retention** - `61202c044` (feat)
8. **02-02.2: dead partial flag** - `2a5eed5f7` (docs)
9. **02-02.3: vendor-truthfulness constraints documented** - `8df3782cc` (docs)
10. **02-02.4: AI_DATA_SHARING_CONSENT.md created** - `4dd126f15` (docs)
11. **02-02.5: Phase 3 consent-method pre-decision recorded** - `a5dee951a` (docs)
12. **02-02.6: es hard gate note** - `985c1f67e` (docs)
13. **02-02.7: no-regress guards documented** - `f675eff83` (docs)
14. **Deviation fix: DATA_RETENTION.md reconciliation** - `db5142d86` (fix)
15. **02-02.6 addendum: vendor-prose i18n gap flagged** - `a7f2537f4` (docs)

**Task 02-02.8 (Legal review checkpoint -- THE GATE): NOT EXECUTED.** Explicitly out of scope per
the executor instructions; requires Scot + counsel sign-off, which no agent can perform. See
"Known Stubs / Not Done" below.

## Files Created/Modified

- `lib/lingo_linq/ai_consent_disclosures.rb` - `CURRENT_VERSION`, per-version metadata registry, `.metadata`/`.content_hash`/`.known_version?`
- `app/views/ai_consent/disclosures/v1.html.erb` - The rendered disclosure fragment
- `app/controllers/ai_consent/disclosures_controller.rb` - Thin show action, 404 on unknown version
- `config/routes.rb` - `GET /ai_consent/disclosures/:version`; added `ai_consent` to `RESERVED_ROUTES`
- `config/locales/en.yml` - `ai_consent_disclosures.v1.*` keys (Rails-side i18n, not Ember)
- `app/frontend/app/templates/privacy.hbs` - AI vendor naming, disclosure link, retention split, date bump
- `public/locales/*.json` (13 files) - 12 new keys, English text + `***` placeholders elsewhere
- `app/models/user.rb` - `ai_consent_granted?` default version
- `app/views/shared/_privacy.html.erb` - Dead-partial ERB comment
- `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md` - Four-bucket classification, Gemini/Vertex finding, retention reconciliation, vendor-truthfulness constraint table
- `docs/legal/AI_DATA_SHARING_CONSENT.md` - Rationale, sub-processor basis, versioning policy, revocation, school/FERPA pathway, es gate, no-regress guards, open counsel questions, Phase 3 escalation
- `docs/legal/DATA_RETENTION.md` - AiApiLog row reconciled
- `spec/lib/lingo_linq/ai_consent_disclosures_spec.rb` - 18 examples
- `spec/controllers/ai_consent/disclosures_controller_spec.rb` - 6 examples
- `spec/models/user_spec.rb` - Updated the one test whose assumption this phase intentionally supersedes

## Decisions Made

- **Named Gemini, didn't hide it.** A direct code audit (`lib/ai_board_generator.rb`,
  `lib/ai_word_predictor.rb`) confirmed Google Gemini 2.5 Flash is a real, live, conditional
  fallback vendor (activates when `ANTHROPIC_API_KEY` is unset and `GEMINI_API_KEY` is set), hitting
  the Gemini Developer/AI-Studio endpoint rather than Vertex AI. This exactly matches an already
  CEO-attested open item in `docs/legal/AI_GOVERNANCE_MEMO.md` section 7 (`rev-gemini-baa-annual`,
  attested 2026-06-19), so this is not a new discrepancy -- but it means the disclosure names Gemini
  with an explicit "data-handling terms not yet confirmed" caveat rather than either omitting it or
  falsely claiming Vertex AI.
- **`ai_consent_granted?` gets a default.** Phase 1's D-03 made `disclosures_version:` a required
  kwarg specifically because no canonical version source existed. Phase 2 supplies that source, so
  the kwarg now defaults to `CURRENT_VERSION` instead of raising `ArgumentError` on omission. One
  existing test asserted the old ArgumentError behavior; it was updated (not deleted) to assert the
  new default-resolution behavior, plus a new test confirming the default still returns `false` for
  a genuinely unconsented user.
- **i18n_generator.rb was NOT run blindly.** A dry run of `--generate --merge` would have dropped
  192 pre-existing, unrelated i18n keys that are no longer matched by the generator's scan across
  the wider codebase (a real, out-of-scope drift). Manually patched `public/locales/*.json` with
  only the 12 new keys instead, verified zero keys lost.
- **Extended existing i18n keys only for the date bump; new prose gets new keys.** Reusing an
  existing key for materially different English text would silently ship a stale (and now
  factually wrong) translation under that key in the other 12 locale files. The three substantive
  `privacy.hbs` sections were extended with new `<li>`/`<p>` elements and new i18n keys rather than
  rewriting the existing keys' strings.
- **Content hash covers structured metadata, not literal HTML.** No prior pattern exists in this
  codebase for rendering a Rails view outside a request; hashing the REGISTRY metadata is simpler,
  testable, and still catches substantive changes (vendor, retention, category), at the cost of not
  catching a pure-copy-wording edit. Documented as an explicit design tradeoff in the module.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale "2 years" AiApiLog retention claim in DATA_RETENTION.md**
- **Found during:** Task 02-01.1 classification pass, cross-referencing internal legal docs.
- **Issue:** `docs/legal/DATA_RETENTION.md` still stated a flat "full record kept 2 years" for
  `AiApiLog`, contradicting the shipped 5-year EU purge (PR #553) and the 2026-07-09 ratified
  12-month/24-month decisions this phase's own copy is required to state.
- **Fix:** Split the single row into four rows (EU enforced, children decided-rolling-out, general
  decided-rolling-out, IP-90-day enforced), matching `AI_DATA_FLOW_CLASSIFICATION.md` section 6.
- **Files modified:** `docs/legal/DATA_RETENTION.md`
- **Commit:** `db5142d86`

**2. [Rule 2 - Missing correctness guard] `ai_consent` not in `RESERVED_ROUTES`**
- **Found during:** Task 02-01.4, adding the new `/ai_consent/...` top-level route.
- **Issue:** A new top-level route namespace was being added with no corresponding username
  collision guard, unlike the precedent set for `/eval`.
- **Fix:** Added `'ai_consent'` to `LingoLinq::RESERVED_ROUTES` in `config/routes.rb`.
- **Files modified:** `config/routes.rb`
- **Commit:** `d1a4f0541`

**3. [Investigation, not a fix] SUBPROCESSORS.md was checked but NOT touched**
- **Found during:** Task 02-01.1 vendor-truthfulness verification.
- **Issue:** The primary checkout's copy of `docs/legal/SUBPROCESSORS.md` (read for reference
  early in the session) contained the exact "OpenAI listed as an active vendor when no code path
  calls it" and "de-identified" terminology defects this phase is meant to avoid repeating.
- **Resolution:** Re-verified against the worktree's actual git history (`origin/staging` at the
  branch point) and confirmed this fix already exists there, landed via a separate branch not yet
  merged when the primary checkout was read. No action taken in this worktree; documented here so
  the finding is not silently lost.

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 2 missing guard), 1 investigation-only
(no action needed).
**Impact on plan:** Both fixes are directly load-bearing for this phase's own truthfulness/retention
requirements; no unrelated scope creep.

## Issues Encountered

- **RSpec could not boot initially** in this worktree due to a pre-existing local test-database
  encryption-key mismatch (`GoSecure.validate_encryption_key` "bad decrypt" on the `settings` table),
  unrelated to any change in this phase. Resolved locally via the gem's own documented fix
  (`DELETE FROM settings WHERE key='encryption_hash'` on the local `lingolinq-test` database only;
  no application code or git-tracked file was touched). All specs referenced in this summary were
  run and passed after that local fix.
- **Frontend lint tooling (`ember-template-lint`) is not installed** in this worktree
  (`node_modules/.bin/ember-template-lint` missing); could not run `npm run lint:hbs`. Verified the
  `privacy.hbs` edit manually instead (balanced `{{`/`}}`, `<div>`, `<p>` counts; a full
  `i18n_generator.rb` dry run reporting 0 dups / 0 missing both before and after the edit).
- **`i18n_generator.rb --generate --merge` is destructive beyond its stated scope**: it silently
  drops any key no longer matched by its `app/frontend/app/**/*.{js,hbs}` scan, even for
  unrelated files nowhere near this phase's changes (192 keys, in this run). Worked around by
  hand-patching the locale JSONs with only the 12 new keys (see Decisions Made). This generator
  behavior itself is out of scope for this phase to fix and is not touched.

## Known Stubs / Not Done

**Task 02-02.8 (Legal review checkpoint) is NOT DONE -- BLOCKED ON HUMAN SIGN-OFF.** This is
distinct from every other item in this plan, which is complete. Per the executor instructions, this
task was explicitly excluded from execution because it requires Scot's and counsel's judgment, not
engineering work:

- (a) Whether scrubbed, neutral AI board generation can ever be treated as Non-personal (exempt)
  or must always stay gated (Scrubbed-personal).
- (b) Which verifiable-parental-consent method satisfies COPPA for AI data-sharing disclosure
  specifically (email-plus/text-plus are explicitly excluded).
- The Gemini/Vertex-AI vendor data-handling terms gap (section 2.2 of `AI_DATA_SHARING_CONSENT.md`)
  must also be resolved before this sign-off, per that document.

Until Task 02-02.8 is completed, `docs/legal/AI_DATA_FLOW_CLASSIFICATION.md`,
`docs/legal/AI_DATA_SHARING_CONSENT.md`, `app/views/ai_consent/disclosures/v1.html.erb`, and the
`privacy.hbs` edits are all DRAFT status and should not be treated as final, counsel-approved legal
positions. Nothing in this phase's code enforces or ships this consent gate live (that is VPC Phase
4); Phase 2 is content and version-source only, consistent with the plan's scope.

## User Setup Required

None - no external service configuration required. (The Gemini/Vertex-AI vendor terms and the
verifiable-consent-method decision in "Known Stubs" above require Scot's decisions, not environment
setup.)

## Next Phase Readiness

- VPC Phase 3 (Parent UX) can build against `GET /ai_consent/disclosures/:version` and
  `LingoLinq::AiConsentDisclosures.metadata(version)` as documented, but **must not** default to an
  email-link consent method without first resolving the Phase 3 consent-method pre-decision recorded
  in `docs/legal/AI_DATA_SHARING_CONSENT.md` section 8 (HIGH priority, blocks implementation).
- VPC Phase 4 can reference `LingoLinq::AiConsentDisclosures::CURRENT_VERSION` directly; the default
  kwarg wiring in `User#ai_consent_granted?` is ready for call-site wiring.
- Blocker carried forward: Task 02-02.8 legal sign-off (see Known Stubs above) gates any of this
  content going live to a real parent, independent of Phase 3/4 code progress.
- `es` (Spanish) coverage is a blocking pre-enforcement dependency for both the disclosure and
  `privacy.hbs`, tracked in `docs/legal/AI_DATA_SHARING_CONSENT.md` section 4.1, including a
  not-yet-solved architecture gap (vendor-prose sentences in the Ruby module bypass i18n entirely).

---
*Phase: 02-disclosures-content*
*Completed: 2026-07-09*

## Self-Check: PASSED

All 7 created files verified present on disk; all 15 task/deviation commit hashes verified present
in git history. Test suites referenced in this summary (18 + 6 + 46 + 57 + 3 + 627 broader-suite
examples across the various targeted runs) were executed and passed at the time of this commit.
