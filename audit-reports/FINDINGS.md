# LingoLinq-AAC Findings Register

> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.

**Audited:** `compliance/scot-q3-makeup-run-20eb9dd6 (== origin/develop tip 070b5e614 at run start, 2026-10-31 UTC). PARTIAL COVERAGE, pending Scot attestation: Q3 make-up pass (rev-audit-run-q3-makeup). The fan-out gate passed for all six finders (checklists, read-only guard, examination logger). bundle-audit and npm audit ran; a partial read-only AWS account-level read (three regions, some services not read) and a live browser accessibility check were taken. Not stamped full because every finder still reports areas it did not reach; those are listed in the private run record, and no screen reader, switch or eye-gaze testing was done.` @ `070b5e614071aec8fd917fa4b4067f5412460614` on 2026-10-31  
**Seed:** audit-reports/unified-audit-2026-04-09.md  
**Headline (open + remediated-unverified):** 2 Critical / 50 High

Statuses are verified against live code at the audited SHA, not copied from the dated report prose. Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition. Disposition (triage) is orthogonal to status: a finding can be `open` yet `dismissed-false-positive`/`wontfix`/`accepted`; blank reads as `untriaged`.

## Open (359)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-1baffd92d5 |  | critical | FERPA, COPPA, GDPR, SOC2 | untriaged | pr-review | Organization account-claim authorization weakness (details withheld until remediation is verified) | `app/controllers/api/organizations_controller.rb`:245 |
| LL-ae4e34bce0 |  | critical | GDPR, FERPA, COPPA | untriaged | audit-run | Compliance finding (details withheld until remediation is verified) | `app/models/user.rb`:1 |
| LL-104bfa61dc |  | high | WCAG | untriaged | audit-run | Terms-agree modal is unreachable by switch scanning (no .modal_targets / .btn, opened without scannable) | `app/frontend/app/components/terms-agree.hbs`:27 |
| LL-53cb93fab1 |  | high | GDPR, FERPA | untriaged | audit-run | Terms-agree modal can be silently replaced by intro before the user agrees | `app/frontend/app/routes/index.js`:132 |
| LL-e8614c103f |  | high | GDPR, FERPA, COPPA | untriaged | audit-run | PredictionEntry rows survive account deletion, retaining per-user AAC vocabulary sequences indefinitely | `app/models/prediction_entry.rb`:4 |
| LL-c0b3d59f58 |  | high | SOC2, HIPAA, FERPA | **accepted** ⚠regression | audit-run | Production GCP project least-privilege regression for human principals (details withheld until remediation is verified) | `scripts/gcp/phase1-setup.sh`:249 |
| LL-0b5443f43b |  | high | SOC2, HIPAA | untriaged | audit-run | Production Cloud Run service is deployed with public ingress, so the direct run.app URL bypasses the load balancer and its attached Cloud Armor policy | `scripts/gcp/phase5-frontend-lb.sh`:490 |
| LL-5617f4e17d |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | No server-side password strength policy exists; the only minimum-length check is a 6-character Ember computed property, bypassable by a direct API call | `app/frontend/app/controllers/register.js`:217 |
| LL-5f0a016e2b |  | high | SOC2, HIPAA | untriaged | audit-run | Attested AI Governance Memo states the Bedrock runtime AI path is "not operational since" revision 00014-5rw; credentials were re-mounted 53 minutes later and the path carries user-attributed traffic | `docs/legal/AI_GOVERNANCE_MEMO.md`:499 |
| LL-3bfc56ef4b |  | high | HIPAA, SOC2 | untriaged | pr-review | ALLOWED_RUNTIME_MODELS is an in-process application gate and cannot constrain direct AWS API or CLI use of the same Bedrock runtime credential | `lib/ai_client.rb`:83 |
| LL-4f1eb5fd0a |  | high | SOC2 | untriaged | pr-review | Lesson#check_url fetches a user-supplied URL with raw Typhoeus and unbounded redirect following, bypassing the repository's own SafeHttp DNS/IP and redirect validation | `app/models/lesson.rb`:146 |
| LL-135ee6ca59 |  | high | COPPA, GDPR, FERPA | untriaged | pr-review | User#ai_consent_granted? has no runtime caller, so the separate AI data-sharing consent promised to parents on the privacy page is never enforced by the AI feature gate | `lib/feature_flags.rb`:242 |
| LL-c7bbfa452a |  | high | COPPA, FERPA | untriaged | pr-review | School-authorized account creation skips the COPPA block entirely, so settings coppa is never written and the under-13 AI gate that reads it passes for exactly the accounts it was written to protect | `app/models/user.rb`:2423 |
| LL-933e61efd7 |  | high | GDPR, FERPA, COPPA | untriaged | pr-review | Five specific retention and deletion promises on the public privacy page have no implementing mechanism, and the scheduled jobs that would partially back them were not run by the production scheduler from 2026-07-21 to 2026-09-02 | `app/frontend/app/templates/privacy.hbs`:97 |
| LL-400adcead5 |  | high | GDPR, COPPA | untriaged | pr-review | PR #901 machine-translated the AI data-sharing, Article 50, COPPA and retention disclosures into twelve locale files, and the guard that checks those claims covers only English and Spanish, by its own admission | `spec/support/ai_disclosure_claims.rb`:79 |
| LL-06d36ffeeb |  | high | GDPR, FERPA, COPPA, HIPAA | untriaged | pr-review | Board translation writes raw user-authored label text into the global word_data dictionary, which has no user_id or organization_id: translated personal labels are served cross-account as cache hits and survive account erasure (GDPR Art. 5(1)(f)/17, FERPA, district data isolation) | `app/models/word_data.rb`:858 |
| LL-10409152d2 |  | high | GDPR, FERPA, COPPA, HIPAA, SOC2 | untriaged | pr-review | The 2026-08-08 quarterly subprocessor review claims every external host in lib/, app/models/, app/controllers/ and config/ was enumerated and found only two omissions, but at least five further live third-party egress paths are absent from the register (Google Maps Places, OpenSymbols, workshop.openaac.org, YouTube, Zendesk) | `docs/legal/2026-08-16_subprocessor-register.md`:120 |
| LL-a6be800a86 |  | high | COPPA, FERPA, GDPR | untriaged | manual | Full user export archive, including non-anonymized log data, is stored under an S3 key derived only from the username and a minute-granularity timestamp | `lib/exporter.rb`:94 |
| LL-ed9316b6d9 |  | high | FERPA, COPPA, GDPR | untriaged | audit-run | Word-prediction selections are stored under device-global keys and synced to whichever account holds the token at flush time, so one communicator's vocabulary is written into another's server-side prediction profile | `app/frontend/app/utils/word_suggestions.js`:19 |
| LL-a8351c5b00 |  | high | GDPR, HIPAA, FERPA | untriaged | pr-review | PiiScrubber log redaction never matches E.164 phone numbers and, contrary to its own docstring, fails the parenthesized form | `lib/pii_scrubber.rb`:37 |
| LL-cb9f9c865a |  | high | GDPR, HIPAA, FERPA | untriaged | pr-review | RemoteTarget rows survive account deletion, retaining a phone-number hash beside the per-row salt that reverses it (right-to-erasure gap) | `lib/flusher.rb`:470 |
| LL-89b97af30f |  | high | SOC2 | untriaged | pr-review | Lesson usages permission grant lets a viewer self-grant edit: assign is gated on 'view', and assigning the lesson to one's own org adds a usages entry that the permission block then reads as an edit grant | `app/models/lesson.rb`:61 |
| LL-5d856983bf |  | high | SOC2 | untriaged | pr-review | Lesson URL handling lacks destination restrictions (details withheld until remediation is verified) | `app/models/lesson.rb`:81 |
| LL-57bb9f1af4 |  | high | SOC2 | untriaged | pr-review | Webhook.find_record calls constantize on an unvalidated string, reachable during Lesson permission evaluation via a malformed usages entry, raising NameError inside show/update/assign/unassign | `app/models/webhook.rb`:206 |
| LL-c11cc12f66 |  | high | COPPA, FERPA | untriaged | audit-run | COPPA parental consent flow control weakness (details withheld until remediation is verified) | `app/controllers/parental_consents_controller.rb`:28 |
| LL-9e145637b9 |  | high | GDPR | untriaged | audit-run | EU under-16 AI parental consent flow control weakness (details withheld until remediation is verified) | `app/controllers/eu_ai_parental_consents_controller.rb`:16 |
| LL-57fa21cfc2 |  | high | COPPA, FERPA | untriaged | audit-run | Under-13 offboarding: consent-pending state enforcement gap (decision pending; details withheld) | `app/models/user.rb`:674 |
| LL-e981aad7a6 |  | high | COPPA, FERPA | untriaged | audit-run | Supervisor-access consent routing for under-13 communicators (details withheld until remediation is verified) | `app/services/supervisor_consent_service.rb`:81 |
| LL-dbc950d96d |  | high | GDPR, COPPA, FERPA | untriaged | audit-run | supervisor_relationships rows are never erased when either party's account is deleted, and each keeps a plaintext copy of the consent-recipient email in consent_email_sent_to | `app/models/supervisor_relationship.rb`:7 |
| LL-85b32935c2 |  | high | SOC2, FERPA, HIPAA | untriaged | audit-run | Device session token strength (details withheld until remediation is verified) | `app/models/device.rb`:156 |
| LL-7bf58a4c53 |  | high | WCAG | untriaged | audit-run | Classic (opt-in) speak-view chrome has several icon-only controls with no accessible name (sidebar collapse, edit pencil, speak-mode notification, level +/-), two of them silent to auditory scanning | `app/frontend/app/templates/application.hbs`:1559 |
| LL-a4b5fb1445 |  | high | FERPA, GDPR, SOC2 | untriaged | manual | Organization membership authorization weakness in supervisor-key processing (details withheld until remediation is verified) | `app/models/organization.rb`:1470 |
| LL-1f83f4e778 |  | high | FERPA, SOC2 | untriaged | manual | Lesson access-control defect, fixed in code; residual-access verification pending (details withheld) | `app/models/lesson.rb`:25 |
| LL-cbc8bc4211 |  | high | GDPR, FERPA, HIPAA, COPPA, SOC2 | untriaged | manual | Impact of the 2026-07-21 to 2026-09-02 production scheduler-dispatch interruption is unassessed: what accumulated in the window, which data subjects were affected, and what residual retention and deletion work remains | `lib/tasks/scheduler.rake`:157 |
| LL-7aa646ef87 |  | high | FERPA, GDPR, SOC2 | untriaged | pr-review | The branded Drive retention render DOC-52c8c33583 stays status published in customer bundles while recorded as known-inaccurate only in a free-text register note no consumer reads | `audit-reports/DOCUMENT-REGISTER.json`:2330 |
| LL-20e90250ec |  | high | GDPR, COPPA, FERPA, HIPAA | untriaged | audit-run | Hard delete does not reach ButtonImage rows or their S3 objects for current boards, because erasure relies on a join table the app no longer writes | `lib/flusher.rb`:264 |
| LL-09ac4107c4 |  | high | GDPR, COPPA, FERPA, HIPAA | untriaged | audit-run | UserExtra rows, including cached profile summaries and focus words, survive account deletion | `app/models/user_extra.rb`:2 |
| LL-c740766308 |  | high | GDPR, COPPA, FERPA | untriaged | audit-run | TelemetryEvent's six-month purge has no caller and rows keyed to a user and device survive account deletion | `app/models/telemetry_event.rb`:59 |
| LL-b083d7b5c5 |  | high | GDPR, FERPA, HIPAA | untriaged | audit-run | ApiCall's two-month purge has no caller and per-request rows keyed to a user survive account deletion | `app/models/api_call.rb`:28 |
| LL-d0d1ef011e |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | Mandatory two-factor authentication for privileged application administrators is commented out behind a re-enable-before-production TODO | `app/models/concerns/passwords.rb`:95 |
| LL-1ff09d7f12 |  | high | WCAG | untriaged | audit-run | Ember app shell viewport meta disables pinch zoom | `app/frontend/app/index.html`:8 |
| LL-21d39970a6 |  | high | WCAG | untriaged | audit-run | Rails application layout viewport meta disables pinch zoom | `app/views/layouts/application.html.erb`:48 |
| LL-1672a7fadf |  | high | WCAG | untriaged | audit-run | Default speak-view grid exposes empty tiles as nameless role=button tab stops | `app/frontend/app/components/board-detail-grid.hbs`:124 |
| LL-cb563da6ef |  | high | WCAG | untriaged | audit-run | Authenticated navbar account menu trigger has no accessible name | `app/frontend/app/components/app-navbar-authenticated-inner.hbs`:119 |
| LL-bbf2a5404f |  | high | WCAG | untriaged | audit-run | App-shell account menu trigger has no accessible name on classic header routes | `app/frontend/app/templates/application.hbs`:1042 |
| LL-159679db04 |  | high | WCAG | untriaged | audit-run | Signed-in account menu trigger overrides the global focus ring with no replacement | `app/frontend/app/styles/app.scss`:20169 |
| LL-7314b5a8ea |  | medium | HIPAA | untriaged | audit-run | Render Key Value instance is plaintext and shared by prod-fallback, staging, dev, and PR previews | `render.yaml`:107 |
| LL-ebd844a7d0 |  | medium | FERPA | untriaged | manual | Permanent, non-expiring User#user_token still login-serialized and accepted by logged legacy token fallbacks | `lib/json_api/user.rb`:41 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | **accepted** | audit-run | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-52ff2a9a79 |  | medium | SOC2 | **accepted** ⚠regression | audit-run | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-5ff3b22093 |  | medium | WCAG | **accepted** | audit-run | Legacy Bootstrap close button labeled only by a times glyph, no aria-label | `app/frontend/app/templates/board-details.hbs`:3 |
| LL-ed914bded3 |  | medium | WCAG | **accepted** ⚠regression | audit-run | Raw low-contrast brand token used as text foreground (board-tile language pill) | `app/frontend/app/styles/app.scss`:193 |
| LL-70abe7d9a9 |  | medium | WCAG | **accepted** | audit-run | Icon-only remove button named only by a non-i18n title attribute | `app/frontend/app/templates/share-board.hbs`:101 |
| LL-13ad11eaee |  | medium | WCAG | **accepted** | audit-run | Loading status text has no aria-live or role=status | `app/frontend/app/templates/bento.hbs`:14 |
| LL-ab88513735 |  | medium |  | **accepted** | audit-run | User model declares is_admin attribute but Rails JSON builder never emits it | `app/frontend/app/models/user.js`:40 |
| LL-65700d9bd8 |  | medium | SOC2 | **accepted** | audit-run | moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch | `app/frontend/package.json`:71 |
| LL-0c6e931f47 |  | medium | WCAG | **accepted** | audit-run | Sentence box (utterance bar) symbol chip images have no alt attribute | `app/frontend/app/templates/components/button-list.hbs`:21 |
| LL-6614b7c85a |  | medium | SOC2 | **dismissed-false-positive** | audit-run | lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21) | `app/frontend/package-lock.json`:22142 |
| LL-35e6b7a3d6 |  | medium | WCAG | **accepted** | audit-run | Dashboard search overlay text input has no programmatic label (placeholder only) | `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588 |
| LL-e08bd45a9f |  | medium | WCAG | **accepted** ⚠regression | audit-run | Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name | `app/frontend/app/templates/application.hbs`:86 |
| LL-b06f063f85 |  | medium | WCAG | **accepted** | audit-run | Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name | `app/frontend/app/templates/components/modal-dialog.hbs`:6 |
| LL-8fab55372e |  | medium | WCAG | **accepted** ⚠regression | audit-run | Speak-bar remote-modeling (#reply_icon) button has no accessible name | `app/frontend/app/templates/application.hbs`:148 |
| LL-caf2528468 |  | medium | GDPR, FERPA | untriaged | audit-run | UserExtra/UserLink profile-history caches are not invalidated when the source profile LogSession is deleted | `app/models/user_extra.rb`:59 |
| LL-14edf1a801 |  | medium | GDPR, FERPA | untriaged | audit-run | DataPolicyEnforcer retention job skips child orgs that inherit (rather than set) a retention_months policy | `lib/data_policy_enforcer.rb`:101 |
| LL-3bb2e2eaad |  | medium | GDPR, HIPAA | untriaged | audit-run | Retention purge deletes the LogSession's PaperTrail destroy-version and writes no disposal AuditEvent | `lib/flusher.rb`:45 |
| LL-107c9fb665 |  | medium | SOC2 | untriaged | audit-run | Render blueprint auto-deploys web/worker on every push to staging without requiring CI to pass | `render.yaml`:6 |
| LL-1bb85a2ef5 |  | medium |  | untriaged | audit-run | bootstrap 3.4.1 (EOL, no upstream patches) remains a production dependency; supply-chain exposure beyond the already-fixed XSS | `app/frontend/package.json`:36 |
| LL-caaf8e20ec |  | medium | SOC2 | untriaged | manual | lingolinq_admin site-admin account carries a simple, memorable seeded password (deliberate for pre-cutover hands-on testing); must be rotated, disabled, or replaced with a break-glass admin procedure before the GCP environment is customer-facing | (attestation) |
| LL-58130aaefe |  | medium | WCAG | untriaged | audit-run | Shared modal-dialog shell declares role=dialog aria-modal without aria-labelledby or aria-describedby | `app/frontend/app/components/modal-dialog.hbs`:6 |
| LL-cde54765c6 |  | medium | FERPA, HIPAA, SOC2 | untriaged | manual | Masquerade shows no on-screen indication of whose account is being operated | `app/controllers/application_controller.rb`:182 |
| LL-07f1869d92 |  | medium | GDPR, COPPA, FERPA | untriaged | audit-run | SubscriptionMailer#new_subscription sends a user's IP address to iplocate.io with no user-type or consent gate, to a third party absent from the subprocessor register (GDPR Art. 28/44, COPPA) | `app/mailers/subscription_mailer.rb`:30 |
| LL-1e2ab28aab |  | medium | GDPR, FERPA | **accepted** | manual | Hard delete leaves LogSnapshot records undeleted (GDPR right-to-erasure) | `app/models/log_snapshot.rb`:11 |
| LL-f171af92ff |  | medium | FERPA, HIPAA, COPPA | untriaged | audit-run | PredictionEntry stores AAC vocabulary content in plaintext columns without secure_serialize | `app/models/prediction_entry.rb`:3 |
| LL-6cea3b4787 |  | medium | FERPA, GDPR | untriaged | audit-run | focus_generated_words_usage writes caller-supplied words into any AiFocusWordSet with no ownership or tenant check | `app/controllers/api/integrations_controller.rb`:178 |
| LL-8990c53bad |  | medium | GDPR, COPPA | untriaged | audit-run | AiFocusWordSet retains seed_user_global_id and prompt text after the seeding user's account is erased | `app/models/ai_focus_word_set.rb`:75 |
| LL-92ae18cc4e |  | medium | FERPA, COPPA, HIPAA | untriaged | audit-run | anonymous_logs export job writes each publishing user's username to stdout, bypassing the PII-scrubbing log formatter | `app/models/log_session.rb`:2205 |
| LL-1e7b568ef3 |  | medium | SOC2, HIPAA | **accepted** | audit-run | Committed WIF provisioning script omits the assertion.ref branch lock the deploy pipeline names as a control, and reconciles (overwrites) the live provider on every re-run | `scripts/gcp/phase1-setup.sh`:329 |
| LL-d3f41e7a67 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Production Cloud SQL instance has deletion protection disabled and is provisioned without it, while automated deploys apply migrations with no pre-migration backup step | `scripts/gcp/phase3-data-layer.sh`:255 |
| LL-0d54bcb32c |  | medium | SOC2, HIPAA | untriaged | audit-run | Production Cloud SQL instance accepts unencrypted connections (ssl mode allows unencrypted) and is provisioned with no SSL enforcement flag | `scripts/gcp/phase3-data-layer.sh`:252 |
| LL-7296ada5da |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | The admin_token cookie that gates the Resque admin console is set without HttpOnly, so any XSS can steal an admin console session | `app/controllers/session_controller.rb`:252 |
| LL-1e8abb7d59 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Failed authentication attempts produce no AuditEvent and no security log line, so credential-stuffing and password-guessing are undetectable after the fact | `app/controllers/session_controller.rb`:581 |
| LL-69a7f62551 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Brute-force protection on login is per-source-IP only at roughly 400 attempts/minute, with no per-account lockout, backoff, or velocity control | `config/initializers/throttling.rb`:6 |
| LL-33d756b764 |  | medium | SOC2 | untriaged | audit-run | The blocking secret-detection gate downloads and executes an unpinned, unverified gitleaks binary resolved at runtime from the GitHub releases API | `.github/workflows/ci.yml`:764 |
| LL-7181a16033 |  | medium | SOC2, HIPAA | untriaged | audit-run | No scheduled reconciler detects Cloud Run configuration drift introduced outside the deploy workflow, the exact path that once silently disabled the Bedrock BAA account assertion | `.github/workflows/deploy-cloudrun.yml`:443 |
| LL-7d50b089c9 |  | medium |  | untriaged | audit-run | BoardVersion/UserVersion history payloads use raw PaperTrail `version.id` instead of the repo's `global_id` string convention | `lib/json_api/board_version.rb`:10 |
| LL-959d76ecfc |  | medium | WCAG | untriaged | audit-run | Authenticated Home landing jumps from h1 straight to h3 with no h2 | `app/frontend/app/components/dashboard/authenticated-view.hbs`:187 |
| LL-59bfd6f482 |  | medium | WCAG | untriaged | audit-run | Empty and hidden board-grid cells stay keyboard-focusable with no accessible name when the grid-placeholder preference is on | `app/frontend/app/models/board.js`:1839 |
| LL-171938b2b9 |  | medium | WCAG | untriaged | audit-run | Shared-message speak target is a div with a click handler and no keyboard semantics | `app/frontend/app/templates/utterance.hbs`:55 |
| LL-47935e1a5b |  | medium |  | untriaged | audit-run | lib/purchasing2.rb is a 206-line orphaned, apparently unfinished Stripe module with zero live call sites | `lib/purchasing2.rb`:1 |
| LL-e0ea356243 |  | medium |  | untriaged | audit-run | Four Ember stats components (stats/num-rows1..4.js) have no template and zero references anywhere | `app/frontend/app/components/stats/num-rows1.js`:7 |
| LL-71f2ba5536 |  | medium |  | untriaged | audit-run | stats/parts-of-speech-flow.js + .hbs (Google Charts Sankey component) is orphaned, apparently superseded by stats/parts-of-speech-pie | `app/frontend/app/components/stats/parts-of-speech-flow.js`:1 |
| LL-c4566fa37f |  | medium | GDPR, FERPA | untriaged | manual | A ButtonSound/UserVideo record erased mid-transcode, or before/after a lost SNS completion webhook, can leave transcoded output and thumbnails in S3 with no surviving application metadata for the erasure sweep to discover (GDPR Art. 17 / FERPA) | `lib/transcoder.rb`:74 |
| LL-779490b63e |  | medium | GDPR, FERPA | untriaged | manual | Thumbnail erasure fallback is bounded/best-effort and cannot reliably distinguish absence, sequence gaps, or transient deletion failure | `lib/uploader.rb`:442 |
| LL-1189af1b3c |  | medium | HIPAA, SOC2 | untriaged | audit-run | ai-endpoint-guard.sh only checks a 4-file hardcoded SEAMS allowlist, not a repo-wide scan, so a new AI-integration file would bypass CI enforcement of the no-direct-Anthropic-client control that ten docs/legal/ documents reference as covering "any runtime seam" (6 currently live/attested, 4 superseded) | `scripts/ai-endpoint-guard.sh`:28 |
| LL-f29ce6ca22 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states the Article 50 disclosure modal is "built and staged, gated OFF, not yet enabled for any user"; the production flag is in fact ENABLED via the default_enabled_features DB Setting | `docs/legal/AI_GOVERNANCE_MEMO.md`:261 |
| LL-ea07a705d1 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states "the whole path is inert until the flag is enabled"; the flag is enabled in production, so the path is not inert | `docs/legal/AI_GOVERNANCE_MEMO.md`:269 |
| LL-644bcbf48f |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo section 8 states the Article 50 modal "is therefore shown to no one in production"; the stated rationale (flag off) is false | `docs/legal/AI_GOVERNANCE_MEMO.md`:427 |
| LL-7784f74447 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo makes an unevidenced population claim ("because prod carries no real EU users") load-bearing for deferring the Article 50 gate -- an EVIDENCE-BASIS defect, not a falsified fact | `docs/legal/AI_GOVERNANCE_MEMO.md`:274 |
| LL-ce68ceb1b5 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states the Phase 4 helper "un-inerts the EU log-retention purge" which "now matches jurisdiction = EU rows"; in production it matches none | `docs/legal/AI_GOVERNANCE_MEMO.md`:283 |
| LL-ad67eecb9c |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo describes the deliverable as the "EU-gated" disclosure modal; the gate is fail-safe OPEN, so non-EU and unknown-jurisdiction users are also in scope | `docs/legal/AI_GOVERNANCE_MEMO.md`:260 |
| LL-db6bc3e568 |  | medium | GDPR | untriaged | audit-run | Attested Data Retention Schedule states the EU AiApiLog purge "matches EU rows wherever Phase 4 is deployed"; in production it matches none | `docs/legal/DATA_RETENTION.md`:33 |
| LL-b3e3a0b99c |  | medium | GDPR, COPPA | untriaged | audit-run | Live AI consent disclosure asserts "EU AI Act Article 50 record-keeping" as the legal basis for the five-year AiApiLog retention window, to a data subject | `lib/lingo_linq/ai_consent_disclosures.rb`:139 |
| LL-ac1d12bf3f |  | medium | COPPA, GDPR | untriaged | manual | User::PRIVACY_POLICY_VERSION is written into consent records but never compared against them, so a material privacy-policy change re-prompts nobody | `app/models/user.rb`:29 |
| LL-ffdd40d2e9 |  | medium | FERPA, HIPAA, GDPR | untriaged | audit-run | Team-message notification email embeds the full message body, the communicator's display name, and a deep link to their log, with no recipient-scoped content control | `app/views/user_mailer/log_message.text.erb`:4 |
| LL-047959b17a |  | medium | FERPA, HIPAA, GDPR | untriaged | audit-run | System-email content overrides resolve from the enqueueing context host, never from the recipient or the recipient organization | `lib/system_email_templates.rb`:5 |
| LL-013ae2595c |  | medium | FERPA, GDPR, SOC2 | untriaged | audit-run | Admin preview of a system-email template can render an override that will never apply to a delivered email | `app/models/organization.rb`:1222 |
| LL-eadbb442c2 |  | medium | SOC2, FERPA, HIPAA | untriaged | audit-run | Stored system-email templates are evaluated as server-side ERB behind a regex denylist that fails open | `lib/system_email_template_security.rb`:4 |
| LL-20703f4fa8 |  | medium | GDPR, HIPAA, FERPA | untriaged | audit-run | AiApiLog.error_message is assigned raw provider exception text into an unbounded column and is excluded from the before_validation scrub that covers the request and response summaries | `app/models/ai_api_log.rb`:90 |
| LL-fba170716e |  | medium | SOC2 | untriaged | audit-run | The SNS callback logs the full payload before verifying it on the SMS branch, performs no signature verification at all on the SubscriptionConfirmation branch, and reads the request body with no size bound | `app/controllers/api/callbacks_controller.rb`:15 |
| LL-d033b27acd |  | medium | SOC2 | untriaged | audit-run | The document register anchors its overdue-for-review window to meta.generatedDate rather than the current date, so the rendered register printed none overdue while two records were genuinely past their review dates | `scripts/document-register-render.rb`:154 |
| LL-37860cbcfa |  | medium | SOC2 | untriaged | audit-run | No GitHub Action in the repository is pinned by commit digest, including the authentication action inside the production deploy job that holds id-token write permission | `.github/workflows/deploy-cloudrun.yml`:568 |
| LL-84c67d758d |  | medium | WCAG | untriaged | audit-run | The terms-agree modal invokes ModalDialog without labelledBy, so the dialog ships with role dialog and aria-modal but no accessible name, and the title id added for that purpose is orphaned | `app/frontend/app/components/terms-agree.hbs`:1 |
| LL-29cc341f8c |  | medium | SOC2 | untriaged | audit-run | Client caps the prediction sync queue at 200 entries while the server rejects batches over 100, so any queue above 100 fails permanently and is never drained | `app/frontend/app/utils/word_suggestions.js`:1263 |
| LL-b5ac82d846 |  | medium | GDPR, FERPA, COPPA, HIPAA | untriaged | manual | ButtonSound transcription hardcodes languageCode 'en', so a non-English communicator's voice recording is uploaded to Google Speech-to-Text and transcribed as English: personal voice data is processed for a purpose it cannot achieve (GDPR Art. 5(1)(c) minimisation, Art. 5(1)(d) accuracy) | `app/models/button_sound.rb`:64 |
| LL-c667ec15e3 |  | medium | SOC2 | untriaged | audit-run | The read-only finders' PreToolUse write-blocker and PostToolUse examination logger are not attached when /audit-run spawns finders as team teammates, so commands the guard denies ran unblocked in this run | `.claude/skills/audit-run/SKILL.md`:71 |
| LL-01b4c578db |  | medium | SOC2 | untriaged | audit-run | Production edge protection (WAF and rate limiting) not fully enforced (details withheld) | `scripts/gcp/phase5-frontend-lb.sh`:98 |
| LL-83a5c576af |  | medium | SOC2, HIPAA | untriaged | audit-run | Production load balancer TLS policy does not match the attested in-transit encryption statement (details withheld) | `scripts/gcp/phase5-frontend-lb.sh`:267 |
| LL-09afedd3a5 |  | medium | SOC2 | untriaged | audit-run | Nonprod workload identity isolation between n8n and the staging and dev app (details withheld until remediation is verified) | (attestation) |
| LL-21541a9ab9 |  | medium | SOC2, FERPA, HIPAA | untriaged | audit-run | Infrastructure runbook storage-access guidance conflicts with the private-bucket model; live state unverified (details withheld) | `docs/INFRASTRUCTURE.md`:171 |
| LL-f2a8ee5715 |  | medium |  | untriaged | audit-run | indexeddbshim's optional Node-only sqlite3/websql polyfill chain resolves tar 4.4.19, flagged critical by npm audit (GHSA-23hp-3jrh-7fpw decompression DoS, plus multiple high path-traversal advisories); install-time only, not in the shipped browser bundle | `app/frontend/package-lock.json`:24755 |
| LL-01cff88aeb |  | medium |  | untriaged | audit-run | indexeddbshim 6.1.0 declares sync-promise and websql as https GitHub branch refs, which the lockfile pins as git+ssh commit refs with no integrity hash, outside npm registry advisory tooling | `app/frontend/package-lock.json`:17721 |
| LL-e2301adc02 |  | medium | WCAG | untriaged | audit-run | Classic speak view word-prediction symbol images have no alt attribute | `app/frontend/app/templates/user/board-alt/index.hbs`:59 |
| LL-a1061c1814 |  | medium | WCAG | untriaged | audit-run | Modern speak view Recent Phrases items speak on click but are not focusable or keyboard-operable | `app/frontend/app/templates/user/board-detail.hbs`:3611 |
| LL-fe5150389d |  | medium | WCAG | untriaged | audit-run | New User modal close button has only a non-descriptive name (the times glyph) | `app/frontend/app/components/new-user.hbs`:3 |
| LL-870ef62cd9 |  | medium | WCAG | untriaged | audit-run | Badge Image modal close button has only a non-descriptive name (the times glyph) | `app/frontend/app/components/badge-image.hbs`:3 |
| LL-78d380b5a9 |  | medium | WCAG | untriaged | audit-run | Focus Words modal remove-set button is glyph-only with no accessible name | `app/frontend/app/components/focus-words.hbs`:180 |
| LL-49c65303af |  | medium | WCAG | untriaged | audit-run | Evaluation jump modal previous/next section buttons are glyph-only with no accessible name | `app/frontend/app/components/eval-jump.hbs`:12 |
| LL-40ab0aa041 |  | medium | WCAG | untriaged | audit-run | Batch Recording modal back buttons are svg-only with no accessible name | `app/frontend/app/components/batch-recording.hbs`:27 |
| LL-3cfa7fd806 |  | medium | WCAG | untriaged | audit-run | Board Ideas (button suggestions) back button is svg-only with no accessible name | `app/frontend/app/components/button-suggestions.hbs`:81 |
| LL-21602ee4f4 |  | medium | WCAG | untriaged | audit-run | Edit Board Details intro-section remove button is svg-only with no accessible name | `app/frontend/app/components/edit-board-details.hbs`:193 |
| LL-83f6a3864b |  | medium | WCAG | untriaged | audit-run | Shared BoundSelect dropdown renders role=listbox with no accessible name | `app/frontend/app/components/bound-select.hbs`:13 |
| LL-b19ce17eaa |  | medium | WCAG | untriaged | audit-run | ModernSelect dropdown renders role=listbox with no accessible name | `app/frontend/app/components/modern-select.hbs`:14 |
| LL-96f552d34d |  | medium |  | untriaged | audit-run | The entire onboarding setup wizard (controllers/setup.js, templates/setup.hbs, templates/setup-footer.hbs, and all 38 files under app/frontend/app/components/setup/) has had zero reachable UI entry point since routes/setup.js's 2026-08-15 blanket redirect -- broader and more current than the allowlist-based reasoning in LL-c95c637f00 | `app/frontend/app/controllers/setup.js`:30 |
| LL-232129d521 |  | medium | SOC2 | untriaged | audit-run | The frontend lockfile has no integrity hash (and no resolved URL) for about half its packages, including libraries shipped in the browser bundle, and Docker and CI install with npm install rather than npm ci, so dependency bytes are not integrity-pinned at build time | `app/frontend/package-lock.json`:18731 |
| LL-e0175e4711 |  | medium | SOC2, HIPAA | untriaged | manual | Compliance finding (details withheld until remediation is verified) | `config/initializers/filter_parameter_logging.rb`:1 |
| LL-8f906ab30b |  | medium | GDPR | untriaged | manual | Compliance finding (details withheld until remediation is verified) | `app/models/utterance.rb`:1 |
| LL-83b6476f45 |  | medium | GDPR, COPPA | untriaged | manual | Compliance finding (details withheld until remediation is verified) | `lib/compliance/digital_consent_age.rb`:3 |
| LL-a8d09a991c |  | medium | GDPR | untriaged | manual | Compliance finding (details withheld until remediation is verified) | `app/models/user.rb`:1 |
| LL-7ba0a698f4 |  | medium | GDPR, COPPA, FERPA | untriaged | audit-run | Account deletion creates DeletedBoard rows keyed by username that are never removed, and leaves board search text and former-username rows | `app/models/deleted_board.rb`:50 |
| LL-78995d9e3b |  | medium | GDPR, HIPAA | untriaged | audit-run | ClusterLocation IP and geolocation records have no retention mechanism against the stated 90-day window | `app/models/cluster_location.rb`:7 |
| LL-ee56fb6b86 |  | medium | HIPAA, GDPR | untriaged | audit-run | Daily version flush deletes LogSession, User and Board audit versions in weeks to months, against a six-year statement in the retention schedule | `app/models/user.rb`:4838 |
| LL-073933c7a1 |  | medium | GDPR | untriaged | audit-run | Contacts created in the marketing CRM have no removal path on account erasure, while the retention schedule says they are removed | `lib/external_tracker.rb`:100 |
| LL-2bb76d7cbc |  | medium | COPPA, FERPA | untriaged | audit-run | Error-tracker child scrubbing applies only to consent-pending accounts, not to all under-13 accounts, and the scrub path returns the event on error | `config/initializers/sentry.rb`:130 |
| LL-79e6e1b8af |  | medium | GDPR, FERPA | untriaged | audit-run | Account export omits several personal-data categories, and the full export has no user-facing route | `lib/exporter.rb`:168 |
| LL-dfdd44bcfe |  | medium | GDPR, COPPA, FERPA | untriaged | audit-run | Export archives uploaded to storage have no expiry or removal in application code and are not swept on account erasure | `lib/exporter.rb`:66 |
| LL-6ed2f9acd3 |  | medium | GDPR, FERPA | untriaged | audit-run | Export worker prints the username to stdout, past the log-scrubbing formatter | `lib/exporter.rb`:53 |
| LL-f4f58a54be |  | medium | GDPR | untriaged | audit-run | EU jurisdiction resolution reads only one organization's signal, so a co-supporting EU organization contributes nothing | `lib/eu_jurisdiction.rb`:151 |
| LL-f739052ec1 |  | medium | GDPR, FERPA, HIPAA, COPPA | untriaged | audit-run | Text-to-speech endpoint takes utterance text as a GET query parameter that is not in the log filter list | `app/controllers/api/search_controller.rb`:394 |
| LL-c1b9073225 |  | medium | GDPR, COPPA, FERPA | untriaged | audit-run | Image-search terms and board names go to third parties without PII scrubbing, and several of those vendors are absent from the subprocessor register | `lib/uploader.rb`:1142 |
| LL-fb194f479b |  | medium | GDPR, COPPA | untriaged | audit-run | New-registration admin mail sends a stored device IP to an IP-location vendor with no user-type or consent gate, and this call site is not listed in the subprocessor document | `app/mailers/user_mailer.rb`:38 |
| LL-be0ffec98b |  | medium | GDPR, HIPAA, FERPA | untriaged | audit-run | Current draft retention schedule still states CRM removal, tombstones outside live tables and legal-hold enforcement that have no implementing code | `docs/legal/2026-09-22_data-retention.md`:140 |
| LL-4f3845b278 |  | medium | SOC2, HIPAA | untriaged | audit-run | Human cloud account least privilege (details withheld until remediation is verified) | (attestation) |
| LL-9cea44263d |  | medium | SOC2, HIPAA | untriaged | audit-run | Cloud credential lifecycle management (details withheld until remediation is verified) | (attestation) |
| LL-3acc234519 |  | medium | SOC2, HIPAA | untriaged | audit-run | Cloud account security detection coverage (details withheld until remediation is verified) | (attestation) |
| LL-8cd88540d2 |  | medium | SOC2, HIPAA | untriaged | audit-run | Object storage policy hardening (details withheld until remediation is verified) | (attestation) |
| LL-93a8b5d481 |  | medium | SOC2, HIPAA | untriaged | audit-run | Cloud account configuration item (details withheld until remediation is verified) | (attestation) |
| LL-6a072010c3 |  | medium | SOC2, HIPAA | untriaged | audit-run | No recovery point objective is set and no restore exercise of the production Cloud SQL backups is recorded | `docs/legal/2026-09-22_data-retention.md`:125 |
| LL-f0df03d56f |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Database access audit depth (details withheld until remediation is verified) | `bin/audit_console`:1 |
| LL-94b76661ce |  | medium | SOC2 | untriaged | audit-run | Production alert coverage (details withheld until remediation is verified) | (attestation) |
| LL-b485f73972 |  | medium | SOC2, HIPAA | untriaged | audit-run | Runtime service identity least privilege (details withheld until remediation is verified) | (attestation) |
| LL-4e945d5b97 |  | medium | SOC2 | untriaged | audit-run | The production image build pipes a remote setup script into a root shell with no checksum and uses tag-only base images, with no image scan in the pipeline | `Dockerfile`:47 |
| LL-786b701377 |  | medium |  | untriaged | audit-run | Paginated lists without paginate_meta build next_url with only offset and per_page, dropping the request's filters; board prefetch follows it | `lib/json_api/json.rb`:57 |
| LL-2e45d9b9d4 |  | medium |  | untriaged | audit-run | Beta feedback list passes a prefix that already includes /api/v1, so meta.prefix and next_url repeat the namespace | `app/controllers/api/beta_feedback_controller.rb`:13 |
| LL-bb4dd56067 |  | medium |  | untriaged | audit-run | Purchasing.purchase error results carry a stack trace that the progress status endpoint returns to the client | `lib/purchasing.rb`:522 |
| LL-3680066211 |  | medium |  | untriaged | audit-run | Rails is constrained to the 7.2 series, which the current Rails maintenance policy page no longer lists as a supported series | `Gemfile`:42 |
| LL-a6b533922a |  | medium | WCAG | untriaged | audit-run | Board detail role=grid has no row or gridcell descendants | `app/frontend/app/components/board-detail-grid.hbs`:3 |
| LL-60e9cf0312 |  | medium | WCAG | untriaged | audit-run | Default speak-view grid omits the board language attribute the classic grids carry | `app/frontend/app/components/board-detail-grid.hbs`:3 |
| LL-76fe5b06f7 |  | medium | WCAG | untriaged | audit-run | Board tile role=button contains focusable Preview and info buttons | `app/frontend/app/components/board-icon.hbs`:36 |
| LL-3096532e5c |  | medium | WCAG | untriaged | audit-run | Boards page tablist has anchors with no tab role | `app/frontend/app/components/available-boards-section.hbs`:704 |
| LL-e2f7a8e966 |  | medium | WCAG | untriaged | audit-run | Dashboard boards embed tablist has anchors with no tab role | `app/frontend/app/components/dashboard-user-boards.hbs`:106 |
| LL-700417ace5 |  | medium | WCAG | untriaged | audit-run | Features page scroller has no focusable content or tabindex | `app/frontend/app/templates/features.hbs`:1 |
| LL-5207160b7e |  | medium | WCAG | untriaged | audit-run | App content scroller is unfocusable when the Download page renders no links | `app/frontend/app/templates/application.hbs`:1591 |
| LL-2c27a7833c |  | medium | WCAG | untriaged | audit-run | Shared flash message container has no live region | `app/frontend/app/components/flash-outlet.hbs`:2 |
| LL-fcf4efee65 |  | medium | WCAG | untriaged | audit-run | View switcher tag uses raw denim token as small text on a light tint | `app/frontend/app/styles/_view-switcher.scss`:271 |
| LL-ef1a7f776e |  | medium | WCAG | untriaged | audit-run | Device rename input has no label | `app/frontend/app/components/device-settings.hbs`:25 |
| LL-a68aaebeb5 |  | medium | WCAG | untriaged | audit-run | Board embed code input has no programmatic label | `app/frontend/app/components/share-board.hbs`:43 |
| LL-9bde8c01e6 |  | medium | WCAG | untriaged | audit-run | Communication profile answers are click-only divs | `app/frontend/app/templates/profile.hbs`:88 |
| LL-aabf8020c0 |  | medium | WCAG | untriaged | audit-run | Device rename target is a click-only div | `app/frontend/app/components/device-settings.hbs`:30 |
| LL-55a3b83c45 |  | medium | WCAG | untriaged | audit-run | New goal template picker rows are click-only divs | `app/frontend/app/components/new-goal.hbs`:120 |
| LL-4702542ffc |  | medium | WCAG | untriaged | audit-run | Add tool picker rows are click-only divs | `app/frontend/app/components/add-tool.hbs`:50 |
| LL-70dc5e320b |  | medium | WCAG | untriaged | audit-run | Repairs insertion cursor targets are click-only divs | `app/frontend/app/components/repairs.hbs`:81 |
| LL-4ac33ca014 |  | medium | WCAG | untriaged | audit-run | Remote modeling reactions are click-only images | `app/frontend/app/components/remote-model.hbs`:58 |
| LL-4da528809e |  | medium | WCAG | untriaged | audit-run | Connected tool rows on profile edit are click-only list items | `app/frontend/app/templates/user/edit.hbs`:476 |
| LL-10f1b22738 |  | medium | WCAG | untriaged | audit-run | Sidebar option settings open only from click-only image and span | `app/frontend/app/templates/user/preferences.hbs`:1224 |
| LL-5db4508d06 |  | medium | WCAG | untriaged | audit-run | Avatar option buttons have no accessible name | `app/frontend/app/components/pick-avatar.hbs`:36 |
| LL-84541b5ae1 |  | medium | WCAG | untriaged | audit-run | Map mark-center button is glyph-only | `app/frontend/app/components/map-with-geos.hbs`:6 |
| LL-a83eb9a295 |  | medium | WCAG | untriaged | audit-run | Curriculum row remove link is glyph-only | `app/frontend/app/components/edit-unit.hbs`:33 |
| LL-baa7f32bfb |  | medium | WCAG | untriaged | audit-run | GIF result links have no name because their only image has empty alt | `app/frontend/app/components/gif.hbs`:69 |
| LL-40fee57fdb |  | medium | WCAG | untriaged | audit-run | Quick evaluation library picture tiles are nameless buttons | `app/frontend/app/components/eval-quick-item.hbs`:36 |
| LL-880939ce6c |  | medium | WCAG | untriaged | audit-run | Button settings image options toggle is caret-only | `app/frontend/app/components/button-settings.hbs`:367 |
| LL-b8dc880839 |  | medium | WCAG | untriaged | audit-run | Goal delete link is trash-glyph only | `app/frontend/app/templates/goals/goal.hbs`:346 |
| LL-c9d6eb810d |  | medium | WCAG | untriaged | audit-run | Log event highlight buttons are star-glyph only | `app/frontend/app/templates/user/log.hbs`:516 |
| LL-acccbe3e4a |  | medium | WCAG | untriaged | audit-run | Organization report status button is icon-only | `app/frontend/app/templates/organization/reports.hbs`:81 |
| LL-d91d9049b0 |  | medium | WCAG | untriaged | audit-run | Weekly stats profile buttons are glyph-only with the title on the parent | `app/frontend/app/components/stats/user-weeks.hbs`:28 |
| LL-623f5fb3ba |  | medium | WCAG | untriaged | audit-run | Current board icon in the classic header has no alt | `app/frontend/app/templates/application.hbs`:728 |
| LL-0def650c0a |  | medium | WCAG | untriaged | audit-run | Partner logo links have no accessible name | `app/frontend/app/templates/partners.hbs`:11 |
| LL-88069e3e85 |  | medium | WCAG | untriaged | audit-run | User badge links have no accessible name | `app/frontend/app/templates/user/index.hbs`:554 |
| LL-6effc29ec2 |  | medium |  | untriaged | audit-run | board-folders-section component has no invocation anywhere (111-line hbs, 152-line js) | `app/frontend/app/components/board-folders-section.js`:49 |
| LL-8959e1ddff |  | medium |  | untriaged | audit-run | expandable-card component has no invocation anywhere | `app/frontend/app/components/expandable-card.js`:4 |
| LL-709910aabe |  | medium |  | untriaged | audit-run | extra-colors-row component is never rendered (sibling extra-colors and extra-colors-modal are live) | `app/frontend/app/components/extra-colors-row.js`:11 |
| LL-ca5cdcaa88 |  | medium |  | untriaged | audit-run | style-switcher component is never invoked (only comments and CSS mention it) | `app/frontend/app/components/style-switcher.js`:6 |
| LL-549bbb6748 |  | medium |  | untriaged | audit-run | aggreement-terms template is not routed, rendered or opened as a modal | `app/frontend/app/templates/aggreement-terms.hbs`:2 |
| LL-feec65b1ec |  | medium |  | untriaged | audit-run | Twelve .la-modal-header-icon--* rule sets have identical bodies, and the comment admits there is no shared base rule | `app/frontend/app/styles/app.scss`:31639 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | **accepted** | audit-run | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | **accepted** | audit-run | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | **accepted** | audit-run | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:945 |
| LL-57e9beb87f |  | low | GDPR, FERPA | untriaged | audit-run | Flusher.flush_leftovers has no usage-based orphan check for orphaned ButtonImage/ButtonSound media records (item 1) | `lib/flusher.rb`:57 |
| LL-45bdcc73c9 |  | low | SOC2 | untriaged | audit-run | Developer key expiration policy is undecided; DeveloperKey records never age out (item 3) | `lib/flusher.rb`:48 |
| LL-97f9001bb4 |  | low | SOC2 | **wontfix** ⚠regression | audit-run | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
| LL-3483c28f3c |  | low | SOC2 | **wontfix** | audit-run | Parallel finders read live infra without synchronization (possible inconsistent snapshot) | `.claude/skills/audit-run/SKILL.md`:33 |
| LL-a2b45c2bcb |  | low | SOC2 | **accepted** | audit-run | Finder agent-memory (memory: project) may carry process state across audit runs | `.claude/agents/infra-auditor.md`:7 |
| LL-5f0f4f52f8 |  | low | SOC2 | **accepted** | audit-run | Audit system files (.claude/) are not in any finder scan scope (no self-audit) | `.claude/agents/infra-auditor.md`:62 |
| LL-ba0585ab93 |  | low | SOC2, HIPAA, FERPA | **accepted** | audit-run | Production Postgres uses sslmode=require (encrypt only), not verify-ca/verify-full | `config/database.yml`:26 |
| LL-6447a21503 |  | low |  | **accepted** | audit-run | Organization model declares total_extras attribute but Rails builder never emits it | `app/frontend/app/models/organization.js`:42 |
| LL-5a173ce87f |  | low |  | **accepted** | audit-run | Utterance Rails builder emits created_at but Ember model declares timestamp instead | `app/frontend/app/models/utterance.js`:15 |
| LL-553fdc242b |  | low | SOC2 | **accepted** | audit-run | davidshimjs-qrcodejs 0.0.2 is abandoned (no release since 2014, >10 years) | `app/frontend/package.json`:36 |
| LL-e066ea6fa3 |  | low | SOC2 | **accepted** | audit-run | http-proxy 1.18.1 (EOL, last release 2021) has CVE-2024-21943 (ReDoS via Host header); dev-only | `app/frontend/package.json`:64 |
| LL-e76d6378b5 |  | low |  | **accepted** | audit-run | Webhook model declares notifications and content_type attrs that Rails never serializes | `app/frontend/app/models/webhook.js`:12 |
| LL-5d7197fa7d |  | low | HIPAA, FERPA | untriaged | audit-run | PaperTrail versions with unconstantizable item_type are detected but retention disposition is undecided | `lib/flusher.rb`:135 |
| LL-de9c94bf36 |  | low | GDPR | untriaged | audit-run | Org retention policy purges a sponsored user's entire log history, including logs outside that org's context | `lib/data_policy_enforcer.rb`:31 |
| LL-d8072299bf |  | low | GDPR, COPPA | untriaged | audit-run | Automated retention only runs for org-sponsored users; standalone accounts keep communication logs indefinitely | `lib/data_policy_enforcer.rb`:101 |
| LL-c226391436 |  | low | SOC2 | untriaged | audit-run | Content-Security-Policy is report-only (nothing blocked) and script-src permits unsafe-inline + unsafe-eval | `config/initializers/content_security_policy.rb`:112 |
| LL-5ae3d7ca2c |  | low | SOC2 | untriaged | audit-run | ci.yml declares no top-level permissions block; GITHUB_TOKEN inherits repo-default scope for all jobs (incl. one running downloaded gitleaks) | `.github/workflows/ci.yml`:1 |
| LL-cbaf7afddd |  | low |  | untriaged | audit-run | Ember LogSession model declares scalar user_id/video_id/goal_id/notify attrs that JsonApi::Log never emits as top-level keys | `app/frontend/app/models/log.js`:34 |
| LL-0196a680c5 |  | low |  | untriaged | audit-run | Ember UserGoal model declares scalar user_id/video_id/template_id attrs that JsonApi::Goal never emits as top-level keys | `app/frontend/app/models/goal.js`:19 |
| LL-5e7676187f |  | low |  | untriaged | audit-run | indexeddbshim is pinned to a stale major (^6.1.0, ~10 majors behind latest 16.1.0) in the production bundle | `app/frontend/package.json`:70 |
| LL-3a1c317a88 |  | low | HIPAA, FERPA | **dismissed-false-positive** | audit-run | Eval narration has no licensed-clinician gate (classified NOT a HIPAA Healthcare Activity) | `app/controllers/api/eval_sessions_controller.rb`:60 |
| LL-abd6c88733 |  | low | SOC2 | untriaged | manual | Prod SES mail has no custom MAIL FROM domain, so SPF does not align with the From: domain and DMARC rests on DKIM alone; no Authentication-Results headers have ever been captured to confirm the SPF/DKIM/DMARC result on a delivered message | (attestation) |
| LL-40f3571b19 |  | low | SOC2 | untriaged | audit-run | Sentry release tagging reads a Render-only environment variable, so production error events on Cloud Run carry no release attribution | `config/initializers/sentry.rb`:367 |
| LL-dbdcfb466c |  | low | SOC2 | untriaged | audit-run | The Notion sync workflows declare no permissions block, so jobs holding a third-party Notion API token inherit the repository-default GITHUB_TOKEN scope | `.github/workflows/sync-findings-to-notion.yml`:31 |
| LL-e14ca0ff04 |  | low | SOC2 | untriaged | audit-run | Finder agents are given a project-memory write policy they cannot execute, because the read-only toolset and the PreToolUse guard both block the write | `.claude/agents/infra-auditor.md`:4 |
| LL-5d2436fce2 |  | low |  | untriaged | audit-run | Board model declares an Ember Data `images` hasMany relationship that the serializer always strips before it can populate | `app/frontend/app/models/board.js`:899 |
| LL-63377adbd2 |  | low |  | untriaged | audit-run | jquery-minicolors ^2.1.10 (devDependency) appears unmaintained (no upstream release in years, jQuery-plugin era) | `app/frontend/package.json`:85 |
| LL-8bc8f025a7 |  | low | WCAG | untriaged | audit-run | Dropdown menus reference a nonexistent id via aria-labelledby (dLabel) in the app shell | `app/frontend/app/templates/application.hbs`:386 |
| LL-4574005612 |  | low | WCAG | untriaged | audit-run | Preferences dropdown menu references a nonexistent id via aria-labelledby (dLabel) | `app/frontend/app/templates/user/preferences.hbs`:163 |
| LL-f6be45aec6 |  | low | WCAG | untriaged | audit-run | Authenticated navbar dropdown menu references a nonexistent id via aria-labelledby (dLabel) | `app/frontend/app/components/app-navbar-authenticated-inner.hbs`:126 |
| LL-fba16b6fd7 |  | low | WCAG | untriaged | audit-run | Saved Phrases icon-only action buttons carry hard-coded English aria-labels | `app/frontend/app/components/phrases.hbs`:47 |
| LL-ebb4be7b73 |  | low |  | untriaged | audit-run | create-board route always redirects in beforeModel, making its own template permanently unreachable | `app/frontend/app/routes/create-board.js`:13 |
| LL-30236919f6 |  | low |  | untriaged | audit-run | Bare `debugger;` statement left in a live persistence-sync promise-rejection handler | `app/frontend/app/utils/persistence.js`:2402 |
| LL-208e8f1317 |  | low |  | untriaged | audit-run | dbman.js swallows three different IndexedDB errors with a bare `debugger;` and no other handling | `app/frontend/app/utils/dbman.js`:390 |
| LL-c95c637f00 |  | low |  | untriaged | audit-run | setup/extra-supervisors.js + .hbs component has zero references anywhere | `app/frontend/app/components/setup/extra-supervisors.js`:3 |
| LL-bdc3344942 |  | low | SOC2, HIPAA, GDPR, FERPA | untriaged | audit-run | GEMINI_API_KEY is still mounted into every prod web and worker container with no runtime consumer and, unlike ANTHROPIC_API_KEY, no CI guard against a seam starting to read it | `.github/workflows/deploy-cloudrun.yml`:237 |
| LL-94e57af291 |  | low | SOC2 | untriaged | audit-run | ANTHROPIC_API_KEY was de-scoped from the runtime mount but is still an actively-provisioned app secret in the GCP setup scripts, and nothing in the change revokes or disables it | `scripts/gcp/phase4-seed-app-secrets.sh`:66 |
| LL-5038e6834e |  | low | HIPAA, SOC2 | untriaged | manual | ai-endpoint-guard.sh is a lexical scan with a stated residual bypass tail: fully dynamic constant resolution, non-ENV credential reads, and injected clients are undetectable, so the control proves lexical absence rather than egress containment | `scripts/ai-endpoint-guard.sh`:548 |
| LL-23675d9ca4 |  | low | SOC2, HIPAA | untriaged | manual | ruby-openai sits in the Gemfile :default group with no runtime consumer, so Bundler.require makes OpenAI::Client a live constant in every production web and worker process | `Gemfile`:109 |
| LL-c259638711 |  | low | COPPA, FERPA, HIPAA, GDPR | untriaged | pr-review | AiApiLog request_summary for word prediction records the scrubbed sentence but omits the scrubbed topic | `lib/ai_word_predictor.rb`:165 |
| LL-8ad71e0e49 |  | low | SOC2 | untriaged | audit-run | Production Memorystore Redis is Basic tier with persistence disabled, so a node failure or maintenance flush silently drops every queued Resque job | `scripts/gcp/phase3-data-layer.sh`:95 |
| LL-d4facdbeac |  | low |  | untriaged | audit-run | Organization model's offboarding_under_13/offboarding_under_16 attrs are computed and sent on every offboarding save but never read anywhere server-side | `app/frontend/app/models/organization.js`:64 |
| LL-60bde5db7a |  | low |  | untriaged | audit-run | websocket-driver 0.7.4 (critical, GHSA-xv26-6w52-cph6 message-corruption via protocol length headers) is pulled in by ember-cli's live-reload dev server (tiny-lr -> faye-websocket), not the shipped app | `app/frontend/package-lock.json`:26105 |
| LL-8c9d45941f |  | low |  | untriaged | audit-run | ember-shepherd 17.3.1 (production guided-tour addon) pulls shepherd.js 14.5.1 -> deepmerge-ts 7.1.5, flagged high by npm audit for GHSA-ggr8-5vv4-36mx (stack exhaustion merging recursive object graphs); fix needs a semver-major ember-shepherd bump | `app/frontend/package.json`:73 |
| LL-62d0cd75e6 |  | low | WCAG | untriaged | audit-run | Legacy board route word-prediction symbol images have no alt attribute | `app/frontend/app/templates/board/index.hbs`:59 |
| LL-58edfeac0f |  | low | WCAG | untriaged | audit-run | Classic board-alt edit-mode tile symbol img lacks the alt that was fixed in templates/board/index.hbs | `app/frontend/app/templates/user/board-alt/index.hbs`:123 |
| LL-f553847b7a |  | low |  | untriaged | audit-run | setup/extra-reports.js + .hbs component has zero references anywhere (same allowlist-miss mechanism as LL-c95c637f00) | `app/frontend/app/components/setup/extra-reports.js`:3 |
| LL-5a240e46f5 |  | low |  | untriaged | audit-run | setup/done.js + .hbs (a wizard completion screen) is orphaned: not in any setup page list, so unreachable even if the retired wizard is revived | `app/frontend/app/components/setup/done.js`:3 |
| LL-50bd144c81 |  | low | GDPR | untriaged | audit-run | Uploader exception and log messages include object keys that can contain a username, against the file's own no-path rule | `lib/uploader.rb`:170 |
| LL-43bb17f103 |  | low | GDPR, COPPA | untriaged | audit-run | Daily erasure and retention tasks run only in one exact hour with no catch-up, so a missed run skips them until the next day | `lib/tasks/scheduler.rake`:140 |
| LL-400e2d393f |  | low | GDPR, HIPAA | untriaged | audit-run | Scheduler task errors are printed to stdout with the raw exception message, past the log-scrubbing formatter | `lib/tasks/scheduler.rake`:107 |
| LL-1421732fb8 |  | low | HIPAA | untriaged | audit-run | Scheduler retention comment still cites a six-year HIPAA floor for AI logs that the AI log model records as retracted | `lib/tasks/scheduler.rake`:195 |
| LL-73fe80395c |  | low | SOC2, HIPAA | untriaged | audit-run | Human cloud account credential hygiene (details withheld until remediation is verified) | (attestation) |
| LL-48db6d1596 |  | low | SOC2 | untriaged | audit-run | Object storage account-level guardrail (details withheld until remediation is verified) | (attestation) |
| LL-86be748338 |  | low | SOC2, HIPAA | untriaged | audit-run | Retention schedule has no row for infrastructure logs | `docs/legal/2026-09-22_data-retention.md`:98 |
| LL-74373e5cb9 |  | low | SOC2 | untriaged | audit-run | Nonprod project access and audit posture (details withheld until remediation is verified) | (attestation) |
| LL-10a0a884f7 |  | low | SOC2 | untriaged | audit-run | Production project residual resources (details withheld until remediation is verified) | (attestation) |
| LL-4774165eec |  | low | SOC2 | untriaged | audit-run | The audit read-only guard allows every non-Bash tool, so a finder's outbound MCP question text to a third party is not inspected, though the guard treats outbound channels as an exfiltration risk | `.claude/hooks/audit-readonly-guard.sh`:49 |
| LL-07321f3c25 |  | low |  | untriaged | audit-run | Shared paginate accepts per_page of 0 and negative offset or per_page without validation | `lib/json_api/json.rb`:24 |
| LL-abbc73af47 |  | low |  | untriaged | audit-run | allowed? answers authorization failures with HTTP 400 while other endpoints use 403 and 401 | `app/controllers/application_controller.rb`:309 |
| LL-8a9ed925f3 |  | low |  | untriaged | audit-run | Profiles and eval protocols index endpoints return bare arrays, unlike the keyed-and-paginated envelope every other list uses | `app/controllers/api/profiles_controller.rb`:21 |
| LL-a038bb6b07 |  | low |  | untriaged | audit-run | Admin-support branch of the user serializer discards its device query and then calls select on an unassigned variable | `lib/json_api/user.rb`:303 |
| LL-4c9d0e52a0 |  | low |  | untriaged | audit-run | License list payload has no Ember consumer | `lib/json_api/license.rb`:8 |
| LL-1753b1fdaa |  | low |  | untriaged | audit-run | Ember wraps the whole error body into errors[0] only when Rails omitted an errors array, so errors[0] is a string for some failures and an object for others | `app/frontend/app/utils/extras.js`:285 |
| LL-395931ad39 |  | low |  | untriaged | audit-run | ember-cli ~5.12.0 (dev/build toolchain) pulls in critical and high npm advisories (handlebars, proxy-addr, engine.io, body-parser and others); build and dev-server only, not in the shipped bundle | `app/frontend/package.json`:55 |
| LL-73a83d62d3 |  | low |  | untriaged | audit-run | ember-auto-import ^2.8.1 build chain carries a critical handlebars advisory and high advisories (postcss, fast-uri, browserslist, babel systemjs plugin); build-time only | `app/frontend/package.json`:54 |
| LL-a95c4414a6 |  | low |  | untriaged | audit-run | concurrently ^8.0.1 pulls shell-quote flagged critical by npm audit; used only by a lint helper script | `app/frontend/package.json`:52 |
| LL-8f4f6ce15c |  | low |  | untriaged | audit-run | puppeteer ^24.42.0 (devDependency) pulls high advisories (extract-zip, basic-ftp, ip-address, ws, zod); test tooling only | `app/frontend/package.json`:95 |
| LL-fa908e2c82 |  | low |  | untriaged | audit-run | ember-fetch ^8.1.2 pulls broccoli-rollup and rollup flagged high by npm audit; build-time plugins only | `app/frontend/package.json`:67 |
| LL-78cf79dc5d |  | low |  | untriaged | audit-run | stylelint ^15.4.0 and sass tooling pull high advisories (nanoid, postcss, js-yaml, picomatch, source-map-js, immutable); lint and CSS build only | `app/frontend/package.json`:100 |
| LL-4c946973f0 |  | low |  | untriaged | audit-run | ember-cli-babel ^8.2.0 resolves an older @babel/runtime flagged moderate by npm audit; it also drives moderate flags on many shipped Ember packages by propagation; whether the helper reaches the browser output is unverified | `app/frontend/package.json`:57 |
| LL-3dd9bc89ee |  | low |  | untriaged | audit-run | Production image and .ruby-version use Ruby 3.4.4, several patch releases behind the current 3.4 patch | `Dockerfile`:24 |
| LL-436af085af |  | low | WCAG | untriaged | audit-run | Liked indicator puts aria-label on a span with no role | `app/frontend/app/components/available-boards-section.hbs`:790 |
| LL-2f4e37c137 |  | low | WCAG | untriaged | audit-run | Classic board edit-mode label field has placeholder only | `app/frontend/app/templates/user/board-alt/index.hbs`:135 |
| LL-a7cea7914a |  | low | WCAG | untriaged | audit-run | Legacy board edit-mode label field has placeholder only | `app/frontend/app/templates/board/index.hbs`:151 |
| LL-407ac4ee5c |  | low | WCAG | untriaged | audit-run | Button stash label field has placeholder only | `app/frontend/app/components/button-stash.hbs`:44 |
| LL-9d409b2f93 |  | low | WCAG | untriaged | audit-run | Focus analysis extras toggle is a click-only span | `app/frontend/app/templates/user/focus.hbs`:68 |
| LL-fa0cfadf38 |  | low | WCAG | untriaged | audit-run | Goal badge popup opens from a click-only span | `app/frontend/app/templates/goals/goal.hbs`:261 |
| LL-8c8b731abc |  | low | WCAG | untriaged | audit-run | Lesson description panel toggles from a click-only div | `app/frontend/app/templates/lesson.hbs`:53 |
| LL-5b754f5f5e |  | low | WCAG | untriaged | audit-run | Account dropdown role=menu has no menuitem children | `app/frontend/app/components/app-navbar-authenticated-inner.hbs`:139 |
| LL-cd0df99949 |  | low | WCAG | untriaged | audit-run | Language dropdown role=menu has no menuitem children | `app/frontend/app/components/page-footer.hbs`:62 |
| LL-d7f17e65be |  | low | WCAG | untriaged | audit-run | Copy board dropdown role=menu has no menuitem children | `app/frontend/app/components/copy-just-this-board.hbs`:6 |
| LL-1f930f5605 |  | low | WCAG | untriaged | audit-run | Record note template dropdown role=menu has no menuitem children | `app/frontend/app/components/record-note.hbs`:53 |
| LL-1bb7a36d82 |  | low | WCAG | untriaged | audit-run | Which-home dropdown role=menu has no menuitem children | `app/frontend/app/components/which-home.hbs`:16 |
| LL-280c5e21e7 |  | low | WCAG | untriaged | audit-run | Modeling ideas dropdown role=menu has no menuitem children | `app/frontend/app/components/modeling-ideas.hbs`:178 |
| LL-58d882c46e |  | low | WCAG | untriaged | audit-run | Logs Add dropdown role=menu has no menuitem children | `app/frontend/app/templates/user/logs.hbs`:148 |
| LL-8005319b52 |  | low | WCAG | untriaged | audit-run | Organization room dropdown role=menu has no menuitem children | `app/frontend/app/templates/organization/room.hbs`:230 |
| LL-669d04a009 |  | low | WCAG | untriaged | audit-run | User status menu references the nonexistent dLabel id | `app/frontend/app/components/user-status.hbs`:40 |
| LL-db48d38e0c |  | low | WCAG | untriaged | audit-run | Footer language menu references the nonexistent dLabel id | `app/frontend/app/components/page-footer.hbs`:62 |
| LL-45a875a37d |  | low | WCAG | untriaged | audit-run | Quick assessment tally steppers reference ids that do not exist | `app/frontend/app/components/quick-assessment.hbs`:43 |
| LL-df0d71aa3c |  | low | WCAG | untriaged | audit-run | Button settings group has a raw, non-descriptive aria-label | `app/frontend/app/components/button-settings.hbs`:366 |
| LL-ac1e5e72a6 |  | low | WCAG | untriaged | audit-run | Gift purchase plan group has a raw aria-label | `app/frontend/app/templates/gift_purchase.hbs`:68 |
| LL-c2ebed2db3 |  | low | WCAG | untriaged | audit-run | Video embed page html element has no lang | `app/views/boards/video.html.erb`:2 |
| LL-4b2c3a2603 |  | low | WCAG | untriaged | audit-run | Profile edit avatar has no alt | `app/frontend/app/templates/user/edit.hbs`:145 |
| LL-5c3b2e5763 |  | low | WCAG | untriaged | audit-run | Preferences skin tone images have no alt | `app/frontend/app/templates/user/preferences.hbs`:157 |
| LL-c69f031c75 |  | low | WCAG | untriaged | audit-run | Board background image in the default speak grid has no alt | `app/frontend/app/components/board-detail-grid.hbs`:16 |
| LL-4d4e0167e6 |  | low | WCAG | untriaged | audit-run | Classic board background image has no alt | `app/frontend/app/templates/user/board-alt/index.hbs`:84 |
| LL-816212fe89 |  | low | WCAG | untriaged | audit-run | Legacy board background image has no alt | `app/frontend/app/templates/board/index.hbs`:97 |
| LL-3bf6e72da5 |  | low | WCAG | untriaged | audit-run | Button stash symbol images have no alt | `app/frontend/app/components/button-stash.hbs`:32 |
| LL-ae15d8c01e |  | low | WCAG | untriaged | audit-run | Pick avatar current image has no alt | `app/frontend/app/components/pick-avatar.hbs`:14 |
| LL-a384fca5e9 |  | low | WCAG | untriaged | audit-run | Timer alarm image has no alt | `app/frontend/app/components/timer.hbs`:6 |
| LL-7dab15afd3 |  | low | WCAG | untriaged | audit-run | New goal badge images have no alt | `app/frontend/app/components/new-goal.hbs`:50 |
| LL-b511131e05 |  | low | WCAG | untriaged | audit-run | Download log user avatar has no alt | `app/frontend/app/components/download-log.hbs`:12 |
| LL-19a1ee5d32 |  | low | WCAG | untriaged | audit-run | Masquerade user avatar has no alt | `app/frontend/app/components/masquerade.hbs`:13 |
| LL-e554911ae1 |  | low | WCAG | untriaged | audit-run | Confirm notify avatar has no alt | `app/frontend/app/components/confirm-notify-user.hbs`:10 |
| LL-d88cfdfbff |  | low | WCAG | untriaged | audit-run | Repairs remove icon has no alt | `app/frontend/app/components/repairs.hbs`:159 |
| LL-432b6f7812 |  | low | WCAG | untriaged | audit-run | Board intro heading image has no alt | `app/frontend/app/components/board-intro.hbs`:7 |
| LL-17cac64162 |  | low | WCAG | untriaged | audit-run | Add tool icons have no alt | `app/frontend/app/components/add-tool.hbs`:17 |
| LL-4108d82659 |  | low | WCAG | untriaged | audit-run | Remote model avatar has no alt | `app/frontend/app/components/remote-model.hbs`:30 |
| LL-a7a6a0b4ff |  | low | WCAG | untriaged | audit-run | User status avatar has no alt | `app/frontend/app/components/user-status.hbs`:7 |
| LL-c7f57b2c5d |  | low | WCAG | untriaged | audit-run | Earned badge image has no alt | `app/frontend/app/components/badge-earned.hbs`:5 |
| LL-2b5fc08e75 |  | low | WCAG | untriaged | audit-run | Pending consent requester avatar has no alt | `app/frontend/app/components/pending-consent-requests.hbs`:10 |
| LL-2bbaaaed75 |  | low | WCAG | untriaged | audit-run | Importing recordings spinner has no alt | `app/frontend/app/components/importing-recordings.hbs`:19 |
| LL-2086702532 |  | low | WCAG | untriaged | audit-run | Importing boards spinner has no alt | `app/frontend/app/components/importing-boards.hbs`:23 |
| LL-a2ea00d9ac |  | low | WCAG | untriaged | audit-run | Importing logs spinner has no alt | `app/frontend/app/components/importing-logs.hbs`:20 |
| LL-c852d7af1c |  | low | WCAG | untriaged | audit-run | Board selection tool images have no alt | `app/frontend/app/components/board-selection-tool.hbs`:105 |
| LL-c9c625b898 |  | low | WCAG | untriaged | audit-run | Share bar supervisor avatars have no alt | `app/frontend/app/components/share-bar.hbs`:27 |
| LL-b8a4f50df3 |  | low | WCAG | untriaged | audit-run | Focus Words images have no alt | `app/frontend/app/components/focus-words.hbs`:7 |
| LL-b87b08d7f3 |  | low | WCAG | untriaged | audit-run | Button settings image preview has no alt | `app/frontend/app/components/button-settings.hbs`:333 |
| LL-e4d2694bc1 |  | low | WCAG | untriaged | audit-run | User select avatars have no alt | `app/frontend/app/components/user-select.hbs`:27 |
| LL-f0beb6ad9e |  | low | WCAG | untriaged | audit-run | Supervision settings avatars have no alt | `app/frontend/app/components/supervision-settings.hbs`:40 |
| LL-679cea1e38 |  | low | WCAG | untriaged | audit-run | Weekly stats user avatars have no alt | `app/frontend/app/components/stats/user-weeks.hbs`:10 |
| LL-9434fe7e70 |  | low | WCAG | untriaged | audit-run | Setup board category walkthrough animation has no alt | `app/frontend/app/components/setup/board_category.hbs`:7 |
| LL-2f32f389a1 |  | low | WCAG | untriaged | audit-run | Setup reports walkthrough animation has no alt | `app/frontend/app/components/setup/extra-reports.hbs`:5 |
| LL-6a2c266721 |  | low | WCAG | untriaged | audit-run | Trends goal and badge images have no alt | `app/frontend/app/templates/trends.hbs`:456 |
| LL-a837c11040 |  | low | WCAG | untriaged | audit-run | Lesson user avatar has no alt | `app/frontend/app/templates/lesson.hbs`:34 |
| LL-cf465c239d |  | low | WCAG | untriaged | audit-run | Bulk purchase receiver avatars have no alt | `app/frontend/app/templates/bulk_purchase.hbs`:100 |
| LL-37eaa843bf |  | low | WCAG | untriaged | audit-run | Goal badge image has no alt | `app/frontend/app/templates/goals/goal.hbs`:262 |
| LL-f89fef05fb |  | low | WCAG | untriaged | audit-run | Public goals badge images have no alt | `app/frontend/app/templates/goals/index.hbs`:7 |
| LL-ea05d4ced3 |  | low | WCAG | untriaged | audit-run | Premium symbols logo has no alt | `app/frontend/app/templates/user/subscription.hbs`:134 |
| LL-08b48b9fd0 |  | low | WCAG | untriaged | audit-run | User goals badge images have no alt | `app/frontend/app/templates/user/goals.hbs`:42 |
| LL-3a5e45ef5f |  | low | WCAG | untriaged | audit-run | User focus page images have no alt | `app/frontend/app/templates/user/focus.hbs`:9 |
| LL-112b95e16f |  | low |  | untriaged | audit-run | lib/renamer.rb is a comments-only stub module with no callers | `lib/renamer.rb`:1 |
| LL-5ffaf986fb |  | low |  | untriaged | audit-run | lib/board_merger.rb is a comments-only design sketch with no callers | `lib/board_merger.rb`:1 |
| LL-49001c885f |  | low |  | untriaged | audit-run | lib/arpa_to_json.rb has no reference anywhere in the tree | `lib/arpa_to_json.rb`:1 |
| LL-a0098b0661 |  | low |  | untriaged | audit-run | bad-privacy-settings template is never referenced | `app/frontend/app/templates/bad-privacy-settings.hbs`:2 |
| LL-4188855691 |  | low |  | untriaged | audit-run | board-icon-without-link template is never referenced | `app/frontend/app/templates/board-icon-without-link.hbs`:1 |
| LL-15b1a82d2a |  | low |  | untriaged | audit-run | button-unbound template is self-documented as unused and has no references | `app/frontend/app/templates/button-unbound.hbs`:1 |
| LL-8b0e509116 |  | low |  | untriaged | audit-run | purchase-board modal template has no controller, route or opener | `app/frontend/app/templates/purchase-board.hbs`:1 |
| LL-63276f213b |  | low |  | untriaged | audit-run | user_summary template is never referenced | `app/frontend/app/templates/user_summary.hbs`:1 |
| LL-5ad2cbcf67 |  | low |  | untriaged | audit-run | User#can_access_library? is a hard-coded false stub; current_sponsor, disable_feature and two other User methods have no callers | `app/models/user.rb`:174 |
| LL-9e58ffea26 |  | low |  | untriaged | audit-run | WordData.update_word_type, focus_word_lists and revert_board_inflections have no callers | `app/models/word_data.rb`:606 |
| LL-e15f7a0c09 |  | low |  | untriaged | audit-run | BoardDownstreamButtonSet.clean_old_button_sets is never called or scheduled | `app/models/board_downstream_button_set.rb`:785 |
| LL-6bf2ef4820 |  | low |  | untriaged | audit-run | Device.with_expired_system_version has no callers | `app/models/device.rb`:431 |
| LL-197d6c0c98 |  | low |  | untriaged | audit-run | Stats.recently_used_boards has no callers | `lib/stats.rb`:1364 |
| LL-bf2b48861f |  | low |  | untriaged | audit-run | SystemEmailRegistry.slug_for has no callers | `lib/system_email_registry.rb`:263 |
| LL-6780c9ea7f |  | low |  | untriaged | audit-run | SystemFeatureSettings.group_customized? has no callers | `lib/system_feature_settings.rb`:216 |
| LL-eab4eed41b |  | low |  | untriaged | audit-run | OBF local converter ingest_locale has no callers | `lib/converters/obf-local.rb`:187 |
| LL-7b6ebdf21d |  | low |  | untriaged | audit-run | VocalFlairKeyboardFolderRelinker.repair_existing! has no callers | `lib/vocal_flair_keyboard_folder_relinker.rb`:73 |
| LL-7fc77b5785 |  | low |  | untriaged | audit-run | Time-boxed 'remove after a few days' diagnostic logger is still live and called from three controllers | `app/controllers/application_controller.rb`:511 |
| LL-941001ca58 | Dep-eslint-8-eol | low | SOC2 | **accepted** | audit-run | eslint 8.57.1 is EOL (v8 end-of-life); dev toolchain on an unsupported linter | `app/frontend/package.json`:64 |
| LL-a97357136e | P2-2 | low | SOC2 | **wontfix** | audit-run | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | **wontfix** | audit-run | License model lacks Processable concern | `app/models/license.rb`:1 |

## Remediated (awaiting verification) (10)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-90045bb29c |  | high | FERPA | **accepted** | audit-run | User#user_token is a permanent, non-expiring credential serialized on login and embedded in navigable lesson/board share URLs | `lib/json_api/user.rb`:41 |
| LL-a95e9c5f7c |  | high | SOC2 | untriaged | audit-run | lingolinq-worker's 512Mi memory limit is too small for ButtonImage/BoardDownstreamButtonSet jobs, causing continuous OOM kills that land as Resque::Failure instead of being requeued | (attestation) |
| LL-705b10bcd7 |  | high | SOC2 | untriaged | audit-run | BoardDownstreamButtonSet S3 writes fail against KMS-encrypted bucket: 'Requests specifying Server Side Encryption with AWS KMS managed keys require AWS Signature Version 4' | (attestation) |
| LL-f150e0e828 |  | high | COPPA, GDPR | **fixed** | pr-review | District seat reclaim converts an under-13's account to a consumer trial with no parental re-consent or notice (COPPA) | `app/models/license.rb`:76 |
| LL-a9d6d5a46b |  | high | WCAG | untriaged | manual | AI disclosure full-notice link uses the low-contrast verdigris token for text on the near-white modal surface | `app/frontend/app/styles/app.scss`:38150 |
| LL-6af580a23a |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | A Redis RDB persistence snapshot was tracked in git and shipped in every production container image for ~6 months; removed from HEAD (2026-08-14) but the blob remains fully retrievable from public git history at ced829ba1 on both staging and main | (attestation) |
| LL-5954bcbbe6 |  | medium | SOC2 | untriaged | audit-run | Pre-existing Resque background-job failures: ImageMagick identify missing in Cloud Run image, stale job_stash lookups, and a call to a removed Board method | (attestation) |
| LL-a167848115 |  | medium | GDPR, COPPA, FERPA | **fixed** | pr-review | Text-to-speech posts raw user text to subprocessors absent from the register (Abair has no DPA; Google TTS flow unrowed) (GDPR Art. 28/44) | `lib/tts.rb`:30 |
| LL-6723438462 |  | medium | GDPR | untriaged | audit-run | Article 50 disclosure server-side backstop is present on only 2 of 5 AI ingresses | `app/controllers/api/word_suggestions_controller.rb`:19 |
| LL-51da4fca1d |  | low | FERPA, HIPAA, GDPR, SOC2 | untriaged | pr-review | EvalNarrator took its model from an unconstrained EVAL_NARRATOR_MODEL env var with no allowlist for ~2 months (2026-05-12 to 2026-07-19) | `lib/eval_narrator.rb`:54 |

## Verified closed (59)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-e573a39d2b |  | critical | FERPA, HIPAA, COPPA, GDPR | untriaged | audit-run | Eval narration sends slp_notes/sett (student name + clinical notes) to Anthropic with no PiiScrubber | `lib/eval_narrator.rb`:189 |
| LL-676f91f26b |  | critical | FERPA, HIPAA | **fixed** | audit-run | Command injection via utterance button label in the sentence-preview worker | `lib/sentence_pic.rb`:40 |
| LL-c5fe9e2e3e | Infra-P0-1 | critical | HIPAA | untriaged | audit-run | Worker service missing encryption keys in render.yaml | `render.yaml`:84 |
| LL-90137ca466 | Infra-P0-2 | critical | SOC2 | untriaged | audit-run | Unauthenticated /api/v1/status exposed internal queue/db state | `app/controllers/session_controller.rb`:944 |
| LL-fbe07e6a1b | P0-1 | critical | FERPA, HIPAA | untriaged | audit-run | SQL injection via unwhitelisted sort_by in licenses endpoint | `app/controllers/api/organizations_controller.rb`:221 |
| LL-37caf162eb | P0-2 | critical | GDPR | untriaged | audit-run | License records not deleted by GDPR flusher (Right to Erasure gap) | `lib/flusher.rb`:224 |
| LL-3ccbf9b54a | P0-3 | critical | FERPA | untriaged | audit-run | No AuditEvent on license claim/release (FERPA access-log gap) | `app/controllers/api/organizations_controller.rb`:238 |
| LL-46fd4aa824 | P0-4 | critical | FERPA, HIPAA | untriaged | audit-run | No AuditEvent on supervisor consent create/respond/revoke | `app/controllers/api/supervisor_relationships_controller.rb`:52 |
| LL-ef5ac1b2a5 |  | high | FERPA, HIPAA | untriaged | audit-run | Eval AI narration creates no AiApiLog entry (no record student eval data was sent to an LLM) | `lib/eval_narrator.rb`:58 |
| LL-d1ea8659c3 |  | high | SOC2 | **fixed** | audit-run | bootstrap 3.4.1 (EOL/abandoned) bundled into shipped app; reachable Tooltip/Popover & data-* XSS | `app/frontend/package.json`:31 |
| LL-2967f77e6d |  | high | WCAG | **fixed** | audit-run | Board-tile symbol image has no alt text (fast_html render path) | `app/frontend/app/utils/button.js`:449 |
| LL-2e4c14d370 |  | high | COPPA, FERPA, HIPAA | untriaged | audit-run | Eval AI narration has no COPPA parental-consent hard-gate before sending under-13 student data to Anthropic | `lib/eval_narrator.rb`:43 |
| LL-11db0dc848 |  | high | COPPA, FERPA, HIPAA | **fixed** | pr-review | Eval narration gates on caller-asserted user_id but egresses an independent, unbound eval_session payload | `app/controllers/api/eval_sessions_controller.rb`:57 |
| LL-16fef018a0 |  | high | SOC2 | **fixed** | pr-review | Password-reset code verification endpoint (users#password_reset) not rate-limited | `config/initializers/throttling.rb`:41 |
| LL-080a21089f |  | high | FERPA, HIPAA, GDPR | untriaged | audit-run | Account deletion / right-to-erasure path writes no AuditEvent | `app/controllers/api/users_controller.rb`:388 |
| LL-7acd0e7416 |  | high | FERPA, HIPAA | untriaged | audit-run | Admin-support reads of individual student records (version history, daily usage) write no AuditEvent | `app/controllers/api/users_controller.rb`:485 |
| LL-9b5d0f1381 |  | high | WCAG | **fixed** | audit-run | Find-a-button search input has no accessible name (placeholder-only, non-i18n) | `app/frontend/app/templates/find-button.hbs`:8 |
| LL-7f7372e3eb |  | high | SOC2, HIPAA | **fixed** | manual | Audited-console wrapper still shells to Heroku CLI; not operative on Render so console access is unaudited | `bin/audit_console`:7 |
| LL-9a09771121 |  | high | SOC2 | **fixed** | audit-run | Render production (branch main) still hand-signs S3 POST policies with SigV2; every upload to the SSE-KMS uploads bucket fails and silently degrades to DB-stored data URIs | `lib/uploader.rb`:291 |
| LL-47117a3443 |  | high | COPPA, GDPR, FERPA | untriaged | audit-run | COPPA verifiable parental consent is granted with no immutable AuditEvent | `app/controllers/parental_consents_controller.rb`:14 |
| LL-85038c0a7b |  | high |  | untriaged | audit-run | buttonsets#generate debug_sync=1 path returns raw exception message and full Ruby backtrace as JSON error body | `app/controllers/api/button_sets_controller.rb`:83 |
| LL-854b1d3853 |  | high | GDPR, FERPA, COPPA | **fixed** | pr-review | Hard delete leaves UserVideo records and off-board voice recordings (ButtonSound) undeleted (GDPR right-to-erasure) | `lib/flusher.rb`:363 |
| LL-1b0d78dbe6 |  | high | HIPAA | **fixed** | pr-review | No check asserts the Bedrock credential resolves to the BAA'd AWS account, so the AWS BAA's operative condition is an untested assumption | `lib/ai_client.rb`:89 |
| LL-16ef84ad9a |  | high | FERPA, HIPAA, GDPR | **fixed** | pr-review | Word-prediction cache holds the raw pre-scrubber user utterance in a process-global structure outside the PiiScrubber boundary, and is not tenant-scoped | `lib/ai_word_predictor.rb`:47 |
| LL-522c1a6d13 |  | high | FERPA, HIPAA | **fixed** | pr-review | Masquerade produces no AuditEvent; the site-admin branch impersonates any user with no disclosure record | `app/controllers/application_controller.rb`:181 |
| LL-8908c7ac6f |  | high | COPPA, FERPA, HIPAA, GDPR | **fixed** | audit-run | Client-supplied context.topic reaches Bedrock unscrubbed and is absent from the AiApiLog egress record | `lib/ai_word_predictor.rb`:340 |
| LL-b7ccc522b9 |  | high | SOC2, HIPAA, FERPA | **fixed** | audit-run | GCP production project has no Data Access audit log configuration, so Secret Manager value reads and Cloud SQL data access produce no audit record | `scripts/gcp/phase1-setup.sh`:496 |
| LL-3e36a18199 |  | high | GDPR, FERPA, HIPAA, SOC2 | **fixed** | pr-review | Production scheduler dispatch has no missed-run (liveness) detection: hourly executions run and failed executions alert, but nothing alerts when a run does not happen | `lib/tasks/scheduler.rake`:67 |
| LL-efef111d59 | Dep-nokogiri-1194 | high | SOC2 | untriaged | audit-run | nokogiri 1.19.3 vulnerable to six published advisories (fixed in 1.19.4) | `Gemfile.lock`:281 |
| LL-6619cc1811 | Infra-P1-1 | high | HIPAA | **fixed** | audit-run | Redis connections without TLS; shared across environments | `config/initializers/resque.rb`:23 |
| LL-1085e59d29 | Infra-P1-2 | high | FERPA, HIPAA | **fixed** | audit-run | Webhook callback URL validation accepts plaintext http:// | `app/models/webhook.rb`:42 |
| LL-c6dd65a2aa | Infra-P1-3 | high | SOC2 | **fixed** | audit-run | Static cache_token='abc' never rotates (stale permission cache) | `config/initializers/resque.rb`:29 |
| LL-ca38d4d99e | P1-1 | high | FERPA, HIPAA | **fixed** | audit-run | Consent endpoints absent from Rack::Attack protected_paths | `config/initializers/throttling.rb`:18 |
| LL-740bcb10fa | P1-2 | high | GDPR, HIPAA | **fixed** | audit-run | License.metadata / external_reference stored unencrypted | `app/models/license.rb`:2 |
| LL-e775d86e6a | P1-3 | high | GDPR | **fixed** | audit-run | License not handled in transfer_user_content (orphaned seats on merge) | `lib/flusher.rb`:156 |
| LL-e65d34f109 | P1-4 | high | FERPA | **fixed** | audit-run | Sensitive new routes (claim_user) under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-9a3ee852d5 | P1-6 | high | SOC2, GDPR | **fixed** | audit-run | forgot_password leaks account existence via response shape and users count | `app/controllers/api/users_controller.rb`:705 |
| LL-747bb0e02d | P1-7 | high | FERPA, HIPAA | **fixed** | audit-run | Password changes (incl. admin resets) generate no AuditEvent | `app/models/user.rb`:2255 |
| LL-6d8314e37b | P1-8 | high | SOC2 | **fixed** | audit-run | SNS transcoding callbacks accepted without signature verification | `app/controllers/api/callbacks_controller.rb`:8 |
| LL-4e243f3e16 | P1-9 | high | SOC2 | **fixed** | audit-run | start_code_lookup uses a brute-forceable 5-char verification hash | `app/controllers/api/organizations_controller.rb`:128 |
| LL-c5bd616242 | Prior-BAA-AWS | high | HIPAA | untriaged | audit-run | BAA with AWS (S3/SES/Transcoder/SNS) for HIPAA | `docs/legal/AWS_BAA_ACCEPTED.md` |
| LL-27d20047db |  | medium |  | **fixed** | audit-run | Integration board_render_url is writable but never serialized back (read/write field-name asymmetry) | `app/frontend/app/models/integration.js`:24 |
| LL-40dd412ed6 |  | medium | WCAG | **fixed** | audit-run | Rails application layout html element has no lang attribute | `app/views/layouts/application.html.erb`:2 |
| LL-a46e5c6b69 |  | medium | SOC2 | **fixed** | audit-run | braces 2.3.2 in npm tree is vulnerable to CVE-2024-4068 (ReDoS) | `app/frontend/package-lock.json`:8315 |
| LL-30bcbc1e27 |  | medium |  | **fixed** | audit-run | Integration button_webhook_url not serialized for remote webhooks, silencing the client insecure-URL warning | `lib/json_api/integration.rb`:16 |
| LL-6f1977944f |  | medium | FERPA, HIPAA | **fixed** | audit-run | ruby-saml has no minimum version constraint in Gemfile; SAML auth-bypass CVEs fixed in >= 1.17.0 | `Gemfile.lock`:490 |
| LL-2ea0b804e7 | Infra-P2-1 | medium | HIPAA | untriaged | audit-run | S3 buckets public-read on * (legacy ACL) | `docs/INFRASTRUCTURE.md`:101 |
| LL-991d259b2a | P2-1 | medium | GDPR, FERPA | **fixed** | audit-run | flush_leftovers is unimplemented (orphan records accumulate) | `lib/flusher.rb`:48 |
| LL-55baae6d40 | P2-4 | medium | GDPR | **fixed** | audit-run | external_reference exposed in license JSON without permission check | `lib/json_api/license.rb`:16 |
| LL-56f0f19fca | P2-6 | medium | SOC2 | untriaged | audit-run | Registration/2fa/SAML endpoints under general throttle only | `config/initializers/throttling.rb`:18 |
| LL-7a8effae8a | P2-9 | medium | FERPA | untriaged | audit-run | user_name exposed for expired licenses during expiration window | `lib/json_api/license.rb`:17 |
| LL-41d2d553ab |  | low |  | **fixed** | audit-run | Integration JSON emits a debug junk key (asdf) consumed by no Ember model | `lib/json_api/integration.rb`:67 |
| LL-20c48e298c |  | low | WCAG | untriaged | audit-run | Board-tile symbol image has no alt text (edit-mode board-editor path) | `app/frontend/app/templates/board/index.hbs`:123 |
| LL-257c696fe0 |  | low | SOC2 | untriaged | audit-run | eslint 5.16.0 is EOL (v5 end-of-life 2019); dev toolchain running unsupported linter | `app/frontend/package-lock.json`:18085 |
| LL-a25d930f21 |  | low | SOC2 | untriaged | audit-run | ember-cli-mirage 2.4.0 is abandoned for Ember 3.x (no active maintenance, last meaningful release 2021) | `app/frontend/package-lock.json`:12501 |
| LL-2695434541 |  | low | SOC2 | **fixed** | audit-run | Puma Gemfile constraint permits 7.2.0 which predates the CVE-2026-47736/47737 fix; floor unset | `Gemfile`:62 |
| LL-b0bc6880e6 |  | low | SOC2 | **fixed** | audit-run | sync-render-secrets.yml (holds RENDER_API_KEY + 1Password token) declares no permissions: block, inheriting default write GITHUB_TOKEN | `.github/workflows/sync-render-secrets.yml`:14 |
| LL-53ab4ea456 |  | low | SOC2 | untriaged | audit-run | serialize-javascript 4.0.0 vulnerable to CVE-2024-11831 (XSS); dev toolchain only | `app/frontend/package-lock.json`:26437 |
| LL-42a24ee911 |  | low | SOC2 | untriaged | audit-run | A diagnostic SES send to a personal Gmail address never arrived (inbox or spam); a same-account send to a Workspace-internal address arrived immediately | (attestation) |

## Accepted risk (5)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-aacae48768 |  | high | SOC2, HIPAA, FERPA | **accepted** | audit-run | Production Postgres (lingolinq-prod-db) reachable from an all-addresses /0 allowlist (public internet) | (attestation) |
| LL-9f83617435 | Infra-P1-4 | high | SOC2 | **accepted** | audit-run | No explicit HSTS ssl_options (subdomains/preload) | `config/environments/production.rb`:62 |
| LL-92dc570f30 | P1-5 | high | SOC2 | **accepted** | audit-run | consent_response accepts token/decision from multiple parameter keys | `app/controllers/api/supervisor_relationships_controller.rb`:86 |
| LL-c38e7da48e |  | medium | GDPR, FERPA, COPPA | **accepted** | manual | Board/word translation posts raw, unscrubbed user-authored button labels to Google Cloud Translation API v2, a data flow absent from the subprocessor register (GDPR Art. 28/44) | `app/models/word_data.rb`:670 |
| LL-1eb9a2435b |  | medium | GDPR, FERPA, COPPA, HIPAA | **accepted** | manual | ButtonSound auto-uploads raw user VOICE-RECORDING audio to Google Cloud Speech-to-Text (speech:recognize) on every save, a data flow absent from the subprocessor register; audio cannot be PII-scrubbed (GDPR Art. 9/28/44, FERPA, COPPA) | `app/models/button_sound.rb`:64 |

## Superseded / obsolete (3)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-17ec91ff20 |  | high | GDPR, COPPA | **dismissed-false-positive** | audit-run | WITHDRAWN after review: the claim that the live AI consent disclosure represents an UNENFORCED EU retention purge as enforced. The purge is a working, end-to-end-verified control; dismissed as a false positive and superseded 2026-08-30 | `lib/lingo_linq/ai_consent_disclosures.rb`:138 |
| LL-3076d244a6 | Infra-P1-5 | high | SOC2 | untriaged | audit-run | Legacy s3 gem (0.3.29) in production | `Gemfile`:59 |
| LL-8c911f5cfd | Prior-BAA-Render | high | HIPAA, FERPA | untriaged | audit-run | BAA with Render (Postgres/Redis hosting) for FERPA/HIPAA | (attestation) |

---

_436 findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._
