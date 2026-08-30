# LingoLinq-AAC Findings Register

> Generated from `audit-reports/FINDINGS.json` by `scripts/citation-check.rb --render`.
> Do not hand-edit; edit the JSON (the source of truth) and re-render.

**Audited:** `staging (audited at 59f502aa4; staging tip had advanced to d2bf421f7 -- 7 commits, 43 files, PRs #814/#816/#819/#820/#821/#822/#823 -- by the time this PR was assembled; those 7 commits are NOT scanned by this run, see auditedShaPriorNote)` @ `59f502aa4a967c8c704637cc66a18ff05118c7d8` on 2026-08-18  
**Seed:** audit-reports/unified-audit-2026-04-09.md  
**Headline (open + remediated-unverified):** 0 Critical / 23 High

Statuses are verified against live code at the audited SHA, not copied from the dated report prose. Only Scot closes a finding, downgrades severity, accepts risk, or sets a disposition. Disposition (triage) is orthogonal to status: a finding can be `open` yet `dismissed-false-positive`/`wontfix`/`accepted`; blank reads as `untriaged`.

## Open (117)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-7f7372e3eb |  | high | SOC2, HIPAA | **accepted** | manual | Audited-console wrapper still shells to Heroku CLI; not operative on Render so console access is unaudited | `bin/audit_console`:7 |
| LL-f150e0e828 |  | high | COPPA, GDPR | **accepted** | pr-review | District seat reclaim converts an under-13's account to a consumer trial with no parental re-consent or notice (COPPA) | `app/models/license.rb`:76 |
| LL-854b1d3853 |  | high | GDPR, FERPA, COPPA | **accepted** | pr-review | Hard delete leaves UserVideo records and off-board voice recordings (ButtonSound) undeleted (GDPR right-to-erasure) | `lib/flusher.rb`:363 |
| LL-104bfa61dc |  | high | WCAG | untriaged | audit-run | Terms-agree modal is unreachable by switch scanning (no .modal_targets / .btn, opened without scannable) | `app/frontend/app/components/terms-agree.hbs`:27 |
| LL-53cb93fab1 |  | high | GDPR, FERPA | untriaged | audit-run | Terms-agree modal can be silently replaced by intro before the user agrees | `app/frontend/app/routes/index.js`:132 |
| LL-16ef84ad9a |  | high | FERPA, HIPAA, GDPR | untriaged | pr-review | Word-prediction cache holds the raw pre-scrubber user utterance in a process-global structure outside the PiiScrubber boundary, and is not tenant-scoped | `lib/ai_word_predictor.rb`:47 |
| LL-522c1a6d13 |  | high | FERPA, HIPAA | untriaged | pr-review | Masquerade produces no AuditEvent; the site-admin branch impersonates any user with no disclosure record | `app/controllers/application_controller.rb`:181 |
| LL-8908c7ac6f |  | high | COPPA, FERPA, HIPAA, GDPR | untriaged | audit-run | Client-supplied context.topic reaches Bedrock unscrubbed and is absent from the AiApiLog egress record | `lib/ai_word_predictor.rb`:340 |
| LL-e8614c103f |  | high | GDPR, FERPA, COPPA | untriaged | audit-run | PredictionEntry rows survive account deletion, retaining per-user AAC vocabulary sequences indefinitely | `app/models/prediction_entry.rb`:4 |
| LL-1e7b568ef3 |  | high | SOC2, HIPAA | untriaged | audit-run | Committed WIF provisioning script omits the assertion.ref branch lock the deploy pipeline names as a control, and reconciles (overwrites) the live provider on every re-run | `scripts/gcp/phase1-setup.sh`:329 |
| LL-b7ccc522b9 |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | GCP production project has no Data Access audit log configuration, so Secret Manager value reads and Cloud SQL data access produce no audit record | `scripts/gcp/phase1-setup.sh`:496 |
| LL-c0b3d59f58 |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | Production GCP project grants a non-owner human principal project-wide secretmanager.admin, cloudsql.admin and iam.serviceAccountAdmin, contradicting the documented least-privilege design | `scripts/gcp/phase1-setup.sh`:251 |
| LL-0b5443f43b |  | high | SOC2, HIPAA | untriaged | audit-run | Production Cloud Run service is deployed with public ingress, so the direct run.app URL bypasses the load balancer and its attached Cloud Armor policy | `scripts/gcp/phase5-frontend-lb.sh`:490 |
| LL-5617f4e17d |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | No server-side password strength policy exists; the only minimum-length check is a 6-character Ember computed property, bypassable by a direct API call | `app/frontend/app/controllers/register.js`:217 |
| LL-7d50b089c9 |  | high |  | untriaged | audit-run | BoardVersion/UserVersion history payloads use raw PaperTrail `version.id` instead of the repo's `global_id` string convention | `lib/json_api/board_version.rb`:10 |
| LL-5f0a016e2b |  | high | SOC2, HIPAA | untriaged | audit-run | Attested AI Governance Memo states the Bedrock runtime AI path is "not operational since" revision 00014-5rw; credentials were re-mounted 53 minutes later and the path carries user-attributed traffic | `docs/legal/AI_GOVERNANCE_MEMO.md`:499 |
| LL-17ec91ff20 |  | high | GDPR, COPPA | untriaged | audit-run | WITHDRAWN after review: the claim that the live AI consent disclosure represents an UNENFORCED EU retention purge as enforced. The purge is a working, end-to-end-verified control; awaiting Scot to close this row as a false positive | `lib/lingo_linq/ai_consent_disclosures.rb`:138 |
| LL-3bfc56ef4b |  | high | HIPAA, SOC2 | untriaged | pr-review | ALLOWED_RUNTIME_MODELS is an in-process application gate and cannot constrain direct AWS API or CLI use of the same Bedrock runtime credential | `lib/ai_client.rb`:83 |
| LL-7314b5a8ea |  | medium | HIPAA | untriaged | audit-run | Render Key Value instance is plaintext and shared by prod-fallback, staging, dev, and PR previews | `render.yaml`:107 |
| LL-ebd844a7d0 |  | medium | FERPA | untriaged | manual | Permanent, non-expiring User#user_token still login-serialized and accepted by logged legacy token fallbacks | `lib/json_api/user.rb`:41 |
| LL-b5c30235d3 |  | medium | SOC2, HIPAA, FERPA | **accepted** | audit-run | infra-auditor runtime/CLI evidence relies on instruction-only control against secret/PII leakage | `.claude/agents/infra-auditor.md`:31 |
| LL-52ff2a9a79 |  | medium | SOC2 | **accepted** | audit-run | CI security-scan job (Brakeman SAST, bundle-audit, npm audit, gitleaks) is entirely non-blocking | `.github/workflows/ci.yml`:107 |
| LL-5ff3b22093 |  | medium | WCAG | **accepted** | audit-run | Legacy Bootstrap close button labeled only by a times glyph, no aria-label | `app/frontend/app/templates/board-details.hbs`:3 |
| LL-ed914bded3 |  | medium | WCAG | **accepted** | audit-run | Raw low-contrast brand token used as text foreground (board-tile language pill) | `app/frontend/app/styles/app.scss`:193 |
| LL-70abe7d9a9 |  | medium | WCAG | **accepted** | audit-run | Icon-only remove button named only by a non-i18n title attribute | `app/frontend/app/templates/share-board.hbs`:101 |
| LL-13ad11eaee |  | medium | WCAG | **accepted** | audit-run | Loading status text has no aria-live or role=status | `app/frontend/app/templates/bento.hbs`:14 |
| LL-ab88513735 |  | medium |  | **accepted** | audit-run | User model declares is_admin attribute but Rails JSON builder never emits it | `app/frontend/app/models/user.js`:40 |
| LL-65700d9bd8 |  | medium | SOC2 | **accepted** | audit-run | moment 2.29.4 is in maintenance-only mode (effectively abandoned) and locked below the latest 2.30 maintenance patch | `app/frontend/package.json`:71 |
| LL-0c6e931f47 |  | medium | WCAG | **accepted** | audit-run | Sentence box (utterance bar) symbol chip images have no alt attribute | `app/frontend/app/templates/components/button-list.hbs`:21 |
| LL-6614b7c85a |  | medium | SOC2 | **dismissed-false-positive** | audit-run | lodash 4.18.1 resolved in package-lock.json exceeds all known published 4.x releases (latest 4.17.21) | `app/frontend/package-lock.json`:22142 |
| LL-35e6b7a3d6 |  | medium | WCAG | **accepted** | audit-run | Dashboard search overlay text input has no programmatic label (placeholder only) | `app/frontend/app/templates/components/dashboard/authenticated-view.hbs`:588 |
| LL-e08bd45a9f |  | medium | WCAG | **accepted** | audit-run | Sentence box / utterance bar vocalize control is an anchor with no button role or accessible name | `app/frontend/app/templates/application.hbs`:86 |
| LL-b06f063f85 |  | medium | WCAG | **accepted** | audit-run | Shared modal-dialog wrapper sets role=dialog/aria-modal but no accessible name | `app/frontend/app/templates/components/modal-dialog.hbs`:6 |
| LL-8fab55372e |  | medium | WCAG | **accepted** | audit-run | Speak-bar remote-modeling (#reply_icon) button has no accessible name | `app/frontend/app/templates/application.hbs`:148 |
| LL-caf2528468 |  | medium | GDPR, FERPA | untriaged | audit-run | UserExtra/UserLink profile-history caches are not invalidated when the source profile LogSession is deleted | `app/models/user_extra.rb`:58 |
| LL-14edf1a801 |  | medium | GDPR, FERPA | untriaged | audit-run | DataPolicyEnforcer retention job skips child orgs that inherit (rather than set) a retention_months policy | `lib/data_policy_enforcer.rb`:22 |
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
| LL-92ae18cc4e |  | medium | FERPA, COPPA, HIPAA | untriaged | audit-run | anonymous_logs export job writes each publishing user's username to stdout, bypassing the PII-scrubbing log formatter | `app/models/log_session.rb`:2111 |
| LL-d3f41e7a67 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Production Cloud SQL instance has deletion protection disabled and is provisioned without it, while automated deploys apply migrations with no pre-migration backup step | `scripts/gcp/phase3-data-layer.sh`:255 |
| LL-0d54bcb32c |  | medium | SOC2, HIPAA | untriaged | audit-run | Production Cloud SQL instance accepts unencrypted connections (ssl mode allows unencrypted) and is provisioned with no SSL enforcement flag | `scripts/gcp/phase3-data-layer.sh`:252 |
| LL-7296ada5da |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | The admin_token cookie that gates the Resque admin console is set without HttpOnly, so any XSS can steal an admin console session | `app/controllers/session_controller.rb`:250 |
| LL-1e8abb7d59 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Failed authentication attempts produce no AuditEvent and no security log line, so credential-stuffing and password-guessing are undetectable after the fact | `app/controllers/session_controller.rb`:568 |
| LL-69a7f62551 |  | medium | SOC2, HIPAA, FERPA | untriaged | audit-run | Brute-force protection on login is per-source-IP only at roughly 400 attempts/minute, with no per-account lockout, backoff, or velocity control | `config/initializers/throttling.rb`:6 |
| LL-33d756b764 |  | medium | SOC2 | untriaged | audit-run | The blocking secret-detection gate downloads and executes an unpinned, unverified gitleaks binary resolved at runtime from the GitHub releases API | `.github/workflows/ci.yml`:266 |
| LL-7181a16033 |  | medium | SOC2, HIPAA | untriaged | audit-run | No scheduled reconciler detects Cloud Run configuration drift introduced outside the deploy workflow, the exact path that once silently disabled the Bedrock BAA account assertion | `.github/workflows/deploy-cloudrun.yml`:270 |
| LL-959d76ecfc |  | medium | WCAG | untriaged | audit-run | Authenticated Home landing jumps from h1 straight to h3 with no h2 | `app/frontend/app/components/dashboard/authenticated-view.hbs`:187 |
| LL-59bfd6f482 |  | medium | WCAG | untriaged | audit-run | Empty and hidden board-grid cells stay keyboard-focusable with no accessible name when the grid-placeholder preference is on | `app/frontend/app/models/board.js`:1747 |
| LL-171938b2b9 |  | medium | WCAG | untriaged | audit-run | Shared-message speak target is a div with a click handler and no keyboard semantics | `app/frontend/app/templates/utterance.hbs`:31 |
| LL-47935e1a5b |  | medium |  | untriaged | audit-run | lib/purchasing2.rb is a 206-line orphaned, apparently unfinished Stripe module with zero live call sites | `lib/purchasing2.rb`:1 |
| LL-e0ea356243 |  | medium |  | untriaged | audit-run | Four Ember stats components (stats/num-rows1..4.js) have no template and zero references anywhere | `app/frontend/app/components/stats/num-rows1.js`:7 |
| LL-71f2ba5536 |  | medium |  | untriaged | audit-run | stats/parts-of-speech-flow.js + .hbs (Google Charts Sankey component) is orphaned, apparently superseded by stats/parts-of-speech-pie | `app/frontend/app/components/stats/parts-of-speech-flow.js`:1 |
| LL-c4566fa37f |  | medium | GDPR, FERPA | untriaged | manual | A ButtonSound/UserVideo record erased mid-transcode, or before/after a lost SNS completion webhook, can leave transcoded output and thumbnails in S3 with no surviving application metadata for the erasure sweep to discover (GDPR Art. 17 / FERPA) | `lib/transcoder.rb`:36 |
| LL-779490b63e |  | medium | GDPR, FERPA | untriaged | manual | Thumbnail erasure fallback is bounded/best-effort and cannot reliably distinguish absence, sequence gaps, or transient deletion failure | `lib/uploader.rb`:309 |
| LL-1189af1b3c |  | medium | HIPAA, SOC2 | untriaged | audit-run | ai-endpoint-guard.sh only checks a 4-file hardcoded SEAMS allowlist, not a repo-wide scan, so a new AI-integration file would bypass CI enforcement of the no-direct-Anthropic-client control that ten docs/legal/ documents reference as covering "any runtime seam" (6 currently live/attested, 4 superseded) | `scripts/ai-endpoint-guard.sh`:28 |
| LL-f29ce6ca22 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states the Article 50 disclosure modal is "built and staged, gated OFF, not yet enabled for any user"; the production flag is in fact ENABLED via the default_enabled_features DB Setting | `docs/legal/AI_GOVERNANCE_MEMO.md`:261 |
| LL-ea07a705d1 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states "the whole path is inert until the flag is enabled"; the flag is enabled in production, so the path is not inert | `docs/legal/AI_GOVERNANCE_MEMO.md`:269 |
| LL-644bcbf48f |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo section 8 states the Article 50 modal "is therefore shown to no one in production"; the stated rationale (flag off) is false | `docs/legal/AI_GOVERNANCE_MEMO.md`:427 |
| LL-7784f74447 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo makes an unevidenced population claim ("because prod carries no real EU users") load-bearing for deferring the Article 50 gate -- an EVIDENCE-BASIS defect, not a falsified fact | `docs/legal/AI_GOVERNANCE_MEMO.md`:274 |
| LL-ce68ceb1b5 |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo states the Phase 4 helper "un-inerts the EU log-retention purge" which "now matches jurisdiction = EU rows"; in production it matches none | `docs/legal/AI_GOVERNANCE_MEMO.md`:283 |
| LL-ad67eecb9c |  | medium | GDPR | untriaged | audit-run | Attested AI Governance Memo describes the deliverable as the "EU-gated" disclosure modal; the gate is fail-safe OPEN, so non-EU and unknown-jurisdiction users are also in scope | `docs/legal/AI_GOVERNANCE_MEMO.md`:260 |
| LL-db6bc3e568 |  | medium | GDPR | untriaged | audit-run | Attested Data Retention Schedule states the EU AiApiLog purge "matches EU rows wherever Phase 4 is deployed"; in production it matches none | `docs/legal/DATA_RETENTION.md`:33 |
| LL-b3e3a0b99c |  | medium | GDPR, COPPA | untriaged | audit-run | Live AI consent disclosure asserts "EU AI Act Article 50 record-keeping" as the legal basis for the five-year AiApiLog retention window, to a data subject | `lib/lingo_linq/ai_consent_disclosures.rb`:139 |
| LL-1890f6a922 | P2-5 | medium | GDPR, FERPA | **accepted** | audit-run | DataPolicyEnforcer retention only purges session log sessions | `lib/data_policy_enforcer.rb`:14 |
| LL-d35cbdb313 | P2-7 | medium | FERPA | **accepted** | audit-run | User creation (incl. org start codes) generates no AuditEvent | `app/controllers/api/users_controller.rb`:244 |
| LL-310b464be4 | P2-8 | medium | FERPA | **accepted** | audit-run | protected_image accepts user_token via URL parameter | `app/controllers/api/users_controller.rb`:945 |
| LL-57e9beb87f |  | low | GDPR, FERPA | untriaged | audit-run | Flusher.flush_leftovers has no usage-based orphan check for orphaned ButtonImage/ButtonSound media records (item 1) | `lib/flusher.rb`:57 |
| LL-45bdcc73c9 |  | low | SOC2 | untriaged | audit-run | Developer key expiration policy is undecided; DeveloperKey records never age out (item 3) | `lib/flusher.rb`:48 |
| LL-97f9001bb4 |  | low | SOC2 | **wontfix** | audit-run | Audit finder Bash guard is a denylist with residual fetch-and-exec bypass | `.claude/hooks/audit-readonly-guard.sh`:59 |
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
| LL-d8072299bf |  | low | GDPR, COPPA | untriaged | audit-run | Automated retention only runs for org-sponsored users; standalone accounts keep communication logs indefinitely | `lib/data_policy_enforcer.rb`:22 |
| LL-c226391436 |  | low | SOC2 | untriaged | audit-run | Content-Security-Policy is report-only (nothing blocked) and script-src permits unsafe-inline + unsafe-eval | `config/initializers/content_security_policy.rb`:114 |
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
| LL-941001ca58 | Dep-eslint-8-eol | low | SOC2 | **accepted** | audit-run | eslint 8.57.1 is EOL (v8 end-of-life); dev toolchain on an unsupported linter | `app/frontend/package.json`:64 |
| LL-a97357136e | P2-2 | low | SOC2 | **wontfix** | audit-run | params.permit! bypasses Strong Parameters | `app/controllers/api/organizations_controller.rb`:866 |
| LL-ce00c8d3ad | P2-3 | low |  | **wontfix** | audit-run | License model lacks Processable concern | `app/models/license.rb`:1 |

## Remediated (awaiting verification) (8)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-90045bb29c |  | high | FERPA | **accepted** | audit-run | User#user_token is a permanent, non-expiring credential serialized on login and embedded in navigable lesson/board share URLs | `lib/json_api/user.rb`:41 |
| LL-a95e9c5f7c |  | high | SOC2 | untriaged | audit-run | lingolinq-worker's 512Mi memory limit is too small for ButtonImage/BoardDownstreamButtonSet jobs, causing continuous OOM kills that land as Resque::Failure instead of being requeued | (attestation) |
| LL-705b10bcd7 |  | high | SOC2 | untriaged | audit-run | BoardDownstreamButtonSet S3 writes fail against KMS-encrypted bucket: 'Requests specifying Server Side Encryption with AWS KMS managed keys require AWS Signature Version 4' | (attestation) |
| LL-a9d6d5a46b |  | high | WCAG | untriaged | manual | AI disclosure full-notice link uses the low-contrast verdigris token for text on the near-white modal surface | `app/frontend/app/styles/app.scss`:38150 |
| LL-6af580a23a |  | high | SOC2, HIPAA, FERPA | untriaged | audit-run | A Redis RDB persistence snapshot was tracked in git and shipped in every production container image for ~6 months; removed from HEAD (2026-08-14) but the blob remains fully retrievable from public git history at ced829ba1 on both staging and main | (attestation) |
| LL-5954bcbbe6 |  | medium | SOC2 | untriaged | audit-run | Pre-existing Resque background-job failures: ImageMagick identify missing in Cloud Run image, stale job_stash lookups, and a call to a removed Board method | (attestation) |
| LL-a167848115 |  | medium | GDPR, COPPA, FERPA | **fixed** | pr-review | Text-to-speech posts raw user text to subprocessors absent from the register (Abair has no DPA; Google TTS flow unrowed) (GDPR Art. 28/44) | `lib/tts.rb`:30 |
| LL-6723438462 |  | medium | GDPR | untriaged | audit-run | Article 50 disclosure server-side backstop is present on only 2 of 5 AI ingresses | `app/controllers/api/word_suggestions_controller.rb`:19 |

## Verified closed (51)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-e573a39d2b |  | critical | FERPA, HIPAA, COPPA, GDPR | untriaged | audit-run | Eval narration sends slp_notes/sett (student name + clinical notes) to Anthropic with no PiiScrubber | `lib/eval_narrator.rb`:189 |
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
| LL-9a09771121 |  | high | SOC2 | **fixed** | audit-run | Render production (branch main) still hand-signs S3 POST policies with SigV2; every upload to the SSE-KMS uploads bucket fails and silently degrades to DB-stored data URIs | `lib/uploader.rb`:291 |
| LL-47117a3443 |  | high | COPPA, GDPR, FERPA | untriaged | audit-run | COPPA verifiable parental consent is granted with no immutable AuditEvent | `app/controllers/parental_consents_controller.rb`:14 |
| LL-85038c0a7b |  | high |  | untriaged | audit-run | buttonsets#generate debug_sync=1 path returns raw exception message and full Ruby backtrace as JSON error body | `app/controllers/api/button_sets_controller.rb`:83 |
| LL-1b0d78dbe6 |  | high | HIPAA | **fixed** | pr-review | No check asserts the Bedrock credential resolves to the BAA'd AWS account, so the AWS BAA's operative condition is an untested assumption | `lib/ai_client.rb`:89 |
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

## Superseded / obsolete (2)

| ID | Legacy | Severity | Frameworks | Disposition | Source | Title | Evidence |
|---|---|---|---|---|---|---|---|
| LL-3076d244a6 | Infra-P1-5 | high | SOC2 | untriaged | audit-run | Legacy s3 gem (0.3.29) in production | `Gemfile`:59 |
| LL-8c911f5cfd | Prior-BAA-Render | high | HIPAA, FERPA | untriaged | audit-run | BAA with Render (Postgres/Redis hosting) for FERPA/HIPAA | (attestation) |

---

_183 findings total. Re-run `ruby scripts/citation-check.rb` to validate every active citation._
