# Compliance & Audit (generated)

> 🤖 **GENERATED - DO NOT EDIT.** This page is a one-way mirror of the git findings
> register (`audit-reports/FINDINGS.json`), regenerated after each `/audit-run`. Edits here
> are overwritten on the next publish and are not the source of truth. Do not move this
> page out of Compliance Home and do not delete it; regenerate in place.
>
> Regenerate: `ruby scripts/compliance-notion-publish.rb`, then push this body to the single
> Notion page with `ruby scripts/compliance-notion-page-publish.rb`
> (see `audit-reports/notion/README.md`).

**Audited commit:** `a43867de5aa83d821125892de624fcd1e19f9d81`  
**Audited ref:** `compliance/scot-q3-audit-run-951d9465 (== origin/develop tip a43867de5 at run start, 2026-09-16). PARTIAL COVERAGE, Scot-approved 2026-09-17: finders ran without their checklist skills or read-only guard (LL-c667ec15e3); no AWS account-level read; no bundle-audit; accessibility static only; code-hygiene, api and privacy sampled parts of their scope. Make-up pass due before the October light run.`  
**Run date:** 2026-09-16  
**Page generated:** 2026-09-26T01:49:22Z

## Headline - live findings (open + awaiting verification)

| Count | Critical | High | Medium | Low |
|---|---|---|---|---|
| **Live** (`open` + `remediated-unverified`) | **1** | **39** | 94 | 52 |
| `open` only | 1 | 33 | 91 | 51 |

_The headline is the LIVE count: `open` + `remediated-unverified` findings by severity (plan decision 5.9.2: counts, not a synthetic score). The `open`-only row is the `/audit-run` step 6 convention; the difference is findings whose fix has landed but which Scot has not yet verified and closed. Only Scot closes a finding, downgrades severity, or accepts risk._

## Open findings (open + awaiting verification)

| ID | Legacy | Severity | Frameworks | Title | Evidence |
|---|---|---|---|---|---|
| LL-1baffd92d5 |  | critical | FERPA, COPPA, GDPR, SOC2 | Organization account-claim authorization weakness (details withheld until remediation is verified) | `app/controllers/api/organizations_controller.rb`:245 |
| LL-06d36ffeeb |  | high | GDPR, FERPA, COPPA, HIPAA | Board translation writes raw user-authored label text into the global word_data dictionary, which has no user_id or organization_id: translated personal labels are served cross-account as cache hits and survive account erasure (GDPR Art. 5(1)(f)/17, FERPA, district data isolation) | `app/models/word_data.rb`:858 |
| LL-0b5443f43b |  | high | SOC2, HIPAA | Production Cloud Run service is deployed with public ingress, so the direct run.app URL bypasses the load balancer and its attached Cloud Armor policy | `scripts/gcp/phase5-frontend-lb.sh`:490 |
| LL-10409152d2 |  | high | GDPR, FERPA, COPPA, HIPAA, SOC2 | The 2026-08-08 quarterly subprocessor review claims every external host in lib/, app/models/, app/controllers/ and config/ was enumerated and found only two omissions, but at least five further live third-party egress paths are absent from the register (Google Maps Places, OpenSymbols, workshop.openaac.org, YouTube, Zendesk) | `docs/legal/2026-08-16_subprocessor-register.md`:120 |
| LL-104bfa61dc |  | high | WCAG | Terms-agree modal is unreachable by switch scanning (no .modal_targets / .btn, opened without scannable) | `app/frontend/app/components/terms-agree.hbs`:27 |
| LL-135ee6ca59 |  | high | COPPA, GDPR, FERPA | User#ai_consent_granted? has no runtime caller, so the separate AI data-sharing consent promised to parents on the privacy page is never enforced by the AI feature gate | `lib/feature_flags.rb`:242 |
| LL-1f83f4e778 |  | high | FERPA, SOC2 | Lesson access-control defect, fixed in code; residual-access verification pending (details withheld) | `app/models/lesson.rb`:25 |
| LL-3bfc56ef4b |  | high | HIPAA, SOC2 | ALLOWED_RUNTIME_MODELS is an in-process application gate and cannot constrain direct AWS API or CLI use of the same Bedrock runtime credential | `lib/ai_client.rb`:83 |
| LL-400adcead5 |  | high | GDPR, COPPA | PR #901 machine-translated the AI data-sharing, Article 50, COPPA and retention disclosures into twelve locale files, and the guard that checks those claims covers only English and Spanish, by its own admission | `spec/support/ai_disclosure_claims.rb`:79 |
| LL-4f1eb5fd0a |  | high | SOC2 | Lesson#check_url fetches a user-supplied URL with raw Typhoeus and unbounded redirect following, bypassing the repository's own SafeHttp DNS/IP and redirect validation | `app/models/lesson.rb`:146 |
| LL-53cb93fab1 |  | high | GDPR, FERPA | Terms-agree modal can be silently replaced by intro before the user agrees | `app/frontend/app/routes/index.js`:132 |
| LL-5617f4e17d |  | high | SOC2, HIPAA, FERPA | No server-side password strength policy exists; the only minimum-length check is a 6-character Ember computed property, bypassable by a direct API call | `app/frontend/app/controllers/register.js`:217 |
| LL-57bb9f1af4 |  | high | SOC2 | Webhook.find_record calls constantize on an unvalidated string, reachable during Lesson permission evaluation via a malformed usages entry, raising NameError inside show/update/assign/unassign | `app/models/webhook.rb`:206 |
| LL-57fa21cfc2 |  | high | COPPA, FERPA | Under-13 offboarding: consent-pending state enforcement gap (decision pending; details withheld) | `app/models/user.rb`:674 |
| LL-5d856983bf |  | high | SOC2 | Lesson URL handling lacks destination restrictions (details withheld until remediation is verified) | `app/models/lesson.rb`:81 |
| LL-5f0a016e2b |  | high | SOC2, HIPAA | Attested AI Governance Memo states the Bedrock runtime AI path is "not operational since" revision 00014-5rw; credentials were re-mounted 53 minutes later and the path carries user-attributed traffic | `docs/legal/AI_GOVERNANCE_MEMO.md`:499 |
| LL-6af580a23a |  | high | SOC2, HIPAA, FERPA | A Redis RDB persistence snapshot was tracked in git and shipped in every production container image for ~6 months; removed from HEAD (2026-08-14) but the blob remains fully retrievable from public git history at ced829ba1 on both staging and main | (attestation) |
| LL-705b10bcd7 |  | high | SOC2 | BoardDownstreamButtonSet S3 writes fail against KMS-encrypted bucket: 'Requests specifying Server Side Encryption with AWS KMS managed keys require AWS Signature Version 4' | (attestation) |
| LL-7aa646ef87 |  | high | FERPA, GDPR, SOC2 | The branded Drive retention render DOC-52c8c33583 stays status published in customer bundles while recorded as known-inaccurate only in a free-text register note no consumer reads | `audit-reports/DOCUMENT-REGISTER.json`:2330 |
| LL-7bf58a4c53 |  | high | WCAG | Classic (opt-in) speak-view chrome has several icon-only controls with no accessible name (sidebar collapse, edit pencil, speak-mode notification, level +/-), two of them silent to auditory scanning | `app/frontend/app/templates/application.hbs`:1559 |
| LL-85b32935c2 |  | high | SOC2, FERPA, HIPAA | Device session token strength (details withheld until remediation is verified) | `app/models/device.rb`:156 |
| LL-89b97af30f |  | high | SOC2 | Lesson usages permission grant lets a viewer self-grant edit: assign is gated on 'view', and assigning the lesson to one's own org adds a usages entry that the permission block then reads as an edit grant | `app/models/lesson.rb`:61 |
| LL-90045bb29c |  | high | FERPA | User#user_token is a permanent, non-expiring credential serialized on login and embedded in navigable lesson/board share URLs | `lib/json_api/user.rb`:41 |
| LL-933e61efd7 |  | high | GDPR, FERPA, COPPA | Five specific retention and deletion promises on the public privacy page have no implementing mechanism, and the scheduled jobs that would partially back them were not run by the production scheduler from 2026-07-21 to 2026-09-02 | `app/frontend/app/templates/privacy.hbs`:97 |
| LL-9e145637b9 |  | high | GDPR | EU under-16 AI parental consent flow control weakness (details withheld until remediation is verified) | `app/controllers/eu_ai_parental_consents_controller.rb`:16 |
| LL-a4b5fb1445 |  | high | FERPA, GDPR, SOC2 | Organization membership authorization weakness in supervisor-key processing (details withheld until remediation is verified) | `app/models/organization.rb`:1470 |
| LL-a6be800a86 |  | high | COPPA, FERPA, GDPR | Full user export archive, including non-anonymized log data, is stored under an S3 key derived only from the username and a minute-granularity timestamp | `lib/exporter.rb`:94 |
| LL-a8351c5b00 |  | high | GDPR, HIPAA, FERPA | PiiScrubber log redaction never matches E.164 phone numbers and, contrary to its own docstring, fails the parenthesized form | `lib/pii_scrubber.rb`:37 |
| LL-a95e9c5f7c |  | high | SOC2 | lingolinq-worker's 512Mi memory limit is too small for ButtonImage/BoardDownstreamButtonSet jobs, causing continuous OOM kills that land as Resque::Failure instead of being requeued | (attestation) |
| LL-a9d6d5a46b |  | high | WCAG | AI disclosure full-notice link uses the low-contrast verdigris token for text on the near-white modal surface | `app/frontend/app/styles/app.scss`:38150 |
| LL-c0b3d59f58 |  | high | SOC2, HIPAA, FERPA | Production GCP project least-privilege regression for human principals (details withheld until remediation is verified) | `scripts/gcp/phase1-setup.sh`:249 |
| LL-c11cc12f66 |  | high | COPPA, FERPA | COPPA parental consent flow control weakness (details withheld until remediation is verified) | `app/controllers/parental_consents_controller.rb`:28 |
| LL-c7bbfa452a |  | high | COPPA, FERPA | School-authorized account creation skips the COPPA block entirely, so settings coppa is never written and the under-13 AI gate that reads it passes for exactly the accounts it was written to protect | `app/models/user.rb`:2423 |
| LL-cb9f9c865a |  | high | GDPR, HIPAA, FERPA | RemoteTarget rows survive account deletion, retaining a phone-number hash beside the per-row salt that reverses it (right-to-erasure gap) | `lib/flusher.rb`:442 |
| LL-cbc8bc4211 |  | high | GDPR, FERPA, HIPAA, COPPA, SOC2 | Impact of the 2026-07-21 to 2026-09-02 production scheduler-dispatch interruption is unassessed: what accumulated in the window, which data subjects were affected, and what residual retention and deletion work remains | `lib/tasks/scheduler.rake`:157 |
| LL-dbc950d96d |  | high | GDPR, COPPA, FERPA | supervisor_relationships rows are never erased when either party's account is deleted, and each keeps a plaintext copy of the consent-recipient email in consent_email_sent_to | `app/models/supervisor_relationship.rb`:7 |
| LL-e8614c103f |  | high | GDPR, FERPA, COPPA | PredictionEntry rows survive account deletion, retaining per-user AAC vocabulary sequences indefinitely | `app/models/prediction_entry.rb`:4 |
| LL-e981aad7a6 |  | high | COPPA, FERPA | Supervisor-access consent routing for under-13 communicators (details withheld until remediation is verified) | `app/services/supervisor_consent_service.rb`:81 |
| LL-ed9316b6d9 |  | high | FERPA, COPPA, GDPR | Word-prediction selections are stored under device-global keys and synced to whichever account holds the token at flush time, so one communicator's vocabulary is written into another's server-side prediction profile | `app/frontend/app/utils/word_suggestions.js`:19 |
| LL-f150e0e828 |  | high | COPPA, GDPR | District seat reclaim converts an under-13's account to a consumer trial with no parental re-consent or notice (COPPA) | `app/models/license.rb`:76 |
| LL-013ae2595c |  | medium | FERPA, GDPR, SOC2 | Admin preview of a system-email template can render an override that will never apply to a delivered email | `app/models/organization.rb`:1222 |
| LL-01b4c578db |  | medium | SOC2 | Production edge protection (WAF and rate limiting) not fully enforced (details withheld) | `scripts/gcp/phase5-frontend-lb.sh`:98 |
| LL-01cff88aeb |  | medium |  | indexeddbshim 6.1.0 declares sync-promise and websql as https GitHub branch refs, which the lockfile pins as git+ssh commit refs with no integrity hash, outside npm registry advisory tooling | `app/frontend/package-lock.json`:17721 |
| LL-047959b17a |  | medium | FERPA, HIPAA, GDPR | System-email content overrides resolve from the enqueueing context host, never from the recipient or the recipient organization | `lib/system_email_templates.rb`:5 |
| LL-07f1869d92 |  | medium | GDPR, COPPA, FERPA | SubscriptionMailer#new_subscription sends a user's IP address to iplocate.io with no user-type or consent gate, to a third party absent from the subprocessor register (GDPR Art. 28/44, COPPA) | `app/mailers/subscription_mailer.rb`:30 |
| LL-09afedd3a5 |  | medium | SOC2 | Nonprod workload identity isolation between n8n and the staging and dev app (details withheld until remediation is verified) | (attestation) |
| LL-0c6e931f47 |  | medium | WCAG | Sentence box (utterance bar) symbol chip images have no alt attribute | `app/frontend/app/templates/components/button-list.hbs`:21 |
| LL-0d54bcb32c |  | medium | SOC2, HIPAA | Production Cloud SQL instance accepts unencrypted connections (ssl mode allows unencrypted) and is provisioned with no SSL enforcement flag | `scripts/gcp/phase3-data-layer.sh`:252 |
| LL-107c9fb665 |  | medium | SOC2 | Render blueprint auto-deploys web/worker on every push to staging without requiring CI to pass | `render.yaml`:6 |
| LL-1189af1b3c |  | medium | HIPAA, SOC2 | ai-endpoint-guard.sh only checks a 4-file hardcoded SEAMS allowlist, not a repo-wide scan, so a new AI-integration file would bypass CI enforcement of the no-direct-Anthropic-client control that ten docs/legal/ documents reference as covering "any runtime seam" (6 currently live/attested, 4 superseded) | `scripts/ai-endpoint-guard.sh`:28 |
| LL-13ad11eaee |  | medium | WCAG | Loading status text has no aria-live or role=status | `app/frontend/app/templates/bento.hbs`:14 |
| LL-14edf1a801 |  | medium | GDPR, FERPA | DataPolicyEnforcer retention job skips child orgs that inherit (rather than set) a retention_months policy | `lib/data_policy_enforcer.rb`:22 |
| LL-171938b2b9 |  | medium | WCAG | Shared-message speak target is a div with a click handler and no keyboard semantics | `app/frontend/app/templates/utterance.hbs`:31 |
| LL-1bb85a2ef5 |  | medium |  | bootstrap 3.4.1 (EOL, no upstream patches) remains a production dependency; supply-chain exposure beyond the already-fixed XSS | `app/frontend/package.json`:36 |
| LL-1e2ab28aab |  | medium | GDPR, FERPA | Hard delete leaves LogSnapshot records undeleted (GDPR right-to-erasure) | `app/models/log_snapshot.rb`:11 |
| LL-1e7b568ef3 |  | medium | SOC2, HIPAA | Committed WIF provisioning script omits the assertion.ref branch lock the deploy pipeline names as a control, and reconciles (overwrites) the live provider on every re-run | `scripts/gcp/phase1-setup.sh`:329 |
| LL-1e8abb7d59 |  | medium | SOC2, HIPAA, FERPA | Failed authentication attempts produce no AuditEvent and no security log line, so credential-stuffing and password-guessing are undetectable after the fact | `app/controllers/session_controller.rb`:568 |
| LL-20703f4fa8 |  | medium | GDPR, HIPAA, FERPA | AiApiLog.error_message is assigned raw provider exception text into an unbounded column and is excluded from the before_validation scrub that covers the request and response summaries | `app/models/ai_api_log.rb`:90 |
| LL-21541a9ab9 |  | medium | SOC2, FERPA, HIPAA | Infrastructure runbook storage-access guidance conflicts with the private-bucket model; live state unverified (details withheld) | `docs/INFRASTRUCTURE.md`:107 |
| LL-21602ee4f4 |  | medium | WCAG | Edit Board Details intro-section remove button is svg-only with no accessible name | `app/frontend/app/components/edit-board-details.hbs`:193 |
| LL-232129d521 |  | medium | SOC2 | The frontend lockfile has no integrity hash (and no resolved URL) for about half its packages, including libraries shipped in the browser bundle, and Docker and CI install with npm install rather than npm ci, so dependency bytes are not integrity-pinned at build time | `app/frontend/package-lock.json`:18731 |
| LL-29cc341f8c |  | medium | SOC2 | Client caps the prediction sync queue at 200 entries while the server rejects batches over 100, so any queue above 100 fails permanently and is never drained | `app/frontend/app/utils/word_suggestions.js`:1263 |
| LL-33d756b764 |  | medium | SOC2 | The blocking secret-detection gate downloads and executes an unpinned, unverified gitleaks binary resolved at runtime from the GitHub releases API | `.github/workflows/ci.yml`:266 |
| LL-35e6b7a3d6 |  | medium | WCAG | Dashboard search overlay text input has no programmatic label (placeholder only) | `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588 |
| LL-37860cbcfa |  | medium | SOC2 | No GitHub Action in the repository is pinned by commit digest, including the authentication action inside the production deploy job that holds id-token write permission | `.github/workflows/deploy-cloudrun.yml`:309 |
| LL-3bb2e2eaad |  | medium | GDPR, HIPAA | Retention purge deletes the LogSession's PaperTrail destroy-version and writes no disposal AuditEvent | `lib/flusher.rb`:45 |
| LL-3cfa7fd806 |  | medium | WCAG | Board Ideas (button suggestions) back button is svg-only with no accessible name | `app/frontend/app/components/button-suggestions.hbs`:81 |
| LL-40ab0aa041 |  | medium | WCAG | Batch Recording modal back buttons are svg-only with no accessible name | `app/frontend/app/components/batch-recording.hbs`:27 |
| LL-47935e1a5b |  | medium |  | lib/purchasing2.rb is a 206-line orphaned, apparently unfinished Stripe module with zero live call sites | `lib/purchasing2.rb`:1 |
| LL-49c65303af |  | medium | WCAG | Evaluation jump modal previous/next section buttons are glyph-only with no accessible name | `app/frontend/app/components/eval-jump.hbs`:12 |
| LL-52ff2a9a79 |  | medium | SOC2 | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-58130aaefe |  | medium | WCAG | Shared modal-dialog shell declares role=dialog aria-modal without aria-labelledby or aria-describedby | `app/frontend/app/components/modal-dialog.hbs`:6 |
| LL-5954bcbbe6 |  | medium | SOC2 | Pre-existing Resque background-job failures: ImageMagick identify missing in Cloud Run image, stale job_stash lookups, and a call to a removed Board method | (attestation) |
| LL-59bfd6f482 |  | medium | WCAG | Empty and hidden board-grid cells stay keyboard-focusable with no accessible name when the grid-placeholder preference is on | `app/frontend/app/models/board.js`:1747 |
| LL-5ff3b22093 |  | medium | WCAG | Legacy Bootstrap close button labeled only by a times glyph, no aria-label | `app/frontend/app/templates/board-details.hbs`:3 |
| LL-644bcbf48f |  | medium | GDPR | Attested AI Governance Memo section 8 states the Article 50 modal "is therefore shown to no one in production"; the stated rationale (flag off) is false | `docs/legal/AI_GOVERNANCE_MEMO.md`:427 |
| LL-65700d9bd8 |  | medium | SOC2 | moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch | `app/frontend/package.json`:71 |
| LL-6614b7c85a |  | medium | SOC2 | lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21) | `app/frontend/package-lock.json`:22142 |
| LL-6723438462 |  | medium | GDPR | Article 50 disclosure server-side backstop is present on only 2 of 5 AI ingresses | `app/controllers/api/word_suggestions_controller.rb`:19 |
| LL-69a7f62551 |  | medium | SOC2, HIPAA, FERPA | Brute-force protection on login is per-source-IP only at roughly 400 attempts/minute, with no per-account lockout, backoff, or velocity control | `config/initializers/throttling.rb`:6 |
| LL-6cea3b4787 |  | medium | FERPA, GDPR | focus_generated_words_usage writes caller-supplied words into any AiFocusWordSet with no ownership or tenant check | `app/controllers/api/integrations_controller.rb`:178 |
| LL-70abe7d9a9 |  | medium | WCAG | Icon-only remove button named only by a non-i18n title attribute | `app/frontend/app/templates/share-board.hbs`:101 |
| LL-7181a16033 |  | medium | SOC2, HIPAA | No scheduled reconciler detects Cloud Run configuration drift introduced outside the deploy workflow, the exact path that once silently disabled the Bedrock BAA account assertion | `.github/workflows/deploy-cloudrun.yml`:270 |
| LL-71f2ba5536 |  | medium |  | stats/parts-of-speech-flow.js + .hbs (Google Charts Sankey component) is orphaned, apparently superseded by stats/parts-of-speech-pie | `app/frontend/app/components/stats/parts-of-speech-flow.js`:1 |
| LL-7296ada5da |  | medium | SOC2, HIPAA, FERPA | The admin_token cookie that gates the Resque admin console is set without HttpOnly, so any XSS can steal an admin console session | `app/controllers/session_controller.rb`:250 |
| LL-7314b5a8ea |  | medium | HIPAA | Render Key Value instance is plaintext and shared by prod-fallback, staging, dev, and PR previews | `render.yaml`:107 |
| LL-7784f74447 |  | medium | GDPR | Attested AI Governance Memo makes an unevidenced population claim ("because prod carries no real EU users") load-bearing for deferring the Article 50 gate -- an EVIDENCE-BASIS defect, not a falsified fact | `docs/legal/AI_GOVERNANCE_MEMO.md`:274 |
| LL-779490b63e |  | medium | GDPR, FERPA | Thumbnail erasure fallback is bounded/best-effort and cannot reliably distinguish absence, sequence gaps, or transient deletion failure | `lib/uploader.rb`:309 |
| LL-78d380b5a9 |  | medium | WCAG | Focus Words modal remove-set button is glyph-only with no accessible name | `app/frontend/app/components/focus-words.hbs`:180 |
| LL-7d50b089c9 |  | medium |  | BoardVersion/UserVersion history payloads use raw PaperTrail `version.id` instead of the repo's `global_id` string convention | `lib/json_api/board_version.rb`:10 |
| LL-83a5c576af |  | medium | SOC2, HIPAA | Production load balancer TLS policy does not match the attested in-transit encryption statement (details withheld) | `scripts/gcp/phase5-frontend-lb.sh`:267 |
| LL-83f6a3864b |  | medium | WCAG | Shared BoundSelect dropdown renders role=listbox with no accessible name | `app/frontend/app/components/bound-select.hbs`:13 |
| LL-84c67d758d |  | medium | WCAG | The terms-agree modal invokes ModalDialog without labelledBy, so the dialog ships with role dialog and aria-modal but no accessible name, and the title id added for that purpose is orphaned | `app/frontend/app/components/terms-agree.hbs`:1 |
| LL-870ef62cd9 |  | medium | WCAG | Badge Image modal close button has only a non-descriptive name (the times glyph) | `app/frontend/app/components/badge-image.hbs`:3 |
| LL-8990c53bad |  | medium | GDPR, COPPA | AiFocusWordSet retains seed_user_global_id and prompt text after the seeding user's account is erased | `app/models/ai_focus_word_set.rb`:75 |
| LL-8fab55372e |  | medium | WCAG | Speak-bar remote-modeling (#reply_icon) button has no accessible name | `app/frontend/app/templates/application.hbs`:148 |
| LL-92ae18cc4e |  | medium | FERPA, COPPA, HIPAA | anonymous_logs export job writes each publishing user's username to stdout, bypassing the PII-scrubbing log formatter | `app/models/log_session.rb`:2111 |
| LL-959d76ecfc |  | medium | WCAG | Authenticated Home landing jumps from h1 straight to h3 with no h2 | `app/frontend/app/components/dashboard/authenticated-view.hbs`:187 |
| LL-96f552d34d |  | medium |  | The entire onboarding setup wizard (controllers/setup.js, templates/setup.hbs, templates/setup-footer.hbs, and all 38 files under app/frontend/app/components/setup/) has had zero reachable UI entry point since routes/setup.js's 2026-08-15 blanket redirect -- broader and more current than the allowlist-based reasoning in LL-c95c637f00 | `app/frontend/app/controllers/setup.js`:30 |
| LL-a1061c1814 |  | medium | WCAG | Modern speak view Recent Phrases items speak on click but are not focusable or keyboard-operable | `app/frontend/app/templates/user/board-detail.hbs`:3611 |
| LL-a167848115 |  | medium | GDPR, COPPA, FERPA | Text-to-speech posts raw user text to subprocessors absent from the register (Abair has no DPA; Google TTS flow unrowed) (GDPR Art. 28/44) | `lib/tts.rb`:30 |
| LL-ab88513735 |  | medium |  | User model declares is_admin attribute but Rails JSON builder never emits it | `app/frontend/app/models/user.js`:40 |
| LL-ac1d12bf3f |  | medium | COPPA, GDPR | User::PRIVACY_POLICY_VERSION is written into consent records but never compared against them, so a material privacy-policy change re-prompts nobody | `app/models/user.rb`:29 |
| LL-ad67eecb9c |  | medium | GDPR | Attested AI Governance Memo describes the deliverable as the "EU-gated" disclosure modal; the gate is fail-safe OPEN, so non-EU and unknown-jurisdiction users are also in scope | `docs/legal/AI_GOVERNANCE_MEMO.md`:260 |
| LL-b06f063f85 |  | medium | WCAG | Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name | `app/frontend/app/templates/components/modal-dialog.hbs`:6 |
| LL-b19ce17eaa |  | medium | WCAG | ModernSelect dropdown renders role=listbox with no accessible name | `app/frontend/app/components/modern-select.hbs`:14 |
| LL-b3e3a0b99c |  | medium | GDPR, COPPA | Live AI consent disclosure asserts "EU AI Act Article 50 record-keeping" as the legal basis for the five-year AiApiLog retention window, to a data subject | `lib/lingo_linq/ai_consent_disclosures.rb`:139 |
| LL-b5ac82d846 |  | medium | GDPR, FERPA, COPPA, HIPAA | ButtonSound transcription hardcodes languageCode 'en', so a non-English communicator's voice recording is uploaded to Google Speech-to-Text and transcribed as English: personal voice data is processed for a purpose it cannot achieve (GDPR Art. 5(1)(c) minimisation, Art. 5(1)(d) accuracy) | `app/models/button_sound.rb`:64 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-c4566fa37f |  | medium | GDPR, FERPA | A ButtonSound/UserVideo record erased mid-transcode, or before/after a lost SNS completion webhook, can leave transcoded output and thumbnails in S3 with no surviving application metadata for the erasure sweep to discover (GDPR Art. 17 / FERPA) | `lib/transcoder.rb`:36 |
| LL-c667ec15e3 |  | medium | SOC2 | The read-only finders' PreToolUse write-blocker and PostToolUse examination logger are not attached when /audit-run spawns finders as team teammates, so commands the guard denies ran unblocked in this run | `.claude/skills/audit-run/SKILL.md`:71 |
| LL-caaf8e20ec |  | medium | SOC2 | lingolinq_admin site-admin account carries a simple, memorable seeded password (deliberate for pre-cutover hands-on testing); must be rotated, disabled, or replaced with a break-glass admin procedure before the GCP environment is customer-facing | (attestation) |
| LL-caf2528468 |  | medium | GDPR, FERPA | UserExtra/UserLink profile-history caches are not invalidated when the source profile LogSession is deleted | `app/models/user_extra.rb`:58 |
| LL-cde54765c6 |  | medium | FERPA, HIPAA, SOC2 | Masquerade shows no on-screen indication of whose account is being operated | `app/controllers/application_controller.rb`:182 |
| LL-ce68ceb1b5 |  | medium | GDPR | Attested AI Governance Memo states the Phase 4 helper "un-inerts the EU log-retention purge" which "now matches jurisdiction = EU rows"; in production it matches none | `docs/legal/AI_GOVERNANCE_MEMO.md`:283 |
| LL-d033b27acd |  | medium | SOC2 | The document register anchors its overdue-for-review window to meta.generatedDate rather than the current date, so the rendered register printed none overdue while two records were genuinely past their review dates | `scripts/document-register-render.rb`:154 |
| LL-d3f41e7a67 |  | medium | SOC2, HIPAA, FERPA | Production Cloud SQL instance has deletion protection disabled and is provisioned without it, while automated deploys apply migrations with no pre-migration backup step | `scripts/gcp/phase3-data-layer.sh`:255 |
| LL-db6bc3e568 |  | medium | GDPR | Attested Data Retention Schedule states the EU AiApiLog purge "matches EU rows wherever Phase 4 is deployed"; in production it matches none | `docs/legal/DATA_RETENTION.md`:33 |
| LL-e08bd45a9f |  | medium | WCAG | Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name | `app/frontend/app/templates/application.hbs`:86 |
| LL-e0ea356243 |  | medium |  | Four Ember stats components (stats/num-rows1..4.js) have no template and zero references anywhere | `app/frontend/app/components/stats/num-rows1.js`:7 |
| LL-e2301adc02 |  | medium | WCAG | Classic speak view word-prediction symbol images have no alt attribute | `app/frontend/app/templates/user/board-alt/index.hbs`:59 |
| LL-ea07a705d1 |  | medium | GDPR | Attested AI Governance Memo states "the whole path is inert until the flag is enabled"; the flag is enabled in production, so the path is not inert | `docs/legal/AI_GOVERNANCE_MEMO.md`:269 |
| LL-eadbb442c2 |  | medium | SOC2, FERPA, HIPAA | Stored system-email templates are evaluated as server-side ERB behind a regex denylist that fails open | `lib/system_email_template_security.rb`:4 |
| LL-ebd844a7d0 |  | medium | FERPA | Permanent, non-expiring User#user_token still login-serialized and accepted by logged legacy token fallbacks | `lib/json_api/user.rb`:41 |
| LL-ed914bded3 |  | medium | WCAG | Raw low-contrast brand token used as text foreground (board-tile language pill) | `app/frontend/app/styles/app.scss`:193 |
| LL-f171af92ff |  | medium | FERPA, HIPAA, COPPA | PredictionEntry stores AAC vocabulary content in plaintext columns without secure_serialize | `app/models/prediction_entry.rb`:3 |
| LL-f29ce6ca22 |  | medium | GDPR | Attested AI Governance Memo states the Article 50 disclosure modal is "built and staged, gated OFF, not yet enabled for any user"; the production flag is in fact ENABLED via the default_enabled_features DB Setting | `docs/legal/AI_GOVERNANCE_MEMO.md`:261 |
| LL-f2a8ee5715 |  | medium |  | indexeddbshim's optional Node-only sqlite3/websql polyfill chain resolves tar 4.4.19, flagged critical by npm audit (GHSA-23hp-3jrh-7fpw decompression DoS, plus multiple high path-traversal advisories); install-time only, not in the shipped browser bundle | `app/frontend/package-lock.json`:24755 |
| LL-fba170716e |  | medium | SOC2 | The SNS callback logs the full payload before verifying it on the SMS branch, performs no signature verification at all on the SubscriptionConfirmation branch, and reads the request body with no size bound | `app/controllers/api/callbacks_controller.rb`:15 |
| LL-fe5150389d |  | medium | WCAG | New User modal close button has only a non-descriptive name (the times glyph) | `app/frontend/app/components/new-user.hbs`:3 |
| LL-ffdd40d2e9 |  | medium | FERPA, HIPAA, GDPR | Team-message notification email embeds the full message body, the communicator's display name, and a deep link to their log, with no recipient-scoped content control | `app/views/user_mailer/log_message.text.erb`:4 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:945 |
| LL-0196a680c5 |  | low |  | Ember UserGoal model declares scalar user_id/video_id/template_id attrs that JsonApi::Goal never emits as top-level keys | `app/frontend/app/models/goal.js`:19 |
| LL-208e8f1317 |  | low |  | dbman.js swallows three different IndexedDB errors with a bare `debugger;` and no other handling | `app/frontend/app/utils/dbman.js`:390 |
| LL-23675d9ca4 |  | low | SOC2, HIPAA | ruby-openai sits in the Gemfile :default group with no runtime consumer, so Bundler.require makes OpenAI::Client a live constant in every production web and worker process | `Gemfile`:109 |
| LL-30236919f6 |  | low |  | Bare `debugger;` statement left in a live persistence-sync promise-rejection handler | `app/frontend/app/utils/persistence.js`:2402 |
| LL-3483c28f3c |  | low | SOC2 | Parallel finders read live infra without synchronization (possible inconsistent snapshot) | `.claude/skills/audit-run/SKILL.md`:33 |
| LL-3a1c317a88 |  | low | HIPAA, FERPA | Eval narration has no licensed-clinician gate (classified NOT a HIPAA Healthcare Activity) | `app/controllers/api/eval_sessions_controller.rb`:60 |
| LL-40f3571b19 |  | low | SOC2 | Sentry release tagging reads a Render-only environment variable, so production error events on Cloud Run carry no release attribution | `config/initializers/sentry.rb`:367 |
| LL-4574005612 |  | low | WCAG | Preferences dropdown menu references a nonexistent id via aria-labelledby (dLabel) | `app/frontend/app/templates/user/preferences.hbs`:163 |
| LL-45bdcc73c9 |  | low | SOC2 | Developer key expiration policy is undecided; DeveloperKey records never age out (item 3) | `lib/flusher.rb`:48 |
| LL-5038e6834e |  | low | HIPAA, SOC2 | ai-endpoint-guard.sh is a lexical scan with a stated residual bypass tail: fully dynamic constant resolution, non-ENV credential reads, and injected clients are undetectable, so the control proves lexical absence rather than egress containment | `scripts/ai-endpoint-guard.sh`:548 |
| LL-51da4fca1d |  | low | FERPA, HIPAA, GDPR, SOC2 | EvalNarrator took its model from an unconstrained EVAL_NARRATOR_MODEL env var with no allowlist for ~2 months (2026-05-12 to 2026-07-19) | `lib/eval_narrator.rb`:54 |
| LL-553fdc242b |  | low | SOC2 | davidshimjs-qrcodejs 0.0.2 is abandoned (no release since 2014, >10 years) | `app/frontend/package.json`:36 |
| LL-57e9beb87f |  | low | GDPR, FERPA | Flusher.flush_leftovers has no usage-based orphan check for orphaned ButtonImage/ButtonSound media records (item 1) | `lib/flusher.rb`:57 |
| LL-58edfeac0f |  | low | WCAG | Classic board-alt edit-mode tile symbol img lacks the alt that was fixed in templates/board/index.hbs | `app/frontend/app/templates/user/board-alt/index.hbs`:123 |
| LL-5a173ce87f |  | low |  | Utterance Rails builder emits created_at but Ember model declares timestamp instead | `app/frontend/app/models/utterance.js`:15 |
| LL-5a240e46f5 |  | low |  | setup/done.js + .hbs (a wizard completion screen) is orphaned: not in any setup page list, so unreachable even if the retired wizard is revived | `app/frontend/app/components/setup/done.js`:3 |
| LL-5ae3d7ca2c |  | low | SOC2 | ci.yml declares no top-level permissions block; GITHUB_TOKEN inherits repo-default scope for all jobs (incl. one running downloaded gitleaks) | `.github/workflows/ci.yml`:1 |
| LL-5d2436fce2 |  | low |  | Board model declares an Ember Data `images` hasMany relationship that the serializer always strips before it can populate | `app/frontend/app/models/board.js`:899 |
| LL-5d7197fa7d |  | low | HIPAA, FERPA | PaperTrail versions with unconstantizable item_type are detected but retention disposition is undecided | `lib/flusher.rb`:135 |
| LL-5e7676187f |  | low |  | indexeddbshim is pinned to a stale major (^6.1.0, ~10 majors behind latest 16.1.0) in the production bundle | `app/frontend/package.json`:70 |
| LL-5f0f4f52f8 |  | low | SOC2 | Audit system files (.claude/) are not in any finder scan scope (no self-audit) | `.claude/agents/infra-auditor.md`:62 |
| LL-60bde5db7a |  | low |  | websocket-driver 0.7.4 (critical, GHSA-xv26-6w52-cph6 message-corruption via protocol length headers) is pulled in by ember-cli's live-reload dev server (tiny-lr -> faye-websocket), not the shipped app | `app/frontend/package-lock.json`:26105 |
| LL-62d0cd75e6 |  | low | WCAG | Legacy board route word-prediction symbol images have no alt attribute | `app/frontend/app/templates/board/index.hbs`:59 |
| LL-63377adbd2 |  | low |  | jquery-minicolors ^2.1.10 (devDependency) appears unmaintained (no upstream release in years, jQuery-plugin era) | `app/frontend/package.json`:85 |
| LL-6447a21503 |  | low |  | Organization model declares total_extras attribute but Rails builder never emits it | `app/frontend/app/models/organization.js`:42 |
| LL-8ad71e0e49 |  | low | SOC2 | Production Memorystore Redis is Basic tier with persistence disabled, so a node failure or maintenance flush silently drops every queued Resque job | `scripts/gcp/phase3-data-layer.sh`:95 |
| LL-8bc8f025a7 |  | low | WCAG | Dropdown menus reference a nonexistent id via aria-labelledby (dLabel) in the app shell | `app/frontend/app/templates/application.hbs`:386 |
| LL-8c9d45941f |  | low |  | ember-shepherd 17.3.1 (production guided-tour addon) pulls shepherd.js 14.5.1 -> deepmerge-ts 7.1.5, flagged high by npm audit for GHSA-ggr8-5vv4-36mx (stack exhaustion merging recursive object graphs); fix needs a semver-major ember-shepherd bump | `app/frontend/package.json`:73 |
| LL-94e57af291 |  | low | SOC2 | ANTHROPIC_API_KEY was de-scoped from the runtime mount but is still an actively-provisioned app secret in the GCP setup scripts, and nothing in the change revokes or disables it | `scripts/gcp/phase4-seed-app-secrets.sh`:66 |
| LL-97f9001bb4 |  | low | SOC2 | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
| LL-a2b45c2bcb |  | low | SOC2 | Finder agent-memory (memory: project) may carry process state across audit runs | `.claude/agents/infra-auditor.md`:7 |
| LL-abd6c88733 |  | low | SOC2 | Prod SES mail has no custom MAIL FROM domain, so SPF does not align with the From: domain and DMARC rests on DKIM alone; no Authentication-Results headers have ever been captured to confirm the SPF/DKIM/DMARC result on a delivered message | (attestation) |
| LL-ba0585ab93 |  | low | SOC2, HIPAA, FERPA | Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full | `config/database.yml`:26 |
| LL-bdc3344942 |  | low | SOC2, HIPAA, GDPR, FERPA | GEMINI_API_KEY is still mounted into every prod web and worker container with no runtime consumer and, unlike ANTHROPIC_API_KEY, no CI guard against a seam starting to read it | `.github/workflows/deploy-cloudrun.yml`:237 |
| LL-c226391436 |  | low | SOC2 | Content-Security-Policy is report-only (nothing blocked) and script-src permits unsafe-inline + unsafe-eval | `config/initializers/content_security_policy.rb`:114 |
| LL-c259638711 |  | low | COPPA, FERPA, HIPAA, GDPR | AiApiLog request_summary for word prediction records the scrubbed sentence but omits the scrubbed topic | `lib/ai_word_predictor.rb`:165 |
| LL-c95c637f00 |  | low |  | setup/extra-supervisors.js + .hbs component has zero references anywhere | `app/frontend/app/components/setup/extra-supervisors.js`:3 |
| LL-cbaf7afddd |  | low |  | Ember LogSession model declares scalar user_id/video_id/goal_id/notify attrs that JsonApi::Log never emits as top-level keys | `app/frontend/app/models/log.js`:34 |
| LL-d4facdbeac |  | low |  | Organization model's offboarding_under_13/offboarding_under_16 attrs are computed and sent on every offboarding save but never read anywhere server-side | `app/frontend/app/models/organization.js`:64 |
| LL-d8072299bf |  | low | GDPR, COPPA | Automated retention only runs for org-sponsored users; standalone accounts keep communication logs indefinitely | `lib/data_policy_enforcer.rb`:22 |
| LL-dbdcfb466c |  | low | SOC2 | The Notion sync workflows declare no permissions block, so jobs holding a third-party Notion API token inherit the repository-default GITHUB_TOKEN scope | `.github/workflows/sync-findings-to-notion.yml`:31 |
| LL-de9c94bf36 |  | low | GDPR | Org retention policy purges a sponsored user's entire log history, including logs outside that org's context | `lib/data_policy_enforcer.rb`:31 |
| LL-e066ea6fa3 |  | low | SOC2 | http-proxy 1.18.1 (EOL, last release 2021) has CVE-2024-21943 (ReDoS via Host header); dev-only | `app/frontend/package.json`:64 |
| LL-e14ca0ff04 |  | low | SOC2 | Finder agents are given a project-memory write policy they cannot execute, because the read-only toolset and the PreToolUse guard both block the write | `.claude/agents/infra-auditor.md`:4 |
| LL-e76d6378b5 |  | low |  | Webhook model declares notifications and content_type attrs that Rails never serializes | `app/frontend/app/models/webhook.js`:12 |
| LL-ebb4be7b73 |  | low |  | create-board route always redirects in beforeModel, making its own template permanently unreachable | `app/frontend/app/routes/create-board.js`:13 |
| LL-f553847b7a |  | low |  | setup/extra-reports.js + .hbs component has zero references anywhere (same allowlist-miss mechanism as LL-c95c637f00) | `app/frontend/app/components/setup/extra-reports.js`:3 |
| LL-f6be45aec6 |  | low | WCAG | Authenticated navbar dropdown menu references a nonexistent id via aria-labelledby (dLabel) | `app/frontend/app/components/app-navbar-authenticated-inner.hbs`:126 |
| LL-fba16b6fd7 |  | low | WCAG | Saved Phrases icon-only action buttons carry hard-coded English aria-labels | `app/frontend/app/components/phrases.hbs`:47 |
| LL-941001ca58 | Dep-eslint-8-eol | low | SOC2 | eslint 8.57.1 is EOL (v8 end-of-life); dev toolchain on an unsupported linter | `app/frontend/package.json`:64 |
| LL-a97357136e | P2-2 | low | SOC2 | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | License model lacks Processable concern | `app/models/license.rb`:1 |

## Notes

- **Source of truth:** the git register. This page is a generated read-only summary; it
  carries no evidence snippets, no finding notes, and no student/patient data.
- **Filtered by STATUS, not disposition.** This page lists findings whose `status` is `open`
  or `remediated-unverified`; status `verified-closed`, `accepted-risk`, and `superseded` are
  intentionally omitted. Disposition is a separate, Scot-owned axis, so a row listed here may
  still carry a disposition of `accepted`, `wontfix`, or `dismissed-false-positive`. Presence
  on this page means the finding is not yet closed; it does NOT mean it is untriaged. See
  `audit-reports/FINDINGS.md` for the full lifecycle.
- **Compliance Posture Report** (`docs/legal/COMPLIANCE_POSTURE_REPORT.md`) is **CEO-attested**
  (Scot Wahlquist, 2026-06-19); it is linked from this summary, never embedded. External
  distribution remains the CEO's decision at attestation time.
